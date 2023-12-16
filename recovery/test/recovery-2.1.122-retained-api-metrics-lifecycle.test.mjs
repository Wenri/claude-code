import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

test('authenticates the retained response-length and API-metrics lifecycle', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    for (const [name, count] of [
      ['addResponseLength', 13],
      ['resetResponseLength', 15],
      ['recordApiMetricsEvent', 2],
      ['pushApiMetricsEntry', 5],
      ['type:"start",ttftMs:', 2],
      ['type:"end",outputTokens:', 2],
      ['responseLengthBaseline', 2],
    ]) {
      assert.equal(occurrences(bundle, name), count, `${version}: ${name}`)
    }

    assert.equal(
      occurrences(
        bundle,
        'case"thinking_delta":return;case"signature_delta":',
      ),
      1,
      `${version}: thinking is excluded and signature bytes are estimated`,
    )
    assert.equal(
      occurrences(bundle, 'outputTokens==null'),
      1,
      `${version}: completed requests stop accepting character deltas`,
    )
    assert.match(
      bundle,
      /pushApiMetricsEntry\?\.\(\{type:"start",ttftMs:[^}]+id:[^}]+\}\).*?pushApiMetricsEntry\?\.\(\{type:"end",outputTokens:/s,
      `${version}: subagent lifecycle uses one correlated request id`,
    )
  }
})

test('source reconstructs typed metrics propagation and numeric length updates', () => {
  const tool = source('src/Tool.ts')
  const messages = source('src/utils/messages.ts')
  const remote = source('src/hooks/useRemoteSession.ts')
  const repl = source('src/screens/REPL.tsx')
  const agent = source('src/tools/AgentTool/runAgent.ts')
  const allSource = [
    tool,
    messages,
    remote,
    repl,
    agent,
    source('src/services/compact/compact.ts'),
    source('src/commands/compact/compact.ts'),
    source('src/utils/forkedAgent.ts'),
  ].join('\n')

  for (const witness of [
    "| { type: 'start'; ttftMs: number; id?: string }",
    "| { type: 'end'; outputTokens: number; id?: string }",
    'addResponseLength: (length: number) => void',
    'resetResponseLength: () => void',
    'pushApiMetricsEntry?: (event: ApiMetricsEvent) => void',
  ]) {
    assert.ok(tool.includes(witness), `ToolUseContext: ${witness}`)
  }

  for (const witness of [
    "onApiMetrics?.({ type: 'start', ttftMs: message.ttftMs })",
    'onStreamingToolUses(current => (current.length > 0 ? [] : current))',
    'onUpdateLength(deltaText.length)',
    'estimateBase64DecodedSize(message.event.delta.signature.length)',
    "type: 'end',",
    'outputTokens: message.event.usage.output_tokens',
  ]) {
    assert.ok(messages.includes(witness), `stream handler: ${witness}`)
  }

  assert.ok(remote.includes('recordApiMetricsEvent?: (event: ApiMetricsEvent) => void'))
  assert.ok(remote.includes('recordApiMetricsEvent,'))
  assert.ok(repl.includes('const recordApiMetricsEvent = useCallback((event: ApiMetricsEvent) =>'))
  assert.ok(repl.includes('apiMetricsRef.current.findLast(candidate => candidate.id == null)'))
  assert.ok(repl.includes('entry.responseLengthBaseline + event.outputTokens * 4'))
  assert.ok(repl.includes('recordApiMetricsEvent,'))
  assert.ok(agent.includes('currentApiMetricsId = randomUUID()'))
  assert.ok(agent.includes("type: 'start',"))
  assert.ok(agent.includes("type: 'end',"))
  assert.doesNotMatch(allSource, /\bsetResponseLength\b/)
})
