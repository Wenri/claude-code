#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_INPUT_FILE = Object.freeze({
  path: 'src/utils/proxy.ts',
  bytes: 13676,
  sha256: '878aaf385b5d89ef67c247966153d743e6223ec8910a7aa1b3718b9ffedf5022',
})

export const TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_HISTORICAL_INPUT_FILE =
  Object.freeze({
    path: 'src/utils/proxy.ts',
    bytes: 17623,
    sha256:
      '406c2f9d59ffecae1aa213630ad16b22b14d15f1cb2cb7d8dbe9b73451da1a9c',
  })

export const TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_RAW_OUTPUT_FILE =
  Object.freeze({
    path: 'src/utils/proxy.ts',
    bytes: 13876,
    sha256:
      'b37aca971d5141249901bc4e08fd2531f80a8c15c40d68768bf444a472bab3db',
  })

export const TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_OUTPUT_FILE = Object.freeze({
  path: 'src/utils/proxy.ts',
  bytes: 17823,
  sha256: 'd61a6601e5f496958bd1cddef5b1a976604ebdd4da2240df9979e63b0f70faf5',
})

const TRANSITIONS = Object.freeze([
  Object.freeze({
    state: 'raw',
    input: TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_INPUT_FILE,
    output: TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_RAW_OUTPUT_FILE,
  }),
  Object.freeze({
    state: 'historical-owner-recovered',
    input: TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_HISTORICAL_INPUT_FILE,
    output: TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_OUTPUT_FILE,
  }),
])

const INPUT = `  keepalive?: false
} {
  const base = keepAliveDisabled ? ({ keepalive: false } as const) : {}`

const OUTPUT = `  keepalive?: false
  timeout?: false
} {
  const base = {
    ...(keepAliveDisabled && { keepalive: false as const }),
    ...(opts?.forAnthropicAPI &&
      typeof Bun !== 'undefined' &&
      !isEnvTruthy(process.env.API_FORCE_IDLE_TIMEOUT) && {
        timeout: false as const,
      }),
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
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
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

export function applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const sourcePath = TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_INPUT_FILE.path
  const filename = sourceFilename(sourceRoot, sourcePath)
  const input = readRealFile(filename, sourcePath)
  const actual = descriptor(input)

  const recoveredState = TRANSITIONS.find(transition =>
    descriptorsEqual(actual, transition.output),
  )
  if (recoveredState) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      sourceState: recoveredState.state,
      file: recoveredState.output,
      ownerOverrides: 0,
    })
  }
  const transition = TRANSITIONS.find(candidate =>
    descriptorsEqual(actual, candidate.input),
  )
  if (!transition) {
    throw new Error(
      `${sourcePath}: refusing non-target idle-timeout recovery ${actual.bytes}/${actual.sha256}`,
    )
  }

  const source = input.toString('utf8')
  const inputCount = occurrenceCount(source, INPUT)
  const outputCount = occurrenceCount(source, OUTPUT)
  if (inputCount !== 1 || outputCount !== 0) {
    throw new Error(
      `${sourcePath}: expected one raw anchor and no postimage; raw=${inputCount}, post=${outputCount}`,
    )
  }
  const output = Buffer.from(source.replace(INPUT, OUTPUT))
  const recovered = descriptor(output)
  if (!descriptorsEqual(recovered, transition.output)) {
    throw new Error(
      `${sourcePath}: replay drift from ${transition.state}; expected ${transition.output.bytes}/${transition.output.sha256}, got ${recovered.bytes}/${recovered.sha256}`,
    )
  }

  fs.writeFileSync(filename, output)
  const written = descriptor(readRealFile(filename, sourcePath))
  if (!descriptorsEqual(written, transition.output)) {
    throw new Error(
      `${sourcePath}: written descriptor mismatch ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    sourceState: transition.state,
    file: transition.output,
    ownerOverrides: 0,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
