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
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(fs.readFileSync(path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'))),
)
const identity = [
  9464404,
  9465779,
  'FunctionDeclaration',
  'e6d4ec97baa157dbcd107466fbf2b8dbb254c51b8b28a79892f51cc9c7dbc800',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target110 pins the generalized PowerShell parser retry state machine',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target109 and target110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7')
    assert.equal(sha256(targetBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const region = structural.regions[12693]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
    )
    const baseline = baselineBytes.toString('utf8')
    const unit = targetBytes.toString('utf8').slice(region.target.start, region.target.end)
    assert.equal(sha256(unit), region.target.sourceHash)
    assert.match(unit, /failed to spawn pwsh:/)
    assert.match(unit, /pwsh timed out after/)
    assert.match(unit, /pwsh exited \$\{[^}]+\}: \$\{[^}]+\}/)
    assert.match(unit, /\(attempt \$\{[^}]+\}\)/)
    assert.match(unit, /if\([^)]*===0\)break/)
    assert.doesNotMatch(unit, /catch\([^)]*\)\{return/)
    const old = baseline.slice(
      baseline.indexOf('async function', baseline.indexOf('failed to spawn pwsh: ') - 1300),
      baseline.indexOf('function', baseline.indexOf('failed to spawn pwsh: ') + 500),
    )
    assert.match(old, /catch\([^)]*\)\{return/)
  },
)

test(
  'source retries spawn, timeout, and nonzero-exit failures before classifying the terminal result',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(path.join(sourceRoot, 'utils/powershell/parser.ts'), 'utf8')
    const body = owner.match(/async function parsePowerShellCommandImpl[\s\S]*?\n}\n\n\/\/ Error IDs/)?.[0]
    assert.ok(body)
    for (const fragment of [
      'let spawnError: string | null = null',
      'spawnError = null',
      'timedOut = false',
      'spawnError = e instanceof Error ? e.message : String(e)',
      'code = null',
      'if (code === 0) break',
      'failed to spawn pwsh: ${spawnError}',
      'pwsh timed out after ${parseTimeoutMs}ms',
      'pwsh exited ${code}: ${stderr}',
      '} (attempt ${attempt + 1})',
      'if (spawnError)',
    ]) assert.ok(body.includes(fragment), fragment)
    assert.ok(body.indexOf('if (spawnError)') > body.indexOf('for (let attempt'))
    assert.equal(body.includes('catch (e: unknown) {\n      return makeInvalidResult'), false)
  },
)
