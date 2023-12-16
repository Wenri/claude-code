#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_COWORK_MEMORY_ENTRYPOINT_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/utils/claudemd.ts',
    bytes: 46391,
    sha256:
      '538a13353c2333d462c2ba460176af23da2b6b5bf4c628567ca208633c70a81d',
  }),
])

export const TARGET121_COWORK_MEMORY_ENTRYPOINT_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/utils/claudemd.ts',
    bytes: 46492,
    sha256:
      '21db5542fa371e0d69e7e85dfbf81f8f185167d372d69e318f611eb9a9f01c64',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-cowork-memory-entrypoint-whole-unit-proof',
  'target121-cowork-memory-entrypoint-source-replay-test',
  'target121-cowork-memory-entrypoint-runtime-parity-test',
])

export const TARGET121_COWORK_MEMORY_ENTRYPOINT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:9209`,
      targetIndex: 9209,
      paths: Object.freeze(['src/utils/claudemd.ts']),
      declarations: Object.freeze(['getMemoryFiles']),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'getMemoryFiles retains the AutoMem feature gate and skips only its default MEMORY.md entrypoint read when CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT is truthy; every other memory source and completion path is unchanged.',
    }),
  ])

export const TARGET121_COWORK_MEMORY_ENTRYPOINT_EVIDENCE_IDS = EVIDENCE_IDS

const RAW_AUTOMEM_BLOCK = `    // Memdir entrypoint (memory.md) - only if feature is on and file exists
    if (isAutoMemoryEnabled()) {
      const { info: memdirEntry } = await safelyReadMemoryFileAsync(
        getAutoMemEntrypoint(),
        'AutoMem',
      )
      if (memdirEntry) {
        const normalizedPath = normalizePathForComparison(memdirEntry.path)
        if (!processedPaths.has(normalizedPath)) {
          processedPaths.add(normalizedPath)
          result.push(memdirEntry)
        }
      }
    }`

const RECOVERED_AUTOMEM_BLOCK = `    // Memdir entrypoint (memory.md) - only if feature is on and file exists
    if (isAutoMemoryEnabled()) {
      if (!process.env.CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT) {
        const { info: memdirEntry } = await safelyReadMemoryFileAsync(
          getAutoMemEntrypoint(),
          'AutoMem',
        )
        if (memdirEntry) {
          const normalizedPath = normalizePathForComparison(memdirEntry.path)
          if (!processedPaths.has(normalizedPath)) {
            processedPaths.add(normalizedPath)
            result.push(memdirEntry)
          }
        }
      }
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
  return source.split(needle).length - 1
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

export function buildTarget121CoworkMemoryEntrypointOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError('src/utils/claudemd.ts source must be a string')
  }
  return replaceExactlyOnce(
    source,
    RAW_AUTOMEM_BLOCK,
    RECOVERED_AUTOMEM_BLOCK,
    'AutoMem default-entrypoint block',
  )
}

export function applyTarget121CoworkMemoryEntrypointSourceRecovery({
  sourceRoot,
} = {}) {
  const input = TARGET121_COWORK_MEMORY_ENTRYPOINT_INPUT_FILES[0]
  const output = TARGET121_COWORK_MEMORY_ENTRYPOINT_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: Cowork memory entrypoint replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121CoworkMemoryEntrypointOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: Cowork memory entrypoint replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121CoworkMemoryEntrypointSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
