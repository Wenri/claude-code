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
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
      : false,
}

test('target98 pins scope-local plugin update fallback', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const bundle = bytes.toString('utf8')
  const region = structural.regions.find(row => row.target?.index === 14400)
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [10759578, 10760644, '92a25608a5e16a199d69fb1ccb154b7039b38d8d7af6f8e3c0c102dd60b47ac0'],
  )
  const unit = bundle.slice(region.target.start, region.target.end)
  assert.equal(sha256(unit), region.target.sourceHash)
  for (const fragment of [
    'updatePluginOp: ',
    '-scope installs, none match CWD \'',
    "'; updating '",
    "' only",
  ]) assert.ok(unit.includes(fragment), fragment)
})

test('source chooses an exact scoped installation or the first scoped fallback', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'services/plugins/pluginOperations.ts'), 'utf8')
  assert.ok(source.includes('const scopeInstallations = installations.filter(inst => inst.scope === scope)'))
  assert.ok(source.includes('const matchingInstallation = scopeInstallations.find('))
  assert.ok(source.includes('matchingInstallation ?? scopeInstallations[0]'))
  assert.ok(source.includes("-scope installs, none match CWD '${projectPath}'; updating '${scopeInstallations[0]?.projectPath}' only"))
  assert.ok(source.includes('projectPath: installation.projectPath'))
})

test('target97 predates scope-local fallback', {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
    : false,
}, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  assert.equal(bytes.toString('utf8').includes('updatePluginOp: '), false)
})
