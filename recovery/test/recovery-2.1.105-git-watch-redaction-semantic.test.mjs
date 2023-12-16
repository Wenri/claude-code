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
  [2375, [953500, 955789, 'a2e810a88ba8442cc856d3c92c9383731f3e8972cb188d65b07a52bd064cee50']],
  [2385, [956780, 956818, '75d4954410f14e5a31db2f335df0c58a51ff54617f89302f966a6d4e949c2df2']],
  [2386, [956818, 956860, '549470893653ee31d1793b2886f6d7505f5d864d62ef61160782e778b3623329']],
  [2387, [956860, 956907, '875d72338f25ec02dba7ae617a51f7008410e8fa6ff7480209382a8bc7fe1241']],
  [2416, [960918, 961593, '2258751c60c2d5f0a90604bad313141c474cdb489f5806e472837b6a13bd9bda']],
  [2426, [962342, 962410, '3978b914fd946aa96cafde5376650e23321603117858b7ad7a969c6bbfd0b561']],
  [2408, [959491, 959873, 'd578359b50d5d143fbbf11418af7234b63fa7873017b7007d6b71aabe42f6558']],
  [15767, [11489398, 11494442, '27fb1ceab8eccec9374a3af7598b563b794a17a7d9535501a5be47fdcb1f3729']],
  [16809, [11985322, 11994068, '7e3129f7ea44b50ba991573f71d63d086c0b36022f4f142c502aa65f9c766b77']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function declaration(contents, marker) {
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, `${marker}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${marker}: unterminated declaration`)
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

async function compileRuntime() {
  const ts = await loadTypeScript()
  const watcher = declaration(
    source('utils/git/gitFilesystem.ts'),
    'class GitFileWatcher',
  )
  const redactor = declaration(
    source('utils/git.ts'),
    'export function redactGitRemoteCredentials',
  )
  const javascript = ts.transpileModule(
    `
const branches = new Map();
const watchers = new Map();
const cleanups = [];
const resolveGitDir = async value => value === undefined ? null : '/git/' + value;
const readGitHead = async gitDir => ({ type: 'branch', name: branches.get(gitDir) ?? 'main' });
const join = (...values) => values.join('/');
const watchFile = (value, _options, callback) => watchers.set(value, callback);
const unwatchFile = value => watchers.delete(value);
const registerCleanup = callback => cleanups.push(callback);
const getCommonDir = async value => value;
const waitForScrollIdle = async () => {};
type CacheEntry<T> = { value: T; dirty: boolean; compute: () => Promise<T> };
const WATCH_INTERVAL_MS = 10;
${watcher}
${redactor}
export { GitFileWatcher, branches, watchers, cleanups };
`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'authenticated target105 pins the per-repository git watcher and credential redactor boundary',
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

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(target.slice(identity[0], identity[1])),
        identity[2],
        `${index}: bytes`,
      )
    }

    assert.equal(baseline.includes('repoBranchListeners'), false)
    assert.equal(baseline.includes('redactGitRemoteCredentials'), false)
    for (const fragment of [
      'repoBranches=new Map',
      'repoGitDirs=new Map',
      'repoBranchListeners=[]',
      'redactGitRemoteCredentials',
      '.replace(/:\\/\\/[^/]*@/,"://***@")',
    ]) {
      assert.ok(target.includes(fragment), `target105: ${fragment}`)
      assert.ok(latest.includes(fragment), `target116: ${fragment}`)
    }
    assert.equal(
      target.slice(956818, 956860),
      'function WF7(q){mA6.onRepoBranchChange(q)}',
      'target105 listener wrapper intentionally returns no unsubscribe',
    )
    assert.ok(
      latest.includes('cleanupRegistered=!1'),
      'target116 guards cleanup registration even when no git directory exists',
    )
  },
)

test(
  'source root owns exact target105/current watcher and redaction call paths',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const watcher = source('utils/git/gitFilesystem.ts')
    const git = source('utils/git.ts')
    const repository = source('utils/detectRepository.ts')
    const bridge = source('bridge/bridgeApi.ts')
    const bridgeMain = source('bridge/bridgeMain.ts')
    for (const fragment of [
      'private repoBranches = new Map<string, string | null>()',
      'private repoGitDirs = new Map<string, string>()',
      'private repoBranchListeners: Array<() => void> = []',
      "this.watchPath(join(gitDir, 'HEAD')",
      'this.repoBranches.delete(repoPath)',
      'this.repoBranches.set(repoPath, branch)',
      'this.repoBranchListeners = []',
      'export function addWatchedRepo',
      'export function onRepoBranchChange',
      'export function getCachedBranchForRepo',
    ]) assert.ok(watcher.includes(fragment), `watcher: ${fragment}`)
    assert.ok(git.includes("url.replace(/:\\/\\/[^/]*@/, '://***@')"))
    assert.equal(
      (repository.match(/redactGitRemoteCredentials\(remoteUrl\)/g) ?? [])
        .length,
      2,
    )
    assert.ok(
      bridge.includes(
        'git_repo_url: redactGitRemoteCredentials(config.gitRepoUrl)',
      ),
    )
    assert.ok(
      bridge.includes('git_repo_url: config.gitRepoUrl'),
      'the actual registration request must continue to send the raw remote',
    )
    assert.ok(
      bridgeMain.includes(
        'gitRepoUrl=${redactGitRemoteCredentials(gitRepoUrl)}',
      ),
    )

    const target105Mode = !watcher.includes('cleanupRegistered')
    if (target105Mode) {
      assert.match(
        watcher,
        /onRepoBranchChange\(listener: \(\) => void\): void \{\s*this\.repoBranchListeners\.push\(listener\)/,
      )
    } else {
      assert.ok(watcher.includes('private cleanupRegistered = false'))
      assert.ok(watcher.includes('if (!this.cleanupRegistered)'))
      assert.ok(watcher.includes('this.cleanupRegistered = true'))
      assert.match(
        watcher,
        /onRepoBranchChange\(listener: \(\) => void\): \(\) => void \{[\s\S]*?return \(\) =>/,
      )
    }
  },
)

test(
  'recovered watcher cache invalidation and redaction execute in both source generations',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const runtime = await compileRuntime()
    assert.equal(runtime.redactGitRemoteCredentials(null), null)
    assert.equal(runtime.redactGitRemoteCredentials(undefined), undefined)
    assert.equal(
      runtime.redactGitRemoteCredentials(
        'https://user:secret@example.com/org/repo.git',
      ),
      'https://***@example.com/org/repo.git',
    )
    assert.equal(
      runtime.redactGitRemoteCredentials('git@example.com:org/repo.git'),
      'git@example.com:org/repo.git',
    )

    const watcher = new runtime.GitFileWatcher()
    runtime.branches.set('/git/repo', 'main')
    await watcher.addRepo('repo')
    assert.equal(await watcher.getBranchForRepo('repo'), 'main')
    runtime.branches.set('/git/repo', 'feature')
    assert.equal(
      await watcher.getBranchForRepo('repo'),
      'main',
      'branch value remains cached until HEAD changes',
    )
    let notifications = 0
    const unsubscribe = watcher.onRepoBranchChange(() => notifications++)
    runtime.watchers.get('/git/repo/HEAD')()
    assert.equal(notifications, 1)
    assert.equal(await watcher.getBranchForRepo('repo'), 'feature')
    if (typeof unsubscribe === 'function') {
      unsubscribe()
      runtime.watchers.get('/git/repo/HEAD')()
      assert.equal(notifications, 1, 'target116 unsubscribe removes the listener')
    } else {
      assert.equal(unsubscribe, undefined, 'target105 listener registration is void')
    }
    watcher.reset()
    assert.equal(await watcher.getBranchForRepo('repo'), undefined)
  },
)
