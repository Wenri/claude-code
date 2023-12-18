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

const retainedReferenceCounts = new Map([
  ['upstreamProxyEnv', 4],
  ['scrubSandboxConfig', 3],
  ['isScrubEnabled', 16],
  ['assertScrubSandboxAvailable', 3],
  ['_setScrubPathsLatchedForTesting', 2],
  ['_resetScrubLatchForTesting', 2],
  ['_resetScriptCapsForTesting', 3],
])

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function exportedSymbol(bundle, name) {
  const matches = [
    ...bundle.matchAll(
      new RegExp(`${escapeRegExp(name)}:\\(\\)=>([A-Za-z_$][\\w$]*)`, 'g'),
    ),
  ]
  assert.equal(matches.length, 1, `${name}: one export`)
  return matches[0][1]
}

function symbolReferenceCount(bundle, symbol) {
  return [
    ...bundle.matchAll(
      new RegExp(
        `(?<![\\w$])${escapeRegExp(symbol)}(?![\\w$])`,
        'g',
      ),
    ),
  ].length
}

function source(filename) {
  return fs.readFileSync(path.join(repo, filename), 'utf8')
}

test('authenticated bundles retain the exact subprocess namespace', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [name, expected] of retainedReferenceCounts) {
      const symbol = exportedSymbol(bundle, name)
      assert.equal(
        symbolReferenceCount(bundle, symbol),
        expected,
        `${release.version}: ${name}`,
      )
    }
  }
})

test('source uses exact subprocess names and delegates compatibility aliases', () => {
  const subprocess = source('src/utils/subprocessEnv.ts')
  for (const name of retainedReferenceCounts.keys()) {
    assert.match(
      subprocess,
      new RegExp(`export (?:async )?function ${escapeRegExp(name)}\\(`),
      name,
    )
  }
  assert.match(
    subprocess,
    /export function isSubprocessEnvScrubEnabled\(\)[\s\S]{0,80}?return isScrubEnabled\(\)/,
  )
  assert.match(
    subprocess,
    /export async function initializeSubprocessEnvScrub\(\)[\s\S]{0,100}?return assertScrubSandboxAvailable\(\)/,
  )
  assert.match(
    subprocess,
    /export function getScrubSandboxConfig\(\)[\s\S]{0,120}?return scrubSandboxConfig\(\)/,
  )
  assert.match(
    subprocess,
    /export function resetSubprocessEnvScrubForTesting\(\)[\s\S]{0,100}?return _resetScrubLatchForTesting\(\)/,
  )
  assert.match(
    subprocess,
    /export function setScrubPathsForTesting\([^)]*\)[\s\S]{0,100}?return _setScrubPathsLatchedForTesting\(paths\)/,
  )
  assert.match(
    subprocess,
    /export function resetScriptCapsForTesting\(\)[\s\S]{0,100}?return _resetScriptCapsForTesting\(\)/,
  )
  assert.match(
    subprocess,
    /return \{ \.\.\.getMcpAllowedProcessEnv\(\), \.\.\.upstreamProxyEnv\(\) \}/,
  )
  assert.match(subprocess, /const proxyEnv = upstreamProxyEnv\(\)/)

  const init = source('src/entrypoints/init.ts')
  assert.match(init, /await assertScrubSandboxAvailable\(\)/)

  const shell = source('src/utils/Shell.ts')
  assert.match(shell, /const base = scrubSandboxConfig\(\)/)

  for (const filename of [
    'src/tools/BashTool/shouldUseSandbox.ts',
    'src/utils/permissions/permissionSetup.ts',
    'src/utils/bash/ast.ts',
    'src/utils/sandbox/sandbox-adapter.ts',
    'src/utils/Shell.ts',
  ]) {
    const contents = source(filename)
    assert.match(contents, /isScrubEnabled\(\)/, filename)
    assert.doesNotMatch(contents, /isSubprocessEnvScrubEnabled/, filename)
  }
})
