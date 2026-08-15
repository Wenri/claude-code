import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    simpleOverrideReads: 2,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    simpleOverrideReads: 4,
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
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

test('authenticates the explicit false lean-prompt override', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT'),
      release.simpleOverrideReads,
      `${release.version}: override read cardinality`,
    )
    assert.equal(occurrences(bundle, 'CLAUDE_CODE_LEAN_PROMPT'), 0)
    assert.equal(occurrences(bundle, 'tengu_vellum_lantern'), 1)
    assert.equal(occurrences(bundle, 'tengu_ochre_finch'), 1)
  }
})

test('source applies truthy and defined-falsy overrides before both gates', () => {
  const prompt = fs.readFileSync(
    path.join(repo, 'src/utils/leanPrompt.ts'),
    'utf8',
  )
  const memory = fs.readFileSync(
    path.join(repo, 'src/memdir/memoryTypes.ts'),
    'utf8',
  )

  for (const source of [prompt, memory]) {
    const truthy = source.indexOf(
      'isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT)',
    )
    const falsy = source.indexOf(
      'isEnvDefinedFalsy(process.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT)',
    )
    const gate = source.indexOf('getFeatureValue_CACHED_MAY_BE_STALE(')
    assert.ok(truthy >= 0)
    assert.ok(falsy > truthy)
    assert.ok(gate > falsy)
    assert.ok(!source.includes('CLAUDE_CODE_LEAN_PROMPT'))
  }
})
