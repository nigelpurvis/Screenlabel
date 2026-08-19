import { useEffect, useRef } from 'react'
import { EditorView, keymap, ViewPlugin, Decoration, placeholder } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxTree, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { tags } from '@lezer/highlight'

// Live-preview Markdown editing, the way Obsidian does it: you type real
// Markdown, and it styles itself as you go — no separate preview mode.
//
// Two pieces make that work. Syntax highlighting sizes headings and styles
// emphasis, code, and links. Then a decoration plugin hides the syntax markers
// (`##`, `**`, `` ` ``) on every line except the one holding the cursor, so the
// text reads as formatted prose while staying editable plain text. Put the
// cursor on a heading and its `##` reappears so you can change it.

// Markers worth hiding once the cursor leaves the line. Deliberately excludes
// list bullets — a hidden `-` would make list items look like plain paragraphs.
const HIDDEN_MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrongMark',
  'CodeMark',
  'LinkMark',
  'QuoteMark',
])

const markerHiding = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      // Selection changes matter as much as edits here: moving the cursor onto a
      // line is what reveals that line's markers.
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/**
 * The ranges of Markdown syntax to hide, given a document and which lines the
 * cursor is on. Separate from the view so it can be tested without a DOM.
 */
export function hiddenMarkerRanges(
  state: EditorState,
  activeLines: Set<number>,
  ranges: readonly { from: number; to: number }[],
): Array<[number, number]> {
  const found: Array<[number, number]> = []

  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (!HIDDEN_MARKS.has(node.name)) return
        if (activeLines.has(state.doc.lineAt(node.from).number)) return

        // A heading's `##` is followed by a space that would otherwise be left
        // behind as a stray indent, so swallow it too.
        let end = node.to
        if (node.name === 'HeaderMark' && state.doc.sliceString(end, end + 1) === ' ') {
          end += 1
        }
        found.push([node.from, end])
      },
    })
  }

  return found
}

/** The lines the cursor or selection currently touches. */
export function activeLineNumbers(state: EditorState): Set<number> {
  return new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number))
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const marks = hiddenMarkerRanges(
    view.state,
    activeLineNumbers(view.state),
    view.visibleRanges,
  )

  for (const [from, to] of marks) {
    builder.add(from, to, Decoration.replace({}))
  }

  return builder.finish()
}

// Sizes are in `em` so the whole editor scales with the container's font-size,
// which is what the S/M/L control adjusts.
const markdownHighlighting = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.5em', fontWeight: '500', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.3em', fontWeight: '500', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.12em', fontWeight: '500' },
  { tag: tags.heading4, fontWeight: '500', color: 'var(--text-secondary)' },
  { tag: tags.strong, fontWeight: '500' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--accent)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.92em' },
  { tag: tags.quote, color: 'var(--text-secondary)' },
  { tag: tags.processingInstruction, color: 'var(--text-faint)' },
])

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 'inherit',
  },
  '.cm-content': {
    padding: 0,
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    caretColor: 'var(--text-primary)',
  },
  '.cm-line': { padding: 0 },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'inherit', overflow: 'visible' },
  '.cm-placeholder': { color: 'var(--text-faint)' },
  '.cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-subtle)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-subtle)' },
  '.cm-blockquote': { color: 'var(--text-secondary)' },
})

interface Props {
  value: string
  onChange: (value: string) => void
  placeholderText?: string
}

export function MarkdownEditor({ value, onChange, placeholderText }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Kept in a ref so the update listener never closes over a stale handler,
  // while the editor itself is created exactly once.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage, addKeymap: false }),
          syntaxHighlighting(markdownHighlighting),
          markerHiding,
          editorTheme,
          EditorView.lineWrapping,
          placeholder(placeholderText ?? ''),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      }),
    })

    view.current = editor
    editor.focus()

    return () => {
      editor.destroy()
      view.current = null
    }
    // Created once; later value changes are pushed in through the effect below.
  }, [])

  // Accept programmatic value changes (switching to another screenshot's note)
  // without clobbering what the user is currently typing.
  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const current = editor.state.doc.toString()
    if (current === value) return
    editor.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  return <div ref={host} />
}
