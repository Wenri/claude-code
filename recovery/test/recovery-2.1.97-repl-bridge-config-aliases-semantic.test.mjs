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
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const target116Path = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const targetUnit = {
  index: 15_662,
  start: 11_386_468,
  end: 11_386_611,
  sourceHash:
    '3ec1224bdd27e26ce2ded42b0a88c9426eed4ddfe364269218e1ddcb27e5d739',
}
const target116Unit = {
  index: 17_584,
  start: 10_886_423,
  end: 10_886_566,
  sourceHash:
    '83893234a4179d75b687834e696849fdd9d994b115f76a053ac279da9ed377f3',
}
const publicNames = [
  'DEFAULT_REPL_BRIDGE_CONFIG',
  'checkReplBridgeMinVersion',
  'getReplBridgeConfig',
]

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
const structural116 = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.114-to-2.1.116/structural/generated-delta.json.gz',
      ),
    ),
  ),
)
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}
const persistenceOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !target116Path
      ? 'CLAUDE_CODE_2_1_116_BUNDLE is required'
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

test('2.1.97 authenticates the public REPL bridge config export unit', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  const region = structural.regions[targetUnit.index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
  )
  const unit = target.slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(unit), targetUnit.sourceHash)
  for (const name of publicNames) {
    assert.equal(baseline.split(name).length - 1, 0, name)
    assert.equal(target.split(name).length - 1, 1, name)
    assert.ok(unit.includes(name), name)
  }
})

test('the public REPL bridge aliases persist through authenticated target116', persistenceOptions, () => {
  const targetBytes = fs.readFileSync(target116Path)
  assert.equal(
    sha256(targetBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const region = structural116.regions[target116Unit.index]
  assert.equal(region.classification, 'matched')
  assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [target116Unit.start, target116Unit.end, target116Unit.sourceHash],
  )
  const unit = targetBytes
    .toString('utf8')
    .slice(target116Unit.start, target116Unit.end)
  assert.equal(sha256(unit), target116Unit.sourceHash)
  for (const name of publicNames) assert.ok(unit.includes(name), name)
})

test('source aliases stable REPL names to the live env-less implementation', sourceOptions, async () => {
  const ts = await loadTypeScript()
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'bridge/envLessBridgeConfig.ts'),
    'utf8',
  )
  const ast = ts.createSourceFile(
    'envLessBridgeConfig.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const aliases = new Map()
  for (const statement of ast.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) continue
    if (!ts.isNamedExports(statement.exportClause)) continue
    for (const element of statement.exportClause.elements) {
      aliases.set(
        element.name.text,
        element.propertyName?.text ?? element.name.text,
      )
    }
  }
  assert.deepEqual(Object.fromEntries(aliases), {
    DEFAULT_REPL_BRIDGE_CONFIG: 'DEFAULT_ENV_LESS_BRIDGE_CONFIG',
    checkReplBridgeMinVersion: 'checkEnvLessBridgeMinVersion',
    getReplBridgeConfig: 'getEnvLessBridgeConfig',
  })

  for (const internal of aliases.values()) {
    const declaration = ast.statements.find(statement => {
      if (ts.isFunctionDeclaration(statement)) {
        return statement.name?.text === internal
      }
      return (
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          declaration => declaration.name.getText(ast) === internal,
        )
      )
    })
    assert.ok(declaration, `${internal} must be a live declaration`)
  }
  assert.match(owner, /getFeatureValue_DEPRECATED<unknown>\(/)
  assert.match(owner, /parsed\.success \? parsed\.data : DEFAULT_ENV_LESS_BRIDGE_CONFIG/)
  assert.match(owner, /Version \$\{cfg\.min_version\} or higher is required/)
})
