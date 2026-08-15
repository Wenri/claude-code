import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const units = new Map([
  [13442, [10079897, 10080487, 'cbc599f493689f106e5d4ce5b4b32b98adfc982f88f6bc41a2f9c3417e0d77bf']],
  [13446, [10096222, 10096319, '84f308d3e26d2b1b81fc9e76cb010770dd26058b936470f63a66316ba824d0e4']],
  [13447, [10096319, 10096389, '99e0bd1f3f94ada846aad5d0fe830793ce9ee9ea29e7c114b46353c6f75fbcd7']],
  [13448, [10096389, 10096542, 'd73b4c09eb11f556001eff1a1b486d95c04b33af4014da89f755897655c3ecc1']],
  [13449, [10096542, 10096584, '965fc870c09425870c1dd951d0ae8529f5bad68c6e6ae15dc18efdb186bed14e']],
  [13451, [10096596, 10096663, '8de4d2a9a8aae595a7399921afc73efe3561afd76fbbcbd5091a6893d541855f']],
  [13498, [10101895, 10106731, 'bc9c98cb7eda48493a2177f029c5cacbaef662a45eb72556118baba9a918b960']],
  [13838, [10232476, 10235785, '361424ea692ecd27997af307ec2b7b5ebac013d60c7b766d58a2a219eb77614e']],
  [16761, [11994330, 11994928, 'a30f18536ed3e423a009d6e376068dc9b6ab957a89961ad0e3d391db61e63e38']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins the isolated kill-ring store and reachable input graph', pairOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const [index, [start, end, hash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
  }
  const store = target.slice(...units.get(13442).slice(0, 2))
  for (const method of [
    'push(',
    'getLastKill()',
    'getItem(',
    'size()',
    'resetKillAccumulation()',
    'recordYank(',
    'canYankPop()',
    'yankPop()',
    'updateYankLength(',
    'resetYankState()',
  ]) assert.ok(store.includes(method), method)
})

test('target101 replaces process-global input state with one provider store', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('getLastKill(){'), false)
  assert.equal(target.includes('getLastKill(){'), true)
  assert.equal(baseline.includes('resetKillAccumulation(){'), false)
  assert.equal(target.includes('resetKillAccumulation(){'), true)
  assert.match(target.slice(...units.get(13448).slice(0, 2)), /\.Provider/)
  assert.match(target.slice(...units.get(16761).slice(0, 2)), /createElement\([^,]+,null,/)
})

test('source owns isolated kill/yank state and threads it through both inputs', sourceOptions, () => {
  const context = source('context/killRing.tsx')
  assertFragments(
    context,
    [
      'KILL_RING_MAX_SIZE = 10',
      'createKillRingStore',
      'KillRingProvider',
      'useKillRing',
    ],
    'kill-ring context',
  )

  if (isCurrentSource) {
    assertFragments(
      context,
      [
        "type: 'kill'",
        "type: 'yankPop'",
        "type: 'interrupt'",
        'peekYankPop',
        'dispatch(action)',
      ],
      'latest reducer-backed store',
    )
  } else {
    assertFragments(
      context,
      [
        'push(text, direction',
        'getLastKill()',
        'getItem(index)',
        'resetKillAccumulation()',
        'recordYank(start, length)',
        'canYankPop()',
        'yankPop()',
        'updateYankLength(length)',
        'resetYankState()',
      ],
      'target101 method store',
    )
  }

  for (const relative of ['hooks/useTextInput.ts', 'hooks/useSearchInput.ts']) {
    const input = source(relative)
    assertFragments(
      input,
      ['useKillRing()', 'providedKillRing ?? contextKillRing'],
      relative,
    )
  }
  const search = source('hooks/useSearchInput.ts')
  assertFragments(search, ['multiline', 'onSpaceOnEmpty', 'handlePaste'], 'search input')
  assertFragments(
    source('components/App.tsx'),
    [
      'KillRingProvider',
      isCurrentSource
        ? '<KillRingProvider><SelectionDeleteProvider>{children}</SelectionDeleteProvider></KillRingProvider>'
        : '<KillRingProvider>{children}</KillRingProvider>',
    ],
    'App provider',
  )
})
