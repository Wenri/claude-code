import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

const pinnedUnits = new Map([
  [
    16062,
    [
      11598125,
      11601875,
      '628d73c8a22d663744cafff7e24838088892a20bccb10f38864d72ba07031a58',
    ],
  ],
  [
    16063,
    [
      11601875,
      11602137,
      'ec2c9872c52bafe8476f56e115fd7d4aaa23a1a8102949b5bf72ffff7c638d57',
    ],
  ],
  [
    16064,
    [
      11602137,
      11602275,
      '01ef437516cc85f453f3cc2ada5177b2f4195f4e46f6ac5b9814af43ffbf677f',
    ],
  ],
  [
    16065,
    [
      11602275,
      11603057,
      '1f411ca4beb78aec292a25371b0ace2244abc0928ff219042a17203ad60e717d',
    ],
  ],
  [
    16066,
    [
      11603057,
      11603069,
      '857474747297773f0a4ca1275adb128fdfa3337296581cbabf083cb2967eed2f',
    ],
  ],
])

test(
  '2.1.97 hook-evaluator evidence pins the prompt, usage, estimate, truncation, and budget units',
  bundleOptions,
  () => {
    const bundleBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bundleBytes), targetSha256)
    const bundle = bundleBytes.toString('utf8')

    for (const [index, [start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      'Hooks: prompt-hook evaluator API error: ',
      'Hook evaluator API error: ',
      'tengu_hook_prompt_transcript_truncated',
      'Earlier conversation truncated to fit the hook evaluator\'s context window',
      'insufficient evidence in transcript',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'source restores the exact prompt-hook API-error and transcript-truncation control flow',
  sourceOptions,
  () => {
    const hook = source('src/utils/hooks/execPromptHook.ts')
    for (const fragment of [
      'const PROMPT_HOOK_TRANSCRIPT_BUDGET_RATIO = 0.7',
      'message.message.model !== SYNTHETIC_MODEL',
      'usage.input_tokens +',
      '(usage.cache_creation_input_tokens ?? 0)',
      '(usage.cache_read_input_tokens ?? 0)',
      'usage.output_tokens',
      'modelSupports1M(model)',
      '? 1_000_000',
      ': MODEL_CONTEXT_WINDOW_DEFAULT',
      'groupMessagesByApiRound(messages)',
      'roughTokenCountEstimationForMessage(message)',
      'jsonStringify(message).length / 4',
      'firstRetainedGroup < groups.length',
      "logEvent('tengu_hook_prompt_transcript_truncated'",
      'droppedMessages,',
      'keptMessages: retained.length',
      'evaluatorModel: model',
      'Earlier conversation truncated to fit the hook evaluator\'s context window',
      '...truncateStopTranscript(messages, model)',
      'if (response.isApiErrorMessage)',
      'Hooks: prompt-hook evaluator API error:',
      'Hook evaluator API error:',
    ]) {
      assert.ok(hook.includes(fragment), fragment)
    }

    assert.ok(
      hook.indexOf('const model = hook.model ?? getSmallFastModel()') <
        hook.indexOf('truncateStopTranscript(messages, model)'),
    )
    assert.ok(
      hook.indexOf('cleanupSignal()') <
        hook.indexOf('if (response.isApiErrorMessage)'),
    )
    assert.ok(
      hook.indexOf('if (response.isApiErrorMessage)') <
        hook.indexOf('// Extract text content from response'),
    )
  },
)

test('latest assistant usage ignores synthetic messages and sums all token classes', () => {
  function latestUsage(messages) {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]
      if (
        message.type === 'assistant' &&
        'usage' in message.message &&
        message.message.model !== '<synthetic>'
      ) {
        const usage = message.message.usage
        return (
          usage.input_tokens +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          usage.output_tokens
        )
      }
    }
    return 0
  }

  assert.equal(
    latestUsage([
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: {
            input_tokens: 10,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 30,
            output_tokens: 40,
          },
        },
      },
      {
        type: 'assistant',
        message: {
          model: '<synthetic>',
          usage: {
            input_tokens: 999,
            cache_creation_input_tokens: 999,
            cache_read_input_tokens: 999,
            output_tokens: 999,
          },
        },
      },
    ]),
    100,
  )
  assert.equal(latestUsage([]), 0)
})

test('truncation retains at least the newest complete API round', () => {
  function retainNewestGroups(groupTokens, budget) {
    let estimatedTokens = 0
    let firstRetainedGroup = groupTokens.length
    for (let index = groupTokens.length - 1; index >= 0; index--) {
      const tokens = groupTokens[index]
      if (
        firstRetainedGroup < groupTokens.length &&
        estimatedTokens + tokens > budget
      ) {
        break
      }
      estimatedTokens += tokens
      firstRetainedGroup = index
    }
    return firstRetainedGroup
  }

  assert.equal(retainNewestGroups([40, 60, 80], 140), 1)
  assert.equal(retainNewestGroups([40, 60, 180], 140), 2)
  assert.equal(retainNewestGroups([40, 60, 80], 1_000), 0)
})
