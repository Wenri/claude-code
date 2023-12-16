import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundles = [
  [
    ['CLAUDE_CODE_2_1_120_BUNDLE', 'CLAUDE_2_1_120_CLI_INNER'],
    13_784_743,
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  ],
  [
    ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    13_908_188,
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  ],
]

function readBundle([names, expectedBytes, expectedSha256]) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, expectedBytes)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    expectedSha256,
  )
  return value.toString('utf8')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

test('authenticates the inherited /dream surface in both adjacent bundles', () => {
  for (const bundle of bundles.map(readBundle)) {
    for (const [fragment, count] of [
      ['tengu_kairos_dream', 1],
      ['tengu_dream_invoked', 3],
      ['Reflective memory consolidation', 1],
      ['Dream: Schedule Nightly Consolidation', 1],
      ['Scheduling is not available in this environment.', 1],
      ['/dream consolidate', 2],
    ]) {
      assert.equal(occurrences(bundle, fragment), count, fragment)
    }
  }
})

test('recovers /dream consolidation, scheduling, and lock semantics', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/skills/bundled/dream.ts'),
    'utf8',
  )
  for (const fragment of [
    "aliases: ['learn']",
    "context: 'fork'",
    "'tengu_kairos_dream'",
    'getFeatureValue_CACHED_WITH_REFRESH(',
    'Math.floor(Math.random() * 6 * 60)',
    'SCHEDULING_KEYWORDS.exec(normalizedArgument)',
    "mode: 'schedule_unavailable'",
    "mode: 'schedule'",
    "mode: 'consolidate'",
    'void recordConsolidation()',
    'buildConsolidationPrompt(',
    'teamMemPaths?.isTeamMemoryEnabled() ?? false',
  ]) {
    assert.equal(source.includes(fragment), true, fragment)
  }
})
