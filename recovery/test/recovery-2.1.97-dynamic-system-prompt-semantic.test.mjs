import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

const pinnedUnits = new Map([
  [
    12511,
    [
      9647533,
      9648237,
      '7c362ad31cbd40080d21c4426a0a16e771565ea2671127581e6288786ef7faf1',
      'FunctionDeclaration',
    ],
  ],
  [
    12523,
    [
      9653564,
      9658152,
      'c0807a79d871f838c4c3f94c43af9cbfdb0fc2807550ecade2dbdd7350dfd67f',
      'FunctionDeclaration',
    ],
  ],
  [
    13808,
    [
      10433156,
      10433514,
      'abf289f4e2ffc63f6c14929a89ef5607e0de37e29175a2ec5dcb2fbb699d4862',
      'FunctionDeclaration',
    ],
  ],
  [
    16215,
    [
      11691556,
      11692459,
      'df0cfffe24535af534ee282dc92d1b8ec11e8bf5961bd317baf13716de7d6f40',
      'FunctionDeclaration',
    ],
  ],
  [
    16216,
    [
      11692459,
      11692600,
      '39ee0721982428ba4521e22ec717d8b04c7889027fd67b30c4d7d06a02eccce9',
      'FunctionDeclaration',
    ],
  ],
  [
    16217,
    [
      11692600,
      11692845,
      '564788d7aaca4e208855ba785d1bb8f6bbdece424c813077adb31b6807c95107',
      'FunctionDeclaration',
    ],
  ],
  [
    17681,
    [
      12410159,
      12421708,
      'ccfe32def97723b812b0af8091485112f2bc1dfe60ca7f5ee0c7002734868a48',
      'VariableDeclaration',
    ],
  ],
  [
    18392,
    [
      13118075,
      13118547,
      'ed91b2f86fa32d92504babf0af756e67ce1267a39f0b16964d1ba56c1e7510b0',
      'FunctionDeclaration',
    ],
  ],
  [
    18393,
    [
      13118547,
      13119747,
      'eee24bd9ed04d05767d477c0525455c3d99570c58c5203f75c49b48f6d7ff0f6',
      'FunctionDeclaration',
    ],
  ],
  [
    18396,
    [
      13119826,
      13134608,
      '0d6bb17433cf8bb73eb2e5ed73a0dd44d83416b2bf76416660b6e666c45f8a9d',
      'ClassDeclaration',
    ],
  ],
  [
    18397,
    [
      13134608,
      13135729,
      '75982d3b01e21f304f1e858b6870adc1f12e1cd3745f13ba7c6b6be87a1a2a10',
      'FunctionDeclaration',
    ],
  ],
  [
    18429,
    [
      13146200,
      13177760,
      'd3b35edba548c3eefe78e66e81ebb6a3e5b9c9b2f8f243cafb4fb221d1da5ed0',
      'FunctionDeclaration',
    ],
  ],
  [
    18432,
    [
      13179450,
      13181499,
      '04d8b2b3805147889f3b74602b95018522cd77f4f9bd11ae693a17ffa8736f48',
      'FunctionDeclaration',
    ],
  ],
  [
    18556,
    [
      13248112,
      13303625,
      '3b8da3292e35d6575ad9a299498b678a928913b76ac0044cba8af9e63b03e211',
      'FunctionDeclaration',
    ],
  ],
])

test(
  '2.1.97 evidence pins every changed dynamic-prompt call-path unit',
  bundleOptions,
  () => {
    const bundleBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bundleBytes), targetSha256)
    const bundle = bundleBytes.toString('utf8')

    for (const [index, [start, end, sourceHash, nodeType]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.sourceHash,
          region.target.nodeType,
        ],
        [start, end, sourceHash, nodeType],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      'excludeDynamicSections',
      'redirectedContextTokens',
      'When true, omit per-user dynamic sections (working directory, auto-memory path)',
      'getExcludedDynamicSectionsContent: expected section body to start with a "# <heading>" line',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
    assert.equal(
      bundle.split('When true, omit per-user dynamic sections').length - 1,
      1,
      'target has one canonical SDK schema description',
    )
  },
)

test(
  'source omits exactly memory and environment, then reconstructs their keyed bodies',
  sourceOptions,
  () => {
    const prompts = assertFragments('src/constants/prompts.ts', [
      'options?: { excludeDynamicSections?: boolean }',
      'options?.excludeDynamicSections',
      '? `You are Claude Code, Anthropic\'s official CLI for Claude.`',
      "[systemPromptSection('memory', () => loadMemoryPrompt())]",
      "systemPromptSection('env_info_simple'",
      'export async function getExcludedDynamicSectionsContent(',
      'computeSimpleEnvInfo(model, additionalWorkingDirectories)',
      'loadMemoryPrompt()',
      "const newline = section.indexOf('\\n')",
      "if (!heading.startsWith('# '))",
      'result[heading] = body',
    ])
    const memoryOmission = prompts.indexOf(
      "[systemPromptSection('memory', () => loadMemoryPrompt())]",
    )
    const environmentOmission = prompts.indexOf(
      "systemPromptSection('env_info_simple'",
    )
    const reconstruction = prompts.indexOf(
      'export async function getExcludedDynamicSectionsContent(',
    )
    assert.ok(memoryOmission >= 0 && memoryOmission < environmentOmission)
    assert.ok(environmentOmission < reconstruction)
  },
)

test(
  'source redirects system, user, and dynamic context with target merge precedence',
  sourceOptions,
  () => {
    const queryContext = assertFragments('src/utils/queryContext.ts', [
      'getExcludedDynamicSectionsContent,',
      'excludeDynamicSections?: boolean',
      'cacheBreakerPhrase?: string',
      '{ excludeDynamicSections },',
      'getSystemContext(cacheBreakerPhrase)',
      'excludeDynamicSections && customSystemPrompt === undefined',
      'if (excludeDynamicSections)',
      '...systemContext,',
      '...userContext,',
      '...dynamicContext,',
      'systemContext: {},',
    ])
    const merge = queryContext.indexOf('...systemContext,')
    assert.ok(merge < queryContext.indexOf('...userContext,', merge))
    assert.ok(
      queryContext.indexOf('...userContext,', merge) <
        queryContext.indexOf('...dynamicContext,', merge),
    )

    const mergeContexts = ({ system, user, dynamic, exclude, custom }) => {
      if (exclude) {
        return {
          userContext: { ...system, ...user, ...(custom ? {} : dynamic) },
          systemContext: {},
        }
      }
      return { userContext: user, systemContext: custom ? {} : system }
    }
    assert.deepEqual(
      mergeContexts({
        system: { shared: 'system', gitStatus: 'git' },
        user: { shared: 'user', claudeMd: 'md' },
        dynamic: { shared: 'dynamic', memory: 'memory' },
        exclude: true,
        custom: false,
      }),
      {
        userContext: {
          shared: 'dynamic',
          gitStatus: 'git',
          claudeMd: 'md',
          memory: 'memory',
        },
        systemContext: {},
      },
    )
    assert.deepEqual(
      mergeContexts({
        system: { gitStatus: 'git' },
        user: { claudeMd: 'md' },
        dynamic: { memory: 'memory' },
        exclude: true,
        custom: true,
      }),
      { userContext: { gitStatus: 'git', claudeMd: 'md' }, systemContext: {} },
    )
  },
)

test(
  'source propagates SDK initialization through QueryEngine and every side path',
  sourceOptions,
  () => {
    assertFragments('src/entrypoints/sdk/controlSchemas.ts', [
      'excludeDynamicSections: z',
      '.boolean()',
      'When true, omit per-user dynamic sections (working directory, auto-memory path)',
      'redirectedContextTokens: z.number()',
    ])
    assertFragments('src/cli/print.ts', [
      'excludeDynamicSections: options.excludeDynamicSections,',
      'if (request.excludeDynamicSections !== undefined)',
      'options.excludeDynamicSections = request.excludeDynamicSections',
    ])
    assertFragments('src/QueryEngine.ts', [
      'excludeDynamicSections?: boolean',
      'excludeDynamicSections,',
      'cacheBreakerPhrase: initialAppState.cacheBreakerPhrase,',
    ])
    assertFragments('src/Tool.ts', ['excludeDynamicSections?: boolean'])
    assertFragments('src/commands/context/context-noninteractive.ts', [
      'excludeDynamicSections?: boolean',
      'excludeDynamicSections,',
    ])
    assertFragments('src/context.ts', [
      'async (_cacheBreakerPhrase?: string)',
    ])
    assertFragments('src/state/AppStateStore.ts', [
      'cacheBreakerPhrase?: string',
      'cacheBreakerPhrase: undefined',
    ])
    assertFragments('src/commands/clear/conversation.ts', [
      'cacheBreakerPhrase: undefined',
    ])
    const main = source('src/main.tsx')
    assert.ok(
      main.includes(
        isCurrentSource
          ? 'excludeDynamicSections: options.excludeDynamicSystemPromptSections || undefined'
          : 'excludeDynamicSections: undefined',
      ),
    )
  },
)

test(
  'context analysis counts redirected content as messages without double-counting system prompt',
  sourceOptions,
  () => {
    const analyze = assertFragments('src/utils/analyzeContext.ts', [
      'getExcludedDynamicSectionsContent,',
      'redirectDynamicSections = false',
      'const promptSystemContext = redirectDynamicSections ? {} : systemContext',
      'const dynamicContext = await getExcludedDynamicSectionsContent(model)',
      '...Object.values(systemContext),',
      '...Object.values(dynamicContext),',
      ".join('\\n')",
      'redirectedContextTokens =',
      'toolUseContext?.options.excludeDynamicSections &&',
      'toolUseContext.options.customSystemPrompt === undefined',
      'messageBreakdown.totalTokens + redirectedContextTokens',
      'redirectedContextTokens,',
    ])
    assert.ok(
      analyze.indexOf('const promptSystemContext =') <
        analyze.indexOf('...Object.entries(promptSystemContext)'),
    )

    const count = ({ system, dynamic, redirected }) => {
      const namedSystem = redirected ? [] : Object.values(system)
      const redirectedBody = redirected
        ? [...Object.values(system), ...Object.values(dynamic)]
            .filter(Boolean)
            .join('\n')
        : ''
      return { namedSystem, redirectedBody }
    }
    assert.deepEqual(
      count({
        system: { git: 'status', cache: 'breaker' },
        dynamic: { env: 'cwd', memory: 'memory' },
        redirected: true,
      }),
      {
        namedSystem: [],
        redirectedBody: 'status\nbreaker\ncwd\nmemory',
      },
    )
  },
)
