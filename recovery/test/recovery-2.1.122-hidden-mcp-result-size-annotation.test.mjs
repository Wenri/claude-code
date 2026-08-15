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
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value.toString('utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, '')
}

test('authenticates retained MCP result-size annotation handling', () => {
  const processor =
    /async function [\w$]+\(([\w$]+),([\w$]+),([\w$]+),([\w$]+),([\w$]+)=!1\)\{let\{content:([\w$]+),type:[\w$]+,schema:[\w$]+\}=await [\w$]+\(\1,\2,\3,\4\);if\(\3==="ide"\)return \6;if\(\5&&!([\w$]+)\(\6\)\)return \6;/
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.split('hasResultSizeAnnotation').length - 1,
      4,
      `${release.version}: caller, retry, call, and forwarding surface`,
    )
    assert.equal(
      bundle.split('anthropic/maxResultSizeChars').length - 1,
      1,
      `${release.version}: canonical annotation`,
    )
    assert.match(
      bundle,
      processor,
      `${release.version}: annotated non-image output bypasses generic truncation`,
    )
  }
})

test('source threads the annotation and preserves image handling', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/services/mcp/client.ts'), 'utf8'),
  )
  for (const fragment of [
    "tool._meta?.['anthropic/maxResultSizeChars']",
    'hasResultSizeAnnotation:hasRequestedMaxResultSizeChars',
    'hasResultSizeAnnotation = false',
    'if (hasResultSizeAnnotation && !contentContainsImages(content)) { return content }',
    'processMCPResult(result,tool,name,imageLimits,hasResultSizeAnnotation,)',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
  assert.equal(
    source.split('hasResultSizeAnnotation').length - 1,
    10,
    'declaration, types, forwarding, and processor callsites stay complete',
  )
})
