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

const identity = [
  4419671,
  4424262,
  'FunctionDeclaration',
  'e575bb24b0d4a7127261e1ba6b2b48695fce4f8b4b3d0fdb817792139bfb80a2',
]
const searchIdentity = [
  10160990,
  10164680,
  'FunctionDeclaration',
  '9fe59d2194ae56420b3b845c1c174c5a7603e0489c1a8bdf17dbd543ca84d279',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function read(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertReducerGraph(contents, label) {
  for (const fragment of [
    'dispatch',
    'kill',
    'yank',
    'yankPop',
    'updateYankLength',
    'interrupt',
  ]) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test(
  'target110 pins the reducer-backed text-input migration',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const region = structural.regions[6219]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      identity,
    )
    const target = targetBytes.toString('utf8')
    const targetUnit = target.slice(region.target.start, region.target.end)
    assert.equal(sha256(targetUnit), region.target.sourceHash)
    assertReducerGraph(targetUnit, 'target110 text input')
    assert.match(targetUnit, /\.dispatch\(\{type:"kill",text:/)
    assert.match(targetUnit, /\.dispatch\(\{type:"yank",start:/)
    assert.match(targetUnit, /\.dispatch\(\{type:"yankPop"\}\)/)
    assert.match(targetUnit, /\.dispatch\(\{type:"updateYankLength",length:/)
    assert.match(targetUnit, /\.dispatch\(\{type:"interrupt"\}\)/)

    const searchRegion = structural.regions[14156]
    assert.equal(searchRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        searchRegion.target.start,
        searchRegion.target.end,
        searchRegion.target.nodeType,
        searchRegion.target.sourceHash,
      ],
      searchIdentity,
    )
    const searchUnit = target.slice(
      searchRegion.target.start,
      searchRegion.target.end,
    )
    assert.equal(sha256(searchUnit), searchRegion.target.sourceHash)
    assertReducerGraph(searchUnit, 'target110 search input')
    assert.match(searchUnit, /\.dispatch\(\{type:"kill",text:/)
    assert.match(searchUnit, /\.dispatch\(\{type:"yankPop"\}\)/)

    const baseline = baselineBytes.toString('utf8')
    assert.doesNotMatch(baseline, /\.dispatch\(\{type:"yankPop"\}\)/)
    assert.match(baseline, /\.recordYank\(/)
    assert.match(baseline, /\.yankPop\(\)/)
  },
)

test(
  'source threads one reducer store through text, search, and App',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const context = read('context/killRing.tsx')
    const textInput = read('hooks/useTextInput.ts')
    const searchInput = read('hooks/useSearchInput.ts')
    const app = read('components/App.tsx')

    assertReducerGraph(context, 'kill-ring context')
    for (const fragment of [
      'providedKillRing ?? contextKillRing',
      "killRing.dispatch({ type: 'kill'",
      "killRing.dispatch({ type: 'yank'",
      "killRing.dispatch({ type: 'yankPop'",
      "killRing.dispatch({ type: 'updateYankLength'",
      "killRing.dispatch({ type: 'interrupt'",
    ]) {
      assert.ok(textInput.includes(fragment), fragment)
    }
    assert.ok(searchInput.includes('providedKillRing ?? contextKillRing'))
    assert.ok(searchInput.includes("killRing.dispatch({ type: 'interrupt'"))
    assert.ok(app.includes('KillRingProvider'))
    assert.match(
      app,
      /<KillRingProvider>(?:<SelectionDeleteProvider>)?\{children\}(?:<\/SelectionDeleteProvider>)?<\/KillRingProvider>/,
    )
  },
)
