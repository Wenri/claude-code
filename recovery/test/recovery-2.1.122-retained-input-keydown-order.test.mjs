import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = {
  baseline: {
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  target: {
    names: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
}

function loadBundle({ names, bytes, sha256 }) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha256)
  return value.toString('utf8')
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function count(value, fragment) {
  return value.split(fragment).length - 1
}

test('both authenticated releases retain the ordered input keydown surface', () => {
  for (const [name, release] of Object.entries(releases)) {
    const bundle = loadBundle(release)
    assert.equal(count(bundle, 'onKeyDownBefore'), 2, name)
    assert.match(
      bundle,
      /onKeyDownBefore\?\.\(([\w$]+)\),\1\.defaultPrevented\|\|\1\.didStopImmediatePropagation\(\)/,
      `${name}: BaseTextInput aborts default editing after the pre-handler`,
    )
    assert.match(
      bundle,
      /if\(([\w$]+)\(([\w$]+)\),\2\.defaultPrevented\|\|\2\.didStopImmediatePropagation\(\)\)return;if\(([\w$]+)\(\2\),\2\.defaultPrevented\|\|\2\.didStopImmediatePropagation\(\)\)return/,
      `${name}: PromptInput runs two ordered consumers with abort checks`,
    )
    assert.match(bundle, /onKeyDownBefore:[\w$]+,onSubmit:/, name)
    assert.match(
      bundle,
      /tabIndex:0,autoFocus:!0,onKeyDown:[\w$]+,onPaste:[\w$]+/,
      `${name}: focused input owns keyboard and paste DOM events`,
    )
  }
})

test('source restores pre-handler ordering and the focused DOM input path', () => {
  const types = source('src/types/textInputTypes.ts')
  const base = source('src/components/BaseTextInput.tsx')
  const prompt = source('src/components/PromptInput/PromptInput.tsx')
  const history = source('src/hooks/useHistorySearch.ts')
  const typeahead = source('src/hooks/useTypeahead.tsx')
  const textInput = source('src/hooks/useTextInput.ts')
  const vim = source('src/hooks/useVimInput.ts')
  const paste = source('src/hooks/usePasteHandler.ts')

  assert.ok(types.includes('readonly onKeyDownBefore?: (event: KeyboardEvent) => void'))
  assert.ok(types.includes('handleKeyDown: (event: KeyboardEvent) => void'))
  assert.match(
    base,
    /props\.onKeyDownBefore\?\.\(event\);[\s\S]*event\.defaultPrevented \|\| event\.didStopImmediatePropagation\(\)[\s\S]*textInputHandleKeyDown\(event\)/,
  )
  for (const witness of [
    'tabIndex: 0',
    'autoFocus: true',
    'onKeyDown: handleKeyDown',
    'onPaste: handlePaste',
  ]) {
    assert.ok(base.includes(witness), witness)
  }

  const historyIndex = prompt.indexOf('handleHistoryKeyDown(event)')
  const typeaheadIndex = prompt.indexOf('handleTypeaheadKeyDown(event)')
  const localIndex = prompt.indexOf("if (getPlatform() === 'macos'", typeaheadIndex)
  assert.ok(historyIndex >= 0)
  assert.ok(typeaheadIndex > historyIndex)
  assert.ok(localIndex > typeaheadIndex)
  assert.equal(
    count(
      prompt.slice(historyIndex, localIndex),
      'event.defaultPrevented || event.didStopImmediatePropagation()',
    ),
    2,
  )
  assert.ok(prompt.includes('onKeyDownBefore: handleKeyDownBefore'))

  assert.doesNotMatch(history, /\buseInput\b/)
  assert.doesNotMatch(typeahead, /\buseInput\b/)
  assert.ok(textInput.includes('function handleKeyDown(event: KeyboardEvent): void'))
  assert.ok(textInput.includes('event.preventDefault()'))
  assert.ok(vim.includes('handleKeyDown: handleVimInput'))
  assert.ok(paste.includes('function handlePaste(event: PasteEvent): void'))
  assert.ok(paste.includes('textInputHandleKeyDown(event)'))
})
