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
  index: 5275,
  start: 3800184,
  end: 3802559,
  nodeType: 'FunctionDeclaration',
  sourceHash:
    'eaa725b7d6bbe1a17fe1d5b175c27f81d7d0682fa44f6dd6e51a0d0f28503c14',
}
const typedRows = [
  { index: 37, start: 3801022, end: 3801027, value: '\\x1B\n' },
  { index: 38, start: 3801086, end: 3801094, value: '"\\x1B\\t"' },
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

async function compileParseKeypress() {
  const ts = await loadTypeScript()
  const owner = source('ink/parse-keypress.ts')
  const parsed = ts.createSourceFile(
    'parse-keypress.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'parseKeypress',
  )
  assert.ok(declaration, 'parseKeypress declaration')
  const javascript = ts.transpileModule(
    `${declaration.getText(parsed)}\nmodule.exports = { parseKeypress }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const noMatch = /a^/
  const stubs = {
    CSI_U_RE: noMatch,
    MODIFY_OTHER_KEYS_RE: noMatch,
    SGR_MOUSE_RE: noMatch,
    META_KEY_CODE_RE: noMatch,
    FN_KEY_RE: noMatch,
    decodeModifier: () => ({}),
    keycodeToName: () => undefined,
    createNavKey: () => assert.fail('navigation branch is unreachable'),
    isBackspaceCtrl: () => false,
    keyName: {},
    isShiftKey: () => false,
    isCtrlKey: () => false,
  }
  const module = { exports: {} }
  const names = Object.keys(stubs)
  new Function('module', 'exports', ...names, javascript)(
    module,
    module.exports,
    ...names.map(name => stubs[name]),
  )
  return module.exports.parseKeypress
}

test(
  'authenticated target105 adds meta Return, Enter, and Tab parsing',
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
    for (const row of typedRows) {
      assert.equal(
        target.slice(row.start, row.end),
        row.value,
        `typed-audit row ${row.index}`,
      )
    }
    assert.doesNotMatch(baseline, /q\.length===2;else if\(q===`/)
    for (const bundle of [target, latest]) {
      const unit = bundle === target
        ? bundle.slice(targetUnit.start, targetUnit.end)
        : bundle
      assert.match(unit, /name="return",[^;]*meta=[^;]*length===2/)
      assert.match(unit, /name="enter",[^;]*meta=[^;]*length===2/)
      assert.match(unit, /name="tab",[^;]*meta=[^;]*length===2/)
    }
  },
)

test('source parses both plain and Meta-prefixed Return, Enter, and Tab', sourceOptions, async () => {
  const parseKeypress = await compileParseKeypress()
  for (const [plain, meta, name] of [
    ['\r', '\u001b\r', 'return'],
    ['\n', '\u001b\n', 'enter'],
    ['\t', '\u001b\t', 'tab'],
  ]) {
    const plainKey = parseKeypress(plain)
    assert.equal(plainKey.name, name)
    assert.equal(plainKey.meta, false)
    const metaKey = parseKeypress(meta)
    assert.equal(metaKey.name, name)
    assert.equal(metaKey.meta, true)
    assert.equal(metaKey.sequence, meta)
    if (name === 'return') assert.equal(metaKey.raw, undefined)
  }
})

test('source owns the three exact target branches', sourceOptions, () => {
  const owner = source('ink/parse-keypress.ts')
  assert.match(owner, /s === '\\r' \|\| s === '\\x1b\\r'/)
  assert.match(owner, /s === '\\n' \|\| s === '\\x1b\\n'/)
  assert.match(owner, /s === '\\t' \|\| s === '\\x1b\\t'/)
  assert.equal((owner.match(/key\.meta = s\.length === 2/g) ?? []).length >= 4, true)
})
