#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/components/messages/CollapsedReadSearchContent.tsx'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

export const TARGET118_COLLAPSED_SHELL_LABEL_INPUT = Object.freeze({
  path: OWNER_PATH,
  bytes: 78078,
  sha256: '8fc2cf894d4800c3bcc385815ea28a333b21d55c19db73a3d2813bfe5ab7093d',
})

export const TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT = Object.freeze({
  path: OWNER_PATH,
  bytes: 78079,
  sha256: '642347a5cce7f7dd9d388eafb90e0486227a6059d45b9bff761550b0b79f4cae',
})

const BEFORE = `{verb_1} <Text bold>{bashCount}</Text> bash{' '}
        {bashCount === 1 ? 'command' : 'commands'}`
const AFTER = `{verb_1} <Text bold>{bashCount}</Text> shell{' '}
        {bashCount === 1 ? 'command' : 'commands'}`

export const TARGET118_COLLAPSED_SHELL_LABEL_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:12587`,
    targetIndex: 12587,
    paths: Object.freeze([OWNER_PATH]),
    evidenceIds: Object.freeze([
      'target118-collapsed-shell-label-target-fragment',
      'target118-collapsed-shell-label-source-replay-test',
    ]),
    behavior:
      'The authenticated Target118 collapsed tool group labels Bash and PowerShell activity as shell commands; the historical source is recovered from the stale bash label to the exact target shell label inside CollapsedReadSearchContent.',
  }),
])

function occurrenceCount(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count += 1
    offset += needle.length
  }
  return count
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, OWNER_PATH.slice('src/'.length))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${OWNER_PATH}: escapes source root`)
  }
  return filename
}

function stateOf(input) {
  const actual = descriptor(input)
  if (
    actual.bytes === TARGET118_COLLAPSED_SHELL_LABEL_INPUT.bytes &&
    actual.sha256 === TARGET118_COLLAPSED_SHELL_LABEL_INPUT.sha256
  ) {
    return 'raw'
  }
  if (
    actual.bytes === TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT.bytes &&
    actual.sha256 === TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT.sha256
  ) {
    return 'postimage'
  }
  throw new Error(
    `${OWNER_PATH}: unknown preimage ${actual.bytes}/${actual.sha256}`,
  )
}

export function buildTarget118CollapsedShellLabelOutput(input) {
  if (occurrenceCount(input, BEFORE) !== 1 || occurrenceCount(input, AFTER) !== 0) {
    throw new Error(`${OWNER_PATH}: shell-label anchor differs`)
  }
  return input.replace(BEFORE, AFTER)
}

export function applyTarget118CollapsedShellLabelReplay({ sourceRoot }) {
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const state = stateOf(input)
  if (state === 'postimage') {
    return Object.freeze({ status: 'already-recovered', changed: false })
  }
  const output = Buffer.from(
    buildTarget118CollapsedShellLabelOutput(input.toString('utf8')),
  )
  const actual = descriptor(output)
  if (
    actual.bytes !== TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT.bytes ||
    actual.sha256 !== TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT.sha256
  ) {
    throw new Error(
      `${OWNER_PATH}: replay produced ${actual.bytes}/${actual.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  return Object.freeze({ status: 'recovered', changed: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-collapsed-shell-label-source-gap.mjs <source-root>',
    )
  }
  console.log(applyTarget118CollapsedShellLabelReplay({ sourceRoot }))
}
