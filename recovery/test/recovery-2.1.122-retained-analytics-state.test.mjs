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

test('authenticates the retained injectable analytics state surface', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    assert.equal(occurrences(bundle, 'createAnalyticsState'), 1, version)
    assert.equal(
      occurrences(bundle, '_setGlobalAnalyticsStateForTesting'),
      1,
      version,
    )
    assert.match(
      bundle,
      /createAnalyticsState:\(\)=>[\w$]+,attachAnalyticsSink:\(\)=>[\w$]+,_setGlobalAnalyticsStateForTesting:\(\)=>[\w$]+/,
      `${version}: retained exports`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(\)\{return\{eventQueue:\[\],sink:null}}/,
      `${version}: exact fresh state shape`,
    )
  }
})

test('source analytics operations share the replaceable state object', () => {
  const source = readFileSync(
    new URL('../../src/services/analytics/index.ts', import.meta.url),
    'utf8',
  )
  assert.ok(source.includes('export function createAnalyticsState()'))
  assert.ok(source.includes('let globalAnalyticsState = createAnalyticsState()'))
  assert.ok(source.includes('export function _setGlobalAnalyticsStateForTesting('))
  assert.ok(source.includes('globalAnalyticsState = state'))
  assert.ok(source.includes('const state = globalAnalyticsState'))
  assert.ok(source.includes('state.eventQueue.push({ eventName, metadata, async: false })'))
  assert.ok(source.includes('state.eventQueue.push({ eventName, metadata, async: true })'))
  assert.ok(source.includes('state.sink = newSink'))
  assert.doesNotMatch(source, /const eventQueue: QueuedEvent\[\]/)
})
