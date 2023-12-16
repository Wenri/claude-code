import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const units = [
  [9075, 7076897, 7076957, 'ebcdcc6a1f9615832f8e9685fc9936605982175c3a87b54d123ada91059cd345'],
  [9084, 7078044, 7078241, 'aa6b062f88a00a8308bd52b299f4319aab42c06cfe5d84e996022ddc9dfcfaa0'],
  [9085, 7078241, 7080012, '4f302a1616f20241640ef5f9531dc2f23eaa5aec6e1b419f5bd433b5dc757924'],
  [9086, 7080012, 7080269, 'eb872178e5bebb50ded659557e73a7d3015abaa5beb08621b2396f7a1acf4312'],
  [9087, 7080269, 7080469, '2bcff45fa054491d0846bbaaff590a63fcf95a96bd6872215face92f3c686184'],
  [9088, 7080469, 7080658, '35f92304eed59a2a6e32c716a6552a37b8bd46c960ef1a7b3df14a57833e6b05'],
  [10322, 7594179, 7598677, 'b88ba631e09392f0dd436b59872f3555ea3297a8547a8a6566df570b0f2bdee4'],
  [12487, 9566072, 9580076, 'cea9aefe3b2aabc4e92812af2a97a63221613c253b782e5fa2151fb44ca43f0a'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, pattern) {
  return value.match(pattern)?.length ?? 0
}

function functionSource(source, name) {
  const start = source.indexOf(`export function ${name}`)
  assert.notEqual(start, -1, `missing ${name}`)
  const parametersStart = source.indexOf('(', start)
  let parentheses = 0
  let parametersEnd = -1
  for (let index = parametersStart; index < source.length; index++) {
    if (source[index] === '(') parentheses++
    if (source[index] === ')' && --parentheses === 0) {
      parametersEnd = index
      break
    }
  }
  assert.notEqual(parametersEnd, -1, `unterminated parameters for ${name}`)
  const bodyStart = source.indexOf('{', parametersEnd)
  let depth = 0
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}' && --depth === 0) {
      return source.slice(start, index + 1)
    }
  }
  assert.fail(`unterminated ${name}`)
}

function assertOrdered(source, fragments) {
  let cursor = -1
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1)
    assert.notEqual(next, -1, `missing ordered fragment: ${fragment}`)
    assert.ok(next > cursor, `out-of-order fragment: ${fragment}`)
    cursor = next
  }
}

test(
  'target101 pins every beta-tracing privacy gate by exact structural unit',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
    )
    assert.equal(
      sha256(targetBytes),
      'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
    )

    const fragments = new Map()
    for (const [index, start, end, hash] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
      )
      const fragment = targetBytes.toString('utf8').slice(start, end)
      assert.equal(sha256(fragment), hash)
      fragments.set(index, fragment)
    }

    assert.match(fragments.get(9075), /OTEL_LOG_USER_PROMPTS/)
    assert.match(fragments.get(9084), /USER PROMPT/)
    assert.match(fragments.get(9085), /system_prompt_preview/)
    assert.match(fragments.get(9085), /new_context_message_count/)
    assert.match(fragments.get(9085), /system_reminders_count/)
    assert.match(fragments.get(9086), /response\.model_output/)
    assert.match(fragments.get(9087), /TOOL INPUT/)
    assert.match(fragments.get(9088), /TOOL RESULT/)
    assert.match(fragments.get(10322), /OTEL_LOG_TOOL_CONTENT/)
    assert.match(fragments.get(12487), /"structuredPatch"in/)
    assert.match(fragments.get(12487), /\.file\.content/)
    assert.match(fragments.get(12487), /"stdout"in/)
    assert.match(fragments.get(12487), /permissionDurationMs:/)

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(occurrences(baseline, /OTEL_LOG_USER_PROMPTS/g), 3)
    assert.equal(occurrences(target, /OTEL_LOG_USER_PROMPTS/g), 4)
    assert.equal(occurrences(baseline, /OTEL_LOG_TOOL_CONTENT/g), 1)
    assert.equal(occurrences(target, /OTEL_LOG_TOOL_CONTENT/g), 2)
  },
)

test(
  'source keeps safe counts but gates every prompt, model, and tool payload',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/telemetry/betaSessionTracing.ts'),
      'utf8',
    )
    const managedEnv = fs.readFileSync(
      path.join(sourceRoot, 'utils/managedEnvConstants.ts'),
      'utf8',
    )
    const toolExecution = fs.readFileSync(
      path.join(sourceRoot, 'services/tools/toolExecution.ts'),
      'utf8',
    )
    const interaction = functionSource(source, 'addBetaInteractionAttributes')
    const request = functionSource(source, 'addBetaLLMRequestAttributes')
    const response = functionSource(source, 'addBetaLLMResponseAttributes')
    const toolInput = functionSource(source, 'addBetaToolInputAttributes')
    const toolResult = functionSource(source, 'addBetaToolResultAttributes')

    assert.match(
      interaction,
      /!isBetaTracingEnabled\(\) \|\| !isUserPromptLoggingEnabled\(\)/,
    )
    assertOrdered(request, [
      "span.setAttribute('system_prompt_hash', promptHash)",
      'if (isUserPromptLoggingEnabled())',
      "span.setAttribute('system_prompt_preview', preview)",
      "span.setAttribute('system_prompt_length', newContext.systemPrompt.length)",
      'isUserPromptLoggingEnabled() && !seenHashes.has(promptHash)',
    ])
    assertOrdered(request, [
      "span.setAttribute('new_context_message_count', newMessages.length)",
      "span.setAttribute('system_reminders_count', systemReminders.length)",
      'contextParts.length > 0 && isUserPromptLoggingEnabled()',
      'systemReminders.length > 0 && isUserPromptLoggingEnabled()',
      'if (isUserPromptLoggingEnabled())',
      'lastReportedMessageHash.set(querySource, hashMessage(lastMessage))',
    ])
    assert.match(response, /!isUserPromptLoggingEnabled\(\)/)
    assert.equal(response.includes('thinkingOutput'), false)
    assert.match(toolInput, /!isToolDetailsLoggingEnabled\(\)/)
    assert.match(toolResult, /!isToolContentLoggingEnabled\(\)/)
    assert.match(managedEnv, /'OTEL_LOG_TOOL_CONTENT'/)
    assert.equal(source.includes('response.thinking_output'), false)
    assertOrdered(toolExecution, [
      'const readResult = result.data',
      "readResult.type === 'text'",
      'contentAttributes.content = readResult.file.content',
      "'structuredPatch' in result.data",
      'contentAttributes.diff = jsonStringify(result.data.structuredPatch)',
      "'stdout' in result.data",
      'contentAttributes.output = String(result.data.stdout)',
      "logEvent('tengu_tool_use_success'",
      'permissionDurationMs,',
    ])
    assert.equal(toolExecution.includes("'diff' in result.data"), false)
    assert.equal(toolExecution.includes("'output' in result.data"), false)
  },
)

test(
  'target116 retains the target101 gate surface',
  {
    skip: !latestPath
      ? 'authenticated 2.1.116 inner bundle is required'
      : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.equal(occurrences(latest, /OTEL_LOG_USER_PROMPTS/g), 4)
    assert.equal(occurrences(latest, /OTEL_LOG_TOOL_CONTENT/g), 2)
    assert.equal(occurrences(latest, /response\.thinking_output/g), 0)
  },
)
