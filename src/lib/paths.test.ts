import { describe, it, expect } from 'vitest'
import { prettyPath, baseName, parentPath } from './paths'

describe('prettyPath', () => {
  it('abbreviates a macOS home directory', () => {
    expect(prettyPath('/Users/nigelpurvis/Documents/Co Op Screenshots')).toBe(
      '~/Documents/Co Op Screenshots',
    )
  })

  it('abbreviates a Linux home directory', () => {
    expect(prettyPath('/home/nigel/pics')).toBe('~/pics')
  })

  it('leaves paths outside a home directory alone', () => {
    expect(prettyPath('/Volumes/External/shots')).toBe('/Volumes/External/shots')
  })

  it('does not mangle a directory merely named Users', () => {
    expect(prettyPath('/srv/Users/shared')).toBe('/srv/Users/shared')
  })
})

describe('baseName', () => {
  it('returns the final segment', () => {
    expect(baseName('/Users/nigelpurvis/Documents/Co Op Screenshots')).toBe('Co Op Screenshots')
  })

  it('ignores a trailing slash', () => {
    expect(baseName('/Users/nigelpurvis/Desktop/')).toBe('Desktop')
  })

  it('handles a bare filename', () => {
    expect(baseName('receipt.png')).toBe('receipt.png')
  })

  it('falls back to the path itself at the filesystem root', () => {
    expect(baseName('/')).toBe('/')
  })
})

describe('parentPath', () => {
  it('returns the abbreviated parent', () => {
    expect(parentPath('/Users/nigelpurvis/Documents/Co Op Screenshots')).toBe('~/Documents')
  })

  it('collapses to ~ when the parent is the home directory', () => {
    expect(parentPath('/Users/nigelpurvis/Desktop')).toBe('~')
  })

  it('reports the root for a top-level directory', () => {
    expect(parentPath('/Applications')).toBe('/')
  })
})
