import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { saveNotes } from '../lib/folders'

// CodeMirror is around half a megabyte of JavaScript. Loading it only when a
// note is actually opened keeps it out of the startup parse, which the whole app
// otherwise waits on before painting anything.
const MarkdownEditor = lazy(() =>
  import('./MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })),
)

interface Screenshot {
  id: string
  filename: string
  description: string
  notes?: string
}

interface Props {
  screenshot: Screenshot
  imageSrc?: string
  onClose: () => void
  onSaved: () => void
}

// The full-screen writing surface. The sidecar .md file is the artifact this app
// exists to build, so editing it gets the whole window rather than a corner of a
// side panel.
//
// There is no save button on purpose. A save button makes writing feel like
// filing a form; autosaving on a short idle delay is what makes Obsidian and
// Notion feel frictionless. Anything typed is flushed on close too, so leaving
// the page can't lose work.
const SAVE_DELAY_MS = 600

// Reading comfort is personal and depends on the display, so it's a setting
// rather than a number picked here. Headings are sized in `em`, so they scale
// with whichever of these is active.
const TEXT_SIZES = [
  { label: 'S', px: 13, lineHeight: 1.6 },
  { label: 'M', px: 15, lineHeight: 1.65 },
  { label: 'L', px: 17, lineHeight: 1.7 },
] as const

const SIZE_KEY = 'screenlabel.noteTextSize'

export function NoteScreen({ screenshot, imageSrc, onClose, onSaved }: Props) {
  const [notes, setNotes] = useState(screenshot.notes ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showDescription, setShowDescription] = useState(false)
  const [sizeIndex, setSizeIndex] = useState(() => {
    const stored = Number(localStorage.getItem(SIZE_KEY))
    return Number.isInteger(stored) && TEXT_SIZES[stored] ? stored : 1
  })

  const size = TEXT_SIZES[sizeIndex]

  function chooseSize(index: number) {
    setSizeIndex(index)
    localStorage.setItem(SIZE_KEY, String(index))
  }

  // Holds the newest unsaved edit. A ref rather than state so the flush on
  // close always sees the latest text, even mid-keystroke.
  const pending = useRef<string | null>(null)

  async function flush() {
    const text = pending.current
    if (text === null) return
    pending.current = null
    await saveNotes(screenshot.id, text)
    onSaved()
  }

  // Debounced autosave.
  useEffect(() => {
    if (pending.current === null) return
    setState('saving')
    const timer = setTimeout(() => {
      flush().then(() => setState('saved'))
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [notes])

  // Flush whatever is outstanding when this screen goes away, so closing during
  // the debounce window doesn't drop the last thing typed.
  useEffect(() => () => { void flush() }, [])

  function handleClose() {
    void flush()
    onClose()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2500, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-5)',
        borderBottom: '0.5px solid var(--border)', flexShrink: 0
      }}>
        <button
          onClick={handleClose}
          title="Back to library (Esc)"
          aria-label="Back to library"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', padding: 'var(--space-1)',
            color: 'var(--text-secondary)', cursor: 'pointer',
            fontSize: 'var(--text-sm)'
          }}
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Library
        </button>

        <p style={{
          margin: 0, flex: 1, minWidth: 0, fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {screenshot.filename}
        </p>

        <span style={{
          fontSize: 'var(--text-xs)', flexShrink: 0,
          color: state === 'saved' ? 'var(--success)' : 'var(--text-muted)',
          opacity: state === 'idle' ? 0 : 1, transition: 'opacity 0.2s'
        }}>
          {state === 'saving' ? 'Saving…' : 'Saved'}
        </span>

        {/* Text size, like Obsidian's appearance setting. */}
        <div
          role="group"
          aria-label="Text size"
          style={{
            display: 'flex', flexShrink: 0, padding: '2px', gap: '2px',
            background: 'var(--surface)', borderRadius: 'var(--radius)',
            border: '0.5px solid var(--border)'
          }}
        >
          {TEXT_SIZES.map((option, index) => (
            <button
              key={option.label}
              onClick={() => chooseSize(index)}
              title={`${option.px}px`}
              style={{
                border: 'none', cursor: 'pointer', padding: '4px 8px',
                borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)',
                background: sizeIndex === index ? 'var(--bg)' : 'transparent',
                color: sizeIndex === index ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: sizeIndex === index ? 'var(--shadow-sm)' : 'none'
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

      </div>

      {/* Writing surface */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{
          maxWidth: '720px', margin: '0 auto',
          padding: 'var(--space-5) var(--space-5) var(--space-6)'
        }}>
          {imageSrc && (
            <img
              src={imageSrc}
              alt={screenshot.filename}
              style={{
                display: 'block', width: '100%', maxHeight: '300px',
                objectFit: 'contain', objectPosition: 'left',
                borderRadius: 'var(--radius-lg)',
                border: '0.5px solid var(--border)',
                background: 'var(--surface)', marginBottom: 'var(--space-4)'
              }}
            />
          )}

          {screenshot.description && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <button
                onClick={() => setShowDescription(v => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: 'none', border: 'none', padding: 0,
                  fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  cursor: 'pointer'
                }}
              >
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    transform: showDescription ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.12s'
                  }}
                  aria-hidden="true"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                What this shows
              </button>
              {showDescription && (
                <p style={{
                  margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)', lineHeight: 1.7
                }}>
                  {screenshot.description}
                </p>
              )}
            </div>
          )}

          {/* The note itself: no border, no chrome, nothing between you and the
              text. Grows with its content so there's no inner scrollbar.
              Write and Preview share a type size and line height so toggling
              doesn't make the text jump. */}
          <div style={{
            fontSize: `${size.px}px`, lineHeight: size.lineHeight,
            minHeight: '45vh'
          }}>
            <Suspense
              fallback={
                <p style={{ margin: 0, color: 'var(--text-faint)' }}>
                  {notes || 'Start writing…'}
                </p>
              }
            >
              <MarkdownEditor
                value={notes}
                onChange={next => {
                  pending.current = next
                  setNotes(next)
                }}
                placeholderText="Start writing… Markdown works: ## headings, - lists, **bold**"
              />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
