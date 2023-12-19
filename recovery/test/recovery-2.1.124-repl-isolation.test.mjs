import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
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
  return value
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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
  return fs
    .readFileSync(path.join(repo, relative), 'utf8')
    .split('\n//# sourceMappingURL=', 1)[0]
}

function compact(value) {
  return value.replaceAll(';', '').replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(relative, fragments) {
  const contents = compact(source(relative))
  for (const fragment of fragments) {
    assert.ok(
      contents.includes(compact(fragment)),
      `${relative}: missing ${compact(fragment)}`,
    )
  }
}

test('authenticates the 2.1.124 PowerShell, latch, REPL, and WebSearch clusters', () => {
  const [baselineBytes, targetBytes] = releases.map(readBundle)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const targetStatements = [
    [8_312_690, 73, '88943e9980f5451df10b5bed1f8ab2022661fe6e31e6f3c0cb2a6fec42817d40'],
    [8_312_763, 728, '0a06db3e674c80e0bb71ec555324b5c1ad11cea41184b0eb870d8e3a05ba7266'],
    [8_642_156, 63, 'f65aee3a8d76199d73986a8d41d974a6cc9fa4a50df9d9774586b2febca62d1a'],
    [8_643_268, 283, '8a99fa1b0c8d4e7d8896151bd0b39ebbfc1c4c7dcce3e87c068a3ae357adce21'],
    [8_651_118, 2_510, '3ca93a8ee776f0e320809fdc91d80c120f7810bf3f33b769fee59b0ab223fe20'],
    [8_680_512, 4_603, '62f27c09431bb23a31ad0039e8c31d575b19458a39689690853b764c46616f8d'],
  ]
  for (const [offset, bytes, expected] of targetStatements) {
    assert.equal(sha256(targetBytes.subarray(offset, offset + bytes)), expected)
  }

  const thenablePrompt =
    'Thenable \\`o.*\\` values are auto-awaited **at return only** \\u2014 \\`o.x=sh(c)\\` needs no await, but a shorthand result used inline (concat, template, arg to another call) does: \\`const c=await cat(f); put(f,c+s)\\`, never \\`put(f,cat(f)+s)\\`.'
  const oldPrompt =
    'Promise values on \\`o\\` are auto-awaited \\u2014 drop \\`await\\` unless you branch on the value.'
  assert.equal(occurrences(baseline, thenablePrompt), 0)
  assert.equal(occurrences(target, thenablePrompt), 1)
  assert.equal(occurrences(baseline, oldPrompt), 1)
  assert.equal(occurrences(target, oldPrompt), 0)

  const promiseGuard =
    'Promise.prototype.toString = function () {\n      throw new TypeError(\n        "REPL: unawaited Promise coerced to string. Shorthand results used " +\n        "inline need \'await\' \\u2014 e.g. const c = await cat(f); put(f, c + s). " +\n        "Auto-await applies only to o.* keys at return time.",\n      )\n    }'
  assert.equal(occurrences(baseline, promiseGuard), 0)
  assert.equal(occurrences(target, promiseGuard), 1)
  assert.equal(
    occurrences(
      target,
      'querySource:"web_search_tool",enablePromptCaching:!1',
    ),
    1,
  )
})

test('source preserves the authenticated Windows fallback order', () => {
  const detection = source('src/utils/shell/powershellDetection.ts')
  assertSourceFragments('src/utils/shell/powershellDetection.ts', [
    "import { lstat, realpath, stat } from 'fs/promises'",
    "import { join } from 'path'",
    'async function probeSymlinkPath(p: string): Promise<string | null> { try { await lstat(p) return p } catch { return null } }',
    "await probePath(join(programFiles, 'PowerShell', '7', 'pwsh.exe'))",
    "await probeSymlinkPath( join(localAppData, 'Microsoft', 'WindowsApps', 'pwsh.exe'), )",
    "await probePath(join(userProfile, '.dotnet', 'tools', 'pwsh.exe'))",
  ])

  const pathLookup = detection.indexOf("which('pwsh')")
  const windowsFallback = detection.indexOf("getPlatform() === 'windows'")
  const legacyFallback = detection.indexOf("which('powershell')")
  assert.ok(pathLookup !== -1 && pathLookup < windowsFallback)
  assert.ok(windowsFallback < legacyFallback)

  const msi = detection.indexOf("join(programFiles, 'PowerShell'")
  const windowsApps = detection.indexOf("join(localAppData, 'Microsoft'")
  const dotnet = detection.indexOf("join(userProfile, '.dotnet'")
  assert.ok(msi !== -1 && msi < windowsApps && windowsApps < dotnet)
})

test('source latches once, reports the initial value, and retains the callback', () => {
  assertSourceFragments('src/services/tools/toolIsolation.ts', [
    'onLatch?: (value: ToolIsolationClass) => void',
    'if (current) onLatch?.(current)',
    'return { current, onLatch }',
    'if (!activeLatch) { latch.current = classifiedAs latch.onLatch?.(classifiedAs) }',
  ])
  assertSourceFragments('src/tools/REPLTool/types.ts', [
    "onLatch?: (value: 'web' | 'connectors') => void",
  ])

  const notifications = []
  const createLatch = (current = null, onLatch) => {
    if (current) onLatch?.(current)
    return { current, onLatch }
  }
  const latch = createLatch('web', value => notifications.push(value))
  assert.deepEqual(notifications, ['web'])
  assert.equal(latch.onLatch instanceof Function, true)

  const fresh = createLatch(null, value => notifications.push(value))
  if (!fresh.current) {
    fresh.current = 'connectors'
    fresh.onLatch?.('connectors')
  }
  assert.deepEqual(notifications, ['web', 'connectors'])
})

test('source guards inline Promise coercion and disables WebSearch prompt caching', () => {
  const exactError =
    "REPL: unawaited Promise coerced to string. Shorthand results used inline need 'await' — e.g. const c = await cat(f); put(f, c + s). Auto-await applies only to o.* keys at return time."
  assertSourceFragments('src/tools/REPLTool/vm.ts', [
    'vm.runInContext( `Promise.prototype.toString = function () { throw new TypeError(',
    '"REPL: unawaited Promise coerced to string. Shorthand results used " +',
    '"inline need \'await\' — e.g. const c = await cat(f); put(f, c + s). " +',
    '"Auto-await applies only to o.* keys at return time.",',
  ])
  assertSourceFragments('src/tools/WebSearchTool/WebSearchTool.ts', [
    "querySource: 'web_search_tool', enablePromptCaching: false",
  ])
  assertSourceFragments('src/tools/REPLTool/prompt.ts', [
    'Thenable \\`o.*\\` values are auto-awaited **at return only** — \\`o.x=sh(c)\\` needs no await',
    '\\`const c=await cat(f); put(f,c+s)\\`, never \\`put(f,cat(f)+s)\\`',
  ])

  const context = vm.createContext({})
  vm.runInContext(
    `Promise.prototype.toString = function () { throw new TypeError(${JSON.stringify(exactError)}) }`,
    context,
  )
  assert.throws(
    () => vm.runInContext("'' + Promise.resolve('value')", context),
    error => error?.name === 'TypeError' && error.message === exactError,
  )
})
