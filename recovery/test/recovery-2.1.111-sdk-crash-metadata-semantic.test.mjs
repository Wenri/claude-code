import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const unit = {
  index: 19380,
  nodeType: 'FunctionDeclaration',
  start: 13518734,
  end: 13518950,
  sourceHash:
    'ea2ec16722a0b765f8e30ec2931784cdaaa7853af249b48f8c2275f3edeb93d1',
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target111 authenticates structured SDK crash metadata',
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
    assert.equal(
      sha256(baselineBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assert.equal(
      sha256(targetBytes),
      '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    const fragment = target.slice(unit.start, unit.end)
    assert.equal(sha256(fragment), unit.sourceHash)
    assert.equal(baseline.includes('cause_name'), false)
    assert.equal(target.split('cause_name').length - 1, 1)
    assert.match(
      fragment,
      /instanceof.*status==="number".*instanceof Error.*\.cause!==void 0.*error_name:.*api_error_status:.*cause_name:/s,
    )
  },
)

test(
  'source classifies SDK crash status, name, and nested cause',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(path.join(sourceRoot, 'cli/print.ts'), 'utf8')
    assert.match(owner, /function getSdkCrashMetadata\(error: unknown\)/)
    assert.match(owner, /const isApiError = error instanceof APIError/)
    assert.match(
      owner,
      /isApiError\s*\? classifyAPIError\(error\)\s*:\s*classifyToolError\(error\)/,
    )
    assert.match(
      owner,
      /isApiError && typeof error\.status === 'number' \? error\.status : undefined/,
    )
    assert.match(
      owner,
      /error instanceof Error && error\.cause !== undefined[\s\S]*?classifyToolError\(error\.cause\)/,
    )
    assert.match(
      owner,
      /error_name:[\s\S]*?api_error_status: apiErrorStatus,[\s\S]*?cause_name:/,
    )
    assert.match(
      owner,
      /logEvent\('tengu_sdk_session_crash', getSdkCrashMetadata\(error\)\)/,
    )
  },
)
