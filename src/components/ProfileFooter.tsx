import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { appDataDir } from '@tauri-apps/api/path'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { getApiKey, hasApiKey } from '../lib/settings'
import { prettyPath } from '../lib/paths'

interface Props {
  onOpenSettings: () => void
}

// The identity strip at the bottom of the sidebar.
//
// Screenlabel has no accounts, so this shows local identity rather than a signed
// in user: who the OS says you are, where your library lives, and whether a key
// is set. It occupies the slot an account would occupy, so if a paid tier ever
// adds real sign-in, the shape is already here.

/** Shows only the last four characters, enough to tell two keys apart. */
function maskKey(key: string): string {
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ProfileFooter({ onOpenSettings }: Props) {
  const [name, setName] = useState('')
  const [dataDir, setDataDir] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [displayName, dir] = await Promise.all([
          invoke<string>('user_display_name'),
          appDataDir(),
        ])
        setName(displayName)
        setDataDir(dir)
      } catch (e) {
        console.error('Could not read local profile:', e)
      }
    })()
  }, [])

  const keySet = hasApiKey()

  return (
    <div style={{ position: 'relative', flexShrink: 0, borderTop: '0.5px solid var(--border)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Local profile"
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          width: '100%', padding: 'var(--space-2) var(--space-3)',
          background: open ? 'var(--surface-hover)' : 'transparent',
          border: 'none', cursor: 'pointer', textAlign: 'left'
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--surface)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{
          width: '26px', height: '26px', flexShrink: 0,
          borderRadius: 'var(--radius-full)', background: 'var(--accent-subtle)',
          color: 'var(--accent-on-subtle)', fontSize: 'var(--text-xs)', fontWeight: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {initials(name || '?')}
        </span>

        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{
            display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {name || 'Local library'}
          </span>
          <span style={{
            display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {keySet ? 'This device only' : 'No API key set'}
          </span>
        </span>

        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, color: 'var(--text-faint)' }}
          aria-hidden="true"
        >
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
          <div
            className="sl-popover"
            style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: 'var(--space-2)',
              zIndex: 901, width: '260px', padding: 'var(--space-3)',
              background: 'var(--bg)', border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)'
            }}
          >
            <p style={{
              margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em'
            }}>
              OpenAI key
            </p>
            <p style={{
              margin: '2px 0 var(--space-3)', fontSize: 'var(--text-sm)',
              color: keySet ? 'var(--text-primary)' : 'var(--danger)',
              fontFamily: keySet ? 'var(--font-mono)' : 'inherit'
            }}>
              {keySet ? maskKey(getApiKey()) : 'Not set'}
            </p>

            <p style={{
              margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em'
            }}>
              Index and thumbnails
            </p>
            <button
              onClick={() => dataDir && revealItemInDir(dataDir).catch(() => {})}
              title={dataDir}
              disabled={!dataDir}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: 0,
                margin: '2px 0 var(--space-3)', background: 'none', border: 'none',
                fontSize: 'var(--text-sm)', color: 'var(--accent)', cursor: 'pointer',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}
            >
              {dataDir ? prettyPath(dataDir) : '—'}
            </button>

            <p style={{
              margin: '0 0 var(--space-3)', fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)', lineHeight: 1.5
            }}>
              No account, no server. Your screenshots and notes never leave this
              Mac except to be described by your own OpenAI key.
            </p>

            <button
              onClick={() => { setOpen(false); onOpenSettings() }}
              style={{
                width: '100%', background: 'var(--surface)', color: 'var(--text-primary)',
                border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '7px 10px', fontSize: 'var(--text-sm)', cursor: 'pointer'
              }}
            >
              Settings
            </button>
          </div>
        </>
      )}
    </div>
  )
}
