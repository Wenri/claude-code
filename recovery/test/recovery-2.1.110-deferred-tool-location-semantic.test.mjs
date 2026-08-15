import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(root, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(fs.readFileSync(path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'))),
)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins system-reminder-only deferred-tool discovery',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath)
    const target = fs.readFileSync(targetPath)
    assert.equal(sha256(baseline), '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7')
    assert.equal(sha256(target), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const region = structural.regions[7300]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [4924783, 4925762, 'acf9447bc52cd93df8cba3428684fbcc92e7e8a14665356b1be0bce55839862b'],
    )
    const baselineText = baseline.toString('utf8')
    const targetText = target.toString('utf8')
    assert.equal(sha256(targetText.slice(4924783, 4925762)), region.target.sourceHash)
    assert.equal(baselineText.includes('tengu_glacier_2xr'), true)
    assert.equal(targetText.includes('tengu_glacier_2xr'), false)
    assert.equal(targetText.includes('Deferred tools appear by name in <available-deferred-tools> messages.'), false)
    assert.match(targetText.slice(4924783, 4925762), /Deferred tools appear by name in <system-reminder> messages\./)
  },
)

test(
  'source always announces deferred tools through persisted system reminders',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const prompt = fs.readFileSync(path.join(sourceRoot, 'tools/ToolSearchTool/prompt.ts'), 'utf8')
    const search = fs.readFileSync(path.join(sourceRoot, 'utils/toolSearch.ts'), 'utf8')
    assert.match(prompt, /Deferred tools appear by name in <system-reminder> messages\./)
    assert.equal(prompt.includes('getToolLocationHint'), false)
    assert.equal(prompt.includes('available-deferred-tools'), false)
    const gate = search.match(/export function isDeferredToolsDeltaEnabled[\s\S]*?\n\}/)?.[0]
    assert.ok(gate)
    assert.match(gate, /\(\): true/)
    assert.match(gate, /return true/)
    assert.equal(gate.includes('tengu_glacier_2xr'), false)
  },
)
