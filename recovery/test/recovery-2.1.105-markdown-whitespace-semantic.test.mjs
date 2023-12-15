import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
      : false,
}
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const units = new Map([
  [9300, [7186368, 7187087, 'a4ad6e8be48899524299aeea1fef6571d0a51560b974249f0ea32dd4ef6d4d40']],
  [9301, [7187087, 7187650, '5f537d3e51f680468d4d0b1c34fc5d72ad23d805b30437c6e9f0b1290c1a7e2a']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('authenticated target105 preserves leading spaces while trimming block boundaries', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  const latestBytes = fs.readFileSync(latestPath)
  assert.equal(sha256(baselineBytes), 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39')
  assert.equal(sha256(targetBytes), '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75')
  assert.equal(sha256(latestBytes), 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a')
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  const latest = latestBytes.toString('utf8')
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual([region.target.start, region.target.end, region.target.sourceHash], identity)
    assert.equal(sha256(target.slice(region.target.start, region.target.end)), identity[2])
  }
  assert.ok(baseline.includes('.join("").trim()'))
  assert.equal(baseline.includes('.join("").replace(/^\\n+/,"").trimEnd()'), false)
  for (const bundle of [target, latest]) {
    assert.ok(bundle.includes('.join("").replace(/^\\n+/,"").trimEnd()'))
    assert.ok(bundle.includes('.replace(/^\\n+/,"").trimEnd()'))
  }
})

test('source owns leading-newline-only and trailing-only block trimming', sourceOptions, () => {
  const owner = fs.readFileSync(path.join(sourceRoot, 'components/Markdown.tsx'), 'utf8')
  assert.ok(owner.includes("nonTableContent.replace(/^\\n+/, '').trimEnd()"))
  assert.ok(owner.includes(".join('').replace(/^\\n+/, '').trimEnd()"))
  assert.equal(owner.includes('nonTableContent.trim()'), false)
  const trimBoundary = value => value.replace(/^\n+/, '').trimEnd()
  assert.equal(trimBoundary('\n\n  meaningful indentation  \n'), '  meaningful indentation')
  assert.equal(trimBoundary('  leading spaces\n\n'), '  leading spaces')
})
