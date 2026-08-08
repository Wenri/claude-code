import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

test('recovers the Remote Control file-suggestions protocol schemas', () => {
  const schemas = source('src/entrypoints/sdk/controlSchemas.ts')

  assert.match(
    schemas,
    /subtype: z\.literal\('file_suggestions'\),\s+query: z\.string\(\)/,
  )
  assert.match(
    schemas,
    /suggestions: z\.array\(\s+z\.object\(\{\s+path: z\.string\(\),\s+score: z\.number\(\)\.optional\(\)/,
  )
  assert.match(
    schemas,
    /SDKControlMcpStatusRequestSchema\(\),\s+SDKControlFileSuggestionsRequestSchema\(\),\s+SDKControlGetContextUsageRequestSchema\(\)/,
  )
})

test('recovers async file-suggestion control responses and errors', () => {
  const messaging = source('src/bridge/bridgeMessaging.ts')

  assert.match(
    messaging,
    /onFileSuggestions\?: \(\s+query: string,\s+\) => Promise<Array<\{ path: string; score\?: number \}>>/,
  )
  assert.match(
    messaging,
    /case 'file_suggestions': \{[\s\S]*?onFileSuggestions\(request\.request\.query\)[\s\S]*?response: \{ suggestions \}[\s\S]*?error: errorMessage\(err\)[\s\S]*?session_id: sessionId[\s\S]*?Sent control_response for file_suggestions/,
  )
  assert.match(
    messaging,
    /file_suggestions is not supported in this context \(onFileSuggestions callback not registered\)/,
  )
})

test('threads the callback through both bridge cores and adapts TUI results', () => {
  for (const relative of [
    'src/bridge/replBridge.ts',
    'src/bridge/remoteBridgeCore.ts',
  ]) {
    const bridge = source(relative)
    assert.match(
      bridge,
      /onFileSuggestions\?: \(\s+query: string,\s+\) => Promise<Array<\{ path: string; score\?: number \}>>/,
    )
    assert.match(
      bridge,
      /handleServerControlRequest\([\s\S]*?onRenameSession,\s+onFileSuggestions,/,
    )
  }

  const init = source('src/bridge/initReplBridge.ts')
  assert.match(
    init,
    /generateFileSuggestions\(query, true\)\)\.map\(suggestion => \(\{\s+path: suggestion\.displayText/,
  )
  assert.equal(init.match(/\s+onFileSuggestions,/g)?.length, 2)
})
