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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countIdentifier(text, identifier) {
  return [
    ...text.matchAll(
      new RegExp(
        `(?<![\\w$])${escapeRegex(identifier)}(?![\\w$])`,
        'g',
      ),
    ),
  ].length
}

test('authenticates retained claimSpare ownership and failure fallback', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const exportMatch = bundle.match(/claimSpare:\(\)=>([\w$]+)/)
    assert.ok(exportMatch, `${release.version}: claimSpare export`)
    const helperName = exportMatch[1]
    assert.equal(
      countIdentifier(bundle, helperName),
      3,
      `${release.version}: export, definition, and live caller`,
    )

    const definitionOffset = bundle.indexOf(`function ${helperName}(H,$,q,K){`)
    assert.ok(definitionOffset >= 0, `${release.version}: helper definition`)
    const definition = bundle.slice(definitionOffset, definitionOffset + 750)
    assert.match(
      definition,
      /\.claim\(H,\{pid:\$\.hostPid,ptySockPath:\$\.ptySock,spawnPty:q,getAuthSnapshot:K\}\)/,
    )
    assert.match(definition, /[\w$]+\(H,K\)/)
    assert.match(definition, /\$\.claimSock/)
    assert.match(definition, /cwd:H\.cwd/)
    assert.match(definition, /sessionId:H\.sessionId/)
    assert.match(definition, /\[bg-spare\] send-claim failed:/)
    assert.match(definition, /\$\.ptySock/)
    assert.match(definition, /\{t:\"kill\",sig:\"SIGTERM\"\}/)

    const callerPattern = new RegExp(
      `let ([\\w$]+)=${escapeRegex(helperName)}\\(([\\w$]+),([\\w$]+),([\\w$]+),[\\w$]+\\.getAuthSnapshot\\)`,
    )
    assert.match(bundle, callerPattern, `${release.version}: live four-argument caller`)
  }
})

test('source delegates the supervisor claim through the retained export', () => {
  const spare = fs.readFileSync(path.join(repo, 'src/daemon/spare.ts'), 'utf8')
  const supervisor = fs.readFileSync(
    path.join(repo, 'src/daemon/supervisor.ts'),
    'utf8',
  )

    assert.match(spare, /export function claimSpare\(/)
    assert.match(spare, /BackgroundHandle\.claim\(dispatch,/)
    assert.match(spare, /buildSpareClaimFrame\(dispatch, getAuthSnapshot\)/)
    assert.match(spare, /BackgroundHandle\.buildClaimFrame\(/)
  assert.match(spare, /sendSpareClaim\(\s*spare\.claimSock,/)
  assert.match(spare, /\[bg-spare\] send-claim failed:/)
  assert.match(spare, /killSparePty\(spare\.ptySock\)/)
  assert.match(spare, /return handle/)

  assert.match(
    supervisor,
    /handle = claimSpare\(\s*value,\s*claimed,\s*spawnPty,\s*options\?\.getAuthSnapshot,?\s*\)/,
  )
  assert.doesNotMatch(supervisor, /handle = BackgroundHandle\.claim\(/)
  assert.doesNotMatch(supervisor, /sendSpareClaim\(/)
})
