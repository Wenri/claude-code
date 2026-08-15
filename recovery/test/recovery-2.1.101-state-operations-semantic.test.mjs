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
  [7933, [6543641, 6544055, 'c157d2819896327ae64dcd5f641299adefa8e24b64c9278b93756090fd54860a']],
  [9465, [7253933, 7255427, 'ced0dae75c645e5b5f16518284098027bfabc61c74e665400bff762f3aee7627']],
  [9468, [7255698, 7256151, 'eebcb7bed04fb48e02691c3538a005f9a4000e9b1184d6f7d0ed8b534c9160d8']],
  [9469, [7256151, 7256856, '9f0730e4c26798ec191bd1ad25ea0cdabf63a5e0857b6100208faa4ee7d9ecf7']],
  [9470, [7256856, 7257536, '2bff977cdc78ce7736d429d74fd3a665c3e0c50011c6e2a270e0040db0d221d6']],
  [9678, [7318583, 7324791, '7866b8b0f8d0d344df970d5a1abe18a839cc0995789b1958c0fa7d1f6198738a']],
  [9696, [7329574, 7334620, '8a6bdbe029120f767df551fab93e5a34abe423f5d17b0a396d88c46a345b0e1e']],
  [9755, [7355557, 7361878, '641e183c36e866efcd96ac84222ae632cd2196e3d76d9bb62b7f68f88fbf6567']],
  [10003, [7456092, 7456578, '3d1e2a62e9ef8a6d0d9d3301d518766cb13b1c1d190114fd38bfb19aba849975']],
  [12611, [9684288, 9686387, 'a2b1ee5f3c913983074edf6558ced265a2a932aae3966f315f03353aaf6436c3']],
  [14977, [11120329, 11121042, '95202f37dd3ab89255efecd78da8ba856551084620d8e07078232c674875915b']],
  [16380, [11761927, 11774292, '5df0c87cd6eb1fc1b4ceff4c98f9bced6bd9faaa53230365ff419a082821297c']],
  [16415, [11789554, 11789994, 'aa73f690e30a667c8e6b97a14f31a58a19869846d60a3677197cdf7958c65f9b']],
  [18222, [12660551, 12718728, '74b589580c0b21c4bb029a90a90e1767aea485121eee0a52d5b87ff4fa074cdd']],
  [18732, [13308266, 13309705, '331166110d81fc66c7bca051809ddfc8c6c60958f4e2574e93167b81aa284a6b']],
  [18735, [13309789, 13325670, '4ef669540a89176d101bf83c127b4d4b2532478088c62e9ef013491824be6301']],
  [18799, [13390624, 13392401, 'e307207ea45d666332bafa03f71a9cb0bde5b1ead76632055b748cf8d9634b66']],
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

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target101 pins every changed state-operation unit', pairOptions, () => {
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
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('target101 replaces state updater closures with serializable operations', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const name of ['applyFileHistoryOp', 'getFileHistoryState', 'applyAttributionOp']) {
    assert.equal(baseline.includes(name), false, `${name}: absent at 100`)
    assert.equal(target.includes(name), true, `${name}: present at 101`)
  }
  for (const name of ['updateFileHistoryState', 'updateAttributionState']) {
    assert.equal(baseline.includes(name), true, `${name}: present at 100`)
    assert.equal(target.includes(name), false, `${name}: removed at 101`)
  }
  const attributionUnit = target.slice(...targetUnits.get(7933).slice(0, 2))
  for (const fragment of ['case"trackEdit"', 'case"trackBulk"', 'case"commitBoundary"']) {
    assert.ok(attributionUnit.includes(fragment), fragment)
  }
  const historyUnit = target.slice(...targetUnits.get(9465).slice(0, 2))
  for (const fragment of ['case"track"', 'case"snapshot"', 'snapshotSequence']) {
    assert.ok(historyUnit.includes(fragment), fragment)
  }
})

test('source owns reducers, two-phase file IO, and every reachable context call', sourceOptions, () => {
  assertFragments('src/utils/fileHistory.ts', [
    'export type FileHistoryOp =',
    'export function applyFileHistoryOp(',
    "case 'track':",
    "case 'snapshot':",
    'const captured = getFileHistoryState()',
    "kind: 'track'",
    "kind: 'snapshot'",
  ])
  assertFragments('src/utils/commitAttribution.ts', [
    'export type AttributionOp =',
    'export function applyAttributionOp(',
    "case 'trackEdit':",
    "case 'trackBulk':",
    "case 'commitBoundary':",
  ])
  assertFragments('src/Tool.ts', [
    'getFileHistoryState: () => FileHistoryState | undefined',
    'applyFileHistoryOp: (operation: FileHistoryOp) => void',
    'applyAttributionOp: (operation: AttributionOp) => void',
  ])
  for (const relative of [
    'src/tools/FileEditTool/FileEditTool.ts',
    'src/tools/FileWriteTool/FileWriteTool.ts',
    'src/tools/NotebookEditTool/NotebookEditTool.ts',
    'src/tools/BashTool/BashTool.tsx',
  ]) {
    assertFragments(relative, ['getFileHistoryState', 'applyFileHistoryOp'])
  }
  for (const relative of [
    'src/QueryEngine.ts',
    'src/screens/REPL.tsx',
    'src/utils/forkedAgent.ts',
    'src/entrypoints/mcp.ts',
    'src/types/hooks.ts',
    'src/utils/hooks.ts',
    'src/utils/handlePromptSubmit.ts',
    'src/cli/print.ts',
    'src/utils/queryContext.ts',
    'src/utils/agenticSessionSearch.ts',
  ]) {
    assert.ok(
      /getFileHistoryState|applyFileHistoryOp|applyAttributionOp|fileHistoryRewind/.test(
        source(relative),
      ),
      `${relative}: reachable operation context`,
    )
  }
  for (const relative of [
    'src/utils/fileHistory.ts',
    'src/utils/commitAttribution.ts',
    'src/Tool.ts',
    'src/QueryEngine.ts',
    'src/screens/REPL.tsx',
    'src/tools/FileEditTool/FileEditTool.ts',
    'src/tools/FileWriteTool/FileWriteTool.ts',
    'src/tools/NotebookEditTool/NotebookEditTool.ts',
    'src/tools/BashTool/BashTool.tsx',
    'src/utils/forkedAgent.ts',
    'src/entrypoints/mcp.ts',
    'src/types/hooks.ts',
    'src/utils/hooks.ts',
    'src/utils/handlePromptSubmit.ts',
    'src/cli/print.ts',
    'src/utils/queryContext.ts',
    'src/utils/agenticSessionSearch.ts',
  ]) {
    const contents = source(relative)
    assert.equal(contents.includes('updateFileHistoryState'), false, relative)
    assert.equal(contents.includes('updateAttributionState'), false, relative)
  }
})
