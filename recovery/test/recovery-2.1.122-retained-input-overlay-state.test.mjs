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

test('authenticates retained PromptInput overlay and Vim handoff surface', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    for (const [name, count] of [
      ['initialVimMode', 2],
      ['onVimModeChange', 2],
      ['onInputOverlayActiveChange', 2],
      ['isInputOverlayActive', 2],
      ['isInputEmpty', 6],
    ]) {
      assert.equal(occurrences(bundle, name), count, `${version}: ${name}`)
    }

    assert.match(
      bundle,
      /onInputOverlayActiveChange:[\w$]+,initialVimMode:[\w$]+,onVimModeChange:[\w$]+/,
      `${version}: REPL forwards the retained PromptInput state callbacks`,
    )
    assert.match(
      bundle,
      /isInputOverlayActive:[\w$]+,inputMode:[\w$]+,isInputEmpty:[\w$]+/,
      `${version}: cancel handling consumes the consolidated input state`,
    )
  }
})

test('source reconstructs local input overlays and retained REPL handoff', () => {
  const prompt = source('src/components/PromptInput/PromptInput.tsx')
  const repl = source('src/screens/REPL.tsx')
  const cancel = source('src/hooks/useCancelRequest.ts')

  for (const witness of [
    "useState<VimMode>(initialVimMode ?? 'INSERT')",
    'onVimModeChange?.(vimMode)',
    'const [isSearchingHistory, setIsSearchingHistory] = useState(false)',
    'const [helpOpen, setHelpOpen] = useState(false)',
    "isSearchingHistory || helpOpen || isVimModeEnabled() && vimMode !== 'NORMAL'",
    'onInputOverlayActiveChange(isInputOverlayActive)',
    'return () => onInputOverlayActiveChange(false)',
  ]) {
    assert.ok(prompt.includes(witness), `PromptInput: ${witness}`)
  }

  for (const witness of [
    'const [isInputOverlayActive, setIsInputOverlayActive] = useState(false)',
    "const vimModeRef = useRef<VimMode>('INSERT')",
    'vimModeRef.current = mode',
    'onInputOverlayActiveChange={setIsInputOverlayActive}',
    'initialVimMode={vimModeRef.current}',
    'onVimModeChange={handleVimModeChange}',
    "isInputEmpty: inputValue === ''",
  ]) {
    assert.ok(repl.includes(witness), `REPL: ${witness}`)
  }

  assert.ok(cancel.includes('isInputOverlayActive: boolean'))
  assert.ok(cancel.includes('isInputEmpty: boolean'))
  assert.match(
    cancel,
    /screen !== 'transcript'[\s\S]*!isOverlayActive &&[\s\S]*!isInputOverlayActive/,
  )
  assert.doesNotMatch(cancel, /isSearchingHistory|isHelpOpen|vimMode/)
})
