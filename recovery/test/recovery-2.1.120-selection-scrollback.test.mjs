import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_720_987
const BASELINE_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const TARGET_BYTES = 13_784_743
const TARGET_SHA256 =
  'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'
const repo = fileURLToPath(new URL('../..', import.meta.url))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(sha256(bytes), expectedSha256, `${environmentName}: SHA-256`)
  return bytes.toString('utf8')
}

const BUNDLE_WITNESSES = [
  ['virtual anchor column', 'virtualAnchorCol', 0, 8],
  ['virtual focus column', 'virtualFocusCol', 0, 6],
  [
    'offscreen accumulator transfer',
    'scrolledOffAbove=H.scrolledOffBelow',
    0,
    1,
  ],
  [
    'wholly-offscreen predicate',
    'virtualAnchorRow<H.anchor.row&&H.virtualFocusRow<H.focus.row',
    0,
    1,
  ],
  ['viewport eraser export', 'eraseViewportInPlace', 0, 1],
  [
    'viewport eraser implementation',
    'function Oa8(H){return x2+(RRH+Lr8(1)).repeat(H)+x2}',
    0,
    1,
  ],
  [
    'main versus alternate-screen clear dispatch',
    'case"clearTerminal":_+=A.altScreen?Kg$():Oa8(A.viewportRows);break',
    0,
    1,
  ],
  ['viewport row plumbing', 'viewportRows', 0, 2],
]

const SOURCE_WITNESSES = [
  ['src/ink/selection.ts', '  virtualAnchorCol?: number', 1],
  ['src/ink/selection.ts', '  virtualFocusCol?: number', 1],
  ['src/ink/selection.ts', '    s.scrolledOffAbove = s.scrolledOffBelow', 1],
  [
    'src/ink/selection.ts',
    'export function isSelectionWhollyOffscreen(s: SelectionState): boolean {',
    1,
  ],
  ['src/ink/selection.ts', '      s.virtualAnchorCol ??= s.anchor.col', 2],
  [
    'src/ink/ink.tsx',
    "const side = delta > 0 ? 'above' : 'below';",
    1,
  ],
  [
    'src/ink/ink.tsx',
    '!isSelectionWhollyOffscreen(this.selection)',
    2,
  ],
  [
    'src/ink/clearTerminal.ts',
    'export function eraseViewportInPlace(viewportRows: number): string {',
    1,
  ],
  [
    'src/ink/clearTerminal.ts',
    '(ERASE_LINE + cursorDown(1)).repeat(viewportRows)',
    1,
  ],
  ['src/ink/frame.ts', '      viewportRows: number', 1],
  [
    'src/ink/terminal.ts',
    ': eraseViewportInPlace(patch.viewportRows)',
    1,
  ],
  ['src/ink/log-update.ts', '      viewportRows: frame.viewport.height,', 1],
]

test('2.1.120 selection and viewport witnesses bind authenticated bundles', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_120_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )

  for (const [name, fragment, baselineCount, targetCount] of BUNDLE_WITNESSES) {
    assert.equal(
      occurrences(baseline, fragment),
      baselineCount,
      `${name}: baseline count`,
    )
    assert.equal(
      occurrences(target, fragment),
      targetCount,
      `${name}: target count`,
    )
  }
})

test('2.1.120 selection and viewport witnesses bind recovered source', () => {
  for (const [sourcePath, fragment, expectedCount] of SOURCE_WITNESSES) {
    const source = fs.readFileSync(path.join(repo, sourcePath), 'utf8')
    assert.equal(
      occurrences(source, fragment),
      expectedCount,
      `${sourcePath}: ${fragment}`,
    )
  }
})
