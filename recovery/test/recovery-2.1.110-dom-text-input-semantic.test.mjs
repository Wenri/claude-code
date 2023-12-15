import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const identities = new Map([
  [
    6219,
    [
      4419671,
      4424262,
      'FunctionDeclaration',
      'e575bb24b0d4a7127261e1ba6b2b48695fce4f8b4b3d0fdb817792139bfb80a2',
    ],
  ],
  [
    6234,
    [
      4425452,
      4427084,
      'FunctionDeclaration',
      '9c11f7cf28b352536554a33cce72ad49aa8998b778f1fbea51f6a6080fd8e9c2',
    ],
  ],
  [
    6251,
    [
      4431137,
      4433786,
      'FunctionDeclaration',
      '9012fa67e85e7f14a068315ada5df2591f90e65cad1b330f170ddd9ba76f58df',
    ],
  ],
  [
    17966,
    [
      12335980,
      12340633,
      'FunctionDeclaration',
      'c37fc80ff00ff2ccdbf110907262428ed4c555fcf23136112dc183dfa90f34c4',
    ],
  ],
  [
    17968,
    [
      12340645,
      12340904,
      'VariableDeclaration',
      '123e6838cb9a92b5ad77487a5ffdc8d315aa39c614ff0322658ab350f40e3303',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function read(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target110 pins the complete focus-scoped DOM text-input migration',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )

    const target = targetBytes.toString('utf8')
    const units = new Map()
    for (const [index, identity] of identities) {
      const region = structural.regions[index]
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
      )
      const unit = target.slice(region.target.start, region.target.end)
      assert.equal(sha256(unit), region.target.sourceHash)
      units.set(index, unit)
    }

    assert.match(units.get(6219), /return\{handleKeyDown:/)
    assert.match(units.get(6219), /switch\([^)]*\.key\)/)
    assert.match(units.get(6219), /\.preventDefault\(\)/)
    assert.match(units.get(6234), /return\{handleKeyDown:[^}]*handlePaste:/)
    assert.match(units.get(6234), /isPasted:!0/)
    assert.match(units.get(6234), /\.text\)/)
    assert.match(units.get(6251), /tabIndex:0,autoFocus:!0,onKeyDown:/)
    assert.match(units.get(6251), /onPaste:/)
    assert.match(units.get(6251), /\.subscribe\(/)
    assert.match(units.get(17966), /return\{\.\.\.[^,]+,handleKeyDown:/)
    assert.match(units.get(17966), /\.preventDefault\(\)/)
    assert.match(units.get(17968), /"backspace","delete","tab"/)

    const baseline = baselineBytes.toString('utf8')
    assert.equal(
      baseline.includes('"backspace","delete","tab"'),
      false,
      'the target110 Vim DOM special-key table is absent from target109',
    )
  },
)

test(
  'source routes keyboard and paste through the focused input DOM surface',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const textInput = read('hooks/useTextInput.ts')
    const vimInput = read('hooks/useVimInput.ts')
    const paste = read('hooks/usePasteHandler.ts')
    const base = read('components/BaseTextInput.tsx')
    const types = read('types/textInputTypes.ts')
    const keyboard = read('ink/events/keyboard-event.ts')

    assert.match(textInput, /function handleKeyDown\(event: KeyboardEvent\)/)
    assert.match(textInput, /return \{\s*handleKeyDown,/)
    assert.match(vimInput, /function handleKeyDown\(event: KeyboardEvent\)/)
    assert.match(vimInput, /\.\.\.textInput,\s*handleKeyDown,/)
    assert.match(paste, /handlePaste: \(event: PasteEvent\) => void/)
    assert.match(paste, /event\.preventDefault\(\)/)
    assert.match(base, /tabIndex: 0/)
    assert.match(base, /onKeyDown: wrappedHandleKeyDown/)
    assert.match(base, /onPaste: handlePaste/)
    assert.doesNotMatch(base, /\buseInput\s*\(/)
    assert.match(types, /handleKeyDown: \(event: KeyboardEvent\) => void/)

    if (historical) {
      assert.match(textInput, /switch \(event\.key\)/)
      assert.doesNotMatch(textInput, /event\.name/)
      assert.doesNotMatch(textInput, /kill-paste-hint/)
      assert.doesNotMatch(paste, /pendingReturnRef/)
      assert.doesNotMatch(vimInput, /event\.name/)
      assert.match(base, /getFocusManager\(inputRef\.current\)/)
      assert.doesNotMatch(keyboard, /readonly name:/)
    } else {
      assert.match(textInput, /switch \(event\.name\)/)
      assert.match(textInput, /event\.superKey/)
      assert.match(textInput, /kill-paste-hint/)
      assert.match(paste, /pendingReturnRef/)
      assert.match(
        paste,
        /createSyntheticKeyboardEvent\('\\r', 'return', true\)/,
      )
      assert.match(vimInput, /event\.name === 'escape'/)
      assert.match(base, /useAutoFocus\(inputRef, acceptsInput\)/)
      assert.match(keyboard, /readonly name: string/)
    }
  },
)
