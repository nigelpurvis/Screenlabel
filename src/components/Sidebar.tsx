import { useState } from 'react'
import { createFolder, deleteFolder } from '../lib/folders'

interface Folder {
  id: string
  name: string
  color: string
}

interface Props {
  folders: Folder[]
  selectedFolder: string | null
  onSelectFolder: (id: string | null) => void
  onFoldersChange: () => void
}

export function Sidebar({ folders, selectedFolder, onSelectFolder, onFoldersChange }: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  async function handleCreate() {
    if (!newName.trim()) return
    await createFolder(newName.trim())
    setNewName('')
    setCreating(false)
    onFoldersChange()
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteFolder(id)
    if (selectedFolder === id) onSelectFolder(null)
    onFoldersChange()
  }

  return (
    <div style={{
      width: '200px',
      flexShrink: 0,
      borderRight: '0.5px solid var(--border)',
      padding: '16px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      height: '100vh',
      overflowY: 'auto'
    }}>
      <div style={{ padding: '0 12px', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Library
        </span>
      </div>

      <SidebarItem
        label="All screenshots"
        selected={selectedFolder === null}
        onClick={() => onSelectFolder(null)}
        icon={
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/>
            <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/>
            <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/>
            <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/>
          </svg>
        }
      />

      {folders.length > 0 && (
        <div style={{ padding: '8px 12px 4px', marginTop: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Folders
          </span>
        </div>
      )}

      {folders.map(f => (
        <SidebarItem
          key={f.id}
          label={f.name}
          selected={selectedFolder === f.id}
          onClick={() => onSelectFolder(f.id)}
          color={f.color}
          onDelete={e => handleDelete(f.id, e)}
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 4a1 1 0 011-1h3l1.5 1.5H12a1 1 0 011 1V11a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" fill="currentColor" opacity="0.7"/>
            </svg>
          }
        />
      ))}

      <div style={{ padding: '8px 12px', marginTop: '4px' }}>
        {creating ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              placeholder="Folder name..."
              style={{
                flex: 1, fontSize: '13px', padding: '4px 8px',
                border: '0.5px solid var(--accent)', borderRadius: 'var(--radius-sm)',
                outline: 'none'
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            style={{
              fontSize: '12px', color: 'var(--text-muted)', background: 'none',
              border: 'none', cursor: 'pointer', padding: '0',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> New folder
          </button>
        )}
      </div>
    </div>
  )
}

function SidebarItem({ label, selected, onClick, icon, color, onDelete }: {
  label: string
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  color?: string
  onDelete?: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
        margin: '0 6px',
        background: selected ? 'var(--accent-subtle)' : hovered ? 'var(--surface)' : 'transparent',
        color: selected ? 'var(--accent)' : color || 'var(--text-secondary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        {icon}
        <span style={{
          fontSize: '13px', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {label}
        </span>
      </div>
      {onDelete && hovered && (
        <span
          onClick={onDelete}
          style={{ fontSize: '16px', color: 'var(--text-faint)', lineHeight: 1, cursor: 'pointer' }}
        >
          ×
        </span>
      )}
    </div>
  )
}