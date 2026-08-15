import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const selected =
  !process.env.CLAUDE_CODE_SEMANTIC_CASE ||
  process.env.CLAUDE_CODE_SEMANTIC_CASE === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const middleStructural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.104-to-2.1.105/structural/generated-delta.json.gz',
      ),
    ),
  ),
)
const lateStructural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.114-to-2.1.116/structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const baselineUnit = {
  index: 13774,
  start: 10210293,
  end: 10210681,
  sourceHash:
    'a526a3fdb963dc328669f6acc188cb0e8d78e06daa8efe21e1e499a3299d5e5b',
}
const targetUnit = {
  index: 13900,
  start: 10261189,
  end: 10261576,
  sourceHash:
    '89ea6988f8711663098381969176447cc5546f6a8599952c54dc80d1dfc8f914',
}
const latestUnit = {
  index: 15351,
  start: 9496446,
  end: 9496837,
  sourceHash:
    'ab310daef81b00f36ff3d678a8a4c8bbbc79ebc4dbd6026190b24f4eec18e413',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(source, fragment) {
  return source.split(fragment).length - 1
}

function pinUnit(structural, unit, classification) {
  const region = structural.regions.find(
    candidate => candidate.target?.index === unit.index,
  )
  assert.ok(region, `missing target unit ${unit.index}`)
  assert.equal(region.classification, classification)
  assert.deepEqual(
    [
      region.target.index,
      region.target.start,
      region.target.end,
      region.target.nodeType,
      region.target.sourceHash,
    ],
    [
      unit.index,
      unit.start,
      unit.end,
      'FunctionDeclaration',
      unit.sourceHash,
    ],
  )
  return region
}

test(
  'authenticated target105 sentence-cases the diagnostics heading and target116 retains it',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath)
    const target = fs.readFileSync(targetPath)
    const latest = fs.readFileSync(latestPath)
    assert.deepEqual(
      [baseline.length, sha256(baseline)],
      [
        13567412,
        'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
      ],
    )
    assert.deepEqual(
      [target.length, sha256(target)],
      [
        13676915,
        '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
      ],
    )
    assert.deepEqual(
      [latest.length, sha256(latest)],
      [
        13102272,
        'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
      ],
    )

    const baselineRegion = middleStructural.unmatchedBaseline.find(
      candidate => candidate.index === baselineUnit.index,
    )
    assert.deepEqual(
      [
        baselineRegion?.start,
        baselineRegion?.end,
        baselineRegion?.nodeType,
        baselineRegion?.sourceHash,
      ],
      [
        baselineUnit.start,
        baselineUnit.end,
        'FunctionDeclaration',
        baselineUnit.sourceHash,
      ],
    )
    pinUnit(middleStructural, targetUnit, 'unresolved')
    const lateRegion = pinUnit(lateStructural, latestUnit, 'matched')
    assert.equal(lateRegion.baselineUnitIndex, 15209)

    for (const [bundle, unit] of [
      [baseline, baselineUnit],
      [target, targetUnit],
      [latest, latestUnit],
    ]) {
      assert.equal(
        sha256(bundle.toString('utf8').slice(unit.start, unit.end)),
        unit.sourceHash,
      )
    }

    const baselineOwner = baseline
      .toString('utf8')
      .slice(baselineUnit.start, baselineUnit.end)
    const targetOwner = target
      .toString('utf8')
      .slice(targetUnit.start, targetUnit.end)
    const latestOwner = latest
      .toString('utf8')
      .slice(latestUnit.start, latestUnit.end)
    assert.equal(occurrences(baselineOwner, 'System Diagnostics'), 1)
    assert.equal(occurrences(baselineOwner, 'System diagnostics'), 0)
    for (const owner of [targetOwner, latestOwner]) {
      assert.equal(occurrences(owner, 'System diagnostics'), 1)
      assert.equal(occurrences(owner, 'System Diagnostics'), 0)
      assert.match(owner, /length===0\)return null/)
      assert.match(owner, /paddingBottom:1/)
    }
  },
)

test(
  'source renders the persistent sentence-case diagnostics heading',
  { skip: selected ? false : `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'components/Settings/Status.tsx'),
      'utf8',
    )
    const start = owner.indexOf('function Diagnostics(')
    const end = owner.indexOf('\nfunction _temp5(', start)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const diagnostics = owner.slice(start, end)
    assert.equal(occurrences(diagnostics, '>System diagnostics</Text>'), 1)
    assert.equal(occurrences(diagnostics, '>System Diagnostics</Text>'), 0)
    assert.match(diagnostics, /diagnostics\.length === 0/)
    assert.match(diagnostics, /diagnostics\.map\(_temp5\)/)
    assert.match(diagnostics, /paddingBottom=\{1\}/)
  },
)
