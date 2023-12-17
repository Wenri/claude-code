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
    targetNames: 0,
    imageNames: [2, 3, 5],
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    targetNames: 1,
    imageNames: [0, 0, 0],
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

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates generalized placeholder navigation in 2.1.122', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const name of [
      'placeholderEndingAt',
      'placeholderStartingAt',
      'placeholderContaining',
      'snapOutOfPlaceholder',
    ]) {
      assert.equal(
        occurrences(bundle, name) > 0 ? 1 : 0,
        release.targetNames,
        `${release.version}: ${name}`,
      )
    }
    ;['imageRefEndingAt', 'imageRefStartingAt', 'snapOutOfImageRef'].forEach(
      (name, index) => {
        assert.equal(
          occurrences(bundle, name),
          release.imageNames[index],
          `${release.version}: ${name}`,
        )
      },
    )
  }
})

test('cursor and Vim operators keep every input placeholder atomic', () => {
  const cursor = compact(
    fs.readFileSync(path.join(repo, 'src/utils/Cursor.ts'), 'utf8'),
  )
  for (const fragment of [
    "'\\\\[(?:Pasted text|Image|\\\\.\\\\.\\\\.Truncated text) #\\\\d+(?: \\\\+\\\\d+ lines)?\\\\.*\\\\]'",
    'placeholderEndingAt(this.offset)',
    'placeholderStartingAt(this.offset) ?? this.placeholderContaining(this.offset)',
    "this.snapOutOfPlaceholder(boundary.start, 'end')",
    'placeholderAdjustedEnd(boundary.end - 1)',
    "this.snapOutOfPlaceholder(pos, 'start')",
    "this.snapOutOfPlaceholder(this.prevWord().offset, 'start')",
    "this.snapOutOfPlaceholder(this.nextWord().offset, 'end')",
  ]) {
    assert.ok(cursor.includes(compact(fragment)), fragment)
  }
  for (const removed of [
    'imageRefEndingAt',
    'imageRefStartingAt',
    'snapOutOfImageRef',
  ]) {
    assert.ok(!cursor.includes(removed), removed)
  }

  const operators = fs.readFileSync(
    path.join(repo, 'src/vim/operators.ts'),
    'utf8',
  )
  assert.ok(operators.includes("cursor.snapOutOfPlaceholder(from, 'start')"))
  assert.ok(operators.includes("cursor.snapOutOfPlaceholder(to, 'end')"))
})
