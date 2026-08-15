import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE and CLAUDE_CODE_2_1_98_BUNDLE are required'
      : false,
}

test('target98 pins best-effort default environment creation', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  assert.equal(
    sha256(target),
    '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
  )
  const region = structural.regions.find(row => row.target?.index === 15875)
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      11481830,
      11483853,
      '269b8376af9e681e7d000ea1df02bd7af6f8d17e4a70c729ad16486922150693',
    ],
  )
  const unit = target.toString('utf8').slice(
    region.target.start,
    region.target.end,
  )
  assert.equal(sha256(unit), region.target.sourceHash)
  for (const fragment of [
    '[web-setup] Failed to create default environment: ',
    'tengu_remote_setup_result',
    'import_failed',
    'success',
  ]) assert.ok(unit.includes(fragment), fragment)
  assert.equal(
    baseline.toString('utf8').includes(
      '[web-setup] Failed to create default environment: ',
    ),
    false,
  )
})

test('source owns idempotent best-effort creation and exact warning behavior', sourceOptions, () => {
  const api = fs.readFileSync(
    path.join(sourceRoot, 'commands/remote-setup/api.ts'),
    'utf8',
  )
  const command = fs.readFileSync(
    path.join(sourceRoot, 'commands/remote-setup/remote-setup.tsx'),
    'utf8',
  )
  for (const fragment of [
    'async function hasExistingEnvironment()',
    'if (await hasExistingEnvironment())',
    'export async function createDefaultEnvironment()',
    '[web-setup] Failed to create default environment: ${error}',
    "{ level: 'warn' }",
    'return false',
  ]) assert.ok(api.includes(fragment), fragment)
  const creation = command.indexOf('await createDefaultEnvironment()')
  assert.notEqual(creation, -1)
  assert.ok(command.indexOf('await openBrowser(url)', creation) > creation)
  assert.ok(command.includes("result: 'success'"))
})
