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

test('authenticates retained injectable auto-mode state namespace', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(occurrences(bundle, 'createAutoModeState'), 1, version)
    assert.equal(
      occurrences(bundle, '_setGlobalAutoModeStateForTesting'),
      1,
      version,
    )
    assert.equal(occurrences(bundle, 'flagCli'), 3, version)
    assert.equal(occurrences(bundle, 'circuitBroken'), 3, version)
    assert.match(
      bundle,
      /createAutoModeState:\(\)=>[\w$]+,_setGlobalAutoModeStateForTesting:\(\)=>[\w$]+/,
      `${version}: retained exports`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(\)\{return\{active:!1,flagCli:!1,circuitBroken:!1}}/,
      `${version}: fresh state factory`,
    )
  }
})

test('source getters and setters share the replaceable state object', () => {
  const source = readFileSync(
    new URL('../../src/utils/permissions/autoModeState.ts', import.meta.url),
    'utf8',
  )

  assert.ok(source.includes('export function createAutoModeState()'))
  assert.ok(source.includes('let globalAutoModeState = createAutoModeState()'))
  assert.ok(
    source.includes(
      'export function _setGlobalAutoModeStateForTesting(state: AutoModeState)',
    ),
  )
  assert.ok(source.includes('globalAutoModeState = state'))
  for (const property of ['active', 'flagCli', 'circuitBroken']) {
    assert.ok(
      source.includes(`globalAutoModeState.${property}`),
      `shared ${property} property`,
    )
  }
  assert.doesNotMatch(source, /let autoMode(?:Active|FlagCli|CircuitBroken)/)
})
