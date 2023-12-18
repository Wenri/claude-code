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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const units = new Map([
  [11411, [8825684, 8831198, '44910cc3a8aba2a2f5f6ae7ad852427abb555e7d6ede41d38a06ec2071c0f889']],
  [11429, [8840262, 8840831, '3e9196cd55bb8bb043e9d3ea9122aa872ae95110fbcd35a07a9d0214bbdc47b6']],
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

test('target101 pins OAuth URL outdent propagation', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), 'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be')
  assert.equal(sha256(targetBytes), 'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb')
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    assert.equal(sha256(target.slice(identity[0], identity[1])), identity[2])
  }
  const flow = target.slice(8825684, 8831198)
  const login = target.slice(8840262, 8840831)
  assert.match(flow, /urlOutdent:[^=}]+=?0/)
  assert.match(flow, /marginX:[^?]+\?-[^:]+:void 0/)
  assert.ok(login.includes('urlOutdent:'))
  assert.equal(fs.readFileSync(baselineBundlePath, 'utf8').includes('urlOutdent'), false)
})

test('source owns platform and dialog padding compensation', sourceOptions, () => {
  const flow = fs.readFileSync(path.join(sourceRoot, 'components/ConsoleOAuthFlow.tsx'), 'utf8')
  const login = fs.readFileSync(path.join(sourceRoot, 'commands/login/login.tsx'), 'utf8')
  for (const fragment of [
    'urlOutdent?: number;',
    'urlOutdent = 0',
    "(process.platform === 'win32' ? 2 : 0) + urlOutdent",
    'marginX={effectiveUrlOutdent ? -effectiveUrlOutdent : undefined}',
  ]) assert.ok(flow.includes(fragment), fragment)
  assert.ok(login.includes("urlOutdent={process.platform === 'win32' ? 1 : 2}"))
})

test('target116 retains OAuth URL outdent', {
  skip: semanticCase || !latestBundlePath ? 'current target116 evidence unavailable' : false,
}, () => {
  assert.equal((fs.readFileSync(latestBundlePath, 'utf8').match(/urlOutdent/g) ?? []).length, 2)
})
