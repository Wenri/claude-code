import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASELINE_BYTES = 13_114_118
export const BASELINE_SHA256 =
  '518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661'
export const TARGET_BYTES = 13_234_618
export const TARGET_SHA256 =
  '84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa'

export const repo = fileURLToPath(new URL('../..', import.meta.url))
export const overlayPath =
  process.env.CLAUDE_CODE_2_1_118_OVERLAY ??
  path.join(
    repo,
    'recovery/cases/2.1.117-to-2.1.118/recovered/source-facing-overlay.patch',
  )

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(sha256(bytes), expectedSha256, `${environmentName}: SHA-256`)
  return bytes.toString('utf8')
}

export function loadBundles() {
  return {
    baseline: loadBundle(
      'CLAUDE_CODE_2_1_117_BUNDLE',
      BASELINE_BYTES,
      BASELINE_SHA256,
    ),
    target: loadBundle(
      'CLAUDE_CODE_2_1_118_BUNDLE',
      TARGET_BYTES,
      TARGET_SHA256,
    ),
  }
}

export function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

export function assertAuthenticatedFragments(fragments) {
  const { baseline, target } = loadBundles()
  for (const entry of fragments) {
    const [name, fragment, baselineCount, targetCount, fragmentSha256] = entry
    assert.equal(sha256(fragment), fragmentSha256, `${name}: fragment SHA-256`)
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
}

export function readOverlay() {
  return fs.readFileSync(overlayPath, 'utf8')
}

export function overlaySection(sourcePath) {
  const overlay = readOverlay()
  const marker = `diff --git a/${sourcePath} b/${sourcePath}`
  const start = overlay.indexOf(marker)
  assert.notEqual(start, -1, `missing overlay path ${sourcePath}`)
  const next = overlay.indexOf('\ndiff --git ', start + marker.length)
  return overlay.slice(start, next === -1 ? undefined : next)
}

export function targetSide(sourcePath) {
  return overlaySection(sourcePath)
    .split('\n')
    .filter(
      line =>
        (line.startsWith('+') && !line.startsWith('+++')) ||
        line.startsWith(' '),
    )
    .map(line => line.slice(1))
    .join('\n')
}

export function baselineSide(sourcePath) {
  return overlaySection(sourcePath)
    .split('\n')
    .filter(
      line =>
        (line.startsWith('-') && !line.startsWith('---')) ||
        line.startsWith(' '),
    )
    .map(line => line.slice(1))
    .join('\n')
}

export function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

export function assertSourceFragments(sourcePath, fragments) {
  const contents = compact(targetSide(sourcePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${sourcePath}: ${fragment}`,
    )
  }
}

export function assertRetainedSourceFragments(sourcePath, fragments) {
  const overlay = readOverlay()
  const marker = `diff --git a/${sourcePath} b/${sourcePath}`
  assert.equal(
    overlay.includes(marker),
    false,
    `${sourcePath}: retained source unexpectedly changed in overlay`,
  )
  const contents = compact(
    fs.readFileSync(path.join(repo, sourcePath), 'utf8'),
  )
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${sourcePath}: ${fragment}`,
    )
  }
}

export function assertTargetRemoval(sourcePath, fragment) {
  assert.equal(
    compact(targetSide(sourcePath)).includes(compact(fragment)),
    false,
    `${sourcePath}: target unexpectedly contains ${fragment}`,
  )
}

export function assertSourceRemoval(sourcePath, fragment) {
  assert.equal(
    compact(baselineSide(sourcePath)).includes(compact(fragment)),
    true,
    `${sourcePath}: baseline does not contain removed fragment ${fragment}`,
  )
  assertTargetRemoval(sourcePath, fragment)
}
