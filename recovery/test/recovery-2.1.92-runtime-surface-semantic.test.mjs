import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetPath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
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

const pins = new Map([
  [2576, ['unresolved', 1040044, 1062396, '821761a6be8a22a820b5b64aa4c5048933b5b56459b6c2f3b90c4e73c5200130']],
  [3235, ['unresolved', 2419846, 2419896, '470e3679a1a3bde306676a5d6a3de6cecb2e2dd124f351a94b228ef8d979a489']],
  [4504, ['unresolved', 3442680, 3446146, '5e736951bbbab014de3f9b930041ed406bd66ea54c3095975ff52c88c23edd54']],
  [5060, ['unresolved', 3734271, 3734947, 'f002614357591a8eef4178fa111e9f234a6dde4e15adf9cf1368e9f213985598']],
  [5555, ['unresolved', 4036201, 4041527, '9c457ef0f130cd19f624491097cf2b5b9a95e28dd5b16a87694599dac78002d2']],
  [10197, ['unresolved', 8256511, 8258085, '3d9666001afe7f3af51192a7a2c5d6042929716a84c15499c0417144d0a56d93']],
  [11828, ['unresolved', 9234959, 9238338, '603d6a58317f77ea26816036674099c16ba720e6123db9222d723ed759a514dd']],
  [13602, ['unresolved', 10312974, 10316412, '2db93f50c8294587a410ca84929c3a091ca31b4ec19ba7247d69dd193694a141']],
  [13693, ['unresolved', 10350476, 10350903, 'e60b6c753745274966d963cf22335464d715858e4d3ce5ad826378614163ba81']],
  [14393, ['unresolved', 10798288, 10799025, '9000a897a0c753aad301f4785e9ca1faf009d683178a5cdf492a001d7bc7dddc']],
  [14620, ['unresolved', 10898177, 10917826, '809ee2cae01beaff9e742da2040c27065f1ef61ad429891bd70461e596654e32']],
  [14637, ['unresolved', 10922365, 10924212, 'b91cb10dc44c06349c0612fe0cb812a978f8f5c6f45aa5e6b4a4c3bfb84f4e78']],
  [14741, ['unresolved', 10952073, 10954783, '930e28b5d7d7af619a86882d45e7b3ff26199bdbce00628bd08c964be979e3e1']],
  [14756, ['unresolved', 10960558, 10962399, '135bb2b0a3969a9eb8da8f579a642827cecb29d21cd635658941be9a9830b4b6']],
  [14758, ['unresolved', 10962994, 10964358, 'b0d7ed286f053863ca7f2bc634a2ae92bc2accb873a8bd5879717108a0b11be8']],
  [14803, ['unresolved', 10991052, 10995666, '1849c0afd50e3e920936b2714c7db8f972ee3e36a7693de772ab290428fd750b']],
  [14849, ['unresolved', 11030385, 11030919, '90b4d450686cf01a3cc1d8ce64d7373c659a9eb5ed7550afe448f983a85d58b0']],
  [14853, ['unresolved', 11031059, 11031363, '3ad543ff7151c1833d284abd22f7896e38ab224f9a8d1eaf336dc144acdf342b']],
  [15053, ['unresolved', 11130830, 11133656, 'e22be254e5fb1623a1efb97faa24571408427a154e7b810c99d8def881ec2bf9']],
  [15060, ['unresolved', 11133985, 11134751, '06f5fcf0ad96dbcd9d9ed624e34643a06c40e78d7b6a668769cd03b930652b2f']],
  [15063, ['unresolved', 11134816, 11135025, 'bc9a626052501392d2c2e24f6ba5a5e28998ef0312739b86933500943a103179']],
  [15182, ['unresolved', 11176264, 11178284, 'b773786b46cac72e501a211c86cf80a95660f54fc117e6ddb25c7707853ee8c5']],
  [15203, ['unresolved', 11193943, 11196043, '26d0785fa21b49e867933c704fa758d7dde7308753d1276c43b84b6bb684eb1d']],
  [15209, ['unresolved', 11197139, 11198721, '15382b5e1daf415d0c5b0b46fb640d29667d542f72ee5b094aae8075df42cf93']],
  [15482, ['unresolved', 11284603, 11287578, '3f248eb53e16225246454ef557712aa9ab0ee3fdcd5fa89ffc752e1044a2d499']],
  [15484, ['unresolved', 11287661, 11287705, '328aa084e562c41c33649b66d352db528ee3ff0cb2f9068a1c9d21709cd25c29']],
  [15679, ['unresolved', 11363418, 11404046, '798ab28176e620e2b9b90c7c4b0c7294c08c1b307f5cf695ac3a51225a81949b']],
  [15837, ['unresolved', 11475720, 11480237, '40b1a3bd607fba077e98e33699f2f281c8ca352c909b49660f4adaa44a608aec']],
  [17202, ['unresolved', 12184579, 12189133, '4b1b5bae20aa4be3d91c79ff3a993b8344e61d80c87f07a65344baec94de29fb']],
  [17572, ['unresolved', 12353789, 12353996, '55e9b2b3c808830ee44ad824ad104120e5977065d5ba26909f8ef3dfa0ba0353']],
  [17550, ['unresolved', 12346025, 12346886, '7339a0faed559f4dd115fdc7ca42b35246be3385dd4bd7c6201bd92949005058']],
  [17551, ['unresolved', 12346886, 12346909, '95c552e92943bd0e30883c2dc04aefebbfae4bf4d4fb326a312e7fd7257fa9eb']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target92 pins every recovered runtime-surface and static-exclusion unit',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetPath)
    assert.equal(sha256(bytes), targetSha)
    const bundle = bytes.toString('utf8')
    for (const [index, [classification, start, end, sourceHash]] of pins) {
      const region = structural.regions[index]
      assert.deepEqual(
        [
          region.classification,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [classification, start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      'fz7={simple_plan:mmK(),visual_plan:pmK(),three_subagents_with_critique:BmK()}',
      'reason:J?"bundle_fail":M?"create_api_fail":"teleport_null"',
      'prompt_identifier:j',
      'Remote plan mode with rich web editing experience.',
      'Advanced multi-agent plan mode.',
      'Approve, edit, or comment on the plan',
      'Session resumed successfully',
      'Teleport cancelled',
      'https://claude.ai/create/team',
      'tengu_rate_limit_options_menu_select_team',
      'QDK=null',
      'isEnabled:()=>!1',
      'q.startsWith("--resume=")',
      'mountDelayMs:$=naY',
      'Date.now()-J.current<$',
      '.normalize("NFKC")',
      'laY=400,naY=600',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }

    const resumeInit = bundle.slice(12_353_789, 12_353_996)
    assert.equal((bundle.match(/\brij\b/g) ?? []).length, 2)
    assert.ok(resumeInit.includes('q.startsWith("--resume=")'))
    assert.equal((bundle.match(/\bCh2\b/g) ?? []).length, 2)
    assert.ok(
      bundle
        .slice(10_798_288, 10_799_025)
        .includes('tempo:K.tempo??(q?"blocked":"idle")'),
    )
  },
)

test(
  'materialized target92 source owns exact observable runtime surfaces',
  { skip: historical ? false : 'requires materialized target92 source' },
  () => {
    if (!historical) return
    const settings = source('utils/settings/types.ts')
    for (const fragment of [
      'Autonomous background operation configuration',
      "'hold' (default): hold to talk. 'tap': tap to start, tap to stop+submit.",
      'Submit the prompt when hold-to-talk is released (hold mode only)',
    ]) assert.ok(settings.includes(fragment), fragment)

    const models = source('utils/model/configs.ts')
    for (const fragment of ['opus46:', 'sonnet45:', 'haiku45:']) {
      assert.ok(models.includes(fragment), fragment)
    }

    const fileWrite = source('tools/FileWriteTool/prompt.ts')
    for (const fragment of [
      'For appending to an existing file, prefer shell redirection via Bash',
      'Prefer the Edit tool for modifying existing files',
      'Only use this tool to create new files or for complete rewrites.',
    ]) assert.ok(fileWrite.includes(fragment), fragment)

    const app = source('ink/components/App.tsx')
    assert.ok(app.includes('`DECSTBM: ${DECSTBM_SAFE'))
    assert.ok(app.includes('(TMUX=${process.env.TMUX'))

    const stats = source('components/Stats.tsx')
    for (const fragment of ['↓ stats', '↑ tabs', 'ctrl+s to copy']) {
      assert.ok(stats.includes(fragment), fragment)
    }

    const rateMessage = source('components/messages/RateLimitMessage.tsx')
    assert.ok(rateMessage.includes('tengu_amber_lantern'))
    const rateOptions = source(
      'commands/rate-limit-options/rate-limit-options.tsx',
    )
    for (const fragment of [
      'Upgrade to Team plan',
      'tengu_rate_limit_options_menu_select_team',
      'https://claude.ai/create/team',
      'Could not open a browser. Visit',
    ]) assert.ok(rateOptions.includes(fragment), fragment)

    const sessionSearch = source('utils/agenticSessionSearch.ts')
    for (const fragment of [
      "Your goal is to find relevant sessions based on a user's search query.",
      'Exact tag matches (highest priority',
      'When in doubt, INCLUDE the session.',
      '{"relevant_indices": [2, 5, 0]}',
    ]) assert.ok(sessionSearch.includes(fragment), fragment)

    const ultraplan = source('commands/ultraplan.tsx')
    for (const fragment of [
      "visual_plan: VISUAL_PLAN_INSTRUCTIONS",
      "three_subagents_with_critique: THREE_SUBAGENTS_INSTRUCTIONS",
      "'tengu_ultraplan_prompt_identifier'",
      "'Remote plan mode with rich web editing experience.'",
      "'Advanced multi-agent plan mode.'",
      "? 'create_api_fail'",
      'prompt_identifier:',
    ]) assert.ok(ultraplan.includes(fragment), fragment)
    assert.equal(
      Buffer.byteLength(
        JSON.parse(
          ultraplan.match(/const VISUAL_PLAN_INSTRUCTIONS = ("(?:[^"\\]|\\.)*");/)?.[1] ??
            'null',
        ),
      ),
      2678,
    )

    const teleportApi = source('utils/teleport.tsx')
    for (const fragment of [
      'onCreateFail?: (message: string) => void',
      'validateStatus: status => status < 500',
      'options.onCreateFail?.(',
    ]) assert.ok(teleportApi.includes(fragment), fragment)

    const detail = source('components/tasks/RemoteSessionDetailDialog.tsx')
    assert.ok(detail.includes('Approve, edit, or comment on the plan'))
    const teleport = source('commands/teleport/teleport.tsx')
    assert.ok(teleport.includes('Session resumed successfully'))
    assert.ok(teleport.includes('Teleport cancelled'))
    assert.ok(
      source('commands/teleport/index.ts').includes(
        'Resume a Claude Code session from claude.ai',
      ),
    )

    const insights = source('commands/insights.ts')
    for (const fragment of [
      'function updateHourHistogram(offsetFromPT)',
      "document.getElementById('hour-histogram')",
      "fill.style.background = '#8b5cf6'",
    ]) assert.ok(insights.includes(fragment), fragment)

    const memory = source('memdir/teamMemPrompts.ts')
    for (const fragment of [
      'in the private directory. The single',
      'indexes both private and team memories',
      'is loaded into your conversation context',
      'keep the index concise',
    ]) assert.ok(memory.includes(fragment), fragment)

    const footer = source('components/PromptInput/PromptInputFooterLeftSide.tsx')
    assert.ok(footer.includes('action="native select"'))
    const shortcut = source('components/design-system/KeyboardShortcutHint.tsx')
    assert.ok(shortcut.includes('{shortcutText} to {action}'))

    const digitInput = source('components/FeedbackSurvey/useDebouncedDigitInput.ts')
    for (const fragment of [
      'const DEFAULT_DEBOUNCE_MS = 400',
      'const DEFAULT_MOUNT_DELAY_MS = 600',
      'enabled ? Date.now() : null',
      'if (enabled && !wasEnabledRef.current)',
      'Date.now() - enabledAtRef.current < mountDelayMs',
      ".normalize('NFKC')",
      '[inputValue, enabled, once, debounceMs, mountDelayMs]',
    ]) assert.ok(digitInput.includes(fragment), fragment)
  },
)
