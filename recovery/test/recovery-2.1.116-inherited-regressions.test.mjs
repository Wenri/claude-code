import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repo, 'src')
const overlay = fs.readFileSync(
  fileURLToPath(
    new URL(
      '../cases/2.1.114-to-2.1.116/recovered/source-facing-overlay.patch',
      import.meta.url,
    ),
  ),
  'utf8',
)

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative.replace(/^src\//, '')), 'utf8')
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('2.1.114 adaptive drain persists under the target116 shared wheel config', () => {
  const scroll = source('src/ink/render-node-to-output.ts')
  assert.match(scroll, /function drainAdaptive\(/)
  assert.match(
    scroll,
    /getScrollConfig\(\)\.useAdaptiveDrain\s*\?\s*drainAdaptive/,
  )
  assert.match(scroll, /SCROLL_INSTANT_THRESHOLD = 5/)
  assert.match(scroll, /SCROLL_MAX_PENDING = 30/)

  const config = source('src/ink/scroll-config.ts')
  assert.match(config, /useDecayCurve: xtermJs \|\| platform === 'win32' \|\| wtSession/)
  assert.match(config, /useAdaptiveDrain: xtermJs/)

  const colors = source('src/ink/colorize.ts')
  assert.match(colors, /function boostChalkLevelForXtermJs\(\)/)
  assert.match(colors, /process\.env\.TERM_PROGRAM === 'vscode'/)
  assert.match(colors, /CHALK_BOOSTED_FOR_XTERMJS/)
  assert.match(colors, /CHALK_CLAMPED_FOR_TMUX/)

  assert.equal(overlay.includes('a/src/ink/render-node-to-output.ts'), false)
  assert.equal(overlay.includes('a/src/ink/colorize.ts'), false)
})

test('2.1.114 already prefilters dead forks before JSON parsing', () => {
  const sessions = source('src/utils/sessionStorage.ts')
  assert.match(sessions, /function walkChainBeforeParse\(buf: Buffer\): Buffer/)
  assert.match(sessions, /const SIDECHAIN_TRUE = Buffer\.from\('\"isSidechain\":true'\)/)
  assert.match(sessions, /const uuidToSlot = new Map<string, number>\(\)/)
  assert.match(sessions, /if \(len - chainBytes < len >> 1\) return buf/)

  // 2.1.116 adds an fd-level scanner for large files; it does not invent the
  // older in-memory dead-fork optimization as an adjacent change.
  assert.match(overlay, /\+function scanLargeTranscript\(/)
  assert.match(overlay, /\+const TRANSCRIPT_SCAN_CHUNK_SIZE = 1024 \* 1024/)
})

test('wide-cell cleanup is inherited while multi-column Indic output is adjacent', () => {
  const screen = source('src/ink/screen.ts')
  assert.match(screen, /Overwriting a SpacerTail: clear the orphaned Wide char/)
  assert.match(screen, /Expand damage to include SpacerTail/)
  assert.equal(overlay.includes('a/src/ink/screen.ts'), false)

  const outputSection = overlay.slice(
    overlay.indexOf('diff --git a/src/ink/output.ts'),
    overlay.indexOf('\ndiff --git ', overlay.indexOf('diff --git a/src/ink/output.ts') + 1),
  )
  assert.match(outputSection, /\+\s*if \(isWideCharacter && offsetX \+ charWidth > screenWidth\)/)
  assert.match(outputSection, /\+\s*for \(let i = 2; i < charWidth; i\+\+\)/)
  assert.match(outputSection, /\+\s*offsetX \+= isWideCharacter \? charWidth : 1/)
})

test('inherited source files retain authenticated base or prior-lineage bytes', () => {
  // Pin the inherited files used by the overclaim audit. colorize may be the
  // sparse target-commit source or the cumulative target110 recovery; neither
  // is introduced by the 114-to-116 overlay.
  assert.equal(
    sha256(source('src/ink/render-node-to-output.ts')),
    '49da9c45f1f88b8bb849575dd5257379099eca7af750ff398a5315da33c9298e',
  )
  assert.equal(
    new Set([
      '489880374c462f5a3c8a2fbbccea35f7023e764f29a9bb3f770e96675808b44b',
      '593fad75c0510ccd55c4e56bbc3df4a140f7b8c3a6cf1a88b4af5c8d1eee28a8',
    ]).has(sha256(source('src/ink/colorize.ts'))),
    true,
  )
  assert.equal(
    sha256(source('src/ink/screen.ts')),
    '0e44207a3990aa365f2ffde47f9b9dcc7454c422743d1d15443d39fdd2a69880',
  )
})
