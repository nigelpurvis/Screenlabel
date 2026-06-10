import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'
import * as yaml from 'js-yaml'

// A screenshot's note lives in a sidecar Markdown file next to the image:
//
//   receipt.png  ->  receipt.png.md
//
// The YAML frontmatter holds metadata (tags, folder, AI description). The body
// is the user's freeform note — the file they "write on". These files on disk
// are the source of truth; the search index is just a derived cache of them.

export interface Sidecar {
  frontmatter: Record<string, unknown>
  body: string
}

export function sidecarPath(imagePath: string): string {
  return `${imagePath}.md`
}

export function parseSidecar(raw: string): Sidecar {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: raw }
  const frontmatter = (yaml.load(match[1]) as Record<string, unknown>) ?? {}
  return { frontmatter, body: match[2] }
}

export function stringifySidecar(frontmatter: Record<string, unknown>, body: string): string {
  const fm = yaml.dump(frontmatter, { lineWidth: -1 }).trimEnd()
  return `---\n${fm}\n---\n\n${body.trimStart()}`
}

export async function readSidecar(imagePath: string): Promise<Sidecar | null> {
  const path = sidecarPath(imagePath)
  if (!(await exists(path))) return null
  return parseSidecar(await readTextFile(path))
}

export async function writeSidecar(
  imagePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<void> {
  await writeTextFile(sidecarPath(imagePath), stringifySidecar(frontmatter, body))
}
