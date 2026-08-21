#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url))

function freezeFile(file) {
  return Object.freeze({ ...file })
}

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    declarations: Object.freeze([...override.declarations]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_PATCH_INPUT = freezeFile({
  path:
    'recovery/cases/2.1.117-to-2.1.118/recovered/source-facing-overlay.patch',
  bytes: 3865180,
  sha256:
    'fc47a3190c81fc255b9e497af3cb95eb97ef6371ea359fb4c12a7e16f82500d4',
})

export const TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_INPUT_FILE = freezeFile({
  path: 'src/state/AppStateStore.ts',
  bytes: 22272,
  sha256:
    '275dd622759dc9ffff5d52e2e6d1c75cef06c8cce481ea0d3515613d4e6a424a',
})

export const TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OUTPUT_FILE = freezeFile({
  path: 'src/state/AppStateStore.ts',
  bytes: 22420,
  sha256:
    '1b1003645c0800d6effbf3fb0dbcb0708486672e58cee79dc43d7b485471c67a',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-repl-bridge-skip-archive-target-fragment'
const REPLAY_EVIDENCE =
  'target117-repl-bridge-skip-archive-source-replay-test'

export const TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OWNER_OVERRIDES = Object.freeze([
  freezeOverride({
    key: `${CASE_NAME}:10966`,
    targetIndex: 10966,
    paths: ['src/state/AppStateStore.ts'],
    declarations: ['getDefaultAppState'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The bounded AppStateStore recovery restores the Target117 one-shot bridge teardown flag and its false default; it does not assign the unit to the later useReplBridge text occurrence.',
  }),
])

const TYPE_INPUT = `  replBridgeInitialName: string | undefined
  // Always-on bridge: first-time remote dialog pending`
const TYPE_OUTPUT = `  replBridgeInitialName: string | undefined
  /** One-shot teardown override used by /update bridge reattachment. */
  replBridgeSkipNextArchive: boolean
  // Always-on bridge: first-time remote dialog pending`
const DEFAULT_INPUT = `    replBridgeInitialName: undefined,
    showRemoteCallout: false,`
const DEFAULT_OUTPUT = `    replBridgeInitialName: undefined,
    replBridgeSkipNextArchive: false,
    showRemoteCallout: false,`

const PATCH_TYPE_HUNK = `+  /** One-shot teardown override used by /update bridge reattachment. */
+  replBridgeSkipNextArchive: boolean`
const PATCH_DEFAULT_HUNK = `+    replBridgeSkipNextArchive: false,`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function assertDescriptor(value, expected, label) {
  const actual = descriptor(value)
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(
      `${label}: expected ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
    )
  }
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, 'state/AppStateStore.ts')
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('AppStateStore path escapes the supplied source root')
  }
  return filename
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`${label}: expected exactly one input anchor`)
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

function authenticatePatchInput() {
  const filename = path.join(
    repositoryRoot,
    TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_PATCH_INPUT.path,
  )
  const bytes = fs.readFileSync(filename)
  assertDescriptor(
    bytes,
    TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_PATCH_INPUT,
    'Target118 source overlay',
  )
  const source = bytes.toString('utf8')
  if (!source.includes(PATCH_TYPE_HUNK) || !source.includes(PATCH_DEFAULT_HUNK)) {
    throw new Error('Target118 source overlay does not contain both authenticated hunks')
  }
}

export function applyTarget117ReplBridgeSkipArchiveSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  authenticatePatchInput()
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)

  if (
    actual.bytes === TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OUTPUT_FILE.bytes &&
    actual.sha256 === TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OUTPUT_FILE.sha256
  ) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides: TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OWNER_OVERRIDES.length,
      file: TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OUTPUT_FILE,
    })
  }
  if (
    actual.bytes !== TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_INPUT_FILE.bytes ||
    actual.sha256 !== TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_INPUT_FILE.sha256
  ) {
    throw new Error(
      `Refusing to recover non-target AppStateStore: got ${actual.bytes}/${actual.sha256}`,
    )
  }

  let output = input.toString('utf8')
  output = replaceExactlyOnce(output, TYPE_INPUT, TYPE_OUTPUT, 'AppState type')
  output = replaceExactlyOnce(
    output,
    DEFAULT_INPUT,
    DEFAULT_OUTPUT,
    'getDefaultAppState',
  )
  const outputBytes = Buffer.from(output)
  assertDescriptor(
    outputBytes,
    TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OUTPUT_FILE,
    'recovered AppStateStore',
  )
  fs.writeFileSync(filename, outputBytes)
  assertDescriptor(
    fs.readFileSync(filename),
    TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OUTPUT_FILE,
    'written AppStateStore',
  )

  return Object.freeze({
    status: 'recovered',
    ownerOverrides: TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OWNER_OVERRIDES.length,
    file: TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OUTPUT_FILE,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  const result = applyTarget117ReplBridgeSkipArchiveSourceRecovery({ sourceRoot })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
