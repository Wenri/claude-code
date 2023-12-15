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
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
      : false,
}

const targetUnit = {
  index: 9304,
  start: 7188142,
  end: 7188278,
  nodeType: 'VariableDeclaration',
  sourceHash:
    'b0c9dd3e24bb4d51b162351d7e2774754f05ef6ff954b83ec6c089ae8bf6f59b',
}
const typedRow = {
  index: 131,
  start: 7188235,
  end: 7188275,
  value: '/[#*`|[>\\-_~]|\\n\\n|(?:^|\\n) {0,3}\\d+\\. /',
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
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

async function compileMatcher() {
  const ts = await loadTypeScript()
  const owner = source('components/Markdown.tsx')
  const parsed = ts.createSourceFile(
    'Markdown.tsx',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const regex = parsed.statements.find(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => declaration.name.getText(parsed) === 'MD_SYNTAX_RE',
      ),
  )
  const matcher = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'hasMarkdownSyntax',
  )
  assert.ok(regex, 'MD_SYNTAX_RE declaration')
  assert.ok(matcher, 'hasMarkdownSyntax declaration')
  const javascript = ts.transpileModule(
    `${regex.getText(parsed)}\n${matcher.getText(parsed)}\nmodule.exports = { hasMarkdownSyntax }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('module', 'exports', javascript)(module, module.exports)
  return module.exports.hasMarkdownSyntax
}

test(
  'authenticated target105 recognizes CommonMark-indented ordered lists',
  bundleOptions,
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
    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        targetUnit.start,
        targetUnit.end,
        targetUnit.nodeType,
        targetUnit.sourceHash,
      ],
    )
    assert.equal(
      sha256(target.slice(targetUnit.start, targetUnit.end)),
      targetUnit.sourceHash,
    )
    assert.equal(
      target.slice(typedRow.start, typedRow.end),
      typedRow.value,
      `typed-audit row ${typedRow.index}`,
    )
    assert.doesNotMatch(baseline, /\{0,3\}\\d\+\\\. /)
    for (const bundle of [target, latest]) {
      assert.match(bundle, /\(\?:\^\|\\n\) \{0,3\}\\d\+\\\. /)
    }
  },
)

test('source detects ordered lists indented by up to three spaces', sourceOptions, async () => {
  const hasMarkdownSyntax = await compileMatcher()
  for (const value of ['1. first', '  2. second', 'before\n   42. answer']) {
    assert.equal(hasMarkdownSyntax(value), true, value)
  }
  for (const value of ['plain sentence', 'inline 1. not a list', '    1. code block']) {
    assert.equal(hasMarkdownSyntax(value), false, value)
  }
  assert.equal(hasMarkdownSyntax('x'.repeat(500) + '\n1. outside sample'), false)
  assert.equal(hasMarkdownSyntax('# heading'), true)
})

test('source owns the exact target105 markdown syntax regex', sourceOptions, () => {
  assert.match(
    source('components/Markdown.tsx'),
    /const MD_SYNTAX_RE = \/\[#\*`\|\[>\\-_~\]\|\\n\\n\|\(\?:\^\|\\n\) \{0,3\}\\d\+\\\. \/;/,
  )
})
