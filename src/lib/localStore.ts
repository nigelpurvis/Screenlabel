import { readTextFile, writeTextFile, exists, mkdir, rename, remove } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'

// The local index: a derived cache of every ingested screenshot, including its
// embedding (1536 floats — too large to live in the .md files) plus a copy of
// its metadata for fast search and grid rendering. The sidecar .md files remain
// the source of truth; this index can always be rebuilt from them.
//
// Stored as an append-only log (index.jsonl): one JSON entry per line, where a
// later line for the same image path supersedes an earlier one. Writing a new
// or updated entry costs one short append regardless of how many screenshots
// are already indexed.
//
// The alternative — keeping a single index.json and rewriting it on every
// change — is what this replaced. Each entry carries a 1536-float embedding
// (~30KB of JSON), so a 1,000-screenshot library meant rewriting ~30MB of disk
// for every single ingested image, and a batch ingest paid that cost once per
// file. Appends make the write cost independent of library size.
//
// The tradeoff is that the log accumulates superseded lines, so it's compacted
// (rewritten with only the live entries) once the dead weight outgrows the real
// data. That's the same snapshot-plus-log design real databases use.

export interface IndexEntry {
  id: string
  file: string // filename, e.g. "receipt.png"
  path: string // absolute path to the image
  description: string
  text: string
  tags: string[]
  folder: string | null // folder NAME (human-readable, mirrored in frontmatter)
  notes: string
  embedding: number[]
  created: string
  ingested: string
}

let entries: IndexEntry[] = []
let logFile = ''
let legacyFile = ''
// Lines currently in the log, including superseded ones. Compared against the
// number of live entries to decide when compaction is worth doing.
let logLines = 0
let loaded = false
// Serializes writes so concurrent ingests can't interleave partial lines into
// the log. Each write waits for the previous one to finish.
let writeChain: Promise<void> = Promise.resolve()

export async function initStore(): Promise<void> {
  if (loaded) return
  const dir = await appDataDir()
  if (!(await exists(dir))) await mkdir(dir, { recursive: true })
  logFile = await join(dir, 'index.jsonl')
  legacyFile = await join(dir, 'index.json')

  if (await exists(logFile)) {
    const raw = await readTextFile(logFile)
    entries = replay(raw)
    logLines = countLines(raw)
  } else if (await exists(legacyFile)) {
    // Migrate a pre-log index.json, then compact it into the new log. The old
    // file is left in place as a backup rather than deleted.
    try {
      entries = JSON.parse(await readTextFile(legacyFile)) as IndexEntry[]
    } catch {
      entries = []
    }
    await compact()
  } else {
    entries = []
  }

  loaded = true
  if (shouldCompact(logLines, entries.length)) await compact()
}

export function countLines(raw: string): number {
  return raw.split('\n').filter((l) => l.trim()).length
}

// Serializes entries into log format — the inverse of replay(), and what
// compaction writes.
export function serializeLog(list: IndexEntry[]): string {
  return list.map((e) => JSON.stringify(e)).join('\n') + '\n'
}

// Replays the log into the live entry set: later lines win, keyed by image path.
// A line that fails to parse (a torn write from a crash, say) is skipped rather
// than aborting the whole load — one bad line shouldn't cost the user an index.
export function replay(raw: string): IndexEntry[] {
  const byPath = new Map<string, IndexEntry>()
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line) as IndexEntry
      if (entry?.path) byPath.set(entry.path, entry)
    } catch {
      continue
    }
  }
  return [...byPath.values()]
}

// Compact once the log is more than half dead weight, with a floor so small
// libraries don't rewrite constantly.
export function shouldCompact(lines: number, entryCount: number): boolean {
  return lines > entryCount * 2 + 50
}

// Rewrites the log with only the live entries. Writes to a temp file and renames
// it into place, so an interrupted compaction leaves the previous log intact
// instead of a half-written one.
async function compact(): Promise<void> {
  const body = serializeLog(entries)
  const tmp = `${logFile}.tmp`
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await writeTextFile(tmp, body)
      try {
        // On Unix this replaces the old log atomically — at no point does a
        // reader see a partial file.
        await rename(tmp, logFile)
      } catch {
        // Windows won't rename onto an existing path, so fall back to an
        // unlink-then-rename there.
        if (await exists(logFile)) await remove(logFile)
        await rename(tmp, logFile)
      }
      logLines = entries.length
    })
  return writeChain
}

// Appends a single entry as one line — the hot path during ingest.
async function appendEntry(entry: IndexEntry): Promise<void> {
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await writeTextFile(logFile, JSON.stringify(entry) + '\n', { append: true })
      logLines++
    })
  await writeChain
  if (shouldCompact(logLines, entries.length)) await compact()
}

export function allEntries(): IndexEntry[] {
  return entries
}

export function getEntry(id: string): IndexEntry | undefined {
  return entries.find((e) => e.id === id)
}

export function getEntryByPath(path: string): IndexEntry | undefined {
  return entries.find((e) => e.path === path)
}

export async function upsertEntry(entry: IndexEntry): Promise<void> {
  const i = entries.findIndex((e) => e.path === entry.path)
  if (i >= 0) entries[i] = entry
  else entries.push(entry)
  await appendEntry(entry)
}

export async function updateEntry(
  id: string,
  patch: Partial<IndexEntry>,
): Promise<IndexEntry | undefined> {
  const entry = getEntry(id)
  if (!entry) return undefined
  Object.assign(entry, patch)
  await appendEntry(entry)
  return entry
}

// --- Folder registry (small enough to keep in localStorage) ---

export interface FolderRec {
  id: string
  name: string
  color: string
}

const FOLDERS_KEY = 'screenlabel.folders'

export function loadFolders(): FolderRec[] {
  try {
    return JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? '[]') as FolderRec[]
  } catch {
    return []
  }
}

function saveFolders(folders: FolderRec[]): void {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
}

export function addFolder(name: string, color = '#534AB7'): FolderRec {
  const folders = loadFolders()
  const existing = folders.find((f) => f.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing
  const rec: FolderRec = { id: crypto.randomUUID(), name, color }
  folders.push(rec)
  saveFolders(folders)
  return rec
}

export function removeFolder(id: string): void {
  saveFolders(loadFolders().filter((f) => f.id !== id))
}

export function folderById(id: string): FolderRec | undefined {
  return loadFolders().find((f) => f.id === id)
}

export function folderByName(name: string): FolderRec | undefined {
  return loadFolders().find((f) => f.name.toLowerCase() === name.toLowerCase())
}

// --- Search: brute-force cosine similarity over all embeddings ---
//
// For a few thousand screenshots this runs in well under a millisecond. When it
// stops being fast enough, this is the one function to swap for sqlite-vec or
// LanceDB — nothing else changes.

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

export function search(
  queryEmbedding: number[],
  topN = 20,
  threshold = 0.2,
): Array<IndexEntry & { similarity: number }> {
  return entries
    .map((e) => ({ ...e, similarity: cosine(queryEmbedding, e.embedding) }))
    .filter((e) => e.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN)
}

// --- Mapping IndexEntry -> the shape the UI components already expect ---

export interface ScreenshotView {
  id: string
  filename: string
  file_path: string
  storage_path: string
  description: string
  notes?: string
  folder_id?: string
  tags?: string[]
  similarity?: number
}

export function toScreenshot(e: IndexEntry): ScreenshotView {
  return {
    id: e.id,
    filename: e.file,
    file_path: e.path,
    storage_path: e.path,
    description: e.description,
    notes: e.notes,
    folder_id: e.folder ? folderByName(e.folder)?.id : undefined,
    tags: e.tags,
  }
}
