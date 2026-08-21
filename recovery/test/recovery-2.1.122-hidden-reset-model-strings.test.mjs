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

test('authenticates the target-only resetModelStrings export and delegation', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const fragment of [
      'resetModelStrings:()=>cF6',
      'function cF6(){F$.modelStrings=null}function gU4(){cF6()}',
    ]) {
      assert.equal(
        occurrences(bundle, fragment),
        release.count,
        `${release.version}: ${fragment}`,
      )
    }
  }
})

test('source exports the general reset and delegates the testing helper', () => {
  const contents = compact(
    fs.readFileSync(path.join(repo, 'src/bootstrap/state.ts'), 'utf8'),
  )
  assert.ok(
    contents.includes(
      compact(`
        export function resetModelStrings(): void {
          STATE.modelStrings = null
        }

        // Test utility function to reset model strings for re-initialization.
        // Separate from setModelStrings because we only want to accept 'null' in tests.
        export function resetModelStringsForTestingOnly(): void {
          resetModelStrings()
        }
      `),
    ),
  )
})
