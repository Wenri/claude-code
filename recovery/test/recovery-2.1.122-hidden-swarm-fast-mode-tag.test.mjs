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
    count: 2,
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

test('authenticates the target-only swarm fast-mode tag', () => {
  for (const release of releases) {
    assert.equal(
      readBundle(release).split('fastModeTag').length - 1,
      release.count,
      release.version,
    )
  }
})

test('the swarm border accounts for and renders the fast-mode tag', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/PromptInput/PromptInput.tsx'),
    'utf8',
  )
  for (const fragment of [
    'const fastModeTag = showFastIcon',
    'const fastModeTagWidth = fastModeTag ? stringWidth(fastModeTag) + 2 : 0',
    "const swarmBannerSuffix = fastModeTagWidth || swarmBannerTextWidth ? '──' : ''",
    'columns - fastModeTagWidth - swarmBannerTextWidth - swarmBannerSuffix.length',
    '{fastModeTag ? ` ${fastModeTag} ` : null}',
    'borderText={buildBorderText(fastModeTag)}',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})
