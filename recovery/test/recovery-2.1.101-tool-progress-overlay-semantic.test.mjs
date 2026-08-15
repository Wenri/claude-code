import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource = path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const units = new Map([
  [9390, [7222972, 7225993, '7eeb31f6d49738f104a377a36e9aad4f968493828c8243a1e4be0cd9b9c5843d', 'FunctionDeclaration']],
  [9392, [7226236, 7233834, '57f311be824838df2f15ba08206ee3b224086c6eab43e4e4bd7352904eb43b40', 'VariableDeclaration']],
  [10005, [7456765, 7459350, '2d50fdc1d268f32f4ac24024a2151b4b99b12d25ebab2fcf29ad7b2b38685e3c', 'FunctionDeclaration']],
  [10007, [7459436, 7470552, 'aefddd6d791cf59ba514709cb0c6935990dfd31173d242f0a88d617a19037dfe', 'VariableDeclaration']],
  [11924, [9076630, 9094353, '2bdcd72cf75ee2bc7a1e6ba45d44e30a71da1163f5f522a446b31c71a11a65da', 'VariableDeclaration']],
  [17813, [12491815, 12492155, '1a2a476fc73303c50c337beeaf54f119ff7468d18e4cedb488c779bd93d4de70', 'FunctionDeclaration']],
  [17815, [12492167, 12492368, 'c4991869b30d4ab32d94fca6fe76c0b697be5db7d1334412f1e1b3855649381b', 'VariableDeclaration']],
  [18222, [12660551, 12718728, '74b589580c0b21c4bb029a90a90e1767aea485121eee0a52d5b87ff4fa074cdd', 'FunctionDeclaration']],
])

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
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

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins the complete tool-progress overlay introduction graph', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), 'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be')
  assert.equal(sha256(targetBytes), 'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb')
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, hash, nodeType]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash, region.target.nodeType],
      [start, end, hash, nodeType],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
  }
})

test('target101 introduces foreground producers, overlay dispatch, and REPL reachability', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of ['emitToolProgress', 'background_hint', 'bash_mode_progress', 'it2_setup_prompt', 'computer_use_approval']) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: absent in target100`)
    assert.equal(target.includes(fragment), true, `${fragment}: introduced in target101`)
  }

  for (const index of [9390, 10005]) {
    const unit = target.slice(...units.get(index).slice(0, 2))
    assertFragments(unit, ['emitToolProgress', 'background_hint', 'toolUseId'], `producer ${index}`)
  }
  const renderer = target.slice(...units.get(17813).slice(0, 2))
  assertFragments(renderer, ['background_hint', 'bash_mode_progress', 'it2_setup_prompt', 'computer_use_approval', 'agent_progress'], 'overlay dispatcher')
  const renderers = target.slice(...units.get(17815).slice(0, 2))
  assertFragments(renderers, ['background_hint:()=>', 'bash_mode_progress:()=>null', 'agent_progress:()=>null'], 'target101 renderers')
  const repl = target.slice(...units.get(18222).slice(0, 2))
  assertFragments(repl, ['new Map', 'emitToolProgress:', '.kind==="clear"', '.toolUseId', '.size>0'], 'REPL overlay state')
})

test('source owns foreground events, target101 renderer behavior, and the reachable REPL map', sourceOptions, () => {
  const tool = source('Tool.ts')
  assert.ok(tool.includes('emitToolProgress?: (event: ToolProgressOverlayEvent) => void'))

  const overlay = source('components/ToolProgressOverlay.tsx')
  assertFragments(overlay, [
    "kind: 'background_hint'",
    "kind: 'bash_mode_progress'",
    "kind: 'it2_setup_prompt'",
    "kind: 'computer_use_approval'",
    "kind: 'agent_progress'",
    "kind: 'clear'",
    "case 'background_hint':",
    '<SessionBackgroundHint />',
  ], 'ToolProgressOverlay.tsx')

  for (const relative of ['tools/BashTool/BashTool.tsx', 'tools/PowerShellTool/PowerShellTool.tsx']) {
    const contents = source(relative)
    assertFragments(contents, [
      'emitToolProgress',
      "kind: 'background_hint'",
      'toolUseId',
    ], relative)
  }

  const repl = source('screens/REPL.tsx')
  assertFragments(repl, [
    'new Map<string, VisibleToolProgressOverlayEvent>()',
    'setToolProgressOverlays(previous => updateToolProgressOverlays(previous, event))',
    'emitToolProgress,',
    '!toolJSX && toolProgressOverlays.size > 0',
    'renderToolProgressOverlay(event',
  ], 'screens/REPL.tsx')
  assert.equal(repl.includes('<SessionBackgroundHint onBackgroundSession='), false)

  const hint = source('components/SessionBackgroundHint.tsx')
  assertFragments(hint, [
    "'ctrl+b ctrl+b (twice)'",
    'backgroundAll(() => appStateStore.getState(), setAppState)',
    'action="run in background"',
    "format={{ keyCase: 'lower' }}",
    'paddingLeft={5}',
  ], 'SessionBackgroundHint.tsx')

  if (isCurrentSource) {
    assertFragments(overlay, ['<BashModeProgress', 'renderToolUseProgressMessage(event.progressMessages, context)'], 'target116 overlay evolution')
    const bashMode = source('utils/processUserInput/processBashCommand.tsx')
    assertFragments(bashMode, ["kind: 'bash_mode_progress'", "kind: 'clear'", 'toolUseId: `${toolUseId}:inner`'], 'target116 bash-mode producer')
    const slash = source('utils/processUserInput/processSlashCommand.tsx')
    assertFragments(slash, ["kind: 'agent_progress'", 'progressMessages: [...progressMessages]', "kind: 'clear'"], 'target116 forked-command producer')
  } else {
    assertFragments(overlay, ["case 'bash_mode_progress':", "case 'agent_progress':", 'return null'], 'target101 inert renderer branches')
  }
})
