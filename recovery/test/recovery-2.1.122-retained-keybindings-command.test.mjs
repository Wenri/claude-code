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

test('authenticates retained keybindings command outcomes', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /Keybinding customization is disabled in this environment\./,
      `${release.version}: disabled-environment response`,
    )
    assert.match(
      bundle,
      /`\$\{[\w$]+\?"Opened":"Created"\} \$\{[\w$]+\}\. \$\{[\w$]+\.error\}`/,
      `${release.version}: editor-error response preserves the editor detail`,
    )
    assert.match(
      bundle,
      /Opened \$\{[\w$]+\} in your editor\./,
      `${release.version}: existing-file success response`,
    )
    assert.match(
      bundle,
      /Created \$\{[\w$]+\} with template\. Opened in your editor\./,
      `${release.version}: created-file success response`,
    )
  }
})

test('source reproduces retained keybindings command outcomes', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/commands/keybindings/keybindings.ts'),
    'utf8',
  )
  assert.match(
    source,
    /value: 'Keybinding customization is disabled in this environment\.'/,
  )
  assert.match(
    source,
    /value: `\$\{fileExists \? 'Opened' : 'Created'\} \$\{keybindingsPath\}\. \$\{result\.error\}`/,
  )
  assert.doesNotMatch(source, /Could not open in editor/)
})
