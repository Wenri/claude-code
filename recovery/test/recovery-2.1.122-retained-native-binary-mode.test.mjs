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

test('authenticated adjacent bundles retain owner-execute binary validation', () => {
  const validator =
    /async function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{try\{let ([A-Za-z_$][\w$]*)=await [A-Za-z_$][\w$]*\.stat\(\2\);if\(!\3\.isFile\(\)\|\|\3\.size===0\)return!1;return\(\3\.mode&[A-Za-z_$][\w$]*\.constants\.S_IXUSR\)!==0\}catch\{return!1\}\}/

  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'S_IXUSR'),
      1,
      `${release.version}: one owner-execute predicate`,
    )
    assert.match(bundle, validator, `${release.version}: exact stat/mode guard`)
  }
})

test('source uses the retained owner-execute truth table', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/nativeInstaller/installer.ts'),
    'utf8',
  )
  assert.match(
    source,
    /async function isPossibleClaudeBinary\(filePath: string\): Promise<boolean> \{\s*try \{\s*const stats = await stat\(filePath\)[\s\S]*?if \(!stats\.isFile\(\) \|\| stats\.size === 0\) \{\s*return false\s*\}\s*return \(stats\.mode & fsConstants\.S_IXUSR\) !== 0\s*\} catch \{\s*return false\s*\}\s*\}/,
  )
  assert.doesNotMatch(
    source,
    /await access\(filePath, fsConstants\.X_OK\)/,
    'does not delegate the decision to effective-identity access checks',
  )

  const S_IXUSR = 0o100
  const possible = ({ isFile = true, size = 1, mode = 0 }) =>
    isFile && size !== 0 && (mode & S_IXUSR) !== 0

  assert.equal(possible({ isFile: false, size: 1, mode: 0o100 }), false)
  assert.equal(possible({ size: 0, mode: 0o100 }), false)
  assert.equal(possible({ mode: 0 }), false)
  assert.equal(possible({ mode: 0o011 }), false)
  assert.equal(possible({ mode: 0o100 }), true)
  assert.equal(possible({ mode: 0o111 }), true)
})
