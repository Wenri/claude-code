#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'
const CLI_PATH = 'src/entrypoints/cli.tsx'
const BRIDGE_ENABLED_PATH = 'src/bridge/bridgeEnabled.ts'

function freezeDescriptor(value) {
  return Object.freeze({ ...value })
}

export const TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION = Object.freeze({
  input: freezeDescriptor({
    path: CLI_PATH,
    bytes: 39275,
    sha256:
      '87d4d49ed7512cf225d074e8f41aa3fb2f69eed19b9199e7eb30ddfd252a324f',
  }),
  output: freezeDescriptor({
    path: CLI_PATH,
    bytes: 39359,
    sha256:
      'a158efe219ad152b18a06130fab6475458a7680fe456647078e57dc6fd29f698',
  }),
})

export const TARGET117_CLI_BRIDGE_AUTH_DEBUG_DEPENDENCY = freezeDescriptor({
  path: BRIDGE_ENABLED_PATH,
  bytes: 10168,
  sha256:
    'aa352b48b4a1f0807afc7c321f4066a941d5560b5bf57efabde15ce52791eab7',
})

export const TARGET117_CLI_BRIDGE_AUTH_DEBUG_EVIDENCE_IDS = Object.freeze([
  'target117-cli-bridge-auth-debug-authenticated-whole-unit-proof',
  'target117-cli-bridge-auth-debug-exact-dependency-proof',
  'target117-cli-bridge-auth-debug-source-replay-test',
  'target117-cli-respawn-dead-dce-paired-proof',
])

export const TARGET117_CLI_BRIDGE_AUTH_DEBUG_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20797`,
    targetIndex: 20797,
    paths: Object.freeze([CLI_PATH, BRIDGE_ENABLED_PATH]),
    declarations: Object.freeze(['main', 'getBridgeAuthDebugInfo']),
    evidenceIds: TARGET117_CLI_BRIDGE_AUTH_DEBUG_EVIDENCE_IDS,
    behavior:
      'Target117 main dynamically loads getBridgeAuthDebugInfo and appends its diagnostic suffix to both bridge-auth exits. The bounded replay is compile-closed against the exact retained bridgeEnabled dependency; the separate dead respawn switch case is admitted only by the paired whole-unit proof.',
  }),
])

const RAW_IMPORT = `    const {
      getBridgeDisabledReason,
      checkBridgeMinVersion
    } = await import('../bridge/bridgeEnabled.js');`
const RECOVERED_IMPORT = `    const {
      getBridgeDisabledReason,
      checkBridgeMinVersion,
      getBridgeAuthDebugInfo
    } = await import('../bridge/bridgeEnabled.js');`
const RAW_LOGIN_EXIT = '      exitWithError(BRIDGE_LOGIN_ERROR);'
const RECOVERED_LOGIN_EXIT =
  '      exitWithError(BRIDGE_LOGIN_ERROR + getBridgeAuthDebugInfo());'
const RAW_DISABLED_EXIT = '      exitWithError(`Error: ${disabledReason}`);'
const RECOVERED_DISABLED_EXIT =
  '      exitWithError(`Error: ${disabledReason}` + getBridgeAuthDebugInfo());'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected a normalized src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes supplied source root`)
  }
  return filename
}

function readRealFile(sourceRoot, sourcePath) {
  const filename = sourceFilename(sourceRoot, sourcePath)
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  return { filename, mode: status.mode, bytes: fs.readFileSync(filename) }
}

function assertDescriptor(bytes, expected, label) {
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, expected)) {
    throw new Error(
      `${label}: expected ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
    )
  }
}

function occurrenceCount(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count += 1
    offset += needle.length
  }
  return count
}

function replaceExactlyOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one input anchor, got ${count}`)
  }
  return source.replace(before, after)
}

function recoverCli(source) {
  let output = replaceExactlyOnce(
    source,
    RAW_IMPORT,
    RECOVERED_IMPORT,
    'bridgeEnabled dynamic import',
  )
  output = replaceExactlyOnce(
    output,
    RAW_LOGIN_EXIT,
    RECOVERED_LOGIN_EXIT,
    'bridge login error',
  )
  return replaceExactlyOnce(
    output,
    RAW_DISABLED_EXIT,
    RECOVERED_DISABLED_EXIT,
    'bridge disabled error',
  )
}

function writeAtomically(filename, bytes, mode) {
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.target117-bridge-auth-${process.pid}.tmp`,
  )
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode })
    fs.renameSync(temporary, filename)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

export function applyTarget117CliBridgeAuthDebugSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')

  const cli = readRealFile(sourceRoot, CLI_PATH)
  const dependency = readRealFile(sourceRoot, BRIDGE_ENABLED_PATH)
  assertDescriptor(
    dependency.bytes,
    TARGET117_CLI_BRIDGE_AUTH_DEBUG_DEPENDENCY,
    'bridgeEnabled dependency',
  )

  const cliIdentity = descriptor(cli.bytes)
  if (
    descriptorsEqual(
      cliIdentity,
      TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION.output,
    )
  ) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      files: Object.freeze([
        TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION.output,
        TARGET117_CLI_BRIDGE_AUTH_DEBUG_DEPENDENCY,
      ]),
      ownerOverrides:
        TARGET117_CLI_BRIDGE_AUTH_DEBUG_OWNER_OVERRIDES.length,
    })
  }
  if (
    !descriptorsEqual(
      cliIdentity,
      TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION.input,
    )
  ) {
    throw new Error(
      `Refusing to recover non-target cli.tsx: got ${cliIdentity.bytes}/${cliIdentity.sha256}`,
    )
  }

  const output = Buffer.from(recoverCli(cli.bytes.toString('utf8')))
  assertDescriptor(
    output,
    TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION.output,
    'recovered cli.tsx',
  )
  writeAtomically(cli.filename, output, cli.mode)
  assertDescriptor(
    fs.readFileSync(cli.filename),
    TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION.output,
    'written cli.tsx',
  )

  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    files: Object.freeze([
      TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION.output,
      TARGET117_CLI_BRIDGE_AUTH_DEBUG_DEPENDENCY,
    ]),
    ownerOverrides: TARGET117_CLI_BRIDGE_AUTH_DEBUG_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117CliBridgeAuthDebugSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
