#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_TRUNCATED_COUNT_CONTEXT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/CtrlOToExpand.tsx',
    bytes: 6062,
    sha256: 'ca9f783b8696b54d29b4ac66a61be9a41ba03a757e7fd4b715b937ff33eb37a2',
  }),
  Object.freeze({
    path: 'src/utils/stringUtils.ts',
    bytes: 6595,
    sha256: 'e191baf119909a210a9fb1b6f026dd36178eb04d4e05450689bd640ea8305f9c',
  }),
  Object.freeze({
    path: 'src/ink.ts',
    bytes: 3887,
    sha256: 'e2c0463ef56c61433441447197dd90f3dde4b4de7ee645b88cad17eadba9ac4e',
  }),
])

export const TARGET117_TRUNCATED_COUNT_RAW_CALLER_FILE = Object.freeze({
  path: 'src/components/FileEditToolUseRejectedMessage.tsx',
  bytes: 15126,
  sha256: '72afdbf7a020285fc7db24b4d5f5c765b22808423a0a38f940efce119fafce59',
})

export const TARGET117_TRUNCATED_COUNT_CALLER_POSTIMAGE = Object.freeze({
  path: 'src/components/FileEditToolUseRejectedMessage.tsx',
  bytes: 15147,
  sha256: '528c585d2a94e41baf734608bcbab0b615f2973be3774b0546c761082426393d',
})

export const TARGET117_TRUNCATED_COUNT_RECOVERED_FILE = Object.freeze({
  path: 'src/components/TruncatedCount.tsx',
  bytes: 681,
  sha256: 'd1cfad7aa51c6e23a2acbc26858c6d711b872d86380fdeed594e8caf05338672',
})

const TARGET_UNIT_EVIDENCE =
  'target117-truncated-count-complete-target-module-proof'
const CROSS_RELEASE_EVIDENCE =
  'target117-truncated-count-117-through-121-lineage-proof'
const SOURCE_REPLAY_EVIDENCE =
  'target117-truncated-count-source-replay-test'

export const TARGET117_TRUNCATED_COUNT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:8615`,
    targetIndex: 8615,
    paths: Object.freeze(['src/components/TruncatedCount.tsx']),
    declarations: Object.freeze(['TruncatedCount', 'formatTruncatedCount']),
    evidenceIds: Object.freeze([
      TARGET_UNIT_EVIDENCE,
      CROSS_RELEASE_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 renders a dimmed positive omitted-item count, defaults the unit to line, pluralizes it, and appends the Ctrl-O expansion affordance only when expandable is true.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:8616`,
    targetIndex: 8616,
    paths: Object.freeze(['src/components/TruncatedCount.tsx']),
    declarations: Object.freeze(['formatTruncatedCount']),
    evidenceIds: Object.freeze([
      TARGET_UNIT_EVIDENCE,
      CROSS_RELEASE_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 formats positive omitted-item counts as an ellipsis, plus sign, count, and singular-or-plural unit; non-positive counts format to the empty string.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:12828`,
    targetIndex: 12828,
    paths: Object.freeze([
      'src/components/FileEditToolUseRejectedMessage.tsx',
      'src/components/TruncatedCount.tsx',
    ]),
    declarations: Object.freeze([
      'FileEditToolUseRejectedMessage',
      'TruncatedCount',
    ]),
    evidenceIds: Object.freeze([
      TARGET_UNIT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 new-file rejection previews delegate their omitted-line footer to the shared truncated-count component, retaining the component null guard for non-positive counts.',
  }),
])

export const TARGET117_TRUNCATED_COUNT_SOURCE = [
  "import React from 'react'",
  "import { Text } from '../ink.js'",
  "import { plural } from '../utils/stringUtils.js'",
  "import { CtrlOToExpand } from './CtrlOToExpand.js'",
  '',
  'type Props = {',
  '  count: number',
  '  unit?: string',
  '  expandable?: boolean',
  '}',
  '',
  'export function TruncatedCount({',
  '  count,',
  "  unit = 'line',",
  '  expandable = false,',
  '}: Props): React.ReactNode {',
  '  if (count <= 0) return null',
  '',
  '  return (',
  '    <Text dimColor={true}>',
  '      {formatTruncatedCount(count, unit)}',
  "      {expandable && <> <CtrlOToExpand /></>}",
  '    </Text>',
  '  )',
  '}',
  '',
  'export function formatTruncatedCount(',
  '  count: number,',
  "  unit = 'line',",
  '): string {',
  "  if (count <= 0) return ''",
  '  return `\u2026 +${count} ${plural(count, unit)}`',
  '}',
  '',
].join('\n')

const CALLER_IMPORT_ANCHOR =
  "import { StructuredDiffList } from './StructuredDiffList.js'"
const CALLER_IMPORT_POSTIMAGE =
  "import { TruncatedCount } from './TruncatedCount.js'"
const CALLER_RENDER_ANCHOR =
  't9 = !verbose && plusLines > 0 && <Text dimColor={true}>… +{plusLines} lines</Text>;'
const CALLER_RENDER_POSTIMAGE =
  't9 = !verbose && <TruncatedCount count={plusLines} />;'

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

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected a normalized src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  return fs.readFileSync(filename)
}

function assertContext(sourceRoot) {
  for (const expected of TARGET117_TRUNCATED_COUNT_CONTEXT_FILES) {
    const filename = sourceFilename(sourceRoot, expected.path)
    if (!fs.existsSync(filename)) {
      throw new Error(`${expected.path}: required Target117 context is absent`)
    }
    const actual = descriptor(readRealFile(filename, expected.path))
    if (!descriptorsEqual(actual, expected)) {
      throw new Error(
        `${expected.path}: refusing non-Target117 context ${actual.bytes}/${actual.sha256}`,
      )
    }
  }
}

function classifyRecoveredFile(sourceRoot) {
  const expected = TARGET117_TRUNCATED_COUNT_RECOVERED_FILE
  const filename = sourceFilename(sourceRoot, expected.path)
  if (!fs.existsSync(filename)) return { filename, state: 'raw' }
  const actual = descriptor(readRealFile(filename, expected.path))
  if (descriptorsEqual(actual, expected)) {
    return { filename, state: 'postimage' }
  }
  throw new Error(
    `${expected.path}: expected absent or recovered ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
  )
}

function classifyCaller(sourceRoot) {
  const sourcePath = TARGET117_TRUNCATED_COUNT_RAW_CALLER_FILE.path
  const filename = sourceFilename(sourceRoot, sourcePath)
  const input = readRealFile(filename, sourcePath)
  const actual = descriptor(input)
  const source = input.toString('utf8')
  const rawRenderCount = occurrenceCount(source, CALLER_RENDER_ANCHOR)
  const postRenderCount = occurrenceCount(source, CALLER_RENDER_POSTIMAGE)
  const postImportCount = occurrenceCount(source, CALLER_IMPORT_POSTIMAGE)
  const importAnchorCount = occurrenceCount(source, CALLER_IMPORT_ANCHOR)
  if (importAnchorCount !== 1) {
    throw new Error(
      `${sourcePath}: expected one StructuredDiffList import anchor, got ${importAnchorCount}`,
    )
  }
  if (
    rawRenderCount === 1 &&
    postRenderCount === 0 &&
    postImportCount === 0 &&
    descriptorsEqual(actual, TARGET117_TRUNCATED_COUNT_RAW_CALLER_FILE)
  ) {
    return { filename, input, source, state: 'raw' }
  }
  if (
    rawRenderCount === 0 &&
    postRenderCount === 1 &&
    postImportCount === 1 &&
    descriptorsEqual(actual, TARGET117_TRUNCATED_COUNT_CALLER_POSTIMAGE)
  ) {
    return { filename, input, source, state: 'postimage' }
  }
  throw new Error(
    `${sourcePath}: refusing mixed or non-Target117 caller state raw=${rawRenderCount}, post=${postRenderCount}, import=${postImportCount}, descriptor=${actual.bytes}/${actual.sha256}`,
  )
}

function recoverCaller(caller) {
  let output = caller.source.replace(
    CALLER_IMPORT_ANCHOR,
    `${CALLER_IMPORT_ANCHOR}\n${CALLER_IMPORT_POSTIMAGE}`,
  )
  output = output.replace(CALLER_RENDER_ANCHOR, CALLER_RENDER_POSTIMAGE)
  const bytes = Buffer.from(output)
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, TARGET117_TRUNCATED_COUNT_CALLER_POSTIMAGE)) {
    throw new Error(
      `FileEditToolUseRejectedMessage replay drift: ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes
}

export function applyTarget117TruncatedCountSourceRecovery({ sourceRoot } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  assertContext(sourceRoot)

  const caller = classifyCaller(sourceRoot)
  const recovered = classifyRecoveredFile(sourceRoot)
  if (caller.state === 'postimage' && recovered.state === 'postimage') {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      files: Object.freeze([
        TARGET117_TRUNCATED_COUNT_CALLER_POSTIMAGE,
        TARGET117_TRUNCATED_COUNT_RECOVERED_FILE,
      ]),
      ownerOverrides: TARGET117_TRUNCATED_COUNT_OWNER_OVERRIDES.length,
    })
  }
  if (caller.state !== 'raw' || recovered.state !== 'raw') {
    throw new Error(
      `Refusing mixed truncated-count recovery: caller=${caller.state}, module=${recovered.state}`,
    )
  }

  const output = Buffer.from(TARGET117_TRUNCATED_COUNT_SOURCE)
  const actual = descriptor(output)
  if (!descriptorsEqual(actual, TARGET117_TRUNCATED_COUNT_RECOVERED_FILE)) {
    throw new Error(
      `TruncatedCount source replay drift: ${actual.bytes}/${actual.sha256}`,
    )
  }
  const callerOutput = recoverCaller(caller)

  fs.mkdirSync(path.dirname(recovered.filename), { recursive: true })
  fs.writeFileSync(recovered.filename, output, { flag: 'wx' })
  fs.writeFileSync(caller.filename, callerOutput)

  const written = descriptor(
    readRealFile(
      recovered.filename,
      TARGET117_TRUNCATED_COUNT_RECOVERED_FILE.path,
    ),
  )
  if (!descriptorsEqual(written, TARGET117_TRUNCATED_COUNT_RECOVERED_FILE)) {
    throw new Error(
      `Written TruncatedCount source mismatch ${written.bytes}/${written.sha256}`,
    )
  }
  if (classifyCaller(sourceRoot).state !== 'postimage') {
    throw new Error('Written truncated-count caller did not retain its postimage')
  }

  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    files: Object.freeze([
      TARGET117_TRUNCATED_COUNT_CALLER_POSTIMAGE,
      TARGET117_TRUNCATED_COUNT_RECOVERED_FILE,
    ]),
    ownerOverrides: TARGET117_TRUNCATED_COUNT_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117TruncatedCountSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
