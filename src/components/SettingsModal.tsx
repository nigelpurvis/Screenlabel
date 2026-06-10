import { useState } from 'react'
import { getApiKey, setApiKey } from '../lib/settings'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(getApiKey())

  function handleSave() {
    setApiKey(key)
    onClose()
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
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px', color: '#111' }}>
          Settings
        </h2>
        <p style={{ fontSize: '12px', color: '#999', margin: '0 0 20px' }}>
          Screenlabel runs on your own OpenAI key — it stays on this device.
        </p>

        <label
          style={{
            fontSize: '11px',
            color: '#aaa',
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
            border: '0.5px solid #e0e0e0',
            borderRadius: '8px',
            outline: 'none',
            boxSizing: 'border-box',
            color: '#333',
          }}
        />
        <p style={{ fontSize: '11px', color: '#bbb', margin: '8px 0 0', lineHeight: 1.5 }}>
          Get a key at platform.openai.com/api-keys. Used to describe and search your screenshots.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '22px' }}>
          <button
            onClick={onClose}
            style={{
              fontSize: '13px',
              padding: '8px 16px',
              background: 'white',
              color: '#555',
              border: '0.5px solid #ddd',
              borderRadius: '7px',
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
              background: '#534AB7',
              color: 'white',
              border: 'none',
              borderRadius: '7px',
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
