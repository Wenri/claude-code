import { stat, readFile, writeFile, utimes } from 'fs/promises'
import { getSessionId } from '../bootstrap/state.js'
import { getLocalISODate } from '../constants/common.js'
import { logForDebugging } from '../utils/debug.js'
import { memoryScopeForPath } from '../utils/memoryFileDetection.js'
import { isTinyMemoryEnabled } from './paths.js'

const FRONTMATTER = /^---\s*\n([\s\S]*?)---\s*\n?/
const stampedToday = new Map<string, string>()

function isPersonalAutoMemoryFile(filePath: string): boolean {
  return filePath.endsWith('.md') && memoryScopeForPath(filePath) === 'personal'
}

/** Add metadata owned by Claude Code while preserving user frontmatter. */
export function prepareAutoMemoryContent(
  filePath: string,
  content: string,
): string {
  if (!isPersonalAutoMemoryFile(filePath)) return content
  const match = FRONTMATTER.exec(content)
  if (!match) return content

  const originalFrontmatter = match[1] ?? ''
  let frontmatter = originalFrontmatter
  if (isTinyMemoryEnabled() && !/^created:/m.test(frontmatter)) {
    frontmatter += `created: ${getLocalISODate()}\n`
  }
  if (!/^originSessionId:/m.test(frontmatter)) {
    frontmatter += `originSessionId: ${getSessionId()}\n`
  }
  if (frontmatter === originalFrontmatter) return content
  return `---\n${frontmatter}---\n${content.slice(match[0].length)}`
}

/** Record a tiny-memory read without changing the file's semantic mtime.
 * Failures are intentionally best-effort: recall must never fail because the
 * usage stamp could not be persisted. */
export async function markTinyMemoryRead(filePath: string): Promise<void> {
  if (
    !isTinyMemoryEnabled() ||
    !isPersonalAutoMemoryFile(filePath)
  ) {
    return
  }
  const today = getLocalISODate()
  if (stampedToday.get(filePath) === today) return
  stampedToday.set(filePath, today)

  try {
    const fileStat = await stat(filePath)
    const original = await readFile(filePath, 'utf8')
    const match = FRONTMATTER.exec(original)
    if (!match) {
      stampedToday.delete(filePath)
      return
    }
    const frontmatter = match[1] ?? ''
    const current = frontmatter.match(
      /^last_read: (\d{4}-\d{2}-\d{2})$/m,
    )?.[1]
    if (current === today) return
    const updated = /^last_read:/m.test(frontmatter)
      ? frontmatter.replace(/^last_read:.*$/m, `last_read: ${today}`)
      : `${frontmatter}last_read: ${today}\n`
    const output = `---\n${updated}---\n${original.slice(match[0].length)}`
    await writeFile(filePath, output, 'utf8')
    await utimes(filePath, new Date(), fileStat.mtime)
  } catch (error) {
    stampedToday.delete(filePath)
    logForDebugging(
      `[tinyMemoryStamps] stamp failed for ${filePath}: ${String(error)}`,
    )
  }
}
