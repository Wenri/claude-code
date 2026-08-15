import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)
const units = new Map([
  [19340, [11840941, 11841076, 'FunctionDeclaration', '7dcb8fdec5fe62a5520e6e4f51677a6a70d93f03ed6deca1d201cd84d066cac5']],
  [19358, [11845241, 11850507, 'FunctionDeclaration', 'cab4d3f673f4b3a2e1b29a61e164b23a79b6aafdd2dd3f4ef6c00906394597b7']],
  [20720, [13036753, 13094202, 'FunctionDeclaration', '5eedcab727da9a4eb48d70598545dc8c7e0d3f33546e1d64f0b186ab829a7017']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target116 pins remote attach state, title suppression, parsing, and CLI presentation', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.notEqual(region.classification, 'matched')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
    )
    assert.equal(sha256(target.subarray(identity[0], identity[1])), identity[3])
  }

  const before = baseline.toString('utf8')
  const after = target.toString('utf8')
  const targetOnly = new Map([
    ['isAttachToExisting', 2],
    ['tengu_remote_attach_session', 1],
    ['--remote [description|session_id|url]', 1],
    ['^(?:session|cse)_[A-Za-z0-9_]+$', 1],
    ['Attached to remote session', 1],
    ['Remote session active', 1],
    ['Attaching to an existing remote session is not enabled for your account.', 1],
    ['Create a remote session with the given description, or attach to an existing one by session ID or claude.ai/code URL', 1],
  ])
  for (const [fragment, count] of targetOnly) {
    assert.equal(occurrences(before, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(after, fragment), count, `target: ${fragment}`)
  }

  const manager = target.subarray(11840941, 11841076).toString('utf8')
  const hook = target.subarray(11845241, 11850507).toString('utf8')
  const main = target.subarray(13036753, 13094202).toString('utf8')
  assert.ok(manager.includes('isAttachToExisting:'))
  assert.ok(hook.includes('!H.isAttachToExisting'))
  for (const fragment of targetOnly.keys()) {
    if (fragment === 'isAttachToExisting') continue
    assert.ok(main.includes(fragment), fragment)
  }
})

test('source owns the complete remote attach call path and exact creation split', sourceOptions, () => {
  const manager = source('remote/RemoteSessionManager.ts')
  const hook = source('hooks/useRemoteSession.ts')
  const teleport = source('utils/teleport.tsx')
  const main = source('main.tsx')
  for (const fragment of [
    'isAttachToExisting?: boolean',
    'isAttachToExisting = false',
    'isAttachToExisting,',
  ]) assert.ok(manager.includes(fragment), fragment)
  assert.ok(hook.includes('!config.isAttachToExisting'))
  assert.ok(
    teleport.includes(
      'signal: AbortSignal, source?: string, branchName?: string',
    ),
  )
  for (const fragment of [
    'const remoteSessionIdPattern = /^(?:session|cse)_[A-Za-z0-9_]+$/',
    "remote.split(/[/?#]/)",
    "logEvent('tengu_remote_attach_session'",
    "'Error: Attaching to an existing remote session is not enabled for your account.'",
    "new AbortController().signal, 'remote', currentBranch || undefined",
    'attachedSessionId !== null',
    'Attached to remote session · code here or at',
    'Remote session active · code here or at',
    "--remote [description|session_id|url]",
    'Create a remote session with the given description, or attach to an existing one by session ID or claude.ai/code URL',
  ]) assert.ok(main.includes(fragment), fragment)
})

test('source parser distinguishes descriptions, IDs, and claude.ai URLs', sourceOptions, () => {
  const main = source('main.tsx')
  const start = main.indexOf('const remoteSessionIdPattern =')
  const endMarker = 'const hasInitialPrompt = !attachedSessionId && remote.length > 0;'
  const end = main.indexOf(endMarker, start) + endMarker.length
  assert.ok(start >= 0 && end > start)
  const executable = main
    .slice(start, end)
    .replace(
      'let attachedSessionId: ReturnType<typeof asSessionId> | null = null;',
      'let attachedSessionId = null;',
    )
  const parse = new Function(
    'remote',
    'asSessionId',
    `${executable}; return { attachedSessionId, hasInitialPrompt }`,
  )
  const asSessionId = value => value
  assert.deepEqual(parse('fix the flaky test', asSessionId), {
    attachedSessionId: null,
    hasInitialPrompt: true,
  })
  assert.deepEqual(parse('', asSessionId), {
    attachedSessionId: null,
    hasInitialPrompt: false,
  })
  assert.deepEqual(parse('session_AbC_123', asSessionId), {
    attachedSessionId: 'session_AbC_123',
    hasInitialPrompt: false,
  })
  assert.deepEqual(
    parse('https://claude.ai/code/cse_A1_b2?m=0', asSessionId),
    { attachedSessionId: 'cse_A1_b2', hasInitialPrompt: false },
  )
  assert.deepEqual(parse('not a/session_123 url', asSessionId), {
    attachedSessionId: null,
    hasInitialPrompt: true,
  })
})
