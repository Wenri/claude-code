import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
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
  [5117, ['FunctionDeclaration', 3744240, 3744486, '47f74e48f258534dae0665ce81359a06f87519fff1ebacc1de3208ada5d81839']],
  [5118, ['FunctionDeclaration', 3744486, 3744628, 'b2044a074e54321472f24366edf4872aeb2c66010b69bb86dce1ef1b7131e48e']],
  [5119, ['FunctionDeclaration', 3744628, 3744715, 'ad10976e80e15554bbb54bbc1f0b6633c95a258341cd820620aead74bc05001a']],
  [5120, ['FunctionDeclaration', 3744715, 3744798, '7129d5f2e6d00952e76bf5d75e85f885872d29a93ae70007dd909bc1b20929dc']],
  [5121, ['FunctionDeclaration', 3744798, 3744879, '3b3b3dd2884a5aef1104f04f466bc59f5544ae15e90a2c5b5cc4c2bf52243038']],
  [5122, ['FunctionDeclaration', 3744879, 3745054, '9c25b14b66b3a16a09bcc92c1c10d5b17e9eb3164784bc7ff20eeccdb07bf3fb']],
  [5123, ['VariableDeclaration', 3745054, 3745089, 'f64053f28f64c1090f4305a1d58d8a04e37ebdde9371a6e5a7ea1115f7b77561']],
  [5124, ['VariableDeclaration', 3745089, 3745143, '368535a73d30dde8d1c07be955657d5fe6e80908bf924314b6e96665f3b4f583']],
])
const reachableUnits = new Map([
  [11456, ['VariableDeclaration', 'moved', 8863585, 8864178, '0d98e4dcabf01e17d2f031122cd904fc299be355443f06f60383e60408f3c682']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function assertFragments(contents, fragments, owner) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${owner}: ${fragment}`)
  }
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

async function executeRepoCheckouts(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const watched = []
  const logs = []
  const branches = new Map()
  let branchListener
  const fakeProcess = { env: {} }
  const require = id => {
    if (id === 'lodash-es/isEqual.js') {
      return {
        __esModule: true,
        default: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      }
    }
    if (id === 'path') return path
    if (id.endsWith('/cwd.js')) return { getCwd: () => '/default/cwd' }
    if (id.endsWith('/debug.js')) {
      return { logForDebugging: (message, options) => logs.push([message, options]) }
    }
    if (id.endsWith('/errors.js')) {
      return { errorMessage: error => String(error?.message ?? error) }
    }
    if (id.endsWith('/git/gitFilesystem.js')) {
      return {
        addWatchedRepo: async checkout => watched.push(checkout),
        getCachedBranchForRepo: async checkout => branches.get(checkout),
        onRepoBranchChange: listener => {
          branchListener = listener
          return () => undefined
        },
      }
    }
    if (id.endsWith('/slowOperations.js')) return { jsonParse: JSON.parse }
    throw new Error(`unexpected repo-checkouts import: ${id}`)
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'process', javascript)(
    require,
    module.exports,
    module,
    fakeProcess,
  )
  return {
    api: module.exports,
    branches,
    fakeProcess,
    logs,
    triggerBranchChange: () => branchListener?.(),
    watched,
  }
}

test(
  'authenticated target105 introduces the repo-checkout map and all three live consumers',
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

    assert.equal(occurrences(baseline, 'CLAUDE_CODE_REPO_CHECKOUTS'), 0)
    assert.equal(occurrences(target, 'CLAUDE_CODE_REPO_CHECKOUTS'), 1)
    assert.equal(occurrences(latest, 'CLAUDE_CODE_REPO_CHECKOUTS'), 1)
    assert.equal(occurrences(baseline, 'CLAUDE_CODE_BASE_REFS'), 0)
    assert.equal(occurrences(target, 'CLAUDE_CODE_BASE_REFS'), 1)
    assert.equal(occurrences(latest, 'CLAUDE_CODE_BASE_REFS'), 1)

    for (const [index, [nodeType, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.index,
          region.target.nodeType,
          region.target.parseStatus,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [index, nodeType, 'parsed', start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    for (const [index, [nodeType, classification, start, end, hash]] of reachableUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.index,
          region.target.nodeType,
          region.target.parseStatus,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [index, nodeType, 'parsed', start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assertFragments(target.slice(3744240, 3745143), [
      '[repo-checkouts] Failed to parse env map:',
      'process.env.CLAUDE_CODE_REPO_CHECKOUTS',
      'process.env.CLAUDE_CODE_BASE_REFS',
      'q.startsWith(_+WN_)',
      'for(let[,K]of $b1())await PF7(K)',
      'WF7(()=>void jb1())',
      'if(Y!==void 0)K[_]=Y',
      'Tq4?.({current_branches:K})',
    ], 'target105 service')
    assertFragments(target, [
      'let K=fq4(q),_=(K!==void 0?Gq4().get(K):void 0)||process.env.CLAUDE_CODE_BASE_REF',
      '}jb1();let w=E8()',
      'vq4((X)=>this.sessionState.notifyMetadataChanged(X))',
    ], 'target105 consumers')
    assertFragments(latest, [
      '[repo-checkouts] Failed to parse env map:',
      'process.env.CLAUDE_CODE_REPO_CHECKOUTS',
      'process.env.CLAUDE_CODE_BASE_REFS',
      'Ceq((D)=>this.sessionState.notifyMetadataChanged(D))',
      '}Jm8();let z=E$()',
    ], 'target116 persistence')
  },
)

test(
  'source root preserves checkout parsing, diff precedence, and branch reporting reachability',
  sourceOptions,
  () => {
    const repo = source('utils/repoCheckouts.ts')
    assertFragments(repo, [
      'function parseEnvMap(',
      '`[repo-checkouts] Failed to parse env map: ${errorMessage(error)}`',
      'process.env.CLAUDE_CODE_REPO_CHECKOUTS',
      "new Map([['', getCwd()]])",
      'process.env.CLAUDE_CODE_BASE_REFS',
      'path.startsWith(checkout + sep)',
      'await addWatchedRepo(checkout)',
      'onRepoBranchChange(() => void refreshRepoCheckoutBranches())',
      'if (branch !== undefined) branches[key] = branch',
      'if (isEqual(branches, lastReportedBranches)) return',
      'metadataReporter?.({ current_branches: branches })',
    ], 'utils/repoCheckouts.ts')

    assertFragments(source('utils/gitDiff.ts'), [
      'const repoKey = getRepoKeyForPath(gitRoot)',
      'repoKey !== undefined ? getRepoBaseRefs().get(repoKey) : undefined',
      'process.env.CLAUDE_CODE_BASE_REF',
    ], 'utils/gitDiff.ts')
    assertFragments(source('utils/sessionStorage.ts'), [
      "import { refreshRepoCheckoutBranches } from './repoCheckouts.js'",
      'void refreshRepoCheckoutBranches()',
    ], 'utils/sessionStorage.ts')
    assertFragments(source('cli/remoteIO.ts'), [
      "import { setupRepoCheckoutBranchReporting } from '../utils/repoCheckouts.js'",
      'void setupRepoCheckoutBranchReporting(metadata =>',
      'this.sessionState.notifyMetadataChanged(metadata)',
    ], 'cli/remoteIO.ts')
    assert.ok(
      source('utils/sessionState.ts').includes(
        'current_branches?: Record<string, string | null>',
      ),
    )
  },
)

test(
  'repo checkout runtime filters env values and reports only changed known branches',
  sourceOptions,
  async () => {
    const defaults = await executeRepoCheckouts(source('utils/repoCheckouts.ts'))
    assert.deepEqual([...defaults.api.getRepoCheckouts()], [['', '/default/cwd']])

    const runtime = await executeRepoCheckouts(source('utils/repoCheckouts.ts'))
    runtime.fakeProcess.env.CLAUDE_CODE_REPO_CHECKOUTS = JSON.stringify({
      api: '/repos/api',
      web: '/repos/web',
      ignored: 42,
    })
    runtime.fakeProcess.env.CLAUDE_CODE_BASE_REFS = JSON.stringify({
      api: 'origin/main',
      web: 'origin/develop',
      ignored: false,
    })
    assert.deepEqual([...runtime.api.getRepoCheckouts()], [
      ['api', '/repos/api'],
      ['web', '/repos/web'],
    ])
    assert.deepEqual([...runtime.api.getRepoBaseRefs()], [
      ['api', 'origin/main'],
      ['web', 'origin/develop'],
    ])
    assert.equal(runtime.api.getRepoKeyForPath('/repos/api'), 'api')
    assert.equal(runtime.api.getRepoKeyForPath('/repos/api/src/a.ts'), 'api')
    assert.equal(runtime.api.getRepoKeyForPath('/repos/api-copy'), undefined)

    runtime.branches.set('/repos/api', 'main')
    runtime.branches.set('/repos/web', null)
    const reports = []
    await runtime.api.setupRepoCheckoutBranchReporting(value => reports.push(value))
    assert.deepEqual(runtime.watched, ['/repos/api', '/repos/web'])
    await runtime.api.refreshRepoCheckoutBranches()
    assert.deepEqual(reports, [
      { current_branches: { api: 'main', web: null } },
    ])
    await runtime.api.refreshRepoCheckoutBranches()
    assert.equal(reports.length, 1)

    runtime.branches.set('/repos/api', 'feature')
    runtime.triggerBranchChange()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(reports.at(-1), {
      current_branches: { api: 'feature', web: null },
    })

    const malformed = await executeRepoCheckouts(source('utils/repoCheckouts.ts'))
    malformed.fakeProcess.env.CLAUDE_CODE_REPO_CHECKOUTS = '{bad json'
    assert.deepEqual([...malformed.api.getRepoCheckouts()], [])
    assert.equal(malformed.logs.length, 1)
    assert.match(malformed.logs[0][0], /^\[repo-checkouts\] Failed to parse env map:/)
    assert.deepEqual(malformed.logs[0][1], { level: 'error' })
  },
)
