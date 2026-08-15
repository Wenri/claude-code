import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const TARGET_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'

const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    fileURLToPath(new URL('../../src', import.meta.url)),
)

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
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

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
}

test('recovers Opus 4.7 and xhigh effort capability', () => {
  includesAll(source('src/utils/model/configs.ts'), [
    'CLAUDE_OPUS_4_7_CONFIG',
    "firstParty: 'claude-opus-4-7'",
    'opus47: CLAUDE_OPUS_4_7_CONFIG',
  ])
  includesAll(source('src/utils/model/model.ts'), [
    'getModelStrings().opus47',
    "return 'claude-opus-4-7'",
    "return 'Opus 4.7'",
  ])
  includesAll(source('src/utils/effort.ts'), [
    "'xhigh'",
    'modelSupportsXHighEffort',
    "getCanonicalName(model).includes('opus-4-7')",
    "resolved === 'xhigh' && !modelSupportsXHighEffort(model)",
    "return 'xhigh'",
  ])
  includesAll(source('src/utils/model/modelSupportOverrides.ts'), [
    "'xhigh_effort'",
  ])
  includesAll(source('src/utils/thinking.ts'), [
    "canonical.includes('opus-4-7')",
  ])
})

test('recovers the interactive effort slider and launch default', () => {
  const effort = source('src/commands/effort/effort.tsx')
  includesAll(effort, [
    'Usage: /effort [low|medium|high|xhigh|max|auto]',
    "{ value: 'xhigh', color: 'autoAccept-shimmer' }",
    'const DEFAULT_INDEX = 3',
    'key.leftArrow',
    'key.rightArrow',
    'key.return',
    '←/→ to change effort · Enter to confirm',
    'unpinOpus47LaunchEffort',
  ])
  assert.match(effort, /if \(!args\) return <EffortSlider onDone=\{onDone\} \/>/)

  includesAll(source('src/components/ModelPicker.tsx'), [
    "includes('opus-4-7')",
    "isLaunchPinned ? 'xhigh'",
    "if (includeXHigh) levels.push('xhigh')",
    "displayEffort === 'xhigh' ? 'xHigh'",
  ])
  includesAll(source('src/main.tsx'), [
    'Effort level for the current session (low, medium, high, xhigh, max)',
    "const allowed = ['low', 'medium', 'high', 'xhigh', 'max']",
  ])
})

test('reports model-specific effort levels through SDK schemas', () => {
  includesAll(source('src/entrypoints/sdk/coreSchemas.ts'), [
    "z.enum(['low', 'medium', 'high', 'xhigh', 'max'])",
    'supportedEffortLevels',
  ])
  includesAll(source('src/cli/print.ts'), [
    'modelSupportsXHighEffort',
    "level === 'xhigh'",
    '!modelSupportsXHighEffort(resolvedModel)',
  ])
  includesAll(source('src/utils/model/modelOptions.ts'), [
    'getOpus47Option',
    'getOpus47_1MOption',
    'Opus 4.7 · Most capable for complex work',
  ])
})

test('authenticated adjacent bundles contain the effort replacement', () => {
  const baseline = bundle('CLAUDE_CODE_2_1_110_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_111_BUNDLE', TARGET_SHA256)
  for (const fragment of [
    'Usage: /effort [low|medium|high|xhigh|max|auto]',
    'Extended reasoning with thorough analysis (Opus 4.7 only)',
    '←/→ to change effort · Enter to confirm',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }
  assert.equal(baseline.includes('external-build-2205'), true)
  assert.equal(target.includes('external-build-2205'), false)
  assert.equal(target.includes('external-build-2172'), true)
})
