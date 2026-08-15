import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates retained git remote credential redaction', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      bundle.split('redactGitRemoteCredentials').length - 1,
      2,
      `${version}: retained export and live import`,
    )
    assert.match(
      bundle,
      /function [\w$]+\([\w$]+\)\{return [\w$]+==null\?[\w$]+:[\w$]+\.replace\(\/:\\\/\\\/\[\^\/\]\*@\/,":\/\/\*\*\*@"\)\}/,
      `${version}: exact credential redactor`,
    )
    assert.match(
      bundle,
      /gitRepoUrl=\$\{[\w$]+\([\w$]+\)\} machine=/,
      `${version}: startup log applies the redactor`,
    )
  }
})

test('source exports the exact helper and applies it only to startup logging', () => {
  const git = readFileSync(
    new URL('../../src/utils/git.ts', import.meta.url),
    'utf8',
  )
  const bridge = readFileSync(
    new URL('../../src/bridge/bridgeMain.ts', import.meta.url),
    'utf8',
  )

  assert.match(
    git,
    /export function redactGitRemoteCredentials[\s\S]*?remoteUrl == null[\s\S]*?remoteUrl\.replace\(\/:\\\/\\\/\[\^\/\]\*@\/, '?:\/\/\*\*\*@'\)/,
  )
  assert.match(
    bridge,
    /gitRepoUrl=\$\{redactGitRemoteCredentials\(gitRepoUrl\)\} machine=/,
  )
  assert.equal(
    bridge.split('redactGitRemoteCredentials').length - 1,
    2,
    'one import and one live call',
  )
})
