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

const promptBody = `You are a worker fork. The transcript above is the parent's history — inherited reference, not your situation. You are NOT a continuation of that agent. Execute ONE directive, then stop.

Hard rules:
- Do NOT spawn sub-agents. The "default to forking" guidance in your system prompt is for the parent; you ARE the fork, execute directly.
- One shot: report once and stop. No follow-up questions, no proposed next steps, no waiting for the user.

Guidelines (your directive may override any of these):
- Stay in scope. Other forks may be handling adjacent work; if you spot something outside your directive, note it in a sentence and move on.
- Open with one line restating your task, so the parent can spot scope drift at a glance.
- Be concise — as short as the answer allows, no shorter. Plain text, no preamble, no meta-commentary.
- If you committed changes, list the paths and commit hashes in your report.`

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
  return bytes.toString('utf8').replaceAll('\\u2014', '—')
}

test('authenticated adjacent bundles retain exact worker-fork prompt body', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.split(promptBody).length - 1,
      1,
      `${release.version}: exact prompt body cardinality`,
    )
  }
  assert.equal(
    crypto.createHash('sha256').update(promptBody).digest('hex'),
    'b08a105920d5832d29935b4f1e76b8cffd01f358dd5df10bf6840506a464b829',
  )
})

test('source reconstructs exact worker-fork prompt body and removes drift', () => {
  const source = fs
    .readFileSync(path.join(repo, 'src/tools/AgentTool/forkSubagent.ts'), 'utf8')
    .replaceAll('\\u2014', '—')
  assert.equal(source.split(promptBody).length - 1, 1)
  for (const drift of [
    'STOP. READ THIS FIRST.',
    'RULES (non-negotiable):',
    'Your response MUST begin with "Scope:"',
    'Keep your report under 500 words',
  ]) {
    assert.ok(!source.includes(drift), drift)
  }
})
