import * as store from './localStore'
import { readSidecar, writeSidecar } from './vault'

// Folder/notes operations. These keep the exact signatures the UI was already
// calling when this was backed by Supabase — only the implementation changed,
// so App.tsx, Sidebar, and DetailPanel didn't have to.

export async function getFolders(): Promise<store.FolderRec[]> {
  return store.loadFolders()
}

export async function createFolder(name: string, color?: string): Promise<store.FolderRec> {
  return store.addFolder(name, color)
}

export async function deleteFolder(id: string): Promise<void> {
  store.removeFolder(id)
}

export async function assignFolder(screenshotId: string, folderId: string | null): Promise<void> {
  const folderName = folderId ? (store.folderById(folderId)?.name ?? null) : null
  const entry = await store.updateEntry(screenshotId, { folder: folderName })
  if (entry) await syncSidecar(entry)
}

export async function saveNotes(screenshotId: string, notes: string): Promise<void> {
  const entry = await store.updateEntry(screenshotId, { notes })
  if (entry) await syncSidecar(entry)
}

export async function getScreenshotsByFolder(
  folderId: string | null,
): Promise<store.ScreenshotView[]> {
  const wantedName = folderId ? (store.folderById(folderId)?.name ?? null) : null
  return store
    .allEntries()
    .filter((e) => (folderId === null ? true : e.folder === wantedName))
    .sort((a, b) => (b.ingested || '').localeCompare(a.ingested || ''))
    .map(store.toScreenshot)
}

// Whenever metadata or notes change, mirror them back into the sidecar .md so
// the file on disk stays the source of truth.
async function syncSidecar(entry: store.IndexEntry): Promise<void> {
  const existing = await readSidecar(entry.path)
  const frontmatter = {
    ...(existing?.frontmatter ?? {}),
    id: entry.id,
    file: entry.file,
    tags: entry.tags,
    folder: entry.folder,
    description: entry.description,
    text: entry.text,
    created: entry.created,
    ingested: entry.ingested,
  }
  await writeSidecar(entry.path, frontmatter, entry.notes || '')
}
