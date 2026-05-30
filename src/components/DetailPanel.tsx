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
}

export function DetailPanel({ screenshot, folders, imageSrc, onClose, onUpdate }: Props) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string>('')

  useEffect(() => {
    if (screenshot) {
      setNotes(screenshot.notes || '')
      setSelectedFolder(screenshot.folder_id || '')
    }
  }, [screenshot?.id])

  if (!screenshot) return null

  async function handleSaveNotes() {
    if (!screenshot) return
    setSaving(true)
    await saveNotes(screenshot.id, notes)
    setSaving(false)
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
      width: '300px',
      flexShrink: 0,
      borderLeft: '0.5px solid #e8e8e8',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflowY: 'auto',
      background: 'white'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px', borderBottom: '0.5px solid #e8e8e8'
      }}>
        <span style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>Details</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '18px', color: '#999', lineHeight: 1, padding: '0'
        }}>×</button>
      </div>

      {/* Image */}
      {imageSrc && (
        <div style={{ padding: '16px', borderBottom: '0.5px solid #f0f0f0' }}>
          <img
            src={imageSrc}
            style={{ width: '100%', borderRadius: '8px', objectFit: 'cover' }}
          />
        </div>
      )}

      {/* Filename */}
      <div style={{ padding: '16px', borderBottom: '0.5px solid #f0f0f0' }}>
        <p style={{ fontSize: '11px', color: '#999', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>File</p>
        <p style={{ fontSize: '13px', color: '#333', margin: 0, wordBreak: 'break-all' }}>{screenshot.filename}</p>
      </div>

      {/* Description */}
      <div style={{ padding: '16px', borderBottom: '0.5px solid #f0f0f0' }}>
        <p style={{ fontSize: '11px', color: '#999', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Description</p>
        <p style={{ fontSize: '13px', color: '#555', margin: 0, lineHeight: '1.5' }}>{screenshot.description}</p>
      </div>

      {/* Folder */}
      <div style={{ padding: '16px', borderBottom: '0.5px solid #f0f0f0' }}>
        <p style={{ fontSize: '11px', color: '#999', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Folder</p>
        <select
          value={selectedFolder}
          onChange={e => handleFolderChange(e.target.value)}
          style={{
            width: '100%', fontSize: '13px', padding: '6px 8px',
            border: '0.5px solid #ddd', borderRadius: '6px',
            background: 'white', color: '#333', cursor: 'pointer'
          }}
        >
          <option value="">No folder</option>
          {folders.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div style={{ padding: '16px', flex: 1 }}>
        <p style={{ fontSize: '11px', color: '#999', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add a note..."
          style={{
            width: '100%', minHeight: '120px', fontSize: '13px',
            padding: '8px', border: '0.5px solid #ddd', borderRadius: '6px',
            resize: 'vertical', fontFamily: 'system-ui', lineHeight: '1.5',
            color: '#333', boxSizing: 'border-box'
          }}
        />
        <button
          onClick={handleSaveNotes}
          disabled={saving}
          style={{
            marginTop: '8px', fontSize: '13px', padding: '6px 16px',
            background: '#534AB7', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', width: '100%'
          }}
        >
          {saving ? 'Saving...' : 'Save notes'}
        </button>
      </div>
    </div>
  )
}