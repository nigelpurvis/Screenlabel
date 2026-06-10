import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'

// The local index: a derived cache of every ingested screenshot, including its
// embedding (1536 floats — too large to live in the .md files) plus a copy of
// its metadata for fast search and grid rendering. The sidecar .md files remain
// the source of truth; this index can always be rebuilt from them.
//
// Stored as a single index.json in the app's data directory.

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
let indexFile = ''
let loaded = false

export async function initStore(): Promise<void> {
  if (loaded) return
  const dir = await appDataDir()
  if (!(await exists(dir))) await mkdir(dir, { recursive: true })
  indexFile = await join(dir, 'index.json')
  if (await exists(indexFile)) {
    try {
      entries = JSON.parse(await readTextFile(indexFile)) as IndexEntry[]
    } catch {
      entries = []
    }
  } else {
    entries = []
  }
  loaded = true
}

async function persist(): Promise<void> {
  await writeTextFile(indexFile, JSON.stringify(entries))
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
  await persist()
}

export async function updateEntry(
  id: string,
  patch: Partial<IndexEntry>,
): Promise<IndexEntry | undefined> {
  const entry = getEntry(id)
  if (!entry) return undefined
  Object.assign(entry, patch)
  await persist()
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

function cosine(a: number[], b: number[]): number {
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
