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

const unit = [
  13313,
  'unresolved',
  10003007,
  10003067,
  'FunctionDeclaration',
  'cad7c686a14f9944975b37110c7a9b4558f07dce941dbf02625921bf07ba11d6',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource() {
  return fs.readFileSync(path.join(sourceRoot, 'utils/messages.ts'), 'utf8')
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

async function compileStripper(contents) {
  const start = contents.indexOf('const STRIPPED_TAGS_RE =')
  const end = contents.indexOf('\n}\n\nexport function getToolUseID', start) + 2
  assert.notEqual(start, -1, 'STRIPPED_TAGS_RE declaration')
  assert.notEqual(end, 1, 'stripPromptXMLTags terminator')
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports.stripPromptXMLTags
}

test(
  'authenticated target105 pins leading-newline-only prompt XML stripping',
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
    const [index, classification, start, end, nodeType, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, classification)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [start, end, nodeType, hash],
    )
    assert.equal(sha256(target.slice(start, end)), hash)
    assert.equal(
      target.slice(start, end),
      'function f36(q){return q.replace(okY,"").replace(/^\\n+/,"")}',
    )
    assert.ok(baseline.includes('.replace(ITY,"").trim()'))
    assert.ok(latest.includes('.replace(dJ1,"").replace(/^\\n+/,"")'))
  },
)

test(
  'authored stripper preserves meaningful surrounding whitespace',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const source = ownerSource()
    assert.ok(
      source.includes("content.replace(STRIPPED_TAGS_RE, '').replace(/^\\n+/, '')"),
    )
    assert.equal(
      source.includes("content.replace(STRIPPED_TAGS_RE, '').trim()"),
      false,
    )
    const stripPromptXMLTags = await compileStripper(source)
    assert.equal(
      stripPromptXMLTags('<context>hidden</context>\n\n  visible  \n'),
      '  visible  \n',
    )
    assert.equal(stripPromptXMLTags('\n\nvisible  '), 'visible  ')
    assert.equal(stripPromptXMLTags('  visible  '), '  visible  ')
  },
)
