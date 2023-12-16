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
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function assertOrder(text, ...needles) {
  let cursor = -1
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1)
    assert.ok(next > cursor, `${needle} is missing or out of order`)
    cursor = next
  }
}

test('authenticates retained hook-title job-state propagation', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const anchor = bundle.indexOf('Hook sessionTitle applied (')
    assert.ok(anchor >= 0, `${release.version}: hook title anchor`)
    const applyTitle = bundle.slice(anchor, anchor + 500)

    assert.match(
      applyTitle,
      /\),await ([\w$]+)\(([\w$]+),([\w$]+),void 0,"hook"\),await ([\w$]+)\(\2,\3,void 0,"hook"\),await ([\w$]+)\(\2,\3,"user"\)/,
      `${release.version}: title, agent-name, then job-name persistence`,
    )
  }
})

test('source applies a hook title to transcript and daemon job state', () => {
  const hooks = fs.readFileSync(path.join(repo, 'src/utils/hooks.ts'), 'utf8')
  const start = hooks.indexOf('export async function applyHookSessionTitle')
  const end = hooks.indexOf('/**\n * Execute session start hooks', start)
  assert.ok(start >= 0 && end > start)
  const applyTitle = hooks.slice(start, end)

  assert.match(hooks, /import \{ renameJob \} from '\.\.\/daemon\/jobs\.js'/)
  assertOrder(
    applyTitle,
    'sanitizeHookSessionTitle(title)',
    'getCurrentSessionTitle(sessionId)',
    'Hook sessionTitle applied (',
    "await saveCustomTitle(sessionId, sanitized, undefined, 'hook')",
    "await saveAgentName(sessionId, sanitized, undefined, 'hook')",
    "await renameJob(sessionId, sanitized, 'user')",
  )
})
