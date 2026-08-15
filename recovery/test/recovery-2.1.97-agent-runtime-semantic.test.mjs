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

const pinnedUnits = new Map([
  [
    10014,
    [
      7456508,
      7457035,
      '954e453786042ae635c3ec4c9268e6d694365dd10cf54f1d8cb0459934eadfc5',
    ],
  ],
  [
    10069,
    [
      7502101,
      7502165,
      'a35089a2ae33ca830a21f3db339d238b612236958331f417bb313fcc6933e38d',
    ],
  ],
  [
    10081,
    [
      7508740,
      7509773,
      '56592a15963ee95df138141cda2821effd7891b0be6ef31b698a4239e6fd9dff',
    ],
  ],
  [
    11042,
    [
      8672399,
      8678358,
      '2df0895fe44e8a5c0d07d9fb47addab0d0e0e8f43545edeeb2adefc9cfe3c4b2',
    ],
  ],
  [
    11589,
    [
      8902301,
      8907816,
      '338d24496791f121db4a4457edcaa4ce6a1ae45e171a56a26c27e71128afb9e9',
    ],
  ],
  [
    11761,
    [
      9001249,
      9018590,
      '5a97ca64d5e642b4110be0554c1a6bf7a509980696d2d0db3179cc32701b0ef1',
    ],
  ],
  [
    12231,
    [
      9447854,
      9450518,
      '8ba5613e752255d9c6822172f813616d6241e22ef37cfd89fe871ba1b4846a9c',
    ],
  ],
])

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

test(
  '2.1.97 agent-runtime evidence pins model, tool-filter, runner, and caller units',
  bundleOptions,
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    for (const [index, [start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      'tengu_garnet_loom',
      'tengu_shale_finch',
      'new Set([ay,ev,Ok,Td,Vd])',
      'isTeammate:!0',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'source filters task-management tools from non-teammate prompts only',
  sourceOptions,
  () => {
    const runner = assertFragments('src/tools/AgentTool/runAgent.ts', [
      "'TodoWrite'",
      "'TaskCreate'",
      "'TaskUpdate'",
      "'TaskGet'",
      "'TaskList'",
      'isTeammate = false',
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_shale_finch', false)",
      '!useExactTools && shouldFilterTaskManagementTools(isTeammate)',
      'resolvedTools.filter(',
      '!TASK_MANAGEMENT_TOOL_NAMES.has(tool.name)',
      'promptTools,',
    ])
    assert.ok(
      runner.indexOf('promptTools,') < runner.indexOf('const agentAbortController'),
      'filtered tools feed the system prompt',
    )
    assert.ok(
      runner.includes('uniqBy([...resolvedTools, ...agentMcpTools]'),
      'the actual executable tool pool remains unfiltered',
    )
    assertFragments('src/utils/swarm/inProcessRunner.ts', ['isTeammate: true'])
  },
)

test(
  'historical target97 source preserves exact-tools Opus inheritance while later source may remove the gate',
  sourceOptions,
  () => {
    const model = source('src/utils/model/agent.ts')
    if (!model.includes('tengu_garnet_loom')) {
      // The gate is legitimately removed by 2.1.111. Current source follows the
      // latest bundle, while per-case verification runs against target97 source.
      assert.notEqual(
        semanticCase,
        caseName,
        'the target97 materialization must retain the exact-tools gate',
      )
      return
    }
    for (const fragment of [
      'useExactTools?: boolean',
      '!useExactTools &&',
      "getCanonicalName(runtimeModel).includes('opus')",
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_garnet_loom', false)",
      "parseUserSpecifiedModel('sonnet')",
      "applyParentRegionPrefix(sonnetModel, 'sonnet')",
    ]) {
      assert.ok(model.includes(fragment), fragment)
    }
    assertFragments('src/tools/AgentTool/runAgent.ts', [
      'useExactTools ?? false',
    ])
    assertFragments('src/tools/AgentTool/AgentTool.tsx', [
      'permissionMode, isForkPath);',
    ])
    assertFragments('src/tools/AgentTool/resumeAgent.ts', [
      'permissionMode,\n    isResumedFork,',
    ])
  },
)
