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
  [5402, [3980997, 3981628, 'VariableDeclaration', '57b02c6a1858985fd37b630056536e9dd8ce042d3b614492fa5e70aa5be8e32d']],
  [5436, [3992061, 3992164, 'FunctionDeclaration', 'ef4cf0b100f546e059eda8fdf4d76d9bcf9cbd354566a56bc024ed9c13b9f6b5']],
  [5437, [3992164, 3992274, 'FunctionDeclaration', '51a1d669d5757f5dc29a34ac0b6ec34bd678c9c35626fa9040f4f4291cd18b63']],
  [5438, [3992274, 3992375, 'FunctionDeclaration', '968009e5d11f19cdc85e3bff8c0168c11c16c9cb03312ebf1d0b6bcef523ba66']],
  [5439, [3992375, 3992506, 'FunctionDeclaration', '0642d8413195594fc79fea9175cbb83e5a54d6d69a56b361511627d325f86322']],
  [5657, [4067343, 4073220, 'VariableDeclaration', '02c7a920063bf2e1583417d6e6172614299cc5dc532ed63716a576a2a769e068']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function read(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target110 pins the DOM input-handler raw-mode reference graph',
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
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const units = new Map()
    for (const [index, identity] of identities) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
        `${index}: identity`,
      )
      const unit = target.slice(region.target.start, region.target.end)
      assert.equal(sha256(unit), region.target.sourceHash, `${index}: bytes`)
      units.set(index, unit)
    }

    assert.equal(baseline.includes('_pendingRawModeDelta'), false)
    assert.match(units.get(5402), /new Set\(\["onKeyDown"/)
    assert.match(units.get(5402), /"onWheelCapture"\]\)/)
    assert.match(units.get(5436), /_eventHandlers/)
    assert.match(units.get(5436), /if\([^)]*\[_\]!=null\)return!0/)
    assert.match(units.get(5437), /\.setRawMode\)\w+\.setRawMode\([^>]+>0\)/)
    assert.match(units.get(5437), /_pendingRawModeDelta=.*\?\?0/)
    assert.match(units.get(5438), /_holdsRawModeRef/)
    assert.match(units.get(5438), /\?1:-1/)
    assert.match(units.get(5439), /nodeName!=="#text"/)
    assert.match(units.get(5657), /_pendingRawModeDelta\?\?0/)
    assert.match(units.get(5657), /\.setRawMode=this\.handleSetRawMode/)
    assert.match(units.get(5657), /\.setRawMode=void 0/)
  },
)

test(
  'source owns pending, mounted, update, and teardown raw-mode references',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const handlers = read('ink/events/event-handlers.ts')
    const dom = read('ink/dom.ts')
    const reconciler = read('ink/reconciler.ts')
    const app = read('ink/components/App.tsx')
    const ink = read('ink/ink.tsx')

    for (const fragment of [
      'export const INPUT_EVENT_HANDLER_PROPS',
      "'onKeyDown'",
      "'onPaste'",
      "'onWheel'",
    ]) {
      assert.ok(handlers.includes(fragment), fragment)
    }
    for (const fragment of [
      '_holdsRawModeRef?: boolean',
      'setRawMode?: (value: boolean) => void',
      '_pendingRawModeDelta?: number',
    ]) {
      assert.ok(dom.includes(fragment), fragment)
    }
    for (const fragment of [
      'function hasInputEventHandler(',
      'function updateRootRawModeRef(',
      'function syncRawModeRef(',
      'function releaseRawModeRefs(',
      'INPUT_EVENT_HANDLER_PROPS.has(key)',
      'syncRawModeRef(node, getRootNode(node))',
    ]) {
      assert.ok(reconciler.includes(fragment), fragment)
    }
    for (const fragment of [
      'const pendingRawModeDelta = root._pendingRawModeDelta ?? 0',
      'root._pendingRawModeDelta = 0',
      'root.setRawMode = this.handleSetRawMode',
      'this.props.rootNode.setRawMode = undefined',
    ]) {
      assert.ok(app.includes(fragment), fragment)
    }
    assert.match(ink, /rootNode=\{this\.rootNode\}/)

    const createInstance = reconciler.indexOf('createInstance(')
    const setBeforeSync = reconciler.indexOf(
      'applyProp(node, key, value)',
      createInstance,
    )
    const createSync = reconciler.indexOf('syncRawModeRef(node, root)', setBeforeSync)
    assert.ok(setBeforeSync >= 0 && createSync > setBeforeSync)
    const removeRelease = reconciler.indexOf('releaseRawModeRefs(removeNode,')
    assert.ok(removeRelease >= 0)
  },
)
