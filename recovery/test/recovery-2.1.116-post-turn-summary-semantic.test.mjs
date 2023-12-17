import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = new Map([
  [9937, [4985432, 5023859, 'cf339e7e94058cc99c9821b1bed6cc53adadd2b8bdfd3040f3d29a480e9a411a']],
  [19347, [11842064, 11842286, 'fabb82887cfaca9145ecf65d3ce148df58e5d06f0d6b1aac38e1a255c1ad8895']],
  [20531, [12874058, 12874090, '200d2a5467e018da50bf28937493d67cc466fd3ebc400e25ff0da856ce7c90b2']],
  [20532, [12874090, 12874196, '46d50efaadd5d1d605572a093eee82a0e6956e797ee2f45cf0f9475ef1d98636']],
  [20533, [12874196, 12874422, '450d7b2207476d349a24db4bff565cc1970a5b984286b491535f87681efd8fac']],
  [20534, [12874422, 12878269, '87c905b4b976b196dfe4e7fa4271ab0b0e3650d92ac1a46f3d1b1a451885b53f']],
  [20535, [12878269, 12878428, '9493fd9d627a60ed04167357262f0edd4b0f9bc6708335e6793b3d9e975f3833']],
  [20536, [12878428, 12878751, '8b134e4306d764ad1e4713aee616b9e5d535511697eb9f23718941de729202c9']],
  [20537, [12878751, 12878773, 'db2d339c3c9bc076b72e0adaee537a93f6cfadf7969577dc0d0b9ea14be974e7']],
  [20538, [12878773, 12879771, 'ddd94de9a898f80453e8289b0175762e97161b8194800e38edf99877d7d79646']],
  [20539, [12879771, 12880329, 'bc28181e9d9d500a407685a3bc71e9775861bd5d43f96b4881903d0ab7301f72']],
  [20540, [12880329, 12881087, 'f2d71cb2c8dad4d1a0d0e73e57e618bd62b9813eed594d1a8a4a52bebdfc098e']],
  [20541, [12881087, 12881141, '001e67fca66fce6e3bb4bc899fce56f433a6c3cecff7ff236db7d4153fbb2e43']],
  [20542, [12881141, 12881389, 'e3319e67e4907d3c312ce3e900b2ab62fe01e931311f3644648402e0ddf49a3e']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target 2.1.116 pins every post-turn-summary structural unit', bundleOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(targetBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }
})

test('post-turn summaries appear only at the authenticated 114 to 116 boundary', bundleOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'tengu_ccr_post_turn_summary',
    'You are now producing a post-turn summary for this Claude Code session.',
    'Post-turn summary cannot use tools',
    'querySource:"post_turn_summary"',
    'subtype:"post_turn_summary"',
    '[post-turn-summary] blocked:',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
})

test('source owns the target summary schema, prompt, validation, and fork', sourceOptions, () => {
  const owner = assertFragments('src/services/postTurnSummary.ts', [
    'tengu_ccr_post_turn_summary',
    "status_category: z.enum(['blocked', 'completed', 'review_ready'])",
    "status_category: 'review_ready'",
    'Return this title VERBATIM unless the session',
    'The JSON must have exactly these fields:',
    'status_category — pick one based on who unblocks the session next:',
    ".replace(/^```(?:json)?\\s*/i, '')",
    "parsed.data.status_category === 'completed'",
    'const MAX_VALIDATION_NUDGES = 2',
    'const POST_TURN_DELAY_MS = 2_000',
    "message: 'Post-turn summary cannot use tools'",
    "querySource: 'post_turn_summary'",
    "forkLabel: 'post_turn_summary'",
    'maxTurns: 1',
    'skipCacheWrite: true',
    'skipTranscript: true',
    'skipDelay: true',
    '[post-turn-summary] blocked:',
    "subtype: 'post_turn_summary'",
    'summarizes_uuid: assistant.uuid',
  ])
  assert.ok(
    owner.indexOf('for (let attempt = 0; attempt <= MAX_VALIDATION_NUDGES; attempt++)') <
      owner.indexOf('[post-turn-summary] gave up after'),
  )
})

test('print mode owns blocked, turn-end, restore, and output-filter call paths', sourceOptions, () => {
  const print = assertFragments('src/cli/print.ts', [
    "from 'src/services/postTurnSummary.js'",
    "structuredIO.sessionState.notifyStateChanged('requires_action', details)",
    'triggerBlockedPostTurnSummary(details)',
    'setPostTurnSummaryContextBuilder(async () => {',
    'await buildSideQuestionFallbackParams({',
    'forkContextMessages: [...mutableMessages]',
    "message.subtype === 'post_turn_summary'",
    'triggerPostTurnSummary(mutableMessages, message =>',
    'hydratePostTurnSummary(metadata.post_turn_summary)',
  ])
  assert.ok(
    print.indexOf(
      "structuredIO.sessionState.notifyStateChanged('requires_action', details)",
    ) <
      print.indexOf('triggerBlockedPostTurnSummary(details)'),
  )
  assert.ok(
    print.indexOf('setPostTurnSummaryContextBuilder(async () => {') <
      print.indexOf('triggerPostTurnSummary(mutableMessages, message =>'),
  )
})

test('SDK schemas and direct-connect routing carry the new system event without rendering it', sourceOptions, () => {
  assertFragments('src/entrypoints/sdk/coreSchemas.ts', [
    "subtype: z.literal('post_turn_summary')",
    'summarizes_uuid: z.string()',
    "status_category: z.enum(['blocked', 'completed', 'review_ready'])",
    'status_detail: z.string()',
    'needs_action: z.string()',
    "type: z.literal('transcript_mirror')",
    "type: z.literal('mirror_error')",
  ])
  const direct = assertFragments('src/server/directConnectManager.ts', [
    "if (parsed.type === 'control_request')",
    'continue',
    "parsed.type !== 'control_response'",
    "parsed.type !== 'keep_alive'",
    "parsed.type !== 'control_cancel_request'",
    "parsed.type !== 'transcript_mirror'",
    "parsed.subtype === 'post_turn_summary'",
  ])
  assert.ok(
    direct.indexOf("parsed.type !== 'transcript_mirror'") <
      direct.indexOf("parsed.subtype === 'post_turn_summary'"),
  )
  assert.equal(direct.includes("parsed.type !== 'streamlined_text'"), false)
  assert.equal(
    direct.includes("parsed.type !== 'streamlined_tool_use_summary'"),
    false,
  )
})
