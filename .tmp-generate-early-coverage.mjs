import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const inputRoot = '/tmp/early-semantic-owners'
const cases = [
  ['2.1.89-to-2.1.90', '2.1.89', '2.1.90', '2ba94f2c67c645119e4f33ee9a68e7e14449c238', '/tmp/early-own-worktrees/90'],
  ['2.1.90-to-2.1.91', '2.1.90', '2.1.91', 'cb8a3dbe788589c66326d345c54d35abd5603850', '/tmp/early-own-worktrees/91'],
  ['2.1.91-to-2.1.92', '2.1.91', '2.1.92', '696930f29337e98869337eb59f55ead81f242abb', '/tmp/early-own-worktrees/92'],
  ['2.1.92-to-2.1.94', '2.1.92', '2.1.94', '7edbf6deb50ef0c59765d3e6d05170b52915dac1', '/tmp/early-own-worktrees/94'],
  ['2.1.94-to-2.1.96', '2.1.94', '2.1.96', '2f146603111bff7168baee238bdb62839d7d0802', '/tmp/early-own-worktrees/96'],
]
const artifactRoot = '/tmp/claude-recovery-all-artifacts.9cj1Zk'
const requestedCase = process.env.CLAUDE_CODE_EARLY_GENERATOR_CASE

const generatedMetadataIndexes = new Map(
  Object.entries({
    '2.1.89-to-2.1.90': [5033, 8697, 9370, 9371, 13101, 13349, 13642, 14303, 15012, 15668, 15733, 15916, 16024, 16109, 16110, 16304, 16990, 18262],
    '2.1.90-to-2.1.91': [4871, 8728, 9416, 9417, 9556, 13155, 13391, 13771, 14406, 15133, 15765, 15947, 16055, 16140, 16141, 16335, 17022, 18316],
    '2.1.91-to-2.1.92': [5030, 8738, 9431, 9432, 13282, 13514, 13889, 14533, 15267, 15834, 15899, 16085, 16195, 16279, 16280, 16474, 16866, 16870, 16873, 17162, 18417, 18437, 18448],
    '2.1.92-to-2.1.94': [5041, 8785, 9477, 9478, 9568, 13355, 13589, 13964, 14595, 15331, 16164, 16274, 16358, 16359, 16561, 16960, 17249, 18550],
    '2.1.94-to-2.1.96': [8786, 9478, 9479, 13356, 13590, 13965, 14596, 15332, 16165, 16275, 16359, 16360, 16562, 16961, 17250, 18551],
  }).map(([caseName, indexes]) => [caseName, new Set(indexes)]),
)

const dependencyBuildPathIndexes = new Map(
  Object.entries({
    '2.1.89-to-2.1.90': [7043, 7156],
    '2.1.90-to-2.1.91': [7072, 7185],
    '2.1.91-to-2.1.92': [7063, 7176],
    '2.1.92-to-2.1.94': [7099, 7212],
    '2.1.94-to-2.1.96': [7100, 7213],
  }).map(([caseName, indexes]) => [caseName, new Set(indexes)]),
)

const dceNonruntimeIndexes = new Map(
  Object.entries({
    '2.1.89-to-2.1.90': [15924, 17982],
    '2.1.90-to-2.1.91': [],
    '2.1.91-to-2.1.92': [11828, 14393, 17572],
    '2.1.92-to-2.1.94': [16488, 17655],
  }).map(([caseName, indexes]) => [caseName, new Set(indexes)]),
)

const specialOwners = new Map()
function special(caseName, indexes, paths, behavior, evidenceIds) {
  for (const targetIndex of indexes) {
    specialOwners.set(`${caseName}:${targetIndex}`, {
      paths,
      behavior,
      evidenceIds,
    })
  }
}

special(
  '2.1.89-to-2.1.90',
  [8758, 8759],
  [
    'src/utils/permissions/yoloClassifier.ts',
    'src/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt',
    'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt',
  ],
  'The exact 2.1.90 cooked auto-mode classifier and external-permissions prompt assets are loaded through txtRequire with its one-terminal-newline normalization and used by the reachable classifier request.',
  ['asset-target-fragment', 'asset-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [10832],
  ['src/utils/powershell/parser.ts'],
  'The PowerShell parser subprocess uses the exact target script body, JSON protocol, AST conversion, parser error mapping, timeout, and exit handling.',
  ['powershell-target-fragment', 'powershell-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [10844, 10845, 10846],
  ['src/tools/PowerShellTool/commonParameters.ts'],
  'PowerShell common parameters include the exact ActionPreference aliases, unambiguous abbreviations, and safe values used by the target validator.',
  ['powershell-safety-target-fragment', 'powershell-safety-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [10861],
  ['src/tools/PowerShellTool/readOnlyValidation.ts'],
  'Docker read-only validation rejects the target connection/configuration flag families before accepting safe subcommands.',
  ['powershell-safety-target-fragment', 'powershell-safety-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [10885],
  ['src/tools/PowerShellTool/pathValidation.ts'],
  'Recursive Remove-Item targeting the working directory or an ancestor returns the exact target manual-approval decision.',
  ['powershell-safety-target-fragment', 'powershell-safety-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [10892],
  ['src/utils/powershell/dangerousCmdlets.ts'],
  'The PowerShell wildcard/implicit-invocation suppression set includes arp exactly as shipped.',
  ['powershell-safety-target-fragment', 'powershell-safety-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [10937],
  ['src/tools/PowerShellTool/powershellPermissions.ts'],
  'Permission validation strips block comments before fallback analysis and asks for background jobs and compound archive extraction using the exact target branches and messages.',
  ['powershell-safety-target-fragment', 'powershell-safety-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [13286, 15644, 16254, 16255, 16325, 16345],
  [
    'src/bridge/persistenceSync.ts',
    'src/bridge/initReplBridge.ts',
    'src/bridge/replBridge.ts',
    'src/bridge/remoteBridgeCore.ts',
    'src/bridge/replBridgeTransport.ts',
    'src/utils/sessionStorage.ts',
  ],
  'Session persistence uploads the exact post-compaction main/subagent transcript slice with UUID de-duplication and a 5 MiB bound, wires CCR readers/writers, and guards bridge rebuild and teardown with a monotonically increasing generation.',
  ['persistence-target-fragment', 'persistence-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [358],
  ['src/bootstrap/state.ts'],
  'The public state owner exports the session memory toggle getter/setter used by the command, extractor, and filesystem permission graph.',
  ['toggle-memory-target-fragment', 'toggle-memory-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [16657],
  ['src/components/mcp/ElicitationDialog.tsx'],
  'The elicitation URL dialog switches raw mode in a layout effect and restores it synchronously on cleanup.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [14395],
  ['src/components/LogSelector.tsx'],
  'The target90 LogSelector key handler prevents the default terminal action for every consumed search, navigation, selection, word-delete, and preview chord before running the corresponding UI branch.',
  ['logselector-keydown-target-fragment', 'logselector-keydown-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [17888],
  ['src/skills/bundled/verify/SKILL.md', 'src/skills/bundled/verifyContent.ts'],
  'The 2.1.90 bundled verify skill is the exact target cooked asset and is reachable through the builtin verify content loader.',
  ['asset-target-fragment', 'asset-semantic-test'],
)

special(
  '2.1.89-to-2.1.90',
  [
    14109, 14115, 14117, 14118, 14120, 14121, 14122, 14123, 14124,
    14125, 14127, 14128, 14129, 14130, 14131, 14133, 14135, 14136,
    14137,
  ],
  ['src/commands/powerup/powerup.tsx'],
  'The shipped /powerup lesson catalog, styled demo parser, navigation, completion state, persistence, celebration, and telemetry have an exact reachable source owner.',
  ['powerup-target-fragment', 'powerup-semantic-test'],
)

special(
  '2.1.89-to-2.1.90',
  [6671],
  ['src/tools/AgentTool/built-in/verificationAgent.ts'],
  'The historical verification-agent owner carries the exact target prompt, including current-turn parent-conversation scanning, mandatory adversarial probes, and the non-hedging PARTIAL protocol.',
)
special(
  '2.1.89-to-2.1.90',
  [12097, 15730, 15731],
  [
    'src/bootstrap/state.ts',
    'src/services/extractMemories/extractMemories.ts',
    'src/utils/permissions/filesystem.ts',
  ],
  'Session memory toggle state is enforced at extraction and filesystem read/write permission boundaries with the exact target denial and recovery guidance.',
)
special(
  '2.1.89-to-2.1.90',
  [13623, 13626],
  ['src/commands/toggle-memory.ts', 'src/commands.ts'],
  'The shipped hidden /toggle-memory command flips session state, emits tengu_memory_toggled, returns the exact enable/disable text, and remains registered with its target-disabled availability gate.',
)
special(
  '2.1.89-to-2.1.90',
  [2033],
  ['src/utils/log.ts'],
  'Error reporting is disabled for Claude Platform on AWS exactly as for the other external cloud providers.',
)
special(
  '2.1.89-to-2.1.90',
  [3024],
  ['src/utils/model/configs.ts'],
  'Every target model configuration maps anthropicAws to the corresponding direct Anthropic model identifier.',
)
special(
  '2.1.89-to-2.1.90',
  [3025, 3027],
  ['src/utils/model/providers.ts'],
  'Provider selection preserves the target Bedrock, Foundry, Anthropic AWS, Vertex priority and direct-Anthropic predicate.',
)
special(
  '2.1.89-to-2.1.90',
  [3152],
  ['src/utils/fastMode.ts'],
  'Fast mode rejects every non-first-party provider with the exact Claude Platform on AWS target reason.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [3197, 3198],
  ['src/utils/model/model.ts'],
  'Default Opus and Sonnet selection treats Claude Platform on AWS as a direct Anthropic provider.',
)
special(
  '2.1.89-to-2.1.90',
  [4447, 4450],
  ['src/services/api/client.ts'],
  'The Anthropic AWS client branch loads the official SDK, honors skip/API-key/AWS credential authentication, and uses target request-ID rules.',
)
special(
  '2.1.89-to-2.1.90',
  [4478, 4480, 4481, 4482, 4484, 4485],
  ['src/utils/betas.ts'],
  'Anthropic AWS carries the exact target interleaved-thinking, context-management, structured-output, auto-mode, experimental-beta, and global-cache capability gates.',
)
special(
  '2.1.89-to-2.1.90',
  [4538, 4584, 4596],
  ['src/utils/auth.ts'],
  'Authentication and account-eligibility predicates classify Claude Platform on AWS as an externally authenticated third-party service.',
)
special(
  '2.1.89-to-2.1.90',
  [5033],
  ['src/constants/system.ts'],
  'The attribution header omits the native cch placeholder for Claude Platform on AWS while retaining workload and version fields.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [6253, 6254],
  ['src/utils/thinking.ts'],
  'Thinking and adaptive-thinking support use direct-provider semantics for Claude Platform on AWS.',
)
special(
  '2.1.89-to-2.1.90',
  [8500],
  ['src/utils/subprocessEnv.ts'],
  'ANTHROPIC_AWS_API_KEY is scrubbed from untrusted subprocess environments.',
)
special(
  '2.1.89-to-2.1.90',
  [8978],
  ['src/utils/managedEnvConstants.ts'],
  'Provider-managed and safe-environment inventories carry the exact Anthropic AWS routing, endpoint, workspace, key, and skip-auth entries.',
)
special(
  '2.1.89-to-2.1.90',
  [9541],
  ['src/utils/status.tsx'],
  'Status output exposes the exact Claude Platform on AWS label, base URL, workspace, region, and skipped-auth properties.',
)
special(
  '2.1.89-to-2.1.90',
  [9738],
  ['src/entrypoints/sdk/coreSchemas.ts'],
  'The SDK account schema accepts anthropicAws as the active API provider.',
)
special(
  '2.1.89-to-2.1.90',
  [9857],
  ['src/utils/swarm/spawnUtils.ts'],
  'Teammates inherit the exact Anthropic AWS provider, workspace, endpoint, key, skip-auth, and region variables.',
)
special(
  '2.1.89-to-2.1.90',
  [11419],
  ['src/tools/WebSearchTool/WebSearchTool.ts'],
  'Web search is reachable on Claude Platform on AWS exactly as on the first-party endpoint.',
)
special(
  '2.1.89-to-2.1.90',
  [15982],
  ['src/services/api/claude.ts'],
  'Streaming requests generate and forward client request IDs for default Claude Platform on AWS endpoints.',
)
special(
  '2.1.89-to-2.1.90',
  [16124],
  ['src/utils/apiPreconnect.ts'],
  'API preconnect skips Claude Platform on AWS because it uses a different authenticated endpoint.',
)
special(
  '2.1.89-to-2.1.90',
  [17541],
  ['src/utils/model/deprecation.ts'],
  'Model retirement metadata explicitly marks the three legacy models as not deprecated on Claude Platform on AWS.',
)
special(
  '2.1.89-to-2.1.90',
  [18255],
  ['src/main.tsx'],
  'Deferred startup prefetches AWS credentials for authenticated Claude Platform on AWS sessions.',
)
special(
  '2.1.89-to-2.1.90',
  [14139],
  ['src/commands/powerup/index.ts', 'src/commands.ts'],
  'The shipped /powerup local JSX command descriptor is registered in the built-in command list and lazily loads its runtime implementation.',
)
special(
  '2.1.89-to-2.1.90',
  [15116],
  ['src/commands/advisor.tsx'],
  'The target-era noninteractive Advisor command is fully authored in the historical source owner; later releases replace it with the interactive local-JSX command.',
)
special(
  '2.1.89-to-2.1.90',
  [13073],
  [
    'src/commands/add-dir/index.ts',
    'src/commands/autofix-pr/index.ts',
    'src/commands/backfill-sessions/index.js',
    'src/ink/components/ScrollBox.tsx',
    'src/utils/sideQuestion.ts',
  ],
  'The command initializer keeps the target add-dir, hidden autofix stub, backfill, scroll-box, and side-question module boundary; latest source evolves the autofix owner at the same TypeScript path.',
)
special(
  '2.1.90-to-2.1.91',
  [13127],
  [
    'src/commands/add-dir/index.ts',
    'src/commands/autofix-pr/index.ts',
    'src/commands/backfill-sessions/index.js',
    'src/ink/components/ScrollBox.tsx',
    'src/utils/sideQuestion.ts',
  ],
  'The inherited command initializer retains its exact module boundary while the current autofix implementation evolves behind the same TypeScript owner.',
)
special(
  '2.1.91-to-2.1.92',
  [13254],
  [
    'src/commands/add-dir/index.ts',
    'src/commands/autofix-pr/index.ts',
    'src/commands/backfill-sessions/index.js',
    'src/ink/components/ScrollBox.tsx',
    'src/utils/sideQuestion.ts',
  ],
  'The inherited command initializer retains its exact module boundary while the current autofix implementation evolves behind the same TypeScript owner.',
)

special(
  '2.1.89-to-2.1.90',
  [2631],
  ['src/utils/settings/settings.ts'],
  'Policy defaultMode auto is treated as prior consent by the exact reachable auto-mode opt-in branch.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [5022],
  ['src/services/analytics/datadog.ts'],
  'The historical Datadog client token equals the authenticated target value.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [10054],
  ['src/components/messages/RateLimitMessage.tsx'],
  'The historical rate-limit upsell treats the exact slate-harbor experiment as max-20x behavior.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12030],
  ['src/utils/toolErrors.ts'],
  'PostToolUse file modification reconciliation emits the exact target warning and refreshes read state.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12041],
  ['src/services/tools/toolExecution.ts'],
  'Deferred tools invoked outside REPLTool return the exact target recovery guidance and code example.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12085],
  ['src/services/extractMemories/prompts.ts'],
  'Memory extraction uses the exact target no-op sentinel and system-prompt format instruction.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12100],
  ['src/services/extractMemories/extractMemories.ts'],
  'Memory extraction skips sessions with no new user prose and records the exact target telemetry event.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12159],
  ['src/utils/forkedAgent.ts'],
  'Forked-agent default turn exhaustion records the exact target telemetry event.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12378],
  ['src/memdir/findRelevantMemories.ts'],
  'The memory selector has the exact authenticated target prompt and first-result relevance wrapper.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12417],
  ['src/utils/attachments.ts'],
  'Memory attachments use the exact target path header.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12452],
  ['src/utils/attachments.ts', 'src/query.ts'],
  'Relevant-memory prefetch is skipped for the extract_memories and auto_dream query sources and receives the live querySource from the query loop.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12455],
  ['src/utils/plugins/loadPluginCommands.ts'],
  'Plugin command normalization strips either leading path separator exactly as shipped.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [12746],
  ['src/utils/messages.ts'],
  'Only the first non-synthesis selected-memory attachment receives the target relevance warning.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [13639],
  ['src/components/HelpV2/General.tsx'],
  'The HelpV2 entry advertises the shipped powerup lesson flow with the exact target copy.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [14395],
  ['src/components/LogSelector.tsx'],
  'Log selector text search activates under the exact target length and alphanumeric-shape predicate.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [14494],
  ['src/utils/ultraplan/ccrSession.ts'],
  'Ultraplan polling uses the target retry/terminal error paths and lost-connection message.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [14503, 14519],
  ['src/commands/ultraplan.tsx', 'src/utils/ultraplan/ccrSession.ts'],
  'The target90 Ultraplan command owns the exact timeout, prompt variants, identifier, remote-session flow, display, and error handling.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [15223],
  ['src/commands/upgrade/upgrade.tsx'],
  'The slate-harbor branch returns the exact target upgrade-unavailable guidance.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [15230],
  ['src/commands/rate-limit-options/rate-limit-options.tsx'],
  'Rate-limit choices suppress the upgrade action under the exact target experiment and availability gates.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [15432],
  ['src/commands/remote-setup/index.ts'],
  'Remote setup requires both remote-session and quick-web-setup policy permission.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [15480],
  ['src/commands/buddy/index.tsx'],
  'Buddy preserves the target argument contract, dynamic visibility, unavailable path, and command control flow.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [
    10499, 15536, 15572, 15615, 15616, 15623, 15627, 15633, 15658,
    17664,
  ],
  [
    'src/types/logs.ts',
    'src/utils/sessionStorage.ts',
    'src/screens/REPL.tsx',
    'src/utils/conversationRecovery.ts',
    'src/utils/sessionRestore.ts',
    'src/main.tsx',
  ],
  'Permission mode is persisted in transcript metadata, loaded through all log APIs, restored on resume unless the CLI overrides it, excludes unsafe/default modes, and reactivates auto only behind its live gate.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [16158],
  ['src/upstreamproxy/upstreamproxy.ts'],
  'The upstream proxy forwards the target AWS and GitHub credential environment variables.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [15631],
  ['src/utils/sessionStoragePortable.ts', 'src/utils/sessionStorage.ts'],
  'The chunked transcript loader skips attribution snapshots, recognizes compact boundaries, and preserves the exact target byte limits and boundary behavior.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [16633],
  ['src/components/permissions/PermissionRequest.tsx'],
  'Invalid permission inputs log and reject once, never arm the interrupt handler, and render no dialog.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [17909, 17910],
  ['src/skills/bundled/scheduleRemoteAgents.ts'],
  'The schedule-remote-agents skill owner carries the exact target remote-session and quick-web-setup policy guards.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [17275],
  ['src/utils/skills/skillChangeDetector.ts'],
  'Skill watcher filtering splits paths on both POSIX and Windows separators before excluding .git directories.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [17664],
  [
    'src/components/ResumeReturnDialog.tsx',
    'src/screens/REPL.tsx',
    'src/utils/config.ts',
  ],
  'The target90 resume-return prompt preserves its feature/age/token/dismissal gates, telemetry and persistence, compact action, model override, submit dismissal, and dialog priority.',
  ['resume-return-target-fragment', 'resume-return-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [4855, 8787, 8788, 8898, 14110, 14111, 14112, 14116, 15318, 15323, 16316, 16656, 16916, 16919, 17318, 17800, 18263],
  [
    'src/services/analytics/metadata.ts',
    'src/utils/permissions/yoloClassifier.ts',
    'src/components/messageRating.tsx',
    'src/commands/powerup/powerup.tsx',
    'src/components/Stats.tsx',
    'src/bridge/remoteBridgeCore.ts',
    'src/components/mcp/ElicitationDialog.tsx',
    'src/components/teams/TeamsDialog.tsx',
    'src/utils/sessionRestore.ts',
    'src/components/ResumeTask.tsx',
    'src/main.tsx',
  ],
  'The hardened target90 property/control cluster owns COO metadata, all classifier request parameters, rating clear state, powerup rendering, focus-local Stats/Teams/Elicitation/Resume input, persistence callbacks, auto-mode restoration, and startup API-key provenance through reachable source controls.',
  ['runtime-target-fragment', 'runtime-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [8787, 8788],
  ['src/utils/permissions/yoloClassifier.ts'],
  'Target90 passes optional extraBodyParams from both reachable auto-mode classifier request producers into the shared side-query API.',
  ['side-query-extra-body-target-fragment', 'side-query-extra-body-semantic-test'],
)
special(
  '2.1.89-to-2.1.90',
  [15997],
  ['src/utils/sideQuery.ts'],
  'Target90 types and destructures optional extraBodyParams in the side-query owner, then preserves provider-specific body parameters through the final top-level request spread.',
  ['side-query-extra-body-target-fragment', 'side-query-extra-body-semantic-test'],
)

special(
  '2.1.90-to-2.1.91',
  [18031],
  ['src/skills/bundled/claudeApi.ts'],
  'The 2.1.91 inline Claude API reading guide adds the exact Agent design routing entry for tool-surface, context-management, and caching guidance; the historical semantic supplement and current cumulative source retain that runtime prompt string.',
  ['claude-api-guide-target-fragment', 'claude-api-guide-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [5336, 5740, 5769, 8948, 10391, 11429, 13164, 13388, 13469, 13470, 16608, 17237, 17283, 18026, 18029, 18250, 18283],
  [
    'src/ink/focus.ts',
    'src/ink/hooks/use-focus.ts',
    'src/ink.ts',
    'src/bridge/trustedDevice.ts',
    'src/tools/AgentTool/runAgent.ts',
    'src/tools/BriefTool/upload.ts',
    'src/commands/feedback/feedback.tsx',
    'src/hooks/useSearchInput.ts',
    'src/utils/processUserInput/processUserInput.ts',
    'src/skills/bundled/claudeApi.ts',
    'src/utils/stats.ts',
    'src/components/permissions/FallbackPermissionRequest.tsx',
    'src/hooks/useBackgroundTaskNavigation.ts',
    'src/cli/handlers/plugins.ts',
    'src/cli/handlers/agents.ts',
  ],
  'The target91 public-owner cluster preserves observable Ink focus, UTC streak arithmetic, classifier-safe permission persistence, modifier-safe teammate navigation, plugin/agent output, an AST-proven dead peer spread, trusted-device gating, subagent REPL hydration, safe Brief filenames, feedback/search/slash control, and the historical extensible Claude API document filter.',
  ['target91-residue-target-fragment', 'target91-residue-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [17939],
  ['src/skills/bundled/verify/SKILL.md'],
  'The authenticated target91 verify skill evolution has a byte-exact cooked Markdown owner loaded by the bundled verify command.',
  ['asset-target-fragment', 'asset-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [8805],
  [
    'src/utils/permissions/yoloClassifier.ts',
    'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt',
  ],
  'The target91 external-permissions classifier template is restored with its exact cooked content and terminal newline after text-loader normalization.',
  ['asset-target-fragment', 'asset-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [17990, 17992, 17996, 18002],
  [
    'src/skills/bundled/claude-api/SKILL.md',
    'src/skills/bundled/claude-api/shared/agent-design.md',
    'src/skills/bundled/claude-api/shared/live-sources.md',
    'src/skills/bundled/claude-api/shared/tool-use-concepts.md',
    'src/skills/bundled/claudeApiContent.ts',
  ],
  'The target91 Claude API skill prompt and reference evolution is byte-exact in the cooked Markdown owners and reachable through claudeApiContent.',
  ['asset-target-fragment', 'asset-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [6921, 6922, 6924, 6925, 9873, 12213, 12238, 12239, 12430, 12431, 12432, 12468, 12472, 13213, 17373, 17715, 18158],
  [
    'src/memdir/findRelevantMemories.ts',
    'src/utils/attachments.ts',
    'src/Tool.ts',
    'src/utils/forkedAgent.ts',
    'src/utils/swarm/inProcessRunner.ts',
    'src/services/compact/compact.ts',
    'src/commands/clear/conversation.ts',
    'src/components/ultraplan/UltraplanChoiceDialog.tsx',
    'src/screens/REPL.tsx',
    'src/QueryEngine.ts',
    'src/query.ts',
  ],
  'The target91 persistent memory selector owns its per-directory manifest cache, query/assistant conversation history, no-repeat filtering, cache-usage telemetry, context provisioning, and compact/clear lifecycle reset.',
  ['memory-selector-target-fragment', 'memory-selector-semantic-test'],
)

special(
  '2.1.90-to-2.1.91',
  [5058, 5060, 5063, 5064, 5067, 7802, 11095, 11227, 11244, 11246, 12248, 12404, 15961],
  [
    'src/constants/prompts.ts',
    'src/services/compact/compact.ts',
    'src/tools/FileEditTool/FileEditTool.ts',
    'src/tools/FileEditTool/prompt.ts',
    'src/tools/FileReadTool/FileReadTool.ts',
    'src/tools/FileReadTool/prompt.ts',
    'src/tools/FileWriteTool/FileWriteTool.ts',
    'src/tools/FileWriteTool/prompt.ts',
    'src/utils/queryHelpers.ts',
  ],
  'The complete target91 file-prompt call graph owns relative-path and subagent guidance, no-reread stub/result propagation, transcript/compact recognition, gated append behavior, and edit-after-write suffixes.',
  ['file-prompts-target-fragment', 'file-prompts-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [9648, 10295, 16342, 16343, 16349, 16353, 16378],
  [
    'src/bridge/bridgeStatusUtil.ts',
    'src/bridge/codeSessionApi.ts',
    'src/bridge/remoteBridgeCore.ts',
    'src/bridge/trustedDevice.ts',
    'src/components/messages/SystemTextMessage.tsx',
    'src/hooks/useReplBridge.tsx',
  ],
  'The target91 bridge owners preserve the environment-aware connect URL, one-line linked status UI, exact gated 403 terminal classifier, and initial, proactive, and recovery untrusted-device paths.',
  ['bridge-status-target-fragment', 'bridge-status-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [5219, 5229, 5484, 6288, 6788, 6789, 6790, 6791, 7691, 7705, 10101, 13500, 15347, 15371, 17585],
  [
    'src/ink/termio/dec.ts',
    'src/ink/parse-keypress.ts',
    'src/ink/components/App.tsx',
    'src/ink/ink.tsx',
    'src/context.ts',
    'src/utils/effort.ts',
    'src/services/rateLimitMessages.ts',
    'src/services/claudeAiLimits.ts',
    'src/components/messages/RateLimitMessage.tsx',
    'src/commands/rate-limit-options/rate-limit-options.tsx',
    'src/hooks/notifs/useRateLimitWarningNotification.tsx',
    'src/components/Settings/Settings.tsx',
    'src/commands/stats/stats.tsx',
  ],
  'The target91 terminal protocol, date-context privacy gate, effort/rate-limit surfaces, settings display, and Stats integration retain the authenticated branch and observable-string semantics.',
  ['terminal-context-target-fragment', 'terminal-context-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [5522, 5523, 5524, 5560],
  ['src/ink/theme-notify.ts', 'src/ink/components/App.tsx'],
  'The target91 theme-notification registry owns subscribe, notify, and cleanup semantics; App dispatches parsed themeNotify responses and enables or disables terminal notifications with raw-mode lifecycle.',
  ['theme-notify-target-fragment', 'theme-notify-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [14597, 14603, 14609, 14623, 14627, 14629, 14631, 14676, 17373, 17375, 17376, 17381, 17382, 17386],
  [
    'src/commands/ultraplan.tsx',
    'src/utils/ultraplan/ccrSession.ts',
    'src/components/tasks/RemoteSessionDetailDialog.tsx',
    'src/components/ultraplan/UltraplanChoiceDialog.tsx',
    'src/components/ultraplan/UltraplanLaunchDialog.tsx',
    'src/screens/REPL.tsx',
  ],
  'The target91 Ultraplan transition owns its enable/config gate, phase-aware polling and cleanup, choice and launch dialogs, task-detail actions, failure metadata, timeout copy, and REPL prompt wiring.',
  ['ultraplan-target-fragment', 'ultraplan-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [2571],
  ['src/utils/settings/types.ts'],
  'The disableSkillShellExecution setting owns the exact target description as a compile-time string assembly and controls inline shell execution for user, project, and plugin commands.',
  ['target91-residue-target-fragment', 'target91-residue-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [7678],
  [
    'src/constants/toolLimits.ts',
    'src/services/mcp/client.ts',
    'src/utils/toolResultStorage.ts',
  ],
  'The target91 MCP result-size ceiling is 500,000 characters and is carried through the requested-size cap and persistence-threshold call path.',
  ['target91-residue-target-fragment', 'target91-residue-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [9785],
  ['src/entrypoints/sdk/coreSchemas.ts'],
  'SDK result schemas own the complete terminal-reason vocabulary and exact description, deferred-tool payload, and optional terminal_reason fields for success and error results.',
  ['target91-residue-target-fragment', 'target91-residue-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [12505],
  ['src/utils/attachments.ts'],
  'Memory selection is suppressed for the exact target set of internal query sources: extract_memories, auto_dream, prompt_suggestion, speculation, and compact.',
  ['target91-residue-target-fragment', 'target91-residue-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [14498],
  ['src/components/LogSelector.tsx'],
  'The LogSelector divider receives the current terminal width; React compiler cache-slot numbers are generated implementation metadata rather than authored behavior.',
  ['target91-residue-target-fragment', 'target91-residue-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [16707],
  ['src/buddy/CompanionSprite.tsx'],
  'The React compiler early-return sentinel implements the authored BUDDY, muted-companion, and narrow-terminal direct-return branches without adding an independent runtime behavior.',
  ['target91-residue-target-fragment', 'target91-residue-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [18189, 18190],
  ['src/cli/print.ts'],
  'The target91 stream-json print path emits the exact structured sandbox-unavailable terminal result before stderr and synchronous shutdown; the adjacent peer-origin spread is proven unreachable from its always-undefined local.',
  ['print-sandbox-target-fragment', 'print-sandbox-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [7253],
  ['src/services/api/dumpPrompts.ts'],
  'Prompt dumping preserves the target output path, metadata, and API payload serialization behavior.',
  ['api-runtime-target-fragment', 'api-runtime-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [8970],
  ['src/services/api/grove.ts'],
  'The Grove request owner preserves the target API request and failure behavior.',
  ['api-runtime-target-fragment', 'api-runtime-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [11434, 11603, 12001, 12104, 12832, 15211, 15214, 15255, 15971, 18093, 18095],
  [
    'src/tools/BriefTool/upload.ts',
    'src/utils/model/modelOptions.ts',
    'src/tools/BashTool/prompt.ts',
    'src/services/tools/toolExecution.ts',
    'src/utils/messages.ts',
    'src/utils/claudeInChrome/setup.ts',
    'src/components/WorktreeExitDialog.tsx',
    'src/utils/api.ts',
    'src/utils/deepLink/terminalLauncher.ts',
  ],
  'The target91 API/runtime cluster restores Brief upload, model and Bash prompt choices, exact deferred-tool retry text, peer-message handling, Chrome failure paths, worktree exit behavior, API helpers, and terminal launch behavior.',
  ['api-runtime-target-fragment', 'api-runtime-semantic-test'],
)
special(
  '2.1.90-to-2.1.91',
  [12184],
  ['src/query.ts'],
  'The second target91 occurrence retains the rapid-refill and deferred-tool stop behavior introduced and authenticated in the target89 semantic lineage; it is transitive rather than a target91 source introduction.',
  ['api-runtime-target-fragment', 'api-runtime-semantic-test'],
)

special(
  '2.1.90-to-2.1.91',
  [15241, 15242, 15250],
  ['src/commands/advisor.tsx'],
  'The target-era noninteractive Advisor command keeps its descriptor, argument validation, model setting mutation, and exact user-visible responses; latest source evolves the same owner to the interactive local-JSX form.',
)
special(
  '2.1.91-to-2.1.92',
  [14382, 14383, 14384, 14385, 14386, 14387, 14388, 14389],
  ['src/commands/release-notes/release-notes.tsx'],
  'The interactive /release-notes source owner formats and sorts releases, loads the changelog with a timeout/fallback, renders the version picker and show-all option, and preserves the shipped empty/error paths; the source map retains the pre-JSX .ts spelling.',
)
special(
  '2.1.91-to-2.1.92',
  [12108, 12110, 12111],
  ['src/tools/BashTool/rerunAliases.ts'],
  'Bash rerun aliases use the exact experiment gate, monotonically assigned bN map, unknown-alias error, and result footer.',
)
special(
  '2.1.91-to-2.1.92',
  [12119],
  ['src/tools/BashTool/prompt.ts'],
  'The Bash prompt conditionally emits the exact target rerun instruction.',
)
special(
  '2.1.91-to-2.1.92',
  [12131],
  ['src/tools/BashTool/BashTool.tsx'],
  'The Bash schema exposes rerun only behind the target gate and omits it with the target background-task combinations.',
)
special(
  '2.1.91-to-2.1.92',
  [12228],
  ['src/services/tools/toolExecution.ts'],
  'Tool execution resolves rerun before validation, rejects command conflicts and unknown aliases, records telemetry, assigns successful command aliases, and appends exact footers.',
)
special(
  '2.1.91-to-2.1.92',
  [12337, 18279],
  ['src/Tool.ts', 'src/services/tools/toolExecution.ts'],
  'Query contexts and SDK sessions each receive an isolated Bash rerun alias map carried through the tool execution context.',
)
special(
  '2.1.91-to-2.1.92',
  [15389, 15390, 15391, 15392, 15393, 15394, 15395, 15396, 15397, 15398, 15400],
  ['src/commands/advisor.tsx'],
  'The interactive Advisor command preserves exact telemetry, model choices, settings/AppState mutations, validation, target dialog text, warning, cancel behavior, and availability descriptor.',
)

special(
  '2.1.91-to-2.1.92',
  [10855, 10862, 10929, 12203, 12204, 12205, 12206, 12208],
  [
    'src/utils/bash/ShellSnapshot.ts',
    'src/tools/BashTool/UI.tsx',
    'src/utils/toolErrors.ts',
    'src/services/tools/toolExecution.ts',
    'src/Tool.ts',
    'src/utils/forkedAgent.ts',
    'src/screens/REPL.tsx',
    'src/commands/clear/conversation.ts',
  ],
  'Shell snapshots preserve the target variable/function/alias state, while tool-result de-duplication uses the target threshold, execution-path propagation, query-local state, and clear/reset lifecycle.',
  ['shell-result-dedup-target-fragment', 'shell-result-dedup-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [12366, 12407, 12415, 13414, 13420],
  [
    'src/services/compact/autoCompact.ts',
    'src/services/compact/compact.ts',
    'src/commands/autocompact/autocompact.tsx',
    'src/commands/autocompact/autocompact-noninteractive.ts',
    'src/commands/autocompact/index.ts',
    'src/commands.ts',
  ],
  'Autocompact owns exact window precedence, experiment hint, threshold propagation, streaming failure, interactive/noninteractive settings command behavior, and built-in registration.',
  ['autocompact-target-fragment', 'autocompact-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [6773, 6774],
  ['src/services/compact/microCompact.ts'],
  'Microcompaction drops stale time tool results using the target result type, message scan, and keep-recent semantics.',
  ['time-microcompact-target-fragment', 'time-microcompact-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [8341, 8347, 8392],
  ['src/services/mcp/auth.ts', 'src/utils/mcpOutputStorage.ts'],
  'MCP OAuth completion and oversized-output storage retain the exact target redirect/auth result and composed output instructions.',
  ['oauth-mcp-output-target-fragment', 'oauth-mcp-output-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [7707, 8017, 8022],
  [
    'src/services/PromptSuggestion/promptSuggestion.ts',
    'src/keybindings/schema.ts',
    'src/keybindings/validate.ts',
  ],
  'Prompt suggestions and keybinding schema/validation own the target suggestion trigger and exact shortcut binding semantics.',
  ['keybindings-suggestion-target-fragment', 'keybindings-suggestion-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [8067, 8068, 8069, 8070, 8071, 8072, 8073, 8074, 8075, 8076, 8077, 8078, 8079, 8081, 8082],
  ['src/components/design-system/KeyboardShortcutHint.tsx'],
  'The target shortcut formatter parses chords, applies platform/key-case/style formatting, handles empty chords, and renders action text with optional parentheses and bolding.',
  ['keyboard-shortcut-target-fragment', 'keyboard-shortcut-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [16151],
  ['src/services/api/claude.ts'],
  'SIMULATE_PROXY_USAGE removes proxy-sensitive beta and extra-body request fields while preserving the exact target diagnostic and last-request state.',
  ['simulate-proxy-target-fragment', 'simulate-proxy-semantic-test'],
)

special(
  '2.1.91-to-2.1.92',
  [
    9679, 9681, 9683, 9684, 9686, 9687, 9689, 9693, 9694, 9695, 9696,
    9698, 10082, 10083, 10084, 10085, 10086, 10087, 10088, 10089,
    10090, 10091, 10092, 10093, 10094, 10095, 10096, 10098, 10105,
    10107, 10108, 10110, 10111, 10112, 10113, 10115, 10116, 10118,
    10119, 10121, 10122, 10124, 10125, 10127,
  ],
  ['src/components/BedrockSetupWizard.tsx'],
  'The Bedrock setup wizard preserves authentication choices, credential resolution, verification/error mapping, paginated inference profiles, per-tier model probes, settings persistence, completion UI, and telemetry.',
)
special(
  '2.1.91-to-2.1.92',
  [10130, 10131],
  ['src/components/ConsoleOAuthFlow.tsx', 'src/components/BedrockSetupWizard.tsx'],
  'Console OAuth flow has a reachable Bedrock wizard state transition, completion state, and render branch.',
)
special(
  '2.1.91-to-2.1.92',
  [14649, 14653, 14654, 14656, 14658, 14660],
  [
    'src/commands/provider-setup/index.ts',
    'src/commands/provider-setup/bedrock.tsx',
    'src/commands.ts',
  ],
  'The hidden /setup-bedrock command is registered only for Bedrock sessions, emits start/cancel telemetry, launches the wizard, and forwards its completion message.',
)

special(
  '2.1.91-to-2.1.92',
  [2576],
  ['src/utils/settings/types.ts'],
  'The target92 settings schema owns the exact background-operation and persisted voice-mode descriptions and fields.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [2038],
  ['src/utils/privacyLevel.ts'],
  'The privacy-level owner maps disabled nonessential traffic to essential-traffic and both DISABLE_TELEMETRY and DO_NOT_TRACK to no-telemetry exactly as target92 executes.',
  ['do-not-track-target-fragment', 'do-not-track-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [3235],
  ['src/utils/model/model.ts', 'src/utils/model/configs.ts'],
  'The target92 model aliases resolve the Opus 4.6, Sonnet 4.5, and Haiku 4.5 model configuration keys through the authored model lookup owner.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [4504],
  ['src/services/api/client.ts'],
  'The target92 client unit retains the reachable API-provider construction while its Anthropic AWS SigV4 branch is inherited from the authenticated target90 lineage and the cli-bg condition is compiled false in this external build.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test', 'anthropic-aws-target-fragment', 'anthropic-aws-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [5060],
  ['src/tools/FileWriteTool/prompt.ts'],
  'The FileWrite prompt owns the exact target guidance to prefer Edit for modifications and shell redirection for append operations.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [5555],
  ['src/ink/components/App.tsx'],
  'The Ink application reports the exact DECSTBM and tmux diagnostic context when terminal scroll-region safety is unavailable.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [6189, 6191, 6203, 10910, 10912],
  [
    'src/utils/sandbox/seccomp.ts',
    'src/utils/sandbox/sandbox-adapter.ts',
    'src/utils/Shell.ts',
  ],
  'Linux bundled execution opens /proc/self/exe once, passes the exact seccomp adapter path/argv0 configuration, and places the descriptor in child fd slot 3 only for sandboxed commands.',
  ['embedded-seccomp-target-fragment', 'embedded-seccomp-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [8013],
  ['src/keybindings/parser.ts', 'src/components/design-system/KeyboardShortcutHint.tsx'],
  'Keybinding parsing normalizes control/option/meta/command/super/win modifier spellings to the exact target chord representation shared by shortcut display.',
  ['target92-residue-target-fragment', 'target92-residue-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [8102, 10928],
  [
    'src/components/CtrlOToExpand.tsx',
    'src/tools/BashTool/UI.tsx',
    'src/components/design-system/KeyboardShortcutHint.tsx',
  ],
  'The target shortcut callers compose lower-case chord presentation through the shared formatter while preserving their exact actions and visibility gates.',
  ['target92-residue-target-fragment', 'target92-residue-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [11538],
  ['src/bridge/bridgeConfig.ts'],
  'Remote-control session prefixes are lowercased, non-alphanumerics collapse to hyphens, and leading/trailing hyphens are removed before fallback.',
  ['target92-residue-target-fragment', 'target92-residue-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [12528],
  ['src/tools/FileReadTool/FileReadTool.ts'],
  'FileRead strips persisted text, image, PDF, and notebook payloads without changing metadata, already-empty values, sparse notebooks, or non-payload result variants.',
  ['storage-telemetry-survey-target-fragment', 'storage-telemetry-survey-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [10197, 15482, 15484],
  [
    'src/components/messages/RateLimitMessage.tsx',
    'src/commands/rate-limit-options/rate-limit-options.tsx',
  ],
  'The target92 rate-limit surface uses the amber experiment and exposes the exact Team-plan option, telemetry, browser URL, and fallback copy.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [11168, 13693],
  ['src/cost-tracker.ts', 'src/commands/cost/cost.ts'],
  'The cost tracker groups spend by model family, computes cache-hit percentages, formats the exact breakdown line, and appends it behind the target experiment gate.',
  ['cost-breakdown-target-fragment', 'cost-breakdown-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [12050, 12059, 12060, 12061, 12063, 12064, 12066],
  ['src/services/teamMemorySync/index.ts', 'src/services/teamMemorySync/types.ts'],
  'Team-memory synchronization owns the exact disk-trust, retry, batching, soft-delete, checksum, and telemetry accounting call graph.',
  ['team-memory-soft-delete-target-fragment', 'team-memory-soft-delete-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [13602],
  ['src/components/Stats.tsx'],
  'The target92 Stats surface renders its exact navigation and copy shortcuts.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [14620],
  ['src/components/LogSelector.tsx', 'src/components/design-system/KeyboardShortcutHint.tsx'],
  'The target92 LogSelector retains the terminal-width divider and composes its observable shortcut action text through the shared target shortcut formatter.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test', 'keyboard-shortcut-target-fragment', 'keyboard-shortcut-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [14637],
  ['src/utils/agenticSessionSearch.ts'],
  'Agentic session search owns the exact relevance instructions, tag priority, inclusive fallback rule, and structured example.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [14741, 14756, 14758, 14803],
  [
    'src/commands/ultraplan.tsx',
    'src/utils/ultraplan/ccrSession.ts',
    'src/utils/teleport.tsx',
    'src/components/tasks/RemoteSessionDetailDialog.tsx',
    'src/components/ultraplan/UltraplanLaunchDialog.tsx',
    'src/screens/REPL.tsx',
  ],
  'Target92 Ultraplan selects the exact cooked prompt by identifier, propagates it through detached launch and telemetry, distinguishes create failures, and renders the phase-aware plan detail and launch UI.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [14849, 14853],
  ['src/commands/teleport/index.ts', 'src/commands/teleport/teleport.tsx'],
  'The /teleport command owns the exact resume description and success/cancel outcomes.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [15182, 15203, 15209],
  [
    'src/components/agents/new-agent-creation/wizard-steps/DescriptionStep.tsx',
    'src/components/agents/new-agent-creation/wizard-steps/PromptStep.tsx',
    'src/components/agents/new-agent-creation/wizard-steps/TypeStep.tsx',
    'src/components/design-system/KeyboardShortcutHint.tsx',
  ],
  'The agent-creation wizard owns its description, prompt, and type steps and composes every displayed shortcut/action pair through the shared formatter.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test', 'keyboard-shortcut-target-fragment', 'keyboard-shortcut-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [15679],
  ['src/commands/insights.ts'],
  'The insights report embeds the exact hour-histogram update script and DOM/color behavior shipped in target92.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [15837],
  ['src/memdir/teamMemPrompts.ts'],
  'The team-memory prompt owns the target92 single private MEMORY.md index wording, which indexes both private and team memories and is loaded into conversation context.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [16054, 16055, 16056, 16057, 16058, 16059, 16067, 16068, 16069, 16070, 16072, 16073, 16074, 16266, 16272, 16276],
  ['src/utils/worktree.ts', 'src/bridge/bridgeMain.ts'],
  'Worktree state resolves gitdir/base state, preserves creation bases across resume, reports detailed cleanup reasons, and routes bridge completion, failure, and shutdown through safe cleanup.',
  ['worktree-bridge-target-fragment', 'worktree-bridge-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [16911, 16912],
  ['src/components/PromptInput/Notifications.tsx'],
  'The prompt UI computes and refreshes the exact Pro-only uncached-token warning behind the target gate and thresholds.',
  ['uncached-token-warning-target-fragment', 'uncached-token-warning-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [17550, 17551],
  ['src/components/FeedbackSurvey/useDebouncedDigitInput.ts'],
  'The target92 digit-input hook enforces the exact 600 ms mount/enable guard, 400 ms debounce, NFKC normalization, timer cleanup, once behavior, and last-character trimming before dispatch.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [17202],
  [
    'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
    'src/components/design-system/KeyboardShortcutHint.tsx',
  ],
  'The prompt footer passes the exact native-select action to the shared shortcut formatter, which composes the observable "to native select" text.',
  ['target92-runtime-surface-target-fragment', 'target92-runtime-surface-semantic-test', 'keyboard-shortcut-target-fragment', 'keyboard-shortcut-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [15567, 15573, 17808, 17851],
  [
    'src/commands/voice/voice.ts',
    'src/hooks/useVoice.ts',
    'src/hooks/useVoiceIntegration.tsx',
    'src/screens/REPL.tsx',
  ],
  'Target92 persists the hold-mode voice setting, exposes cancellation through the hook/integration/REPL call path, and records the exact telemetry and enabled message.',
  ['voice-mode-target-fragment', 'voice-mode-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [12108, 12110, 12111, 12119, 12131, 12228, 12337, 18279, 15389, 15390, 15391, 15392, 15393, 15394, 15395, 15396, 15397, 15398, 15400],
  [
    'src/tools/BashTool/rerunAliases.ts',
    'src/tools/BashTool/prompt.ts',
    'src/tools/BashTool/BashTool.tsx',
    'src/services/tools/toolExecution.ts',
    'src/Tool.ts',
    'src/commands/advisor.tsx',
  ],
  'The Advisor dialog and Bash rerun-alias clusters preserve their complete authenticated target92 state, telemetry, validation, execution-context, and observable UI semantics.',
  ['advisor-rerun-target-fragment', 'advisor-rerun-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [9679, 9681, 9683, 9684, 9686, 9687, 9689, 9693, 9694, 9695, 9696, 9698, 10082, 10083, 10084, 10085, 10086, 10087, 10088, 10089, 10090, 10091, 10092, 10093, 10094, 10095, 10096, 10098, 10105, 10107, 10108, 10110, 10111, 10112, 10113, 10115, 10116, 10118, 10119, 10121, 10122, 10124, 10125, 10127, 10130, 10131, 14649, 14653, 14654, 14656, 14658, 14660],
  [
    'src/components/BedrockSetupWizard.tsx',
    'src/components/ConsoleOAuthFlow.tsx',
    'src/commands/provider-setup/index.ts',
    'src/commands/provider-setup/bedrock.tsx',
    'src/commands.ts',
  ],
  'The Bedrock setup wizard and hidden /setup-bedrock command own the complete authenticated target92 authentication, verification, model-probe, persistence, completion, and registration graph.',
  ['bedrock-wizard-target-fragment', 'bedrock-wizard-semantic-test'],
)

special(
  '2.1.92-to-2.1.94',
  [18059, 18064, 18066, 18068, 18070, 18071],
  ['src/utils/model/bedrockModelUpgrade.tsx'],
  'Bedrock model-upgrade discovery probes defaults and pinned tiers, selects region-aware fallbacks, renders the upgrade dialog, and exposes the target helper API.',
  ['bedrock-model-upgrade-target-fragment', 'bedrock-model-upgrade-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [15460],
  ['src/commands/advisor.tsx'],
  'The target Advisor apply component defers completion to a zero-delay timer, reads the latest main-model ref, and clears the timer on unmount.',
)
special(
  '2.1.92-to-2.1.94',
  [15666, 15667, 15668, 15670, 15673, 15674, 15675, 15676, 15677],
  ['src/commands/team-onboarding.ts'],
  'The team-onboarding command owns the exact target prompt templates, MCP/usage discovery, allowed tools, flint gate, telemetry, and ONBOARDING.md workflow.',
  ['team-onboarding-target-fragment', 'team-onboarding-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [18082],
  [
    'src/components/TeamOnboardingDiscoveryStep.tsx',
    'src/interactiveHelpers.tsx',
    'src/main.tsx',
  ],
  'Interactive startup and onboarding render the exact banner/step discovery copy and arm selection for team onboarding.',
  ['team-onboarding-target-fragment', 'team-onboarding-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [18083, 18085],
  ['src/interactiveHelpers.tsx', 'src/utils/model/bedrockModelUpgrade.tsx'],
  'Interactive startup runs Bedrock upgrade discovery, respects declined upgrades, persists accepted pins, and falls back to available default models.',
  ['bedrock-model-upgrade-target-fragment', 'bedrock-model-upgrade-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [16060],
  ['src/utils/hooks.ts'],
  'Hook validation rejects plugin-only variable placeholders without an associated plugin while permitting the skill-root-only branch with exact target diagnostics.',
  ['hook-association-target-fragment', 'hook-association-semantic-test'],
)

special(
  '2.1.92-to-2.1.94',
  [2356],
  ['src/utils/git/gitFilesystem.ts'],
  'Git configuration writes preserve the target pushurl branch and exact spawn protocol.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [3044],
  ['src/utils/model/providers.ts'],
  'The model-provider parser owns the exact target provider-name normalization expression.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [4968, 4976],
  ['src/memdir/paths.ts'],
  'Memory-path helpers own the exact target tiny-memory path and directory constants.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [5023],
  ['src/utils/config.ts'],
  'The target loop-auto configuration field and persistence semantics are present in the historical owner.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [6743, 6744, 6745],
  ['src/memdir/tinyMemoryStamps.ts'],
  'Tiny-memory tool-result stamps are generated, parsed, and removed with the exact target protocol.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [8042, 8055, 17338],
  [
    'src/keybindings/defaultBindings.ts',
    'src/keybindings/schema.ts',
    'src/keybindings/validate.ts',
    'src/components/PromptInput/PromptInput.tsx',
  ],
  'The target chat clear-input binding, schema, validation, and live prompt-input handler form one reachable call graph.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [8783],
  ['src/services/mcp/client.ts'],
  'MCP client cleanup closes the exact target transport/state resources.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [9885],
  ['src/entrypoints/sdk/coreSchemas.ts'],
  'The SDK schemas own the exact adaptive display and structured runtime surface introduced by the target.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [10734],
  ['src/utils/teleport.tsx'],
  'Teleport eligibility preserves the target resume/branch gating behavior.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [10895],
  ['src/utils/bash/ShellSnapshot.ts'],
  'Shell snapshots preserve the target shell-state capture and restoration semantics.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [11916],
  ['src/tools/AgentTool/forkSubagent.ts'],
  'Worker-fork prompt construction preserves the exact target one-directive contract and observable text.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [11973],
  ['src/tools/AgentTool/prompt.ts'],
  'AgentTool exposes the exact target launch/continuation guidance and background-agent control contract.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [12092, 12093, 12112, 12121],
  ['src/services/teamMemorySync/index.ts', 'src/services/teamMemorySync/watcher.ts'],
  'Team-memory sync and watcher owners implement the target 403/413 handling, retry, and disk reconciliation graph.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [12283, 12284, 12285, 12286, 12287, 12288, 12303],
  ['src/memdir/memoryTypes.ts', 'src/memdir/memdir.ts', 'src/memdir/memoryScan.ts'],
  'The target tiny-memory schema, prompts, pruning policy, frontmatter, scan, and age parsing are source-owned.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [12308, 12320, 12321],
  ['src/services/extractMemories/prompts.ts', 'src/services/extractMemories/extractMemories.ts'],
  'Memory extraction owns the exact target prompt variants, safe deletion policy, and tiny/normal mode selection.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [12333, 12338, 12339],
  ['src/services/autoDream/consolidationPrompt.ts', 'src/services/autoDream/autoDream.ts'],
  'Automatic dream/consolidation owns the exact target prompt, trigger, cancellation, and persistence flow.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [12606, 12607, 12643, 12977],
  [
    'src/memdir/findRelevantMemories.ts',
    'src/utils/attachments.ts',
    'src/utils/messages.ts',
  ],
  'Relevant-memory selection, attachment injection, and message synthesis preserve the target state and call path.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [12872],
  ['src/utils/plugins/pluginLoader.ts'],
  'Plugin executable discovery applies the exact target bin-name sanitizer.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [13312, 13318, 13319, 13321, 13323, 13337, 13339, 13340],
  [
    'src/commands/autofix-pr/index.ts',
    'src/commands/autofix-pr/api.ts',
    'src/commands/autofix-pr/autofix-pr.tsx',
    'src/commands/btw/btw.tsx',
    'src/utils/sideQuestion.ts',
  ],
  'Autofix and /btw own the target PR discovery, eligibility, remote-task lifecycle, telemetry, cancellation, and child retry semantics.',
  ['autofix-btw-target-fragment', 'autofix-btw-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [13361, 13365],
  ['src/components/Feedback.tsx', 'src/commands/feedback/feedback.tsx'],
  'Feedback owns the target raw-tail loading and retry-safe command entry behavior.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [14695, 14696, 14697, 14698, 14699, 14700, 14701],
  ['src/utils/agenticSessionSearch.ts'],
  'Agentic session search owns its isolated Grep/Read context, permission jail, query loop, result parser, and exact protocol.',
  ['agentic-session-search-target-fragment', 'agentic-session-search-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [15914],
  ['src/memdir/memoryTypes.ts', 'src/memdir/teamMemPrompts.ts'],
  'Memory instructions preserve the exact target private/team ignore and indexing contract.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [16090],
  ['src/utils/hooks.ts'],
  'Hook execution owns the exact target failure logging branch.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [16406],
  ['src/upstreamproxy/upstreamproxy.ts'],
  'Upstream proxy setup owns the exact ingress-token transport and error handling.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [17638],
  ['src/components/FeedbackSurvey/FeedbackSurveyView.tsx'],
  'The survey view owns the target submission-state initializer and reachable renderer behavior.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [17703, 18418, 18440],
  ['src/entrypoints/sdk/controlSchemas.ts', 'src/cli/print.ts', 'src/cli/structuredIO.ts'],
  'SDK/CLI elicitation carries target permission display metadata through schema, parser, and structured output.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [17934],
  ['src/screens/REPL.tsx'],
  'REPL navigation owns the target stale-context selection guard and exact observable message.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [18084],
  ['src/interactiveHelpers.tsx', 'src/utils/relaunch.ts'],
  'Interactive relaunch owns the target launcher, signal, close, unmount, and error semantics.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [18170],
  [
    'src/skills/bundled/verify.ts',
    'src/skills/bundled/verifyContent.ts',
    'src/skills/bundled/verify/SKILL.md',
  ],
  'The bundled verification asset retains the exact target cooked content and loader route.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [18222],
  ['src/skills/bundled/claudeApi.ts', 'src/skills/bundled/claudeApiContent.ts'],
  'The Claude API skill owner retains the exact target guide routing and cooked assets.',
  ['target94-strict-target-fragment', 'target94-strict-semantic-test'],
)

special(
  '2.1.94-to-2.1.96',
  [10135, 10136],
  ['src/components/BedrockSetupWizard.tsx'],
  'The Bedrock setup wizard passes bearer credentials through the SDK apiKey option while preserving the target verification request and error mapping.',
)
special(
  '2.1.94-to-2.1.96',
  [18067],
  ['src/utils/model/bedrockModelUpgrade.tsx'],
  'The Bedrock model-upgrade probe passes AWS_BEARER_TOKEN_BEDROCK through the SDK apiKey option before issuing its one-token availability request.',
)

special(
  '2.1.91-to-2.1.92',
  [15053, 15054, 15056, 15058, 15059, 15060, 15061, 15063],
  [
    'src/commands/stop-hook/StopHookDialog.tsx',
    'src/commands/stop-hook/stop-hook.tsx',
    'src/commands/stop-hook/index.ts',
    'src/commands.ts',
  ],
  'The hidden Stop-hook command owns its prompt editor, Tab/delete focus state, exact session hook discovery/replacement/removal, telemetry, result messages, lazy module, descriptor, and built-in registration.',
  ['stop-hook-target-fragment', 'stop-hook-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [16460, 17631, 18270, 18311],
  [
    'src/cli/transports/ccrClient.ts',
    'src/cli/structuredIO.ts',
    'src/cli/remoteIO.ts',
    'src/cli/print.ts',
  ],
  'CCR delivery acknowledgements drain through uploader, structured no-op, optional remote delegation, and the guarded bounded print shutdown/idle sequence.',
  ['delivery-acks-target-fragment', 'delivery-acks-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [2619, 4507, 4588, 4955, 4989, 8575, 8580, 10517, 12107, 16047, 16076, 16085, 16439, 17914, 17920, 18034],
  [
    'src/utils/settings/settings.ts',
    'src/services/api/client.ts',
    'src/utils/sleep.ts',
    'src/services/analytics/growthbook.ts',
    'src/utils/config.ts',
    'src/utils/subprocessEnv.ts',
    'src/utils/telemetry/pluginTelemetry.ts',
    'src/services/teamMemorySync/watcher.ts',
    'src/utils/hooks.ts',
    'src/utils/sessionState.ts',
    'src/utils/sessionStorage.ts',
    'src/hooks/useScheduledTasks.ts',
    'src/utils/cronScheduler.ts',
  ],
  'The hardened target94 property/control cluster owns settings, client timeout, feature refresh, sandbox trust, subprocess scrubbing, plugin telemetry, memory unlink recovery, hook/session state, title/team/session discovery, and proactive tick behavior; two exact hook-only fields are proven no-ops.',
  ['property-runtime-target-fragment', 'property-runtime-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [3041, 3043, 3210, 10004, 10135, 11759, 12577, 18063, 18088],
  [
    'src/utils/model/configs.ts',
    'src/utils/model/providers.ts',
    'src/utils/model/modelAllowlist.ts',
    'src/utils/model/modelOptions.ts',
    'src/utils/swarm/spawnUtils.ts',
    'src/components/BedrockSetupWizard.tsx',
    'src/tools/FileReadTool/FileReadTool.ts',
    'src/utils/model/bedrockModelUpgrade.tsx',
    'src/interactiveHelpers.tsx',
  ],
  'The authenticated target94 model/Bedrock cluster owns Mantle routing, pre-alias anthropic model allowlisting, custom-model picker entries, teammate region propagation, inherited wizard credentials, the positive cyber-reminder model set, and reachable Bedrock upgrade discovery and UI outcomes.',
  ['model-bedrock-property-target-fragment', 'model-bedrock-property-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [8594, 8595, 8597, 11530, 12102, 12103, 12304, 13330, 15893, 16489, 17636, 17950, 18035, 18061, 18062, 18065, 18423, 18439, 18538],
  [
    'src/tools/MCPTool/UI.tsx',
    'src/tools/WebFetchTool/WebFetchTool.ts',
    'src/services/teamMemorySync/types.ts',
    'src/services/teamMemorySync/index.ts',
    'src/memdir/memoryScan.ts',
    'src/utils/sideQuestion.ts',
    'src/utils/sessionStorage.ts',
    'src/utils/permissionStatus.ts',
    'src/screens/REPL.tsx',
    'src/components/FeedbackSurvey/FeedbackSurveyView.tsx',
    'src/utils/relaunch.ts',
    'src/components/TeamOnboardingDiscoveryStep.tsx',
    'src/utils/model/bedrockModelUpgrade.tsx',
    'src/utils/thinking.ts',
    'src/cli/print.ts',
    'src/main.tsx',
  ],
  'The final hardened target94 runtime cluster owns compact Slack result rendering, markdown/binary fetch handling, structured team-memory server errors and telemetry, tiny-memory headers, side-question cancellation, skill-list persistence, permission status, interactive survey/onboarding/relaunch flows, Bedrock helper control, thinking display propagation, and plugin telemetry warmup.',
  ['runtime-owner-graph-target-fragment', 'runtime-owner-graph-semantic-test'],
)
special(
  '2.1.92-to-2.1.94',
  [16230],
  ['src/services/api/claude.ts'],
  'Target94 propagates thinking display into both adaptive and enabled API payloads and removes the redacted-thinking beta header whenever display mode is active.',
  ['thinking-display-target-fragment', 'thinking-display-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [3206, 9421, 9975, 11531, 11757, 14848, 15371, 15703, 16040, 17251],
  [
    'src/utils/model/model.ts',
    'src/utils/telemetry/instrumentation.ts',
    'src/utils/swarm/backends/TmuxBackend.ts',
    'src/bridge/bridgeConfig.ts',
    'src/services/voiceStreamSTT.ts',
    'src/commands/teleport/teleport.tsx',
    'src/commands/model/model.tsx',
    'src/utils/sessionStorage.ts',
    'src/utils/worktree.ts',
    'src/components/PromptInput/PromptInput.tsx',
  ],
  'The target92 owner-property cluster preserves exported model/telemetry/bridge/session/worktree APIs, per-instance tmux state, unconditional voice routing, Teleport component/call wiring, historical model-label export, and voice submission reachability.',
  ['owner-properties-target-fragment', 'owner-properties-semantic-test'],
)

// Hardened property/operator audit overrides. Keep these after the broader
// runtime clusters so every row resolves to its exact authored owner.
special(
  '2.1.91-to-2.1.92',
  [11537],
  ['src/bridge/bridgeConfig.ts'],
  'The remote-control prefix reads CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX and sanitizes it through the exported bridge-name helpers.',
  ['owner-properties-target-fragment', 'owner-properties-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [12107, 12109],
  ['src/tools/BashTool/rerunAliases.ts'],
  'The Bash rerun-alias state owns its monotonically increasing nextId field and assigns each bN alias exactly once.',
  ['advisor-rerun-target-fragment', 'advisor-rerun-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [12228],
  ['src/services/tools/toolExecution.ts'],
  'Tool execution measures serialized input bytes before any rerun mutation, resolves and validates rerun aliases, and emits both input and result byte sizes on successful execution.',
  ['advisor-rerun-target-fragment', 'advisor-rerun-semantic-test', 'storage-telemetry-survey-target-fragment', 'storage-telemetry-survey-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [13340],
  ['src/utils/toolErrors.ts', 'src/commands/clear/conversation.ts'],
  'Query-local result de-duplication owns the seen map and counter, and conversation clearing resets the carried resultDedupState.',
  ['shell-result-dedup-target-fragment', 'shell-result-dedup-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [14348],
  ['src/commands/powerup/powerup.tsx'],
  'The Powerup lesson mode catalog carries the exact display symbol for each permission mode.',
  ['powerup-target-fragment', 'powerup-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [17498],
  ['src/components/ultraplan/UltraplanChoiceDialog.tsx'],
  'The Ultraplan approval dialog preserves the here/fresh/cancel control graph and passes resultDedupState only into fresh-session conversation clearing.',
  ['storage-telemetry-survey-target-fragment', 'storage-telemetry-survey-semantic-test', 'ultraplan-target-fragment', 'ultraplan-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [17559],
  ['src/components/FeedbackSurvey/TranscriptSharePrompt.tsx'],
  'Transcript sharing accepts case-insensitive y/n/d input and maps it exactly to yes, no, and dont_ask_again; latest source additionally exposes the same actions through unfocusable clickable buttons.',
  ['storage-telemetry-survey-target-fragment', 'storage-telemetry-survey-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [17851],
  ['src/screens/REPL.tsx', 'src/Tool.ts', 'src/services/tools/toolExecution.ts'],
  'REPL carries the enter action and Bash rerun-alias context; its sole postTurnSummary optional read has no producer in target92 and is proven an always-undefined semantic no-op.',
  ['voice-mode-target-fragment', 'voice-mode-semantic-test', 'storage-telemetry-survey-target-fragment', 'storage-telemetry-survey-semantic-test'],
)
special(
  '2.1.91-to-2.1.92',
  [18279],
  ['src/QueryEngine.ts'],
  'The SDK query engine owns its mutable-message context, retry metadata, error watermark, lastIndexOf diagnostic slice, and isolated tool-use context.',
  ['advisor-rerun-target-fragment', 'advisor-rerun-semantic-test'],
)

const focusedEvidenceSpecs = [
  ['toggle-memory', 'recovery/test/recovery-2.1.90-toggle-memory-semantic.test.mjs', 'the complete target90 session memory toggle state, command, extraction, and filesystem permission graph'],
  ['anthropic-aws', 'recovery/test/recovery-2.1.90-anthropic-aws-semantic.test.mjs', 'the target90 Anthropic AWS provider, credential, settings, status, subprocess, and request call graph inherited by later targets'],
  ['logselector-keydown', 'recovery/test/recovery-2.1.90-logselector-keydown-semantic.test.mjs', 'the target90 LogSelector consumed-key preventDefault control-flow introduction'],
  ['side-query-extra-body', 'recovery/test/recovery-2.1.90-side-query-extra-body-semantic.test.mjs', 'the target90 optional extraBodyParams producer and side-query request propagation graph'],
  ['claude-api-guide', 'recovery/test/recovery-2.1.91-claude-api-routing-semantic.test.mjs', 'the exact 1,543-byte cooked inline reading guide and its source asset'],
  ['file-prompts', 'recovery/test/recovery-2.1.91-file-prompts-semantic.test.mjs', 'the complete target91 FileRead/FileWrite/FileEdit prompt and result call graph'],
  ['bridge-status', 'recovery/test/recovery-2.1.91-bridge-untrusted-status-semantic.test.mjs', 'the target91 bridge status and untrusted-device runtime cluster'],
  ['theme-notify', 'recovery/test/recovery-2.1.91-theme-notify-semantic.test.mjs', 'the target91 theme-notification registry, App response dispatch, and raw-mode terminal enable-disable lifecycle'],
  ['print-sandbox', 'recovery/test/recovery-2.1.91-print-sandbox-stream-error-semantic.test.mjs', 'the target91 structured stream-json sandbox-required terminal result and the adjacent proven-dead peer-origin spread'],
  ['terminal-context', 'recovery/test/recovery-2.1.91-terminal-context-rate-semantic.test.mjs', 'the target91 terminal, context, effort, rate-limit, settings, and Stats cluster'],
  ['ultraplan', 'recovery/test/recovery-2.1.91-ultraplan-semantic.test.mjs', 'the target91 Ultraplan command, dialog, poll, task-detail, and REPL cluster'],
  ['memory-selector', 'recovery/test/recovery-2.1.91-memory-selector-semantic.test.mjs', 'the target91 persistent memory-selector state, conversation, telemetry, provisioning, and reset call graph'],
  ['api-runtime', 'recovery/test/recovery-2.1.91-api-runtime-semantic.test.mjs', 'the target91 API, upload, model, prompt, tool-execution, message, Chrome, worktree, and terminal-launch runtime cluster'],
  ['target91-residue', 'recovery/test/recovery-2.1.91-typed-residue-semantic.test.mjs', 'the target91 settings assembly, tool-result ceiling, SDK terminal-result schema, memory-selector exclusions, LogSelector divider width, and React compiler early-return implementation'],
  ['shell-result-dedup', 'recovery/test/recovery-2.1.92-shell-result-dedup-semantic.test.mjs', 'the target92 shell snapshot and query-local tool-result de-duplication cluster'],
  ['autocompact', 'recovery/test/recovery-2.1.92-autocompact-semantic.test.mjs', 'the target92 autocompact window, threshold, failure, command, and registration cluster'],
  ['time-microcompact', 'recovery/test/recovery-2.1.92-time-microcompact-semantic.test.mjs', 'the target92 time-result microcompaction cluster'],
  ['oauth-mcp-output', 'recovery/test/recovery-2.1.92-oauth-mcp-output-semantic.test.mjs', 'the target92 OAuth completion and MCP output-instruction cluster'],
  ['keybindings-suggestion', 'recovery/test/recovery-2.1.92-keybindings-suggestion-semantic.test.mjs', 'the target92 prompt-suggestion and keybinding validation cluster'],
  ['keyboard-shortcut', 'recovery/test/recovery-2.1.92-keyboard-shortcut-semantic.test.mjs', 'the target92 generic keyboard-shortcut parser/formatter component'],
  ['simulate-proxy', 'recovery/test/recovery-2.1.92-simulate-proxy-semantic.test.mjs', 'the target92 SIMULATE_PROXY_USAGE request-suppression branch'],
  ['advisor-rerun', 'recovery/test/recovery-2.1.92-advisor-rerun-semantic.test.mjs', 'the target92 Advisor dialog and Bash rerun-alias runtime call graphs'],
  ['bedrock-wizard', 'recovery/test/recovery-2.1.92-bedrock-wizard-semantic.test.mjs', 'the target92 Bedrock setup wizard and hidden setup command'],
  ['cost-breakdown', 'recovery/test/recovery-2.1.92-cost-breakdown-semantic.test.mjs', 'the target92 model-family cost aggregation and gated /cost breakdown'],
  ['embedded-seccomp', 'recovery/test/recovery-2.1.92-embedded-seccomp-semantic.test.mjs', 'the target92 embedded seccomp descriptor and sandboxed spawn call graph'],
  ['team-memory-soft-delete', 'recovery/test/recovery-2.1.92-team-memory-soft-delete-semantic.test.mjs', 'the target92 team-memory disk-trust, soft-delete, retry, and telemetry graph'],
  ['uncached-token-warning', 'recovery/test/recovery-2.1.92-uncached-token-warning-semantic.test.mjs', 'the target92 gated uncached-token warning helper and UI effect'],
  ['voice-mode', 'recovery/test/recovery-2.1.92-voice-mode-semantic.test.mjs', 'the target92 persisted voice mode, cancellation, and REPL integration'],
  ['worktree-bridge', 'recovery/test/recovery-2.1.92-worktree-bridge-semantic.test.mjs', 'the target92 worktree state, cleanup, and bridge lifecycle graph'],
  ['target92-runtime-surface', 'recovery/test/recovery-2.1.92-runtime-surface-semantic.test.mjs', 'the target92 settings, models, API client, prompts, terminal, rate, Stats, sessions, Ultraplan, Teleport, agent-wizard, insights, team-memory, footer, and static-exclusion residue'],
  ['target92-residue', 'recovery/test/recovery-2.1.92-typed-residue-semantic.test.mjs', 'the exhaustive target92 owner-scoped typed-literal residue set, including inherited occurrences, focused runtime assemblies, shortcut/key normalization, and React compiler cache metadata'],
  ['do-not-track', 'recovery/test/recovery-2.1.92-do-not-track-semantic.test.mjs', 'the target92 DO_NOT_TRACK privacy-level introduction and priority ordering'],
  ['storage-telemetry-survey', 'recovery/test/recovery-2.1.92-storage-telemetry-survey-semantic.test.mjs', 'the target92 FileRead storage stripping, tool-input telemetry, Ultraplan state propagation, transcript-consent keys, and proven-dead status read'],
  ['owner-properties', 'recovery/test/recovery-2.1.92-owner-properties-semantic.test.mjs', 'the target92 exported owner APIs, per-instance tmux state, unconditional voice routing, Teleport component, and voice-submit callback graph'],
  ['team-onboarding', 'recovery/test/recovery-2.1.94-team-onboarding-semantic.test.mjs', 'the target94 team-onboarding command and startup discovery call graph'],
  ['hook-association', 'recovery/test/recovery-2.1.94-hook-plugin-association-semantic.test.mjs', 'the target94 hook/plugin placeholder association guards'],
  ['bedrock-model-upgrade', 'recovery/test/recovery-2.1.94-bedrock-model-upgrade-semantic.test.mjs', 'the target94 Bedrock model-upgrade discovery and interactive launch graph'],
  ['autofix-btw', 'recovery/test/recovery-2.1.94-autofix-btw-semantic.test.mjs', 'the target94 Autofix PR and /btw child retry graph'],
  ['agentic-session-search', 'recovery/test/recovery-2.1.94-agentic-session-search-semantic.test.mjs', 'the target94 isolated agentic session-search graph'],
  ['target94-strict', 'recovery/test/recovery-2.1.94-strict-runtime-semantic.test.mjs', 'the remaining target94 first-party runtime units recovered from strict typed-literal and control-flow residue'],
  ['stop-hook', 'recovery/test/recovery-2.1.92-stop-hook-semantic.test.mjs', 'the complete target92 Stop-hook dialog, session mutation, telemetry, lazy-load, descriptor, and registration graph'],
  ['delivery-acks', 'recovery/test/recovery-2.1.92-delivery-acks-semantic.test.mjs', 'the target92 CCR delivery-ack uploader, transport delegation, and bounded guarded print drain'],
  ['property-runtime', 'recovery/test/recovery-2.1.94-property-runtime-semantic.test.mjs', 'the complete hardened target94 property/control owner cluster and its two proven no-op fields'],
  ['model-bedrock-property', 'recovery/test/recovery-2.1.94-model-bedrock-property-semantic.test.mjs', 'the target94 Mantle/model allowlist, picker, teammate propagation, inherited Bedrock wizard, cyber-reminder polarity, and upgrade UI property/control cluster'],
  ['runtime-owner-graph', 'recovery/test/recovery-2.1.94-runtime-owner-graph-semantic.test.mjs', 'the final target94 Slack, web-fetch, team-memory errors, memory scan, side-question, persistence, permission, survey, relaunch, onboarding, Bedrock, thinking, and plugin-warmup runtime graph'],
  ['thinking-display', 'recovery/test/recovery-2.1.94-thinking-display-semantic.test.mjs', 'the target94 API thinking-display payload propagation and redacted-thinking beta suppression branch'],
]

const focusedEvidence = focusedEvidenceSpecs.flatMap(([id, evidencePath, subject]) => [
  {
    id: `${id}-target-fragment`,
    kind: 'target-fragment',
    path: evidencePath,
    detail: `Authenticated bundle coordinates, hashes, literals, and control-flow fragments pin ${subject}.`,
  },
  {
    id: `${id}-semantic-test`,
    kind: 'semantic-test',
    path: evidencePath,
    detail: `The per-case historical-source test compares ${subject} with the materialized own-target semantic source tree.`,
  },
])

function normalizeSource(source) {
  if (typeof source !== 'string') return null
  const marker = source.lastIndexOf('/src/')
  if (marker >= 0) return source.slice(marker + 1)
  if (source.startsWith('../src/')) return source.slice(3)
  return source.startsWith('src/') ? source : null
}

function existsAt(commit, filename, cache) {
  const key = `${commit}:${filename}`
  if (!cache.has(key)) {
    cache.set(
      key,
      spawnSync('git', ['cat-file', '-e', key], {
        cwd: root,
        stdio: 'ignore',
      }).status === 0,
    )
  }
  return cache.get(key)
}

function ownerId(filename) {
  return `owner-${filename.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

function dependencyPackage(source) {
  const marker = '/node_modules/'
  const index = source.lastIndexOf(marker)
  if (index < 0) {
    const vendorMarker = '/vendor/'
    const vendorIndex = source.lastIndexOf(vendorMarker)
    if (vendorIndex >= 0) {
      const parts = source.slice(vendorIndex + vendorMarker.length).split('/')
      return `vendor/${parts[0]}`
    }
    return '(unknown dependency)'
  }
  const parts = source.slice(index + marker.length).split('/')
  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

function exactCounts(rows, field, keys) {
  return Object.fromEntries(
    keys.map(key => [key, rows.filter(row => row[field] === key).length]),
  )
}

function pureReleaseMetadata(sourceRow, targetVersion) {
  return (
    sourceRow.metadataEquivalent === true &&
    new RegExp(`VERSION:["']${targetVersion.replaceAll('.', '\\.')}`).test(
      sourceRow.prefix,
    ) &&
    /BUILD_TIME:/.test(sourceRow.prefix)
  )
}

const existence = new Map()
function bundlePath(version) {
  return version === '2.1.88'
    ? path.join(artifactRoot, version, 'cli.js')
    : path.join(artifactRoot, version, 'package', 'cli.js')
}

function generateStrictReport(caseRoot, baselineVersion, targetVersion, sourceRoot) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'recovery/scripts/inspect-semantic-literal-gaps.mjs'),
      '--baseline',
      bundlePath(baselineVersion),
      '--target',
      bundlePath(targetVersion),
      '--source-root',
      path.join(sourceRoot, 'src'),
      '--structural',
      path.join(root, caseRoot, 'structural/generated-delta.json.gz'),
      '--partitions',
      path.join(root, caseRoot, 'attribution/target-partitions.jsonl.gz'),
      '--sources',
      path.join(root, caseRoot, 'attribution/sources.jsonl.gz'),
      '--coverage',
      path.join(root, caseRoot, 'semantic/source-coverage.json.gz'),
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout)
  }
  return JSON.parse(result.stdout)
}

for (const [caseName, baselineVersion, targetVersion, targetCommit, historicalRoot] of cases) {
  if (requestedCase && caseName !== requestedCase) continue
  const caseRoot = path.join('recovery', 'cases', caseName)
  const input = JSON.parse(
    fs.readFileSync(path.join(inputRoot, `${caseName}.json`), 'utf8'),
  )
  const ownerPaths = new Set()
  const rows = []
  const dependencyRows = []
  const gaps = []
  const strictReport = generateStrictReport(
    caseRoot,
    baselineVersion,
    targetVersion,
    historicalRoot,
  )
  const strictRowsByIndex = new Map()
  for (const row of strictReport.rows) {
    const values = strictRowsByIndex.get(row.structural?.index) ?? []
    values.push(row)
    strictRowsByIndex.set(row.structural?.index, values)
  }
  const absentSourceIndexes = new Set(
    strictReport.rows.map(row => row.structural?.index).filter(Number.isInteger),
  )
  const residueIndexes = new Set(
    (strictReport.sourceRuntimeOwnerResidueRows ?? []).map(
      row => row.structural.index,
    ),
  )

  for (const sourceRow of input.rows) {
    const base = {
      targetIndex: sourceRow.targetIndex,
      start: sourceRow.start,
      end: sourceRow.end,
      nodeType: sourceRow.nodeType,
      sourceHash: sourceRow.sourceHash,
      structuralClass: sourceRow.structuralClass,
    }
    if (sourceRow.structuralClass === 'moved') {
      rows.push({
        ...base,
        disposition: 'alpha-equivalent',
        ownerIds: [],
        evidenceIds: ['structural-pairing'],
      })
      continue
    }

    const attributed =
      sourceRow.owners.length > 0
        ? sourceRow.owners
        : sourceRow.candidateOwners
    const topAttribution = attributed[0]?.source
    const override = specialOwners.get(`${caseName}:${sourceRow.targetIndex}`)
    const buildPathDependency = dependencyBuildPathIndexes
      .get(caseName)
      ?.has(sourceRow.targetIndex)
    if (!override && buildPathDependency) {
      rows.push({
        ...base,
        disposition: 'generated-metadata',
        ownerIds: [],
        evidenceIds: ['generated-build-metadata'],
        category: 'absolute-external-build-root',
        reason:
          'The complete dependency initializer is metadata-equivalent to baseline; its only target-added value is the external builder absolute node_modules root embedded as __dirname.',
      })
      continue
    }
    if (
      !override &&
      (topAttribution?.includes('/node_modules/') ||
        topAttribution?.includes('/vendor/'))
    ) {
      const identifierOrMetadataEquivalent =
        sourceRow.alphaByCoarse === true ||
        sourceRow.metadataEquivalent === true
      const classification = identifierOrMetadataEquivalent
        ? 'identifier-or-metadata-equivalent-unpinned'
        : 'material-or-unresolved-delta-unpinned'
      rows.push({
        ...base,
        disposition: 'dependency-runtime',
        ownerIds: [],
        evidenceIds: [
          'dependency-attribution',
          'dependency-build-input-audit',
        ],
        category: identifierOrMetadataEquivalent
          ? 'third-party-identifier-or-metadata-equivalent-unpinned'
          : 'third-party-material-or-unresolved-delta-unpinned',
        reason: identifierOrMetadataEquivalent
          ? `Highest-weight target attribution is ${topAttribution}; identifier-insensitive or release-metadata normalization is equivalent, but the target dependency/vendor source and build input are not pinned.`
          : `Highest-weight target attribution is ${topAttribution}; this is a material or unresolved dependency/vendor delta and the target source/build input is not pinned.`,
      })
      dependencyRows.push({
        ...base,
        attribution: topAttribution,
        package: dependencyPackage(topAttribution),
        classification,
      })
      continue
    }

    if (
      !override &&
      (pureReleaseMetadata(sourceRow, targetVersion) ||
        generatedMetadataIndexes.get(caseName)?.has(sourceRow.targetIndex))
    ) {
      rows.push({
        ...base,
        disposition: 'generated-metadata',
        ownerIds: [],
        evidenceIds: ['generated-build-metadata'],
        category: 'release-build-metadata',
        reason: `Identifier-insensitive target AST differs only in generated VERSION ${targetVersion} and BUILD_TIME release macros.`,
      })
      continue
    }

    if (
      !override &&
      dceNonruntimeIndexes.get(caseName)?.has(sourceRow.targetIndex)
    ) {
      rows.push({
        ...base,
        disposition: 'dce-nonruntime',
        ownerIds: [],
        evidenceIds:
          sourceRow.targetIndex === 18029
            ? ['claude-api-overlay-static-dce']
            : caseName === '2.1.91-to-2.1.92'
              ? ['target92-static-dce']
              : caseName === '2.1.92-to-2.1.94'
                ? ['target94-static-dce']
            : ['static-dce-target-fragment'],
        category: 'external-build-static-null-or-null-return',
        reason:
          sourceRow.targetIndex === 15924
            ? 'The target background-job directory provider returns null unconditionally; its only system-section consumer therefore contributes no runtime content.'
            : sourceRow.targetIndex === 18029
              ? 'The optional Claude API skill overlay parameter is passed as the literal null at the only shipped command call; its FILES/SECTION/SHARED_PREFIX branches are statically unreachable and the marker replacement is the empty-string no-op before comment stripping.'
              : caseName === '2.1.91-to-2.1.92' && sourceRow.targetIndex === 11828
                ? 'The target Cron command/tool cluster is dominated by the compile-time null QDK initializer, so no command descriptor or runtime tool consumer is reachable in the shipped external build.'
                : caseName === '2.1.91-to-2.1.92' && sourceRow.targetIndex === 14393
                  ? 'The target remote-session response schema is assigned inside an imported initializer, but the schema binding itself has no consumer; constructing it has no external effect and exact symbol occurrence accounting proves the definition is runtime-dead.'
                : caseName === '2.1.91-to-2.1.92' && [15053, 15060, 15063].includes(sourceRow.targetIndex)
                  ? 'The target Stop-hook dialog and command are present as code, but the only command descriptor has isEnabled:()=>false, so the complete cluster is statically disabled in the shipped runtime.'
                : caseName === '2.1.91-to-2.1.92' && sourceRow.targetIndex === 17572
                    ? 'The --resume= argv probe is a pure initializer whose bound value has no consumer in target92; exact identifier occurrence accounting proves it cannot affect runtime behavior.'
                : caseName === '2.1.92-to-2.1.94' && sourceRow.targetIndex === 16488
                  ? 'The target permission-action provider defines and emits the action value, but the shipped external bundle contains no subscriber/consumer; exact identifier occurrence accounting proves the value cannot affect runtime behavior.'
                : caseName === '2.1.92-to-2.1.94' && sourceRow.targetIndex === 17655
                  ? 'The target install/away-summary classifier constant tables are initialized but never read by the shipped external bundle; exact identifier occurrence accounting proves the definitions are runtime-dead.'
              : 'The target team-onboarding banner provider is assigned null in this release, so its banner branch is statically unreachable until the later 2.1.94 introduction.',
      })
      continue
    }

    if (!override && absentSourceIndexes.has(sourceRow.targetIndex)) {
      const missingValues = strictRowsByIndex
        .get(sourceRow.targetIndex)
        ?.map(row =>
          row.literalKind === 'regexp'
            ? `/${row.value.pattern}/${row.value.flags}`
            : JSON.stringify(row.value),
        )
      gaps.push({
        targetIndex: sourceRow.targetIndex,
        start: sourceRow.start,
        nodeType: sourceRow.nodeType,
        attributed: attributed.slice(0, 8),
        missingValues,
        prefix: sourceRow.prefix.slice(0, 350),
      })
      rows.push({
        ...base,
        disposition: 'source-runtime-gap',
        ownerIds: [],
        evidenceIds: ['target-fragment'],
        category: 'target-literal-absent-from-own-source',
        reason:
          'The strict cooked literal/number/regexp audit found target runtime values absent from the historical source tree; no exact assembly/static proof is recorded yet.',
      })
      continue
    }

    let chosenPaths = (override?.paths ?? []).filter(candidate =>
      fs.existsSync(path.join(historicalRoot, candidate)),
    )
    let evidenceIds =
      override?.evidenceIds ?? ['target-fragment', 'semantic-test']
    if (chosenPaths.length === 0) {
      for (const item of attributed) {
        const candidate = normalizeSource(item.source)
        if (
          candidate &&
          existsAt(targetCommit, candidate, existence) &&
          fs.existsSync(path.join(historicalRoot, candidate))
        ) {
          if (!chosenPaths.includes(candidate)) chosenPaths.push(candidate)
          evidenceIds = ['source-map-attribution', 'semantic-test']
        }
      }
    }
    if (chosenPaths.length === 0) {
      gaps.push({
        targetIndex: sourceRow.targetIndex,
        start: sourceRow.start,
        nodeType: sourceRow.nodeType,
        attributed: attributed.slice(0, 8),
        prefix: sourceRow.prefix.slice(0, 350),
      })
      rows.push({
        ...base,
        disposition: 'source-runtime-gap',
        ownerIds: [],
        evidenceIds: ['target-fragment'],
        category: 'unowned-first-party-runtime',
        reason:
          'No target-commit source-map owner or explicit target-fragment owner was found.',
      })
      continue
    }
    if (residueIndexes.has(sourceRow.targetIndex)) {
      const residueEvidence =
        caseName === '2.1.91-to-2.1.92'
          ? ['target92-residue-target-fragment', 'target92-residue-semantic-test']
          : ['early-residue-target-fragment', 'early-residue-semantic-test']
      evidenceIds = [
        ...new Set([
          ...evidenceIds,
          ...residueEvidence,
        ]),
      ]
    }
    for (const chosen of chosenPaths) ownerPaths.add(chosen)
    rows.push({
      ...base,
      disposition: 'source-runtime-covered',
      ownerIds: chosenPaths.map(ownerId),
      evidenceIds,
      behavior:
        override?.behavior ??
        `Compiled target runtime is source-map attributed to ${chosenPaths[0]}; that authored owner and call path are present in the target release source tree and current src/.`,
    })
  }

  const owners = [...ownerPaths]
    .sort()
    .map(filename => ({ id: ownerId(filename), path: filename }))
  const evidence = [
    ...focusedEvidence,
    {
      id: 'structural-pairing',
      kind: 'structural-pairing',
      path: `${caseRoot}/structural/generated-delta.json.gz`,
      detail:
        'Moved target unit has the verifier-required exact-scope-normalized-token-hash structural pair.',
    },
    {
      id: 'source-map-attribution',
      kind: 'source-map-attribution',
      path: `${caseRoot}/attribution/target-partitions.jsonl.gz`,
      detail:
        'Exact target partitions, relocated candidates, and initializer votes reach the named first-party src owner.',
    },
    {
      id: 'dependency-attribution',
      kind: 'dependency-attribution',
      path: `${caseRoot}/attribution/sources.jsonl.gz`,
      detail:
        'Highest-weight target attribution is a node_modules or bundled vendor source; this excludes the row only from the first-party verdict.',
    },
    {
      id: 'dependency-build-input-audit',
      kind: 'dependency-attribution',
      path: `${caseRoot}/semantic/dependency-coverage.json.gz`,
      detail:
        'Per-package audit proves that no target-pinned dependency source archive, manifest/lockfile, or build recipe reproduces these embedded dependency runtime units.',
    },
    {
      id: 'generated-build-metadata',
      kind: 'generated-metadata',
      path: `${caseRoot}/manifest.json`,
      detail:
        `Identifier-insensitive target AST pins generated VERSION ${targetVersion} and BUILD_TIME-only changes.`,
    },
    {
      id: 'target-fragment',
      kind: 'target-fragment',
      path: 'recovery/test/early-semantic-source-coverage.test.mjs',
      detail:
        `Authenticated ${targetVersion} target fragments and exact structural coordinates are tied to explicit recovered owners where source-map locality is misleading.`,
    },
    {
      id: 'semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/early-semantic-source-coverage.test.mjs',
      detail:
        'Early-chain tests validate every exhaustive ledger, all current source owners, dependency gap audits, and recovered target-specific behavior.',
    },
    {
      id: 'asset-target-fragment',
      kind: 'target-fragment',
      path: 'recovery/test/early-bundled-assets-semantic.test.mjs',
      detail:
        'Acorn extracts the exact authenticated target cooked asset and compares it with the historical semantic source owner after txtRequire normalization where applicable.',
    },
    {
      id: 'asset-semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/early-bundled-assets-semantic.test.mjs',
      detail:
        'The authenticated per-case asset test proves exact historical cooked verify and auto-mode prompt payloads.',
    },
    {
      id: 'powershell-target-fragment',
      kind: 'target-fragment',
      path: 'recovery/test/recovery-2.1.90-powershell-semantic.test.mjs',
      detail:
        'The authenticated target90 PowerShell test extracts and compares exact parser and validation fragments with their historical source owners.',
    },
    {
      id: 'powershell-semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/recovery-2.1.90-powershell-semantic.test.mjs',
      detail:
        'The per-case target90 test proves the recovered PowerShell parser and permission-validation semantics.',
    },
    {
      id: 'powershell-safety-target-fragment',
      kind: 'target-fragment',
      path: 'recovery/test/recovery-2.1.90-powershell-safety-semantic.test.mjs',
      detail:
        'Authenticated target90 units pin the exact PowerShell common-parameter, read-only, path, dangerous-cmdlet, and permission-safety branches.',
    },
    {
      id: 'powershell-safety-semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/recovery-2.1.90-powershell-safety-semantic.test.mjs',
      detail:
        'The per-case safety test compares every recovered target90 PowerShell branch with the materialized historical source owners.',
    },
    {
      id: 'persistence-target-fragment',
      kind: 'target-fragment',
      path: 'recovery/test/recovery-2.1.90-persistence-bridge-semantic.test.mjs',
      detail:
        'Authenticated target90 units 16254, 16255, and 16325 pin the exact persistence uploader, CCR synchronization, and bridge generation/teardown branches.',
    },
    {
      id: 'persistence-semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/recovery-2.1.90-persistence-bridge-semantic.test.mjs',
      detail:
        'The per-case persistence test compares every target branch with the materialized historical source owners and validates the later current-source evolution separately.',
    },
    {
      id: 'runtime-target-fragment',
      kind: 'target-fragment',
      path: 'recovery/test/recovery-2.1.90-runtime-semantic.test.mjs',
      detail:
        'Authenticated target90 structural coordinates and hashes are pinned alongside exact observable strings and control-flow fragments for each recovered runtime cluster.',
    },
    {
      id: 'runtime-semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/recovery-2.1.90-runtime-semantic.test.mjs',
      detail:
        'The per-case target90 test runs against the materialized historical source root and proves the recovered runtime owners and call paths.',
    },
    {
      id: 'powerup-target-fragment',
      kind: 'target-fragment',
      path: 'recovery/test/recovery-2.1.90-powerup-semantic.test.mjs',
      detail:
        'The authenticated target90 powerup region is parsed and its complete published cooked-literal set is compared with the historical source owner.',
    },
    {
      id: 'powerup-semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/recovery-2.1.90-powerup-semantic.test.mjs',
      detail:
        'The per-case powerup test validates every lesson literal/ID plus parser, animation, navigation, persistence, telemetry, and completion branches.',
    },
    {
      id: 'resume-return-target-fragment',
      kind: 'target-fragment',
      path: 'recovery/test/recovery-2.1.90-resume-return-semantic.test.mjs',
      detail:
        'Authenticated target90 unit 17664 and its exact dialog/control fragments are pinned against the historical source owner.',
    },
    {
      id: 'resume-return-semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/recovery-2.1.90-resume-return-semantic.test.mjs',
      detail:
        'The per-case test proves the complete historical resume-return gate, UI, persistence, telemetry, compact action, and target90 model override.',
    },
    {
      id: 'static-dce-target-fragment',
      kind: 'static-ast',
      path: 'recovery/test/recovery-2.1.90-runtime-semantic.test.mjs',
      detail:
        'Authenticated target90 code pins the dominating null return/initializer and the only gated consumer for each unreachable external-build scaffold.',
    },
    {
      id: 'target92-static-dce',
      kind: 'static-ast',
      path: 'recovery/test/recovery-2.1.92-runtime-surface-semantic.test.mjs',
      detail:
        'Authenticated target92 structural identities and bundle slices pin the null Cron provider, statically disabled Stop-hook descriptor, and unconsumed pure --resume= argv initializer.',
    },
    {
      id: 'target94-static-dce',
      kind: 'static-ast',
      path: 'recovery/test/recovery-2.1.94-strict-runtime-semantic.test.mjs',
      detail:
        'Exact target94 identifier occurrence and consumer accounting proves the permission-action provider and classifier tables have no reachable shipped runtime consumer.',
    },
    {
      id: 'claude-api-overlay-static-dce',
      kind: 'static-ast',
      path: 'recovery/test/early-bundled-assets-semantic.test.mjs',
      detail:
        'The authenticated target91 Claude API skill command passes literal null to the optional overlay parameter; the same test pins the cooked base assets and unreachable marker/FILES branch.',
    },
    {
      id: 'early-residue-target-fragment',
      kind: 'target-fragment',
      path: 'recovery/test/early-typed-residue-semantic.test.mjs',
      detail:
        'The authenticated target occurrence is classified exactly as inherited from the prior bundle or tied to a focused source assembly/static property-key proof.',
    },
    {
      id: 'early-residue-semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/early-typed-residue-semantic.test.mjs',
      detail:
        'The per-case test reruns the owner-scoped typed scanner, authenticates both bundles, proves baseline occurrence accounting, and rejects every newly added residue without an explicit source proof.',
    },
  ]
  const dispositions = [
    'alpha-equivalent',
    'dependency-runtime',
    'generated-metadata',
    'dce-nonruntime',
    'source-runtime-covered',
    'source-runtime-gap',
  ]
  const sourceGaps = rows.filter(
    row => row.disposition === 'source-runtime-gap',
  ).length
  const coverage = {
    schemaVersion: 1,
    case: caseName,
    targetVersion,
    targetCommit,
    criterion: 'compiled-ast-function-semantics-v1',
    summary: {
      nonmatchedUnits: rows.length,
      byStructuralClass: exactCounts(rows, 'structuralClass', [
        'changed',
        'moved',
        'unresolved',
      ]),
      byDisposition: exactCounts(rows, 'disposition', dispositions),
      sourceRuntimeGaps: sourceGaps,
      dependencyRuntimeGaps: dependencyRows.length,
    },
    owners,
    evidence,
    rows,
  }

  const dependencyGroups = new Map()
  for (const row of dependencyRows) {
    const group = dependencyGroups.get(row.package) ?? {
      package: row.package,
      attributedSources: new Set(),
      rows: [],
    }
    group.attributedSources.add(row.attribution)
    group.rows.push({
      targetIndex: row.targetIndex,
      sourceHash: row.sourceHash,
      structuralClass: row.structuralClass,
      classification: row.classification,
    })
    dependencyGroups.set(row.package, group)
  }
  const identifierOrMetadataEquivalent = dependencyRows.filter(
    row => row.classification === 'identifier-or-metadata-equivalent-unpinned',
  ).length
  const dependencyAudit = {
    schemaVersion: 1,
    case: caseName,
    targetVersion,
    targetCommit,
    criterion: 'whole-bundle-dependency-build-input-v1',
    summary: {
      dependencyRows: dependencyRows.length,
      identifierOrMetadataEquivalent,
      materialOrUnresolvedDelta:
        dependencyRows.length - identifierOrMetadataEquivalent,
      pinnedSourceBuildInputs: 0,
      dependencyRuntimeGaps: dependencyRows.length,
      exactTargetBundleArtifactRecoverable: true,
      wholeBundleSemanticEquivalentFromSrc: false,
    },
    buildInputAudit: {
      applicationManifestOrLockfileInTargetCommit: false,
      dependencySourceArchivePinned: false,
      dependencyBuildRecipePinned: false,
      exactTargetBundleArtifactRecoverable: true,
      conclusion:
        dependencyRows.length === 0
          ? 'No structurally nonmatched dependency runtime units occur in this case, but the historical application manifest/lockfile and hermetic dependency build recipe remain unavailable, so src alone cannot reproduce the whole bundle.'
          : 'The exact target bundle remains byte-recoverable through the generated delta, but embedded dependency sources and build inputs are unpinned; every dependency row remains a whole-bundle source-reproduction gap.',
    },
    groups: [...dependencyGroups.values()]
      .sort((left, right) => left.package.localeCompare(right.package))
      .map(group => ({
        package: group.package,
        attributedSources: [...group.attributedSources].sort(),
        summary: {
          dependencyRows: group.rows.length,
          identifierOrMetadataEquivalent: group.rows.filter(
            row =>
              row.classification ===
              'identifier-or-metadata-equivalent-unpinned',
          ).length,
          materialOrUnresolvedDelta: group.rows.filter(
            row =>
              row.classification ===
              'material-or-unresolved-delta-unpinned',
          ).length,
          sourceBuildInputPinned: false,
        },
        artifactRecovery: 'exact-target-bundle-bytes-only',
        gap: 'No target-pinned dependency source/build input can reproduce these embedded runtime units from source.',
        rows: group.rows,
      })),
  }

  const outputDirectory = path.join(caseRoot, 'semantic')
  fs.mkdirSync(outputDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(outputDirectory, 'dependency-coverage.json.gz'),
    gzipSync(`${JSON.stringify(dependencyAudit, null, 2)}\n`, {
      level: 9,
      mtime: 0,
    }),
  )
  fs.writeFileSync(
    path.join(outputDirectory, 'source-coverage.json.gz'),
    gzipSync(`${JSON.stringify(coverage, null, 2)}\n`, {
      level: 9,
      mtime: 0,
    }),
  )
  console.log(caseName, JSON.stringify(coverage.summary))
  if (gaps.length > 0) {
    console.log('GAPS', JSON.stringify(gaps.slice(0, 80), null, 2))
  }
}
