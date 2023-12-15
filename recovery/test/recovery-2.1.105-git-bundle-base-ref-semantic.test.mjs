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
  [11132, ['FunctionDeclaration', 8700494, 8702243, 'b61a995e71b3a23e4eb542b15d8f4693cfbbf23e7350f10a181bfc9bbd2893a1']],
  [11133, ['FunctionDeclaration', 8702243, 8703880, '525277e5ca458eaf41f4365458c79af425d550972a2f3d7f5bd0433455911335']],
  [11156, ['FunctionDeclaration', 8713717, 8720128, '22e119767ae0e2ceab5faded85a3a768d27741304c76a9897f5b5235e69e56d5']],
])

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

async function extractFunction(relativePath, name) {
  const ts = await loadTypeScript()
  const contents = source(relativePath)
  const parsed = ts.createSourceFile(
    relativePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.ok(declaration, `${name} declaration`)
  return declaration.getText(parsed).replace(/^export\s+/, '')
}

async function compileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

test(
  'authenticated target105 pins base-ref-aware bundle fallback and teleport reachability',
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

    for (const [index, [nodeType, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.index,
          region.target.nodeType,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [index, nodeType, start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(occurrences(baseline, 'seed-base'), 0)
    assert.equal(occurrences(target, 'seed-base'), 1)
    assert.equal(occurrences(latest, 'seed-base'), 1)
    assert.equal(occurrences(baseline, 'bundleBaseRef'), 0)
    assert.equal(occurrences(target, 'bundleBaseRef'), 2)
    assert.equal(occurrences(latest, 'bundleBaseRef'), 2)
    assert.equal(target.slice(8703139, 8703146), 'baseRef')
    assert.equal(target.slice(8714309, 8714316), 'baseRef')

    const fallback = target.slice(8700494, 8702243)
    const upload = target.slice(8702243, 8703880)
    const teleport = target.slice(8713717, 8720128)
    assert.match(fallback, /\["commit-tree",`\$\{\w+\}\^\{tree\}`,"-m","seed-base"\]/)
    assert.match(fallback, /\["-p",\w+\.stdout\.trim\(\)\]/)
    assert.match(
      fallback,
      /baseRef commit-tree failed \(\$\{\w+\.code\}\), squashing without parent:/,
    )
    assert.match(upload, /\?\.baseRef/)
    assert.match(teleport, /baseRef:\w+\.bundleBaseRef/)
  },
)

test(
  'authored bundle and teleport owners expose and forward the review base ref',
  sourceOptions,
  () => {
    const bundle = source('utils/teleport/gitBundle.ts')
    const teleport = source('utils/teleport.tsx')
    const review = source('commands/review/reviewRemote.ts')
    assert.match(bundle, /baseRef\?: string/)
    assert.match(
      bundle,
      /\['commit-tree', `\$\{baseRef\}\^\{tree\}`, '-m', 'seed-base'\]/,
    )
    assert.match(
      bundle,
      /parentArgs(?: = \['-p', baseCommit\.stdout\.trim\(\)\]|\.push\('-p', baseCommit\.stdout\.trim\(\)\))/,
    )
    assert.match(bundle, /opts\?\.baseRef/)
    assert.match(teleport, /bundleBaseRef\?: string/)
    assert.match(teleport, /baseRef: options\.bundleBaseRef/)
    assert.match(review, /bundleBaseRef: mergeBaseSha/)
  },
)

test(
  'squashed fallback parents the seed on a synthetic base and degrades safely when base creation fails',
  sourceOptions,
  async () => {
    const fallback = await extractFunction(
      'utils/teleport/gitBundle.ts',
      '_bundleWithFallback',
    )
    const javascript = await compileCommonJs(`
      type BundleCreateResult = any
      let calls: string[][] = []
      let logs: string[] = []
      let statIndex = 0
      let failBase = false
      const gitExe = () => 'git'
      const getPackedRepositoryStats = async () => ({
        sizeBytes: null,
        inPackCount: null,
      })
      const stat = async () => ({ size: [200, 200, 10][statIndex++] ?? 10 })
      const logForDebugging = (value: string) => logs.push(value)
      const execFileNoThrowWithCwd = async (_exe: string, args: string[]) => {
        calls.push(args)
        if (args[0] === 'rev-parse') {
          return {
            code: 0,
            stdout: args[1].startsWith('origin/') ? 'base-tree\\n' : 'head-tree\\n',
            stderr: '',
          }
        }
        if (args[0] === 'commit-tree' && args[1] === 'origin/main^{tree}') {
          return failBase
            ? { code: 1, stdout: '', stderr: 'missing base' }
            : { code: 0, stdout: 'synthetic-base\\n', stderr: '' }
        }
        if (args[0] === 'commit-tree') {
          return { code: 0, stdout: 'seed-commit\\n', stderr: '' }
        }
        return { code: 0, stdout: '', stderr: '' }
      }
      ${fallback}
      module.exports = {
        run: _bundleWithFallback,
        state: () => ({ calls, logs }),
        reset(value: boolean) {
          calls = []
          logs = []
          statIndex = 0
          failBase = value
        },
      }
    `)
    const module = { exports: {} }
    new Function('module', 'exports', javascript)(module, module.exports)
    const runtime = module.exports

    runtime.reset(false)
    const success = await runtime.run(
      '/repo',
      '/tmp/seed.bundle',
      100,
      false,
      undefined,
      'origin/main',
    )
    assert.deepEqual(success, { ok: true, size: 10, scope: 'squashed' })
    let state = runtime.state()
    assert.ok(
      state.calls.some(
        args =>
          JSON.stringify(args) ===
          JSON.stringify([
            'commit-tree',
            'origin/main^{tree}',
            '-m',
            'seed-base',
          ]),
      ),
    )
    assert.ok(
      state.calls.some(
        args =>
          JSON.stringify(args) ===
          JSON.stringify([
            'commit-tree',
            'HEAD^{tree}',
            '-p',
            'synthetic-base',
            '-m',
            'seed',
          ]),
      ),
    )

    runtime.reset(true)
    const degraded = await runtime.run(
      '/repo',
      '/tmp/seed.bundle',
      100,
      false,
      undefined,
      'origin/main',
    )
    assert.deepEqual(degraded, { ok: true, size: 10, scope: 'squashed' })
    state = runtime.state()
    assert.ok(
      state.calls.some(
        args =>
          JSON.stringify(args) ===
          JSON.stringify(['commit-tree', 'HEAD^{tree}', '-m', 'seed']),
      ),
    )
    assert.ok(
      state.logs.some(value =>
        value.includes(
          '[gitBundle] baseRef commit-tree failed (1), squashing without parent: missing base',
        ),
      ),
    )
  },
)
