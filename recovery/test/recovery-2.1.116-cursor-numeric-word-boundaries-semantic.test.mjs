import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnits = [
  {
    index: 7598,
    nodeType: 'ClassDeclaration',
    start: 3661478,
    end: 3665381,
    sourceHash:
      '231ba3f78dd2ff1d61f4199ade03454f9cf67e93518bc813d00487cf713654b9',
  },
  {
    index: 7599,
    nodeType: 'VariableDeclaration',
    start: 3665381,
    end: 3665471,
    sourceHash:
      '0a2f63a00d206aacaaa42170ced2a79e57c20957e0eb4d319b84343a4f9febcc',
  },
  {
    index: 7600,
    nodeType: 'VariableDeclaration',
    start: 3665471,
    end: 3665541,
    sourceHash:
      '6860244f823a068d207c9c8a629167438634ea2db3a3187ec36948279ffa3611',
  },
]

const targetUnits = [
  {
    index: 7666,
    nodeType: 'ClassDeclaration',
    start: 3685400,
    end: 3689330,
    sourceHash:
      'f0fda7beb62291cc702f7abc3368e502bafbe1d5ed2e98e2bbe6741b5441f67c',
  },
  {
    index: 7667,
    nodeType: 'VariableDeclaration',
    start: 3689330,
    end: 3689424,
    sourceHash:
      'c93113ed9dcbe62647d6428dae608ce4026e66e544ca2e183f074d9621303077',
  },
  {
    index: 7668,
    nodeType: 'VariableDeclaration',
    start: 3689424,
    end: 3689507,
    sourceHash:
      '0d853e509e6a18e268073726af42acbb6e0b19d62862da69bee4d0b85e5cd29a',
  },
]

const typedRow = {
  row: 281,
  residueOrdinal: 106,
  value: '/\\p{N}/u',
  start: 3689496,
  end: 3689504,
  structuralIndex: 7668,
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
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

function extractMethod(classSource, methodName) {
  const start = classSource.indexOf(`${methodName}(){`)
  assert.notEqual(start, -1, `${methodName} must be present`)
  const bodyStart = classSource.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < classSource.length; index += 1) {
    const character = classSource[index]
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return classSource.slice(start, index + 1)
    }
  }
  throw new Error(`unterminated ${methodName}`)
}

function executeWordBoundaryMethod(classSource, segments) {
  const method = extractMethod(classSource, 'getWordBoundaries')
  const accessorMatch = method.match(
    /of ([A-Za-z_$][\w$]*)\(\)\.segment\(this\.text\)/,
  )
  assert.ok(accessorMatch, 'word segmenter accessor must be recoverable')

  const parameterNames = [accessorMatch[1]]
  const parameterValues = [
    () => ({
      segment: () => segments,
    }),
  ]
  const numberRegexMatch = method.match(
    /\|\|([A-Za-z_$][\w$]*)\.test\([A-Za-z_$][\w$]*\.segment\)/,
  )
  if (numberRegexMatch) {
    parameterNames.push(numberRegexMatch[1])
    parameterValues.push(/\p{N}/u)
  }

  const owner = new Function(
    ...parameterNames,
    `return ({${method}})`,
  )(...parameterValues)
  owner.text = 'alpha ² ¼ ① !'
  return owner.getWordBoundaries()
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function instantiateSourceHarness(segments) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source('src/utils/Cursor.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const state = { segmentCalls: 0 }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier.endsWith('/ink/stringWidth.js')) {
      return { stringWidth: value => [...value].length }
    }
    if (specifier.endsWith('/ink/wrapAnsi.js')) {
      return { wrapAnsi: value => value }
    }
    if (specifier.endsWith('/intl.js')) {
      return {
        firstGrapheme: value => [...value][0] ?? '',
        getGraphemeSegmenter: () => new Intl.Segmenter(undefined, {
          granularity: 'grapheme',
        }),
        getWordSegmenter: () => ({
          segment(value) {
            state.segmentCalls += 1
            assert.equal(value, 'alpha ² ¼ ① !')
            return segments
          },
        }),
      }
    }
    throw new Error(`unexpected Cursor import: ${specifier}`)
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return { ...module.exports, state }
}

function wordSegments() {
  return [
    { index: 0, segment: 'alpha', isWordLike: true },
    { index: 5, segment: ' ', isWordLike: false },
    { index: 6, segment: '²', isWordLike: false },
    { index: 7, segment: ' ', isWordLike: false },
    { index: 8, segment: '¼', isWordLike: undefined },
    { index: 9, segment: ' ', isWordLike: false },
    { index: 10, segment: '①', isWordLike: false },
    { index: 11, segment: ' ', isWordLike: false },
    { index: 12, segment: '!', isWordLike: false },
  ]
}

function classifications(boundaries) {
  return boundaries.map(boundary => boundary.isWordLike)
}

test('target 2.1.116 authenticates the numeric Intl word-boundary fallback', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  for (const unit of baselineUnits) {
    const structuralUnit = structural.unmatchedBaseline.find(
      candidate => candidate.index === unit.index,
    )
    assert.ok(structuralUnit, `baseline unit ${unit.index}`)
    assert.deepEqual(
      [
        structuralUnit.nodeType,
        structuralUnit.start,
        structuralUnit.end,
        structuralUnit.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(
      sha256(baseline.slice(unit.start, unit.end)),
      unit.sourceHash,
      `baseline unit ${unit.index}: bytes`,
    )
  }

  for (const unit of targetUnits) {
    const region = structural.regions.find(
      candidate => candidate.target.index === unit.index,
    )
    assert.ok(region, `target unit ${unit.index}`)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(
      sha256(target.slice(unit.start, unit.end)),
      unit.sourceHash,
      `target unit ${unit.index}: bytes`,
    )
  }

  assert.equal(target.slice(typedRow.start, typedRow.end), typedRow.value)
  assert.equal(
    baseline.includes(typedRow.value),
    false,
    `typed row ${typedRow.row} / residue ${typedRow.residueOrdinal}: baseline`,
  )
  assert.equal(
    target.slice(targetUnits[2].start, targetUnits[2].end).includes(
      typedRow.value,
    ),
    true,
    `typed row ${typedRow.row}: target structural unit ${typedRow.structuralIndex}`,
  )

  const baselineBoundaries = executeWordBoundaryMethod(
    baseline.slice(baselineUnits[0].start, baselineUnits[0].end),
    wordSegments(),
  )
  const targetBoundaries = executeWordBoundaryMethod(
    target.slice(targetUnits[0].start, targetUnits[0].end),
    wordSegments(),
  )
  assert.deepEqual(classifications(baselineBoundaries), [
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ])
  assert.deepEqual(classifications(targetBoundaries), [
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    false,
  ])
})

test(
  'source treats Unicode numeric segments as words and caches the result',
  sourceOptions,
  async () => {
    const { Cursor, MeasuredText, state } = await instantiateSourceHarness(
      wordSegments(),
    )
    const measured = new MeasuredText('alpha ² ¼ ① !', 80)
    const boundaries = measured.getWordBoundaries()
    assert.deepEqual(classifications(boundaries), [
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      false,
    ])
    assert.equal(measured.getWordBoundaries(), boundaries)
    assert.equal(state.segmentCalls, 1)

    assert.equal(new Cursor(measured, 0).nextWord().offset, 6)
    assert.equal(new Cursor(measured, 6).nextWord().offset, 8)
    assert.equal(new Cursor(measured, 8).nextWord().offset, 10)
    assert.equal(
      new Cursor(measured, 10).nextWord().offset,
      measured.text.length,
    )
    assert.equal(new Cursor(measured, 11).prevWord().offset, 10)
  },
)
