#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_PLUGIN_COMMAND_POLICY_WORDING_INPUT_FILE = Object.freeze({
  path: 'src/services/plugins/pluginOperations.ts',
  bytes: 39582,
  sha256: '31b521845f2d7aed1ad745449598713fc8f888a3e9d5cc55efe4f83f36955679',
})

export const TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OUTPUT_FILE = Object.freeze({
  path: 'src/services/plugins/pluginOperations.ts',
  bytes: 39626,
  sha256: '1048fd1b897878e86b5ac864e1c4740c5b7e77ed1d323e331994dda8a8b21e80',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-plugin-command-policy-wording-target-fragment'
const REPLAY_EVIDENCE =
  'target117-plugin-command-policy-wording-source-replay-test'

function freezeOverride(targetIndex, declaration, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze(['src/services/plugins/pluginOperations.ts']),
    declarations: Object.freeze([declaration]),
    evidenceIds: Object.freeze([TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE]),
    behavior,
  })
}

export const TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OWNER_OVERRIDES =
  Object.freeze([
    freezeOverride(
      16108,
      'installPluginOp',
      'The complete authenticated Target117 installPluginOp function owns its marketplace-blocked policy branch; the recovered branch says the plugin is from the named marketplace, matching the discriminated install failure and excluding a coincidental utility-layer string.',
    ),
    freezeOverride(
      16114,
      'updatePluginOp',
      'The complete authenticated Target117 updatePluginOp function owns its early marketplace policy gate; the recovered failure identifies both plugin and marketplace with the organization-policy wording before any refresh or update.',
    ),
  ])

const INSTALL_POLICY_INPUT =
  '          message: `Plugin "${result.pluginName}" comes from marketplace "${result.marketplaceName}", which is blocked by your organization\'s policy`,'
const INSTALL_POLICY_OUTPUT =
  '          message: `Plugin "${result.pluginName}" is from marketplace "${result.marketplaceName}", which is blocked by your organization\'s policy`,'
const UPDATE_POLICY_INPUT =
  '        message: `Marketplace "${marketplaceName}" is blocked by enterprise policy`,'
const UPDATE_POLICY_OUTPUT =
  '        message: `Plugin "${pluginName}" is from marketplace "${marketplaceName}", which is blocked by your organization\'s policy`,'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function replaceExactlyOnce(source, input, output, label) {
  const first = source.indexOf(input)
  if (first === -1 || source.indexOf(input, first + input.length) !== -1) {
    throw new Error(`${label}: expected exactly one input anchor`)
  }
  return `${source.slice(0, first)}${output}${source.slice(first + input.length)}`
}

function recoverSource(input) {
  let source = input.toString('utf8')
  source = replaceExactlyOnce(
    source,
    INSTALL_POLICY_INPUT,
    INSTALL_POLICY_OUTPUT,
    'plugin install policy wording',
  )
  source = replaceExactlyOnce(
    source,
    UPDATE_POLICY_INPUT,
    UPDATE_POLICY_OUTPUT,
    'plugin update policy wording',
  )
  return Buffer.from(source)
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET117_PLUGIN_COMMAND_POLICY_WORDING_INPUT_FILE.path.slice(4),
  )
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('plugin command policy wording path escapes the source root')
  }
  return filename
}

export function applyTarget117PluginCommandPolicyWordingSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    descriptorsEqual(
      actual,
      TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OUTPUT_FILE,
    )
  ) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides:
        TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OWNER_OVERRIDES.length,
      file: TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OUTPUT_FILE,
    })
  }
  if (
    !descriptorsEqual(
      actual,
      TARGET117_PLUGIN_COMMAND_POLICY_WORDING_INPUT_FILE,
    )
  ) {
    throw new Error(
      `Refusing non-target plugin command policy wording recovery: ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = recoverSource(input)
  const recovered = descriptor(output)
  if (
    !descriptorsEqual(
      recovered,
      TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `Recovered plugin command policy wording descriptor mismatch: ${recovered.bytes}/${recovered.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (
    !descriptorsEqual(
      written,
      TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `Written plugin command policy wording descriptor mismatch: ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    ownerOverrides:
      TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OWNER_OVERRIDES.length,
    file: TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OUTPUT_FILE,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117PluginCommandPolicyWordingSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
