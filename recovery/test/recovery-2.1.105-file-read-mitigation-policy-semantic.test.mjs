import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const isCurrentSource =
  sourceRoot === path.resolve(path.join(repositoryRoot, 'src'))
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
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

const baselineUnits = new Map([
  [
    12814,
    [
      9776710,
      9776758,
      23,
      'FunctionDeclaration',
      'e60053af3174f768d1d688b4745caa74d3ebc24c8f57d26ac8652b3530c28bb2',
    ],
  ],
  [
    12821,
    [
      9781796,
      9790628,
      2556,
      'VariableDeclaration',
      '69a7578b5dfdf1b094926bf0d8a42781c2ad8bb27d3ebaa8581676928e8a69fd',
    ],
  ],
])

const targetUnits = new Map([
  [
    12916,
    [
      9814851,
      9814923,
      33,
      'FunctionDeclaration',
      '7540b5539d30e0afe1909074922e943ce1a791adf42232cf764174f1aff94012',
    ],
  ],
  [
    12923,
    [
      9819959,
      9828825,
      2552,
      'VariableDeclaration',
      '01fdc809c573997f55489c3be3360f1420b1ccb3181529570e504e5bed58524d',
    ],
  ],
])

const behaviorMatrix = [
  ['claude-3-opus-20240229', true],
  ['claude-3-5-sonnet-20241022', true],
  ['claude-sonnet-4-20250514', true],
  ['claude-sonnet-4@20250514', true],
  ['us.anthropic.claude-sonnet-4-20250514-v1:0', true],
  ['claude-sonnet-4-5-20250929', true],
  ['claude-opus-4-20250514', true],
  ['claude-opus-4-1-20250805', true],
  ['claude-opus-4-5-20251101', true],
  ['claude-haiku-4-5-20251001', true],
  ['claude-sonnet-4-6', false],
  ['us.anthropic.claude-sonnet-4-6-v1:0', false],
  ['claude-opus-4-6', false],
  ['claude-opus-4-7', false],
  ['claude-haiku-4', false],
  ['unrecognized-model', false],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function exactExpression(contents, prefix, suffix) {
  const start = contents.indexOf(prefix)
  assert.notEqual(start, -1, `${prefix}: expression start`)
  const expressionStart = start + prefix.length
  const end = contents.indexOf(suffix, expressionStart)
  assert.notEqual(end, -1, `${prefix}: expression end`)
  return contents.slice(expressionStart, end).trim()
}

function functionSource(contents, name) {
  const marker = `function ${name}(`
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, `${name}: declaration`)
  const signatureEnd = contents.indexOf(')', start + marker.length)
  const bodyOffset = contents.slice(signatureEnd + 1).search(/\{\r?\n/)
  assert.notEqual(bodyOffset, -1, `${name}: body`)
  const body = signatureEnd + 1 + bodyOffset
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
}

function sourcePolicy(fileRead, modelSource) {
  const expression = exactExpression(
    fileRead,
    'const CYBER_RISK_MITIGATION_MODELS = ',
    '\n\nfunction shouldIncludeFileReadMitigation',
  )
  const models = new Function(`return (${expression})`)()

  if (Array.isArray(models)) {
    return model =>
      models.some(pattern => pattern.test(model.toLowerCase()))
  }

  assert.ok(models instanceof Set, 'current policy uses a canonical model Set')
  const canonicalSource = functionSource(
    modelSource,
    'firstPartyNameToCanonical',
  )
    .replace('name: ModelName', 'name')
    .replace('): ModelShortName', ')')
  const canonical = new Function(
    `${canonicalSource}\nreturn firstPartyNameToCanonical`,
  )()
  return model => models.has(canonical(model))
}

test(
  'authenticated target105 hardens the reachable FileRead reminder gate from canonical names to raw-model regexes',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, tokenCount, nodeType, hash]] of baselineUnits) {
      const unit = structural.unmatchedBaseline.find(row => row.index === index)
      assert.deepEqual(
        [unit?.start, unit?.end, unit?.tokenCount, unit?.nodeType, unit?.sourceHash],
        [start, end, tokenCount, nodeType, hash],
        `baseline unit ${index}`,
      )
      const bytes = baseline.slice(start, end)
      assert.equal(sha256(bytes), hash, `baseline unit ${index}: bytes`)
      assert.equal(
        parse(bytes, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
        1,
        `baseline unit ${index}: complete AST unit`,
      )
    }
    for (const [index, [start, end, tokenCount, nodeType, hash]] of targetUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `target unit ${index}`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.tokenCount,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, tokenCount, nodeType, hash],
        `target unit ${index}`,
      )
      const bytes = target.slice(start, end)
      assert.equal(sha256(bytes), hash, `target unit ${index}: bytes`)
      assert.equal(
        parse(bytes, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
        1,
        `target unit ${index}: complete AST unit`,
      )
    }

    const baselinePredicate = baseline.slice(9776710, 9776758)
    const targetPredicate = target.slice(9814851, 9814923)
    const baselineOwner = baseline.slice(9781796, 9790628)
    const targetOwner = target.slice(9819959, 9828825)
    assert.equal(
      baselinePredicate,
      'function mZY(){let q=v9(uK());return uZY.has(q)}',
    )
    assert.equal(
      targetPredicate,
      'function oTY(){let q=M5().toLowerCase();return rTY.some((K)=>K.test(q))}',
    )
    assert.ok(baselineOwner.includes('(mZY()?xZY:"")'))
    assert.ok(baselineOwner.includes('uZY=new Set(['))
    assert.ok(targetOwner.includes('(oTY()?iTY:"")'))
    assert.ok(targetOwner.includes('mapToolResultToToolResultBlockParam'))
    assert.ok(targetOwner.includes('case"text"'))

    const officialPatterns = new Function(
      `return (${exactExpression(targetOwner, 'rTY=', ';QLK=')})`,
    )()
    assert.equal(officialPatterns.length, 12)
    for (const [model, expected] of behaviorMatrix) {
      assert.equal(
        officialPatterns.some(pattern => pattern.test(model.toLowerCase())),
        expected,
        `official105 ${model}`,
      )
    }
  },
)

test(
  'source preserves the target105 FileRead gate and the later canonical equivalent without inverse-policy leakage',
  sourceOptions,
  () => {
    const fileRead = source('tools/FileReadTool/FileReadTool.ts')
    const model = source('utils/model/model.ts')
    assert.equal(fileRead.includes('MITIGATION_EXEMPT_MODELS'), false)
    assert.ok(
      fileRead.includes(
        'shouldIncludeFileReadMitigation()\n              ? CYBER_RISK_MITIGATION_REMINDER',
      ),
      'nonempty text FileRead results retain the reachable policy call',
    )

    if (isCurrentSource) {
      for (const fragment of [
        'const CYBER_RISK_MITIGATION_MODELS = new Set([',
        "'claude-sonnet-4-0'",
        "'claude-sonnet-4-5'",
        "'claude-opus-4-0'",
        "'claude-opus-4-1'",
        "'claude-opus-4-5'",
        'const shortName = getCanonicalName(getMainLoopModel())',
        'return CYBER_RISK_MITIGATION_MODELS.has(shortName)',
      ]) {
        assert.ok(fileRead.includes(fragment), fragment)
      }
    } else {
      for (const fragment of [
        'const CYBER_RISK_MITIGATION_MODELS = [',
        '/claude-sonnet-4(?:$|[-@]\\d{8}|[^-@\\d])/',
        '/claude-sonnet-4-5/',
        '/claude-opus-4(?:$|[-@]\\d{8}|[^-@\\d])/',
        '/claude-opus-4-1/',
        '/claude-opus-4-5/',
        'const model = getMainLoopModel().toLowerCase()',
        'return CYBER_RISK_MITIGATION_MODELS.some(pattern => pattern.test(model))',
      ]) {
        assert.ok(fileRead.includes(fragment), fragment)
      }
      assert.equal(
        fileRead.includes('getCanonicalName(getMainLoopModel())'),
        false,
      )
    }

    const policy = sourcePolicy(fileRead, model)
    for (const [modelId, expected] of behaviorMatrix) {
      assert.equal(policy(modelId), expected, `source policy ${modelId}`)
    }
  },
)
