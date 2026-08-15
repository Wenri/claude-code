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

const identities = new Map([
  [7373, [4948961, 4949046, 'FunctionDeclaration', '589179656683d135079df85056dff4eedaaa94420609b4655c76f1a9f1cacd3e']],
  [7374, [4949046, 4949125, 'FunctionDeclaration', '07af2639a307c6557e7c0f0176d8ed2ea46542999e4c6942eeab81b371e7b057']],
  [7375, [4949125, 4949208, 'FunctionDeclaration', 'e4200ca3d44f66da6fae63985ed2478a4d463d03302bf646d9e436885d3440bd']],
  [7376, [4949208, 4949312, 'FunctionDeclaration', '128336ef4d9ffbb46fa85038056f1815cf9d7b452f9c4f2f9fc87024081d534a']],
  [7377, [4949312, 4949451, 'FunctionDeclaration', 'a21f9f7b0239bb400bc4937c0e1c3269a123907d73fd6855cc3a32db1216dedb']],
  [7384, [4951106, 4951239, 'VariableDeclaration', '856f920fd5def5c2bbd10009cc7a39bea5a18b4afbd01a1328e5c2b1851462f5']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source() {
  return fs.readFileSync(
    path.join(sourceRoot, 'services/compact/microCompact.ts'),
    'utf8',
  )
}

test(
  'target110 pins the singleton cached-microcompact state representation',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baseline),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const target = targetBytes.toString('utf8')
    const units = new Map()
    for (const [index, identity] of identities) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
        `${index}: identity`,
      )
      const unit = target.slice(region.target.start, region.target.end)
      assert.equal(sha256(unit), region.target.sourceHash, `${index}: bytes`)
      units.set(index, unit)
    }

    assert.match(
      units.get(7373),
      /return\{cachedMCModule:null,cachedMCState:null,pendingCacheEdits:null\}/,
    )
    assert.match(
      units.get(7374),
      /pendingCacheEdits;return [^.]+\.pendingCacheEdits=null/,
    )
    assert.match(
      units.get(7375),
      /if\(![^.]+\.cachedMCState\)return\[\];return [^.]+\.cachedMCState\.pinnedEdits/,
    )
    assert.match(
      units.get(7376),
      /cachedMCState\)[^.]+\.cachedMCState\.pinnedEdits\.push\(\{userMessageIndex:/,
    )
    assert.match(
      units.get(7377),
      /cachedMCState&&[^.]+\.cachedMCModule\)[^.]+\.cachedMCModule\.resetCachedMCState\([^.]+\.cachedMCState\)/,
    )
    assert.match(units.get(7377), /pendingCacheEdits=null/)
    assert.match(units.get(7384), /uj6=\$qz\(\)/)

    const factoryName = units.get(7373).match(/function\s+([^()]+)/)?.[1]
    assert.ok(factoryName)
    const escapedFactoryName = factoryName.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )
    assert.equal(
      [...target.matchAll(new RegExp(escapedFactoryName, 'g'))].length,
      2,
      'the factory has one declaration and one initializer call',
    )
  },
)

test(
  'source module bindings are a behavior-preserving representation of the sole target state object',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = source()
    const fragments = [
      "let cachedMCModule: typeof import('./cachedMicrocompact.js') | null = null",
      "let cachedMCState: import('./cachedMicrocompact.js').CachedMCState | null = null",
      'let pendingCacheEdits:',
      'const edits = pendingCacheEdits',
      'pendingCacheEdits = null',
      'if (!cachedMCState) {',
      'return cachedMCState.pinnedEdits',
      'cachedMCState.pinnedEdits.push({ userMessageIndex, block })',
      'if (cachedMCState && cachedMCModule) {',
      'cachedMCModule.resetCachedMCState(cachedMCState)',
    ]
    for (const fragment of fragments) {
      assert.ok(owner.includes(fragment), fragment)
    }

    const consume = owner.indexOf('const edits = pendingCacheEdits')
    const clear = owner.indexOf('pendingCacheEdits = null', consume)
    const returned = owner.indexOf('return edits', clear)
    assert.ok(consume >= 0 && clear > consume && returned > clear)
    assert.equal(
      (owner.match(/let cachedMCModule:/g) ?? []).length,
      1,
      'one module binding corresponds to the target singleton field',
    )
    assert.equal((owner.match(/let cachedMCState:/g) ?? []).length, 1)
  },
)
