import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.123',
    env: 'CLAUDE_CODE_2_1_123_BUNDLE',
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  },
  {
    version: '2.1.124',
    env: 'CLAUDE_CODE_2_1_124_BUNDLE',
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value.toString('utf8')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function source(relative) {
  return fs.readFileSync(path.join(repo, relative), 'utf8')
}

test('authenticates the target-only ListPeers legacy alias', () => {
  const [baseline, target] = releases.map(readBundle)
  assert.equal(occurrences(baseline, 'ListAgents'), 1)
  assert.equal(occurrences(target, 'ListAgents'), 2)
  assert.equal(occurrences(baseline, 'ListPeers'), 0)
  assert.equal(occurrences(target, 'ListPeers'), 1)
  assert.equal(
    occurrences(target, 'var mE8="ListAgents",r7q="ListPeers";'),
    1,
  )
  assert.equal(occurrences(target, '[r7q]:mE8'), 1)
})

test('source binds ListPeers to the canonical ListAgents name', () => {
  const constants = source('src/tools/ListPeersTool/constants.ts')
  const parser = source('src/utils/permissions/permissionRuleParser.ts')
  const canonical = constants.match(
    /LIST_AGENTS_TOOL_NAME\s*=\s*'([^']+)'/,
  )?.[1]
  const legacy = constants.match(/LIST_PEERS_TOOL_NAME\s*=\s*'([^']+)'/)?.[1]

  assert.equal(canonical, 'ListAgents')
  assert.equal(legacy, 'ListPeers')
  assert.match(
    parser,
    /\[LIST_PEERS_TOOL_NAME\]:\s*LIST_AGENTS_TOOL_NAME/,
  )

  const aliases = new Map([[legacy, canonical]])
  const normalize = name => aliases.get(name) ?? name
  const reverse = name =>
    [...aliases].filter(([, value]) => value === name).map(([key]) => key)

  assert.equal(normalize('ListPeers'), 'ListAgents')
  assert.equal(normalize('ListAgents'), 'ListAgents')
  assert.deepEqual(reverse('ListAgents'), ['ListPeers'])
  assert.deepEqual(reverse('ListPeers'), [])
})
