#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_RUNTIME_CAPABILITIES_INPUT_FILE = Object.freeze({
  path: 'src/bootstrap/state.ts',
  bytes: 57869,
  sha256: '92a129f4f813b3a733aba862730992534a0beae04eaa8248c14448f866470271',
})

export const TARGET117_RUNTIME_CAPABILITIES_OUTPUT_FILE = Object.freeze({
  path: 'src/bootstrap/state.ts',
  bytes: 58163,
  sha256: '735c307014a8440b3be413c8ad8cc3e5524dc68af0bb88b591a609c90b0039b0',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-runtime-capabilities-target-fragment'
const REPLAY_EVIDENCE = 'target117-runtime-capabilities-source-replay-test'

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    declarations: Object.freeze([...override.declarations]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET117_RUNTIME_CAPABILITIES_OWNER_OVERRIDES = Object.freeze([
  freezeOverride({
    key: `${CASE_NAME}:365`,
    targetIndex: 365,
    paths: ['src/bootstrap/state.ts'],
    declarations: ['getCaps', 'setCaps'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The Target117 bootstrap export registry exposes the authenticated getCaps and setCaps declarations; the compiled property names arise from those exact runtime exports.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:562`,
    targetIndex: 562,
    paths: ['src/bootstrap/state.ts'],
    declarations: ['getIsRemoteMode', 'getCaps'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'Target117 remote-mode reads the runtime-capabilities workspace discriminator and returns true only for the authenticated remote value.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:563`,
    targetIndex: 563,
    paths: ['src/bootstrap/state.ts'],
    declarations: ['setIsRemoteMode', 'getCaps', 'setCaps'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'Target117 remote-mode writes preserve every existing capability while replacing workspace with the authenticated remote or local discriminator.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:596`,
    targetIndex: 596,
    paths: ['src/bootstrap/state.ts'],
    declarations: ['DEFAULT_RUNTIME_CAPABILITIES', 'getInitialState'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The Target117 bootstrap state initializes the exact ink/local/drive/local-jsonl/null capability record and installs that record in each initial state.',
  }),
])

const TYPE_INPUT = `export type ActiveRemoteControlTransport = {
  kind: 'ccr' | 'direct' | 'ssh'
  sendControlRequest: <Response = Record<string, unknown>>(
    request: unknown,
  ) => Promise<Response>
}`
const TYPE_OUTPUT = `${TYPE_INPUT}

export type RuntimeCapabilities = {
  renderTarget: 'ink'
  workspace: 'local' | 'remote'
  canDrive: boolean
  transcriptSource: 'local-jsonl'
  remote: ActiveRemoteControlTransport | null
}

const DEFAULT_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  renderTarget: 'ink',
  workspace: 'local',
  canDrive: true,
  transcriptSource: 'local-jsonl',
  remote: null,
}`

const STATE_ACTIVE_REMOTE_INPUT =
  `  activeRemoteControlTransport: ActiveRemoteControlTransport | null\n`
const STATE_CAPS_INPUT = `  // Remote mode (--remote flag)
  isRemoteMode: boolean`
const STATE_CAPS_OUTPUT = `  // Runtime rendering, workspace, driving, transcript, and transport capabilities
  caps: RuntimeCapabilities`

const INITIAL_ACTIVE_REMOTE_INPUT =
  `    activeRemoteControlTransport: null,\n`
const INITIAL_CAPS_INPUT = `    // Remote mode
    isRemoteMode: false,`
const INITIAL_CAPS_OUTPUT = `    // Runtime capabilities
    caps: DEFAULT_RUNTIME_CAPABILITIES,`

const BRIDGE_INPUT = `/**
 * Source-facing bridge for the generated runtime-capabilities transport.
 * The generated bundle owns the concrete transport module; authored callers
 * use this bootstrap leaf to reach the active remote without importing REPL.
 */
export function getRuntimeCapabilities(): {
  workspace: 'local' | 'remote'
  remote: ActiveRemoteControlTransport | null
} {
  return {
    workspace: STATE.activeRemoteControlTransport ? 'remote' : 'local',
    remote: STATE.activeRemoteControlTransport,
  }
}

export function setActiveRemoteControlTransport(
  transport: ActiveRemoteControlTransport | null,
): void {
  STATE.activeRemoteControlTransport = transport
}`
const BRIDGE_OUTPUT = `export function getCaps(): RuntimeCapabilities {
  return STATE.caps
}

export function setCaps(caps: RuntimeCapabilities): void {
  STATE.caps = caps
}

/**
 * Source-facing name retained for cumulative callers of the recovered tree.
 * Target117's authenticated runtime declaration is getCaps().
 */
export function getRuntimeCapabilities(): RuntimeCapabilities {
  return getCaps()
}

export function setActiveRemoteControlTransport(
  transport: ActiveRemoteControlTransport | null,
): void {
  setCaps({ ...getCaps(), remote: transport })
}`

const REMOTE_ACCESSORS_INPUT = `export function getIsRemoteMode(): boolean {
  return STATE.isRemoteMode
}

export function setIsRemoteMode(value: boolean): void {
  STATE.isRemoteMode = value
}`
const REMOTE_ACCESSORS_OUTPUT = `export function getIsRemoteMode(): boolean {
  return STATE.caps.workspace === 'remote'
}

export function setIsRemoteMode(value: boolean): void {
  STATE.caps = {
    ...STATE.caps,
    workspace: value ? 'remote' : 'local',
  }
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

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`${label}: expected exactly one input anchor`)
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

function recoverSource(input) {
  let source = input.toString('utf8')
  source = replaceExactlyOnce(
    source,
    TYPE_INPUT,
    TYPE_OUTPUT,
    'runtime-capabilities type and default',
  )
  source = replaceExactlyOnce(
    source,
    STATE_ACTIVE_REMOTE_INPUT,
    '',
    'obsolete active-remote state field',
  )
  source = replaceExactlyOnce(
    source,
    STATE_CAPS_INPUT,
    STATE_CAPS_OUTPUT,
    'runtime-capabilities state field',
  )
  source = replaceExactlyOnce(
    source,
    INITIAL_ACTIVE_REMOTE_INPUT,
    '',
    'obsolete active-remote initial value',
  )
  source = replaceExactlyOnce(
    source,
    INITIAL_CAPS_INPUT,
    INITIAL_CAPS_OUTPUT,
    'runtime-capabilities initial value',
  )
  source = replaceExactlyOnce(
    source,
    BRIDGE_INPUT,
    BRIDGE_OUTPUT,
    'runtime-capabilities source bridge',
  )
  source = replaceExactlyOnce(
    source,
    REMOTE_ACCESSORS_INPUT,
    REMOTE_ACCESSORS_OUTPUT,
    'runtime-capabilities remote-mode accessors',
  )
  return Buffer.from(source)
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, TARGET117_RUNTIME_CAPABILITIES_INPUT_FILE.path.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('runtime-capabilities path escapes the supplied source root')
  }
  return filename
}

export function applyTarget117RuntimeCapabilitiesSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, TARGET117_RUNTIME_CAPABILITIES_OUTPUT_FILE)) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides: TARGET117_RUNTIME_CAPABILITIES_OWNER_OVERRIDES.length,
      file: TARGET117_RUNTIME_CAPABILITIES_OUTPUT_FILE,
    })
  }
  if (!descriptorsEqual(actual, TARGET117_RUNTIME_CAPABILITIES_INPUT_FILE)) {
    throw new Error(
      `Refusing non-target runtime-capabilities recovery: ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = recoverSource(input)
  const recovered = descriptor(output)
  if (!descriptorsEqual(recovered, TARGET117_RUNTIME_CAPABILITIES_OUTPUT_FILE)) {
    throw new Error(
      `Recovered runtime-capabilities descriptor mismatch: ${recovered.bytes}/${recovered.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (!descriptorsEqual(written, TARGET117_RUNTIME_CAPABILITIES_OUTPUT_FILE)) {
    throw new Error(
      `Written runtime-capabilities descriptor mismatch: ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    ownerOverrides: TARGET117_RUNTIME_CAPABILITIES_OWNER_OVERRIDES.length,
    file: TARGET117_RUNTIME_CAPABILITIES_OUTPUT_FILE,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117RuntimeCapabilitiesSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
