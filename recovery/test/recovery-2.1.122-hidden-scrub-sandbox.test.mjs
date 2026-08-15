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

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticates the retained scrub-sandbox implementation in both bundles', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      count(bundle, 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB'),
      5,
      `${release.version}: gate cardinality`,
    )
    for (const literal of [
      'bubblewrap is required for subprocess env scrubbing and isolation.',
      'claude-code scrub-mode stubs',
      '/run/buildkit/buildkitd.sock',
      'allowed_non_write_users hardening',
    ]) {
      assert.equal(count(bundle, literal), 1, `${release.version}: ${literal}`)
    }
    assert.match(
      bundle,
      /\.CLAUDE_CODE_ENTRYPOINT==="local-agent"/,
      `${release.version}: safe scrub default`,
    )
    assert.match(
      bundle,
      /\.denyWithinAllow\.filter\(/,
      `${release.version}: scrub overlay preserves nested denies`,
    )
    assert.match(
      bundle,
      /Permission mode forced to default \\u2014 CLAUDE_CODE_SUBPROCESS_ENV_SCRUB is set/,
      `${release.version}: forced permission mode copy`,
    )
  }
})

test('source wires scrub initialization, sandbox policy, AST, and permission callsites', () => {
  const subprocess = source('src/utils/subprocessEnv.ts')
  assert.match(subprocess, /export async function initializeSubprocessEnvScrub/)
  assert.match(subprocess, /scrubSandboxAvailable = Boolean\(whichSync\('bwrap'\)\)/)
  assert.match(subprocess, /bubblewrap is required for subprocess env scrubbing and isolation\./)
  assert.match(subprocess, /# claude-code scrub-mode stubs/)
  assert.match(subprocess, /'\/run\/buildkit\/buildkitd\.sock'/)
  assert.match(subprocess, /actionPath\.indexOf\('\/_actions\/'\) \+ 9/)
  assert.match(subprocess, /export function getScrubSandboxConfig/)

  const adapter = source('src/utils/sandbox/sandbox-adapter.ts')
  assert.match(adapter, /const scrubSandboxActive =/)
  assert.match(
    adapter,
    /scrubSandboxActive[\s\S]*?allowedDomains: undefined,[\s\S]*?allowAllUnixSockets: true/,
  )
  assert.match(
    adapter,
    /isSubprocessEnvScrubEnabled\(\) && isScrubSandboxAvailable\(\)[\s\S]*?\? false/,
  )
  assert.match(
    adapter,
    /function isAutoAllowBashIfSandboxedEnabled[\s\S]*?isSubprocessEnvScrubEnabled\(\)\) return false/,
  )
  assert.match(
    adapter,
    /function isSandboxingEnabled[\s\S]*?return isScrubSandboxAvailable\(\)/,
  )

  const shouldUseSandbox = source('src/tools/BashTool/shouldUseSandbox.ts')
  assert.match(
    shouldUseSandbox,
    /isSubprocessEnvScrubEnabled\(\) && isScrubSandboxAvailable\(\)[\s\S]*?return true/,
  )

  const ast = source('src/utils/bash/ast.ts')
  assert.match(
    ast,
    /node\.type === 'for_statement'[\s\S]*?isSubprocessEnvScrubEnabled\(\)\) return tooComplex\(node\)/,
  )
  assert.match(
    ast,
    /node\.type === 'while_statement' &&[\s\S]*?isSubprocessEnvScrubEnabled\(\)/,
  )
  assert.match(ast, /function containsExpansionNode\(node: Node\)/)
  assert.match(
    ast,
    /commandName\.type === 'simple_expansion'[\s\S]*?containsExpansionNode\(commandName\)/,
  )

  const shell = source('src/utils/Shell.ts')
  assert.match(shell, /const base = getScrubSandboxConfig\(\)/)
  assert.match(shell, /SandboxManager\.getFsWriteConfig\(\)\.denyWithinAllow\.filter/)
  assert.match(shell, /commandString,[\s\S]*?sandboxBinShell,[\s\S]*?scrubConfig,/)

  const permissionSetup = source('src/utils/permissions/permissionSetup.ts')
  assert.match(
    permissionSetup,
    /if \(isSubprocessEnvScrubEnabled\(\)\)[\s\S]*?Permission mode forced to default — CLAUDE_CODE_SUBPROCESS_ENV_SCRUB is set[\s\S]*?mode: 'default'/,
  )

  const init = source('src/entrypoints/init.ts')
  assert.match(
    init,
    /applySafeConfigEnvironmentVariables\(\)\s+await initializeSubprocessEnvScrub\(\)[\s\S]*?applyExtraCACertsFromConfig\(\)/,
  )
})
