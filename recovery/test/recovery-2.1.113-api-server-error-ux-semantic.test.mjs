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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const baselineSha256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const targetSha256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'

const baselineUnit = {
  index: 6879,
  nodeType: 'FunctionDeclaration',
  start: 4741513,
  end: 4747917,
  sourceHash:
    'a04f599a9855e8949b691a450bcfd053fb7ad7bf5c651f8a7ff85f62144f27dd',
}
const targetUnit = {
  index: 8138,
  nodeType: 'FunctionDeclaration',
  start: 3866379,
  end: 3873008,
  sourceHash:
    'db7b74679245eb15736b8daa4e9dbf79831eb50c81baa031e5d455a44036bd5d',
}
const staticEquivalentUnit = {
  index: 8142,
  nodeType: 'FunctionDeclaration',
  start: 3876316,
  end: 3877130,
  sourceHash:
    'ad112744b01dfb8125d2f7338ce8e9e32e6fb5fd1eace363cac0c114db6cdd3a',
}
const typedRows = [
  {
    currentRow: 2585,
    historicalRow: 2590,
    kind: 'string',
    value: ' If it persists, check ',
    start: 3872345,
    end: 3872368,
  },
  {
    currentRow: 2586,
    historicalRow: 2591,
    kind: 'string',
    value:
      '. The API is at capacity — this is usually temporary. Try again in a moment.',
    start: 3872460,
    end: 3872541,
  },
  {
    currentRow: 2587,
    historicalRow: 2592,
    kind: 'regexp',
    value: '/[.!?\\u2026]+$/',
    start: 3872654,
    end: 3872669,
  },
  {
    currentRow: 2588,
    historicalRow: 2593,
    kind: 'string',
    value:
      '. This is a server-side issue, usually temporary — try again in a moment.',
    start: 3872705,
    end: 3872783,
  },
]
const staticEquivalentRow = {
  currentRow: 2589,
  historicalRow: 2594,
  value: '/[.!?\\u2026]$/',
  start: 3876555,
  end: 3876569,
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
      ? 'CLAUDE_CODE_2_1_112_BUNDLE and CLAUDE_CODE_2_1_113_BUNDLE are required'
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

class APIErrorFixture extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function providerCompatibility(provider) {
  return provider === 'firstParty' || provider === 'anthropicAws'
}

function extractHistoricalServerTail(unit, version) {
  if (version === 112) {
    const start = unit.indexOf('let z=KA()?')
    const end = unit.indexOf('if(q instanceof bZ', start)
    assert.notEqual(start, -1, 'target112 server tail start')
    assert.notEqual(end, -1, 'target112 server tail end')
    return unit.slice(start, end)
  }
  const start = unit.indexOf('let K=zA()?')
  const end = unit.indexOf('if(H instanceof _G', start)
  assert.notEqual(start, -1, 'target113 server tail start')
  assert.notEqual(end, -1, 'target113 server tail end')
  return unit.slice(start, end)
}

function instantiateHistoricalServerTail(unit, version, getProvider) {
  const tail = extractHistoricalServerTail(unit, version)
  if (version === 112) {
    return new Function(
      'KA',
      'mM4',
      'ut6',
      'mP',
      'vq',
      'fj6',
      '_9',
      `return function(q){${tail}return null}`,
    )(
      () => providerCompatibility(getProvider()),
      'status.claude.com',
      'Repeated 529 Overloaded errors',
      'API Error',
      APIErrorFixture,
      error => error.message,
      value => value,
    )
  }
  return new Function(
    'zA',
    'i5K',
    'esH',
    'qP',
    'Eq',
    'JMH',
    '_9',
    `return function(H){${tail}return null}`,
  )(
    () => providerCompatibility(getProvider()),
    'status.claude.com',
    'Repeated 529 Overloaded errors',
    'API Error',
    APIErrorFixture,
    error => error.message,
    value => value,
  )
}

function extractSourceServerCluster(owner) {
  const start = owner.indexOf(
    '  const statusHint = isFirstPartyCompatibleAPIProvider()',
  )
  const end = owner.indexOf('  // Connection errors', start)
  assert.notEqual(start, -1, 'source server cluster start')
  assert.notEqual(end, -1, 'source server cluster end')
  return owner.slice(start, end)
}

function instantiateSourceServerCluster(owner, getProvider) {
  const cluster = extractSourceServerCluster(owner)
  return new Function(
    'isFirstPartyCompatibleAPIProvider',
    'CLAUDE_STATUS_PAGE',
    'REPEATED_529_ERROR_MESSAGE',
    'API_ERROR_MESSAGE_PREFIX',
    'APIError',
    'formatAPIError',
    'createAssistantAPIErrorMessage',
    `return function(error){${cluster}return null}`,
  )(
    () => providerCompatibility(getProvider()),
    'status.claude.com',
    'Repeated 529 Overloaded errors',
    'API Error',
    APIErrorFixture,
    error => error.message,
    value => value,
  )
}

function content(result) {
  assert.equal(result?.error, 'server_error')
  return result.content
}

test('target 2.1.113 authenticates the expanded server-error guidance', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const baselineRegion = structural.unmatchedBaseline.find(
    unit => unit.index === baselineUnit.index,
  )
  assert.ok(baselineRegion)
  assert.deepEqual(
    [
      baselineRegion.nodeType,
      baselineRegion.start,
      baselineRegion.end,
      baselineRegion.sourceHash,
    ],
    [
      baselineUnit.nodeType,
      baselineUnit.start,
      baselineUnit.end,
      baselineUnit.sourceHash,
    ],
  )
  assert.equal(
    sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )

  for (const unit of [targetUnit, staticEquivalentUnit]) {
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

  for (const row of typedRows) {
    const raw = target.slice(row.start, row.end)
    const value = row.kind === 'string' ? JSON.parse(`"${raw}"`) : raw
    assert.equal(
      value,
      row.value,
      `current row ${row.currentRow} / historical row ${row.historicalRow}`,
    )
    assert.equal(
      baseline.includes(raw),
      false,
      `row ${row.currentRow}: absent from target112`,
    )
  }

  let provider = 'bedrock'
  const baselineServerErrors = instantiateHistoricalServerTail(
    baseline.slice(baselineUnit.start, baselineUnit.end),
    112,
    () => provider,
  )
  const targetServerErrors = instantiateHistoricalServerTail(
    target.slice(targetUnit.start, targetUnit.end),
    113,
    () => provider,
  )

  assert.equal(
    content(baselineServerErrors(new Error('Repeated 529 Overloaded errors'))),
    'API Error: Repeated 529 Overloaded errors',
  )
  assert.equal(
    content(targetServerErrors(new Error('Repeated 529 Overloaded errors'))),
    'API Error: Repeated 529 Overloaded errors. The API is at capacity — this is usually temporary. Try again in a moment.',
  )
  assert.equal(
    content(baselineServerErrors(new APIErrorFixture(503, 'maintenance...!?'))),
    'API Error: maintenance...!?',
  )
  assert.equal(
    content(targetServerErrors(new APIErrorFixture(503, 'maintenance...!?'))),
    'API Error: maintenance. This is a server-side issue, usually temporary — try again in a moment.',
  )

  provider = 'anthropicAws'
  assert.equal(
    content(targetServerErrors(new APIErrorFixture(503, 'maintenance…'))),
    'API Error: maintenance. This is a server-side issue, usually temporary — try again in a moment. If it persists, check status.claude.com.',
  )
})

test('current source executes target113 provider and punctuation boundaries', sourceOptions, () => {
  const owner = source('src/services/api/errors.ts')
  let provider = 'bedrock'
  const render = instantiateSourceServerCluster(owner, () => provider)

  assert.equal(
    content(render(new Error('Repeated 529 Overloaded errors'))),
    'API Error: Repeated 529 Overloaded errors. The API is at capacity — this is usually temporary. Try again in a moment.',
  )
  assert.equal(
    content(render(new APIErrorFixture(500, 'upstream failed!!!'))),
    'API Error: upstream failed. This is a server-side issue, usually temporary — try again in a moment.',
  )
  assert.equal(render(new APIErrorFixture(499, 'client error')), null)

  for (provider of ['firstParty', 'anthropicAws']) {
    assert.equal(
      content(render(new APIErrorFixture(529, 'overloaded…?!'))),
      'API Error: overloaded. This is a server-side issue, usually temporary — try again in a moment. If it persists, check status.claude.com.',
      provider,
    )
  }

  provider = 'vertex'
  assert.equal(
    content(render(new APIErrorFixture(503, 'maintenance.'))),
    'API Error: maintenance. This is a server-side issue, usually temporary — try again in a moment.',
  )
})

test('adjacent refusal punctuation is static-equivalent without an owner edit', pairOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const targetRegexSource = target.slice(
    staticEquivalentRow.start,
    staticEquivalentRow.end,
  )
  assert.equal(targetRegexSource, staticEquivalentRow.value)

  const owner = source('src/services/api/errors.ts')
  const sourceRegexSource = owner.match(
    /\/\[\.!\?…\]\$\/\.test\(shortenedExplanation\)/,
  )?.[0].split('.test')[0]
  assert.equal(sourceRegexSource, '/[.!?…]$/')

  const targetRegex = new Function(`return ${targetRegexSource}`)()
  const sourceRegex = new Function(`return ${sourceRegexSource}`)()
  for (const value of ['done.', 'done!', 'done?', 'done…', 'done', 'done!!']) {
    assert.equal(sourceRegex.test(value), targetRegex.test(value), value)
  }
})
