#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'
const SOURCE_PATH = 'src/components/DiagnosticsDisplay.tsx'

export const TARGET121_DIAGNOSTICS_HINT_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 13293,
    sha256:
      'c65601ba61913c24fd243485ff83ee7371b8a788034d03a2cd9c76b2c587cef2',
  }),
])

export const TARGET121_DIAGNOSTICS_HINT_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 13098,
    sha256:
      'd7ad8b70536e1df5254f3715215eba47e307a2292a1f20a9eb36952b0a9cd1e2',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-diagnostics-inline-expand-hint-whole-unit-proof',
  'target121-diagnostics-inline-expand-hint-source-replay-test',
  'target121-diagnostics-inline-expand-hint-runtime-parity-test',
])

export const TARGET121_DIAGNOSTICS_HINT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:12768`,
    targetIndex: 12768,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze(['DiagnosticsDisplay']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The compact diagnostics summary renders the literal " (ctrl+o to expand)" without a CtrlOToExpand component, uses a 13-slot compiler cache, and expands details when verbose or transcript mode is active.',
  }),
])

export const TARGET121_DIAGNOSTICS_HINT_EVIDENCE_IDS = EVIDENCE_IDS

const RAW_IMPORT =
  "import { CtrlOToExpand } from './CtrlOToExpand.js';\n"

const RAW_CACHE = '  const $ = _c(14);'
const RECOVERED_CACHE = '  const $ = _c(13);'

const RAW_SUMMARY = `    let t5;
    if ($[8] === Symbol.for("react.memo_cache_sentinel")) {
      t5 = <CtrlOToExpand />;
      $[8] = t5;
    } else {
      t5 = $[8];
    }
    let t6;
    if ($[9] !== fileCount || $[10] !== t2 || $[11] !== t3 || $[12] !== t4) {
      t6 = <MessageResponse><Text dimColor={true} wrap="wrap">Found {t2} new diagnostic{" "}{t3} in {fileCount}{" "}{t4} {t5}</Text></MessageResponse>;
      $[9] = fileCount;
      $[10] = t2;
      $[11] = t3;
      $[12] = t4;
      $[13] = t6;
    } else {
      t6 = $[13];
    }
    return t6;`

const RECOVERED_SUMMARY = `    let t5;
    if ($[8] !== fileCount || $[9] !== t2 || $[10] !== t3 || $[11] !== t4) {
      t5 = <MessageResponse><Text dimColor={true} wrap="wrap">Found {t2} new diagnostic{" "}{t3} in {fileCount}{" "}{t4} (ctrl+o to expand)</Text></MessageResponse>;
      $[8] = fileCount;
      $[9] = t2;
      $[10] = t3;
      $[11] = t4;
      $[12] = t5;
    } else {
      t5 = $[12];
    }
    return t5;`

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
  return source.replace(before, () => after)
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

export function buildTarget121DiagnosticsHintOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`${SOURCE_PATH} source must be a string`)
  }
  const withoutImport = replaceExactlyOnce(
    source,
    RAW_IMPORT,
    '',
    'CtrlOToExpand import',
  )
  const withCache = replaceExactlyOnce(
    withoutImport,
    RAW_CACHE,
    RECOVERED_CACHE,
    'DiagnosticsDisplay compiler-cache size',
  )
  return replaceExactlyOnce(
    withCache,
    RAW_SUMMARY,
    RECOVERED_SUMMARY,
    'DiagnosticsDisplay compact summary',
  )
}

export function applyTarget121DiagnosticsHintSourceRecovery({ sourceRoot } = {}) {
  const input = TARGET121_DIAGNOSTICS_HINT_INPUT_FILES[0]
  const output = TARGET121_DIAGNOSTICS_HINT_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: diagnostics hint replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121DiagnosticsHintOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: diagnostics hint replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121DiagnosticsHintSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
