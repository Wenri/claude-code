import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const baselineUnit = {
  index: 2_577,
  start: 1_040_306,
  end: 1_062_658,
  sourceHash:
    '78a402d65f80f30af3d3c5b1442194f5f39cc80022ed9f02967198bc81f8e102',
}
const targetUnit = {
  index: 2_588,
  start: 1_041_895,
  end: 1_064_525,
  sourceHash:
    'd21d1b05566f503dbd12bbe1a910084907ceff3a632a04ed453eb47844e25843',
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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
  const loaded = await import(pathToFileURL(candidate).href)
  return loaded.default ?? loaded
}

test('2.1.97 authenticates the settings-schema viewMode insertion', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const predecessor = structural.unmatchedBaseline.find(
    unit => unit.index === baselineUnit.index,
  )
  assert.ok(predecessor)
  assert.deepEqual(
    [predecessor.start, predecessor.end, predecessor.sourceHash],
    [baselineUnit.start, baselineUnit.end, baselineUnit.sourceHash],
  )
  const region = structural.regions[targetUnit.index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
  )
  assert.equal(
    sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )
  assert.equal(
    sha256(target.slice(targetUnit.start, targetUnit.end)),
    targetUnit.sourceHash,
  )

  assert.equal(baseline.includes('Default transcript view mode on startup'), false)
  const targetSchema = target.slice(targetUnit.start, targetUnit.end)
  assert.match(
    targetSchema,
    /viewMode:\w+\.enum\(\["default","verbose","focus"\]\)\.optional\(\)\.catch\(void 0\)\.describe\("Default transcript view mode on startup"\)/,
  )
})

test('source exposes the exact optional, invalid-safe viewMode setting and consumes focus', sourceOptions, async () => {
  const types = fs.readFileSync(
    path.join(sourceRoot, 'utils/settings/types.ts'),
    'utf8',
  )
  const prompts = fs.readFileSync(
    path.join(sourceRoot, 'constants/prompts.ts'),
    'utf8',
  )
  for (const fragment of [
    "viewMode: z\n        .enum(['default', 'verbose', 'focus'])",
    '.optional()\n        .catch(undefined)',
    ".describe('Default transcript view mode on startup')",
  ]) {
    assert.ok(types.includes(fragment), fragment)
  }
  // The public setting is introduced here. The prompt consumer is activated
  // later and must be retained by current cumulative source without being
  // back-attributed to target97.
  if (semanticCase !== caseName) {
    for (const fragment of [
      "viewMode?: 'default' | 'verbose' | 'focus'",
      "viewMode ? viewMode === 'focus'",
      'FOCUS_MODE_SECTION',
    ]) {
      assert.ok(prompts.includes(fragment), fragment)
    }
  }

  const ts = await loadTypeScript()
  const ast = ts.createSourceFile(
    'types.ts',
    types,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  let viewModeProperty
  const visit = node => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(ast) === 'viewMode'
    ) {
      viewModeProperty = node
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(viewModeProperty, 'viewMode schema property')

  const expression = viewModeProperty.initializer.getText(ast)
  const events = []
  const chain = {
    optional() {
      events.push(['optional'])
      return this
    },
    catch(value) {
      events.push(['catch', value])
      return this
    },
    describe(value) {
      events.push(['describe', value])
      return this
    },
  }
  const z = {
    enum(values) {
      events.push(['enum', values])
      return chain
    },
  }
  new Function('z', `return (${expression})`)(z)
  assert.deepEqual(events, [
    ['enum', ['default', 'verbose', 'focus']],
    ['optional'],
    ['catch', undefined],
    ['describe', 'Default transcript view mode on startup'],
  ])
})
