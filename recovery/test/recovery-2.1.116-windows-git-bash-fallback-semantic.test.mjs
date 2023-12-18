import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const unit = {
  index: 2177,
  nodeType: 'VariableDeclaration',
  start: 905945,
  end: 907410,
  sourceHash:
    '90c6c727d728a2b92e1048f262318f81d54162f59514713e1acda89e68da68ec',
}
const typedRows = [
  [10, 'C:\\Program Files\\Git\\bin\\bash.exe', 906330, 906369],
  [11, 'C:\\Program Files (x86)\\Git\\bin\\bash.exe', 906370, 906415],
]

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        root,
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

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function instantiateWindowsPaths({ existing = [], whereOutput = '' }) {
  const ts = await loadTypeScript()
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'utils/windowsPaths.ts'),
    'utf8',
  )
  const javascript = ts.transpileModule(owner, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const state = { execCalls: [] }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'lodash-es/memoize.js') {
      return fn => fn
    }
    if (specifier === 'child_process') {
      return {
        execFileSync(file, args, options) {
          state.execCalls.push({ file, args, options })
          return whereOutput
        },
      }
    }
    if (specifier === 'fs') {
      return { existsSync: value => existing.includes(value) }
    }
    if (specifier === 'path') return path.win32
    if (specifier === 'path/win32') return path.win32
    if (specifier.endsWith('/debug.js')) return { logForDebugging() {} }
    if (specifier.endsWith('/cwd.js')) return { getCwd: () => process.cwd() }
    if (specifier.endsWith('/execSyncWrapper.js')) {
      return { execSync_DEPRECATED: () => whereOutput }
    }
    if (specifier.endsWith('/memoize.js')) {
      return { memoizeWithLRU: fn => fn }
    }
    if (specifier.endsWith('/platform.js')) {
      return { getPlatform: () => 'windows' }
    }
    throw new Error(`unexpected windowsPaths import: ${specifier}`)
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return { ...module.exports, state }
}

test(
  'target116 authenticates direct Git Bash installation fallbacks',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target114 and target116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(
      sha256(target.slice(unit.start, unit.end)),
      unit.sourceHash,
    )
    for (const [row, value, start, end] of typedRows) {
      assert.equal(target.slice(start, end), JSON.stringify(value), `typed row ${row}`)
    }
    const escaped64 = 'C:\\\\Program Files\\\\Git\\\\bin\\\\bash.exe'
    const escaped32 =
      'C:\\\\Program Files (x86)\\\\Git\\\\bin\\\\bash.exe'
    assert.equal(target.split(escaped64).length, baseline.split(escaped64).length + 1)
    assert.equal(target.includes(escaped32), true)
    assert.equal(baseline.includes(escaped32), false)
  },
)

test(
  'source prefers explicit and standard paths before a safe where.exe result',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const previous = process.env.CLAUDE_CODE_GIT_BASH_PATH
    try {
      process.env.CLAUDE_CODE_GIT_BASH_PATH = 'C:\\Custom\\bash.exe'
      let harness = await instantiateWindowsPaths({
        existing: ['C:\\Custom\\bash.exe'],
      })
      assert.equal(harness.findGitBashPath(), 'C:\\Custom\\bash.exe')
      assert.deepEqual(harness.state.execCalls, [])

      delete process.env.CLAUDE_CODE_GIT_BASH_PATH
      harness = await instantiateWindowsPaths({
        existing: ['C:\\Program Files (x86)\\Git\\bin\\bash.exe'],
      })
      assert.equal(
        harness.findGitBashPath(),
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      )
      assert.deepEqual(harness.state.execCalls, [])

      if (semanticCase === caseName) return

      harness = await instantiateWindowsPaths({
        existing: ['C:\\Tools\\Git\\bin\\bash.exe'],
        whereOutput: 'C:\\Tools\\Git\\cmd\\git.exe\r\n',
      })
      assert.equal(
        harness.findGitBashPath(),
        'C:\\Tools\\Git\\bin\\bash.exe',
      )
      assert.deepEqual(harness.state.execCalls[0].args, ['git'])
      assert.match(harness.state.execCalls[0].file, /System32[\\/]where\.exe$/)
    } finally {
      if (previous === undefined) delete process.env.CLAUDE_CODE_GIT_BASH_PATH
      else process.env.CLAUDE_CODE_GIT_BASH_PATH = previous
    }
  },
)
