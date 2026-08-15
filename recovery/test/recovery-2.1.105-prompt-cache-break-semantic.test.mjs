import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const historical = sourceRoot !== path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const baselineSha256 =
  'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39'
const targetSha256 =
  '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75'
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
const pins = new Map([
  [6928, [5_006_915, 5_007_072, 'dcb87d655f7f06342994376f68f043acd15a49b78b30aed8158505daffe428b7']],
  [6929, [5_007_072, 5_007_115, '3fb5ea853135f071b1cfb9fcbf0b40179be4f0eeab73b99b57b8db43cff5c214']],
  [6930, [5_007_115, 5_007_235, '83bb210374a3cce81b013ff7290e11b975926bb35a37ccd7ea97cc73007541ee']],
  [6931, [5_007_235, 5_007_344, '6574f33de735e73e5d44c605fba1b9052855cba3c44a4a0c7420ebdb77bffaff']],
  [6932, [5_007_344, 5_007_409, 'b35aa6bb1c9d89d120044d485887574660e3a5e5b5ef90e7d1c74cdb31be7734']],
  [6933, [5_007_409, 5_007_460, 'b252196c441ac94a0bc9c0d01545ad00049a701e9af263171b1fbe60309a49ef']],
  [6934, [5_007_460, 5_007_590, 'a4c9c15acceedccd1abfc1a3584104737478f6f57a4646fb06a2c9fd63a582f8']],
  [6935, [5_007_590, 5_007_643, '3b1ffcf1cbef42db084cacd80d68c811cec7a187696b973983ebcfe91a85e264']],
  [6936, [5_007_643, 5_007_939, 'eb559132f801b795a1a5ba4790d57ac62f4e14127be08ae7cd9c7f1d2e29ab48']],
  [6937, [5_007_939, 5_008_072, '722bcb0360c849d048b92f00be638980a964831b6ad65f4eabb8c460b277e6d8']],
  [6938, [5_008_072, 5_008_167, '1dd4bbabecfb2bcba2b240d227682001e69b60f970a6939f8ce602480c8c68bd']],
  [6939, [5_008_167, 5_008_236, '589a14afd402b919d02c948386dd0f2afdc917a46dc0536c4db2b5a230ddcd0b']],
  [6940, [5_008_236, 5_008_587, 'f330f976fa88ed5df878e41d8ec61e964a1f5e93facbd357cb1e18cb105a31fa']],
  [6941, [5_008_587, 5_011_855, 'd686a2508d40f39c095ed17d7b06d3070389fb822b3facdaa8463d0874577484']],
  [6942, [5_011_855, 5_015_955, '06945cd08b07638635051832b46485ece9595f90a953431bca11d60e9d98c3b2']],
  [16680, [11_907_037, 11_926_370, 'bbfda2bbc1ab4b17bc0517435055467eaf7d187192cca516cc4a64479d438be1']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

test(
  'target105 introduces the complete prompt-cache detector and API call graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselineBundlePath || !targetBundlePath
        ? 'CLAUDE_CODE_2_1_104_BUNDLE and CLAUDE_CODE_2_1_105_BUNDLE are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.includes('tengu_prompt_cache_break'), false)
    for (const [index, [start, end, sourceHash]] of pins) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
    }
    for (const fragment of [
      'messagesHistoryChanged',
      'firstChangedMessageIndex',
      'prevBlockCount',
      'changedBlockLengthDeltas',
      'message history mutated at index ',
      'overage state changed (TTL flip expected)',
      'messagesForAPI:',
    ]) {
      assert.ok(target.includes(fragment), fragment)
    }
  },
)

test(
  'source owns target105 cache-key inputs, mutation causes, and Cowork-only reachability',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const detector = source('services/api/promptCacheBreakDetection.ts')
    const caller = source('services/api/claude.ts')
    for (const fragment of [
      "const BILLING_HEADER_PREFIX = 'x-anthropic-billing-header:'",
      'serverName === COMPUTER_USE_MCP_SERVER_NAME',
      'function sanitizeMessageContent(value: unknown)',
      'const computeBlockHashes = () => strippedSystem.map(computeHash)',
      'const messageHashes = messagesForAPI',
      'const firstChangedMessageIndex = prev.messageHashes.findIndex(',
      'messagesHistoryChanged,',
      'prevMessageCount: prev.messageHashes.length',
      'prevBlockCount,',
      'newBlockCount,',
      'changedBlockIndices,',
      'changedBlockLengthDeltas,',
      'message history mutated at index',
      "overage state changed (TTL flip expected)",
      'isCowork: isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)',
    ]) {
      assert.ok(detector.includes(fragment), fragment)
    }
    assert.equal(
      caller.match(
        /if \(isEnvTruthy\(process\.env\.CLAUDE_CODE_IS_COWORK\)\)/g,
      )?.length,
      2,
    )
    assert.ok(caller.includes('messagesForAPI,'))

    if (historical) {
      assert.equal(detector.includes('systemHash: state.systemHash'), false)
      assert.equal(detector.includes('toolsHash: state.toolsHash'), false)
      assert.equal(detector.includes('getPersistedStatePath'), false)
      assert.equal(caller.includes("is1hCacheTTL: cacheTtl === '1h'"), false)
    }
  },
)
