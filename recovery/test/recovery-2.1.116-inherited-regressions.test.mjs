import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
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
  return fs.readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8')
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('2.1.114 already contains xterm adaptive drain and color-profile fixes', () => {
  const scroll = source('src/ink/render-node-to-output.ts')
  assert.match(scroll, /function drainAdaptive\(/)
  assert.match(scroll, /isXtermJsHost\(\)\s*\?\s*drainAdaptive/)
  assert.match(scroll, /SCROLL_INSTANT_THRESHOLD = 5/)
  assert.match(scroll, /SCROLL_MAX_PENDING = 30/)

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

test('inherited source files remain byte-identical to the 2.1.114 base', () => {
  // Pin the inherited files used by the overclaim audit.
  assert.equal(
    sha256(source('src/ink/render-node-to-output.ts')),
    '857b877cd31e1e796873a3c3c78ee9edea756115b57a9d074df9dd24a11237f4',
  )
  assert.equal(
    sha256(source('src/ink/colorize.ts')),
    '489880374c462f5a3c8a2fbbccea35f7023e764f29a9bb3f770e96675808b44b',
  )
  assert.equal(
    sha256(source('src/ink/screen.ts')),
    '0e44207a3990aa365f2ffde47f9b9dcc7454c422743d1d15443d39fdd2a69880',
  )
})
