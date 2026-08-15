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

function identifierOccurrences(text, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.match(new RegExp(`\\b${escaped}\\b`, 'g'))?.length ?? 0
}

test('authenticates the retained bootstrap runtime-state namespace', () => {
  const exportedNames = [
    'setMcpClientsAccessor',
    'getMcpClientsFromAccessor',
    'setHasStreamingInput',
    'getHasStreamingInput',
    'setFridayFundayDisabledForSession',
    'getFridayFundayDisabledForSession',
    'setCaps',
    'getCaps',
    'setActiveRoutine',
    'getActiveRoutine',
    'activateInput',
    'deactivateInput',
    'clearInputsForServer',
    'isInputActive',
    'getActiveInputsForServer',
    'resetStartTime',
    'incrementPromptIndex',
  ]
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    for (const name of exportedNames) {
      assert.equal(identifierOccurrences(bundle, name), 1, `${version}: ${name}`)
    }
    assert.equal(occurrences(bundle, 'hasStreamingInput'), 3, version)
    assert.equal(
      occurrences(bundle, 'fridayFundayDisabledForSession'),
      3,
      version,
    )
    assert.equal(occurrences(bundle, 'activeRoutine'), 3, version)
    assert.equal(occurrences(bundle, 'activeInputs'), 7, version)
    assert.match(
      bundle,
      /hasStreamingInput:!1,fridayFundayDisabledForSession:!1/,
      `${version}: retained defaults`,
    )
    assert.match(
      bundle,
      /activeRoutine:void 0,systemPromptSectionCache:new Map/,
      `${version}: routine default`,
    )
    assert.match(
      bundle,
      /allowedChannels:\[\],activeInputs:new Map/,
      `${version}: active input map`,
    )
  }
})

test('source restores retained runtime state and its live consumers', () => {
  const read = relative =>
    readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
  const state = read('src/bootstrap/state.ts')
  const appState = read('src/state/AppState.tsx')
  const hooks = read('src/utils/hooks.ts')
  const mcpHook = read('src/utils/hooks/execMcpToolHook.ts')
  const print = read('src/cli/print.ts')
  const mcpConnections = read('src/services/mcp/useManageMCPConnections.ts')
  const spare = read('src/daemon/spare.ts')

  assert.ok(state.includes('hasStreamingInput: false'))
  assert.ok(state.includes('fridayFundayDisabledForSession: false'))
  assert.ok(state.includes('activeRoutine: undefined'))
  assert.ok(state.includes('activeInputs: new Map()'))
  assert.ok(state.includes('export function getCaps(): RuntimeCapabilities'))
  assert.ok(state.includes('export function setCaps(caps: RuntimeCapabilities)'))
  assert.ok(state.includes('export function setMcpClientsAccessor('))
  assert.ok(state.includes('return mcpClientsAccessor?.()'))
  assert.ok(state.includes('STATE.promptIndex = 0'))
  assert.ok(state.includes('export function resetStartTime(): void'))
  assert.ok(state.includes('export function incrementPromptIndex(): number'))

  assert.ok(
    appState.includes(
      'setMcpClientsAccessor(() => store.getState().mcp.clients)',
    ),
  )
  assert.ok(appState.includes('return () => setMcpClientsAccessor(undefined)'))
  assert.ok(mcpHook.includes('clients ?? getMcpClientsFromAccessor()'))
  assert.ok(print.includes("setHasStreamingInput(typeof inputPrompt !== 'string')"))
  assert.match(
    hooks,
    /!getIsNonInteractiveSession\(\) \|\| getHasStreamingInput\(\)/,
  )
  assert.match(
    hooks,
    /hook\.async \|\| \(hook\.asyncRewake && canAsyncRewake\)/,
  )
  assert.equal(occurrences(mcpConnections, 'clearInputsForServer('), 4)
  assert.ok(spare.includes('resetStartTime()'))
})
