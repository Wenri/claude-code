import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnit = [
  9980,
  8098189,
  8098626,
  'FunctionDeclaration',
  '4ceca68c9f3ce92d4f2a71df8f3dcee6aee07e30173cd46ff9a98c041d9feb71',
]
const baselineUnit = [
  10854,
  8467696,
  8468133,
  'FunctionDeclaration',
  'dc912affdbe1bdd99dff88875462390d6be24faea6d7daa07945b07f59db9a3f',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function accountFunction(contents) {
  const start = contents.indexOf('export function buildAccountProperties()')
  assert.notEqual(start, -1, 'buildAccountProperties must exist')
  const end = contents.indexOf(
    '\nexport function buildAPIProviderProperties()',
    start,
  )
  assert.notEqual(end, -1, 'the following status helper must exist')
  return contents.slice(start, end)
}

test(
  'authenticated target105 lowercases the subscription account label',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    const [index, start, end, nodeType, hash] = targetUnit
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.index,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [index, start, end, nodeType, hash],
    )
    assert.equal(sha256(target.slice(start, end)), hash)

    const [, baselineStart, baselineEnd, baselineType, baselineHash] =
      baselineUnit
    assert.equal(baselineType, nodeType)
    assert.equal(
      sha256(baseline.slice(baselineStart, baselineEnd)),
      baselineHash,
    )
    assert.equal(
      occurrences(
        baseline.slice(baselineStart, baselineEnd),
        '${q.subscription} Account',
      ),
      1,
    )
    assert.equal(
      occurrences(target.slice(start, end), '${q.subscription} account'),
      1,
    )
    assert.equal(occurrences(latest, 'subscription} account'), 1)
    assert.equal(occurrences(latest, 'subscription} Account'), 0)
  },
)

test(
  'source status renders the stable lowercase account label',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(path.join(sourceRoot, 'utils/status.tsx'), 'utf8')
    const helper = accountFunction(owner)
    assert.equal(
      occurrences(helper, '`${accountInfo.subscription} account`'),
      1,
    )
    assert.equal(occurrences(helper, '`${accountInfo.subscription} Account`'), 0)
    assert.match(helper, /label:\s*['"]Login method['"]/)
  },
)
