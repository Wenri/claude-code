import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

function structural(caseDirectory) {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          repositoryRoot,
          'recovery/cases',
          caseDirectory,
          'structural/generated-delta.json.gz',
        ),
      ),
    ),
  )
}

const target110Structural = structural(caseName)
const target116Structural = structural('2.1.114-to-2.1.116')

const target110Units = new Map([
  [
    15206,
    [
      'unresolved',
      10987944,
      10988390,
      'FunctionDeclaration',
      'd542de3f3a25fdf15a283046c6224c6c82a02173f21b51ff1357ede6accf96be',
    ],
  ],
  [
    15213,
    [
      'unresolved',
      10988969,
      10989376,
      'FunctionDeclaration',
      'b2efcebb64c303eb728723cb33832a22fdebe0318c436b33da097ebd1cc62902',
    ],
  ],
])

const target116Units = new Map([
  [
    16413,
    [
      'matched',
      10351826,
      10352276,
      'FunctionDeclaration',
      'bc8552d905a424d7756f4d84f7c31109059e9dd1422a8197be705f0deeb467ef',
    ],
  ],
  [
    16420,
    [
      'matched',
      10352855,
      10353269,
      'FunctionDeclaration',
      '6e5f878e86635ef20f0e455348f2d4fc0f379595771ba295f46eb49e54a2f9d0',
    ],
  ],
])

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function authenticatedUnits(contents, ledger, units, label) {
  const slices = new Map()
  for (const [index, [classification, start, end, nodeType, hash]] of units) {
    const region = ledger.regions[index]
    assert.equal(region.classification, classification, `${label} ${index}: class`)
    assert.deepEqual(
      [
        region.target.index,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.parseStatus,
        region.target.sourceHash,
      ],
      [index, start, end, nodeType, 'parsed', hash],
      `${label} ${index}: identity`,
    )
    const unit = contents.slice(start, end)
    assert.equal(sha256(unit), hash, `${label} ${index}: bytes`)
    slices.set(index, unit)
  }
  return slices
}

function assertAnimatedUpsell(helper, upsell, label) {
  const helperName = /^function ([\w$]+)\(/.exec(helper)?.[1]
  assert.ok(helperName, `${label}: named AnimatedAsterisk helper`)
  assert.match(helper, /\.prefersReducedMotion\?\?!1/)
  assert.match(helper, /\?null:50/)
  assert.match(helper, /setTimeout\([^,]+,[^,]+,!0\)/)
  assert.match(helper, /\/[^/]+\*360%360/)

  const escapedHelper = helperName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(
    upsell,
    new RegExp(`createElement\\(${escapedHelper},null\\)`),
    `${label}: FullscreenUpsell reaches AnimatedAsterisk`,
  )
  assert.match(upsell, /flexDirection:"row"/)
  assert.ok(upsell.includes('" Try flicker-free rendering"'))
  assert.match(upsell, /" (?:·|\\xB7) \/tui fullscreen"/)
}

test(
  'authenticated target110 introduces the animated fullscreen asterisk and target116 retains it',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.109, 2.1.110, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    assert.equal(baseline.includes('Try flicker-free rendering'), false)
    assert.equal(baseline.includes('tengu_ochre_hollow'), false)
    assert.equal(
      baseline.includes('CLAUDE_CODE_FORCE_FULLSCREEN_UPSELL'),
      false,
    )

    const targetSlices = authenticatedUnits(
      target,
      target110Structural,
      target110Units,
      'target110',
    )
    const latestSlices = authenticatedUnits(
      latest,
      target116Structural,
      target116Units,
      'target116',
    )
    assertAnimatedUpsell(
      targetSlices.get(15206),
      targetSlices.get(15213),
      'target110',
    )
    assertAnimatedUpsell(
      latestSlices.get(16413),
      latestSlices.get(16420),
      'target116',
    )
  },
)

test(
  'source root makes AnimatedAsterisk reachable from FullscreenUpsell with target spacing',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const upsell = source('components/LogoV2/FullscreenUpsell.tsx')
    const asterisk = source('components/LogoV2/AnimatedAsterisk.tsx')

    assert.ok(
      upsell.includes(
        "import { AnimatedAsterisk } from './AnimatedAsterisk.js'",
      ),
    )
    assert.ok(upsell.includes('<AnimatedAsterisk />'))
    assert.equal(upsell.includes('<Text color="claude">✻ </Text>'), false)
    assert.ok(
      upsell.includes(
        '<Text color="autoAccept"> Try flicker-free rendering</Text>',
      ),
    )

    for (const fragment of [
      'const SWEEP_DURATION_MS = 1500',
      'const SWEEP_COUNT = 2',
      'char = TEARDROP_ASTERISK',
      'getInitialSettings().prefersReducedMotion ?? false',
      'useAnimationFrame(done ? null : 50)',
      'setTimeout(setDone, TOTAL_ANIMATION_MS, true)',
      'toRGBColor(hueToRgb(hue))',
    ]) {
      assert.ok(asterisk.includes(fragment), fragment)
    }
  },
)
