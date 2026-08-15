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
const target116Sha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnit = {
  index: 14_478,
  nodeType: 'FunctionDeclaration',
  start: 10_865_475,
  end: 10_867_632,
  sourceHash:
    'b5a04aecfcc136add2421987d2e2689ab0bec85c568a4efcd2249ffe81d27e6d',
}
const targetUnits = [
  {
    index: 14_524,
    nodeType: 'ExpressionStatement',
    start: 10_888_467,
    end: 10_888_508,
    sourceHash:
      '51facd668fec35b4883503bc5fd4ebbeaf040299ddfc404657256ef17eaaa4f4',
  },
  {
    index: 14_525,
    nodeType: 'FunctionDeclaration',
    start: 10_888_508,
    end: 10_889_134,
    sourceHash:
      '2126816fc235841db2f6cff6044cd0a7b54788f9e0d5a324de765f0cab165d7a',
  },
  {
    index: 14_528,
    nodeType: 'FunctionDeclaration',
    start: 10_889_270,
    end: 10_890_828,
    sourceHash:
      'afb28af527514196d39692a637100f65984a0fa390b0ee55882e4a9ab7124f7d',
  },
]
const target116Units = [
  {
    index: 16_287,
    start: 10_309_940,
    end: 10_309_981,
    sourceHash:
      '9f1aa9630ddf37685b73f7f19b53f47c92e8204d08d0d6137bdfa5a31eae456d',
  },
  {
    index: 16_288,
    start: 10_309_981,
    end: 10_310_607,
    sourceHash:
      '6a2ba7b05344caf48158f59fd3c67d9433b70d30a891052338766fe92772e815',
  },
  {
    index: 16_291,
    start: 10_310_743,
    end: 10_312_301,
    sourceHash:
      'b1786d5543e05e057ac040fe41068767ff36325fcb4cbc2ab31c882b274206d1',
  },
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
      ? 'the authenticated inner CLAUDE_CODE_2_1_116_BUNDLE is required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
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
  const loaded = await import(pathToFileURL(candidate).href)
  return loaded.default ?? loaded
}

function namedFunctionText(ts, owner, name, label) {
  const ast = ts.createSourceFile(
    label,
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  let found
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      assert.equal(found, undefined, `${label}: ${name} must be unique`)
      found = node
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(found?.body, `${label}: ${name} must be reachable`)
  return found.getText(ast).replace(/^export /, '')
}

function replaceDynamicImport(declaration, specifier, replacement) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `await\\s+import\\(\\s*['"]${escaped}['"]\\s*\\)`,
    'g',
  )
  const rewritten = declaration.replace(pattern, replacement)
  assert.notEqual(
    rewritten,
    declaration,
    `${specifier} dynamic import must be reachable`,
  )
  return rewritten
}

function evaluateTypeScript(ts, harness, filename) {
  const result = ts.transpileModule(harness, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(
    errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')),
    [],
    `${filename} must transpile`,
  )
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports
}

async function instantiateGitContext() {
  const ts = await loadTypeScript()
  let declaration = namedFunctionText(
    ts,
    source('bridge/gitSessionContext.ts'),
    'buildGitSessionContext',
    'gitSessionContext.ts',
  )
  declaration = replaceDynamicImport(
    declaration,
    '../utils/detectRepository.js',
    '({ parseGitRemote: mockParseGitRemote, parseGitHubRepository: mockParseGitHubRepository })',
  )
  declaration = replaceDynamicImport(
    declaration,
    '../utils/git.js',
    '({ getDefaultBranch: mockGetDefaultBranch })',
  )
  return evaluateTypeScript(
    ts,
    `
      let fallback = 'trunk'
      let fallbackCalls = 0
      const mockParseGitRemote = value => value.startsWith('ssh://')
        ? { host: 'git.example', owner: 'acme', name: 'widget' }
        : null
      const mockParseGitHubRepository = value => value.startsWith('github:')
        ? value.slice('github:'.length)
        : null
      const mockGetDefaultBranch = async () => {
        fallbackCalls += 1
        return fallback
      }
      ${declaration}
      module.exports = {
        buildGitSessionContext,
        fallbackCalls: () => fallbackCalls,
        resetFallbackCalls: () => { fallbackCalls = 0 },
        setFallback: value => { fallback = value },
      }
    `,
    'bridge-git-session-context-harness.ts',
  )
}

async function instantiateCreateSession() {
  const ts = await loadTypeScript()
  let declaration = namedFunctionText(
    ts,
    source('bridge/createSession.ts'),
    'createBridgeSession',
    'createSession.ts',
  )
  const imports = [
    [
      '../utils/auth.js',
      '({ getClaudeAIOAuthTokens: mockGetClaudeAIOAuthTokens })',
    ],
    [
      '../services/oauth/client.js',
      '({ getOrganizationUUID: mockGetOrganizationUUID })',
    ],
    [
      '../constants/oauth.js',
      '({ getOauthConfig: mockGetOauthConfig })',
    ],
    [
      '../utils/teleport/api.js',
      '({ getOAuthHeaders: mockGetOAuthHeaders })',
    ],
    [
      '../utils/model/model.js',
      '({ getMainLoopModel: mockGetMainLoopModel })',
    ],
    [
      '../bootstrap/state.js',
      '({ getOriginalCwd: mockGetOriginalCwd })',
    ],
    ['axios', '({ default: mockAxios })'],
  ]
  for (const [specifier, replacement] of imports) {
    declaration = replaceDynamicImport(declaration, specifier, replacement)
  }
  return evaluateTypeScript(
    ts,
    `
      let fallbackToken = 'fallback-token'
      let organization = 'org-1'
      let response = { status: 201, data: { id: 'session-1' } }
      let posted = null
      let helperCalls = []
      const helperResult = {
        sources: [{ type: 'git_repository', url: 'https://git.example/acme/widget', revision: 'topic' }],
        outcomes: [{ type: 'git_repository', git_info: { type: 'github', repo: 'acme/widget', branches: ['topic'] } }],
      }
      const buildGitSessionContext = async (...args) => {
        helperCalls.push(args)
        return helperResult
      }
      const mockGetClaudeAIOAuthTokens = () => fallbackToken
        ? { accessToken: fallbackToken }
        : undefined
      const mockGetOrganizationUUID = async () => organization
      const mockGetOauthConfig = () => ({ BASE_API_URL: 'https://api.example' })
      const mockGetOAuthHeaders = token => ({ Authorization: 'Bearer ' + token })
      const mockGetMainLoopModel = () => 'claude-test'
      const mockGetOriginalCwd = () => '/workspace/project'
      const mockAxios = {
        post: async (url, body, options) => {
          posted = { url, body, options }
          return response
        },
      }
      const logs = []
      const logForDebugging = value => { logs.push(value) }
      const errorMessage = value => String(value)
      const extractErrorDetail = () => null
      ${declaration}
      module.exports = {
        configure: options => {
          if ('fallbackToken' in options) fallbackToken = options.fallbackToken
          if ('organization' in options) organization = options.organization
          if ('response' in options) response = options.response
        },
        reset: () => {
          posted = null
          helperCalls = []
          logs.length = 0
          fallbackToken = 'fallback-token'
          organization = 'org-1'
          response = { status: 201, data: { id: 'session-1' } }
        },
        run: options => createBridgeSession({
          environmentId: 'env-1',
          title: 'Bridge test',
          events: [],
          gitRepoUrl: 'ssh://acme/widget',
          branch: 'topic',
          signal: {},
          baseUrl: 'https://override.example',
          getAccessToken: options?.omitOverride
            ? undefined
            : () => options?.accessToken ?? 'override-token',
          permissionMode: 'acceptEdits',
        }),
        snapshot: () => JSON.parse(JSON.stringify({ posted, helperCalls, logs })),
      }
    `,
    'bridge-create-session-harness.ts',
  )
}

test('2.1.97 authenticates the bridge Git context helper and reachable session creator', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const unmatched = structural.unmatchedBaseline.find(
    unit => unit.index === baselineUnit.index,
  )
  assert.ok(unmatched, 'baseline createBridgeSession unit must be unmatched')
  assert.deepEqual(
    [
      unmatched.nodeType,
      unmatched.start,
      unmatched.end,
      unmatched.sourceHash,
    ],
    [
      baselineUnit.nodeType,
      baselineUnit.start,
      baselineUnit.end,
      baselineUnit.sourceHash,
    ],
  )
  const baselineOwner = baseline.slice(baselineUnit.start, baselineUnit.end)
  assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)

  const slices = new Map()
  for (const unit of targetUnits) {
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved', `${unit.index}: class`)
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
      `${unit.index}: identity`,
    )
    const slice = target.slice(unit.start, unit.end)
    assert.equal(sha256(slice), unit.sourceHash, `${unit.index}: bytes`)
    slices.set(unit.index, slice)
  }

  assert.match(baselineOwner, /branches:\[`claude\/\$\{\w+\|\|"task"\}`\]/)
  assert.doesNotMatch(baselineOwner, /cwd:|reuse_outcome_branches/)
  assert.match(slices.get(14_524), /buildGitSessionContext/)
  assert.match(slices.get(14_525), /branches:\w+\?\[\w+\]:\[\]/)
  assert.match(
    slices.get(14_528),
    /session_context:\{sources:\w+,outcomes:\w+,model:\w+\(\),cwd:\w+\(\),reuse_outcome_branches:!0\}/,
  )
  assert.doesNotMatch(slices.get(14_528), /claude\//)
  assert.equal(occurrences(target, 'buildGitSessionContext'), 2)
  assert.equal(occurrences(target, 'createBridgeSession'), 3)
})

test('source resolves one revision for sources and outcomes', sourceOptions, async () => {
  const helper = source('bridge/gitSessionContext.ts')
  for (const fragment of [
    'export async function buildGitSessionContext',
    'branch || defaultBranch || (await getDefaultBranch()) || undefined',
    'url: `https://${host}/${owner}/${name}`',
    'branches: revision ? [revision] : []',
    "return build('github.com', owner, name, revision)",
  ]) {
    assert.ok(helper.includes(fragment), fragment)
  }

  const runtime = await instantiateGitContext()
  assert.deepEqual(
    await runtime.buildGitSessionContext('ssh://acme/widget', 'topic'),
    {
      sources: [
        {
          type: 'git_repository',
          url: 'https://git.example/acme/widget',
          revision: 'topic',
        },
      ],
      outcomes: [
        {
          type: 'git_repository',
          git_info: {
            type: 'github',
            repo: 'acme/widget',
            branches: ['topic'],
          },
        },
      ],
    },
  )
  assert.equal(runtime.fallbackCalls(), 0)

  assert.deepEqual(
    await runtime.buildGitSessionContext('github:octo/repo', '', 'main'),
    {
      sources: [
        {
          type: 'git_repository',
          url: 'https://github.com/octo/repo',
          revision: 'main',
        },
      ],
      outcomes: [
        {
          type: 'git_repository',
          git_info: {
            type: 'github',
            repo: 'octo/repo',
            branches: ['main'],
          },
        },
      ],
    },
  )
  assert.equal(runtime.fallbackCalls(), 0)

  runtime.setFallback('develop')
  assert.equal(
    (
      await runtime.buildGitSessionContext(
        'ssh://acme/widget',
        '',
      )
    ).sources[0].revision,
    'develop',
  )
  assert.equal(runtime.fallbackCalls(), 1)
  runtime.resetFallbackCalls()
  assert.deepEqual(
    await runtime.buildGitSessionContext('invalid', ''),
    { sources: [], outcomes: [] },
  )
  assert.equal(runtime.fallbackCalls(), 0)
})

test('source posts cwd and outcome-reuse policy through every live bridge creator', sourceOptions, async () => {
  const creator = source('bridge/createSession.ts')
  for (const fragment of [
    "import { buildGitSessionContext } from './gitSessionContext.js'",
    "const { getOriginalCwd } = await import('../bootstrap/state.js')",
    'const { sources, outcomes } = await buildGitSessionContext(',
    'sources,\n      outcomes,',
    'cwd: getOriginalCwd()',
    'reuse_outcome_branches: true',
  ]) {
    assert.ok(creator.includes(fragment), fragment)
  }
  assert.equal(creator.includes('branches: [`claude/'), false)

  const init = source('bridge/initReplBridge.ts')
  const main = source('bridge/bridgeMain.ts')
  assert.match(init, /createSession:\s*opts\s*=>\s*createBridgeSession\(/)
  assert.equal(occurrences(main, 'await createBridgeSession({'), 2)

  const runtime = await instantiateCreateSession()
  assert.equal(await runtime.run(), 'session-1')
  const { posted, helperCalls } = runtime.snapshot()
  assert.deepEqual(helperCalls, [['ssh://acme/widget', 'topic']])
  assert.equal(posted.url, 'https://override.example/v1/sessions')
  assert.deepEqual(posted.body.session_context, {
    sources: [
      {
        type: 'git_repository',
        url: 'https://git.example/acme/widget',
        revision: 'topic',
      },
    ],
    outcomes: [
      {
        type: 'git_repository',
        git_info: {
          type: 'github',
          repo: 'acme/widget',
          branches: ['topic'],
        },
      },
    ],
    model: 'claude-test',
    cwd: '/workspace/project',
    reuse_outcome_branches: true,
  })
  assert.equal(posted.body.environment_id, 'env-1')
  assert.equal(posted.body.permission_mode, 'acceptEdits')
  assert.equal(posted.options.headers.Authorization, 'Bearer override-token')

  runtime.reset()
  runtime.configure({ fallbackToken: null })
  assert.equal(await runtime.run({ omitOverride: true }), null)
  assert.deepEqual(runtime.snapshot().helperCalls, [])
  assert.equal(runtime.snapshot().posted, null)
})

test('the authenticated 2.1.116 inner bundle retains the 2.1.97 context contract', persistenceOptions, () => {
  const bytes = fs.readFileSync(target116Path)
  assert.equal(sha256(bytes), target116Sha256)
  const target116 = bytes.toString('utf8')
  const slices = new Map()
  for (const unit of target116Units) {
    const slice = target116.slice(unit.start, unit.end)
    assert.equal(sha256(slice), unit.sourceHash, `${unit.index}: bytes`)
    slices.set(unit.index, slice)
  }
  assert.match(slices.get(16_287), /buildGitSessionContext/)
  assert.match(slices.get(16_288), /branches:\w+\?\[\w+\]:\[\]/)
  assert.match(
    slices.get(16_291),
    /session_context:\{sources:\w+,outcomes:\w+,model:\w+\(\),cwd:\w+\(\),reuse_outcome_branches:!0\}/,
  )
  assert.doesNotMatch(slices.get(16_291), /claude\//)
})
