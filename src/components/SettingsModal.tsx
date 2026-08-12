import { useState } from 'react'
import { getApiKey, setApiKey } from '../lib/settings'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(getApiKey())
  const [error, setError] = useState('')

  async function handleSave() {
    try {
      await setApiKey(key)
      onClose()
    } catch (e) {
      setError(`Couldn't save your key to the keychain: ${e}`)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '420px',
          background: 'white',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' }}>
          Settings
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
          Screenlabel runs on your own OpenAI key — it stays on this device.
        </p>

        <label
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          OpenAI API key
        </label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="sk-..."
          autoFocus
          style={{
            width: '100%',
            marginTop: '6px',
            padding: '9px 12px',
            fontSize: '13px',
            border: '0.5px solid var(--border)',
            borderRadius: 'var(--radius)',
            outline: 'none',
            boxSizing: 'border-box',
            color: 'var(--text-primary)',
          }}
        />
        <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '8px 0 0', lineHeight: 1.5 }}>
          Get a key at platform.openai.com/api-keys. Stored in your system keychain, never in the app.
        </p>

        {error && (
          <p style={{ fontSize: '12px', color: 'var(--danger)', margin: '12px 0 0', lineHeight: 1.5 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '22px' }}>
          <button
            onClick={onClose}
            style={{
              fontSize: '13px',
              padding: '8px 16px',
              background: 'white',
              color: 'var(--text-secondary)',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              fontSize: '13px',
              padding: '8px 20px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
