import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
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

test('target92 introduces truthy DO_NOT_TRACK privacy handling', {
  skip: !selected || !baselinePath || !targetPath,
}, () => {
  if (!selected || !baselinePath || !targetPath) return
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(targetBytes), targetSha256)
  const target = targetBytes.toString('utf8')
  const region = structural.regions[2038]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      869_907,
      870_127,
      '9a75c4834d1ef448e4fce40acb478d4846028d700d84ff1c29bae4e3e5e8a482',
    ],
  )
  const bytes = target.slice(region.target.start, region.target.end)
  assert.equal(sha256(bytes), region.target.sourceHash)
  assert.match(bytes, /process\.env\.DO_NOT_TRACK/)
  assert.equal(baseline.includes('process.env.DO_NOT_TRACK'), false)
})

test('source preserves priority and boolean parsing for DO_NOT_TRACK', {
  skip: !selected,
}, () => {
  if (!selected) return
  const privacy = fs.readFileSync(
    path.join(sourceRoot, 'utils/privacyLevel.ts'),
    'utf8',
  )
  assert.match(privacy, /import \{ isEnvTruthy \} from '\.\/envUtils\.js'/)
  assert.match(
    privacy,
    /if \(process\.env\.DISABLE_TELEMETRY\)[\s\S]*?if \(isEnvTruthy\(process\.env\.DO_NOT_TRACK\)\)[\s\S]*?return 'default'/,
  )
  const isEnvTruthy = value => {
    if (!value) return false
    const normalized = String(value).toLowerCase().trim()
    return ['1', 'true', 'yes', 'on'].includes(normalized)
  }
  for (const value of ['1', 'true', 'TRUE', ' yes ', 'on']) {
    assert.equal(isEnvTruthy(value), true, value)
  }
  for (const value of [undefined, '', '0', 'false', 'no', 'off', 'random']) {
    assert.equal(isEnvTruthy(value), false, String(value))
  }
})
