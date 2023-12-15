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

test('authenticates retained SDK memory-recall schema and producer', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.match(/"memory_recall"/g)?.length,
      2,
      `${release.version}: schema and producer cardinality`,
    )
    assert.match(
      bundle,
      /subtype:[^,]+\("memory_recall"\),mode:[^,]+\(\["select","synthesize"\]\)/,
      `${release.version}: wire schema`,
    )
    const schemaOffset = bundle.indexOf('"memory_recall"')
    const producerOffset = bundle.indexOf('"memory_recall"', schemaOffset + 1)
    const producer = bundle.slice(producerOffset - 500, producerOffset + 700)
    assert.match(
      producer,
      /\.startsWith\([^)]*\)\?[^?]{0,100}\.slice\([^,]+,-1\):void 0/,
      `${release.version}: synthesis sentinel parsing`,
    )
    assert.match(producer, /mode:[^?]+\?"synthesize":"select"/)
    assert.match(producer, /scope:[^,]+\?\?"personal"/)
    assert.match(
      bundle,
      /attachment\.type==="relevant_memories"[^]{0,180}?attachment\.memories[^]{0,50}?yield/,
      `${release.version}: relevant-memory delivery`,
    )
  }
})

test('source emits and validates the authenticated memory-recall message', () => {
  const engine = fs.readFileSync(path.join(repo, 'src/QueryEngine.ts'), 'utf8')
  const schemas = fs.readFileSync(
    path.join(repo, 'src/entrypoints/sdk/coreSchemas.ts'),
    'utf8',
  )

  assert.match(engine, /const SYNTHESIS_MEMORY_PREFIX = '<synthesis:'/)
  assert.match(
    engine,
    /subtype: 'memory_recall',[\s\S]{0,100}?mode: synthesized \? 'synthesize' : 'select'/,
  )
  assert.match(
    engine,
    /memoryScopeForPath\(synthesisDirectory \?\? memory\.path\) \?\? 'personal'/,
  )
  assert.match(
    engine,
    /attachment\.type === 'relevant_memories'[\s\S]{0,180}?yield memoryRecall/,
  )
  assert.match(schemas, /subtype: z\.literal\('memory_recall'\)/)
  assert.match(
    schemas,
    /SDKToolUseSummaryMessageSchema\(\),\s*SDKMemoryRecallMessageSchema\(\),\s*SDKRateLimitEventSchema\(\)/,
  )
})
