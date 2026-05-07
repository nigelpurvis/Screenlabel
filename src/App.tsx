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
  if (inboxFolder) {
    startWatching(inboxFolder)
  }
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
      setStatus(`${data?.length || 0} results`)
    } catch (e) {
      setStatus('Search failed: ' + e)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>🖼 Screenlabel</h1>

      {!inboxFolder ? (
  <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f0f7ff', borderRadius: '8px' }}>
    <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>Set up your Screenlabel Inbox</p>
    <p style={{ margin: '0 0 0.75rem', color: '#555', fontSize: '0.9rem' }}>
      Pick a folder to watch — anything you drop in gets auto-ingested.
    </p>
    <button onClick={setupInbox} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
      📥 Choose Inbox Folder
    </button>
  </div>
) : (
  <p style={{ marginBottom: '1rem', color: '#666', fontSize: '0.85rem' }}>
    📥 Watching: {inboxFolder}
  </p>
)}

      <button onClick={handleIngest} disabled={loading}
        style={{ marginBottom: '1.5rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
        📁 Ingest Screenshot Folder
      </button>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search your screenshots..."
          style={{ flex: 1, padding: '0.5rem', fontSize: '1rem' }}
        />
        <button onClick={handleSearch} disabled={loading}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Search
        </button>
      </div>

      {status && <p style={{ color: '#666', marginBottom: '1rem' }}>{status}</p>}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {results.map(r => {
          loadImage(r.file_path)
          return (
            <div key={r.id}
              onClick={() => openPath(r.file_path)}
              style={{
                border: '1px solid #ddd', borderRadius: '8px',
                overflow: 'hidden', cursor: 'pointer',
                display: 'flex', gap: '1rem',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <img
                src={imageSrcs[r.file_path] || undefined}
                style={{ width: '120px', height: '100%', objectFit: 'cover', flexShrink: 0, alignSelf: 'stretch' }}
              />
              <div style={{ padding: '0.75rem', flex: 1 }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{r.filename}</div>
                <div style={{ color: '#555', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{r.description}</div>
                <div style={{ color: '#999', fontSize: '0.75rem' }}>{Math.round(r.similarity * 100)}% match</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default App