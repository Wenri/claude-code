/**
 * Memory-directory scanning primitives. Split out of findRelevantMemories.ts
 * so extractMemories can import the scan without pulling in sideQuery and
 * the API-client chain (which closed a cycle through memdir.ts — #25372).
 */

import { readdir } from 'fs/promises'
import { basename, join } from 'path'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { readFileInRange } from '../utils/readFileInRange.js'
import { type MemoryType, parseMemoryType } from './memoryTypes.js'
import { isTinyMemoryEnabled } from './paths.js'

export type MemoryHeader = {
  filename: string
  filePath: string
  mtimeMs: number
  description: string | null
  type: MemoryType | undefined
  created: string | null
  last_read: string | null
  content: string | null
}

const MAX_MEMORY_FILES = 200
const FRONTMATTER_MAX_LINES = 30
const MAX_TINY_MEMORY_FILES = 500
const TINY_FRONTMATTER_MAX_LINES = 200

function parseCreatedDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = new Date(year, month - 1, day).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

/**
 * Scan a memory directory for .md files, read their frontmatter, and return
 * a header list sorted newest-first (capped at MAX_MEMORY_FILES). Shared by
 * findRelevantMemories (query-time recall) and extractMemories (pre-injects
 * the listing so the extraction agent doesn't spend a turn on `ls`).
 *
 * Single-pass: readFileInRange stats internally and returns mtimeMs, so we
 * read-then-sort rather than stat-sort-read. For the common case (N ≤ 200)
 * this halves syscalls vs a separate stat round; for large N we read a few
 * extra small files but still avoid the double-stat on the surviving 200.
 */
export async function scanMemoryFiles(
  memoryDir: string,
  signal: AbortSignal,
): Promise<MemoryHeader[]> {
  const tiny = isTinyMemoryEnabled()
  const maxLines = tiny ? TINY_FRONTMATTER_MAX_LINES : FRONTMATTER_MAX_LINES
  try {
    const entries = await readdir(memoryDir, { recursive: true })
    const mdFiles = entries.filter(
      f => f.endsWith('.md') && basename(f) !== 'MEMORY.md',
    )

    const headerResults = await Promise.allSettled(
      mdFiles.map(async (relativePath): Promise<MemoryHeader> => {
        const filePath = join(memoryDir, relativePath)
        const { content, mtimeMs } = await readFileInRange(
          filePath,
          0,
          maxLines,
          undefined,
          signal,
        )
        const { frontmatter, content: body } = parseFrontmatter(
          content,
          filePath,
        )
        const effectiveMtime =
          (tiny ? parseCreatedDate(frontmatter.created) : null) ?? mtimeMs
        return {
          filename: relativePath,
          filePath,
          mtimeMs: effectiveMtime,
          description: frontmatter.description || null,
          type: parseMemoryType(frontmatter.type),
          created:
            typeof frontmatter.created === 'string'
              ? frontmatter.created
              : null,
          last_read:
            typeof frontmatter.last_read === 'string'
              ? frontmatter.last_read
              : null,
          content: tiny ? body.trim() || null : null,
        }
      }),
    )

    return headerResults
      .filter(
        (r): r is PromiseFulfilledResult<MemoryHeader> =>
          r.status === 'fulfilled',
      )
      .map(r => r.value)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, tiny ? MAX_TINY_MEMORY_FILES : MAX_MEMORY_FILES)
  } catch {
    return []
  }
}

/**
 * Format memory headers as a text manifest: one line per file with
 * [type] filename (timestamp): description. Used by both the recall
 * selector prompt and the extraction-agent prompt.
 */
export function formatMemoryManifest(memories: MemoryHeader[]): string {
  return memories
    .map(m => {
      const tag = m.type ? `[${m.type}] ` : ''
      const ts = new Date(m.mtimeMs).toISOString()
      const prefix = `- ${tag}${m.filename} (${ts})`
      if (m.content !== null) {
        return `${prefix}\n  ${m.content.replace(/\n/g, '\n  ')}`
      }
      return m.description
        ? `${prefix}: ${m.description}`
        : prefix
    })
    .join('\n')
}
