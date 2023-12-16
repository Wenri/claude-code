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

const placeholders = [
  'command prefix (e.g., npm run *)',
  'command prefix (e.g., Get-Process *)',
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

test('authenticated adjacent bundles retain wildcard prefix placeholders', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const placeholder of placeholders) {
      assert.ok(bundle.includes(placeholder), `${release.version}: ${placeholder}`)
    }
    assert.ok(!bundle.includes('command prefix (e.g., npm run:*)'))
    assert.ok(!bundle.includes('command prefix (e.g., Get-Process:*)'))
  }
})

test('source reconstructs Bash and PowerShell prefix placeholders', () => {
  const sources = [
    'src/components/permissions/BashPermissionRequest/bashToolUseOptions.tsx',
    'src/components/permissions/PowerShellPermissionRequest/powershellToolUseOptions.tsx',
  ].map(filename => fs.readFileSync(path.join(repo, filename), 'utf8'))
  for (const [index, placeholder] of placeholders.entries()) {
    assert.ok(sources[index].includes(`placeholder: '${placeholder}'`))
    assert.ok(!sources[index].includes(':*)'))
  }
})
