import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz')),
  ),
)
const units = new Map([
  [10140, ['FunctionDeclaration', 7900887, 7901310, 'ef778f4eb0bd6af41339dd65f6445166818783242796597739d8d33aba223f15']],
  [10184, ['FunctionDeclaration', 7916997, 7917496, '7f9b5b097e17a50608b90558c24facde8129af06ffdb5b0013937cb4b2898959']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target111 pins native channel diagnostics and skipped-result propagation',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target110 and target111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    assert.equal(sha256(targetBytes), '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0')
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [nodeType, start, end, sourceHash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
        [nodeType, start, end, sourceHash],
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash)
    }
    assert.equal(baseline.includes("Use 'latest' or 'stable'"), false)
    assert.equal(target.split("Use 'latest' or 'stable'").length - 1, 1)
    assert.equal(baseline.split('wasSkipped:').length - 1, 3)
    assert.equal(target.split('wasSkipped:').length - 1, 4)
    assert.match(target.slice(7900887, 7901310), /!=="rc".*Use 'latest' or 'stable'.*==="rc".*Use 'stable' or 'latest'/s)
    assert.match(target.slice(7916997, 7917496), /wasUpdated:.*!.*\.wasSkipped,wasSkipped:.*\.wasSkipped/s)
  },
)

test(
  'source distinguishes invalid/retired channels and preserves skipped status',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const download = fs.readFileSync(
      path.join(sourceRoot, 'utils/nativeInstaller/download.ts'),
      'utf8',
    )
    const installer = fs.readFileSync(
      path.join(sourceRoot, 'utils/nativeInstaller/installer.ts'),
      'utf8',
    )
    assert.match(
      download,
      /channel !== 'stable' &&[\s\S]*channel !== 'latest' &&[\s\S]*channel !== 'rc'[\s\S]*Use 'latest' or 'stable'[\s\S]*channel === 'rc'[\s\S]*Use 'stable' or 'latest'/,
    )
    assert.match(installer, /wasSkipped\?: boolean/)
    assert.match(
      installer,
      /wasUpdated: updateResult\.success && !updateResult\.wasSkipped,[\s\S]*wasSkipped: updateResult\.wasSkipped/,
    )
  },
)
