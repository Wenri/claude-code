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
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

const promptFragments = [
  'actively progressing on the task \\u2014 narrating plans, calling tools, or writing code; no pending question for the user',
  'the task the user asked for is fully delivered and there is no further work the agent plans to do',
  'EXAMPLES (message \\u2192 classification):',
  'found bug, awaiting direction',
  'offer of optional extra work \\u2260 blocked; the ask is satisfied',
  'Only change state if the tail clearly indicates a transition. When uncertain, keep current \\u2014 stale-correct beats wrong.',
  'Agent stopped and names a SPECIFIC missing thing the user could supply',
  'API/auth/infra error text \\u2192 "blocked"',
  'one-sentence headline naming a finished deliverable',
  'Respond with ONLY this JSON, no code fences:',
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

test('authenticated adjacent bundles retain the complete classifier contract', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const fragment of promptFragments) {
      assert.ok(bundle.includes(fragment), `${release.version}: ${fragment}`)
    }
    assert.match(
      bundle,
      /STATES \\u2014 the agent can cycle between non-terminals \(working\\u2194blocked\) or land on a terminal \(done\/failed\):\n\$\{[\w$]+\}/,
      `${release.version}: state descriptions are interpolated`,
    )
    assert.match(
      bundle,
      /Max \$\{[\w$]+\} chars, first sentence verbatim/,
      `${release.version}: bounded result contract`,
    )
  }
})

test('source reconstructs the exact complete classifier prompt', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/jobs/classifier.ts'),
    'utf8',
  )
  const start = source.indexOf('const STATE_DESCRIPTIONS')
  const end = source.indexOf('\nfunction classifierInput', start)
  assert.ok(start >= 0 && end > start, 'classifier prompt block')
  const executable = source
    .slice(start, end)
    .replace('const CLASSIFIER_PROMPT =', 'return ')
  const prompt = Function('DETAIL_MAX', executable)(180)
  assert.equal(prompt.length, 5_554)
  assert.equal(
    crypto.createHash('sha256').update(prompt).digest('hex'),
    '97c50c914f41999b5f55b6dbb5a83907ff89c906159ed33f9e1b372bae48196b',
  )
  assert.ok(source.includes('text: CLASSIFIER_PROMPT'))
})
