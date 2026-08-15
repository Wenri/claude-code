import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const targetUnits = new Map([
  [15525, [11168958, 11169912, '4ab3ecda4cc56a6af1616c361d0722d55b178135b081450ff9b24e1c9139bedb']],
  [17411, [12089262, 12090927, 'dc8f59cdef9353d7af60e1c25ad531ac6913c628ad2ddb68fd8a075bc631db9b']],
  [17415, [12091068, 12092288, 'a2f559355b183884506eb6bffde6098b963ffcc6ad7d4f01a583deccc69534ad']],
  [17418, [12093203, 12098596, '0a6e72407b301b4ac7ce82740b3df43f87810a140098a619d680ce1633b379a1']],
  [17427, [12101603, 12110853, '183fe3a83159dda4cea4664d2f086627d3902dcf6ca215b4140650e851c16a09']],
  [17479, [12136584, 12137598, 'fad78987d304a65676c17e636cca276d17d06ef8046644157c6c7ba036541d7f']],
  [17481, [12137626, 12141824, 'fd2c5d0c24f6c7da88109ddb11236a65b0665ca5c8539cd881850d14d9ef702e']],
])

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative.replace(/^src\//, '')), 'utf8')
}

test('target108 pins every changed permission wildcard and plan-save unit', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844')
  assert.equal(sha256(targetBytes), 'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73')
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
    assert.equal(parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length, 1)
  }
})

test('target108 replaces editable command-prefix wildcards and retains legacy display compatibility', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.ok(baseline.includes('command prefix (e.g., npm run:*)'))
  assert.ok(baseline.includes('command prefix (e.g., Get-Process:*)'))
  assert.ok(!baseline.includes('command prefix (e.g., npm run *)'))
  assert.ok(target.includes('command prefix (e.g., npm run *)'))
  assert.ok(target.includes('command prefix (e.g., Get-Process *)'))
  assert.ok(target.includes('endsWith(":*")||_.ruleContent.endsWith(" *")'))
  assert.ok(target.includes('endsWith(":*")||X.ruleContent.endsWith(" *")'))
  for (const fragment of [
    'if(e)return`${e} *`',
    'if(o)return`${o} *`',
    'F(`${o[0]} *`)',
    'b(`${c[0]} *`)',
    'status:"success",withSpace:!0',
  ]) assert.ok(target.includes(fragment), fragment)
})

test('source owns the complete target108 permission wildcard and plan-save graph', sourceOptions, () => {
  const description = source('src/components/permissions/rules/PermissionRuleDescription.tsx')
  const helpers = source('src/components/permissions/shellPermissionHelpers.tsx')
  const bashOptions = source('src/components/permissions/BashPermissionRequest/bashToolUseOptions.tsx')
  const bashRequest = source('src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx')
  const powershellOptions = source('src/components/permissions/PowerShellPermissionRequest/powershellToolUseOptions.tsx')
  const powershellRequest = source('src/components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx')
  const exitPlan = source('src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx')
  assert.match(description, /endsWith\(["']:\*["']\)\s*\|\|\s*ruleValue\.ruleContent\.endsWith\(["'] \*["']\)/)
  assert.match(helpers, /rule\.ruleContent\.endsWith\(["']:\*["']\)\s*\|\|\s*rule\.ruleContent\.endsWith\(["'] \*["']\)/)
  assert.ok(bashOptions.includes('command prefix (e.g., npm run *)'))
  assert.ok(powershellOptions.includes('command prefix (e.g., Get-Process *)'))
  for (const fragment of ['return `${two} *`', 'return `${one} *`', 'setEditablePrefix(`${prefixes[0]} *`)']) {
    assert.ok(bashRequest.includes(fragment), fragment)
  }
  assert.ok(powershellRequest.includes('setEditablePrefix(`${prefixes[0]} *`)'))
  assert.equal((exitPlan.match(/<StatusIcon status="success" withSpace \/>Plan saved!/g) ?? []).length, 2)
  assert.ok(!exitPlan.includes('figures.tick'))
})
