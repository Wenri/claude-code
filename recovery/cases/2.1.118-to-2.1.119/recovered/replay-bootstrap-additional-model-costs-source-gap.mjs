#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.118-to-2.1.119'
const RELATIVE_PATH = 'src/services/api/bootstrap.ts'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export const TARGET119_BOOTSTRAP_COSTS_INPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 4634,
  sha256: '947aee6acdef6f1cb6310b3953063ad7c7985757bff7f57df6679a9bb440a7d5',
})

export const TARGET119_BOOTSTRAP_COSTS_OUTPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 5323,
  sha256: '652ce2e8c95a2b46e6dad10170e5e580b3ea138fad2da20e59df21130b3692a4',
})

export const TARGET119_BOOTSTRAP_COSTS_DONOR = Object.freeze({
  path: RELATIVE_PATH,
  release: '2.1.120',
  bytes: 7368,
  sha256: 'a3373ca1b67fcb2a65e4bcd76b158f945c54b0395c91356917fbc1489acbfa6d',
  blockBytes: 689,
  blockSha256:
    '4a0dd60c91117bfd6bbe00f311b504b5a6dbd2bf27ca09f96056a5ab63160295',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target119-bootstrap-additional-model-costs-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target119-bootstrap-additional-model-costs-source-replay-test'

export const TARGET119_BOOTSTRAP_COSTS_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:21176`,
    targetIndex: 21176,
    paths: Object.freeze([RELATIVE_PATH]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'The authenticated Target119 bootstrap schema accepts additional per-model token and web-search costs and transforms their wire-format field names into the runtime cache shape.',
  }),
])

export const TARGET119_BOOTSTRAP_COSTS_BLOCK = `    additional_model_costs: z
      .record(
        z
          .object({
            input_tokens: z.number(),
            output_tokens: z.number(),
            prompt_cache_write_tokens: z.number(),
            prompt_cache_read_tokens: z.number(),
            web_search_requests: z.number().nullish(),
          })
          .transform(costs => ({
            inputTokens: costs.input_tokens,
            outputTokens: costs.output_tokens,
            promptCacheWriteTokens: costs.prompt_cache_write_tokens,
            promptCacheReadTokens: costs.prompt_cache_read_tokens,
            webSearchRequests: costs.web_search_requests ?? 0.01,
          })),
      )
      .nullish(),
`

const ANCHOR_BEFORE = `      .nullish(),
  }),
)
`
const ANCHOR_AFTER = `      .nullish(),
${TARGET119_BOOTSTRAP_COSTS_BLOCK}  }),
)
`

export function buildTarget119BootstrapCostsOutput(input) {
  if (input.split(ANCHOR_BEFORE).length !== 2) {
    throw new Error('Target119 bootstrap schema anchor differs')
  }
  return input.replace(ANCHOR_BEFORE, ANCHOR_AFTER)
}

export function applyTarget119BootstrapCostsReplay({ sourceRoot }) {
  const filename = path.join(sourceRoot, RELATIVE_PATH.replace(/^src\//, ''))
  const input = fs.readFileSync(filename)
  const current = { bytes: input.length, sha256: sha256(input) }
  if (
    current.bytes === TARGET119_BOOTSTRAP_COSTS_OUTPUT.bytes &&
    current.sha256 === TARGET119_BOOTSTRAP_COSTS_OUTPUT.sha256
  ) {
    return Object.freeze({ status: 'already-recovered', changed: false })
  }
  if (
    current.bytes !== TARGET119_BOOTSTRAP_COSTS_INPUT.bytes ||
    current.sha256 !== TARGET119_BOOTSTRAP_COSTS_INPUT.sha256
  ) {
    throw new Error(
      `Target119 bootstrap source has unknown preimage ${current.bytes}/${current.sha256}`,
    )
  }
  const output = Buffer.from(
    buildTarget119BootstrapCostsOutput(input.toString('utf8')),
  )
  const actual = { bytes: output.length, sha256: sha256(output) }
  if (
    actual.bytes !== TARGET119_BOOTSTRAP_COSTS_OUTPUT.bytes ||
    actual.sha256 !== TARGET119_BOOTSTRAP_COSTS_OUTPUT.sha256
  ) {
    throw new Error(
      `Target119 bootstrap replay produced ${actual.bytes}/${actual.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  return Object.freeze({ status: 'recovered', changed: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-bootstrap-additional-model-costs-source-gap.mjs <source-root>',
    )
  }
  console.log(applyTarget119BootstrapCostsReplay({ sourceRoot }))
}
