#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.118-to-2.1.119'
const RELATIVE_PATH = 'src/entrypoints/sdk/coreSchemas.ts'
const CHECK_1M_RELATIVE_PATH = 'src/utils/model/check1mAccess.ts'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export const TARGET119_SDK_RATE_LIMIT_INPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 63375,
  sha256: 'ad2b52db89980335b1c6fd1567c1e3ca73f95f9c0781c6299910112c14b556ff',
})

export const TARGET119_SDK_RATE_LIMIT_OUTPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 63357,
  sha256: '3f9380f601878c388d993875f8e0d1560407e0fac759d716d9bea30d3ed39e3d',
})

export const TARGET119_CHECK_1M_RATE_LIMIT_INPUT = Object.freeze({
  path: CHECK_1M_RELATIVE_PATH,
  bytes: 2215,
  sha256: 'f4974b7147bea87d6797efe39e8207fdb8a89c74973056567438560d57a02c4a',
})

export const TARGET119_CHECK_1M_RATE_LIMIT_OUTPUT = Object.freeze({
  path: CHECK_1M_RELATIVE_PATH,
  bytes: 2197,
  sha256: '22534a038104fcb636f30d2d9fee3e508259c0f8ed8a6f3cc2630576e8febd64',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target119-sdk-rate-limit-fetch-error-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target119-sdk-rate-limit-fetch-error-source-replay-test'

export const TARGET119_SDK_RATE_LIMIT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:10175`,
    targetIndex: 10175,
    paths: Object.freeze([RELATIVE_PATH]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'The complete authenticated Target119 SDK schema module is authored by src/entrypoints/sdk/coreSchemas.ts; the recovered rate-limit schema replaces the source-only org_service_zero_credit_limit reason with the target-authenticated fetch_error reason while preserving the exact surrounding enum.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:12489`,
    targetIndex: 12489,
    paths: Object.freeze([CHECK_1M_RELATIVE_PATH]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'The complete authenticated Target119 extra-usage access function is authored by src/utils/model/check1mAccess.ts; its recovered disabled-reason switch replaces the source-only org_service_zero_credit_limit case with the target-authenticated fetch_error case in lockstep with the SDK rate-limit schema.',
  }),
])

export const TARGET119_SDK_RATE_LIMIT_BLOCK_BEFORE = `          'org_service_level_disabled',
          'org_service_zero_credit_limit',
          'no_limits_configured',
          'unknown',`

export const TARGET119_SDK_RATE_LIMIT_BLOCK_AFTER = `          'org_service_level_disabled',
          'no_limits_configured',
          'fetch_error',
          'unknown',`

export const TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_BEFORE = `    case 'org_service_level_disabled':
    case 'org_service_zero_credit_limit':
    case 'no_limits_configured':
    case 'unknown':`

export const TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_AFTER = `    case 'org_service_level_disabled':
    case 'no_limits_configured':
    case 'fetch_error':
    case 'unknown':`

export function buildTarget119SdkRateLimitOutput(input) {
  if (input.split(TARGET119_SDK_RATE_LIMIT_BLOCK_BEFORE).length !== 2) {
    throw new Error('Target119 SDK rate-limit enum anchor differs')
  }
  return input.replace(
    TARGET119_SDK_RATE_LIMIT_BLOCK_BEFORE,
    TARGET119_SDK_RATE_LIMIT_BLOCK_AFTER,
  )
}

export function buildTarget119Check1mRateLimitOutput(input) {
  if (input.split(TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_BEFORE).length !== 2) {
    throw new Error('Target119 check-1m rate-limit switch anchor differs')
  }
  return input.replace(
    TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_BEFORE,
    TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_AFTER,
  )
}

export function applyTarget119SdkRateLimitReplay({ sourceRoot }) {
  const files = [
    {
      input: TARGET119_SDK_RATE_LIMIT_INPUT,
      output: TARGET119_SDK_RATE_LIMIT_OUTPUT,
      build: buildTarget119SdkRateLimitOutput,
    },
    {
      input: TARGET119_CHECK_1M_RATE_LIMIT_INPUT,
      output: TARGET119_CHECK_1M_RATE_LIMIT_OUTPUT,
      build: buildTarget119Check1mRateLimitOutput,
    },
  ].map(item => {
    const filename = path.join(
      sourceRoot,
      item.input.path.replace(/^src\//, ''),
    )
    const bytes = fs.readFileSync(filename)
    const current = { bytes: bytes.length, sha256: sha256(bytes) }
    const state =
      current.bytes === item.input.bytes && current.sha256 === item.input.sha256
        ? 'raw'
        : current.bytes === item.output.bytes &&
            current.sha256 === item.output.sha256
          ? 'recovered'
          : null
    if (!state) {
      throw new Error(
        `Target119 rate-limit source ${item.input.path} has unknown preimage ${current.bytes}/${current.sha256}`,
      )
    }
    return { ...item, filename, bytes, state }
  })
  const states = new Set(files.map(item => item.state))
  if (states.size !== 1) {
    throw new Error('Target119 rate-limit replay files are in a mixed state')
  }
  if (files[0].state === 'recovered') {
    return Object.freeze({ status: 'already-recovered', changed: false })
  }
  const outputs = files.map(item => {
    const output = Buffer.from(item.build(item.bytes.toString('utf8')))
    const actual = { bytes: output.length, sha256: sha256(output) }
    if (
      actual.bytes !== item.output.bytes ||
      actual.sha256 !== item.output.sha256
    ) {
      throw new Error(
        `Target119 rate-limit replay for ${item.input.path} produced ${actual.bytes}/${actual.sha256}`,
      )
    }
    return { ...item, output }
  })
  for (const item of outputs) {
    fs.writeFileSync(item.filename, item.output)
  }
  return Object.freeze({ status: 'recovered', changed: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-sdk-rate-limit-fetch-error-source-gap.mjs <source-root>',
    )
  }
  console.log(applyTarget119SdkRateLimitReplay({ sourceRoot }))
}
