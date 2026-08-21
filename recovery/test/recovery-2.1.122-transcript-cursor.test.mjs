import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates retained transcript cursor semantics and callers', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    const exportMatch = bundle.match(/transcriptCursorEnd:\(\)=>([\w$]+)/)
    assert.ok(exportMatch, `${version}: retained cursor export`)
    const helper = exportMatch[1]

    assert.equal(
      bundle.split(helper).length - 1,
      4,
      `${version}: export, definition, interactive and SDK callers`,
    )
    assert.match(
      bundle,
      new RegExp(
        `function ${helper.replaceAll('$', '\\$')}\\([\\w$]+,[\\w$]+,[\\w$]+\\)\\{if\\(![\\w$]+\\)return [\\w$]+\\.length;for\\(let [\\w$]+=[\\w$]+;[\\w$]+<[\\w$]+\\.length;[\\w$]+\\+\\+\\)\\{let [\\w$]+=[\\w$]+\\[[\\w$]+\\];if\\([\\w$]+\\.type==="assistant"&&[\\w$]+\\.message\\.stop_reason===null\\)return [\\w$]+\\}return [\\w$]+\\.length\\}`,
      ),
      `${version}: exact incomplete-assistant boundary`,
    )

    const queryRecorder = bundle.match(
      /let [\w$]+=\[\.\.\.this\.mutableMessages\],[\w$]+=0,[\w$]+,[\w$]+=[\w$]+\.length,([\w$]+)=\([\w$]+=!1\)=>/,
    )
    assert.ok(queryRecorder, `${version}: SDK cursor recorder shape`)
    const recorder = queryRecorder[1]
    const queryTail = bundle.slice(
      queryRecorder.index,
      queryRecorder.index + 20_000,
    )
    assert.equal(
      queryTail.split(`${recorder}(!0)`).length - 1,
      3,
      `${version}: three forced terminal flushes`,
    )
  }
})

test('source defers interactive and SDK streaming writes, then forces terminal flushes', () => {
  const storage = readFileSync(
    new URL('../../src/utils/sessionStorage.ts', import.meta.url),
    'utf8',
  )
  const hook = readFileSync(
    new URL('../../src/hooks/useLogMessages.ts', import.meta.url),
    'utf8',
  )
  const repl = readFileSync(
    new URL('../../src/screens/REPL.tsx', import.meta.url),
    'utf8',
  )
  const engine = readFileSync(
    new URL('../../src/QueryEngine.ts', import.meta.url),
    'utf8',
  )

  assert.match(
    storage,
    /export function transcriptCursorEnd[\s\S]*?if \(!deferIncompleteAssistant\) return messages\.length[\s\S]*?message\.message\.stop_reason === null[\s\S]*?return index/,
  )
  assert.match(
    hook,
    /deferIncompleteAssistant: boolean = false[\s\S]*?transcriptCursorEnd\([\s\S]*?deferIncompleteAssistant/,
  )
  assert.match(
    repl,
    /useLogMessages\(messages, messages\.length === initialMessages\?\.length, isLoading\)/,
  )
  assert.match(
    engine,
    /const recordNewMessages = \([\s\S]*?forceIncompleteAssistant: boolean = false[\s\S]*?transcriptCursorEnd\([\s\S]*?!forceIncompleteAssistant/,
  )
  assert.equal(
    engine.split('await recordNewMessages(true)').length - 1,
    3,
    'exactly three forced terminal flushes',
  )
})
