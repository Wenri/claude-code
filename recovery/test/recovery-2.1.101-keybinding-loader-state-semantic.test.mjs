import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const targetUnits = new Map([
  [8184, [6679322, 6679391, '7defdf2e9a4229d55ba3b825b008376a5bb02e476652a47f9d3eb64d30d4c1d4', 'FunctionDeclaration']],
  [8185, [6679391, 6679524, 'b1ff1cfe2cdb49a0f9d4f7a4d77e3aa618e55878f15014b0671dc3ec44debaa7', 'FunctionDeclaration']],
  [8186, [6679524, 6679717, '1f6f63bc17ea3abc45591c11890daf3197033257fd371c1cc36b6ebc842c7c18', 'FunctionDeclaration']],
  [8189, [6679799, 6681114, 'b619bdf38d6f3b2e86849d0173cb1bf5f6c6faa85c31973cb34c38359f0226a2', 'FunctionDeclaration']],
  [8190, [6681114, 6681185, 'd7d591706e9fb303f7d849a5dfdd883ec07c43ef22f23e2e92ba5f7696c09639', 'FunctionDeclaration']],
  [8191, [6681185, 6682694, 'a6ec7132cde61f2a4884ab9b2464f284ab9d04ecb5ec184210511bc6d61d5a53', 'FunctionDeclaration']],
  [8192, [6682694, 6683387, '96a07675a1ac2119f91b625824c36e7c1cd33c47921e8c584f46f18613571c0b', 'FunctionDeclaration']],
  [8193, [6683387, 6683481, '90c6d055c742bc6092ea1ec74d36f1de07b5e32701f7c542322a69a32a544fea', 'FunctionDeclaration']],
  [8194, [6683481, 6683688, '39af2d47aa13fb817a0728b79a28862835144113eaa4f3caec83733087bdd47e', 'FunctionDeclaration']],
  [8195, [6683688, 6683831, '9fcb497c863726b0066688a2097bd85a02f509b067cc8a299d891fbfe5d61d69', 'FunctionDeclaration']],
  [8196, [6683831, 6683854, 'bc9404e6f3adf0d5b4336f91ea9b56ddd25ff8dc35f880bb42809464516230b9', 'VariableDeclaration']],
  [8197, [6683854, 6683932, '460135a782ca3d6e97949d5b65b4e50c91c139930ab936a6d4862ade64cefcdd', 'VariableDeclaration']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins the keybinding loader state and lifecycle units', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, hash, nodeType]] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
        region.target.nodeType,
      ],
      [start, end, hash, nodeType],
      `${index}: identity`,
    )
    const unit = target.slice(start, end)
    assert.equal(sha256(unit), hash, `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('target101 enables customization and moves every mutable field into one lifecycle state', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('lastCustomBindingsLogDate'), false)
  assert.equal(target.includes('lastCustomBindingsLogDate'), true)

  const gate = target.slice(...targetUnits.get(8184).slice(0, 2))
  assert.ok(gate.includes('tengu_keybinding_customization_release'))
  assert.ok(gate.includes(',!0)'))

  const state = target.slice(...targetUnits.get(8185).slice(0, 2))
  assertFragments(
    state,
    [
      'bindings:null',
      'warnings:[]',
      'watcher:null',
      'initialized:!1',
      'disposed:!1',
      'lastCustomBindingsLogDate:null',
      'changed:',
    ],
    'target101 state factory',
  )

  const watcher = target.slice(...targetUnits.get(8192).slice(0, 2))
  assertFragments(
    watcher,
    [
      '.initialized||',
      '.disposed',
      '.watcher=',
      '.watcher.on("add",(',
      '.watcher.on("change",(',
      '.watcher.on("unlink",(',
    ],
    'target101 watcher',
  )
  const dispose = target.slice(...targetUnits.get(8193).slice(0, 2))
  assert.ok(dispose.indexOf('.disposed=!0') < dispose.indexOf('.watcher.close()'))
  assert.ok(dispose.indexOf('.watcher=null') < dispose.indexOf('.changed.clear()'))
})

test('source owns the same state-threaded load, watch, reload, and disposal graph', sourceOptions, () => {
  const contents = fs.readFileSync(
    path.join(sourceRoot, 'keybindings/loadUserBindings.ts'),
    'utf8',
  )
  assertFragments(
    contents,
    [
      "'tengu_keybinding_customization_release',\n    true,",
      'type KeybindingLoaderState = {',
      'bindings: ParsedBinding[] | null',
      'watcher: FSWatcher | null',
      'lastCustomBindingsLogDate: string | null',
      'function createKeybindingLoaderState(): KeybindingLoaderState',
      'const keybindingLoaderState = createKeybindingLoaderState()',
      'state.lastCustomBindingsLogDate === today',
      'state.lastCustomBindingsLogDate = today',
      'state: KeybindingLoaderState = keybindingLoaderState',
      'if (state.initialized || state.disposed) return',
      "state.watcher.on('add', path => handleChange(state, path))",
      "state.watcher.on('change', path => handleChange(state, path))",
      "state.watcher.on('unlink', path => handleDelete(state, path))",
      'registerCleanup(async () => disposeKeybindingWatcher(state))',
      'state.disposed = true',
      'void state.watcher.close()',
      'state.watcher = null',
      'state.changed.clear()',
      'const result = await loadKeybindings(state)',
      'state.changed.emit(result)',
    ],
    'keybindings/loadUserBindings.ts',
  )
  assert.equal(contents.includes('let cachedBindings'), false)
  assert.equal(contents.includes('let cachedWarnings'), false)
  assert.equal(contents.includes('let watcher: FSWatcher'), false)
})
