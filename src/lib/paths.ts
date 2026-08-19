// Display helpers for filesystem paths.
//
// Absolute paths are long and full of characters that wrap badly. Showing a raw
// path in a narrow popover produces breaks mid-word ("…/Co Op Scr / eenshots"),
// so the UI shows the folder's own name on one line and an abbreviated parent
// beneath it, with the full path available on hover.

/** Replaces the user's home directory with `~` for display. */
export function prettyPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, '~')
}

/** The last segment of a path — a folder's or file's own name. */
export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const name = trimmed.slice(trimmed.lastIndexOf('/') + 1)
  return name || trimmed || path
}

/** Everything above the last segment, abbreviated for display. */
export function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const cut = trimmed.lastIndexOf('/')
  if (cut < 0) return '' // a bare name has no parent to show
  if (cut === 0) return '/' // the parent is the filesystem root
  return prettyPath(trimmed.slice(0, cut))
}
