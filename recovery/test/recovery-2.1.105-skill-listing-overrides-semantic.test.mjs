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
  [2596, ['unresolved', 1046587, 1070166, 'db00de232bb6eb420f145e74c36339269fc1be3cae344ce87cfce8bf8be5fb27']],
  [6783, ['unresolved', 4974919, 4974976, '20de0078e87bb359d89be456a7a5b0c4f8d5e67c97f11846c300d837f42c116d']],
  [6784, ['unresolved', 4974976, 4975035, 'd5f11054b82a45fc5c94f21a0814ecda26e5199f5d3e05aaea766f3d65951630']],
  [6785, ['unresolved', 4975035, 4975232, 'a1ca2b9c2254151cf2618ca4859e9169d70536ba6f77d8bd610bc1b509d861db']],
  [6786, ['unresolved', 4975232, 4975317, '1b3c68645b5a0a275e194c20f6450ea37947b65c6256a5de67de1f5686d89b57']],
  [6787, ['unresolved', 4975317, 4975361, '88953dbcd0627b7bfa6294871f52f7c4856a0c9a4c2265a43769ccd9818ece46']],
  [6790, ['unresolved', 4975394, 4975564, '863d29a60b1ab69749821beb86d2aeeee3c15de26e6972aea7d1fcc7b26b6e48']],
  [6791, ['unresolved', 4975564, 4975640, '6b882c5b4c6eacd50cc956afe41d97883abae1715be00f95b8e929f909e6b2e1']],
  [6793, ['unresolved', 4975816, 4976628, 'cc4d333d989e922165d32090559d7bbb08792e570b9b9a96fe2a545a234630e5']],
  [6799, ['unresolved', 4976956, 4978327, '26f8fa7c91aa81cbc3511948053a16e25031f1a976280cef7c51819be3d3a8c2']],
  [8823, ['unresolved', 5961365, 5963456, '9afa63e6046e2b8f347cbbd8d49b4c88a44af8036a39d555b739b95415318db5']],
  [11103, ['unresolved', 8690979, 8691172, '0d25ba0d4720771696da9cf20e3069f318ed21f32a821c957d84d30eb371c863']],
  [11110, ['matched', 8693200, 8693449, '94ab6c7bd8e8b1576149da0a53b2b923dfebcede4d7783058b29cbc4ea3173bf']],
  [11112, ['changed', 8693746, 8694923, 'c73e57f94a0e94d19c32f240d78645619740d4adb315a592b455e032b6ac6cbe']],
  [11250, ['unresolved', 8789508, 8795522, '0bf773063903d973879cfdc508508a5dcbef9fdbd32cefbaa53bb6298eb5bb63']],
  [13000, ['unresolved', 9869615, 9870235, 'bdf9ed528d8d784efb44cd4b8aa18e4ab054fbdbe87465fa2a39b01dd30915f7']],
  [16170, ['unresolved', 11685635, 11685662, '02fb9f4ba1c0256fdb69af2e16587c2a8a6121147b455689cb7da70bacfed38e']],
  [16171, ['unresolved', 11685662, 11685735, '09f7b9e820d152d3912c3838d1dd897ee0acf11ec4fed294ad0c8acb336fe57c']],
  [16172, ['unresolved', 11685735, 11685773, '9395eb7aab02614e90761350c26e94f8784852d2157d76cc84ba89a5a1492374']],
  [16173, ['unresolved', 11685773, 11686009, 'f11a65017d6acd2569821ce9093ff6cc697bb785ad7ed68b4bfed9bf3c593f13']],
  [18274, ['unresolved', 12697442, 12697652, '10f76b0c8681c5270fb0dfafa74d26dd1c06ee83b89b7368b308cd3d5e38dd73']],
  [18275, ['unresolved', 12697652, 12697698, '432fe9a210c98d75f5987cc0ec948496607674088a622c5d1195a2b80115f7dc']],
  [18386, ['unresolved', 12731362, 12789746, 'a19619e44713e41b4e5b83d8f9e5e8a67ef9553396a241a74ccc40f4a7980e32']],
  [19107, ['unresolved', 13549399, 13604560, '9a4b0aee2b5e06161abe44cd8f91c64a7333e23a736e273ce8851e9dcf8e3725']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function functionSource(contents, name) {
  const start = contents.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
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

async function compileFunctions(contents, names, prelude, exportedNames) {
  const ts = await loadTypeScript()
  const declarations = names
    .map(name => functionSource(contents, name))
    .join('\n')
  const javascript = ts.transpileModule(
    `${prelude}\n${declarations}\nexport { ${exportedNames.join(', ')} };`,
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
  'authenticated target105 pins the full skill override, listing, state, and caller graph',
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

    for (const [index, [classification, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    for (const fragment of [
      'skillListingMaxDescChars',
      'skillListingBudgetFraction',
      'skillOverrides',
      'skillTruncationStats',
      'disabled for model invocation in skillOverrides settings',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
      assert.equal(target.includes(fragment), true, `${fragment}: target105`)
      assert.equal(latest.includes(fragment), true, `${fragment}: target116`)
    }

    assert.equal(
      target.slice(11685635, 11685662),
      'function mh8(q){return"on"}',
      'target105 keeps override resolution latent',
    )
    assert.ok(target.includes('content:wU1(w,j,(J)=>bK8(J.name))'))
    assert.ok(target.includes('if(z47(O))return{result:!1'))
    assert.ok(
      latest.includes(
        'if(Y==="off"||Y==="user-invocable-only"&&!C_7(_,$))return{result:!1',
      ),
      'target116 permits an explicitly user-invoked user-only skill but never an off skill',
    )
  },
)

test(
  'source root owns the dual-mode target105/current runtime graph',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const settings = source('utils/settings/types.ts')
    const prompt = source('tools/SkillTool/prompt.ts')
    const commands = source('commands.ts')
    const skillTool = source('tools/SkillTool/SkillTool.ts')
    const attachments = source('utils/attachments.ts')
    const appState = source('state/AppStateStore.ts')
    const main = source('main.tsx')
    const notification = source(
      'hooks/notifs/useSkillTruncationNotification.tsx',
    )
    const repl = source('screens/REPL.tsx')
    const recovery = source('utils/conversationRecovery.ts')
    const target105Mode = commands.includes(
      'getSkillOverride(_command: Command)',
    )

    for (const fragment of [
      'skillListingMaxDescChars: z',
      '.int()',
      '.positive()',
      'skillListingBudgetFraction: z',
      '.gt(0)',
      '.lte(1)',
      'skillOverrides: z',
      "z.enum(['on', 'name-only', 'user-invocable-only', 'off'])",
    ]) {
      assert.ok(settings.includes(fragment), `settings: ${fragment}`)
    }
    for (const fragment of [
      'getInitialSettings().skillListingMaxDescChars',
      'getInitialSettings().skillListingBudgetFraction',
      'function getRawCommandDescription',
      'Math.max(1, Math.floor(calculatedBudget))',
      '_getUsageScore?: (command: Command) => number',
      "getSkillOverride(cmd) === 'name-only'",
      'new Set<number>(nameOnlyIndices)',
    ]) {
      assert.ok(prompt.includes(fragment), `prompt: ${fragment}`)
    }
    for (const fragment of [
      'export type SkillOverride',
      'export function getSkillOverride',
      'export function isSkillDisabledForModelInvocation',
      'export function isSkillHidden',
      'function isSkillToolCommand',
    ]) {
      assert.ok(commands.includes(fragment), `commands: ${fragment}`)
    }

    if (target105Mode) {
      assert.match(
        commands,
        /getSkillOverride\(_command: Command\): SkillOverride \{\s*return 'on'\s*\}/,
      )
      assert.ok(commands.includes("command.source !== 'builtin'"))
      assert.ok(
        skillTool.includes(
          'if (isSkillDisabledForModelInvocation(foundCommand))',
        ),
      )
    } else {
      for (const fragment of [
        "getSettingsForSource('policySettings')",
        "getSettingsForSource('flagSettings')",
        "if (command.disableModelInvocation) return 'user-invocable-only'",
        "if (command.source === 'plugin') return 'on'",
        "getSettingsForSource('localSettings')",
        "getSettingsForSource('projectSettings')",
        "getSettingsForSource('userSettings')",
        "command.source === 'builtin'",
      ]) {
        assert.ok(commands.includes(fragment), `current commands: ${fragment}`)
      }
      assert.ok(skillTool.includes("skillOverride === 'off'"))
      assert.ok(
        skillTool.includes(
          "skillOverride === 'user-invocable-only' &&",
        ),
      )
      assert.ok(skillTool.includes('!wasExplicitlyInvoked('))
    }

    assert.ok(
      skillTool.includes(
        'is disabled for model invocation in skillOverrides settings',
      ),
    )
    assert.ok(skillTool.includes('errorCode: 7'))
    assert.ok(attachments.includes('getSkillUsageScore(command.name)'))
    assert.match(
      attachments,
      /formatCommandsWithinBudget\([\s\S]*?command => getSkillUsageScore\(command\.name\),[\s\S]*?\)/,
    )
    assert.ok(appState.includes('skillTruncationStats: SkillTruncationStats | null'))
    assert.ok(appState.includes('skillTruncationStats: null'))
    assert.ok(main.includes('skillTruncationStats: null'))
    assert.ok(notification.includes('state => state.skillTruncationStats'))
    assert.ok(
      notification.includes(
        'useEffect(() => {}, [skillTruncationStats, addNotification, removeNotification])',
      ),
    )
    assert.ok(repl.includes('useSkillTruncationNotification()'))
    assert.ok(recovery.includes("message.attachment.type === 'skill_listing'"))
    assert.ok(recovery.includes('suppressNextSkillListing()'))
  },
)

test(
  'recovered budget and override helpers execute target105/current semantics',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const prompt = source('tools/SkillTool/prompt.ts')
    const promptRuntime = await compileFunctions(
      prompt,
      [
        'getMaxListingDescriptionChars',
        'getSkillListingBudgetFraction',
        'getCharBudget',
        'getRawCommandDescription',
        'getCommandDescription',
        'formatCommandDescription',
        'formatCommandsWithinBudget',
      ],
      `
type Command = any;
type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any;
const SKILL_BUDGET_CONTEXT_PERCENT = 0.01;
const CHARS_PER_TOKEN = 4;
const DEFAULT_CHAR_BUDGET = 8000;
const MAX_LISTING_DESC_CHARS = 1536;
const MIN_DESC_LENGTH = 20;
let settings: any = {};
let overrides: Record<string, string> = {};
const getInitialSettings = () => settings;
const setSettings = (value: any) => { settings = value };
const setOverrides = (value: Record<string, string>) => { overrides = value };
const getSkillOverride = (command: any) => overrides[command.name] ?? 'on';
const getCommandName = (command: any) => command.name;
const stringWidth = (value: string) => value.length;
const truncate = (value: string, max: number) => value.length > max ? value.slice(0, Math.max(0, max - 1)) + '\u2026' : value;
const count = (values: any[], predicate: (value: any) => boolean) => values.filter(predicate).length;
const logForDebugging = () => {};
const logEvent = () => {};
      `,
      [
        'getCharBudget',
        'formatCommandsWithinBudget',
        'setSettings',
        'setOverrides',
      ],
    )

    const previousBudget = process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
    try {
      delete process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
      promptRuntime.setSettings({ skillListingBudgetFraction: 0.02 })
      assert.equal(promptRuntime.getCharBudget(100), 8)
      assert.equal(promptRuntime.getCharBudget(), 16000)
      promptRuntime.setSettings({ skillListingBudgetFraction: 0.0000001 })
      assert.equal(promptRuntime.getCharBudget(1), 1)

      promptRuntime.setSettings({ skillListingMaxDescChars: 6 })
      promptRuntime.setOverrides({})
      const command = {
        name: 'alpha',
        description: 'abcdefghij',
        type: 'prompt',
        source: 'plugin',
      }
      assert.equal(
        promptRuntime.formatCommandsWithinBudget([command]),
        '- alpha: abcde\u2026',
      )
      promptRuntime.setOverrides({ alpha: 'name-only' })
      assert.equal(
        promptRuntime.formatCommandsWithinBudget([command]),
        '- alpha',
      )

      promptRuntime.setSettings({})
      promptRuntime.setOverrides({})
      process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET = '20'
      assert.equal(
        promptRuntime.formatCommandsWithinBudget([
          {
            name: 'core',
            description: 'b'.repeat(30),
            type: 'prompt',
            source: 'bundled',
          },
          {
            name: 'extra',
            description: 'e'.repeat(30),
            type: 'prompt',
            source: 'plugin',
          },
        ]),
        `- core: ${'b'.repeat(30)}\n- extra`,
      )
    } finally {
      if (previousBudget === undefined) {
        delete process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
      } else {
        process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET = previousBudget
      }
    }

    const commands = source('commands.ts')
    const commandRuntime = await compileFunctions(
      commands,
      [
        'getSkillOverride',
        'isSkillDisabledForModelInvocation',
        'isSkillHidden',
        'isSkillToolCommand',
      ],
      `
type Command = any;
type SkillOverride = 'on' | 'name-only' | 'user-invocable-only' | 'off';
let settingsBySource: Record<string, any> = {};
const getSettingsForSource = (name: string) => settingsBySource[name];
const setSettingsBySource = (value: Record<string, any>) => { settingsBySource = value };
      `,
      [
        'getSkillOverride',
        'isSkillDisabledForModelInvocation',
        'isSkillHidden',
        'isSkillToolCommand',
        'setSettingsBySource',
      ],
    )
    const baseCommand = {
      name: 'alpha',
      type: 'prompt',
      source: 'project',
      loadedFrom: 'skills',
      disableModelInvocation: false,
      hasUserSpecifiedDescription: true,
    }
    const target105Mode = commands.includes(
      'getSkillOverride(_command: Command)',
    )

    commandRuntime.setSettingsBySource({
      localSettings: { skillOverrides: { alpha: 'off' } },
      policySettings: { skillOverrides: { plugin: 'off' } },
    })
    if (target105Mode) {
      assert.equal(commandRuntime.getSkillOverride(baseCommand), 'on')
      assert.equal(commandRuntime.isSkillDisabledForModelInvocation(baseCommand), false)
      assert.equal(commandRuntime.isSkillHidden(baseCommand), false)
      assert.equal(
        commandRuntime.isSkillToolCommand({
          ...baseCommand,
          source: 'builtin',
        }),
        false,
      )
    } else {
      assert.equal(commandRuntime.getSkillOverride(baseCommand), 'off')
      assert.equal(commandRuntime.isSkillDisabledForModelInvocation(baseCommand), true)
      assert.equal(commandRuntime.isSkillHidden(baseCommand), true)
      assert.equal(
        commandRuntime.getSkillOverride({
          ...baseCommand,
          name: 'plugin',
          source: 'plugin',
        }),
        'off',
        'policy remains authoritative for plugin skills',
      )
      commandRuntime.setSettingsBySource({
        localSettings: { skillOverrides: { alpha: 'on', plugin: 'off' } },
        projectSettings: {
          skillOverrides: { alpha: 'user-invocable-only' },
        },
        userSettings: { skillOverrides: { alpha: 'name-only' } },
      })
      assert.equal(commandRuntime.getSkillOverride(baseCommand), 'on')
      assert.equal(
        commandRuntime.getSkillOverride({ ...baseCommand, source: 'plugin' }),
        'on',
      )
      assert.equal(
        commandRuntime.getSkillOverride({
          ...baseCommand,
          disableModelInvocation: true,
        }),
        'user-invocable-only',
      )
      commandRuntime.setSettingsBySource({
        flagSettings: { skillOverrides: { alpha: 'name-only' } },
        policySettings: { skillOverrides: { alpha: 'off' } },
      })
      assert.equal(commandRuntime.getSkillOverride(baseCommand), 'off')
      commandRuntime.setSettingsBySource({})
      assert.equal(
        commandRuntime.isSkillToolCommand({
          ...baseCommand,
          source: 'builtin',
        }),
        true,
      )
    }
  },
)
