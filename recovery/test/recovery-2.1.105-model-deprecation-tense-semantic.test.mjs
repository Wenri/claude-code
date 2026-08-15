import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

const baselineUnit = {
  index: 18104,
  start: 12626009,
  end: 12626189,
  hash: '9b8ad58fe24431f6a8f3e735185c619adbddd5b3c447539e0d3175622e3751dc',
}
const targetUnit = {
  index: 18264,
  start: 12695705,
  end: 12695983,
  hash: '8c60d6f87ea5b7b8f5b0a9e93aca12241670eb9b4b32108f6871012784e33511',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
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

async function executeOwner(contents, now) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const NativeDate = Date
  class FixedDate extends NativeDate {
    constructor(value) {
      super(value === undefined ? now : value)
    }

    static now() {
      return new NativeDate(now).getTime()
    }
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'Date', javascript)(
    id => {
      if (id.endsWith('/providers.js')) {
        return { getAPIProvider: () => 'firstParty' }
      }
      throw new Error(`unexpected model-deprecation import: ${id}`)
    },
    module.exports,
    module,
    FixedDate,
  )
  return module.exports
}

test(
  'authenticated target105 changes model-retirement warnings from fixed future tense to date-sensitive tense',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.deepEqual(
      [baselineBytes.length, sha256(baselineBytes)],
      [
        13567412,
        'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
      ],
    )
    assert.deepEqual(
      [targetBytes.length, sha256(targetBytes)],
      [
        13676915,
        '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
      ],
    )

    const baselineRegion = structural.unmatchedBaseline.find(
      candidate => candidate.index === baselineUnit.index,
    )
    assert.deepEqual(
      [
        baselineRegion?.start,
        baselineRegion?.end,
        baselineRegion?.nodeType,
        baselineRegion?.sourceHash,
      ],
      [
        baselineUnit.start,
        baselineUnit.end,
        'FunctionDeclaration',
        baselineUnit.hash,
      ],
    )
    const targetRegion = structural.regions.find(
      candidate => candidate.target?.index === targetUnit.index,
    )
    assert.equal(targetRegion?.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion?.target.start,
        targetRegion?.target.end,
        targetRegion?.target.nodeType,
        targetRegion?.target.sourceHash,
      ],
      [
        targetUnit.start,
        targetUnit.end,
        'FunctionDeclaration',
        targetUnit.hash,
      ],
    )

    const baselineOwner = baselineBytes
      .toString('utf8')
      .slice(baselineUnit.start, baselineUnit.end)
    const targetOwner = targetBytes
      .toString('utf8')
      .slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(baselineOwner), baselineUnit.hash)
    assert.equal(sha256(targetOwner), targetUnit.hash)
    assert.equal(occurrences(baselineOwner, 'was retired on'), 0)
    assert.equal(occurrences(baselineOwner, 'will be retired on'), 1)
    assert.equal(occurrences(targetOwner, 'was retired on'), 1)
    assert.equal(occurrences(targetOwner, 'will be retired on'), 1)
    assert.match(targetOwner, /new Date\(\w+\.retirementDate\)/)
    assert.match(
      targetOwner,
      /!Number\.isNaN\(\w+\.getTime\(\)\)&&\w+<new Date\?"was retired on":"will be retired on"/,
    )
  },
)

test(
  'source owns the reachable date-sensitive retirement warning',
  sourceOptions,
  () => {
    const owner = source('utils/model/deprecation.ts')
    const notification = source(
      'hooks/notifs/useDeprecationWarningNotification.tsx',
    )
    const main = source('main.tsx')
    assert.equal(occurrences(owner, 'new Date(info.retirementDate)'), 1)
    assert.equal(occurrences(owner, "'was retired on'"), 1)
    assert.equal(occurrences(owner, "'will be retired on'"), 1)
    assert.match(owner, /!Number\.isNaN\(retirementDate\.getTime\(\)\)/)
    assert.match(owner, /retirementDate < new Date\(\)/)
    assert.match(
      owner,
      /\$\{info\.modelName\} \$\{retirementTense\} \$\{info\.retirementDate\}/,
    )
    assert.match(
      notification,
      /getModelDeprecationWarning\(model\)/,
    )
    assert.match(main, /getModelDeprecationWarning\(resolvedInitialModel\)/)
  },
)

test(
  'retirement warnings execute both tense branches under a deterministic clock',
  sourceOptions,
  async () => {
    const owner = source('utils/model/deprecation.ts')
    const now = '2026-02-01T00:00:00.000Z'
    const runtime = await executeOwner(owner, now)
    assert.equal(
      runtime.getModelDeprecationWarning('claude-3-opus-20240229'),
      '⚠ Claude 3 Opus was retired on January 5, 2026. Consider switching to a newer model.',
    )
    assert.equal(
      runtime.getModelDeprecationWarning('claude-3-7-sonnet-20250219'),
      '⚠ Claude 3.7 Sonnet will be retired on February 19, 2026. Consider switching to a newer model.',
    )
    assert.equal(runtime.getModelDeprecationWarning('claude-future-model'), null)
    assert.equal(runtime.getModelDeprecationWarning(null), null)

    const invalidOwner = owner.replace(
      "firstParty: 'January 5, 2026'",
      "firstParty: 'not-a-date'",
    )
    assert.notEqual(invalidOwner, owner)
    const invalidRuntime = await executeOwner(invalidOwner, now)
    assert.equal(
      invalidRuntime.getModelDeprecationWarning('claude-3-opus'),
      '⚠ Claude 3 Opus will be retired on not-a-date. Consider switching to a newer model.',
    )
  },
)
