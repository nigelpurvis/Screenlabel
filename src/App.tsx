import { useState, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readFile, watchImmediate } from '@tauri-apps/plugin-fs'
import { openPath } from '@tauri-apps/plugin-opener'
import { ingestScreenshot, searchScreenshots, suggestFolder } from './lib/ingest'
import { getFolders, createFolder, assignFolder, getScreenshotsByFolder } from './lib/folders'
import { Sidebar } from './components/Sidebar'
import { DetailPanel } from './components/DetailPanel'
import { Toast } from './components/Toast'

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
  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<ToastData | null>(null)
  const [fullscreenSrc, setFullscreenSrc] = useState<string | null>(null)
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [inboxFolder, setInboxFolder] = useState<string | null>(
    localStorage.getItem('inboxFolder')
  )

  useEffect(() => {
    loadFolders()
    loadScreenshots(null)
    if (inboxFolder) startWatching(inboxFolder)
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

  async function loadImage(filePath: string) {
    if (imageSrcs[filePath]) return
    try {
      const bytes = await readFile(filePath)
      const blob = new Blob([bytes], { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      setImageSrcs(prev => ({ ...prev, [filePath]: url }))
    } catch (e) {
      console.error('Image load failed:', e)
    }
  }

  async function handleIngest() {
    const folder = await open({ directory: true })
    if (!folder) return
    setStatus('Scanning folder...')
    setLoading(true)
    const entries = await readDir(folder as string)
    const images = entries.filter(e => e.name?.match(/\.(png|jpg|jpeg)$/i))
    setStatus(`Found ${images.length} screenshots. Ingesting...`)
    let done = 0
    for (const img of images) {
      const filePath = `${folder}/${img.name}`
      try {
        const result = await ingestScreenshot(filePath)
        if (!result.skipped) done++
        setStatus(`Ingested ${done}/${images.length}: ${img.name}`)
      } catch (e) {
        console.error('Failed:', img.name, e)
      }
    }
    setStatus(`Done! ${done} new screenshots ingested.`)
    setLoading(false)
    loadScreenshots(selectedFolder)
  }

  async function handleSearch() {
    if (!query.trim()) return
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

  const displayedScreenshots = isSearchMode ? results : allScreenshots

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
          padding: '12px 20px', borderBottom: '0.5px solid #e8e8e8',
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
                fontSize: '13px', border: '0.5px solid #e0e0e0',
                borderRadius: '8px', outline: 'none', boxSizing: 'border-box', color: '#333'
              }}
            />
          </div>
          <button onClick={handleSearch} disabled={loading} style={{
            background: '#534AB7', color: 'white', border: 'none',
            borderRadius: '7px', padding: '7px 16px', fontSize: '13px', cursor: 'pointer'
          }}>
            {loading ? '...' : 'Search'}
          </button>
          <button onClick={handleIngest} disabled={loading} style={{
            background: 'white', color: '#555', border: '0.5px solid #ddd',
            borderRadius: '7px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer'
          }}>
            + Ingest
          </button>
          {!inboxFolder && (
            <button onClick={setupInbox} style={{
              background: '#EEEDFE', color: '#534AB7', border: 'none',
              borderRadius: '7px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer'
            }}>
              Set up inbox
            </button>
          )}
          {inboxFolder && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', color: '#666', background: '#f5f5f5',
              padding: '4px 10px', borderRadius: '20px', border: '0.5px solid #e0e0e0',
              flexShrink: 0
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1D9E75' }}/>
              Watching
            </div>
          )}
        </div>

        {/* Status */}
        {status && (
          <div style={{ padding: '8px 20px', fontSize: '12px', color: '#999', flexShrink: 0 }}>
            {status}
          </div>
        )}

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {displayedScreenshots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#ccc' }}>
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
                loadImage(filePath)
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedScreenshot(s)}
                    style={{
                      border: selectedScreenshot?.id === s.id ? '2px solid #534AB7' : '0.5px solid #e8e8e8',
                      borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                      background: 'white', transition: 'border-color 0.1s'
                    }}
                    onMouseEnter={e => {
                      if (selectedScreenshot?.id !== s.id)
                        e.currentTarget.style.borderColor = '#bbb'
                    }}
                    onMouseLeave={e => {
                      if (selectedScreenshot?.id !== s.id)
                        e.currentTarget.style.borderColor = '#e8e8e8'
                    }}
                  >
                    <div style={{ height: '110px', background: '#f5f5f5', overflow: 'hidden' }}>
                      {imageSrcs[filePath] ? (
                        <img
                          src={imageSrcs[filePath]}
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
                        fontSize: '11px', color: '#333', margin: '0 0 2px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontWeight: '500'
                      }}>
                        {s.filename}
                      </p>
                      {s.similarity !== undefined && (
                        <span style={{
                          fontSize: '10px', background: '#EEEDFE',
                          color: '#534AB7', padding: '1px 6px', borderRadius: '8px'
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

      {/* Detail panel */}
      {selectedScreenshot && (
        <DetailPanel
          screenshot={selectedScreenshot}
          folders={folders}
          imageSrc={imageSrcs[selectedScreenshot.file_path || selectedScreenshot.storage_path]}
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
        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', objectFit: 'contain' }}
      />
    </div>
  )}
    </div>
  )
}

export default App