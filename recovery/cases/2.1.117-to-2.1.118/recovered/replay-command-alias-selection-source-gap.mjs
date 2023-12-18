#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-command-alias-selection-target-fragment'
const REPLAY_EVIDENCE = 'target118-command-alias-selection-source-replay-test'

export const TARGET118_COMMAND_ALIAS_SELECTION_INPUTS = Object.freeze([
  Object.freeze({
    path: 'src/components/PromptInput/PromptInputFooterSuggestions.tsx',
    bytes: 34368,
    sha256: 'b7b2e6a76a2c5758c8027f9ae5719f33c6b997004e443d23bc6b11f30c670e75',
  }),
  Object.freeze({
    path: 'src/utils/suggestions/commandSuggestions.ts',
    bytes: 20041,
    sha256: '717ee7941db01777413d47d49d0bb40f60456b07c11bc771ec0cbe32d5a049cf',
  }),
])

export const TARGET118_COMMAND_ALIAS_SELECTION_OUTPUTS = Object.freeze([
  Object.freeze({
    path: 'src/components/PromptInput/PromptInputFooterSuggestions.tsx',
    bytes: 34393,
    sha256: '7acf8edb562a6d23cfb05486807018a0065e054b0918b6afb54364c5825def35',
  }),
  Object.freeze({
    path: 'src/utils/suggestions/commandSuggestions.ts',
    bytes: 20227,
    sha256: '01c517554b8f4e967deb48c5870ee5c508abae7b3e31122848f01288b3afca1f',
  }),
])

function override(targetIndex, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze(['src/utils/suggestions/commandSuggestions.ts']),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      REPLAY_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET118_COMMAND_ALIAS_SELECTION_OWNER_OVERRIDES = Object.freeze([
  override(
    19257,
    'Target118 retains the matched command alias on each suggestion item so selection can preserve the exact alias the user typed.',
  ),
  override(
    19259,
    'Target118 applies a selected alias only when it still resolves to the same command object, otherwise falling back to the canonical command name.',
  ),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function replaceExactly(value, before, after, label) {
  const count = value.split(before).length - 1
  if (count !== 1) {
    throw new Error(`Target118 command alias ${label} count is ${count}`)
  }
  return value.replace(before, after)
}

function recoverFooterType(input) {
  return replaceExactly(
    input,
    '  color?: keyof Theme;\n};',
    '  color?: keyof Theme;\n  matchedAlias?: string;\n};',
    'SuggestionItem type',
  )
}

function recoverCommandSuggestions(input) {
  let value = input
  value = replaceExactly(
    value,
    '  type Command,\n  formatDescriptionWithSource,',
    '  type Command,\n  findCommand,\n  formatDescriptionWithSource,',
    'findCommand import',
  )
  value = replaceExactly(
    value,
    '    metadata: cmd,\n  }',
    '    metadata: cmd,\n    matchedAlias,\n  }',
    'suggestion payload',
  )
  value = replaceExactly(
    value,
    '    commandName = getCommandName(suggestion.metadata)\n    commandObj = suggestion.metadata',
    `    const matchedAlias = suggestion.matchedAlias
    commandName =
      matchedAlias && findCommand(matchedAlias, commands) === suggestion.metadata
        ? matchedAlias
        : suggestion.metadata.name
    commandObj = suggestion.metadata`,
    'selection guard',
  )
  return value
}

function resolveSourceRoot(value) {
  const direct = path.join(value, 'utils/suggestions/commandSuggestions.ts')
  if (fs.existsSync(direct)) return value
  const nested = path.join(value, 'src/utils/suggestions/commandSuggestions.ts')
  if (fs.existsSync(nested)) return path.join(value, 'src')
  throw new Error(`Target118 command alias source root is invalid: ${value}`)
}

export function applyTarget118CommandAliasSelectionReplay({ sourceRoot }) {
  const resolved = resolveSourceRoot(sourceRoot)
  const transforms = new Map([
    [
      'src/components/PromptInput/PromptInputFooterSuggestions.tsx',
      recoverFooterType,
    ],
    [
      'src/utils/suggestions/commandSuggestions.ts',
      recoverCommandSuggestions,
    ],
  ])
  const inputs = new Map(TARGET118_COMMAND_ALIAS_SELECTION_INPUTS.map(row => [row.path, row]))
  const outputs = new Map(TARGET118_COMMAND_ALIAS_SELECTION_OUTPUTS.map(row => [row.path, row]))
  const planned = []
  const states = []

  for (const [relativePath, transform] of transforms) {
    const filename = path.join(resolved, relativePath.replace(/^src\//, ''))
    const value = fs.readFileSync(filename, 'utf8')
    const observed = descriptor(value)
    const before = inputs.get(relativePath)
    const after = outputs.get(relativePath)
    if (observed.bytes === after.bytes && observed.sha256 === after.sha256) {
      states.push('post')
      continue
    }
    if (observed.bytes !== before.bytes || observed.sha256 !== before.sha256) {
      throw new Error(
        `Target118 command alias preimage differs for ${relativePath}: ${observed.bytes}/${observed.sha256}`,
      )
    }
    const output = transform(value)
    const recovered = descriptor(output)
    if (recovered.bytes !== after.bytes || recovered.sha256 !== after.sha256) {
      throw new Error(
        `Target118 command alias postimage differs for ${relativePath}: ${recovered.bytes}/${recovered.sha256}`,
      )
    }
    states.push('pre')
    planned.push({ filename, output })
  }

  if (new Set(states).size !== 1) {
    throw new Error(`Target118 command alias source files are mixed: ${states}`)
  }
  if (states[0] === 'post') {
    return { status: 'already-recovered', files: TARGET118_COMMAND_ALIAS_SELECTION_OUTPUTS }
  }
  for (const item of planned) fs.writeFileSync(item.filename, item.output)
  return { status: 'recovered', files: TARGET118_COMMAND_ALIAS_SELECTION_OUTPUTS }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--source-root')
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(
      'usage: replay-command-alias-selection-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(applyTarget118CommandAliasSelectionReplay({ sourceRoot: process.argv[index + 1] }))}\n`,
  )
}
