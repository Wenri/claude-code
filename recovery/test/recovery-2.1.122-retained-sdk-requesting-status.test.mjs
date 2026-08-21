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

test('authenticated bundles retain requesting SDK status schema and producer', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(bundle.match(/literal\("requesting"\)/g)?.length, 1)
    assert.equal(
      bundle.match(/subtype:"status",status:"requesting"/g)?.length,
      1,
    )
    assert.match(
      bundle,
      /union\(\[[^.]+\.literal\("compacting"\),[^.]+\.literal\("requesting"\),[^.]+\.null\(\)\]\)/,
      `${release.version}: status schema`,
    )
    assert.match(
      bundle,
      /case"stream_request_start":if\([\w$]+\)yield\{type:"system",subtype:"status",status:"requesting",uuid:[\w$]+\.randomUUID\(\),session_id:[\w$]+\(\)\}/,
      `${release.version}: partial-message producer`,
    )
  }
})

test('source reconstructs requesting SDK status behavior', () => {
  const schemas = fs.readFileSync(
    path.join(repo, 'src/entrypoints/sdk/coreSchemas.ts'),
    'utf8',
  )
  const engine = fs.readFileSync(path.join(repo, 'src/QueryEngine.ts'), 'utf8')

  assert.match(
    schemas,
    /z\.union\(\[z\.literal\('compacting'\), z\.literal\('requesting'\), z\.null\(\)\]\)/,
  )
  assert.match(
    engine,
    /case 'stream_request_start':\s*if \(includePartialMessages\) \{\s*yield \{\s*type: 'system',\s*subtype: 'status',\s*status: 'requesting'/,
  )
})
