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

const units = new Map([
  [
    5924,
    [
      4199619,
      4199665,
      'ImportDeclaration',
      '3e91e41db187fca3b549ba7fef2db448f7b39ffd696ff7756114fe391d8350a8',
    ],
  ],
  [
    5928,
    [
      4200000,
      4202390,
      'FunctionDeclaration',
      'd0c67d6b839a211b1ad298a1a98f2f3aa73bd1d54abe4ecf7f440f5d0c183847',
    ],
  ],
  [
    5938,
    [
      4203576,
      4205248,
      'FunctionDeclaration',
      '5dff8bdc1ae79b8e48fbc0a2b3a06ce77ef3dc31d46a3015691500589918fd89',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
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

async function executeSource(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const state = { appends: [], mkdirs: [], opened: [] }
  const fsPromises = {
    appendFile: async (...args) => state.appends.push(args),
    mkdir: async (...args) => state.mkdirs.push(args),
    open: async (...args) => {
      state.opened.push(args)
      return { close: async () => {} }
    },
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id === 'fs/promises') return fsPromises
      if (id === 'os') {
        return { homedir: () => '/home/runner', tmpdir: () => '/tmp' }
      }
      if (id === 'path') return path
      if (id.endsWith('/bootstrap/state.js')) {
        return { getOriginalCwd: () => '/home/runner/repo' }
      }
      if (id.endsWith('/envUtils.js')) {
        return {
          isEnvDefinedFalsy: value => value === '0' || value === 'false',
          isEnvTruthy: value => value === '1' || value === 'true',
        }
      }
      if (id.endsWith('/which.js')) {
        return { whichSync: command => (command === 'bwrap' ? '/usr/bin/bwrap' : null) }
      }
      throw new Error(`unexpected subprocessEnv import: ${id}`)
    },
    module.exports,
    module,
  )
  return { exports: module.exports, state }
}

test(
  'authenticated target105 captures runner, workspace, and PATH isolation state',
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
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    for (const [fragment, count] of [
      ['runnerFileCommandsDir', 2],
      ['GITHUB_WORKSPACE', 2],
      ['inline-comments-buffer.jsonl', 2],
      ['/run/dbus', 1],
      ['pathDirs', 3],
      ['actions-runner', 1],
    ]) {
      assert.equal(occurrences(baseline, fragment), 0, `${fragment}: baseline`)
      assert.equal(occurrences(target, fragment), count, `${fragment}: target`)
      assert.equal(occurrences(latest, fragment), count, `${fragment}: latest`)
    }

    const targetInit = target.slice(4200000, 4202390)
    const targetConfig = target.slice(4203576, 4205248)
    assert.ok(targetInit.includes('process.platform==="linux"'))
    assert.ok(targetInit.includes('.split(":").map('))
    assert.ok(targetInit.includes('/tmp/inline-comments-buffer.jsonl'))
    assert.ok(targetInit.includes('.git/info/exclude'))
    assert.ok(targetConfig.includes('/run/dbus'))
    assert.ok(targetConfig.includes('/run/user'))
    assert.ok(targetConfig.includes('/actions-runner'))
    assert.ok(targetConfig.includes('.gitmodules'))

    const latestMarker = latest.indexOf('runnerFileCommandsDir')
    assert.ok(latestMarker > 0)
    const latestInit = latest.slice(latestMarker - 500, latestMarker + 3500)
    assert.ok(latestInit.includes('!!eN("bwrap")'))
    assert.equal(latestInit.includes('process.platform==="linux"'), false)
  },
)

test(
  'source sandbox materializes captured paths and denies every mutable runner surface',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const ownerPath = path.join(sourceRoot, 'utils/subprocessEnv.ts')
    const contents = fs.readFileSync(ownerPath, 'utf8')
    const currentSource = sourceRoot === path.join(repositoryRoot, 'src')

    for (const fragment of [
      'runnerFileCommandsDir',
      'workspaceDenyPaths',
      "'/tmp/inline-comments-buffer.jsonl'",
      "'/run/dbus'",
      "'/run/user'",
      '`${home}/runners`',
      '`${home}/actions-runner`',
      '# claude-code scrub-mode stubs',
      "path.normalize(directory).replace(/\\/+$/, '')",
    ]) {
      assert.ok(contents.includes(fragment), fragment)
    }
    assert.equal(
      /process\.platform === 'linux' && whichSync\('bwrap'\)/.test(contents),
      !currentSource,
    )
    assert.equal(contents.includes("if (process.platform !== 'linux') return"), !currentSource)

    const saved = new Map()
    const env = {
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      CLAUDE_CODE_TMPDIR: '/tmp/claude-test',
      GITHUB_ACTION_PATH: '/home/runner/work/_actions/org/action/v1',
      GITHUB_ENV: '/home/runner/work/_temp/_runner_file_commands/set_env_1',
      GITHUB_EVENT_PATH: '/home/runner/work/_temp/event.json',
      GITHUB_WORKSPACE: '/home/runner/work/project',
      PATH: '/usr/bin:/home/runner/bin/:/opt/tool/bin///:/workspace/bin:/tmp',
    }
    for (const [key, value] of Object.entries(env)) {
      saved.set(key, process.env[key])
      process.env[key] = value
    }
    try {
      const runtime = await executeSource(contents)
      await runtime.exports.assertScrubSandboxAvailable()
      const config = runtime.exports.scrubSandboxConfig().filesystem
      assert.deepEqual(config.allowWrite, [
        '/home',
        '/root',
        '/tmp',
        '/var',
        '/opt',
        '/run',
        '/mnt',
      ])
      assert.ok(config.denyRead.includes('/run/dbus'))
      assert.ok(config.denyRead.includes('/run/user'))
      for (const denied of [
        '/home/runner/bin',
        '/opt/tool/bin',
        '/home/runner/work/_temp/_runner_file_commands',
        '/home/runner/work/_actions/org/action/v1',
        '/home/runner/work/_actions',
        '/home/runner/work/_temp/event.json',
        '/home/runner/runners',
        '/home/runner/actions-runner',
        '/tmp/inline-comments-buffer.jsonl',
        '/home/runner/work/project/.git/config',
        '/home/runner/work/project/.github',
      ]) {
        assert.ok(config.denyWrite.includes(denied), denied)
      }
      assert.equal(config.denyWrite.includes('/usr/bin'), false)
      assert.equal(config.denyWrite.includes('/workspace/bin'), false)

      const opened = runtime.state.opened.map(([filename]) => filename)
      assert.ok(opened.includes('/tmp/inline-comments-buffer.jsonl'))
      assert.ok(opened.includes('/home/runner/work/project/.git/config'))
      assert.ok(opened.includes('/home/runner/work/project/.git/info/exclude'))
      const made = runtime.state.mkdirs.map(([directory]) => directory)
      assert.ok(made.includes('/home/runner/work/_temp/_runner_file_commands'))
      assert.ok(made.includes('/home/runner/bin'))
      assert.ok(made.includes('/opt/tool/bin'))
      assert.equal(made.includes('/usr/bin'), false)
      assert.equal(runtime.state.appends.length, 1)
      assert.match(runtime.state.appends[0][1], /# claude-code scrub-mode stubs/)
      assert.match(runtime.state.appends[0][1], /\/package\.json/)
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  },
)
