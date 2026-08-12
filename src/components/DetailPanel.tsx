import { useState, useEffect } from 'react'
import { saveNotes, assignFolder } from '../lib/folders'

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
}

export function DetailPanel({ screenshot, folders, imageSrc, onClose, onUpdate, onOpenFullscreen }: Props) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string>('')

  useEffect(() => {
    if (screenshot) {
      setNotes(screenshot.notes || '')
      setSelectedFolder(screenshot.folder_id || '')
      setSaved(false)
    }
  }, [screenshot?.id])

  if (!screenshot) return null

  async function handleSaveNotes() {
    if (!screenshot) return
    setSaving(true)
    await saveNotes(screenshot.id, notes)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onUpdate()
  }

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
        <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>Details</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '20px', color: 'var(--text-faint)', lineHeight: 1, padding: '0'
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
              padding: '3px 6px', fontSize: '11px', color: 'white'
            }}>
              Click to expand
            </div>
          </div>
        )}

        {/* File */}
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--surface-hover)' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>File</p>
          <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, wordBreak: 'break-all', lineHeight: '1.4' }}>
            {screenshot.filename}
          </p>
        </div>

        {/* AI Description */}
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--surface-hover)' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Description</p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>
            {screenshot.description}
          </p>
        </div>

        {/* Folder */}
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--surface-hover)' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Folder</p>
          <select
            value={selectedFolder}
            onChange={e => handleFolderChange(e.target.value)}
            style={{
              width: '100%', fontSize: '13px', padding: '7px 10px',
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

        {/* Notes */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes</p>
            {saved && <span style={{ fontSize: '11px', color: 'var(--success)' }}>Saved</span>}
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveNotes()
            }}
            placeholder="Add notes, context, or anything you want to remember about this screenshot..."
            style={{
              width: '100%', minHeight: '180px', fontSize: '13px',
              padding: '10px', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
              resize: 'vertical', fontFamily: 'system-ui', lineHeight: '1.6',
              color: 'var(--text-primary)', boxSizing: 'border-box', outline: 'none'
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>⌘ + Enter to save</span>
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              style={{
                fontSize: '13px', padding: '7px 20px',
                background: 'var(--accent)', color: 'white', border: 'none',
                borderRadius: 'var(--radius)', cursor: 'pointer'
              }}
            >
              {saving ? 'Saving...' : 'Save notes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}