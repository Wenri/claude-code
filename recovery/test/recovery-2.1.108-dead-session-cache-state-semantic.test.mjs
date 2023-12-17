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
    18135,
    [
      12427050,
      12427191,
      '2d0e0f203ef731590af6720c410ecfeab244cacc3895012ff514f60e614bb28a',
    ],
  ],
  [
    18137,
    [
      12427199,
      12427316,
      '439c216e9cc419c2d0c674a1dc9f821ea561f2e0fe799379c36ff148d3f976d6',
    ],
  ],
])

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

function identifierOccurrences(source, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`\\b${escaped}\\b`, 'g'))?.length ?? 0
}

test('target108 pins the cache-state factory and its sole initializer', pairOptions, () => {
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

test('the target108 cache-state object is statically unobservable', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const factoryUnit = target.slice(targetUnits.get(18135)[0], targetUnits.get(18135)[1])
  const initializerUnit = target.slice(
    targetUnits.get(18137)[0],
    targetUnits.get(18137)[1],
  )

  const factoryName = factoryUnit.match(/^function\s+([\w$]+)\(/)?.[1]
  const stateName = initializerUnit.match(/([\w$]+)=([\w$]+)\(\)\}\);$/)?.[1]
  const calledFactory = initializerUnit.match(
    /([\w$]+)=([\w$]+)\(\)\}\);$/,
  )?.[2]
  assert.equal(factoryName, 'JKA')
  assert.equal(stateName, 'LjH')
  assert.equal(calledFactory, factoryName)

  // The factory identifier occurs only in its declaration and this call. The
  // state identifier occurs only in its declaration and this write. There is
  // therefore no read, escape, callback, export, or consumer to observe any of
  // the allocated Maps or the boolean.
  assert.equal(identifierOccurrences(target, factoryName), 2)
  assert.equal(identifierOccurrences(target, stateName), 2)
  for (const property of [
    'fileContentCache',
    'turnBaselines',
    'dirtyAttributions',
    'gitStatusInFlight',
    'hooksRegistered',
  ]) {
    assert.equal(baseline.includes(property), false, `${property}: baseline`)
    assert.equal(identifierOccurrences(target, property), 1, `${property}: target`)
  }
})
