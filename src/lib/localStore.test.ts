import { describe, it, expect, vi } from 'vitest'

// localStore reaches for Tauri's filesystem at import time, which doesn't exist
// outside the app. These tests cover the pure logic — how the log is read,
// written, and ranked — so the I/O layer is stubbed out and never called.
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(),
  join: vi.fn(),
}))

const { replay, serializeLog, serializePatch, countLines, shouldCompact, cosine } =
  await import('./localStore')

type Entry = Parameters<typeof serializeLog>[0][number]

function entry(path: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id: path,
    file: path.split('/').pop() ?? path,
    path,
    description: '',
    text: '',
    tags: [],
    folder: null,
    notes: '',
    embedding: [1, 0, 0],
    created: '2026-01-01',
    ingested: '2026-01-01',
    ...overrides,
  }
}

describe('replay', () => {
  it('keeps the last line written for a path', () => {
    // The whole correctness of the append-only log rests on this: an updated
    // entry is a new line, not an edit, so the newest one has to win.
    const log = [
      JSON.stringify(entry('/a.png', { notes: 'first' })),
      JSON.stringify(entry('/b.png')),
      JSON.stringify(entry('/a.png', { notes: 'second' })),
    ].join('\n')

    const entries = replay(log)

    expect(entries).toHaveLength(2)
    expect(entries.find((e) => e.path === '/a.png')?.notes).toBe('second')
  })

  it('skips a torn line without losing the rest of the index', () => {
    // A crash mid-append can leave a partial line. Losing that one entry is
    // acceptable; losing the entire library because of it is not.
    const log = [
      JSON.stringify(entry('/a.png')),
      '{"path":"/torn.png","descrip',
      JSON.stringify(entry('/b.png')),
    ].join('\n')

    expect(replay(log).map((e) => e.path)).toEqual(['/a.png', '/b.png'])
  })

  it('ignores blank lines and a trailing newline', () => {
    const log = `${JSON.stringify(entry('/a.png'))}\n\n`
    expect(replay(log)).toHaveLength(1)
  })

  it('returns nothing for an empty log', () => {
    expect(replay('')).toEqual([])
  })
})

describe('patch records', () => {
  it('applies a patch on top of the entry it follows', () => {
    const log =
      JSON.stringify(entry('/a.png', { notes: 'first draft' })) +
      '\n' +
      serializePatch('/a.png', { notes: 'revised' })

    const [result] = replay(log)
    expect(result.notes).toBe('revised')
  })

  it('leaves fields the patch does not mention alone', () => {
    // The whole point: a note edit must not disturb the embedding.
    const base = entry('/a.png', { tags: ['keep'], embedding: [0.5, 0.25, 0.125] })
    const log = JSON.stringify(base) + '\n' + serializePatch('/a.png', { notes: 'added' })

    const [result] = replay(log)
    expect(result.embedding).toEqual([0.5, 0.25, 0.125])
    expect(result.tags).toEqual(['keep'])
    expect(result.notes).toBe('added')
  })

  it('applies patches in order, last one winning', () => {
    const log =
      JSON.stringify(entry('/a.png')) +
      '\n' +
      serializePatch('/a.png', { notes: 'one' }) +
      serializePatch('/a.png', { notes: 'two' }) +
      serializePatch('/a.png', { notes: 'three' })

    expect(replay(log)[0].notes).toBe('three')
  })

  it('does not confuse patches for different paths', () => {
    const log =
      JSON.stringify(entry('/a.png')) +
      '\n' +
      JSON.stringify(entry('/b.png')) +
      '\n' +
      serializePatch('/b.png', { folder: 'Co-op' })

    const entries = replay(log)
    expect(entries.find((e) => e.path === '/a.png')?.folder).toBeNull()
    expect(entries.find((e) => e.path === '/b.png')?.folder).toBe('Co-op')
  })

  it('drops an orphan patch rather than storing a partial entry', () => {
    // Without a base there's no embedding, so the record is unusable. It must
    // not end up in the index as a half-built entry.
    const log = serializePatch('/gone.png', { notes: 'orphan' })
    expect(replay(log)).toEqual([])
  })

  it('is superseded by a later full entry', () => {
    // Re-ingesting recomputes the embedding, so the full entry wins outright.
    const log =
      JSON.stringify(entry('/a.png', { notes: 'old' })) +
      '\n' +
      serializePatch('/a.png', { notes: 'patched' }) +
      JSON.stringify(entry('/a.png', { notes: 'reingested' })) +
      '\n'

    expect(replay(log)[0].notes).toBe('reingested')
  })

  it('costs far less than a full entry', () => {
    // The reason this exists: a note save used to rewrite the whole embedding.
    const full = JSON.stringify(entry('/a.png', { embedding: Array(1536).fill(0.123456) }))
    const patch = serializePatch('/a.png', { notes: 'a short note' })
    expect(patch.length).toBeLessThan(full.length / 20)
  })
})

describe('serializeLog round trip', () => {
  it('survives compaction unchanged', () => {
    // Compaction rewrites the log from live entries. If serialize and replay
    // ever disagree, compaction silently eats data — so pin them together.
    const entries = [entry('/a.png', { notes: 'keep me' }), entry('/b.png', { tags: ['x'] })]

    expect(replay(serializeLog(entries))).toEqual(entries)
  })

  it('writes one line per entry', () => {
    const entries = [entry('/a.png'), entry('/b.png'), entry('/c.png')]
    expect(countLines(serializeLog(entries))).toBe(3)
  })
})

describe('shouldCompact', () => {
  it('leaves a freshly compacted log alone', () => {
    expect(shouldCompact(13, 13)).toBe(false)
  })

  it('does not thrash on a small library', () => {
    // Without the floor, a 2-entry library would compact after 5 edits.
    expect(shouldCompact(20, 2)).toBe(false)
  })

  it('compacts once dead weight outgrows the real data', () => {
    // 100 live entries tolerate 250 lines (2x plus the 50-line floor).
    expect(shouldCompact(250, 100)).toBe(false)
    expect(shouldCompact(251, 100)).toBe(true)
  })
})

describe('cosine', () => {
  it('scores identical vectors as 1', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })

  it('scores orthogonal vectors as 0', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('ignores magnitude, only direction', () => {
    // Embeddings aren't normalized, so a longer vector must not outrank a
    // better-aimed one.
    expect(cosine([1, 0], [5, 0])).toBeCloseTo(1)
  })

  it('scores opposing vectors as -1', () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('returns 0 for a zero vector instead of NaN', () => {
    // A NaN score would sort unpredictably and poison the whole result list.
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
})
