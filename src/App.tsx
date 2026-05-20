import { useState, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readFile, watchImmediate } from '@tauri-apps/plugin-fs'
import { openPath } from '@tauri-apps/plugin-opener'
import { ingestScreenshot, searchScreenshots } from './lib/ingest'

interface Result {
  id: string
  filename: string
  file_path: string
  description: string
  similarity: number
}

function App() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({})
  const [inboxFolder, setInboxFolder] = useState<string | null>(
    localStorage.getItem('inboxFolder')
  )

  useEffect(() => {
    if (inboxFolder) startWatching(inboxFolder)
  }, [])

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
            await ingestScreenshot(path)
            setStatus(`Auto-ingested: ${path.split('/').pop()}`)
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
  }

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
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
    <div style={{ 
      padding: '24px', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: '720px', 
      margin: '0 auto',
      minHeight: '100vh',
      background: '#fff'
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ 
            width: '28px', height: '28px', 
            background: '#534AB7', borderRadius: '6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="white"/>
              <rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity="0.6"/>
              <rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity="0.6"/>
              <rect x="9" y="9" width="5" height="5" rx="1" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: '16px', fontWeight: '500' }}>Screenlabel</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {inboxFolder && (
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', color: '#666',
              background: '#f5f5f5', padding: '4px 10px',
              borderRadius: '20px', border: '0.5px solid #e0e0e0'
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1D9E75' }}/>
              Watching inbox
            </div>
          )}
          <button onClick={handleIngest} disabled={loading} style={{
            fontSize: '12px', padding: '5px 12px',
            border: '0.5px solid #ddd', borderRadius: '6px',
            background: 'white', cursor: 'pointer', color: '#333'
          }}>
            + Ingest folder
          </button>
        </div>
      </div>

      {/* Onboarding */}
      {!inboxFolder && (
        <div style={{ 
          marginBottom: '20px', padding: '16px',
          background: '#EEEDFE', borderRadius: '10px',
          border: '0.5px solid #AFA9EC'
        }}>
          <p style={{ margin: '0 0 4px', fontWeight: '500', fontSize: '14px', color: '#3C3489' }}>
            Set up your Screenlabel inbox
          </p>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#534AB7' }}>
            Pick a folder to watch — anything you drop in gets auto-indexed.
          </p>
          <button onClick={setupInbox} style={{
            fontSize: '13px', padding: '6px 14px',
            background: '#534AB7', color: 'white',
            border: 'none', borderRadius: '6px', cursor: 'pointer'
          }}>
            Choose inbox folder
          </button>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ 
          position: 'absolute', left: '12px', top: '50%', 
          transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none'
        }}>
          <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search your screenshots..."
          style={{ 
            width: '100%', padding: '10px 100px 10px 36px',
            fontSize: '14px', border: '0.5px solid #ddd',
            borderRadius: '8px', outline: 'none', boxSizing: 'border-box',
            color: '#333'
          }}
        />
        <button onClick={handleSearch} disabled={loading} style={{
          position: 'absolute', right: '6px', top: '50%',
          transform: 'translateY(-50%)',
          background: '#534AB7', color: 'white',
          border: 'none', borderRadius: '6px',
          padding: '5px 14px', fontSize: '13px', cursor: 'pointer'
        }}>
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {/* Status */}
      {status && (
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>{status}</p>
      )}

      {/* Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {results.map(r => {
          loadImage(r.file_path)
          return (
            <div key={r.id}
              onClick={() => openPath(r.file_path)}
              style={{
                display: 'flex', gap: '0',
                border: '0.5px solid #e8e8e8',
                borderRadius: '10px', overflow: 'hidden',
                cursor: 'pointer', background: 'white',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#534AB7')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#e8e8e8')}
            >
              <div style={{ 
                width: '100px', flexShrink: 0,
                background: '#f0f0f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {imageSrcs[r.file_path] ? (
                  <img
                    src={imageSrcs[r.file_path]}
                    style={{ width: '100px', height: '100%', objectFit: 'cover', alignSelf: 'stretch', display: 'block' }}
                  />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" opacity="0.3">
                    <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="7" cy="7.5" r="1.5" fill="currentColor"/>
                    <path d="M2 13l5-4 3 3 3-2 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div style={{ padding: '12px 14px', flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontSize: '13px', fontWeight: '500', 
                  color: '#111', marginBottom: '4px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {r.filename}
                </div>
                <div style={{ 
                  fontSize: '12px', color: '#666', lineHeight: '1.5',
                  display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>
                  {r.description}
                </div>
                <div style={{ marginTop: '8px' }}>
                  <span style={{ 
                    fontSize: '11px', background: '#EEEDFE', 
                    color: '#534AB7', padding: '2px 8px', borderRadius: '10px'
                  }}>
                    {Math.round(r.similarity * 100)}% match
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {inboxFolder && (
        <div style={{ 
          marginTop: '24px', paddingTop: '16px',
          borderTop: '0.5px solid #f0f0f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontSize: '11px', color: '#bbb' }}>
            {inboxFolder}
          </span>
          <button onClick={setupInbox} style={{
            fontSize: '11px', color: '#999', background: 'none',
            border: 'none', cursor: 'pointer', padding: '0'
          }}>
            change folder
          </button>
        </div>
      )}
    </div>
  )
}

export default App