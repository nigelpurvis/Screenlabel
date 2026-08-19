import { useState, useEffect } from 'react'
import { assignFolder } from '../lib/folders'

interface Folder {
  id: string
  name: string
  color: string
}

interface Screenshot {
  id: string
  filename: string
  file_path: string
  description: string
  notes?: string
  folder_id?: string
  similarity?: number
}

interface Props {
  screenshot: Screenshot | null
  folders: Folder[]
  imageSrc?: string
  onClose: () => void
  onUpdate: () => void
  onOpenFullscreen: (src: string) => void
  onOpenNotes: () => void
}

export function DetailPanel({
  screenshot, folders, imageSrc, onClose, onUpdate, onOpenFullscreen, onOpenNotes,
}: Props) {
  const [selectedFolder, setSelectedFolder] = useState<string>('')

  useEffect(() => {
    if (screenshot) {
      setSelectedFolder(screenshot.folder_id || '')
    }
  }, [screenshot?.id])

  if (!screenshot) return null

  async function handleFolderChange(folderId: string) {
    if (!screenshot) return
    setSelectedFolder(folderId)
    await assignFolder(screenshot.id, folderId || null)
    onUpdate()
  }

  return (
    <div style={{
      width: '340px',
      flexShrink: 0,
      borderLeft: '0.5px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'white',
      overflow: 'hidden'
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '0.5px solid var(--border)', flexShrink: 0
      }}>
        <span style={{ fontSize: 'var(--text-base)', fontWeight: '500', color: 'var(--text-primary)' }}>Details</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 'var(--text-lg)', color: 'var(--text-faint)', lineHeight: 1, padding: '0'
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Image — big and clickable */}
        {imageSrc && (
          <div
            onClick={() => onOpenFullscreen(imageSrc)}
            style={{
              cursor: 'zoom-in', position: 'relative',
              borderBottom: '0.5px solid var(--surface-hover)'
            }}
          >
            <img
              src={imageSrc}
              style={{ width: '100%', display: 'block', maxHeight: '260px', objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute', bottom: '8px', right: '8px',
              background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)',
              padding: '3px 6px', fontSize: 'var(--text-xs)', color: 'white'
            }}>
              Click to expand
            </div>
          </div>
        )}

        {/* File */}
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--surface-hover)' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>File</p>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', margin: 0, wordBreak: 'break-all', lineHeight: '1.4' }}>
            {screenshot.filename}
          </p>
        </div>

        {/* AI Description */}
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--surface-hover)' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Description</p>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>
            {screenshot.description}
          </p>
        </div>

        {/* Folder */}
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--surface-hover)' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Folder</p>
          <select
            value={selectedFolder}
            onChange={e => handleFolderChange(e.target.value)}
            style={{
              width: '100%', fontSize: 'var(--text-base)', padding: '7px 10px',
              border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
              background: 'white', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none'
            }}
          >
            <option value="">No folder</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Notes — a preview here, with the actual writing done full-screen.
            Editing in a 300px column made the note feel like a form field
            rather than the thing the app is for. */}
        <div style={{ padding: '14px 16px' }}>
          <p style={{
            fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 8px',
            textTransform: 'uppercase', letterSpacing: '0.06em'
          }}>
            Notes
          </p>

          <button
            onClick={onOpenNotes}
            style={{
              display: 'block', width: '100%', textAlign: 'left', cursor: 'text',
              background: 'var(--surface)', border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '10px',
              minHeight: '96px', color: 'inherit'
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {screenshot.notes?.trim() ? (
              <span style={{
                display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', fontSize: 'var(--text-sm)', lineHeight: 1.6,
                color: 'var(--text-primary)', whiteSpace: 'pre-wrap'
              }}>
                {screenshot.notes}
              </span>
            ) : (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
                Nothing written yet.
              </span>
            )}
          </button>

          <button
            onClick={onOpenNotes}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', width: '100%', marginTop: '8px',
              fontSize: 'var(--text-base)', padding: '8px 16px',
              background: 'var(--accent)', color: 'white', border: 'none',
              borderRadius: 'var(--radius)', cursor: 'pointer'
            }}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
            </svg>
            {screenshot.notes?.trim() ? 'Open notes' : 'Write a note'}
          </button>
        </div>
      </div>
    </div>
  )
}