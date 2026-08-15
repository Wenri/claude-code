import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.108-to-2.1.109'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_108_BUNDLE and CLAUDE_CODE_2_1_109_BUNDLE are required'
      : false,
}
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

const milestones = [
  [1000, 'Hmm…'],
  [6000, 'This one needs a moment…'],
  [12000, 'Working through it…'],
  [20000, 'Untangling some thoughts…'],
  [28000, 'Weighing a few approaches…'],
  [36000, 'Consulting the rubber duck…'],
  [48000, 'Cross-referencing seventeen theories…'],
  [60000, 'Double-checking the double-checks…'],
  [80000, 'Almost there…'],
  [108000, 'Pacing in small circles…'],
  [120000, 'Reticulating splines…'],
  [135000, 'Hmm…?'],
  [150000, 'Staring thoughtfully into the middle distance…'],
  [165000, 'Still here, still at it…'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

const pinnedUnits = new Map([
  [
    15170,
    [
      10975449,
      10976066,
      '3b9e9e5b11c0e795b54adaa822113f56bacedd3e9d9bdcc28e814c4d8a9ec2c8',
      'unresolved',
    ],
  ],
  [
    15172,
    [
      10976077,
      10976804,
      '910c280a4e0a7c42815eb5aaf988ca7d0aeac0729db414b5399e024c85ed8dd4',
      'unresolved',
    ],
  ],
])

test('2.1.109 pins the thinking-indicator controller and complete milestone table', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  assert.equal(
    sha256(targetBytes),
    '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const [index, [start, end, sourceHash, classification]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  assert.equal(baseline.includes('Consulting the rubber duck…'), false)
  const controller = target.slice(10975449, 10976066)
  for (const fragment of [
    'useState(-1)',
    'useRef(_)',
    'setTimeout(z,O.afterMs,w)',
    'clearTimeout(O)',
    'shouldAnimate:!0,isUnresolved:!0,isError:!1',
    '"Thinking"',
  ]) {
    assert.ok(controller.includes(fragment), fragment)
  }
  const table = target.slice(10976077, 10976804)
  for (const [afterMs, text] of milestones) {
    assert.ok(table.includes(`afterMs:${afterMs},text:${JSON.stringify(text)}`), text)
  }
})

test('target 2.1.109 source owns the equivalent mounted-thinking indicator', sourceOptions, () => {
  const messages = source('src/components/Messages.tsx')

  // The indicator is a historical 2.1.109–2.1.114 behavior. Target 2.1.116
  // removes both the component and its Messages mount, so the cumulative
  // current-source evidence pass must prove that later removal rather than
  // requiring the obsolete owner to remain reachable.
  if (!semanticCase) {
    assert.equal(
      fs.existsSync(path.join(sourceRoot, 'components/ThinkingIndicator.tsx')),
      false,
    )
    assert.equal(messages.includes('ThinkingIndicator'), false)
    assert.equal(messages.includes('showThinkingHint'), false)
    return
  }

  const indicator = source('src/components/ThinkingIndicator.tsx')

  for (const [afterMs, text] of milestones) {
    assert.ok(indicator.includes(`afterMs: ${afterMs}`), String(afterMs))
    assert.ok(indicator.includes(`text: '${text}'`), text)
  }
  for (const fragment of [
    'const [hintIndex, setHintIndex] = useState(-1)',
    'const hintIndexRef = useRef(hintIndex)',
    'setTimeout(setHintIndex, hint.afterMs, index)',
    'for (const timer of timers) clearTimeout(timer)',
    'if (hintIndex < 0 || !isLoading) return null',
    '<ToolUseLoader shouldAnimate={true} isUnresolved={true} isError={false} />',
    '<Text>Thinking</Text>',
  ]) {
    assert.ok(indicator.includes(fragment), fragment)
  }
  assert.ok(
    messages.includes(
      '{showThinkingHint && <ThinkingIndicator isLoading={isLoading} />}',
    ),
  )
})
