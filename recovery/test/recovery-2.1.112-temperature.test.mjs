import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'
const TARGET_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

function bundle(environmentName, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('recovers the Opus 4.7 temperature capability owner', () => {
  const betas = source('src/utils/betas.ts')
  assert.match(
    betas,
    /export function modelSupportsTemperature\(model: string\): boolean \{\s+return !getCanonicalName\(model\)\.includes\('claude-opus-4-7'\)\s+\}/,
  )
})

test('suppresses temperature in the main request builder for Opus 4.7', () => {
  const claude = source('src/services/api/claude.ts')
  assert.match(
    claude,
    /!hasThinking && modelSupportsTemperature\(options\.model\)\s+\? \(options\.temperatureOverride \?\? 1\)\s+: undefined/,
  )
})

test('suppresses explicit side-query temperature for Opus 4.7', () => {
  const sideQuery = source('src/utils/sideQuery.ts')
  assert.match(
    sideQuery,
    /temperature !== undefined &&\s+modelSupportsTemperature\(normalizedModel\) && \{ temperature \}/,
  )
})

test('authenticated adjacent bundles contain the hotfix at both request sites', () => {
  const baseline = bundle('CLAUDE_CODE_2_1_111_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_112_BUNDLE', TARGET_SHA256)
  const helperPattern =
    /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return!([A-Za-z_$][\w$]*)\(\2\)\.includes\("claude-opus-4-7"\)\}/

  assert.equal(helperPattern.test(baseline), false)
  const helperMatch = target.match(helperPattern)
  assert.ok(helperMatch)
  const helper = escapeRegExp(helperMatch[1])

  assert.match(
    target,
    new RegExp(
      `let [\\w$]+=![\\w$]+&&${helper}\\([\\w$]+\\.model\\)\\?[\\w$]+\\.temperatureOverride\\?\\?1:void 0`,
    ),
  )
  assert.match(
    target,
    new RegExp(
      `\\.\\.\\.[\\w$]+!==void 0&&${helper}\\([\\w$]+\\)&&\\{temperature:[\\w$]+\\}`,
    ),
  )

  const helperCalls = target.match(new RegExp(`${helper}\\(`, 'g')) ?? []
  assert.equal(helperCalls.length, 3)
  // Exact published-artifact size invariant; this also includes generated
  // version/build provenance and minifier-name churn.
  assert.equal(Buffer.byteLength(target) - Buffer.byteLength(baseline), 79)
})
