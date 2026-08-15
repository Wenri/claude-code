import { readFile, stat, utimes, writeFile } from 'fs/promises'
import { getSessionId } from '../bootstrap/state.js'
import { getLocalISODate } from '../constants/common.js'
import { logForDebugging } from '../utils/debug.js'
import { FRONTMATTER_REGEX } from '../utils/frontmatterParser.js'
import { isAutoMemPath, isTinyMemoryEnabled } from './paths.js'
import { isTeamMemPath } from './teamMemPaths.js'

function isTinyMemoryFile(filePath: string): boolean {
  if (!filePath.endsWith('.md')) return false
  if (isTeamMemPath(filePath)) return false
  return isAutoMemPath(filePath)
}

function shouldStampRead(filePath: string): boolean {
  return isTinyMemoryEnabled() && isTinyMemoryFile(filePath)
}

async function updateFrontmatterPreservingMtime(
  filePath: string,
  update: (frontmatter: string) => string | null,
): Promise<boolean> {
  let content: string
  let mtime: Date
  try {
    mtime = (await stat(filePath)).mtime
    content = await readFile(filePath, 'utf8')
  } catch {
    return false
  }

  const match = FRONTMATTER_REGEX.exec(content)
  if (!match) return false
  const previous = match[1] ?? ''
  const next = update(previous)
  if (next === null || next === previous) return true

  const updated = `---\n${next}---\n${content.slice(match[0].length)}`
  try {
    await writeFile(filePath, updated, 'utf8')
    await utimes(filePath, new Date(), mtime)
    return true
  } catch (error) {
    logForDebugging(
      `tinyMemoryStamps: stamp failed for ${filePath}: ${String(error)}`,
    )
    return false
  }
}

/** Add write provenance to an auto-memory Markdown file before it hits disk. */
export function stampTinyMemoryWrite(
  filePath: string,
  content: string,
): string {
  if (!isTinyMemoryFile(filePath)) return content
  const match = FRONTMATTER_REGEX.exec(content)
  if (!match) return content

  const previous = match[1] ?? ''
  let next = previous
  if (isTinyMemoryEnabled() && !/^created:/m.test(next)) {
    next = `${next}created: ${getLocalISODate()}\n`
  }
  if (!/^originSessionId:/m.test(next)) {
    next = `${next}originSessionId: ${getSessionId()}\n`
  }
  if (next === previous) return content
  return `---\n${next}---\n${content.slice(match[0].length)}`
}

let stampReadImpl: (filePath: string) => Promise<void> = async () => {}

/** Initialize per-session read de-duplication for `last_read` stamps. */
export function initTinyMemoryStamps(): void {
  const lastStampedDate = new Map<string, string>()
  stampReadImpl = async filePath => {
    if (!shouldStampRead(filePath)) return
    const today = getLocalISODate()
    if (lastStampedDate.get(filePath) === today) return
    lastStampedDate.set(filePath, today)

    const stamped = await updateFrontmatterPreservingMtime(
      filePath,
      frontmatter => {
        const existing = frontmatter.match(
          /^last_read: (\d{4}-\d{2}-\d{2})$/m,
        )?.[1]
        if (existing === today) return null
        if (/^last_read:/m.test(frontmatter)) {
          return frontmatter.replace(
            /^last_read:.*$/m,
            `last_read: ${today}`,
          )
        }
        return `${frontmatter}last_read: ${today}\n`
      },
    )
    if (!stamped) lastStampedDate.delete(filePath)
  }
}

export async function stampTinyMemoryRead(filePath: string): Promise<void> {
  await stampReadImpl(filePath)
}
