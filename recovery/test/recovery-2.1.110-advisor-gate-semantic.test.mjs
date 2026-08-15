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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target110 authenticates the advisor first-party and explicit-env gate',
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
    const region = structural.regions[8392]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        5706011,
        5706246,
        'FunctionDeclaration',
        '1809537adfbbd8f8edf75601145e0cc01580e2122815f49f0b602ad0b8e461e1',
      ],
    )
    const target = targetBytes.toString('utf8')
    const unit = target.slice(region.target.start, region.target.end)
    assert.equal(sha256(unit), region.target.sourceHash)
    for (const fragment of [
      'CLAUDE_CODE_DISABLE_ADVISOR_TOOL',
      '"firstParty"',
      'CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL',
      'tengu_sage_compass2',
    ]) {
      assert.ok(unit.includes(fragment), fragment)
    }
    assert.equal(
      baselineBytes
        .toString('utf8')
        .includes('CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL'),
      false,
    )
  },
)

test(
  'source owns advisor provider, beta, explicit-env, and model gates',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'utils/advisor.ts'),
      'utf8',
    )
    for (const fragment of [
      "process.env.CLAUDE_CODE_DISABLE_ADVISOR_TOOL",
      "getAPIProvider() !== 'firstParty'",
      'process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
      'process.env.CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL',
      "'tengu_sage_compass2'",
      'export function resolveAdvisorModel(',
      '[AdvisorTool] Skipping advisor - base model',
      '[AdvisorTool] Server-side tool enabled with',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    assert.equal(
      owner.includes("m.includes('opus-4-7')"),
      semanticCase === caseName ? false : true,
    )
    assert.ok(owner.includes("m.includes('opus-4-6')"))
    assert.ok(owner.includes("m.includes('sonnet-4-6')"))
  },
)
