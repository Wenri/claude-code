#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.118-to-2.1.119'
const RELATIVE_PATH = 'src/utils/udsClient.ts'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export const TARGET119_UDS_REGISTRY_INPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 7441,
  sha256: '9dcee42c4c88b9e63c4888c0005f6f7a65732a1e8c8a481e8e3558581bb350cc',
})

export const TARGET119_UDS_REGISTRY_OUTPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 7275,
  sha256: 'af64419e15b607cce8e1eb3aaab6683d29cf4a958433630bd0f29bc83c23dfec',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target119-uds-registry-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target119-uds-registry-source-replay-test'

export const TARGET119_UDS_REGISTRY_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:12161`,
    targetIndex: 12161,
    paths: Object.freeze([RELATIVE_PATH]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'The complete authenticated Target119 UDS readRegistry unit is owned by src/utils/udsClient.ts; the replay restores its exact filename parser and preserves the target-observed nullish/default versus guarded registry-field behavior before owner attribution is admitted.',
  }),
])

export const TARGET119_UDS_REGISTRY_RESIDUES = Object.freeze([
  Object.freeze({
    kind: 'regexp',
    value: Object.freeze({ flags: '', pattern: '^\\d+\\.json$' }),
    start: 7654356,
    end: 7654369,
    baselineCount: 1,
    targetOrdinal: 2,
  }),
  Object.freeze({
    kind: 'regexp',
    value: Object.freeze({ flags: '', pattern: '\\.json$' }),
    start: 7654423,
    end: 7654432,
    baselineCount: 0,
    targetOrdinal: 1,
  }),
  Object.freeze({
    kind: 'property',
    value: 'messagingSocketPath',
    start: 7654538,
    end: 7654557,
    baselineCount: 0,
    targetOrdinal: 1,
  }),
  Object.freeze({
    kind: 'property',
    value: 'logPath',
    start: 7654789,
    end: 7654796,
    baselineCount: 0,
    targetOrdinal: 2,
  }),
  Object.freeze({
    kind: 'property',
    value: 'logPath',
    start: 7654799,
    end: 7654806,
    baselineCount: 0,
    targetOrdinal: 3,
  }),
  Object.freeze({
    kind: 'property',
    value: 'waitingFor',
    start: 7654828,
    end: 7654838,
    baselineCount: 0,
    targetOrdinal: 1,
  }),
  Object.freeze({
    kind: 'property',
    value: 'waitingFor',
    start: 7654848,
    end: 7654858,
    baselineCount: 0,
    targetOrdinal: 2,
  }),
  Object.freeze({
    kind: 'property',
    value: 'waitingFor',
    start: 7654872,
    end: 7654882,
    baselineCount: 0,
    targetOrdinal: 3,
  }),
  Object.freeze({
    kind: 'property',
    value: 'updatedAt',
    start: 7654909,
    end: 7654918,
    baselineCount: 4,
    targetOrdinal: 5,
  }),
  Object.freeze({
    kind: 'property',
    value: 'updatedAt',
    start: 7654932,
    end: 7654941,
    baselineCount: 4,
    targetOrdinal: 6,
  }),
  Object.freeze({
    kind: 'property',
    value: 'tempo',
    start: 7655201,
    end: 7655206,
    baselineCount: 3,
    targetOrdinal: 4,
  }),
  Object.freeze({
    kind: 'property',
    value: 'tempo',
    start: 7655221,
    end: 7655226,
    baselineCount: 3,
    targetOrdinal: 5,
  }),
  Object.freeze({
    kind: 'property',
    value: 'needs',
    start: 7655249,
    end: 7655254,
    baselineCount: 1,
    targetOrdinal: 2,
  }),
  Object.freeze({
    kind: 'property',
    value: 'needs',
    start: 7655268,
    end: 7655273,
    baselineCount: 1,
    targetOrdinal: 3,
  }),
  Object.freeze({
    kind: 'property',
    value: 'peerProtocol',
    start: 7655281,
    end: 7655293,
    baselineCount: 1,
    targetOrdinal: 2,
  }),
  Object.freeze({
    kind: 'property',
    value: 'peerProtocol',
    start: 7655303,
    end: 7655315,
    baselineCount: 1,
    targetOrdinal: 3,
  }),
  Object.freeze({
    kind: 'property',
    value: 'peerProtocol',
    start: 7655329,
    end: 7655341,
    baselineCount: 1,
    targetOrdinal: 4,
  }),
  Object.freeze({
    kind: 'property',
    value: 'tmux',
    start: 7655381,
    end: 7655385,
    baselineCount: 2,
    targetOrdinal: 3,
  }),
])

export const TARGET119_UDS_REGISTRY_BLOCK_BEFORE = String.raw`async function readRegistry(): Promise<RegistryCandidate[]> {
  const directory = join(getClaudeConfigHomeDir(), 'sessions')
  let files: string[]
  try {
    files = await readdir(directory)
  } catch {
    return []
  }
  const values = await Promise.all(
    files
      .filter(file => /^\d+\.json$/.test(file))
      .map(async file => {
        try {
          const pid = Number(file.slice(0, -5))
          if (Number.isNaN(pid)) return null
          const path = join(directory, file)
          const raw = jsonParse(await readFile(path, 'utf8')) as Record<
            string,
            unknown
          >
          return {
            sock:
              typeof raw.messagingSocketPath === 'string'
                ? raw.messagingSocketPath
                : '',
            cwd: typeof raw.cwd === 'string' ? raw.cwd : '?',
            startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : 0,
            procStart:
              typeof raw.procStart === 'string' ? raw.procStart : undefined,
            name: typeof raw.name === 'string' ? raw.name : undefined,
            kind: sessionKind(raw.kind),
            sessionId:
              typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
            bridgeSessionId:
              typeof raw.bridgeSessionId === 'string'
                ? raw.bridgeSessionId
                : undefined,
            logPath:
              typeof raw.logPath === 'string' ? raw.logPath : undefined,
            status: sessionStatus(raw.status),
            waitingFor:
              typeof raw.waitingFor === 'string' ? raw.waitingFor : undefined,
            updatedAt:
              typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
            entrypoint:
              typeof raw.entrypoint === 'string' ? raw.entrypoint : undefined,
            agent: typeof raw.agent === 'string' ? raw.agent : undefined,
            state: typeof raw.state === 'string' ? raw.state : undefined,
            detail: typeof raw.detail === 'string' ? raw.detail : undefined,
            tempo:
              raw.tempo === 'active' ||
              raw.tempo === 'idle' ||
              raw.tempo === 'blocked'
                ? raw.tempo
                : undefined,
            needs: typeof raw.needs === 'string' ? raw.needs : undefined,
            peerProtocol:
              typeof raw.peerProtocol === 'number' ? raw.peerProtocol : undefined,
            tmux: typeof raw.tmux === 'string' ? raw.tmux : undefined,
            pid,
            file: path,
          } satisfies RegistryCandidate
        } catch {
          return null
        }
      }),
  )
  return values.filter((value): value is RegistryCandidate => value !== null)
}`

export const TARGET119_UDS_REGISTRY_BLOCK_AFTER = String.raw`async function readRegistry(): Promise<RegistryCandidate[]> {
  const directory = join(getClaudeConfigHomeDir(), 'sessions')
  let files: string[]
  try {
    files = await readdir(directory)
  } catch {
    return []
  }
  const values = await Promise.all(
    files
      .filter(file => /^\d+\.json$/.test(file))
      .map(async file => {
        try {
          const pid = parseInt(file.replace(/\.json$/, ''), 10)
          if (Number.isNaN(pid)) return null
          const path = join(directory, file)
          const raw = jsonParse(await readFile(path, 'utf8')) as Record<
            string,
            unknown
          >
          return {
            sock: (raw.messagingSocketPath as string | undefined) ?? '',
            cwd: (raw.cwd as string | undefined) ?? '?',
            startedAt: (raw.startedAt as number | undefined) ?? 0,
            procStart:
              typeof raw.procStart === 'string' ? raw.procStart : undefined,
            name: raw.name as string | undefined,
            kind: sessionKind(raw.kind),
            sessionId: raw.sessionId as string | undefined,
            bridgeSessionId:
              typeof raw.bridgeSessionId === 'string'
                ? raw.bridgeSessionId
                : undefined,
            logPath: raw.logPath as string | undefined,
            status: sessionStatus(raw.status),
            waitingFor:
              typeof raw.waitingFor === 'string' ? raw.waitingFor : undefined,
            updatedAt:
              typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
            entrypoint:
              typeof raw.entrypoint === 'string' ? raw.entrypoint : undefined,
            agent: typeof raw.agent === 'string' ? raw.agent : undefined,
            state: typeof raw.state === 'string' ? raw.state : undefined,
            detail: typeof raw.detail === 'string' ? raw.detail : undefined,
            tempo:
              raw.tempo === 'active' ||
              raw.tempo === 'idle' ||
              raw.tempo === 'blocked'
                ? raw.tempo
                : undefined,
            needs: typeof raw.needs === 'string' ? raw.needs : undefined,
            peerProtocol:
              typeof raw.peerProtocol === 'number' ? raw.peerProtocol : undefined,
            tmux: typeof raw.tmux === 'string' ? raw.tmux : undefined,
            pid,
            file: path,
          } satisfies RegistryCandidate
        } catch {
          return null
        }
      }),
  )
  return values.filter((value): value is RegistryCandidate => value !== null)
}`

export function buildTarget119UdsRegistryOutput(input) {
  if (input.split(TARGET119_UDS_REGISTRY_BLOCK_BEFORE).length !== 2) {
    throw new Error('Target119 UDS registry preimage anchor differs')
  }
  return input.replace(
    TARGET119_UDS_REGISTRY_BLOCK_BEFORE,
    TARGET119_UDS_REGISTRY_BLOCK_AFTER,
  )
}

export function applyTarget119UdsRegistryReplay({ sourceRoot }) {
  const filename = path.join(sourceRoot, RELATIVE_PATH.replace(/^src\//, ''))
  const input = fs.readFileSync(filename)
  const current = { bytes: input.length, sha256: sha256(input) }
  if (
    current.bytes === TARGET119_UDS_REGISTRY_OUTPUT.bytes &&
    current.sha256 === TARGET119_UDS_REGISTRY_OUTPUT.sha256
  ) {
    return Object.freeze({ status: 'already-recovered', changed: false })
  }
  if (
    current.bytes !== TARGET119_UDS_REGISTRY_INPUT.bytes ||
    current.sha256 !== TARGET119_UDS_REGISTRY_INPUT.sha256
  ) {
    throw new Error(
      `Target119 UDS registry source has unknown preimage ${current.bytes}/${current.sha256}`,
    )
  }
  const output = Buffer.from(
    buildTarget119UdsRegistryOutput(input.toString('utf8')),
  )
  const actual = { bytes: output.length, sha256: sha256(output) }
  if (
    actual.bytes !== TARGET119_UDS_REGISTRY_OUTPUT.bytes ||
    actual.sha256 !== TARGET119_UDS_REGISTRY_OUTPUT.sha256
  ) {
    throw new Error(
      `Target119 UDS registry replay produced ${actual.bytes}/${actual.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  return Object.freeze({ status: 'recovered', changed: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error('usage: replay-uds-registry-source-gap.mjs <source-root>')
  }
  console.log(applyTarget119UdsRegistryReplay({ sourceRoot }))
}
