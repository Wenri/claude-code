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

function count(contents, needle) {
  return contents.split(needle).length - 1
}

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
  )
  return bytes.toString('utf8')
}

test('authenticates retained Bash miss classification and no-op cd guards', () => {
  const exactCounts = new Map([
    ['multi-cd', 2],
    ['cd-git-compound', 2],
    ['shell-operators', 1],
    ['prompt-ask-rule', 1],
    ['no-rule-match', 2],
    [
      'This command changes directory before running git, which can execute untrusted hooks from the target directory. Approve only if you trust it.',
      2,
    ],
  ])
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [fragment, expected] of exactCounts) {
      assert.equal(count(bundle, fragment), expected, `${release.version}: ${fragment}`)
    }
    assert.equal(bundle.match(/bashMissKind:"too-complex"/g)?.length, 1)
    assert.equal(bundle.match(/bashMissKind:"semantics"/g)?.length, 1)
    assert.match(
      bundle,
      /\.envVars\.length>0\|\|\w+\.redirects\.length>0\)return!1;if\(\w+\.argv\.length!==2\|\|\w+\.argv\[0\]!=="cd"\)return!1/,
      `${release.version}: parsed cd commands must be simple`,
    )
    assert.match(
      bundle,
      /\.startsWith\("\.\/"\)\|\|\w+\.startsWith\("\.\.\/"\)\|\|\w+==="\."\|\|\w+==="\.\."/,
      `${release.version}: only explicit static paths qualify`,
    )
    assert.match(
      bundle,
      /\.envVars\.some\(\(\w+\)=>!\w+\(\w+\.name\)\)\|\|\w+\.argv\.some/,
      `${release.version}: sandbox auto-allow checks assignment names`,
    )
    assert.match(
      bundle,
      /redirects\.some\(\(\w+\)=>\/\^\\\/dev\\\/\(tcp\|udp\)\\\/\//,
      `${release.version}: sandbox auto-allow rejects network redirects`,
    )
    assert.match(
      bundle,
      /if\(\w+&&\w+\)return null;return \w+\}/,
      `${release.version}: sandbox auto-allow rejects cd plus removal`,
    )
  }
})

test('source reproduces Bash miss metadata, ordering, and canonical cd checks', () => {
  const permissions = fs.readFileSync(
    path.join(repo, 'src/tools/BashTool/bashPermissions.ts'),
    'utf8',
  )
  const helpers = fs.readFileSync(
    path.join(repo, 'src/tools/BashTool/bashCommandHelpers.ts'),
    'utf8',
  )
  const source = `${permissions}\n${helpers}`

  for (const [fragment, expected] of [
    ["bashMissKind: 'multi-cd'", 2],
    ["bashMissKind: 'cd-git-compound'", 2],
    ["bashMissKind: 'shell-operators'", 1],
    ["bashMissKind: 'prompt-ask-rule'", 1],
    ["bashMissKind: 'no-rule-match'", 2],
    ["bashMissKind: 'too-complex'", 1],
    ["bashMissKind: 'semantics'", 1],
  ]) {
    assert.equal(count(source, fragment), expected, fragment)
  }
  for (const fragment of [
    'async function canonicalDirectory',
    'async function stringCdCommandsAreNoOps',
    'async function parsedCdCommandsAreNoOps',
    'parsed.envVars.length > 0',
    'parsed.redirects.length > 0',
    "parsed.argv[0] !== 'cd'",
    "target.startsWith('-') || !isExplicitPath(target)",
    "target.includes('$')",
    'await realpath(path).catch(() => null)',
    'function checkSandboxAutoAllowWithParsedCommands',
    "command.envVars.some(variable => !SAFE_ENV_VARS.has(variable.name))",
    "^\\/dev\\/(tcp|udp)\\//.test(redirect.target)",
    "baseCommand !== 'rm' && baseCommand !== 'rmdir'",
    'checkDangerousRemovalPaths(baseCommand, args, getCwd())',
    'if (hasCd && hasRemoval) return null',
    "sem.kind === 'newline-hash'",
  ]) {
    assert.ok(permissions.includes(fragment), fragment)
  }
  assert.ok(
    helpers.indexOf('if (deniedSegment)') <
      helpers.indexOf("bashMissKind: 'multi-cd'"),
    'explicit denial precedes compound cd prompts',
  )
  for (const safeName of [
    'COLUMNS',
    'LINES',
    'CLICOLOR',
    'CLICOLOR_FORCE',
    'CI',
    'DEBIAN_FRONTEND',
    'GIT_TERMINAL_PROMPT',
  ]) {
    assert.ok(permissions.includes(`'${safeName}'`), safeName)
  }
})
