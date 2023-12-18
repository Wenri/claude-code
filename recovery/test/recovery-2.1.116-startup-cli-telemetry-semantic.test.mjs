import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const sourceTest = selected ? test : test.skip
const bundleTest = selected && baselinePath && targetPath ? test : test.skip

const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnits = [
  [
    20_424,
    'FunctionDeclaration',
    12_918_458,
    12_918_895,
    '7d79aa29253bdb397b94713975b84fc24c94ac63fcfbfbecfe872cbe41e5b0e3',
  ],
  [
    20_433,
    'FunctionDeclaration',
    12_922_967,
    12_979_572,
    '5f3e1791357601d74dabfd793956c8df5a7489a22c9e2505ef600b53cce9e22b',
  ],
]

const targetUnits = [
  [
    20_007,
    'VariableDeclaration',
    12_163_616,
    12_164_402,
    'd7e8b8332eb4fae6775f7615fed65d3515f1a33d756af70d3d7bf223ae2aef2c',
  ],
  [
    20_008,
    'FunctionDeclaration',
    12_164_402,
    12_164_581,
    '2265f46411368608c3e4a681f35ebc0ba5f16e9bc6177a806882352764270874',
  ],
  [
    20_009,
    'FunctionDeclaration',
    12_164_581,
    12_164_719,
    '8cce8c6450317b42e28975858edf5c8cb33599af6f62642f284503f9352874d4',
  ],
  [
    20_010,
    'FunctionDeclaration',
    12_164_719,
    12_164_803,
    '42af6ae2bfa879970cafb24aa5dae2995ad51ad6ef0b39f7d13a48a4aaa2ab87',
  ],
  [
    20_011,
    'FunctionDeclaration',
    12_164_803,
    12_164_914,
    '3b635eba01f72c8f6774922e69ff427beb60de330ffdf7e3d039ef8b52447bd7',
  ],
  [
    20_013,
    'VariableDeclaration',
    12_164_926,
    12_165_226,
    '20dc01c5b13fdbbecc87d3c5a38580f61eaeee65383de37c3a18a24c8a644f84',
  ],
  [
    20_014,
    'FunctionDeclaration',
    12_165_226,
    12_165_560,
    'c166ea03dead09471157d951f2a150827180ffbf8532438568fbe7dd208b6572',
  ],
  [
    20_711,
    'FunctionDeclaration',
    13_032_083,
    13_032_669,
    '2e06eda2d16f132542f4e0473f78ed168519416964e94aca9c22446e0aca25a2',
  ],
  [
    20_720,
    'FunctionDeclaration',
    13_036_753,
    13_094_202,
    '5eedcab727da9a4eb48d70598545dc8c7e0d3f33546e1d64f0b186ab829a7017',
  ],
  [
    20_728,
    'VariableDeclaration',
    13_097_062,
    13_098_197,
    'ebf88fe378050d1f619ea6b1da9d89645b29d03285d34bf9b804c411f4bd4263',
  ],
]

const configExclusions = [
  'tipsHistory',
  'installMethod',
  'shiftEnterKeyBindingInstalled',
  'hasUsedBackslashReturn',
  'hasCompletedClaudeInChromeOnboarding',
  'remoteDialogSeen',
  'lspRecommendationIgnoredCount',
  'autoUpdates',
  'autoUpdatesProtectedForNative',
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

async function instantiateTelemetryHelpers(defaults, keys) {
  const ts = await loadTypeScript()
  const owner = source('utils/telemetry/startupTelemetry.ts')
  const bodyStart = owner.indexOf('const ENV_EXCLUSIONS')
  assert.ok(bodyStart >= 0, 'startup telemetry declarations')
  const isolated = owner
    .slice(bodyStart)
    .replaceAll('export function ', 'function ')
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return new Function(
    'DEFAULT_GLOBAL_CONFIG',
    'GLOBAL_CONFIG_KEYS',
    `${javascript}\nreturn { collectSetEnvVars, collectNonDefaultSettings, collectExplicitCliFlags }`,
  )(defaults, keys)
}

async function instantiateStartupLogger(dependencies) {
  const ts = await loadTypeScript()
  const main = source('main.tsx')
  const sourceFile = ts.createSourceFile(
    'main.tsx',
    main,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'logStartupTelemetry',
  )
  assert.ok(declaration, 'logStartupTelemetry declaration')
  const isolated = main.slice(declaration.getStart(sourceFile), declaration.end)
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const names = Object.keys(dependencies)
  return new Function(
    ...names,
    `${javascript}\nreturn logStartupTelemetry`,
  )(...names.map(name => dependencies[name]))
}

bundleTest(
  'authenticated 114→116 pins the helper module, both main call paths, and reconstructed ordering',
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(baselineBytes.length, 12_986_755)
    assert.equal(targetBytes.length, 13_102_272)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [index, nodeType, start, end, sourceHash] of baselineUnits) {
      const unit = structural.unmatchedBaseline.find(
        candidate => candidate.index === index,
      )
      assert.ok(unit, `baseline unit ${index}`)
      assert.deepEqual(
        [unit.nodeType, unit.start, unit.end, unit.sourceHash],
        [nodeType, start, end, sourceHash],
      )
      assert.equal(sha256(baseline.slice(start, end)), sourceHash)
    }
    for (const [index, nodeType, start, end, sourceHash] of targetUnits) {
      const region = structural.regions[index]
      assert.ok(region, `target unit ${index}`)
      assert.deepEqual(
        [
          region.target.nodeType,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [nodeType, start, end, sourceHash],
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash)
    }

    const oldStartup = baseline.slice(12_918_458, 12_918_895)
    const oldMain = baseline.slice(12_922_967, 12_979_572)
    const envHelper = target.slice(12_164_402, 12_164_581)
    const configHelper = target.slice(12_164_581, 12_164_719)
    const cliHelper = target.slice(12_164_719, 12_164_803)
    const equalityHelper = target.slice(12_164_803, 12_164_914)
    const helperInitializer = target.slice(12_164_926, 12_165_226)
    const startup = target.slice(13_032_083, 13_032_669)
    const main = target.slice(13_036_753, 13_094_202)
    const mainInitializer = target.slice(13_097_062, 13_098_197)

    assert.doesNotMatch(oldStartup, /set_env_var_count|nondefault_settings|theme:/)
    assert.doesNotMatch(oldMain, /tengu_cli_flags|getOptionValueSource/)
    assert.match(envHelper, /startsWith\("CLAUDE_CODE_"\)/)
    assert.match(envHelper, /startsWith\("ANTHROPIC_"\)/)
    assert.match(envHelper, /\.sort\(\)/)
    assert.match(configHelper, /for\(let .+ of .+\)/)
    assert.match(cliHelper, /===\s*"cli"/)
    assert.match(cliHelper, /\.sort\(\)/)
    assert.match(equalityHelper, /Object\.keys\(.+\)\.length===0/)
    assert.ok(helperInitializer.includes('new Set(["CLAUDE_CODE_ENTRYPOINT"])'))
    assert.ok(
      helperInitializer.includes(
        `new Set([${configExclusions.map(JSON.stringify).join(',')}])`,
      ),
    )
    assert.match(
      startup,
      /theme:.+\.theme,set_env_var_count:.+\.length,set_env_vars:.+\.join\(","\),nondefault_setting_count:.+\.length,nondefault_settings:.+\.join\(","\)/,
    )
    assert.match(
      main,
      /getOptionValueSource\(.+\).*tengu_cli_flags.*flag_count:.+\.length,flags:.+\.join\(","\)/,
    )
    assert.match(main, /setImmediate\(\(\)=>\{.+\(.+\(\)\),.+\(\)\}\)/)

    // The target has no source map, so its exact authored filename cannot be
    // authenticated. These adjacent pinned units prove a dedicated module
    // boundary between the bootstrap initializer and warning-handler code;
    // main's initializer also places that module between fastMode and
    // managedEnv. startupTelemetry.ts is the recovered canonical pathname.
    assert.equal(targetUnits[0][3], targetUnits[1][2])
    assert.equal(targetUnits[5][3], targetUnits[6][2])
    const helperInitializerName = /^var ([\w$]+)=/.exec(helperInitializer)?.[1]
    assert.ok(helperInitializerName)
    const escapedName = helperInitializerName.replaceAll('$', '\\$')
    assert.match(
      mainInitializer,
      new RegExp(`[\\w$]+\\(\\);${escapedName}\\(\\);[\\w$]+\\(\\)`),
      'main initializes the recovered helper module between two existing modules',
    )
  },
)

sourceTest(
  'source keeps the dedicated telemetry owner and exact main integration points',
  () => {
    const helper = source('utils/telemetry/startupTelemetry.ts')
    const main = source('main.tsx')
    assert.match(
      helper,
      /import \{[\s\S]*DEFAULT_GLOBAL_CONFIG,[\s\S]*GLOBAL_CONFIG_KEYS,[\s\S]*type GlobalConfig,[\s\S]*\} from '\.\.\/config\.js'/,
    )
    assert.ok(helper.includes("const ENV_EXCLUSIONS = new Set(['CLAUDE_CODE_ENTRYPOINT'])"))
    for (const key of configExclusions) {
      assert.ok(helper.includes(`'${key}'`), key)
    }
    for (const name of [
      'collectSetEnvVars',
      'collectNonDefaultSettings',
      'collectExplicitCliFlags',
    ]) {
      assert.match(main, new RegExp(`\\b${name}\\b`))
    }

    const singleWord = main.indexOf("logEvent('tengu_single_word_prompt'")
    const cliEvent = main.indexOf("logEvent('tengu_cli_flags'")
    const optionDestructure = main.indexOf('debug = false', cliEvent)
    assert.ok(singleWord >= 0)
    assert.ok(cliEvent > singleWord)
    assert.ok(optionDestructure > cliEvent)
    assert.match(
      main.slice(singleWord, optionDestructure),
      /if \(!isAnalyticsDisabled\(\)\) \{[\s\S]*collectExplicitCliFlags\(options, key => program\.getOptionValueSource\(key\)\)[\s\S]*flag_count: flags\.length[\s\S]*flags: flags\.join\(','\)/,
    )
    assert.match(
      main,
      /async function logStartupTelemetry\(globalConfig: ReturnType<typeof getGlobalConfig>\)/,
    )
    assert.match(main, /void logStartupTelemetry\(getGlobalConfig\(\)\)/)
    for (const field of [
      'theme: globalConfig.theme',
      'set_env_var_count: setEnvVars.length',
      "set_env_vars: setEnvVars.join(',')",
      'nondefault_setting_count: nonDefaultSettings.length',
      "nondefault_settings: nonDefaultSettings.join(',')",
    ]) {
      assert.ok(main.includes(field), field)
    }
  },
)

sourceTest(
  'actual helpers and startup logger preserve filtering, ordering, defaults, and event fields',
  async () => {
    const defaults = {
      theme: 'dark',
      verbose: false,
      env: {},
      copyFullResponse: false,
      tipsHistory: {},
      autoUpdates: true,
    }
    const keys = [
      'copyFullResponse',
      'theme',
      'verbose',
      'env',
      'tipsHistory',
      'autoUpdates',
    ]
    const helpers = await instantiateTelemetryHelpers(defaults, keys)
    assert.deepEqual(
      helpers.collectSetEnvVars({
        ZZZ: 'ignored',
        CLAUDE_CODE_ZETA: '1',
        ANTHROPIC_EMPTY: '',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        ANTHROPIC_ALPHA: 'yes',
        CLAUDE_CODE_UNDEFINED: undefined,
      }),
      ['ANTHROPIC_ALPHA', 'CLAUDE_CODE_ZETA'],
    )
    assert.deepEqual(
      helpers.collectNonDefaultSettings({
        ...defaults,
        copyFullResponse: true,
        theme: 'light',
        verbose: false,
        env: {},
        tipsHistory: { hidden: 1 },
        autoUpdates: false,
      }),
      ['copyFullResponse', 'theme'],
    )
    assert.deepEqual(
      helpers.collectExplicitCliFlags(
        { verbose: true, print: false, model: 'opus' },
        key => (key === 'verbose' || key === 'model' ? 'cli' : 'default'),
      ),
      ['model', 'verbose'],
    )

    const events = []
    const globalConfig = { theme: 'light' }
    const logStartupTelemetry = await instantiateStartupLogger({
      isAnalyticsDisabled: () => false,
      getIsGit: async () => true,
      getWorktreeCount: async () => 3,
      getGhAuthStatus: async () => 'authenticated',
      collectSetEnvVars: () => ['ANTHROPIC_ALPHA', 'CLAUDE_CODE_ZETA'],
      collectNonDefaultSettings: config => {
        assert.equal(config, globalConfig)
        return ['copyFullResponse', 'theme']
      },
      logEvent: (name, fields) => events.push([name, fields]),
      SandboxManager: {
        isSandboxingEnabled: () => true,
        areUnsandboxedCommandsAllowed: () => false,
        isAutoAllowBashIfSandboxedEnabled: () => true,
      },
      isAutoUpdaterDisabled: () => false,
      getInitialSettings: () => ({ prefersReducedMotion: true }),
      getCertEnvVarTelemetry: () => ({ has_client_cert: true }),
    })
    await logStartupTelemetry(globalConfig)
    assert.deepEqual(events, [
      [
        'tengu_startup_telemetry',
        {
          is_git: true,
          worktree_count: 3,
          gh_auth_status: 'authenticated',
          sandbox_enabled: true,
          are_unsandboxed_commands_allowed: false,
          is_auto_bash_allowed_if_sandbox_enabled: true,
          auto_updater_disabled: false,
          prefers_reduced_motion: true,
          theme: 'light',
          set_env_var_count: 2,
          set_env_vars: 'ANTHROPIC_ALPHA,CLAUDE_CODE_ZETA',
          nondefault_setting_count: 2,
          nondefault_settings: 'copyFullResponse,theme',
          has_client_cert: true,
        },
      ],
    ])
  },
)
