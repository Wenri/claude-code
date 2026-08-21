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
    lifecycleCount: 18,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    lifecycleCount: 20,
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

function readSource(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function sourceFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(filename))
    else if (/\.tsx?$/.test(entry.name)) files.push(filename)
  }
  return files
}

test('authenticates the instance lifecycle property and target delta', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'onCommandLifecycle'),
      release.lifecycleCount,
      `${release.version}: onCommandLifecycle cardinality`,
    )
  }

  const target = readBundle(releases[1])
  assert.equal(occurrences(target, 'this.onCommandLifecycle='), 1)
  assert.equal(
    occurrences(target, '.toolUseContext.onCommandLifecycle?.'),
    1,
  )
})

test('keeps lifecycle ownership on each StructuredIO instance', () => {
  const structuredIO = compact(readSource('src/cli/structuredIO.ts'))
  const remoteIO = compact(readSource('src/cli/remoteIO.ts'))

  assert.ok(
    structuredIO.includes(
      compact("onCommandLifecycle?: ToolUseContext['onCommandLifecycle']"),
    ),
  )
  assert.ok(
    structuredIO.includes(
      compact("this.onCommandLifecycle?.(uuid, 'completed')"),
    ),
  )
  assert.ok(
    remoteIO.includes(
      compact('this.onCommandLifecycle = (uuid, state) => {'),
    ),
  )
  assert.ok(
    remoteIO.includes(
      compact(
        'this.ccrClient?.reportDelivery(uuid, LIFECYCLE_TO_DELIVERY[state])',
      ),
    ),
  )

  const imports = sourceFiles(path.join(repo, 'src'))
    .map(filename => fs.readFileSync(filename, 'utf8'))
    .filter(source => /from ['"][^'"]*commandLifecycle\.js['"]/.test(source))
  assert.deepEqual(imports, [])
})

test('threads the owning instance through print, QueryEngine, and query', () => {
  const print = compact(readSource('src/cli/print.ts'))
  const engine = compact(readSource('src/QueryEngine.ts'))
  const query = compact(readSource('src/query.ts'))

  for (const fragment of [
    "structuredIO.onCommandLifecycle?.(uuid, 'started')",
    "structuredIO.onCommandLifecycle?.(uuid, 'completed')",
    'onCommandLifecycle: structuredIO.onCommandLifecycle',
    "structuredIO.onCommandLifecycle?.(eventId, 'completed')",
    "structuredIO.onCommandLifecycle?.(message.uuid, 'completed')",
  ]) {
    assert.ok(print.includes(compact(fragment)), fragment)
  }
  assert.equal(
    occurrences(engine, 'onCommandLifecycle: this.config.onCommandLifecycle'),
    2,
  )
  assert.ok(
    query.includes(
      compact(
        "params.toolUseContext.onCommandLifecycle?.(uuid, 'completed')",
      ),
    ),
  )
  assert.ok(
    query.includes(
      compact("toolUseContext.onCommandLifecycle?.(cmd.uuid, 'started')"),
    ),
  )
})
