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
    count: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    count: 1,
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-only workspace proxy expansion', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const witness of [
      'mcp__${xeH}__bash',
      'mcp__${xeH}__web_fetch',
      '__web_fetch',
    ]) {
      assert.equal(
        occurrences(bundle, witness),
        release.count,
        `${release.version}: ${witness}`,
      )
    }
    assert.equal(
      occurrences(bundle, '{proxyExpansion:!0}'),
      release.count * 2,
      `${release.version}: deny and ask expand proxy aliases`,
    )
  }

  const target = readBundle(releases[1])
  assert.match(
    target,
    /\.split\("\|"\)\.flatMap\(\([A-Za-z_$][\w$]*\)=>[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\.trim\(\)\)\)\)\.includes\([A-Za-z_$][\w$]*\)/,
  )
  assert.match(
    target,
    /for\(let [A-Za-z_$][\w$]* of [A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\)\)if\([A-Za-z_$][\w$]*\.test\([A-Za-z_$][\w$]*\)\)return!0/,
  )
})

test('source expands workspace proxies only for deny and ask rules', () => {
  const parser = compact(
    fs.readFileSync(
      path.join(repo, 'src/utils/permissions/permissionRuleParser.ts'),
      'utf8',
    ),
  )
  for (const fragment of [
    'Bash: [WORKSPACE_BASH_TOOL_NAME]',
    'WebFetch: [WORKSPACE_WEB_FETCH_TOOL_NAME]',
    'return aliases ? [toolName, ...aliases] : [toolName]',
    'if (aliases.includes(proxyName)) result.push(toolName)',
  ]) {
    assert.ok(parser.includes(compact(fragment)), fragment)
  }

  const permissions = compact(
    fs.readFileSync(
      path.join(repo, 'src/utils/permissions/permissions.ts'),
      'utf8',
    ),
  )
  assert.match(
    permissions,
    /getAllowRules\(context\)\.find\(rule => toolMatchesRule\(tool, rule\)\)/,
  )
  assert.equal(
    occurrences(
      permissions,
      'toolMatchesRule(tool, rule, { proxyExpansion: true })',
    ),
    2,
  )

  const hooks = compact(
    fs.readFileSync(path.join(repo, 'src/utils/hooks.ts'), 'utf8'),
  )
  for (const fragment of [
    'flatMap(p => getToolNameWithProxyAliases(normalizeLegacyToolName(p.trim())), )',
    'return getToolNameWithProxyAliases( normalizeLegacyToolName(matcher), ).includes(matchQuery)',
    'for (const toolName of getToolNamesForProxyAlias(matchQuery))',
  ]) {
    assert.ok(hooks.includes(compact(fragment)), fragment)
  }
})
