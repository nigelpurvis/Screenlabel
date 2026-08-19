import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { hiddenMarkerRanges, activeLineNumbers } from './MarkdownEditor'

// Live preview lives or dies on this: hide the syntax markers everywhere except
// the line being edited. Get it wrong in one direction and formatting never
// appears; wrong in the other and you can't see what you're editing.

function stateFor(doc: string, cursor = 0) {
  return EditorState.create({
    doc,
    // Clamped so a test can say "cursor at the end" without counting characters.
    selection: { anchor: Math.min(cursor, doc.length) },
    extensions: [markdown({ base: markdownLanguage })],
  })
}

function hidden(doc: string, cursor = 0) {
  const state = stateFor(doc, cursor)
  return hiddenMarkerRanges(state, activeLineNumbers(state), [
    { from: 0, to: state.doc.length },
  ]).map(([from, to]) => state.doc.sliceString(from, to))
}

describe('hiddenMarkerRanges', () => {
  it('hides a heading marker and the space after it', () => {
    // Cursor parked on a later line, so the heading should render clean.
    expect(hidden('## Hello\n\ntext', 10)).toContain('## ')
  })

  it('reveals the marker on the line holding the cursor', () => {
    // Cursor inside the heading — the `##` has to come back so it's editable.
    expect(hidden('## Hello\n\ntext', 3)).toEqual([])
  })

  it('hides emphasis and strong markers', () => {
    const marks = hidden('some **bold** and *italic* words\n\nelsewhere', 100)
    expect(marks.filter((m) => m === '**')).toHaveLength(2)
    expect(marks.filter((m) => m === '*')).toHaveLength(2)
  })

  it('hides inline code backticks', () => {
    expect(hidden('run `npm test` now\n\nelsewhere', 100).filter((m) => m === '`')).toHaveLength(2)
  })

  it('leaves list bullets visible', () => {
    // A hidden bullet would make list items read as plain paragraphs.
    expect(hidden('- first\n- second', 100).join('')).not.toContain('-')
  })

  it('hides nothing in a document with no markup', () => {
    expect(hidden('just some plain prose', 100)).toEqual([])
  })

  it('handles each heading level', () => {
    expect(hidden('###### deep\n\nelsewhere', 100)).toContain('###### ')
  })

  it('only reveals the cursor line, not every heading', () => {
    const marks = hidden('## one\n\n## two', 2)
    // The second heading is still hidden even though the first is revealed.
    expect(marks).toEqual(['## '])
  })
})
