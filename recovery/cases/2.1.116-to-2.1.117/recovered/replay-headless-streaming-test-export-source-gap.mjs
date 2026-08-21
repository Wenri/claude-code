#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_FILE = Object.freeze({
  path: 'src/cli/print.ts',
  bytes: 218976,
  sha256: 'e491160d1a4c417756b97fd921955d4af4007b851043381c83cc819beeafc690',
})

export const TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_POSTIMAGE =
  Object.freeze({
    path: 'src/cli/print.ts',
    bytes: 219044,
    sha256:
      '1b06b16d05e0688983254ef25ec5eeb1ae596e1ee8159aa8751a335e71ddb1e8',
  })

const TARGET_UNIT_EVIDENCE =
  'target117-headless-streaming-test-export-target-units'
const BASELINE_ABSENCE_EVIDENCE =
  'target116-headless-streaming-test-export-absence-test'
const SOURCE_REPLAY_EVIDENCE =
  'target117-headless-streaming-test-export-source-replay-test'

export const TARGET117_HEADLESS_STREAMING_TEST_EXPORT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20636`,
      targetIndex: 20636,
      paths: Object.freeze(['src/cli/print.ts']),
      declarations: Object.freeze([
        'runHeadlessStreaming',
        '_runHeadlessStreamingForTesting',
      ]),
      evidenceIds: Object.freeze([
        TARGET_UNIT_EVIDENCE,
        BASELINE_ABSENCE_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
      ]),
      behavior:
        'Target117 adds the _runHeadlessStreamingForTesting export-map property as an exact alias of the existing runHeadlessStreaming declaration; the bounded source replay restores that alias without admitting the separately unsupported streaming function body.',
    }),
  ])

const EXPORT_ALIAS =
  'export { runHeadlessStreaming as _runHeadlessStreamingForTesting }'
const EXPORTED_NAME = '_runHeadlessStreamingForTesting'
const STREAMING_DECLARATION = 'function runHeadlessStreaming('
const STREAMING_CALL = 'for await (const message of runHeadlessStreaming('

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
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

function classifySource(input) {
  const source = input.toString('utf8')
  const declarationCount = occurrenceCount(source, STREAMING_DECLARATION)
  const callCount = occurrenceCount(source, STREAMING_CALL)
  const aliasCount = occurrenceCount(source, EXPORT_ALIAS)
  const exportedNameCount = occurrenceCount(source, EXPORTED_NAME)
  if (
    declarationCount !== 1 ||
    callCount !== 1 ||
    aliasCount > 1 ||
    exportedNameCount !== aliasCount
  ) {
    throw new Error(
      `src/cli/print.ts: refusing non-target headless streaming context declarations=${declarationCount}, calls=${callCount}, aliases=${aliasCount}, exportedNames=${exportedNameCount}`,
    )
  }
  return { source, state: aliasCount === 0 ? 'raw' : 'postimage' }
}

export function applyTarget117HeadlessStreamingTestExportSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const sourcePath = TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_FILE.path
  const filename = sourceFilename(sourceRoot, sourcePath)
  const input = readRealFile(filename, sourcePath)
  const classified = classifySource(input)
  if (classified.state === 'postimage') {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      file: Object.freeze({ path: sourcePath, ...descriptor(input) }),
      ownerOverrides:
        TARGET117_HEADLESS_STREAMING_TEST_EXPORT_OWNER_OVERRIDES.length,
    })
  }

  const outputSource = classified.source.endsWith('\n')
    ? `${classified.source}\n${EXPORT_ALIAS}\n`
    : `${classified.source}\n\n${EXPORT_ALIAS}\n`
  const output = Buffer.from(outputSource)
  if (classifySource(output).state !== 'postimage') {
    throw new Error('src/cli/print.ts: local replay did not converge')
  }

  const inputDescriptor = descriptor(input)
  if (
    inputDescriptor.bytes === TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_FILE.bytes &&
    inputDescriptor.sha256 ===
      TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_FILE.sha256
  ) {
    const outputDescriptor = descriptor(output)
    if (
      outputDescriptor.bytes !==
        TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_POSTIMAGE.bytes ||
      outputDescriptor.sha256 !==
        TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_POSTIMAGE.sha256
    ) {
      throw new Error(
        `Raw Target117 export replay drift ${outputDescriptor.bytes}/${outputDescriptor.sha256}`,
      )
    }
  }

  fs.writeFileSync(filename, output)
  const written = readRealFile(filename, sourcePath)
  if (classifySource(written).state !== 'postimage') {
    throw new Error('Written src/cli/print.ts lost the test export postimage')
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    file: Object.freeze({ path: sourcePath, ...descriptor(written) }),
    ownerOverrides:
      TARGET117_HEADLESS_STREAMING_TEST_EXPORT_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117HeadlessStreamingTestExportSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
