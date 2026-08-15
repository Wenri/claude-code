import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target113 pins the concise compact command description',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target112 and target113 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
    )
    assert.equal(
      sha256(targetBytes),
      '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const baselineUnit = structural.unmatchedBaseline.find(
      unit => unit.index === 14102,
    )
    const region = structural.regions[15153]
    assert.ok(baselineUnit)
    assert.deepEqual(
      [
        baselineUnit.nodeType,
        baselineUnit.start,
        baselineUnit.end,
        baselineUnit.sourceHash,
      ],
      [
        'VariableDeclaration',
        10138144,
        10138516,
        '0b02dbca61094968e5b36c01e2ff411f68e9e40c4cef1f55dedf6a32c50d7bc7',
      ],
    )
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [
        'VariableDeclaration',
        9422656,
        9422973,
        '0a138101b59b3e6b483dc6bfe0ee005e51bd50850cd6e19a5dfa828badc4b6fe',
      ],
    )
    assert.equal(
      sha256(baseline.slice(10138144, 10138516)),
      baselineUnit.sourceHash,
    )
    assert.equal(
      sha256(target.slice(9422656, 9422973)),
      region.target.sourceHash,
    )
    assert.equal(
      target.slice(9422721, 9422777),
      '"Free up context by summarizing the conversation so far"',
    )
    assert.equal(
      baseline.includes('Free up context by summarizing the conversation so far'),
      false,
    )
    assert.equal(
      baseline.includes(
        'Clear conversation history but keep a summary in context. Optional: /compact [instructions for summarization]',
      ),
      true,
    )
  },
)

test(
  'source exposes the target113 compact metadata without changing its command contract',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'commands/compact/index.ts'),
      'utf8',
    )
    for (const fragment of [
      "type: 'local'",
      "name: 'compact'",
      "description: 'Free up context by summarizing the conversation so far'",
      "isEnabled: () => !isEnvTruthy(process.env.DISABLE_COMPACT)",
      'supportsNonInteractive: true',
      "argumentHint: '<optional custom summarization instructions>'",
      "load: () => import('./compact.js')",
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    assert.equal(owner.includes('Clear conversation history but keep a summary'), false)
  },
)
