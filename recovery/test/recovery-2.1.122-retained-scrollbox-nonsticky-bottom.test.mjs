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
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

const retainedFragments = [
  'pendingScrollDelta=void 0,q===!1',
  'scrollViewportHeight??0)),O(M);return}M.stickyScroll=!0',
  '...q!==void 0&&{stickyScroll:q}',
  'getDomElement(){return _.current}}),[q])',
]

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('authenticates the retained non-sticky bottom contract', () => {
  for (const release of releases) {
    const filename = process.env[release.env]
    assert.ok(filename, `${release.env} must be set`)
    const bytes = fs.readFileSync(filename)
    assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
    assert.equal(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      release.sha256,
      `${release.version}: SHA-256`,
    )
    const bundle = bytes.toString('utf8')
    for (const fragment of retainedFragments) {
      assert.equal(
        occurrences(bundle, fragment),
        1,
        `${release.version}: ${fragment}`,
      )
    }
  }
})

test('preserves explicit non-sticky bottom positioning and ref refresh', () => {
  const scrollBox = compact(source('src/ink/components/ScrollBox.tsx'))
  for (const fragment of [
    'if (stickyScroll === false)',
    'el.scrollAnchor = undefined',
    'el.scrollTop = Math.max(0, (el.scrollHeight ?? 0) - (el.scrollViewportHeight ?? 0))',
    'scrollMutated(el); return',
    '[stickyScroll])',
    'stickyScroll !== undefined ? { stickyScroll } : {}',
  ]) {
    assert.ok(scrollBox.includes(compact(fragment)), fragment)
  }
})
