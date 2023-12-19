import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const selected = !semanticCase || semanticCase === caseName
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

const pinnedUnits = new Map([
  [2501, [1010649, 1011105, 'dfe7eb171aeeaadf3724ca3b015ccaea1371233a3bec6eb532ba5408eb80dec3']],
  [2628, [1092743, 1093610, '0ee77032c662cb0b5225f2e90da628832ca990b4c4511fdd431494a4ac1ca4e3']],
  [9937, [4985432, 5023859, 'cf339e7e94058cc99c9821b1bed6cc53adadd2b8bdfd3040f3d29a480e9a411a']],
  [10099, [5061877, 5062605, 'c0519bc21e006cc0bc7d541e2c96caf5fe7cfb2a10ad27f6ba67f1acf4b77152']],
  [10106, [5063587, 5064437, '7979c132c391c257fc0cfb8a22e43d0dc9da1035a3c273ea37f307e7b0b82b6c']],
  [12543, [7866626, 7866982, 'd7d7ce526730f993ee52968d5c6eff7d98b10fc16d83d8a131378c32c5fc4abf']],
  [12586, [7872394, 7872561, '4dd5506159a553733dbfe1b4792436fe4dd38c9846bd36ff6b06bb120d57ac10']],
  [12587, [7872561, 7874450, 'fd94a25d679f75b5b2e21f36bb19dcbfa14a3272846adbaf827410a7fd806a6d']],
  [12590, [7877652, 7880919, 'e08ec3b172ddf4e5e3621829db3788fa5d4ee3695fafd1eaa7d75bd97b188a24']],
  [12595, [7881418, 7882409, '06bede8da8f5ea1ca250ca8c89c57f733902a905f73ee89884340736c04afe32']],
  [12597, [7882661, 7883464, '21fd6c914ce4c2edd1ec34f0c46964c33727d9729b42d6a7850eacbe433c9f23']],
  [15002, [9355205, 9365246, 'aafb0af42ca2d97168c0c98f2e6922d7de954ff68a30f9d7b9d360c132980073']],
  [17001, [10655964, 10656866, '4d99349c64214f20986d4504c9be26c8d110d82a0cbe782cae87c68059db5285']],
  [17006, [10657042, 10667612, '1344f345c55bd946879eaaa0153d12287ead847b6ced8fd3c251f365687a3283']],
  [17986, [11102880, 11106187, '0d40eb6215f694c0d08d9ff9cbecb2726fb702d9020f2d90c4f3cddd5809ce3d']],
  [18066, [11130460, 11131049, 'a4693f2590d100b1f2c3f0a88aeb71fc8cb8afa7afa0a89b5e8b3963a5f14ed6']],
  [18068, [11131060, 11132794, '9121660a115647e9cf31fba5953bf0a8b57fc7c25d37e190ee0a7d14addfbfd2']],
  [18077, [11136856, 11141149, '68e77114a2880cadea8f41611dec28d65d436837aeeeec22a2a1694b32c1d28f']],
  [18088, [11148504, 11151480, '91cbceae5e9a0981657b6485b70d5ad49c589a1ca5c36f86023914e75ac225b2']],
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
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target 2.1.116 pins every UserPromptExpansion structural unit', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(targetBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const target = targetBytes.toString('utf8')

  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }
})

test('the complete hook protocol is introduced at the 114 to 116 boundary', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('UserPromptExpansion'), false)

  for (const fragment of [
    'UserPromptExpansion',
    'expansion_type',
    'slash_command',
    'mcp_prompt',
    'When a user-typed slash command expands into a prompt',
    'UserPromptExpansion operation blocked by hook:',
    'hookName:"UserPromptExpansion"',
    'H.source==="mcp"?"mcp_prompt":"slash_command"',
    'case"UserPromptExpansion":M.additionalContext=',
  ]) {
    assert.ok(target.includes(fragment), fragment)
  }

  const promptDispatch = target.slice(7877652, 7880919)
  assert.ok(promptDispatch.includes('await R_7('))
  assert.ok(promptDispatch.includes('if("blocked"in M)return M.blocked'))
  assert.ok(promptDispatch.indexOf('await R_7(') < promptDispatch.indexOf('O.context==="fork"'))
  assert.ok(target.slice(7872561, 7874450).includes('j.push(...f)'))
  assert.ok(target.slice(7882661, 7883464).includes('...J,...f,AK('))
})

test('source owns the SDK, settings, plugin, and UI protocol surface', sourceOptions, () => {
  assertFragments('src/entrypoints/sdk/coreTypes.ts', [
    "'UserPromptSubmit'",
    "'UserPromptExpansion'",
  ])
  assertFragments('src/entrypoints/sdk/coreSchemas.ts', [
    'export const UserPromptExpansionHookInputSchema',
    "hook_event_name: z.literal('UserPromptExpansion')",
    "expansion_type: z.enum(['slash_command', 'mcp_prompt'])",
    'command_name: z.string()',
    'command_args: z.string()',
    'command_source: z.string().optional()',
    'prompt: z.string()',
    'UserPromptExpansionHookInputSchema()',
    'export const UserPromptExpansionHookSpecificOutputSchema',
    "hookEventName: z.literal('UserPromptExpansion')",
    'UserPromptExpansionHookSpecificOutputSchema()',
  ])
  assertFragments('src/types/hooks.ts', [
    "hookEventName: z.literal('UserPromptExpansion')",
    'additionalContext: z.string().optional()',
  ])
  assertFragments('src/utils/settings/settings.ts', ["'UserPromptExpansion'"])

  const pluginHooks = assertFragments('src/utils/plugins/loadPluginHooks.ts', [
    'UserPromptExpansion: []',
  ])
  assert.equal(pluginHooks.split('UserPromptExpansion: []').length - 1, 2)

  assertFragments('src/utils/hooks/hooksConfigManager.ts', [
    'UserPromptExpansion: {',
    "summary: 'When a user-typed slash command expands into a prompt'",
    "fieldToMatch: 'command_name'",
    'UserPromptExpansion: {},',
  ])
  assertFragments('src/utils/messages.ts', [
    "attachment.hookEvent !== 'UserPromptExpansion'",
  ])
})

test('source executes, matches, parses, and registers UserPromptExpansion hooks', sourceOptions, () => {
  const owner = assertFragments('src/utils/hooks.ts', [
    'export async function* executeUserPromptExpansionHooks(',
    "hasHookForEvent('UserPromptExpansion', appState, sessionId)",
    "hook_event_name: 'UserPromptExpansion'",
    'expansion_type: expansionType',
    'command_name: commandName',
    'command_args: commandArgs',
    'command_source: commandSource',
    'signal: toolUseContext.abortController.signal',
    "case 'UserPromptExpansion':",
    'matchQuery = hookInput.command_name',
    'result.additionalContext = json.hookSpecificOutput.additionalContext',
    'export const HOOK_EVENT_REGISTRY = {',
    'UserPromptExpansion: executeUserPromptExpansionHooks',
  ])
  assert.ok(
    owner.indexOf("hasHookForEvent('UserPromptExpansion'") <
      owner.indexOf("hook_event_name: 'UserPromptExpansion'"),
  )
})

test('source applies the hook before expansion and preserves every result path', sourceOptions, () => {
  const owner = assertFragments(
    'src/utils/processUserInput/processSlashCommand.tsx',
    [
      'export async function runUserPromptExpansionHook(',
      "command.source === 'mcp' ? 'mcp_prompt' : 'slash_command'",
      'UserPromptExpansion operation blocked by hook:',
      'Original prompt: ${originalPrompt}',
      'Operation stopped by hook: ${hookResult.stopReason}',
      "type: 'hook_additional_context'",
      "hookName: 'UserPromptExpansion'",
      "hookEvent: 'UserPromptExpansion'",
      "hookResult.message.attachment.type === 'hook_success'",
      "hookResult.message.attachment.content === ''",
      'promptMessages.push(...hookMessages)',
      'const expansionResult = await runUserPromptExpansionHook(command, args, context)',
      "if ('blocked' in expansionResult)",
      'expansionResult.hookMessages',
      '...attachmentMessages, ...hookMessages, createAttachmentMessage({',
    ],
  )
  assert.ok(
    owner.indexOf('const expansionResult = await runUserPromptExpansionHook') <
      owner.indexOf("if (command.context === 'fork')"),
  )
})
