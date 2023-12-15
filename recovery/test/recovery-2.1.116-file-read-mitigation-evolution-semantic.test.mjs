import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const selected =
  !process.env.CLAUDE_CODE_SEMANTIC_CASE ||
  process.env.CLAUDE_CODE_SEMANTIC_CASE === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = { skip: selected ? false : `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
      : false,
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

const baselineUnits = new Map([
  [14056, [8886005, 8886077, 'FunctionDeclaration', 'acc7325bd465091504d78f9da4662447c27703b6ee052d4ebc7f6acb76cd64d4']],
  [14063, [8891142, 8900079, 'VariableDeclaration', '3f1ad879737cc0552c17e14162a4b20e9b1f0056f4c984ed09305fcb461bd67f']],
])
const targetUnits = new Map([
  [14189, [8935871, 8935911, 'FunctionDeclaration', '1288d658a1453b2896f3a8fbde6b5b8572492d08ca8db971291ee72a1e61a0e4']],
  [14196, [8940974, 8949878, 'VariableDeclaration', '8f970eebd780c61556c359174c8c6bff45d4dcdc4d39328fbff632c337bfe068']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source() {
  return fs.readFileSync(
    path.join(sourceRoot, 'tools/FileReadTool/FileReadTool.ts'),
    'utf8',
  )
}

test(
  'authenticated target116 evolves the inherited FileRead mitigation gate to canonical model names',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [index, [start, end, nodeType, hash]] of baselineUnits) {
      const unit = structural.unmatchedBaseline.find(row => row.index === index)
      assert.deepEqual(
        [unit?.start, unit?.end, unit?.nodeType, unit?.sourceHash],
        [start, end, nodeType, hash],
        `baseline unit ${index}`,
      )
      assert.equal(sha256(baseline.slice(start, end)), hash)
    }
    for (const [index, [start, end, nodeType, hash]] of targetUnits) {
      const unit = structural.regions[index]
      assert.equal(unit?.classification, 'unresolved')
      assert.deepEqual(
        [unit?.target?.start, unit?.target?.end, unit?.target?.nodeType, unit?.target?.sourceHash],
        [start, end, nodeType, hash],
        `target unit ${index}`,
      )
      assert.equal(sha256(target.slice(start, end)), hash)
    }

    const baselinePredicate = baseline.slice(8886005, 8886077)
    const baselineOwner = baseline.slice(8891142, 8900079)
    const targetPredicate = target.slice(8935871, 8935911)
    const targetOwner = target.slice(8940974, 8949878)
    assert.match(baselinePredicate, /\.some\(/)
    assert.match(baselineOwner, /claude-sonnet-4\(\?:\$\|/)
    assert.match(targetPredicate, /\.has\([^)]*\([^)]*\(\)\)\)/)
    for (const exact of ['claude-sonnet-4-0', 'claude-opus-4-0']) {
      assert.ok(targetOwner.includes(`"${exact}"`), exact)
    }
    assert.equal(targetOwner.includes('"claude-sonnet-4"'), false)
    assert.equal(targetOwner.includes('"claude-opus-4"'), false)
  },
)

test(
  'source keeps the canonical FileRead mitigation Set without unsuffixed model aliases',
  sourceOptions,
  () => {
    const fileRead = source()
    assert.ok(fileRead.includes('const CYBER_RISK_MITIGATION_MODELS = new Set(['))
    assert.ok(fileRead.includes('getCanonicalName(getMainLoopModel())'))
    assert.ok(fileRead.includes('CYBER_RISK_MITIGATION_MODELS.has(shortName)'))
    for (const exact of [
      "'claude-sonnet-4-0'",
      "'claude-sonnet-4-5'",
      "'claude-opus-4-0'",
      "'claude-opus-4-1'",
      "'claude-opus-4-5'",
    ]) {
      assert.ok(fileRead.includes(exact), exact)
    }
    assert.equal(fileRead.includes("'claude-sonnet-4',"), false)
    assert.equal(fileRead.includes("'claude-opus-4',"), false)
  },
)
