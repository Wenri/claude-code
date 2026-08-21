#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_SKILLS_EMPTY_STATE_CONTEXT_FILE = Object.freeze({
  path: 'src/components/design-system/EmptyState.tsx',
  bytes: 427,
  sha256: '43fc9440c08858dbdd4036bbf09d7fb7a0c7ca11df14446b1a6feded5e49449b',
})

export const TARGET117_SKILLS_EMPTY_STATE_FILE = Object.freeze({
  path: 'src/components/skills/SkillsMenu.tsx',
  declaration: 'SkillsMenu',
  raw: Object.freeze({
    bytes: 9480,
    sha256: 'e3c920a1278804eff7b7fed25c4e636b84eae7eb901ffcf3fa9abdbd5d093eed',
  }),
  postimage: Object.freeze({
    bytes: 9500,
    sha256: '9fe0bea92f1e127c0b35378ca42307151092837b8f44bcbbea4e5a7e1352c070',
  }),
})

const TARGET_EVIDENCE =
  'target117-skills-empty-state-complete-target-unit-proof'
const SHARED_COMPONENT_EVIDENCE =
  'target117-shared-empty-state-target-unit-proof'
const SOURCE_REPLAY_EVIDENCE =
  'target117-skills-empty-state-bounded-source-replay-test'

export const TARGET117_SKILLS_EMPTY_STATE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:16800`,
    targetIndex: 16800,
    paths: Object.freeze([
      TARGET117_SKILLS_EMPTY_STATE_FILE.path,
      TARGET117_SKILLS_EMPTY_STATE_CONTEXT_FILE.path,
    ]),
    declarations: Object.freeze(['SkillsMenu', 'EmptyState']),
    evidenceIds: Object.freeze([
      TARGET_EVIDENCE,
      SHARED_COMPONENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 SkillsMenu renders the zero-skill message through the authenticated shared EmptyState contract, with “No skills found” as the primary dim text and the exact .claude/skills hint as secondary dim text; the replay is intentionally bounded to that branch and does not claim the independently covered virtual-list implementation.',
  }),
])

const IMPORT_TRANSFORM = Object.freeze({
  before: "import { Dialog } from '../design-system/Dialog.js'",
  after: [
    "import { Dialog } from '../design-system/Dialog.js'",
    "import { EmptyState } from '../design-system/EmptyState.js'",
  ].join('\n'),
})

const ZERO_SKILLS_TRANSFORM = Object.freeze({
  before: [
    '  if (skills.length === 0) {',
    '    return (',
    '      <Dialog',
    '        title="Skills"',
    '        subtitle="No skills found"',
    '        onCancel={handleClose}',
    '        hideInputGuide',
    '      >',
    '        <Text dimColor>',
    '          Create skills in .claude/skills/ or ~/.claude/skills/',
    '        </Text>',
    '      </Dialog>',
    '    )',
    '  }',
  ].join('\n'),
  after: [
    '  if (skills.length === 0) {',
    '    return (',
    '      <Dialog title="Skills" onCancel={handleClose} hideInputGuide>',
    '        <EmptyState hint="Create skills in .claude/skills/ or ~/.claude/skills/">',
    '          No skills found',
    '        </EmptyState>',
    '      </Dialog>',
    '    )',
    '  }',
  ].join('\n'),
})

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
  const expected = TARGET117_SKILLS_EMPTY_STATE_CONTEXT_FILE
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

function classify(sourceRoot) {
  const expected = TARGET117_SKILLS_EMPTY_STATE_FILE
  const filename = sourceFilename(sourceRoot, expected.path)
  if (!fs.existsSync(filename)) {
    throw new Error(`${expected.path}: required Target117 source is absent`)
  }
  const input = readRealFile(filename, expected.path)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, expected.raw)) {
    return { filename, source: input.toString('utf8'), state: 'raw' }
  }
  if (descriptorsEqual(actual, expected.postimage)) {
    return { filename, source: input.toString('utf8'), state: 'postimage' }
  }
  throw new Error(
    `${expected.path}: refusing non-Target117 state ${actual.bytes}/${actual.sha256}`,
  )
}

function recover(file) {
  let output = replaceOnce(
    file.source,
    IMPORT_TRANSFORM.before,
    IMPORT_TRANSFORM.after,
    'SkillsMenu EmptyState import',
  )
  output = replaceOnce(
    output,
    ZERO_SKILLS_TRANSFORM.before,
    ZERO_SKILLS_TRANSFORM.after,
    'SkillsMenu zero-skills branch',
  )
  const bytes = Buffer.from(output)
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, TARGET117_SKILLS_EMPTY_STATE_FILE.postimage)) {
    throw new Error(
      `${TARGET117_SKILLS_EMPTY_STATE_FILE.path}: replay drift ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes
}

export function applyTarget117SkillsEmptyStateSourceRecovery({ sourceRoot } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  assertContext(sourceRoot)
  const file = classify(sourceRoot)
  if (file.state === 'postimage') {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      file: TARGET117_SKILLS_EMPTY_STATE_FILE,
      ownerOverrides: TARGET117_SKILLS_EMPTY_STATE_OWNER_OVERRIDES.length,
    })
  }
  const output = recover(file)
  fs.writeFileSync(file.filename, output)
  if (classify(sourceRoot).state !== 'postimage') {
    throw new Error(
      `${TARGET117_SKILLS_EMPTY_STATE_FILE.path}: written replay did not retain postimage`,
    )
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    file: TARGET117_SKILLS_EMPTY_STATE_FILE,
    ownerOverrides: TARGET117_SKILLS_EMPTY_STATE_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117SkillsEmptyStateSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
