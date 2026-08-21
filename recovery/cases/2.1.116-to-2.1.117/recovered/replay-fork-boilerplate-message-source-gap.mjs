#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_FORK_BOILERPLATE_CONTEXT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/messages/UserTextMessage.tsx',
    bytes: 29051,
    sha256:
      'de029e8493040381a2cb744402131334a09d531d6bf73d063b8e2a5145c1e04c',
  }),
  Object.freeze({
    path: 'src/constants/figures.ts',
    bytes: 2129,
    sha256:
      '63f2e363252f6cd4edf24e578165f5a39c5d039b884ddf5dad2c136de209741b',
  }),
  Object.freeze({
    path: 'src/constants/xml.ts',
    bytes: 3325,
    sha256:
      'cd9e9a24c5696065cf1194f633afac33914079c34054a347d8aa8b26a8058a48',
  }),
])

export const TARGET117_FORK_BOILERPLATE_CONTEXT_FILE =
  TARGET117_FORK_BOILERPLATE_CONTEXT_FILES[0]

export const TARGET117_FORK_BOILERPLATE_RECOVERED_FILE = Object.freeze({
  path: 'src/components/messages/UserForkBoilerplateMessage.tsx',
  bytes: 1068,
  sha256: '027b3308fe5b7e4e6587865e4b2ad756d04344a8372dd16587839e8d3e726188',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-fork-boilerplate-message-target-fragments'
const BASELINE_ABSENCE_EVIDENCE =
  'target116-fork-boilerplate-message-absence-test'
const DISPATCHER_EVIDENCE =
  'target117-fork-boilerplate-message-dispatcher-source-test'
const REPLAY_EVIDENCE = 'target117-fork-boilerplate-message-source-replay-test'

export const TARGET117_FORK_BOILERPLATE_MESSAGE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:12462`,
      targetIndex: 12462,
      paths: Object.freeze([
        'src/components/messages/UserForkBoilerplateMessage.tsx',
      ]),
      declarations: Object.freeze([
        'FORK_BOILERPLATE_RE',
        'UserForkBoilerplateMessage',
      ]),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        BASELINE_ABSENCE_EVIDENCE,
        DISPATCHER_EVIDENCE,
        REPLAY_EVIDENCE,
      ]),
      behavior:
        'The Target117 fork-message component removes exactly one tagged boilerplate block plus trailing newlines, strips the authenticated directive prefix, and renders the remaining directive beside the fork glyph.',
    }),
  ])

const FORK_BOILERPLATE_MESSAGE_SOURCE = [
  "import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'",
  "import * as React from 'react'",
  "import { FORK_GLYPH } from '../../constants/figures.js'",
  'import {',
  '  FORK_BOILERPLATE_TAG,',
  '  FORK_DIRECTIVE_PREFIX,',
  "} from '../../constants/xml.js'",
  "import { Box, Text } from '../../ink.js'",
  '',
  'type Props = {',
  '  addMargin: boolean',
  '  param: TextBlockParam',
  '}',
  '',
  'const FORK_BOILERPLATE_RE = new RegExp(',
  '  `<${FORK_BOILERPLATE_TAG}>[\\\\s\\\\S]*?</${FORK_BOILERPLATE_TAG}>\\\\n*`,',
  ')',
  '',
  'export function UserForkBoilerplateMessage({',
  '  addMargin,',
  '  param: { text },',
  '}: Props): React.ReactNode {',
  "  const withoutBoilerplate = text.replace(FORK_BOILERPLATE_RE, '')",
  '  const directive = withoutBoilerplate.startsWith(FORK_DIRECTIVE_PREFIX)',
  '    ? withoutBoilerplate.slice(FORK_DIRECTIVE_PREFIX.length)',
  '    : withoutBoilerplate',
  '',
  '  return (',
  '    <Box',
  '      marginTop={addMargin ? 1 : 0}',
  '      backgroundColor="userMessageBackground"',
  '      paddingRight={1}',
  '    >',
  '      <Text dimColor>{FORK_GLYPH}</Text>',
  '      <Box paddingLeft={1}>',
  '        <Text>{directive}</Text>',
  '      </Box>',
  '    </Box>',
  '  )',
  '}',
  '',
].join('\n')

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
  for (const expected of TARGET117_FORK_BOILERPLATE_CONTEXT_FILES) {
    const filename = sourceFilename(sourceRoot, expected.path)
    if (!fs.existsSync(filename)) {
      throw new Error(`${expected.path}: required source context is absent`)
    }
    const actual = descriptor(readRealFile(filename, expected.path))
    if (!descriptorsEqual(actual, expected)) {
      throw new Error(
        `${expected.path}: refusing non-target source context ${actual.bytes}/${actual.sha256}`,
      )
    }
  }
}

export function applyTarget117ForkBoilerplateMessageSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  assertContext(sourceRoot)

  const expected = TARGET117_FORK_BOILERPLATE_RECOVERED_FILE
  const output = Buffer.from(FORK_BOILERPLATE_MESSAGE_SOURCE)
  const replayed = descriptor(output)
  if (!descriptorsEqual(replayed, expected)) {
    throw new Error(
      `${expected.path}: replay drift; expected ${expected.bytes}/${expected.sha256}, got ${replayed.bytes}/${replayed.sha256}`,
    )
  }

  const filename = sourceFilename(sourceRoot, expected.path)
  if (fs.existsSync(filename)) {
    const actual = descriptor(readRealFile(filename, expected.path))
    if (!descriptorsEqual(actual, expected)) {
      throw new Error(
        `${expected.path}: expected absent or recovered ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
      )
    }
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      file: expected,
      ownerOverrides:
        TARGET117_FORK_BOILERPLATE_MESSAGE_OWNER_OVERRIDES.length,
    })
  }

  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, output)
  const written = descriptor(readRealFile(filename, expected.path))
  if (!descriptorsEqual(written, expected)) {
    throw new Error(
      `${expected.path}: written descriptor mismatch ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    file: expected,
    ownerOverrides:
      TARGET117_FORK_BOILERPLATE_MESSAGE_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117ForkBoilerplateMessageSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
