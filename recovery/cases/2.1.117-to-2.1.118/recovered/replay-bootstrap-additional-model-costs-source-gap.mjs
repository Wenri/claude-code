import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/services/api/bootstrap.ts'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

export const TARGET118_BOOTSTRAP_COSTS_INPUT = Object.freeze({
  path: SOURCE_PATH,
  bytes: 4634,
  sha256: '947aee6acdef6f1cb6310b3953063ad7c7985757bff7f57df6679a9bb440a7d5',
})

export const TARGET118_BOOTSTRAP_COSTS_OUTPUT = Object.freeze({
  path: SOURCE_PATH,
  bytes: 5323,
  sha256: '652ce2e8c95a2b46e6dad10170e5e580b3ea138fad2da20e59df21130b3692a4',
})

export const TARGET118_BOOTSTRAP_COSTS_DONOR = Object.freeze({
  path: SOURCE_PATH,
  release: '2.1.120',
  bytes: 7368,
  sha256: 'a3373ca1b67fcb2a65e4bcd76b158f945c54b0395c91356917fbc1489acbfa6d',
  blockBytes: 689,
  blockSha256:
    '4a0dd60c91117bfd6bbe00f311b504b5a6dbd2bf27ca09f96056a5ab63160295',
})

export const TARGET118_BOOTSTRAP_COSTS_EVIDENCE_IDS = Object.freeze([
  'target118-bootstrap-additional-model-costs-target-fragment',
  'target118-bootstrap-additional-model-costs-source-replay-test',
  'target118-bootstrap-additional-model-costs-source-ast-test',
])

export const TARGET118_BOOTSTRAP_COSTS_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20277`,
    targetIndex: 20277,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze(['bootstrapResponseSchema']),
    evidenceIds: TARGET118_BOOTSTRAP_COSTS_EVIDENCE_IDS,
    behavior:
      'The complete Target117 and Target118 bootstrap-schema units are compiler-identical and accept additional per-model token and web-search costs, transforming wire-format fields into the runtime cache shape. Their exact historical source file is the same pinned preimage and omits only that retained schema block, so the bounded replay restores the authenticated 689-byte declaration fragment atomically and rejects every other source state.',
  }),
])

export const TARGET118_BOOTSTRAP_COSTS_BLOCK = `    additional_model_costs: z
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
${TARGET118_BOOTSTRAP_COSTS_BLOCK}  }),
)
`

export function buildTarget118BootstrapCostsOutput(input) {
  if (input.split(ANCHOR_BEFORE).length !== 2) {
    throw new Error(`${SOURCE_PATH}: bootstrap schema anchor differs`)
  }
  return input.replace(ANCHOR_BEFORE, ANCHOR_AFTER)
}

function resolveSourceFile(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, SOURCE_PATH.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${SOURCE_PATH}: escapes source root`)
  }
  return filename
}

export function applyTarget118BootstrapCostsSourceRecovery({ sourceRoot }) {
  const filename = resolveSourceFile(sourceRoot)
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${SOURCE_PATH}: expected a real source file`)
  }
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    actual.bytes === TARGET118_BOOTSTRAP_COSTS_OUTPUT.bytes &&
    actual.sha256 === TARGET118_BOOTSTRAP_COSTS_OUTPUT.sha256
  ) {
    return Object.freeze({ changed: false, path: SOURCE_PATH })
  }
  if (
    actual.bytes !== TARGET118_BOOTSTRAP_COSTS_INPUT.bytes ||
    actual.sha256 !== TARGET118_BOOTSTRAP_COSTS_INPUT.sha256
  ) {
    throw new Error(
      `${SOURCE_PATH}: unsupported preimage ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = Buffer.from(buildTarget118BootstrapCostsOutput(input.toString()))
  const outputDescriptor = descriptor(output)
  if (
    outputDescriptor.bytes !== TARGET118_BOOTSTRAP_COSTS_OUTPUT.bytes ||
    outputDescriptor.sha256 !== TARGET118_BOOTSTRAP_COSTS_OUTPUT.sha256
  ) {
    throw new Error(
      `${SOURCE_PATH}: constructed output differs from postimage pin ` +
        `${outputDescriptor.bytes}/${outputDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  return Object.freeze({ changed: true, path: SOURCE_PATH })
}
