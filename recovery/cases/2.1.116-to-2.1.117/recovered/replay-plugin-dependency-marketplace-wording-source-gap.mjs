#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_INPUT_FILE =
  Object.freeze({
    path: 'src/utils/plugins/pluginInstallationHelpers.ts',
    bytes: 36417,
    sha256:
      '87c554f77d8183062cb033c7ecf0458ba9d103973a4ecfafe644cb3a06e1566b',
  })

export const TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OUTPUT_FILE =
  Object.freeze({
    path: 'src/utils/plugins/pluginInstallationHelpers.ts',
    bytes: 36414,
    sha256:
      'b9b07d44f26ba2d2437b07f6d4c3724b625d68258fee1fe9a13b92581a551188',
  })

const TARGET_FRAGMENT_EVIDENCE =
  'target117-plugin-dependency-marketplace-wording-target-fragment'
const REPLAY_EVIDENCE =
  'target117-plugin-dependency-marketplace-wording-source-replay-test'

export const TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:9207`,
      targetIndex: 9207,
      paths: Object.freeze([
        'src/utils/plugins/pluginInstallationHelpers.ts',
      ]),
      declarations: Object.freeze(['installPluginFromMarketplace']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        REPLAY_EVIDENCE,
      ]),
      behavior:
        'The Target117 dependency-marketplace policy failure names the dependency as being from the blocked marketplace; the exact wording is confined to the authenticated discriminated-union branch in installPluginFromMarketplace.',
    }),
  ])

const POLICY_ERROR_INPUT =
  '            error: `Cannot install "${result.pluginName}": dependency "${result.blockedDependency}" comes from marketplace "${result.marketplaceName}", which is blocked by your organization\'s policy`,'
const POLICY_ERROR_OUTPUT =
  '            error: `Cannot install "${result.pluginName}": dependency "${result.blockedDependency}" is from marketplace "${result.marketplaceName}", which is blocked by your organization\'s policy`,'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function recoverSource(input) {
  const source = input.toString('utf8')
  const first = source.indexOf(POLICY_ERROR_INPUT)
  if (
    first === -1 ||
    source.indexOf(POLICY_ERROR_INPUT, first + POLICY_ERROR_INPUT.length) !== -1
  ) {
    throw new Error(
      'plugin dependency-marketplace wording: expected exactly one input anchor',
    )
  }
  return Buffer.from(
    `${source.slice(0, first)}${POLICY_ERROR_OUTPUT}${source.slice(first + POLICY_ERROR_INPUT.length)}`,
  )
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_INPUT_FILE.path.slice(4),
  )
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(
      'plugin dependency-marketplace wording path escapes the supplied source root',
    )
  }
  return filename
}

export function applyTarget117PluginDependencyMarketplaceWordingSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    descriptorsEqual(
      actual,
      TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OUTPUT_FILE,
    )
  ) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides:
        TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OWNER_OVERRIDES.length,
      file: TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OUTPUT_FILE,
    })
  }
  if (
    !descriptorsEqual(
      actual,
      TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_INPUT_FILE,
    )
  ) {
    throw new Error(
      `Refusing non-target plugin dependency-marketplace wording recovery: ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = recoverSource(input)
  const recovered = descriptor(output)
  if (
    !descriptorsEqual(
      recovered,
      TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `Recovered plugin dependency-marketplace wording descriptor mismatch: ${recovered.bytes}/${recovered.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (
    !descriptorsEqual(
      written,
      TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `Written plugin dependency-marketplace wording descriptor mismatch: ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    ownerOverrides:
      TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OWNER_OVERRIDES.length,
    file: TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OUTPUT_FILE,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result =
    applyTarget117PluginDependencyMarketplaceWordingSourceRecovery({
      sourceRoot: process.argv[2],
    })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
