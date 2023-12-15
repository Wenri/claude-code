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
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

test('authenticated adjacent bundles retain daemon-background SIGHUP immunity', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.split('SIGHUP_ignored_bg').length - 1,
      1,
      `${release.version}: ignored-background diagnostic cardinality`,
    )
    assert.match(
      bundle,
      /process\.env\.CLAUDE_BG_BACKEND==="daemon"\)process\.on\("SIGHUP",\(\)=>\{[^{}]*\{signal:"SIGHUP_ignored_bg"\}[^{}]*\}\);else process\.on\("SIGHUP",\(\)=>\{[^{}]*\{signal:"SIGHUP"\}[^{}]*\([^)]*129\)\}\),[^;(]+\(\)/,
      `${release.version}: daemon bypass and ordinary shutdown/orphan check`,
    )
  }
})

test('source keeps daemon workers alive while ordinary sessions shut down', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/gracefulShutdown.ts'),
    'utf8',
  )
  assert.match(
    source,
    /if \(process\.env\.CLAUDE_BG_BACKEND === 'daemon'\) \{[\s\S]*?process\.on\('SIGHUP'[\s\S]*?signal: 'SIGHUP_ignored_bg'[\s\S]*?\} else \{[\s\S]*?process\.on\('SIGHUP'[\s\S]*?signal: 'SIGHUP'[\s\S]*?gracefulShutdown\(129\)[\s\S]*?orphanCheckInterval = setInterval/,
  )
  const daemonBranch = source.slice(
    source.indexOf("if (process.env.CLAUDE_BG_BACKEND === 'daemon')"),
    source.indexOf('} else {', source.indexOf("if (process.env.CLAUDE_BG_BACKEND === 'daemon')")),
  )
  assert.doesNotMatch(daemonBranch, /gracefulShutdown|orphanCheckInterval/)
})
