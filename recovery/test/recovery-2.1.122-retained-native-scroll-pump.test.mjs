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

const retainedCounts = new Map([
  ['nativeHistory', 17],
  ['consumeGapRange', 2],
  ['primeBackfill', 2],
  ['switchTranscript', 1],
  ['frameSink', 5],
  ['getDomElement', 2],
  ['tengu_marlin_porch', 1],
  ['CLAUDE_CODE_DECSTBM', 1],
])

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

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('authenticates the retained native-scroll contract in both releases', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [fragment, count] of retainedCounts) {
      assert.equal(
        occurrences(bundle, fragment),
        count,
        `${release.version}: ${fragment}`,
      )
    }
  }
})

test('recovers the DECSTBM pump, replay, gap, and overlay state machine', () => {
  const pump = compact(source('src/ink/native-scroll-pump.ts'))
  for (const fragment of [
    "this.buf += '\\n'.repeat(this.rows - this.contentHeight)",
    'this.buf += setScrollRegion(1, Math.max(2, this.contentHeight))',
    'this.nativeHistory.length > NATIVE_HISTORY_LIMIT',
    'this.gapRange = { from: gapStart, to: targetTop }',
    'if (this.nativeHistory.length === 0 && targetTop > 0) { this.backfillNeeded = true }',
    'return this.pumpCursor >= 0',
    'this.overlayRatchet = Math.max(this.overlayRatchet, overlayRows)',
    "return 'replay'",
    'this.pumpCursor = Math.max(0, previousLength - removed)',
    'this.buf += RESET_SCROLL_REGION + ERASE_SCREEN + ERASE_SCROLLBACK',
  ]) {
    assert.ok(pump.includes(compact(fragment)), fragment)
  }
})

test('recovers frame interception, screen serialization, and backfill replay', () => {
  const ink = compact(source('src/ink/ink.tsx'))
  const layout = compact(source('src/components/NativeScrollLayout.tsx'))
  const serializer = compact(source('src/ink/serialize-screen-line.ts'))
  const scrollBox = compact(source('src/ink/components/ScrollBox.tsx'))
  for (const fragment of [
    'if (this.frameSink) { const consumed = this.frameSink(frame, this.stylePool);',
    "if (consumed === 'tick') { this.drainTimer = setTimeout(() => this.onRender(), FRAME_INTERVAL_MS >> 2); }",
    'getStylePool(): StylePool { return this.stylePool; }',
    'getCharPool(): CharPool { return this.charPool; }',
    'getHyperlinkPool(): HyperlinkPool { return this.hyperlinkPool; }',
  ]) {
    assert.ok(ink.includes(compact(fragment)), fragment)
  }
  for (const fragment of [
    'ink.frameSink = (frame, stylePool) =>',
    'if (ink.isAltScreenActive)',
    'currentPump.resume(currentPump.cols, currentPump.rows)',
    'const gap = currentPump.consumeGapRange()',
    'const needsBackfill = currentPump.consumeBackfillNeeded()',
    'currentPump.primeBackfill(lines)',
    "return pumpPending || primedBackfill ? 'tick' : true",
    'renderNodeToOutput(child, output,',
    'dropSubtreeCache(child)',
  ]) {
    assert.ok(layout.includes(compact(fragment)), fragment)
  }
  for (const fragment of [
    'cell.width === CellWidth.SpacerTail',
    'cell.width === CellWidth.SpacerHead',
    'output += LINK_END',
    'output += link(cell.hyperlink)',
    'stylePool.transition(currentStyle, cell.styleId)',
  ]) {
    assert.ok(serializer.includes(compact(fragment)), fragment)
  }
  assert.ok(
    scrollBox.includes(compact('getDomElement() { return domRef.current; }')),
  )
})

test('routes the retained DECSTBM-safe layout before the legacy fallback', () => {
  const fullscreen = compact(source('src/components/FullscreenLayout.tsx'))
  const gate = fullscreen.indexOf('if (DECSTBM_SAFE)')
  const fallback = fullscreen.indexOf(
    'let t8;',
    gate,
  )
  assert.ok(gate >= 0)
  assert.ok(fallback > gate)
  for (const fragment of [
    '<NativeScrollLayout',
    'scrollable={nativeScrollable}',
    'pushUp={pushUp}',
    'bottom={nativeBottom}',
    'overlay={nativeModal}',
  ]) {
    assert.ok(fullscreen.includes(compact(fragment)), fragment)
  }
})
