import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const targetUnits = new Map([
  [
    15101,
    [
      10944222,
      10944741,
      '6601ce2a596cdfa02fc60413cd164215ced12157fafb2e3bc3ad3b9b2745674d',
    ],
  ],
  [
    15102,
    [
      10944741,
      10945329,
      '5114b6b753239a04f2f6ebdf224a6823c2964216911cb4422968ef72df8b62dd',
    ],
  ],
  [
    15103,
    [
      10945329,
      10945394,
      '0933dd85fdadd87c0dc106492ef260ca3269d1d2ffe054dab5d14af13fae16e1',
    ],
  ],
  [
    15104,
    [
      10945394,
      10945858,
      '769e6fdee6a51a896879a6c19c17186b5b0bca61eb30970926970c035c8f8906',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

test('target108 pins every AnimatedClawd structural unit', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('target108 introduces named and autoplay animation control', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('celebrate'), false)
  assert.equal(target.includes('celebrate'), true)
  assert.equal(baseline.includes('...bS("default",0,12)'), false)
  assert.equal(target.includes('...bS("default",0,12)'), true)
  assert.ok(target.includes('q&&!K?0:-1'))
  assert.ok(target.includes('K?H.at(-1):'))
})

test('source owns autoplay, named sequences, completion, and reduced motion', sourceOptions, () => {
  const contents = source('src/components/LogoV2/AnimatedClawd.tsx')
  for (const fragment of [
    "const AUTOPLAY: readonly Frame[] = [...hold('default', 0, 12)",
    "const CELEBRATE: readonly Frame[] = [...JUMP_WAVE, ...hold('default', 1, 3)]",
    'jump: JUMP_WAVE',
    'look: LOOK_AROUND',
    'celebrate: CELEBRATE',
    'autoplay?: boolean',
    'sequence?: keyof typeof ANIMATION_SEQUENCES',
    'onComplete?: () => void',
    'const shouldAutoStart = (autoplay || sequence !== undefined) && !reducedMotion',
    'sequence ? ANIMATION_SEQUENCES[sequence] : autoplay ? AUTOPLAY : JUMP_WAVE',
    'if (reducedMotion) onCompleteRef.current?.()',
    'if (autoplay || sequence || reducedMotion || frameIndex !== -1) return',
    'onCompleteRef.current?.()',
    'setFrameIndex(autoplay && !sequence ? 0 : -1)',
    'const fallback = sequence ? seq.at(-1)! : IDLE',
  ]) {
    assert.ok(contents.includes(fragment), fragment)
  }
  assert.ok(
    contents.indexOf('onCompleteRef.current?.()') <
      contents.indexOf('setFrameIndex(autoplay && !sequence ? 0 : -1)'),
    'completion must fire before looping or stopping',
  )
})
