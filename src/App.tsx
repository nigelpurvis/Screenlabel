import { useState, useEffect, useRef } from 'react'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, watchImmediate } from '@tauri-apps/plugin-fs'
import { ingestScreenshot, searchScreenshots, suggestFolder } from './lib/ingest'
import { getFolders, createFolder, assignFolder, getScreenshotsByFolder } from './lib/folders'
import { initStore } from './lib/localStore'
import { hasApiKey, loadApiKey } from './lib/settings'
import { Sidebar } from './components/Sidebar'
import { DetailPanel } from './components/DetailPanel'
import { Toast } from './components/Toast'
import { SettingsModal } from './components/SettingsModal'

const IMAGE_PATTERN = /\.(png|jpg|jpeg)$/i

interface Screenshot {
  id: string
  filename: string
  file_path: string
  storage_path: string
  description: string
  notes?: string
  folder_id?: string
  similarity?: number
}

interface Folder {
  id: string
  name: string
  color: string
}

interface ToastData {
  message: string
  subtitle?: string
  actions?: { label: string; onClick: () => void; primary?: boolean }[]
}

function App() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Screenshot[]>([])
  const [allScreenshots, setAllScreenshots] = useState<Screenshot[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [thumbSrcs, setThumbSrcs] = useState<Record<string, string>>({})
  // Paths we've already kicked off a thumbnail request for. A ref rather than
  // state because it must not retrigger the effect that writes to it.
  const requestedThumbs = useRef<Set<string>>(new Set())
  const [toast, setToast] = useState<ToastData | null>(null)
  const [fullscreenSrc, setFullscreenSrc] = useState<string | null>(null)
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [inboxFolder, setInboxFolder] = useState<string | null>(
    localStorage.getItem('inboxFolder')
  )
  const [showSettings, setShowSettings] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const displayedScreenshots = isSearchMode ? results : allScreenshots

  // Dropping screenshots onto the window is the most direct way to add them, so
  // it reuses the same pipeline as the file picker. The handler lives in a ref
  // because the listener is registered once but must always call the current
  // closure — otherwise a drop would refresh a stale folder selection.
  const ingestRef = useRef(ingestPaths)
  useEffect(() => {
    ingestRef.current = ingestPaths
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false

    getCurrentWebview()
      .onDragDropEvent(event => {
        if (event.payload.type === 'over') {
          setIsDragging(true)
          return
        }
        setIsDragging(false)
        if (event.payload.type !== 'drop') return
        if (!hasApiKey()) { setShowSettings(true); return }
        ingestRef.current(event.payload.paths)
      })
      .then(fn => {
        // The listener may resolve after this effect was already cleaned up.
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(e => console.error('Could not register drag and drop:', e))

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    (async () => {
      await initStore()
      await loadApiKey()
      if (!hasApiKey()) setShowSettings(true)
      await loadFolders()
      await loadScreenshots(null)
      if (inboxFolder) startWatching(inboxFolder)
    })()
  }, [])

  async function loadFolders() {
    try {
      const data = await getFolders()
      setFolders(data || [])
    } catch (e) {
      console.error('Failed to load folders:', e)
    }
  }

  async function loadScreenshots(folderId: string | null) {
    try {
      const data = await getScreenshotsByFolder(folderId)
      setAllScreenshots(data || [])
    } catch (e) {
      console.error('Failed to load screenshots:', e)
    }
  }

  async function handleFolderSelect(folderId: string | null) {
    setSelectedFolder(folderId)
    setIsSearchMode(false)
    setQuery('')
    setResults([])
    loadScreenshots(folderId)
  }

  async function setupInbox() {
    const folder = await open({ directory: true })
    if (!folder) return
    localStorage.setItem('inboxFolder', folder as string)
    setInboxFolder(folder as string)
    startWatching(folder as string)
  }

  async function startWatching(folder: string) {
    await watchImmediate(folder, async (event) => {
      for (const path of event.paths) {
        if (path.match(/\.(png|jpg|jpeg)$/i)) {
          try {
            const result = await ingestScreenshot(path)
            if (result.skipped) return

            const folderNames = folders.map(f => f.name)
            const suggested = await suggestFolder(result.description || '', folderNames)

            setToast({
              message: `New screenshot ingested`,
              subtitle: `Suggested folder: "${suggested}" — move it there?`,
              actions: [
                {
                  label: 'Yes, move it',
                  primary: true,
                  onClick: async () => {
                    let targetFolder = folders.find(f =>
                      f.name.toLowerCase() === suggested.toLowerCase()
                    )
                    if (!targetFolder) {
                      targetFolder = await createFolder(suggested)
                      await loadFolders()
                    }
                    if (result.id) {
                      await assignFolder(result.id, targetFolder.id)
                      loadScreenshots(selectedFolder)
                    }
                    setToast(null)
                  }
                },
                {
                  label: 'Skip',
                  onClick: () => {
                    setToast(null)
                    loadScreenshots(selectedFolder)
                  }
                }
              ]
            })
          } catch (e) {
            console.error('Auto-ingest failed:', e)
          }
        }
      }
    }, { recursive: false })
  }

  // Thumbnails are generated and disk-cached by the Rust side, then handed to
  // the webview as asset:// URLs.
  //
  // This replaced reading each full-resolution screenshot into a Blob and
  // calling URL.createObjectURL on it. Those object URLs were never revoked, so
  // every image ever scrolled past stayed decoded in memory for the life of the
  // process — a few hundred retina screenshots was enough to reach gigabytes.
  // Asset URLs have no such bookkeeping: the webview loads the file itself and
  // manages its own cache, so there's nothing to leak.
  useEffect(() => {
    const pending = displayedScreenshots
      .map(s => s.file_path || s.storage_path)
      .filter(p => p && !requestedThumbs.current.has(p))
    if (pending.length === 0) return

    pending.forEach(p => requestedThumbs.current.add(p))
    const finished = new Set<string>()
    let cancelled = false
    let cursor = 0

    // Bounded concurrency: decoding is CPU-bound, so a few at a time keeps the
    // grid filling in quickly without saturating the machine on a big library.
    async function worker() {
      while (cursor < pending.length && !cancelled) {
        const path = pending[cursor++]
        try {
          const thumbPath = await invoke<string>('thumbnail', { path })
          setThumbSrcs(prev => ({ ...prev, [path]: convertFileSrc(thumbPath) }))
        } catch (e) {
          // A thumbnail is an optimization, not a requirement — fall back to
          // the original file so the user still sees their screenshot.
          console.error('Thumbnail failed for', path, e)
          setThumbSrcs(prev => ({ ...prev, [path]: convertFileSrc(path) }))
        }
        finished.add(path)
      }
    }

    Promise.all(Array.from({ length: 4 }, () => worker()))

    return () => {
      cancelled = true
      // Un-mark anything this run didn't finish, or it would stay flagged as
      // requested forever and never be retried. StrictMode double-invokes
      // effects in development (run, clean up, run again), so a cancelled run
      // is the normal case here rather than an edge case.
      for (const path of pending) {
        if (!finished.has(path)) requestedThumbs.current.delete(path)
      }
    }
  }, [displayedScreenshots])

  // Ingests any set of image paths. Files can arrive from the file picker, a
  // folder scan, or a drag and drop, so the pipeline itself takes plain paths
  // and doesn't care where they came from.
  async function ingestPaths(paths: string[]) {
    const images = paths.filter(p => IMAGE_PATTERN.test(p))
    const total = images.length

    if (total === 0) {
      setStatus('Nothing to ingest — Screenlabel reads PNG and JPEG images.')
      return
    }

    setLoading(true)

    let done = 0
    let failed = 0
    let firstError = ''
    let cursor = 0

    // Process a few at a time — 65 sequential GPT-4o calls would take minutes.
    async function worker() {
      while (cursor < images.length) {
        const path = images[cursor++]
        try {
          const result = await ingestScreenshot(path)
          if (!result.skipped) done++
        } catch (e) {
          failed++
          if (!firstError) firstError = String(e)
          console.error('Failed:', path, e)
        }
        setStatus(`Ingesting ${done + failed}/${total}…${failed ? ` — ${failed} failed` : ''}`)
        if ((done + failed) % 4 === 0) loadScreenshots(selectedFolder)
      }
    }

    await Promise.all(Array.from({ length: 4 }, () => worker()))

    setLoading(false)
    loadScreenshots(selectedFolder)
    setStatus(
      failed > 0
        ? `Done — ${done} ingested, ${failed} failed. ${firstError}`
        : `Done! ${done} screenshot${done === 1 ? '' : 's'} ingested.`
    )
  }

  async function handleAddFiles() {
    if (!hasApiKey()) { setShowSettings(true); return }
    const picked = await open({
      multiple: true,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
    })
    if (!picked) return
    await ingestPaths(picked as string[])
  }

  async function handleAddFolder() {
    if (!hasApiKey()) { setShowSettings(true); return }
    const folder = await open({ directory: true })
    if (!folder) return
    setStatus('Scanning folder…')
    const dir = folder as string
    const entries = await readDir(dir)
    await ingestPaths(entries.filter(e => e.name).map(e => `${dir}/${e.name}`))
  }

  async function handleSearch() {
    if (!query.trim()) return
    if (!hasApiKey()) { setShowSettings(true); return }
    setLoading(true)
    setIsSearchMode(true)
    setStatus('Searching...')
    try {
      const data = await searchScreenshots(query)
      setResults(data || [])
      setStatus(data?.length ? `${data.length} results` : 'No results found')
    } catch (e) {
      setStatus('Search failed: ' + e)
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'white' }}>

      {/* Sidebar */}
      <Sidebar
        folders={folders}
        selectedFolder={selectedFolder}
        onSelectFolder={handleFolderSelect}
        onFoldersChange={loadFolders}
      />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 20px', borderBottom: '0.5px solid var(--border)',
          flexShrink: 0
        }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
              position: 'absolute', left: '10px', top: '50%',
              transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none'
            }}>
              <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search screenshots..."
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                fontSize: '13px', border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)', outline: 'none', boxSizing: 'border-box', color: 'var(--text-primary)'
              }}
            />
          </div>
          <button onClick={handleSearch} disabled={loading} style={{
            background: 'var(--accent)', color: 'white', border: 'none',
            borderRadius: 'var(--radius)', padding: '7px 16px', fontSize: '13px', cursor: 'pointer'
          }}>
            {loading ? '...' : 'Search'}
          </button>
          <button onClick={handleAddFiles} disabled={loading} title="Add individual screenshots" style={{
            background: 'white', color: 'var(--text-secondary)', border: '0.5px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '7px 14px', fontSize: '13px', cursor: 'pointer'
          }}>
            + Files
          </button>
          <button onClick={handleAddFolder} disabled={loading} title="Add every screenshot in a folder" style={{
            background: 'white', color: 'var(--text-secondary)', border: '0.5px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '7px 14px', fontSize: '13px', cursor: 'pointer'
          }}>
            + Folder
          </button>
          <button onClick={() => setShowSettings(true)} title="Settings" style={{
            background: 'white', color: 'var(--text-secondary)', border: '0.5px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '7px 10px', fontSize: '13px', cursor: 'pointer'
          }}>
            ⚙
          </button>
          {!inboxFolder && (
            <button onClick={setupInbox} style={{
              background: 'var(--accent-subtle)', color: 'var(--accent)', border: 'none',
              borderRadius: 'var(--radius)', padding: '7px 14px', fontSize: '13px', cursor: 'pointer'
            }}>
              Set up inbox
            </button>
          )}
          {inboxFolder && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--surface)',
              padding: '4px 10px', borderRadius: 'var(--radius-full)', border: '0.5px solid var(--border)',
              flexShrink: 0
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: 'var(--radius-full)', background: 'var(--success)' }}/>
              Watching
            </div>
          )}
        </div>

        {/* Status */}
        {status && (
          <div style={{ padding: '8px 20px', fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
            {status}
          </div>
        )}

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {displayedScreenshots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-faint)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🖼</div>
              <p style={{ fontSize: '14px', margin: 0 }}>
                {isSearchMode ? 'No results found' : 'No screenshots yet — ingest a folder to get started'}
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '12px'
            }}>
              {displayedScreenshots.map(s => {
                const filePath = s.file_path || s.storage_path
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedScreenshot(s)}
                    style={{
                      border: selectedScreenshot?.id === s.id ? '2px solid var(--accent)' : '0.5px solid var(--border)',
                      borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer',
                      background: 'white', transition: 'border-color 0.1s'
                    }}
                    onMouseEnter={e => {
                      if (selectedScreenshot?.id !== s.id)
                        e.currentTarget.style.borderColor = 'var(--text-faint)'
                    }}
                    onMouseLeave={e => {
                      if (selectedScreenshot?.id !== s.id)
                        e.currentTarget.style.borderColor = 'var(--border)'
                    }}
                  >
                    <div style={{ height: '110px', background: 'var(--surface)', overflow: 'hidden' }}>
                      {thumbSrcs[filePath] ? (
                        <img
                          src={thumbSrcs[filePath]}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" opacity="0.2">
                            <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                            <circle cx="7" cy="7.5" r="1.5" fill="currentColor"/>
                            <path d="M2 13l5-4 3 3 3-2 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '8px' }}>
                      <p style={{
                        fontSize: '11px', color: 'var(--text-primary)', margin: '0 0 2px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontWeight: '500'
                      }}>
                        {s.filename}
                      </p>
                      {s.similarity !== undefined && (
                        <span style={{
                          fontSize: '10px', background: 'var(--accent-subtle)',
                          color: 'var(--accent)', padding: '1px 6px', borderRadius: 'var(--radius)'
                        }}>
                          {Math.round(s.similarity * 100)}% match
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel — shows the real screenshot, not the grid thumbnail.
          No preloading needed: the webview fetches it from disk directly. */}
      {selectedScreenshot && (
        <DetailPanel
          screenshot={selectedScreenshot}
          folders={folders}
          imageSrc={convertFileSrc(
            selectedScreenshot.file_path || selectedScreenshot.storage_path
          )}
          onClose={() => setSelectedScreenshot(null)}
          onUpdate={() => loadScreenshots(selectedFolder)}
          onOpenFullscreen={(src) => setFullscreenSrc(src)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          subtitle={toast.subtitle}
          actions={toast.actions}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Settings */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Drop target feedback */}
      {isDragging && (
        <div style={{
          position: 'fixed', inset: 'var(--space-3)',
          border: '2px dashed var(--accent)', borderRadius: 'var(--radius-lg)',
          background: 'var(--accent-subtle)', opacity: 0.96,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 'var(--space-2)',
          zIndex: 4000, pointerEvents: 'none'
        }}>
          <p style={{
            margin: 0, fontSize: 'var(--text-base)', fontWeight: 500,
            color: 'var(--accent-on-subtle)'
          }}>
            Drop to add screenshots
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>
            PNG and JPEG
          </p>
        </div>
      )}

      {/* Fullscreen modal */}
      {fullscreenSrc && (
      <div
      onClick={() => setFullscreenSrc(null)}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, cursor: 'zoom-out'
      }}
    >
      <img
        src={fullscreenSrc}
        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 'var(--radius)', objectFit: 'contain' }}
      />
    </div>
  )}
    </div>
  )
}

export default App