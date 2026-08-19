import { useEffect } from 'react'

interface ToastAction {
  label: string
  onClick: () => void
  primary?: boolean
}

interface ToastProps {
  message: string
  subtitle?: string
  actions?: ToastAction[]
  onDismiss: () => void
  duration?: number
}

export function Toast({ message, subtitle, actions, onDismiss, duration = 8000 }: ToastProps) {
  useEffect(() => {
    if (!actions || actions.length === 0) {
      const t = setTimeout(onDismiss, duration)
      return () => clearTimeout(t)
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px',
      background: 'white', border: '0.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      maxWidth: '320px', zIndex: 1000,
      animation: 'slideUp 0.2s ease'
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 2px', fontSize: 'var(--text-base)', fontWeight: '500', color: 'var(--text-primary)' }}>
            {message}
          </p>
          {subtitle && (
            <p style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              {subtitle}
            </p>
          )}
          {actions && actions.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              {actions.map((a, i) => (
                <button key={i} onClick={a.onClick} style={{
                  fontSize: 'var(--text-sm)', padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: 'none',
                  background: a.primary ? 'var(--accent)' : 'var(--surface-hover)',
                  color: a.primary ? 'white' : 'var(--text-primary)',
                  fontWeight: a.primary ? '500' : '400'
                }}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={onDismiss} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 'var(--text-lg)', color: 'var(--text-faint)', padding: '0', lineHeight: 1, flexShrink: 0
        }}>×</button>
      </div>
    </div>
  )
}