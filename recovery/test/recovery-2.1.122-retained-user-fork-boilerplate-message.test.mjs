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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('authenticated adjacent bundles retain the fork-boilerplate renderer', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const exported = bundle.match(
      /UserForkBoilerplateMessage:\(\)=>([A-Za-z_$][\w$]*)/,
    )
    assert.ok(exported, `${release.version}: component export`)

    const definition = new RegExp(
      `function ${escapeRegExp(exported[1])}\\([^)]*\\)\\{[\\s\\S]{0,900}?\\.replace\\([\\s\\S]{0,200}?\\.startsWith\\([\\s\\S]{0,450}?userMessageBackground`,
    )
    assert.match(bundle, definition, `${release.version}: live renderer body`)
    assert.match(bundle, /<fork-boilerplate>/)
    assert.match(bundle, /\\u2442|⑂/)
  }
})

test('source restores the exact module and its live dynamic consumer', () => {
  const component = fs.readFileSync(
    path.join(
      repo,
      'src/components/messages/UserForkBoilerplateMessage.tsx',
    ),
    'utf8',
  )
  assert.match(component, /export function UserForkBoilerplateMessage/)
  assert.match(component, /text\.replace\(FORK_BOILERPLATE_REGEX, ''\)/)
  assert.match(
    component,
    /withoutBoilerplate\.startsWith\(FORK_DIRECTIVE_PREFIX\)/,
  )
  assert.match(component, /<Text dimColor>\{FORK_GLYPH\}<\/Text>/)
  assert.match(component, /backgroundColor="userMessageBackground"/)

  const caller = fs.readFileSync(
    path.join(repo, 'src/components/messages/UserTextMessage.tsx'),
    'utf8',
  )
  assert.match(caller, /param\.text\.includes\("<fork-boilerplate>"\)/)
  assert.match(caller, /require\("\.\/UserForkBoilerplateMessage\.js"\)/)
  assert.match(caller, /<UserForkBoilerplateMessage addMargin=\{addMargin\} param=\{param\} \/>/)
})
