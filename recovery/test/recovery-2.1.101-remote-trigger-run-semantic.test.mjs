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
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const units = new Map([
  [12369, [9511890, 9512522, '325cdfd860dd24b7297d5406bc4fa24086dfd3afda830e46ae520883cba3792b', 'VariableDeclaration']],
  [12377, [9512937, 9515112, '022765e618db152617550bbedfbc609ffd67678cf5e80dac3c62f43d09d7eb4e', 'VariableDeclaration']],
])

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins the RemoteTrigger prompt and executable tool delta', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), 'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be')
  assert.equal(sha256(targetBytes), 'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb')
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, hash, nodeType]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash, region.target.nodeType],
      [start, end, hash, nodeType],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
  }
})

test('target101 makes run payload optional, local-only, and trigger-addressed', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const prompt = target.slice(...units.get(12369).slice(0, 2))
  const tool = target.slice(...units.get(12377).slice(0, 2))
  assert.equal(baseline.includes('/run (optional body)'), false)
  assert.ok(prompt.includes('/run (optional body)'))
  assertFragments(tool, [
    'CLAUDE_CODE_REMOTE',
    'case"run"',
    'trigger_id:',
    'run requires trigger_id',
  ], 'target101 RemoteTrigger tool')
  assert.equal(tool.includes('J={}'), false, 'run no longer sends an empty object')
})

test('source owns the exact RemoteTrigger boundary and latest schema evolution', sourceOptions, () => {
  const prompt = source('tools/RemoteTriggerTool/prompt.ts')
  const tool = source('tools/RemoteTriggerTool/RemoteTriggerTool.ts')
  assert.ok(prompt.includes('- run: POST /v1/code/triggers/{trigger_id}/run (optional body)'))
  assertFragments(tool, [
    "import { isEnvTruthy } from '../../utils/envUtils.js'",
    '!isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)',
    "case 'run':",
    'data = { ...body, trigger_id }',
  ], 'RemoteTriggerTool.ts')
  if (isCurrentSource) {
    assert.ok(tool.includes(".describe('Required for create and update; optional for run')"))
  } else {
    assert.ok(tool.includes(".describe('JSON body for create and update')"))
    assert.equal(tool.includes('optional for run'), false)
  }
})
