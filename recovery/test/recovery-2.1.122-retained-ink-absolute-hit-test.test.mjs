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

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

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

test('authenticates retained absolute-hit and blank-hover markers', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'hasAbsoluteDescendant'),
      6,
      `${release.version}: hasAbsoluteDescendant`,
    )
    assert.equal(
      occurrences(bundle, 'hoverIgnoresBlankCells'),
      4,
      `${release.version}: hoverIgnoresBlankCells`,
    )
  }
})

test('restores sticky absolute-descendant propagation at every DOM mutation', () => {
  const dom = compact(source('src/ink/dom.ts'))
  for (const fragment of [
    'hasAbsoluteDescendant?: boolean',
    'while (current && !current.hasAbsoluteDescendant) { current.hasAbsoluteDescendant = true current = current.parentNode }',
    "childNode.style.position === 'absolute' || childNode.hasAbsoluteDescendant",
    "newChildNode.style.position === 'absolute' || (newChildNode.nodeName !== '#text' && newChildNode.hasAbsoluteDescendant)",
    "style.position === 'absolute' && node.style.position !== 'absolute'",
    'if (becameAbsolute && node.parentNode) { markHasAbsoluteDescendant(node.parentNode) }',
  ]) {
    assert.ok(dom.includes(compact(fragment)), fragment)
  }
})

test('restores out-of-parent hit arbitration and blank-cell hover filtering', () => {
  const hitTest = compact(source('src/ink/hit-test.ts'))
  const ink = compact(source('src/ink/ink.tsx'))
  for (const fragment of [
    'if (!containsPoint && !node.hasAbsoluteDescendant) return null',
    'if (!pointInsideChild && !child.hasAbsoluteDescendant) continue',
    'if (result !== null && pointInsideChild) continue',
    'if (result === null || (hitOutsideChild && !resultIsOutsideChild))',
    'if (resultIsOutsideChild) break',
    'return result ?? (containsPoint ? node : null)',
    "!(cellIsBlank && node.attributes['hoverIgnoresBlankCells'])",
  ]) {
    assert.ok(hitTest.includes(compact(fragment)), fragment)
  }
  assert.ok(
    ink.includes(
      compact(
        'const blank = isCellBlank(this.frontFrame.screen, col, row); dispatchHover(this.rootNode, col, row, this.hoveredNodes, blank);',
      ),
    ),
  )
})
