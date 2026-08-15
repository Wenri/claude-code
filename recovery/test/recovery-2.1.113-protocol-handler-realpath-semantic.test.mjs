import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE

const BASELINE_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const TARGET_INNER_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
const TARGET_WRAPPER_SHA256 =
  'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681'
const TARGET_WRAPPER_PREFIX_LENGTH = 87
const TARGET_WRAPPER_SUFFIX_LENGTH = 3
const targetUnit = {
  index: 20204,
  start: 12739160,
  end: 12739806,
  nodeType: 'FunctionDeclaration',
  sourceHash:
    '99c3c2c9da8ef1f8ff0a212ef8d2db21888a45087effaf378285a1ab8b78fc26',
  coarseHash:
    '77bd07c5ae8527489eb79eae14bab49312a2e693c24d7a12d4848b52ded5aba8',
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function loadTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === TARGET_INNER_SHA256) return bytes.toString('utf8')
  assert.equal(digest, TARGET_WRAPPER_SHA256, 'authenticated target bundle')
  const inner = bytes.subarray(
    TARGET_WRAPPER_PREFIX_LENGTH,
    bytes.length - TARGET_WRAPPER_SUFFIX_LENGTH,
  )
  assert.equal(sha256(inner), TARGET_INNER_SHA256, 'authenticated target inner')
  return inner.toString('utf8')
}

function sourceHandlerHarness({ realpath, launch }) {
  const owner = source('utils/deepLink/protocolHandler.ts')
  const start = owner.indexOf(
    'export async function handleDeepLinkUri(uri: string): Promise<number> {',
  )
  const end = owner.indexOf(
    '\n/**\n * Handle the case where claude was launched',
    start,
  )
  assert.ok(start >= 0 && end > start, 'isolated source handler')
  const isolated = owner
    .slice(start, end)
    .replace(
      'export async function handleDeepLinkUri(uri: string): Promise<number>',
      'async function handleDeepLinkUri(uri)',
    )

  return Function(
    'fs',
    'logForDebugging',
    'parseDeepLink',
    'jsonStringify',
    'resolveCwd',
    'readLastFetchTime',
    'launchInTerminal',
    `${isolated}; return handleDeepLinkUri`,
  )(
    { realpath },
    () => {},
    () => ({ query: 'inspect', repo: 'anthropic/claude-code' }),
    JSON.stringify,
    async () => ({
      cwd: '/workspace/claude-code',
      resolvedRepo: 'anthropic/claude-code',
    }),
    async () => new Date(42),
    launch,
  )
}

test(
  '2.1.113 authenticates the protocol-handler executable realpath unit',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
  },
  async () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), BASELINE_SHA256)
    const baseline = baselineBytes.toString('utf8')
    const target = loadTargetInner(targetPath)

    const row = [...structural.regions, ...structural.unresolvedTarget].find(
      (entry) => entry.target?.index === targetUnit.index,
    )
    assert.ok(row, 'target unit 20204')
    assert.equal(row.classification, 'unresolved')
    assert.deepEqual(
      {
        index: row.target.index,
        start: row.target.start,
        end: row.target.end,
        nodeType: row.target.nodeType,
        sourceHash: row.target.sourceHash,
        coarseHash: row.target.coarseHash,
      },
      targetUnit,
    )

    const unit = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(unit), targetUnit.sourceHash)
    assert.match(
      unit,
      /await [\w$]+\.realpath\(process\.execPath\)\.catch\(\(\)=>process\.execPath\)/,
    )

    const baselineHandlerStart = baseline.indexOf('Handling deep link URI:')
    assert.ok(baselineHandlerStart >= 0)
    const baselineHandler = baseline.slice(
      baseline.lastIndexOf('async function ', baselineHandlerStart),
      baseline.indexOf('async function ', baselineHandlerStart + 1),
    )
    assert.equal(baselineHandler.includes('realpath(process.execPath)'), false)
    assert.match(baselineHandler, /\(process\.execPath,\{query:/)

    const realpathCalls = []
    const launches = []
    const targetHandler = Function(
      'N',
      '$t7',
      'uH',
      'R9_',
      'Sa1',
      'x4_',
      'V9_',
      `${unit}; return b9_`,
    )(
      () => {},
      () => ({ query: 'inspect', repo: 'anthropic/claude-code' }),
      JSON.stringify,
      {
        realpath: async (value) => {
          realpathCalls.push(value)
          return '/opt/claude/releases/2.1.113/claude'
        },
      },
      async () => ({
        cwd: '/workspace/claude-code',
        resolvedRepo: 'anthropic/claude-code',
      }),
      async () => new Date(42),
      async (command, action) => {
        launches.push({ command, action })
        return true
      },
    )

    assert.equal(await targetHandler('claude-cli://prompt?q=inspect'), 0)
    assert.deepEqual(realpathCalls, [process.execPath])
    assert.deepEqual(launches, [
      {
        command: '/opt/claude/releases/2.1.113/claude',
        action: {
          query: 'inspect',
          cwd: '/workspace/claude-code',
          repo: 'anthropic/claude-code',
          lastFetchMs: 42,
        },
      },
    ])
  },
)

test(
  'source resolves the executable symlink and falls back to process.execPath',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = source('utils/deepLink/protocolHandler.ts')
    assert.match(owner, /import \* as fs from 'fs\/promises'/)
    assert.match(
      owner,
      /\.realpath\(process\.execPath\)\s*\.catch\(\(\) => process\.execPath\)/,
    )
    assert.match(owner, /launchInTerminal\(claudePath, \{/)

    const launches = []
    const resolved = sourceHandlerHarness({
      realpath: async (value) => {
        assert.equal(value, process.execPath)
        return '/resolved/claude'
      },
      launch: async (command, action) => {
        launches.push({ command, action })
        return true
      },
    })
    assert.equal(await resolved('claude-cli://prompt?q=inspect'), 0)
    assert.equal(launches[0].command, '/resolved/claude')
    assert.equal(launches[0].action.lastFetchMs, 42)

    const fallbacks = []
    const fallback = sourceHandlerHarness({
      realpath: async () => {
        throw Object.assign(new Error('not canonicalizable'), {
          code: 'ENOENT',
        })
      },
      launch: async (command) => {
        fallbacks.push(command)
        return true
      },
    })
    assert.equal(await fallback('claude-cli://prompt?q=inspect'), 0)
    assert.deepEqual(fallbacks, [process.execPath])
  },
)
