import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const identity = [
  3690471,
  3695342,
  'FunctionDeclaration',
  '0f8ec9cc9555be616e0f420ef15d120df8dcbba35e46a26919ef64d71b34393b',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target116 pins the kill-ring paste-discovery notification',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath)
    const target = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baseline),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(target),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const region = structural.regions[7684]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      identity,
    )
    const unit = target.toString('utf8').slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[3])
    for (const fragment of [
      'kill-paste-hint',
      'Ctrl+Y to paste deleted text',
      'timeoutMs:5000',
      'priority:"immediate"',
    ]) {
      assert.ok(unit.includes(fragment), fragment)
    }
    for (const fragment of ['kill-paste-hint', 'Ctrl+Y to paste deleted text']) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    }
    assert.match(
      unit,
      /deleteToLineStart\(\).*?dispatch\(\{type:"kill",text:[^}]+direction:"prepend"\}\).*?\.length>=3.*?kill-paste-hint/s,
    )
  },
)

test(
  'source emits the hint only after a substantial backward line kill',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'hooks/useTextInput.ts'),
      'utf8',
    )
    for (const fragment of [
      'const { cursor: newCursor, killed } = cursor.deleteToLineStart()',
      "killRing.dispatch({ type: 'kill', text: killed, direction: 'prepend' })",
      'if (killed.length >= 3)',
      "key: 'kill-paste-hint'",
      "text: 'Ctrl+Y to paste deleted text'",
      "priority: 'immediate'",
      'timeoutMs: 5000',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    assert.ok(
      owner.indexOf("killRing.dispatch({ type: 'kill', text: killed") <
        owner.indexOf("key: 'kill-paste-hint'"),
    )
  },
)
