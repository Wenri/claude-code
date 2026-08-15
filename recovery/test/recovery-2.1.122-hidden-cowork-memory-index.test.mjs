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
    count: 0,
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    count: 1,
  },
]

function readBundle(release) {
  const filename = release.envNames
    .map(name => process.env[name])
    .find(Boolean)
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-only Cowork memory-index injection', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'CLAUDE_COWORK_MEMORY_INDEX_CONTENT'),
      release.count,
      `${release.version}: environment branch`,
    )
    assert.equal(
      occurrences(bundle, 'type:"AutoMem",content:$,contentDiffersFromDisk:!0,rawContent:H'),
      release.count,
      `${release.version}: injected-memory record`,
    )
  }
})

test('source preserves unset, empty, and injected memory-index semantics', () => {
  const contents = compact(
    fs.readFileSync(path.join(repo, 'src/utils/claudemd.ts'), 'utf8'),
  )
  for (const fragment of [
    'function createInjectedAutoMemoryFile(rawContent: string): MemoryFileInfo',
    'const { content } = truncateEntrypointContent(rawContent)',
    "path: getAutoMemEntrypoint(), type: 'AutoMem', content, contentDiffersFromDisk: true, rawContent",
    'process.env.CLAUDE_COWORK_MEMORY_INDEX_CONTENT',
    "if (injectedContent !== '')",
    'injectedContent !== undefined ? createInjectedAutoMemoryFile(injectedContent)',
    "await safelyReadMemoryFileAsync( getAutoMemEntrypoint(), 'AutoMem', )",
  ]) {
    assert.ok(contents.includes(compact(fragment)), `missing ${fragment}`)
  }
})
