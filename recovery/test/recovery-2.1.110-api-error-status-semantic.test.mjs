import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(root, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const units = new Map([
  [6848, [4735666, 4735785, '824c712e8841d4ff8ecc4341bd016857a7fcb1b667373c5363c05f0d024184a8']],
  [19261, [13337973, 13355330, '6d29e13fed7a6a106f8a03af99a1a03549db5e2307c717f1380de982ea97efd6']],
])
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins API status propagation from error to SDK result',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7')
    assert.equal(sha256(targetBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    assert.equal(baseline.includes('apiErrorStatus'), false)
    assert.equal(baseline.includes('api_error_status'), false)
    assert.match(target.slice(4735666, 4735785), /apiErrorStatus/)
    assert.match(target.slice(13337973, 13355330), /api_error_status/)
  },
)

test(
  'source carries numeric API status through the assistant and SDK result shapes',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const errors = fs.readFileSync(path.join(sourceRoot, 'services/api/errors.ts'), 'utf8')
    const queryEngine = fs.readFileSync(path.join(sourceRoot, 'QueryEngine.ts'), 'utf8')
    const wrapper = errors.match(
      /export function getAssistantMessageFromError[\s\S]*?function getAssistantMessageFromErrorInner/,
    )?.[0]
    assert.ok(wrapper)
    assert.match(wrapper, /error instanceof APIError && typeof error\.status === 'number'/)
    assert.match(wrapper, /messageWithStatus\.apiErrorStatus = error\.status/)
    assert.match(queryEngine, /let apiErrorStatus: number \| null = null/)
    assert.match(queryEngine, /\.apiErrorStatus \?\? null/)
    assert.match(queryEngine, /api_error_status: apiErrorStatus/)
  },
)
