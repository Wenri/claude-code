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
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(
    /\s+/g,
    ' ',
  )
}

test('authenticates the retained selection-delete bridge and callgraph', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(occurrences(bundle, 'setHandler'), 4, version)
    assert.equal(occurrences(bundle, 'tryDelete'), 3, version)
    assert.match(
      bundle,
      /setHandler:\([^)]*\)=>\{[^}]*\.current=[^}]*\},tryDelete:\([^)]*\)=>[^;]{0,80}?\.current\?\.\([^)]*\)\?\?!1/,
      `${version}: provider delegates through a retained current handler`,
    )
    assert.match(
      bundle,
      /\.setHandler\([^;]{0,100}?\.current\?\.\([^)]*\)\?\?!1\),\(\)=>[^;]{0,60}?\.setHandler\(null\)/,
      `${version}: PromptInput registers and unregisters its live handler`,
    )
    assert.match(
      bundle,
      /backspace\|\|[\s\S]{0,100}?\.delete\)[\s\S]{0,500}?\.tryDelete\([^)]*\)[\s\S]{0,80}?\.clearSelection\(\)/,
      `${version}: Backspace/Delete consumes a handled prompt selection`,
    )
  }
})

test('source reconstructs provider, prompt range mapping, and scroll consumption', () => {
  const context = source('src/context/selectionDelete.tsx')
  const app = source('src/components/App.tsx')
  const prompt = source('src/components/PromptInput/PromptInput.tsx')
  const scroll = source('src/components/ScrollKeybindingHandler.tsx')

  assert.ok(context.includes('setHandler(handler: SelectionDeleteHandler | null): void'))
  assert.ok(context.includes('tryDelete(selection: SelectionState): boolean'))
  assert.ok(context.includes('handlerRef.current?.(selection) ?? false'))
  assert.ok(app.includes('<SelectionDeleteProvider>{children}</SelectionDeleteProvider>'))
  assert.ok(prompt.includes('const selected = selectionBounds(selection)'))
  assert.ok(prompt.includes('const bounds = inputContainer ? nodeCache.get(inputContainer) : undefined'))
  assert.ok(prompt.includes('column: Math.max(0, column - bounds.x)'))
  assert.ok(prompt.includes('toOffset(end.row, end.col + 1)'))
  assert.ok(prompt.includes('pushToBuffer(input, cursorOffset, pastedContents)'))
  assert.ok(prompt.includes('selectionDelete.setHandler(selection => deleteSelectionRef.current?.(selection) ?? false)'))
  assert.ok(prompt.includes('ref={inputContainerRef} flexGrow={1} flexShrink={1} tabIndex={-1}'))
  assert.ok(scroll.includes('selectionDelete.tryDelete(state)'))
  assert.ok(scroll.includes('event_0.stopImmediatePropagation()'))
})
