import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource = path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const baselineSha256 =
  'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be'
const targetSha256 =
  'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb'

const baselineUnit = {
  index: 18356,
  start: 12801028,
  end: 12803403,
  sourceHash:
    '88968b793bc5110f557a42b49992cd62786d22707fdb61126712b2a0aecfff37',
  nodeType: 'FunctionDeclaration',
}
const targetUnit = {
  index: 18512,
  start: 12896154,
  end: 12898566,
  sourceHash:
    '578f605e75de781f382ed0228407893aa7ba1d8122eb46da2a8a0b9b56901896',
  nodeType: 'FunctionDeclaration',
}

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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target101 authenticates the scheduled-agent local-only gate', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)

  const baselineRegion = structural.unmatchedBaseline.find(
    region => region.index === baselineUnit.index,
  )
  assert.ok(baselineRegion)
  assert.deepEqual(
    [
      baselineRegion.start,
      baselineRegion.end,
      baselineRegion.sourceHash,
      baselineRegion.nodeType,
    ],
    [
      baselineUnit.start,
      baselineUnit.end,
      baselineUnit.sourceHash,
      baselineUnit.nodeType,
    ],
  )
  const targetRegion = structural.regions[targetUnit.index]
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      targetRegion.target.start,
      targetRegion.target.end,
      targetRegion.target.sourceHash,
      targetRegion.target.nodeType,
    ],
    [
      targetUnit.start,
      targetUnit.end,
      targetUnit.sourceHash,
      targetUnit.nodeType,
    ],
  )

  const baselineOwner = baselineBytes
    .toString('utf8')
    .slice(baselineUnit.start, baselineUnit.end)
  const targetOwner = targetBytes
    .toString('utf8')
    .slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)
  assert.equal(sha256(targetOwner), targetUnit.sourceHash)
  assert.equal(occurrences(baselineOwner, 'CLAUDE_CODE_REMOTE'), 0)
  assert.equal(occurrences(targetOwner, 'CLAUDE_CODE_REMOTE'), 1)
  assert.equal(occurrences(targetOwner, 'tengu_surreal_dali'), 1)
  assert.equal(occurrences(targetOwner, 'allow_remote_sessions'), 1)
  assert.ok(
    targetOwner.indexOf('CLAUDE_CODE_REMOTE') <
      targetOwner.indexOf('tengu_surreal_dali'),
  )
  assert.ok(
    targetOwner.indexOf('tengu_surreal_dali') <
      targetOwner.indexOf('allow_remote_sessions'),
  )
  assert.equal(targetOwner.includes('aliases:["routines"]'), false)
})

test('source keeps the target101 gate ordered before feature and policy checks', sourceOptions, () => {
  const owner = source('skills/bundled/scheduleRemoteAgents.ts')
  assert.ok(
    owner.includes("import { isEnvTruthy } from '../../utils/envUtils.js'"),
  )
  const gate = `    isEnabled: () =>
      !isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false) &&
      isPolicyAllowed('allow_remote_sessions'),`
  assert.equal(occurrences(owner, gate), 1)
  if (isCurrentSource) {
    assert.equal(occurrences(owner, "aliases: ['routines']"), 1)
  } else {
    assert.equal(occurrences(owner, "aliases: ['routines']"), 0)
  }
})
