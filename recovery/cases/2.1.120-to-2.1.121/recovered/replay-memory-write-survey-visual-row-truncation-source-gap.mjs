#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MEMORY_WRITE_VISUAL_ROWS_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/memdir/memoryWriteSurvey.ts',
    bytes: 6969,
    sha256:
      '695f0ae48ee6a7cf1380e43849c5223794c626a56068de2f1754531a902c64df',
  }),
])

export const TARGET121_MEMORY_WRITE_VISUAL_ROWS_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/memdir/memoryWriteSurvey.ts',
    bytes: 10559,
    sha256:
      'fb263ccb96a6989423e4a0a52fbd311292eaaea3e06ed12a2311afe9878c99b1',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-memory-write-visual-row-target-unit-proof',
  'target121-memory-write-visual-row-source-replay-test',
  'target121-memory-write-visual-row-runtime-parity-test',
])

function ownerOverride(targetIndex, declarations, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze(['src/memdir/memoryWriteSurvey.ts']),
    declarations: Object.freeze(declarations),
    evidenceIds: EVIDENCE_IDS,
    behavior,
  })
}

export const TARGET121_MEMORY_WRITE_VISUAL_ROWS_OWNER_OVERRIDES =
  Object.freeze([
    ownerOverride(
      8762,
      ['truncateMemoryWriteText', 'countVisualRows', 'wrapLine'],
      'The memory-write survey truncates new-file text by rendered terminal rows, preserving hard ANSI-aware wrapping and reporting the exact hiddenRows count. The unrelated utils/permissions/pathValidation.ts attribution is rejected.',
    ),
    ownerOverride(
      8763,
      [
        'truncateMemoryWriteHunks',
        'countVisualRows',
        'getDiffContentWidth',
        'countHunkSeparators',
      ],
      'The memory-write survey truncates structured patch hunks by rendered rows after reserving the six-column diff gutter and inter-hunk separator rows, slices a partially visible line at the remaining display width, and reports exact hiddenRows. The unrelated utils/permissions/pathValidation.ts attribution is rejected.',
    ),
  ])

export const TARGET121_MEMORY_WRITE_VISUAL_ROWS_EVIDENCE_IDS = EVIDENCE_IDS

const ZOD_IMPORT = `import { z } from 'zod/v4'
`

const VISUAL_ROW_IMPORTS = `import { z } from 'zod/v4'
import { stringWidth } from '../ink/stringWidth.js'
import { wrapAnsi } from '../ink/wrapAnsi.js'
import sliceAnsi from '../utils/sliceAnsi.js'
`

const COUNT_MEMORY_WRITE_LINES = `export function countMemoryWriteLines(record: MemoryWriteSurveyRecord): number {
  if (record.isEdit) {
    let count = 0
    for (const hunk of record.structuredPatch) count += hunk.lines.length
    return count
  }
  return record.body === '' ? 0 : record.body.split('\\n').length
}`

const VISUAL_ROW_TRUNCATION_DECLARATIONS = `

const DIFF_GUTTER_WIDTH = 6

function countVisualRows(text: string, width: number): number {
  const unbounded = width <= 0 || !Number.isFinite(width)
  let rows = 0
  let start = 0
  while (start <= text.length) {
    const newline = text.indexOf('\\n', start)
    const line =
      newline === -1 ? text.substring(start) : text.substring(start, newline)
    if (unbounded) {
      rows++
    } else {
      const lineWidth = stringWidth(line)
      rows += lineWidth === 0 ? 1 : Math.ceil(lineWidth / width)
    }
    if (newline === -1) break
    start = newline + 1
  }
  return rows
}

function getDiffContentWidth(width: number): number {
  return width > DIFF_GUTTER_WIDTH ? width - DIFF_GUTTER_WIDTH : width
}

function countHunkSeparators(hunks: StructuredPatchHunk[]): number {
  return Math.max(0, hunks.length - 1)
}

export function truncateMemoryWriteText(
  text: string,
  width: number,
  maxRows: number,
): { text: string; hiddenRows: number } {
  if (text === '') return { text: '', hiddenRows: 0 }
  if (maxRows <= 0) return { text: '', hiddenRows: countVisualRows(text, width) }
  if (width <= 0) {
    const lines = text.split('\\n')
    const visible = lines.slice(0, maxRows)
    return {
      text: visible.join('\\n'),
      hiddenRows: lines.length - visible.length,
    }
  }
  if (countVisualRows(text, width) <= maxRows) {
    return { text, hiddenRows: 0 }
  }
  const visible: string[] = []
  let totalRows = 0
  for (const line of text.split('\\n')) {
    if (visible.length < maxRows) {
      const wrapped = wrapLine(line, width)
      totalRows += wrapped.length
      for (let i = 0; i < wrapped.length && visible.length < maxRows; i++) {
        visible.push(wrapped[i]!)
      }
    } else {
      totalRows += countVisualRows(line, width)
    }
  }
  return {
    text: visible.join('\\n'),
    hiddenRows: totalRows - visible.length,
  }
}

export function truncateMemoryWriteHunks(
  hunks: StructuredPatchHunk[],
  width: number,
  maxRows: number,
): { hunks: StructuredPatchHunk[]; hiddenRows: number } {
  const contentWidth = getDiffContentWidth(width)
  const separators = countHunkSeparators(hunks)
  const countRows = (values: StructuredPatchHunk[]): number => {
    let count = 0
    for (const hunk of values) {
      count += countVisualRows(hunk.lines.join('\\n'), contentWidth)
    }
    return count
  }
  if (maxRows <= 0) {
    return { hunks: [], hiddenRows: countRows(hunks) + separators }
  }
  const totalRows = countRows(hunks) + separators
  if (totalRows <= maxRows) return { hunks, hiddenRows: 0 }
  const visible: StructuredPatchHunk[] = []
  let remaining = maxRows
  for (const hunk of hunks) {
    if (remaining <= 0) break
    if (visible.length > 0) {
      if (remaining <= 1) break
      remaining--
    }
    const lines: string[] = []
    for (const line of hunk.lines) {
      if (remaining <= 0) break
      const rows = countVisualRows(line, contentWidth)
      if (rows <= remaining) {
        lines.push(line)
        remaining -= rows
        continue
      }
      lines.push(sliceAnsi(line, 0, remaining * contentWidth))
      remaining = 0
    }
    if (lines.length > 0) visible.push({ ...hunk, lines })
  }
  return { hunks: visible, hiddenRows: totalRows - maxRows }
}

function wrapLine(line: string, width: number): string[] {
  if (line === '') return ['']
  return wrapAnsi(line, width, { hard: true, wordWrap: false, trim: false }).split(
    '\\n',
  )
}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function occurrenceCount(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
}

function replaceExactlyOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) {
    throw new Error(`${CASE_NAME}: ${label} expected one anchor, got ${count}`)
  }
  return source.replace(before, after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const root = fs.realpathSync(path.resolve(sourceRoot))
  const filename = path.resolve(root, sourcePath.replace(/^src\//, ''))
  const relative = path.relative(root, filename)
  if (
    !sourcePath.startsWith('src/') ||
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  if (fs.realpathSync(filename) !== filename) {
    throw new Error(`${sourcePath}: source path resolves through a symlink`)
  }
  return fs.readFileSync(filename)
}

export function buildTarget121MemoryWriteVisualRowsOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError('src/memdir/memoryWriteSurvey.ts source must be a string')
  }
  const withImports = replaceExactlyOnce(
    source,
    ZOD_IMPORT,
    VISUAL_ROW_IMPORTS,
    'visual-row imports',
  )
  return replaceExactlyOnce(
    withImports,
    COUNT_MEMORY_WRITE_LINES,
    COUNT_MEMORY_WRITE_LINES + VISUAL_ROW_TRUNCATION_DECLARATIONS,
    'visual-row declarations',
  )
}

export function applyTarget121MemoryWriteVisualRowsSourceRecovery({
  sourceRoot,
} = {}) {
  const input = TARGET121_MEMORY_WRITE_VISUAL_ROWS_INPUT_FILES[0]
  const output = TARGET121_MEMORY_WRITE_VISUAL_ROWS_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: memory-write visual-row replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121MemoryWriteVisualRowsOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: memory-write visual-row replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121MemoryWriteVisualRowsSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
