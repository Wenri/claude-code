import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_90_BUNDLE ??
  (process.env.CLAUDE_CODE_RECOVERY_ARTIFACT_ROOT
    ? path.join(
        process.env.CLAUDE_CODE_RECOVERY_ARTIFACT_ROOT,
        '2.1.90/package/cli.js',
      )
    : undefined)
const targetSha256 =
  '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9'
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
  skip: !selected,
}
const historicalOptions = {
  skip: !selected || isCurrentSource,
  timeout: 30_000,
}
const bundleOptions = {
  skip: !selected || !targetBundlePath,
}

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
  [2631, ['unresolved', 1075985, 1076486, '3bbe57e00c483cd3cc10fa168ca8732f9fd8c35bf8210575f6412ebf683d7036']],
  [3152, ['unresolved', 2401838, 2402799, '62a88f4bd77eff6d0988ebb3ff239651793cab8258a9f80b185559073c9c7e5a']],
  [4855, ['unresolved', 3672743, 3672843, '775461eb510557d24e121b9a42b46480c6bff4c7d57d01cd015f3259633f8a22']],
  [5022, ['unresolved', 3719011, 3719189, 'bd8ffedc31b73ce206d04947975b33e2518d0891eb0b13504672cb9ccdb4ea9a']],
  [5033, ['unresolved', 3721650, 3722274, '4b2abaa1884670bd38438da085e98218885386109374afe443cf25b91da6b174']],
  [8787, ['unresolved', 6956834, 6960227, 'cdb660925588f7c324e020bbb9fb390d489404ee301eccfea6269a789c4da2db']],
  [8788, ['unresolved', 6960227, 6963895, '436068044ac67f073506cee6a96fe0e2ccb09c7c6ff590a702cf9f2d3d082207']],
  [8898, ['unresolved', 6996385, 6997368, 'be455a4fe4905835d7980196cf9ea8eadedf3d42339fb02fbdc9b8ac30467b11']],
  [10054, ['unresolved', 8202087, 8203450, '1062bbfe87a4142432e6b875b831d9002253a57a14c0f1eb1762c8076b318edb']],
  [10499, ['unresolved', 8396053, 8397231, '5a197a3c96034325ddb18ed573c6a346b43d51daee39b2e00f27cfdc252a483e']],
  [12030, ['unresolved', 9364589, 9365420, 'ab08b8c0f6b592ae89d3bc0446367df7b71395149272e6f09f2d83c966047e8f']],
  [12041, ['unresolved', 9373603, 9373772, '3cd9d286cab1f196e0556c01500f72db62de531e5e533c6efdbbfc0a56967794']],
  [12085, ['unresolved', 9421801, 9423432, '21a56e992a164798a90abb4fc0e6ce1537c90177d26bacbd411ecb35f8e97411']],
  [12100, ['unresolved', 9425840, 9428854, '84ebfa52bc779a35cc303c75b0b6c8721cec7c7ad96b70d9ef0f81f13db20690']],
  [12159, ['unresolved', 9465070, 9466794, '29f2bada3494cafdaf88bd26fcf6efd84d3dda1db744ee2f0197a02d31d45e0a']],
  [12378, ['unresolved', 9576759, 9578191, '43f49b7250d6137adde9886b939050fd32c7b66e21304b08ffa5f43860d3de14']],
  [12417, ['unresolved', 9592253, 9592331, '40e6d3efcc74b8080b55d94c22fd958218cc687d6d847521c298722fba46dd03']],
  [12452, ['unresolved', 9602568, 9603349, 'd71f6dfe37f5972db7b37e67b19927ec15034038a208324e0c066d296d37519c']],
  [12455, ['unresolved', 9603459, 9603830, '6f38bd05e88b562f6c52ff6586e179a0e0f9334b2a161a648034d9f05865ac9e']],
  [12746, ['unresolved', 9736755, 9751550, '384bb93443006066f2205d7bebbfdb92bbf4f2ccb89b22139b01fde8a15e70c3']],
  [13639, ['unresolved', 10101986, 10102851, '7603d7e4b28ffded85c73612bbd521296fa3c14cd9979bbe19813b85f0beb2ba']],
  [14110, ['unresolved', 10464208, 10464503, '83f20a748f4c9357e1c795190277a4bdaaa00470c9d86724631579ed0a48e905']],
  [14111, ['unresolved', 10464503, 10464853, '922614d93957fca7b94a1edc0229508bdc12c42c091ce1072bcded7e22e5ce0f']],
  [14112, ['unresolved', 10464853, 10464941, '18c2ae148bdd73bf99e8c208c80226ceb079cd842bec26c416ca2a4bc3427ca2']],
  [14116, ['unresolved', 10465235, 10465970, '67163097ddf744286ad3a0ccaa756b86afaf265f7809ac275333675030dc7deb']],
  [14395, ['unresolved', 10589207, 10609599, 'e3e68f2df9a545c06c2c8c617963a075e3a35229190ae203b88e55541b537694']],
  [14494, ['unresolved', 10638149, 10639577, 'c076d0c1f17fce96163021b17cb6031f0383f6946c94cc2af2c132e5ccece5b5']],
  [14503, ['unresolved', 10647012, 10647082, 'c6e27aa03d19ea0bd6de02e5f043a5e1d93a98280e4527fbb9aed0c45efab587']],
  [14519, ['unresolved', 10652405, 10653547, '93b634ee67a64260b0b8d8d4e81c2e459597fa668e8ffb2bbaa48816e4824ac1']],
  [15223, ['unresolved', 10960667, 10961653, '5b36f1dfcfad5a05be4f8ea14818d82695b68e3fde9b7af1c54f799cdd393948']],
  [15230, ['unresolved', 10962064, 10964485, 'e26e28ee08c3b02aa68b17f8bd326e4360d1ee263808748e5428d8d231904817']],
  [15318, ['unresolved', 11197906, 11201282, 'df74ae6e4f2de9386cfbce68905c4299a31807125913d52dd3c1cd394db7fc7a']],
  [15323, ['unresolved', 11206744, 11209949, '934794fdd3b958c2111773835070a9938507580f38337803acd3813c67aa95de']],
  [15432, ['unresolved', 11246993, 11247414, '8548c489075b066c269112f5b9068878293f194ca2589bfad8cb11fba456d5d6']],
  [15480, ['unresolved', 11267920, 11269161, 'bbdd08a34c87e151dbf4bdebe66721092d7a7d1d898537afc527ab89abd1f608']],
  [15536, ['unresolved', 11348877, 11351732, 'f9120319cf0d14aadf6c5e8a02f61c08a58f4b9341fab6ac54e471ba7ce12acb']],
  [15572, ['unresolved', 11354504, 11364551, '73e62195357886befb600434dd04746bbade1fec163c9783cafd9ee65e16778e']],
  [15615, ['unresolved', 11376020, 11376665, 'dd3484f3ac86610c1b70091c43224b8e31446f46793e73bf0455b70a7e376c61']],
  [15616, ['unresolved', 11376665, 11377079, 'd1ab118beb983951f9a1fffc614d66403c2ff2fee62dbfc329d5112c155a75f3']],
  [15623, ['unresolved', 11377624, 11377676, 'd1d7c0887e2f0586bb6c138138d000d2bd05ef634c3dc69c9c4630f4832aa99f']],
  [15627, ['unresolved', 11378243, 11379708, '8aeed8d5e8862ea34e2441fe337378bff5532d0e39fe1f1cac761d6bf31eb03d']],
  [15631, ['unresolved', 11381629, 11382616, '50e11dd3ac83e6f758679b9090f95afae46a3215bcf84405076fc739829e069a']],
  [15633, ['unresolved', 11382771, 11385875, 'c96d29eb3b3ff6b5708ac604d950a7241ef4108557f6eada9033455cb2646f93']],
  [15658, ['unresolved', 11393218, 11394468, '3b700bd137be6148d62c97e978edab7123444078acfa3acfadc44a5ef5d3ac2a']],
  [15924, ['unresolved', 11527720, 11528562, 'db4eb8e28802da198c788d76f05cbecf0c2fb6e69d15c0d05c1771d5499665ad']],
  [16158, ['unresolved', 11679907, 11680656, 'de345c9de4492154acc3ddaa9c91a6cbc57f73afa98b02bddfa48895a74effe5']],
  [16316, ['unresolved', 11769165, 11777373, 'e58cb9949794acf90a1ca87092bc6c6ffe9a865924a1941f289324a230e54433']],
  [16633, ['unresolved', 11947766, 11949315, '20fd707b903c689ecfbddcbd8feecb5955163a3dcf164236408e93f185666b93']],
  [16656, ['unresolved', 11955566, 11969126, '6269ad83e2dd4cfe679041e32c2ea08da62ee6edece9b652635d9b2378a4047d']],
  [16657, ['unresolved', 11969126, 11973342, '9836aa76c2d31b60c3fd5da5c68cc2202496c17567709c2e0cf40c96b9b5dab1']],
  [16916, ['unresolved', 12062449, 12065489, 'e75b2e282581c38986c72e03b1617cf9b55c977499f7a9e754812086d7dd355e']],
  [16919, ['unresolved', 12067523, 12070038, 'f6062605a6984a9f4519c31a877b257a8d7ba8e6c7d7eafcf0fab95285e48b03']],
  [17318, ['unresolved', 12234194, 12234467, '52e97960b832594996ecca584566b55a3e0fefab6d18f0d9cbcd4a15c1cc114c']],
  [17275, ['unresolved', 12221789, 12222437, '79d9e6cd68e6adae9bcac6869956d3940d37283846742fb0a1a8f49a27322c29']],
  [17664, ['unresolved', 12374084, 12429086, '7e05eb2169ee606c7091e321a21e8fd764a257361e09bef97422bb801d762366']],
  [17800, ['unresolved', 12482237, 12485890, '551adb0cad8fe605429c641cce7d65f114bbffea0562bef31cb8f04c19999694']],
  [17909, ['unresolved', 12570308, 12578897, 'a6ddeac6b073baf1b8768d01393a8296a3e9ba4d5698e5421f46c4e114a861f7']],
  [17910, ['unresolved', 12578897, 12581293, '5863d5bd364aa7cdd3479a9a9fefab85f412b378aa562b08acf896e57777e743']],
  [17982, ['unresolved', 12840657, 12840861, 'f0a799e887a980477a11b209f1431ad491d48ac960ab59a5b7a91c0c3b935ef6']],
  [18263, ['unresolved', 13057797, 13058935, '38e1ab6fa3daa1a5feff25bcd2deb49347e0a6fd9112076c5a15a64fcc1f89be']],
])

test('2.1.90 runtime evidence pins every recovered and static target unit', bundleOptions, () => {
  if (!selected || !targetBundlePath) return
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  for (const fragment of [
    '[auto-mode] hasAutoModeOptIn=true policy defaultMode=auto implies consent',
    'PostToolUse hook modified ',
    'tengu_forked_agent_default_turns_exceeded',
    'Retrieved for possible relevance — use only if it actually applies to what the user asked.',
    'Lost connection to the remote session after repeated retries — the session may still be running',
    'Upgrade not currently available. For additional usage, run /extra-usage.',
    'buddy is unavailable on this configuration',
    'Permission dialog opened with invalid input — upstream should have validated.',
    'allow_quick_web_setup',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }

  assert.match(bundle, /function ZIY\(\)\{return null\}/)
  assert.match(
    bundle,
    /ab\("bg-job-dir",\(\)=>ZIY\(\)\)[\s\S]*?function ZIY\(\)\{return null\}/,
  )
  assert.match(bundle, /function E45\([^)]+\)\{[\s\S]*?hw7[\s\S]*?==="banner"[\s\S]*?\}var hw7=null;/)
})

test('historical source owns settings, memory, tool, and selector deltas', historicalOptions, () => {
  if (!selected || isCurrentSource) return
  assertFragments('src/utils/settings/settings.ts', [
    '[auto-mode] hasAutoModeOptIn=true policy defaultMode=auto implies consent',
    "getSettingsForSource('policySettings')?.permissions?.defaultMode",
  ])
  assertFragments('src/services/analytics/datadog.ts', [
    'pubea5604404508cdd34afb69e6f42a05bc',
  ])
  assertFragments('src/utils/fastMode.ts', [
    'Fast mode is not available on Bedrock, Vertex, Foundry, or Claude Platform on AWS',
  ])
  assertFragments('src/constants/system.ts', ["provider !== 'anthropicAws'"])
  assertFragments('src/components/messages/RateLimitMessage.tsx', [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_harbor', false)",
  ])
  assertFragments('src/utils/toolErrors.ts', [
    'PostToolUse hook modified ${filename} after ${toolName} — re-synced readFileState',
    'Your next Edit will not fail with a stale-file error',
  ])
  assertFragments('src/services/tools/toolExecution.ts', [
    'is only available inside ${REPL_TOOL_NAME}',
    'with code: await ${toolName}({...}).',
  ])
  assertFragments('src/services/extractMemories/prompts.ts', [
    "If nothing is worth saving, output only 'Nothing to save.' Do not explain why.",
    'Apply the memory types, ${scope}what-not-to-save criteria, and frontmatter format from the Memory section of your system prompt — it is already in your context above.',
  ])
  assertFragments('src/services/extractMemories/extractMemories.ts', [
    '[extractMemories] skipping — no user prose since last extraction',
    'tengu_extract_memories_skipped_no_prose',
  ])
  assertFragments('src/utils/forkedAgent.ts', [
    'tengu_forked_agent_default_turns_exceeded',
  ])
  assertFragments('src/utils/attachments.ts', ['Memory: ${path}:'])
  assertFragments('src/utils/attachments.ts', [
    "querySource === 'extract_memories'",
    "querySource === 'auto_dream'",
  ])
  assertFragments('src/query.ts', [
    'startRelevantMemoryPrefetch(',
    'querySource,',
  ])
  assertFragments('src/utils/plugins/loadPluginCommands.ts', [
    ".replace(/^[/\\\\]/, '')",
  ])
  assertFragments('src/utils/messages.ts', [
    "index === 0 ? 'Retrieved for possible relevance — use only if it actually applies to what the user asked.\\n\\n' : ''",
  ])
  assertFragments('src/components/HelpV2/General.tsx', [
    'to learn the features most people miss.',
  ])
  assertFragments('src/components/LogSelector.tsx', [
    'input.length === 1 || !/^[a-z]+\\d*$/.test(input)',
  ])
})

test('historical memory-selector prompt equals the authenticated cooked target value', historicalOptions, () => {
  if (!selected || isCurrentSource) return
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const targetAst = parse(target, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  let targetPrompt
  const visit = node => {
    if (!node || typeof node !== 'object' || targetPrompt) return
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      node.value.startsWith(
        "You are selecting memories that will be useful to Claude Code as it processes a user's query.",
      )
    ) {
      targetPrompt = node.value
      return
    }
    if (
      node.type === 'TemplateLiteral' &&
      node.expressions.length === 0 &&
      node.quasis[0]?.value?.cooked?.startsWith(
        "You are selecting memories that will be useful to Claude Code as it processes a user's query.",
      )
    ) {
      targetPrompt = node.quasis[0].value.cooked
      return
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue
      if (Array.isArray(value)) value.forEach(visit)
      else visit(value)
    }
  }
  visit(targetAst)
  assert.equal(typeof targetPrompt, 'string')

  const owner = source('src/memdir/findRelevantMemories.ts')
  const match = owner.match(/const SELECT_MEMORIES_SYSTEM_PROMPT = `([\s\S]*?)`/)
  assert.ok(match)
  assert.equal(match[1], targetPrompt)
  assert.equal(
    sha256(targetPrompt),
    'bceb6909ae19ee1fc5672b5470cf337fe72bea3430e404dedf9b24720c150f5e',
  )
  assert.equal(sha256(match[1]), sha256(targetPrompt))
})

test('historical source owns Ultraplan, rate-limit, remote, buddy, and bridge behavior', historicalOptions, () => {
  if (!selected || isCurrentSource) return
  assertFragments('src/utils/ultraplan/ccrSession.ts', [
    'Lost connection to the remote session after repeated retries — the session may still be running',
  ])
  const ultraplan = assertFragments('src/commands/ultraplan.tsx', [
    "'tengu_ultraplan_timeout_seconds'",
    '1800',
    'Interactive planning on the web where you can edit and leave targeted comments on Claude\'s plan.',
    'tengu_ultraplan_prompt_identifier',
  ])
  assert.ok(ultraplan.includes('SIMPLE_PLAN_PROMPT'))
  assert.ok(ultraplan.includes('THREE_SUBAGENTS_PROMPT'))
  assertFragments('src/commands/upgrade/upgrade.tsx', [
    "'tengu_slate_harbor'",
    'Upgrade not currently available. For additional usage, run /extra-usage.',
  ])
  assertFragments('src/commands/rate-limit-options/rate-limit-options.tsx', [
    'tengu_slate_harbor',
    '!upgradeUnavailable',
  ])
  assertFragments('src/commands/remote-setup/index.ts', [
    "isPolicyAllowed('allow_remote_sessions')",
    "isPolicyAllowed('allow_quick_web_setup')",
  ])
  assertFragments('src/commands/buddy/index.tsx', [
    "argumentHint: '[pet|off]'",
    'buddy is unavailable on this configuration',
    'get isHidden()',
  ])
  assertFragments('src/utils/sessionStorage.ts', [
    'permission-mode',
    'savePermissionMode',
    'permissionModes.set(entry.sessionId, entry.permissionMode)',
    'CCR v2 internal event writer cleared',
  ])
  assertFragments('src/utils/sessionStoragePortable.ts', [
    'Buffer.from(\'{"type":"attribution-snapshot"\')',
    'Buffer.from(\'"compact_boundary"\')',
    'TRANSCRIPT_READ_CHUNK_SIZE = 1024 * 1024',
  ])
  assertFragments('src/utils/skills/skillChangeDetector.ts', [
    "path.split(/[/\\\\]/).some(dir => dir === '.git')",
  ])
  assertFragments('src/types/logs.ts', [
    "type: 'permission-mode'",
    'permissionMode: PermissionMode',
  ])
  assertFragments('src/screens/REPL.tsx', [
    'savePermissionMode(toolPermissionContext.mode)',
  ])
  assertFragments('src/utils/conversationRecovery.ts', [
    'permissionMode: log?.permissionMode',
  ])
  const restore = assertFragments('src/utils/sessionRestore.ts', [
    'permissionModeCliSet: boolean',
    "mode === 'plan' || mode === 'bypassPermissions'",
    "mode === 'default' && value !== 'default'",
    'if (!isAutoModeGateEnabled()) return undefined',
    'setAutoModeActive(true)',
    'mode: restoredPermissionMode',
  ])
  assert.match(
    restore,
    /const restoredPermissionMode = getRestoredPermissionMode\([\s\S]*?result\.permissionMode,[\s\S]*?context\.permissionModeCliSet/,
  )
  assertFragments('src/main.tsx', [
    'permissionModeCliSet: permissionModeCli !== undefined || Boolean(dangerouslySkipPermissions)',
  ])
})

test('source owns proxy, invalid-permission, and remote-scheduling guards', sourceOptions, () => {
  if (!selected) return
  assertFragments('src/components/mcp/ElicitationDialog.tsx', [
    'useLayoutEffect(() =>',
    'setRawMode(true)',
    'return () => setRawMode(false)',
  ])
  assertFragments('src/upstreamproxy/upstreamproxy.ts', [
    "'AWS_ACCESS_KEY_ID'",
    "'AWS_SECRET_ACCESS_KEY'",
    "'GH_TOKEN'",
    "'GITHUB_TOKEN'",
    "GITHUB_TOKEN: 'proxy-injected'",
  ])
  assertFragments('src/components/permissions/PermissionRequest.tsx', [
    'tool.inputSchema.safeParse(input)',
    '{ context: \'Confirmation\', isActive: parseResult.success }',
    'Permission dialog opened with invalid input — upstream should have validated.',
    'toolUseConfirm.onReject(message)',
    'if (!parseResult.success) return null',
  ])
  assertFragments('src/skills/bundled/scheduleRemoteAgents.ts', [
    "isPolicyAllowed('allow_quick_web_setup')",
    "isPolicyAllowed('allow_remote_sessions')",
  ])
})

test('source owns every target90 residue property through reachable runtime controls', sourceOptions, () => {
  if (!selected) return
  assertFragments('src/services/analytics/metadata.ts', [
    'const { namespace, cluster } = getCooEnvironment()',
    '...(namespace && {',
    'cooNamespace:',
    '...(cluster && {',
    'cooCluster:',
  ])

  const classifier = assertFragments('src/utils/permissions/yoloClassifier.ts', [
    'getExtraBodyParams,',
    'extraBodyParams: getExtraBodyParams()',
  ])
  assert.equal(
    classifier.match(/extraBodyParams: getExtraBodyParams\(\)/g)?.length,
    3,
  )
  assertFragments('src/components/messageRating.tsx', [
    "logEvent('tengu_message_rated'",
    'cleared,',
    'if (!cleared)',
  ])

  assertFragments('src/commands/powerup/powerup.tsx', [
    'export function parseDemoFrame',
    'return { dim, segments }',
    'const [boxRef, time] = useAnimationFrame',
    '<DemoBox boxRef={boxRef}>',
    'delay: Math.random() * 400',
    '.sort((left, right) => left.x - right.x)',
  ])

  const stats = assertFragments('src/components/Stats.tsx', [
    'KeyboardEvent',
    'tabIndex={0} autoFocus onKeyDown={t6}',
    'const handleModelKeyDown = (event: KeyboardEvent): void =>',
    "event.key === 'down'",
    "event.key === 'up'",
    'onKeyDown={handleModelKeyDown}',
  ])
  assert.ok(stats.indexOf("event.key === 'down'") < stats.indexOf('onKeyDown={handleModelKeyDown}'))

  const bridge = assertFragments('src/bridge/remoteBridgeCore.ts', [
    'onTransportPersistenceReady?:',
    'onTransportPersistenceTeardown?: () => void',
    'onTransportPersistenceReady?.(writer, readers)',
    'onTransportPersistenceTeardown?.()',
  ])
  assert.ok(bridge.indexOf('onTransportPersistenceReady?.(writer, readers)') < bridge.lastIndexOf('onTransportPersistenceTeardown?.()'))

  assertFragments('src/components/mcp/ElicitationDialog.tsx', [
    'useLayoutEffect(() =>',
    'setRawMode(true)',
    'return () => setRawMode(false)',
    'tabIndex={0}',
    'autoFocus',
    'onKeyDown=',
  ])
  const teams = assertFragments('src/components/teams/TeamsDialog.tsx', [
    'const handleKeyDown = (event: KeyboardEvent): void =>',
    "input === 'k' && !key.ctrl && !key.meta",
    "input === 's' && !key.ctrl && !key.meta",
    'event.preventDefault()',
    'tabIndex={0} autoFocus onKeyDown={handleKeyDown}',
    'event.key === "p" && !event.ctrl && !event.meta',
    'tabIndex={0} autoFocus onKeyDown={t4}',
  ])
  assert.ok(teams.indexOf('event.preventDefault()') < teams.indexOf('tabIndex={0} autoFocus onKeyDown={handleKeyDown}'))

  assertFragments('src/utils/sessionRestore.ts', [
    'if (!isAutoModeGateEnabled()) return undefined',
    'setAutoModeActive(true)',
  ])
  assertFragments('src/components/ResumeTask.tsx', [
    'const handleKeyDown = (event: KeyboardEvent): void =>',
    "event.ctrl && event.key === 'c'",
    "event.ctrl && event.key === 'r' && loadErrorType",
    "event.key === 'return'",
    'event.preventDefault()',
    'tabIndex={0} autoFocus onKeyDown={handleKeyDown}',
  ])
  assertFragments('src/main.tsx', [
    'apiKeySource: getAnthropicApiKeyWithSource({',
    'skipRetrievingKeyFromApiKeyHelper: true',
    '}).source',
  ])
})
