import { randomUUID } from 'crypto'
import { readFile, unlink } from 'fs/promises'
import { basename, dirname, sep } from 'path'
import type { StructuredPatchHunk } from 'diff'
import { z } from 'zod/v4'
import { getIsRemoteMode } from '../bootstrap/state.js'
import { stringWidth } from '../ink/stringWidth.js'
import { wrapAnsi } from '../ink/wrapAnsi.js'
import { getDynamicConfig_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isPolicyAllowed } from '../services/policyLimits/index.js'
import { isENOENT, toError } from '../utils/errors.js'
import { atomicWriteFile } from '../utils/atomicWrite.js'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { logForDebugging } from '../utils/debug.js'
import sliceAnsi from '../utils/sliceAnsi.js'
import { getAutoMemEntrypoint, getAutoMemPath, isAutoMemoryEnabled } from './paths.js'

const MEMORY_ENTRYPOINT = 'MEMORY.md'
const CONFIG_NAME = 'tengu_slate_siskin'
const DIFF_PREFIX_WIDTH = 6

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

function countDisplayRows(text: string, width: number): number {
  const unbounded = width <= 0 || !Number.isFinite(width)
  let rows = 0
  let offset = 0
  while (offset <= text.length) {
    const newline = text.indexOf('\n', offset)
    const line =
      newline === -1 ? text.substring(offset) : text.substring(offset, newline)
    if (unbounded) {
      rows++
    } else {
      const displayWidth = stringWidth(line)
      rows += displayWidth === 0 ? 1 : Math.ceil(displayWidth / width)
    }
    if (newline === -1) break
    offset = newline + 1
  }
  return rows
}

function getDiffContentWidth(width: number): number {
  return width > DIFF_PREFIX_WIDTH ? width - DIFF_PREFIX_WIDTH : width
}

function countHunkSeparators(hunks: readonly StructuredPatchHunk[]): number {
  return Math.max(0, hunks.length - 1)
}

export function countMemoryWriteLines(
  record: MemoryWriteSurveyRecord,
  width: number,
): number {
  if (record.isEdit) {
    const contentWidth = getDiffContentWidth(width)
    let rows = countHunkSeparators(record.structuredPatch)
    for (const hunk of record.structuredPatch) {
      rows += countDisplayRows(hunk.lines.join('\n'), contentWidth)
    }
    return rows
  }
  if (record.body === '') return 0
  return countDisplayRows(record.body, width)
}

export function truncateMemoryWriteContent(
  text: string,
  width: number,
  maxRows: number,
): { text: string; hiddenRows: number } {
  if (text === '') return { text: '', hiddenRows: 0 }
  if (maxRows <= 0) {
    return { text: '', hiddenRows: countDisplayRows(text, width) }
  }
  if (width <= 0) {
    const lines = text.split('\n')
    const visible = lines.slice(0, maxRows)
    return {
      text: visible.join('\n'),
      hiddenRows: lines.length - visible.length,
    }
  }
  if (countDisplayRows(text, width) <= maxRows) {
    return { text, hiddenRows: 0 }
  }

  const visibleRows: string[] = []
  let totalRows = 0
  for (const line of text.split('\n')) {
    if (visibleRows.length < maxRows) {
      const wrapped = wrapDisplayLine(line, width)
      totalRows += wrapped.length
      for (let i = 0; i < wrapped.length && visibleRows.length < maxRows; i++) {
        visibleRows.push(wrapped[i]!)
      }
    } else {
      totalRows += countDisplayRows(line, width)
    }
  }
  return {
    text: visibleRows.join('\n'),
    hiddenRows: totalRows - visibleRows.length,
  }
}

export function truncateMemoryWriteHunks(
  hunks: StructuredPatchHunk[],
  width: number,
  maxRows: number,
): { hunks: StructuredPatchHunk[]; hiddenRows: number } {
  const contentWidth = getDiffContentWidth(width)
  const separatorRows = countHunkSeparators(hunks)
  const countRows = (values: readonly StructuredPatchHunk[]): number => {
    let rows = 0
    for (const hunk of values) {
      rows += countDisplayRows(hunk.lines.join('\n'), contentWidth)
    }
    return rows
  }

  if (maxRows <= 0) {
    return { hunks: [], hiddenRows: countRows(hunks) + separatorRows }
  }
  const totalRows = countRows(hunks) + separatorRows
  if (totalRows <= maxRows) return { hunks, hiddenRows: 0 }

  const visibleHunks: StructuredPatchHunk[] = []
  let remainingRows = maxRows
  for (const hunk of hunks) {
    if (remainingRows <= 0) break
    if (visibleHunks.length > 0) {
      if (remainingRows <= 1) break
      remainingRows--
    }
    const lines: string[] = []
    for (const line of hunk.lines) {
      if (remainingRows <= 0) break
      const lineRows = countDisplayRows(line, contentWidth)
      if (lineRows <= remainingRows) {
        lines.push(line)
        remainingRows -= lineRows
        continue
      }
      lines.push(sliceAnsi(line, 0, remainingRows * contentWidth))
      remainingRows = 0
    }
    if (lines.length > 0) visibleHunks.push({ ...hunk, lines })
  }
  return { hunks: visibleHunks, hiddenRows: totalRows - maxRows }
}

function wrapDisplayLine(line: string, width: number): string[] {
  if (line === '') return ['']
  return wrapAnsi(line, width, {
    hard: true,
    wordWrap: false,
    trim: false,
  }).split('\n')
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
      await atomicWriteFile(record.filePath, record.beforeContent)
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
  await atomicWriteFile(entrypoint, filtered.join('\n'))
}
