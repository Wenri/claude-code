import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

const root = process.cwd()
const artifactRoot = '/tmp/claude-middle-audit.DB5eTC'
const cases = [
  ['2.1.96-to-2.1.97', '2.1.97', '45514e405eb6824b3a9c2f7819677f53038cde1e'],
  ['2.1.97-to-2.1.98', '2.1.98', '5ecd35c9e33fc10ec040d98e15eff6da20b569e0'],
  ['2.1.98-to-2.1.100', '2.1.100', '71adf7f36c3522c296770374910eb1834dfe5d59'],
  ['2.1.100-to-2.1.101', '2.1.101', 'f03f4b89f427a311c3ae6493a5e392ef612f5d26'],
  ['2.1.101-to-2.1.104', '2.1.104', '0d70d13694c24c8dbe822d6f5705a0449e1d0a34'],
  ['2.1.104-to-2.1.105', '2.1.105', '00071c6055eb3c06b6014cf5267e0fe28575c13b'],
  ['2.1.105-to-2.1.107', '2.1.107', '3848dd0b1826c7ccf5a5716541ed5d9b7dc93f08'],
]

function gzipJson(filename) {
  return JSON.parse(gunzipSync(fs.readFileSync(filename)).toString('utf8'))
}
function gzipLines(filename) {
  return gunzipSync(fs.readFileSync(filename)).toString('utf8').trimEnd().split('\n').filter(Boolean).map(JSON.parse)
}
function changedTargetIndexes(diff) {
  const indexes = new Set()
  let targetLine = 0
  for (const line of diff.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (header) {
      targetLine = Number(header[1]) - 1
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      indexes.add(targetLine++)
    } else if (line.startsWith(' ')) {
      targetLine++
    }
  }
  return indexes
}
function firstPartitionEndingAfter(partitions, offset) {
  let low = 0
  let high = partitions.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (partitions[middle].target.offsetEnd <= offset) low = middle + 1
    else high = middle
  }
  return low
}
function initializerAt(initializers, offset) {
  let low = 0
  let high = initializers.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (initializers[middle].regionStart <= offset) low = middle + 1
    else high = middle
  }
  const candidate = initializers[low - 1]
  return candidate && offset < candidate.regionEnd ? candidate : null
}
function attributedSources(target, attribution) {
  const weights = new Map()
  const candidates = new Map()
  for (let index = firstPartitionEndingAfter(attribution.partitions, target.start); index < attribution.partitions.length && attribution.partitions[index].target.offsetStart < target.end; index++) {
    const partition = attribution.partitions[index]
    const overlap = Math.min(target.end, partition.target.offsetEnd) - Math.max(target.start, partition.target.offsetStart)
    if (overlap <= 0) continue
    if (partition.attributedSourceIndex !== null) weights.set(partition.attributedSourceIndex, (weights.get(partition.attributedSourceIndex) ?? 0) + overlap)
    for (const sourceIndex of partition.sourceCandidates ?? []) candidates.set(sourceIndex, (candidates.get(sourceIndex) ?? 0) + overlap)
    for (const sourceIndex of partition.relocatedSourceCandidates ?? []) candidates.set(sourceIndex, (candidates.get(sourceIndex) ?? 0) + overlap / 2)
  }
  if (weights.size === 0) {
    const initializer = initializerAt(attribution.initializers, target.start)
    for (const vote of initializer?.sourceVotes ?? []) weights.set(vote.value, vote.count)
  }
  if (weights.size === 0) {
    for (const [sourceIndex, score] of candidates) weights.set(sourceIndex, score)
  }
  return [...weights].sort((a, b) => b[1] - a[1]).map(([sourceIndex, score]) => ({ sourceIndex, source: attribution.sources.get(sourceIndex), score })).filter(row => row.source)
}
function sourcePath(source) {
  const marker = source?.lastIndexOf('/src/') ?? -1
  if (marker >= 0) return source.slice(marker + 1)
  return source?.startsWith('src/') ? source : null
}
const historicalExistence = new Map()
const target97TranscriptMirrorUnits = new Set([
  10954, 15846, 15847, 15851, 17347, 18387, 18428, 18429, 18556,
])
const target97ManagedAgentUnits = new Set([
  18186, 18204, 18208, 18214, 18216, 18218, 18220, 18222, 18224, 18226,
  18228, 18230, 18248, 18253,
])
const target97TeamMemoryBashUnits = new Set([
  9738, 9742, 9750, 9753, 9754, 9756, 9758, 9759, 9760, 9773, 9903,
  9905, 9914, 9919,
])
const target97UnicodeDelimiterUnits = new Set([
  12692, 12693, 12694, 17041, 17052, 17088, 17093,
])
const target97SandboxMachLookupUnits = new Set([2500, 6207, 6227])
const target97AutoDreamFirstEnableUnits = new Set([13953])
const target97ReplBridgeConfigAliasUnits = new Set([15662])
const target97NotificationLifecycleUnits = new Set([13183, 13184, 13186, 13187])
const target97NotificationReachabilityUnits = new Set([16495])
const target97AutoModeDenialOwnerByIndex = new Map([
  [15040, 'src/utils/autoModeDenials.ts'],
  [15041, 'src/utils/autoModeDenials.ts'],
  [15042, 'src/utils/autoModeDenials.ts'],
  [15043, 'src/utils/autoModeDenials.ts'],
  [15055, 'src/components/permissions/rules/RecentDenialsTab.tsx'],
  [15073, 'src/components/permissions/rules/PermissionRuleList.tsx'],
  [17448, 'src/hooks/useCanUseTool.tsx'],
])
const target97AutoModeDenialUnits = new Set(
  target97AutoModeDenialOwnerByIndex.keys(),
)
const target97AutoModeDenialReachabilityUnits = new Set([16495])
const target97LoopChainStateUnits = new Set([361, 513, 514, 515])
const target97AgentReplToolPoolOwnerByIndex = new Map([
  [11761, 'src/tools/AgentTool/AgentTool.tsx'],
  [12231, 'src/tools/AgentTool/resumeAgent.ts'],
  [12255, 'src/tools.ts'],
  [12256, 'src/tools.ts'],
])
const target97AgentReplToolPoolUnits = new Set(
  target97AgentReplToolPoolOwnerByIndex.keys(),
)
const target97SettingsViewModeUnits = new Set([2588])
const target97ImageTokenCompressionUnits = new Set([7068])
const target97McpResultSizeUnits = new Set([8734, 8735, 8736, 8741])
const target97SessionWriterOwnerByIndex = new Map([
  [7867, 'src/services/PromptSuggestion/speculation.ts'],
  [15811, 'src/utils/sessionStorage.ts'],
  [15817, 'src/utils/sessionStorage.ts'],
  [15846, 'src/utils/sessionStorage.ts'],
  [15847, 'src/utils/sessionStorage.ts'],
  [15848, 'src/utils/sessionStorage.ts'],
  [15851, 'src/utils/sessionStorage.ts'],
  [16538, 'src/hooks/useLogMessages.ts'],
  [17912, 'src/screens/REPL.tsx'],
  [18396, 'src/QueryEngine.ts'],
])
const target97SessionWriterUnits = new Set(
  target97SessionWriterOwnerByIndex.keys(),
)
const target97BridgeGitContextOwnerByIndex = new Map([
  [14524, 'src/bridge/gitSessionContext.ts'],
  [14525, 'src/bridge/gitSessionContext.ts'],
  [14528, 'src/bridge/createSession.ts'],
])
const target97BridgeGitContextUnits = new Set(
  target97BridgeGitContextOwnerByIndex.keys(),
)
const target97LinkScanOffsetDceUnits = new Set([14516])
const target97RoutineCronStaticUnits = new Set([17898])
const target97DreamVerifyUnits = new Set([
  18148, 18157, 18158, 18159, 18160, 18161, 18162,
])
const target97RuntimeUtilityUnits = new Set([
  3236, 5501, 6270, 6868, 7067, 7811, 8113,
])
const target97MemoryLifecycleUnits = new Set([6743, 12324, 12376])
const target97AgentRuntimeUnits = new Set([
  10014, 10069, 10081, 11042, 11589, 11761, 12231,
])
const target97RateLimitUpgradeUnits = new Set([11313, 11314, 15622, 17912])
const target97VirtualMessageKeyUnits = new Set([14740])
const target97PluginMarketplaceUnits = new Set([12817, 12832, 14283])
const target97VcrImageUnits = new Set([12559])
const target97CommandErrorUnits = new Set([12466, 13527, 13530, 15215, 15945])
const target97AppleScriptQuoteUnits = new Set([18325, 18327])
const target97FpsTrackerUnits = new Set([17946])
const target97VoiceTipUnits = new Set([17675])
const target97CompactTruncationUnits = new Set([
  12445, 12446, 12447, 12452, 12456, 12465,
])
const target97CronExtraTaskUnits = new Set([17892])
const target97SandboxInboxUnits = new Set([17544])
const target97DynamicPromptUnits = new Set([
  12511, 12523, 13808, 16215, 16216, 16217, 17681, 18392, 18393, 18396,
  18397, 18429, 18432, 18556,
])
const target97DeferredToolDeltaUnits = new Set([13018])
const target97PrDetailsUnits = new Set([17259, 17261])
const target97WorkflowScriptUnits = new Set([15969, 15985, 16012])
const target97ToolInputUnicodeUnits = new Set([16241])
const target97HookEvaluatorUnits = new Set([16062, 16063, 16064, 16065, 16066])
const target97AutoModeTelemetryUnits = new Set([13123])
const target97RecursiveSafetyCheckUnits = new Set([13115, 13116, 13122, 13123])
const target97ReadOnlyRedirectUnits = new Set([7822, 7823, 7824])
const target97PlaceholderExpansionUnits = new Set([9273, 16103])
const target97WorktreeNoTrackUnits = new Set([16179])
const target97TokenWarningUnits = new Set([17012])
const target97CostSteerUnits = new Set([11755])
const target97PermissionShortcutUnits = new Set([16848, 16911])
const target97AgentEffortCapUnits = new Set([6281, 6283, 11589])
const target97ModelFamilyPromptUnits = new Set([16219])
const target97ResumeRefreshUnits = new Set([14765, 18082])
const target97BridgeCleanupUnits = new Set([16636])
const target97BridgeCommandAliasUnits = new Set([15801, 17469])
const target97FocusCollapseUnits = new Set([9664, 9665, 9666, 9667, 11466, 17271])
const target97MarkdownBlockquoteUnits = new Set([10109, 10110])
const target97UnifiedInstalledAuthUnits = new Set([14316])
const target97AdditionalModelCostsUnits = new Set([3205, 17919, 17921])
const target98DreamTeamMemoryUnits = new Set([
  12483, 18337, 18338, 18339, 18340,
])
const target98AdvisorUnits = new Set([9326, 9332])
const target98VertexRegionUnits = new Set([613])
const target98RemoteSlugUnits = new Set([2425, 2426, 2437])
const target98RemoteEligibilityUnits = new Set([11698, 11704, 11792])
const target98LogFilterUnits = new Set([14880])
const target98StatusLineResultUnits = new Set([17382, 17383, 17384])
const target98PluginScopeFallbackUnits = new Set([14400])
const target98ProviderSetupUnits = new Set([
  11334, 11336, 11337, 14912, 14913, 14915, 14919, 14920, 14921, 14923,
  14925, 15952,
])
const target98PrDetailsUnits = new Set([17422])
const target98WebSetupEnvironmentUnits = new Set([15875])
const target98ConsoleOAuthUnits = new Set([11341])
const target98BridgeLateResponseUnits = new Set([16781])
const target98EffortCapabilityUnits = new Set([6306, 6307, 6325])
const target98SessionsWebSocketUnits = new Set([17483])
const target98WrappedContentFeedbackUnits = new Set([
  13516, 13518, 13522, 13527, 13528, 13529, 17751,
])
const target98VertexModelUpgradeUnits = new Set([
  18213, 18214, 18218, 18219, 18220, 18221, 18222, 18223, 18224, 18225,
  18227, 18235, 18236, 18240, 18241,
])
const target98BedrockProbeDeadlineUnits = new Set([
  18206, 18207, 18235, 18236, 18237, 18239,
])
const target98UltraplanLaunchUnits = new Set([17728, 18079])
const target98LoopUntilDceUnits = new Set([18345])
const target98McpResourceTemplateUnits = new Set([
  7824, 8754, 8756, 8773, 13580, 14286, 17223, 17224, 17225, 17226,
  17227, 17228, 17231, 17234, 17235, 17250, 18734,
])
const target98AgentsRuntimeUnits = new Set([
  7824, 11855, 15419, 15481, 15482, 15483, 15484, 15485, 15486, 15487,
  15488, 15489, 15490, 15491, 15492, 15493, 15501, 18734,
])
const target98StopHookFocusUnits = new Set([15319])
const target98TypeaheadMetadataUnits = new Set([17250])
const target98DynamicImageLimitUnits = new Set([
  6758, 7047, 7048, 7049, 7050, 7107, 7108, 7109, 7110, 7112, 7314,
  8605, 8638, 8755, 8761, 8764, 8766, 8767, 8768, 8773, 12508, 12762,
  12764, 12766, 13095, 13418, 13419, 16420, 16846, 16853, 17002, 17476,
  17630, 18079,
])
const target98DynamicImageOwnerByIndex = new Map([
  [6758, 'src/utils/imageLimits.ts'],
  [7047, 'src/utils/imageValidation.ts'],
  [7048, 'src/utils/imageValidation.ts'],
  [7049, 'src/utils/imageValidation.ts'],
  [7050, 'src/utils/imageValidation.ts'],
  [7107, 'src/utils/imageResizer.ts'],
  [7108, 'src/utils/imageResizer.ts'],
  [7109, 'src/utils/imageResizer.ts'],
  [7110, 'src/utils/imageResizer.ts'],
  [7112, 'src/utils/imageResizer.ts'],
  [7314, 'src/utils/imageLimits.ts'],
  [8605, 'src/utils/imagePaste.ts'],
  [8638, 'src/components/CustomSelect/select-input-option.tsx'],
  [8755, 'src/services/mcp/client.ts'],
  [8761, 'src/services/mcp/client.ts'],
  [8764, 'src/services/mcp/client.ts'],
  [8766, 'src/services/mcp/client.ts'],
  [8767, 'src/services/mcp/client.ts'],
  [8768, 'src/services/mcp/client.ts'],
  [8773, 'src/services/mcp/client.ts'],
  [12508, 'src/query.ts'],
  [12762, 'src/utils/attachments.ts'],
  [12764, 'src/utils/attachments.ts'],
  [12766, 'src/utils/attachments.ts'],
  [13095, 'src/utils/messages.ts'],
  [13418, 'src/hooks/usePasteHandler.ts'],
  [13419, 'src/hooks/usePasteHandler.ts'],
  [16420, 'src/services/api/claude.ts'],
  [16846, 'src/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx'],
  [16853, 'src/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx'],
  [17002, 'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx'],
  [17476, 'src/components/PromptInput/PromptInput.tsx'],
  [17630, 'src/utils/processUserInput/processUserInput.ts'],
  [18079, 'src/screens/REPL.tsx'],
])
const target100SpinnerUnits = new Set([10961, 10963])
const target101LogPreviewUnits = new Set([14967])
const target101ResumeSelectorUnits = new Set([14990, 14993, 18410])
const target101BetaTracingPrivacyUnits = new Set([
  9075, 9084, 9085, 9086, 9087, 9088, 10322, 12487,
])
const target101SingleDigitSelectUnits = new Set([8761, 10306])
const target101StartupRuntimeUnits = new Set([18235, 18238, 18242, 18600])
const target101ClaudeApiTriggerUnits = new Set([18595])
const target101McpDirectoryRegistryUnits = new Set([
  4904, 4905, 4906, 4907, 4909, 4910,
])
const target101SdkOAuthControlUnits = new Set([
  361, 438, 4636, 4681, 17996, 18007, 18767,
])
const target101SettingsSanitizationUnits = new Set([2548, 2574, 2616, 2656])
const target101InkEventUnits = new Set([5271, 5366, 5370, 5607, 5613])
const target101InkLifecycleUnits = new Set([5606, 5706])
const target101SdkTelemetryTaskUnits = new Set([
  5075, 8039, 11058, 17639, 18007, 18735, 18767, 18768,
])
const target101PluginRuntimeUnits = new Set([
  6052, 6073, 6075, 13098, 13102, 13105, 13110, 13111, 13112, 14443, 14467,
  14469, 14487, 14488, 14517, 14518, 14530, 14541, 14546,
])
const target101WorktreeRecoveryUnits = new Set([16439, 16449, 16452])
const target101LoopsCommandUnits = new Set([
  15422, 15423, 15424, 15426, 15428, 15429, 15430, 15431, 15433,
])
const target101PrintResumeTitleUnits = new Set([18778])
const target101SafetyUiUnits = new Set([
  14121, 14123, 14139, 14146, 14263, 14388, 14390, 18038, 18040,
])
const target101StateOperationUnits = new Set([
  7933, 9465, 9468, 9469, 9470, 9678, 9696, 9755, 10003, 12611,
  14977, 16380, 16415, 18222, 18732, 18735, 18799,
])
const target101RemoteIngressUnits = new Set([11760, 11785, 11861, 16902])
const target101AwaySummaryUnits = new Set([
  17943, 17944, 17945, 17947, 17948, 17949, 17950, 17951,
])
const target101InvalidSettingsUnits = new Set([18396, 18397])
const target101FrameHtmlPermissionUnits = new Set([16244, 16245, 16272])
const target101OpenFrameKeybindingUnits = new Set([8167])
const target101ClientPresenceUnits = new Set([16818, 16819, 16821])
const target101HomebrewVersionUnits = new Set([10745, 10746, 17267, 18876])
const target101ManagedHookLoadingUnits = new Set([11805, 11806])
const target101WorktreeResumeHintUnits = new Set([
  10248, 10249, 10250, 10251, 10255,
])
const target101CcrSourceViabilityUnits = new Set([
  15080, 15108, 15111, 15114, 15115, 15116, 17866, 17867, 17874, 18222,
])
const target101InsightsResponseUnits = new Set([16012, 16048])
const target101TrustedDeviceRetryUnits = new Set([10239, 16876])
const target101BridgeWorktreePreservationUnits = new Set([16653, 16659])
const target101AgentTaskNotificationUnits = new Set([11749, 12104, 13259])
const target101AgentBackgroundGuidanceUnits = new Set([11919, 11924])
const target101ToolSearchMcpNameUnits = new Set([7078])
const target101TeamMemoryAvailabilityUnits = new Set([
  361, 467, 468, 479, 480, 6793, 6799, 9890, 9891, 9892, 9901, 9902,
  9905, 18767,
])
const target101MainInputNormalizationUnits = new Set([18890, 18895])
const target101KeybindingLoaderUnits = new Set([
  8184, 8185, 8186, 8189, 8190, 8191, 8192, 8193, 8194, 8195, 8196,
  8197,
])
const target101AgentMetadataMirrorUnits = new Set([16085])
const target101BackgroundSessionPromptUnits = new Set([16476])
const target101UpdateCommandUnits = new Set([
  15821, 15823, 15824, 15825, 15826, 15828, 16067,
])
const target101KillRingContextUnits = new Set([
  13442, 13446, 13447, 13448, 13449, 13451, 13498, 13838, 16761,
])
const target101MessageRatingHoverUnits = new Set([10235])
const target101TeamCreateExclusiveUnits = new Set([11242, 12401])
const target101FileSuggestionStateUnits = new Set([
  13636, 13637, 13641, 13642, 13643, 13647, 13648, 13653, 13655, 13657,
  13658,
])
const target101ClassifierApprovalUnits = new Set([
  7939, 11488, 11668, 11669, 11670, 11671, 11672, 11673, 11674, 12672,
  13329, 17740, 17744,
])
const target101ToolProgressOverlayUnits = new Set([
  9390, 9392, 10005, 10007, 11924, 17813, 17815, 18222,
])
const target101RemoteTriggerRunUnits = new Set([12369, 12377])
const target101ScheduleRemoteGateUnits = new Set([18512])
const target101ComputerUseStateUnits = new Set([7352, 8814, 12611, 18222])
const target101BashNewlineSandboxUnits = new Set([7829, 10051, 10058])
const target101McpInitHandshakeUnits = new Set([
  18621, 18622, 18623, 18624, 18797,
])
const target101CompactHookStateUnits = new Set([
  12639, 12640, 12643, 13731, 16323, 16330, 16356, 16364, 17770, 18736,
])
const target101RemoteSettingsValidationUnits = new Set([10359, 10367, 10370])
const target101StoredImageStateUnits = new Set([
  8740, 8761, 8773, 11593, 13661, 16938, 16940,
])
const target101ApiErrorRateLimitUnits = new Set([11628])
const target101ContextUnattributedUnits = new Set([12729])
const target101OAuthUrlOutdentUnits = new Set([11411, 11429])
const target101SuggestionPaddingUnits = new Set([13533])
const target101SessionEnvUnits = new Set([
  9058, 9146, 9390, 9392, 10005, 10007, 12393, 12611, 13666, 17321,
  17385, 17611, 17858, 18222, 18735, 18736, 18768,
])
const target101CommandDisplaySearchUnits = new Set([17325])
const target101DormantSessionSchemaUnits = new Set([14720])
const target101CommandAgentBootstrapUnits = new Set([18240])
const target101ChromeOnboardingFocusUnits = new Set([18346])
const target101RemoteIoWriteTrackingUnits = new Set([18726])
const target101LoopDefaultUnits = new Set([
  6825, 6826, 6827, 6850, 6854, 6859, 6861, 6862, 6863, 6864, 6873,
  6877, 12366, 12368, 12443, 12654, 12657, 12660, 12661, 12662, 12663, 12664, 12665,
  12666, 12667, 12668, 12669, 12670, 12671, 12672, 12674, 18202, 18208,
  18497, 18498, 18499, 18500, 18501, 18768,
])
const target105LogRepoUnits = new Set([15088])
const target105LoopProactiveUnits = new Set([18678])
const target105AgentConcurrencyOwnerByIndex = new Map([
  [11229, 'src/tools/AgentTool/prompt.ts'],
  [13334, 'src/utils/messages.ts'],
])
const target105AgentConcurrencyUnits = new Set(
  target105AgentConcurrencyOwnerByIndex.keys(),
)
const target105PrintResumeTelemetryUnits = new Set([18978])
const target105RecapUnits = new Set([16088, 16089, 18109])
const target105WorktreeLifecycleUnits = new Set([16593, 16594, 16595, 16596])
const target105PromptCacheBreakUnits = new Set([
  6928, 6929, 6930, 6931, 6932, 6933, 6934, 6935, 6936, 6937, 6938,
  6939, 6940, 6941, 6942, 16680,
])
const target105ClientPresencePlatformUnits = new Set([16955])
const target105RemoteTriggerSchemaUnits = new Set([11907])
const target105TreeConnectorUnits = new Set([
  14189, 14190, 14191, 14192, 14193, 14194, 14195,
])
const target105TaskRegistryOwnerByIndex = new Map([
  [10323, 'src/utils/swarm/inProcessRunner.ts'],
  [10208, 'src/utils/task/framework.ts'],
  [10985, 'src/tools/AgentTool/runAgent.ts'],
  [11172, 'src/tasks/RemoteAgentTask/RemoteAgentTask.tsx'],
  [11174, 'src/tasks/RemoteAgentTask/RemoteAgentTask.tsx'],
  [11175, 'src/tasks/RemoteAgentTask/RemoteAgentTask.tsx'],
  [11209, 'src/tools/shared/spawnMultiAgent.ts'],
  [11210, 'src/tools/shared/spawnMultiAgent.ts'],
  [11234, 'src/tools/AgentTool/AgentTool.tsx'],
  [11578, 'src/tasks/stopTask.ts'],
  [11587, 'src/tools/TaskStopTool/TaskStopTool.ts'],
  [11636, 'src/tools/TaskOutputTool/TaskOutputTool.tsx'],
  [11672, 'src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts'],
  [11928, 'src/tools/MonitorTool/MonitorTool.ts'],
  [11955, 'src/tasks/LocalMainSessionTask.ts'],
  [11960, 'src/tools/AgentTool/resumeAgent.ts'],
  [11979, 'src/tools/SendMessageTool/SendMessageTool.ts'],
  [12253, 'src/tools/PowerShellTool/PowerShellTool.tsx'],
  [12255, 'src/tools/PowerShellTool/PowerShellTool.tsx'],
  [12410, 'src/tasks/LocalAgentTask/LocalAgentTask.tsx'],
  [12418, 'src/tasks/LocalAgentTask/LocalAgentTask.tsx'],
  [12419, 'src/tasks/LocalAgentTask/LocalAgentTask.tsx'],
  [12428, 'src/tasks/LocalShellTask/LocalShellTask.tsx'],
  [12536, 'src/tools/BashTool/BashTool.tsx'],
  [12538, 'src/tools/BashTool/BashTool.tsx'],
  [12727, 'src/services/autoDream/autoDream.ts'],
  [12775, 'src/utils/forkedAgent.ts'],
  [12961, 'src/utils/attachments.ts'],
  [13015, 'src/utils/attachments.ts'],
  [13683, 'src/commands/autofix-pr/autofix-pr.tsx'],
  [15103, 'src/utils/agenticSessionSearch.ts'],
  [15106, 'src/utils/agenticSessionSearch.ts'],
  [15247, 'src/commands/ultraplan.tsx'],
  [17964, 'src/hooks/useManagePlugins.ts'],
  [18386, 'src/screens/REPL.tsx'],
  [18926, 'src/utils/queryContext.ts'],
  [18934, 'src/QueryEngine.ts'],
  [18967, 'src/cli/print.ts'],
])
const target105InProcessTaskRegistryUnits = new Set([10323])

function transitiveOwnerCase(caseName, ownerPath) {
  if (
    caseName === '2.1.97-to-2.1.98' &&
    ownerPath === 'src/commands/stop-hook/StopHookDialog.tsx'
  ) {
    return '2.1.91-to-2.1.92'
  }
  if (caseName === '2.1.100-to-2.1.101') {
    if (ownerPath === 'src/tools/MonitorTool/MonitorTool.ts') {
      return '2.1.97-to-2.1.98'
    }
    if (ownerPath === 'src/components/ultraplan/UltraplanChoiceDialog.tsx') {
      return '2.1.90-to-2.1.91'
    }
  }
  if (caseName === '2.1.104-to-2.1.105') {
    if (ownerPath === 'src/tools/MonitorTool/MonitorTool.ts') {
      return '2.1.97-to-2.1.98'
    }
    if (ownerPath === 'src/hooks/useTypeahead.tsx') {
      return '2.1.97-to-2.1.98'
    }
    if (ownerPath === 'src/commands/autofix-pr/autofix-pr.tsx') {
      return '2.1.92-to-2.1.94'
    }
  }
  return null
}
const target105TaskRegistryUnits = new Set(target105TaskRegistryOwnerByIndex.keys())
const target105SdkMemoryPathsUnits = new Set([10235, 16951])
const target105HeadlessMcpPrewaitUnits = new Set([18956, 18967, 18968])
const target105BackendRegistryUnits = new Set([
  10377, 10378, 10379, 10380, 10381, 10382, 10383, 10384, 10386, 10387,
  10388, 10389, 10391, 10392, 10393, 10394, 10395, 10396, 10398,
])
const target105SkillListingOwnerByIndex = new Map([
  [2596, 'src/utils/settings/types.ts'],
  [6783, 'src/tools/SkillTool/prompt.ts'],
  [6784, 'src/tools/SkillTool/prompt.ts'],
  [6785, 'src/tools/SkillTool/prompt.ts'],
  [6786, 'src/tools/SkillTool/prompt.ts'],
  [6787, 'src/tools/SkillTool/prompt.ts'],
  [6790, 'src/tools/SkillTool/prompt.ts'],
  [6791, 'src/tools/SkillTool/prompt.ts'],
  [6793, 'src/tools/SkillTool/prompt.ts'],
  [6799, 'src/tools/SkillTool/prompt.ts'],
  [8823, 'src/state/AppStateStore.ts'],
  [11103, 'src/utils/conversationRecovery.ts'],
  [11110, 'src/utils/conversationRecovery.ts'],
  [11112, 'src/utils/conversationRecovery.ts'],
  [11250, 'src/tools/SkillTool/SkillTool.ts'],
  [13000, 'src/utils/attachments.ts'],
  [16170, 'src/commands.ts'],
  [16171, 'src/commands.ts'],
  [16172, 'src/commands.ts'],
  [16173, 'src/commands.ts'],
  [18274, 'src/hooks/notifs/useSkillTruncationNotification.tsx'],
  [18275, 'src/hooks/notifs/useSkillTruncationNotification.tsx'],
  [18386, 'src/screens/REPL.tsx'],
  [19107, 'src/main.tsx'],
])
const target105SkillListingUnits = new Set(
  target105SkillListingOwnerByIndex.keys(),
)
const target105EventLoopOwnerByIndex = new Map([
  [18829, 'src/utils/eventLoopStallDetector.ts'],
  [18830, 'src/utils/eventLoopStallDetector.ts'],
  [18831, 'src/utils/eventLoopStallDetector.ts'],
  [18832, 'src/utils/eventLoopStallDetector.ts'],
  [18833, 'src/utils/eventLoopStallDetector.ts'],
  [19100, 'src/main.tsx'],
])
const target105EventLoopUnits = new Set(target105EventLoopOwnerByIndex.keys())
const target105MemoryThresholdUnits = new Set([17412, 17413, 17414])
const target105AutoModeStateUnits = new Set([
  11658, 11659, 11660, 11661, 11662, 11663, 11664, 11665, 11666, 11667,
  11668, 11669,
])
const target105GitOwnerByIndex = new Map([
  [2375, 'src/utils/git/gitFilesystem.ts'],
  [2385, 'src/utils/git/gitFilesystem.ts'],
  [2386, 'src/utils/git/gitFilesystem.ts'],
  [2387, 'src/utils/git/gitFilesystem.ts'],
  [2408, 'src/utils/detectRepository.ts'],
  [2416, 'src/utils/git.ts'],
  [2426, 'src/utils/git.ts'],
  [15767, 'src/bridge/bridgeApi.ts'],
  [16809, 'src/bridge/bridgeMain.ts'],
])
const target105GitUnits = new Set(target105GitOwnerByIndex.keys())
const target105AtomicTeamFileUnits = new Set([
  10400, 10411, 10412, 10413, 10423, 10431,
])
const target105AtomicTeammateReservationUnits = new Set([
  11206, 11207, 11208, 11209, 11210, 11211, 11212,
])
const target105FullCompactionCompletionUnits = new Set([12793])
const target105PartialCompactionCompletionUnits = new Set([12794, 12795])
const target105HfiAuthCleanupUnits = new Set([17819, 17824])
const target105SessionAppendPolicyUnits = new Set([16185, 16225, 16321])
const target105MarkdownOrderedListUnits = new Set([9304])
const target105MarkdownWhitespaceUnits = new Set([9300, 9301])
const target105MetaEnterTabUnits = new Set([5275])
const target105GracefulShutdownUnits = new Set([11253, 17853, 18906])
const target105SkillActivatedOtelUnits = new Set([11245, 11247, 11250])
const target105PluginInstallOtelUnits = new Set([13186, 13187, 14597])
const target105OfficialMarketplaceGcsRollbackUnits = new Set([13097])
const target105SubprocessIsolationUnits = new Set([5924, 5928, 5938])
const target105MessageRatingSurfaceUnits = new Set([9354])
const target105WorktreeResumeNameUnits = new Set([9403, 9404])
const target105AccountLabelUnits = new Set([9980])
const target105SystemDiagnosticsHeadingUnits = new Set([13900])
const target105ModelDeprecationTenseUnits = new Set([18264])
const target105MemorySynthesisFactShapeUnits = new Set([12952, 12953])
const target105TypeaheadMetadataTransitiveUnits = new Set([17520])
const target105AwaySummaryPromptUnits = new Set([8752])
const target105FullscreenSuggestionNoPadUnits = new Set([15050])
const target105MessageDeferralOwnerByIndex = new Map([
  [15069, 'src/components/Messages.tsx'],
  [15070, 'src/components/Messages.tsx'],
  [18386, 'src/screens/REPL.tsx'],
])
const target105MessageDeferralUnits = new Set(
  target105MessageDeferralOwnerByIndex.keys(),
)
const target105ToolSearchMcpNonblockingUnits = new Set([12853])
const target105SdkSkipTranscriptUnits = new Set([
  7418, 10211, 10235, 11568, 11570, 11571, 11573,
])
const target105SdkNotificationMemoryUnits = new Set([
  10235, 11672, 12732, 12795, 18929, 18930, 18934,
])
const target105SdkAuxiliaryOwnerByIndex = new Map([
  [7418, 'src/utils/sdkEventQueue.ts'],
  [10211, 'src/utils/task/framework.ts'],
  [10235, 'src/entrypoints/sdk/coreSchemas.ts'],
  [11568, 'src/tasks/DreamTask/DreamTask.ts'],
  [11570, 'src/tasks/DreamTask/DreamTask.ts'],
  [11571, 'src/tasks/DreamTask/DreamTask.ts'],
  [11573, 'src/tasks/DreamTask/DreamTask.ts'],
  [11672, 'src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts'],
  [12732, 'src/query/stopHooks.ts'],
  [12795, 'src/services/compact/compact.ts'],
  [18929, 'src/QueryEngine.ts'],
  [18930, 'src/QueryEngine.ts'],
  [18934, 'src/QueryEngine.ts'],
])
const target105SdkAuxiliaryUnits = new Set(
  target105SdkAuxiliaryOwnerByIndex.keys(),
)
const target105TeleportTrustedDeviceUnits = new Set([11154])
const target105GitBundleBaseRefOwnerByIndex = new Map([
  [11132, 'src/utils/teleport/gitBundle.ts'],
  [11133, 'src/utils/teleport/gitBundle.ts'],
  [11156, 'src/utils/teleport.tsx'],
])
const target105GitBundleBaseRefUnits = new Set(
  target105GitBundleBaseRefOwnerByIndex.keys(),
)
const target105McpOAuthDiscoveryOwnerByIndex = new Map([
  [7936, 'src/services/mcp/auth.ts'],
  [7937, 'src/services/mcp/auth.ts'],
  [7939, 'src/services/mcp/auth.ts'],
  [7944, 'src/services/mcp/auth.ts'],
  [8476, 'src/services/mcp/client.ts'],
  [8479, 'src/services/mcp/client.ts'],
])
const target105McpOAuthDiscoveryUnits = new Set(
  target105McpOAuthDiscoveryOwnerByIndex.keys(),
)
function target105SdkAuxiliaryEvidenceIds(targetIndex) {
  return [
    ...(target105SdkSkipTranscriptUnits.has(targetIndex)
      ? [
          'sdk-skip-transcript105-semantic-test',
          'sdk-skip-transcript105-target-units',
        ]
      : []),
    ...(target105SdkNotificationMemoryUnits.has(targetIndex)
      ? [
          'sdk-notification-memory105-semantic-test',
          'sdk-notification-memory105-target-units',
        ]
      : []),
  ]
}
const target105AnalyticsStateUnits = new Set([579, 580, 581, 582, 583, 584])
const target105TeamMemoryAclUnits = new Set([12486, 12487])
const target105AttachmentMessageUnits = new Set([13372])
const target105PluginSettingsDescriptionUnits = new Set([2554])
const target105TrustedDevicePolicyUnits = new Set([9394, 9395, 9399, 9400])
const target105RecalledMemoryOwnerByIndex = new Map([
  [10709, 'src/components/messages/RecalledMemory.tsx'],
  [10710, 'src/components/messages/RecalledMemory.tsx'],
  [10711, 'src/components/messages/RecalledMemory.tsx'],
  [10712, 'src/components/messages/RecalledMemory.tsx'],
  [10713, 'src/components/messages/RecalledMemory.tsx'],
  [10714, 'src/components/messages/RecalledMemory.tsx'],
  [10715, 'src/components/messages/RecalledMemory.tsx'],
  [10716, 'src/components/messages/RecalledMemory.tsx'],
  [10717, 'src/components/messages/RecalledMemory.tsx'],
  [10718, 'src/components/messages/RecalledMemory.tsx'],
  [10719, 'src/components/messages/RecalledMemory.tsx'],
  [10720, 'src/components/messages/RecalledMemory.tsx'],
  [10721, 'src/components/messages/RecalledMemory.tsx'],
  [10794, 'src/components/messages/AttachmentMessage.tsx'],
  [10881, 'src/components/Message.tsx'],
  [18386, 'src/screens/REPL.tsx'],
])
const target105RecalledMemoryUnits = new Set(
  target105RecalledMemoryOwnerByIndex.keys(),
)
const target105ApiRetryTelemetryUnits = new Set([12757])
const target105FirstAttemptRequestIdUnits = new Set([12758, 12759, 16680])
const target105AuthRenderRootUnits = new Set([9989, 9990, 19107])
const target105EnvHookStateUnits = new Set([7171, 7173])
const target105SkillDynamicStateOwnerByIndex = new Map([
  [12289, 'src/skills/loadSkillsDir.ts'],
  [12290, 'src/skills/loadSkillsDir.ts'],
  [12291, 'src/skills/loadSkillsDir.ts'],
  [12292, 'src/skills/loadSkillsDir.ts'],
  [12293, 'src/skills/loadSkillsDir.ts'],
  [12294, 'src/skills/loadSkillsDir.ts'],
  [12295, 'src/skills/loadSkillsDir.ts'],
  [12296, 'src/skills/loadSkillsDir.ts'],
  [12297, 'src/skills/loadSkillsDir.ts'],
  [12298, 'src/skills/loadSkillsDir.ts'],
  [12299, 'src/skills/loadSkillsDir.ts'],
  [18999, 'src/entrypoints/mcp.ts'],
])
const target105SkillDynamicStateUnits = new Set(
  target105SkillDynamicStateOwnerByIndex.keys(),
)
const target105ManagedAgentDocOwnerByIndex = new Map([
  [18697, 'src/skills/bundled/claude-api/curl/managed-agents.md'],
  [18715, 'src/skills/bundled/claude-api/python/managed-agents/README.md'],
  [18727, 'src/skills/bundled/claude-api/shared/managed-agents-api-reference.md'],
  [18729, 'src/skills/bundled/claude-api/shared/managed-agents-client-patterns.md'],
  [18731, 'src/skills/bundled/claude-api/shared/managed-agents-core.md'],
  [18733, 'src/skills/bundled/claude-api/shared/managed-agents-environments.md'],
  [18735, 'src/skills/bundled/claude-api/shared/managed-agents-events.md'],
  [18737, 'src/skills/bundled/claude-api/shared/managed-agents-onboarding.md'],
  [18739, 'src/skills/bundled/claude-api/shared/managed-agents-overview.md'],
  [18741, 'src/skills/bundled/claude-api/shared/managed-agents-tools.md'],
  [18759, 'src/skills/bundled/claude-api/typescript/managed-agents/README.md'],
])
const target105ManagedAgentDocUnits = new Set(
  target105ManagedAgentDocOwnerByIndex.keys(),
)
const target105PluginManifestVersionUnits = new Set([13165])
const target105McpElicitationFormUnits = new Set([17367, 17369])
const target105ReactiveCompactionOwnerByIndex = new Map([
  [7202, 'src/utils/telemetry/events.ts'],
  [7216, 'src/services/compact/reactiveCompact.ts'],
  [7217, 'src/services/compact/reactiveCompact.ts'],
  [7218, 'src/services/compact/reactiveCompact.ts'],
  [7219, 'src/services/compact/reactiveCompact.ts'],
  [7220, 'src/services/compact/reactiveCompact.ts'],
  [12622, 'src/services/compact/reactiveCompact.ts'],
  [12623, 'src/services/compact/reactiveCompact.ts'],
  [12624, 'src/services/compact/reactiveCompact.ts'],
  [12625, 'src/services/compact/reactiveCompact.ts'],
  [12626, 'src/services/compact/reactiveCompact.ts'],
  [12627, 'src/services/compact/reactiveCompact.ts'],
  [12628, 'src/services/compact/reactiveCompact.ts'],
  [12629, 'src/services/compact/reactiveCompact.ts'],
  [12746, 'src/query.ts'],
  [12749, 'src/query.ts'],
  [13857, 'src/commands/compact/compact.ts'],
  [13858, 'src/commands/compact/compact.ts'],
  [13861, 'src/commands/compact/compact.ts'],
  [13862, 'src/commands/compact/compact.ts'],
])
const target105ReactiveCompactionUnits = new Set(
  target105ReactiveCompactionOwnerByIndex.keys(),
)
const target105MalformedToolUseUnits = new Set([12746])
const target105TmuxFocusOwnerByIndex = new Map([
  [9315, 'src/utils/fullscreen.ts'],
  [9324, 'src/utils/fullscreen.ts'],
  [18386, 'src/screens/REPL.tsx'],
])
const target105TmuxFocusUnits = new Set(target105TmuxFocusOwnerByIndex.keys())
const target105TmuxSocketOwnerByIndex = new Map([
  [8635, 'src/utils/shell/bashProvider.ts'],
  [8723, 'src/utils/Shell.ts'],
  [11928, 'src/tools/MonitorTool/MonitorTool.ts'],
  [12536, 'src/tools/BashTool/BashTool.tsx'],
  [12538, 'src/tools/BashTool/BashTool.tsx'],
  [12775, 'src/utils/forkedAgent.ts'],
  [18386, 'src/screens/REPL.tsx'],
  [18934, 'src/QueryEngine.ts'],
  [18935, 'src/QueryEngine.ts'],
  [18967, 'src/cli/print.ts'],
])
const target105TmuxSocketUnits = new Set(
  target105TmuxSocketOwnerByIndex.keys(),
)
function target105TmuxSocketEvidenceIds(targetIndex) {
  return [
    'tmux-socket105-semantic-test',
    'tmux-socket105-target-units',
    ...(target105MessageDeferralUnits.has(targetIndex)
      ? [
          'message-deferral105-semantic-test',
          'message-deferral105-target-units',
        ]
      : []),
    ...(target105TaskRegistryUnits.has(targetIndex)
      ? ['task-registry105-semantic-test', 'task-registry105-target-units']
      : []),
    ...(target105AwaySummaryConfigUnits.has(targetIndex)
      ? ['away-summary-config105-semantic-test', 'away-summary-config105-target-units']
      : []),
    ...(target105SkillListingUnits.has(targetIndex)
      ? ['skill-listing105-semantic-test', 'skill-listing105-target-units']
      : []),
    ...(target105RecalledMemoryUnits.has(targetIndex)
      ? [
          'recalled-memory-rating105-semantic-test',
          'recalled-memory-rating105-target-units',
        ]
      : []),
    ...(target105TmuxFocusUnits.has(targetIndex)
      ? ['tmux-focus105-semantic-test', 'tmux-focus105-target-units']
      : []),
    ...(target105BackgroundWorkUnits.has(targetIndex)
      ? [
          'background-work-exit105-semantic-test',
          'background-work-exit105-target-units',
        ]
      : []),
    ...(target105SessionStatePropagationUnits.has(targetIndex)
      ? [
          'session-state-propagation105-semantic-test',
          'session-state-propagation105-target-units',
        ]
      : []),
    ...(target105HeadlessMcpPrewaitUnits.has(targetIndex)
      ? [
          'headless-mcp-prewait105-semantic-test',
          'headless-mcp-prewait105-target-units',
        ]
      : []),
    ...target105SdkAuxiliaryEvidenceIds(targetIndex),
  ]
}
const target105SessionStateUnits = new Set([18159, 18160])
const target105KeybindingSelectionOwnerByIndex = new Map([
  [7539, 'src/keybindings/defaultBindings.ts'],
  [7552, 'src/keybindings/schema.ts'],
  [18335, 'src/components/ScrollKeybindingHandler.tsx'],
])
const target105KeybindingSelectionUnits = new Set(
  target105KeybindingSelectionOwnerByIndex.keys(),
)
const target105FeedbackPayloadUnits = new Set([13735, 13740])
const target105BackgroundWorkOwnerByIndex = new Map([
  [15903, 'src/components/BackgroundWorkExitDialog.tsx'],
  [15904, 'src/components/BackgroundWorkExitDialog.tsx'],
  [15914, 'src/components/ExitFlow.tsx'],
  [15918, 'src/commands/exit/exit.tsx'],
  [15924, 'src/commands/exit/exit.tsx'],
  [18386, 'src/screens/REPL.tsx'],
])
const target105BackgroundWorkUnits = new Set(
  target105BackgroundWorkOwnerByIndex.keys(),
)
const target105RequestTooLargeUnits = new Set([13377, 13389, 13391])
const target105UltrareviewOwnerByIndex = new Map([
  [15146, 'src/services/api/ultrareviewQuota.ts'],
  [15148, 'src/services/api/ultrareviewQuota.ts'],
  [15150, 'src/commands/review/reviewRemote.ts'],
  [15151, 'src/commands/review/reviewRemote.ts'],
  [15154, 'src/commands/review/UltrareviewOverageDialog.tsx'],
  [15161, 'src/commands/review/ultrareviewCommand.tsx'],
])
const target105UltrareviewUnits = new Set(
  target105UltrareviewOwnerByIndex.keys(),
)
const target105HookRegistryUnits = new Set([16515, 16517, 16521, 16525])
const target105UpstreamRelayDrainUnits = new Set([16847])
const target105AwaySummaryConfigOwnerByIndex = new Map([
  [2596, 'src/utils/settings/types.ts'],
  [8749, 'src/utils/awaySummaryEnabled.ts'],
  [8823, 'src/state/AppStateStore.ts'],
  [13489, 'src/utils/settings/applySettingsChange.ts'],
  [13956, 'src/components/Settings/Config.tsx'],
  [18109, 'src/hooks/useAwaySummary.ts'],
  [18386, 'src/screens/REPL.tsx'],
  [19107, 'src/main.tsx'],
])
const target105AwaySummaryConfigUnits = new Set(
  target105AwaySummaryConfigOwnerByIndex.keys(),
)
const target105MemorySurveyUnits = new Set([18062, 18063, 18064, 18065, 18067])
const target105StripPromptXmlUnits = new Set([13313])
const target105FilesystemPermissionUnits = new Set([
  16362, 16370, 16371, 16372, 16387, 16389, 16390,
])
const target105WorkerRawCommandOwnerByIndex = new Map([
  [16975, 'src/cli/transports/ccrClient.ts'],
  [18167, 'src/cli/structuredIO.ts'],
])
const target105WorkerRawCommandUnits = new Set(
  target105WorkerRawCommandOwnerByIndex.keys(),
)
const target105ToolSearchMcpTelemetryUnits = new Set([7108])
const target105ConfigTrustReasonUnits = new Set([5022, 5032, 5055])
const target105RepoCheckoutUnits = new Set([
  5117, 5118, 5119, 5120, 5121, 5122, 5123, 5124, 11456,
])
const target105SkillsMenuUnits = new Set([
  15178, 15179, 15180, 15181, 15184, 15187,
])
const target105RequestSizeLimitOwnerByIndex = new Map([
  [6800, 'src/constants/apiLimits.ts'],
  [13383, 'src/services/api/errors.ts'],
])
const target105RequestSizeLimitUnits = new Set(
  target105RequestSizeLimitOwnerByIndex.keys(),
)
const target105DatadogAllowlistUnits = new Set([5073])
const target105FileReadMitigationUnits = new Set([12916, 12923])
const target105SessionStatePropagationOwnerByIndex = new Map([
  [16891, 'src/state/onChangeAppState.ts'],
  [18168, 'src/cli/structuredIO.ts'],
  [18920, 'src/cli/remoteIO.ts'],
  [18934, 'src/QueryEngine.ts'],
  [18935, 'src/QueryEngine.ts'],
  [18966, 'src/cli/print.ts'],
  [18967, 'src/cli/print.ts'],
  [18979, 'src/cli/print.ts'],
  [19107, 'src/main.tsx'],
])
const target105SessionStatePropagationUnits = new Set(
  target105SessionStatePropagationOwnerByIndex.keys(),
)
const target107ThinkingAgentUnits = new Set([
  9197, 9198, 9203, 16605, 16607, 16622, 16636, 17923, 17925, 18391,
])
function existsAt(commit, filename) {
  const key = `${commit}\0${filename}`
  if (historicalExistence.has(key)) return historicalExistence.get(key)
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}:${filename}`], { cwd: root })
    historicalExistence.set(key, true)
    return true
  } catch {
    historicalExistence.set(key, false)
    return false
  }
}
function fallbackOwner(caseName, targetIndex, snippet) {
  if (caseName === '2.1.96-to-2.1.97') {
    if (target97BridgeGitContextUnits.has(targetIndex)) {
      return target97BridgeGitContextOwnerByIndex.get(targetIndex)
    }
    if (target97SessionWriterUnits.has(targetIndex)) {
      return target97SessionWriterOwnerByIndex.get(targetIndex)
    }
    if (target97LoopChainStateUnits.has(targetIndex)) {
      return 'src/bootstrap/state.ts'
    }
    if (target97AgentReplToolPoolUnits.has(targetIndex)) {
      return target97AgentReplToolPoolOwnerByIndex.get(targetIndex)
    }
    if (target97SettingsViewModeUnits.has(targetIndex)) {
      return 'src/utils/settings/types.ts'
    }
    if (target97ImageTokenCompressionUnits.has(targetIndex)) {
      return 'src/utils/imageResizer.ts'
    }
    if (target97McpResultSizeUnits.has(targetIndex)) {
      return 'src/services/mcp/client.ts'
    }
    if (targetIndex === 2500) return 'src/entrypoints/sandboxTypes.ts'
    if ([6207, 6227].includes(targetIndex)) {
      return 'src/utils/sandbox/sandbox-adapter.ts'
    }
    if (targetIndex === 13953) {
      return 'src/components/memory/MemoryFileSelector.tsx'
    }
    if (targetIndex === 15662) return 'src/bridge/envLessBridgeConfig.ts'
    if (target97AutoModeDenialUnits.has(targetIndex)) {
      return target97AutoModeDenialOwnerByIndex.get(targetIndex)
    }
    if (target97NotificationLifecycleUnits.has(targetIndex)) {
      return 'src/context/notifications.tsx'
    }
    if (target97NotificationReachabilityUnits.has(targetIndex)) {
      return 'src/components/App.tsx'
    }
    if (targetIndex === 3236) return 'src/utils/model/model.ts'
    if (targetIndex === 5501) return 'src/ink/termio/osc.ts'
    if (targetIndex === 6270) return 'src/utils/effort.ts'
    if ([6281, 6283].includes(targetIndex)) return 'src/utils/effort.ts'
    if (targetIndex === 6743) return 'src/memdir/tinyMemoryStamps.ts'
    if (targetIndex === 6868) return 'src/utils/claudemd.ts'
    if (targetIndex === 7067) return 'src/utils/imageResizer.ts'
    if (targetIndex === 12324) return 'src/memdir/memoryTypes.ts'
    if (targetIndex === 12376) return 'src/services/autoDream/autoDream.ts'
    if (targetIndex === 12466) return 'src/services/compact/compact.ts'
    if (target97CompactTruncationUnits.has(targetIndex)) {
      return 'src/services/compact/compact.ts'
    }
    if (targetIndex === 12559) return 'src/services/vcr.ts'
    if ([12817, 12832].includes(targetIndex)) {
      return 'src/utils/plugins/marketplaceManager.ts'
    }
    if (targetIndex === 8113) return 'src/components/shell/OutputLine.tsx'
    if (targetIndex === 7711) return 'src/utils/permissions/shellRuleMatching.ts'
    if ([7804, 7805, 7811].includes(targetIndex)) return 'src/tools/BashTool/pathValidation.ts'
    if ([7822, 7823, 7824].includes(targetIndex)) {
      return 'src/tools/BashTool/readOnlyValidation.ts'
    }
    if (targetIndex === 9273) return 'src/skills/loadSkillsDir.ts'
    if (targetIndex === 16103) return 'src/utils/hooks.ts'
    if (targetIndex === 16179) return 'src/utils/worktree.ts'
    if (targetIndex === 16219) return 'src/constants/prompts.ts'
    if (targetIndex === 14765) return 'src/components/LogSelector.tsx'
    if (targetIndex === 18082) return 'src/screens/ResumeConversation.tsx'
    if (targetIndex === 16636) return 'src/hooks/useReplBridge.tsx'
    if (targetIndex === 15801) return 'src/commands.ts'
    if (targetIndex === 17469) return 'src/utils/processUserInput/processUserInput.ts'
    if ([9664, 9665, 9666, 9667].includes(targetIndex)) return 'src/components/Messages.tsx'
    if (targetIndex === 11466) return 'src/components/messages/CollapsedReadSearchContent.tsx'
    if (targetIndex === 17271) return 'src/components/PromptInput/PromptInputFooter.tsx'
    if (target97MarkdownBlockquoteUnits.has(targetIndex)) {
      return 'src/components/Markdown.tsx'
    }
    if (target97UnifiedInstalledAuthUnits.has(targetIndex)) {
      return 'src/commands/plugin/UnifiedInstalledCell.tsx'
    }
    if (targetIndex === 3205) return 'src/utils/modelCost.ts'
    if ([17919, 17921].includes(targetIndex)) {
      return 'src/services/api/bootstrap.ts'
    }
    if (targetIndex === 17012) return 'src/components/PromptInput/Notifications.tsx'
    if (targetIndex === 11755) return 'src/tools/AgentTool/prompt.ts'
    if (targetIndex === 16848) {
      return 'src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx'
    }
    if (targetIndex === 16911) {
      return 'src/components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx'
    }
    if (targetIndex === 9085) return 'src/tools/shared/gitOperationTracking.ts'
    if (targetIndex === 10014) return 'src/utils/model/agent.ts'
    if ([10069, 10081, 11589].includes(targetIndex)) {
      return 'src/tools/AgentTool/runAgent.ts'
    }
    if (targetIndex === 11042) return 'src/utils/swarm/inProcessRunner.ts'
    if ([11313, 11314].includes(targetIndex)) {
      return 'src/components/messages/RateLimitMessage.tsx'
    }
    if (targetIndex === 11761) return 'src/tools/AgentTool/AgentTool.tsx'
    if (targetIndex === 12231) return 'src/tools/AgentTool/resumeAgent.ts'
    if (targetIndex === 9738) return 'src/services/teamMemorySync/types.ts'
    if ([9742, 9750, 9753, 9754, 9756, 9758, 9759, 9760].includes(targetIndex)) {
      return 'src/services/teamMemorySync/index.ts'
    }
    if (targetIndex === 9773) return 'src/services/teamMemorySync/watcher.ts'
    if ([9903, 9905, 9914, 9919].includes(targetIndex)) {
      return 'src/tools/BashTool/bashPermissions.ts'
    }
    if ([12692, 12693, 12694].includes(targetIndex)) {
      return 'src/utils/attachments.ts'
    }
    if ([17041, 17052].includes(targetIndex)) {
      return 'src/utils/suggestions/commandSuggestions.ts'
    }
    if (targetIndex === 17088) return 'src/hooks/useTypeahead.tsx'
    if ([17259, 17261].includes(targetIndex)) return 'src/utils/ghPrStatus.ts'
    if (targetIndex === 18148) return 'src/skills/bundled/verify/SKILL.md'
    if ([18157, 18158, 18159, 18160, 18161, 18162].includes(targetIndex)) {
      return 'src/skills/bundled/dream.ts'
    }
    if (targetIndex === 13086) return 'src/utils/bash/commands.ts'
    if ([13527, 13530].includes(targetIndex)) {
      return 'src/commands/compact/compact.ts'
    }
    if (targetIndex === 14740) return 'src/components/VirtualMessageList.tsx'
    if (targetIndex === 14283) return 'src/services/plugins/pluginOperations.ts'
    if (targetIndex === 15622) {
      return 'src/commands/rate-limit-options/rate-limit-options.tsx'
    }
    if ([15215, 15945].includes(targetIndex)) {
      return 'src/commands/branch/branch.ts'
    }
    if ([15969, 15985, 16012].includes(targetIndex)) {
      return 'src/utils/permissions/filesystem.ts'
    }
    if (target97RecursiveSafetyCheckUnits.has(targetIndex)) {
      return 'src/utils/permissions/permissions.ts'
    }
    if ([16062, 16063, 16064, 16065, 16066].includes(targetIndex)) {
      return 'src/utils/hooks/execPromptHook.ts'
    }
    if (targetIndex === 10954) return 'src/entrypoints/sdk/coreSchemas.ts'
    if ([15846, 15847, 15851].includes(targetIndex)) return 'src/utils/sessionStorage.ts'
    if (targetIndex === 17347) return 'src/server/directConnectManager.ts'
    if (targetIndex === 18387) return 'src/cli/remoteIO.ts'
    if ([18428, 18429].includes(targetIndex)) return 'src/cli/print.ts'
    if (targetIndex === 18556) return 'src/main.tsx'
    if (target97AppleScriptQuoteUnits.has(targetIndex)) {
      return 'src/utils/deepLink/terminalLauncher.ts'
    }
    if (targetIndex === 17946) return 'src/utils/fpsTracker.ts'
    if (targetIndex === 17912) return 'src/screens/REPL.tsx'
    if (targetIndex === 17675) return 'src/services/tips/tipRegistry.ts'
    if (targetIndex === 17892) return 'src/utils/cronScheduler.ts'
    if (targetIndex === 17544) return 'src/hooks/useInboxPoller.ts'
    if ([12511, 12523].includes(targetIndex)) return 'src/utils/analyzeContext.ts'
    if (targetIndex === 13808) {
      return 'src/commands/context/context-noninteractive.ts'
    }
    if ([16215, 16216, 16217].includes(targetIndex)) {
      return 'src/constants/prompts.ts'
    }
    if (targetIndex === 16241) return 'src/utils/api.ts'
    if (targetIndex === 17681) return 'src/entrypoints/sdk/controlSchemas.ts'
    if (targetIndex === 18392) return 'src/utils/queryContext.ts'
    if ([18393, 18396, 18397].includes(targetIndex)) return 'src/QueryEngine.ts'
    if ([18429, 18432].includes(targetIndex)) return 'src/cli/print.ts'
    const managedAgentOwners = new Map([
      [18186, 'src/skills/bundled/claude-api/curl/managed-agents.md'],
      [18204, 'src/skills/bundled/claude-api/python/managed-agents/README.md'],
      [18208, 'src/skills/bundled/claude-api/SKILL.md'],
      [18214, 'src/skills/bundled/claude-api/shared/live-sources.md'],
      [18216, 'src/skills/bundled/claude-api/shared/managed-agents-api-reference.md'],
      [18218, 'src/skills/bundled/claude-api/shared/managed-agents-client-patterns.md'],
      [18220, 'src/skills/bundled/claude-api/shared/managed-agents-core.md'],
      [18222, 'src/skills/bundled/claude-api/shared/managed-agents-environments.md'],
      [18224, 'src/skills/bundled/claude-api/shared/managed-agents-events.md'],
      [18226, 'src/skills/bundled/claude-api/shared/managed-agents-onboarding.md'],
      [18228, 'src/skills/bundled/claude-api/shared/managed-agents-overview.md'],
      [18230, 'src/skills/bundled/claude-api/shared/managed-agents-tools.md'],
      [18248, 'src/skills/bundled/claude-api/typescript/managed-agents/README.md'],
      [18253, 'src/skills/bundled/claudeApiContent.ts'],
    ])
    if (managedAgentOwners.has(targetIndex)) return managedAgentOwners.get(targetIndex)
  }
  if (caseName === '2.1.97-to-2.1.98') {
    if (target98TypeaheadMetadataUnits.has(targetIndex)) {
      return 'src/hooks/useTypeahead.tsx'
    }
    if (target98DynamicImageOwnerByIndex.has(targetIndex)) {
      return target98DynamicImageOwnerByIndex.get(targetIndex)
    }
    if ([5889, 5890, 5892, 5893].includes(targetIndex)) return 'src/utils/subprocessEnv.ts'
    if (targetIndex === 13259) return 'src/entrypoints/init.ts'
    if (targetIndex === 9104 || targetIndex === 9105 || (targetIndex >= 12303 && targetIndex <= 12320)) return 'src/tools/MonitorTool/MonitorTool.ts'
    if (targetIndex >= 17068 && targetIndex <= 17077) return 'src/components/permissions/MonitorPermissionRequest/MonitorPermissionRequest.tsx'
    if (targetIndex >= 11280 && targetIndex <= 11329) return 'src/components/VertexSetupWizard.tsx'
    if (targetIndex === 18734) return 'src/main.tsx'
    if (/excludeDynamicSystemPromptSections|dynamic system prompt|SYSTEM_PROMPT_DYNAMIC_BOUNDARY|excludedDynamic/.test(snippet)) return 'src/constants/prompts.ts'
    if (targetIndex === 12483) {
      return 'src/services/autoDream/consolidationPrompt.ts'
    }
    if (target98AdvisorUnits.has(targetIndex)) return 'src/utils/advisor.ts'
    if (target98VertexRegionUnits.has(targetIndex)) return 'src/utils/envUtils.ts'
    if (target98RemoteSlugUnits.has(targetIndex)) return 'src/utils/git.ts'
    if (targetIndex === 11698) return 'src/utils/background/remote/preconditions.ts'
    if (targetIndex === 11704) return 'src/utils/background/remote/remoteSession.ts'
    if (targetIndex === 11792) return 'src/utils/teleport.tsx'
    if (target98LogFilterUnits.has(targetIndex)) return 'src/components/LogSelector.tsx'
    if (target98StatusLineResultUnits.has(targetIndex)) return 'src/components/StatusLine.tsx'
    if (target98PluginScopeFallbackUnits.has(targetIndex)) return 'src/services/plugins/pluginOperations.ts'
    if ([11334, 11336, 11337].includes(targetIndex)) {
      return 'src/commands/provider-setup/relaunch.ts'
    }
    if ([14912, 14913, 14915].includes(targetIndex)) {
      return 'src/commands/provider-setup/bedrock.tsx'
    }
    if ([14919, 14920, 14921, 14923].includes(targetIndex)) {
      return 'src/commands/provider-setup/vertex.tsx'
    }
    if (targetIndex === 14925) return 'src/commands/provider-setup/index.ts'
    if (targetIndex === 15952) return 'src/commands.ts'
    if (target98PrDetailsUnits.has(targetIndex)) return 'src/utils/ghPrStatus.ts'
    if (target98WebSetupEnvironmentUnits.has(targetIndex)) {
      return 'src/commands/remote-setup/api.ts'
    }
    if (target98ConsoleOAuthUnits.has(targetIndex)) {
      return 'src/components/ConsoleOAuthFlow.tsx'
    }
    if (target98BridgeLateResponseUnits.has(targetIndex)) {
      return 'src/hooks/useReplBridge.tsx'
    }
    if (target98EffortCapabilityUnits.has(targetIndex)) {
      return 'src/utils/effort.ts'
    }
    if (target98SessionsWebSocketUnits.has(targetIndex)) {
      return 'src/remote/SessionsWebSocket.ts'
    }
    if (target98StopHookFocusUnits.has(targetIndex)) {
      return 'src/commands/stop-hook/StopHookDialog.tsx'
    }
    if ([13516, 13518].includes(targetIndex)) {
      return 'src/utils/wrappedContentSerializer.ts'
    }
    if ([13522, 13527, 13528, 13529].includes(targetIndex)) {
      return 'src/components/Feedback.tsx'
    }
    if (targetIndex === 17751) {
      return 'src/components/FeedbackSurvey/submitTranscriptShare.ts'
    }
    if ([18206, 18207].includes(targetIndex)) {
      return 'src/utils/model/bedrockModelUpgrade.tsx'
    }
    if ([18213, 18214].includes(targetIndex)) {
      return 'src/components/ThirdPartyModelUpgradeDialog.tsx'
    }
    if (
      [18218, 18219, 18220, 18221, 18222, 18223, 18224, 18225, 18227].includes(
        targetIndex,
      )
    ) {
      return 'src/utils/model/vertexModelUpgrade.ts'
    }
    if ([18235, 18236, 18240, 18241].includes(targetIndex)) {
      return 'src/interactiveHelpers.tsx'
    }
    if (targetIndex === 17728) {
      return 'src/components/ultraplan/UltraplanLaunchDialog.tsx'
    }
    if (targetIndex === 18079) return 'src/screens/REPL.tsx'
    if (targetIndex === 7824) return 'src/state/AppStateStore.ts'
    if ([8754, 8756, 8773].includes(targetIndex)) return 'src/services/mcp/client.ts'
    if (targetIndex === 13580) return 'src/commands/clear/conversation.ts'
    if (targetIndex === 14286) return 'src/services/mcp/useManageMCPConnections.ts'
    if (targetIndex >= 17223 && targetIndex <= 17235) return 'src/hooks/unifiedSuggestions.ts'
    if (targetIndex === 17250) return 'src/hooks/useTypeahead.tsx'
    if (targetIndex === 11855) return 'src/tools/AgentTool/AgentTool.tsx'
    if (targetIndex === 15419 || (targetIndex >= 15481 && targetIndex <= 15492)) {
      return 'src/components/agents/RunningAgents.tsx'
    }
    if (targetIndex === 15493) return 'src/components/agents/AgentsRuntimeMenu.tsx'
    if (targetIndex === 15501) return 'src/components/agents/AgentsMenu.tsx'
    if ([18337, 18338, 18339, 18340].includes(targetIndex)) {
      return 'src/skills/bundled/dream.ts'
    }
  }
  if (caseName === '2.1.98-to-2.1.100') {
    if (target100SpinnerUnits.has(targetIndex)) {
      return 'src/components/Spinner/SpinnerAnimationRow.tsx'
    }
    if (targetIndex >= 16343 && targetIndex <= 16360) return 'src/constants/prompts.ts'
  }
  if (caseName === '2.1.100-to-2.1.101') {
    if (target101ClaudeApiTriggerUnits.has(targetIndex)) {
      return 'src/skills/bundled/claudeApi.ts'
    }
    if (target101StartupRuntimeUnits.has(targetIndex)) {
      return targetIndex === 18235 ? 'src/utils/warningHandler.ts' : 'src/main.tsx'
    }
    if (target101SingleDigitSelectUnits.has(targetIndex)) {
      return targetIndex === 8761
        ? 'src/components/CustomSelect/use-select-input.ts'
        : 'src/components/CustomSelect/use-multi-select-state.ts'
    }
    if (target101BetaTracingPrivacyUnits.has(targetIndex)) {
      if (targetIndex === 10322) return 'src/utils/managedEnvConstants.ts'
      if (targetIndex === 12487) return 'src/services/tools/toolExecution.ts'
      return 'src/utils/telemetry/betaSessionTracing.ts'
    }
    if (target101RemoteIoWriteTrackingUnits.has(targetIndex)) {
      return 'src/cli/remoteIO.ts'
    }
    if (target101ChromeOnboardingFocusUnits.has(targetIndex)) {
      return 'src/components/ClaudeInChromeOnboarding.tsx'
    }
    if (target101CommandAgentBootstrapUnits.has(targetIndex)) {
      return 'src/main.tsx'
    }
    if (target101CommandDisplaySearchUnits.has(targetIndex)) {
      return 'src/utils/suggestions/commandSuggestions.ts'
    }
    if (target101SessionEnvUnits.has(targetIndex)) {
      if (targetIndex === 9058) return 'src/utils/shell/bashProvider.ts'
      if (targetIndex === 9146) return 'src/utils/Shell.ts'
      if ([9390, 9392].includes(targetIndex)) {
        return 'src/tools/PowerShellTool/PowerShellTool.tsx'
      }
      if ([10005, 10007].includes(targetIndex)) {
        return 'src/tools/BashTool/BashTool.tsx'
      }
      if (targetIndex === 12393) return 'src/tools/MonitorTool/MonitorTool.ts'
      if (targetIndex === 12611) return 'src/utils/forkedAgent.ts'
      if (targetIndex === 13666) return 'src/commands/clear/conversation.ts'
      if (targetIndex === 17321) return 'src/utils/bash/shellCompletion.ts'
      if (targetIndex === 17385) return 'src/hooks/useTypeahead.tsx'
      if (targetIndex === 17611) return 'src/components/PromptInput/PromptInput.tsx'
      if (targetIndex === 17858) {
        return 'src/components/ultraplan/UltraplanChoiceDialog.tsx'
      }
      if (targetIndex === 18222) return 'src/screens/REPL.tsx'
      if ([18735, 18736].includes(targetIndex)) return 'src/QueryEngine.ts'
      return 'src/cli/print.ts'
    }
    if (target101SuggestionPaddingUnits.has(targetIndex)) {
      return 'src/components/PromptInput/PromptInputFooterSuggestions.tsx'
    }
    if (target101OAuthUrlOutdentUnits.has(targetIndex)) {
      return targetIndex === 11411
        ? 'src/components/ConsoleOAuthFlow.tsx'
        : 'src/commands/login/login.tsx'
    }
    if (target101ContextUnattributedUnits.has(targetIndex)) {
      return 'src/utils/analyzeContext.ts'
    }
    if (target101ApiErrorRateLimitUnits.has(targetIndex)) {
      return 'src/components/messages/SystemAPIErrorMessage.tsx'
    }
    if (target101StoredImageStateUnits.has(targetIndex)) {
      if (targetIndex === 8740) return 'src/components/ClickableImageRef.tsx'
      if ([8761, 8773].includes(targetIndex)) {
        return 'src/components/CustomSelect/select.tsx'
      }
      if (targetIndex === 11593) {
        return 'src/components/messages/UserImageMessage.tsx'
      }
      if (targetIndex === 13661) return 'src/commands/clear/caches.ts'
      return 'src/utils/imageStore.ts'
    }
    if (target101RemoteSettingsValidationUnits.has(targetIndex)) {
      return 'src/services/remoteManagedSettings/index.ts'
    }
    if (target101CompactHookStateUnits.has(targetIndex)) {
      if ([12639, 12640, 12643].includes(targetIndex)) {
        return 'src/services/compact/compact.ts'
      }
      if (targetIndex === 13731) return 'src/commands/compact/compact.ts'
      if (targetIndex === 16323) return 'src/utils/hooks/execPromptHook.ts'
      if (targetIndex === 16330) return 'src/utils/hooks/execAgentHook.ts'
      if ([16356, 16364].includes(targetIndex)) return 'src/utils/hooks.ts'
      if (targetIndex === 17770) return 'src/utils/handlePromptSubmit.ts'
      return 'src/QueryEngine.ts'
    }
    if (target101BashNewlineSandboxUnits.has(targetIndex)) {
      return targetIndex === 7829
        ? 'src/utils/bash/ast.ts'
        : 'src/tools/BashTool/bashPermissions.ts'
    }
    if (target101McpInitHandshakeUnits.has(targetIndex)) {
      return targetIndex === 18797
        ? 'src/entrypoints/mcp.ts'
        : 'src/services/mcp/headlessConnectionManager.ts'
    }
    if (target101ComputerUseStateUnits.has(targetIndex)) {
      if (targetIndex === 7352) return 'src/utils/computerUse/cleanup.ts'
      if (targetIndex === 8814) return 'src/utils/computerUse/wrapper.tsx'
      if (targetIndex === 12611) return 'src/utils/forkedAgent.ts'
      return 'src/screens/REPL.tsx'
    }
    if (target101RemoteTriggerRunUnits.has(targetIndex)) {
      return targetIndex === 12369
        ? 'src/tools/RemoteTriggerTool/prompt.ts'
        : 'src/tools/RemoteTriggerTool/RemoteTriggerTool.ts'
    }
    if (target101ScheduleRemoteGateUnits.has(targetIndex)) {
      return 'src/skills/bundled/scheduleRemoteAgents.ts'
    }
    if (target101ToolProgressOverlayUnits.has(targetIndex)) {
      if ([9390, 9392].includes(targetIndex)) {
        return 'src/tools/PowerShellTool/PowerShellTool.tsx'
      }
      if ([10005, 10007].includes(targetIndex)) {
        return 'src/tools/BashTool/BashTool.tsx'
      }
      if (targetIndex === 11924) return 'src/tools/AgentTool/AgentTool.tsx'
      if ([17813, 17815].includes(targetIndex)) {
        return 'src/components/ToolProgressOverlay.tsx'
      }
      return 'src/screens/REPL.tsx'
    }
    if (target101SdkTelemetryTaskUnits.has(targetIndex)) {
      if (targetIndex === 5075) return 'src/services/analytics/datadog.ts'
      if (targetIndex === 8039) return 'src/utils/sdkEventQueue.ts'
      if (targetIndex === 11058) return 'src/utils/task/framework.ts'
      if (targetIndex === 17639) return 'src/entrypoints/sdk/coreSchemas.ts'
      if (targetIndex === 18007) return 'src/cli/structuredIO.ts'
      if (targetIndex === 18735) return 'src/QueryEngine.ts'
      if (targetIndex === 18767 || targetIndex === 18768) return 'src/cli/print.ts'
    }
    if (target101PluginRuntimeUnits.has(targetIndex)) {
      if ([6052, 6073, 6075].includes(targetIndex)) {
        return 'src/utils/plugins/dependencyResolver.ts'
      }
      if ([13098, 13102, 13105, 13110, 13111, 13112].includes(targetIndex)) {
        return 'src/utils/plugins/pluginLoader.ts'
      }
      if (targetIndex === 14443) return 'src/commands/plugin/PluginOptionsDialog.tsx'
      if (targetIndex === 14467) return 'src/commands/plugin/DiscoverPlugins.tsx'
      if (targetIndex === 14469) return 'src/utils/plugins/marketplaceHelpers.ts'
      if (targetIndex === 14487 || targetIndex === 14488) {
        return 'src/services/plugins/pluginOperations.ts'
      }
      if (targetIndex === 14517 || targetIndex === 14518) {
        return 'src/commands/plugin/PluginErrors.tsx'
      }
      if (targetIndex === 14530) return 'src/commands/plugin/ManagePlugins.tsx'
      if (targetIndex === 14541 || targetIndex === 14546) {
        return 'src/utils/plugins/validatePlugin.ts'
      }
    }
    if (target101WorktreeRecoveryUnits.has(targetIndex)) {
      return 'src/utils/worktree.ts'
    }
    if (target101LoopsCommandUnits.has(targetIndex)) {
      return targetIndex === 15433
        ? 'src/commands/loops/index.ts'
        : 'src/commands/loops/loops.tsx'
    }
    if (target101PrintResumeTitleUnits.has(targetIndex)) {
      return 'src/cli/print.ts'
    }
    if (target101SafetyUiUnits.has(targetIndex)) {
      if ([14121, 14123, 14139, 14146].includes(targetIndex)) {
        return 'src/screens/Doctor.tsx'
      }
      if (targetIndex === 14263) {
        return 'src/commands/keybindings/keybindings.ts'
      }
      if (targetIndex === 14388) {
        return 'src/components/mcp/utils/reconnectHelpers.tsx'
      }
      if (targetIndex === 14390) {
        return 'src/components/mcp/MCPRemoteServerMenu.tsx'
      }
      return 'src/utils/binaryCheck.ts'
    }
    if (target101StateOperationUnits.has(targetIndex)) {
      if (targetIndex === 7933) return 'src/utils/commitAttribution.ts'
      if ([9465, 9468, 9469, 9470].includes(targetIndex)) {
        return 'src/utils/fileHistory.ts'
      }
      if (targetIndex === 9678) return 'src/tools/FileEditTool/FileEditTool.ts'
      if (targetIndex === 9696) return 'src/tools/FileWriteTool/FileWriteTool.ts'
      if (targetIndex === 9755) {
        return 'src/tools/NotebookEditTool/NotebookEditTool.ts'
      }
      if (targetIndex === 10003) return 'src/tools/BashTool/BashTool.tsx'
      if (targetIndex === 12611) return 'src/utils/forkedAgent.ts'
      if (targetIndex === 14977) return 'src/utils/agenticSessionSearch.ts'
      if ([16380, 16415].includes(targetIndex)) return 'src/utils/hooks.ts'
      if (targetIndex === 18222) return 'src/screens/REPL.tsx'
      if (targetIndex === 18732) return 'src/utils/queryContext.ts'
      if (targetIndex === 18735) return 'src/QueryEngine.ts'
      if (targetIndex === 18799) return 'src/entrypoints/mcp.ts'
    }
    if (target101RemoteIngressUnits.has(targetIndex)) {
      if (targetIndex === 11760) return 'src/utils/teleport/environments.ts'
      if (targetIndex === 11785) return 'src/services/api/sessionIngress.ts'
      if (targetIndex === 11861) return 'src/utils/teleport.tsx'
      if (targetIndex === 16902) return 'src/hooks/useReplBridge.tsx'
    }
    if (target101AwaySummaryUnits.has(targetIndex)) {
      return targetIndex <= 17945
        ? 'src/services/awaySummary.ts'
        : 'src/hooks/useAwaySummary.ts'
    }
    if (target101InvalidSettingsUnits.has(targetIndex)) {
      return 'src/components/InvalidSettingsDialog.tsx'
    }
    if (target101FrameHtmlPermissionUnits.has(targetIndex)) {
      return 'src/utils/permissions/filesystem.ts'
    }
    if (target101OpenFrameKeybindingUnits.has(targetIndex)) {
      return 'src/keybindings/schema.ts'
    }
    if (target101ClientPresenceUnits.has(targetIndex)) {
      return 'src/bridge/clientPresence.ts'
    }
    if (target101HomebrewVersionUnits.has(targetIndex)) {
      if (targetIndex === 17267) {
        return 'src/components/PackageManagerAutoUpdater.tsx'
      }
      if (targetIndex === 18876) return 'src/cli/update.ts'
      return 'src/utils/autoUpdater.ts'
    }
    if (target101ManagedHookLoadingUnits.has(targetIndex)) {
      return 'src/utils/sessionStart.ts'
    }
    if (target101WorktreeResumeHintUnits.has(targetIndex)) {
      return targetIndex === 10255
        ? 'src/utils/gracefulShutdown.ts'
        : 'src/utils/worktree.ts'
    }
    if (target101CcrSourceViabilityUnits.has(targetIndex)) {
      if (targetIndex === 15080) {
        return 'src/utils/background/remote/remoteSession.ts'
      }
      if ([15108, 15111, 15114, 15115, 15116].includes(targetIndex)) {
        return 'src/commands/ultraplan.tsx'
      }
      if ([17866, 17867, 17874].includes(targetIndex)) {
        return 'src/components/ultraplan/UltraplanLaunchDialog.tsx'
      }
      return 'src/screens/REPL.tsx'
    }
    if (target101InsightsResponseUnits.has(targetIndex)) {
      return 'src/commands/insights.ts'
    }
    if (target101TrustedDeviceRetryUnits.has(targetIndex)) {
      return targetIndex === 10239
        ? 'src/bridge/trustedDevice.ts'
        : 'src/bridge/remoteBridgeCore.ts'
    }
    if (target101BridgeWorktreePreservationUnits.has(targetIndex)) {
      return 'src/bridge/bridgeMain.ts'
    }
    if (target101AgentTaskNotificationUnits.has(targetIndex)) {
      if (targetIndex === 11749) return 'src/tools/AgentTool/runAgent.ts'
      if (targetIndex === 12104) {
        return 'src/tools/TaskOutputTool/TaskOutputTool.tsx'
      }
      return 'src/utils/messages.ts'
    }
    if (target101AgentBackgroundGuidanceUnits.has(targetIndex)) {
      return targetIndex === 11919
        ? 'src/tools/AgentTool/prompt.ts'
        : 'src/tools/AgentTool/AgentTool.tsx'
    }
    if (target101ToolSearchMcpNameUnits.has(targetIndex)) {
      return 'src/tools/ToolSearchTool/ToolSearchTool.ts'
    }
    if (target101TeamMemoryAvailabilityUnits.has(targetIndex)) {
      if ([361, 467, 468, 479, 480].includes(targetIndex)) {
        return 'src/bootstrap/state.ts'
      }
      if (targetIndex === 6793 || targetIndex === 6799) {
        return 'src/memdir/teamMemPaths.ts'
      }
      if (targetIndex === 18767) return 'src/cli/print.ts'
      return 'src/services/teamMemorySync/index.ts'
    }
    if (target101MainInputNormalizationUnits.has(targetIndex)) {
      return 'src/main.tsx'
    }
    if (target101KeybindingLoaderUnits.has(targetIndex)) {
      return 'src/keybindings/loadUserBindings.ts'
    }
    if (target101AgentMetadataMirrorUnits.has(targetIndex)) {
      return 'src/utils/sessionStorage.ts'
    }
    if (target101BackgroundSessionPromptUnits.has(targetIndex)) {
      return 'src/constants/prompts.ts'
    }
    if (target101UpdateCommandUnits.has(targetIndex)) {
      if (targetIndex === 15828) return 'src/commands/update/index.ts'
      if (targetIndex === 16067) return 'src/commands.ts'
      return 'src/commands/update/update.ts'
    }
    if (target101MessageRatingHoverUnits.has(targetIndex)) {
      return 'src/components/messageRating.tsx'
    }
    if (target101KillRingContextUnits.has(targetIndex)) {
      if ([13446, 13447].includes(targetIndex)) return 'src/utils/Cursor.ts'
      if ([13442, 13448, 13449, 13451].includes(targetIndex)) {
        return 'src/context/killRing.tsx'
      }
      if (targetIndex === 13498) return 'src/hooks/useTextInput.ts'
      if (targetIndex === 13838) return 'src/hooks/useSearchInput.ts'
      return 'src/components/App.tsx'
    }
    if (target101TeamCreateExclusiveUnits.has(targetIndex)) {
      return targetIndex === 11242
        ? 'src/utils/swarm/teamHelpers.ts'
        : 'src/tools/TeamCreateTool/TeamCreateTool.ts'
    }
    if (target101FileSuggestionStateUnits.has(targetIndex)) {
      return 'src/hooks/fileSuggestions.ts'
    }
    if (target101ClassifierApprovalUnits.has(targetIndex)) {
      if (targetIndex === 7939) return 'src/state/AppStateStore.ts'
      if (targetIndex === 11488) return 'src/utils/classifierApprovalsHook.ts'
      if (targetIndex >= 11668 && targetIndex <= 11673) {
        return 'src/utils/classifierApprovals.ts'
      }
      if (targetIndex === 11674) {
        return 'src/components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx'
      }
      if (targetIndex === 12672) {
        return 'src/services/compact/postCompactCleanup.ts'
      }
      if (targetIndex === 13329) return 'src/utils/permissions/permissions.ts'
      if (targetIndex === 17740) {
        return 'src/hooks/toolPermission/handlers/interactiveHandler.ts'
      }
      return 'src/hooks/useCanUseTool.tsx'
    }
    if (target101SdkOAuthControlUnits.has(targetIndex)) {
      if (targetIndex === 361 || targetIndex === 438) return 'src/bootstrap/state.ts'
      if (targetIndex === 4636) return 'src/utils/auth.ts'
      if (targetIndex === 4681) return 'src/utils/auth.ts'
      if (targetIndex === 17996) return 'src/entrypoints/sdk/controlSchemas.ts'
      if (targetIndex === 18007) return 'src/cli/structuredIO.ts'
      if (targetIndex === 18767) return 'src/cli/print.ts'
    }
    if (target101SettingsSanitizationUnits.has(targetIndex)) {
      if (targetIndex === 2548) return 'src/schemas/hooks.ts'
      if (targetIndex === 2574) return 'src/tools/BriefTool/prompt.ts'
      if (targetIndex === 2616) return 'src/utils/settings/validation.ts'
      if (targetIndex === 2656) return 'src/utils/settings/settings.ts'
    }
    if (target101InkEventUnits.has(targetIndex)) {
      if (targetIndex === 5271) return 'src/ink/events/input-event.ts'
      if (targetIndex === 5366) return 'src/ink/events/event-handlers.ts'
      if (targetIndex === 5370) return 'src/ink/events/dispatcher.ts'
      if (targetIndex === 5607) return 'src/ink/events/keyboard-event.ts'
      if (targetIndex === 5613) return 'src/ink/events/wheel-event.ts'
    }
    if (target101InkLifecycleUnits.has(targetIndex)) {
      return targetIndex === 5606
        ? 'src/ink/components/App.tsx'
        : 'src/ink/ink.tsx'
    }
    if (target101McpDirectoryRegistryUnits.has(targetIndex)) {
      return 'src/services/mcp/officialRegistry.ts'
    }
    if ([6825, 6826, 6827].includes(targetIndex)) {
      return 'src/tools/ScheduleWakeupTool/prompt.ts'
    }
    if ([12366, 12368].includes(targetIndex)) {
      return 'src/tools/ScheduleWakeupTool/ScheduleWakeupTool.ts'
    }
    if (targetIndex === 12443) return 'src/tools.ts'
    if (targetIndex === 6850 || targetIndex === 6854) {
      return 'src/utils/cronTasks.ts'
    }
    if (targetIndex === 6859) return 'src/utils/cronJitterConfig.ts'
    if (targetIndex >= 6861 && targetIndex <= 6864) {
      return 'src/utils/loopWakeup.ts'
    }
    if (targetIndex === 6873 || targetIndex === 6877) {
      return 'src/tools/ToolSearchTool/prompt.ts'
    }
    if (
      (targetIndex >= 12654 && targetIndex <= 12671) ||
      targetIndex === 12674
    ) return 'src/utils/loopSentinels.ts'
    if (targetIndex === 12672) {
      return 'src/services/compact/postCompactCleanup.ts'
    }
    if (targetIndex === 18202) return 'src/utils/cronScheduler.ts'
    if (targetIndex === 18208) return 'src/hooks/useScheduledTasks.ts'
    if (targetIndex >= 18497 && targetIndex <= 18501) {
      return 'src/skills/bundled/loop.ts'
    }
    if (targetIndex === 18768) return 'src/cli/print.ts'
    if ([8501, 8502, 8504].includes(targetIndex)) return 'src/tools/McpAuthTool/McpAuthTool.ts'
    if (targetIndex === 8883) return 'src/services/mcp/client.ts'
    if (targetIndex === 12479) return 'src/services/tools/toolExecution.ts'
    if (targetIndex === 12568) return 'src/query/stopHooks.ts'
    if (targetIndex === 13375) return 'src/utils/settings/changeDetector.ts'
    if (target101LogPreviewUnits.has(targetIndex)) return 'src/components/LogSelector.tsx'
    if (target101ResumeSelectorUnits.has(targetIndex)) {
      return targetIndex === 18410
        ? 'src/screens/ResumeConversation.tsx'
        : 'src/commands/resume/resume.tsx'
    }
  }
  if (caseName === '2.1.101-to-2.1.104' && targetIndex >= 16460 && targetIndex <= 16470) return 'src/constants/prompts.ts'
  if (caseName === '2.1.104-to-2.1.105') {
    if (target105SubprocessIsolationUnits.has(targetIndex)) {
      return 'src/utils/subprocessEnv.ts'
    }
    if (target105MessageRatingSurfaceUnits.has(targetIndex)) {
      return 'src/components/messageRating.tsx'
    }
    if (target105WorktreeResumeNameUnits.has(targetIndex)) {
      return 'src/utils/worktree.ts'
    }
    if (target105TypeaheadMetadataTransitiveUnits.has(targetIndex)) {
      return 'src/hooks/useTypeahead.tsx'
    }
    if (target105AwaySummaryPromptUnits.has(targetIndex)) {
      return 'src/services/awaySummary.ts'
    }
    if (target105FullscreenSuggestionNoPadUnits.has(targetIndex)) {
      return 'src/components/FullscreenLayout.tsx'
    }
    if (target105MessageDeferralUnits.has(targetIndex)) {
      return target105MessageDeferralOwnerByIndex.get(targetIndex)
    }
    if (target105InProcessTaskRegistryUnits.has(targetIndex)) {
      return 'src/utils/swarm/inProcessRunner.ts'
    }
    if (target105AccountLabelUnits.has(targetIndex)) {
      return 'src/utils/status.tsx'
    }
    if (target105SystemDiagnosticsHeadingUnits.has(targetIndex)) {
      return 'src/components/Settings/Status.tsx'
    }
    if (target105ModelDeprecationTenseUnits.has(targetIndex)) {
      return 'src/utils/model/deprecation.ts'
    }
    if (target105MemorySynthesisFactShapeUnits.has(targetIndex)) {
      return 'src/memdir/findRelevantMemories.ts'
    }
    if (target105TmuxSocketUnits.has(targetIndex)) {
      return target105TmuxSocketOwnerByIndex.get(targetIndex)
    }
    if (target105EnvHookStateUnits.has(targetIndex)) {
      return 'src/utils/hooks/fileChangedWatcher.ts'
    }
    if (target105SkillDynamicStateUnits.has(targetIndex)) {
      return target105SkillDynamicStateOwnerByIndex.get(targetIndex)
    }
    if (target105AuthRenderRootUnits.has(targetIndex)) {
      return targetIndex === 19107
        ? 'src/main.tsx'
        : 'src/cli/handlers/auth.ts'
    }
    if (target105AwaySummaryConfigUnits.has(targetIndex)) {
      return target105AwaySummaryConfigOwnerByIndex.get(targetIndex)
    }
    if (target105MemorySurveyUnits.has(targetIndex)) {
      return 'src/components/FeedbackSurvey/useMemorySurvey.tsx'
    }
    if (target105StripPromptXmlUnits.has(targetIndex)) {
      return 'src/utils/messages.ts'
    }
    if (target105FilesystemPermissionUnits.has(targetIndex)) {
      return 'src/utils/permissions/filesystem.ts'
    }
    if (target105WorkerRawCommandUnits.has(targetIndex)) {
      return target105WorkerRawCommandOwnerByIndex.get(targetIndex)
    }
    if (target105ToolSearchMcpTelemetryUnits.has(targetIndex)) {
      return 'src/tools/ToolSearchTool/ToolSearchTool.ts'
    }
    if (target105ConfigTrustReasonUnits.has(targetIndex)) {
      return 'src/utils/config.ts'
    }
    if (target105RepoCheckoutUnits.has(targetIndex)) {
      return targetIndex === 11456
        ? 'src/utils/gitDiff.ts'
        : 'src/utils/repoCheckouts.ts'
    }
    if (target105SkillsMenuUnits.has(targetIndex)) {
      return 'src/components/skills/SkillsMenu.tsx'
    }
    if (target105RequestSizeLimitUnits.has(targetIndex)) {
      return target105RequestSizeLimitOwnerByIndex.get(targetIndex)
    }
    if (target105DatadogAllowlistUnits.has(targetIndex)) {
      return 'src/services/analytics/datadog.ts'
    }
    if (target105FileReadMitigationUnits.has(targetIndex)) {
      return 'src/tools/FileReadTool/FileReadTool.ts'
    }
    if (target105SessionStatePropagationUnits.has(targetIndex)) {
      return target105SessionStatePropagationOwnerByIndex.get(targetIndex)
    }
    if (target105SkillListingUnits.has(targetIndex)) {
      return target105SkillListingOwnerByIndex.get(targetIndex)
    }
    if (target105EventLoopUnits.has(targetIndex)) {
      return target105EventLoopOwnerByIndex.get(targetIndex)
    }
    if (target105MemoryThresholdUnits.has(targetIndex)) {
      return 'src/hooks/useMemoryUsage.ts'
    }
    if (target105AutoModeStateUnits.has(targetIndex)) {
      return 'src/utils/permissions/autoModeState.ts'
    }
    if (target105GitUnits.has(targetIndex)) {
      return target105GitOwnerByIndex.get(targetIndex)
    }
    if (target105AtomicTeamFileUnits.has(targetIndex)) {
      return 'src/utils/swarm/teamHelpers.ts'
    }
    if (target105AtomicTeammateReservationUnits.has(targetIndex)) {
      return 'src/tools/shared/spawnMultiAgent.ts'
    }
    if (target105FullCompactionCompletionUnits.has(targetIndex)) {
      return 'src/services/compact/compact.ts'
    }
    if (target105PartialCompactionCompletionUnits.has(targetIndex)) {
      return 'src/services/compact/compact.ts'
    }
    if (target105OfficialMarketplaceGcsRollbackUnits.has(targetIndex)) {
      return 'src/utils/plugins/officialMarketplaceGcs.ts'
    }
    if (target105HfiAuthCleanupUnits.has(targetIndex)) {
      return 'src/utils/cleanup.ts'
    }
    if (target105SessionAppendPolicyUnits.has(targetIndex)) {
      return 'src/utils/sessionStorage.ts'
    }
    if (target105MarkdownOrderedListUnits.has(targetIndex)) {
      return 'src/components/Markdown.tsx'
    }
    if (target105MarkdownWhitespaceUnits.has(targetIndex)) {
      return 'src/components/Markdown.tsx'
    }
    if (target105MetaEnterTabUnits.has(targetIndex)) {
      return 'src/ink/parse-keypress.ts'
    }
    if (target105GracefulShutdownUnits.has(targetIndex)) {
      if (targetIndex === 11253) return 'src/cost-tracker.ts'
      if (targetIndex === 17853) return 'src/costHook.ts'
      return 'src/setup.ts'
    }
    if (target105SkillActivatedOtelUnits.has(targetIndex)) {
      return 'src/tools/SkillTool/SkillTool.ts'
    }
    if (target105PluginInstallOtelUnits.has(targetIndex)) {
      return targetIndex === 14597
        ? 'src/services/plugins/pluginOperations.ts'
        : 'src/utils/plugins/pluginInstallationHelpers.ts'
    }
    if (target105ToolSearchMcpNonblockingUnits.has(targetIndex)) {
      return 'src/utils/toolSearch.ts'
    }
    if (target105SdkAuxiliaryUnits.has(targetIndex)) {
      return target105SdkAuxiliaryOwnerByIndex.get(targetIndex)
    }
    if (target105TeleportTrustedDeviceUnits.has(targetIndex)) {
      return 'src/utils/teleport.tsx'
    }
    if (target105GitBundleBaseRefUnits.has(targetIndex)) {
      return target105GitBundleBaseRefOwnerByIndex.get(targetIndex)
    }
    if (target105McpOAuthDiscoveryUnits.has(targetIndex)) {
      return target105McpOAuthDiscoveryOwnerByIndex.get(targetIndex)
    }
    if (target105AnalyticsStateUnits.has(targetIndex)) {
      return 'src/services/analytics/index.ts'
    }
    if (target105TeamMemoryAclUnits.has(targetIndex)) {
      return 'src/services/teamMemorySync/watcher.ts'
    }
    if (target105AttachmentMessageUnits.has(targetIndex)) {
      return 'src/utils/messages.ts'
    }
    if (target105PluginSettingsDescriptionUnits.has(targetIndex)) {
      return 'src/utils/plugins/schemas.ts'
    }
    if (target105TrustedDevicePolicyUnits.has(targetIndex)) {
      return 'src/bridge/trustedDevice.ts'
    }
    if (target105RecalledMemoryUnits.has(targetIndex)) {
      return target105RecalledMemoryOwnerByIndex.get(targetIndex)
    }
    if (target105ApiRetryTelemetryUnits.has(targetIndex)) {
      return 'src/services/api/logging.ts'
    }
    if (target105FirstAttemptRequestIdUnits.has(targetIndex)) {
      return targetIndex === 16680
        ? 'src/services/api/claude.ts'
        : 'src/services/api/logging.ts'
    }
    if (target105ManagedAgentDocUnits.has(targetIndex)) {
      return target105ManagedAgentDocOwnerByIndex.get(targetIndex)
    }
    if (target105PluginManifestVersionUnits.has(targetIndex)) {
      return 'src/utils/plugins/installedPluginsManager.ts'
    }
    if (target105McpElicitationFormUnits.has(targetIndex)) {
      return 'src/components/mcp/ElicitationDialog.tsx'
    }
    if (target105ReactiveCompactionUnits.has(targetIndex)) {
      return target105ReactiveCompactionOwnerByIndex.get(targetIndex)
    }
    if (target105TmuxFocusUnits.has(targetIndex)) {
      return target105TmuxFocusOwnerByIndex.get(targetIndex)
    }
    if (target105SessionStateUnits.has(targetIndex)) {
      return 'src/utils/sessionState.ts'
    }
    if (target105KeybindingSelectionUnits.has(targetIndex)) {
      return target105KeybindingSelectionOwnerByIndex.get(targetIndex)
    }
    if (target105FeedbackPayloadUnits.has(targetIndex)) {
      return 'src/components/Feedback.tsx'
    }
    if (target105BackgroundWorkUnits.has(targetIndex)) {
      return target105BackgroundWorkOwnerByIndex.get(targetIndex)
    }
    if (target105RequestTooLargeUnits.has(targetIndex)) {
      return 'src/services/api/errors.ts'
    }
    if (target105UltrareviewUnits.has(targetIndex)) {
      return target105UltrareviewOwnerByIndex.get(targetIndex)
    }
    if (target105HookRegistryUnits.has(targetIndex)) {
      return 'src/utils/hooks.ts'
    }
    if (target105UpstreamRelayDrainUnits.has(targetIndex)) {
      return 'src/upstreamproxy/relay.ts'
    }
    if (target105TaskRegistryUnits.has(targetIndex)) {
      return target105TaskRegistryOwnerByIndex.get(targetIndex)
    }
    if (target105HeadlessMcpPrewaitUnits.has(targetIndex)) {
      return 'src/cli/print.ts'
    }
    if (target105BackendRegistryUnits.has(targetIndex)) {
      return 'src/utils/swarm/backends/registry.ts'
    }
    if (target105SdkMemoryPathsUnits.has(targetIndex)) {
      return targetIndex === 10235
        ? 'src/entrypoints/sdk/coreSchemas.ts'
        : 'src/utils/messages/systemInit.ts'
    }
    if (target105RemoteTriggerSchemaUnits.has(targetIndex)) {
      return 'src/tools/RemoteTriggerTool/RemoteTriggerTool.ts'
    }
    if (target105TreeConnectorUnits.has(targetIndex)) {
      return 'src/components/design-system/Tree.tsx'
    }
    if (target105ClientPresencePlatformUnits.has(targetIndex)) {
      return 'src/bridge/clientPresence.ts'
    }
    if (target105PromptCacheBreakUnits.has(targetIndex)) {
      return targetIndex === 16680
        ? 'src/services/api/claude.ts'
        : 'src/services/api/promptCacheBreakDetection.ts'
    }
    if (target105WorktreeLifecycleUnits.has(targetIndex)) {
      return 'src/utils/worktree.ts'
    }
    if (target105LoopProactiveUnits.has(targetIndex)) {
      return 'src/skills/bundled/loop.ts'
    }
    if (target105AgentConcurrencyUnits.has(targetIndex)) {
      return target105AgentConcurrencyOwnerByIndex.get(targetIndex)
    }
    if (target105PrintResumeTelemetryUnits.has(targetIndex)) {
      return 'src/cli/print.ts'
    }
    if (targetIndex === 8823) return 'src/state/AppStateStore.ts'
    if (targetIndex === 8000 || targetIndex === 8002) return 'src/utils/mcpOutputStorage.ts'
    if (targetIndex === 8486) return 'src/services/mcp/client.ts'
    if (targetIndex === 16088 || targetIndex === 16089) return 'src/commands/recap.ts'
    if (targetIndex === 18109) return 'src/commands.ts'
    if (targetIndex >= 17558 && targetIndex <= 17563) return 'src/utils/subagentStatusLine.ts'
    if ([17565, 17567, 17568].includes(targetIndex)) return 'src/components/CoordinatorAgentStatus.tsx'
    if (targetIndex === 17566 || targetIndex === 17764) return 'src/components/PromptInput/PromptInput.tsx'
    if (targetIndex >= 17693 && targetIndex <= 17696) return 'src/hooks/useSubagentStatusLine.ts'
    if (targetIndex === 17709 || targetIndex === 17710) return 'src/components/PromptInput/PromptInputFooterLeftSide.tsx'
    if (targetIndex === 19107) return 'src/main.tsx'
    if (target105LogRepoUnits.has(targetIndex)) return 'src/components/LogSelector.tsx'
  }
  if (caseName === '2.1.105-to-2.1.107') {
    if ([9197, 9198, 9203].includes(targetIndex)) {
      return 'src/utils/model/agent.ts'
    }
    if ([16605, 16607, 16622, 16636].includes(targetIndex)) {
      return 'src/constants/prompts.ts'
    }
    if ([17923, 17925].includes(targetIndex)) {
      return 'src/utils/processUserInput/processUserInput.ts'
    }
    if (targetIndex === 18391) return 'src/screens/REPL.tsx'
  }
  return null
}

function preciseBehavior(caseName, targetIndex, owner) {
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97BridgeGitContextUnits.has(targetIndex)
  ) {
    return 'Target97 centralizes bridge repository context construction, uses one resolved revision for both the source checkout and outcome branch, and sends the original working directory plus reuse_outcome_branches through every live bridge session-creation request.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97SessionWriterUnits.has(targetIndex)
  ) {
    return 'Target97 coordinates every transcript writer behind a safe cursor and shared pending-write barrier: streaming assistants remain unwritten until message_delta completes them, terminal SDK paths force the tail, speculative appends participate in flush and mirror ordering, and the retained public adapter delegates to the Project write tracker.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97AgentEffortCapUnits.has(targetIndex)
  ) {
    return 'The target97 rollout caps inherited non-fork subagent effort at medium behind its feature gate, preserves explicitly configured and exact-fork effort, and removes the obsolete Opus-only suffix from the maximum-effort description.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97ModelFamilyPromptUnits.has(targetIndex)
  ) {
    return 'Environment context identifies the target97 Claude 4.6 and 4.5 family and exact per-tier model IDs, then directs AI application builders to the latest capable models.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97ResumeRefreshUnits.has(targetIndex)
  ) {
    return 'Session reloads keep existing results visible, reject stale asynchronous completions, preserve prior results after failure, reset deep/agentic search state, and expose exact refreshing and local no-match feedback.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97BridgeCleanupUnits.has(targetIndex)
  ) {
    return 'Bridge hook cleanup emits the target session-scoped teardown diagnostic immediately before invoking teardown and clears the connection state without leaking the obsolete environment identifier.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97BridgeCommandAliasUnits.has(targetIndex)
  ) {
    return 'Remote Control resolves an otherwise terminal-only local JSX command to a same-name text-only allowlisted counterpart, rewrites only the leading command token, and executes it in the effective command context.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97FocusCollapseUnits.has(targetIndex)
  ) {
    return 'Brief transcript mode collapses eligible read/search runs into a deterministic summary while preserving excluded messages and exposes its reachable Focus footer state from initialized application state.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97MarkdownBlockquoteUnits.has(targetIndex)
  ) {
    return 'Target97 extracts top-level blockquotes from the ANSI text accumulator and renders their italicized token content inside a dedicated Ink quote border with dim-color propagation.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97UnifiedInstalledAuthUnits.has(targetIndex)
  ) {
    return 'The Box-era unified plugin/MCP row replaces the needs-auth text with the shared ConfigurableShortcutHint for select:accept, retaining top-level and indented status rendering without the later ListItem migration.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97RuntimeUtilityUnits.has(targetIndex)
  ) {
    const behaviors = new Map([
      [3236, 'Canonical first-party model IDs strip an otherwise-unrecognized eight-digit date suffix.'],
      [5501, 'Windows native clipboard writes decode bounded base64 as UTF-8 through PowerShell while retaining the OSC 52 fallback.'],
      [6270, 'Max-effort support parses model family/major/minor and accepts non-Haiku 4.6-or-newer versions while respecting provider overrides.'],
      [6868, 'CLAUDE.md include parsing accepts backslash-escaped spaces, removes fragments, validates the path, and resolves it relative to the including file.'],
      [7067, 'Image resizing reports both unknown-dimension oversize attempts and known-dimension resize/compression attempts with the target telemetry fields.'],
      [7811, 'Awk path extraction distinguishes program/assignment arguments from source-file arguments, including long options and equals forms.'],
      [8113, 'Shell JSON formatting ignores optional escaped forward slashes when checking round-trip precision before pretty-printing.'],
    ])
    return behaviors.get(targetIndex)
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97AgentRuntimeUnits.has(targetIndex)
  ) {
    const workerPool = target97AgentReplToolPoolUnits.has(targetIndex)
      ? ' The same worker caller also opts out of the interactive REPL primitive filter so independent agents retain their full executable tool pool.'
      : ''
    return `Target97 preserves exact-tool fork model inheritance, conditionally routes non-fork inherited Opus agents to Sonnet, and filters task-management tools from non-teammate system prompts without removing them from the executable tool pool.${workerPool}`
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97RateLimitUpgradeUnits.has(targetIndex)
  ) {
    return 'Rate-limit UI and REPL wiring preserve server-provided upgrade paths, expose the gated Team-plan action with exact telemetry, and track the blocked/opened state through the boolean callback.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97VirtualMessageKeyUnits.has(targetIndex)
  ) {
    return 'Virtualized rendering preserves the first sibling key, suffixes later duplicate occurrences deterministically, and reports up to three duplicate counts before React reconciliation can overwrite sibling DOM nodes.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97PluginMarketplaceUnits.has(targetIndex)
  ) {
    return 'Marketplace updates recover stale directories through backup/rollback cleanup, skip very recent refreshes, and refresh remote metadata before plugin lookup while retaining cached data on failure.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97VcrImageUnits.has(targetIndex)
  ) {
    return 'VCR input dehydration replaces base64 image bytes with a stable marker while preserving the remaining image metadata and returning non-base64 image blocks unchanged.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97CommandErrorUnits.has(targetIndex)
  ) {
    return 'Compaction and branch commands preserve typed failure categories, surface media and exhausted-context outcomes distinctly, and reject historical branch transcripts above 50 MiB before reading them.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97AppleScriptQuoteUnits.has(targetIndex)
  ) {
    return 'Terminal launch quoting escapes AppleScript backslash, quote, newline, and tab, and normalizes cmd.exe newline/tab, quote, percent expansion, and trailing backslashes so user-controlled command text cannot break either generated string.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97FpsTrackerUnits.has(targetIndex)
  ) {
    return 'FPS telemetry counts every rendered frame while bounding retained duration samples to roughly half of the 3,600-sample ceiling, preserving lifetime average FPS without unbounded memory growth.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97VoiceTipUnits.has(targetIndex)
  ) {
    return 'The voice-mode discovery tip is eligible only for an initially unset voice preference outside Homespace, remote-control, and SSH sessions, and retains its exact cooldown and ordering after the mobile tip.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97CompactTruncationUnits.has(targetIndex)
  ) {
    return 'Cold autocompaction removes ambient attachments, thinking, tools, and prompt-cache state, recursively truncates observable tool payloads to 100 UTF-16 code units without splitting a surrogate pair, and remains reachable only after the inherited 90-minute feature gate.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97CronExtraTaskUnits.has(targetIndex)
  ) {
    return 'The scheduler fail-safely loads optional synthetic tasks, auto-starts when that provider exists, and includes them in the target97 owner-gated schedule while preserving missed-task behavior for persisted tasks only.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97SandboxInboxUnits.has(targetIndex)
  ) {
    return 'Sandbox-network requests are resolved from the active permission mode before queueing, and automatic decisions are logged and sent through the worker mailbox with the exact team and host identity.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97SandboxMachLookupUnits.has(targetIndex)
  ) {
    return 'The sandbox settings schema validates macOS Mach/XPC service patterns, the runtime converter forwards them unchanged, and the public sandbox manager exposes the underlying allowlist accessor.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97AutoDreamFirstEnableUnits.has(targetIndex)
  ) {
    return 'Enabling auto-dream records whether this is the first explicit enable by reading the initial setting before persistence; later enables and disable operations report false.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97ReplBridgeConfigAliasUnits.has(targetIndex)
  ) {
    return 'The live env-less Remote Control configuration exposes the stable REPL-named default, getter, and minimum-version exports while retaining descriptive internal names.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97AutoModeDenialUnits.has(targetIndex)
  ) {
    return 'Auto-mode denial history is isolated per interactive provider, retains the newest twenty records, exposes stable getter and recorder callbacks, and is consumed through context by recent-denials UI, permission-tab selection, and the permission decision hook.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97AutoModeDenialReachabilityUnits.has(targetIndex)
  ) {
    return 'The top-level interactive App mounts both notification lifecycle and auto-mode denial providers inside app state, making their provider-scoped state reachable while preserving notification as the outer wrapper.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97NotificationLifecycleUnits.has(targetIndex)
  ) {
    return 'Notification timeout and mount bookkeeping is scoped to the nearest provider, shared by all hook consumers in that tree, falls back to per-consumer state outside a provider, and clears an active timeout only when the last consumer unmounts.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97NotificationReachabilityUnits.has(targetIndex)
  ) {
    return 'The top-level interactive App mounts the notification lifecycle provider inside app state, making provider-scoped timeout and last-consumer cleanup semantics reachable to notification hooks.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97LoopChainStateUnits.has(targetIndex)
  ) {
    return 'Target97 initializes an isolated null-prototype registry keyed by dynamic-loop prompt and exposes exact get, set, and delete operations; the target101 scheduler consumes that state to preserve chain age across re-armed wakeups and target116 retains the complete live graph.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97AgentReplToolPoolUnits.has(targetIndex)
  ) {
    return 'Independent Agent workers ask the shared tool-pool assembler to bypass only the interactive REPL primitive filter, retaining built-in and MCP tools under the worker permission context while the main REPL remains filtered.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97SettingsViewModeUnits.has(targetIndex)
  ) {
    return 'Settings persist an optional default, verbose, or focus transcript view; invalid values fail safely to undefined, and the later focus-mode consumer reads the same public setting.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97ImageTokenCompressionUnits.has(targetIndex)
  ) {
    return 'Target97 estimates resized image tokens from base64 length, recompresses only payloads above 25,000 tokens, marks successful recompression, and falls back to the resized image if compression fails; target110 later replaces this contract with a byte cap.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97McpResultSizeUnits.has(targetIndex)
  ) {
    return 'A valid MCP max-result-size annotation is threaded from tool discovery through URL retries and the direct call into result processing; annotated non-image content bypasses client truncation and persistence while image content retains the safe existing path.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97RoutineCronStaticUnits.has(targetIndex)
  ) {
    return 'The live scheduled-task hook retains its ordinary behavior, while its optional routine-task branch is guarded by a module binding initialized to null and never assigned; authenticated whole-bundle scope proves that branch is compile-time disabled and runtime-unobservable.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97DynamicPromptUnits.has(targetIndex)
  ) {
    return 'Dynamic system-prompt mode omits memory and environment from the cacheable system prefix, reconstructs keyed sections in first-user context with target precedence, and propagates the option and redirected-token accounting through SDK, query, context, print, and CLI state.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97AdditionalModelCostsUnits.has(targetIndex)
  ) {
    return 'Bootstrap validates and persists server-provided model pricing, and cost calculation resolves unknown models by exact ID then canonical name before reporting an unknown-model fallback.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97DeferredToolDeltaUnits.has(targetIndex)
  ) {
    return 'Deferred-tool availability messages explain that schemas remain unloaded, give the exact ToolSearch select query needed to load them, and warn against searching tools whose MCP server disconnected.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97PrDetailsUnits.has(targetIndex)
  ) {
    return 'Detailed PR lookup caches GitHub CLI results for thirty seconds, classifies success, failure, and pending check states, and normalizes draft/open/closed/merged and review outcomes.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97WorkflowScriptUnits.has(targetIndex)
  ) {
    return 'Generated JavaScript beneath the current session workflow scripts directory receives the narrowly scoped internal-write bypass; sibling paths and non-JavaScript files do not.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97ToolInputUnicodeUnits.has(targetIndex)
  ) {
    return 'Target97 decodes four-hex-digit Unicode escapes in SendMessage text; current source preserves the later recursive, surrogate-pair-aware, escape-parity-safe generalization for all tool inputs.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97HookEvaluatorUnits.has(targetIndex)
  ) {
    return 'Stop-hook evaluation selects its model before transcript assembly, budgets grouped conversation rounds to seventy percent of 200k or 1M context, always retains the newest round, records truncation, and surfaces evaluator API failures distinctly.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97RecursiveSafetyCheckUnits.has(targetIndex)
  ) {
    return targetIndex === 13123
      ? 'Permission decisions recursively locate safety checks inside compound Bash subcommand reasons; the auto-mode path applies its classifier-approvable predicate to the nested result and records the target97 strip-all and original-reason telemetry fields.'
      : 'Permission decisions recursively locate safety checks inside compound Bash subcommand reasons, and both permission-request and bypass-mode guards preserve those nested interactive-approval requirements.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97AutoModeTelemetryUnits.has(targetIndex)
  ) {
    return 'Auto-mode classifier decisions record the strip-all Bash feature flag and retain the original permission-decision reason for behavioral rollout analysis.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97ReadOnlyRedirectUnits.has(targetIndex)
  ) {
    return 'Parsed read-only Bash validation permits only input-side redirects, numeric descriptor duplication, and /dev/null output while rejecting network-device redirects, unsafe environment names, and vulnerable UNC arguments.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97PlaceholderExpansionUnits.has(targetIndex)
  ) {
    return 'Skill, plugin, and session placeholders expand only in their associated runtime context, normalize Windows skill paths, use callback replacement for literal dollar signs, and fail closed when a hook references unavailable plugin variables.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97WorktreeNoTrackUnits.has(targetIndex)
  ) {
    return 'New sparse and full git worktrees reset the session branch without configuring upstream tracking, then retain the existing sparse-checkout setup and rollback behavior.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97TokenWarningUnits.has(targetIndex)
  ) {
    return 'The context warning is inserted into notification state only above the compact threshold, outside brief mode and post-compaction suppression, replaces older warning payloads, persists for five hours, and is removed when ineligible.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97CostSteerUnits.has(targetIndex)
  ) {
    return 'Agent cost steering respects explicit environment overrides, keeps the inherited Pro rollout, and adds the Max-plan basalt rollout before injecting exact no-unsolicited-agent guidance into the tool prompt.'
  }
  if (
    caseName === '2.1.96-to-2.1.97' &&
    target97PermissionShortcutUnits.has(targetIndex)
  ) {
    return 'Bash and PowerShell permission dialogs route cancel, amend, explainer, and debug-toggle hints through the shared chord formatter, preserving the target title-case and Ctrl-D display overrides.'
  }
  if (caseName === '2.1.97-to-2.1.98') {
    if (target98TypeaheadMetadataUnits.has(targetIndex)) {
      return 'Target98 applies file-suggestion metadata replacements at both selection paths, keeps partial replacements open for further completion, and suppresses misleading common-prefix insertion when any candidate supplies an explicit replacement; the same unit also retains the independently evidenced MCP resource-template completion graph.'
    }
    if (target98DynamicImageLimitUnits.has(targetIndex)) {
      const adjacent = target98McpResourceTemplateUnits.has(targetIndex)
        ? ' The same MCP owner also retains the independently evidenced resource-template cache and completion graph.'
        : target98UltraplanLaunchUnits.has(targetIndex)
          ? ' The same REPL unit also retains the independently evidenced Ultraplan launch lifecycle.'
          : ''
      return `Target98 resolves model-specific image dimensions and base64 limits, propagates them through paste, attachment, tool, MCP, permission, prompt, query, and API paths, keeps normalization two-argument and validates direct plus nested tool-result images explicitly after normalization.${adjacent}`
    }
    if (owner === 'src/utils/subprocessEnv.ts' || owner === 'src/entrypoints/init.ts') {
      return 'Subprocess scrubbing and local-agent sandbox initialization preserve the target isolation boundary.'
    }
    if (owner.includes('Monitor')) {
      return 'Monitor runtime streams, batches, rate-limits, times out, terminates, and permission-gates target monitor tasks.'
    }
    if (owner === 'src/components/VertexSetupWizard.tsx') {
      return 'Vertex setup authenticates, verifies project/region access, probes models, and pins per-tier selections.'
    }
    if (owner === 'src/constants/prompts.ts') {
      return 'Dynamic system-prompt sections, communication gating, and first-message reinjection match the target prompt behavior.'
    }
    if (owner === 'src/utils/advisor.ts') {
      return 'Advisor enablement is restricted to first-party beta-capable requests behind the compass2 rollout, and the target reviewer instructions preserve the exact call timing, durability, and evidence-reconciliation contract.'
    }
    if (owner === 'src/utils/envUtils.ts') {
      return 'Vertex regional routing recognizes the Opus 4.5 model prefix and reads its dedicated VERTEX_REGION_CLAUDE_4_5_OPUS override before falling back to the global region.'
    }
    if (owner === 'src/utils/git.ts') {
      return 'Repository slug discovery reads normal and bare git-config layouts without spawning git, prefers origin.pushurl over origin.url, normalizes the remote, and negatively caches misses with a bounded LRU.'
    }
    if (target98RemoteEligibilityUnits.has(targetIndex)) {
      return 'Remote-session eligibility preserves HTTP 401 as a login failure, degrades other environment-fetch failures to unavailable data, requires an environment at target98, and waives the GitHub-app requirement for the configured BYOC environment.'
    }
    if (target98LogFilterUnits.has(targetIndex)) {
      return 'The resume selector exposes stateful Ctrl+A directory, Ctrl+B branch, and Ctrl+W worktree filter actions with target capitalization, while retaining preview, rename, and search navigation hints.'
    }
    if (target98StatusLineResultUnits.has(targetIndex)) {
      return 'Status-line execution records the first non-empty result per command generation after abort checking, including character count, maximum display width, line count, and the captured command length, while swallowing command failures.'
    }
    if (target98PluginScopeFallbackUnits.has(targetIndex)) {
      return 'Plugin update selects the installation matching both scope and current project, falls back only within the requested scope, warns when multiple scoped installs make that fallback ambiguous, and forwards the selected installation path.'
    }
    if (target98ProviderSetupUnits.has(targetIndex)) {
      return 'Provider setup registers the new Vertex command, upgrades Bedrock completion to a confirmation/restart flow, and relaunches the exact current argv with inherited stdio, signal forwarding, exit-code propagation, and explicit spawn failure handling.'
    }
    if (target98PrDetailsUnits.has(targetIndex)) {
      return 'PR details classify status-check rollups, review state, draft/closed/merged state, and CLEAN/HAS_HOOKS/UNSTABLE mergeability from a memoized gh query with the exact target98 response shape.'
    }
    if (target98WebSetupEnvironmentUnits.has(targetIndex)) {
      return 'Web setup creates the default cloud environment only when none exists, treats listing and creation failures as non-fatal, logs the exact warning, and still opens the authenticated web destination and reports success.'
    }
    if (target98ConsoleOAuthUnits.has(targetIndex)) {
      return 'Console OAuth exposes a third-party platform branch with interactive Bedrock and Vertex setup, Foundry documentation, exact telemetry, provider completion states, and reachable Enter-to-finish restart guidance.'
    }
    if (target98BridgeLateResponseUnits.has(targetIndex)) {
      return 'The REPL bridge diagnoses a late or unknown permission response, returns without deleting unrelated pending state, and deletes the matching pending entry only after invoking its response handler.'
    }
    if (target98EffortCapabilityUnits.has(targetIndex)) {
      return 'Max-effort capability honors an explicit provider override, rejects Haiku and normalized legacy Claude model IDs, strips provider/version/date suffixes, and defaults newly capable models to enabled.'
    }
    if (target98SessionsWebSocketUnits.has(targetIndex)) {
      return 'Sessions WebSocket teardown detaches Bun or Node listeners before close, cancels a late Node attachment after closure, and installs a post-detach error sink so shutdown cannot leak listeners or emit an unhandled error.'
    }
    if (target98StopHookFocusUnits.has(targetIndex)) {
      return 'Target98 evolves the Stop-hook dialog introduced by the 2.1.91-to-2.1.92 lineage: Tab prevents default and toggles input/delete focus, focused Enter deletes, and the input guide uses the exact switch-focus chord.'
    }
    if (target98WrappedContentFeedbackUnits.has(targetIndex)) {
      return 'Target98 introduces a byte-oriented wrapped-content serializer that streams configured arrays and array-map fields without materializing the full payload, supports raw inner-chunk transforms and outer metadata, and wires both Feedback and transcript sharing to exact payload-size, redaction, retry, and error-classification behavior; current source preserves the later recursive target116 sanitization evolution.'
    }
    if (target98VertexModelUpgradeUnits.has(targetIndex)) {
      return 'Vertex startup discovery rejects host-managed providers, probes stale and default model tiers with an eight-second one-token request behind a twenty-second fail-open deadline, persists accept/decline decisions, relaunches after saved upgrades, and installs an accessible prior-model fallback for the session.'
    }
    if (target98BedrockProbeDeadlineUnits.has(targetIndex)) {
      return 'Bedrock startup discovery scans valid per-tier pins in priority order, records candidate and fallback diagnostics, applies an exact twenty-second fail-open deadline to upgrade and default probes, and keeps upgrade or fallback failures from blocking startup.'
    }
    if (target98UltraplanLaunchUnits.has(targetIndex)) {
      return 'Ultraplan replaces its command keyword, selects one of three exact gated prompt variants, asks for first-launch local-or-cloud placement, preserves or restores input on cancellation, disconnects Remote Control when required, and tracks the pending/status transcript through launch, failure, approval, and cleanup.'
    }
    if (
      target98McpResourceTemplateUnits.has(targetIndex) &&
      target98AgentsRuntimeUnits.has(targetIndex)
    ) {
      return 'Interactive state initializes both MCP resource-template caches and the set of agent definitions invoked this session, so eager template completion and the Running/Library agent views are reachable from the first render.'
    }
    if (target98McpResourceTemplateUnits.has(targetIndex)) {
      return 'MCP resource templates are fetched eagerly with resources, cached and refreshed on list changes, parsed and ranked alongside file/resource/agent suggestions, completed through ref/resource, and applied with multi-variable partial replacement semantics.'
    }
    if (target98AgentsRuntimeUnits.has(targetIndex)) {
      return 'The Agents runtime menu tracks definitions invoked this session, separates running and library views, orders active and completed tasks, renders summaries, durations, token counts, abort and foreground controls, and submits the selected @agent type with target98 state and telemetry ordering.'
    }
  }
  if (caseName === '2.1.98-to-2.1.100' && owner === 'src/constants/prompts.ts') {
    return 'Communication guidance uses the target concise summary, exploratory response, and numeric length-anchor semantics.'
  }
  if (
    caseName === '2.1.98-to-2.1.100' &&
    target100SpinnerUnits.has(targetIndex)
  ) {
    return 'The target100 spinner disables false stall detection while thinking, reveals timing after sixteen seconds, and renders the foreground teammate interrupt action through the inherited keybinding formatter.'
  }
  if (caseName === '2.1.100-to-2.1.101') {
    if (target101ClaudeApiTriggerUnits.has(targetIndex)) {
      return 'Target101 expands the Claude API skill trigger to cover Managed Agents endpoints, prompt caching diagnostics, adaptive thinking, compaction, code execution, files, citations, memory, and model changes while explicitly excluding non-Anthropic and provider-neutral code.'
    }
    if (target101StartupRuntimeUnits.has(targetIndex)) {
      return 'Target101 installs a build-aware, bounded process-warning logger with an explicit uninstall handle and safe class/count telemetry, initializes the permission context with CLI base-tool filtering and dangerous-permission metadata, resolves the effective initial model, and dispatches synchronous setup and SessionStart hooks through the reachable startup path; authored source expresses the same behavior directly where the compiler emits small wrappers.'
    }
    if (target101SingleDigitSelectUnits.has(targetIndex)) {
      return 'Target101 numeric selection consumes exactly one terminal keypress in both single- and multi-select state machines, preventing a buffered multi-digit token from being interpreted as an option index while preserving one-through-nine selection.'
    }
    if (target101BetaTracingPrivacyUnits.has(targetIndex)) {
      return 'Target101 makes sensitive beta-tracing payloads fail closed: interaction prompts, system prompt previews and bodies, incremental context, model output, tool input, and tool results require their exact opt-in environment gates, while safe message and reminder counts remain observable and deduplication advances only when content is emitted.'
    }
    if (target101RemoteIoWriteTrackingUnits.has(targetIndex)) {
      return 'Target101 exposes StructuredIO write tracking to its RemoteIO subclass and invokes it before every CCR or transport write, preserving stall-watchdog and schema-sampling behavior while re-reading authorization headers for reconnects.'
    }
    if (target101ChromeOnboardingFocusUnits.has(targetIndex)) {
      return 'Target101 moves Chrome-onboarding Enter confirmation from a global input hook to an auto-focused, keyboard-addressable container, ignores modified Enter, prevents the accepted key event, and retains the focused flow through target116.'
    }
    if (target101CommandAgentBootstrapUnits.has(targetIndex)) {
      return 'Target101 starts command and agent-definition loads before setup, suppresses transient rejections, joins them after setup, merges CLI agents, selects the requested main-thread agent, and preserves coordinator filtering plus the tools-loaded checkpoint in equivalent startup source.'
    }
    if (target101CommandDisplaySearchUnits.has(targetIndex)) {
      return 'Target101 indexes both the canonical command name and its user-facing name, splits each qualified name into fuzzy-search parts, and preserves the exact command/display/alias/description weighting through target116.'
    }
    if (target101SessionEnvUnits.has(targetIndex)) {
      return 'Target101 creates one per-session environment map, threads it through interactive, headless, agent, monitor, shell-completion, clear, Bash, and PowerShell contexts, merges it into each spawned process without global leakage, and applies the historical remote Bun soft-data limit before command execution.'
    }
    if (target101SuggestionPaddingUnits.has(targetIndex)) {
      return 'Target101 makes suggestion filler rows explicitly suppressible while preserving bottom-aligned padding for inline lists; the later fullscreen overlay caller sets noPad so anchored suggestions do not displace prompt content.'
    }
    if (target101OAuthUrlOutdentUnits.has(targetIndex)) {
      return 'Target101 propagates platform-specific Dialog padding into the console OAuth flow and applies the combined Windows/link offset as a negative margin so a long fallback sign-in URL uses the full terminal width.'
    }
    if (target101ContextUnattributedUnits.has(targetIndex)) {
      return 'Target101 reconciles estimated message categories with bounded API usage, assigns the residual after tool, attachment, assistant, user, and redirected-context tokens to an explicit unattributed bucket, and exposes both values through the SDK context schema.'
    }
    if (target101ApiErrorRateLimitUnits.has(targetIndex)) {
      return 'Target101 renders duration-aware API retry status with reset time and attempt count, gives rate-limit failures a named reached-limit display, and preserves the exact early external-retry suppression; current source retains the display while narrowing transient suppression for actionable failures.'
    }
    if (target101StoredImageStateUnits.has(targetIndex)) {
      return 'Target101 publishes stored image paths into immutable AppState, reads that map for clickable image references, adds keyboard-selectable pasted-image rows to CustomSelect, and clears the map with session caches; current source retains the path graph and adds image-description state.'
    }
    if (target101RemoteSettingsValidationUnits.has(targetIndex)) {
      return 'Remote managed settings validate a filtered structured clone, preserve the unmodified fetched object for caching, skip retries for structurally invalid responses, and compare sanitized clones before the interactive dangerous-settings decision.'
    }
    if (target101CompactHookStateUnits.has(targetIndex)) {
      return 'Target101 makes response count explicit mutable query state, propagates rewake and active Stop-hook state through every query, hook, fork, compact, and queued-input context, and refreshes tools, session environment, command lifecycle, task registry, and file attachments before each query.'
    }
    if (target101BashNewlineSandboxUnits.has(targetIndex)) {
      return 'Target101 marks quoted newline-plus-hash AST failures without losing more-specific semantic failures, preserves exact deny precedence, and permits the one marked parser differential through sandbox auto-allow only when parsed environment assignments and network-device redirects are safe.'
    }
    if (target101McpInitHandshakeUnits.has(targetIndex)) {
      return 'Target101 introduces the reachable headless MCP coordinator with sequential regular and claude.ai connection phases, per-server pending/readiness state updates, a shared nonblocking deadline, plugin/claude.ai deduplication, and an exported MCP server factory with the exact tool context.'
    }
    if (target101ComputerUseStateUnits.has(targetIndex)) {
      return 'Target101 introduces a dedicated computer-use state-slice setter, wires it from the interactive REPL, shares it only with explicitly state-sharing forks, and uses it for every wrapper write and turn-end hidden-app cleanup without exposing arbitrary AppState mutation.'
    }
    if (target101RemoteTriggerRunUnits.has(targetIndex)) {
      return 'Target101 makes RemoteTrigger run payloads optional, suppresses the tool in remote sessions, and posts the supplied payload with the validated trigger_id injected; the target105 schema copy later advertises the same optional run body explicitly.'
    }
    if (target101ScheduleRemoteGateUnits.has(targetIndex)) {
      return 'Target101 makes the user-invocable schedule skill local-only by checking CLAUDE_CODE_REMOTE before its existing feature and allow_remote_sessions policy gates; target111 later adds the independent /routines alias.'
    }
    if (target101ToolProgressOverlayUnits.has(targetIndex)) {
      return 'Target101 introduces the reachable tool-progress overlay channel: Bash, PowerShell, and Agent foreground work emit keyed background and clear events; REPL stores, deduplicates, clears, and renders them only when no modal tool JSX is active; the target101 renderer shows the exact background affordance while reserving inert event variants that later become Bash-mode and forked-agent progress.'
    }
    if (target101StateOperationUnits.has(targetIndex)) {
      return 'Target101 replaces closure-based file-history and attribution state mutation with serializable reducers and operations, captures file-history state before asynchronous IO, applies track/snapshot/commit operations afterward, and propagates the exact getter/apply contract through every interactive, headless, tool, hook, fork, and MCP context.'
    }
    if (target101RemoteIngressUnits.has(targetIndex)) {
      return 'Remote ingress rejects untrusted devices with the exact 403 guidance, creates and selects the default cloud environment before repository work, reports bridge connection failure without duplicate status, preserves cancellation cleanup, and carries the target101 session-persistence setting through the reachable bridge graph.'
    }
    if (target101AwaySummaryUnits.has(targetIndex)) {
      return 'Target101 introduces the cache-safe away-summary fork with no tools, transcript, or cache write; extracts a bounded plain-text recap; schedules it only after the required blur and message thresholds; and inserts it before trailing API metrics while preserving pending mid-turn generation and abort behavior.'
    }
    if (target101InvalidSettingsUnits.has(targetIndex)) {
      return 'The settings dialog distinguishes warnings from errors, changes title, explanatory copy, option ordering, and cancel behavior by severity, and continues automatically on warning cancellation while retaining fail-closed exit behavior for errors.'
    }
    if (target101FrameHtmlPermissionUnits.has(targetIndex)) {
      return 'Target101 allows writes only to the normalized per-session frame/frame.html path, before scratchpad handling, with the exact internal-path decision reason; later source intentionally removes this transient permission with the frame feature.'
    }
    if (target101OpenFrameKeybindingUnits.has(targetIndex)) {
      return 'Target101 adds app:openFrame to the observable app-level keybinding action validator; the action remains valid through target116 even though this structural unit also contains unrelated schema values.'
    }
    if (target101ClientPresenceUnits.has(targetIndex)) {
      return 'Target101 subscribes bridge presence to terminal-focus transitions, sends a throttled pulse only when focus returns, cleans up both interaction and focus subscriptions, and wires presence to session establishment and teardown with authenticated headers.'
    }
    if (target101HomebrewVersionUnits.has(targetIndex)) {
      return 'Target101 queries the public Homebrew cask API and the release-channel GCS pointer concurrently, prefers the Homebrew-advertised version, uses the hybrid lookup in both package-manager update surfaces, and gives a manual update command when neither source is available.'
    }
    if (target101ManagedHookLoadingUnits.has(targetIndex)) {
      return 'Target101 skips plugin loading under allowManagedHooksOnly only when policy declares no managed plugins; managed plugin hooks remain loadable, and both SessionStart and Setup paths emit the exact no-managed-plugins diagnostic when they short-circuit.'
    }
    if (target101WorktreeResumeHintUnits.has(targetIndex)) {
      return 'Target101 retains the created or restored worktree name after the active worktree state is cleared, removes it only after destructive cleanup, and includes the matching --worktree argument in the interactive resume hint; current source excludes already-existing restored worktrees as in target116.'
    }
    if (target101CcrSourceViabilityUnits.has(targetIndex)) {
      return 'Target101 computes CCR clone and bundle viability, carries the source promise through the Ultraplan pending state and dialog, chooses the exact clone-or-upload guidance, and replaces the pending transcript as remote plan creation reaches approval or completion.'
    }
    if (target101InsightsResponseUnits.has(targetIndex)) {
      return 'Target101 separates the private at-a-glance report context from the exact user-visible message and instructs the model to emit only the complete text inside message tags, without omitting any line.'
    }
    if (target101TrustedDeviceRetryUnits.has(targetIndex)) {
      return 'Target101 detects terminal untrusted-device bridge credentials, clears the memoized token, retries exactly once only when a fresh keychain read differs, preserves the first terminal result on a null retry, and retains the inherited gate-dependent terminal behavior.'
    }
    if (target101BridgeWorktreePreservationUnits.has(targetIndex)) {
      return 'Target101 preserves a failed bridge session worktree on an unexpected process crash, excludes it from shutdown archiving, force-cleans a worktree only when spawning failed, and otherwise removes it only after exact dirty and commits-ahead inspection.'
    }
    if (target101AgentTaskNotificationUnits.has(targetIndex)) {
      return 'Target101 runs SubagentStop on an interrupted agent query before cleanup, explains the task-type-specific TaskOutput deprecation and safe output channels, and frames automated background-task events so they cannot be mistaken for user acknowledgement or confirmation.'
    }
    if (target101AgentBackgroundGuidanceUnits.has(targetIndex)) {
      return 'Target101 makes the fork and async-agent contract fail closed: callers must not reread or tail the full transcript, background-hint and clear progress events bracket the foreground UI, and progress questions are answered from task state until the completion notification arrives.'
    }
    if (target101ToolSearchMcpNameUnits.has(targetIndex)) {
      return 'Target101 tokenizes MCP search names from the original server and tool display names, splitting whitespace, underscore, and period boundaries while retaining normalized mcp__ names as a fallback.'
    }
    if (target101TeamMemoryAvailabilityUnits.has(targetIndex)) {
      return 'Target101 records whether streaming input can receive async rewakes, tracks team-memory server availability, gates cwd activation on confirmed content, distinguishes forbidden and feature-unavailable responses, and updates empty or populated status after pull and push; the server-error parser remains transitive from its authenticated early introduction.'
    }
    if (target101MainInputNormalizationUnits.has(targetIndex)) {
      return 'The settings JSON and slow-stdin diagnostics are inherited source behavior; compiler constant folding removes the source newline and concatenation boundary without changing the emitted message.'
    }
    if (target101KeybindingLoaderUnits.has(targetIndex)) {
      return 'Target101 makes keybinding loading stateful and reload-safe: async and sync loads share one state object, watcher callbacks honor initialization and disposal, changes and deletes signal reload, and cleanup disposes and resets the singleton.'
    }
    if (target101AgentMetadataMirrorUnits.has(targetIndex)) {
      return 'Target101 mirrors newly written agent sidecar metadata to the corresponding transcript identity, preserving agent type plus optional worktree and description fields for live consumers.'
    }
    if (target101BackgroundSessionPromptUnits.has(targetIndex)) {
      return 'Target101 makes the inherited null background-session helper reachable as an explicitly named prompt-cache section between output style and scratchpad; it adds no prompt text but preserves the observable cached null slot.'
    }
    if (target101UpdateCommandUnits.has(targetIndex)) {
      return 'Target101 introduces the hidden /update descriptor and reachable relaunch graph: it resolves the installed launcher, flushes and cleans up with bounded deadlines, resumes the same session, neutralizes inherited signals, and propagates child exit or launch failure.'
    }
    if (target101MessageRatingHoverUnits.has(targetIndex)) {
      return 'Target101 lengthens the inherited message-rating hover-leave grace period from 150ms to 500ms, preventing brief pointer transitions between rating controls from clearing the active message while preserving toggle and notification behavior.'
    }
    if (target101KillRingContextUnits.has(targetIndex)) {
      return 'Target101 replaces process-global kill and yank state with an isolated provider store, threads optional stores through text and search inputs, preserves accumulation and yank-pop semantics, adds multiline paste and empty-space handling, and makes the provider reachable at the interactive app root.'
    }
    if (target101TeamCreateExclusiveUnits.has(targetIndex)) {
      return 'Target101 replaces the duplicate-team preflight/name mutation with an atomic exclusive team-file write, preserves the requested team name, and reports the exact existing path only for the matching EEXIST collision while rethrowing every other filesystem error.'
    }
    if (target101FileSuggestionStateUnits.has(targetIndex)) {
      return 'Target101 isolates file-suggestion caches, indexes, watcher lifecycle, generation invalidation, and telemetry in one state object threaded through every query and refresh path; current source preserves the evolved per-instance state while reset deliberately retains signal subscribers.'
    }
    if (target101ClassifierApprovalUnits.has(targetIndex)) {
      return 'Target101 migrates classifier approvals and in-flight checks into immutable AppState, threads the state updater through permission races and UI result capture, and clears the state through every compaction and conversation-reset path; current source preserves the evolved context-scoped setter graph.'
    }
    if (target101SdkOAuthControlUnits.has(targetIndex)) {
      return 'The SDK OAuth recovery bridge stores a host callback, exposes the guarded three-entrypoint handshake, requests a fresh access token through a thirty-second control round trip, installs it only when it differs from the rejected token, and preserves exact null, same-token, exception, and user-dialog cancellation behavior.'
    }
    if (target101SettingsSanitizationUnits.has(targetIndex)) {
      return 'Settings recovery adds the async-rewake and brief-mode contracts, removes unknown hook events with exact warning metadata before schema parsing, preserves valid hook entries, and applies the same sanitizer and error collection to SDK inline settings.'
    }
    if (target101InkEventUnits.has(targetIndex)) {
      return 'Ink input recovery exposes wheel capture and bubbling, parses mouse-wheel input, normalizes legacy terminal sequences, dispatches paste and wheel events through the root hit-test route, and preserves keyboard dispatch only when propagation was not stopped.'
    }
    if (target101InkLifecycleUnits.has(targetIndex)) {
      return 'Target101 defers TTY ownership until raw mode, fullscreen activation, or the first completed render; it installs resize/SIGCONT handlers once, suppresses synchronized-output markers before interactivity, restores them afterward, and prevents unmount rendering from reacquiring terminal handlers.'
    }
    if (target101SdkTelemetryTaskUnits.has(targetIndex)) {
      return 'The SDK runtime emits the target transport and API telemetry contract, propagates task_updated control frames through structured and print modes, and owns state-aware task progress and stall reporting through the reachable QueryEngine and remote-session call graph.'
    }
    if (target101PluginRuntimeUnits.has(targetIndex)) {
      return 'The plugin runtime parses and enforces dependency version constraints, safely loads local and Git-backed marketplaces, refreshes remote metadata with cached fallback, blocks incompatible updates, and exposes the target project-scope, validation, error, keyboard, and paste UI behavior.'
    }
    if (target101WorktreeRecoveryUnits.has(targetIndex)) {
      return 'Worktree creation self-heals only a missing Git administration directory after fail-closed remote, branch, and unpushed-commit checks, while both session and agent removals fall back to an explicit directory sweep and preserve failures when neither removal succeeds.'
    }
    if (target101LoopsCommandUnits.has(targetIndex)) {
      return 'The hidden /loops command owns the full recurring-cron and Stop-hook list, create, delete, navigation, cadence parsing, telemetry, state-bridge, and static descriptor behavior introduced at target101.'
    }
    if (target101PrintResumeTitleUnits.has(targetIndex)) {
      return 'Print-mode resume trims the supplied title, performs exact custom-title lookup after UUID parsing, resolves one match, emits timestamped candidates for ambiguity, and reports a title-aware invalid-session error.'
    }
    if (target101SafetyUiUnits.has(targetIndex)) {
      return 'Target101 adds fail-closed binary-name validation before cache or process lookup, native essential-traffic Doctor handling, an exact keybinding-disabled result, and headers-helper-aware MCP authentication recovery through reachable UI branches.'
    }
    if (target101LoopDefaultUnits.has(targetIndex)) {
      return 'The autonomous /loop default introduces exact sentinels and preamble delivery, loop.md refresh and reinjection, dynamic or fixed scheduling, event-driven Monitor guidance, scheduler/print fire-time resolution, and compact-reset state through reachable source owners.'
    }
    if (target101McpDirectoryRegistryUnits.has(targetIndex)) {
      return 'The official MCP URL registry validates configured visibility classes, follows bounded pagination through both legacy and directory-BFF APIs, normalizes remote URLs, preserves prior data on fetch failure, and records source, duration, count, success, and empty-visibility telemetry.'
    }
    if (target101LogPreviewUnits.has(targetIndex)) {
      return 'The resume selector opens preview from unmodified Space or Ctrl+V only when a session is focused and deep-search selection is inactive, keeps multi-character command-like input out of local search, and advertises Space in the footer.'
    }
    if (target101ResumeSelectorUnits.has(targetIndex)) {
      return 'Resume defaults to all projects and all worktrees, threads reload generations through the command and standalone screen, preserves progressive results across stale or failed refreshes, exposes loading and empty-search state, and restores the resume terminal title.'
    }
    if (owner === 'src/tools/McpAuthTool/McpAuthTool.ts' || owner === 'src/services/mcp/auth.ts') {
      return 'MCP OAuth exposes a validated manual callback companion, tracks the active flow, and reports success, cancellation, malformed callbacks, or missing flow state exactly.'
    }
    if (owner === 'src/services/mcp/client.ts' && targetIndex === 8883) {
      return 'Both needs-auth connection paths expose authenticate and complete_authentication pseudo-tools until reconnect replaces them with real server tools.'
    }
    if (owner.includes('toolExecution') || owner.includes('StreamingToolExecutor')) {
      return 'Unavailable tools receive the target subagent-specific recovery guidance on both execution paths.'
    }
    if (owner === 'src/query/stopHooks.ts') {
      return 'Brief mode blocks a silent turn once, detects prior tool use/enforcement, and preserves the blocking message on hook failure.'
    }
    if (owner.includes('settings')) {
      return 'Programmatic and watched settings writes invalidate caches and publish the shared settings-changed signal.'
    }
    if (owner === 'src/constants/prompts.ts') {
      return 'Frontend work requires browser verification or an explicit statement that UI testing was unavailable.'
    }
  }
  if (caseName === '2.1.101-to-2.1.104' && owner === 'src/constants/prompts.ts') {
    return 'The communication section uses the target text-output heading without changing its runtime gate.'
  }
  if (caseName === '2.1.104-to-2.1.105') {
    if (target105SubprocessIsolationUnits.has(targetIndex)) {
      return 'Target105 hardens subprocess isolation by capturing normalized writable PATH roots, the GitHub runner file-command directory and workspace, creating safe mount stubs, denying runner, workspace Git, D-Bus, user-runtime, and inline-comment paths, and reusing the same captured values when building the bubblewrap policy; current source retains this graph with the later all-platform availability rule.'
    }
    if (target105MessageRatingSurfaceUnits.has(targetIndex)) {
      return 'Target105 extends the inherited rating callback with an explicit default tool-use surface and optional telemetry metadata, allowing recalled-memory ratings to report tiny-memory scope counts while preserving clear-toggle and success-notification semantics.'
    }
    if (target105WorktreeResumeNameUnits.has(targetIndex)) {
      return 'Target105 keeps an entered-existing worktree in the active session while excluding it from sticky relaunch state, so shutdown resume guidance never presents the restored worktree as a fresh --worktree request.'
    }
    if (target105TypeaheadMetadataTransitiveUnits.has(targetIndex)) {
      return 'The target98 typeahead lineage remains reachable at target105: both file-selection paths apply metadata replacements, partial replacements remain incomplete, and candidates with explicit replacements suppress common-prefix insertion.'
    }
    if (target105AwaySummaryPromptUnits.has(targetIndex)) {
      return 'Target105 refines the inherited cache-safe away-summary fork with the exact recap prompt: lead with the overall goal and current task, then the single next action, in one or two plain sentences under forty words.'
    }
    if (target105FullscreenSuggestionNoPadUnits.has(targetIndex)) {
      return 'Target105 marks fullscreen footer suggestions as already padded, preventing the suggestion component from adding a second horizontal inset while preserving the overlay container spacing.'
    }
    if (target105MessageDeferralUnits.has(targetIndex)) {
      return 'Target105 moves deferred-message selection and the processing-input placeholder into the Messages wrapper, defers only a stable first-message lineage during loading, and lets REPL pass raw leader or viewed-agent messages plus exact loading, modal, disabled, and baseline gates.'
    }
    if (target105InProcessTaskRegistryUnits.has(targetIndex)) {
      return 'Target105 routes both successful and failed in-process teammate termination through the per-session TaskRegistry, preserving NOOP isolation and eliminating direct AppState eviction.'
    }
    if (target105AccountLabelUnits.has(targetIndex)) {
      return 'Target105 renders the subscription status as the exact lowercase “account” label; current source retains that wording alongside the later workload-identity status evolution.'
    }
    if (target105SystemDiagnosticsHeadingUnits.has(targetIndex)) {
      return 'Target105 sentence-cases the persistent System diagnostics heading while retaining empty-state suppression and diagnostic-list layout.'
    }
    if (target105ModelDeprecationTenseUnits.has(targetIndex)) {
      return 'Target105 parses the selected provider retirement date and changes already-past model warnings to “was retired on” while retaining future tense for future or invalid dates.'
    }
    if (target105MemorySynthesisFactShapeUnits.has(targetIndex)) {
      return 'Target105 replaces free-form paragraph memory synthesis with a validated relevant_facts array, trims and drops empty facts, caps output at seven bullet items, filters citations to known filenames, and preserves the later target111 retrieval-only prompt wording in cumulative source.'
    }
    if (target105TmuxSocketUnits.has(targetIndex)) {
      return 'Target105 replaces process-global tmux socket lookup with an optional per-session capability, threads it through interactive, headless, forked-agent, Monitor, and Bash execution contexts, and applies the resulting TMUX override before explicit session environment values so /env remains authoritative.'
    }
    if (target105EnvHookStateUnits.has(targetIndex)) {
      return 'Target105 scopes FileChanged and CwdChanged watcher state, dynamic paths, notifier, and cleanup registration inside an explicit factory, while preserving the existing singleton export surface and complete reset semantics.'
    }
    if (target105SkillDynamicStateUnits.has(targetIndex)) {
      return 'Target105 replaces four dynamic and conditional skill module globals with one factory-created, replaceable state object, routes every discovery, activation, cache-clear, and reset path through it, and resets the state before each MCP server factory constructs any cache or request handler.'
    }
    if (target105AuthRenderRootUnits.has(targetIndex)) {
      return 'Target105 moves auth status and logout output into a caller-created Ink root, waits for the render lifecycle to finish, preserves status exit semantics, and makes the command-registration layer own successful logout exit.'
    }
    if (targetIndex === 18386) {
      return 'Target105 threads the new TaskRegistry, skill-list truncation state, recalled-memory rating hotkeys, configurable away-summary return telemetry, independent tmux focus-events notification, and scheduled background-work exit confirmation through the reachable REPL runtime; each behavior is pinned by its dedicated authenticated target fragment and dual-root test.'
    }
    if (target105AwaySummaryConfigUnits.has(targetIndex)) {
      return 'Target105 makes session recaps configurable and stateful, gates interactive use by environment, GrowthBook, session mode, and settings, schedules only against a warm prompt cache, emits bounded return telemetry, and persists/reverts the exact Config choice; target116 retains the graph with the later default-on and draft-input safeguards.'
    }
    if (target105MemorySurveyUnits.has(targetIndex)) {
      return 'Target105 adds the gated memory-impact judge and survey hook, classifies explicit managed-memory use, records the exact judge metadata, and opens or suppresses the survey according to the deterministic harmed/helped policy; target116 retains the graph.'
    }
    if (target105StripPromptXmlUnits.has(targetIndex)) {
      return 'Target105 changes prompt XML stripping to remove only post-tag leading newlines, preserving meaningful leading spaces and trailing whitespace instead of trimming the entire result.'
    }
    if (target105FilesystemPermissionUnits.has(targetIndex)) {
      return 'Target105 permits current-session workflow scripts and frame.html/frame.md sources, exempts local WSL UNC paths from remote-UNC blocking, honors pre-plan modes when suggesting edit permissions, and threads remote-mode context through protected .claude path safety; current source preserves the later write-decision precedence.'
    }
    if (target105WorkerRawCommandUnits.has(targetIndex)) {
      return 'Target105 carries a bounded raw_command through structured requires-action details and CCR worker-status uploads, preferring tool summaries, extracting Bash and PowerShell commands, serializing MCP input to at most 200 characters, and isolating description and raw-command failures.'
    }
    if (target105ToolSearchMcpTelemetryUnits.has(targetIndex)) {
      return 'Target105 enriches every ToolSearch outcome with live configured, connected, and pending MCP server counts plus the number of MCP tools in the active pool, while preserving query, match, and deferred-tool telemetry.'
    }
    if (target105ConfigTrustReasonUnits.has(targetIndex)) {
      return 'Target105 exports an idempotent normalized-path trust setter that preserves existing project config and records acceptance, and changes auto-updater environment reasons to the exact set-by-env diagnostic.'
    }
    if (target105RepoCheckoutUnits.has(targetIndex)) {
      return 'Target105 tracks the checked-out branch of every known repository, reports branch metadata through CCR, refreshes it after session persistence, and prefers the recorded repository base ref when computing diffs.'
    }
    if (target105SkillsMenuUnits.has(targetIndex)) {
      return 'Target105 adds the interactive skill-override menu with policy, flag, author, and plugin locks; inherited and local override resolution; exact override cycling; filtering, scrolling, and persisted local settings.'
    }
    if (target105RequestSizeLimitUnits.has(targetIndex)) {
      return 'Target105 separates the API request ceiling from the 20 MiB raw-PDF target and reports the exact 32 MiB API limit in interactive and noninteractive request-too-large errors.'
    }
    if (target105DatadogAllowlistUnits.has(targetIndex)) {
      return 'Target105 admits the mid-turn MCP refresh and SDK initialization-handshake events to the Datadog export allowlist, making both already-reachable telemetry call sites observable.'
    }
    if (target105FileReadMitigationUnits.has(targetIndex)) {
      return 'Target105 selects the FileRead cyber-risk mitigation reminder from the raw lower-cased model ID using the exact twelve-pattern first-party model predicate; current source preserves the later canonical-model allowlist evolution.'
    }
    if (target105SessionStatePropagationUnits.has(targetIndex)) {
      return target105SdkNotificationMemoryUnits.has(targetIndex)
        ? 'Target105 replaces process-wide session-state callbacks with one SessionStateManager per headless run and threads it through QueryEngine, whose relevant-memory attachment path also emits the exact SDK memory_recall select/synthesize event with normalized scope and synthesis content.'
        : 'Target105 replaces process-wide session-state callbacks with one SessionStateManager per headless run and threads its state, metadata, permission-mode, and command-lifecycle channels through StructuredIO, RemoteIO, QueryEngine, tool contexts, and the app-state store.'
    }
    if (target105SkillListingUnits.has(targetIndex)) {
      return target105SkillActivatedOtelUnits.has(targetIndex)
        ? 'Target105 adds configurable skill-listing enforcement and emits skill_activated OpenTelemetry from the inline invocation path with skill, source, kind, plugin, and marketplace metadata; current source preserves later listing-precedence and custom-skill privacy evolution.'
        : 'Target105 adds configurable skill-listing description and budget limits, name-only/user-only/off override surfaces, usage-prioritized truncation, model-invocation enforcement, AppState truncation feedback, and resume-safe listing suppression; the current owner preserves the later settings precedence and explicit-invocation evolution.'
    }
    if (target105EventLoopUnits.has(targetIndex)) {
      return 'Target105 introduces the gated event-loop stall detector with a 200ms cadence, telemetry above 500ms, and sleep/wake plus terminal-mode recovery above 5000ms.'
    }
    if (target105MemoryThresholdUnits.has(targetIndex)) {
      return 'Target105 logs memory threshold telemetry monotonically once at high and once at critical, including rounded RSS and heap usage in MiB.'
    }
    if (target105AutoModeStateUnits.has(targetIndex)) {
      return 'Target105 replaces auto-mode module globals with an explicit factory-backed state object while retaining the exported active, CLI-flag, circuit-breaker, and test-reset operations.'
    }
    if (target105GitUnits.has(targetIndex)) {
      return 'Target105 adds per-repository branch watching and cached invalidation, and redacts embedded git credentials from repository and bridge diagnostic logs while preserving the raw URL sent to the bridge API; the current owner adds listener unsubscribe and one-time cleanup registration.'
    }
    if (target105AtomicTeamFileUnits.has(targetIndex)) {
      return 'Target105 serializes team-file mutation under a dedicated lock, suppresses no-op writes, always releases the lock, and routes member removal and active-state updates through the atomic helper.'
    }
    if (target105AtomicTeammateReservationUnits.has(targetIndex)) {
      return 'Target105 atomically reserves a unique sanitized teammate name, identifier, and color before backend launch; updates backend metadata under the team-file lock; clears and writes the mailbox before launch; rolls back pane and membership on pre-commit failure; and preserves already-running members after commit.'
    }
    if (target105FullCompactionCompletionUnits.has(targetIndex)) {
      return 'Target105 records full-compaction start, pre/post token counts, rounded boundary duration, and exact failure text; persists completion metadata on the compact boundary; emits manual/automatic completion telemetry in finally; and reports success or failure through the SDK status channel.'
    }
    if (target105PartialCompactionCompletionUnits.has(targetIndex)) {
      return target105SdkNotificationMemoryUnits.has(targetIndex)
        ? 'Target105 records partial-compaction completion and mirrors interactive compaction failures to the SDK notification channel with the exact key, text, priority, and error color.'
        : 'Target105 records partial-compaction start, pre/post token counts, and exact failure text; persists the post-token count on the compact boundary; emits manual completion telemetry in finally; and reports success or failure through the SDK status channel.'
    }
    if (target105OfficialMarketplaceGcsRollbackUnits.has(targetIndex)) {
      return 'Target105 atomically promotes a staged official marketplace through a best-effort backup: tolerates an absent live tree, restores the prior tree if promotion fails, removes stale and successful backups, and preserves path validation and telemetry.'
    }
    if (target105HfiAuthCleanupUnits.has(targetIndex)) {
      return 'Target105 removes a stale hfi-auth.json from the configured Claude home during retention cleanup, counts successful removal, ignores ENOENT, reports other errors, and awaits the cleanup before paste and worktree retention.'
    }
    if (target105SessionAppendPolicyUnits.has(targetIndex)) {
      return 'Target105 replaces the session append if-chain with an explicit exported policy table, always-appends metadata, routes agent content replacements to the sidechain file, validates transcript-only dedup policy, and preserves main/sidechain dedup and remote persistence semantics.'
    }
    if (target105MarkdownOrderedListUnits.has(targetIndex)) {
      return 'Target105 recognizes ordered Markdown lists after either the start of input or a newline with zero to three leading spaces, preserving valid indented list rendering through target116.'
    }
    if (target105MarkdownWhitespaceUnits.has(targetIndex)) {
      return 'Target105 changes normal Markdown and dedicated blockquote boundaries to remove only leading newlines and trailing whitespace, preserving meaningful leading indentation that the prior full trim discarded.'
    }
    if (target105MetaEnterTabUnits.has(targetIndex)) {
      return 'Target105 recognizes ESC-prefixed carriage return, line feed, and tab as Meta+Return, Meta+Enter, and Meta+Tab while retaining the plain-key behavior and return raw-value normalization.'
    }
    if (target105GracefulShutdownUnits.has(targetIndex)) {
      return 'Target105 persists whether the previous session shut down gracefully, resets the marker when the next cost hook mounts, saves costs during graceful unmount, and exports the previous-session flag in setup telemetry.'
    }
    if (target105SkillActivatedOtelUnits.has(targetIndex)) {
      return 'Target105 emits skill_activated OpenTelemetry at both forked and inline invocation sites with skill, source, kind, plugin, and marketplace metadata; current source preserves the later custom-skill privacy redaction.'
    }
    if (target105PluginInstallOtelUnits.has(targetIndex)) {
      return 'Target105 emits plugin_installed OpenTelemetry from the core installer after cache invalidation, including raw plugin, version, marketplace, official-status, and trigger metadata, and threads exact ui and cli trigger labels from both callers; current source preserves later tool-detail privacy gating.'
    }
    if (target105ToolSearchMcpNonblockingUnits.has(targetIndex)) {
      return 'Target105 includes the live MCP_CONNECTION_NONBLOCKING mode in the shared tool-search decision telemetry object, making it observable for every enabled and disabled return branch through target116.'
    }
    if (target105SdkAuxiliaryUnits.has(targetIndex)) {
      if (
        target105SdkSkipTranscriptUnits.has(targetIndex) &&
        target105SdkNotificationMemoryUnits.has(targetIndex)
      ) {
        return 'Target105 extends the SDK schema union with task skip_transcript metadata plus exact text-notification and memory_recall select/synthesize messages while preserving the previously introduced memory_paths system-init field.'
      }
      if (target105SdkSkipTranscriptUnits.has(targetIndex)) {
        return 'Target105 propagates skipTranscript from task state through task_started and every Dream task terminal notification so ambient housekeeping work can be hidden from inline SDK transcripts.'
      }
      return 'Target105 mirrors reachable ExitPlan fallback and non-recursive Stop-hook errors to SDK notifications, and emits exact memory_recall select/synthesize events for relevant-memory attachments with normalized scope and synthesis content.'
    }
    if (target105TeleportTrustedDeviceUnits.has(targetIndex)) {
      return 'Target105 lazily reads and forwards the stored trusted-device token when the trusted-device gate is enabled before fetching Teleport session events, while leaving the disabled path token-free.'
    }
    if (target105GitBundleBaseRefUnits.has(targetIndex)) {
      return 'Target105 threads the review merge base into Git-bundle creation and, during squashed fallback, synthesizes a seed commit from that base tree as the new parent while retaining exact graceful failure logging.'
    }
    if (target105McpOAuthDiscoveryUnits.has(targetIndex)) {
      return 'Target105 records whether OAuth metadata discovery really succeeded, requires that state before classifying a tokenless MCP server as authentication-required, preserves it across step-up revocation, and clears stale tokenless entries after successful HTTP or SSE connections.'
    }
    if (target105AnalyticsStateUnits.has(targetIndex)) {
      return 'Target105 replaces analytics queue and sink module globals with a factory-backed state object while preserving idempotent attachment, asynchronous queue draining, synchronous/asynchronous dispatch, and isolated test reset behavior.'
    }
    if (target105TeamMemoryAclUnits.has(targetIndex)) {
      return 'Target105 makes a missing repository retryable, prioritizes server error codes in suppression state, and renders exact organization ACL denied/unconfigured guidance with an administrator action.'
    }
    if (target105AttachmentMessageUnits.has(targetIndex)) {
      return 'Target105 dispatches all 36 attachment message variants, including the deferred-tool handler and explicit no-op behavior for maximum-turn, current-session-memory, and teammate-shutdown-batch attachments.'
    }
    if (target105PluginSettingsDescriptionUnits.has(targetIndex)) {
      return 'Target105 expands the plugin settings schema description from the agent-only allowlist to the reachable agent and subagentStatusLine allowlist surface, while current source preserves the later centralized settings-key evolution.'
    }
    if (target105TrustedDevicePolicyUnits.has(targetIndex)) {
      return 'Target105 gates trusted-device token access and enrollment on the loaded require_trusted_devices organization policy in addition to the feature gate, with an exact disabled-policy diagnostic.'
    }
    if (target105RecalledMemoryUnits.has(targetIndex)) {
      return 'Target105 introduces synthesized-memory parsing, team/private citation counts, fullscreen recalled-memory rendering and click/keyboard rating, message UUID propagation, and the reachable REPL hotkey gate; target116 retains the graph.'
    }
    if (target105ApiRetryTelemetryUnits.has(targetIndex)) {
      return 'Target105 omits undefined API status fields and emits api_retries_exhausted after retry attempts with exact attempt, duration, model, error, status, and speed metadata; current source adds later request attribution.'
    }
    if (target105FirstAttemptRequestIdUnits.has(targetIndex)) {
      return 'Target105 preserves the failed streaming request identifier before either non-streaming fallback, threads it through duration logging, and emits firstAttemptRequestId only when the final request succeeds under a different identifier.'
    }
    if (target105ManagedAgentDocUnits.has(targetIndex)) {
      return 'Target105 evolves the exact cooked Managed Agents language-specific and shared reference assets; every document has a dedicated source owner and is reachable through the Claude API content map.'
    }
    if (target105PluginManifestVersionUnits.has(targetIndex)) {
      return 'Target105 reads plugin versions from the canonical .claude-plugin/plugin.json manifest and logs the exact extraction failure diagnostic while preserving unknown fallback.'
    }
    if (target105McpElicitationFormUnits.has(targetIndex)) {
      return 'Target105 routes MCP elicitation form input through a focused keyboard event surface, prevents only handled branches, manages raw mode for the form lifetime, and preserves the extracted field renderer.'
    }
    if (target105ReactiveCompactionUnits.has(targetIndex)) {
      return `Target105 introduces gated reactive compaction with gap-guided retries, media stripping fallback, exact attempt and outcome telemetry, query retry integration, actionable manual-command errors, token accounting, SDK result state, and post-compaction cleanup.${
        target105MalformedToolUseUnits.has(targetIndex)
          ? ' The same authenticated query unit independently captures streamed tool_use stop metadata, retries a response with no parsed tool block exactly once with telemetry, and emits a terminal API error if the retry is also malformed.'
          : ''
      }`
    }
    if (target105TmuxFocusUnits.has(targetIndex)) {
      return 'Target105 migrates fullscreen caches into explicit per-session state, probes tmux focus-events once, emits the exact remediation hint only when focus events are disabled, and mounts the independent low-priority REPL notification.'
    }
    if (target105SessionStateUnits.has(targetIndex)) {
      return 'Target105 replaces session notification module globals with an explicit SessionStateManager while preserving pending-action metadata, running and idle summary clearing, opt-in SDK events, and legacy default-instance wrappers.'
    }
    if (target105KeybindingSelectionUnits.has(targetIndex)) {
      return 'Target105 adds reachable newline, transcript pager, selection-extension, Doctor, and message-action keybinding schema surfaces, routes scroll actions through named keybinding contexts, preserves repeated coalesced pager input, and moves selection focus through the explicit keybinding handlers; current source preserves the later virtual-anchor selection evolution.'
    }
    if (target105FeedbackPayloadUnits.has(targetIndex)) {
      return 'Target105 adds the bounded feedback payload precheck, one-shot minimal retry, retry and failure telemetry, focus-scoped completion/consent input, and exact authentication, identifier, HTTP, size, timeout, ZDR, and network error classifications on top of the transitive target98 byte serializer; current source preserves later signed-out and skip-GitHub behavior.'
    }
    if (target105BackgroundWorkUnits.has(targetIndex)) {
      return 'Target105 detects scheduled background work on interactive and command exit paths, renders the exact stay/exit confirmation with item details and telemetry, and only shuts down after confirmation; current source adds target116 viewport-aware truncation without changing the decision graph.'
    }
    if (target105RequestTooLargeUnits.has(targetIndex)) {
      return 'Target105 recognizes request_too_large media errors, distinguishes 413 context-window failures as PromptTooLong from generic RequestTooLarge failures with exact details, and reports the matching API error status category.'
    }
    if (target105UltrareviewUnits.has(targetIndex)) {
      return 'Target105 replaces local quota inference with the authenticated ultrareview preflight contract, validates proceed, confirm, and blocked responses, renders server-provided confirmation and administrator actions, and propagates exact source and bundle-base metadata into remote review launches.'
    }
    if (target105HookRegistryUnits.has(targetIndex)) {
      return 'Target105 exports the complete 27-event hook registry, applies the configured bounded SessionEnd timeout, and validates root and event-specific hookSpecificOutput payloads with exact error paths and diagnostics.'
    }
    if (target105UpstreamRelayDrainUnits.has(targetIndex)) {
      return 'Target105 defers upstream relay termination while buffered Bun socket writes remain, records the pending end, and closes only after the final drain clears the buffer.'
    }
    if (target105HeadlessMcpPrewaitUnits.has(targetIndex)) {
      return 'Target105 waits before the first headless command only when MCP clients are still pending and no MCP tools are already available, with a bounded poll and exact before/after telemetry; the current owner preserves the later wait-whenever-pending evolution.'
    }
    if (target105BackendRegistryUnits.has(targetIndex)) {
      return 'Target105 replaces mutable backend module globals with an explicit BackendRegistry state object, exports a factory and global instance, and threads the registry through detection, lookup, startup, cleanup, reset, and shutdown operations.'
    }
    if (target105TaskRegistryUnits.has(targetIndex)) {
      return 'Target105 replaces direct AppState task mutation with a live TaskRegistry abstraction across local, remote, shell, dream, teammate, plugin, headless, and interactive task families, including registration, updates, lookup, removal, terminal eviction, attachment offsets, and explicit no-op isolation contexts.'
    }
    if (target105SdkMemoryPathsUnits.has(targetIndex)) {
      return 'Target105 adds the optional SDK init memory_paths payload, emits the auto-memory directory only when auto memory is enabled, and adds the team-memory directory only behind both the TEAMMEM gate and live team-memory availability.'
    }
    if (target105RemoteTriggerSchemaUnits.has(targetIndex)) {
      return 'Target105 updates the reachable RemoteTrigger input schema to advertise that the run action accepts an optional body, matching the payload propagation introduced at target101.'
    }
    if (target105TreeConnectorUnits.has(targetIndex)) {
      return 'Target105 introduces the reusable Tree/Connector runtime with outline and branching ancestor contexts, exact figures glyphs, last-child propagation, selectable content isolation, and the public Tree.Node composition API.'
    }
    if (target105ClientPresencePlatformUnits.has(targetIndex)) {
      return 'Target105 changes the reachable bridge presence request platform from cli to claude_code_cli while preserving its focus subscription, throttling, session identity, authorization, and teardown behavior.'
    }
    if (target105PromptCacheBreakUnits.has(targetIndex)) {
      return 'Target105 introduces Cowork-gated prompt-cache break detection across sanitized system, tool, and API-message inputs, excluding billing headers and computer-use MCP data while reporting exact per-block and message-history mutation causes and telemetry.'
    }
    if (target105WorktreeLifecycleUnits.has(targetIndex)) {
      return 'Worktree removal reports source and changed-file telemetry, and stale cleanup permits a branch with unreachable commits only when its upstream is gone and it has no unique commits relative to the resolved default remote.'
    }
    if (target105LoopProactiveUnits.has(targetIndex)) {
      return 'The target105 /loop registration adds proactive as an exact reachable alias while retaining the previously introduced autonomous, fixed-interval, and dynamic scheduling behavior.'
    }
    if (target105AgentConcurrencyUnits.has(targetIndex)) {
      return 'Target105 changes both conditional agent-concurrency guidance surfaces to recommend a single parallel tool-use message specifically for independent work, replacing the unconditional maximize-performance wording while preserving subscription and initial-listing gates.'
    }
    if (target105PrintResumeTelemetryUnits.has(targetIndex)) {
      return 'Target105 adds six outcome events to print-mode resume: three not-found input/transcript exits, the resumeSessionAt processing failure, successful duration, and a phase-aware catch that records load_error or processing_error with the safe error name.'
    }
    if (target105LogRepoUnits.has(targetIndex)) {
      return 'The resume selector changes its project filter from directory wording to repository/project wording while retaining the target Space-or-Ctrl+V preview behavior and stateful filter labels.'
    }
    if (owner === 'src/utils/subagentStatusLine.ts') {
      return 'The configured command receives bounded task/token history, trusted project context, a five-second deadline, and produces validated per-task JSONL decorations.'
    }
    if (target105RecapUnits.has(targetIndex)) {
      return 'The interactive recap command invokes the shared cache-safe generator, distinguishes user cancellation from unavailable generation, and remains noninteractive-disabled behind the target feature gate.'
    }
    if (owner === 'src/hooks/useSubagentStatusLine.ts') {
      return 'The footer polls decorations after 300ms and every five seconds, prevents overlap, filters stale task IDs, and avoids equal-state writes.'
    }
    if (owner === 'src/components/CoordinatorAgentStatus.tsx' || owner === 'src/components/PromptInput/PromptInput.tsx') {
      return 'Empty decorations hide task rows while selection follows the nearest surviving task across decoration changes.'
    }
    if (owner === 'src/components/PromptInput/PromptInputFooterLeftSide.tsx') {
      return 'The polling hook runs before footer early returns, so hidden or transient footer states cannot suspend configured decoration updates.'
    }
    if (owner === 'src/state/AppStateStore.ts' || owner === 'src/main.tsx') {
      return 'Every interactive state initializer owns an empty task-decoration map before the status-line hook can run.'
    }
    if (owner === 'src/utils/mcpOutputStorage.ts') {
      return 'MCP persisted-output instructions select JSON, long-line, or computed Read-chunk recipes from exact format and line statistics.'
    }
    if (owner === 'src/services/mcp/client.ts') {
      return 'The MCP caller unwraps safe single-text results, records persistence shape, computes line statistics, and supplies them to the instruction owner.'
    }
  }
  if (
    caseName === '2.1.105-to-2.1.107' &&
    target107ThinkingAgentUnits.has(targetIndex)
  ) {
    if ([9197, 9198, 9203].includes(targetIndex)) {
      return 'Resolved Opus 4.6 subagent models inherit the merged one-million-token suffix only when the merge gate is enabled and the model does not already carry a context suffix.'
    }
    if ([16605, 16607, 16622, 16636].includes(targetIndex)) {
      return 'The Opus 4.6 client-data gate inserts the exact system-reminder guidance section and exports the exact follow-up reminder text.'
    }
    if ([17923, 17925].includes(targetIndex)) {
      return 'Eligible non-meta follow-up prompts using the default system prompt append the thinking-guidance reminder only after an assistant turn and only while thinking remains enabled.'
    }
    return 'The target107 interactive thinking milestones move to ten, thirty, fifty, eighty, and one-hundred-twenty seconds with the exact target messages.'
  }
  return `Target runtime unit is source-map attributed to ${owner} and retained by the cumulative semantic source tree.`
}

const dispositionOrder = [
  'alpha-equivalent',
  'dependency-runtime',
  'generated-metadata',
  'dce-nonruntime',
  'source-runtime-covered',
  'source-runtime-gap',
]

for (const [caseName, targetVersion, targetCommit] of cases) {
  const selectedCase = process.argv.find(argument => argument.startsWith('--case='))?.slice(7)
  if (selectedCase && selectedCase !== caseName) continue
  const caseDir = path.join(root, 'recovery/cases', caseName)
  const structural = gzipJson(path.join(caseDir, 'structural/generated-delta.json.gz'))
  const sourceRows = gzipLines(path.join(caseDir, 'attribution/sources.jsonl.gz'))
  const attribution = {
    sources: new Map(sourceRows.map(row => [row.sourceIndex, row.source])),
    partitions: gzipLines(path.join(caseDir, 'attribution/target-partitions.jsonl.gz')),
    initializers: gzipLines(path.join(caseDir, 'attribution/target-initializers.jsonl.gz')),
  }
  const semanticIndexes = changedTargetIndexes(fs.readFileSync(path.join(caseDir, 'readable-diff/statements.diff'), 'utf8'))
  const bundle = fs.readFileSync(path.join(artifactRoot, targetVersion, 'package/cli.js'), 'utf8')
  const counts = new Map()
  const ownerCounts = new Map()
  const missing = []
  const mcpOutputStorageRows = []
  const ledgerRows = []
  const increment = key => counts.set(key, (counts.get(key) ?? 0) + 1)
  for (const region of structural.regions.filter(region => region.classification !== 'matched')) {
    const target = region.target
    if (region.classification === 'moved' || !semanticIndexes.has(target.index)) {
      increment('alpha-equivalent')
      ledgerRows.push({
        targetIndex: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        structuralClass: region.classification,
        disposition: 'alpha-equivalent',
        ownerIds: [],
        evidenceIds: [
          region.classification === 'moved'
            ? 'structural-exact-pair'
            : 'readable-no-semantic-change',
        ],
      })
      continue
    }
    const snippet = bundle.slice(target.start, target.end)
    if (
      caseName === '2.1.96-to-2.1.97' &&
      target97LinkScanOffsetDceUnits.has(target.index)
    ) {
      increment('dce-nonruntime')
      ledgerRows.push({
        targetIndex: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        structuralClass: region.classification,
        disposition: 'dce-nonruntime',
        ownerIds: [],
        evidenceIds: ['link-scan-offset97-static-ast'],
        category: 'unread-module-binding',
        reason: 'The target97 schema containing linkScanOffset is assigned to a module binding whose identifier occurs only at its declaration and initializer assignment; it is never read or invoked and cannot affect parsing, control flow, mutation, return values, or calls.',
      })
      continue
    }
    if (
      caseName === '2.1.97-to-2.1.98' &&
      target98LoopUntilDceUnits.has(target.index)
    ) {
      increment('dce-nonruntime')
      ledgerRows.push({
        targetIndex: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        structuralClass: region.classification,
        disposition: 'dce-nonruntime',
        ownerIds: [],
        evidenceIds: ['loop-until98-static-ast'],
        category: 'unused-local-binding',
        reason: 'The target98 /until RegExp match result is assigned to a local binding whose identifier occurs exactly once at its declaration; it controls no branch, mutation, return value, or call argument and is therefore runtime-unobservable.',
      })
      continue
    }
    if (
      caseName === '2.1.100-to-2.1.101' &&
      target101DormantSessionSchemaUnits.has(target.index)
    ) {
      increment('dce-nonruntime')
      ledgerRows.push({
        targetIndex: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        structuralClass: region.classification,
        disposition: 'dce-nonruntime',
        ownerIds: [],
        evidenceIds: ['dormant-session-schema101-static-ast'],
        category: 'unread-module-binding',
        reason: 'The target101 schema factory is assigned to a module binding that has exactly two occurrences in the full bundle: its outer declaration and this initializer assignment. It is never read or invoked, so the added linkScanPath and proactive fields cannot affect a branch, call, mutation, return value, or observable schema parse.',
      })
      continue
    }
    if (
      !(caseName === '2.1.96-to-2.1.97' && target97TranscriptMirrorUnits.has(target.index)) &&
      !(caseName === '2.1.96-to-2.1.97' && target97SessionWriterUnits.has(target.index)) &&
      !(caseName === '2.1.96-to-2.1.97' && target97BridgeGitContextUnits.has(target.index)) &&
      !(caseName === '2.1.96-to-2.1.97' && target97MarkdownBlockquoteUnits.has(target.index)) &&
      !(caseName === '2.1.96-to-2.1.97' && target97McpResultSizeUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98McpResourceTemplateUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98AgentsRuntimeUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98PluginScopeFallbackUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98ProviderSetupUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98PrDetailsUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98WebSetupEnvironmentUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98ConsoleOAuthUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98BridgeLateResponseUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98EffortCapabilityUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98SessionsWebSocketUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98WrappedContentFeedbackUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98StopHookFocusUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98DynamicImageLimitUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101LoopDefaultUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101McpDirectoryRegistryUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SdkOAuthControlUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SettingsSanitizationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101InkEventUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101InkLifecycleUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SdkTelemetryTaskUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101PluginRuntimeUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101WorktreeRecoveryUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101LoopsCommandUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101PrintResumeTitleUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SafetyUiUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101StateOperationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101RemoteIngressUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101AwaySummaryUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101InvalidSettingsUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101FrameHtmlPermissionUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101OpenFrameKeybindingUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ClientPresenceUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101HomebrewVersionUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ManagedHookLoadingUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101WorktreeResumeHintUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101CcrSourceViabilityUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101InsightsResponseUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101TrustedDeviceRetryUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101BridgeWorktreePreservationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101AgentTaskNotificationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101AgentBackgroundGuidanceUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ToolSearchMcpNameUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101TeamMemoryAvailabilityUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101MainInputNormalizationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101KeybindingLoaderUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101AgentMetadataMirrorUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101BackgroundSessionPromptUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101UpdateCommandUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101MessageRatingHoverUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101KillRingContextUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101TeamCreateExclusiveUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101FileSuggestionStateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ClassifierApprovalUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ToolProgressOverlayUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101RemoteTriggerRunUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ScheduleRemoteGateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ComputerUseStateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101CompactHookStateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101RemoteSettingsValidationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101StoredImageStateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ApiErrorRateLimitUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ContextUnattributedUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101OAuthUrlOutdentUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SuggestionPaddingUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SessionEnvUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101CommandDisplaySearchUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101CommandAgentBootstrapUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ChromeOnboardingFocusUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101RemoteIoWriteTrackingUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101LogPreviewUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ResumeSelectorUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101BetaTracingPrivacyUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SingleDigitSelectUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101StartupRuntimeUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ClaudeApiTriggerUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105LoopProactiveUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AgentConcurrencyUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105PrintResumeTelemetryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105LogRepoUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RecapUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105WorktreeLifecycleUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105PromptCacheBreakUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ClientPresencePlatformUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RemoteTriggerSchemaUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TreeConnectorUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TaskRegistryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SdkMemoryPathsUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105HeadlessMcpPrewaitUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105BackendRegistryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SkillListingUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105EventLoopUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105MemoryThresholdUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AutoModeStateUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105GitUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AtomicTeamFileUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AnalyticsStateUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TeamMemoryAclUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AttachmentMessageUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105PluginSettingsDescriptionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TrustedDevicePolicyUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RecalledMemoryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ApiRetryTelemetryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105FirstAttemptRequestIdUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ManagedAgentDocUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105PluginManifestVersionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105McpElicitationFormUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ReactiveCompactionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TmuxFocusUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SessionStateUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105KeybindingSelectionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105FeedbackPayloadUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105BackgroundWorkUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RequestTooLargeUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105UltrareviewUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105HookRegistryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105UpstreamRelayDrainUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AwaySummaryConfigUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105MemorySurveyUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105StripPromptXmlUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105FilesystemPermissionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105WorkerRawCommandUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ToolSearchMcpTelemetryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ConfigTrustReasonUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RepoCheckoutUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SkillsMenuUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RequestSizeLimitUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105DatadogAllowlistUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105FileReadMitigationUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SessionStatePropagationUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SkillDynamicStateUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SessionAppendPolicyUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105MarkdownWhitespaceUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SdkAuxiliaryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TeleportTrustedDeviceUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105GitBundleBaseRefUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105McpOAuthDiscoveryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105MessageRatingSurfaceUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105WorktreeResumeNameUnits.has(target.index)) &&
      new RegExp(`VERSION:["']${targetVersion.replaceAll('.', '\\.')}`).test(snippet) &&
      /BUILD_TIME:/.test(snippet)
    ) {
      increment('generated-metadata')
      ledgerRows.push({
        targetIndex: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        structuralClass: region.classification,
        disposition: 'generated-metadata',
        ownerIds: [],
        evidenceIds: ['release-build-metadata'],
        category: 'release-build-metadata',
        reason: `Generated release macro embeds VERSION ${targetVersion} and BUILD_TIME; it is not first-party runtime source behavior.`,
      })
      continue
    }
    if (snippet.includes('/home/runner/code/tmp/claude-cli-external-build-')) {
      increment('generated-metadata')
      ledgerRows.push({
        targetIndex: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        structuralClass: region.classification,
        disposition: 'generated-metadata',
        ownerIds: [],
        evidenceIds: ['external-build-path-metadata'],
        category: 'external-build-absolute-path',
        reason: 'Static target AST embeds the ephemeral external-build workspace used to package computer-use native JavaScript; the absolute runner path is generated build metadata, not a first-party runtime source behavior delta.',
      })
      continue
    }
    const attributed = attributedSources(target, attribution)
    if (attributed.some(row => row.source.endsWith('/src/utils/mcpOutputStorage.ts') || row.source.endsWith('../src/utils/mcpOutputStorage.ts'))) {
      mcpOutputStorageRows.push({
        index: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        snippet: snippet.slice(0, 1000),
        attribution: attributed.filter(row => row.source.includes('mcpOutputStorage')).slice(0, 3),
      })
    }
    if (
      !(caseName === '2.1.96-to-2.1.97' && target97LoopChainStateUnits.has(target.index)) &&
      !(caseName === '2.1.96-to-2.1.97' && target97SessionWriterUnits.has(target.index)) &&
      !(caseName === '2.1.96-to-2.1.97' && target97BridgeGitContextUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98McpResourceTemplateUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98AgentsRuntimeUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98PluginScopeFallbackUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98ProviderSetupUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98PrDetailsUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98WebSetupEnvironmentUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98ConsoleOAuthUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98BridgeLateResponseUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98EffortCapabilityUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98SessionsWebSocketUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98WrappedContentFeedbackUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98StopHookFocusUnits.has(target.index)) &&
      !(caseName === '2.1.97-to-2.1.98' && target98DynamicImageLimitUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101LoopDefaultUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101McpDirectoryRegistryUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SdkOAuthControlUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SettingsSanitizationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101InkEventUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SdkTelemetryTaskUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101PluginRuntimeUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101WorktreeRecoveryUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101LoopsCommandUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101PrintResumeTitleUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SafetyUiUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101StateOperationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101RemoteIngressUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101AwaySummaryUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101InvalidSettingsUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101FrameHtmlPermissionUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101OpenFrameKeybindingUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ClientPresenceUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101HomebrewVersionUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ManagedHookLoadingUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101WorktreeResumeHintUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101CcrSourceViabilityUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101InsightsResponseUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101TrustedDeviceRetryUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101BridgeWorktreePreservationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101AgentTaskNotificationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101AgentBackgroundGuidanceUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ToolSearchMcpNameUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101TeamMemoryAvailabilityUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101MainInputNormalizationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101KeybindingLoaderUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101AgentMetadataMirrorUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101BackgroundSessionPromptUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101UpdateCommandUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101MessageRatingHoverUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101KillRingContextUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101TeamCreateExclusiveUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101FileSuggestionStateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ClassifierApprovalUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ToolProgressOverlayUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101RemoteTriggerRunUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ScheduleRemoteGateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ComputerUseStateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101CompactHookStateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101RemoteSettingsValidationUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101StoredImageStateUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ApiErrorRateLimitUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ContextUnattributedUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101OAuthUrlOutdentUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SuggestionPaddingUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SessionEnvUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101CommandDisplaySearchUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101CommandAgentBootstrapUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ChromeOnboardingFocusUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101RemoteIoWriteTrackingUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101LogPreviewUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ResumeSelectorUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101BetaTracingPrivacyUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101SingleDigitSelectUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101StartupRuntimeUnits.has(target.index)) &&
      !(caseName === '2.1.100-to-2.1.101' && target101ClaudeApiTriggerUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105LoopProactiveUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AgentConcurrencyUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105PrintResumeTelemetryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105LogRepoUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RecapUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105WorktreeLifecycleUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105PromptCacheBreakUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ClientPresencePlatformUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RemoteTriggerSchemaUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TreeConnectorUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TaskRegistryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SdkMemoryPathsUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105HeadlessMcpPrewaitUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105BackendRegistryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SkillListingUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105EventLoopUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105MemoryThresholdUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AutoModeStateUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105GitUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AtomicTeamFileUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AnalyticsStateUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TeamMemoryAclUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AttachmentMessageUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105PluginSettingsDescriptionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TrustedDevicePolicyUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RecalledMemoryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ApiRetryTelemetryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105FirstAttemptRequestIdUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ManagedAgentDocUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105PluginManifestVersionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105McpElicitationFormUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ReactiveCompactionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TmuxFocusUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SessionStateUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105KeybindingSelectionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105FeedbackPayloadUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105BackgroundWorkUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RequestTooLargeUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105UltrareviewUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105HookRegistryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105UpstreamRelayDrainUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105AwaySummaryConfigUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105MemorySurveyUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105StripPromptXmlUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105FilesystemPermissionUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105WorkerRawCommandUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ToolSearchMcpTelemetryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105ConfigTrustReasonUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RepoCheckoutUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SkillsMenuUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105RequestSizeLimitUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105DatadogAllowlistUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105FileReadMitigationUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SessionStatePropagationUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SkillDynamicStateUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SessionAppendPolicyUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105MarkdownWhitespaceUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105SdkAuxiliaryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105TeleportTrustedDeviceUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105GitBundleBaseRefUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105McpOAuthDiscoveryUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105MessageRatingSurfaceUnits.has(target.index)) &&
      !(caseName === '2.1.104-to-2.1.105' && target105WorktreeResumeNameUnits.has(target.index)) &&
      attributed[0]?.source.includes('/node_modules/')
    ) {
      increment('dependency-runtime')
      ledgerRows.push({
        targetIndex: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        structuralClass: region.classification,
        disposition: 'dependency-runtime',
        ownerIds: [],
        evidenceIds: ['dependency-source-map'],
        category: 'third-party-dependency-runtime',
        reason: `Highest-weight exact attribution is ${attributed[0].source}; no target-pinned dependency source archive, application dependency graph, or build recipe is available, so this remains a whole-bundle source-reproduction gap.`,
      })
      continue
    }
    const fallback = fallbackOwner(caseName, target.index, snippet)
    const candidates = [...new Set(attributed.map(row => sourcePath(row.source)).filter(Boolean))]
    // A hand-audited fallback is the precise semantic owner for this unit. Do
    // not retain every coarse source-map candidate alongside it: bundled
    // initializer ranges routinely map to dozens of unrelated first-party
    // files, which lets an observable literal match a coincidental owner.
    const ownerPaths = fallback
      ? [fallback]
      : [
          ...new Set(
            candidates.filter(
              candidate =>
                existsAt(targetCommit, candidate) &&
                fs.existsSync(path.join(root, candidate)),
            ),
          ),
        ]
    const owner = fallback ?? ownerPaths[0]
    if (ownerPaths.length > 0) {
      increment('source-runtime-covered')
      for (const ownerPath of ownerPaths) {
        ownerCounts.set(ownerPath, (ownerCounts.get(ownerPath) ?? 0) + 1)
      }
      ledgerRows.push({
        targetIndex: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        structuralClass: region.classification,
        disposition: 'source-runtime-covered',
        ownerPaths,
        ownerIds: [],
        evidenceIds:
          caseName === '2.1.96-to-2.1.97' &&
          target97BridgeGitContextUnits.has(target.index)
            ? [
                'bridge-git-session-context97-semantic-test',
                'bridge-git-session-context97-target-units',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
          target97SessionWriterUnits.has(target.index)
            ? [
                'session-writer-coordination97-semantic-test',
                'session-writer-coordination97-target-units',
                ...(target97TranscriptMirrorUnits.has(target.index)
                  ? [
                      'transcript-mirror-semantic-test',
                      'transcript-mirror-target-units',
                    ]
                  : []),
                ...(target97RateLimitUpgradeUnits.has(target.index)
                  ? [
                      'rate-limit-upgrade-semantic-test',
                      'rate-limit-upgrade-target-units',
                    ]
                  : []),
                ...(target97DynamicPromptUnits.has(target.index)
                  ? [
                      'dynamic-prompt-semantic-test',
                      'dynamic-prompt-target-units',
                    ]
                  : []),
              ]
          : caseName === '2.1.96-to-2.1.97' &&
          target97AgentEffortCapUnits.has(target.index)
            ? ['agent-effort-cap-semantic-test', 'agent-effort-cap-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97ModelFamilyPromptUnits.has(target.index)
            ? ['model-family-prompt-semantic-test', 'model-family-prompt-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97ResumeRefreshUnits.has(target.index)
            ? ['resume-refresh-semantic-test', 'resume-refresh-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97BridgeCleanupUnits.has(target.index)
            ? ['bridge-cleanup-semantic-test', 'bridge-cleanup-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97BridgeCommandAliasUnits.has(target.index)
            ? ['bridge-command-alias-semantic-test', 'bridge-command-alias-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97FocusCollapseUnits.has(target.index)
            ? ['focus-collapse-semantic-test', 'focus-collapse-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97MarkdownBlockquoteUnits.has(target.index)
            ? ['markdown-blockquote97-semantic-test', 'markdown-blockquote97-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97UnifiedInstalledAuthUnits.has(target.index)
            ? [
                'unified-installed-auth-shortcut-target',
                'unified-installed-auth-shortcut-semantic-test',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
              target97AdditionalModelCostsUnits.has(target.index)
            ? [
                'additional-model-costs97-target-units',
                'additional-model-costs97-semantic-test',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
          target97DynamicPromptUnits.has(target.index)
            ? ['dynamic-prompt-semantic-test', 'dynamic-prompt-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97DeferredToolDeltaUnits.has(target.index)
            ? ['deferred-tool-delta-semantic-test', 'deferred-tool-delta-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97PrDetailsUnits.has(target.index)
            ? ['pr-details-semantic-test', 'pr-details-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97WorkflowScriptUnits.has(target.index)
            ? ['workflow-script-semantic-test', 'workflow-script-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97ToolInputUnicodeUnits.has(target.index)
            ? ['tool-input-unicode-semantic-test', 'tool-input-unicode-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97HookEvaluatorUnits.has(target.index)
            ? ['hook-evaluator-semantic-test', 'hook-evaluator-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97RecursiveSafetyCheckUnits.has(target.index)
            ? target.index === 13123
              ? [
                  'recursive-safety-check97-semantic-test',
                  'recursive-safety-check97-target-units',
                  'auto-mode-telemetry-semantic-test',
                  'auto-mode-telemetry-target-unit',
                ]
              : [
                  'recursive-safety-check97-semantic-test',
                  'recursive-safety-check97-target-units',
                ]
          : caseName === '2.1.96-to-2.1.97' &&
              target97AutoModeTelemetryUnits.has(target.index)
            ? ['auto-mode-telemetry-semantic-test', 'auto-mode-telemetry-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97ReadOnlyRedirectUnits.has(target.index)
            ? ['readonly-redirects-semantic-test', 'readonly-redirects-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97PlaceholderExpansionUnits.has(target.index)
            ? ['placeholder-expansion-semantic-test', 'placeholder-expansion-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97WorktreeNoTrackUnits.has(target.index)
            ? ['worktree-no-track-semantic-test', 'worktree-no-track-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97TokenWarningUnits.has(target.index)
            ? ['token-warning-semantic-test', 'token-warning-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97CostSteerUnits.has(target.index)
            ? ['cost-steer-semantic-test', 'cost-steer-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97PermissionShortcutUnits.has(target.index)
            ? ['permission-shortcuts-semantic-test', 'permission-shortcuts-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97AgentReplToolPoolUnits.has(target.index)
            ? ['agent-repl-tool-pool97-semantic-test', 'agent-repl-tool-pool97-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97SettingsViewModeUnits.has(target.index)
            ? ['settings-view-mode97-semantic-test', 'settings-view-mode97-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97ImageTokenCompressionUnits.has(target.index)
            ? ['image-token-compression97-semantic-test', 'image-token-compression97-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97McpResultSizeUnits.has(target.index)
            ? ['mcp-result-size97-semantic-test', 'mcp-result-size97-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97RoutineCronStaticUnits.has(target.index)
            ? [
                'middle-semantic-test',
                'authenticated-target-fragments',
                'routine-cron97-static-ast',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
          target97TranscriptMirrorUnits.has(target.index)
            ? ['transcript-mirror-semantic-test', 'transcript-mirror-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97RuntimeUtilityUnits.has(target.index)
            ? ['runtime-utilities-semantic-test', 'runtime-utilities-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97MemoryLifecycleUnits.has(target.index)
            ? ['memory-lifecycle-semantic-test', 'memory-lifecycle-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97AgentRuntimeUnits.has(target.index)
            ? ['agent-runtime-semantic-test', 'agent-runtime-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97RateLimitUpgradeUnits.has(target.index)
            ? ['rate-limit-upgrade-semantic-test', 'rate-limit-upgrade-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97VirtualMessageKeyUnits.has(target.index)
            ? ['virtual-message-keys-semantic-test', 'virtual-message-keys-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97PluginMarketplaceUnits.has(target.index)
            ? ['plugin-marketplace-semantic-test', 'plugin-marketplace-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97VcrImageUnits.has(target.index)
            ? ['vcr-image-semantic-test', 'vcr-image-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97CommandErrorUnits.has(target.index)
            ? ['command-errors-semantic-test', 'command-errors-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97AppleScriptQuoteUnits.has(target.index)
            ? ['applescript-quote-semantic-test', 'applescript-quote-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97FpsTrackerUnits.has(target.index)
            ? ['fps-tracker-semantic-test', 'fps-tracker-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97VoiceTipUnits.has(target.index)
            ? ['voice-tip-semantic-test', 'voice-tip-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97CompactTruncationUnits.has(target.index)
            ? ['compact-truncation-semantic-test', 'compact-truncation-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97CronExtraTaskUnits.has(target.index)
            ? ['cron-extra-tasks-semantic-test', 'cron-extra-tasks-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target97SandboxInboxUnits.has(target.index)
            ? ['sandbox-inbox-semantic-test', 'sandbox-inbox-target-unit']
          : caseName === '2.1.96-to-2.1.97' &&
              target.index === 9905
            ? [
                'team-memory-bash-semantic-test',
                'team-memory-bash-target-units',
                'bash-whitespace-normalization-semantic-test',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
              target97TeamMemoryBashUnits.has(target.index)
            ? ['team-memory-bash-semantic-test', 'team-memory-bash-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97UnicodeDelimiterUnits.has(target.index)
            ? ['unicode-delimiters-semantic-test', 'unicode-delimiters-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97SandboxMachLookupUnits.has(target.index)
            ? ['sandbox-mach-lookup-semantic-test', 'sandbox-mach-lookup-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97AutoDreamFirstEnableUnits.has(target.index)
            ? [
                'auto-dream-first-enable-semantic-test',
                'auto-dream-first-enable-target-unit',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
              target97ReplBridgeConfigAliasUnits.has(target.index)
            ? [
                'repl-bridge-config-aliases-semantic-test',
                'repl-bridge-config-aliases-target-unit',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
              target97AutoModeDenialUnits.has(target.index)
            ? [
                'auto-mode-denials-provider-semantic-test',
                'auto-mode-denials-provider-target-units',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
              target97NotificationLifecycleUnits.has(target.index)
            ? [
                'notification-lifecycle-semantic-test',
                'notification-lifecycle-target-units',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
              target97NotificationReachabilityUnits.has(target.index)
            ? [
                'notification-lifecycle-semantic-test',
                'notification-lifecycle-app-unit',
                'auto-mode-denials-provider-semantic-test',
                'auto-mode-denials-provider-app-unit',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
              target97LoopChainStateUnits.has(target.index)
            ? [
                'loop-chain-state97-semantic-test',
                'loop-chain-state97-target-units',
              ]
          : caseName === '2.1.96-to-2.1.97' &&
              target97DreamVerifyUnits.has(target.index)
            ? ['dream-verify-semantic-test', 'dream-verify-target-units']
          : caseName === '2.1.96-to-2.1.97' &&
              target97ManagedAgentUnits.has(target.index)
            ? ['managed-agents-semantic-test', 'managed-agents-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101BashNewlineSandboxUnits.has(target.index)
            ? ['bash-newline101-semantic-test', 'bash-newline101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101CompactHookStateUnits.has(target.index)
            ? ['compact-hook101-semantic-test', 'compact-hook101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101RemoteSettingsValidationUnits.has(target.index)
            ? ['remote-settings101-semantic-test', 'remote-settings101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101SingleDigitSelectUnits.has(target.index)
            ? ['select-single-digit101-semantic-test', 'select-single-digit101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101StartupRuntimeUnits.has(target.index)
            ? ['startup-runtime101-semantic-test', 'startup-runtime101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101ClaudeApiTriggerUnits.has(target.index)
            ? ['claude-api-trigger101-semantic-test', 'claude-api-trigger101-target-unit']
          : caseName === '2.1.100-to-2.1.101' &&
              target101StoredImageStateUnits.has(target.index)
            ? ['stored-image101-semantic-test', 'stored-image101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101RemoteIoWriteTrackingUnits.has(target.index)
            ? ['remote-io-tracking101-semantic-test', 'remote-io-tracking101-target-unit']
          : caseName === '2.1.100-to-2.1.101' &&
              target101ChromeOnboardingFocusUnits.has(target.index)
            ? ['chrome-onboarding101-semantic-test', 'chrome-onboarding101-target-unit']
          : caseName === '2.1.100-to-2.1.101' &&
              target101CommandAgentBootstrapUnits.has(target.index)
            ? ['command-agent-bootstrap101-semantic-test', 'command-agent-bootstrap101-target-unit']
          : caseName === '2.1.100-to-2.1.101' &&
              target101CommandDisplaySearchUnits.has(target.index)
            ? ['command-display101-semantic-test', 'command-display101-target-unit']
          : caseName === '2.1.100-to-2.1.101' &&
              target101SuggestionPaddingUnits.has(target.index)
            ? ['suggestion-padding101-semantic-test', 'suggestion-padding101-target-unit']
          : caseName === '2.1.100-to-2.1.101' &&
              target101OAuthUrlOutdentUnits.has(target.index)
            ? ['oauth-outdent101-semantic-test', 'oauth-outdent101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101ContextUnattributedUnits.has(target.index)
            ? ['context-unattributed101-semantic-test', 'context-unattributed101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101ApiErrorRateLimitUnits.has(target.index)
            ? ['api-error101-semantic-test', 'api-error101-target-unit']
          : caseName === '2.1.100-to-2.1.101' &&
              target101McpInitHandshakeUnits.has(target.index)
            ? [
                'mcp-init101-semantic-test',
                'mcp-init101-target-units',
                ...(target101StateOperationUnits.has(target.index)
                  ? ['state-operations101-semantic-test', 'state-operations101-target-units']
                  : []),
              ]
          : caseName === '2.1.100-to-2.1.101' &&
              target101ComputerUseStateUnits.has(target.index)
            ? [
                'computer-use-state101-semantic-test',
                'computer-use-state101-target-units',
                ...(target101StateOperationUnits.has(target.index)
                  ? ['state-operations101-semantic-test', 'state-operations101-target-units']
                  : []),
              ]
          : caseName === '2.1.100-to-2.1.101' &&
              target101RemoteTriggerRunUnits.has(target.index)
            ? ['remote-trigger101-semantic-test', 'remote-trigger101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
              target101ScheduleRemoteGateUnits.has(target.index)
            ? ['schedule-remote-gate101-semantic-test', 'schedule-remote-gate101-target-unit']
          : caseName === '2.1.100-to-2.1.101' &&
                target101StateOperationUnits.has(target.index)
              ? [
                  ...(target101SdkTelemetryTaskUnits.has(target.index)
                    ? ['sdk-telemetry101-semantic-test', 'sdk-telemetry101-target-units']
                    : []),
                  ...(target101CcrSourceViabilityUnits.has(target.index)
                    ? ['ccr-viability101-semantic-test', 'ccr-viability101-target-units']
                    : []),
                  ...(target101ToolProgressOverlayUnits.has(target.index)
                    ? ['tool-progress101-semantic-test', 'tool-progress101-target-units']
                    : []),
                  'state-operations101-semantic-test',
                  'state-operations101-target-units',
                ]
            : caseName === '2.1.100-to-2.1.101' &&
                target101ToolProgressOverlayUnits.has(target.index)
              ? [
                  'tool-progress101-semantic-test',
                  'tool-progress101-target-units',
                  ...(target101AgentBackgroundGuidanceUnits.has(target.index)
                    ? ['agent-background101-semantic-test', 'agent-background101-target-units']
                    : []),
                ]
            : caseName === '2.1.100-to-2.1.101' &&
                target101RemoteIngressUnits.has(target.index)
              ? ['remote-ingress101-semantic-test', 'remote-ingress101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101AwaySummaryUnits.has(target.index)
              ? ['away-summary101-semantic-test', 'away-summary101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101InvalidSettingsUnits.has(target.index)
              ? ['invalid-settings101-semantic-test', 'invalid-settings101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101FrameHtmlPermissionUnits.has(target.index)
              ? ['frame-html101-semantic-test', 'frame-html101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101OpenFrameKeybindingUnits.has(target.index)
              ? ['open-frame101-semantic-test', 'open-frame101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101ClientPresenceUnits.has(target.index)
              ? ['client-presence101-semantic-test', 'client-presence101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101HomebrewVersionUnits.has(target.index)
              ? ['homebrew-version101-semantic-test', 'homebrew-version101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101ManagedHookLoadingUnits.has(target.index)
              ? ['managed-hooks101-semantic-test', 'managed-hooks101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101WorktreeResumeHintUnits.has(target.index)
              ? ['worktree-resume101-semantic-test', 'worktree-resume101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101CcrSourceViabilityUnits.has(target.index)
              ? ['ccr-viability101-semantic-test', 'ccr-viability101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101InsightsResponseUnits.has(target.index)
              ? ['insights-response101-semantic-test', 'insights-response101-target-unit']
            : caseName === '2.1.100-to-2.1.101' &&
                target101TrustedDeviceRetryUnits.has(target.index)
              ? ['trusted-device-retry101-semantic-test', 'trusted-device-retry101-target-unit']
            : caseName === '2.1.100-to-2.1.101' &&
                target101BridgeWorktreePreservationUnits.has(target.index)
              ? ['bridge-worktree101-semantic-test', 'bridge-worktree101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101AgentTaskNotificationUnits.has(target.index)
              ? ['agent-task101-semantic-test', 'agent-task101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101AgentBackgroundGuidanceUnits.has(target.index)
              ? ['agent-background101-semantic-test', 'agent-background101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101ToolSearchMcpNameUnits.has(target.index)
              ? ['tool-search101-semantic-test', 'tool-search101-target-unit']
            : caseName === '2.1.100-to-2.1.101' &&
                target101TeamMemoryAvailabilityUnits.has(target.index)
              ? ['team-memory101-semantic-test', 'team-memory101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101MainInputNormalizationUnits.has(target.index)
              ? ['main-input101-semantic-test', 'main-input101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101KeybindingLoaderUnits.has(target.index)
              ? ['keybinding-loader101-semantic-test', 'keybinding-loader101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101AgentMetadataMirrorUnits.has(target.index)
              ? ['agent-metadata101-semantic-test', 'agent-metadata101-target-unit']
            : caseName === '2.1.100-to-2.1.101' &&
                target101BackgroundSessionPromptUnits.has(target.index)
              ? ['bg-session101-semantic-test', 'bg-session101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101UpdateCommandUnits.has(target.index)
              ? ['update-command101-semantic-test', 'update-command101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101MessageRatingHoverUnits.has(target.index)
              ? ['message-rating101-semantic-test', 'message-rating101-target-unit']
            : caseName === '2.1.100-to-2.1.101' &&
                target101KillRingContextUnits.has(target.index)
              ? ['kill-ring101-semantic-test', 'kill-ring101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101TeamCreateExclusiveUnits.has(target.index)
              ? ['team-create101-semantic-test', 'team-create101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101FileSuggestionStateUnits.has(target.index)
              ? ['file-suggestions101-semantic-test', 'file-suggestions101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101ClassifierApprovalUnits.has(target.index)
              ? ['classifier-approvals101-semantic-test', 'classifier-approvals101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101SdkTelemetryTaskUnits.has(target.index)
              ? ['sdk-telemetry101-semantic-test', 'sdk-telemetry101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101PluginRuntimeUnits.has(target.index)
              ? ['plugin-runtime101-semantic-test', 'plugin-runtime101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101WorktreeRecoveryUnits.has(target.index)
              ? ['worktree-recovery101-semantic-test', 'worktree-recovery101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101LoopsCommandUnits.has(target.index)
              ? ['loops-command101-semantic-test', 'loops-command101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101PrintResumeTitleUnits.has(target.index)
              ? ['print-resume-title101-semantic-test', 'print-resume-title101-target-unit']
            : caseName === '2.1.100-to-2.1.101' &&
                target101SafetyUiUnits.has(target.index)
              ? ['safety-ui101-semantic-test', 'safety-ui101-target-units']
          : caseName === '2.1.100-to-2.1.101' &&
                target101LoopDefaultUnits.has(target.index)
              ? ['loop-default101-semantic-test', 'loop-default101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101McpDirectoryRegistryUnits.has(target.index)
              ? ['mcp-directory101-semantic-test', 'mcp-directory101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101SdkOAuthControlUnits.has(target.index)
              ? [
                  'sdk-oauth101-semantic-test',
                  'sdk-oauth101-target-units',
                  ...(target.index === 17996
                    ? ['context-unattributed101-semantic-test', 'context-unattributed101-target-units']
                    : []),
                ]
            : caseName === '2.1.100-to-2.1.101' &&
                target101SettingsSanitizationUnits.has(target.index)
              ? ['settings-sanitize101-semantic-test', 'settings-sanitize101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101InkEventUnits.has(target.index)
              ? ['ink-events101-semantic-test', 'ink-events101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101InkLifecycleUnits.has(target.index)
              ? ['ink-lifecycle101-semantic-test', 'ink-lifecycle101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
          [8478, 8479, 8480, 8487, 8496, 8497, 8498, 8500, 8501, 8502, 8504, 8883].includes(target.index)
            ? ['mcp-complete-auth-semantic-test', 'mcp-complete-auth-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101LogPreviewUnits.has(target.index)
              ? ['log-preview101-semantic-test', 'log-preview101-target-unit']
            : caseName === '2.1.100-to-2.1.101' &&
                target101ResumeSelectorUnits.has(target.index)
              ? ['resume-selector101-semantic-test', 'resume-selector101-target-units']
            : caseName === '2.1.100-to-2.1.101' &&
                target101BetaTracingPrivacyUnits.has(target.index)
              ? ['beta-tracing101-semantic-test', 'beta-tracing101-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105SubprocessIsolationUnits.has(target.index)
              ? [
                  'subprocess-isolation105-semantic-test',
                  'subprocess-isolation105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105MessageRatingSurfaceUnits.has(target.index)
              ? [
                  'message-rating-surface105-semantic-test',
                  'message-rating-surface105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105WorktreeResumeNameUnits.has(target.index)
              ? [
                  'worktree-resume-name105-semantic-test',
                  'worktree-resume-name105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105TypeaheadMetadataTransitiveUnits.has(target.index)
              ? [
                  'typeahead-metadata98-semantic-test',
                  'typeahead-metadata98-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105AwaySummaryPromptUnits.has(target.index)
              ? [
                  'away-summary-prompt105-semantic-test',
                  'away-summary-prompt105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105FullscreenSuggestionNoPadUnits.has(target.index)
              ? [
                  'fullscreen-suggestion-no-pad105-semantic-test',
                  'fullscreen-suggestion-no-pad105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105MessageDeferralUnits.has(target.index) &&
                !target105TmuxSocketUnits.has(target.index)
              ? [
                  'message-deferral105-semantic-test',
                  'message-deferral105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105InProcessTaskRegistryUnits.has(target.index)
              ? [
                  'in-process-task-registry105-semantic-test',
                  'in-process-task-registry105-target-unit',
                  'task-registry105-semantic-test',
                  'task-registry105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105AccountLabelUnits.has(target.index)
              ? [
                  'account-label105-semantic-test',
                  'account-label105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105SystemDiagnosticsHeadingUnits.has(target.index)
              ? [
                  'system-diagnostics-heading105-semantic-test',
                  'system-diagnostics-heading105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105ModelDeprecationTenseUnits.has(target.index)
              ? [
                  'model-deprecation-tense105-semantic-test',
                  'model-deprecation-tense105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105MemorySynthesisFactShapeUnits.has(target.index)
              ? [
                  'memory-synthesis-fact-shape105-semantic-test',
                  'memory-synthesis-fact-shape105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105TmuxSocketUnits.has(target.index)
              ? target105TmuxSocketEvidenceIds(target.index)
            : caseName === '2.1.104-to-2.1.105' &&
                target105SkillDynamicStateUnits.has(target.index)
              ? [
                  'skill-dynamic-state105-semantic-test',
                  'skill-dynamic-state105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105EnvHookStateUnits.has(target.index)
              ? [
                  'env-hook-state105-semantic-test',
                  'env-hook-state105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105AuthRenderRootUnits.has(target.index) &&
                !target105AwaySummaryConfigUnits.has(target.index)
              ? [
                  'auth-render-root105-semantic-test',
                  'auth-render-root105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105AwaySummaryConfigUnits.has(target.index)
              ? [
                  'away-summary-config105-semantic-test',
                  'away-summary-config105-target-units',
                  ...(target105SkillListingUnits.has(target.index)
                    ? ['skill-listing105-semantic-test', 'skill-listing105-target-units']
                    : []),
                  ...(target105RecapUnits.has(target.index)
                    ? ['recap-semantic-test', 'recap-target-units']
                    : []),
                  ...(target105TaskRegistryUnits.has(target.index)
                    ? ['task-registry105-semantic-test', 'task-registry105-target-units']
                    : []),
                  ...(target105RecalledMemoryUnits.has(target.index)
                    ? [
                        'recalled-memory-rating105-semantic-test',
                        'recalled-memory-rating105-target-units',
                      ]
                    : []),
                  ...(target105TmuxFocusUnits.has(target.index)
                    ? ['tmux-focus105-semantic-test', 'tmux-focus105-target-units']
                    : []),
                  ...(target105BackgroundWorkUnits.has(target.index)
                    ? [
                        'background-work-exit105-semantic-test',
                        'background-work-exit105-target-units',
                      ]
                    : []),
                  ...(target105SessionStatePropagationUnits.has(target.index)
                    ? [
                        'session-state-propagation105-semantic-test',
                        'session-state-propagation105-target-units',
                      ]
                    : []),
                  ...(target105AuthRenderRootUnits.has(target.index)
                    ? [
                        'auth-render-root105-semantic-test',
                        'auth-render-root105-target-units',
                      ]
                    : []),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105MemorySurveyUnits.has(target.index)
              ? [
                  'memory-survey-judge105-semantic-test',
                  'memory-survey-judge105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105StripPromptXmlUnits.has(target.index)
              ? [
                  'strip-prompt-xml105-semantic-test',
                  'strip-prompt-xml105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105FilesystemPermissionUnits.has(target.index)
              ? [
                  'filesystem-permissions105-semantic-test',
                  'filesystem-permissions105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105WorkerRawCommandUnits.has(target.index)
              ? [
                  'worker-raw-command105-semantic-test',
                  'worker-raw-command105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105ToolSearchMcpTelemetryUnits.has(target.index)
              ? [
                  'tool-search-mcp-telemetry105-semantic-test',
                  'tool-search-mcp-telemetry105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105ConfigTrustReasonUnits.has(target.index)
              ? [
                  'config-trust-reason105-semantic-test',
                  'config-trust-reason105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105RepoCheckoutUnits.has(target.index)
              ? [
                  'repo-checkouts105-semantic-test',
                  'repo-checkouts105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105SkillsMenuUnits.has(target.index)
              ? [
                  'skills-menu-overrides105-semantic-test',
                  'skills-menu-overrides105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105RequestSizeLimitUnits.has(target.index)
              ? [
                  'request-size-limit105-semantic-test',
                  'request-size-limit105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105DatadogAllowlistUnits.has(target.index)
              ? [
                  'datadog-allowlist105-semantic-test',
                  'datadog-allowlist105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105FileReadMitigationUnits.has(target.index)
              ? [
                  'file-read-mitigation105-semantic-test',
                  'file-read-mitigation105-target-units',
                  'middle-semantic-test',
                  'authenticated-target-fragments',
                  'first-party-source-map',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105SessionStatePropagationUnits.has(target.index)
              ? [
                  'session-state-propagation105-semantic-test',
                  'session-state-propagation105-target-units',
                  ...(target105TaskRegistryUnits.has(target.index)
                    ? ['task-registry105-semantic-test', 'task-registry105-target-units']
                    : []),
                  ...(target105HeadlessMcpPrewaitUnits.has(target.index)
                    ? [
                        'headless-mcp-prewait105-semantic-test',
                        'headless-mcp-prewait105-target-units',
                      ]
                    : []),
                  ...target105SdkAuxiliaryEvidenceIds(target.index),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105SkillListingUnits.has(target.index)
              ? [
                  'skill-listing105-semantic-test',
                  'skill-listing105-target-units',
                  ...(target105TaskRegistryUnits.has(target.index)
                    ? ['task-registry105-semantic-test', 'task-registry105-target-units']
                    : []),
                  ...(target105RecalledMemoryUnits.has(target.index)
                    ? [
                        'recalled-memory-rating105-semantic-test',
                        'recalled-memory-rating105-target-units',
                      ]
                    : []),
                  ...(target105TmuxFocusUnits.has(target.index)
                    ? ['tmux-focus105-semantic-test', 'tmux-focus105-target-units']
                    : []),
                  ...(target105BackgroundWorkUnits.has(target.index)
                    ? [
                        'background-work-exit105-semantic-test',
                        'background-work-exit105-target-units',
                      ]
                    : []),
                  ...(target105SkillActivatedOtelUnits.has(target.index)
                    ? [
                        'skill-activated-otel105-semantic-test',
                        'skill-activated-otel105-target-units',
                      ]
                    : []),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105EventLoopUnits.has(target.index)
              ? ['event-loop-stall105-semantic-test', 'event-loop-stall105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105MemoryThresholdUnits.has(target.index)
              ? ['memory-threshold105-semantic-test', 'memory-threshold105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105AutoModeStateUnits.has(target.index)
              ? ['auto-mode-state105-semantic-test', 'auto-mode-state105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105GitUnits.has(target.index)
              ? ['git-watch-redaction105-semantic-test', 'git-watch-redaction105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105AtomicTeamFileUnits.has(target.index)
              ? ['atomic-team-file105-semantic-test', 'atomic-team-file105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105AtomicTeammateReservationUnits.has(target.index)
              ? [
                  'atomic-teammate-reservation105-semantic-test',
                  'atomic-teammate-reservation105-target-units',
                  ...(target105TaskRegistryUnits.has(target.index)
                    ? [
                        'task-registry105-semantic-test',
                        'task-registry105-target-units',
                      ]
                    : []),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105FullCompactionCompletionUnits.has(target.index)
              ? [
                  'full-compaction-completion105-semantic-test',
                  'full-compaction-completion105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105PartialCompactionCompletionUnits.has(target.index)
              ? [
                  'partial-compaction-completion105-semantic-test',
                  'partial-compaction-completion105-target-units',
                  ...target105SdkAuxiliaryEvidenceIds(target.index),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105OfficialMarketplaceGcsRollbackUnits.has(target.index)
              ? [
                  'official-marketplace-gcs-rollback105-semantic-test',
                  'official-marketplace-gcs-rollback105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105HfiAuthCleanupUnits.has(target.index)
              ? [
                  'hfi-auth-cleanup105-semantic-test',
                  'hfi-auth-cleanup105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105SessionAppendPolicyUnits.has(target.index)
              ? [
                  'session-append-policy105-semantic-test',
                  'session-append-policy105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105MarkdownOrderedListUnits.has(target.index)
              ? [
                  'markdown-ordered-list105-semantic-test',
                  'markdown-ordered-list105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105MarkdownWhitespaceUnits.has(target.index)
              ? [
                  'markdown-whitespace105-semantic-test',
                  'markdown-whitespace105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105MetaEnterTabUnits.has(target.index)
              ? [
                  'meta-enter-tab105-semantic-test',
                  'meta-enter-tab105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105GracefulShutdownUnits.has(target.index)
              ? [
                  'graceful-shutdown-persistence105-semantic-test',
                  'graceful-shutdown-persistence105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105SkillActivatedOtelUnits.has(target.index)
              ? [
                  'skill-activated-otel105-semantic-test',
                  'skill-activated-otel105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105PluginInstallOtelUnits.has(target.index)
              ? [
                  'plugin-install-otel105-semantic-test',
                  'plugin-install-otel105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105ToolSearchMcpNonblockingUnits.has(target.index)
              ? [
                  'tool-search-mcp-nonblocking105-semantic-test',
                  'tool-search-mcp-nonblocking105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105AnalyticsStateUnits.has(target.index)
              ? ['analytics-state105-semantic-test', 'analytics-state105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105TeamMemoryAclUnits.has(target.index)
              ? ['team-memory-acl105-semantic-test', 'team-memory-acl105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105AttachmentMessageUnits.has(target.index)
              ? ['attachment-table105-semantic-test', 'attachment-table105-target-unit']
            : caseName === '2.1.104-to-2.1.105' &&
                target105PluginSettingsDescriptionUnits.has(target.index)
              ? [
                  'plugin-settings-description105-semantic-test',
                  'plugin-settings-description105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105TrustedDevicePolicyUnits.has(target.index)
              ? [
                  'trusted-device-policy105-semantic-test',
                  'trusted-device-policy105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105RecalledMemoryUnits.has(target.index)
              ? [
                  'recalled-memory-rating105-semantic-test',
                  'recalled-memory-rating105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105ApiRetryTelemetryUnits.has(target.index)
              ? [
                  'api-retry-telemetry105-semantic-test',
                  'api-retry-telemetry105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105FirstAttemptRequestIdUnits.has(target.index)
              ? [
                  'first-attempt-request-id105-semantic-test',
                  'first-attempt-request-id105-target-units',
                  ...(target.index === 16680
                    ? [
                        'prompt-cache-break105-semantic-test',
                        'prompt-cache-break105-target-units',
                      ]
                    : []),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105ManagedAgentDocUnits.has(target.index)
              ? [
                  'managed-agent-docs105-semantic-test',
                  'managed-agent-docs105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105PluginManifestVersionUnits.has(target.index)
              ? [
                  'plugin-manifest-version105-semantic-test',
                  'plugin-manifest-version105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105McpElicitationFormUnits.has(target.index)
              ? [
                  'mcp-elicitation-form105-semantic-test',
                  'mcp-elicitation-form105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105ReactiveCompactionUnits.has(target.index)
              ? [
                  'reactive-compaction105-semantic-test',
                  'reactive-compaction105-target-units',
                  ...(target105MalformedToolUseUnits.has(target.index)
                    ? [
                        'malformed-tool-use105-semantic-test',
                        'malformed-tool-use105-target-unit',
                      ]
                    : []),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105TmuxFocusUnits.has(target.index)
              ? ['tmux-focus105-semantic-test', 'tmux-focus105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105SessionStateUnits.has(target.index)
              ? ['session-state105-semantic-test', 'session-state105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105KeybindingSelectionUnits.has(target.index)
              ? [
                  'keybinding-selection105-semantic-test',
                  'keybinding-selection105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105FeedbackPayloadUnits.has(target.index)
              ? ['feedback-payload105-semantic-test', 'feedback-payload105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105BackgroundWorkUnits.has(target.index)
              ? [
                  'background-work-exit105-semantic-test',
                  'background-work-exit105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105RequestTooLargeUnits.has(target.index)
              ? [
                  'request-too-large105-semantic-test',
                  'request-too-large105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105UltrareviewUnits.has(target.index)
              ? [
                  'ultrareview-preflight105-semantic-test',
                  'ultrareview-preflight105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105HookRegistryUnits.has(target.index)
              ? [
                  'hook-registry-validation105-semantic-test',
                  'hook-registry-validation105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105UpstreamRelayDrainUnits.has(target.index)
              ? [
                  'upstream-relay-drain105-semantic-test',
                  'upstream-relay-drain105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105BackendRegistryUnits.has(target.index)
              ? ['backend-registry105-semantic-test', 'backend-registry105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105HeadlessMcpPrewaitUnits.has(target.index)
              ? [
                  'headless-mcp-prewait105-semantic-test',
                  'headless-mcp-prewait105-target-units',
                  ...(target105TaskRegistryUnits.has(target.index)
                    ? ['task-registry105-semantic-test', 'task-registry105-target-units']
                    : []),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105TaskRegistryUnits.has(target.index)
              ? [
                  'task-registry105-semantic-test',
                  'task-registry105-target-units',
                  ...target105SdkAuxiliaryEvidenceIds(target.index),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105SdkMemoryPathsUnits.has(target.index)
              ? [
                  'sdk-memory-paths105-semantic-test',
                  'sdk-memory-paths105-target-units',
                  ...target105SdkAuxiliaryEvidenceIds(target.index),
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105SdkAuxiliaryUnits.has(target.index)
              ? target105SdkAuxiliaryEvidenceIds(target.index)
            : caseName === '2.1.104-to-2.1.105' &&
                target105TeleportTrustedDeviceUnits.has(target.index)
              ? [
                  'teleport-trusted-device105-semantic-test',
                  'teleport-trusted-device105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105GitBundleBaseRefUnits.has(target.index)
              ? [
                  'git-bundle-base-ref105-semantic-test',
                  'git-bundle-base-ref105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105McpOAuthDiscoveryUnits.has(target.index)
              ? [
                  'mcp-oauth-discovery-state105-semantic-test',
                  'mcp-oauth-discovery-state105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105RemoteTriggerSchemaUnits.has(target.index)
              ? ['remote-trigger105-semantic-test', 'remote-trigger105-target-unit']
            : caseName === '2.1.104-to-2.1.105' &&
                target105TreeConnectorUnits.has(target.index)
              ? ['tree-connector105-semantic-test', 'tree-connector105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105LoopProactiveUnits.has(target.index)
              ? ['loop-proactive105-semantic-test', 'loop-proactive105-target-unit']
            : caseName === '2.1.104-to-2.1.105' &&
                target105AgentConcurrencyUnits.has(target.index)
              ? [
                  'agent-concurrency105-semantic-test',
                  'agent-concurrency105-target-units',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105PrintResumeTelemetryUnits.has(target.index)
              ? [
                  'print-resume-telemetry105-semantic-test',
                  'print-resume-telemetry105-target-unit',
                ]
            : caseName === '2.1.104-to-2.1.105' &&
                target105LogRepoUnits.has(target.index)
              ? ['log-repo105-semantic-test', 'log-repo105-target-unit']
            : caseName === '2.1.104-to-2.1.105' &&
                target105WorktreeLifecycleUnits.has(target.index)
              ? ['worktree-lifecycle105-semantic-test', 'worktree-lifecycle105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105PromptCacheBreakUnits.has(target.index)
              ? ['prompt-cache-break105-semantic-test', 'prompt-cache-break105-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105ClientPresencePlatformUnits.has(target.index)
              ? ['client-presence105-semantic-test', 'client-presence105-target-unit']
            : caseName === '2.1.98-to-2.1.100' &&
                target100SpinnerUnits.has(target.index)
              ? ['spinner-semantic-test', 'spinner-target-units']
            : caseName === '2.1.105-to-2.1.107' &&
                target107ThinkingAgentUnits.has(target.index)
              ? ['thinking-agent-semantic-test', 'thinking-agent-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98DreamTeamMemoryUnits.has(target.index)
              ? ['dream-team-memory-semantic-test', 'dream-team-memory-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98AdvisorUnits.has(target.index)
              ? ['advisor98-semantic-test', 'advisor98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98VertexRegionUnits.has(target.index)
              ? ['vertex-region98-semantic-test', 'vertex-region98-target-unit']
            : caseName === '2.1.97-to-2.1.98' &&
                target98RemoteSlugUnits.has(target.index)
              ? ['remote-slug98-semantic-test', 'remote-slug98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98RemoteEligibilityUnits.has(target.index)
              ? ['remote-eligibility98-semantic-test', 'remote-eligibility98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98LogFilterUnits.has(target.index)
              ? ['log-filters98-semantic-test', 'log-filters98-target-unit']
            : caseName === '2.1.97-to-2.1.98' &&
                target98StatusLineResultUnits.has(target.index)
              ? ['statusline-result98-semantic-test', 'statusline-result98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98PluginScopeFallbackUnits.has(target.index)
              ? ['plugin-scope98-semantic-test', 'plugin-scope98-target-unit']
            : caseName === '2.1.97-to-2.1.98' &&
                target98ProviderSetupUnits.has(target.index)
              ? ['provider-setup98-semantic-test', 'provider-setup98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98PrDetailsUnits.has(target.index)
              ? ['pr-details98-semantic-test', 'pr-details98-target-unit']
            : caseName === '2.1.97-to-2.1.98' &&
                target98WebSetupEnvironmentUnits.has(target.index)
              ? ['web-setup98-semantic-test', 'web-setup98-target-unit']
            : caseName === '2.1.97-to-2.1.98' &&
                target98ConsoleOAuthUnits.has(target.index)
              ? ['console-oauth98-semantic-test', 'console-oauth98-target-unit']
            : caseName === '2.1.97-to-2.1.98' &&
                target98BridgeLateResponseUnits.has(target.index)
              ? ['bridge-late-response98-semantic-test', 'bridge-late-response98-target-unit']
            : caseName === '2.1.97-to-2.1.98' &&
                target98EffortCapabilityUnits.has(target.index)
              ? ['effort-capability98-semantic-test', 'effort-capability98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98SessionsWebSocketUnits.has(target.index)
              ? ['sessions-websocket98-semantic-test', 'sessions-websocket98-target-unit']
            : caseName === '2.1.97-to-2.1.98' &&
                target98StopHookFocusUnits.has(target.index)
              ? ['stop-hook-focus98-semantic-test', 'stop-hook-focus98-target-unit']
            : caseName === '2.1.97-to-2.1.98' &&
                target98WrappedContentFeedbackUnits.has(target.index)
              ? ['wrapped-content-feedback98-semantic-test', 'wrapped-content-feedback98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98BedrockProbeDeadlineUnits.has(target.index) &&
                target98VertexModelUpgradeUnits.has(target.index)
              ? [
                  'bedrock-probe98-semantic-test',
                  'bedrock-probe98-target-units',
                  'vertex-model-upgrade98-semantic-test',
                  'vertex-model-upgrade98-target-units',
                ]
            : caseName === '2.1.97-to-2.1.98' &&
                target98BedrockProbeDeadlineUnits.has(target.index)
              ? ['bedrock-probe98-semantic-test', 'bedrock-probe98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98VertexModelUpgradeUnits.has(target.index)
              ? ['vertex-model-upgrade98-semantic-test', 'vertex-model-upgrade98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98UltraplanLaunchUnits.has(target.index)
              ? ['ultraplan-launch98-semantic-test', 'ultraplan-launch98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98TypeaheadMetadataUnits.has(target.index)
              ? [
                  'typeahead-metadata98-semantic-test',
                  'typeahead-metadata98-target-unit',
                  'mcp-resource-templates98-semantic-test',
                  'mcp-resource-templates98-target-units',
                ]
            : caseName === '2.1.97-to-2.1.98' &&
                target98McpResourceTemplateUnits.has(target.index) &&
                target98AgentsRuntimeUnits.has(target.index)
              ? [
                  'mcp-resource-templates98-semantic-test',
                  'mcp-resource-templates98-target-units',
                  'agents-runtime98-semantic-test',
                  'agents-runtime98-target-units',
                ]
            : caseName === '2.1.97-to-2.1.98' &&
                target98McpResourceTemplateUnits.has(target.index)
              ? ['mcp-resource-templates98-semantic-test', 'mcp-resource-templates98-target-units']
            : caseName === '2.1.97-to-2.1.98' &&
                target98AgentsRuntimeUnits.has(target.index)
              ? ['agents-runtime98-semantic-test', 'agents-runtime98-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                target105RecapUnits.has(target.index)
            ? ['recap-semantic-test', 'recap-target-units']
            : caseName === '2.1.104-to-2.1.105' &&
                /subagentStatusLine|CoordinatorAgentStatus|PromptInput|AppStateStore|^src\/main\.tsx$/.test(owner)
              ? ['subagent-status-line-semantic-test', 'subagent-status-line-target-units']
              : [
                  'middle-semantic-test',
                  'authenticated-target-fragments',
                  ...(fallback ? [] : ['first-party-source-map']),
                ],
        behavior: preciseBehavior(caseName, target.index, owner),
      })
    } else {
      increment('source-runtime-gap')
      if (missing.length < 100) missing.push({ index: target.index, start: target.start, end: target.end, nodeType: target.nodeType, attributed: attributed.slice(0, 6), snippet: snippet.slice(0, 300) })
      ledgerRows.push({
        targetIndex: target.index,
        start: target.start,
        end: target.end,
        nodeType: target.nodeType,
        sourceHash: target.sourceHash,
        structuralClass: region.classification,
        disposition: 'source-runtime-gap',
        ownerIds: [],
        evidenceIds: ['authenticated-target-fragments'],
        category: 'unowned-first-party-runtime',
        reason: 'No historical cumulative source owner or defensible dependency/generated exclusion was found.',
      })
    }
  }
  if (process.argv.includes('--write')) {
    const ownerPaths = [
      ...new Set(ledgerRows.flatMap(row => row.ownerPaths ?? [])),
    ].sort()
    const ownerIdByPath = new Map(
      ownerPaths.map((ownerPath, index) => [
        ownerPath,
        `owner-${String(index + 1).padStart(3, '0')}`,
      ]),
    )
    const rows = ledgerRows
      .sort((left, right) => left.targetIndex - right.targetIndex)
      .map(row => {
        const { ownerPaths: rowOwnerPaths, ...serialized } = row
        if (rowOwnerPaths) {
          serialized.ownerIds = rowOwnerPaths.map(ownerPath =>
            ownerIdByPath.get(ownerPath),
          )
        }
        if (
          caseName === '2.1.97-to-2.1.98' &&
          target98DynamicImageLimitUnits.has(serialized.targetIndex)
        ) {
          serialized.evidenceIds = [
            ...new Set([
              ...serialized.evidenceIds,
              'dynamic-image98-semantic-test',
              'dynamic-image98-target-units',
            ]),
          ]
        }
        if (
          caseName === '2.1.100-to-2.1.101' &&
          serialized.disposition === 'source-runtime-covered' &&
          target101SessionEnvUnits.has(serialized.targetIndex)
        ) {
          serialized.evidenceIds = [
            ...new Set([
              ...serialized.evidenceIds,
              'session-env101-semantic-test',
              'session-env101-target-units',
              ...(serialized.targetIndex === 17858
                ? ['session-env101-ultraplan-transitive-owner']
                : []),
            ]),
          ]
        }
        return serialized
      })
    const byStructuralClass = { changed: 0, moved: 0, unresolved: 0 }
    const byDisposition = Object.fromEntries(dispositionOrder.map(key => [key, 0]))
    for (const row of rows) {
      byStructuralClass[row.structuralClass]++
      byDisposition[row.disposition]++
    }
    const evidence = [
      {
        id: 'structural-exact-pair',
        kind: 'structural-pairing',
        path: `recovery/cases/${caseName}/structural/generated-delta.json.gz`,
        detail: 'Moved target unit has the verifier-required exact-scope-normalized-token-hash structural pair.',
      },
      {
        id: 'readable-no-semantic-change',
        kind: 'readable-normalization',
        path: `recovery/cases/${caseName}/readable-diff/statements.diff`,
        detail: 'Target descriptor is absent from the added side of the complete normalized statement diff.',
      },
      {
        id: 'dependency-source-map',
        kind: 'dependency-attribution',
        path: `recovery/cases/${caseName}/attribution/sources.jsonl.gz`,
        detail: 'Highest-weight target attribution resolves to a node_modules dependency source; the target commit has no root application manifest/lockfile/build recipe or pinned dependency archive.',
      },
      {
        id: 'release-build-metadata',
        kind: 'generated-metadata',
        path: `recovery/cases/${caseName}/manifest.json`,
        detail: `Static target AST unit embeds release VERSION ${targetVersion} together with generated BUILD_TIME metadata.`,
      },
      {
        id: 'external-build-path-metadata',
        kind: 'generated-metadata',
        path: `recovery/cases/${caseName}/structural/generated-delta.json.gz`,
        detail: 'Static target AST embeds an ephemeral /home/runner/code/tmp/claude-cli-external-build-* packaging path for bundled computer-use native JavaScript.',
      },
      {
        id: 'first-party-source-map',
        kind: 'source-map-attribution',
        path: `recovery/cases/${caseName}/attribution/target-partitions.jsonl.gz`,
        detail: 'Exact anchors, target partitions, relocated candidates, and initializer votes reach the named first-party src owner.',
      },
      {
        id: 'authenticated-target-fragments',
        kind: 'target-fragment',
        path: 'recovery/test/middle-semantic-source-coverage.test.mjs',
        detail: `Authenticated ${targetVersion} bundle SHA-256 and target runtime fragments are pinned against the recovered owner.`,
      },
      {
        id: 'middle-semantic-test',
        kind: 'semantic-test',
        path: 'recovery/test/middle-semantic-source-coverage.test.mjs',
        detail: 'Source tests pin explicit recovered behaviors and verify that the cumulative semantic owners remain present.',
      },
    ]
    if (caseName === '2.1.97-to-2.1.98') {
      evidence.push(
        {
          id: 'typeahead-metadata98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-typeahead-suggestion-metadata-semantic.test.mjs',
          detail: 'Authenticated baseline97, target98 unit 17250, and target116 fragments pin the common-prefix guard plus both metadata replacement and partial-completion paths by exact byte range and SHA-256.',
        },
        {
          id: 'typeahead-metadata98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-typeahead-suggestion-metadata-semantic.test.mjs',
          detail: 'Dual-root tests require both file-selection paths to apply metadata replacements and partial flags, and require explicit replacement candidates to suppress common-prefix insertion.',
        },
        {
          id: 'dynamic-image98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-dynamic-image-limits-semantic.test.mjs',
          detail: 'Authenticated target98 units 6758, 7047-7050, 7107-7110, 7112, 7314, 8605, 8638, 8755, 8761, 8764, 8766-8768, 8773, 12508, 12762, 12764, 12766, 13095, 13418-13419, 16420, 16846, 16853, 17002, 17476, 17630, and 18079 pin the complete dynamic image-limit and explicit-validation graph by exact range and SHA-256.',
        },
        {
          id: 'dynamic-image98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-dynamic-image-limits-semantic.test.mjs',
          detail: 'Dual-root executable tests prove model-specific defaults, two-argument normalization followed by explicit direct and nested tool-result validation, MCP result annotations, and propagation through every authored image consumer while separately checking target116 limit evolution.',
        },
        {
          id: 'loop-until98-static-ast',
          kind: 'static-ast',
          path: 'recovery/test/recovery-2.1.98-loop-until-dce-semantic.test.mjs',
          detail: 'Authenticated target98 unit 18345 is parsed and proves the /until match-result binding has exactly one identifier occurrence—its declaration—so the newly emitted expression cannot affect runtime behavior.',
        },
        {
          id: 'advisor98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-advisor-semantic.test.mjs',
          detail: 'Authenticated target98 units 9326 and 9332 pin the first-party compass2 enablement function and complete reviewer instruction payload by exact range and SHA-256.',
        },
        {
          id: 'advisor98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-advisor-semantic.test.mjs',
          detail: 'Source tests pin target98 provider/beta gating, absence of the later explicit-enable override, supported model family, and the exact advisor timing, durability, and evidence-reconciliation instructions.',
        },
        {
          id: 'vertex-region98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-vertex-region-semantic.test.mjs',
          detail: 'Authenticated target98 unit 613 pins the complete ordered Vertex model-prefix to environment-variable routing table by exact range and SHA-256.',
        },
        {
          id: 'vertex-region98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-vertex-region-semantic.test.mjs',
          detail: 'Source tests pin the target98 Opus 4.5 regional override at its first boundary and verify that current source retains it alongside the later Opus 4.7 entry.',
        },
        {
          id: 'remote-slug98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-remote-slug-semantic.test.mjs',
          detail: 'Authenticated target98 units 2425, 2426, and 2437 pin the config reader, public nullable wrapper, sentinel, pushurl-first normalization, and bounded memoizer by exact range and SHA-256.',
        },
        {
          id: 'remote-slug98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-remote-slug-semantic.test.mjs',
          detail: 'Source tests pin regular and bare repository config lookup, origin pushurl precedence, URL normalization, sentinel-to-null conversion, and the 50-entry memoization boundary.',
        },
        {
          id: 'remote-eligibility98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-remote-eligibility-semantic.test.mjs',
          detail: 'Authenticated target98 units 11698, 11704, and 11792 pin the environment-fetch error boundary, its complete eligibility consumer, and configured-default/cloud selection by exact range and SHA-256.',
        },
        {
          id: 'remote-eligibility98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-remote-eligibility-semantic.test.mjs',
          detail: 'Source tests pin 401 propagation, non-auth degradation, login/error classification, environment requirement, configured-BYOC detection, bundle bypass, GitHub-app gating, and configured-default-before-cloud selection with retry.',
        },
        {
          id: 'log-filters98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-log-filters-semantic.test.mjs',
          detail: 'Authenticated target98 unit 14880 pins the complete resume selector including its directory, branch, and worktree filter controls by exact range and SHA-256.',
        },
        {
          id: 'log-filters98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-log-filters-semantic.test.mjs',
          detail: 'Historical source tests pin each state-dependent action label, chord, display-format override, and forced footer recomputation when branch-filter state changes.',
        },
        {
          id: 'statusline-result98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-statusline-result-semantic.test.mjs',
          detail: 'Authenticated target98 units 17382-17384 pin the once-only telemetry helper, async status-line executor, and complete result metric calculation by exact range and SHA-256.',
        },
        {
          id: 'statusline-result98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-statusline-result-semantic.test.mjs',
          detail: 'Source and behavioral tests pin abort ordering, result delivery, first-nonempty logging, display-width and line metrics, command-length capture, reset-on-command-change, and swallowed failures.',
        },
        {
          id: 'plugin-scope98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-plugin-scope-fallback-semantic.test.mjs',
          detail: 'Authenticated target98 unit 14400 [10759578,10760644), SHA-256 92a25608a5e16a199d69fb1ccb154b7039b38d8d7af6f8e3c0c102dd60b47ac0, pins the complete plugin update selection function.',
        },
        {
          id: 'plugin-scope98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-plugin-scope-fallback-semantic.test.mjs',
          detail: 'Source tests pin exact scope/project matching, scope-local fallback, ambiguity warning, selected project-path propagation, and target97 adjacency.',
        },
        {
          id: 'provider-setup98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-provider-setup-semantic.test.mjs',
          detail: 'Authenticated target98 units 11334, 11336, 11337, 14912, 14913, 14915, 14919, 14920, 14921, 14923, 14925, and 15952 pin the relaunch module, both provider command modules, descriptors, and command registry by exact range and SHA-256.',
        },
        {
          id: 'provider-setup98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-provider-setup-semantic.test.mjs',
          detail: 'Source tests pin provider visibility, Bedrock and Vertex completion confirmation, exact relaunch argv/stdio/signal/exit behavior, telemetry, cancellation, and command reachability while the authenticated baseline proves the boundary.',
        },
        {
          id: 'pr-details98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-pr-details-semantic.test.mjs',
          detail: 'Authenticated target98 unit 17422 [12301211,12301921), SHA-256 adac9b7c436437cd9282507e14949425f1cfb1abb1feb8908977da1949370bc4, pins the complete PR-detail parser and query boundary.',
        },
        {
          id: 'pr-details98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-pr-details-semantic.test.mjs',
          detail: 'Source and executable-function tests pin check-rollup classification, review and state normalization, mergeability states, 30-second memoization, exact historical response shape, and authenticated target97 absence.',
        },
        {
          id: 'web-setup98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-web-setup-environment-semantic.test.mjs',
          detail: 'Authenticated target98 unit 15875 [11481830,11483853), SHA-256 269b8376af9e681e7d000ea1df02bd7af6f8d17e4a70c729ad16486922150693, pins the full web-setup upload, environment creation, landing, telemetry, and completion flow.',
        },
        {
          id: 'web-setup98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-web-setup-environment-semantic.test.mjs',
          detail: 'Source tests pin idempotent environment lookup, best-effort create behavior, exact warning severity, create-before-open ordering, success continuity, and authenticated target97 absence.',
        },
        {
          id: 'console-oauth98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-console-oauth-platform-semantic.test.mjs',
          detail: 'Authenticated target98 unit 11341 [8804292,8811444), SHA-256 0bfa8c8c5caf8eca05f3afe6dcc4fb29cb1cf4ea0e94b039c8a985350c02a01a, pins the full Console OAuth platform flow.',
        },
        {
          id: 'console-oauth98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-console-oauth-platform-semantic.test.mjs',
          detail: 'Authenticated matrix and source tests pin the 97-to-98 transition to interactive Vertex setup, Bedrock/Vertex completion states, Foundry routing, exact telemetry, restart guidance, Enter/onDone reachability, and persistence through target116.',
        },
        {
          id: 'bridge-late-response98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-bridge-late-response-semantic.test.mjs',
          detail: 'Authenticated target98 unit 16781 [11995649,12004750), SHA-256 a8d5e017628f944c9d83109390f840a5cb1e1086b82e3c840f393eda102a9a76, pins the complete REPL bridge hook and its late-response diagnostic branch.',
        },
        {
          id: 'bridge-late-response98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-bridge-late-response-semantic.test.mjs',
          detail: 'Authenticated boundary and source tests pin the exact late-or-unknown diagnostic, early return before deletion, matching-handler invocation, and delete-after-handler ordering.',
        },
        {
          id: 'effort-capability98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-effort-capability-semantic.test.mjs',
          detail: 'Authenticated target98 units 6306, 6307, and 6325 pin model-ID normalization, the max-effort predicate, and the complete legacy-model exclusion set by exact ranges and SHA-256.',
        },
        {
          id: 'effort-capability98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-effort-capability-semantic.test.mjs',
          detail: 'Source and executable-function tests pin provider override precedence, Haiku rejection, provider/version/date suffix normalization, legacy-model exclusion, and newly capable model enablement.',
        },
        {
          id: 'sessions-websocket98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-sessions-websocket-detach-semantic.test.mjs',
          detail: 'Authenticated target98 unit 17483 [12346911,12351673), SHA-256 5ccbc15fb6dd7b7c191fd88e301f88cd8bfc53091d02bc52db02cc3d97a431e3, pins the complete SessionsWebSocket implementation and listener-detachment lifecycle.',
        },
        {
          id: 'sessions-websocket98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-sessions-websocket-detach-semantic.test.mjs',
          detail: 'Source and authenticated bundle tests pin Bun callback nulling, Node listener removal and post-detach error handling, late-import closure cancellation, detacher clearing, and detach-before-close ordering.',
        },
        {
          id: 'stop-hook-focus98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-stop-hook-focus-semantic.test.mjs',
          detail: 'Authenticated target98 unit 15319 [11283943,11286786), SHA-256 13924f9f1f7660907b8a87b024d41aec0ef98e5da029fef544a86f5953b80a9f, pins the complete evolved Stop-hook dialog by exact range and bytes.',
        },
        {
          id: 'stop-hook-focus98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-stop-hook-focus-semantic.test.mjs',
          detail: 'Authenticated boundary tests prove target97 lacks the formatted switch-focus hint while target98 adds preventDefault Tab toggling, focused Enter deletion, exact Tab guide and Delete row; the current-source pass verifies persistence on the owner introduced by the earlier target92 supplement.',
        },
        {
          id: 'wrapped-content-feedback98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-wrapped-content-feedback-semantic.test.mjs',
          detail: 'Authenticated target98 units 13516, 13518, 13522, 13527-13529, and 17751 pin the byte writer, wrapped-content serializer, Feedback retry/error graph, serializer constants, and transcript-share call path by exact ranges and SHA-256; the same test proves target97 absence and target116 persistence/evolution.',
        },
        {
          id: 'wrapped-content-feedback98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-wrapped-content-feedback-semantic.test.mjs',
          detail: 'Dual-root source and executable serializer tests pin byte-accurate JSON framing, streamed arrays and array-map values, chunk redaction, outer metadata, Feedback size/retry/error handling, target98 transcript redaction, and target116 recursive object/raw-JSONL sanitization.',
        },
        {
          id: 'bedrock-probe98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-bedrock-probe-deadline-semantic.test.mjs',
          detail: 'Authenticated target98 units 18206, 18207, 18235-18237, and 18239 pin the complete Bedrock candidate/default delta, reachable setup sequence, twenty-second fail-open deadline, upgrade, and fallback functions by exact range and SHA-256.',
        },
        {
          id: 'bedrock-probe98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-bedrock-probe-deadline-semantic.test.mjs',
          detail: 'Authenticated boundary and source tests pin valid pin scanning past inference profiles and mismatched values, final-priority fallback selection, candidate/fallback diagnostics, generic provider UI, conditional Haiku settings, and independent fail-open startup stages through target116.',
        },
        {
          id: 'vertex-model-upgrade98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-vertex-model-upgrade-semantic.test.mjs',
          detail: 'Authenticated target98 units 18213, 18214, 18218-18225, 18227, 18235, 18236, 18240, and 18241 pin the generic provider dialog, complete Vertex candidate/default/probe module, fail-open deadline, reachable startup sequence, upgrade, and fallback functions by exact range and SHA-256.',
        },
        {
          id: 'vertex-model-upgrade98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-vertex-model-upgrade-semantic.test.mjs',
          detail: 'Authenticated boundary and source tests pin provider and host-management gates, per-tier environment/default resolution, model ordering, one-token regional probe including 429 accessibility, twenty-second fail-open sequencing, decline persistence, conditional Haiku settings, relaunch, fallback, and target116 persistence.',
        },
        {
          id: 'ultraplan-launch98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-ultraplan-launch-semantic.test.mjs',
          detail: 'Authenticated target98 units 17728 and 18079 pin the complete first-launch dialog and reachable REPL choice/launch/status graph by exact range and SHA-256; the same test authenticates the three exact cooked prompt payloads.',
        },
        {
          id: 'ultraplan-launch98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-ultraplan-launch-semantic.test.mjs',
          detail: 'Source and authenticated bundle tests pin prompt selection, keyword replacement, pending launch state, local/cloud choice, Remote Control disconnection, cancellation input restore, status transcript replacement, terms and launch telemetry, failure cleanup, and the later source-aware target116 evolution.',
        },
        {
          id: 'mcp-resource-templates98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-mcp-resource-templates-semantic.test.mjs',
          detail: 'Authenticated target98 units 7824, 8754, 8756, 8773, 13580, 14286, 17223-17228, 17231, 17234, 17235, 17250, and 18734 pin every state, client, refresh, parser, completion, and typeahead owner by exact range and SHA-256.',
        },
        {
          id: 'mcp-resource-templates98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-mcp-resource-templates-semantic.test.mjs',
          detail: 'Source tests pin eager connection and list-change fetching, cache invalidation, URI-template parsing and match scoring, ref/resource completion context, multi-variable partial replacement, and state reset/initialization.',
        },
        {
          id: 'agents-runtime98-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-agents-runtime-semantic.test.mjs',
          detail: 'Authenticated target98 units 7824, 11855, 15419, 15481-15493, 15501, and 18734 pin the invoked-agent state, AgentTool update, complete Running/Library views, selector/export, and initial state by exact range and SHA-256.',
        },
        {
          id: 'agents-runtime98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-agents-runtime-semantic.test.mjs',
          detail: 'Source tests pin active/completed ordering, stable used-this-session library ordering, running counts, empty state, duration/token summaries, abort/foreground controls, @agent submission, and state-before-telemetry selection tracking.',
        },
        {
          id: 'dream-team-memory-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-dream-team-memory-semantic.test.mjs',
          detail: 'Authenticated target98 units 12483 and 18337-18340 pin the team-aware consolidation prompt, scheduled prompt, /dream registration, module handle, and initializer by exact range and SHA-256.',
        },
        {
          id: 'dream-team-memory-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-dream-team-memory-semantic.test.mjs',
          detail: 'Source tests pin the TEAMMEM compile-time module handle, runtime enablement value, telemetry on both paths, prompt threading, and conservative shared-memory consolidation guidance.',
        },
      )
      evidence.push({
        id: 'monitor-mcp-static-null',
        kind: 'static-ast',
        path: 'recovery/test/middle-monitor-mcp-dce.test.mjs',
        detail: 'Matched target index 15092 [11173997,11174056), SHA-256 f02414a68e9f005569238a43c9e6aedd50e987478b1e37c267471b1286c01820, initializes WgK=null; the monitor_mcp UI branch returns null before rendering it.',
      })
    }
    if (caseName === '2.1.96-to-2.1.97') {
      evidence.push(
        {
          id: 'unified-installed-auth-shortcut-target',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-unified-installed-auth-shortcut-semantic.test.mjs',
          detail: 'Authenticated baseline96 unit 14269 and target97 unit 14316 pin the needs-auth text-to-ConfigurableShortcutHint boundary by exact byte range, structural classification, and SHA-256.',
        },
        {
          id: 'unified-installed-auth-shortcut-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-unified-installed-auth-shortcut-semantic.test.mjs',
          detail: 'Dual-root tests prove the exact select:accept/Select/Enter/auth descriptor in both top-level and indented Box-era MCP rows and keep the later ListItem migration outside the target97 supplement.',
        },
        {
          id: 'runtime-utilities-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-runtime-utilities-semantic.test.mjs',
          detail: 'Authenticated target97 units 3236, 5501, 6270, 6868, 7067, 7811, and 8113 pin canonical model normalization, Windows clipboard, max-effort versioning, escaped memory includes, image telemetry, awk path extraction, and precision-safe JSON formatting by exact range and SHA-256.',
        },
        {
          id: 'runtime-utilities-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-runtime-utilities-semantic.test.mjs',
          detail: 'Source tests pin the recovered runtime branches and explicitly prove the regex-based escaped-space and escaped-slash normalizers are semantically equivalent to the compiled string replaceAll forms.',
        },
        {
          id: 'memory-lifecycle-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-memory-lifecycle-semantic.test.mjs',
          detail: 'Authenticated target97 units 6743, 12324, and 12376 pin tiny-memory write stamps, recalled-memory trust guidance, and the phase-aware auto-dream lifecycle by exact range and SHA-256.',
        },
        {
          id: 'memory-lifecycle-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-memory-lifecycle-semantic.test.mjs',
          detail: 'Source tests cover gated tiny-memory paths, idempotent write/read stamps and all call paths, trust text in individual/team prompts, and auto-dream skip/fork/completion telemetry.',
        },
        {
          id: 'agent-runtime-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-agent-runtime-semantic.test.mjs',
          detail: 'Authenticated target97 units 10014, 10069, 10081, 11042, 11589, 11761, and 12231 pin fork-aware inherited-model selection, prompt-only tool filtering, teammate bypass, and all changed callers by exact range and SHA-256.',
        },
        {
          id: 'agent-runtime-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-agent-runtime-semantic.test.mjs',
          detail: 'Source tests pin the historical Opus-to-Sonnet gate, exact-tools bypass, five task-management names, prompt-only filtering, executable-tool preservation, and in-process teammate bypass.',
        },
        {
          id: 'rate-limit-upgrade-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-rate-limit-upgrade-semantic.test.mjs',
          detail: 'Authenticated target97 units 7744, 11313, 11314, 15622, and 17912 pin the inherited server upgrade-path parser plus every changed rate-limit helper, UI option, message call path, and REPL callback by exact range and SHA-256.',
        },
        {
          id: 'rate-limit-upgrade-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-rate-limit-upgrade-semantic.test.mjs',
          detail: 'Source tests pin server-provided upgrade paths, Max subscription/tier detection, the coral Team option, browser-open telemetry, blocked/opened state, and boolean callback threading through message rendering and REPL.',
        },
        {
          id: 'virtual-message-keys-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-virtual-message-keys-semantic.test.mjs',
          detail: 'Authenticated target97 unit 14740 pins the complete duplicate-sibling key normalizer, bounded diagnostic, exact range, and SHA-256.',
        },
        {
          id: 'virtual-message-keys-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-virtual-message-keys-semantic.test.mjs',
          detail: 'Source tests pin deterministic #N suffixes, first-key preservation, the three-key diagnostic bound, multiplication-sign counts, and integration with the virtual list key memo.',
        },
        {
          id: 'plugin-marketplace-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-plugin-marketplace-refresh-semantic.test.mjs',
          detail: 'Authenticated target97 units 12817, 12832, and 14283 pin stale-directory recovery, recent-refresh skipping, refresh status, and cached lookup fallback by exact range and SHA-256.',
        },
        {
          id: 'plugin-marketplace-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-plugin-marketplace-refresh-semantic.test.mjs',
          detail: 'Source tests pin .bak restore/move-aside/rollback/cleanup, the 30-second recent-refresh guard, remote refresh-before-getPlugin behavior, and warn-plus-cached fallback; current source additionally preserves the target116 in-flight coalescing and refresh warning propagation.',
        },
        {
          id: 'vcr-image-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-vcr-image-redaction-semantic.test.mjs',
          detail: 'Authenticated target97 unit 12559 pins the complete base64 image dehydration helper, exact range, and SHA-256.',
        },
        {
          id: 'vcr-image-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-vcr-image-redaction-semantic.test.mjs',
          detail: 'Source tests pin the mapMessages image call path, stable [IMAGE_DATA] replacement, metadata preservation, and non-base64 identity behavior.',
        },
        {
          id: 'command-errors-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-command-error-surfaces-semantic.test.mjs',
          detail: 'Authenticated target97 units 12466, 13527, 13530, 15215, and 15945 pin the typed compaction error, command mapping/rethrow, branch size guard, and 50 MiB constant by exact range and SHA-256.',
        },
        {
          id: 'command-errors-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-command-error-surfaces-semantic.test.mjs',
          detail: 'Source tests pin exhausted-context and media categories/messages, typed-error preservation ahead of generic cause wrapping, and the historical stat-before-read branch guard with ENOENT/log handling; current streaming branch behavior is correctly uncapped.',
        },
        {
          id: 'applescript-quote-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-applescript-quote-semantic.test.mjs',
          detail: 'Authenticated target97 units 18325 and 18327 pin the complete AppleScript and cmd.exe quoting functions by exact range and SHA-256.',
        },
        {
          id: 'applescript-quote-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-applescript-quote-semantic.test.mjs',
          detail: 'Source tests pin AppleScript backslash, quote, newline, and tab escaping plus cmd.exe newline/tab normalization, quote stripping, percent doubling, and trailing-backslash protection.',
        },
        {
          id: 'fps-tracker-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-fps-tracker-semantic.test.mjs',
          detail: 'Authenticated target97 unit 17946 pins the complete FPS tracker class, lifetime counter, sample cap, half-buffer compaction, and percentile calculation by exact range and SHA-256.',
        },
        {
          id: 'fps-tracker-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-fps-tracker-semantic.test.mjs',
          detail: 'Source tests pin lifetime-frame average FPS, the 3,600-sample ceiling and half-buffer compaction, retained-sample 1% low calculation, and adjacent target96 absence.',
        },
        {
          id: 'voice-tip-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-voice-tip-semantic.test.mjs',
          detail: 'Authenticated target97 unit 17675 pins the complete tip-registry initializer, exact range, and SHA-256.',
        },
        {
          id: 'voice-tip-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-voice-tip-semantic.test.mjs',
          detail: 'Source tests pin the voice tip id, content, cooldown, full local-session eligibility predicate, and exact mobile-to-voice-to-opusplan ordering.',
        },
        {
          id: 'compact-truncation-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-compact-truncation-semantic.test.mjs',
          detail: 'Authenticated target97 units 12445-12447, 12452, 12456, and 12465 pin the string/value/message truncators, compact caller, streaming caller, and 100-code-unit constant by exact range and SHA-256; the same test pins the inherited matched cold-compaction gate and attachment filter that make the new path reachable.',
        },
        {
          id: 'compact-truncation-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-compact-truncation-semantic.test.mjs',
          detail: 'Source tests cover the 90-minute feature gate, attachment filtering, thinking removal, recursive input truncation with identity preservation, tool-result flattening, surrogate safety, tool/schema removal, and prompt-cache disabling; current source is separately checked for the later target116 retirement of the truncator.',
        },
        {
          id: 'cron-extra-tasks-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-cron-extra-tasks-semantic.test.mjs',
          detail: 'Authenticated target97 unit 17892 pins the complete scheduler implementation, including synthetic task loading, failure logging, automatic enablement, combined scheduling, and constant false loop-default telemetry, by exact range and SHA-256.',
        },
        {
          id: 'cron-extra-tasks-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-cron-extra-tasks-semantic.test.mjs',
          detail: 'Source tests cover fail-safe async loading, the scheduler-start gate, target97 owner-gated task merging, and the later target116 separation of synthetic tasks plus four-sentinel autonomous-loop telemetry.',
        },
        {
          id: 'sandbox-inbox-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-sandbox-inbox-auto-resolution-semantic.test.mjs',
          detail: 'Authenticated target97 unit 17544 pins the complete inbox poller, automatic sandbox-network decision branch, mailbox response, and queue ordering by exact range and SHA-256.',
        },
        {
          id: 'sandbox-inbox-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-sandbox-inbox-auto-resolution-semantic.test.mjs',
          detail: 'Source tests pin the target97 boolean/null mode table, resolve-before-queue ordering, exact mailbox arguments, and the later target116 classifier/fail-closed evolution.',
        },
        {
          id: 'dynamic-prompt-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-dynamic-system-prompt-semantic.test.mjs',
          detail: 'Authenticated target97 units 12511, 12523, 13808, 16215-16217, 17681, 18392-18393, 18396-18397, 18429, 18432, and 18556 pin every reachable omit, reconstruct, SDK, QueryEngine, print, context, and CLI option path by exact range and SHA-256.',
        },
        {
          id: 'dynamic-prompt-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-dynamic-system-prompt-semantic.test.mjs',
          detail: 'Source tests cover exact memory/environment omission, heading-key reconstruction, merge precedence, custom-prompt behavior, schema/init propagation, cache-key plumbing/reset, and redirected token accounting.',
        },
        {
          id: 'additional-model-costs97-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-additional-model-costs-semantic.test.mjs',
          detail: 'Authenticated target97 units 3205, 17919, and 17921 pin the runtime fallback, bootstrap persistence, and response-schema transformation against their exact target96 predecessors.',
        },
        {
          id: 'additional-model-costs97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-additional-model-costs-semantic.test.mjs',
          detail: 'Source tests execute raw bootstrap pricing transformation and cache persistence, exact-ID and canonical-name lookup precedence, server web-search defaults, unchanged-cache suppression, and unknown-model fallback telemetry.',
        },
        {
          id: 'deferred-tool-delta-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-deferred-tools-delta-semantic.test.mjs',
          detail: 'Authenticated target97 unit 13018 pins the complete deferred-tool attachment normalizer and exact schema-loading and disconnected-server guidance by byte range and SHA-256.',
        },
        {
          id: 'deferred-tool-delta-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-deferred-tools-delta-semantic.test.mjs',
          detail: 'Source tests pin the actionable ToolSearch select syntax, added and removed lists, two-paragraph joining, and the adjacent target96 absence of the schema-loading instructions.',
        },
        {
          id: 'pr-details-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-pr-details-semantic.test.mjs',
          detail: 'Authenticated target97 units 17259 and 17261 pin the complete check-summary function and cached detailed PR fetch by exact byte range and SHA-256.',
        },
        {
          id: 'pr-details-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-pr-details-semantic.test.mjs',
          detail: 'Source tests pin target97 check classification, state and review normalization, GitHub CLI fields, failure handling, and thirty-second caching; current source additionally pins target116 state fallbacks, explicit failure/pending values, and merge/change statistics.',
        },
        {
          id: 'workflow-script-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-workflow-script-permissions-semantic.test.mjs',
          detail: 'Authenticated target97 units 15969, 15985, and 16012 pin the current-session workflow directory, JavaScript-only matcher, and internal write-permission branch by exact range and SHA-256.',
        },
        {
          id: 'workflow-script-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-workflow-script-permissions-semantic.test.mjs',
          detail: 'Source tests pin the project/session/workflows/scripts path, trailing-separator boundary, .js restriction, exact allow reason, and adjacent target96 absence.',
        },
        {
          id: 'tool-input-unicode-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-tool-input-unicode-semantic.test.mjs',
          detail: 'Authenticated target97 unit 16241 pins the complete tool-input normalizer and SendMessage Unicode escape decoder by exact byte range and SHA-256.',
        },
        {
          id: 'tool-input-unicode-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-tool-input-unicode-semantic.test.mjs',
          detail: 'Source tests pin target97 SendMessage decoding and adjacent absence, plus target116 recursive object/array decoding, surrogate-pair handling, lone-surrogate preservation, and escaped-backslash parity.',
        },
        {
          id: 'hook-evaluator-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-hook-evaluator-semantic.test.mjs',
          detail: 'Authenticated target97 units 16062-16066 pin the prompt evaluator, latest usage, token estimator, transcript truncator, and 0.7 budget constant by exact byte range and SHA-256.',
        },
        {
          id: 'hook-evaluator-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-hook-evaluator-semantic.test.mjs',
          detail: 'Source tests pin pre-transcript model selection, non-synthetic assistant usage, 200k/1M budgets, round grouping, newest-round retention, omitted-prefix safety text, truncation telemetry, and evaluator API-error attachment behavior.',
        },
        {
          id: 'recursive-safety-check97-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-recursive-safety-check-semantic.test.mjs',
          detail: 'Authenticated target97 units 13115, 13116, 13122, and 13123 pin the recursive safety-check helper plus permission-request, bypass-mode, and predicate-filtered auto-mode callers by exact byte range and SHA-256.',
        },
        {
          id: 'recursive-safety-check97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-recursive-safety-check-semantic.test.mjs',
          detail: 'Dual-root tests prove direct and arbitrarily nested compound safety-check discovery, predicate filtering for non-classifier-approvable reasons, absence handling, and every reachable caller edge.',
        },
        {
          id: 'auto-mode-telemetry-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-auto-mode-telemetry-semantic.test.mjs',
          detail: 'Authenticated target97 unit 13123 pins the complete auto-mode permission and classifier telemetry owner by exact byte range and SHA-256.',
        },
        {
          id: 'auto-mode-telemetry-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-auto-mode-telemetry-semantic.test.mjs',
          detail: 'Source tests pin the target97 strip-all Bash feature flag field, retained original decision-reason field, and adjacent target96 absence of only the newly introduced flag.',
        },
        {
          id: 'readonly-redirects-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-readonly-redirects-semantic.test.mjs',
          detail: 'Authenticated target97 units 7822-7824 pin the parsed-command permission decision, declarations, and read-only redirect initializer by exact range and SHA-256.',
        },
        {
          id: 'readonly-redirects-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-readonly-redirects-semantic.test.mjs',
          detail: 'Source tests pin AST parsing, input-only redirect treatment, numeric descriptor duplication, network-device rejection, environment-name validation, argv UNC rejection, and the exact adjacent target96 delta.',
        },
        {
          id: 'placeholder-expansion-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-placeholder-expansion-semantic.test.mjs',
          detail: 'Authenticated target97 units 9273 and 16103 pin the complete skill-prompt and command-hook placeholder owners by exact byte range and SHA-256.',
        },
        {
          id: 'placeholder-expansion-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-placeholder-expansion-semantic.test.mjs',
          detail: 'Source tests pin skill-directory and session substitution, Windows path normalization, plugin-root/data association validation, skill-only restrictions, and callback replacement that preserves dollar signs.',
        },
        {
          id: 'worktree-no-track-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-worktree-no-track-semantic.test.mjs',
          detail: 'Authenticated target97 unit 16179 pins the complete worktree creation owner and argument ordering by exact byte range and SHA-256.',
        },
        {
          id: 'worktree-no-track-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-worktree-no-track-semantic.test.mjs',
          detail: 'Source tests pin --no-track before -B for sparse and full worktrees, preserve sparse setup, and prove the adjacent target96 bundle lacked the new argument.',
        },
        {
          id: 'token-warning-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-token-warning-notification-semantic.test.mjs',
          detail: 'Authenticated target97 unit 17012 pins the complete notification owner, warning eligibility branch, replacement fold, timeout, and removal path by exact byte range and SHA-256.',
        },
        {
          id: 'token-warning-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-token-warning-notification-semantic.test.mjs',
          detail: 'Source tests pin threshold, post-compaction suppression, brief-mode suppression, notification replacement, five-hour timeout, removal, three-input token-window calculation, and adjacent target96 absence.',
        },
        {
          id: 'cost-steer-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-agent-cost-steer-semantic.test.mjs',
          detail: 'Authenticated target97 unit 11755 pins the complete environment/subscription cost-steering selector and the newly added Max-plan feature gate by exact range and SHA-256.',
        },
        {
          id: 'cost-steer-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-agent-cost-steer-semantic.test.mjs',
          detail: 'Source tests pin true/false environment precedence, Pro and target97 Max rollouts, exact prompt injection, later Max removal, and the adjacent target96 Pro-only boundary.',
        },
        {
          id: 'permission-shortcuts-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-permission-shortcuts-semantic.test.mjs',
          detail: 'Authenticated target97 units 16848 and 16911 pin the complete Bash and PowerShell permission-dialog owners and every formatted shortcut call by exact byte range and SHA-256.',
        },
        {
          id: 'permission-shortcuts-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-permission-shortcuts-semantic.test.mjs',
          detail: 'Source tests pin shared Byline/KeyboardShortcutHint routing for cancel, amend, explainer, hide-debug, and show-debug actions, including the target Ctrl-D title/uppercase/separator overrides and adjacent target96 hard-coded labels.',
        },
        {
          id: 'agent-effort-cap-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-agent-effort-cap-semantic.test.mjs',
          detail: 'Authenticated target97 units 6281, 6283, and 11589 pin the complete gated cap helper, maximum-effort description, and runAgent caller by exact byte range and SHA-256.',
        },
        {
          id: 'agent-effort-cap-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-agent-effort-cap-semantic.test.mjs',
          detail: 'Source tests pin the rollout gate, normalized effort ordering, medium cap, explicit agent override, exact-fork inheritance, label change, adjacent target96 absence, and verified target116 cap retirement.',
        },
        {
          id: 'model-family-prompt-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-model-family-prompt-semantic.test.mjs',
          detail: 'Authenticated target97 unit 16219 pins the complete environment-information owner and exact Claude family/model guidance by byte range and SHA-256.',
        },
        {
          id: 'model-family-prompt-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-model-family-prompt-semantic.test.mjs',
          detail: 'Source tests pin the target97 Claude 4.6-and-4.5 label, Opus/Sonnet/Haiku tier IDs, latest-capable-model guidance, adjacent target96 label, and accepted target116 4.X/Opus-4.7 evolution.',
        },
        {
          id: 'resume-refresh-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-resume-refresh-semantic.test.mjs',
          detail: 'Authenticated target97 units 14765 and 18082 pin the complete LogSelector refresh/reset owner and ResumeConversation request-generation caller by exact range and SHA-256.',
        },
        {
          id: 'resume-refresh-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-resume-refresh-semantic.test.mjs',
          detail: 'Source tests pin stale-request suppression, previous-result restoration, nonblocking reload rendering, agentic-search reset, exact refreshing/no-match UI, prop plumbing, and adjacent target96 absence.',
        },
        {
          id: 'bridge-cleanup-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-bridge-cleanup-semantic.test.mjs',
          detail: 'Authenticated target97 unit 16636 pins the complete bridge hook and session-only cleanup transition by exact range and SHA-256.',
        },
        {
          id: 'bridge-cleanup-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-bridge-cleanup-semantic.test.mjs',
          detail: 'Source tests pin the session-only teardown diagnostic, its ordering before teardown, complete target owner, and adjacent target96 environment-plus-session predecessor.',
        },
        {
          id: 'bridge-command-alias-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-bridge-command-alias-semantic.test.mjs',
          detail: 'Authenticated target97 units 15801 and 17469 pin the local-JSX alias resolver and complete bridge input caller by exact range and SHA-256.',
        },
        {
          id: 'bridge-command-alias-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-bridge-command-alias-semantic.test.mjs',
          detail: 'Source tests pin same-name local allowlist resolution, leading-token-only rewrite, effective command injection, unavailable fallback preservation, and adjacent target96 absence.',
        },
        {
          id: 'focus-collapse-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-focus-collapse-semantic.test.mjs',
          detail: 'Authenticated target97 units 9664-9667, 11466, and 17271 pin the complete collapse pipeline, collapsed read/search renderer, and reachable Focus footer by exact range and SHA-256.',
        },
        {
          id: 'focus-collapse-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-focus-collapse-semantic.test.mjs',
          detail: 'Source tests pin target97 collapse grouping and exclusions, collapsed summary rendering, briefTranscript state/init reachability and Focus label, plus the verified later renderer evolution and Focus retirement.',
        },
        {
          id: 'markdown-blockquote97-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-markdown-blockquote-semantic.test.mjs',
          detail: 'Authenticated target97 units 10109 and 10110 pin the top-level token partition and complete dedicated Ink blockquote renderer by exact range and SHA-256.',
        },
        {
          id: 'markdown-blockquote97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-markdown-blockquote-semantic.test.mjs',
          detail: 'Dual-root tests prove target96 absence, target97 introduction, top-level blockquote extraction, italic token formatting, quote-border geometry, and dim-color propagation while distinguishing the later whitespace evolution.',
        },
        {
          id: 'dream-verify-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-dream-verify-semantic.test.mjs',
          detail: 'Authenticated target97 unit 18148 and units 18157-18162 pin the exact legacy /verify payload and every /dream gate, scheduler, prompt, registration, and initializer unit by byte range and SHA-256.',
        },
        {
          id: 'dream-verify-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-dream-verify-semantic.test.mjs',
          detail: 'Source tests pin the complete /dream runtime gate, randomized nightly schedule, cron-unavailable path, telemetry, consolidation stamp, prompt behavior, and byte-exact legacy /verify payload.',
        },
        {
          id: 'sandbox-mach-lookup-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-sandbox-mach-lookup-semantic.test.mjs',
          detail: 'Authenticated target97 units 2500, 6207, and 6227 plus their exact target96 predecessors pin the schema, runtime conversion, and sandbox-manager forwarding graph by byte range and SHA-256.',
        },
        {
          id: 'sandbox-mach-lookup-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-sandbox-mach-lookup-semantic.test.mjs',
          detail: 'Source and executable tests pin allowMachLookup validation, runtime-config propagation, and the public manager accessor while preserving exact macOS XPC service patterns.',
        },
        {
          id: 'auto-dream-first-enable-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-auto-dream-first-enable-semantic.test.mjs',
          detail: 'Authenticated target97 unit 13953 and unmatched target96 unit 13906 pin the exact MemoryFileSelector telemetry boundary by byte range and SHA-256.',
        },
        {
          id: 'auto-dream-first-enable-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-auto-dream-first-enable-semantic.test.mjs',
          detail: 'Source and executable tests prove initial settings are sampled before persistence and distinguish first enable, later enable, and disable telemetry.',
        },
        {
          id: 'repl-bridge-config-aliases-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-repl-bridge-config-aliases-semantic.test.mjs',
          detail: 'Authenticated target97 unit 15662 pins the three added stable REPL bridge configuration exports by exact range and SHA-256 while target96 has none.',
        },
        {
          id: 'repl-bridge-config-aliases-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-repl-bridge-config-aliases-semantic.test.mjs',
          detail: 'AST-backed source tests prove each public REPL name aliases the live env-less declaration and retains validated config fallback and minimum-version behavior.',
        },
        {
          id: 'notification-lifecycle-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-notification-lifecycle-semantic.test.mjs',
          detail: 'Authenticated target97 units 13183, 13184, 13186, and 13187 plus exact target96 predecessors pin the provider, shared refs, last-consumer cleanup, context initialization, and replacement of bundle-global lifecycle state by byte range and SHA-256.',
        },
        {
          id: 'notification-lifecycle-app-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-notification-lifecycle-semantic.test.mjs',
          detail: 'Authenticated target97 App unit 16495 and target96 predecessor 16450 pin the notification-provider edge inside the reachable interactive App wrapper by exact range and SHA-256.',
        },
        {
          id: 'notification-lifecycle-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-notification-lifecycle-semantic.test.mjs',
          detail: 'Source and executable tests prove provider-scoped refs, per-consumer fallback, App reachability, queue startup, and timer cleanup only after the last shared consumer unmounts; an authenticated target116 check pins persistence.',
        },
        {
          id: 'auto-mode-denials-provider-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-auto-mode-denials-provider-semantic.test.mjs',
          detail: 'Authenticated target97 units 15040-15043, 15055, 15073, and 17448 plus exact target96 predecessors pin the provider-owned capped store, hook, context initialization, both UI readers, and permission-decision writer by byte range and SHA-256.',
        },
        {
          id: 'auto-mode-denials-provider-app-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-auto-mode-denials-provider-semantic.test.mjs',
          detail: 'Authenticated target97 App unit 16495 and target96 predecessor 16450 pin the denial-provider edge inside the notification provider and reachable interactive App wrapper by exact range and SHA-256.',
        },
        {
          id: 'auto-mode-denials-provider-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-auto-mode-denials-provider-semantic.test.mjs',
          detail: 'Source and executable tests prove provider isolation, newest-first retention capped at twenty, classifier feature gating, all three consumer edges, App wrapper order, and persistence through authenticated target116.',
        },
        {
          id: 'loop-chain-state97-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-loop-chain-state-semantic.test.mjs',
          detail: 'Authenticated target97 initializer unit 361 and accessor units 513-515 pin the null-prototype prompt registry plus get, set, and delete API by exact range and SHA-256; the authenticated target96 initializer lacks the registry.',
        },
        {
          id: 'loop-chain-state97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-loop-chain-state-semantic.test.mjs',
          detail: 'Source and executable tests prove isolated prompt-keyed get/set/delete semantics, target101 scheduler consumption, and persistence through target116 initializer, accessors, scheduler, and cancellation units.',
        },
        {
          id: 'agent-repl-tool-pool97-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-agent-repl-tool-pool-semantic.test.mjs',
          detail: 'Authenticated target97 units 11761, 12231, 12255, and 12256 plus exact target96 predecessors pin both worker callers and the option-aware shared getTools/assembleToolPool graph by byte range and SHA-256.',
        },
        {
          id: 'agent-repl-tool-pool97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-agent-repl-tool-pool-semantic.test.mjs',
          detail: 'Source and executable tests prove main REPL filtering, worker-only primitive preservation, permission filtering, MCP retention, and exact option propagation through both new and resumed workers.',
        },
        {
          id: 'settings-view-mode97-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-settings-view-mode-semantic.test.mjs',
          detail: 'Authenticated target97 settings unit 2588 and unmatched target96 predecessor 2577 pin the optional default/verbose/focus Zod property, invalid-value fallback, and exact public description.',
        },
        {
          id: 'settings-view-mode97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-settings-view-mode-semantic.test.mjs',
          detail: 'AST-backed source tests prove the exact optional invalid-safe schema and the persisted setting’s later focus-mode consumer.',
        },
        {
          id: 'image-token-compression97-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-image-token-compression-semantic.test.mjs',
          detail: 'Authenticated target97 image unit 7068 and unmatched target96 predecessor 7065 pin the 25,000-token threshold, tokenCompressed marker, compression call, and fallback by exact range and SHA-256.',
        },
        {
          id: 'image-token-compression97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-image-token-compression-semantic.test.mjs',
          detail: 'The authentic target function is executed for below-limit, compressed, and compressor-failure paths; dual-root source checks distinguish the target97 token contract from target110’s later 500 KiB byte cap.',
        },
        {
          id: 'mcp-result-size97-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-mcp-result-size-annotation-semantic.test.mjs',
          detail: 'Authenticated target97 units 8734-8736 and 8741 plus their exact target96 predecessors pin the annotation from live tool factory through retries and direct execution into result processing by byte range and SHA-256.',
        },
        {
          id: 'mcp-result-size97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-mcp-result-size-annotation-semantic.test.mjs',
          detail: 'Source and executable tests cover annotation validation/capping, retry forwarding, non-image bypass, image safety, unannotated truncation/persistence, and persistence through authenticated target114 and target116.',
        },
        {
          id: 'link-scan-offset97-static-ast',
          kind: 'static-ast',
          path: 'recovery/test/recovery-2.1.97-link-scan-offset-dce-semantic.test.mjs',
          detail: 'Authenticated whole-bundle scope proves the schema binding containing linkScanOffset is never read after its declaration and initializer assignment, making the added field runtime-unobservable.',
        },
        {
          id: 'routine-cron97-static-ast',
          kind: 'static-ast',
          path: 'recovery/test/recovery-2.1.97-routine-cron-dce-semantic.test.mjs',
          detail: 'Authenticated whole-bundle AST scope proves the optional routine integration binding remains null with no writes, so the guarded branch inside the otherwise-live scheduled-task hook cannot execute.',
        },
        {
          id: 'unicode-delimiters-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-unicode-delimiters-semantic.test.mjs',
          detail: 'Authenticated target97 units 12692-12694, 17041, 17052, 17088, and 17093 pin every changed attachment, slash-command, and typeahead delimiter parser by exact range and SHA-256.',
        },
        {
          id: 'unicode-delimiters-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-unicode-delimiters-semantic.test.mjs',
          detail: 'Source tests pin CJK punctuation boundaries for quoted/unquoted attachments, mid-input slash commands, highlights, and member typeahead while preserving the direct-message grammar.',
        },
        {
          id: 'bash-whitespace-normalization-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-bash-whitespace-normalization-semantic.test.mjs',
          detail: 'Authenticated baseline96 unit 12208 and target97 unit 9905 plus executable source tests pin exact and prefix command matching, horizontal-whitespace normalization, xargs handling, and boundary-negative behavior.',
        },
        {
          id: 'team-memory-bash-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-team-memory-bash-semantic.test.mjs',
          detail: 'Authenticated target97 units 9738, 9742, 9750, 9753-9756, 9758-9761, 9773, 9903, 9905, 9914, and 9919 are pinned by exact structural class, byte range, and SHA-256.',
        },
        {
          id: 'team-memory-bash-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-team-memory-bash-semantic.test.mjs',
          detail: 'Source tests pin remote tombstone reaping and convergence, watcher telemetry, environment assignment safety, and network-device redirect rejection.',
        },
        {
          id: 'transcript-mirror-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-transcript-mirror-semantic.test.mjs',
          detail: 'Authenticated target97 structural units 10954, 15846, 15847, 15851, 17347, 18387, 18428, 18429, and 18556 are pinned by exact range and SHA-256.',
        },
        {
          id: 'bridge-git-session-context97-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-bridge-git-session-context-semantic.test.mjs',
          detail: 'Authenticated baseline96 unit 14478 and target97 units 14524, 14525, and 14528 pin the helper export, shared Git context builder, and reachable bridge session creator by exact structural class, byte range, and SHA-256.',
        },
        {
          id: 'bridge-git-session-context97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-bridge-git-session-context-semantic.test.mjs',
          detail: 'Source and executable tests prove explicit/default/invalid repository revision handling, shared source/outcome branches, original-cwd and outcome-reuse request fields, authentication short-circuiting, live caller reachability, and persistence through authenticated inner target116.',
        },
        {
          id: 'session-writer-coordination97-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-session-writer-coordination-semantic.test.mjs',
          detail: 'Authenticated baseline96 units 7855, 15782, 15818, 16493, 17935, and 18391 plus target97 units 7867, 15811, 15817, 15846-15848, 15851, 16538, 17912, and 18396 pin the complete coordinated writer graph by structural class, byte range, and SHA-256.',
        },
        {
          id: 'session-writer-coordination97-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-session-writer-coordination-semantic.test.mjs',
          detail: 'Dual-boundary and executable tests prove safe streaming-assistant cursor behavior, forced terminal drains, tracked speculative writes, mirror-after-append ordering, flush blocking and finally cleanup, target110 singleton-to-additive mirror evolution, and retained target116 coordination.',
        },
        {
          id: 'transcript-mirror-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-transcript-mirror-semantic.test.mjs',
          detail: 'Source tests pin the internal frame schema, successful-write mirror ordering, stdout-only routing, headless registration, and flush-before-result behavior.',
        },
      )
      evidence.push(
        {
          id: 'managed-agents-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.97-managed-agents-semantic.test.mjs',
          detail: 'Authenticated target97 units 18186, 18204, 18208, 18214, 18216, 18218, 18220, 18222, 18224, 18226, 18228, 18230, 18248, and 18253 pin every managed-agent document and the content-map initializer by exact range and SHA-256.',
        },
        {
          id: 'managed-agents-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.97-managed-agents-semantic.test.mjs',
          detail: 'Historical source documents are compared byte-for-byte with their cooked target bundle literals, and every document is asserted in the Claude API content map.',
        },
      )
    }
    if (caseName === '2.1.100-to-2.1.101') {
      evidence.push(
        {
          id: 'dormant-session-schema101-static-ast',
          kind: 'static-ast',
          path: 'recovery/test/recovery-2.1.101-dormant-session-schema-semantic.test.mjs',
          detail: 'Authenticated target101 unit 14720 is parsed and proves its schema binding occurs only in the outer declaration and initializer assignment across the full bundle; the added linkScanPath and proactive fields are never read or invoked.',
        },
        {
          id: 'schedule-remote-gate101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-schedule-remote-gate-semantic.test.mjs',
          detail: 'Authenticated baseline100 unit 18356 and target101 unit 18512 pin the complete scheduled-agent descriptor before and after the local-only remote-session gate by exact range and SHA-256.',
        },
        {
          id: 'schedule-remote-gate101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-schedule-remote-gate-semantic.test.mjs',
          detail: 'The source-root-aware test proves CLAUDE_CODE_REMOTE is checked before the inherited feature and policy gates and that the target101 owner does not acquire the later /routines alias.',
        },
      )
    }
    if (caseName === '2.1.98-to-2.1.100') {
      evidence.push(
        {
          id: 'spinner-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.100-spinner-semantic.test.mjs',
          detail: 'Authenticated target100 units 10961 and 10963 pin the complete animated spinner row and its sixteen-second constant by exact range and SHA-256.',
        },
        {
          id: 'spinner-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.100-spinner-semantic.test.mjs',
          detail: 'Source tests pin thinking-mode stall suppression, the target100 timing threshold, inherited formatted escape hint, and later target116 progressive thinking/token visibility behavior.',
        },
      )
    }
    if (caseName === '2.1.100-to-2.1.101') {
      evidence.push(
        {
          id: 'bash-newline101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-bash-newline-sandbox-semantic.test.mjs',
          detail: 'Authenticated target101 units 7829, 10051, and 10058 pin the deferred newline-hash discriminator, AST-aware sandbox auto-allow helper, and both reachable permission-flow calls by exact range and SHA-256.',
        },
        {
          id: 'bash-newline101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-bash-newline-sandbox-semantic.test.mjs',
          detail: 'Dual-root source tests prove deferred failure priority, the three argv/env/redirect markers, deny-before-sandbox ordering, unsafe environment and network redirect rejection, and the target116 dangerous-removal evolution.',
        },
        {
          id: 'mcp-init101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-mcp-init-handshake-semantic.test.mjs',
          detail: 'Authenticated target101 units 18621 through 18624 and 18797 pin the complete headless coordinator, state adapter, sequential readiness phases, deduplication, and MCP server factory transition by exact range and SHA-256.',
        },
        {
          id: 'mcp-init101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-mcp-init-handshake-semantic.test.mjs',
          detail: 'Dual-root source tests prove the reachable manager call, pending/readiness state mutation, five-second nonblocking target101 behavior, server deduplication, exact MCP ToolUseContext factory, and the target116 concurrent retry evolution.',
        },
        {
          id: 'compact-hook101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-compact-hook-state-semantic.test.mjs',
          detail: 'Authenticated target101 units 12639, 12640, 12643, 13731, 16323, 16330, 16356, 16364, 17770, and 18736 pin response-count state and every changed compact, hook, queued-input, and query caller by exact range and SHA-256.',
        },
        {
          id: 'compact-hook101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-compact-hook-state-semantic.test.mjs',
          detail: 'Dual-root source tests prove response-count add/reset propagation, direct hook increments, rewake and active Stop-hook queue state, and per-query refresh of tools, environment, lifecycle, tasks, and attachments.',
        },
        {
          id: 'remote-settings101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-remote-settings-validation-semantic.test.mjs',
          detail: 'Authenticated target101 units 10359, 10367, and 10370 pin the clone-and-filter helper, fetch validation path, and sanitized security-comparison caller by exact range and SHA-256.',
        },
        {
          id: 'remote-settings101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-remote-settings-validation-semantic.test.mjs',
          detail: 'Dual-root source tests prove filtered-copy validation, raw fetched-object persistence, invalid-response retry suppression, and cloned cached/new settings at the security boundary, including target116 persistence.',
        },
        {
          id: 'stored-image101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-stored-image-state-semantic.test.mjs',
          detail: 'Authenticated target101 units 8740, 8761, 8773, 11593, 13661, 16938, and 16940 pin AppState-backed image rendering, selection, clearing, and immutable publication by exact range and SHA-256.',
        },
        {
          id: 'stored-image101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-stored-image-state-semantic.test.mjs',
          detail: 'Dual-root source tests prove default and CLI initialization, immutable path publication, selector-based hyperlink rendering, CustomSelect image navigation, cache clearing, and the later target116 image-description evolution.',
        },
        {
          id: 'api-error101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-api-error-rate-limit-semantic.test.mjs',
          detail: 'Authenticated target101 unit 11628 pins the complete API-error retry renderer, duration/reset formatting, rate-limit branch, and exact early-retry suppression by range and SHA-256.',
        },
        {
          id: 'api-error101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-api-error-rate-limit-semantic.test.mjs',
          detail: 'Dual-root source tests prove retry timing, attempt display, named rate-limit errors, target101 early retry suppression, and the latest actionable-failure suppression evolution.',
        },
        {
          id: 'context-unattributed101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-context-unattributed-tokens-semantic.test.mjs',
          detail: 'Authenticated target101 units 12729 and 17996 pin the bounded API-usage reconciliation, residual message-token bucket, and SDK response schema by exact range and SHA-256.',
        },
        {
          id: 'context-unattributed101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-context-unattributed-tokens-semantic.test.mjs',
          detail: 'Dual-root source tests prove fixed-category subtraction, reserved-window bounding, exact residual subtraction across all classified message buckets, redirected context accounting, and target116 persistence.',
        },
        {
          id: 'session-env101-ultraplan-transitive-owner',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.91-ultraplan-semantic.test.mjs',
          detail: 'Target101 Ultraplan unit 17858 is a narrow sessionEnvVars delta over the earlier authenticated UltraplanChoiceDialog owner; cumulative replay layers the earlier owner before this call-path evolution.',
        },
        {
          id: 'session-env101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-session-env-vars-semantic.test.mjs',
          detail: 'Authenticated target101 units 9058, 9146, 9390, 9392, 10005, 10007, 12393, 12611, 13666, 17321, 17385, 17611, 17858, 18222, 18735, 18736, and 18768 pin the complete per-session environment graph and remote ulimit by exact range and SHA-256.',
        },
        {
          id: 'session-env101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-session-env-vars-semantic.test.mjs',
          detail: 'Dual-root source tests prove one isolated map across interactive, headless, agent, monitor, Bash, PowerShell, completion, clear, and Ultraplan paths; target101 owns the remote ulimit while current source owns its BUN_OPTIONS successor.',
        },
        {
          id: 'remote-io-tracking101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-remote-io-write-tracking-semantic.test.mjs',
          detail: 'Authenticated target101 unit 18726 pins the RemoteIO class, dynamic initial/reconnect Authorization headers, transcript-mirror guard, tracking call, and both write transports by exact range and SHA-256.',
        },
        {
          id: 'remote-io-tracking101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-remote-io-write-tracking-semantic.test.mjs',
          detail: 'Dual-root source tests prove protected tracking ownership, pre-transport invocation for CCR and direct transport writes, refreshable auth headers, target100-to-101 call-count evolution, and target116 persistence.',
        },
        {
          id: 'chrome-onboarding101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-chrome-onboarding-focus-semantic.test.mjs',
          detail: 'Authenticated target101 unit 18346 pins the complete onboarding component, modifier-free Enter branch, preventDefault call, focusable auto-focused container, and local onKeyDown ownership by exact range and SHA-256.',
        },
        {
          id: 'chrome-onboarding101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-chrome-onboarding-focus-semantic.test.mjs',
          detail: 'Dual-root source tests prove focus-scoped confirmation, modified-key rejection, accepted-event suppression, removal of the global input hook, and target116 persistence.',
        },
        {
          id: 'command-agent-bootstrap101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-command-agent-bootstrap-semantic.test.mjs',
          detail: 'Authenticated target101 unit 18240 pins the extracted tool, command, and agent bootstrap helper, all input properties, promise ordering, CLI-agent merge, selection, and result shape by exact range and SHA-256.',
        },
        {
          id: 'command-agent-bootstrap101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-command-agent-bootstrap-semantic.test.mjs',
          detail: 'Dual-root source tests prove the equivalent startup ordering, rejection suppression, coordinator filtering, tools-loaded checkpoint, CLI-agent merge, active-agent filtering, main-thread selection, target100 absence, and target116 helper persistence.',
        },
        {
          id: 'command-display101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-command-display-search-semantic.test.mjs',
          detail: 'Authenticated target101 unit 17325 pins the complete Fuse-index builder, including canonical and user-facing names, split-part keys, and all six exact weights by range and SHA-256.',
        },
        {
          id: 'command-display101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-command-display-search-semantic.test.mjs',
          detail: 'Dual-root source tests prove canonical and user-facing command-name indexing, conditional part splitting, exact weighting and ordering, target100 absence, and target116 persistence.',
        },
        {
          id: 'suggestion-padding101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-suggestion-padding-semantic.test.mjs',
          detail: 'Authenticated target101 unit 13533 and its exact matched padding-row helper pin the optional noPad branch, visible-row deficit calculation, and keyed filler rendering by exact range and SHA-256.',
        },
        {
          id: 'suggestion-padding101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-suggestion-padding-semantic.test.mjs',
          detail: 'Dual-root source tests prove target100 absence, target101 filler-row suppression and default padding, plus the reachable target116 anchored-overlay noPad caller and empty-message padding behavior.',
        },
        {
          id: 'oauth-outdent101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-oauth-url-outdent-semantic.test.mjs',
          detail: 'Authenticated target101 units 11411 and 11429 pin the complete console OAuth URL offset consumer and Login propagation by exact range and SHA-256.',
        },
        {
          id: 'oauth-outdent101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-oauth-url-outdent-semantic.test.mjs',
          detail: 'Dual-root source tests prove the Windows link offset, platform-specific Dialog padding contribution, negative URL margin, target100 absence, and target116 persistence.',
        },
        {
          id: 'state-operations101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-state-operations-semantic.test.mjs',
          detail: 'Authenticated target101 units 7933, 9465, 9468-9470, 9678, 9696, 9755, 10003, 12611, 14977, 16380, 16415, 18222, 18732, 18735, and 18799 pin both reducers and every changed reachable state-operation caller by exact range and SHA-256.',
        },
        {
          id: 'state-operations101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-state-operations-semantic.test.mjs',
          detail: 'Source-root tests pin file-history track/snapshot and attribution trackEdit/trackBulk/commitBoundary reducers, pre-IO state capture, post-IO operation application, all tool/context callers, and complete removal of the old closure-updater contract at the target100-to-target101 boundary.',
        },
        {
          id: 'remote-ingress101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-remote-ingress-semantic.test.mjs',
          detail: 'Authenticated target101 units 11760, 11785, 11861, and 16902 pin the environment creator, trusted-device ingress branch, teleport orchestration, and REPL bridge hook by exact range and SHA-256; matched unit 11759 separately proves original-error preservation.',
        },
        {
          id: 'remote-ingress101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-remote-ingress-semantic.test.mjs',
          detail: 'Source-root tests pin trusted-device 403 handling, environment auto-creation and defaults, exact failure reasons, connected-versus-failed bridge status and dedupe, display name, cancellation cleanup, target101 persistence behavior, and the later target116 outbound-only evolution.',
        },
        {
          id: 'away-summary101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-away-summary-semantic.test.mjs',
          detail: 'Authenticated target101 units 17943-17945 and 17947-17951 pin the cache-safe generator, text extractor, exact prompt, message predicates, scheduling hook, and initializer graph by exact range and SHA-256.',
        },
        {
          id: 'away-summary101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-away-summary-semantic.test.mjs',
          detail: 'Source-root tests pin no-tool one-turn generation without transcript or cache writes, exact recap extraction, five-minute blur and message thresholds, API-metrics insertion, mid-turn pending behavior, abort cleanup, and the target100-to-target101 introduction while accepting verified target116 evolution.',
        },
        {
          id: 'invalid-settings101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-invalid-settings-severity-semantic.test.mjs',
          detail: 'Authenticated target101 units 18396 and 18397 pin the complete severity-aware settings dialog and warning predicate by exact range and SHA-256.',
        },
        {
          id: 'invalid-settings101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-invalid-settings-severity-semantic.test.mjs',
          detail: 'Source-root tests pin warning versus error titles, explanatory copy, option ordering, cancellation behavior, warning predicate, target100 absence, and target116 persistence.',
        },
        {
          id: 'frame-html101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-frame-html-permission-semantic.test.mjs',
          detail: 'Authenticated target101 units 16244, 16245, and 16272 pin the per-session frame directory, exact frame.html matcher, and reachable internal-write allowance by exact range and SHA-256.',
        },
        {
          id: 'frame-html101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-frame-html-permission-semantic.test.mjs',
          detail: 'Source-root tests pin normalized exact-file matching, per-session directory construction, branch ordering and decision reason at target101, plus the intentional retirement from current source.',
        },
        {
          id: 'open-frame101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-open-frame-keybinding-semantic.test.mjs',
          detail: 'Authenticated target101 unit 8167 pins the complete keybinding action validator containing the sole app:openFrame introduction by exact range and SHA-256.',
        },
        {
          id: 'open-frame101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-open-frame-keybinding-semantic.test.mjs',
          detail: 'Source-root tests pin app:openFrame as an observable app-level keybinding action, prove target100 absence and target101 introduction, and exercise both the materialized historical source and current source modes.',
        },
        {
          id: 'client-presence101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-client-presence-semantic.test.mjs',
          detail: 'Authenticated target101 changed units 16818, 16819, and 16821 pin focus wiring, cleanup, and state initialization by exact range and SHA-256; matched pulse and bridge reachability units 16820, 16882, and 16883 are pinned in the same test.',
        },
        {
          id: 'client-presence101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-client-presence-semantic.test.mjs',
          detail: 'Source-root tests pin focus-only pulses, subscription and teardown cleanup, throttling, connection identity, authenticated session-establishment wiring, exact target101 client platform, and verified target116 identity/platform evolution.',
        },
        {
          id: 'homebrew-version101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-homebrew-version-semantic.test.mjs',
          detail: 'Authenticated target101 units 10745, 10746, 17267, and 18876 pin the Homebrew cask lookup, concurrent GCS fallback, package-manager updater call, and interactive update command by exact range and SHA-256.',
        },
        {
          id: 'homebrew-version101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-homebrew-version-semantic.test.mjs',
          detail: 'Source-root tests pin JSON cask lookup, fail-open logging, concurrent fallback with Homebrew preference, both reachable callers, the null-result manual command, target100 absence, and target116 persistence.',
        },
        {
          id: 'managed-hooks101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-managed-hook-loading-semantic.test.mjs',
          detail: 'Authenticated target101 units 11805 and 11806 pin the complete SessionStart and Setup hook-loading functions, including the managed-plugin exception, by exact range and SHA-256.',
        },
        {
          id: 'managed-hooks101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-managed-hook-loading-semantic.test.mjs',
          detail: 'Source-root tests pin both allowManagedHooksOnly branches, require the managed-plugin null guard and exact diagnostic, prove target100 absence, and verify target116 persistence.',
        },
        {
          id: 'worktree-resume101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-worktree-resume-hint-semantic.test.mjs',
          detail: 'Authenticated target101 units 10248-10251 and 10255 pin the current-worktree accessor, sticky resume-name setter/getter/clear helpers, and complete interactive resume-hint function by exact range and SHA-256.',
        },
        {
          id: 'worktree-resume101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-worktree-resume-hint-semantic.test.mjs',
          detail: 'Source-root tests pin sticky worktree-name capture, preservation versus destructive cleanup, exact --worktree resume rendering, target100 absence, and the target116 entered-existing exclusion.',
        },
        {
          id: 'ccr-viability101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-ccr-source-viability-semantic.test.mjs',
          detail: 'Authenticated target101 units 15080, 15108, 15114-15116, 17866, 17867, 17874, and 18222 pin source viability, Ultraplan creation and polling, the launch dialog, and REPL replacement reachability by exact range and SHA-256.',
        },
        {
          id: 'ccr-viability101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-ccr-source-viability-semantic.test.mjs',
          detail: 'Source-root tests pin clone and bundle viability, exact upload guidance, sourcePromise propagation through command/state/dialog/REPL, plan-ready notification, cancellation restoration, transcript replacement, target100 absence, and verified target116 evolution.',
        },
        {
          id: 'insights-response101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-insights-response-semantic.test.mjs',
          detail: 'Authenticated target101 units 16012 and 16048 pin the exported insights response formatter and its seven observable parameter properties by exact range and SHA-256.',
        },
        {
          id: 'insights-response101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-insights-response-semantic.test.mjs',
          detail: 'Source-root tests pin private at-a-glance context, exact message-tag output, the verbatim/no-omission directive, complete formatter call, target100 replacement, and target116 persistence.',
        },
        {
          id: 'trusted-device-retry101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-trusted-device-retry-semantic.test.mjs',
          detail: 'Authenticated target101 unit 10239 pins the raw trusted-token reader and gate exports, unit 16876 pins the complete fresh credential retry, and matched units 16868-16870 pin the inherited target91 terminal parser and fetch path by exact range and SHA-256.',
        },
        {
          id: 'trusted-device-retry101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-trusted-device-retry-semantic.test.mjs',
          detail: 'Source-root tests pin the raw memoized reader and public gate, cache clearing, fresh-token inequality, one retry, null-result preservation, gate-dependent terminal handling, target100 absence, target116 persistence, and the inherited 90-to-91 terminal-status lineage.',
        },
        {
          id: 'bridge-worktree101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-bridge-worktree-preservation-semantic.test.mjs',
          detail: 'Authenticated target101 units 16653 and 16659 pin the complete bridge poll-loop lifecycle and worktree cleanup helper, including crash preservation, forced spawn-failure cleanup, dirty and commit inspection, and archive suppression, by exact range and SHA-256.',
        },
        {
          id: 'bridge-worktree101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-bridge-worktree-preservation-semantic.test.mjs',
          detail: 'Source-root tests pin unexpected-crash preservation, failed-session archive exclusion, force-only cleanup, exact dirty and commits-ahead reasons, head-commit propagation, target100 inherited-helper versus target101 evolution, and target116 removal attribution.',
        },
        {
          id: 'agent-task101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-agent-task-notification-semantic.test.mjs',
          detail: 'Authenticated target101 units 11749, 12104, and 13259 pin the interrupted-agent Stop-hook path, TaskOutput descriptor and prompt, and system-notification framing by exact range and SHA-256.',
        },
        {
          id: 'agent-task101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-agent-task-notification-semantic.test.mjs',
          detail: 'Source-root tests pin interrupted-query Stop-hook ordering and context, exact task-type-specific deprecation guidance, safe local-agent transcript handling, the non-user notification boundary, and authenticated target100 absence and target101 introduction.',
        },
        {
          id: 'agent-background101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-agent-background-guidance-semantic.test.mjs',
          detail: 'Authenticated target101 units 11919 and 11924 pin the complete Agent prompt function and AgentTool descriptor, including no-reread guidance, progress events, and async-result handling, by exact range and SHA-256.',
        },
        {
          id: 'agent-background101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-agent-background-guidance-semantic.test.mjs',
          detail: 'Source-root tests pin the fail-closed fork and output-file contract, background-hint and clear event reachability, exact progress-question guidance, and the authenticated target100-to-target101 transition.',
        },
        {
          id: 'tool-search101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-tool-search-mcp-names-semantic.test.mjs',
          detail: 'Authenticated target101 unit 7078 pins the complete MCP-aware tool-name parser and its observable whitespace, underscore, and period tokenization by exact range and SHA-256.',
        },
        {
          id: 'tool-search101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-tool-search-mcp-names-semantic.test.mjs',
          detail: 'Source-root tests pin original MCP server/tool display-name consumption, normalized-name fallback, exact delimiter semantics, and target100-to-target101 introduction.',
        },
        {
          id: 'team-memory101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-team-memory-availability-semantic.test.mjs',
          detail: 'Authenticated target101 units 361, 467-468, 479-480, 6793, 6799, 9890-9892, 9901-9902, 9905, and 18767 pin streaming-input state and wiring plus the complete team-memory availability graph by exact range and SHA-256.',
        },
        {
          id: 'team-memory101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-team-memory-availability-semantic.test.mjs',
          detail: 'Source-root tests pin streaming-input async-rewake reachability, team-memory state accessors and cwd gate, forbidden/feature-unavailable/empty/content transitions, 404 code consumption, and the transitive early server-metadata helper boundary.',
        },
        {
          id: 'main-input101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-main-input-normalization-semantic.test.mjs',
          detail: 'Authenticated target101 units 18890 and 18895 pin the settings parser and slow-stdin diagnostic helper by exact range and SHA-256.',
        },
        {
          id: 'main-input101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-main-input-normalization-semantic.test.mjs',
          detail: 'Source-root tests prove both diagnostics are inherited unchanged and reconstruct the exact target strings across source newline handling and compiler string-concatenation folding.',
        },
        {
          id: 'keybinding-loader101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-keybinding-loader-state-semantic.test.mjs',
          detail: 'Authenticated target101 units 8184-8186 and 8189-8197 pin the complete state-threaded keybinding loader, watcher, telemetry, reload-signal, and disposal graph by exact range and SHA-256.',
        },
        {
          id: 'keybinding-loader101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-keybinding-loader-state-semantic.test.mjs',
          detail: 'Source-root tests pin the shared loader state, daily telemetry, initialized/disposed watcher guards, change/delete reload signaling, feature default, and singleton disposal/reset across target101 and target116.',
        },
        {
          id: 'agent-metadata101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-agent-metadata-mirror-semantic.test.mjs',
          detail: 'Authenticated target101 unit 16085 pins the complete agent metadata writer and transcript mirror event by exact range and SHA-256.',
        },
        {
          id: 'agent-metadata101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-agent-metadata-mirror-semantic.test.mjs',
          detail: 'Source-root tests pin post-write mirror ordering, .meta.json to .jsonl identity conversion, agent type and optional worktree/description payload fields, and target100-to-target101 introduction.',
        },
        {
          id: 'bg-session101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-background-session-prompt-slot-semantic.test.mjs',
          detail: 'Authenticated target101 unresolved unit 16476 pins the named background-session prompt slot; matched unit 16485 pins its inherited null helper by exact range and SHA-256.',
        },
        {
          id: 'bg-session101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-background-session-prompt-slot-semantic.test.mjs',
          detail: 'Source-root tests pin the null-valued helper, output-style/background-session/scratchpad ordering, and the exact target100-to-target101 reachability transition.',
        },
        {
          id: 'update-command101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-update-relaunch-semantic.test.mjs',
          detail: 'Authenticated target101 units 15821, 15823-15826, 15828, and 16067 pin the hidden update descriptor, complete relaunch function, module registration, and command registry; matched unit 11398 pins the transitive launcher helper.',
        },
        {
          id: 'update-command101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-update-relaunch-semantic.test.mjs',
          detail: 'Source-root tests pin launcher resolution, bounded flush and cleanup ordering, resumable child spawn, signal neutralization, exit propagation, exact descriptor flags, registry reachability, and later current safety evolution.',
        },
        {
          id: 'message-rating101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-message-rating-hover-semantic.test.mjs',
          detail: 'Authenticated target101 unit 10235 and its matched target100 predecessor pin the inherited rating provider and the 150ms-to-500ms hover-leave transition by exact range and SHA-256.',
        },
        {
          id: 'message-rating101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-message-rating-hover-semantic.test.mjs',
          detail: 'Dual-root source tests require the target101 hover grace period and distinguish its pre-surface historical callback from the later current rating telemetry evolution.',
        },
        {
          id: 'kill-ring101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-kill-ring-context-semantic.test.mjs',
          detail: 'Authenticated target101 units 13442, 13446-13449, 13451, 13498, 13838, and 16761 pin the complete isolated kill-ring store, provider/hooks, text and search input consumers, and app-root reachability by exact range and SHA-256.',
        },
        {
          id: 'kill-ring101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-kill-ring-context-semantic.test.mjs',
          detail: 'Source-root tests pin accumulation, yank and yank-pop state, provider isolation, optional-store threading, multiline/space/paste search behavior, target100 absence, target101 introduction, and the latest reducer-backed evolution.',
        },
        {
          id: 'team-create101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-team-create-exclusive-semantic.test.mjs',
          detail: 'Authenticated target101 units 11242 and 12401 pin the exclusive team-file writer and complete TeamCreate descriptor/call implementation by exact range and SHA-256.',
        },
        {
          id: 'team-create101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-team-create-exclusive-semantic.test.mjs',
          detail: 'Source-root tests pin atomic wx persistence, matching errno-path handling, requested-name preservation, target100 absence, target101 introduction, and the latest AppState-owned teammate-color allocation.',
        },
        {
          id: 'file-suggestions101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-file-suggestion-state-semantic.test.mjs',
          detail: 'Authenticated target101 units 13636-13637, 13641-13643, 13647-13648, 13653, 13655, and 13657-13658 pin the complete file-suggestion state, index, refresh, and query graph by exact range and SHA-256.',
        },
        {
          id: 'file-suggestions101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-file-suggestion-state-semantic.test.mjs',
          detail: 'Source-root tests pin state-factory and singleton isolation, generation-safe resets, cached tracked/untracked merge semantics, refresh throttling, telemetry, and the target116 per-instance evolution.',
        },
        {
          id: 'classifier-approvals101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-classifier-approvals-state-semantic.test.mjs',
          detail: 'Authenticated target101 units 7939, 11488, 11668-11674, 12672, 13329, 17740, and 17744 pin AppState initialization, hooks, immutable helpers, result UI, cleanup, permission, and race call paths by exact range and SHA-256.',
        },
        {
          id: 'classifier-approvals101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-classifier-approvals-state-semantic.test.mjs',
          detail: 'The dual-root source test proves immutable approval/checking updates, AppState-backed UI capture and deletion, every permission writer, compaction/reset cleanup, exact target101 full-state updater semantics, and the current context-scoped setter evolution.',
        },
        {
          id: 'tool-progress101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-tool-progress-overlay-semantic.test.mjs',
          detail: 'Authenticated target101 units 9390, 9392, 10005, 10007, 11924, 17813, 17815, and 18222 pin both shell producers, Agent reachability, the complete overlay dispatcher/renderer table, and the REPL keyed event state by exact range and SHA-256.',
        },
        {
          id: 'tool-progress101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-tool-progress-overlay-semantic.test.mjs',
          detail: 'Dual-root source tests prove foreground background/clear event emission, exact tmux and keybinding affordance behavior, keyed REPL storage and rendering precedence, target101 inert reserved variants, and the later Bash-mode and forked-agent render/producer evolution.',
        },
        {
          id: 'remote-trigger101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-remote-trigger-run-semantic.test.mjs',
          detail: 'Authenticated target101 units 12369 and 12377 pin the exact optional-run prompt and the complete RemoteTrigger tool delta by structural range and SHA-256.',
        },
        {
          id: 'remote-trigger101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-remote-trigger-run-semantic.test.mjs',
          detail: 'Dual-root source tests prove the local-only gate and optional run-body propagation with trigger_id injection, and distinguish the later target105 schema-description evolution.',
        },
        {
          id: 'computer-use-state101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-computer-use-state-slice-semantic.test.mjs',
          detail: 'Authenticated target101 units 7352, 8814, 12611, and 18222 pin cleanup, all six package writebacks, explicit fork sharing, and the reachable REPL slice setter by exact range and SHA-256.',
        },
        {
          id: 'computer-use-state101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-computer-use-state-slice-semantic.test.mjs',
          detail: 'Dual-root source tests prove that computer-use writes mutate only their AppState slice, remain unavailable to isolated forks, and clear hidden-app state through the same restricted callback.',
        },
        {
          id: 'sdk-telemetry101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-sdk-telemetry-task-update-semantic.test.mjs',
          detail: 'Authenticated target101 units 5075, 8039, 11058, 17639, 18007, 18735, 18767, and 18768 pin the Datadog transport events, SDK event queue, task update schema/framework, structured transport, QueryEngine, print, and remote-session call graph by exact range and SHA-256.',
        },
        {
          id: 'sdk-telemetry101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-sdk-telemetry-task-update-semantic.test.mjs',
          detail: 'Source-root tests pin target101 transport_error and task_updated propagation and separately prove the target116 state-aware stall watchdog and api_error_status evolution across all eight reachable owners.',
        },
        {
          id: 'plugin-runtime101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-plugin-runtime-semantic.test.mjs',
          detail: 'Authenticated target101 units 6052, 6073, 6075, 13098, 13102, 13105, 13110-13112, 14443, 14467, 14469, 14487, 14488, 14517, 14518, 14530, 14541, and 14546 pin the complete plugin dependency, loading, update, validation, error, and interactive UI transition by exact range and SHA-256.',
        },
        {
          id: 'plugin-runtime101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-plugin-runtime-semantic.test.mjs',
          detail: 'Source-root tests execute the dependency metadata parser and pin dependency range enforcement, local/Git marketplace safety, cached-refresh fallback, project-installed UI, validation, keyboard/paste behavior, and the latest shared Form adaptation.',
        },
        {
          id: 'worktree-recovery101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-worktree-recovery-semantic.test.mjs',
          detail: 'Authenticated target101 units 16439, 16449, and 16452 pin orphan safety checks and both worktree removal fallbacks by exact byte range and SHA-256.',
        },
        {
          id: 'worktree-recovery101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-worktree-recovery-semantic.test.mjs',
          detail: 'Source-root tests pin fail-closed remote, branch, and unpushed-commit inspection, explicit orphan removal, and the success/error outcome matrix for session and agent directory cleanup.',
        },
        {
          id: 'loops-command101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-loops-command-semantic.test.mjs',
          detail: 'Authenticated target101 units 15422, 15423, 15424, 15426, 15428-15431, and 15433 pin the complete hidden /loops UI, interval converter, mutation call graph, module initializers, and command descriptor by exact range and SHA-256.',
        },
        {
          id: 'loops-command101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-loops-command-semantic.test.mjs',
          detail: 'Source-root tests execute cadence conversion and pin the full list/create/delete UI, keyboard flow, cron and Stop-hook mutations, target101 state bridge, target116 registry evolution, telemetry, and statically disabled command registration.',
        },
        {
          id: 'print-resume-title101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-print-resume-title-semantic.test.mjs',
          detail: 'Authenticated target101 unit 18778 [13377495,13380718), SHA-256 e465d3aaec9bd1c620aa6ee6f2747cd506b2fc9bada238b005c87ee3febd58e4, pins the complete print-session loading function and custom-title transition.',
        },
        {
          id: 'print-resume-title101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-print-resume-title-semantic.test.mjs',
          detail: 'Source-root tests pin trimmed exact-title lookup, unique-title resolution, timestamped ambiguity candidates, title-aware invalid input handling, and target100-to-target101 observable introduction.',
        },
        {
          id: 'safety-ui101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-safety-ui-semantic.test.mjs',
          detail: 'Authenticated target101 units 14121, 14123, 14139, 14146, 14263, 14388, 14390, 18038, and 18040 pin the Doctor, keybinding, MCP reconnect, and binary-safety branches by exact range and SHA-256.',
        },
        {
          id: 'safety-ui101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-safety-ui-semantic.test.mjs',
          detail: 'Source-root tests pin native essential-traffic Doctor behavior, keybinding-disabled reporting, headers-helper-aware needs-auth recovery, platform-specific safe binary patterns, and rejection before cache or process lookup.',
        },
        {
          id: 'loop-default101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-loop-default-semantic.test.mjs',
          detail: 'Authenticated target101 structural units 6825-6827, 6850, 6854, 6859, 6861-6864, 6873, 6877, 12366, 12368, 12443, 12654, 12657, 12660-12672, 12674, 18202, 18208, 18497-18501, and 18768 pin the complete autonomous-loop prompt, scheduler, wakeup, tool-search, sentinel, UI, and print introduction by exact range and SHA-256.',
        },
        {
          id: 'loop-default101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-loop-default-semantic.test.mjs',
          detail: 'Source tests pin the exact 4,972-character preamble, four sentinels, loop.md precedence and refresh state, dynamic/fixed skill behavior, scheduler and print resolution, ScheduleWakeup contract, and compact reset against the authenticated 100-to-101 boundary.',
        },
        {
          id: 'mcp-directory101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-mcp-directory-registry-semantic.test.mjs',
          detail: 'Authenticated target101 units 4904-4907, 4909, and 4910 pin visibility validation, both paginated directory clients, registry selection/telemetry, and default visibility state by exact range and SHA-256.',
        },
        {
          id: 'mcp-directory101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-mcp-directory-registry-semantic.test.mjs',
          detail: 'Source tests pin bounded pagination, remote-only BFF filtering, URL normalization, empty-visibility behavior, failure retention, telemetry, target100 absence, and target116 persistence.',
        },
        {
          id: 'sdk-oauth101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-sdk-oauth-control-semantic.test.mjs',
          detail: 'Authenticated target101 units 361, 438, 4681, 17996, 18007, and 18767 pin callback state/accessors, 401 fallback, both control schemas, StructuredIO methods, and the guarded headless installation by exact range and SHA-256.',
        },
        {
          id: 'sdk-oauth101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-sdk-oauth-control-semantic.test.mjs',
          detail: 'The source-root test executes the recovered 401 function for fresh, null, identical, and throwing host callbacks and pins the three-entrypoint gate, thirty-second protocol timeout, user-dialog cancellation, target100 absence, and target116 persistence.',
        },
        {
          id: 'settings-sanitize101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-settings-sanitization-semantic.test.mjs',
          detail: 'Authenticated target101 units 2548, 2574, 2616, and 2656 pin the async-rewake schema, brief sentinel, invalid-hook sanitizer, and SDK inline settings parser by exact range and SHA-256.',
        },
        {
          id: 'settings-sanitize101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-settings-sanitization-semantic.test.mjs',
          detail: 'The source-root test executes the transpiled recovered sanitizer against mixed and all-invalid hook maps, and pins exact warning metadata, sanitizer-before-schema ordering, inline error propagation, target100 absence, and target116 persistence.',
        },
        {
          id: 'ink-events101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-ink-input-events-semantic.test.mjs',
          detail: 'Authenticated target101 units 5271, 5366, 5370, 5607, and 5613 pin wheel key parsing, event handler registration, continuous priority, legacy sequence suppression, and WheelEvent construction by exact range and SHA-256.',
        },
        {
          id: 'ink-events101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-ink-input-events-semantic.test.mjs',
          detail: 'Source-root tests execute KeyboardEvent, PasteEvent, and WheelEvent and pin the complete App/root dispatch ordering, stop-immediate-propagation guard, target100 absence, target101 historical route, and target116 raw-mode/event evolution.',
        },
        {
          id: 'ink-lifecycle101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-ink-interactive-lifecycle-semantic.test.mjs',
          detail: 'Authenticated target101 units 5606 and 5706 pin the App raw-mode callback and Ink lazy terminal lifecycle by exact range and SHA-256, with target100 absence.',
        },
        {
          id: 'ink-lifecycle101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-ink-interactive-lifecycle-semantic.test.mjs',
          detail: 'The dual-root source test proves raw-mode activation precedes stdin ref acquisition, TTY handlers are acquired exactly on interactive use, exit rendering cannot reacquire them, and sync-marker suppression follows the target101 and current target116 branches.',
        },
        {
          id: 'log-preview101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-log-selector-preview-semantic.test.mjs',
          detail: 'Authenticated target101 unit 14967 [11103743,11118808), SHA-256 b5027bb2ffe237aa6db9e7a9f3bc0b6d3bc284cff4c18bced643af7bc301156c, pins the complete resume selector and its Space/Ctrl+V preview transition.',
        },
        {
          id: 'log-preview101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-log-selector-preview-semantic.test.mjs',
          detail: 'Source tests pin unmodified-Space or Ctrl+V activation, focused-session and deep-search guards, the command-like input boundary, pre-toggle filter telemetry, Space footer hint, and target100 adjacency.',
        },
        {
          id: 'resume-selector101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-resume-selector-state-semantic.test.mjs',
          detail: 'Authenticated target101 units 14967, 14990, 14993, and 18410 pin the complete selector, exported command state bridge, and standalone progressive-resume screen by exact range and SHA-256.',
        },
        {
          id: 'resume-selector101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-resume-selector-state-semantic.test.mjs',
          detail: 'Dual-root tests pin all-project and all-worktree defaults, generation-driven reload/reset behavior, loading and empty-result presentation, stale progressive-load protection, and the restored resume terminal title.',
        },
        {
          id: 'beta-tracing101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-beta-tracing-content-gates-semantic.test.mjs',
          detail: 'Authenticated target101 units 9075, 9084-9088, 10322, and 12487 pin the user-prompt, system-prompt, incremental-context, model-output, tool-input, tool-result, managed-environment, and tool-output extraction/privacy behavior by exact byte range and SHA-256.',
        },
        {
          id: 'beta-tracing101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-beta-tracing-content-gates-semantic.test.mjs',
          detail: 'Dual-root source tests prove safe counts remain unconditional while every sensitive prompt, model, and tool payload is guarded by its exact opt-in variable, tool output reads the target result shapes (text file, structuredPatch, stdout), content deduplication advances only when enabled, obsolete thinking output is absent, and target116 retains the contract.',
        },
        {
          id: 'select-single-digit101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-select-single-digit-semantic.test.mjs',
          detail: 'Authenticated target101 units 8761 and 10306 pin the complete single-select input and multi-select state functions containing the exact single-key numeric-selection expression by byte range and SHA-256.',
        },
        {
          id: 'select-single-digit101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-select-single-digit-semantic.test.mjs',
          detail: 'Dual-root tests prove both source state machines accept exactly one numeric key, reject the stale multi-digit expression, authenticate its 100-to-101 introduction, and verify persistence in target116.',
        },
        {
          id: 'startup-runtime101-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-startup-runtime-semantic.test.mjs',
          detail: 'Authenticated target101 units 18235, 18238, 18242, and 18600 pin the warning handler, permission initialization wrapper, setup/SessionStart hook dispatcher, and effective-model resolution wrapper by exact range and SHA-256.',
        },
        {
          id: 'startup-runtime101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-startup-runtime-semantic.test.mjs',
          detail: 'Dual-root source tests pin build-aware bounded warning telemetry, its explicit uninstall handle and omission of sensitive warning text, reachable startup installation, CLI base-tool permission initialization, overly-broad permission handling, exact synchronous setup and SessionStart hook calls, and the authored effective/initial-model resolution represented by the compiler wrappers.',
        },
        {
          id: 'claude-api-trigger101-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-claude-api-trigger-semantic.test.mjs',
          detail: 'Authenticated target101 unit 18595 pins the expanded Claude API and Managed Agents skill trigger by exact byte range and SHA-256, while target100 proves the new build/debug/optimize framing is absent.',
        },
        {
          id: 'claude-api-trigger101-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-claude-api-trigger-semantic.test.mjs',
          detail: 'Case-root assertions require the exact target101 trigger covering Managed Agents, adaptive thinking, caching, and the OpenAI compatibility example; current-root assertions separately require the later target116 model-migration and routing evolution.',
        },
        {
          id: 'mcp-complete-auth-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.101-mcp-complete-authentication-semantic.test.mjs',
          detail: 'Authenticated target101 units pin the manual-callback registry/flow, companion schema/tool, remote instructions, and needs-auth client registration by exact range and SHA-256.',
        },
        {
          id: 'mcp-complete-auth-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.101-mcp-complete-authentication-semantic.test.mjs',
          detail: 'Source tests pin callback validation, active-flow tracking, success/cancellation/error outcomes, and both needs-auth client call paths.',
        },
      )
    }
    if (caseName === '2.1.104-to-2.1.105') {
      evidence.push(
        {
          id: 'print-resume-telemetry105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-print-resume-telemetry-semantic.test.mjs',
          detail: 'Authenticated baseline104 unit 18779 and target105 unit 18978 pin the complete print-mode loadInitialMessages function across the six-event telemetry introduction by exact byte range and SHA-256; authenticated target114 and target116 functions separately pin the later three-literal refinement.',
        },
        {
          id: 'print-resume-telemetry105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-print-resume-telemetry-semantic.test.mjs',
          detail: 'The source-root-aware executable test drives ambiguous and invalid input, missing transcript, missing resumeSessionAt message, successful duration, load failure, and post-load failure through the actual authored branch while distinguishing historical not_found from current not_found_explicit_id.',
        },
        {
          id: 'agent-concurrency105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-agent-concurrency-guidance-semantic.test.mjs',
          detail: 'Authenticated baseline104 units 11920 and 13224 and target105 units 11229 and 13334 pin the complete Agent prompt and agent-listing renderer functions across the exact concurrency-guidance wording boundary by byte range and SHA-256; target116 retains both target strings.',
        },
        {
          id: 'agent-concurrency105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-agent-concurrency-guidance-semantic.test.mjs',
          detail: 'Dual-root executable tests prove the independent-work wording appears in the non-Pro direct Agent prompt and the initial attachment-based agent listing, remains suppressed by the inherited gates, and does not leak into incremental listing updates.',
        },
        {
          id: 'subprocess-isolation105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-subprocess-isolation-paths-semantic.test.mjs',
          detail: 'Authenticated target105 import unit 5924 and functions 5928 and 5938 pin the path-normalization dependency, captured runner/workspace state, mount stubs, and complete bubblewrap allow/deny policy by exact range and SHA-256.',
        },
        {
          id: 'subprocess-isolation105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-subprocess-isolation-paths-semantic.test.mjs',
          detail: 'Dual-root executable tests require normalized writable PATH directories, runner file-command and workspace isolation, special Git mount stubs, D-Bus and user-runtime denial, inline-comment buffering protection, and the historical Linux-only versus current all-platform availability evolution.',
        },
        {
          id: 'message-rating-surface105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-message-rating-surface-semantic.test.mjs',
          detail: 'Authenticated baseline104 and target105 unit 9354 pin the rating callback’s surface and metadata propagation by exact byte range and SHA-256; target116 retains the graph.',
        },
        {
          id: 'message-rating-surface105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-message-rating-surface-semantic.test.mjs',
          detail: 'Dual-root source tests require default tool-use telemetry, metadata spreading, clear-toggle preservation, and the reachable tiny-memory rating calls with scope counts.',
        },
        {
          id: 'worktree-resume-name105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-worktree-resume-name-filter-semantic.test.mjs',
          detail: 'Authenticated target105 units 9403 and 9404 pin entered-existing filtering in sticky resume state, while matched row 9409 proves the inherited shutdown caller remains reachable.',
        },
        {
          id: 'worktree-resume-name105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-worktree-resume-name-filter-semantic.test.mjs',
          detail: 'Dual-root tests distinguish the target101 sticky worktree base from target105 entered-existing suppression and verify the latest current implementation retains the same relaunch rule.',
        },
        {
          id: 'typeahead-metadata98-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.98-typeahead-suggestion-metadata-semantic.test.mjs',
          detail: 'The authenticated target98 introduction and target116 persistence fragments pin the metadata replacement, partial-completion, and common-prefix behavior inherited by target105 unit 17520.',
        },
        {
          id: 'typeahead-metadata98-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.98-typeahead-suggestion-metadata-semantic.test.mjs',
          detail: 'The target98 dual-root test supplies the first-introduction and current-source evidence for the typeahead metadata behavior retained transitively at target105.',
        },
        {
          id: 'away-summary-prompt105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-away-summary-prompt-semantic.test.mjs',
          detail: 'Authenticated baseline104, target105 unit 8752, and target116 fragments pin the exact away-summary prompt evolution by byte range and SHA-256 while retaining the target101 cache-safe fork architecture transitively.',
        },
        {
          id: 'away-summary-prompt105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-away-summary-prompt-semantic.test.mjs',
          detail: 'Dual-root source tests require the target105 recap wording and separately accept the target116 persistence without reverting the inherited one-turn, no-tool, no-cache-write summary graph.',
        },
        {
          id: 'fullscreen-suggestion-no-pad105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-fullscreen-suggestion-no-pad-semantic.test.mjs',
          detail: 'Authenticated baseline104, target105 unit 15050, and target116 unit 16532 pin the noPad overlay transition by exact byte range and SHA-256.',
        },
        {
          id: 'fullscreen-suggestion-no-pad105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-fullscreen-suggestion-no-pad-semantic.test.mjs',
          detail: 'Dual-root source tests require fullscreen PromptInputFooterSuggestions to receive noPad while preserving the outer overlay container padding.',
        },
        {
          id: 'message-deferral105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-message-deferral-placeholder-semantic.test.mjs',
          detail: 'Authenticated target105 helper units 15069 and 15070 plus reachable REPL unit 18386 pin the deferred-message selector, Messages wrapper, placeholder gates, and caller propagation by exact byte range and SHA-256.',
        },
        {
          id: 'message-deferral105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-message-deferral-placeholder-semantic.test.mjs',
          detail: 'Dual-root source tests execute stable-first-message selection and length-gated placeholders, and require REPL to pass raw messages plus the exact loading, agent-view, modal, disabled, and processing-input conditions.',
        },
        {
          id: 'in-process-task-registry105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-in-process-task-registry-eviction-semantic.test.mjs',
          detail: 'Authenticated baseline104, target105 unit 10323, and target116 fragments pin the direct-helper to per-session TaskRegistry eviction transition on both completion paths by exact byte range and SHA-256.',
        },
        {
          id: 'in-process-task-registry105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-in-process-task-registry-eviction-semantic.test.mjs',
          detail: 'Dual-root source tests require both successful and failed in-process teammate cleanup to call the provided TaskRegistry and reject the process-global eviction helper.',
        },
        {
          id: 'account-label105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-account-label-semantic.test.mjs',
          detail: 'Authenticated baseline104 and target105 units pin the status renderer’s Account-to-account wording evolution by exact byte range and SHA-256, with target116 persistence.',
        },
        {
          id: 'account-label105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-account-label-semantic.test.mjs',
          detail: 'Dual-root source tests require the exact lowercase subscription account label while allowing the later current workload-identity status branch.',
        },
        {
          id: 'system-diagnostics-heading105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-system-diagnostics-heading-semantic.test.mjs',
          detail: 'Authenticated baseline104 unit 13774 and target105 unit 13900 pin the heading sentence-case boundary by exact range and SHA-256; matched target116 unit 15351 proves the wording persists.',
        },
        {
          id: 'system-diagnostics-heading105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-system-diagnostics-heading-semantic.test.mjs',
          detail: 'Dual-root source assertions require the exact System diagnostics heading while preserving empty-state suppression, diagnostic mapping, and list layout.',
        },
        {
          id: 'model-deprecation-tense105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-model-deprecation-tense-semantic.test.mjs',
          detail: 'Authenticated baseline104 unit 18104 and target105 unit 18264 pin the fixed-future to date-sensitive retirement-warning transition by exact byte range and SHA-256.',
        },
        {
          id: 'model-deprecation-tense105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-model-deprecation-tense-semantic.test.mjs',
          detail: 'Dual-root source assertions and deterministic-time execution require past and future retirement tense branches plus both reachable notification consumers.',
        },
        {
          id: 'memory-synthesis-fact-shape105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-memory-synthesis-fact-shape-semantic.test.mjs',
          detail: 'Authenticated baseline104 units 12850 and 12851 plus target105 units 12952 and 12953 pin the paragraph-to-relevant-facts function and prompt transition by exact byte range and SHA-256; matched wrapper and attachment units authenticate reachability.',
        },
        {
          id: 'memory-synthesis-fact-shape105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-memory-synthesis-fact-shape-semantic.test.mjs',
          detail: 'Dual-root execution requires the relevant_facts schema, whitespace filtering, seven-item cap, bullet formatting, citation validation, and empty/error handling while distinguishing own105 prompt wording from the preserved target111 retrieval-only evolution.',
        },
        {
          id: 'tmux-socket105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-tmux-socket-propagation-semantic.test.mjs',
          detail: 'Authenticated target105 units 8635, 8723, 11928, 12536, 12538, 12775, 18386, 18934, 18935, and 18967 pin per-session tmux socket lookup and every reachable interactive, headless, forked-agent, Monitor, and Bash propagation edge by exact range and SHA-256.',
        },
        {
          id: 'tmux-socket105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-tmux-socket-propagation-semantic.test.mjs',
          detail: 'Dual-root authenticated and source tests prove process-global tmux lookup is removed, the optional session capability reaches every shell execution path, and explicit session environment values retain final precedence over the TMUX override.',
        },
        {
          id: 'skill-listing105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-skill-listing-overrides-semantic.test.mjs',
          detail: 'Authenticated target105 units 2596, 6783 through 6787, 6790, 6791, 6793, 6799, 8823, 11103, 11110, 11112, 11250, 13000, 16170 through 16173, 18274, 18275, 18386, and 19107 pin the complete settings, formatter, command-filter, tool-enforcement, AppState, notification, resume, attachment, REPL, and startup graph by exact range and SHA-256.',
        },
        {
          id: 'skill-listing105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-skill-listing-overrides-semantic.test.mjs',
          detail: 'Dual-root tests execute the budget and override helpers, prove target105 latent-on behavior and target116 precedence evolution, and require every reachable listing, enforcement, truncation-state, notification, caller, and resume-suppression owner.',
        },
        {
          id: 'event-loop-stall105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-event-loop-stall-semantic.test.mjs',
          detail: 'Authenticated target105 units 18829 through 18833 and 19100 pin the event-loop detector exports, memory snapshot, interval state, reachable feature gate, telemetry, and terminal recovery by exact range and SHA-256.',
        },
        {
          id: 'event-loop-stall105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-event-loop-stall-semantic.test.mjs',
          detail: 'Dual-root executable tests prove the 200ms cadence, 500ms stall threshold, 5000ms sleep/wake classification, telemetry fields, terminal-mode restoration, and the live tengu_drift_lantern startup gate.',
        },
        {
          id: 'memory-threshold105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-memory-threshold-semantic.test.mjs',
          detail: 'Authenticated target105 units 17412 through 17414 pin the memory hook, thresholds, monotonic severity ranks, and telemetry payload by exact range and SHA-256.',
        },
        {
          id: 'memory-threshold105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-memory-threshold-semantic.test.mjs',
          detail: 'Dual-root executable tests prove high and critical are each logged at most once in monotonic order with rounded RSS and heap MiB, and authenticate persistence through target116.',
        },
        {
          id: 'auto-mode-state105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-auto-mode-state-semantic.test.mjs',
          detail: 'Authenticated target105 units 11658 through 11669 pin the complete auto-mode state factory, global instance, accessors, mutators, and testing replacement by exact range and SHA-256.',
        },
        {
          id: 'auto-mode-state105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-auto-mode-state-semantic.test.mjs',
          detail: 'Dual-root executable tests prove independent state factories and the global active, CLI-flag, circuit-breaker, and test-reset operations through target116.',
        },
        {
          id: 'git-watch-redaction105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-git-watch-redaction-semantic.test.mjs',
          detail: 'Authenticated target105 units 2375, 2385 through 2387, 2408, 2416, 2426, 15767, and 16809 pin the per-repository watcher/cache API, exported credential redactor, repository logging, bridge request diagnostic, and bridge startup diagnostic by exact range and SHA-256.',
        },
        {
          id: 'git-watch-redaction105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-git-watch-redaction-semantic.test.mjs',
          detail: 'Dual-root executable tests prove branch caching/invalidation/listener/reset behavior and exact credential redaction, require all diagnostic call paths while preserving the raw network request, and distinguish the target105 void listener from target116 unsubscribe and one-time cleanup evolution.',
        },
        {
          id: 'atomic-team-file105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-team-file-atomic-semantic.test.mjs',
          detail: 'Authenticated target105 units 10400, 10411, 10412, 10413, 10423, and 10431 pin the lock import/configuration, atomic update helper, team-not-found error, and member removal/active-state callers by exact range and SHA-256.',
        },
        {
          id: 'atomic-team-file105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-team-file-atomic-semantic.test.mjs',
          detail: 'Dual-root executable tests prove serialized mutation, no-op suppression, write behavior, release on success and failure, and atomic member removal/active-state updates through target116.',
        },
        {
          id: 'atomic-teammate-reservation105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-atomic-teammate-reservation-semantic.test.mjs',
          detail: 'Authenticated target105 units 11206 through 11212 pin the unique-name helper, atomic identity reservation and rollback helper, backend update, and all out-of-process, tmux, and in-process spawn paths by exact byte range and SHA-256.',
        },
        {
          id: 'atomic-teammate-reservation105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-atomic-teammate-reservation-semantic.test.mjs',
          detail: 'Dual-root executable tests prove lock-scoped identity reservation, mailbox-before-launch ordering, backend metadata updates, pre-commit pane and member rollback, and post-commit preservation of an already-running teammate.',
        },
        {
          id: 'full-compaction-completion105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-full-compaction-completion-semantic.test.mjs',
          detail: 'Authenticated target105 unit 12793 pins the full-compaction outcome bookkeeping, compact-boundary post-token and duration metadata, completion telemetry, exact fallback error text, and SDK status result by exact range and SHA-256.',
        },
        {
          id: 'full-compaction-completion105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-full-compaction-completion-semantic.test.mjs',
          detail: 'Dual-root executable tests prove full compaction reports the exact manual/automatic completion lifecycle from finally, including pre/post tokens, duration, non-Error fallback, SDK result metadata, and compact-boundary completion fields.',
        },
        {
          id: 'partial-compaction-completion105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-partial-compaction-completion-semantic.test.mjs',
          detail: 'Authenticated target105 units 12794 and 12795 pin the partial-compaction outcome bookkeeping, post-token boundary update, completion telemetry, SDK status result, and reachable error notification helper by exact range and SHA-256.',
        },
        {
          id: 'partial-compaction-completion105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-partial-compaction-completion-semantic.test.mjs',
          detail: 'Dual-root tests prove successful and failed partial compactions report exact tokens, duration, fallback error text, SDK result metadata, and cleanup from the finally path while preserving generation-specific response-length reset behavior.',
        },
        {
          id: 'official-marketplace-gcs-rollback105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-official-marketplace-gcs-rollback-semantic.test.mjs',
          detail: 'Authenticated baseline104 unit 12995, target105 unit 13097, and latest target116 unit 13892 pin the official-marketplace atomic backup, promotion, rollback, and cleanup evolution by exact range and SHA-256.',
        },
        {
          id: 'official-marketplace-gcs-rollback105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-official-marketplace-gcs-rollback-semantic.test.mjs',
          detail: 'Dual-root executable tests prove stale-backup cleanup, absent-live handling, successful staging promotion, restoration after a failed promotion, and best-effort backup cleanup while preserving target116 path and telemetry hardening.',
        },
        {
          id: 'hfi-auth-cleanup105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-hfi-auth-cleanup-semantic.test.mjs',
          detail: 'Authenticated target105 units 17819 and 17824 pin the stale HFI authentication cleanup helper and its ordered retention-cleanup call by exact range and SHA-256.',
        },
        {
          id: 'hfi-auth-cleanup105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-hfi-auth-cleanup-semantic.test.mjs',
          detail: 'Dual-root executable tests prove cutoff-gated removal, successful-message accounting, ENOENT suppression, other-error accounting, configured-home resolution, and cleanup ordering through target116.',
        },
        {
          id: 'session-append-policy105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-session-append-policy-semantic.test.mjs',
          detail: 'Authenticated target105 units 16185, 16225, and 16321 pin the exported append-policy surface, policy-driven append implementation, and complete policy table by exact range and SHA-256.',
        },
        {
          id: 'session-append-policy105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-session-append-policy-semantic.test.mjs',
          detail: 'Dual-root executable tests prove always, route-by-agent, and dedup-transcript behavior; invariant rejection; local sidechain and main-session dedup; and the intended target105 versus target116 remote-persistence evolution.',
        },
        {
          id: 'markdown-ordered-list105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-markdown-ordered-list-detection-semantic.test.mjs',
          detail: 'Authenticated target105 unit 9304 pins the ordered-list syntax detector, including zero-to-three-space indentation after the start of input or a newline, by exact range and SHA-256.',
        },
        {
          id: 'markdown-ordered-list105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-markdown-ordered-list-detection-semantic.test.mjs',
          detail: 'Dual-root executable tests distinguish the target104 unindented-only detector from the target105 and target116 detector and prove valid zero-to-three-space ordered lists are recognized while four-space code blocks are not.',
        },
        {
          id: 'markdown-whitespace105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-markdown-whitespace-semantic.test.mjs',
          detail: 'Authenticated target105 units 9300 and 9301 pin normal Markdown accumulation and the dedicated blockquote renderer after their exact whitespace-boundary evolution by range and SHA-256.',
        },
        {
          id: 'markdown-whitespace105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-markdown-whitespace-semantic.test.mjs',
          detail: 'Dual-root tests distinguish target104 full trimming from target105 leading-newline-only plus trailing-only trimming and prove meaningful indentation survives through target116.',
        },
        {
          id: 'meta-enter-tab105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-meta-enter-tab-semantic.test.mjs',
          detail: 'Authenticated target105 unit 5275 pins the keypress parser, including the ESC-prefixed carriage-return, line-feed, and tab branches, by exact range and SHA-256.',
        },
        {
          id: 'meta-enter-tab105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-meta-enter-tab-semantic.test.mjs',
          detail: 'Dual-root executable tests distinguish the target104 plain-key-only parser from the target105 and target116 Meta-key parser and verify names, Meta flags, and raw-value behavior for plain and ESC-prefixed Return, Enter, and Tab.',
        },
        {
          id: 'graceful-shutdown-persistence105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-graceful-shutdown-persistence-semantic.test.mjs',
          detail: 'Authenticated target105 units 11253, 17853, and 18906 pin cost persistence, next-mount reset and shutdown-unmount save, and previous-session telemetry by exact range and SHA-256.',
        },
        {
          id: 'graceful-shutdown-persistence105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-graceful-shutdown-persistence-semantic.test.mjs',
          detail: 'Dual-root executable tests prove graceful-shutdown state is persisted, reset exactly once on the next mount, saved during graceful cleanup, and exposed with a false default in setup telemetry.',
        },
        {
          id: 'skill-activated-otel105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-skill-activated-otel-semantic.test.mjs',
          detail: 'Authenticated target105 units 11245, 11247, and 11250 pin both invocation call sites and the skill_activated OpenTelemetry helper by exact range and SHA-256.',
        },
        {
          id: 'skill-activated-otel105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-skill-activated-otel-semantic.test.mjs',
          detail: 'Dual-root executable tests prove both invocation paths emit exact target105 fields and verify target116 privacy redaction for custom skills and plugins while retaining builtin and official identifiers.',
        },
        {
          id: 'plugin-install-otel105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-plugin-install-otel-semantic.test.mjs',
          detail: 'Authenticated target105 units 13186, 13187, and 14597 pin the core plugin-install telemetry event and its interactive and CLI trigger callers by exact range and SHA-256.',
        },
        {
          id: 'plugin-install-otel105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-plugin-install-otel-semantic.test.mjs',
          detail: 'Dual-root AST tests prove one core event after cache invalidation and before result formatting, exact ui and cli trigger propagation, raw target105 metadata, and the target116 tool-detail privacy gate.',
        },
        {
          id: 'tool-search-mcp-nonblocking105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-tool-search-mcp-nonblocking-semantic.test.mjs',
          detail: 'Authenticated target105 unit 12853 pins the shared tool-search mode-decision logger and its MCP nonblocking property by exact range and SHA-256.',
        },
        {
          id: 'tool-search-mcp-nonblocking105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-tool-search-mcp-nonblocking-semantic.test.mjs',
          detail: 'Dual-root AST tests prove the live MCP_CONNECTION_NONBLOCKING value is included once in the shared logger before every tool-search decision return branch and persists through target116.',
        },
        {
          id: 'sdk-skip-transcript105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-sdk-skip-transcript-semantic.test.mjs',
          detail: 'Authenticated target105 units 7418, 10211, 10235, 11568, 11570, 11571, and 11573 pin the SDK queue/schema flag, task registration propagation, Dream task state, and every terminal path by exact range and SHA-256.',
        },
        {
          id: 'sdk-skip-transcript105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-sdk-skip-transcript-semantic.test.mjs',
          detail: 'Dual-root tests prove skipTranscript flows from task state to task_started and task_notification events and is retained across completed, failed, and stopped Dream task outcomes.',
        },
        {
          id: 'sdk-notification-memory105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-sdk-notification-memory-semantic.test.mjs',
          detail: 'Authenticated target105 units 10235, 11672, 12732, 12795, 18929, 18930, and 18934 pin the notification and memory_recall schemas, reachable notification producers, recall conversion helpers, and QueryEngine yield path by exact range and SHA-256.',
        },
        {
          id: 'sdk-notification-memory105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-sdk-notification-memory-semantic.test.mjs',
          detail: 'Dual-root tests prove exact SDK text-notification fields for ExitPlan, non-recursive Stop-hook, and compaction errors plus select/synthesize memory_recall scope, path, and optional-content conversion.',
        },
        {
          id: 'teleport-trusted-device105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-teleport-trusted-device-semantic.test.mjs',
          detail: 'Authenticated target105 unit 11154 pins the trusted-device gate, lazy token read, and fourth Teleport event-fetch argument by exact range and SHA-256, with the inherited baseline API unit pinned separately.',
        },
        {
          id: 'teleport-trusted-device105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-teleport-trusted-device-semantic.test.mjs',
          detail: 'Dual-root tests prove the stored trusted-device token is read and forwarded only when the static gate is enabled while the disabled path stays token-free through target116.',
        },
        {
          id: 'git-bundle-base-ref105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-git-bundle-base-ref-semantic.test.mjs',
          detail: 'Authenticated target105 units 11132, 11133, and 11156 pin the base-ref-aware bundle fallback, option forwarding, and reachable Teleport call graph by exact range and SHA-256; the existing review supplier is pinned read-only.',
        },
        {
          id: 'git-bundle-base-ref105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-git-bundle-base-ref-semantic.test.mjs',
          detail: 'Dual-root tests prove merge-base forwarding, synthetic seed-commit construction from the base tree, parent injection, and exact graceful fallback logging while preserving current pack-size evolution.',
        },
        {
          id: 'mcp-oauth-discovery-state105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-mcp-oauth-discovery-state-semantic.test.mjs',
          detail: 'Authenticated target105 units 7936, 7937, 7939, 7944, 8476, and 8479 pin the discovery predicate, stale-entry cleanup helper, revoke/save persistence, and both reachable reconnect and batch-connect cleanup paths by exact range and SHA-256.',
        },
        {
          id: 'mcp-oauth-discovery-state105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-mcp-oauth-discovery-state-semantic.test.mjs',
          detail: 'Dual-root tests prove authentication classification requires successful OAuth metadata discovery, discovery state survives step-up token revocation, and successful HTTP/SSE connections clear stale tokenless entries while preserving XAA bypass behavior.',
        },
        {
          id: 'analytics-state105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-analytics-state-semantic.test.mjs',
          detail: 'Authenticated target105 units 579 through 584 pin the analytics state factory, global state initializer, sink attachment, synchronous dispatch, asynchronous dispatch, and moved global binding by exact range and SHA-256.',
        },
        {
          id: 'analytics-state105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-analytics-state-semantic.test.mjs',
          detail: 'Dual-root executable tests prove queued sync/async events drain only after the microtask, attached events dispatch immediately, repeated attachment is inert, reset replaces state identity, and the stale analytics_sink_attached side event is absent through target116.',
        },
        {
          id: 'team-memory-acl105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-team-memory-acl-semantic.test.mjs',
          detail: 'Authenticated target105 units 12486 and 12487 pin the sync watcher suppression policy and reachable ACL denied/unconfigured administrator diagnostic by exact range and SHA-256.',
        },
        {
          id: 'team-memory-acl105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-team-memory-acl-semantic.test.mjs',
          detail: 'Dual-root executable tests prove no_repo remains retryable, server error codes take precedence, and organization ACL denial produces the exact restricted-group guidance while retaining inherited metadata machinery.',
        },
        {
          id: 'attachment-table105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-attachment-message-table-semantic.test.mjs',
          detail: 'Authenticated target105 unit 13372 pins the complete attachment-to-message dispatch function and all 36 compiled handlers by exact range and SHA-256.',
        },
        {
          id: 'attachment-table105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-attachment-message-table-semantic.test.mjs',
          detail: 'Dual-root executable tests prove representative attachment outputs, the deferred-tool handler, and explicit empty outputs for maximum-turn, current-session-memory, and teammate-shutdown-batch terminal attachments.',
        },
        {
          id: 'plugin-settings-description105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-plugin-settings-description-semantic.test.mjs',
          detail: 'Authenticated target105 unit 2554 pins the plugin schema runtime and its expanded agent/subagentStatusLine settings allowlist description by exact range and SHA-256.',
        },
        {
          id: 'plugin-settings-description105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-plugin-settings-description-semantic.test.mjs',
          detail: 'Dual-root tests prove the target104 agent-only description evolves at target105 to include subagentStatusLine, and distinguish current target116 centralized settings-key semantics.',
        },
        {
          id: 'trusted-device-policy105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-trusted-device-policy-semantic.test.mjs',
          detail: 'Authenticated target105 units 9394, 9395, 9399, and 9400 pin the policy constant, lazy policy loader, gated token read, and enrollment policy check by exact range and SHA-256.',
        },
        {
          id: 'trusted-device-policy105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-trusted-device-policy-semantic.test.mjs',
          detail: 'Dual-root tests execute the feature and organization-policy gates, require limits to load before enrollment auth access, and prove the exact organization-disabled diagnostic while separating later token-clear evolution.',
        },
        {
          id: 'recalled-memory-rating105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-recalled-memory-rating-semantic.test.mjs',
          detail: 'Authenticated target105 units 10709 through 10721, 10794, 10881, and 18386 pin synthesis parsing, citation scope accounting, display and rating controls, keyboard rating, attachment/message UUID propagation, and the REPL call path by exact range and SHA-256.',
        },
        {
          id: 'recalled-memory-rating105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-recalled-memory-rating-semantic.test.mjs',
          detail: 'Dual-root tests execute synthesis parsing and team/private citation counting, prove exact display/click/hotkey surfaces and gates, authenticate target104 absence and target105 introduction, and require persistence through target116.',
        },
        {
          id: 'api-retry-telemetry105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-api-retry-telemetry-semantic.test.mjs',
          detail: 'Authenticated target105 unit 12757 pins conditional API status metadata and the reachable retry-exhaustion telemetry branch by exact range and SHA-256.',
        },
        {
          id: 'api-retry-telemetry105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-api-retry-telemetry-semantic.test.mjs',
          detail: 'Dual-root executable tests prove retry telemetry is emitted only after retries, includes exact attempt/duration/status metadata, and distinguish later target116 request attribution.',
        },
        {
          id: 'first-attempt-request-id105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-first-attempt-request-id-semantic.test.mjs',
          detail: 'Authenticated target105 units 12758, 12759, and 16680 pin the typed logging propagation and both reachable streaming-to-non-streaming fallback assignments by exact byte range and SHA-256.',
        },
        {
          id: 'first-attempt-request-id105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-first-attempt-request-id-semantic.test.mjs',
          detail: 'Dual-root executable tests prove the initial request identifier is preserved across either fallback path and emitted only when a distinct final request identifier exists.',
        },
        {
          id: 'auth-render-root105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-auth-render-root-semantic.test.mjs',
          detail: 'Authenticated target105 units 9989, 9990, and 19107 pin both rendered auth handlers and the reachable command-registration root factory calls by exact byte range and SHA-256.',
        },
        {
          id: 'auth-render-root105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-auth-render-root-semantic.test.mjs',
          detail: 'Dual-root TypeScript AST checks prove status and logout render through an Ink root, wait for root exit exactly once, avoid direct stdout output, and leave successful logout process exit with the command caller.',
        },
        {
          id: 'env-hook-state105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-env-hook-state-semantic.test.mjs',
          detail: 'Authenticated target105 units 7171 and 7173 pin the complete watcher-state factory and the singleton public-method binding initializer by exact byte range and SHA-256.',
        },
        {
          id: 'env-hook-state105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-env-hook-state-semantic.test.mjs',
          detail: 'Dual-root executable tests instantiate independent watcher factories and prove isolated watch paths, notifier delivery, cleanup registration, cwd transitions, and disposal while current source retains managed-hook expansion.',
        },
        {
          id: 'skill-dynamic-state105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-skill-dynamic-state-semantic.test.mjs',
          detail: 'Authenticated target105 units 12289 through 12299 and reachable MCP factory unit 18999 pin the complete state factory, setter, state-backed discovery and activation graph, and pre-construction MCP reset by exact byte range and SHA-256.',
        },
        {
          id: 'skill-dynamic-state105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-skill-dynamic-state-semantic.test.mjs',
          detail: 'Dual-root TypeScript AST and executable tests prove all four collections live in one replaceable state object, independent factories do not share maps, reset affects only the selected instance, and the MCP factory replaces state before constructing its cache or server.',
        },
        {
          id: 'managed-agent-docs105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-managed-agent-docs-semantic.test.mjs',
          detail: 'Authenticated target105 units 18697, 18715, 18727, 18729, 18731, 18733, 18735, 18737, 18739, 18741, and 18759 pin every evolved Managed Agents document declaration by exact byte range and SHA-256.',
        },
        {
          id: 'managed-agent-docs105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-managed-agent-docs-semantic.test.mjs',
          detail: 'Dual-root tests compare each historical Markdown owner with the target cooked declaration after text-loader terminal-newline normalization and prove every owner is reachable through the Claude API content map.',
        },
        {
          id: 'plugin-manifest-version105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-plugin-manifest-version-semantic.test.mjs',
          detail: 'Authenticated target105 unit 13165 pins canonical plugin-manifest version extraction and its exact failure diagnostic by range and SHA-256.',
        },
        {
          id: 'plugin-manifest-version105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-plugin-manifest-version-semantic.test.mjs',
          detail: 'Dual-root tests prove .claude-plugin/plugin.json is the direct version source, invalid manifests return unknown with the target diagnostic, and later resolved-version behavior is preserved.',
        },
        {
          id: 'mcp-elicitation-form105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-mcp-elicitation-form-semantic.test.mjs',
          detail: 'Authenticated target105 units 17367 and 17369 pin the focused elicitation form event graph and extracted field renderer by exact range and SHA-256.',
        },
        {
          id: 'mcp-elicitation-form105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-mcp-elicitation-form-semantic.test.mjs',
          detail: 'Dual-root tests prove raw-mode lifetime, focus-scoped keyboard routing, all selective preventDefault branches, unhandled text-field propagation, and target116 persistence.',
        },
        {
          id: 'reactive-compaction105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-reactive-compaction-semantic.test.mjs',
          detail: 'Authenticated target105 units 7202, 7216 through 7220, 12622 through 12629, 12746, 12749, 13857, 13858, 13861, and 13862 pin the reporter, retry engine, query integration, and manual command graph by exact range and SHA-256.',
        },
        {
          id: 'reactive-compaction105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-reactive-compaction-semantic.test.mjs',
          detail: 'Dual-root executable tests prove gap-guided retry sizing, media fallback, feature and withheld-error gates, exact OTel serialization, query retry reachability, manual command error/token/SDK reporting, and the target116 cleanup evolution.',
        },
        {
          id: 'malformed-tool-use105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-malformed-tool-use-recovery-semantic.test.mjs',
          detail: 'Authenticated target105 query unit 12746 and its matched public wrapper pin the streamed stop-reason capture, one-retry transition, exact telemetry and prompts, and terminal failure path against unmatched baseline unit 12583; exact target107 and target116 unit hashes prove persistence.',
        },
        {
          id: 'malformed-tool-use105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-malformed-tool-use-recovery-semantic.test.mjs',
          detail: 'Dual-root static and executable tests prove only a tool_use stop with zero parsed blocks and no API error enters recovery, the first response retries with an exact meta message, and the second response emits the exact terminal API error.',
        },
        {
          id: 'tmux-focus105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-tmux-focus-hint-semantic.test.mjs',
          detail: 'Authenticated target105 units 9315, 9324, and 18386 pin the fullscreen state initializer, tmux focus probe, and reachable REPL notification call by exact range and SHA-256.',
        },
        {
          id: 'tmux-focus105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-tmux-focus-hint-semantic.test.mjs',
          detail: 'Dual-root executable tests prove the injectable one-shot focus-events probe, exact disabled-focus guidance, independent low-priority REPL delivery, target104 absence, and target116 cache evolution.',
        },
        {
          id: 'session-state105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-session-state-semantic.test.mjs',
          detail: 'Authenticated target105 units 18159 and 18160 pin the complete SessionStateManager class and default instance by exact range and SHA-256.',
        },
        {
          id: 'session-state105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-session-state-semantic.test.mjs',
          detail: 'Dual-root executable tests prove isolated manager listeners and state, pending-action set/clear, running and idle summary cleanup, opt-in SDK events, and the default-instance compatibility surface.',
        },
        {
          id: 'keybinding-selection105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-keybinding-selection-scroll-semantic.test.mjs',
          detail: 'Authenticated target105 units 7539, 7552, and 18335 pin the default binding table, schema/action table, and reachable scroll/selection handler by exact range and SHA-256; matched row 18338 pins the inherited pager helper support.',
        },
        {
          id: 'keybinding-selection105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-keybinding-selection-scroll-semantic.test.mjs',
          detail: 'Dual-root executable tests prove newline, Doctor, transcript pager, message-action, and selection-extension bindings, named Scroll/Transcript routing, repeated coalesced pager input, target104 absence, and target116 virtual-anchor evolution.',
        },
        {
          id: 'feedback-payload105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-feedback-payload-semantic.test.mjs',
          detail: 'Authenticated target105 units 13735 and 13740 pin the feedback component retry/input/telemetry graph and submit payload/error classifier by exact range and SHA-256; matched units 13729 and 13741 pin the transitive target98 byte serializer and constants support.',
        },
        {
          id: 'feedback-payload105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-feedback-payload-semantic.test.mjs',
          detail: 'Dual-root executable tests prove byte payload generation through the transitive serializer, 8 MiB precheck, minimal retry, success/failure telemetry, focus-scoped input, every observable result classification branch, target104 absence, and target116 evolution.',
        },
        {
          id: 'background-work-exit105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-background-work-exit-semantic.test.mjs',
          detail: 'Authenticated target105 units 15903, 15904, 15914, 15918, 15924, and reachable REPL unit 18386 pin the complete dialog, row renderer, ExitFlow, scheduled-task helper, exit command, and direct interactive call path by exact range and SHA-256; target116 unit 17410 pins the later viewport evolution.',
        },
        {
          id: 'background-work-exit105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-background-work-exit-semantic.test.mjs',
          detail: 'Dual-root executable tests prove scheduled task collection, interactive and command reachability, stay/exit decision handling, exact item-count and choice telemetry, target104 absence, and target116 viewport-aware row truncation.',
        },
        {
          id: 'request-too-large105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-request-too-large-semantic.test.mjs',
          detail: 'Authenticated target105 units 13377, 13389, and 13391 pin request-too-large media recognition, the complete 413 message branch, and the API error-status classifier by exact range and SHA-256.',
        },
        {
          id: 'request-too-large105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-request-too-large-semantic.test.mjs',
          detail: 'Dual-root executable tests prove request_too_large media recognition and exact context-window versus generic 413 result/message/status semantics while preserving the later target116 wrapper evolution.',
        },
        {
          id: 'ultrareview-preflight105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-ultrareview-preflight-semantic.test.mjs',
          detail: 'Authenticated target105 units 15146, 15148, 15150, 15151, 15154, and 15161 pin the preflight schema, gate result graph, remote launch metadata, confirmation dialog, and command surface by exact range and SHA-256.',
        },
        {
          id: 'ultrareview-preflight105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-ultrareview-preflight-semantic.test.mjs',
          detail: 'Dual-root authenticated and executable tests prove proceed, confirmation, blocked, fallback, billing-note, organization action, source, and bundle-base semantics while preserving the later target116 flow.',
        },
        {
          id: 'hook-registry-validation105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-hook-registry-validation-semantic.test.mjs',
          detail: 'Authenticated target105 units 16515, 16517, 16521, and 16525 pin the complete hook event registry, exported execution surface, configured SessionEnd timeout, and root-aware output validator by exact range and SHA-256.',
        },
        {
          id: 'hook-registry-validation105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-hook-registry-validation-semantic.test.mjs',
          detail: 'Dual-root executable tests prove the 27-event registry, bounded SessionEnd timeout, event-specific output rules, root path formatting, exact validation failure messages, and target116 persistence.',
        },
        {
          id: 'upstream-relay-drain105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-upstream-relay-drain-semantic.test.mjs',
          detail: 'Authenticated target105 unit 16847 pins the relay adapter endAfterDrain state and buffered end/drain control graph by exact range and SHA-256.',
        },
        {
          id: 'upstream-relay-drain105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-upstream-relay-drain-semantic.test.mjs',
          detail: 'Dual-root executable tests prove immediate close with no buffer, deferred close with pending bytes, and final close only after the last drain, with target104 absence and target116 persistence.',
        },
        {
          id: 'away-summary-config105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-away-summary-config-semantic.test.mjs',
          detail: 'Authenticated target105 units 2596, 8749, 8823, 13489, 13956, 18109, 18386, and 19107 pin the settings schema, enablement helper, both state initializers, settings resync, Config UI, cache-aware hook, and reachable REPL call by exact range and SHA-256.',
        },
        {
          id: 'away-summary-config105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-away-summary-config-semantic.test.mjs',
          detail: 'Dual-root executable tests prove environment precedence, target105 default-off GrowthBook gating, noninteractive and persisted-setting suppression, cache-age scheduling, recap limits, return telemetry, Config persistence/revert, and the target116 default-on/draft-input evolution.',
        },
        {
          id: 'memory-survey-judge105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-memory-survey-judge-semantic.test.mjs',
          detail: 'Authenticated target105 units 18062, 18063, 18064, 18065, and 18067 pin the memory-impact judge helpers and reachable survey hook by exact range and SHA-256; target104 proves their absence and target116 proves persistence.',
        },
        {
          id: 'memory-survey-judge105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-memory-survey-judge-semantic.test.mjs',
          detail: 'Dual-root executable tests prove explicit managed-memory detection, exact judge metadata, deterministic harmed/helped sampling, survey opening, telemetry, and source reachability.',
        },
        {
          id: 'strip-prompt-xml105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-strip-prompt-xml-semantic.test.mjs',
          detail: 'Authenticated target105 unit 13313 pins the exact leading-newline-only prompt XML stripping function by range, SHA-256, and source text; target104 pins the replaced trim behavior and target116 pins persistence.',
        },
        {
          id: 'strip-prompt-xml105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-strip-prompt-xml-semantic.test.mjs',
          detail: 'Dual-root executable tests compile the authored stripper and prove that only post-tag leading newlines are removed while meaningful leading spaces and trailing whitespace are preserved.',
        },
        {
          id: 'filesystem-permissions105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-filesystem-permissions-semantic.test.mjs',
          detail: 'Authenticated target105 units 16362, 16370, 16371, 16372, 16387, 16389, and 16390 pin the frame/workflow allowlist, WSL UNC handling, remote-mode safety, and pre-plan suggestion graph by exact range and SHA-256.',
        },
        {
          id: 'filesystem-permissions105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-filesystem-permissions-semantic.test.mjs',
          detail: 'Dual-root executable tests prove current-session workflow and frame writes, dangerous UNC versus WSL UNC decisions, remote-mode protected-path behavior, pre-plan suggestion suppression, and the target116 write-permission precedence evolution.',
        },
        {
          id: 'worker-raw-command105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-worker-raw-command-semantic.test.mjs',
          detail: 'Authenticated target105 units 16975 and 18167 pin CCR status serialization and structured requires-action detail construction by exact range and SHA-256; target104 proves raw_command absence and target116 pins the evolved redacted form.',
        },
        {
          id: 'worker-raw-command105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-worker-raw-command-semantic.test.mjs',
          detail: 'Dual-root executable tests prove Bash, PowerShell, and bounded MCP raw-command extraction, summary precedence, independent failure fallbacks, status upload propagation, and current redaction evolution.',
        },
        {
          id: 'tool-search-mcp-telemetry105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-tool-search-mcp-telemetry-semantic.test.mjs',
          detail: 'Authenticated target105 unit 7108 pins all four new ToolSearch MCP population fields within the complete reachable tool implementation by exact range and SHA-256; target104 proves absence and target116 proves persistence.',
        },
        {
          id: 'tool-search-mcp-telemetry105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-tool-search-mcp-telemetry-semantic.test.mjs',
          detail: 'Dual-root executable tests compile the authored nested telemetry helper and prove live configured, connected, pending, and MCP-tool counts alongside the preserved search outcome fields.',
        },
        {
          id: 'config-trust-reason105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-config-trust-reason-semantic.test.mjs',
          detail: 'Authenticated target105 units 5022, 5032, and 5055 pin the exported trust setter, its complete normalized-path update body, and exact auto-updater reason formatter by range and SHA-256; target104 proves absence and target116 proves persistence.',
        },
        {
          id: 'config-trust-reason105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-config-trust-reason-semantic.test.mjs',
          detail: 'Dual-root executable tests compile both authored functions and prove normalized trust persistence, existing-project preservation, idempotent no-op behavior, and all observable reason strings.',
        },
        {
          id: 'repo-checkouts105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-repo-checkouts-semantic.test.mjs',
          detail: 'Authenticated target105 units 5117 through 5124 pin the repository checkout state object and helpers, while moved unit 11456 pins the reachable diff-base consumer by exact range and SHA-256.',
        },
        {
          id: 'repo-checkouts105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-repo-checkouts-semantic.test.mjs',
          detail: 'Dual-root tests prove branch discovery, state refresh and notification, CCR metadata publication, session-insert refresh, and repository-specific base-ref precedence with target104 absence and target116 persistence.',
        },
        {
          id: 'skills-menu-overrides105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-skills-menu-overrides-semantic.test.mjs',
          detail: 'Authenticated target105 units 15178, 15179, 15180, 15181, 15184, and 15187 pin the complete skill override menu state, helpers, render graph, and export by exact range and SHA-256.',
        },
        {
          id: 'skills-menu-overrides105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-skills-menu-overrides-semantic.test.mjs',
          detail: 'Dual-root tests prove locked and inherited override precedence, exact local override cycling, filtering, responsive scrolling, persistence, and current-version evolution.',
        },
        {
          id: 'request-size-limit105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-request-too-large-limit-semantic.test.mjs',
          detail: 'Authenticated target105 units 6800 and 13383 pin the new 32 MiB API request constant and its reachable request-too-large formatter by exact range and SHA-256; target104 pins the former 20 MiB behavior.',
        },
        {
          id: 'request-size-limit105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-request-too-large-limit-semantic.test.mjs',
          detail: 'Dual-root executable tests prove that the API request ceiling is 32 MiB while the raw PDF target remains 20 MiB, including exact interactive and noninteractive error messages and target116 persistence.',
        },
        {
          id: 'datadog-allowlist105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-datadog-event-allowlist-semantic.test.mjs',
          detail: 'Authenticated target105 unit 5073 pins the exported Datadog event allowlist containing both new event names by exact range and SHA-256; target104 proves absence and target116 proves persistence.',
        },
        {
          id: 'datadog-allowlist105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-datadog-event-allowlist-semantic.test.mjs',
          detail: 'Dual-root executable tests prove allowlisted export for mid-turn MCP refresh and SDK initialization-handshake events while rejecting unrelated events, with both reachable callers authenticated separately.',
        },
        {
          id: 'file-read-mitigation105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-file-read-mitigation-policy-semantic.test.mjs',
          detail: 'Authenticated target105 predicate unit 12916 and reachable FileRead result-mapping owner unit 12923 pin the exact raw-model regex policy by range, syntax, and SHA-256; target104 proves absence.',
        },
        {
          id: 'file-read-mitigation105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-file-read-mitigation-policy-semantic.test.mjs',
          detail: 'Dual-root executable tests prove the exact target105 raw-model predicate over supported, versioned, dated, and non-first-party model IDs while accepting current later canonical-allowlist evolution and rejecting the historical inverse exemption policy.',
        },
        {
          id: 'session-state-propagation105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-session-state-propagation-semantic.test.mjs',
          detail: 'Authenticated target105 units 16891, 18168, 18920, 18934, 18935, 18966, 18967, 18979, and 19107 pin every nonmatched per-session state-manager propagation site by exact range and SHA-256.',
        },
        {
          id: 'session-state-propagation105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-session-state-propagation-semantic.test.mjs',
          detail: 'Dual-root tests prove independent SessionStateManager instances and exact state, metadata, permission-mode, and command-lifecycle propagation through app-state, StructuredIO, RemoteIO, QueryEngine, ask, and headless startup without process-global leakage.',
        },
        {
          id: 'task-registry105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-task-registry-semantic.test.mjs',
          detail: 'Authenticated target105 units 10208, 10985, 11172, 11174, 11175, 11209, 11210, 11234, 11578, 11587, 11636, 11672, 11928, 11955, 11960, 11979, 12253, 12255, 12410, 12418, 12419, 12428, 12536, 12538, 12727, 12775, 12961, 13015, 13683, 15103, 15106, 15247, 17964, 18386, 18926, 18934, and 18967 pin every nonmatched TaskRegistry migration statement by exact byte range and SHA-256.',
        },
        {
          id: 'task-registry105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-task-registry-semantic.test.mjs',
          detail: 'Dual-root tests prove the live registry delegation contract and all local, remote, shell, dream, teammate, plugin, headless, and interactive call paths; isolated-own-tree assertions explicitly defer only owners introduced and authenticated by earlier lineage supplements, while the current and cumulative passes require those owners.',
        },
        {
          id: 'sdk-memory-paths105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-sdk-memory-paths-semantic.test.mjs',
          detail: 'Authenticated target105 units 10235 and 16951 pin the SDK init schema and reachable system-init payload builder containing memory_paths by exact byte range and SHA-256, while target104 proves the field is absent.',
        },
        {
          id: 'sdk-memory-paths105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-sdk-memory-paths-semantic.test.mjs',
          detail: 'Dual-root executable tests prove the optional schema and the empty, auto-only, and TEAMMEM-gated team directory payload branches, with persistence through target116.',
        },
        {
          id: 'headless-mcp-prewait105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-headless-mcp-prewait-semantic.test.mjs',
          detail: 'Authenticated target105 units 18956, 18967, and 18968 pin the exported wait helper, reachable guarded first-command call, and polling/telemetry helper by exact byte range and SHA-256.',
        },
        {
          id: 'headless-mcp-prewait105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-headless-mcp-prewait-semantic.test.mjs',
          detail: 'Dual-root executable tests prove target105 early return for zero pending clients or already-available tools, the bounded pending-client poll and telemetry, and the current target116 wait-whenever-pending evolution.',
        },
        {
          id: 'backend-registry105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-backend-registry-semantic.test.mjs',
          detail: 'Authenticated target105 units 10377 through 10384, 10386 through 10389, 10391 through 10396, and 10398 pin the full BackendRegistry state-object migration by exact byte range and SHA-256.',
        },
        {
          id: 'backend-registry105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-backend-registry-semantic.test.mjs',
          detail: 'Dual-root executable tests prove independent factory state, the global instance, and parameterized detection, lookup, startup, cleanup, reset, and shutdown operations through target116.',
        },
        {
          id: 'remote-trigger105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-remote-trigger-schema-semantic.test.mjs',
          detail: 'Authenticated target105 unit 11907 pins the complete RemoteTrigger definition containing the observable optional-run schema copy by exact range and SHA-256.',
        },
        {
          id: 'remote-trigger105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-remote-trigger-schema-semantic.test.mjs',
          detail: 'The source-root test proves the exact target104-to-target105 schema description transition while the target101 test separately owns the executable optional-body behavior.',
        },
        {
          id: 'tree-connector105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-tree-connector-semantic.test.mjs',
          detail: 'Authenticated target105 units 14189 through 14195 pin the entire Tree/Connector context, glyph, wrapping, node, and public composition graph by exact range and SHA-256.',
        },
        {
          id: 'tree-connector105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-tree-connector-semantic.test.mjs',
          detail: 'Dual-root source tests prove target104 absence, target105 Tree.Node and Connector introduction, exact ancestor/last-child behavior, persistence through later targets, and the current Tree.Group evolution.',
        },
        {
          id: 'prompt-cache-break105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-prompt-cache-break-semantic.test.mjs',
          detail: 'Authenticated target105 helper, record, detector, and API caller units 6928 through 6942 and 16680 pin the complete first prompt-cache-break runtime graph by exact range and SHA-256.',
        },
        {
          id: 'prompt-cache-break105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-prompt-cache-break-semantic.test.mjs',
          detail: 'Source-root tests pin Cowork-only reachability, sanitized system/tool/message inputs, billing and computer-use exclusions, per-block hashes and length deltas, history mutation causes, telemetry, and the exact target105 boundary before later persistence and analytics evolution.',
        },
        {
          id: 'client-presence105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-client-presence-platform-semantic.test.mjs',
          detail: 'Authenticated target105 unit 16955 pins the complete presence request function containing the client platform transition by exact range and SHA-256.',
        },
        {
          id: 'client-presence105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-client-presence-platform-semantic.test.mjs',
          detail: 'Source-root tests prove the exact cli to claude_code_cli platform transition, preserve focus/pulse and authenticated session reachability, and pin persistence through target116.',
        },
        {
          id: 'worktree-lifecycle105-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-worktree-lifecycle-semantic.test.mjs',
          detail: 'Authenticated target105 units 16593 through 16596 pin removal telemetry, gone-upstream verification, default-remote resolution, and stale cleanup by exact range and SHA-256.',
        },
        {
          id: 'worktree-lifecycle105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-worktree-lifecycle-semantic.test.mjs',
          detail: 'Source-root tests pin hook and Git removal telemetry, changed-file counting, remote fallback order, gone-upstream and unique-commit gates, and stale-cleanup source attribution.',
        },
        {
          id: 'loop-proactive105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-loop-proactive-alias-semantic.test.mjs',
          detail: 'Authenticated target105 unit 18678 [12964182,12970066), SHA-256 343beff770ea470b9c163b154d9fec27679299a83d0821b4ee965a47db96311b, pins the complete /loop registration containing the newly introduced proactive alias.',
        },
        {
          id: 'loop-proactive105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-loop-proactive-alias-semantic.test.mjs',
          detail: 'Source tests prove the alias is absent from authenticated target104, present at target105, and owned by the reachable bundled-loop registration while the autonomous core remains covered transitively by its target101 introduction.',
        },
        {
          id: 'log-repo105-target-unit',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-log-selector-repo-semantic.test.mjs',
          detail: 'Authenticated target105 unit 15088 [11158067,11173121), SHA-256 3818af86e6f0bd809e035645f65e01aa7288615a5f296a1a258d9c2b12a9292e, pins the complete resume selector and repository wording transition.',
        },
        {
          id: 'log-repo105-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-log-selector-repo-semantic.test.mjs',
          detail: 'Source tests pin current-repo/all-projects wording, retained Space/Ctrl+V preview guards, absence of directory wording, and exact target104 adjacency.',
        },
        {
          id: 'recap-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-subagent-status-line-semantic.test.mjs',
          detail: 'Authenticated target105 structural units 16088, 16089, and registry unit 18109 pin the complete /recap implementation, command object, and reachable built-in registration by exact byte range and SHA-256.',
        },
        {
          id: 'recap-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-subagent-status-line-semantic.test.mjs',
          detail: 'Source tests pin the shared summary call, cancellation and no-summary results, feature gate, noninteractive exclusion, and built-in registration.',
        },
        {
          id: 'subagent-status-line-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.105-subagent-status-line-semantic.test.mjs',
          detail: 'Authenticated target105 structural units 17558-17561, 17565-17566, 17694, and 17709 are pinned by exact byte range and SHA-256.',
        },
        {
          id: 'subagent-status-line-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.105-subagent-status-line-semantic.test.mjs',
          detail: 'Source tests pin command payload, trust and policy gates, timeout, JSONL validation, polling cadence, stale-ID filtering, decoration visibility, and selection preservation.',
        },
      )
      evidence.push({
        id: 'monitor-mcp-static-null',
        kind: 'static-ast',
        path: 'recovery/test/middle-monitor-mcp-dce.test.mjs',
        detail: 'Matched target index 15316 [11282877,11282936), SHA-256 7f6b0068d38d3b98a178f72b5a5ca74a57d743a38de7f678e4b4e59b0a89c99f, initializes _lK=null; the monitor_mcp UI branch returns null before rendering it.',
      })
    }
    if (caseName === '2.1.105-to-2.1.107') {
      evidence.push(
        {
          id: 'thinking-agent-target-units',
          kind: 'target-fragment',
          path: 'recovery/test/recovery-2.1.107-thinking-milestones.test.mjs',
          detail: 'Authenticated target107 units 9197-9198, 9203, 16605, 16607, 16622, 16636, 17923, 17925, and 18391 pin the agent-model merge, thinking-guidance prompt and follow-up injection, and milestone transition by exact range and SHA-256.',
        },
        {
          id: 'thinking-agent-semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/recovery-2.1.107-thinking-milestones.test.mjs',
          detail: 'Source tests pin the exact historical Opus 4.6 merged-context gate and both call sites, thinking-guidance enablement/section/reminder injection, and the five target107 milestone thresholds; current source is separately checked for the later generalized Opus 1M support predicate.',
        },
      )
    }
    const ledger = {
      schemaVersion: 1,
      case: caseName,
      targetVersion,
      targetCommit,
      criterion: 'compiled-ast-function-semantics-v1',
      summary: {
        nonmatchedUnits: rows.length,
        byStructuralClass,
        byDisposition,
        sourceRuntimeGaps: byDisposition['source-runtime-gap'],
        dependencyRuntimeGaps: byDisposition['dependency-runtime'],
      },
      owners: ownerPaths.map(ownerPath => {
        const transitiveFromCase = transitiveOwnerCase(caseName, ownerPath)
        return {
          id: ownerIdByPath.get(ownerPath),
          path: ownerPath,
          ...(transitiveFromCase ? { transitiveFromCase } : {}),
        }
      }),
      evidence,
      rows,
    }
    if (ledger.summary.sourceRuntimeGaps !== 0) {
      throw new Error(`${caseName} still has ${ledger.summary.sourceRuntimeGaps} source runtime gaps`)
    }
    const semanticDir = path.join(caseDir, 'semantic')
    fs.mkdirSync(semanticDir, { recursive: true })
    fs.writeFileSync(
      path.join(semanticDir, 'source-coverage.json.gz'),
      gzipSync(`${JSON.stringify(ledger)}\n`, { level: 9, mtime: 0 }),
    )
    console.log(`${caseName}: wrote ${rows.length} semantic rows`)
  } else if (process.argv.includes('--mcp')) {
    console.log(JSON.stringify({ caseName, mcpOutputStorageRows }, null, 2))
  } else if (process.argv.includes('--summary')) {
    console.log(JSON.stringify({ caseName, semanticIndexes: semanticIndexes.size, counts: Object.fromEntries(counts), owners: Object.fromEntries([...ownerCounts].sort((a, b) => b[1] - a[1])), missing }, null, 2))
  } else {
    console.log(JSON.stringify({ caseName, semanticIndexes: semanticIndexes.size, counts: Object.fromEntries(counts), owners: Object.fromEntries([...ownerCounts].sort((a, b) => b[1] - a[1])), mcpOutputStorageRows, missing }, null, 2))
  }
}
