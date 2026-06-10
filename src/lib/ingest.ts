import { readFile } from '@tauri-apps/plugin-fs'
import { getProvider } from './ai'
import * as store from './localStore'
import { readSidecar, writeSidecar } from './vault'

// Convert raw image bytes to base64 in chunks. Doing it in one
// String.fromCharCode(...bytes) call overflows the call stack on large files.
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize))
  }
  return btoa(binary)
}

// Pipeline: image bytes -> base64 -> GPT-4o (describe + extract text) ->
// embedding -> write sidecar .md + upsert into the local index.
export async function ingestScreenshot(filePath: string) {
  if (store.getEntryByPath(filePath)) return { skipped: true as const }

  const ai = getProvider()
  const existing = await readSidecar(filePath)

  const bytes = await readFile(filePath)
  const base64 = toBase64(bytes)

  const { description, text } = await ai.describe(base64)
  const embedding = await ai.embed(`${description} ${text}`)

  const now = new Date().toISOString()
  const filename = filePath.split('/').pop() ?? filePath
  const fm = existing?.frontmatter ?? {}

  // Re-ingesting a screenshot that already has a sidecar preserves its id,
  // tags, folder, notes, and original created date.
  const entry: store.IndexEntry = {
    id: typeof fm.id === 'string' ? fm.id : crypto.randomUUID(),
    file: filename,
    path: filePath,
    description,
    text,
    tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
    folder: typeof fm.folder === 'string' ? fm.folder : null,
    notes: existing?.body.trim() ?? '',
    embedding,
    created: typeof fm.created === 'string' ? fm.created : now,
    ingested: now,
  }

  await store.upsertEntry(entry)
  await writeSidecar(
    filePath,
    {
      id: entry.id,
      file: entry.file,
      tags: entry.tags,
      folder: entry.folder,
      description,
      text,
      created: entry.created,
      ingested: now,
    },
    entry.notes,
  )

  return { skipped: false as const, id: entry.id, description }
}

export async function searchScreenshots(query: string): Promise<store.ScreenshotView[]> {
  const ai = getProvider()
  const embedding = await ai.embed(query)
  return store.search(embedding).map((e) => ({ ...store.toScreenshot(e), similarity: e.similarity }))
}

export async function suggestFolder(description: string, existingFolders: string[]): Promise<string> {
  const ai = getProvider()
  const out = await ai.complete(
    `Given this screenshot description and list of existing folders, suggest the best folder name. If none fit, suggest a new short folder name (1-2 words). Reply with ONLY the folder name, nothing else.

Description: ${description}

Existing folders: ${existingFolders.length > 0 ? existingFolders.join(', ') : 'none yet'}

Folder suggestion:`,
  )
  return out || 'Uncategorized'
}
