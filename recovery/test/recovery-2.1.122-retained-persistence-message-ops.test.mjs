import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyMessageOperation } from '../../src/utils/messageOperations.ts'

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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('authenticates retained persistence policies and message operations', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(occurrences(bundle, 'route-by-agent'), 3, release.version)
    assert.equal(occurrences(bundle, 'dedup-transcript'), 7, release.version)
    assert.equal(occurrences(bundle, 'remove-by-uuid'), 2, release.version)
    assert.equal(occurrences(bundle, 'applyMessageOp'), 6, release.version)

    const policyAnchor = bundle.indexOf('user:"dedup-transcript"')
    assert.ok(policyAnchor >= 0, `${release.version}: persistence policy table`)
    const policies = bundle.slice(policyAnchor, policyAnchor + 2_500)
    for (const fragment of [
      'assistant:"dedup-transcript"',
      'attachment:"dedup-transcript"',
      'system:"dedup-transcript"',
      'progress:"dedup-transcript"',
      '"content-replacement":"route-by-agent"',
      '"fork-context-ref":"route-by-agent"',
    ]) {
      assert.ok(policies.includes(fragment), `${release.version}: ${fragment}`)
    }

    const removeAnchor = bundle.indexOf('remove-by-uuid')
    const reducer = bundle.slice(removeAnchor - 300, removeAnchor + 500)
    assert.match(reducer, /case"append":return[^;]+\.messages\.length===0/)
    assert.match(reducer, /case"replace-all":return[^;]+\.messages/)
    assert.match(
      reducer,
      /case"remove-by-uuid":\{let [A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\.findIndex\(\([^)]+\)=>[A-Za-z_$][\w$]*\.uuid===[A-Za-z_$][\w$]*\.uuid\)/,
    )
    assert.match(reducer, /\.slice\(\);return [^.]+\.splice\([^,]+,1\)/)
    assert.match(reducer, /case"update":return[^.]+\.updater\(/)

    assert.match(
      bundle,
      /function [A-Za-z_$][\w$]*\([^,]+,[^)]+\)\{if\([^.]+\.findLastIndex\(\([^)]+\)=>[^.]+\.uuid===[^.]+\.uuid\)===-1\)return\[\.\.\.[^,]+,[^\]]+\];return\[\.\.\.[^.]+\.filter\(\([^)]+\)=>[^.]+\.uuid!==./,
      `${release.version}: fullscreen UUID replacement`,
    )

    const callAnchor = bundle.indexOf('{type:"remove-by-uuid",uuid:')
    assert.ok(callAnchor >= 0, `${release.version}: UUID tombstone operation`)
    assert.match(
      bundle.slice(callAnchor, callAnchor + 300),
      /\{type:"remove-by-uuid",uuid:([A-Za-z_$][\w$]*)\.uuid\}\),[A-Za-z_$][\w$]*\(\1\.uuid\)/,
      `${release.version}: transcript removal follows state removal`,
    )
  }
})

test('source message reducer preserves no-op identity and removes UUID clones', () => {
  const first = { uuid: 'first' }
  const second = { uuid: 'second' }
  const messages = [first, second]

  assert.equal(
    applyMessageOperation(messages, { type: 'append', messages: [] }),
    messages,
  )
  assert.equal(
    applyMessageOperation(messages, {
      type: 'remove-by-uuid',
      uuid: 'missing',
    }),
    messages,
  )
  const removed = applyMessageOperation(messages, {
    type: 'remove-by-uuid',
    uuid: 'first',
  })
  assert.deepEqual(removed, [second])
  assert.deepEqual(messages, [first, second], 'input remains immutable')
})

test('source routes persistence and wires all retained message-op consumers', () => {
  const storage = fs.readFileSync(
    path.join(repo, 'src/utils/sessionStorage.ts'),
    'utf8',
  )
  for (const fragment of [
    "entry.type === 'content-replacement'",
    'getAgentTranscriptPath(entry.agentId)',
    "entry.type === 'fork-context-ref'",
    'entry.isSidechain && entry.agentId !== undefined',
    'const isNewUuid = !messageSet.has(entry.uuid)',
    'if (isAgentSidechain || isNewUuid)',
    'await this.persistToRemote(sessionId, entry)',
  ]) {
    assert.ok(storage.includes(fragment), fragment)
  }

  const repl = fs.readFileSync(path.join(repo, 'src/screens/REPL.tsx'), 'utf8')
  const query = fs.readFileSync(path.join(repo, 'src/QueryEngine.ts'), 'utf8')
  const login = fs.readFileSync(
    path.join(repo, 'src/commands/login/login.tsx'),
    'utf8',
  )
  const permissions = fs.readFileSync(
    path.join(repo, 'src/commands/permissions/permissions.tsx'),
    'utf8',
  )
  for (const [contents, fragments] of [
    [
      repl,
      [
        'const applyMessageOp = useCallback',
        "type: 'remove-by-uuid'",
        'uuid: tombstonedMessage.uuid',
        'appendOrReplaceMessageByUuid(oldMessages, newMessage)',
        "type: 'replace-all'",
        "type: 'append'",
        "type: 'update'",
      ],
    ],
    [query, ['applyMessageOperation(', 'applyMessageOp: operation', 'applyMessageOp: () => {}']],
    [login, ['context.applyMessageOp({', "type: 'update'"]],
    [permissions, ['context.applyMessageOp({', "type: 'append'"]],
  ]) {
    for (const fragment of fragments) assert.ok(contents.includes(fragment), fragment)
  }
})
