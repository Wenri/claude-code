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

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

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

function readSource(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticates the retained doctor renderer and fix flow in both bundles', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [needle, expected] of [
      ['Help me fix the issues reported by /doctor below.', 1],
      ['For each issue: briefly explain what the fix will do', 1],
      ['to fix with Claude', 1],
      ['Still having issues? Run /feedback to report details.', 1],
      ['Keybinding configuration issues', 1],
      ['Version locks', 1],
      ['Agent parse errors', 1],
      ['Plugin errors', 1],
      ['Unreachable permission rules', 1],
      ['Context usage warnings', 1],
      ['Version check skipped (essential-traffic-only mode)', 1],
      ['Checking for updates\\u2026', 1],
      ['variant:"outline",ancestors:[]', 1],
      ['variant:z,ancestors:[...f,M]', 1],
    ]) {
      assert.equal(
        count(bundle, needle),
        expected,
        `${release.version}: ${needle} cardinality`,
      )
    }

    assert.match(
      bundle,
      /"doctor:fix":\(\)=>\{if\([^}]+\)\w+\([^}]+\{display:"user",shouldQuery:!0\}\)\}/,
    )
    assert.match(
      bundle,
      /M\?\.enabled&&\(M\.locks\.length>0\|\|M\.staleLocksCleaned>0\)/,
    )
    assert.match(
      bundle,
      /Y&&\(Y\.claudeMdWarning\|\|Y\.agentWarning\)&&/,
    )
    assert.doesNotMatch(bundle, /Y\.mcpWarning/)
  }
})

test('source restores the shared retained tree and child diagnostic renderers', () => {
  const tree = readSource('src/components/design-system/Tree.tsx')
  assert.match(tree, /branch: '├'/)
  assert.match(tree, /last: '└'/)
  assert.match(tree, /pipe: '│'/)
  assert.match(tree, /variant: 'outline', ancestors: \[\]/)
  assert.match(tree, /parentIsLast && index === childArray\.length - 1/)
  assert.match(tree, /variant === 'outline' \? 'last' : isLast \? 'last' : 'branch'/)
  assert.match(tree, /Object\.assign\(TreeRoot, \{/)
  assert.match(tree, /Node: TreeNode/)
  assert.match(tree, /Group: TreeGroup/)

  const keybindings = readSource('src/components/KeybindingWarnings.tsx')
  assert.match(keybindings, /\[\.\.\.warnings\]\.sort\(compareWarnings\)/)
  assert.match(keybindings, /sorted\[0\]\?\.severity === 'error'/)
  assert.match(keybindings, /Keybinding configuration issues/)
  assert.match(keybindings, /<Tree variant="tree">/)
  assert.match(keybindings, /<Tree\.Node dimColor>/)

  const sandbox = readSource(
    'src/components/sandbox/SandboxDoctorSection.tsx',
  )
  assert.match(sandbox, /SandboxManager\.isPlatformInEnabledList\(\)/)
  assert.match(sandbox, /<StatusIcon status=\{hasErrors \? 'error' : 'warning'\}/)
  assert.match(sandbox, /<Tree variant="tree">/)

  const mcp = readSource('src/components/mcp/McpParsingWarnings.tsx')
  assert.match(mcp, /<Tree variant="tree">\{t8\}\{t9\}<\/Tree>/)
  assert.match(mcp, /<Tree\.Node key=\{`error-/)
  assert.match(mcp, /<Tree\.Node key=\{`warning-/)
})

test('source restores exact doctor issue collection and model handoff', () => {
  const doctor = readSource('src/screens/Doctor.tsx')
  for (const text of [
    'Help me fix the issues reported by /doctor below.',
    'For each issue: briefly explain what the fix will do',
    'Still having issues? Run /feedback to report details.',
    'Invalid settings',
    'Environment variables',
    'Version locks',
    'Agent parse errors',
    'Plugin errors',
    'Unreachable permission rules',
    'Context usage warnings',
    'Version check skipped (essential-traffic-only mode)',
  ]) {
    assert.match(doctor, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(doctor, /getCachedKeybindingWarnings\(\)/)
  assert.match(doctor, /error\.mcpErrorMetadata === undefined/)
  assert.match(doctor, /SandboxManager\.isPlatformInEnabledList\(\)/)
  assert.match(doctor, /contextWarnings\?\.unreachableRulesWarning/)
  assert.match(doctor, /'doctor:fix'/)
  assert.match(doctor, /onDone\(fixPrompt, \{ display: 'user', shouldQuery: true \}\)/)
  assert.match(doctor, /isActive: fixPrompt !== null/)
  assert.match(
    doctor,
    /versionLockInfo\.locks\.length > 0 \|\|\s*versionLockInfo\.staleLocksCleaned > 0/,
  )
  assert.doesNotMatch(doctor, /mcpWarning/)

  const warnings = readSource('src/utils/doctorContextWarnings.ts')
  assert.match(
    warnings,
    /export async function checkContextWarnings\(\s*agentInfo:/,
  )
  assert.doesNotMatch(warnings, /checkMcpTools/)
  assert.doesNotMatch(warnings, /mcpWarning/)
})
