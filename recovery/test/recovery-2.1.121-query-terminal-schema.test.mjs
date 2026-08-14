import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundleSpecs = [
  {
    env: 'CLAUDE_CODE_2_1_120_BUNDLE',
    bytes: 13_784_743,
    sha256:
      'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  },
  {
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
]

const terminalReasons = [
  'blocking_limit',
  'rapid_refill_breaker',
  'prompt_too_long',
  'image_error',
  'model_error',
  'aborted_streaming',
  'aborted_tools',
  'stop_hook_prevented',
  'hook_stopped',
  'tool_deferred',
  'max_turns',
  'completed',
]

const terminalDescription =
  'Why the query loop terminated. Unset when the loop was bypassed (local slash command) or interrupted externally (budget/retry limits checked between yields).'

function loadBundle({ env, bytes, sha256 }) {
  const filename = process.env[env]
  assert.ok(filename, `${env} must be set`)
  const contents = fs.readFileSync(filename)
  assert.equal(contents.length, bytes, `${env}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(contents).digest('hex'),
    sha256,
    `${env}: SHA-256`,
  )
  return contents.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

test('authenticated adjacent bundles contain the exact inherited terminal result surface', () => {
  const reasonLiteral = JSON.stringify(terminalReasons)
  for (const bundle of bundleSpecs.map(loadBundle)) {
    assert.equal(occurrences(bundle, reasonLiteral), 1, 'terminal reason enum')
    assert.equal(occurrences(bundle, terminalDescription), 1, 'description')
    assert.equal(occurrences(bundle, 'terminal_reason:'), 6)
    assert.equal(occurrences(bundle, 'apiErrorStatus'), 2)

    assert.match(
      bundle,
      /async function\*[\w$]+\(([\w$]+),([\w$]+)\)\{\2\.value=yield\*\1\}/,
      'query return collector',
    )
    assert.match(
      bundle,
      /function [\w$]+\(([\w$]+),([\w$]+),([\w$]+)\)\{let ([\w$]+)=[\w$]+\(\1,\2,\3\);if\(\1 instanceof [\w$]+&&typeof \1\.status==="number"\)\4\.apiErrorStatus=\1\.status;return \4\}/,
      'API status is retained on synthetic assistant errors',
    )
    assert.match(
      bundle,
      /is_error:[\w$]+\.boolean\(\),api_error_status:[\w$]+\.number\(\)\.nullable\(\)\.optional\(\),num_turns:/,
      'nullable API status schema',
    )
    assert.match(
      bundle,
      /structured_output:[\w$]+\.unknown\(\)\.optional\(\),deferred_tool_use:[\w$]+\(\)\.optional\(\),terminal_reason:[\w$]+\(\)\.optional\(\)/,
      'success schema terminal fields',
    )
    assert.match(
      bundle,
      /stop_reason:"tool_deferred"[\s\S]{0,500}?deferred_tool_use:[\w$]+[\s\S]{0,80}?terminal_reason:[\w$]+\.value\?\.reason/,
      'deferred terminal result',
    )
    assert.match(
      bundle,
      /subtype:"error_max_turns"[\s\S]{0,700}?terminal_reason:[\w$]+\.value\?\.reason/,
      'max-turn terminal result',
    )
    assert.match(
      bundle,
      /subtype:"error_during_execution"[\s\S]{0,700}?terminal_reason:[\w$]+\.value\?\.reason/,
      'execution-error terminal result',
    )
    assert.match(
      bundle,
      /attachment\.type==="hook_stopped_continuation"\)([\w$]+)=!0;if\([\w$]+\.message\.type==="attachment"&&[\w$]+\.message\.attachment\.type==="hook_deferred_tool"\)([\w$]+)=!0;[\s\S]{0,6000}?if\(\2\)return\{reason:"tool_deferred"\};if\(\1\)/,
      'deferred tools terminate distinctly before stopped hooks',
    )
    assert.match(
      bundle,
      /is_error:[\w$]+,api_error_status:[\w$]+[\s\S]{0,700}?structured_output:[\w$]+,terminal_reason:[\w$]+\.value\?\.reason/,
      'normal terminal result',
    )
  }
})

test('source captures query return and emits terminal reason only after natural loop completion', () => {
  const engine = compact(source('src/QueryEngine.ts'))
  assert.ok(
    engine.includes('state.value = yield* generator'),
    'collector must retain the delegated generator return',
  )
  assert.match(
    engine,
    /const queryTerminalState: \{ value\?: \{ reason: string \} \} = \{\} for await \(const message of captureGeneratorReturn\( query\(/,
  )
  assert.match(
    engine,
    /message\.attachment\.type === 'max_turns_reached'\) \{ maxTurnsResult = \{ turnCount: message\.attachment\.turnCount, maxTurns: message\.attachment\.maxTurns, \} continue \}/,
  )
  assert.equal(
    occurrences(
      engine,
      'terminal_reason: queryTerminalState.value?.reason',
    ),
    4,
    'only natural query-loop terminals carry terminal_reason',
  )

  const loopEnd = engine.indexOf("if (deferredToolResult) { yield { type: 'result'")
  const maxTurnEnd = engine.indexOf('if (maxTurnsResult) {', loopEnd)
  const executionError = engine.indexOf(
    "subtype: 'error_during_execution'",
    maxTurnEnd,
  )
  const normalSuccess = engine.indexOf(
    'api_error_status: apiErrorStatus',
    executionError,
  )
  assert.ok(loopEnd !== -1)
  assert.ok(loopEnd < maxTurnEnd)
  assert.ok(maxTurnEnd < executionError)
  assert.ok(executionError < normalSuccess)

  const localBypass = engine.slice(
    engine.indexOf('if (!shouldQuery)'),
    engine.indexOf('if (fileHistoryEnabled()', engine.indexOf('if (!shouldQuery)')),
  )
  assert.equal(localBypass.includes('terminal_reason:'), false)

  const budgetResult = engine.slice(
    engine.indexOf("subtype: 'error_max_budget_usd'"),
    engine.indexOf('// Check if structured output retry limit exceeded'),
  )
  assert.equal(budgetResult.includes('terminal_reason:'), false)

  assert.match(
    engine,
    /let apiErrorStatus: number \| null = null[\s\S]*?apiErrorStatus\?: number[\s\S]*?\.apiErrorStatus \?\? null[\s\S]*?api_error_status: apiErrorStatus/,
  )

  const querySource = compact(source('src/query.ts'))
  assert.match(
    querySource,
    /update\.message\.attachment\.type === 'hook_deferred_tool'\s*\) \{ shouldDeferTool = true \}/,
  )
  assert.match(
    querySource,
    /if \(shouldDeferTool\) \{ return \{ reason: 'tool_deferred' \} \} \/\/ If a hook indicated to prevent continuation/,
  )
})

test('core and control schemas expose the exact bounded terminal contract', () => {
  const transitions = compact(source('src/query/transitions.ts'))
  for (const reason of terminalReasons) {
    assert.ok(transitions.includes(`'${reason}'`), reason)
  }
  assert.match(
    transitions,
    /export const QUERY_TERMINAL_REASONS = \[[\s\S]*?\] as const/,
  )
  assert.match(transitions, /export type Terminal =/)
  assert.match(transitions, /reason: 'max_turns'; turnCount: number/)
  assert.match(transitions, /reason: 'model_error'; error: unknown/)

  const schemas = compact(source('src/entrypoints/sdk/coreSchemas.ts'))
  assert.ok(schemas.includes(terminalDescription))
  assert.match(
    schemas,
    /api_error_status: z\.number\(\)\.nullable\(\)\.optional\(\)/,
  )
  assert.match(
    schemas,
    /deferred_tool_use: SDKDeferredToolUseSchema\(\)\.optional\(\), terminal_reason: SDKQueryTerminalReasonSchema\(\)\.optional\(\)/,
  )
  assert.equal(
    occurrences(
      schemas,
      'terminal_reason: SDKQueryTerminalReasonSchema().optional()',
    ),
    2,
  )

  const control = compact(source('src/entrypoints/sdk/controlSchemas.ts'))
  assert.match(
    control,
    /export const StdoutMessageSchema[\s\S]*?SDKMessageSchema\(\)/,
    'control stdout transitively validates terminal result fields',
  )
})

test('API error normalization retains numeric HTTP status for QueryEngine results', () => {
  const errors = compact(source('src/services/api/errors.ts'))
  assert.match(
    errors,
    /const message = getAssistantMessageFromErrorInternal\(error, model, options\)[\s\S]*?error instanceof APIError && typeof error\.status === 'number'[\s\S]*?apiErrorStatus = error\.status[\s\S]*?return message/,
  )
})
