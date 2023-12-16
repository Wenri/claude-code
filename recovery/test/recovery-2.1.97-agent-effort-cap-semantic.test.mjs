import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target97 pins the effort cap, description, and agent caller units', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const expected = new Map([
    [
      6281,
      [
        4424925,
        4425056,
        'dde39ef3ce039c3b947cb947c3f09678999e5038661c81036570821b5376fe3e',
        ['tengu_pyrite_wren', 'RV.indexOf(_)>RV.indexOf(K)?K:q'],
      ],
    ],
    [
      6283,
      [
        4425131,
        4425465,
        '8546f08fbb02464f2d43304509d30c9aebd9e1293a8f078bf90d3a991341473a',
        ['case"max":return"Maximum capability with deepest reasoning"'],
      ],
    ],
    [
      11589,
      [
        8902301,
        8907816,
        '338d24496791f121db4a4457edcaa4ce6a1ae45e171a56a26c27e71128afb9e9',
        ['q.effort!==void 0?q.effort:W?D6.effortValue:Uz4(D6.effortValue,"medium")'],
      ],
    ],
  ])
  for (const [index, [start, end, sourceHash, fragments]] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
    )
    const owner = bytes.toString('utf8').slice(start, end)
    assert.equal(sha256(owner), sourceHash)
    for (const fragment of fragments) {
      assert.ok(owner.includes(fragment), `${index}: ${fragment}`)
    }
  }
})

test('source recovers target97 cap semantics or the verified latest retirement', sourceOptions, () => {
  const effort = fs.readFileSync(path.join(sourceRoot, 'utils/effort.ts'), 'utf8')
  const runner = fs.readFileSync(
    path.join(sourceRoot, 'tools/AgentTool/runAgent.ts'),
    'utf8',
  )
  assert.ok(effort.includes("return 'Maximum capability with deepest reasoning'"))
  if (effort.includes('tengu_pyrite_wren')) {
    for (const fragment of [
      'export function clampEffortValue(',
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_pyrite_wren', false)",
      'EFFORT_LEVELS.indexOf(normalized) > EFFORT_LEVELS.indexOf(maximum)',
      "import { clampEffortValue } from '../../utils/effort.js'",
      ": clampEffortValue(state.effortValue, 'medium')",
    ]) {
      assert.ok(
        effort.includes(fragment) || runner.includes(fragment),
        fragment,
      )
    }
    assert.ok(runner.includes(': useExactTools'))
  } else {
    assert.equal(runner.includes('clampEffortValue'), false)
    assert.equal(
      effort.includes('Maximum capability with deepest reasoning (Opus 4.6 only)'),
      false,
    )
  }
})

test('2.1.96 predates the capped-agent rollout and still has the old label', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('tengu_pyrite_wren'), false)
  assert.ok(bundle.includes('Maximum capability with deepest reasoning (Opus 4.6 only)'))
})
