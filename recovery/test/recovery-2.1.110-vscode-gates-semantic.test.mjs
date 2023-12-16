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
  gunzipSync(
    fs.readFileSync(path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz')),
  ),
)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins the complete VS Code experiment-gate notification',
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
    const region = structural.regions[7010]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [4833896, 4834466, 'c6e77708d03fa9227524688c8f295405635bda981725bdcaa1250805100da679'],
    )
    assert.equal(sha256(target.toString('utf8').slice(4833896, 4834466)), region.target.sourceHash)
    assert.equal(baseline.toString('utf8').includes('tengu_slate_ribbon'), false)
    assert.match(target.toString('utf8').slice(4833896, 4834466), /tengu_slate_ribbon/)
  },
)

test(
  'source includes the target gate in the connected-client payload',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(path.join(sourceRoot, 'services/mcp/vscodeSdkMcp.ts'), 'utf8')
    const setup = source.match(/export function setupVscodeSdkMcp[\s\S]*?\n\}/)?.[0]
    assert.ok(setup)
    assert.match(
      setup,
      /tengu_slate_ribbon:\s*getFeatureValue_CACHED_MAY_BE_STALE\(\s*'tengu_slate_ribbon',\s*false,?\s*\)/,
    )
    assert.ok(setup.indexOf('tengu_vscode_cc_auth') < setup.indexOf('tengu_slate_ribbon'))
    assert.ok(setup.indexOf('tengu_slate_ribbon') < setup.indexOf('tengu_auto_mode_state'))
  },
)
