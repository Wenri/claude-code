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

function functionBody(bundle, symbol) {
  const start = bundle.indexOf(`function ${symbol}(`)
  assert.ok(start >= 0, `${symbol}: function definition`)
  const next = bundle.indexOf('function ', start + 9)
  return bundle.slice(start, next < 0 ? start + 1_000 : next)
}

function readSource(filename) {
  return fs.readFileSync(path.join(repo, filename), 'utf8')
}

test('authenticated adjacent bundles retain exact Ink lifecycle and frame diagnostics', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [name, count] of [
      ['hasRendered', 3],
      ['renderCalled', 3],
      ['isExiting', 3],
      ['domLive', 1],
      ['fiberLive', 1],
      ['skipSyncMarkers', 3],
      ['ensureInteractive', 4],
    ]) {
      assert.equal(occurrences(bundle, name), count, `${release.version}: ${name}`)
    }

    assert.match(
      bundle,
      /onRender\(\)\{if\(this\.isUnmounted\|\|this\.isPaused\)return;if\(this\.hasRendered&&!this\.isExiting\)this\.ensureInteractive\(\);if\(this\.hasRendered=!0,/,
      `${release.version}: post-first-render interaction lifecycle`,
    )
    assert.match(
      bundle,
      /render\([A-Za-z_$][\w$]*\)\{this\.renderCalled=!0,this\.currentNode=/,
      `${release.version}: public render marker`,
    )
    assert.match(
      bundle,
      /unmount\([A-Za-z_$][\w$]*\)\{if\(this\.isUnmounted\)return;if\(this\.isExiting=!0,this\.onRender\(\),/,
      `${release.version}: exit-before-final-render ordering`,
    )
    assert.match(
      bundle,
      /this\.restoreStderr\?\.\(\),this\.unsubscribeTTYHandlers\?\.\(\),this\.renderCalled\)\{let [A-Za-z_$][\w$]*=this\.log\.renderPreviousOutput_DEPRECATED\(this\.frontFrame\);[\s\S]{0,100}?this\.skipSyncMarkers\(\)\)/,
      `${release.version}: guarded final-output write`,
    )

    const phaseMatch = bundle.match(
      /\.\.\.process\.env\.CLAUDE_CODE_FRAME_TIMING_LOG&&\{domLive:([A-Za-z_$][\w$]*)\(this\.rootNode\),fiberLive:([A-Za-z_$][\w$]*)\(this\.container\.current\)\}/,
    )
    assert.ok(phaseMatch, `${release.version}: gated DOM/Fiber phases`)
    const domCounter = functionBody(bundle, phaseMatch[1])
    assert.match(domCounter, /"childNodes"in/)
    assert.match(domCounter, /\.childNodes/)
    const fiberCounter = functionBody(bundle, phaseMatch[2])
    assert.match(fiberCounter, /new Set/)
    for (const edge of ['child', 'sibling', 'alternate']) {
      assert.match(fiberCounter, new RegExp(`\\.${edge}`), edge)
    }

    const skipMatch = bundle.match(
      /skipSyncMarkers\(\)\{if\(!this\.options\.stdout\.isTTY\)return!0;if\(!([A-Za-z_$][\w$]*)\(\)\)return!0;if\(!this\.unsubscribeTTYHandlers\)return!0;return!1\}/,
    )
    assert.ok(skipMatch, `${release.version}: exact sync-marker guard`)
    const syncSupport = functionBody(bundle, skipMatch[1])
    assert.match(syncSupport, /process\.env\.CLAUDE_BG_BACKEND==="daemon"\)return!0/)
    assert.match(syncSupport, /if\(process\.env\.TMUX\)return!1/)
    assert.equal(
      occurrences(bundle, 'this.skipSyncMarkers()'),
      2,
      `${release.version}: frame and final-output callers`,
    )
  }
})

test('source restores retained Ink state, counters, and synchronized output guards', () => {
  const ink = readSource('src/ink/ink.tsx')
  for (const fragment of [
    'private hasRendered = false',
    'private renderCalled = false',
    'private isExiting = false',
    'private ensureInteractive = (): void =>',
    'if (this.hasRendered && !this.isExiting)',
    'this.hasRendered = true',
    'this.renderCalled = true',
    'this.isExiting = true',
    'if (this.renderCalled)',
    'onRawModeEnter={this.ensureInteractive}',
    'domLive: countDomNodes(this.rootNode)',
    'fiberLive: countFiberNodes(this.container.current)',
  ]) {
    assert.ok(ink.includes(fragment), fragment)
  }
  assert.equal(occurrences(ink, 'this.skipSyncMarkers()'), 2)
  assert.match(
    ink,
    /private skipSyncMarkers\(\): boolean \{[\s\S]*?!this\.options\.stdout\.isTTY[\s\S]*?!isSynchronizedOutputSupported\(\)[\s\S]*?!this\.unsubscribeTTYHandlers/,
  )
  assert.match(
    ink,
    /function countFiberNodes[\s\S]*?new Set[\s\S]*?node\.child[\s\S]*?node\.sibling[\s\S]*?node\.alternate/,
  )
  assert.match(
    ink,
    /function countDomNodes[\s\S]*?'childNodes' in node[\s\S]*?node\.childNodes/,
  )

  const frame = readSource('src/ink/frame.ts')
  assert.match(frame, /domLive\?: number/)
  assert.match(frame, /fiberLive\?: number/)

  const terminal = readSource('src/ink/terminal.ts')
  assert.match(
    terminal,
    /isSynchronizedOutputSupported\(\): boolean \{\s*if \(process\.env\.CLAUDE_BG_BACKEND === 'daemon'\) return true[\s\S]{0,320}?if \(process\.env\.TMUX\) return false/,
  )
})
