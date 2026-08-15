import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const unit = {
  index: 5112,
  nodeType: 'VariableDeclaration',
  start: 3752626,
  end: 3754712,
  sourceHash:
    '44bc645b194b3200702e1a70a239bf42e3e4a3aa2667ba6aa2d6e61ee6abde2c',
}
const structural = JSON.parse(
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target111 authenticates the VS Code SDK no-result event allowlist',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target110 and target111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assert.equal(
      sha256(targetBytes),
      '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(
      sha256(target.slice(unit.start, unit.end)),
      unit.sourceHash,
    )
    assert.equal(
      baseline.includes('tengu_vscode_sdk_stream_ended_no_result'),
      false,
    )
    assert.equal(
      target.split('tengu_vscode_sdk_stream_ended_no_result').length - 1,
      1,
    )
  },
)

test(
  'source allows the exact VS Code SDK no-result diagnostic',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'services/analytics/datadog.ts'),
      'utf8',
    )
    assert.match(
      source,
      /'tengu_voice_toggled',[\s\S]*?'tengu_vscode_sdk_stream_ended_no_result',[\s\S]*?'tengu_team_mem_sync_pull'/,
    )
    assert.equal(
      source.split("'tengu_vscode_sdk_stream_ended_no_result'").length - 1,
      1,
    )
  },
)
