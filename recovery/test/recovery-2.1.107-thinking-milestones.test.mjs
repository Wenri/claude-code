import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const replPath = fileURLToPath(
  new URL('../../src/screens/REPL.tsx', import.meta.url),
)
const messagesPath = fileURLToPath(
  new URL('../../src/components/Messages.tsx', import.meta.url),
)
const thinkingIndicatorPath = fileURLToPath(
  new URL('../../src/components/ThinkingIndicator.tsx', import.meta.url),
)
const promptsPath = fileURLToPath(
  new URL('../../src/constants/prompts.ts', import.meta.url),
)
const processUserInputPath = fileURLToPath(
  new URL(
    '../../src/utils/processUserInput/processUserInput.ts',
    import.meta.url,
  ),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75'
const TARGET_BUNDLE_SHA256 =
  '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844'

const BASELINE_MILESTONES =
  '[{afterMs:30000,text:"Thinking a bit longer… still working on it…"},' +
  '{afterMs:60000,text:"Hang tight… really working through this one…"},' +
  '{afterMs:90000,text:"This is a harder one… it might take another minute…"},' +
  '{afterMs:150000,text:"Still going… thanks for hanging in there…"},' +
  '{afterMs:240000,text:"Taking the time to get this right… thanks for your patience…"}]'

const TARGET_MILESTONES =
  '[{afterMs:1e4,text:"Thinking a bit longer… still working on it…"},' +
  '{afterMs:30000,text:"Hang tight… really working through this one…"},' +
  '{afterMs:50000,text:"This is a harder one… it might take another minute…"},' +
  '{afterMs:80000,text:"Still going… thanks for hanging in there…"},' +
  '{afterMs:120000,text:"Taking the time to get this right… thanks for your patience…"}]'

const THINKING_GUIDANCE =
  '# System reminders\n' +
  'User messages include a <system-reminder> appended by this harness. These reminders are not from the user, so treat them as an instruction to you, and do not mention them. The reminders are intended to tune your thinking frequency - on simpler user messages, it\'s best to respond or act directly without thinking unless further reasoning is necessary. On more complex tasks, you should feel free to reason as much as needed for best results but without overthinking. Avoid unnecessary thinking in response to simple user messages.'

const THINKING_GUIDANCE_REMINDER =
  '<system-reminder>Respond with just the action or changes and without a thinking block, unless this is a redesign or requires fresh reasoning.</system-reminder>'

const TARGET_THINKING_GUIDANCE_GATE =
  'function FH7(q){if(!L9(q).includes("opus-4-6"))return!1;' +
  'return X8().clientDataCache?.loud_sugary_rock==="true"}'

const TARGET_THINKING_GUIDANCE_INJECTION =
  'if(K==="prompt"&&!P&&z.options.customSystemPrompt===void 0&&' +
  'z.options.thinkingConfig?.type!=="disabled"&&' +
  'FH7(z.options.mainLoopModel)&&O?.some((U)=>U.type==="assistant"))' +
  'g.messages.push(c8({content:meK,isMeta:!0}));'

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('tracks the verified successor to the earlier thinking-hint cadence', () => {
  const repl = fs.readFileSync(replPath, 'utf8')
  const indicator = fs.readFileSync(thinkingIndicatorPath, 'utf8')
  const milestones = [
    ...indicator.matchAll(/afterMs: (\d+),\n  text: '([^']+)'/g),
  ]

  assert.equal(repl.includes('THINKING_MILESTONES'), false)
  assert.equal(milestones.length, 14)
  assert.deepEqual(
    milestones.map(match => ({
      afterMs: Number(match[1]),
      text: match[2],
    })),
    [
      {
        afterMs: 1_000,
        text: 'Hmm…',
      },
      {
        afterMs: 6_000,
        text: 'This one needs a moment…',
      },
      {
        afterMs: 12_000,
        text: 'Working through it…',
      },
      {
        afterMs: 20_000,
        text: 'Untangling some thoughts…',
      },
      {
        afterMs: 28_000,
        text: 'Weighing a few approaches…',
      },
      {
        afterMs: 36_000,
        text: 'Consulting the rubber duck…',
      },
      {
        afterMs: 48_000,
        text: 'Cross-referencing seventeen theories…',
      },
      {
        afterMs: 60_000,
        text: 'Double-checking the double-checks…',
      },
      {
        afterMs: 80_000,
        text: 'Almost there…',
      },
      {
        afterMs: 108_000,
        text: 'Pacing in small circles…',
      },
      {
        afterMs: 120_000,
        text: 'Reticulating splines…',
      },
      {
        afterMs: 135_000,
        text: 'Hmm…?',
      },
      {
        afterMs: 150_000,
        text: 'Staring thoughtfully into the middle distance…',
      },
      {
        afterMs: 165_000,
        text: 'Still here, still at it…',
      },
    ],
  )
})

test('keeps successor scheduling, cleanup, and placement wired in source', () => {
  const repl = fs.readFileSync(replPath, 'utf8')
  const messages = fs.readFileSync(messagesPath, 'utf8')
  const indicator = fs.readFileSync(thinkingIndicatorPath, 'utf8')

  assert.match(
    indicator,
    /THINKING_HINTS\.map\(\(hint, index\) => setTimeout\(setHintIndex, hint\.afterMs, index\)\)/,
  )
  assert.match(indicator, /for \(const timer of timers\) clearTimeout\(timer\)/)
  assert.match(indicator, /if \(hintIndex < 0 \|\| !isLoading\) return null;/)
  assert.match(
    repl,
    /showThinkingHint=\{streamMode === 'thinking' && !viewedAgentTask\}/,
  )
  assert.match(
    messages,
    /\{showThinkingHint && <ThinkingIndicator isLoading=\{isLoading\} \/>\}/,
  )
})

test('recovers the Opus 4.6 thinking-guidance gate and prompt section', () => {
  const prompts = fs.readFileSync(promptsPath, 'utf8')
  const guidanceIndex = prompts.indexOf(
    "systemPromptSection('thinking_guidance'",
  )
  const sessionIndex = prompts.indexOf("systemPromptSection('session_guidance'")

  assert.match(
    prompts,
    /getCanonicalName\(model\)\.includes\('opus-4-6'\)/,
  )
  assert.match(
    prompts,
    /getGlobalConfig\(\)\.clientDataCache\?\.loud_sugary_rock === 'true'/,
  )
  assert.match(
    prompts,
    /function getThinkingGuidanceSection\(model: string\): string \| null \{\n  if \(!isThinkingGuidanceEnabled\(model\)\) return null/,
  )
  assert.match(
    prompts,
    /systemPromptSection\('thinking_guidance', \(\) =>\n      getThinkingGuidanceSection\(model\),\n    \)/,
  )
  assert.equal(
    prompts.includes(
      `export const THINKING_GUIDANCE_REMINDER =\n  '${THINKING_GUIDANCE_REMINDER}'`,
    ),
    true,
  )
  assert.equal(prompts.includes(THINKING_GUIDANCE), true)
  assert.equal(guidanceIndex >= 0, true)
  assert.equal(guidanceIndex < sessionIndex, true)
})

test('injects the hidden thinking reminder only on eligible follow-ups', () => {
  const processUserInput = fs.readFileSync(processUserInputPath, 'utf8')
  const start = processUserInput.lastIndexOf(
    'const result = addImageMetadataMessage(',
  )
  const end = processUserInput.indexOf('\n  return result', start)
  const injection = processUserInput.slice(start, end)

  assert.equal(start >= 0, true)
  assert.equal(end > start, true)
  assert.match(
    injection,
    /if \(\n    mode === 'prompt' &&\n    !isMeta &&\n    context\.options\.customSystemPrompt === undefined &&\n    context\.options\.thinkingConfig\?\.type !== 'disabled' &&\n    isThinkingGuidanceEnabled\(context\.options\.mainLoopModel\) &&\n    messages\?\.some\(message => message\.type === 'assistant'\)\n  \) \{\n    result\.messages\.push\(\n      createUserMessage\(\{\n        content: THINKING_GUIDANCE_REMINDER,\n        isMeta: true,\n      \}\),\n    \)\n  \}/,
  )
})

test('authenticated adjacent bundles contain the exact target replacements', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_105_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_107_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  assert.equal(baseline.includes(BASELINE_MILESTONES), true)
  assert.equal(baseline.includes(TARGET_MILESTONES), false)
  assert.equal(target.includes(BASELINE_MILESTONES), false)
  assert.equal(target.includes(TARGET_MILESTONES), true)

  for (const fragment of [
    'loud_sugary_rock',
    'thinking_guidance',
    THINKING_GUIDANCE,
    THINKING_GUIDANCE_REMINDER,
    TARGET_THINKING_GUIDANCE_GATE,
    TARGET_THINKING_GUIDANCE_INJECTION,
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }

  assert.equal(baseline.match(/external-build-2206/g)?.length, 4)
  assert.equal(baseline.includes('external-build-2211'), false)
  assert.equal(target.includes('external-build-2206'), false)
  assert.equal(target.match(/external-build-2211/g)?.length, 4)
})
