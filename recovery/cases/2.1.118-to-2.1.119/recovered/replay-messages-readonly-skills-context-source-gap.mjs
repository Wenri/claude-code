#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.118-to-2.1.119'
const RELATIVE_PATH = 'src/utils/messages.ts'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export const TARGET119_MESSAGES_CONTEXT_INPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 199665,
  sha256: 'babd856114a8e0130dcd08cb5d60cda3a34c335d346f175b2fec2fc9482dd290',
})

export const TARGET119_MESSAGES_CONTEXT_OUTPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 200217,
  sha256: 'fda27f770a6e4ca1662ecabe1980d09ad4dffd84aaa6a8abee4fb199bda55cc1',
})

export const TARGET119_MESSAGES_CONTEXT_EVIDENCE_IDS = Object.freeze([
  'target119-messages-context-target-fragments',
  'target119-messages-context-source-replay-test',
  'target119-messages-context-runtime-parity-test',
])

export const TARGET119_MESSAGES_CONTEXT_OWNER_OVERRIDES = Object.freeze(
  [15344, 15351].map(targetIndex =>
    Object.freeze({
      key: `${CASE_NAME}:${targetIndex}`,
      targetIndex,
      paths: Object.freeze([RELATIVE_PATH]),
      evidenceIds: TARGET119_MESSAGES_CONTEXT_EVIDENCE_IDS,
      behavior:
        targetIndex === 15344
          ? 'The authenticated read-only-tool formatter labels embedded find/grep shell aliases with their Glob/Grep tool identities, preserves the ordinary tool allowlist branch, and is replayed exactly in src/utils/messages.ts.'
          : 'The authenticated attachment normalizer preserves invoked-skill content after compaction while warning that the invocation and one-time setup are historical; the exact source branch and target runtime output are replayed and tested together.',
    }),
  ),
)

export const TARGET119_MESSAGES_CONTEXT_READ_ONLY_BEFORE =
  "    ? [FILE_READ_TOOL_NAME, '`find`', '`grep`']"

export const TARGET119_MESSAGES_CONTEXT_READ_ONLY_AFTER =
  '    ? [\n' +
  '        FILE_READ_TOOL_NAME,\n' +
  '        `\\`find\\`/${GLOB_TOOL_NAME}`,\n' +
  '        `\\`grep\\`/${GREP_TOOL_NAME}`,\n' +
  '      ]'

export const TARGET119_MESSAGES_CONTEXT_SKILLS_BEFORE =
  '          content: `The following skills were invoked in this session. Continue to follow these guidelines:\\n\\n' +
  '${skillsContent}' +
  '`,'

export const TARGET119_MESSAGES_CONTEXT_SKILLS_AFTER =
  '          content: `The following skills were invoked EARLIER in this session (before the conversation was compacted), not on the current turn. They are shown here for context only so you remain aware of their guidelines.\\n\\n' +
  'IMPORTANT: Do NOT re-execute these skills or perform their one-time setup actions (e.g., scheduling, creating files) again. The "## Input" sections below reflect the original arguments from when each skill was first invoked — they are NOT the user\'s current message. Only continue to apply ongoing behavioral guidelines from these skills where still relevant.\\n\\n' +
  '${skillsContent}' +
  '`,'

function countExact(source, fragment) {
  return source.split(fragment).length - 1
}

export function buildTarget119MessagesContextOutput(source) {
  if (countExact(source, TARGET119_MESSAGES_CONTEXT_READ_ONLY_BEFORE) !== 1) {
    throw new Error('Target119 messages replay requires one raw read-only tool-list branch')
  }
  if (countExact(source, TARGET119_MESSAGES_CONTEXT_READ_ONLY_AFTER) !== 0) {
    throw new Error('Target119 messages replay found a mixed read-only tool-list state')
  }
  if (countExact(source, TARGET119_MESSAGES_CONTEXT_SKILLS_BEFORE) !== 1) {
    throw new Error('Target119 messages replay requires one raw invoked-skills branch')
  }
  if (countExact(source, TARGET119_MESSAGES_CONTEXT_SKILLS_AFTER) !== 0) {
    throw new Error('Target119 messages replay found a mixed invoked-skills state')
  }
  return source
    .replace(
      TARGET119_MESSAGES_CONTEXT_READ_ONLY_BEFORE,
      TARGET119_MESSAGES_CONTEXT_READ_ONLY_AFTER,
    )
    .replace(
      TARGET119_MESSAGES_CONTEXT_SKILLS_BEFORE,
      TARGET119_MESSAGES_CONTEXT_SKILLS_AFTER,
    )
}

function descriptor(bytes) {
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

export function applyTarget119MessagesContextSourceRecovery({ sourceRoot }) {
  const filename = path.join(sourceRoot, RELATIVE_PATH.replace(/^src\//, ''))
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Target119 messages replay requires a regular file: ${filename}`)
  }
  const input = fs.readFileSync(filename)
  const inputDescriptor = descriptor(input)
  if (sameDescriptor(inputDescriptor, TARGET119_MESSAGES_CONTEXT_OUTPUT)) {
    return Object.freeze({ changed: false, path: RELATIVE_PATH })
  }
  if (!sameDescriptor(inputDescriptor, TARGET119_MESSAGES_CONTEXT_INPUT)) {
    throw new Error(
      `Target119 messages replay rejected ${inputDescriptor.bytes}/${inputDescriptor.sha256}`,
    )
  }
  const output = Buffer.from(
    buildTarget119MessagesContextOutput(input.toString('utf8')),
  )
  const outputDescriptor = descriptor(output)
  if (!sameDescriptor(outputDescriptor, TARGET119_MESSAGES_CONTEXT_OUTPUT)) {
    throw new Error(
      `Target119 messages replay produced ${outputDescriptor.bytes}/${outputDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  return Object.freeze({ changed: true, path: RELATIVE_PATH })
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error('usage: replay-messages-readonly-skills-context-source-gap.mjs <source-root>')
  }
  process.stdout.write(
    `${JSON.stringify(applyTarget119MessagesContextSourceRecovery({ sourceRoot }))}\n`,
  )
}
