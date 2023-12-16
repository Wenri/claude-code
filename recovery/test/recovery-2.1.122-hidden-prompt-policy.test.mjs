import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))

const RELEASES = [
  {
    version: '2.1.121',
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    names: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function loadBundle(release) {
  const filename = release.names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.names.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticates the hidden investigate-first prompt policy', () => {
  const baseline = loadBundle(RELEASES[0])
  const target = loadBundle(RELEASES[1])
  const targetOnly = [
    'CLAUDE_CODE_INVESTIGATE_FIRST',
    'tengu_slate_harrier',
    'investigate_first:',
    'Read, search, and investigate freely \\u2014 looking is not acting.',
    'Asking the user a clarifying question has a cost:',
    'The bar is 85%+ odds the user says yes',
  ]

  for (const fragment of targetOnly) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.ok(occurrences(target, fragment) > 0, `target: ${fragment}`)
  }
  assert.equal(occurrences(baseline, 'The bar is 70%+ odds the user says yes'), 1)
  assert.equal(occurrences(target, 'The bar is 70%+ odds the user says yes'), 0)
})

test('recovers the target model, environment, rollout, and prompt branches', () => {
  const contents = compact(source('src/constants/prompts.ts'))
  const fragments = [
    "type InvestigateFirstMode = 'off' | 'additive' | 'compact'",
    "getCanonicalName(model) !== 'claude-opus-4-7'",
    'process.env.CLAUDE_CODE_INVESTIGATE_FIRST',
    "fromEnv === 'additive' || fromEnv === 'compact'",
    "if (isEnvTruthy(fromEnv)) return 'additive'",
    "fromEnv === 'off' || isEnvDefinedFalsy(fromEnv)",
    "if (isLeanPromptEnabled(model)) return 'off'",
    "'tengu_slate_harrier', 'off'",
    "getInvestigateFirstMode(model) === 'compact'",
    '`investigate_first:${getInvestigateFirstMode(model)}`',
    'Read, search, and investigate freely',
    'Before asking, spend up to a minute on read-only investigation',
    'The bar is 85%+ odds the user says yes',
  ]
  for (const fragment of fragments) {
    assert.ok(contents.includes(compact(fragment)), `missing ${fragment}`)
  }
  assert.equal(contents.includes('The bar is 70%+ odds the user says yes'), false)
})
