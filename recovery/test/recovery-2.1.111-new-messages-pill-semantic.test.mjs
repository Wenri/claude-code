import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const case111 = '2.1.110-to-2.1.111'
const case116 = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const applicable =
  !semanticCase || semanticCase === case111 || semanticCase === case116
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)

const pair111 = {
  baselinePath: process.env.CLAUDE_CODE_2_1_110_BUNDLE,
  targetPath: process.env.CLAUDE_CODE_2_1_111_BUNDLE,
  baselineHash:
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  targetHash:
    '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
  unit: {
    index: 15358,
    nodeType: 'FunctionDeclaration',
    start: 11051090,
    end: 11051891,
    sourceHash:
      '12a7678140fc499a32ea2d96a010b7615c46b7daa2e1985b94d085df6c1405a9',
  },
}
const pair116 = {
  baselinePath: process.env.CLAUDE_CODE_2_1_114_BUNDLE,
  targetPath: process.env.CLAUDE_CODE_2_1_116_BUNDLE,
  baselineHash:
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  targetHash:
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  unit: {
    index: 16530,
    nodeType: 'FunctionDeclaration',
    start: 10409014,
    end: 10409831,
    sourceHash:
      'f4fb877ac8b5946072ee99b131c891494fe0b69f576c4b0a4e0e907090603c38',
  },
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function structural(caseName) {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases',
          caseName,
          'structural/generated-delta.json.gz',
        ),
      ),
    ),
  )
}

function count(value, fragment) {
  return value.split(fragment).length - 1
}

function assertUnit(pair, caseName, target) {
  const region = structural(caseName).regions[pair.unit.index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [
      region.target.nodeType,
      region.target.start,
      region.target.end,
      region.target.sourceHash,
    ],
    [
      pair.unit.nodeType,
      pair.unit.start,
      pair.unit.end,
      pair.unit.sourceHash,
    ],
  )
  assert.equal(
    sha256(target.slice(pair.unit.start, pair.unit.end)),
    pair.unit.sourceHash,
  )
  return target.slice(pair.unit.start, pair.unit.end)
}

test(
  'target111 authenticates the fullscreen scroll-bottom shortcut introduction',
  {
    skip:
      semanticCase && semanticCase !== case111
        ? `not applicable to ${semanticCase}`
        : !pair111.baselinePath || !pair111.targetPath
          ? 'authenticated target110 and target111 bundles are required'
          : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(pair111.baselinePath)
    const targetBytes = fs.readFileSync(pair111.targetPath)
    assert.equal(sha256(baselineBytes), pair111.baselineHash)
    assert.equal(sha256(targetBytes), pair111.targetHash)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const owner = assertUnit(pair111, case111, target)
    assert.match(owner, /"scroll:bottom","Scroll","ctrl\+end"/)
    assert.match(owner, /" ","\(",[^,]+,"\) "/)
    assert.doesNotMatch(owner, /noSelect:!0/)
    assert.equal(count(target, 'scroll:bottom'), count(baseline, 'scroll:bottom') + 1)
    assert.equal(count(target, 'ctrl+end'), count(baseline, 'ctrl+end') + 1)
  },
)

test(
  'target116 authenticates the fullscreen pill noSelect evolution',
  {
    skip:
      semanticCase && semanticCase !== case116
        ? `not applicable to ${semanticCase}`
        : !pair116.baselinePath || !pair116.targetPath
          ? 'authenticated target114 and target116 bundles are required'
          : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(pair116.baselinePath)
    const targetBytes = fs.readFileSync(pair116.targetPath)
    assert.equal(sha256(baselineBytes), pair116.baselineHash)
    assert.equal(sha256(targetBytes), pair116.targetHash)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const owner = assertUnit(pair116, case116, target)
    assert.match(owner, /"scroll:bottom","Scroll","ctrl\+end"/)
    assert.match(owner, /noSelect:!0,onClick:/)
    assert.equal(count(target, 'noSelect:!0'), count(baseline, 'noSelect:!0') + 1)
  },
)

test(
  'source keeps the shortcut introduction and the later non-selectable pill distinct',
  { skip: applicable ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'components/FullscreenLayout.tsx'),
      'utf8',
    )
    const hasShortcut = /useShortcutDisplay\('scroll:bottom', 'Scroll', 'ctrl\+end'\)/.test(
      source,
    )
    const hasNoSelect = /<Box noSelect=\{true\} onClick=\{onClick\}/.test(source)

    if (semanticCase === case111) {
      assert.equal(hasShortcut, true)
      assert.equal(hasNoSelect, false)
      return
    }
    if (semanticCase === case116) {
      // The isolated own-116 tree intentionally contains only this boundary's
      // property. Ordered semantic-source lineage supplies the 111 shortcut.
      assert.equal(hasNoSelect, true)
      return
    }
    assert.equal(hasShortcut, true)
    assert.equal(hasNoSelect, true)
  },
)
