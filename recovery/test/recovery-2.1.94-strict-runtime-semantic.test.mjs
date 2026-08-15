import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const targetSha256 =
  '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564'
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

const pinnedUnits = new Map([
  [
    2356,
    "unresolved",
    952361,
    952469,
    "25eaf1a46e10651e82cf7a0c11d6b7323618048e8dc680b69559dce17180592f"
  ],
  [
    3044,
    "unresolved",
    2285535,
    2285611,
    "725ab193d3314595624bd89bcc7ed34f68227c5fae3c40246c99c0b560222abf"
  ],
  [
    4968,
    "unresolved",
    3699735,
    3699787,
    "bff012aee69ba16338b6d49e7bfa68f42d29a088b4614fe9d76161e97ca3a437"
  ],
  [
    4976,
    "unresolved",
    3700567,
    3700621,
    "cac02271048fb54ed6bb590e15cbad3dae910b2b9c2b5fdb9f9cb857feba46e2"
  ],
  [
    5023,
    "unresolved",
    3711751,
    3713256,
    "35bcc1c0308e89fafb4323ef7c050f4b504916d6e22a5c8304da7edac32633bd"
  ],
  [
    6743,
    "unresolved",
    4955021,
    4955412,
    "53179cd34a3215a526e5d914f2be32c0a7f6d26ee51d78e81f57181882e515b5"
  ],
  [
    6744,
    "unresolved",
    4955412,
    4955547,
    "7a481bb72b3c47cbeff99b45d85854972760d4b4120e7e6b2d61c13c970c7924"
  ],
  [
    6745,
    "unresolved",
    4955547,
    4955870,
    "45286c29452ee4d9c4a49dfccb2cf327ca77707efbb9ec128641ad91df73d189"
  ],
  [
    8042,
    "unresolved",
    6628599,
    6632587,
    "813e8d154235b85a4c750de5e5b3b4296ec30f96c6eddc03f346abd4132d2460"
  ],
  [
    8055,
    "unresolved",
    6635677,
    6639942,
    "468eaff638f4bb7e2c16f31a9201f0e6ed1985109fb05a10b9bea75b57342020"
  ],
  [
    8783,
    "unresolved",
    6907591,
    6907781,
    "3fb7969be3938c24dd4924e22c3f26af9dc6d70911d6e5a13cc63d0929634654"
  ],
  [
    9885,
    "unresolved",
    8117124,
    8150097,
    "55e6d544d22e313db9082a5c57af2f7053f2bfee8c23a7bae3079933e4af8de8"
  ],
  [
    10734,
    "unresolved",
    8493352,
    8493426,
    "29d5bb9d1c5f73bce19bf12f46129461ca4e436cf238be0bb0812705f329183d"
  ],
  [
    10895,
    "unresolved",
    8618846,
    8620058,
    "526b1054dc9c258c6ae64a1156647fb866efd21e14b54de23d71c334974fbdc2"
  ],
  [
    11916,
    "unresolved",
    9282293,
    9283260,
    "ca9455fbe79e914465f015d75c618f7ac2df63a061b4773f7b6710c8284041e2"
  ],
  [
    11973,
    "unresolved",
    9317839,
    9328773,
    "3d34d8a1bfbf000b53de1553763a761bd0b0b677f67c45c787bdcf09ca41dbef"
  ],
  [
    12092,
    "unresolved",
    9375080,
    9376730,
    "5ae1f555f71dd914c0ee861bceec85b0d1ed58383554f4c0144ac8327b907d6b"
  ],
  [
    12093,
    "unresolved",
    9376730,
    9377787,
    "0465d99ea74a09a8ebff8dd5ee706ba36df7a095364209b460a6665073bc6614"
  ],
  [
    12112,
    "unresolved",
    9389945,
    9390857,
    "d011573be86596b1b3c88a40f96f9e422a1b0750a3d6eb9dfe6cc2e4f313a0fe"
  ],
  [
    12121,
    "unresolved",
    9392618,
    9392697,
    "1ed9106ededbb5122c1c9b5a99de53fd981f3943c9da954db6fc62e8d9400c91"
  ],
  [
    12283,
    "unresolved",
    9490224,
    9508052,
    "50e6b904e1b32e9d9bc8d059ba4075aff01337984659ee56502c9091b13006c1"
  ],
  [
    12284,
    "unresolved",
    9508052,
    9511139,
    "4b88e78dd3c4cdc0b30e6f10ac6bc4796a3852b2c7b0a4cca26c606be0d7a7a8"
  ],
  [
    12285,
    "unresolved",
    9511139,
    9514939,
    "c4b10a79be400ff2ec85265959d9fbe08922d650c815d597871333857e48e246"
  ],
  [
    12286,
    "unresolved",
    9514939,
    9516277,
    "ae4e1cb888ba17533fd5737e802a7fb12320b45752b3d6c54efe6a0640549417"
  ],
  [
    12287,
    "unresolved",
    9516277,
    9516822,
    "1caa7c8d8233074095248c6fab1399490a2a7872957ff1b40d9a7b5050b16fb3"
  ],
  [
    12288,
    "unresolved",
    9516822,
    9530721,
    "671d02309b855ae956576350ad4ac15bb1b00491aadd50c6edfdfc552b666833"
  ],
  [
    12303,
    "unresolved",
    9534965,
    9535185,
    "798b9e0205cc4acfcc635b50a3af40246f3a82f954da79c6f63c0cbcc104a68a"
  ],
  [
    12308,
    "unresolved",
    9536198,
    9538618,
    "a0f3ac251ed75c74e8d01772e1e39cc12d99aac9ef64c799c7e2f298ed83d0e0"
  ],
  [
    12320,
    "unresolved",
    9539882,
    9540436,
    "d1303cc5dc37b96ccf735cdbb190ea1a9cb88bf0b4fbec7da4a13f45c4210fac"
  ],
  [
    12321,
    "unresolved",
    9540436,
    9541478,
    "4aa394c81d47633b7c02c8619ca77e0da0bf1b31ded51426cd929c48cdc95306"
  ],
  [
    12333,
    "unresolved",
    9545241,
    9547987,
    "8cd795f9481475e9e59a6d8a61ff699446b6dbe97e34373e0445fcf253cca3c5"
  ],
  [
    12338,
    "unresolved",
    9548402,
    9551262,
    "712894b48889fe48f97ba9c1ef7e43cbe8c1fc11d4eb8e783f5249418ea236b9"
  ],
  [
    12339,
    "unresolved",
    9551262,
    9551729,
    "7d6cc1b07f34569c0c866e94e0591ceaaf72c1e1461c6b84d2e8c15d90f50879"
  ],
  [
    12606,
    "unresolved",
    9694764,
    9695894,
    "ae375dfb4ba0b85984bec96cf233dc1384b96920166ac3cedc61ecc3d17ac519"
  ],
  [
    12607,
    "unresolved",
    9695894,
    9698200,
    "6d3a21dda2dbc70a5fc49884ae176708de99f3f062ed469668540e6713a47a6a"
  ],
  [
    12643,
    "unresolved",
    9711111,
    9711968,
    "aa18abfe6f52e2e4b65c0c6309f2e7c6303f213bf3a6a19c916432e87a10ab93"
  ],
  [
    12872,
    "unresolved",
    9810190,
    9810442,
    "cfc471d5903cdfbdb8aabe57c1865211d5b8fd2ed455e0ab6b63a00d0ea35f67"
  ],
  [
    12977,
    "unresolved",
    9858217,
    9872763,
    "f8d2f88c0790712583589aff4b6a15a3af1b8c071a09d2092c60c3ecae30d745"
  ],
  [
    13361,
    "unresolved",
    10034888,
    10034986,
    "058eb86423f9734f994ad65a4d34c6ce23c65c28f0922f0037fc9a2f928f23cb"
  ],
  [
    13365,
    "unresolved",
    10035259,
    10036248,
    "6f63e641bc714d841a6bf7d6b48f22c37fc9ddba25dcb1c82bb8dfe98d9ba619"
  ],
  [
    15914,
    "unresolved",
    11546266,
    11550746,
    "99ecdec5b122ad9c6a5c7d9bfb7f7c44169e28c43964ea7f15c07c2f550e2e89"
  ],
  [
    16090,
    "unresolved",
    11635402,
    11635623,
    "2fa5a2581bed0876069c482b76158b05a9ffe5f93776b38060bfe4b8724a644d"
  ],
  [
    16406,
    "unresolved",
    11828569,
    11829745,
    "8f535cef4810a598cefbe71baedb0012d5bee396ca57bee21694576586a3c696"
  ],
  [
    16488,
    "unresolved",
    11851925,
    11852096,
    "5f07123c31ae04f446b77ba50d055cd221179595bafd119cd5fcde89fd9b6946"
  ],
  [
    17338,
    "unresolved",
    12276273,
    12301458,
    "59c10738894fb5a68ce0540fefe05d729086197ee9efdc827ff0809d98082890"
  ],
  [
    17638,
    "unresolved",
    12421219,
    12421442,
    "8076f0a046e5673f602eb7c8b3e031e3c3c167b51274c48c578681d27b87e030"
  ],
  [
    17655,
    "unresolved",
    12426462,
    12427106,
    "6ca9943a9bd7f879b5b15aecb01bae6893001c5f525d51c23b8ca9bda412d93a"
  ],
  [
    17703,
    "unresolved",
    12450338,
    12461338,
    "0a87eee59fbfd3c0702748da2adeb6c72c1b429cea03d2fe5f38c6a588ab629b"
  ],
  [
    17934,
    "unresolved",
    12537073,
    12593881,
    "306c96ad3c184da1648eb885cd3b69a5967fcdba8bc5640bdd09dc6749440172"
  ],
  [
    18084,
    "unresolved",
    12653142,
    12653856,
    "52b42b09c1db5e323a5e7475f0a9e9b9da2a0260da39e48a6624d1eabdc809c1"
  ],
  [
    18170,
    "unresolved",
    12720681,
    12728816,
    "328947f3fedf02dc1a17f2288fe4f3871db101c050f84f66e06787a66fa60b0f"
  ],
  [
    18222,
    "unresolved",
    12876684,
    12898128,
    "62d7a93c6c5fb4b38e85e564b6f6365178b44bd9b0aa867a2ea6a31a24cab297"
  ],
  [
    18418,
    "unresolved",
    13074318,
    13074521,
    "700b68f5d30d58b93b4af08cf966afa15a71ba5f322a02ffabb79a8de44dd056"
  ],
  [
    18440,
    "unresolved",
    13125902,
    13126545,
    "e6e26454300f050b1b877ad0000e2e9aabb002a5f16a313ef0f2d7ac97d171aa"
  ]
].map(([index, ...identity]) => [index, identity]))

const ownerFragments = new Map([
  [
    "utils/git/gitFilesystem.ts",
    [
      "pushurl"
    ]
  ],
  [
    "utils/model/providers.ts",
    [
      "getAPIProviderForModel"
    ]
  ],
  [
    "memdir/paths.ts",
    [
      "TINY_MEM_DIRNAME"
    ]
  ],
  [
    "utils/config.ts",
    [
      "loopAutoEnabled"
    ]
  ],
  [
    "memdir/tinyMemoryStamps.ts",
    [
      "stampTinyMemoryCreated",
      "stampTinyMemoryRead"
    ]
  ],
  [
    "keybindings/defaultBindings.ts",
    [
      "'ctrl+l': 'chat:clearInput'"
    ]
  ],
  [
    "keybindings/schema.ts",
    [
      "'chat:clearInput'",
      "'app:redraw'"
    ]
  ],
  [
    "keybindings/validate.ts",
    [
      "validateBindings"
    ]
  ],
  [
    "services/mcp/client.ts",
    [
      "client.close()"
    ]
  ],
  [
    "entrypoints/sdk/coreSchemas.ts",
    [
      "z.literal('adaptive')"
    ]
  ],
  [
    "utils/teleport.tsx",
    [
      "teleport"
    ]
  ],
  [
    "utils/bash/ShellSnapshot.ts",
    [
      "createFindGrepShellIntegration"
    ]
  ],
  [
    "tools/AgentTool/forkSubagent.ts",
    [
      "You are a worker fork."
    ]
  ],
  [
    "tools/AgentTool/prompt.ts",
    [
      "Launch a new agent to handle complex, multi-step tasks."
    ]
  ],
  [
    "services/teamMemorySync/index.ts",
    [
      "413",
      "403"
    ]
  ],
  [
    "services/teamMemorySync/watcher.ts",
    [
      "watch"
    ]
  ],
  [
    "memdir/memoryTypes.ts",
    [
      "TINY_MEMORY_TYPES_SECTION"
    ]
  ],
  [
    "memdir/memdir.ts",
    [
      "# Dream: Memory Pruning"
    ]
  ],
  [
    "memdir/memoryScan.ts",
    [
      "parseCreatedDate",
      "isTinyMemoryEnabled"
    ]
  ],
  [
    "services/extractMemories/prompts.ts",
    [
      "Memory"
    ]
  ],
  [
    "services/extractMemories/extractMemories.ts",
    [
      "tiny memory mode"
    ]
  ],
  [
    "services/autoDream/consolidationPrompt.ts",
    [
      "# Dream: Memory Consolidation"
    ]
  ],
  [
    "services/autoDream/autoDream.ts",
    [
      "executeAutoDream"
    ]
  ],
  [
    "memdir/findRelevantMemories.ts",
    [
      "one_paragraph_synthesis"
    ]
  ],
  [
    "utils/attachments.ts",
    [
      "synthesis"
    ]
  ],
  [
    "utils/messages.ts",
    [
      "<synthesis:"
    ]
  ],
  [
    "utils/plugins/pluginLoader.ts",
    [
      "sanitize"
    ]
  ],
  [
    "components/Feedback.tsx",
    [
      "RAW_TRANSCRIPT_TAIL_BYTES",
      "tailFile"
    ]
  ],
  [
    "commands/feedback/feedback.tsx",
    [
      "Feedback"
    ]
  ],
  [
    "memdir/teamMemPrompts.ts",
    [
      "ENTRYPOINT_NAME"
    ]
  ],
  [
    "utils/hooks.ts",
    [
      "logForDebugging"
    ]
  ],
  [
    "upstreamproxy/upstreamproxy.ts",
    [
      "getSessionIngressAuthToken"
    ]
  ],
  [
    "components/FeedbackSurvey/FeedbackSurveyView.tsx",
    [
      "FeedbackSurvey"
    ]
  ],
  [
    "entrypoints/sdk/controlSchemas.ts",
    [
      "anthropic/permissionDisplay"
    ]
  ],
  [
    "cli/print.ts",
    [
      "PERMISSION_DISPLAY_META_KEY"
    ]
  ],
  [
    "cli/structuredIO.ts",
    [
      "display_name: permissionDisplay?.displayName"
    ]
  ],
  [
    "screens/REPL.tsx",
    [
      "That message is no longer in the active context. Choose a more recent message."
    ]
  ],
  [
    "interactiveHelpers.tsx",
    [
      "import('./utils/relaunch.js')"
    ]
  ],
  [
    "utils/relaunch.ts",
    [
      "Failed to relaunch Claude Code:"
    ]
  ],
  [
    "skills/bundled/verify.ts",
    [
      "verify"
    ]
  ],
  [
    "skills/bundled/verifyContent.ts",
    [
      "./verify/SKILL.md"
    ]
  ],
  [
    "skills/bundled/claudeApi.ts",
    [
      "./claudeApiContent.js"
    ]
  ],
  [
    "skills/bundled/claudeApiContent.ts",
    [
      "skillPrompt"
    ]
  ]
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function occurrences(contents, identifier) {
  return contents.match(new RegExp(`\\b${identifier}\\b`, 'g'))?.length ?? 0
}

test('2.1.94 pins every strict-residue structural unit and authenticated target slice', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_94_BUNDLE is not set'
      : false,
}, () => {
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(targetBytes), targetSha256)
  const target = targetBytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  for (const fragment of [
    'loopAutoEnabled',
    'chat:clearInput',
    'You are a worker fork.',
    '# Dream: Memory Pruning',
    'one_paragraph_synthesis',
    'That message is no longer in the active context. Choose a more recent message.',
    'anthropic/permissionDisplay',
  ]) assert.ok(target.includes(fragment), fragment)
})

test('materialized target94 source owns every strict-residue runtime cluster', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  if (semanticCase !== caseName) {
    for (const [relative, fragments] of new Map([
      ['utils/model/providers.ts', ['getAPIProviderForModel']],
      ['keybindings/schema.ts', ["'chat:clearInput'", "'app:redraw'"]],
      ['tools/AgentTool/forkSubagent.ts', ['You are a worker fork.']],
      ['memdir/memdir.ts', ['# Dream: Memory Pruning']],
      ['entrypoints/sdk/controlSchemas.ts', ['anthropic/permissionDisplay']],
      [
        'screens/REPL.tsx',
        [
          'That message is no longer in the active context. Choose a more recent message.',
        ],
      ],
    ])) {
      const contents = source(relative)
      for (const fragment of fragments) {
        assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
      }
    }
    return
  }
  for (const [relative, fragments] of ownerFragments) {
    const contents = source(relative)
    for (const fragment of fragments) {
      assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
    }
  }
})

test('target94 static exclusions have definitions/initializers but no shipped consumers', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_94_BUNDLE is not set'
      : false,
}, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(occurrences(target, 'fnY'), 2)
  assert.equal(occurrences(target, 'Wq5'), 2)
  assert.equal(occurrences(target, 'D1O'), 3)
  assert.equal(occurrences(target, 'f1O'), 2)
  assert.equal(occurrences(target, 'd6H'), 2)
  assert.equal(occurrences(target, 'c6H'), 2)
  assert.equal(occurrences(target, 'l6H'), 2)
  assert.ok(target.includes('var D1O,f1O,d6H,c6H,l6H;'))
  assert.ok(target.includes('Dq5=L(()=>{k8();OK();tK();Uf();Wq5();p58()})'))
})
