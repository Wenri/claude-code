import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const baselineSha256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const targetSha256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'

const baselineUnits = [
  {
    index: 18088,
    nodeType: 'FunctionDeclaration',
    start: 12381136,
    end: 12382664,
    sourceHash:
      '0f7bd3465e29f576abf87a63332ec0d27cbc6f6ef2d5acf0c52fe81147b3e14e',
  },
  {
    index: 18089,
    nodeType: 'FunctionDeclaration',
    start: 12382664,
    end: 12387146,
    sourceHash:
      '58a882b95215ac1b711e1db6ee9f4fd8516253ff8f5db764ee12b9a5c4e14604',
  },
  {
    index: 18094,
    nodeType: 'FunctionDeclaration',
    start: 12388058,
    end: 12390066,
    sourceHash:
      'dfa6b9ff0d9a74c53f72eab7616282a7d3b7f9691ee0ca36672d7a0d59561d28',
  },
]

const targetUnits = [
  {
    index: 19031,
    nodeType: 'FunctionDeclaration',
    start: 11695871,
    end: 11697457,
    sourceHash:
      'c99851aa89320b08b2855c063770717096bb4ce9129e009ac0bfa9b839f5d90d',
  },
  {
    index: 19032,
    nodeType: 'FunctionDeclaration',
    start: 11697457,
    end: 11702025,
    sourceHash:
      '39ac0f25d214952ac7ebea69098aae51c34dd9132b5ce9e4ac44ec5b8a442d12',
  },
  {
    index: 19037,
    nodeType: 'FunctionDeclaration',
    start: 11702963,
    end: 11704986,
    sourceHash:
      '804ff0086f36a410512e2c2fba05c813e0c0ec0733d71d1652e9a694025a4ec1',
  },
]

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

const sourceTest = selected ? test : test.skip
const pairTest =
  selected && baselineBundlePath && targetBundlePath ? test : test.skip

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function occurrences(input, fragment) {
  return input.split(fragment).length - 1
}

function assertUnitIdentity(region, expected, label) {
  assert.ok(region, `${label}: structural region`)
  assert.deepEqual(
    [
      region.nodeType,
      region.start,
      region.end,
      region.sourceHash,
    ],
    [
      expected.nodeType,
      expected.start,
      expected.end,
      expected.sourceHash,
    ],
    `${label}: structural identity`,
  )
}

function evaluateHistoricalDetachGate(modeIndicator, isBackground, isInputEmpty) {
  const start = modeIndicator.indexOf('if(zp()&&K)zH.push(')
  assert.notEqual(start, -1, 'target113 detach gate start')
  const end = modeIndicator.indexOf(';', start)
  assert.notEqual(end, -1, 'target113 detach gate end')
  const statement = modeIndicator.slice(start, end + 1)
  const children = []
  const react = {
    createElement(type, props, ...elementChildren) {
      return { type, props, children: elementChildren }
    },
  }
  const result = new Function(
    'zp',
    'K',
    'zH',
    'Gq',
    'T',
    'Oj$',
    `${statement}return zH`,
  )(
    () => isBackground,
    isInputEmpty,
    children,
    react,
    'Text',
    '\u2190',
  )
  return result
}

pairTest(
  'target 2.1.113 authenticates the background-session footer graph',
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(baselineBytes.length, 13_711_684)
    assert.equal(targetBytes.length, 12_986_752)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const unit of baselineUnits) {
      const region = structural.unmatchedBaseline.find(
        candidate => candidate.index === unit.index,
      )
      assertUnitIdentity(region, unit, `baseline unit ${unit.index}`)
      assert.equal(
        sha256(baseline.slice(unit.start, unit.end)),
        unit.sourceHash,
        `baseline unit ${unit.index}: bytes`,
      )
    }

    for (const unit of targetUnits) {
      const region = structural.regions.find(
        candidate => candidate.target?.index === unit.index,
      )
      assert.ok(region, `target unit ${unit.index}: structural region`)
      assert.equal(region.classification, 'unresolved')
      assertUnitIdentity(region.target, unit, `target unit ${unit.index}`)
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
        `target unit ${unit.index}: bytes`,
      )
    }

    const baselineLeftSide = baseline.slice(
      baselineUnits[0].start,
      baselineUnits[0].end,
    )
    const baselineModeIndicator = baseline.slice(
      baselineUnits[1].start,
      baselineUnits[1].end,
    )
    const baselineFooter = baseline.slice(
      baselineUnits[2].start,
      baselineUnits[2].end,
    )
    const targetLeftSide = target.slice(
      targetUnits[0].start,
      targetUnits[0].end,
    )
    const targetModeIndicator = target.slice(
      targetUnits[1].start,
      targetUnits[1].end,
    )
    const targetFooter = target.slice(
      targetUnits[2].start,
      targetUnits[2].end,
    )

    for (const owner of [
      baselineLeftSide,
      baselineModeIndicator,
      baselineFooter,
    ]) {
      assert.equal(owner.includes('isInputEmpty'), false)
      assert.equal(owner.includes('bg-detach'), false)
    }
    assert.equal(baseline.includes('bg-detach'), false)
    assert.equal(occurrences(target, 'bg-detach'), 1)

    assert.ok(
      targetLeftSide.includes(
        'suppressHint:A,isInputEmpty:z,isLoading:Y',
      ),
    )
    assert.ok(
      targetLeftSide.includes('showHint:y,isInputEmpty:z,isLoading:Y'),
    )
    assert.ok(
      targetModeIndicator.startsWith(
        'function Sg1({mode:H,toolPermissionContext:$,showHint:q,isInputEmpty:K,isLoading:_',
      ),
    )
    assert.ok(
      targetFooter.includes('suppressHint:DH,isInputEmpty:!j,isLoading:J'),
    )
    assert.ok(
      targetModeIndicator.includes(
        'if(zp()&&K)zH.push(Gq.createElement(T,{dimColor:!0,key:"bg-detach"},Oj$," for agents"))',
      ),
    )
    assert.ok(target.includes('Oj$="\\u2190"'))

    for (const isBackground of [false, true]) {
      for (const isInputEmpty of [false, true]) {
        const rendered = evaluateHistoricalDetachGate(
          targetModeIndicator,
          isBackground,
          isInputEmpty,
        )
        const shouldRender = isBackground && isInputEmpty
        assert.equal(rendered.length, shouldRender ? 1 : 0)
        if (shouldRender) {
          assert.equal(rendered[0].props.key, 'bg-detach')
          assert.equal(rendered[0].children.join(''), '\u2190 for agents')
        }
      }
    }
  },
)

sourceTest(
  'source keeps the inherited empty-input background hint at its exact owners',
  () => {
    const footer = source('src/components/PromptInput/PromptInputFooter.tsx')
    const leftSide = source(
      'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
    )

    assert.equal(occurrences(footer, 'isInputEmpty={!suppressHintFromProps}'), 1)
    assert.equal(footer.includes('isBgSession'), false)
    assert.equal(
      occurrences(
        leftSide,
        "import { isBgSession } from '../../utils/concurrentSessions.js';",
      ),
      1,
    )
    assert.match(
      leftSide,
      /<ModeIndicator[^>]*\bisInputEmpty=\{isInputEmpty\}[^>]*\/>/,
    )

    const detachGate = leftSide.match(
      /if \(isBgSession\(\) && isInputEmpty\) \{\s*parts\.push\(<Text dimColor(?:=\{true\})? key="bg-detach">\s*\{figures\.arrowLeft\} for agents\s*<\/Text>\);\s*\}/,
    )
    assert.ok(detachGate, 'source background-session empty-input gate')
    assert.equal(occurrences(leftSide, 'key="bg-detach"'), 1)
    assert.equal(occurrences(leftSide, 'for agents'), 1)

    if (historical) {
      assert.ok(leftSide.includes('const $ = _c(28);'))
      assert.ok(leftSide.includes('$[27] !== isInputEmpty'))
      assert.ok(leftSide.includes('$[27] = isInputEmpty;'))
      assert.equal(leftSide.includes('leftArrowPending'), false)
      assert.equal(leftSide.includes('showExpandPasteHint'), false)
      assert.equal(footer.includes('leftArrowPending'), false)
    } else {
      assert.ok(leftSide.includes('leftArrowPending'))
      assert.ok(leftSide.includes('showExpandPasteHint'))
      assert.ok(footer.includes('leftArrowPending'))
    }
  },
)
