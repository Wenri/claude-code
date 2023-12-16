#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.118-to-2.1.119'
const SOURCE_PATH = 'src/components/Settings/Config.tsx'

export const TARGET119_SETTINGS_CONFIG_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 279326,
    sha256:
      '0b799d80d261e8db75b349831dee09e156830802cb8d54d1958370a30be0ef73',
  }),
])

export const TARGET119_SETTINGS_CONFIG_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 279432,
    sha256:
      'fab7d084fa08c4f32c37210df43650a0919ce05791058672154662f83da2275f',
  }),
])

export const TARGET119_SETTINGS_CONFIG_EVIDENCE_IDS = Object.freeze([
  'target119-settings-config-authenticated-whole-unit-proof',
  'target119-settings-config-release-channel-display-source-gap',
  'target119-settings-config-left-arrow-source-correspondence-proof',
  'target119-settings-config-build-macro-expansion-proof',
  'target119-settings-config-caller-module-boundary-proof',
])

export const TARGET119_SETTINGS_CONFIG_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:15840`,
    targetIndex: 15840,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze(['getEffectiveConfig', 'Config']),
    evidenceIds: TARGET119_SETTINGS_CONFIG_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target119 Config unit owns the left-arrow agents setting and change summary, the internal rc release-channel display alias, and two build-expanded MACRO.VERSION reads. The Settings caller, Config initializer, source declaration, same-release rc schema, and update-command display alias authenticate the boundary. A bounded fail-closed replay restores only the two missing rc-to-slow display expressions; the left-arrow and macro rows are admitted through exact source-to-runtime and build-expansion proofs.',
  }),
])

const SETTING_VALUE_INPUT =
  "value: settingsData?.autoUpdatesChannel ?? 'latest',"
const SETTING_VALUE_OUTPUT =
  "value: settingsData?.autoUpdatesChannel === 'rc' ? 'slow' : settingsData?.autoUpdatesChannel ?? 'latest',"
const SUMMARY_INPUT =
  "formattedChanges.push(`Set auto-update channel to ${chalk.bold(settingsData?.autoUpdatesChannel ?? 'latest')}`)"
const SUMMARY_OUTPUT =
  "formattedChanges.push(`Set auto-update channel to ${chalk.bold(settingsData?.autoUpdatesChannel === 'rc' ? 'slow' : settingsData?.autoUpdatesChannel ?? 'latest')}`)"

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1
  if (count !== 1) {
    throw new Error(`${CASE_NAME}: ${label} expected one anchor, got ${count}`)
  }
  return source.replace(before, () => after)
}

function sourceFilename(sourceRoot) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const root = fs.realpathSync(path.resolve(sourceRoot))
  const filename = path.resolve(root, SOURCE_PATH.slice(4))
  const relative = path.relative(root, filename)
  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${SOURCE_PATH}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${SOURCE_PATH}: expected a real source file`)
  }
  if (fs.realpathSync(filename) !== filename) {
    throw new Error(`${SOURCE_PATH}: source path resolves through a symlink`)
  }
  return fs.readFileSync(filename)
}

export function buildTarget119SettingsConfigReleaseChannelOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`${SOURCE_PATH} source must be a string`)
  }
  const withSetting = replaceExactlyOnce(
    source,
    SETTING_VALUE_INPUT,
    SETTING_VALUE_OUTPUT,
    'release-channel setting display',
  )
  return replaceExactlyOnce(
    withSetting,
    SUMMARY_INPUT,
    SUMMARY_OUTPUT,
    'release-channel change summary',
  )
}

export function applyTarget119SettingsConfigReleaseChannelSourceRecovery({
  sourceRoot,
} = {}) {
  const input = TARGET119_SETTINGS_CONFIG_INPUT_FILES[0]
  const output = TARGET119_SETTINGS_CONFIG_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot)
  const current = readRealFile(filename)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: settings Config replay requires exact raw or recovered ${SOURCE_PATH}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget119SettingsConfigReleaseChannelOutput(current.toString('utf8')),
  )
  if (!descriptorsEqual(descriptor(recovered), output)) {
    throw new Error(
      `${CASE_NAME}: settings Config replay produced an unexpected ${SOURCE_PATH}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [SOURCE_PATH] }
}
