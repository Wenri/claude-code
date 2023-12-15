#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'
const SOURCE_PATH = 'src/utils/relaunch.ts'

export const TARGET121_RELAUNCH_PIN_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 5740,
    sha256:
      'd220df76d64026287834a5c43ae863db6238ff388785cc6a8ed9a9537db96979',
  }),
])

export const TARGET121_RELAUNCH_PIN_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 5946,
    sha256:
      '4e2e930a5a39003f6a5bfb56f3308384e7436f9b86e09ae13ce9274c7f0db45a',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-relaunch-pin-whole-unit-proof',
  'target121-relaunch-pin-source-replay-test',
  'target121-relaunch-pin-runtime-parity-test',
])

export const TARGET121_RELAUNCH_PIN_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:12210`,
    targetIndex: 12210,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze([
      'isRunningFromVersionsDirectory',
      'getRelaunchLauncher',
    ]),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The relaunch launcher follows the stable installer symlink by default, but pinToCurrentBinary bypasses it for daemon and private PTY children while preserving bundled and script-mode argv behavior.',
  }),
])

export const TARGET121_RELAUNCH_PIN_EVIDENCE_IDS = EVIDENCE_IDS

const RAW_LAUNCHER = `/**
 * Resolve the stable launcher. A native version binary relaunches through the
 * user-facing symlink so an update that landed mid-session is picked up.
 */
export function getRelaunchLauncher(): RelaunchLauncher {
  if (isInBundledMode()) {
    const versionsPrefix = join(getXDGDataHome(), 'claude', 'versions') + sep
    if (process.execPath.startsWith(versionsPrefix)) {
      const executable = process.platform === 'win32' ? 'claude.exe' : 'claude'
      return { cmd: join(getUserBinDir(), executable), prefixArgs: [] }
    }
    return { cmd: process.execPath, prefixArgs: [] }
  }

  const script = process.argv[1]
  if (!script) return { cmd: process.execPath, prefixArgs: [] }
  return { cmd: process.execPath, prefixArgs: [script] }
}`

// The private helper spelling is inferred. The complete emitted helper and
// launcher ASTs, all live callers, and every runtime branch are authenticated.
const RECOVERED_LAUNCHER = `export function isRunningFromVersionsDirectory(): boolean {
  if (!isInBundledMode()) return false
  const versionsPrefix = join(getXDGDataHome(), 'claude', 'versions') + sep
  return process.execPath.startsWith(versionsPrefix)
}

/**
 * Resolve the stable launcher. A native version binary relaunches through the
 * user-facing symlink so an update that landed mid-session is picked up.
 */
export function getRelaunchLauncher(
  options: { pinToCurrentBinary?: boolean } = {},
): RelaunchLauncher {
  if (!options.pinToCurrentBinary && isRunningFromVersionsDirectory()) {
    const executable = process.platform === 'win32' ? 'claude.exe' : 'claude'
    return { cmd: join(getUserBinDir(), executable), prefixArgs: [] }
  }
  if (isInBundledMode()) return { cmd: process.execPath, prefixArgs: [] }

  const script = process.argv[1]
  if (!script) return { cmd: process.execPath, prefixArgs: [] }
  return { cmd: process.execPath, prefixArgs: [script] }
}`

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
  return source.split(needle).length - 1
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const root = fs.realpathSync(path.resolve(sourceRoot))
  const filename = path.resolve(root, sourcePath.replace(/^src\//, ''))
  const relative = path.relative(root, filename)
  if (
    !sourcePath.startsWith('src/') ||
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  if (fs.realpathSync(filename) !== filename) {
    throw new Error(`${sourcePath}: source path resolves through a symlink`)
  }
  return fs.readFileSync(filename)
}

export function buildTarget121RelaunchPinOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`${SOURCE_PATH} source must be a string`)
  }
  const count = occurrenceCount(source, RAW_LAUNCHER)
  if (count !== 1) {
    throw new Error(`${CASE_NAME}: relaunch launcher expected one anchor, got ${count}`)
  }
  return source.replace(RAW_LAUNCHER, () => RECOVERED_LAUNCHER)
}

export function applyTarget121RelaunchPinSourceRecovery({ sourceRoot } = {}) {
  const input = TARGET121_RELAUNCH_PIN_INPUT_FILES[0]
  const output = TARGET121_RELAUNCH_PIN_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: relaunch pin replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121RelaunchPinOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: relaunch pin replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121RelaunchPinSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
