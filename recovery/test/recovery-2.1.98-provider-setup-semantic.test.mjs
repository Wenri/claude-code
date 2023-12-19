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
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
      : false,
}

const expectedUnits = [
  [11334, 8798262, 8798293, 'b25868aada47ad8c37adcabc403cf302407dd1f6175ced707f133febc3d01842'],
  [11336, 8798316, 8798792, '7289d75fd6576746e93585a27fbfc555269bf74c9b81f889909cd47cba1496d5'],
  [11337, 8798792, 8798815, 'c0b5f7891ade0ce2b929f36f8ce5c10fb485928b01d78cbecacc85cf6c08416b'],
  [14912, 11079253, 11079351, '33b2fee06b448dc122d415e6ee07dadc7bb86361700bd04a2da0331a1faa8f4d'],
  [14913, 11079351, 11079897, '873973cf7126b15bbd9e108d3ff5dc49cae4b9406c3967a4dffef5a6f49f150d'],
  [14915, 11079908, 11079975, 'dd1765607c65e2dc9ca40e696e164a5d49a2d226e17c0e5ee33a60f6c925979e'],
  [14919, 11080250, 11080273, '0d9632595bcab88cddcc7479e9fc2b3342dd9445345120d8ae001f9870fc1c0e'],
  [14920, 11080273, 11080370, 'e9adf46b0be63ea101abc481d1d55f20ac70f6cea4564276327a178a46f4b3c6'],
  [14921, 11080370, 11080915, '7a71014e4af5cf9c3b1b9489b97c5d26f888d1534c9d94d162b816916d4e0482'],
  [14923, 11080926, 11080993, '022c72bc95ca69962ebf15c31c4769d6e79b0f41d0df736c78f6f444b66e1779'],
  [14925, 11081001, 11081269, 'c50fa3d5cc29144eaeb6591c980d55baabede90ac846b7df594c15920bc5166c'],
  [15952, 11572818, 11575633, 'f0abb6d6bc14e3f766fbe2d3708c082f62143f99b58a3fc5c5e06553f5e25b2c'],
]

test('target98 pins the complete provider setup command boundary', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
  )
  const bundle = bytes.toString('utf8')
  const units = new Map()
  for (const [index, start, end, hash] of expectedUnits) {
    const region = structural.regions.find(row => row.target?.index === index)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    const unit = bundle.slice(start, end)
    assert.equal(sha256(unit), hash)
    units.set(index, unit)
  }

  assert.ok(units.get(11334).includes('execRelaunch'))
  for (const fragment of [
    'child_process',
    'SIGINT',
    'SIGTERM',
    'SIGHUP',
    'Failed to relaunch Claude Code:',
  ]) assert.ok(units.get(11336).includes(fragment), fragment)
  assert.ok(units.get(14912).includes('tengu_bedrock_setup_started'))
  assert.ok(units.get(14913).includes('tengu_bedrock_setup_cancelled'))
  assert.ok(units.get(14913).includes('to restart Claude Code.'))
  assert.ok(units.get(14920).includes('tengu_vertex_setup_started'))
  assert.ok(units.get(14921).includes('tengu_vertex_setup_cancelled'))
  assert.ok(units.get(14921).includes('to restart Claude Code.'))
  assert.ok(units.get(14925).includes('setup-vertex'))
  assert.ok(units.get(14925).includes('CLAUDE_CODE_USE_VERTEX'))
})

test('source owns both provider commands, confirmation, and exact relaunch behavior', sourceOptions, () => {
  const providerRoot = path.join(sourceRoot, 'commands/provider-setup')
  const index = fs.readFileSync(path.join(providerRoot, 'index.ts'), 'utf8')
  const bedrock = fs.readFileSync(path.join(providerRoot, 'bedrock.tsx'), 'utf8')
  const vertex = fs.readFileSync(path.join(providerRoot, 'vertex.tsx'), 'utf8')
  const relaunch = fs.readFileSync(path.join(providerRoot, 'relaunch.ts'), 'utf8')
  const commands = fs.readFileSync(path.join(sourceRoot, 'commands.ts'), 'utf8')

  for (const fragment of [
    "name: 'setup-bedrock'",
    'CLAUDE_CODE_USE_BEDROCK',
    "name: 'setup-vertex'",
    'CLAUDE_CODE_USE_VERTEX',
  ]) assert.ok(index.includes(fragment), fragment)

  for (const [source, provider] of [
    [bedrock, 'bedrock'],
    [vertex, 'vertex'],
  ]) {
    assert.ok(source.includes('const [completeMessage, setCompleteMessage]'))
    assert.ok(source.includes("'confirm:yes'"))
    assert.ok(source.includes('app.exit()'))
    assert.ok(source.includes('to restart Claude Code.'))
    assert.ok(source.includes(`tengu_${provider}_setup_started`))
    assert.ok(source.includes(`tengu_${provider}_setup_cancelled`))
    assert.match(source, /relaunchAfterProviderSetup|execRelaunch/)
  }

  assert.match(relaunch, /relaunchAfterProviderSetup|execRelaunch/)
  assert.ok(relaunch.includes("process.argv.slice(2)"))
  assert.ok(relaunch.includes("stdio: 'inherit'"))
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    assert.ok(relaunch.includes(signal), signal)
  }
  assert.ok(relaunch.includes('Failed to relaunch Claude Code:'))
  assert.match(commands, /setupBedrock[\s\S]*setupVertex/)
})

test('target97 predates Vertex and the provider confirmation relaunch module', {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
    : false,
}, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('tengu_vertex_setup_started'), false)
  assert.equal(bundle.includes('setup-vertex'), false)
  assert.equal(bundle.includes('execRelaunch'), false)
  assert.ok(bundle.includes('tengu_bedrock_setup_started'))
})
