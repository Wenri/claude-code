#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_HOOK_EMPTY_STATE_CONTEXT_FILE = Object.freeze({
  path: 'src/components/design-system/EmptyState.tsx',
  bytes: 427,
  sha256: '43fc9440c08858dbdd4036bbf09d7fb7a0c7ca11df14446b1a6feded5e49449b',
})

export const TARGET117_HOOK_EMPTY_STATE_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/hooks/SelectHookMode.tsx',
    declaration: 'SelectHookMode',
    raw: Object.freeze({
      bytes: 12907,
      sha256: 'b5ce44026145656f81819e0cdc7cb1dce06ec680010c8a598ca326578b5f5b60',
    }),
    postimage: Object.freeze({
      bytes: 13005,
      sha256: 'edf052a4adbc823dcd8e1ec476f4e2bb3f09cb4b0da45473970eb52e2306b2e5',
    }),
  }),
  Object.freeze({
    path: 'src/components/hooks/SelectMatcherMode.tsx',
    declaration: 'SelectMatcherMode',
    raw: Object.freeze({
      bytes: 14809,
      sha256: 'c7fb972b7142d0c300e4fed4fd76c00d5d312a5b900c1ca8a0db6e65dd4be3a2',
    }),
    postimage: Object.freeze({
      bytes: 14907,
      sha256: 'e41cb7a9a00ec2d829ed08c334516496c410597cf50b1985173dd61d2d370793',
    }),
  }),
  Object.freeze({
    path: 'src/components/design-system/KeyboardShortcutHint.tsx',
    declaration: 'KeyboardShortcutHint',
    raw: Object.freeze({
      bytes: 6847,
      sha256: '674320359f925e9f4f73f8761f003a0874bb6835eeb07ebb644192e8557d2b26',
    }),
    postimage: Object.freeze({
      bytes: 14022,
      sha256: '003a5fcb34e20f2a8966397d29b42a1a3edbd9773707c1fa81314d5197b52335',
    }),
  }),
])

const TARGET_EVIDENCE =
  'target117-hook-empty-state-complete-target-unit-proof'
const SHARED_COMPONENT_EVIDENCE =
  'target117-shared-empty-state-target-unit-proof'
const KEYBOARD_SHORTCUT_EVIDENCE =
  'target117-retained-keyboard-shortcut-contract-proof'
const SOURCE_REPLAY_EVIDENCE =
  'target117-hook-empty-state-source-replay-test'
const OWNER_CORRECTION_EVIDENCE =
  'target117-hook-empty-state-owner-correction-proof'

function ownerOverride(targetIndex, path, declaration, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([
      path,
      TARGET117_HOOK_EMPTY_STATE_CONTEXT_FILE.path,
      'src/components/design-system/KeyboardShortcutHint.tsx',
    ]),
    declarations: Object.freeze([
      declaration,
      'EmptyState',
      'KeyboardShortcutHint',
      'formatKeyboardShortcut',
    ]),
    evidenceIds: Object.freeze([
      TARGET_EVIDENCE,
      SHARED_COMPONENT_EVIDENCE,
      KEYBOARD_SHORTCUT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
      OWNER_CORRECTION_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET117_HOOK_EMPTY_STATE_OWNER_OVERRIDES = Object.freeze([
  ownerOverride(
    17078,
    'src/components/hooks/SelectHookMode.tsx',
    'SelectHookMode',
    'Target117 SelectHookMode delegates its zero-hook state to the authenticated shared EmptyState runtime with the exact settings hint, retains its nineteen-slot compiler cache and Dialog input guide, and renders that guide through the retained chord-aware KeyboardShortcutHint contract.',
  ),
  ownerOverride(
    17083,
    'src/components/hooks/SelectMatcherMode.tsx',
    'SelectMatcherMode',
    'Target117 SelectMatcherMode delegates its zero-matcher state to the same authenticated shared EmptyState runtime with the exact settings hint, retains its twenty-five-slot compiler cache and Dialog input guide, and renders that guide through the retained chord-aware KeyboardShortcutHint contract; this corrects the stale generated owner from SelectHookMode to SelectMatcherMode.',
  ),
])

const EMPTY_STATE_IMPORT = Object.freeze({
  before: "import { Dialog } from '../design-system/Dialog.js';",
  after: [
    "import { Dialog } from '../design-system/Dialog.js';",
    "import { EmptyState } from '../design-system/EmptyState.js';",
    "import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';",
  ].join('\n'),
})

const INK_IMPORT = Object.freeze({
  before: "import { Box, Text } from '../../ink.js';",
  after: "import { Box } from '../../ink.js';",
})

const EMPTY_STATE_HINT =
  'To add hooks, edit settings.json directly or ask Claude.'

const HOOK_RENDER = Object.freeze({
  before:
    '      t1 = <Box flexDirection="column" gap={1}><Text dimColor={true}>No hooks configured for this event.</Text><Text dimColor={true}>To add hooks, edit settings.json directly or ask Claude.</Text></Box>;',
  after:
    `      t1 = <EmptyState hint="${EMPTY_STATE_HINT}">No hooks configured for this event.</EmptyState>;`,
})

const MATCHER_RENDER = Object.freeze({
  before:
    '      t3 = <Box flexDirection="column" gap={1}><Text dimColor={true}>No hooks configured for this event.</Text><Text dimColor={true}>To add hooks, edit settings.json directly or ask Claude.</Text></Box>;',
  after:
    `      t3 = <EmptyState hint="${EMPTY_STATE_HINT}">No hooks configured for this event.</EmptyState>;`,
})

const HOOK_INPUT_GUIDE = Object.freeze({
  before: [
    'function _temp() {',
    '  return <Text>Esc to go back</Text>;',
    '}',
  ].join('\n'),
  after: [
    'function _temp() {',
    '  return <KeyboardShortcutHint chord="escape" action="go back" />;',
    '}',
  ].join('\n'),
})

const MATCHER_INPUT_GUIDE = Object.freeze({
  before: [
    'function _temp2() {',
    '  return <Text>Esc to go back</Text>;',
    '}',
  ].join('\n'),
  after: [
    'function _temp2() {',
    '  return <KeyboardShortcutHint chord="escape" action="go back" />;',
    '}',
  ].join('\n'),
})

const TARGET117_KEYBOARD_SHORTCUT_SOURCE_GZIP_BASE64 =
  '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'

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

function replaceOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) {
    throw new Error(`${label}: expected one replay anchor, got ${count}`)
  }
  return source.replace(before, after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: invalid src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes supplied source root`)
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
  const expected = TARGET117_HOOK_EMPTY_STATE_CONTEXT_FILE
  const filename = sourceFilename(sourceRoot, expected.path)
  if (!fs.existsSync(filename)) {
    throw new Error(
      `${expected.path}: required Target117 EmptyState replay context is absent`,
    )
  }
  const actual = descriptor(readRealFile(filename, expected.path))
  if (!descriptorsEqual(actual, expected)) {
    throw new Error(
      `${expected.path}: refusing non-Target117 EmptyState context ${actual.bytes}/${actual.sha256}`,
    )
  }
}

function classify(sourceRoot, expected) {
  const filename = sourceFilename(sourceRoot, expected.path)
  if (!fs.existsSync(filename)) {
    throw new Error(`${expected.path}: required Target117 source is absent`)
  }
  const input = readRealFile(filename, expected.path)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, expected.raw)) {
    return { expected, filename, source: input.toString('utf8'), state: 'raw' }
  }
  if (descriptorsEqual(actual, expected.postimage)) {
    return { expected, filename, source: input.toString('utf8'), state: 'postimage' }
  }
  throw new Error(
    `${expected.path}: refusing mixed or non-Target117 state ${actual.bytes}/${actual.sha256}`,
  )
}

function recover(file) {
  if (
    file.expected.path ===
    'src/components/design-system/KeyboardShortcutHint.tsx'
  ) {
    const bytes = gunzipSync(
      Buffer.from(TARGET117_KEYBOARD_SHORTCUT_SOURCE_GZIP_BASE64, 'base64'),
    )
    const actual = descriptor(bytes)
    if (!descriptorsEqual(actual, file.expected.postimage)) {
      throw new Error(
        `${file.expected.path}: retained source payload drift ${actual.bytes}/${actual.sha256}`,
      )
    }
    return bytes
  }

  let output = replaceOnce(
    file.source,
    INK_IMPORT.before,
    INK_IMPORT.after,
    `${file.expected.path} retained Ink import`,
  )
  output = replaceOnce(
    output,
    EMPTY_STATE_IMPORT.before,
    EMPTY_STATE_IMPORT.after,
    `${file.expected.path} EmptyState and keyboard imports`,
  )
  const render =
    file.expected.path === 'src/components/hooks/SelectHookMode.tsx'
      ? HOOK_RENDER
      : file.expected.path === 'src/components/hooks/SelectMatcherMode.tsx'
        ? MATCHER_RENDER
        : null
  if (!render) throw new Error(`${file.expected.path}: missing replay transform`)
  output = replaceOnce(
    output,
    render.before,
    render.after,
    `${file.expected.path} EmptyState delegate`,
  )
  const inputGuide =
    file.expected.path === 'src/components/hooks/SelectHookMode.tsx'
      ? HOOK_INPUT_GUIDE
      : MATCHER_INPUT_GUIDE
  output = replaceOnce(
    output,
    inputGuide.before,
    inputGuide.after,
    `${file.expected.path} keyboard input guide`,
  )
  const bytes = Buffer.from(output)
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, file.expected.postimage)) {
    throw new Error(
      `${file.expected.path}: replay drift ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes
}

export function applyTarget117HookEmptyStateSourceRecovery({ sourceRoot } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  assertContext(sourceRoot)
  const files = TARGET117_HOOK_EMPTY_STATE_FILES.map(expected =>
    classify(sourceRoot, expected),
  )
  const states = new Set(files.map(file => file.state))
  if (states.size === 1 && states.has('postimage')) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      files: TARGET117_HOOK_EMPTY_STATE_FILES,
      ownerOverrides: TARGET117_HOOK_EMPTY_STATE_OWNER_OVERRIDES.length,
    })
  }
  if (states.size !== 1 || !states.has('raw')) {
    throw new Error(
      `Refusing mixed Target117 hook EmptyState recovery: ${files.map(file => `${file.expected.path}=${file.state}`).join(', ')}`,
    )
  }

  const outputs = files.map(file => ({ file, output: recover(file) }))
  for (const { file, output } of outputs) fs.writeFileSync(file.filename, output)
  for (const { file } of outputs) {
    if (classify(sourceRoot, file.expected).state !== 'postimage') {
      throw new Error(`${file.expected.path}: written replay did not retain postimage`)
    }
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    files: TARGET117_HOOK_EMPTY_STATE_FILES,
    ownerOverrides: TARGET117_HOOK_EMPTY_STATE_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117HookEmptyStateSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
