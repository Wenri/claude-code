import { randomBytes, randomUUID } from 'crypto'
import { copyFile, readFile, rename, unlink, writeFile } from 'fs/promises'
import { basename, dirname, sep } from 'path'
import type { StructuredPatchHunk } from 'diff'
import { z } from 'zod/v4'
import { getIsRemoteMode } from '../bootstrap/state.js'
import { getDynamicConfig_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isPolicyAllowed } from '../services/policyLimits/index.js'
import { isENOENT, toError } from '../utils/errors.js'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { logForDebugging } from '../utils/debug.js'
import { getAutoMemEntrypoint, getAutoMemPath, isAutoMemoryEnabled } from './paths.js'

const MEMORY_ENTRYPOINT = 'MEMORY.md'
const CONFIG_NAME = 'tengu_slate_siskin'

export type MemoryWriteSurveyConfig = {
  enabled: boolean
  timeoutMs: number
  throttleMs: number
  summaryLineThreshold: number
}

const DEFAULT_CONFIG: MemoryWriteSurveyConfig = {
  enabled: false,
  timeoutMs: 8_000,
  throttleMs: 30_000,
  summaryLineThreshold: 5,
}

const configSchema = z
  .object({
    enabled: z.boolean(),
    timeoutMs: z.number().int().min(1_000).max(120_000),
    throttleMs: z.number().int().min(0).max(3_600_000),
    summaryLineThreshold: z.number().int().min(1).max(50),
  })
  .partial()

export type MemoryWriteSurveyRecord = {
  id: string
  filePath: string
  memoryType: string
  memoryName: string
  isEdit: boolean
  body: string
  afterContent: string
  beforeContent: string | null
  structuredPatch: StructuredPatchHunk[]
  capturedAt: number
}

export function getMemoryWriteSurveyConfig(): MemoryWriteSurveyConfig {
  const raw = getDynamicConfig_CACHED_MAY_BE_STALE(CONFIG_NAME, DEFAULT_CONFIG)
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    logForDebugging(
      `[memoryWriteSurvey] ${CONFIG_NAME} failed schema validation; using defaults: ${parsed.error.message}`,
    )
  }
  return { ...DEFAULT_CONFIG, ...(parsed.success ? parsed.data : {}) }
}

export function isMemoryWriteSurveyForced(): boolean {
  // Ant-only test override is eliminated from the external build.
  return false
}

export function isMemoryWriteSurveyEnabled(): boolean {
  if (isMemoryWriteSurveyForced()) return true
  return (
    getMemoryWriteSurveyConfig().enabled &&
    isAutoMemoryEnabled() &&
    !getIsRemoteMode() &&
    isPolicyAllowed('allow_product_feedback')
  )
}

export function captureMemoryWrite(
  context: { agentId?: string },
  write: {
    filePath: string
    afterContent: string
    beforeContent: string | null
    structuredPatch: StructuredPatchHunk[]
  },
): MemoryWriteSurveyRecord | null {
  if (context.agentId) return null
  if (!isMemoryWriteSurveyEnabled()) return null
  if (!isDirectAutoMemoryFile(write.filePath)) return null
  if (basename(write.filePath) === MEMORY_ENTRYPOINT) return null

  const { frontmatter, content } = parseFrontmatter(
    write.afterContent,
    write.filePath,
  )
  return {
    id: randomUUID(),
    filePath: write.filePath,
    memoryType: String(frontmatter.type ?? '?'),
    memoryName: String(
      frontmatter.name ?? basename(write.filePath).replace(/\.md$/, ''),
    ),
    isEdit: write.beforeContent !== null,
    body: content.trim(),
    afterContent: write.afterContent,
    beforeContent: write.beforeContent,
    structuredPatch: write.structuredPatch,
    capturedAt: Date.now(),
  }
}

export function removeMemoryWriteRecord(
  queue: readonly MemoryWriteSurveyRecord[],
  id: string,
): readonly MemoryWriteSurveyRecord[] {
  if (queue.length === 0) return queue
  const filtered = queue.filter(record => record.id !== id)
  return filtered.length === queue.length ? queue : filtered
}

export function countMemoryWriteLines(record: MemoryWriteSurveyRecord): number {
  if (record.isEdit) {
    let count = 0
    for (const hunk of record.structuredPatch) count += hunk.lines.length
    return count
  }
  return record.body === '' ? 0 : record.body.split('\n').length
}

export function describeMemoryWrite(record: MemoryWriteSurveyRecord): string {
  if (record.isEdit) {
    const lines = [`Edit to ${record.memoryName}:`]
    for (const hunk of record.structuredPatch) {
      lines.push(`@@ -${hunk.oldStart} +${hunk.newStart} @@`)
      lines.push(...hunk.lines)
    }
    return lines.join('\n')
  }
  return `New memory ${record.memoryName}:\n${record.body}`
}

export async function undoMemoryWrite(
  record: MemoryWriteSurveyRecord,
): Promise<void> {
  try {
    let current: string
    try {
      current = await readFile(record.filePath, 'utf8')
    } catch (error) {
      if (isENOENT(error)) return
      throw error
    }
    if (normalizeLineEndings(current) !== normalizeLineEndings(record.afterContent)) {
      logForDebugging(
        `[memoryWriteSurvey] skip undo for ${record.filePath}: changed since capture`,
      )
      return
    }
    if (record.isEdit && record.beforeContent !== null) {
      await atomicWriteUtf8(record.filePath, record.beforeContent)
      return
    }
    await unlink(record.filePath)
    await removeMemoryEntrypointLink(record.filePath)
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(
        `[memoryWriteSurvey] undo failed for ${record.filePath}: ${toError(error).message}`,
      )
    }
  }
}

function isDirectAutoMemoryFile(filePath: string): boolean {
  return dirname(filePath) + sep === getAutoMemPath()
}

function normalizeLineEndings(content: string): string {
  return content.includes('\r') ? content.replace(/\r\n/g, '\n') : content
}

function lineLinksToFile(line: string, filename: string): boolean {
  const match = line.match(/\]\((?:\.\/)?([^)]+)\)/)
  return match !== null && match[1] === filename
}

async function removeMemoryEntrypointLink(filePath: string): Promise<void> {
  const entrypoint = getAutoMemEntrypoint()
  let contents: string
  try {
    contents = await readFile(entrypoint, 'utf8')
  } catch (error) {
    if (isENOENT(error)) return
    throw error
  }
  const filename = basename(filePath)
  const lines = contents.split('\n')
  const filtered = lines.filter(line => !lineLinksToFile(line, filename))
  if (filtered.length === lines.length) return
  await atomicWriteUtf8(entrypoint, filtered.join('\n'))
}

async function atomicWriteUtf8(path: string, contents: string): Promise<void> {
  const temporary = `${path}.tmp.${randomBytes(4).toString('hex')}`
  try {
    await writeFile(temporary, contents, 'utf8')
    try {
      await rename(temporary, path)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (
        code === 'EXDEV' ||
        code === 'EPERM' ||
        code === 'EEXIST' ||
        code === 'EBUSY'
      ) {
        await copyFile(temporary, path)
        await unlink(temporary).catch(() => {})
      } else {
        throw error
      }
    }
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}
