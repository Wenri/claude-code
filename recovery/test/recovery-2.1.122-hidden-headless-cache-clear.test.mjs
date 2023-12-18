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
    totalCount: 3,
    headlessCount: 0,
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    totalCount: 6,
    headlessCount: 1,
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

test('authenticates all three new headless cache clears', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'clearSessionCaches'),
      release.totalCount,
      `${release.version}: total clearSessionCaches cardinality`,
    )
    for (const fragment of [
      'clearSessionCaches:K}=await Promise.resolve().then(() => (GTH(),ldH));K();let _=await ws(void 0,void 0)',
      'clearSessionCaches:K}=await Promise.resolve().then(() => (GTH(),ldH));K();let{checkOutTeleportedSessionBranch',
      'clearSessionCaches:f}=await Promise.resolve().then(() => (GTH(),ldH));if(f(),IH(process.env.CLAUDE_CODE_USE_CCR_V2)',
    ]) {
      assert.equal(
        occurrences(bundle, fragment),
        release.headlessCount,
        `${release.version}: ${fragment}`,
      )
    }
  }
})

test('source clears caches before continue, teleport, and resume loading', () => {
  const contents = compact(
    fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8'),
  )
  assert.equal(
    occurrences(contents, "await import( '../commands/clear/caches.js' )"),
    3,
  )
  assert.equal(occurrences(contents, 'clearSessionCaches()'), 3)
  for (const fragment of [
    "logEvent('tengu_continue_print', {}) const { clearSessionCaches } = await import( '../commands/clear/caches.js' ) clearSessionCaches() const result = await loadConversationForResume",
    "if (typeof options.teleport !== 'string') { throw new Error('No session ID provided for teleport') } const { clearSessionCaches } = await import( '../commands/clear/caches.js' ) clearSessionCaches() const { checkOutTeleportedSessionBranch",
    "if (!parsedSessionId) { let errorMessage = 'Error: --resume requires a valid session ID or session title when used with --print.",
    "const { clearSessionCaches } = await import( '../commands/clear/caches.js' ) clearSessionCaches() // Hydrate local transcript from remote before loading",
  ]) {
    assert.ok(contents.includes(compact(fragment)), `missing ${fragment}`)
  }
})
