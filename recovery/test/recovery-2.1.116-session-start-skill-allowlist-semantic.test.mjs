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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const targetUnits = {
  bootstrapExports: [
    365,
    24883,
    31685,
    '0893601f791f3245dc230fc01aa79f5bffe48d02e356a39b6010292d4fa4b557',
  ],
  initialState: [
    366,
    31685,
    34332,
    'e3f56ca8df4ad707dcb9f4bb46f35e0ad78078d64c6ba65cc298fa4fe9b5c5fc',
  ],
  getSessionStartType: [
    479,
    41018,
    41060,
    'cb584facfc637a2e7eb1312249244adbc7b8ba8f47ecde0661d736b9ef44742f',
  ],
  setSessionStartType: [
    480,
    41060,
    41098,
    'a735363d3a2a37fb519cd1bd4092bcdce54bedc2d226e04b719ab3c2329cb439',
  ],
  getSessionSkillAllowlist: [
    558,
    45892,
    45938,
    'a8825a2b88833125e7950ef652f5ea6015ee2bb7e8e25fb2102fb6423f03686b',
  ],
  setSessionSkillAllowlist: [
    559,
    45938,
    45981,
    'b6052699876deac318ecba7a0c67cfa88294a728361e17d7ca219af1ca170e75',
  ],
  skillCounts: [
    9558,
    4828413,
    4828524,
    'f82ac716f9755cf9bddf73a9c296bd9cc7dd2181187500dc45c248f4f960d8a9',
  ],
  limitedSkills: [
    9559,
    4828524,
    4828575,
    '53ca2ed7fd32a4a54e9c98ec3b294229e3e00f00646d4c2944a4e77b625dc885',
  ],
  skillTool: [
    12607,
    7886772,
    7893229,
    '7cc9e815cbbb84a383a6012483db664a809e0b449c4bfccb84beea5707bd7c9a',
  ],
  attachments: [
    13830,
    8745365,
    8746025,
    'e877d1aa1271b5cca5f07ef6879d56a6b42b419776fa136874d4d50d34aa905a',
  ],
  allowlistFilter: [
    17735,
    11006315,
    11006426,
    '6567d412d6f898f47cd25c03dae9292a1ebd8e0e169452a9c0ccb44bd8312aff',
  ],
  guidance: [
    18163,
    11208530,
    11209462,
    'bfda103a823fb43f5036df7c6f4940975d5fea83f5743a75a0cbae5856e273e4',
  ],
  telemetry: [
    18427,
    11377775,
    11378020,
    '14b4c7ea9089c07ff7a9d9ffb4bc9ccdc68d5c732e41859ae7d67728c2ff6d8a',
  ],
  parseStartType: [
    20409,
    12813938,
    12814229,
    'cfdf12366bd2965bbd7968a14e2c42dc95ccde56d0448a9042db4ba9186343a6',
  ],
  sdkInitialize: [
    20586,
    12956338,
    12958741,
    '28469fa3cb777f1d1b1093637f52ac245fe62f854c89091d8d6ff14dbbc9803d',
  ],
  main: [
    20718,
    13034448,
    13036233,
    'd801e6a145a79847b94ea8aac66f09b4d1af60eabe03a0601bf5592336b16224',
  ],
}

const typedRows = [
  [4, 'setSessionStartType', 25345, 25364],
  [5, 'setSessionSkillAllowlist', 25398, 25422],
  [7, 'getSessionStartType', 28838, 28857],
  [8, 'getSessionSkillAllowlist', 28891, 28915],
  [10, 'sessionStartType', 32439, 32455],
  [11, 'sessionSkillAllowlist', 33810, 33831],
  [12, 'sessionStartType', 41043, 41059],
  [13, 'sessionStartType', 41079, 41095],
  [14, 'sessionSkillAllowlist', 45916, 45937],
  [15, 'sessionSkillAllowlist', 45957, 45978],
  [492, " is not in this session's skills allowlist", 7888806, 7888848],
  [688, 'start_type', 11378001, 11378011],
  [905, '"--from-pr"', 12814056, 12814067],
  [906, '"--resume="', 12814095, 12814106],
  [907, '"--from-pr="', 12814122, 12814134],
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
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

async function loadExtractedFunctions(relative, functionNames, prelude = '') {
  const ts = await loadTypeScript()
  const owner = source(relative)
  const parsed = ts.createSourceFile(
    relative,
    owner,
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const snippets = []
  for (const name of functionNames) {
    const declaration = parsed.statements.find(
      statement =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    )
    assert.ok(declaration, `${relative} declares ${name}`)
    snippets.push(declaration.getText(parsed).replace(/^export\s+/, ''))
  }
  const javascript = ts.transpileModule(
    `${prelude}\n${snippets.join('\n')}\nmodule.exports = { ${functionNames.join(', ')} }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('module', 'exports', javascript)(module, module.exports)
  return module.exports
}

test(
  'target116 authenticates session-start and session-skill state propagation',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [name, [index, start, end, sourceHash]] of Object.entries(
      targetUnits,
    )) {
      const region = structural.regions[index]
      assert.equal(
        region.classification,
        'unresolved',
        `${name} classification`,
      )
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        name,
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash, name)
    }

    for (const [row, value, start, end] of typedRows) {
      assert.equal(target.slice(start, end), value, `typed-audit row ${row}`)
    }

    assert.doesNotMatch(baseline, /sessionStartType|sessionSkillAllowlist/)
    assert.match(target, /sessionStartType:"fresh"/)
    assert.match(target, /sessionSkillAllowlist:void 0/)
    assert.match(
      target.slice(
        targetUnits.allowlistFilter[1],
        targetUnits.allowlistFilter[2],
      ),
      /endsWith\(`:\$\{[^}]+\}`\)/,
    )
    assert.match(
      target.slice(targetUnits.telemetry[1], targetUnits.telemetry[2]),
      /start_type:/,
    )
    assert.match(
      target.slice(targetUnits.main[1], targetUnits.main[2]),
      /process\.argv\.slice\(2\)[\s\S]*\([^)]+\)\)/,
    )
  },
)

test(
  'source preserves exact start-type parsing around --',
  sourceOptions,
  async () => {
    const { parseSessionStartType } = await loadExtractedFunctions(
      'src/main.tsx',
      ['parseSessionStartType'],
    )
    assert.equal(parseSessionStartType([]), 'fresh')
    assert.equal(parseSessionStartType(['--resume', 'id']), 'resume')
    assert.equal(parseSessionStartType(['--from-pr=123']), 'resume')
    assert.equal(parseSessionStartType(['-c']), 'continue')
    assert.equal(parseSessionStartType(['--', '--resume']), 'fresh')
    assert.equal(
      parseSessionStartType(['--continue', '--', '--resume']),
      'continue',
    )
  },
)

test(
  'source filters only explicitly allowlisted main-session skills',
  sourceOptions,
  async () => {
    const { filterCommandsBySessionSkillAllowlist } =
      await loadExtractedFunctions(
        'src/commands.ts',
        ['commandMatchesName', 'filterCommandsBySessionSkillAllowlist'],
        'const getCommandName = command => command.userFacingName?.() ?? command.name',
      )
    const commands = [
      { name: 'alpha', aliases: ['a'] },
      { name: 'plugin:beta', userFacingName: () => 'beta-display' },
      { name: 'gamma' },
    ]
    assert.equal(
      filterCommandsBySessionSkillAllowlist(commands, undefined),
      commands,
    )
    assert.deepEqual(filterCommandsBySessionSkillAllowlist(commands, []), [])
    assert.deepEqual(
      filterCommandsBySessionSkillAllowlist(commands, ['a', 'beta']),
      commands.slice(0, 2),
    )
    assert.deepEqual(
      filterCommandsBySessionSkillAllowlist(commands, ['beta-display']),
      [commands[1]],
    )
  },
)

test(
  'source wires state through telemetry, SDK init, listings, validation, and guidance',
  sourceOptions,
  () => {
    const state = source('src/bootstrap/state.ts')
    const main = source('src/main.tsx')
    const init = source('src/entrypoints/init.ts')
    const print = source('src/cli/print.ts')
    const prompt = source('src/tools/SkillTool/prompt.ts')
    const skillTool = source('src/tools/SkillTool/SkillTool.ts')
    const attachments = source('src/utils/attachments.ts')
    const guidance = source('src/constants/prompts.ts')

    assert.match(state, /sessionStartType: 'fresh'/)
    assert.match(state, /sessionSkillAllowlist: undefined/)
    assert.match(state, /getSessionStartType\(\)[\s\S]*STATE\.sessionStartType/)
    assert.match(
      state,
      /setSessionStartType\([\s\S]*STATE\.sessionStartType = value/,
    )
    assert.match(
      state,
      /getSessionSkillAllowlist\(\)[\s\S]*STATE\.sessionSkillAllowlist/,
    )
    assert.match(
      state,
      /setSessionSkillAllowlist\([\s\S]*STATE\.sessionSkillAllowlist = skills/,
    )
    assert.ok(
      main.indexOf('setIsInteractive(isInteractive)') <
        main.indexOf('setSessionStartType(parseSessionStartType(cliArgs))'),
    )
    assert.match(
      init,
      /getSessionCounter\(\)\?\.add\(1, \{ start_type: getSessionStartType\(\) \}\)/,
    )
    assert.match(
      print,
      /request\.skills !== undefined[\s\S]*setSessionSkillAllowlist\(request\.skills\)/,
    )
    assert.match(
      prompt,
      /filterCommandsBySessionSkillAllowlist\([\s\S]*getSessionSkillAllowlist\(\)/,
    )
    assert.match(
      skillTool,
      /context\.agentId === undefined \? getSessionSkillAllowlist\(\) : undefined/,
    )
    assert.match(skillTool, /is not in this session's skills allowlist/)
    assert.match(
      attachments,
      /toolUseContext\.agentId === undefined[\s\S]*getSessionSkillAllowlist\(\)/,
    )
    assert.match(
      guidance,
      /sessionSkillAllowlist === undefined[\s\S]*sessionSkillAllowlist\.length > 0/,
    )
  },
)
