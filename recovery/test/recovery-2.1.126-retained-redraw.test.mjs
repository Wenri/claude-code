import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = process.env.CLAUDE_CODE_2_1_126_SOURCE_ROOT ?? repo

const releases = {
  baseline: {
    env: 'CLAUDE_CODE_2_1_124_BUNDLE',
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
    handlerOffset: 12_479_939,
  },
  target: {
    env: 'CLAUDE_CODE_2_1_126_BUNDLE',
    bytes: 13_980_411,
    sha256:
      'e9d40219be0cad9009c115ec637df4976e987c33d4b7a88cc5f047ead9ad828d',
    handlerOffset: 12_479_422,
  },
}

const handler =
  'PC=Aq.useCallback(()=>{z1((y$)=>y$+1),b9.current=y7,iz()},[y7,iz])'
const handlerSha256 =
  '9834f6f4624d76f84162bfd42383d15bed581dc0e846ba1cbb4cc90d120a7a1e'
const bundleFragments = [
  ['binding', '"ctrl+l":"chat:clearInput"'],
  ['registration', '"chat:clearInput":PC'],
  ['shortcut', 'm9("chat:clearInput","Chat","ctrl+l")'],
  ['handler', handler],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.env} byte length`)
  assert.equal(sha256(bytes), release.sha256, `${release.env} SHA-256`)
  return bytes
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('authenticates the byte-identical retained Ctrl+L redraw handler', () => {
  for (const [side, release] of Object.entries(releases)) {
    const bundle = readBundle(release)
    const contents = bundle.toString('utf8')
    for (const [label, fragment] of bundleFragments) {
      assert.equal(occurrences(contents, fragment), 1, `${side} ${label}`)
    }
    assert.equal(
      contents.indexOf(handler),
      release.handlerOffset,
      `${side} handler offset`,
    )
    const handlerSlice = bundle.subarray(
      release.handlerOffset,
      release.handlerOffset + Buffer.byteLength(handler),
    )
    assert.equal(handlerSlice.toString('utf8'), handler, `${side} handler bytes`)
    assert.equal(sha256(handlerSlice), handlerSha256, `${side} handler SHA-256`)
  }
})

test('recovered Ctrl+L source redraws without clearing prompt state', () => {
  const promptInput = source('src/components/PromptInput/PromptInput.tsx')
  const start = promptInput.indexOf('const handleClearInput = useCallback(() => {')
  const end = promptInput.indexOf('\n\n  // Handler for chat:modelPicker', start)
  assert.ok(start >= 0, 'clear-input handler start')
  assert.ok(end > start, 'clear-input handler end')
  const recoveredHandler = promptInput.slice(start, end)

  assert.equal(
    recoveredHandler,
    `const handleClearInput = useCallback(() => {
    setRedrawVersion(version => version + 1);
    clearActionShortcutRef.current = clearInputShortcut;
    clearDoublePress();
  }, [clearInputShortcut, clearDoublePress]);`,
  )
  for (const forbidden of [
    "trackAndSetInput('')",
    'setCursorOffset(0)',
    'clearBuffer()',
    'resetHistory()',
    "onModeChange('prompt')",
    'setPastedContents({})',
  ]) {
    assert.equal(recoveredHandler.includes(forbidden), false, forbidden)
  }

  assert.equal(
    occurrences(
      source('src/keybindings/defaultBindings.ts'),
      "'ctrl+l': 'chat:clearInput',",
    ),
    1,
    'default Ctrl+L binding',
  )
})
