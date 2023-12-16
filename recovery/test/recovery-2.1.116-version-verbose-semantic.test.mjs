import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
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
  index: 20445,
  start: 12_983_802,
  end: 12_986_749,
  sourceHash:
    '2778f365fa3e7cc2c3420362db288d4f1b9d8418f8ffe9977b8d4cef12d15978',
}
const targetUnit = {
  index: 20732,
  start: 13_098_456,
  end: 13_102_266,
  sourceHash:
    '8a56d86b93dba39e5d68b19d85eb408657b64333cea92e56fae8d4f15190e1e1',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadTypeScript() {
  const require = createRequire(import.meta.url)
  for (const candidate of [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error('TypeScript compiler not found')
}

function compileMain() {
  const relativePath = 'entrypoints/cli.tsx'
  const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
  const ts = loadTypeScript()
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let declaration
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'main') {
      declaration = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(declaration, 'entrypoints/cli.tsx: main declaration')
  const javascript = ts.transpileModule(
    `${declaration.getText(sourceFile)}\nexports.main = main`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  return (args, gitSha = '9e176d0772418b8b88475d39fb86c651a12f4aad') => {
    const lines = []
    const processStub = {
      argv: ['node', 'claude', ...args],
      env: {},
    }
    const consoleStub = { log: line => lines.push(line) }
    const macro = {
      VERSION: '2.1.116',
      GIT_SHA: gitSha,
    }
    const exports = {}
    Function('process', 'console', 'MACRO', 'exports', javascript)(
      processStub,
      consoleStub,
      macro,
      exports,
    )
    return exports.main().then(() => lines)
  }
}

test('target116 authenticates the mixed CLI entrypoint replacement', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  const baselineRegion = structural.unmatchedBaseline.find(
    region => region.index === baselineUnit.index,
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
      baselineUnit.sourceHash,
    ],
  )
  assert.equal(
    sha256(baseline.subarray(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )
  const targetRegion = structural.regions[targetUnit.index]
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      targetRegion.target.start,
      targetRegion.target.end,
      targetRegion.target.nodeType,
      targetRegion.target.sourceHash,
    ],
    [
      targetUnit.start,
      targetUnit.end,
      'FunctionDeclaration',
      targetUnit.sourceHash,
    ],
  )
  assert.equal(
    sha256(target.subarray(targetUnit.start, targetUnit.end)),
    targetUnit.sourceHash,
  )

  const baselineOwner = baseline
    .subarray(baselineUnit.start, baselineUnit.end)
    .toString('utf8')
  const targetOwner = target
    .subarray(targetUnit.start, targetUnit.end)
    .toString('utf8')
  assert.match(baselineOwner, /H\.length===1&&/)
  assert.doesNotMatch(baselineOwner, /--verbose/)
  assert.doesNotMatch(baselineOwner, /Commit: /)
  assert.match(
    targetOwner,
    /\(H\.length===1\|\|H\.length===2&&H\[1\]==="--verbose"\)/,
  )
  assert.match(targetOwner, /H\[0\]==="--version"\|\|H\[0\]==="-v"\|\|H\[0\]==="-V"/)
  assert.match(targetOwner, /console\.log\(`Commit: .*\.GIT_SHA\}`\)/)
  // The build-ref suffix helper in this published bundle is DCE-equivalent to
  // an empty string; the live delta in this mixed unit is verbose dispatch and
  // the commit line.
  assert.match(targetOwner, /\(Claude Code\)\$\{yU\(\)\}/)
})

test('source executes version aliases and the optional verbose commit line', sourceOptions, async () => {
  const runMain = compileMain()
  for (const alias of ['--version', '-v', '-V']) {
    assert.deepEqual(await runMain([alias]), ['2.1.116 (Claude Code)'])
    assert.deepEqual(await runMain([alias, '--verbose']), [
      '2.1.116 (Claude Code)',
      'Commit: 9e176d0772418b8b88475d39fb86c651a12f4aad',
    ])
  }
  assert.deepEqual(await runMain(['--version', '--verbose'], ''), [
    '2.1.116 (Claude Code)',
  ])
})
