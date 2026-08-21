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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function readSource(filename) {
  return fs.readFileSync(path.join(repo, filename), 'utf8')
}

test('authenticated adjacent bundles retain modal-aware OAuth URL outdent', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'urlOutdent'),
      2,
      `${release.version}: prop definition and Login caller`,
    )
    assert.match(
      bundle,
      /urlOutdent:([A-Za-z_$][\w$]*)=0\}\)\{let ([A-Za-z_$][\w$]*)=\([A-Za-z_$][\w$]*\(\)\?[A-Za-z_$][\w$]*:0\)\+\1/,
      `${release.version}: modal contribution plus caller outdent`,
    )
    assert.match(
      bundle,
      /marginX:([A-Za-z_$][\w$]*)\?-\1:void 0/,
      `${release.version}: URL negative-margin wrapper`,
    )
    assert.match(
      bundle,
      /let ([A-Za-z_$][\w$]*)=[A-Za-z_$][\w$]*\?[A-Za-z_$][\w$]*:[A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*;if\(.{0,500}?urlOutdent:\1/,
      `${release.version}: modal-aware Login caller`,
    )
  }
})

test('source reproduces modal and standard-pane URL width compensation', () => {
  const flow = readSource('src/components/ConsoleOAuthFlow.tsx')
  assert.match(flow, /urlOutdent\?: number/)
  assert.match(flow, /urlOutdent = 0/)
  assert.match(
    flow,
    /const totalUrlOutdent = \(useIsInsideModal\(\) \? 2 : 0\) \+ urlOutdent/,
  )
  assert.match(
    flow,
    /<Box marginX=\{totalUrlOutdent \? -totalUrlOutdent : undefined\}>/,
  )

  const login = readSource('src/commands/login/login.tsx')
  assert.match(login, /const isInsideModal = useIsInsideModal\(\)/)
  assert.match(login, /urlOutdent=\{isInsideModal \? 1 : 2\}/)
})
