import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.105-to-2.1.107'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const targetSha256 =
  '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844'
const baselineSha256 =
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_105_BUNDLE is not set'
      : false,
}
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')

const guidance = `# System reminders
User messages include a <system-reminder> appended by this harness. These reminders are not from the user, so treat them as an instruction to you, and do not mention them. The reminders are intended to tune your thinking frequency - on simpler user messages, it's best to respond or act directly without thinking unless further reasoning is necessary. On more complex tasks, you should feel free to reason as much as needed for best results but without overthinking. Avoid unnecessary thinking in response to simple user messages.`
const reminder =
  '<system-reminder>Respond with just the action or changes and without a thinking block, unless this is a redesign or requires fresh reasoning.</system-reminder>'
const milestones =
  '[{afterMs:1e4,text:"Thinking a bit longer… still working on it…"},' +
  '{afterMs:30000,text:"Hang tight… really working through this one…"},' +
  '{afterMs:50000,text:"This is a harder one… it might take another minute…"},' +
  '{afterMs:80000,text:"Still going… thanks for hanging in there…"},' +
  '{afterMs:120000,text:"Taking the time to get this right… thanks for your patience…"}]'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

test('2.1.107 evidence pins every changed thinking and agent-model unit', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  const expected = new Map([
    [9197, [7122271, 7122808, 'ad09e94881755dc5e28d27e16f580aa898825851c053ad2fc70de9be01bd8dc0']],
    [9198, [7122808, 7122893, 'c1d2cbcfd2dfb15445b05d6621ce4a89ad5d3dfca22890eeb0dd17f386fc7f0d']],
    [9203, [7123588, 7123660, '3c1e67d3e0fe5e406a9257c24b2e2ae22e7fedba3656929b39cb31aead4c48db']],
    [16605, [11866971, 11867082, '542c284f450ad8092fdde41cc6e26044ac3fdb6d088252e310f9a07cd00070af']],
    [16607, [11868470, 11869067, 'cea7c101cbb8807418a5df4c90eb1552343ffd392bec2e18774e7999f49e8ea2']],
    [16622, [11886599, 11887781, '7fb2d5f45700842561bdb6039a715d5193a0950b0dfc972e012bf703d7fa857a']],
    [16636, [11892617, 11893877, '255b679f090997e7051fbfd25c81eff0233969517bd288557d5335cc556f2392']],
    [17923, [12541597, 12544573, 'e17eec7b285c6a59d7202998c7b26f070b77487f73cee27eb7ea9c9ed2428614']],
    [17925, [12544690, 12544794, '8a811244b46d01d1069a92f8716d4dfa90fb6f910c1990df08053530cb9f315e']],
    [18391, [12791146, 12792994, 'ee09dca3df8ed15190127ea688573b041030fa9447382392f32ea3823f2505d0']],
  ])
  for (const [index, identity] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    assert.equal(
      sha256(bundle.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
    )
  }

  const mergedAgent = bundle.slice(
    structural.regions[9198].target.start,
    structural.regions[9198].target.end,
  )
  for (const fragment of ['sJ()', '!xW(q)', 'includes("opus-4-6")', 'q+"[1m]"']) {
    assert.ok(mergedAgent.includes(fragment), fragment)
  }
  assert.ok(bundle.slice(structural.regions[9197].target.start, structural.regions[9197].target.end).includes('nc4(X5('))
  assert.ok(bundle.slice(structural.regions[16605].target.start, structural.regions[16605].target.end).includes('loud_sugary_rock'))
  assert.ok(bundle.slice(structural.regions[16607].target.start, structural.regions[16607].target.end).includes(guidance))
  assert.ok(bundle.slice(structural.regions[16622].target.start, structural.regions[16622].target.end).includes('Jv("thinking_guidance"'))
  assert.ok(bundle.slice(structural.regions[16636].target.start, structural.regions[16636].target.end).includes(reminder))
  const input = bundle.slice(structural.regions[17923].target.start, structural.regions[17923].target.end)
  for (const fragment of ['K==="prompt"', '!P', 'customSystemPrompt===void 0', 'thinkingConfig?.type!=="disabled"', 'O?.some((U)=>U.type==="assistant")', 'isMeta:!0']) {
    assert.ok(input.includes(fragment), fragment)
  }
  assert.ok(bundle.slice(structural.regions[18391].target.start, structural.regions[18391].target.end).includes(milestones))
})

test('2.1.107 source recovers the exact historical agent merge and thinking guidance', sourceOptions, () => {
  const agent = source('src/utils/model/agent.ts')
  const prompts = source('src/constants/prompts.ts')
  const input = source('src/utils/processUserInput/processUserInput.ts')

  for (const fragment of [
    "systemPromptSection('thinking_guidance'",
    guidance,
    reminder,
  ]) {
    assert.ok(prompts.includes(fragment), fragment)
  }
  for (const fragment of [
    "mode === 'prompt'",
    '!isMeta',
    'context.options.customSystemPrompt === undefined',
    "context.options.thinkingConfig?.type !== 'disabled'",
    "messages?.some(message => message.type === 'assistant')",
    'content: THINKING_GUIDANCE_REMINDER',
    'isMeta: true',
  ]) {
    assert.ok(input.includes(fragment), fragment)
  }

  if (isCurrentSource) {
    for (const fragment of [
      "getCanonicalName(model).includes('opus-4-7')",
      "'tengu_loud_sugary_rock'",
      'getFeatureValue_CACHED_MAY_BE_STALE(',
    ]) {
      assert.ok(prompts.includes(fragment), fragment)
    }
    for (const fragment of [
      'function applyMergedOpusContext(model: string)',
      "getCanonicalName(model).includes('opus') && modelSupports1M(model)",
      'isOpus1mMergeEnabled()',
      '!has1mContext(model)',
      'applyMergedOpusContext(',
    ]) {
      assert.ok(agent.includes(fragment), fragment)
    }
  } else {
    for (const fragment of [
      "getCanonicalName(model).includes('opus-4-6')",
      "getGlobalConfig().clientDataCache?.loud_sugary_rock === 'true'",
    ]) {
      assert.ok(prompts.includes(fragment), fragment)
    }
    for (const fragment of [
      'function applyMergedOpus46Context(model: string)',
      "getCanonicalName(model).includes('opus-4-6')",
      'isOpus1mMergeEnabled()',
      '!has1mContext(model)',
      'applyMergedOpus46Context(parseUserSpecifiedModel(toolSpecifiedModel))',
      'applyMergedOpus46Context(parseUserSpecifiedModel(agentModelWithExp))',
    ]) {
      assert.ok(agent.includes(fragment), fragment)
    }
    assert.equal(agent.includes('modelSupports1M'), false)

    const repl = source('src/screens/REPL.tsx')
    for (const value of [10000, 30000, 50000, 80000, 120000]) {
      assert.ok(repl.includes(`afterMs: ${value}`), value)
    }
  }
})

test('the adjacent 2.1.105 bundle lacks the introduced runtime branches', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), baselineSha256)
  const baseline = bytes.toString('utf8')
  for (const fragment of [
    'loud_sugary_rock',
    reminder,
    milestones,
    'function nc4(q){if(sJ()&&!xW(q)&&L9(q).includes("opus-4-6"))',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
  }
})
