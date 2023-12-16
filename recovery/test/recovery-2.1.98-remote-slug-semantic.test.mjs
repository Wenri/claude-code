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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
    : false,
}
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target98 pins the complete repository remote-slug cluster', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const bundle = bytes.toString('utf8')
  const expected = new Map([
    [2425, [961702, 961814, 'c629f1fea888e2df39ebdb1c42ef84646e09c5a36391f7f5a99f7127dc7172a0']],
    [2426, [961814, 961865, '8a6c1d36ebbc379993f03ef044e25ee6761fee0c6355d1ada21570195a15a99d']],
    [2437, [967453, 969030, 'c121f47d25d3981bb61ffae4fcf09be7be988a75365d3a296cb5beb5b3b728b8']],
  ])
  const owners = []
  for (const [index, identity] of expected) {
    const region = structural.regions.find(row => row.target?.index === index)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    const owner = bundle.slice(region.target.start, region.target.end)
    assert.equal(sha256(owner), identity[2])
    owners.push(owner)
  }
  const cluster = owners.join('\n')
  assert.ok(cluster.includes('remote-slug-not-found'))
  assert.ok(cluster.includes('"pushurl"'))
  assert.ok(cluster.includes('"url"'))
  assert.ok(cluster.indexOf('"pushurl"') < cluster.lastIndexOf('"url"'))
  assert.ok(cluster.includes(',50)'))
})

test('source owns config lookup, pushurl precedence, normalization, and cached misses', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'utils/git.ts'), 'utf8')
  assert.ok(source.includes("join(repositoryRoot, '.git', 'config')"))
  assert.ok(source.includes("join(repositoryRoot, 'config')"))
  assert.ok(source.includes("parseConfigString(config, 'remote', 'origin', key)"))
  assert.ok(source.includes("normalizedRemote('pushurl') ??"))
  assert.ok(source.includes("normalizedRemote('url') ??"))
  assert.ok(source.indexOf("normalizedRemote('pushurl')") < source.indexOf("normalizedRemote('url')"))
  assert.ok(source.includes("Symbol('remote-slug-not-found')"))
  assert.ok(source.includes('result === REMOTE_SLUG_NOT_FOUND ? null : result'))
  assert.match(source, /findRepoRemoteSlugImpl = memoizeWithLRU\([\s\S]*?repositoryRoot => repositoryRoot,\s*50,/)
})

test('2.1.97 predates repository remote-slug discovery', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('remote-slug-not-found'), false)
  assert.equal(bundle.includes('findRepoRemoteSlug'), false)
})
