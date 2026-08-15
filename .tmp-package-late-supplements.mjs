import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { replayTarget111EvidenceGaps } from './recovery/test/replay-target111-evidence-gaps.mjs'
import { replayTarget111MatrixExtras } from './recovery/test/replay-target111-matrix-extras.mjs'
import { replayTarget113FirstHalfStrictTail } from './recovery/test/replay-target113-first-half-strict-tail.mjs'
import { buildTarget113SecondHalfHistoricalCandidate } from './recovery/test/recovery-2.1.113-second-half-replay-helper.mjs'

const repositoryRoot = process.cwd()
const extractedClaudeApiRoot = '/tmp/recovery-semantic-late-b'
const selectedCase = process.env.CLAUDE_CODE_LATE_CASE

function writeExtractedClaudeApiDocument(version, relative, destinationRoot) {
  const source = path.join(
    extractedClaudeApiRoot,
    `claude-api-map-2.1.${version}`,
    relative,
  )
  const destination = path.join(
    destinationRoot,
    'src/skills/bundled/claude-api',
    relative,
  )
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function writeAllExtractedClaudeApiDocuments(version, destinationRoot) {
  const sourceRoot = path.join(
    extractedClaudeApiRoot,
    `claude-api-map-2.1.${version}`,
  )
  for (const relative of fs.readdirSync(sourceRoot, { recursive: true })) {
    const source = path.join(sourceRoot, relative)
    if (!fs.statSync(source).isFile()) continue
    writeExtractedClaudeApiDocument(version, relative, destinationRoot)
  }
}

function writeCurrentSource(relative, destinationRoot) {
  const source = path.join(repositoryRoot, relative)
  const destination = path.join(destinationRoot, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function writeTarget111Opus47LaunchOwner(destinationRoot) {
  const destination = path.join(
    destinationRoot,
    'src/components/LogoV2/Opus47LaunchUpsell.tsx',
  )
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(
    destination,
    `import * as React from 'react'
import { useState } from 'react'
import { Box, Text } from '../../ink.js'
import { logEvent } from '../../services/analytics/index.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { truncate } from '../../utils/format.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import type { FeedConfig } from './Feed.js'

const MAX_IMPRESSIONS = 12
const FULL_MESSAGE =
  'Welcome to Opus 4.7 xhigh! · /effort to tune speed vs. intelligence'
const HIGHLIGHTED_PREFIX = 'Welcome to Opus 4.7 xhigh!'

export function shouldShowOpus47LaunchUpsell(): boolean {
  if (getAPIProvider() !== 'firstParty') return false
  if ((getGlobalConfig().opus47LaunchSeenCount ?? 0) >= MAX_IMPRESSIONS) {
    return false
  }
  return true
}

export function useShowOpus47LaunchUpsell(): boolean {
  const [show] = useState(shouldShowOpus47LaunchUpsell)
  return show
}

export function incrementOpus47LaunchSeenCount(): void {
  saveGlobalConfig(previous => ({
    ...previous,
    opus47LaunchSeenCount: (previous.opus47LaunchSeenCount ?? 0) + 1,
  }))
  logEvent('tengu_opus47_launch_shown', {})
}

export function Opus47LaunchUpsell({
  maxWidth,
}: {
  maxWidth?: number
}): React.ReactNode {
  const text = maxWidth ? truncate(FULL_MESSAGE, maxWidth) : FULL_MESSAGE
  if (HIGHLIGHTED_PREFIX.length < text.length) {
    return (
      <Text dimColor>
        <Text color="claude">{text.slice(0, HIGHLIGHTED_PREFIX.length)}</Text>
        {text.slice(HIGHLIGHTED_PREFIX.length)}
      </Text>
    )
  }
  return (
    <Text dimColor>
      <Text color="claude">{text}</Text>
    </Text>
  )
}

export function createOpus47LaunchFeed(): FeedConfig {
  return {
    title: 'Opus 4.7 is here',
    lines: [],
    customContent: {
      content: (
        <Box marginY={1}>
          <Text bold color="claude">
            Welcome to Opus 4.7 xhigh!
          </Text>
        </Box>
      ),
      width: 48,
    },
    footer: '/effort to tune speed vs. intelligence',
  }
}
`,
  )
}

function installTarget111Opus47LogoSurface(destinationRoot) {
  writeTarget111Opus47LaunchOwner(destinationRoot)

  const logoPath = path.join(
    destinationRoot,
    'src/components/LogoV2/LogoV2.tsx',
  )
  replaceExactly(
    logoPath,
    "import { renderModelSetting } from '../../utils/model/model.js';\n",
    "import { renderModelSetting } from '../../utils/model/model.js';\nimport { createOpus47LaunchFeed, incrementOpus47LaunchSeenCount, useShowOpus47LaunchUpsell } from './Opus47LaunchUpsell.js';\n",
    'target 2.1.111 Opus launch logo imports',
  )
  replaceExactly(
    logoPath,
    '  const showOverageCreditUpsell = useShowOverageCreditUpsell();\n',
    '  const showOverageCreditUpsell = useShowOverageCreditUpsell();\n  const showOpus47LaunchUpsell = useShowOpus47LaunchUpsell();\n',
    'target 2.1.111 Opus launch logo eligibility',
  )
  replaceExactly(
    logoPath,
    `  let t5;
  let t6;
  if ($[6] !== showGuestPassesUpsell) {
    t5 = () => {
      if (showGuestPassesUpsell && !showOnboarding && !isCondensedMode) {
        incrementGuestPassesSeenCount();
      }
    };
    t6 = [showGuestPassesUpsell, showOnboarding, isCondensedMode];
    $[6] = showGuestPassesUpsell;
    $[7] = t5;
    $[8] = t6;
  } else {
    t5 = $[7];
    t6 = $[8];
  }
  useEffect(t5, t6);
  let t7;
  let t8;
  if ($[9] !== showGuestPassesUpsell || $[10] !== showOverageCreditUpsell) {
    t7 = () => {
      if (showOverageCreditUpsell && !showOnboarding && !showGuestPassesUpsell && !isCondensedMode) {
        incrementOverageCreditUpsellSeenCount();
      }
    };
    t8 = [showOverageCreditUpsell, showOnboarding, showGuestPassesUpsell, isCondensedMode];
    $[9] = showGuestPassesUpsell;
    $[10] = showOverageCreditUpsell;
    $[11] = t7;
    $[12] = t8;
  } else {
    t7 = $[11];
    t8 = $[12];
  }
  useEffect(t7, t8);
  const model = useMainLoopModel();`,
    `  useEffect(() => {
    if (
      showGuestPassesUpsell &&
      !showOnboarding &&
      !showOpus47LaunchUpsell &&
      !isCondensedMode
    ) {
      incrementGuestPassesSeenCount();
    }
  }, [showGuestPassesUpsell, showOnboarding, showOpus47LaunchUpsell, isCondensedMode]);
  useEffect(() => {
    if (
      showOverageCreditUpsell &&
      !showOnboarding &&
      !showOpus47LaunchUpsell &&
      !showGuestPassesUpsell &&
      !isCondensedMode
    ) {
      incrementOverageCreditUpsellSeenCount();
    }
  }, [showOverageCreditUpsell, showOnboarding, showOpus47LaunchUpsell, showGuestPassesUpsell, isCondensedMode]);
  useEffect(() => {
    if (showOpus47LaunchUpsell && !showOnboarding && !isCondensedMode) {
      incrementOpus47LaunchSeenCount();
    }
  }, [showOpus47LaunchUpsell, showOnboarding, isCondensedMode]);
  const model = useMainLoopModel();`,
    'target 2.1.111 Opus launch logo impression routing',
  )
  replaceExactly(
    logoPath,
    '  const t25 = layoutMode === "horizontal" && <FeedColumn feeds={showOnboarding ? [createProjectOnboardingFeed(getSteps()), createRecentActivityFeed(activities)] : showGuestPassesUpsell ? [createRecentActivityFeed(activities), createGuestPassesFeed()] : showOverageCreditUpsell ? [createRecentActivityFeed(activities), createOverageCreditFeed()] : [createRecentActivityFeed(activities), createWhatsNewFeed(changelog)]} maxWidth={rightWidth} />;',
    '  const t25 = layoutMode === "horizontal" && <FeedColumn feeds={showOnboarding ? [createProjectOnboardingFeed(getSteps()), createRecentActivityFeed(activities)] : showOpus47LaunchUpsell ? [createRecentActivityFeed(activities), createOpus47LaunchFeed()] : showGuestPassesUpsell ? [createRecentActivityFeed(activities), createGuestPassesFeed()] : showOverageCreditUpsell ? [createRecentActivityFeed(activities), createOverageCreditFeed()] : [createRecentActivityFeed(activities), createWhatsNewFeed(changelog)]} maxWidth={rightWidth} />;',
    'target 2.1.111 Opus launch feed priority',
  )

  const condensedPath = path.join(
    destinationRoot,
    'src/components/LogoV2/CondensedLogo.tsx',
  )
  replaceExactly(
    condensedPath,
    "} from './FullscreenUpsell.js';\n",
    "} from './FullscreenUpsell.js';\nimport { incrementOpus47LaunchSeenCount, Opus47LaunchUpsell, useShowOpus47LaunchUpsell } from './Opus47LaunchUpsell.js';\n",
    'target 2.1.111 condensed Opus imports',
  )
  replaceExactly(
    condensedPath,
    '  const showOverageCreditUpsell = useShowOverageCreditUpsell();\n',
    '  const showOverageCreditUpsell = useShowOverageCreditUpsell();\n  const showOpus47LaunchUpsell = useShowOpus47LaunchUpsell();\n',
    'target 2.1.111 condensed Opus eligibility',
  )
  replaceExactly(
    condensedPath,
    `  let t0;
  let t1;
  if ($[0] !== showGuestPassesUpsell) {
    t0 = () => {
      if (showGuestPassesUpsell) {
        incrementGuestPassesSeenCount();
      }
    };
    t1 = [showGuestPassesUpsell];
    $[0] = showGuestPassesUpsell;
    $[1] = t0;
    $[2] = t1;
  } else {
    t0 = $[1];
    t1 = $[2];
  }
  useEffect(t0, t1);
  let t2;
  let t3;
  if ($[3] !== showGuestPassesUpsell || $[4] !== showOverageCreditUpsell) {
    t2 = () => {
      if (showOverageCreditUpsell && !showGuestPassesUpsell) {
        incrementOverageCreditUpsellSeenCount();
      }
    };
    t3 = [showOverageCreditUpsell, showGuestPassesUpsell];
    $[3] = showGuestPassesUpsell;
    $[4] = showOverageCreditUpsell;
    $[5] = t2;
    $[6] = t3;
  } else {
    t2 = $[5];
    t3 = $[6];
  }
  useEffect(t2, t3);
  useEffect(() => {
    if (showFullscreenUpsell && !showGuestPassesUpsell && !showOverageCreditUpsell) {
      incrementFullscreenUpsellSeenCount();
    }
  }, [showFullscreenUpsell, showGuestPassesUpsell, showOverageCreditUpsell]);`,
    `  useEffect(() => {
    if (showOpus47LaunchUpsell) incrementOpus47LaunchSeenCount();
  }, [showOpus47LaunchUpsell]);
  useEffect(() => {
    if (showGuestPassesUpsell && !showOpus47LaunchUpsell) {
      incrementGuestPassesSeenCount();
    }
  }, [showGuestPassesUpsell, showOpus47LaunchUpsell]);
  useEffect(() => {
    if (
      showOverageCreditUpsell &&
      !showOpus47LaunchUpsell &&
      !showGuestPassesUpsell
    ) {
      incrementOverageCreditUpsellSeenCount();
    }
  }, [showOverageCreditUpsell, showOpus47LaunchUpsell, showGuestPassesUpsell]);
  useEffect(() => {
    if (
      showFullscreenUpsell &&
      !showOpus47LaunchUpsell &&
      !showGuestPassesUpsell &&
      !showOverageCreditUpsell
    ) {
      incrementFullscreenUpsellSeenCount();
    }
  }, [showFullscreenUpsell, showOpus47LaunchUpsell, showGuestPassesUpsell, showOverageCreditUpsell]);`,
    'target 2.1.111 condensed Opus impression routing',
  )
  replaceExactly(
    condensedPath,
    `  let t12;
  if ($[23] !== t10 || $[24] !== t11 || $[25] !== t6 || $[26] !== t7 || $[27] !== t9) {
    t12 = <OffscreenFreeze><Box flexDirection="row" gap={2} alignItems="center">{t4}<Box flexDirection="column">{t6}{t7}{t9}{t10}{t11}</Box></Box></OffscreenFreeze>;
    $[23] = t10;
    $[24] = t11;
    $[25] = t6;
    $[26] = t7;
    $[27] = t9;
    $[28] = t12;
  } else {
    t12 = $[28];
  }
  return <Box flexDirection="column">{t12}{justSwitchedTui && <Box paddingLeft={2} flexDirection="column" marginTop={1}><TuiSwitchNotice /></Box>}{!showGuestPassesUpsell && !showOverageCreditUpsell && showFullscreenUpsell && <Box paddingLeft={2} flexDirection="column" marginTop={1}><FullscreenUpsell /></Box>}</Box>;`,
    `  const t12 = <OffscreenFreeze><Box flexDirection="row" gap={2} alignItems="center">{t4}<Box flexDirection="column">{t6}{t7}{t9}{showOpus47LaunchUpsell && <Opus47LaunchUpsell maxWidth={textWidth} />}{t10}{t11}</Box></Box></OffscreenFreeze>;
  return <Box flexDirection="column">{t12}{justSwitchedTui && <Box paddingLeft={2} flexDirection="column" marginTop={1}><TuiSwitchNotice /></Box>}{!showOpus47LaunchUpsell && !showGuestPassesUpsell && !showOverageCreditUpsell && showFullscreenUpsell && <Box paddingLeft={2} flexDirection="column" marginTop={1}><FullscreenUpsell /></Box>}</Box>;`,
    'target 2.1.111 condensed Opus rendering',
  )
}

function writeExternalSource(sourceRoot, relative, destinationRoot) {
  const source = path.join(sourceRoot, relative)
  const destination = path.join(destinationRoot, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function installFinalClaudeApiRoutingDescription(destinationRoot) {
  const filename = path.join(
    destinationRoot,
    'src/skills/bundled/claudeApi.ts',
  )
  let value = fs.readFileSync(filename, 'utf8')
  const oldDescription =
    "      'Build apps with the Claude API or Anthropic SDK.\\n' +\n" +
    "      'TRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`/`claude_agent_sdk`, or user asks to use Claude API, Anthropic SDKs, or Agent SDK.\\n' +\n" +
    "      'DO NOT TRIGGER when: code imports `openai`/other AI SDK, general programming, or ML/data-science tasks.',"
  const newDescription =
    "      'Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with this skill should include prompt caching.\\n' +\n" +
    "      'TRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`; user asks for the Claude API, Anthropic SDK, or Managed Agents; user adds/modifies/tunes a Claude feature (caching, thinking, compaction, tool use, batch, files, citations, memory) or model (Opus/Sonnet/Haiku) in a file; questions about prompt caching / cache hit rate in an Anthropic SDK project.\\n' +\n" +
    "      'SKIP: file imports `openai`/other-provider SDK, filename like `*-openai.py`/`*-generic.py`, provider-neutral code, general programming/ML.',"
  if (!value.includes(oldDescription)) {
    throw new Error('historical claude-api routing description anchor differs')
  }
  value = value.replace(oldDescription, newDescription)
  fs.writeFileSync(filename, value)
}

function gitPatch(repository, args) {
  const result = spawnSync('git', args, {
    cwd: repository,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr.toString('utf8'))
  }
  return result.stdout
}

function git(repository, args) {
  const result = spawnSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout)
  }
  return result.stdout
}

function matchingWorkingTreePatch(relativePaths, pattern) {
  const patch = gitPatch(repositoryRoot, [
    'diff',
    '--no-ext-diff',
    '--binary',
    '-U1',
    '--',
    ...relativePaths,
  ]).toString('utf8')
  const files = patch.split(/(?=^diff --git )/m).filter(Boolean)
  const selectedFiles = []
  for (const file of files) {
    const firstHunk = file.search(/^@@ /m)
    if (firstHunk < 0) continue
    const header = file.slice(0, firstHunk)
    const hunks = file
      .slice(firstHunk)
      .split(/(?=^@@ )/m)
      .filter(hunk => pattern.test(hunk))
    if (hunks.length > 0) selectedFiles.push(`${header}${hunks.join('')}`)
  }
  return Buffer.from(selectedFiles.join(''))
}

function applyMatchingWorkingTreePatch(tree, relativePaths, pattern, label) {
  const patch = matchingWorkingTreePatch(relativePaths, pattern)
  if (patch.length === 0) throw new Error(`${label} selected no working-tree hunks`)
  const patchPath = path.join(tree, `.${label}.patch`)
  fs.writeFileSync(patchPath, patch)
  git(tree, ['apply', '--3way', patchPath])
  fs.unlinkSync(patchPath)
}

function applyMatchingWorkingTreePatchDirect(tree, relativePaths, pattern, label) {
  const patch = matchingWorkingTreePatch(relativePaths, pattern)
  if (patch.length === 0) throw new Error(`${label} selected no working-tree hunks`)
  const patchPath = path.join(tree, `.${label}.patch`)
  fs.writeFileSync(patchPath, patch)
  git(tree, ['apply', '--recount', '--whitespace=nowarn', patchPath])
  fs.unlinkSync(patchPath)
}

function applyMatchingExternalWorktreePatch(
  tree,
  sourceRepository,
  relativePaths,
  pattern,
  label,
) {
  const patch = gitPatch(sourceRepository, [
    'diff',
    '--no-ext-diff',
    '--binary',
    '-U1',
    '--',
    ...relativePaths,
  ]).toString('utf8')
  const selectedFiles = []
  for (const file of patch.split(/(?=^diff --git )/m).filter(Boolean)) {
    const firstHunk = file.search(/^@@ /m)
    if (firstHunk < 0) continue
    const header = file.slice(0, firstHunk)
    const hunks = file
      .slice(firstHunk)
      .split(/(?=^@@ )/m)
      .filter(hunk => pattern.test(hunk))
    if (hunks.length > 0) selectedFiles.push(`${header}${hunks.join('')}`)
  }
  const selected = Buffer.from(selectedFiles.join(''))
  if (selected.length === 0) {
    throw new Error(`${label} selected no external worktree hunks`)
  }
  const patchPath = path.join(tree, `.${label}.patch`)
  fs.writeFileSync(patchPath, selected)
  // External historical prerequisite hunks are intentionally applied atop a
  // cumulatively modified late tree, so the target index cannot match the
  // original intro-case index. Recount/context matching is the appropriate
  // deterministic application mode here.
  git(tree, ['apply', '--recount', '--whitespace=nowarn', patchPath])
  fs.unlinkSync(patchPath)
}

function applyMatchingPatchArtifact(
  tree,
  patchFilename,
  relativePaths,
  pattern,
  label,
) {
  const allowed = new Set(relativePaths)
  const patch = fs.readFileSync(patchFilename, 'utf8')
  const selectedFiles = []
  for (const file of patch.split(/(?=^diff --git )/m).filter(Boolean)) {
    const headerMatch = file.match(/^diff --git a\/(.+?) b\/(.+)$/m)
    if (!headerMatch || headerMatch[1] !== headerMatch[2]) continue
    if (!allowed.has(headerMatch[2])) continue
    const firstHunk = file.search(/^@@ /m)
    if (firstHunk < 0) continue
    const header = file.slice(0, firstHunk)
    const hunks = file
      .slice(firstHunk)
      .split(/(?=^@@ )/m)
      .filter(hunk => pattern.test(hunk))
    if (hunks.length > 0) selectedFiles.push(`${header}${hunks.join('')}`)
  }
  const selected = selectedFiles.join('')
  if (selected.length === 0) {
    throw new Error(`${label} selected no artifact hunks`)
  }
  const patchPath = path.join(tree, `.${label}.patch`)
  fs.writeFileSync(patchPath, selected)
  git(tree, ['apply', '--recount', '--whitespace=nowarn', patchPath])
  fs.unlinkSync(patchPath)
}

function installContextHintRuntime(tree, label, targetVersion) {
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/services/compact/microCompact.ts'],
    /tokensSaved\?:|clearedIds\?:|export function collectCompactableToolIds|applyContextHintClears|applyContextHintMicrocompact|CONTEXT_HINT_REJECT/,
    `${label}-context-hint-microcompact`,
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/Tool.ts'],
    /applyHintClears\?:|InProgressToolUseIDsAction|setInProgressToolUseIDs: \(action:|ToolProgressOverlayEvent|emitToolProgress\?:/,
    `${label}-context-hint-tool-context`,
  )
  if (targetVersion === 110) {
    applyMatchingWorkingTreePatch(
      tree,
      ['src/hooks/useRemoteSession.ts'],
      /InProgressToolUseIDsAction|setInProgressToolUseIDs\?: \(action:|action: 'add'|action: 'remove'|action: 'clear'/,
      `${label}-in-progress-tool-remote-session`,
    )
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/services/tools/toolOrchestration.ts',
        'src/services/tools/StreamingToolExecutor.ts',
      ],
      /setInProgressToolUseIDs\(\{|action: 'add'|action: 'remove'/,
      `${label}-in-progress-tool-execution`,
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/messages.ts'],
      /isChannelMessageOrigin/,
      `${label}-channel-message-origin`,
    )
    writeCurrentSource('src/components/ToolProgressOverlay.tsx', tree)
  }
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/query.ts'],
    /onHintCleared: toolUseContext\.applyHintClears/,
    `${label}-context-hint-query-callback`,
  )
  const replPath = path.join(tree, 'src/screens/REPL.tsx')
  if (targetVersion === 110) {
    replaceExactly(
      replPath,
      "import type { ToolPermissionContext, Tool } from '../Tool.js';",
      "import type { InProgressToolUseIDsAction, ToolPermissionContext, Tool } from '../Tool.js';",
      `${label} in-progress action type import`,
    )
    replaceExactly(
      replPath,
      "import { applyPermissionUpdate, applyPermissionUpdates, persistPermissionUpdate } from '../utils/permissions/PermissionUpdate.js';",
      "import { applyPermissionUpdate, applyPermissionUpdates, persistPermissionUpdate } from '../utils/permissions/PermissionUpdate.js';\nimport { getSandboxPermissionModeDecision } from '../utils/permissions/PermissionMode.js';\nimport { classifySandboxNetworkAccess } from '../utils/permissions/yoloClassifier.js';",
      `${label} sandbox classifier imports`,
    )
    replaceExactly(
      replPath,
      "import { textForResubmit, handleMessageFromStream, type StreamingToolUse, type StreamingThinking, isCompactBoundaryMessage, getMessagesAfterCompactBoundary, getContentText, createUserMessage, createAssistantMessage, createTurnDurationMessage, createAgentsKilledMessage, createApiMetricsMessage, createSystemMessage, createCommandInputMessage, formatCommandInputTags } from '../utils/messages.js';",
      "import { textForResubmit, handleMessageFromStream, type StreamingToolUse, type StreamingThinking, isCompactBoundaryMessage, getMessagesAfterCompactBoundary, getContentText, createUserMessage, createAssistantMessage, createTurnDurationMessage, createAgentsKilledMessage, createApiMetricsMessage, createSystemMessage, createCommandInputMessage, formatCommandInputTags, isChannelMessageOrigin } from '../utils/messages.js';",
      `${label} channel-origin helper import`,
    )
    replaceExactly(
      replPath,
      "import { SessionBackgroundHint } from '../components/SessionBackgroundHint.js';",
      "import { SessionBackgroundHint } from '../components/SessionBackgroundHint.js';\nimport { renderToolProgressOverlay, type ToolProgressOverlayEvent, type VisibleToolProgressOverlayEvent } from '../components/ToolProgressOverlay.js';",
      `${label} tool-progress overlay import`,
    )
    replaceExactly(
      replPath,
      `const EMPTY_MCP_CLIENTS: MCPServerConnection[] = [];
`,
      `const EMPTY_MCP_CLIENTS: MCPServerConnection[] = [];

function updateToolProgressOverlays(
  previous: Map<string, VisibleToolProgressOverlayEvent>,
  event: ToolProgressOverlayEvent,
): Map<string, VisibleToolProgressOverlayEvent> {
  if (event.kind === 'clear') {
    if (!previous.has(event.toolUseId)) return previous;
    const next = new Map(previous);
    next.delete(event.toolUseId);
    return next;
  }
  const prior = previous.get(event.toolUseId);
  if (event.kind === 'background_hint' && prior?.kind === event.kind) return previous;
  const next = new Map(previous);
  next.set(event.toolUseId, event);
  return next;
}
`,
      `${label} tool-progress overlay reducer`,
    )
    replaceExactly(
      replPath,
      `  }, [mainThreadAgentDefinition, mergedTools]);

  // Merge commands from local state, plugins, and MCP`,
      `  }, [mainThreadAgentDefinition, mergedTools]);
  const toolsRef = useRef(tools);
  toolsRef.current = tools;

  // Merge commands from local state, plugins, and MCP`,
      `${label} current-tools ref`,
    )
    replaceExactly(
      replPath,
      `    setToolJSXInternal(args);
  }, []);
  const [toolUseConfirmQueue, setToolUseConfirmQueue] = useState<ToolUseConfirm[]>([]);`,
      `    setToolJSXInternal(args);
  }, []);
  const [toolProgressOverlays, setToolProgressOverlays] = useState(
    () => new Map<string, VisibleToolProgressOverlayEvent>(),
  );
  const emitToolProgress = useCallback((event: ToolProgressOverlayEvent) => {
    setToolProgressOverlays(previous => updateToolProgressOverlays(previous, event));
  }, []);
  const [toolUseConfirmQueue, setToolUseConfirmQueue] = useState<ToolUseConfirm[]>([]);`,
      `${label} tool-progress overlay state`,
    )
    replaceExactly(
      replPath,
      `  const [inProgressToolUseIDs, setInProgressToolUseIDs] = useState<Set<string>>(new Set());
  const hasInterruptibleToolInProgressRef = useRef(false);`,
      `  const [inProgressToolUseIDs, setInProgressToolUseIDsState] = useState<Set<string>>(new Set());
  const setInProgressToolUseIDs = useCallback((action: InProgressToolUseIDsAction) => {
    setInProgressToolUseIDsState(previous => {
      switch (action.action) {
        case 'add': {
          const next = new Set(previous);
          for (const id of action.ids) next.add(id);
          return next;
        }
        case 'remove': {
          const next = new Set(previous);
          for (const id of action.ids) next.delete(id);
          return next.size === previous.size ? previous : next;
        }
        case 'clear':
          return previous.size > 0 ? new Set() : previous;
      }
    });
  }, []);
  const hasInterruptibleToolInProgressRef = useRef(false);`,
      `${label} in-progress tool action reducer`,
    )
    replaceExactly(
      replPath,
      `  const sandboxAskCallback: SandboxAskCallback = useCallback(async (hostPattern: NetworkHostPattern) => {
    // If running as a swarm worker, forward the request to the leader via mailbox`,
      `  const sandboxAskCallback: SandboxAskCallback = useCallback(async (hostPattern: NetworkHostPattern) => {
    const currentState = store.getState();
    const { mode, isBypassPermissionsModeAvailable } = currentState.toolPermissionContext;
    switch (getSandboxPermissionModeDecision(mode, isBypassPermissionsModeAvailable)) {
      case 'allow':
        return true;
      case 'deny':
        return false;
      case 'classify':
        return classifySandboxNetworkAccess(hostPattern.host, hostPattern.port, messagesRef.current, toolsRef.current, currentState.toolPermissionContext, new AbortController().signal);
      case 'ask':
        break;
    }
    // If running as a swarm worker, forward the request to the leader via mailbox`,
      `${label} sandbox permission-mode predecision`,
    )
    replaceExactly(
      replPath,
      `      // Extract and enqueue user message text, skipping meta messages
      // (e.g. expanded skill content, tick prompts) that should not be
      // replayed as user-visible text.
      newMessages.filter((m): m is UserMessage => m.type === 'user' && !m.isMeta).map(_ => getContentText(_.message.content)).filter(_ => _ !== null).forEach((msg, i) => {
        enqueue({
          value: msg,
          mode: 'prompt'
        });
        if (i === 0) {
          logEvent('tengu_concurrent_onquery_enqueued', {});
        }
      });`,
      `      let enqueued = false;
      for (const message of newMessages) {
        if (message.type !== 'user') continue;
        if (message.isMeta && !isChannelMessageOrigin(message.origin)) continue;
        const text = getContentText(message.message.content);
        if (text === null) continue;
        enqueue({
          value: text,
          mode: 'prompt',
          origin: message.origin,
          isMeta: message.isMeta,
          skipSlashCommands: isChannelMessageOrigin(message.origin),
          stopHookActive
        });
        if (!enqueued) {
          enqueued = true;
          logEvent('tengu_concurrent_onquery_enqueued', {});
        }
      }`,
      `${label} concurrent message provenance`,
    )
    replaceExactly(
      replPath,
      `      setToolJSX,
      addNotification,`,
      `      setToolJSX,
      emitToolProgress,
      addNotification,`,
      `${label} tool-progress context callback`,
    )
    replaceExactly(
      replPath,
      `              {toolJSX && !(toolJSX.isLocalJSXCommand && toolJSX.isImmediate) && !toolJsxCentered && <Box flexDirection="column" width="100%">
                    {toolJSX.jsx}
                  </Box>}
              {"external" === 'ant' && <TungstenLiveMonitor />}`,
      `              {toolJSX && !(toolJSX.isLocalJSXCommand && toolJSX.isImmediate) && !toolJsxCentered && <Box flexDirection="column" width="100%">
                    {toolJSX.jsx}
                  </Box>}
              {!toolJSX && toolProgressOverlays.size > 0 && <Box flexDirection="column" width="100%">
                    {Array.from(toolProgressOverlays.values()).map(event => <React.Fragment key={event.toolUseId}>
                        {renderToolProgressOverlay(event, { tools, verbose })}
                      </React.Fragment>)}
                  </Box>}
              {"external" === 'ant' && <TungstenLiveMonitor />}`,
      `${label} tool-progress overlay render`,
    )
  }
  if (!fs.readFileSync(replPath, 'utf8').includes('applyContextHintClears')) {
    replaceExactly(
      replPath,
      "import { resetMicrocompactState } from '../services/compact/microCompact.js';",
      "import { applyContextHintClears, resetMicrocompactState } from '../services/compact/microCompact.js';",
      `${label} context-hint REPL import`,
    )
  }
  if (!fs.readFileSync(replPath, 'utf8').includes('applyHintClears(clearedIds)')) {
    replaceExactly(
      replPath,
      `      getAppState: () => store.getState(),
      setAppState,
      messages,`,
      `      getAppState: () => store.getState(),
      setAppState,
      applyHintClears(clearedIds) {
        setMessages(previous => applyContextHintClears(previous, clearedIds));
      },
      messages,`,
      `${label} context-hint live-message application`,
    )
  }
  writeCurrentSource('src/services/compact/apiMicrocompact.ts', tree)

  // Target 110 introduces the controller with an unconditional body. Target
  // 116 retains the beta header but sends the context_hint body only when
  // there are more tool uses than the five-result keep window.
  if (targetVersion === 110) {
    const apiPath = path.join(tree, 'src/services/compact/apiMicrocompact.ts')
    let api = fs.readFileSync(apiPath, 'utf8')
    api = api
      .replace('  collectCompactableToolIds,\n', '')
      .replace(
        '  buildRequestParams: (messages: Message[]) => {',
        '  buildRequestParams: () => {',
      )
      .replace(
        `    buildRequestParams(messages) {
      requestIncludedBeta = false
      if (!active || stripped) return null
      requestIncludedBeta = true
      const hasEnoughToolUses =
        collectCompactableToolIds(messages).length > CONTEXT_HINT_KEEP_RECENT
      return {
        betaHeader: CONTEXT_HINT_BETA_HEADER,
        body: hasEnoughToolUses ? { context_hint: { enabled: true } } : null,
      }
    },`,
        `    buildRequestParams() {
      requestIncludedBeta = false
      if (!active || stripped) return null
      requestIncludedBeta = true
      return {
        betaHeader: CONTEXT_HINT_BETA_HEADER,
        body: { context_hint: { enabled: true } },
      }
    },`,
      )
    if (
      api.includes('collectCompactableToolIds') ||
      api.includes('const hasEnoughToolUses')
    ) {
      throw new Error('target 2.1.110 context-hint downgrade anchor differs')
    }
    fs.writeFileSync(apiPath, api)
  }

  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/services/api/withRetry.ts'],
    /onError\?:|handledRecoveryKeys|recoveryKey = options\.onError/,
    `${label}-context-hint-retry`,
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/services/api/claude.ts'],
    /createContextHintController|REDACT_THINKING_BETA_HEADER|onHintCleared|isAfkModeBetaRejection|contextHintController|let consumedCacheEdits|isRedactThinkingActive|clearAllThinking|contextHintBody|retry:context-hint|context_hint_sse/,
    `${label}-context-hint-call-path`,
  )
}

function withTargetWorktree(targetCommit, mutate) {
  if (
    selectedCase &&
    !selectedCase.endsWith(
      `-to-${new Map([
        ['a22c02fc9bf4b772da434470c28e1bb21f5bd73c', '2.1.108'],
        ['24f983bdbd6a2f1dadba452f9bdd6aea077c3238', '2.1.109'],
        ['34ff410fe7339937986bccbb2eb848138bb0db1f', '2.1.110'],
        ['5e168e7272e2eb510b16d7141538bb3f4836749a', '2.1.111'],
        ['7a202a296a5d4278f75fd0bdb3ef870e98a34452', '2.1.112'],
        ['d88405d4b4b7ce6e066e1d67e7fc421b54d685f0', '2.1.113'],
        ['f7d9656548fd1e7849a9e243d9950dbb7307690c', '2.1.114'],
        ['e08046f528857203cbdede147bcab8b8b8021bf7', '2.1.116'],
      ]).get(targetCommit)}`,
    )
  ) {
    return Buffer.alloc(0)
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'late-own-supplement-'))
  const tree = path.join(temporary, 'tree')
  git(repositoryRoot, ['worktree', 'add', '--detach', tree, targetCommit])
  try {
    mutate(tree)
    git(tree, ['add', '-A'])
    return gitPatch(tree, ['diff', '--cached', '--no-ext-diff', '--binary', '-U1'])
  } finally {
    git(repositoryRoot, ['worktree', 'remove', '--force', tree])
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

function writeFromGit(repository, revision, relative, destinationRoot) {
  const value = gitPatch(repository, ['show', `${revision}:${relative}`])
  const destination = path.join(destinationRoot, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, value)
}

function replaceExactly(filename, before, after, label) {
  const value = fs.readFileSync(filename, 'utf8')
  if (!value.includes(before)) throw new Error(`${label} anchor differs`)
  fs.writeFileSync(filename, value.replace(before, after))
}

function replaceExactlyOrAlready(filename, before, after, label) {
  const value = fs.readFileSync(filename, 'utf8')
  if (value.includes(after)) return
  if (!value.includes(before)) throw new Error(`${label} anchor differs`)
  fs.writeFileSync(filename, value.replace(before, after))
}

function installPrintResumeTelemetry116Prerequisites(tree) {
  const filename = path.join(tree, 'src/cli/print.ts')

  // The isolated target116 source commit omits two behaviors retained by the
  // authenticated bundle: custom-title lookup from target101 and the complete
  // print-resume telemetry graph from target105. Replay both in introduction
  // order before applying the target116-only failure-reason refinement.
  const initial = fs.readFileSync(filename, 'utf8')
  if (
    !initial.includes('  getSessionIdFromLog,\n') ||
    !initial.includes('  searchSessionsByCustomTitle,\n')
  ) {
    replaceExactly(
      filename,
      `  restoreSessionMetadata,
} from 'src/utils/sessionStorage.js'
`,
      `  restoreSessionMetadata,
  getSessionIdFromLog,
  searchSessionsByCustomTitle,
} from 'src/utils/sessionStorage.js'
`,
      'inherited target101 print title imports',
    )
  }
  replaceExactly(
    filename,
    `      // In print mode - we require a valid session ID, JSONL file or URL
      const parsedSessionId = parseSessionIdentifier(
        typeof options.resume === 'string' ? options.resume : '',
      )
      if (!parsedSessionId) {
        let errorMessage =
          'Error: --resume requires a valid session ID when used with --print. Usage: claude -p --resume <session-id>'
        if (typeof options.resume === 'string') {
          errorMessage += \`. Session IDs must be in UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000). Provided value "\${options.resume}" is not a valid UUID\`
        }
`,
    `      const resumeValue =
        typeof options.resume === 'string' ? options.resume.trim() : ''
      let parsedSessionId = parseSessionIdentifier(resumeValue)
      if (!parsedSessionId && resumeValue) {
        const matches = await searchSessionsByCustomTitle(resumeValue, {
          exact: true,
        })
        if (matches.length === 1) {
          const sessionId = getSessionIdFromLog(matches[0]!)
          if (sessionId) parsedSessionId = parseSessionIdentifier(sessionId)
        } else if (matches.length > 1) {
          const candidates = matches
            .map(
              match =>
                \`  \${getSessionIdFromLog(match) ?? '(unknown)'}  (modified \${match.modified.toISOString()})\`,
            )
            .join('\\n')
          emitLoadError(
            \`Error: --resume "\${resumeValue}" matches \${matches.length} sessions. Pass one of these session IDs to disambiguate:\\n\${candidates}\`,
            options.outputFormat,
          )
          gracefulShutdownSync(1)
          return { messages: [] }
        }
      }
      if (!parsedSessionId) {
        let errorMessage =
          'Error: --resume requires a valid session ID or session title when used with --print. Usage: claude -p --resume <session-id|title>'
        if (resumeValue) {
          errorMessage += \`. Provided value "\${resumeValue}" is not a UUID and does not match any session title.\`
        }
`,
    'inherited target101 print title branch',
  )

  replaceExactly(
    filename,
    `  if (options.resume) {
    try {
`,
    `  if (options.resume) {
    let failureReason = 'load_error'
    const resumeStartedAt = performance.now()
    try {
`,
    'inherited target105 print resume telemetry state',
  )
  replaceExactly(
    filename,
    `          emitLoadError(
            \`Error: --resume "\${resumeValue}" matches \${matches.length} sessions. Pass one of these session IDs to disambiguate:\\n\${candidates}\`,
`,
    `          logEvent('tengu_session_resumed', {
            entrypoint: 'print',
            success: false,
            failure_reason: 'not_found',
          })
          emitLoadError(
            \`Error: --resume "\${resumeValue}" matches \${matches.length} sessions. Pass one of these session IDs to disambiguate:\\n\${candidates}\`,
`,
    'inherited target105 ambiguous print resume telemetry',
  )
  replaceExactly(
    filename,
    `        emitLoadError(errorMessage, options.outputFormat)
`,
    `        logEvent('tengu_session_resumed', {
          entrypoint: 'print',
          success: false,
          failure_reason: 'not_found',
        })
        emitLoadError(errorMessage, options.outputFormat)
`,
    'inherited target105 invalid print resume telemetry',
  )
  replaceExactly(
    filename,
    `      const result = await loadConversationForResume(
        parsedSessionId.sessionId,
        parsedSessionId.jsonlFile || undefined,
      )
`,
    `      const result = await loadConversationForResume(
        parsedSessionId.sessionId,
        parsedSessionId.jsonlFile || undefined,
      )
      failureReason = 'processing_error'
`,
    'inherited target105 print resume processing phase',
  )
  replaceExactly(
    filename,
    `        } else {
          emitLoadError(
            \`No conversation found with session ID: \${parsedSessionId.sessionId}\`,
`,
    `        } else {
          logEvent('tengu_session_resumed', {
            entrypoint: 'print',
            success: false,
            failure_reason: 'not_found',
          })
          emitLoadError(
            \`No conversation found with session ID: \${parsedSessionId.sessionId}\`,
`,
    'inherited target105 missing transcript resume telemetry',
  )
  replaceExactly(
    filename,
    `        if (index < 0) {
          emitLoadError(
            \`No message found with message.uuid of: \${options.resumeSessionAt}\`,
`,
    `        if (index < 0) {
          logEvent('tengu_session_resumed', {
            entrypoint: 'print',
            success: false,
            failure_reason: 'processing_error',
          })
          emitLoadError(
            \`No message found with message.uuid of: \${options.resumeSessionAt}\`,
`,
    'inherited target105 missing message resume telemetry',
  )
  replaceExactly(
    filename,
    `      return {
        messages: result.messages,
        turnInterruptionState: result.turnInterruptionState,
        agentSetting: result.agentSetting,
      }
    } catch (error) {
      logError(error)
`,
    `      logEvent('tengu_session_resumed', {
        entrypoint: 'print',
        success: true,
        resume_duration_ms: Math.round(performance.now() - resumeStartedAt),
      })

      return {
        messages: result.messages,
        turnInterruptionState: result.turnInterruptionState,
        agentSetting: result.agentSetting,
      }
    } catch (error) {
      logEvent('tengu_session_resumed', {
        entrypoint: 'print',
        success: false,
        failure_reason: failureReason,
        error_name: toError(error).name,
      })
      logError(error)
`,
    'inherited target105 print resume success and catch telemetry',
  )

  const inherited = fs.readFileSync(filename, 'utf8')
  const oldReason = "failure_reason: 'not_found'"
  const newReason = "failure_reason: 'not_found_explicit_id'"
  const count = inherited.split(oldReason).length - 1
  if (count !== 3) {
    throw new Error(
      `target 2.1.116 print resume reason expected 3 anchors, found ${count}`,
    )
  }
  fs.writeFileSync(filename, inherited.replaceAll(oldReason, newReason))
}

function installTarget116HeadlessMcpAndStartup(tree) {
  // The reusable print-mode MCP coordinator was introduced in target101 and
  // carries the target108 deadline/retry evolution into target116.  The
  // isolated target116 source commit still has only the legacy inline copy,
  // so install the cumulative owners and make the reusable adapter the live
  // path before retaining the inline implementation as unreachable source
  // history.
  writeCurrentSource('src/services/mcp/headlessConnectionManager.ts', tree)
  writeCurrentSource('src/entrypoints/mcp.ts', tree)

  const mainPath = path.join(tree, 'src/main.tsx')
  replaceExactly(
    mainPath,
    "import { prefetchOfficialMcpUrls } from './services/mcp/officialRegistry.js';\n",
    "import { prefetchOfficialMcpUrls } from './services/mcp/officialRegistry.js';\nimport { createHeadlessMcpConnectionManager } from './services/mcp/headlessConnectionManager.js';\n",
    'inherited target101 headless MCP manager import',
  )
  replaceExactly(
    mainPath,
    "import { relative, resolve } from 'path';\n",
    "import { relative, resolve } from 'path';\nimport { recordRemoteStartupPhase } from './bridge/startupTiming.js';\n",
    'target 2.1.116 remote startup timing import',
  )

  const currentMain = fs.readFileSync(
    path.join(repositoryRoot, 'src/main.tsx'),
    'utf8',
  )
  const managerStartMarker =
    '      const headlessMcpConnectionManager = createHeadlessMcpConnectionManager({'
  const managerEndMarker = '      if (false) {'
  const managerStart = currentMain.indexOf(managerStartMarker)
  const managerEnd = currentMain.indexOf(managerEndMarker, managerStart)
  if (managerStart < 0 || managerEnd < 0) {
    throw new Error('target 2.1.116 live headless MCP manager anchors differ')
  }
  const managerBlock = currentMain.slice(managerStart, managerEnd)
  const legacyStart =
    '      // Print-mode MCP connects both configured and claude.ai servers through\n'
  replaceExactly(
    mainPath,
    legacyStart,
    `${managerBlock}      if (false) {\n${legacyStart}`,
    'target 2.1.116 live headless MCP manager call path',
  )
  replaceExactly(
    mainPath,
    `      profileCheckpoint('after_connectMcp_claudeai');\n\n      // In headless mode, start deferred prefetches immediately`,
    `      profileCheckpoint('after_connectMcp_claudeai');\n      }\n\n      // In headless mode, start deferred prefetches immediately`,
    'target 2.1.116 unreachable legacy MCP coordinator close',
  )

  // Remote startup phases are intentionally process-local and consumed once
  // by the first SDK system-init message.  Keep the two standalone owners
  // whole and select only their narrow call edges from shared files.
  writeCurrentSource('src/bridge/startupTiming.ts', tree)
  writeCurrentSource('src/utils/telemetry/startupTelemetry.ts', tree)
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/utils/messages/systemInit.ts'],
    /consumeRemoteStartupTiming|startup_timing/,
    'case114-remote-startup-system-init',
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/main.tsx'],
    /startupTelemetry\.js|collectSetEnvVars\(|collectNonDefaultSettings\(|set_env_var_count|nondefault_setting_count|tengu_cli_flags|getOptionValueSource/,
    'case114-startup-cli-telemetry',
  )
  replaceExactly(
    mainPath,
    '      void logStartupTelemetry();',
    '      void logStartupTelemetry(getGlobalConfig());',
    'target 2.1.116 startup telemetry config caller',
  )

  const printPath = path.join(tree, 'src/cli/print.ts')
  replaceExactly(
    printPath,
    "import { dirname } from 'path'\n",
    "import { dirname } from 'path'\nimport { recordRemoteStartupPhase } from 'src/bridge/startupTiming.js'\n",
    'target 2.1.116 print startup timing import',
  )
  replaceExactly(
    printPath,
    `      if (pluginsInstalled) {
        await applyPluginMcpDiff()
      }`,
    `      if (pluginsInstalled) {
        const reconcileStartedAt = performance.now()
        await applyPluginMcpDiff()
        if (isEnvTruthy(process.env.CLAUDE_CODE_SYNC_PLUGIN_INSTALL)) {
          recordRemoteStartupPhase(
            'plugin_mcp_reconcile_ms',
            performance.now() - reconcileStartedAt,
          )
        }
      }`,
    'target 2.1.116 plugin MCP reconcile startup phase',
  )
  replaceExactly(
    printPath,
    "    headlessProfilerCheckpoint('run_entry')\n",
    "    headlessProfilerCheckpoint('run_entry')\n    recordRemoteStartupPhase('first_message_read_ms', performance.now())\n",
    'target 2.1.116 first-message startup phase',
  )
  replaceExactly(
    printPath,
    '    if (pluginInstallPromise) {\n',
    '    if (pluginInstallPromise) {\n      const pluginInstallStartedAt = performance.now()\n',
    'target 2.1.116 plugin install startup timer',
  )
  replaceExactly(
    printPath,
    '      pluginInstallPromise = null\n',
    `      recordRemoteStartupPhase(
        'plugin_install_ms',
        performance.now() - pluginInstallStartedAt,
      )
      pluginInstallPromise = null
`,
    'target 2.1.116 plugin install startup phase',
  )
}

function installTarget116ModelCanonicalization(tree) {
  const modelPath = path.join(tree, 'src/utils/model/model.ts')

  // The date-suffix fallback is a persistent target97 prerequisite. Replay it
  // before selecting the target116-only Claude 4.0 family disambiguation so
  // the later case does not claim the earlier fallback introduction.
  replaceExactly(
    modelPath,
    `  const match = name.match(/(claude-(\\d+-\\d+-)?\\w+)/)
  if (match && match[1]) {
    return match[1]
  }
  // Fall back to the original name if no pattern matches
  return name`,
    `  return name.replace(/-\\d{8}$/, '')`,
    'inherited target97 model date-suffix fallback',
  )
  replaceExactly(
    modelPath,
    `  if (name.includes('claude-opus-4')) {
    return 'claude-opus-4'
  }`,
    `  if (/claude-opus-4(?!-\\d(?!\\d))/.test(name)) {
    return 'claude-opus-4-0'
  }`,
    'target 2.1.116 canonical Opus 4.0 branch',
  )
  replaceExactly(
    modelPath,
    `  if (name.includes('claude-sonnet-4')) {
    return 'claude-sonnet-4'
  }`,
    `  if (/claude-sonnet-4(?!-\\d(?!\\d))/.test(name)) {
    return 'claude-sonnet-4-0'
  }`,
    'target 2.1.116 canonical Sonnet 4.0 branch',
  )
}

function installTarget116MessageOperations(tree) {
  // appendOrReplaceMessageByUuid first appears in target89.  Reapply that
  // helper as a cumulative prerequisite, then add only target116's typed
  // operation reducer and live command/query call edges.
  const messagesPath = path.join(tree, 'src/utils/messages.ts')
  replaceExactly(
    messagesPath,
    `  return sliced
}

export function shouldShowUserMessage(`,
    `  return sliced
}

export function appendOrReplaceMessageByUuid(
  messages: Message[],
  message: Message,
): Message[] {
  if (messages.findLastIndex(item => item.uuid === message.uuid) === -1) {
    return [...messages, message]
  }
  return [...messages.filter(item => item.uuid !== message.uuid), message]
}

export function shouldShowUserMessage(`,
    'inherited target89 append-or-replace UUID helper',
  )

  writeCurrentSource('src/utils/messageOperations.ts', tree)

  const commandTypePath = path.join(tree, 'src/types/command.ts')
  replaceExactly(
    commandTypePath,
    "import type { PluginManifest } from './plugin.js'\n",
    "import type { PluginManifest } from './plugin.js'\nimport type { MessageOperation } from '../utils/messageOperations.js'\n",
    'target 2.1.116 local command message-operation type import',
  )
  replaceExactly(
    commandTypePath,
    `  setMessages: (updater: (prev: Message[]) => Message[]) => void
  options: {`,
    `  setMessages: (updater: (prev: Message[]) => Message[]) => void
  applyMessageOp: (operation: MessageOperation) => void
  options: {`,
    'target 2.1.116 local command message-operation boundary',
  )

  replaceExactly(
    path.join(tree, 'src/commands/login/login.tsx'),
    '    context.setMessages(stripSignatureBlocks);',
    "    context.applyMessageOp({ type: 'update', updater: stripSignatureBlocks });",
    'target 2.1.116 login message update operation',
  )
  replaceExactly(
    path.join(tree, 'src/commands/permissions/permissions.tsx'),
    '    context.setMessages(prev => [...prev, createPermissionRetryMessage(commands)]);',
    `    context.applyMessageOp({
      type: 'append',
      messages: [createPermissionRetryMessage(commands)]
    });`,
    'target 2.1.116 permission retry append operation',
  )

  // The Teleport local command owner is missing from the isolated commit.
  // Install the exact target116 command module; its only message mutation is
  // the operation-boundary replacement required by this graph.
  writeCurrentSource('src/commands/teleport/teleport.tsx', tree)

  const queryEnginePath = path.join(tree, 'src/QueryEngine.ts')
  replaceExactly(
    queryEnginePath,
    "import { countToolCalls, SYNTHETIC_MESSAGES } from './utils/messages.js'\n",
    "import { countToolCalls, SYNTHETIC_MESSAGES } from './utils/messages.js'\nimport { applyMessageOperation } from './utils/messageOperations.js'\n",
    'target 2.1.116 QueryEngine message-operation import',
  )
  replaceExactly(
    queryEnginePath,
    `      setMessages: fn => {
        this.mutableMessages = fn(this.mutableMessages)
      },
      onChangeAPIKey: () => {},`,
    `      setMessages: fn => {
        this.mutableMessages = fn(this.mutableMessages)
      },
      applyMessageOp: operation => {
        this.mutableMessages = applyMessageOperation(
          this.mutableMessages,
          operation,
        )
      },
      onChangeAPIKey: () => {},`,
    'target 2.1.116 QueryEngine mutable message-operation routing',
  )
  replaceExactly(
    queryEnginePath,
    `      setMessages: () => {},
      onChangeAPIKey: () => {},`,
    `      setMessages: () => {},
      applyMessageOp: () => {},
      onChangeAPIKey: () => {},`,
    'target 2.1.116 QueryEngine post-command no-op operation boundary',
  )

  // These REPL hunks are target-backed message-operation mutations.  Other
  // additions that happen to share a compiled function (file-history state,
  // progress metrics, result deduplication) remain governed by their own
  // earlier/later recovery selectors.
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/screens/REPL.tsx'],
    /applyMessageOp|applyMessageOperation|MessageOperation|appendOrReplaceMessageByUuid|stripToolUseResultsForStorage/,
    'case114-message-operation-repl',
  )
}

function installTarget116SynchronizedOutputProbe(tree) {
  const terminalPath = path.join(tree, 'src/ink/terminal.ts')
  replaceExactly(
    terminalPath,
    `export function isSynchronizedOutputSupported(): boolean {`,
    `let synchronizedOutputProbeSucceeded: boolean | undefined

export function setSynchronizedOutputProbeSucceeded(supported: boolean): void {
  synchronizedOutputProbeSucceeded = supported
}

export function isSynchronizedOutputSupported(): boolean {`,
    'target 2.1.116 synchronized-output probe state and setter',
  )
  replaceExactly(
    terminalPath,
    `  const vteVersion = process.env.VTE_VERSION
  if (vteVersion) {
    const version = parseInt(vteVersion, 10)
    if (version >= 6800) return true
  }

  return false
}`,
    `  const vteVersion = process.env.VTE_VERSION
  if (vteVersion) {
    const version = parseInt(vteVersion, 10)
    if (version >= 6800) return true
  }

  if (synchronizedOutputProbeSucceeded) return true

  return false
}`,
    'target 2.1.116 synchronized-output probe fallback',
  )

  // Only the live DECRQM import/probe hunk belongs here.  The current owner
  // also carries inherited theme notification and nullable-querier recovery;
  // those are deliberately excluded, as are dead arrow-window fields.
  const appPath = path.join(tree, 'src/ink/components/App.tsx')
  replaceExactly(
    appPath,
    `import { DECSTBM_SAFE, isXtermJs, setXtversionName, supportsExtendedKeys } from '../terminal.js';`,
    `import { DECSTBM_SAFE, isXtermJs, setSynchronizedOutputProbeSucceeded, setXtversionName, supportsExtendedKeys } from '../terminal.js';`,
    'target 2.1.116 synchronized-output setter import',
  )
  replaceExactly(
    appPath,
    `import { TerminalQuerier, xtversion } from '../terminal-querier.js';`,
    `import { decrqm, TerminalQuerier, xtversion } from '../terminal-querier.js';`,
    'target 2.1.116 DECRQM query import',
  )
  replaceExactly(
    appPath,
    `import { DBP, DFE, DISABLE_MOUSE_TRACKING, EBP, EFE, HIDE_CURSOR, SHOW_CURSOR } from '../termio/dec.js';`,
    `import { DBP, DEC, DFE, DISABLE_MOUSE_TRACKING, EBP, EFE, HIDE_CURSOR, SHOW_CURSOR } from '../termio/dec.js';`,
    'target 2.1.116 synchronized-update DEC constant import',
  )
  replaceExactly(
    appPath,
    `          void Promise.all([this.querier.send(xtversion()), this.querier.flush()]).then(async ([r]) => {`,
    `          const skipSynchronizedOutputProbe = process.env.TERM_PROGRAM === 'Apple_Terminal';
          void Promise.all([this.querier.send(xtversion()), skipSynchronizedOutputProbe ? Promise.resolve(undefined) : this.querier.send(decrqm(DEC.SYNCHRONIZED_UPDATE)), this.querier.flush()]).then(async ([r, synchronizedOutput]) => {
            const synchronizedOutputSupported = synchronizedOutput?.status === 1 || synchronizedOutput?.status === 2;
            setSynchronizedOutputProbeSucceeded(synchronizedOutputSupported);
            logForDebugging(\`DECRQM(2026): \${skipSynchronizedOutputProbe ? 'skipped (Apple_Terminal)' : synchronizedOutput ? \`status=\${synchronizedOutput.status}\` : 'no reply'} → sync \${synchronizedOutputSupported ? 'supported' : 'unsupported'}\`);`,
    'target 2.1.116 live synchronized-output DECRQM probe',
  )
}

function installTarget116FourLiveResidueGaps(tree) {
  // The Agent progress tree uses the design-system connector introduced at
  // 104→105 and evolved before target116. The isolated target commit lacks the
  // owner, so replay that prerequisite whole and keep the target116 consumer
  // selection to its six authenticated connector/layout hunks.
  writeCurrentSource('src/components/design-system/Tree.tsx', tree)
  applyMatchingWorkingTreePatch(
    tree,
    ['src/components/AgentProgressLine.tsx'],
    /TreeConnector|const connector = isLast|\$\[5\] !== connector|<Box flexDirection="column" paddingLeft=\{3\}>/,
    'case114-agent-progress-tree-connectors',
  )

  // Target116 replaces CCR's Axios client with native fetch and explicitly
  // cancels response bodies that are not consumed. Include the two retained
  // raw-command fields and the delivery-ack prerequisite in the same three-way
  // application because all three histories touch this class.
  applyMatchingWorkingTreePatch(
    tree,
    ['src/cli/transports/ccrClient.ts'],
    /getProxyFetchOptions|createAxiosInstance|alwaysValidStatus|this\.http|await fetch\(|response\.body\?\.cancel\(\)|response\.headers\.get\('retry-after'\)|response\.json\(\)|AbortSignal\.timeout|response\.ok|raw_command: details\.raw_command|tool_use_id: details\.tool_use_id|flushDeliveryAcks/,
    'case114-ccr-native-fetch-body-cancellation',
  )

  applyMatchingWorkingTreePatch(
    tree,
    ['src/ink/components/AlternateScreen.tsx'],
    /ink\?\.hasUnmounted \? "" : EXIT_ALT_SCREEN/,
    'case114-alternate-screen-unmount-exit',
  )

  // Scroll acceleration is one shared cached configuration consumed by the
  // keybinding handler and renderer. The selection-delete transform runs
  // earlier and owns its mixed handler import hunk; select only the remaining
  // target116 state/call-site edits here.
  writeCurrentSource('src/ink/scroll-config.ts', tree)
  replaceExactly(
    path.join(tree, 'src/ink/terminal.ts'),
    `export function setXtversionName(name: string): void {
  if (xtversionName === undefined) xtversionName = name
}

/** True if running in an xterm.js-based terminal`,
    `export function setXtversionName(name: string): void {
  if (xtversionName === undefined) xtversionName = name
}

/** Return the raw XTVERSION response, if the startup probe has completed. */
export function getXtversionName(): string | undefined {
  return xtversionName
}

/** True if running in an xterm.js-based terminal`,
    'target116 raw XTVERSION getter for scroll configuration',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/components/ScrollKeybindingHandler.tsx'],
    /^\+\s+useDecayCurve: boolean;$|state\.useDecayCurve|initWheelAccel\(useDecayCurve|^\+\s+useDecayCurve,$|const config = getScrollConfig\(\)/m,
    'case114-scroll-config-handler',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/ink/render-node-to-output.ts'],
    /getScrollConfig|isXtermJsHost|useAdaptiveDrain|import \{ isXtermJs \} from '\.\/terminal\.js'/,
    'case114-scroll-config-renderer',
  )
}

function installTarget116ExportRendererKeybindingContext(tree) {
  // Static export rendering still instantiates KeybindingProvider directly.
  // Target116 extends that provider contract with a dedicated pre-dispatch
  // registry; select only the one provider-construction hunk so unrelated
  // export rendering and message normalization changes remain cumulative.
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/utils/exportRenderer.tsx'],
    /preDispatchRef/,
    'case114-export-renderer-keybinding-context',
  )
}

function installTarget116KeybindingPreDispatch(tree) {
  // The target110 replay above owns the focus-aware single-key dispatcher.
  // Target116 adds a shared pre-dispatch observer registry around that graph;
  // select only its two authenticated hunks (the registry/provider wiring and
  // the observer loop/telemetry evolution) so the target110 prerequisite is
  // preserved rather than copied from the cumulative working tree wholesale.
  applyMatchingWorkingTreePatch(
    tree,
    ['src/keybindings/KeybindingProviderSetup.tsx'],
    /preDispatchRef|recordKeybindingFired/,
    'case114-keybinding-predispatch',
  )
}

function installTarget116BridgePermissionAndSelectorOverflow(tree) {
  // The live REPL bridge must expose the current permission context to the
  // target116 remote file/tool authorization graph. Select only that option;
  // the cumulative hook contains later bridge lifecycle changes.
  applyMatchingWorkingTreePatch(
    tree,
    ['src/hooks/useReplBridge.tsx'],
    /getToolPermissionContext/,
    'case114-repl-bridge-permission-context',
  )

  // Target116 keeps a seven-row selector window and reports how many choices
  // are hidden above and below it. Preserve the later current exit guide and
  // compaction handling by selecting only the window/count render hunks.
  applyMatchingWorkingTreePatch(
    tree,
    ['src/components/MessageSelector.tsx'],
    /lastVisibleIndex|hiddenAbove|hiddenBelow|more above|more below/,
    'case114-message-selector-overflow-counts',
  )
}

function installTarget116ExactModelCapabilityDispatch(tree) {
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/context.ts'],
    /getAPIProviderForModel|MAX_OUTPUT_TOKENS_UPPER_LIMIT = 128_000|export function modelSupports1M|export function getSonnet1mExpTreatmentEnabled|export function getModelMaxOutputTokens/,
    'case114-exact-context-capabilities',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/betas.ts'],
    /export function modelSupportsISP|function vertexModelSupportsWebSearch|export function modelSupportsContextManagement|export function modelSupportsStructuredOutputs/,
    'case114-exact-beta-capabilities',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/thinking.ts'],
    /export function modelSupportsAdaptiveThinking/,
    'case114-exact-adaptive-capability',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/effort.ts'],
    /export function modelSupportsEffort|export function modelSupportsMaxEffort|export function modelSupportsXHighEffort/,
    'case114-exact-effort-capabilities',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/entrypoints/cli.tsx'],
    /args\.length === 2 && args\[1\] === '--verbose'|Commit: \$\{MACRO\.GIT_SHA\}/,
    'case114-version-verbose',
  )
}

function installTarget90MemoryTogglePrerequisite(tree) {
  // The session memory toggle is introduced at 89→90 and remains live in
  // target116. The isolated 116 overlay predates that recovered source, so
  // replay only the exact toggle hunks from the authenticated case90 owner
  // tree rather than attributing this cumulative graph to 114→116.
  const statePath = path.join(tree, 'src/bootstrap/state.ts')
  replaceExactly(
    statePath,
    `  sdkAgentProgressSummariesEnabled: boolean
  userMsgOptIn: boolean`,
    `  sdkAgentProgressSummariesEnabled: boolean
  memoryToggledOff: boolean
  userMsgOptIn: boolean`,
    'inherited target90 memory toggle state type',
  )
  replaceExactly(
    statePath,
    `    sdkAgentProgressSummariesEnabled: false,
    userMsgOptIn: false,`,
    `    sdkAgentProgressSummariesEnabled: false,
    memoryToggledOff: false,
    userMsgOptIn: false,`,
    'inherited target90 memory toggle initial state',
  )
  replaceExactly(
    statePath,
    `export function getClientType(): string {`,
    `export function getMemoryToggledOff(): boolean {
  return STATE.memoryToggledOff
}

export function setMemoryToggledOff(value: boolean): void {
  STATE.memoryToggledOff = value
}

export function getClientType(): string {`,
    'inherited target90 memory toggle state accessors',
  )

  const commandsPath = path.join(tree, 'src/commands.ts')
  replaceExactly(
    commandsPath,
    `import memory from './commands/memory/index.js'\n`,
    `import memory from './commands/memory/index.js'\nimport toggleMemory from './commands/toggle-memory.js'\n`,
    'inherited target90 memory toggle command import',
  )
  replaceExactly(
    commandsPath,
    `  mcp,\n  memory,\n  mobile,`,
    `  mcp,\n  memory,\n  toggleMemory,\n  mobile,`,
    'inherited target90 memory toggle command registration',
  )

  const extractorPath = path.join(
    tree,
    'src/services/extractMemories/extractMemories.ts',
  )
  replaceExactly(
    extractorPath,
    `import { getIsRemoteMode } from '../../bootstrap/state.js'`,
    `import {
  getIsRemoteMode,
  getMemoryToggledOff,
} from '../../bootstrap/state.js'`,
    'inherited target90 memory toggle extractor import',
  )
  replaceExactly(
    extractorPath,
    `  return async (tool: Tool, input: Record<string, unknown>) => {
    // Allow REPL`,
    `  return async (tool: Tool, input: Record<string, unknown>) => {
    if (getMemoryToggledOff()) {
      return denyAutoMemTool(
        tool,
        'Memory is toggled off. Run /toggle-memory to re-enable automemory.',
      )
    }

    // Allow REPL`,
    'inherited target90 memory toggle extraction gate',
  )

  const filesystemPath = path.join(tree, 'src/utils/permissions/filesystem.ts')
  replaceExactly(
    filesystemPath,
    `import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'`,
    `import {
  getMemoryToggledOff,
  getOriginalCwd,
  getSessionId,
} from '../../bootstrap/state.js'`,
    'inherited target90 memory toggle filesystem import',
  )
  replaceExactly(
    filesystemPath,
    `  const normalizedPath = normalize(absolutePath)

  // Plan files for current session`,
    `  const normalizedPath = normalize(absolutePath)

  if (isAutoMemPath(normalizedPath) && getMemoryToggledOff()) {
    return {
      behavior: 'deny',
      message:
        'Cannot write to memory while it is toggled off. Run /toggle-memory to re-enable automemory.',
      decisionReason: {
        type: 'other',
        reason: 'memory access blocked by /toggle-memory',
      },
    }
  }

  // Plan files for current session`,
    'inherited target90 memory toggle editable-path gate',
  )
  replaceExactly(
    filesystemPath,
    `  // Session memory directory
  if (isSessionMemoryPath(normalizedPath)) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'other',
        reason: 'Session memory files are allowed for reading',
      },
    }
  }

  // Project directory (for reading past session memories)
  // Path format: ~/.claude/projects/{sanitized-cwd}/...
  if (isProjectDirPath(normalizedPath)) {`,
    `  // Session memory directory
  if (isSessionMemoryPath(normalizedPath)) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'other',
        reason: 'Session memory files are allowed for reading',
      },
    }
  }

  if (isAutoMemPath(normalizedPath) && getMemoryToggledOff()) {
    return {
      behavior: 'deny',
      message:
        'Cannot read memory while it is toggled off. Run /toggle-memory to re-enable automemory.',
      decisionReason: {
        type: 'other',
        reason: 'memory access blocked by /toggle-memory',
      },
    }
  }

  // Project directory (for reading past session memories)
  // Path format: ~/.claude/projects/{sanitized-cwd}/...
  if (isProjectDirPath(normalizedPath)) {`,
    'inherited target90 memory toggle readable-path gate',
  )
  writeCurrentSource('src/commands/toggle-memory.ts', tree)
}

function installTarget116SessionIndexScanApi(tree) {
  const filename = path.join(tree, 'src/utils/sessionStorage.ts')
  let value = fs.readFileSync(filename, 'utf8')
  const replacements = [
    ['const SIDECHAIN_PROBE_BYTES = 256', 'export const INDEX_HEAD_SCAN_BYTES = 256'],
    [
      'const COMPACT_BOUNDARY_PROBE_BYTES = 4096',
      'export const INDEX_BOUNDARY_SCAN_BYTES = 4096',
    ],
    ['COMPACT_BOUNDARY_PROBE_BYTES', 'INDEX_BOUNDARY_SCAN_BYTES'],
    ['SIDECHAIN_PROBE_BYTES', 'INDEX_HEAD_SCAN_BYTES'],
  ]
  for (const [before, after] of replacements) {
    if (!value.includes(before)) {
      throw new Error(`target 2.1.116 session-index anchor differs: ${before}`)
    }
    value = value.replaceAll(before, after)
  }
  fs.writeFileSync(filename, value)
}

function installTarget116ResumePickerTelemetry(tree) {
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/screens/ResumeConversation.tsx'],
    /alreadyLogged|failureReason|not_found_picker|processing_error|toError\(error\)\.name|LoadingState|Loading conversations|Resuming conversation|existingStandaloneAgentContext|updateSessionName|mergedAgentContext/,
    'case114-resume-picker-telemetry',
  )
}

function installScheduleSkillPrerequisites(tree) {
  const filename = path.join(tree, 'src/skills/bundled/scheduleRemoteAgents.ts')
  replaceExactly(
    filename,
    `import { logForDebugging } from '../../utils/debug.js'`,
    `import { logForDebugging } from '../../utils/debug.js'\nimport { isEnvTruthy } from '../../utils/envUtils.js'`,
    'inherited target101 schedule remote-environment gate import',
  )
  replaceExactly(
    filename,
    `    name: 'schedule',\n    description:`,
    `    name: 'schedule',\n    aliases: ['routines'],\n    description:`,
    'inherited target111 schedule routines alias',
  )
  replaceExactly(
    filename,
    `    isEnabled: () =>\n      getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false) &&`,
    `    isEnabled: () =>\n      !isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&\n      getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false) &&`,
    'inherited target101 schedule remote-environment gate',
  )
}

function installTarget116RemoteControlSessionSuppression(tree) {
  replaceExactly(
    path.join(tree, 'src/main.tsx'),
    `      if (feature('BRIDGE_MODE') && remoteControlOption !== undefined) {
        const {
          getBridgeDisabledReason
        } = await import('./bridge/bridgeEnabled.js');
        const disabledReason = await getBridgeDisabledReason();
        remoteControl = disabledReason === null;
        if (disabledReason) {`,
    `      if (feature('BRIDGE_MODE') && remoteControlOption !== undefined) {
        let disabledReason: string | null;
        if (remote !== null) {
          disabledReason = 'Remote Control is not available inside --remote sessions.';
        } else if (teleport) {
          disabledReason = '--teleport sessions start without Remote Control. Use /remote-control to enable it.';
        } else {
          const {
            getBridgeDisabledReason
          } = await import('./bridge/bridgeEnabled.js');
          disabledReason = await getBridgeDisabledReason();
        }
        remoteControl = disabledReason === null;
        if (disabledReason) {`,
    'target 2.1.116 remote-control remote and teleport suppression',
  )
}

function installTarget116ResumeCommandLoadingState(tree) {
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/commands/resume/resume.tsx'],
    /LoadingState|Loading conversations|Resuming conversation/,
    'case114-resume-command-loading-state',
  )
}

function installTarget116TaskStopOwnership(tree) {
  // The complete two-owner change is one inseparable target116 protocol:
  // resolve the caller, enforce ownership before kill, update the per-session
  // registry, and notify a task's owner when main stops it.
  writeCurrentSource('src/tasks/stopTask.ts', tree)
  writeCurrentSource('src/tools/TaskStopTool/TaskStopTool.ts', tree)
}

function installTarget116ToolInputUnicodeEscapes(tree) {
  const apiPath = path.join(tree, 'src/utils/api.ts')
  const currentApi = fs.readFileSync(
    path.join(repositoryRoot, 'src/utils/api.ts'),
    'utf8',
  )
  const helperStart = currentApi.indexOf(
    'export function decodeUnicodeEscapesInToolInput(',
  )
  const helperEnd = currentApi.indexOf(
    '// Strips fields that were added by normalizeToolInput before sending to API',
    helperStart,
  )
  if (helperStart < 0 || helperEnd < 0) {
    throw new Error('target 2.1.116 Unicode escape helper anchors differ')
  }
  replaceExactly(
    apiPath,
    '// Strips fields that were added by normalizeToolInput before sending to API',
    `${currentApi.slice(helperStart, helperEnd)}// Strips fields that were added by normalizeToolInput before sending to API`,
    'target 2.1.116 recursive tool-input Unicode escape helper',
  )

  const messagesPath = path.join(tree, 'src/utils/messages.ts')
  replaceExactly(
    messagesPath,
    `import { normalizeToolInput, normalizeToolInputForAPI } from './api.js'`,
    `import {
  decodeUnicodeEscapesInToolInput,
  normalizeToolInput,
  normalizeToolInputForAPI,
} from './api.js'`,
    'target 2.1.116 Unicode escape messages import',
  )
  replaceExactly(
    messagesPath,
    `            const correctedInput = normalizeJsonEncodedToolInputFields(
              normalizedInput,
              tool.inputSchema,
            )`,
    `            const correctedInput = decodeUnicodeEscapesInToolInput(
              normalizeJsonEncodedToolInputFields(
                normalizedInput,
                tool.inputSchema,
              ),
            )`,
    'target 2.1.116 Unicode escape normalization call',
  )
}

function installTarget116TeamsDialogShortcutFooter(tree) {
  const relative = 'src/components/teams/TeamsDialog.tsx'
  const filename = path.join(tree, relative)
  replaceExactly(
    filename,
    `import { Dialog } from '../design-system/Dialog.js';`,
    `import { Byline } from '../design-system/Byline.js';\nimport { Dialog } from '../design-system/Dialog.js';\nimport { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';`,
    'target 2.1.116 teams shortcut footer imports',
  )

  const current = fs.readFileSync(path.join(repositoryRoot, relative), 'utf8')
  const startMarker = 'type TeamDetailViewProps = {'
  const endMarker = 'type TeammateListItemProps = {'
  const start = current.indexOf(startMarker)
  const end = current.indexOf(endMarker, start)
  if (start < 0 || end < 0) {
    throw new Error('target 2.1.116 teams shortcut footer source anchors differ')
  }
  replaceBetween(
    filename,
    startMarker,
    endMarker,
    current.slice(start, end) + endMarker,
    'target 2.1.116 teams shortcut footer',
  )

  const teammateStartMarker = 'type TeammateDetailViewProps = {'
  const teammateEndMarker = 'function _temp2('
  const teammateStart = current.indexOf(teammateStartMarker)
  const teammateEnd = current.indexOf(teammateEndMarker, teammateStart)
  if (teammateStart < 0 || teammateEnd < 0) {
    throw new Error('target 2.1.116 teammate shortcut footer source anchors differ')
  }
  replaceBetween(
    filename,
    teammateStartMarker,
    teammateEndMarker,
    current.slice(teammateStart, teammateEnd) + teammateEndMarker,
    'target 2.1.116 teammate shortcut footer',
  )
}

function installTarget116TrustDialogShortcutFooter(tree) {
  const filename = path.join(
    tree,
    'src/components/TrustDialog/TrustDialog.tsx',
  )
  const current = fs.readFileSync(filename, 'utf8')
  const hasBylineImport = current.includes(
    `import { Byline } from '../design-system/Byline.js';`,
  )
  const hasKeyboardImport = current.includes(
    `import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';`,
  )
  const hasShortcutFooter = current.includes(
    `<Byline><KeyboardShortcutHint chord="enter" action="confirm" /><KeyboardShortcutHint chord="escape" action="cancel" /></Byline>`,
  )
  if (hasBylineImport && hasKeyboardImport && hasShortcutFooter) return
  if (hasBylineImport || hasKeyboardImport || hasShortcutFooter) {
    throw new Error('target 2.1.116 trust shortcut footer is partially installed')
  }
  replaceExactly(
    filename,
    `import { Select } from '../CustomSelect/index.js';`,
    `import { Select } from '../CustomSelect/index.js';
import { Byline } from '../design-system/Byline.js';
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';`,
    'target 2.1.116 trust shortcut footer imports',
  )
  replaceExactly(
    filename,
    `    t22 = <Text dimColor={true}>{exitState.pending ? <>Press {exitState.keyName} again to exit</> : <>Enter to confirm · Esc to cancel</>}</Text>;`,
    `    t22 = <Text dimColor={true}>{exitState.pending ? <>Press {exitState.keyName} again to exit</> : <Byline><KeyboardShortcutHint chord="enter" action="confirm" /><KeyboardShortcutHint chord="escape" action="cancel" /></Byline>}</Text>;`,
    'target 2.1.116 trust shortcut footer',
  )
}

function installTarget116StrictTailSourceOwners(tree) {
  // These cumulative owners are absent or stale in the isolated target116
  // commit. Their complete current forms were authenticated against the
  // target116 bundle and against a raw-target + supplement reconstruction.
  for (const relative of [
    'src/services/api/logging.ts',
    'src/tools/SkillTool/SkillTool.ts',
    'src/tools/BashTool/bashPermissions.ts',
    'src/commands/commit.ts',
    'src/commands/commit-push-pr.ts',
    'src/utils/agenticSessionSearch.ts',
    'src/constants/prompts.ts',
    'src/screens/Doctor.tsx',
    'src/components/LogoV2/Opus47LaunchUpsell.tsx',
    'src/components/FullscreenLayout.tsx',
    'src/commands/loops/loops.tsx',
    'src/components/agents/RunningAgents.tsx',
    'src/components/BackgroundWorkExitDialog.tsx',
    'src/components/VimTextInput.tsx',
    'src/components/FeedbackSurvey/TranscriptSharePrompt.tsx',
    'src/hooks/useAwaySummary.ts',
  ]) {
    writeCurrentSource(relative, tree)
  }

  const contextPath = path.join(tree, 'src/context.ts')
  const context = fs.readFileSync(contextPath, 'utf8')
  if (!context.includes('has_user_email')) {
    applyMatchingWorkingTreePatch(
      tree,
      ['src/context.ts'],
      /getOauthAccountInfo|has_user_email|The user's email address|userEmail/,
      'case114-context-user-email',
    )
  }

  const onboardingPath = path.join(
    tree,
    'src/components/ClaudeInChromeOnboarding.tsx',
  )
  const onboarding = fs.readFileSync(onboardingPath, 'utf8')
  if (!onboarding.includes('const $ = _c(21)')) {
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/ClaudeInChromeOnboarding.tsx'],
      /useInput|_c\(21\)|onKeyDown|tabIndex|autoFocus|key\.key|preventDefault/,
      'case114-chrome-onboarding-compiler-source',
    )
  }

  const updatePath = path.join(tree, 'src/cli/update.ts')
  let update = fs.readFileSync(updatePath, 'utf8')
  if (!update.includes('async function willDaemonRestartForVersion(')) {
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/update.ts'],
      /readFile|getClaudeConfigHomeDir|isENOENT|safeParseJSON|DaemonLock|DAEMON_LOCK_FILENAME|getDaemonLockPath|readDaemonLock|isClaudeDaemonProcess/,
      'case114-daemon-update-helper',
    )
    update = fs.readFileSync(updatePath, 'utf8')
  }
  const restartNotice =
    'Claude daemon will restart for the upgrade once background jobs finish'
  const noticeCount = update.split(restartNotice).length - 1
  if (noticeCount === 0) {
    replaceExactly(
      updatePath,
      `        await regenerateCompletionCache()
      }`,
      `        await regenerateCompletionCache()
        if (await willDaemonRestartForVersion(result.latestVersion)) {
          writeToStdout(
            chalk.dim(
              'Claude daemon will restart for the upgrade once background jobs finish',
            ) + '\\n',
          )
        }
      }`,
      'target 2.1.116 native-update daemon restart notice',
    )
    replaceExactly(
      updatePath,
      `      await regenerateCompletionCache()
      break`,
      `      await regenerateCompletionCache()
      if (await willDaemonRestartForVersion(latestVersion)) {
        writeToStdout(
          chalk.dim(
            'Claude daemon will restart for the upgrade once background jobs finish',
          ) + '\\n',
        )
      }
      break`,
      'target 2.1.116 package-update daemon restart notice',
    )
  } else if (noticeCount !== 2) {
    throw new Error('target 2.1.116 daemon update notices are partially installed')
  }
}

function installTarget116FeedbackSurveyNotSure(tree) {
  // The Button-backed survey owners are inherited from target 110. Replay
  // their latest authored forms here, including only the target116 gated
  // Not-sure evolution and the pending-row pre-dispatch migration.
  writeCurrentSource(
    'src/components/FeedbackSurvey/FeedbackSurveyView.tsx',
    tree,
  )
  writeCurrentSource('src/components/FeedbackSurvey/FeedbackSurvey.tsx', tree)

  const replPath = path.join(tree, 'src/screens/REPL.tsx')
  const currentRepl = fs.readFileSync(
    path.join(repositoryRoot, 'src/screens/REPL.tsx'),
    'utf8',
  )
  const historicalRepl = fs.readFileSync(replPath, 'utf8')
  const marker = "{postCompactSurvey.state !== 'closed' ? <FeedbackSurvey"
  const lineContaining = (value, label) => {
    const markerIndex = value.indexOf(marker)
    if (markerIndex < 0) throw new Error(`${label} survey aggregate differs`)
    const start = value.lastIndexOf('\n', markerIndex) + 1
    const end = value.indexOf('\n', markerIndex)
    return value.slice(start, end < 0 ? value.length : end)
  }
  replaceExactly(
    replPath,
    lineContaining(historicalRepl, 'historical target 2.1.116'),
    lineContaining(currentRepl, 'current target 2.1.116'),
    'target 2.1.116 cumulative survey aggregate and memory Not-sure edge',
  )
}

function installTarget101SdkOAuthPrerequisite(tree) {
  // SDK-hosted OAuth refresh and opaque user dialogs first shipped at
  // target101 and remain live in target116.  The isolated late source base
  // predates those authored edges, so replay only that authenticated graph
  // before installing the target116 control-protocol extensions below.
  const statePath = path.join(tree, 'src/bootstrap/state.ts')
  replaceExactly(
    statePath,
    `  // SDK-provided betas (e.g., context-1m-2025-08-07)
  sdkBetas: string[] | undefined
  // Main thread agent type`,
    `  // SDK-provided betas (e.g., context-1m-2025-08-07)
  sdkBetas: string[] | undefined
  // SDK host callback used to obtain a fresh access token after a 401 when
  // the CLI only has an externally supplied access token (no refresh token).
  sdkOAuthTokenRefreshCallback: (() => Promise<string | null>) | null
  // Main thread agent type`,
    'inherited target101 SDK OAuth callback state type',
  )
  replaceExactly(
    statePath,
    `    // SDK-provided betas
    sdkBetas: undefined,
    // Main thread agent type`,
    `    // SDK-provided betas
    sdkBetas: undefined,
    sdkOAuthTokenRefreshCallback: null,
    // Main thread agent type`,
    'inherited target101 SDK OAuth callback initial state',
  )
  replaceExactly(
    statePath,
    `export function setSdkBetas(betas: string[] | undefined): void {
  STATE.sdkBetas = betas
}

export function resetCostState`,
    `export function setSdkBetas(betas: string[] | undefined): void {
  STATE.sdkBetas = betas
}

export function getSdkOAuthTokenRefreshCallback(): (() => Promise<
  string | null
>) | null {
  return STATE.sdkOAuthTokenRefreshCallback
}

export function setSdkOAuthTokenRefreshCallback(
  callback: (() => Promise<string | null>) | null,
): void {
  STATE.sdkOAuthTokenRefreshCallback = callback
}

export function resetCostState`,
    'inherited target101 SDK OAuth callback accessors',
  )

  const authPath = path.join(tree, 'src/utils/auth.ts')
  replaceExactly(
    authPath,
    `import {
  getIsNonInteractiveSession,
  preferThirdPartyAuthentication,
} from '../bootstrap/state.js'`,
    `import {
  getIsNonInteractiveSession,
  getSdkOAuthTokenRefreshCallback,
  preferThirdPartyAuthentication,
} from '../bootstrap/state.js'`,
    'inherited target101 SDK OAuth state import',
  )
  replaceExactly(
    authPath,
    `const DEFAULT_API_KEY_HELPER_TTL = 5 * 60 * 1000
`,
    `const DEFAULT_API_KEY_HELPER_TTL = 5 * 60 * 1000

export const SDK_OAUTH_REFRESH_ENTRYPOINTS = new Set([
  'claude-desktop',
  'local-agent',
  'claude-vscode',
])
`,
    'inherited target101 SDK OAuth entrypoint allowlist',
  )
  replaceExactly(
    authPath,
    `  if (!currentTokens?.refreshToken) {
    return false
  }
`,
    `  if (!currentTokens?.refreshToken) {
    const sdkRefreshCallback = getSdkOAuthTokenRefreshCallback()
    if (sdkRefreshCallback) {
      try {
        const refreshedAccessToken = await sdkRefreshCallback()
        if (refreshedAccessToken && refreshedAccessToken !== failedAccessToken) {
          process.env.CLAUDE_CODE_OAUTH_TOKEN = refreshedAccessToken
          clearOAuthTokenCache()
          logEvent('tengu_oauth_401_sdk_callback_refreshed', {})
          return true
        }
        logForDebugging(
          refreshedAccessToken === null
            ? 'SDK getOAuthToken callback returned null (no token available)'
            : 'SDK getOAuthToken callback returned the same expired token; treating as no refresh',
          { level: refreshedAccessToken === null ? 'debug' : 'error' },
        )
      } catch (error) {
        logForDebugging(
          \`SDK getOAuthToken callback failed: \${error instanceof Error ? error.message : String(error)}\`,
          { level: 'error' },
        )
      }
    }
    return false
  }
`,
    'inherited target101 SDK OAuth 401 callback fallback',
  )

  const currentSchemas = fs.readFileSync(
    path.join(repositoryRoot, 'src/entrypoints/sdk/controlSchemas.ts'),
    'utf8',
  )
  const schemaStart = currentSchemas.indexOf(
    'export const SDKControlUserDialogRequestSchema',
  )
  const schemaEnd = currentSchemas.indexOf(
    'export const SDKControlMessageRatedRequestSchema',
    schemaStart,
  )
  if (schemaStart < 0 || schemaEnd < 0) {
    throw new Error('inherited target101 SDK schema source anchors differ')
  }
  const schemasPath = path.join(tree, 'src/entrypoints/sdk/controlSchemas.ts')
  replaceExactly(
    schemasPath,
    '\n\n// ============================================================================\n// Control Request/Response Wrappers',
    `\n\n${currentSchemas.slice(schemaStart, schemaEnd)}// ============================================================================\n// Control Request/Response Wrappers`,
    'inherited target101 SDK user-dialog and OAuth schemas',
  )
  replaceExactly(
    schemasPath,
    `    SDKControlGetSettingsRequestSchema(),
    SDKControlElicitationRequestSchema(),
`,
    `    SDKControlGetSettingsRequestSchema(),
    SDKControlElicitationRequestSchema(),
    SDKControlUserDialogRequestSchema(),
    SDKControlOAuthTokenRefreshRequestSchema(),
`,
    'inherited target101 SDK user-dialog and OAuth union',
  )

  const structuredPath = path.join(tree, 'src/cli/structuredIO.ts')
  replaceExactly(
    structuredPath,
    `import { SDKControlElicitationResponseSchema } from 'src/entrypoints/sdk/controlSchemas.js'`,
    `import {
  SDKControlElicitationResponseSchema,
  SDKControlOAuthTokenRefreshResponseSchema,
  SDKControlUserDialogResponseSchema,
} from 'src/entrypoints/sdk/controlSchemas.js'`,
    'inherited target101 SDK response schema imports',
  )
  const currentStructured = fs.readFileSync(
    path.join(repositoryRoot, 'src/cli/structuredIO.ts'),
    'utf8',
  )
  const dialogStart = currentStructured.indexOf('  async requestUserDialog(')
  const dialogEnd = currentStructured.indexOf(
    '  /**\n   * Creates a SandboxAskCallback',
    dialogStart,
  )
  if (dialogStart < 0 || dialogEnd < 0) {
    throw new Error('inherited target101 SDK user-dialog method anchors differ')
  }
  replaceExactly(
    structuredPath,
    '  /**\n   * Creates a SandboxAskCallback',
    `${currentStructured.slice(dialogStart, dialogEnd)}  /**\n   * Creates a SandboxAskCallback`,
    'inherited target101 SDK user-dialog request method',
  )
  const oauthStart = currentStructured.indexOf(
    '  async requestOAuthTokenRefresh()',
  )
  const oauthEnd = currentStructured.indexOf('\n}', oauthStart)
  if (oauthStart < 0 || oauthEnd < 0) {
    throw new Error('inherited target101 SDK OAuth method anchors differ')
  }
  replaceExactly(
    structuredPath,
    `    return response.mcp_response
  }
}`,
    `    return response.mcp_response
  }

${currentStructured.slice(oauthStart, oauthEnd)}
}`,
    'inherited target101 SDK OAuth refresh method',
  )

  const printPath = path.join(tree, 'src/cli/print.ts')
  replaceExactly(
    printPath,
    `import { getAccountInformation } from 'src/utils/auth.js'`,
    `import {
  getAccountInformation,
  SDK_OAUTH_REFRESH_ENTRYPOINTS,
} from 'src/utils/auth.js'`,
    'inherited target101 SDK OAuth allowlist import',
  )
  replaceExactly(
    printPath,
    `  setSdkAgentProgressSummariesEnabled,
  setSessionSkillAllowlist,`,
    `  setSdkAgentProgressSummariesEnabled,
  setSdkOAuthTokenRefreshCallback,
  setSessionSkillAllowlist,`,
    'inherited target101 SDK OAuth callback setter import',
  )
  replaceExactly(
    printPath,
    `  const structuredIO = getStructuredIO(inputPrompt, options)

`,
    `  const structuredIO = getStructuredIO(inputPrompt, options)

  if (
    isEnvTruthy(process.env.CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH) &&
    SDK_OAUTH_REFRESH_ENTRYPOINTS.has(
      process.env.CLAUDE_CODE_ENTRYPOINT ?? '',
    )
  ) {
    setSdkOAuthTokenRefreshCallback(() =>
      structuredIO.requestOAuthTokenRefresh(),
    )
  }

`,
    'inherited target101 SDK OAuth callback installation',
  )
}

function installTarget111AppendSubagentPromptPrerequisite(tree) {
  const toolPath = path.join(tree, 'src/Tool.ts')
  replaceExactly(
    toolPath,
    `    appendSystemPrompt?: string
    /** Override querySource for analytics tracking */`,
    `    appendSystemPrompt?: string
    /** Additional system prompt appended to every Task-tool subagent */
    appendSubagentSystemPrompt?: string
    /** Override querySource for analytics tracking */`,
    'inherited target111 subagent prompt tool context',
  )

  const runAgentPath = path.join(tree, 'src/tools/AgentTool/runAgent.ts')
  replaceExactly(
    runAgentPath,
    `      )

  // Determine abortController:`,
    `      )

  const subagentSystemPrompt =
    !useExactTools &&
    isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT) &&
    toolUseContext.options.appendSubagentSystemPrompt
      ? asSystemPrompt([
          ...agentSystemPrompt,
          toolUseContext.options.appendSubagentSystemPrompt,
        ])
      : agentSystemPrompt

  // Determine abortController:`,
    'inherited target111 subagent prompt gate',
  )
  replaceExactly(
    runAgentPath,
    `    appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
    tools: allTools,`,
    `    appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
    appendSubagentSystemPrompt:
      toolUseContext.options.appendSubagentSystemPrompt,
    tools: allTools,`,
    'inherited target111 nested subagent prompt propagation',
  )
  const runAgent = fs.readFileSync(runAgentPath, 'utf8')
  const promptOccurrences = runAgent.split('systemPrompt: agentSystemPrompt').length - 1
  if (promptOccurrences !== 2) {
    throw new Error(
      `inherited target111 subagent prompt expected 2 query anchors, found ${promptOccurrences}`,
    )
  }
  fs.writeFileSync(
    runAgentPath,
    runAgent.replaceAll(
      'systemPrompt: agentSystemPrompt',
      'systemPrompt: subagentSystemPrompt',
    ),
  )

  const schemasPath = path.join(tree, 'src/entrypoints/sdk/controlSchemas.ts')
  replaceExactly(
    schemasPath,
    `      appendSystemPrompt: z.string().optional(),
      agents: z.record(z.string(), AgentDefinitionSchema()).optional(),`,
    `      appendSystemPrompt: z.string().optional(),
      appendSubagentSystemPrompt: z
        .string()
        .optional()
        .describe(
          '@internal Additional system prompt appended to every Task-tool subagent (and propagated to nested subagents). Gated by CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT.',
        ),
      agents: z.record(z.string(), AgentDefinitionSchema()).optional(),`,
    'inherited target111 subagent prompt SDK schema',
  )

  const queryPath = path.join(tree, 'src/QueryEngine.ts')
  replaceExactly(
    queryPath,
    `      customSystemPrompt,
      appendSystemPrompt,
      userSpecifiedModel,`,
    `      customSystemPrompt,
      appendSystemPrompt,
      appendSubagentSystemPrompt,
      userSpecifiedModel,`,
    'inherited target111 QueryEngine prompt destructure',
  )
  replaceExactly(
    queryPath,
    `        customSystemPrompt,
        appendSystemPrompt,
        agentDefinitions:`,
    `        customSystemPrompt,
        appendSystemPrompt,
        appendSubagentSystemPrompt,
        agentDefinitions:`,
    'inherited target111 primary tool context prompt',
  )
  replaceExactly(
    queryPath,
    `        customSystemPrompt,
        appendSystemPrompt,
        theme:`,
    `        customSystemPrompt,
        appendSystemPrompt,
        appendSubagentSystemPrompt,
        theme:`,
    'inherited target111 alternate tool context prompt',
  )
  replaceExactly(
    queryPath,
    `  customSystemPrompt,
  appendSystemPrompt,
  userSpecifiedModel,`,
    `  customSystemPrompt,
  appendSystemPrompt,
  appendSubagentSystemPrompt,
  userSpecifiedModel,`,
    'inherited target111 ask prompt destructure',
  )
  replaceExactly(
    queryPath,
    `  customSystemPrompt?: string
  appendSystemPrompt?: string
  userSpecifiedModel?: string`,
    `  customSystemPrompt?: string
  appendSystemPrompt?: string
  appendSubagentSystemPrompt?: string
  userSpecifiedModel?: string`,
    'inherited target111 ask prompt option type',
  )
  replaceExactly(
    queryPath,
    `    customSystemPrompt,
    appendSystemPrompt,
    userSpecifiedModel,`,
    `    customSystemPrompt,
    appendSystemPrompt,
    appendSubagentSystemPrompt,
    userSpecifiedModel,`,
    'inherited target111 ask config propagation',
  )

  const printPath = path.join(tree, 'src/cli/print.ts')
  replaceExactly(
    printPath,
    `    appendSystemPrompt: string | undefined
    userSpecifiedModel: string | undefined`,
    `    appendSystemPrompt: string | undefined
    appendSubagentSystemPrompt: string | undefined
    userSpecifiedModel: string | undefined`,
    'inherited target111 headless prompt option type',
  )
  replaceExactly(
    printPath,
    `    appendSystemPrompt: string | undefined
    userSpecifiedModel: string | undefined`,
    `    appendSystemPrompt: string | undefined
    appendSubagentSystemPrompt: string | undefined
    userSpecifiedModel: string | undefined`,
    'inherited target111 streaming prompt option type',
  )
  replaceExactly(
    printPath,
    `              appendSystemPrompt: options.appendSystemPrompt,
              getAppState,`,
    `              appendSystemPrompt: options.appendSystemPrompt,
              appendSubagentSystemPrompt:
                options.appendSubagentSystemPrompt,
              getAppState,`,
    'inherited target111 headless tool context prompt',
  )
  replaceExactly(
    printPath,
    `    appendSystemPrompt: string | undefined
    agent?: string | undefined`,
    `    appendSystemPrompt: string | undefined
    appendSubagentSystemPrompt: string | undefined
    agent?: string | undefined`,
    'inherited target111 initialize prompt option type',
  )
  replaceExactly(
    printPath,
    `  if (request.appendSystemPrompt !== undefined) {
    options.appendSystemPrompt = request.appendSystemPrompt
  }
  if (request.promptSuggestions !== undefined) {`,
    `  if (request.appendSystemPrompt !== undefined) {
    options.appendSystemPrompt = request.appendSystemPrompt
  }
  if (request.appendSubagentSystemPrompt !== undefined) {
    options.appendSubagentSystemPrompt = request.appendSubagentSystemPrompt
  }
  if (request.promptSuggestions !== undefined) {`,
    'inherited target111 initialize prompt assignment',
  )

  replaceExactly(
    path.join(tree, 'src/main.tsx'),
    `        systemPrompt,
        appendSystemPrompt,
        userSpecifiedModel: effectiveModel,`,
    `        systemPrompt,
        appendSystemPrompt,
        appendSubagentSystemPrompt: undefined,
        userSpecifiedModel: effectiveModel,`,
    'inherited target111 headless prompt seed',
  )
}

function installTarget113ActiveInputPrerequisite(tree) {
  const statePath = path.join(tree, 'src/bootstrap/state.ts')
  replaceExactly(
    statePath,
    `  allowedChannels: ChannelEntry[]
  // True if any entry`,
    `  allowedChannels: ChannelEntry[]
  // Active channel inputs grouped by MCP server name.
  activeInputs: Map<string, Set<string>>
  // True if any entry`,
    'inherited target113 active-input state type',
  )
  replaceExactly(
    statePath,
    `    allowedChannels: [],
    hasDevChannels: false,`,
    `    allowedChannels: [],
    activeInputs: new Map(),
    hasDevChannels: false,`,
    'inherited target113 active-input initial state',
  )
  replaceExactly(
    statePath,
    `export function setAllowedChannels(entries: ChannelEntry[]): void {
  STATE.allowedChannels = entries
}

export function getHasDevChannels`,
    `export function setAllowedChannels(entries: ChannelEntry[]): void {
  STATE.allowedChannels = entries
}

export function activateInput(serverName: string, inputId: string): void {
  let inputs = STATE.activeInputs.get(serverName)
  if (!inputs) {
    inputs = new Set()
    STATE.activeInputs.set(serverName, inputs)
  }
  inputs.add(inputId)
}

export function deactivateInput(serverName: string, inputId: string): void {
  STATE.activeInputs.get(serverName)?.delete(inputId)
}

export function clearInputsForServer(serverName: string): void {
  STATE.activeInputs.delete(serverName)
}

export function isInputActive(serverName: string, inputId: string): boolean {
  return STATE.activeInputs.get(serverName)?.has(inputId) ?? false
}

export function getActiveInputsForServer(serverName: string): Set<string> {
  return STATE.activeInputs.get(serverName) ?? new Set()
}

export function getHasDevChannels`,
    'inherited target113 active-input registry operations',
  )

  const connectionsPath = path.join(
    tree,
    'src/services/mcp/useManageMCPConnections.ts',
  )
  replaceExactly(
    connectionsPath,
    `import { getSessionId } from '../../bootstrap/state.js'`,
    `import { clearInputsForServer, getSessionId } from '../../bootstrap/state.js'`,
    'inherited target113 active-input cleanup import',
  )
  replaceExactly(
    connectionsPath,
    `              void reconnectWithBackoff()
            } else {
              updateServer({ ...client, type: 'failed' })`,
    `              void reconnectWithBackoff()
              clearInputsForServer(client.name)
            } else {
              registeredChannelServersRef.current.delete(client.name)
              clearInputsForServer(client.name)
              updateServer({ ...client, type: 'failed' })`,
    'inherited target113 terminal disconnect cleanup',
  )
  replaceExactly(
    connectionsPath,
    `          }
          if (s.type === 'connected') {`,
    `          }
          registeredChannelServersRef.current.delete(s.name)
          clearInputsForServer(s.name)
          if (s.type === 'connected') {`,
    'inherited target113 stale server cleanup',
  )
  replaceExactly(
    connectionsPath,
    `        setMcpServerEnabled(serverName, false)

        // Disabling: disconnect`,
    `        setMcpServerEnabled(serverName, false)
        registeredChannelServersRef.current.delete(serverName)
        clearInputsForServer(serverName)

        // Disabling: disconnect`,
    'inherited target113 disabled server cleanup',
  )
}

function installTarget116SdkControlMetadata(tree) {
  const typesPath = path.join(tree, 'src/types/permissions.ts')
  const currentTypes = fs.readFileSync(
    path.join(repositoryRoot, 'src/types/permissions.ts'),
    'utf8',
  )
  const typesStart = currentTypes.indexOf(
    'export const PERMISSION_DECISION_REASON_TYPES',
  )
  const typesEnd = currentTypes.indexOf(
    'export type PermissionDecisionReason',
    typesStart,
  )
  if (typesStart < 0 || typesEnd < 0) {
    throw new Error('target 2.1.116 permission reason type anchors differ')
  }
  replaceExactly(
    typesPath,
    'export type PermissionDecisionReason',
    `${currentTypes.slice(typesStart, typesEnd)}export type PermissionDecisionReason`,
    'target 2.1.116 permission reason type export',
  )

  const permissionsPath = path.join(
    tree,
    'src/utils/permissions/permissions.ts',
  )
  replaceExactly(
    permissionsPath,
    `      if (
        result.decisionReason?.type === 'safetyCheck' &&
        !result.decisionReason.classifierApprovable
      ) {`,
    `      const safetyCheck = findSafetyCheck(
        result.decisionReason,
        reason => !reason.classifierApprovable,
      )
      const sandboxOverride = result.decisionReason?.type === 'sandboxOverride'
      if (safetyCheck || sandboxOverride) {`,
    'target 2.1.116 auto-mode recursive safety gate',
  )
  replaceExactly(
    permissionsPath,
    `        return result
      }
      if (tool.requiresUserInteraction?.()`,
    `        if (safetyCheck) return result
      }
      if (tool.requiresUserInteraction?.()`,
    'target 2.1.116 sandbox-override auto fallthrough',
  )
  const oldLowerGate = `    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'safetyCheck'`
  const newLowerGate = `    toolPermissionResult?.behavior === 'ask' &&
    (findSafetyCheck(toolPermissionResult.decisionReason) ||
      toolPermissionResult.decisionReason?.type === 'sandboxOverride')`
  const permissionSource = fs.readFileSync(permissionsPath, 'utf8')
  const lowerCount = permissionSource.split(oldLowerGate).length - 1
  if (lowerCount !== 2) {
    throw new Error(
      `target 2.1.116 permission lower gate expected 2 anchors, found ${lowerCount}`,
    )
  }
  fs.writeFileSync(
    permissionsPath,
    permissionSource.replaceAll(oldLowerGate, newLowerGate),
  )
  const currentPermissions = fs.readFileSync(
    path.join(repositoryRoot, 'src/utils/permissions/permissions.ts'),
    'utf8',
  )
  const helperStart = currentPermissions.indexOf(
    'type SafetyCheckDecisionReason',
  )
  const helperEnd = currentPermissions.indexOf(
    'async function hasPermissionsToUseToolInner',
    helperStart,
  )
  if (helperStart < 0 || helperEnd < 0) {
    throw new Error('target 2.1.116 recursive safety helper anchors differ')
  }
  replaceExactly(
    permissionsPath,
    'async function hasPermissionsToUseToolInner',
    `${currentPermissions.slice(helperStart, helperEnd)}async function hasPermissionsToUseToolInner`,
    'inherited target97 recursive safety helper',
  )

  const schemasPath = path.join(tree, 'src/entrypoints/sdk/controlSchemas.ts')
  replaceExactly(
    schemasPath,
    `import { z } from 'zod/v4'
`,
    `import { z } from 'zod/v4'
import { PERMISSION_DECISION_REASON_TYPES } from '../../types/permissions.js'
`,
    'target 2.1.116 permission reason schema import',
  )
  const currentSchemas = fs.readFileSync(
    path.join(repositoryRoot, 'src/entrypoints/sdk/controlSchemas.ts'),
    'utf8',
  )
  const skillsStart = currentSchemas.indexOf('      skills: z\n')
  const skillsEnd = currentSchemas.indexOf(
    '      promptSuggestions:',
    skillsStart,
  )
  const reasonStart = currentSchemas.indexOf('      decision_reason_type:')
  const reasonEnd = currentSchemas.indexOf('      title:', reasonStart)
  const ratedStart = currentSchemas.indexOf(
    'export const SDKControlMessageRatedRequestSchema',
  )
  const ratedEnd = currentSchemas.indexOf(
    '// ============================================================================\n// Control Request/Response Wrappers',
    ratedStart,
  )
  if (
    skillsStart < 0 ||
    skillsEnd < 0 ||
    reasonStart < 0 ||
    reasonEnd < 0 ||
    ratedStart < 0 ||
    ratedEnd < 0
  ) {
    throw new Error('target 2.1.116 SDK control source anchors differ')
  }
  replaceExactly(
    schemasPath,
    `      agents: z.record(z.string(), AgentDefinitionSchema()).optional(),
      promptSuggestions:`,
    `      agents: z.record(z.string(), AgentDefinitionSchema()).optional(),
${currentSchemas.slice(skillsStart, skillsEnd)}      promptSuggestions:`,
    'target 2.1.116 SDK main-session skills schema',
  )
  replaceExactly(
    schemasPath,
    `      decision_reason: z.string().optional(),
      title:`,
    `      decision_reason: z.string().optional(),
${currentSchemas.slice(reasonStart, reasonEnd)}      title:`,
    'target 2.1.116 SDK permission decision metadata schema',
  )
  replaceExactly(
    schemasPath,
    '// ============================================================================\n// Control Request/Response Wrappers',
    `${currentSchemas.slice(ratedStart, ratedEnd)}// ============================================================================\n// Control Request/Response Wrappers`,
    'target 2.1.116 SDK message rating schemas',
  )
  replaceExactly(
    schemasPath,
    `    SDKControlUserDialogRequestSchema(),
    SDKControlOAuthTokenRefreshRequestSchema(),
`,
    `    SDKControlUserDialogRequestSchema(),
    SDKControlOAuthTokenRefreshRequestSchema(),
    SDKControlMessageRatedRequestSchema(),
`,
    'target 2.1.116 SDK message rating request union',
  )

  const structuredPath = path.join(tree, 'src/cli/structuredIO.ts')
  replaceExactly(
    structuredPath,
    `  checkRuleBasedPermissions,
  getPermissionRequestHookRuleOverride,`,
    `  checkRuleBasedPermissions,
  findSafetyCheck,
  getPermissionRequestHookRuleOverride,`,
    'target 2.1.116 recursive safety sender import',
  )
  replaceExactly(
    structuredPath,
    `        const requestId = randomUUID()
        onPermissionPrompt?.(`,
    `        const requestId = randomUUID()
        const decisionReason = mainPermissionResult.decisionReason
        const safetyCheck = findSafetyCheck(decisionReason)
        onPermissionPrompt?.(`,
    'target 2.1.116 permission decision sender locals',
  )
  replaceExactly(
    structuredPath,
    `            decision_reason: serializeDecisionReason(
              mainPermissionResult.decisionReason,
            ),
            tool_use_id:`,
    `            decision_reason: serializeDecisionReason(decisionReason),
            decision_reason_type: decisionReason?.type,
            classifier_approvable: safetyCheck
              ? !findSafetyCheck(
                  decisionReason,
                  check => !check.classifierApprovable,
                )
              : undefined,
            tool_use_id:`,
    'target 2.1.116 structured permission metadata sender',
  )

  const printPath = path.join(tree, 'src/cli/print.ts')
  const currentPrint = fs.readFileSync(
    path.join(repositoryRoot, 'src/cli/print.ts'),
    'utf8',
  )
  const ratedHandlerStart = currentPrint.indexOf(
    `        } else if (message.request.subtype === 'message_rated') {`,
  )
  const ratedHandlerEnd = currentPrint.indexOf(
    `        } else if (\n          (feature('PROACTIVE')`,
    ratedHandlerStart + 1,
  )
  if (ratedHandlerStart < 0 || ratedHandlerEnd < 0) {
    throw new Error('target 2.1.116 SDK message rating handler anchors differ')
  }
  replaceExactly(
    printPath,
    `        } else if (\n          (feature('PROACTIVE')`,
    `${currentPrint.slice(ratedHandlerStart, ratedHandlerEnd)}        } else if (\n          (feature('PROACTIVE')`,
    'target 2.1.116 SDK message rating handler',
  )
}

function installTarget113SandboxOverridePrerequisite(tree) {
  const bashPath = path.join(tree, 'src/tools/BashTool/BashTool.tsx')
  replaceExactly(
    bashPath,
    "import type { PermissionResult } from '../../utils/permissions/PermissionResult.js';",
    "import type { PermissionDecisionReason, PermissionResult } from '../../utils/permissions/PermissionResult.js';",
    'target 2.1.113 sandbox-override decision-reason import',
  )
  replaceExactly(
    bashPath,
    `type SimulatedSedEditResult = {`,
    `function isRuleBasedPermissionDecision(
  reason: PermissionDecisionReason | undefined,
): boolean {
  if (reason?.type === 'rule') return true;
  if (reason?.type === 'subcommandResults') {
    return [...reason.reasons.values()].every(result =>
      isRuleBasedPermissionDecision(result.decisionReason)
    );
  }
  return false;
}

type SimulatedSedEditResult = {`,
    'target 2.1.113 sandbox-override rule-decision helper',
  )
  replaceExactly(
    bashPath,
    `  async checkPermissions(input, context): Promise<PermissionResult> {
    return bashToolHasPermission(input, context);
  },`,
    `  async checkPermissions(input, context): Promise<PermissionResult> {
    const result = await bashToolHasPermission(input, context);
    if (
      input.dangerouslyDisableSandbox &&
      result.behavior !== 'deny' &&
      result.behavior !== 'ask' &&
      !isRuleBasedPermissionDecision(result.decisionReason) &&
      !shouldUseSandbox(input) &&
      shouldUseSandbox({ ...input, dangerouslyDisableSandbox: false })
    ) {
      return {
        behavior: 'ask',
        decisionReason: {
          type: 'sandboxOverride',
          reason: 'dangerouslyDisableSandbox',
        },
        message: 'Run outside of the sandbox',
      };
    }
    return result;
  },`,
    'target 2.1.113 sandbox-override permission producer',
  )

  const permissionsPath = path.join(
    tree,
    'src/utils/permissions/permissions.ts',
  )
  replaceExactly(
    permissionsPath,
    `      if (
        result.decisionReason?.type === 'safetyCheck' &&
        !result.decisionReason.classifierApprovable
      ) {`,
    `      if (
        findSafetyCheck(
          result.decisionReason,
          reason => !reason.classifierApprovable,
        ) || result.decisionReason?.type === 'sandboxOverride'
      ) {`,
    'target 2.1.113 sandbox-override auto-mode gate',
  )
  const oldLowerGate = `    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'safetyCheck'`
  const newLowerGate = `    toolPermissionResult?.behavior === 'ask' &&
    (findSafetyCheck(toolPermissionResult.decisionReason) ||
      toolPermissionResult.decisionReason?.type === 'sandboxOverride')`
  const permissionSource = fs.readFileSync(permissionsPath, 'utf8')
  const lowerCount = permissionSource.split(oldLowerGate).length - 1
  if (lowerCount !== 2) {
    throw new Error(
      `target 2.1.113 permission lower gate expected 2 anchors, found ${lowerCount}`,
    )
  }
  const withLowerGates = permissionSource.replaceAll(oldLowerGate, newLowerGate)
  if (withLowerGates.split(newLowerGate).length - 1 !== 2) {
    throw new Error('target 2.1.113 permission lower gate replacement differs')
  }
  fs.writeFileSync(permissionsPath, withLowerGates)
  replaceExactly(
    permissionsPath,
    'async function hasPermissionsToUseToolInner',
    `type SafetyCheckDecisionReason = Extract<
  PermissionDecisionReason,
  { type: 'safetyCheck' }
>

export function findSafetyCheck(
  reason: PermissionDecisionReason | undefined,
  predicate: (reason: SafetyCheckDecisionReason) => boolean = () => true,
): SafetyCheckDecisionReason | undefined {
  if (!reason) return undefined
  if (reason.type === 'safetyCheck') {
    return predicate(reason) ? reason : undefined
  }
  if (reason.type === 'subcommandResults') {
    for (const result of reason.reasons.values()) {
      const safetyCheck = findSafetyCheck(result.decisionReason, predicate)
      if (safetyCheck) return safetyCheck
    }
  }
  return undefined
}

async function hasPermissionsToUseToolInner`,
    'inherited target97 recursive safety helper for target113 sandbox override',
  )
}

function installTarget97BashWhitespaceNormalizationPrerequisite(tree) {
  const filename = path.join(tree, 'src/tools/BashTool/bashPermissions.ts')

  // The reconstructed target113 source commit predates the target97 Bash
  // prefix-whitespace normalization even though the published target113
  // bundle retains it. Install the complete earlier behavior before layering
  // target113's argv-aware wrapper work. In particular, keep the lexical
  // block's closing brace with its opening brace so the introduction patch is
  // independently parseable when applied to the raw target113 tree.
  replaceExactly(
    filename,
    `          case 'prefix':
            switch (matchMode) {`,
    `          case 'prefix': {
            const normalizedPrefix = bashRule.prefix.replace(/[ \\t]+/g, ' ')
            const normalizedCommand = cmdToMatch.replace(/[ \\t]+/g, ' ')
            switch (matchMode) {`,
    'inherited target97 Bash prefix normalization block',
  )
  replaceExactly(
    filename,
    '                return bashRule.prefix === cmdToMatch',
    '                return normalizedPrefix === normalizedCommand',
    'inherited target97 Bash exact whitespace normalization',
  )
  replaceExactly(
    filename,
    `                if (cmdToMatch === bashRule.prefix) {
                  return true
                }
                if (cmdToMatch.startsWith(bashRule.prefix + ' ')) {`,
    `                if (normalizedCommand === normalizedPrefix) {
                  return true
                }
                if (normalizedCommand.startsWith(normalizedPrefix + ' ')) {`,
    'inherited target97 Bash prefix whitespace normalization',
  )
  replaceExactly(
    filename,
    `                const xargsPrefix = 'xargs ' + bashRule.prefix
                if (cmdToMatch === xargsPrefix) {
                  return true
                }
                return cmdToMatch.startsWith(xargsPrefix + ' ')`,
    `                const xargsPrefix = 'xargs ' + normalizedPrefix
                if (normalizedCommand === xargsPrefix) {
                  return true
                }
                return normalizedCommand.startsWith(xargsPrefix + ' ')`,
    'inherited target97 Bash xargs whitespace normalization',
  )
  replaceExactly(
    filename,
    `            break
          case 'wildcard':`,
    `            break
          }
          case 'wildcard':`,
    'inherited target97 Bash prefix normalization block close',
  )
}

function installTarget116SimplifyNestedConditionals(tree) {
  const filename = path.join(tree, 'src/skills/bundled/simplify.ts')
  replaceExactly(
    filename,
    `6. **Unnecessary JSX nesting**: wrapper Boxes/elements that add no layout value — check if inner component props (flexShrink, alignItems, etc.) already provide the needed behavior
7. **Unnecessary comments**: comments explaining WHAT the code does (well-named identifiers already do that), narrating the change, or referencing the task/caller — delete; keep only non-obvious WHY (hidden constraints, subtle invariants, workarounds)`,
    `6. **Unnecessary JSX nesting**: wrapper Boxes/elements that add no layout value — check if inner component props (flexShrink, alignItems, etc.) already provide the needed behavior
7. **Nested conditionals**: ternary chains (\\\`a ? x : b ? y : ...\\\`), nested if/else, or nested switch 3+ levels deep — flatten with early returns, guard clauses, a lookup table, or an if/else-if cascade
8. **Unnecessary comments**: comments explaining WHAT the code does (well-named identifiers already do that), narrating the change, or referencing the task/caller — delete; keep only non-obvious WHY (hidden constraints, subtle invariants, workarounds)`,
    'target 2.1.116 simplify nested-conditionals review item',
  )
}

function installTarget105SystemDiagnosticsPrerequisite(tree) {
  replaceExactly(
    path.join(tree, 'src/components/Settings/Status.tsx'),
    'System Diagnostics',
    'System diagnostics',
    'inherited target105 system diagnostics heading',
  )
}

function installTarget105DeprecationTensePrerequisite(tree) {
  replaceExactly(
    path.join(tree, 'src/utils/model/deprecation.ts'),
    '  return `⚠ ${info.modelName} will be retired on ${info.retirementDate}. Consider switching to a newer model.`',
    `  const retirementDate = new Date(info.retirementDate)
  const retirementTense =
    !Number.isNaN(retirementDate.getTime()) && retirementDate < new Date()
      ? 'was retired on'
      : 'will be retired on'

  return \`\u26a0 \${info.modelName} \${retirementTense} \${info.retirementDate}. Consider switching to a newer model.\``,
    'inherited target105 date-sensitive model deprecation tense',
  )
}

function installTarget116FileReadMitigationEvolution(tree) {
  const filename = path.join(tree, 'src/tools/FileReadTool/FileReadTool.ts')
  replaceExactlyOrAlready(
    filename,
    "  'claude-sonnet-4',",
    "  'claude-sonnet-4-0',",
    'target 2.1.116 canonical FileRead mitigation Sonnet 4 name',
  )
  replaceExactlyOrAlready(
    filename,
    "  'claude-opus-4',",
    "  'claude-opus-4-0',",
    'target 2.1.116 canonical FileRead mitigation Opus 4 name',
  )
}

function installTarget105MemoryFactShapePrerequisite(tree) {
  const relative = 'src/memdir/findRelevantMemories.ts'
  const target94Patch = path.join(
    repositoryRoot,
    'recovery/cases/2.1.92-to-2.1.94/semantic-supplement.patch',
  )
  git(tree, [
    'apply',
    `--include=${relative}`,
    '--include=src/utils/attachments.ts',
    '--include=src/memdir/paths.ts',
    '--include=src/memdir/tinyMemoryStamps.ts',
    '--include=src/utils/backgroundHousekeeping.ts',
    '--include=src/tools/FileReadTool/FileReadTool.ts',
    target94Patch,
  ])

  // The cumulative target116 owner already contains the state fields copied
  // by later deltas, but its isolated source base lost the two target94 type/
  // value imports. Restore only those imports to avoid duplicating fields.
  replaceExactly(
    path.join(tree, 'src/Tool.ts'),
    `import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import type { ThinkingConfig } from './utils/thinking.js'`,
    `import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import type { MemorySelectorState } from './memdir/findRelevantMemories.js'
import type { ThinkingConfig } from './utils/thinking.js'`,
    'inherited target94 memory-selector Tool type import',
  )
  replaceExactly(
    path.join(tree, 'src/QueryEngine.ts'),
    `import { loadMemoryPrompt } from './memdir/memdir.js'
import { hasAutoMemPathOverride } from './memdir/paths.js'`,
    `import { loadMemoryPrompt } from './memdir/memdir.js'
import { createMemorySelectorState } from './memdir/findRelevantMemories.js'
import { hasAutoMemPathOverride } from './memdir/paths.js'`,
    'inherited target94 memory-selector QueryEngine import',
  )

  const filename = path.join(tree, relative)
  replaceExactly(
    filename,
    `const SYNTHESIZE_MEMORIES_SYSTEM_PROMPT = \`You read persistent memory files for an AI coding assistant and write short syntheses to help it answer queries. The first message lists every available memory file with its frontmatter and full body; each subsequent user message contains one query.

For each query, return a JSON object:
- one_paragraph_synthesis: a single paragraph synthesizing only the information that is directly relevant to the query
- cited_memories: array of filenames (matching the manifest exactly) for the memories you drew from

If no memories are relevant, return one_paragraph_synthesis: "No relevant memories." and cited_memories: [].

- Lead with the most directly applicable facts. Drop anything that isn't specifically useful.
- Do not invent facts. Only synthesize what is explicitly written in the memories.
- Do not pad with general principles or restate the query.
- If a prior synthesis in this conversation already covers the relevant memories for this query, return one_paragraph_synthesis: "No relevant memories." and cited_memories: [] rather than restating.
\``,
    `const SYNTHESIZE_MEMORIES_SYSTEM_PROMPT = \`You read persistent memory files for an AI coding assistant and extract facts to help the coding assistant answer queries. The first message lists every available memory file with its frontmatter and full body; each subsequent user message contains one query.

For each query, return a JSON object:
- relevant_facts: an array of facts (max 7) that would be useful for processing the query. Each fact is 1-2 sentences and stands on its own.
- cited_memories: array of filenames (matching the manifest exactly) for the memories you drew from

If no memories are relevant, return relevant_facts: [] and cited_memories: [].

A fact is useful when it lets the assistant do one of these things:
- Avoid re-asking: supply something the user would otherwise have to restate (a path, a name, a config value, a decision already made).
- Apply user preferences: surface conventions, styles, or tooling choices the assistant should follow for this query.
- Maintain continuity: surface the state of an ongoing project, goal, or prior thread that this query is continuing.
- Avoid a known pitfall: surface past corrections or mistakes so the assistant pre-empts repeating them.

Style and length:
- Each fact is 1-2 sentences. State the fact directly, then add the context needed to act on it.
- Name a path, flag, or identifier only when it is the thing the assistant must use or avoid. Drop supporting details like timestamps, byte counts, version numbers, and historical asides.
- Do not invent facts. Only extract what is explicitly written in the memories.
- Do not restate the query.
- If a prior turn in this conversation already returned the relevant facts for this query, return relevant_facts: [] and cited_memories: [] rather than restating.
\``,
    'inherited target105 relevant-facts synthesis prompt',
  )
  replaceExactly(
    filename,
    '  const prompt = `Synthesize memory information relevant to:\\n${query}`',
    '  const prompt = `Extract facts relevant to:\\n${query}`',
    'inherited target105 relevant-facts synthesis query',
  )
  replaceExactly(
    filename,
    `            one_paragraph_synthesis: { type: 'string' },
            cited_memories: { type: 'array', items: { type: 'string' } },
          },
          required: ['one_paragraph_synthesis', 'cited_memories'],`,
    `            relevant_facts: { type: 'array', items: { type: 'string' } },
            cited_memories: { type: 'array', items: { type: 'string' } },
          },
          required: ['relevant_facts', 'cited_memories'],`,
    'inherited target105 relevant-facts synthesis schema',
  )
  replaceExactly(
    filename,
    `    const parsed: {
      one_paragraph_synthesis: string
      cited_memories: string[]
    } = jsonParse(textBlock.text)`,
    `    const parsed: { relevant_facts: string[]; cited_memories: string[] } =
      jsonParse(textBlock.text)`,
    'inherited target105 relevant-facts response type',
  )
  replaceExactly(
    filename,
    `    const synthesis = parsed.one_paragraph_synthesis.trim()
    if (!synthesis || /^no relevant memor/i.test(synthesis)) return null
    return {
      synthesis,
      citedMemories: parsed.cited_memories.filter(filename =>
        conversation.byFilename.has(filename),
      ),
    }`,
    `    const facts = parsed.relevant_facts
      .map(fact => fact.trim())
      .filter(fact => fact.length > 0)
      .slice(0, 7)
    if (facts.length === 0) return null
    return {
      synthesis: facts.map(fact => \`- \${fact}\`).join('\\n'),
      citedMemories: parsed.cited_memories.filter(filename =>
        conversation.byFilename.has(filename),
      ),
    }`,
    'inherited target105 relevant-facts result shape',
  )
  replaceExactly(
    filename,
    '- Do not invent facts. Only extract what is explicitly written in the memories.',
    '- Do not answer or solve the query yourself. You are a retrieval step, not the assistant: every fact must be lifted from a memory file body, not derived from general knowledge or your own reasoning about the query. If no memory covers it, return relevant_facts: [].',
    'inherited target111 retrieval-only synthesis constraint',
  )
}

function installTarget97AdditionalModelCostsPrerequisite(tree) {
  const configPath = path.join(tree, 'src/utils/config.ts')
  replaceExactly(
    configPath,
    `import type { ImageDimensions } from './imageResizer.js'
import type { ModelOption } from './model/modelOptions.js'`,
    `import type { ImageDimensions } from './imageResizer.js'
import type { ModelCosts } from './modelCost.js'
import type { ModelOption } from './model/modelOptions.js'`,
    'inherited target97 additional model-cost config import',
  )
  replaceExactly(
    configPath,
    `  // Additional model options for the model picker (fetched during bootstrap).
  additionalModelOptionsCache?: ModelOption[]`,
    `  // Additional model options for the model picker (fetched during bootstrap).
  additionalModelOptionsCache?: ModelOption[]

  // Additional model pricing returned by bootstrap for models not in the
  // bundled pricing table.
  additionalModelCostsCache?: Record<string, ModelCosts>`,
    'inherited target97 additional model-cost config field',
  )

  const bootstrapPath = path.join(tree, 'src/services/api/bootstrap.ts')
  replaceExactly(
    bootstrapPath,
    `      )
      .nullish(),
  }),`,
    `      )
      .nullish(),
    additional_model_costs: z
      .record(
        z
          .object({
            input_tokens: z.number(),
            output_tokens: z.number(),
            prompt_cache_write_tokens: z.number(),
            prompt_cache_read_tokens: z.number(),
            web_search_requests: z.number().nullish(),
          })
          .transform(value => ({
            inputTokens: value.input_tokens,
            outputTokens: value.output_tokens,
            promptCacheWriteTokens: value.prompt_cache_write_tokens,
            promptCacheReadTokens: value.prompt_cache_read_tokens,
            webSearchRequests: value.web_search_requests ?? 0.01,
          })),
      )
      .nullish(),
  }),`,
    'inherited target97 additional model-cost bootstrap schema',
  )
  replaceExactly(
    bootstrapPath,
    `    const additionalModelOptions = response.additional_model_options ?? []`,
    `    const additionalModelOptions = response.additional_model_options ?? []
    const additionalModelCosts = response.additional_model_costs ?? {}`,
    'inherited target97 additional model-cost response',
  )
  replaceExactly(
    bootstrapPath,
    `      isEqual(config.clientDataCache, clientData) &&
      isEqual(config.additionalModelOptionsCache, additionalModelOptions)`,
    `      isEqual(config.clientDataCache, clientData) &&
      isEqual(config.additionalModelOptionsCache, additionalModelOptions) &&
      isEqual(config.additionalModelCostsCache, additionalModelCosts)`,
    'inherited target97 additional model-cost equality',
  )
  replaceExactly(
    bootstrapPath,
    `      clientDataCache: clientData,
      additionalModelOptionsCache: additionalModelOptions,`,
    `      clientDataCache: clientData,
      additionalModelOptionsCache: additionalModelOptions,
      additionalModelCostsCache: additionalModelCosts,`,
    'inherited target97 additional model-cost persistence',
  )

  const modelCostPath = path.join(tree, 'src/utils/modelCost.ts')
  replaceExactly(
    modelCostPath,
    `import { setHasUnknownModelCost } from '../bootstrap/state.js'
import { isFastModeEnabled } from './fastMode.js'`,
    `import { setHasUnknownModelCost } from '../bootstrap/state.js'
import { getGlobalConfig } from './config.js'
import { isFastModeEnabled } from './fastMode.js'`,
    'inherited target97 additional model-cost lookup import',
  )
  replaceExactly(
    modelCostPath,
    `  const costs = MODEL_COSTS[shortName]
  if (!costs) {
    trackUnknownModelCost(model, shortName)
    return (
      MODEL_COSTS[getCanonicalName(getDefaultMainLoopModelSetting())] ??
      DEFAULT_UNKNOWN_MODEL_COST
    )
  }
  return costs`,
    `  const costs = MODEL_COSTS[shortName]
  if (costs) return costs

  const additionalCosts = getGlobalConfig().additionalModelCostsCache
  const configuredCosts = additionalCosts?.[model] ?? additionalCosts?.[shortName]
  if (configuredCosts) return configuredCosts

  trackUnknownModelCost(model, shortName)
  return (
    MODEL_COSTS[getCanonicalName(getDefaultMainLoopModelSetting())] ??
    DEFAULT_UNKNOWN_MODEL_COST
  )`,
    'inherited target97 additional model-cost fallback',
  )
}

/**
 * Replay persistent runtime graphs first introduced by target97 into the
 * isolated target116 materialization. These are ancestry prerequisites, not
 * target116-owned deltas. Keep every operation narrow because the affected
 * owners also contain substantial target98-target116 evolution.
 */
function installTarget97PersistentRuntimePrerequisites(tree) {
  installTarget97LoopChainPrerequisite(tree)
  installTarget97SessionWriterPrerequisite(tree)
  installTarget97McpResultSizePrerequisite(tree)
  installTarget97NotificationAndDenialsPrerequisite(tree)
  installTarget97AgentToolPoolPrerequisite(tree)
  installTarget97ViewModePrerequisite(tree)
  installTarget97SandboxMachLookupPrerequisite(tree)
  installTarget97AutoDreamFirstEnablePrerequisite(tree)
  installTarget97ReplBridgeAliasesPrerequisite(tree)
  installTarget97BridgeGitSessionContextPrerequisite(tree)
}

function installTarget97LoopChainPrerequisite(tree) {
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/bootstrap/state.ts'],
    /LoopChainState|loopChainStartedAt/,
    'inherited-target97-loop-chain-state',
  )
  // loopWakeup.ts is a later readable extraction of the target97 registry
  // consumer retained by target116. The owner does not exist in the isolated
  // source commit, so install the complete current implementation.
  writeCurrentSource('src/utils/loopWakeup.ts', tree)
}

function installTarget97SessionWriterPrerequisite(tree) {
  const storagePath = path.join(tree, 'src/utils/sessionStorage.ts')
  replaceExactlyOrAlready(
    storagePath,
    `export function isChainParticipant(m: Pick<Message, 'type'>): boolean {
  return m.type !== 'progress'
}

`,
    `export function isChainParticipant(m: Pick<Message, 'type'>): boolean {
  return m.type !== 'progress'
}

/**
 * Return the transcript cursor that is safe to persist.
 *
 * While a response is streaming, its assistant message is added before the
 * final message_delta fills in stop_reason. Keep that open message (and any
 * later entries) behind the cursor until the response is complete. Terminal
 * paths can disable the guard to force the remaining entries through.
 */
export function transcriptCursorEnd(
  messages: Message[],
  startIndex: number,
  stopAtIncompleteAssistant: boolean,
): number {
  if (!stopAtIncompleteAssistant) return messages.length

  for (let index = startIndex; index < messages.length; index++) {
    const message = messages[index]!
    if (
      message.type === 'assistant' &&
      message.message.stop_reason === null
    ) {
      return index
    }
  }

  return messages.length
}

`,
    'inherited target97 transcript cursor barrier',
  )
  replaceExactlyOrAlready(
    storagePath,
    `const REMOTE_FLUSH_INTERVAL_MS = 10
`,
    `/** Track a write performed outside Project's normal transcript queue. */
export function trackSessionWrite<T>(fn: () => Promise<T>): Promise<T> {
  return getProject().trackExternalWrite(fn)
}

const REMOTE_FLUSH_INTERVAL_MS = 10
`,
    'inherited target97 tracked session-write export with additive mirrors',
  )
  replaceExactlyOrAlready(
    storagePath,
    `  private async trackWrite<T>(fn: () => Promise<T>): Promise<T> {
    this.incrementPendingWrites()
    try {
      return await fn()
    } finally {
      this.decrementPendingWrites()
    }
  }

  private enqueueWrite(filePath: string, entry: Entry): Promise<void> {
`,
    `  private async trackWrite<T>(fn: () => Promise<T>): Promise<T> {
    this.incrementPendingWrites()
    try {
      return await fn()
    } finally {
      this.decrementPendingWrites()
    }
  }

  trackExternalWrite<T>(fn: () => Promise<T>): Promise<T> {
    return this.trackWrite(fn)
  }

  private enqueueWrite(filePath: string, entry: Entry): Promise<void> {
`,
    'inherited target97 external-write adapter',
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/services/PromptSuggestion/speculation.ts'],
    /trackSessionWrite|fireSessionMirror/,
    'inherited-target97-session-writer-speculation',
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/hooks/useLogMessages.ts'],
    /transcriptCursorEnd|isLoading|lastSeenLengthRef|scanStart|endIndex/,
    'inherited-target97-session-writer-log-hook',
  )

  const replPath = path.join(tree, 'src/screens/REPL.tsx')
  replaceExactlyOrAlready(
    replPath,
    '  useLogMessages(messages, messages.length === initialMessages?.length);',
    '  useLogMessages(messages, messages.length === initialMessages?.length, isLoading);',
    'inherited target97 REPL transcript loading state',
  )

  const queryPath = path.join(tree, 'src/QueryEngine.ts')
  replaceExactlyOrAlready(
    queryPath,
    `  recordTranscript,
`,
    `  recordTranscript,
  transcriptCursorEnd,
`,
    'inherited target97 QueryEngine cursor import',
  )
  replaceExactlyOrAlready(
    queryPath,
    `    const messages = [...this.mutableMessages]
    let transcriptCursor = 0
    let lastRecordedUuid: UUID | undefined
    const recordNewMessages = (): Promise<UUID | null> => {
      const start = transcriptCursor
      if (start >= messages.length) return Promise.resolve(null)

      const newMessages = start === 0 ? messages : messages.slice(start)
      transcriptCursor = messages.length
      const startingParentUuid = lastRecordedUuid
`,
    `    const messages = [...this.mutableMessages]
    let transcriptCursor = 0
    let lastRecordedUuid: UUID | undefined
    const initialTranscriptLength = messages.length
    const recordNewMessages = (
      forceIncompleteAssistant: boolean = false,
    ): Promise<UUID | null> => {
      const start = transcriptCursor
      const end = transcriptCursorEnd(
        messages,
        Math.max(start, initialTranscriptLength),
        !forceIncompleteAssistant,
      )
      if (start >= end) return Promise.resolve(null)

      const newMessages =
        start === 0 && end === messages.length
          ? messages
          : messages.slice(start, end)
      transcriptCursor = end
      const startingParentUuid = lastRecordedUuid
`,
    'inherited target97 QueryEngine guarded transcript cursor',
  )
  replaceExactlyOrAlready(
    queryPath,
    `            if (message.event.delta.stop_reason != null) {
              lastStopReason = message.event.delta.stop_reason
            }
          }
          if (message.event.type === 'message_stop') {`,
    `            if (message.event.delta.stop_reason != null) {
              lastStopReason = message.event.delta.stop_reason
            }
            if (persistSession) void recordNewMessages()
          }
          if (message.event.type === 'message_stop') {`,
    'inherited target97 message-delta transcript retry',
  )
  replaceExactlyOrAlready(
    queryPath,
    `          else if (message.attachment.type === 'max_turns_reached') {
            if (persistSession) {
              if (`,
    `          else if (message.attachment.type === 'max_turns_reached') {
            if (persistSession) {
              await recordNewMessages(true)
              if (`,
    'inherited target97 max-turn transcript drain',
  )
  replaceExactlyOrAlready(
    queryPath,
    `      if (maxBudgetUsd !== undefined && getTotalCost() >= maxBudgetUsd) {
        if (persistSession) {
          if (`,
    `      if (maxBudgetUsd !== undefined && getTotalCost() >= maxBudgetUsd) {
        if (persistSession) {
          await recordNewMessages(true)
          if (`,
    'inherited target97 max-budget transcript drain',
  )
  replaceExactlyOrAlready(
    queryPath,
    `        if (callsThisQuery >= maxRetries) {
          if (persistSession) {
            if (`,
    `        if (callsThisQuery >= maxRetries) {
          if (persistSession) {
            await recordNewMessages(true)
            if (`,
    'inherited target97 structured-output transcript drain',
  )
  replaceExactly(
    queryPath,
    `    // result message, so any unflushed writes would be lost.
    if (persistSession) {
      if (`,
    `    // result message, so any unflushed writes would be lost.
    if (persistSession) {
      await recordNewMessages(true)
      if (`,
    'inherited target97 final transcript drain',
  )
}

function installTarget97McpResultSizePrerequisite(tree) {
  // Target110 adds model-specific image limits to these same call signatures.
  // Select both graphs together so the target97 annotation bypass lands in the
  // exact cumulative target116 argument order instead of regressing the later
  // image-validation contract.
  writeCurrentSource('src/utils/imageLimits.ts', tree)
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/services/mcp/client.ts'],
    /hasResultSizeAnnotation|imageLimits|ImageLimits|getCurrentImageLimits|getImageLimits/,
    'inherited-target97-mcp-result-size-with-later-image-limits',
  )
}

function installTarget97NotificationAndDenialsPrerequisite(tree) {
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/context/notifications.tsx'],
    /NotificationLifecycle|NotificationProvider|mountCount|providerLifecycle|currentTimeoutId/,
    'inherited-target97-notification-lifecycle',
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/utils/autoModeDenials.ts'],
    /AutoModeDenialsApi|AutoModeDenialsProvider|useAutoModeDenials|getDenials|recordDenial/,
    'inherited-target97-auto-mode-denial-provider',
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    [
      'src/components/permissions/rules/RecentDenialsTab.tsx',
      'src/components/permissions/rules/PermissionRuleList.tsx',
      'src/hooks/useCanUseTool.tsx',
    ],
    /useAutoModeDenials|getDenials|recordDenial/,
    'inherited-target97-auto-mode-denial-consumers',
  )

  const appPath = path.join(tree, 'src/components/App.tsx')
  if (
    !fs
      .readFileSync(appPath, 'utf8')
      .includes("import { NotificationProvider } from '../context/notifications.js';")
  ) {
    replaceExactly(
      appPath,
      `import { FpsMetricsProvider } from '../context/fpsMetrics.js';`,
      `import { FpsMetricsProvider } from '../context/fpsMetrics.js';
import { NotificationProvider } from '../context/notifications.js';`,
      'inherited target97 notification provider App import',
    )
  }
  replaceExactlyOrAlready(
    appPath,
    `import { onChangeAppState } from '../state/onChangeAppState.js';
import type { FpsMetrics } from '../utils/fpsTracker.js';`,
    `import { onChangeAppState } from '../state/onChangeAppState.js';
import { AutoModeDenialsProvider } from '../utils/autoModeDenials.js';
import type { FpsMetrics } from '../utils/fpsTracker.js';`,
    'inherited target97 auto-mode denial provider App import',
  )
  replaceExactlyOrAlready(
    appPath,
    '<AppStateProvider initialState={initialState} onChangeAppState={onChangeAppState}>',
    '<AppStateProvider initialState={initialState} onChangeAppState={onChangeAppState}><NotificationProvider><AutoModeDenialsProvider>',
    'inherited target97 provider reachability opening',
  )
  replaceExactlyOrAlready(
    appPath,
    '</AppStateProvider>',
    '</AutoModeDenialsProvider></NotificationProvider></AppStateProvider>',
    'inherited target97 provider reachability closing',
  )
}

function installTarget97AgentToolPoolPrerequisite(tree) {
  applyMatchingWorkingTreePatchDirect(
    tree,
    [
      'src/tools.ts',
      'src/tools/AgentTool/AgentTool.tsx',
      'src/tools/AgentTool/resumeAgent.ts',
    ],
    /skipReplFilter|ToolPoolOptions/,
    'inherited-target97-agent-repl-tool-pool',
  )
}

function installTarget97ViewModePrerequisite(tree) {
  const filename = path.join(tree, 'src/utils/settings/types.ts')
  replaceExactlyOrAlready(
    filename,
    `      outputStyle: z
        .string()
        .optional()
        .describe('Controls the output style for assistant responses'),
      language: z`,
    `      outputStyle: z
        .string()
        .optional()
        .describe('Controls the output style for assistant responses'),
      viewMode: z
        .enum(['default', 'verbose', 'focus'])
        .optional()
        .catch(undefined)
        .describe('Default transcript view mode on startup'),
      language: z`,
    'inherited target97 settings view mode',
  )
}

function installTarget97SandboxMachLookupPrerequisite(tree) {
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/entrypoints/sandboxTypes.ts', 'src/utils/sandbox/sandbox-adapter.ts'],
    /allowMachLookup|getAllowMachLookup/,
    'inherited-target97-sandbox-mach-lookup',
  )
}

function installTarget97AutoDreamFirstEnablePrerequisite(tree) {
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/components/memory/MemoryFileSelector.tsx'],
    /getInitialSettings|isFirstEnable|is_first_enable/,
    'inherited-target97-auto-dream-first-enable',
  )
}

function installTarget97ReplBridgeAliasesPrerequisite(tree) {
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/bridge/envLessBridgeConfig.ts'],
    /DEFAULT_REPL_BRIDGE_CONFIG|checkReplBridgeMinVersion|getReplBridgeConfig/,
    'inherited-target97-repl-bridge-config-aliases',
  )
}

function installTarget97BridgeGitSessionContextPrerequisite(tree) {
  writeCurrentSource('src/bridge/gitSessionContext.ts', tree)
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/bridge/createSession.ts'],
    /buildGitSessionContext|getOriginalCwd|reuse_outcome_branches/,
    'inherited-target97-bridge-git-session-context',
  )
}

function installTarget113SandboxOverrideProducerPrerequisite(tree) {
  const bashPath = path.join(tree, 'src/tools/BashTool/BashTool.tsx')
  replaceExactly(
    bashPath,
    "import type { PermissionResult } from '../../utils/permissions/PermissionResult.js';",
    "import type { PermissionDecisionReason, PermissionResult } from '../../utils/permissions/PermissionResult.js';",
    'inherited target113 sandbox-override decision-reason import',
  )
  replaceExactly(
    bashPath,
    `type SimulatedSedEditResult = {`,
    `function isRuleBasedPermissionDecision(
  reason: PermissionDecisionReason | undefined,
): boolean {
  if (reason?.type === 'rule') return true;
  if (reason?.type === 'subcommandResults') {
    return [...reason.reasons.values()].every(result =>
      isRuleBasedPermissionDecision(result.decisionReason)
    );
  }
  return false;
}

type SimulatedSedEditResult = {`,
    'inherited target113 sandbox-override rule-decision helper',
  )
  replaceExactly(
    bashPath,
    `  async checkPermissions(input, context): Promise<PermissionResult> {
    return bashToolHasPermission(input, context);
  },`,
    `  async checkPermissions(input, context): Promise<PermissionResult> {
    const result = await bashToolHasPermission(input, context);
    if (
      input.dangerouslyDisableSandbox &&
      result.behavior !== 'deny' &&
      result.behavior !== 'ask' &&
      !isRuleBasedPermissionDecision(result.decisionReason) &&
      !shouldUseSandbox(input) &&
      shouldUseSandbox({ ...input, dangerouslyDisableSandbox: false })
    ) {
      return {
        behavior: 'ask',
        decisionReason: {
          type: 'sandboxOverride',
          reason: 'dangerouslyDisableSandbox',
        },
        message: 'Run outside of the sandbox',
      };
    }
    return result;
  },`,
    'inherited target113 sandbox-override permission producer',
  )
}

function installTarget97DynamicSystemPromptPrerequisite(tree) {
  // This graph first appears in target97 and remains live through target116.
  // Replay only focused current hunks. Several owners have substantial later
  // evolution, so exact replacements below handle the two shared hot paths.
  applyMatchingWorkingTreePatch(
    tree,
    ['src/constants/prompts.ts'],
    /excludeDynamicSections|getExcludedDynamicSectionsContent/,
    'inherited-target97-dynamic-prompts',
  )
  // analyzeContext was introduced at target97 and evolved at target101 with
  // the residual token bucket retained by both target114 and target116. Use
  // the exact cumulative owner so the two inherited transforms do not leave
  // duplicated pre-target101 accounting blocks.
  writeCurrentSource('src/utils/analyzeContext.ts', tree)
  applyMatchingWorkingTreePatch(
    tree,
    ['src/commands/context/context-noninteractive.ts'],
    /excludeDynamicSections/,
    'inherited-target97-dynamic-context-command',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/context.ts'],
    /cacheBreakerPhrase/,
    'inherited-target97-dynamic-system-context',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/commands/clear/conversation.ts'],
    /cacheBreakerPhrase/,
    'inherited-target97-dynamic-clear-state',
  )

  const queryContextPath = path.join(tree, 'src/utils/queryContext.ts')
  replaceExactly(
    queryContextPath,
    `import { getSystemPrompt } from '../constants/prompts.js'`,
    `import {
  getExcludedDynamicSectionsContent,
  getSystemPrompt,
} from '../constants/prompts.js'`,
    'inherited target97 dynamic query-context import',
  )
  replaceExactly(
    queryContextPath,
    `  const [defaultSystemPrompt, userContext, systemContext] = await Promise.all([
    customSystemPrompt !== undefined
      ? Promise.resolve([])
      : getSystemPrompt(
          tools,
          mainLoopModel,
          additionalWorkingDirectories,
          mcpClients,
        ),
    getUserContext(),
    customSystemPrompt !== undefined ? Promise.resolve({}) : getSystemContext(),
  ])
  return { defaultSystemPrompt, userContext, systemContext }`,
    `  const [defaultSystemPrompt, userContext, systemContext, dynamicContext] =
    await Promise.all([
      customSystemPrompt !== undefined
        ? Promise.resolve([])
        : getSystemPrompt(
            tools,
            mainLoopModel,
            additionalWorkingDirectories,
            mcpClients,
            { excludeDynamicSections },
          ),
      getUserContext(),
      customSystemPrompt !== undefined
        ? Promise.resolve({})
        : getSystemContext(cacheBreakerPhrase),
      excludeDynamicSections && customSystemPrompt === undefined
        ? getExcludedDynamicSectionsContent(
            mainLoopModel,
            additionalWorkingDirectories,
          )
        : Promise.resolve({}),
    ])

  if (excludeDynamicSections) {
    return {
      defaultSystemPrompt,
      userContext: {
        ...systemContext,
        ...userContext,
        ...dynamicContext,
      },
      systemContext: {},
    }
  }
  return { defaultSystemPrompt, userContext, systemContext }`,
    'inherited target97 dynamic query-context merge',
  )

  const schemaPath = path.join(tree, 'src/entrypoints/sdk/controlSchemas.ts')
  replaceExactly(
    schemaPath,
    `      appendSubagentSystemPrompt: z
        .string()
        .optional()
        .describe(
          '@internal Additional system prompt appended to every Task-tool subagent (and propagated to nested subagents). Gated by CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT.',
        ),
      agents:`,
    `      appendSubagentSystemPrompt: z
        .string()
        .optional()
        .describe(
          '@internal Additional system prompt appended to every Task-tool subagent (and propagated to nested subagents). Gated by CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT.',
        ),
      excludeDynamicSections: z
        .boolean()
        .optional()
        .describe(
          'When true, omit per-user dynamic sections (working directory, auto-memory path) from the cached system prompt and re-inject them as the first user message. Lets cross-user prompt caching hit on a static system prompt prefix. Tradeoff: the model sees this context slightly later in the prompt, so steering on the working directory and memory location is marginally less authoritative. Has no effect when a custom (non-preset) system prompt is in use.',
        ),
      agents:`,
    'inherited target97 dynamic SDK initialize schema',
  )
  replaceExactly(
    schemaPath,
    `          userMessageTokens: z.number(),
          toolCallsByType:`,
    `          userMessageTokens: z.number(),
          redirectedContextTokens: z.number(),
          unattributedTokens: z.number(),
          toolCallsByType:`,
    'inherited target97/101 redirected and unattributed usage schema',
  )

  const toolPath = path.join(tree, 'src/Tool.ts')
  replaceExactly(
    toolPath,
    `    appendSubagentSystemPrompt?: string
    /** Override querySource for analytics tracking */`,
    `    appendSubagentSystemPrompt?: string
    /** Redirect per-user prompt sections into the first user message. */
    excludeDynamicSections?: boolean
    /** Override querySource for analytics tracking */`,
    'inherited target97 dynamic ToolUseContext option',
  )

  const queryEnginePath = path.join(tree, 'src/QueryEngine.ts')
  replaceExactly(
    queryEnginePath,
    `      appendSystemPrompt,
      appendSubagentSystemPrompt,
      userSpecifiedModel,`,
    `      appendSystemPrompt,
      appendSubagentSystemPrompt,
      excludeDynamicSections,
      userSpecifiedModel,`,
    'inherited target97 dynamic QueryEngine config destructure',
  )
  replaceExactly(
    queryEnginePath,
    `      mcpClients,
      customSystemPrompt: customPrompt,
    })`,
    `      mcpClients,
      customSystemPrompt: customPrompt,
      excludeDynamicSections,
      cacheBreakerPhrase: initialAppState.cacheBreakerPhrase,
    })`,
    'inherited target97 dynamic QueryEngine prompt fetch',
  )
  replaceExactly(
    queryEnginePath,
    `        appendSubagentSystemPrompt,
        agentDefinitions:`,
    `        appendSubagentSystemPrompt,
        excludeDynamicSections,
        agentDefinitions:`,
    'inherited target97 dynamic QueryEngine tool context',
  )
  replaceExactly(
    queryEnginePath,
    `  appendSystemPrompt,
  appendSubagentSystemPrompt,
  userSpecifiedModel,`,
    `  appendSystemPrompt,
  appendSubagentSystemPrompt,
  excludeDynamicSections,
  userSpecifiedModel,`,
    'inherited target97 dynamic ask argument destructure',
  )
  replaceExactly(
    queryEnginePath,
    `  appendSystemPrompt?: string
  appendSubagentSystemPrompt?: string
  userSpecifiedModel?: string`,
    `  appendSystemPrompt?: string
  appendSubagentSystemPrompt?: string
  excludeDynamicSections?: boolean
  userSpecifiedModel?: string`,
    'inherited target97 dynamic ask option type',
  )
  replaceExactly(
    queryEnginePath,
    `    appendSystemPrompt,
    appendSubagentSystemPrompt,
    userSpecifiedModel,`,
    `    appendSystemPrompt,
    appendSubagentSystemPrompt,
    excludeDynamicSections,
    userSpecifiedModel,`,
    'inherited target97 dynamic ask QueryEngine config',
  )

  const printPath = path.join(tree, 'src/cli/print.ts')
  const printOptionsNeedle = `    appendSubagentSystemPrompt: string | undefined
    userSpecifiedModel:`
  const printBeforeTypes = fs.readFileSync(printPath, 'utf8')
  const printOptionsFirst = printBeforeTypes.indexOf(printOptionsNeedle)
  const printOptionsSecond = printBeforeTypes.indexOf(
    printOptionsNeedle,
    printOptionsFirst + 1,
  )
  if (printOptionsFirst < 0 || printOptionsSecond < 0) {
    throw new Error('inherited target97 headless option type anchors differ')
  }
  let printWithHeadlessType =
    printBeforeTypes.slice(0, printOptionsSecond) +
    printBeforeTypes
      .slice(printOptionsSecond)
      .replace(
        printOptionsNeedle,
        `    appendSubagentSystemPrompt: string | undefined
    excludeDynamicSections?: boolean | undefined
    userSpecifiedModel:`,
      )
  printWithHeadlessType =
    printWithHeadlessType.slice(0, printOptionsFirst) +
    printWithHeadlessType
      .slice(printOptionsFirst)
      .replace(
        printOptionsNeedle,
        `    appendSubagentSystemPrompt: string | undefined
    excludeDynamicSections: boolean | undefined
    userSpecifiedModel:`,
      )
  fs.writeFileSync(
    printPath,
    printWithHeadlessType,
  )
  replaceExactly(
    printPath,
    `              appendSubagentSystemPrompt:
                options.appendSubagentSystemPrompt,
              getAppState,`,
    `              appendSubagentSystemPrompt:
                options.appendSubagentSystemPrompt,
              excludeDynamicSections: options.excludeDynamicSections,
              getAppState,`,
    'inherited target97 dynamic QueryEngine option from print',
  )
  replaceExactly(
    printPath,
    `                customSystemPrompt: options.systemPrompt,
                appendSystemPrompt: options.appendSystemPrompt,
              },`,
    `                customSystemPrompt: options.systemPrompt,
                appendSystemPrompt: options.appendSystemPrompt,
                excludeDynamicSections: options.excludeDynamicSections,
              },`,
    'inherited target97 dynamic context-usage option from print',
  )
  replaceExactly(
    printPath,
    `                    customSystemPrompt: options.systemPrompt,
                    appendSystemPrompt: options.appendSystemPrompt,
                    thinkingConfig:`,
    `                    customSystemPrompt: options.systemPrompt,
                    appendSystemPrompt: options.appendSystemPrompt,
                    excludeDynamicSections: options.excludeDynamicSections,
                    thinkingConfig:`,
    'inherited target97 dynamic side-question option from print',
  )
  replaceExactly(
    printPath,
    `  if (request.appendSubagentSystemPrompt !== undefined) {
    options.appendSubagentSystemPrompt = request.appendSubagentSystemPrompt
  }
  if (request.promptSuggestions !== undefined) {`,
    `  if (request.appendSubagentSystemPrompt !== undefined) {
    options.appendSubagentSystemPrompt = request.appendSubagentSystemPrompt
  }
  if (request.excludeDynamicSections !== undefined) {
    options.excludeDynamicSections = request.excludeDynamicSections
  }
  if (request.promptSuggestions !== undefined) {`,
    'inherited target97 dynamic SDK initialize handler',
  )

  // Target97's CLI surface intentionally kept the option internal at that
  // boundary; target116 exposes it publicly and forwards the parsed value.
  const mainPath = path.join(tree, 'src/main.tsx')
  replaceExactly(
    mainPath,
    `  // @[MODEL LAUNCH]: Update the example model ID in the --model help text.\n`,
    `  .option('--exclude-dynamic-system-prompt-sections', 'Move per-machine sections (cwd, env info, memory paths, git status) from the system prompt into the first user message. Improves cross-user prompt-cache reuse. Only applies with the default system prompt (ignored with --system-prompt).').default(false)\n  // @[MODEL LAUNCH]: Update the example model ID in the --model help text.\n`,
    'persistent target97 dynamic-system-prompt CLI option',
  )
  replaceExactly(
    mainPath,
    `        appendSubagentSystemPrompt: undefined,\n        userSpecifiedModel: effectiveModel,`,
    `        appendSubagentSystemPrompt: undefined,\n        excludeDynamicSections: options.excludeDynamicSystemPromptSections || undefined,\n        userSpecifiedModel: effectiveModel,`,
    'persistent target97 dynamic-system-prompt headless option',
  )
}

function replaceBetween(filename, startMarker, endMarker, replacement, label) {
  const value = fs.readFileSync(filename, 'utf8')
  const start = value.indexOf(startMarker)
  const end = value.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error(`${label} anchors differ`)
  fs.writeFileSync(
    filename,
    value.slice(0, start) + replacement + value.slice(end + endMarker.length),
  )
}

function writeCase(caseName, chunks) {
  if (selectedCase && selectedCase !== caseName) return
  const filename = path.join(
    repositoryRoot,
    'recovery',
    'cases',
    caseName,
    'semantic-supplement.patch',
  )
  const value = Buffer.concat(chunks)
  fs.writeFileSync(filename, value)
  process.stdout.write(`${caseName} ${value.length}\n`)
}

const target108 = '/tmp/tmp.0e13u9sKHT'
const target113 = '/tmp/late113-rebuild.ZmjIO4'
const patchArgs = ['--no-ext-diff', '--binary', '-U1']
// The case107 patch stack lives in an auxiliary archaeology repository. Do
// not require that scratch repository when deterministically regenerating a
// different selected case.
const case107Combined =
  !selectedCase || selectedCase === '2.1.107-to-2.1.108'
    ? Buffer.concat([
        gitPatch(target108, ['diff', ...patchArgs, 'fb7db52', 'f950ba4']),
        gitPatch(target108, ['show', '--format=', ...patchArgs, 'eaadf02']),
        gitPatch(target108, ['show', '--format=', ...patchArgs, 'f3ce39f']),
        gitPatch(target108, ['show', '--format=', ...patchArgs, '69ab684']),
      ])
    : Buffer.alloc(0)

function installTarget113RetainedRuntimeGaps(tree) {
  // Target113 records stale interactive peer files exactly once per process.
  // Keep the later target116 peerProtocol field out of this introduction.
  const concurrentPath = path.join(tree, 'src/utils/concurrentSessions.ts')
  replaceExactly(
    concurrentPath,
    "import { join } from 'path'\n",
    "import { join } from 'path'\nimport { z } from 'zod/v4'\n",
    'target113 unclean-session zod import',
  )
  replaceExactly(
    concurrentPath,
    "} from '../bootstrap/state.js'\n",
    "} from '../bootstrap/state.js'\nimport { logEvent } from '../services/analytics/index.js'\n",
    'target113 unclean-session analytics import',
  )
  replaceExactly(
    concurrentPath,
    "import { getAgentId } from './teammate.js'\n",
    "import { getAgentId } from './teammate.js'\nimport { lazySchema } from './lazySchema.js'\n",
    'target113 unclean-session lazy schema import',
  )
  replaceExactly(
    concurrentPath,
    "export type SessionStatus = 'busy' | 'idle' | 'waiting'\n\n",
    `export type SessionStatus = 'busy' | 'idle' | 'waiting'

const peerRecordSchema = lazySchema(() =>
  z.object({
    pid: z.number(),
    sessionId: z.string(),
    cwd: z.string().optional(),
    startedAt: z.number(),
    version: z.string().optional(),
    kind: z.enum(['interactive', 'bg', 'daemon', 'daemon-worker']),
  }),
)
const priorUncleanSessions: Array<z.infer<typeof peerRecordSchema>> = []
let sweptPriorSessions = false

`,
    'target113 unclean-session state and schema',
  )
  replaceExactly(
    concurrentPath,
    '        startedAt: Date.now(),\n        kind,',
    '        startedAt: Date.now(),\n        version: MACRO.VERSION,\n        kind,',
    'target113 peer version serialization',
  )
  replaceExactly(
    concurrentPath,
    `      void unlink(join(dir, file)).catch(() => {})
    }
  }
  return count
}`,
    `      const path = join(dir, file)
      const prior = sweptPriorSessions
        ? null
        : await readFile(path, 'utf8')
            .then(contents => peerRecordSchema.safeParse(jsonParse(contents)))
            .catch(() => null)
      const removed = await unlink(path).then(
        () => true,
        () => false,
      )
      if (removed && prior?.success && prior.data.kind === 'interactive') {
        priorUncleanSessions.push(prior.data)
        logForDebugging(
          \`Prior session exited uncleanly: \${prior.data.sessionId} (v\${prior.data.version ?? '?'})\`,
        )
        logEvent('tengu_unclean_exit', {
          session_age_sec: Math.round(
            (Date.now() - prior.data.startedAt) / 1000,
          ),
          prior_version: prior.data.version ?? 'unknown',
          on_current_version: prior.data.version === MACRO.VERSION,
          prior_session_id: prior.data.sessionId,
        })
      }
    }
  }
  if (!sweptPriorSessions) {
    priorUncleanSessions.sort((a, b) => b.startedAt - a.startedAt)
    sweptPriorSessions = true
  }
  return count
}`,
    'target113 unclean-session stale sweep',
  )

  // Retained live owner fragments. These selectors intentionally avoid later
  // target116 changes sharing the same current files.
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/gracefulShutdown.ts'],
    /SIGHUP_ignored_bg/,
    'case113-daemon-sighup',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/ink/terminal.ts'],
    /getErrnoCode|terminalOutputFailed|isDaemonBackend/,
    'case113-daemon-terminal-output',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/plugins/pluginOptionsStorage.ts'],
    /Plugin option .*isn't set\. Open \/plugin manage/,
    'case113-plugin-option-error',
  )

  // The published tracing graph uses live ALS contexts, scopes each complete
  // prompt turn, and ends the exact tool span captured at dispatch.  The raw
  // source snapshot omits both this retained lifecycle and its target113 API
  // request identity additions, so replay the single authenticated owner plus
  // only the three reachable caller edges.
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/telemetry/sessionTracing.ts'],
    /^@@/m,
    'case113-tracing-lifecycle-owner',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/services/tools/toolExecution.ts'],
    /const toolSpan = startToolSpan|endToolSpan\(toolSpan/,
    'case113-tracing-tool-callers',
  )

  const promptSubmitPath = path.join(tree, 'src/utils/handlePromptSubmit.ts')
  replaceExactly(
    promptSubmitPath,
    "import { enqueue } from './messageQueueManager.js'\n",
    "import { enqueue } from './messageQueueManager.js'\nimport { extractTextContent } from './messages.js'\n",
    'target113 tracing interactive prompt extractor',
  )
  replaceExactly(
    promptSubmitPath,
    "import { queryCheckpoint, startQueryProfile } from './queryProfiler.js'\nimport { runWithWorkload } from './workloadContext.js'",
    "import { queryCheckpoint, startQueryProfile } from './queryProfiler.js'\nimport { endInteractionSpan, runWithInteractionSpan } from './telemetry/sessionTracing.js'\nimport { runWithWorkload } from './workloadContext.js'",
    'target113 tracing interactive imports',
  )
  replaceExactly(
    promptSubmitPath,
    `    const turnWorkload =
      firstWorkload !== undefined &&
      commands.every(c => c.workload === firstWorkload)
        ? firstWorkload
        : undefined

    // Wrap the entire turn`,
    `    const turnWorkload =
      firstWorkload !== undefined &&
      commands.every(c => c.workload === firstWorkload)
        ? firstWorkload
        : undefined
    const firstInput = commands[0]?.value
    const interactionPrompt =
      typeof firstInput === 'string'
        ? firstInput
        : firstInput
          ? extractTextContent(firstInput, '\\n')
          : ''

    // Wrap the entire turn`,
    'target113 tracing interactive prompt',
  )
  replaceExactly(
    promptSubmitPath,
    '    await runWithWorkload(turnWorkload, async () => {\n',
    '    await runWithWorkload(turnWorkload, () =>\n      runWithInteractionSpan(interactionPrompt, async () => {\n',
    'target113 tracing interactive scope start',
  )
  replaceExactly(
    promptSubmitPath,
    `        resetHistory()
        setAbortController(null)
      }`,
    `        resetHistory()
        setAbortController(null)
        endInteractionSpan()
      }`,
    'target113 tracing local-command completion',
  )
  replaceExactly(
    promptSubmitPath,
    '    }) // end runWithWorkload — ALS context naturally scoped, no finally needed\n',
    '      }),\n    )\n',
    'target113 tracing interactive scope end',
  )
  replaceExactly(
    promptSubmitPath,
    '    setUserInputOnProcessing(undefined)\n  }\n}',
    '    setUserInputOnProcessing(undefined)\n    endInteractionSpan()\n  }\n}',
    'target113 tracing interactive safety end',
  )

  const printPath = path.join(tree, 'src/cli/print.ts')
  replaceExactly(
    printPath,
    `import {
  createModelSwitchBreadcrumbs,
  getContentText,
} from 'src/utils/messages.js'`,
    `import {
  createModelSwitchBreadcrumbs,
  extractTextContent,
  getContentText,
} from 'src/utils/messages.js'`,
    'target113 tracing headless prompt extractor',
  )
  replaceExactly(
    printPath,
    "import { runWithWorkload, WORKLOAD_CRON } from 'src/utils/workloadContext.js'\n",
    "import { runWithWorkload, WORKLOAD_CRON } from 'src/utils/workloadContext.js'\nimport { endInteractionSpan, runWithInteractionSpan } from 'src/utils/telemetry/sessionTracing.js'\n",
    'target113 tracing headless imports',
  )
  replaceExactly(
    printPath,
    `          const cmd = command
          await runWithWorkload(cmd.workload ?? options.workload, async () => {
            for await (const message of ask({`,
    `          const cmd = command
          const interactionPrompt =
            typeof input === 'string'
              ? input
              : extractTextContent(input, '\\n')
          await runWithWorkload(cmd.workload ?? options.workload, () =>
            runWithInteractionSpan(interactionPrompt, async () => {
              try {
                for await (const message of ask({`,
    'target113 tracing headless scope start',
  )
  replaceExactly(
    printPath,
    `            }
          }) // end runWithWorkload

          for (const uuid of batchUuids) {`,
    `                }
              } finally {
                endInteractionSpan()
              }
            }),
          )

          for (const uuid of batchUuids) {`,
    'target113 tracing headless scope end',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/processUserInput/processTextPrompt.ts'],
    /startInteractionSpan/,
    'case113-tracing-remove-substitute-start',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/deepLink/parseDeepLink.ts'],
    /code >= 0x7f|INVISIBLE_OR_BIDI_CWD_PATTERN|validateDeepLinkCwd|sanitizeDeepLinkQuery/,
    'case113-deep-link-parser-hardening',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/deepLink/terminalLauncher.ts'],
    /ComSpec|shellSafeArgs|buildDeepLinkLaunchArgs|escapeSemicolon|spawnWithCwd|SHELL_SAFE_ARGS_PATTERN|shell-safe args contain metacharacters/,
    'case113-deep-link-launcher-hardening',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/deepLink/protocolHandler.ts'],
    /fs\/promises|claudePath|\.realpath\(process\.execPath\)/,
    'case113-protocol-handler-realpath',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/services/api/errorUtils.ts'],
    /Some providers put a serialized error body|error\.message\.includes\('\{"'\)/,
    'case113-api-error-nested-json',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/cliArgs.ts'],
    /CLI_FLAGS_WITH_VALUES|prefill-b64|deep-link-cwd-b64/,
    'case113-deep-link-cli-flags',
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/utils/attachments.ts'],
    /type: 'ultrathink_effort'.*level: 'high'|return \[\{ type: 'ultrathink_effort'/,
    'case113-ultrathink-effort-shape',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/messages.ts'],
    /The user included the keyword "ultrathink", requesting deeper reasoning/,
    'case113-ultrathink-effort-explanation',
  )

  // Target 113 introduced both /update refusal guards.  The current source
  // retains the graph but target 116 later rewrote only the transcript-drift
  // guidance, so install the selected owner and restore the authenticated
  // introduction-era wording.
  writeCurrentSource('src/commands/update/update.ts', tree)
  replaceExactly(
    path.join(tree, 'src/commands/update/update.ts'),
    'Cannot /update — this session was resumed from a different project directory. Restart manually with --resume to continue on the latest version.',
    'Cannot /update — session transcript is in a different project directory than the child would resolve. Exit the worktree or restart manually.',
    'target113 update transcript-drift guidance',
  )

  // Target 113's DECSTBM main-screen lane lets FullscreenLayout consume
  // Ink's rendered frame, retain native transcript history, and paint the
  // prompt atomically without entering the alternate screen.  Keep the
  // reconstruction selective: the current owners also carry later input,
  // wheel, theme, transcript, and target116 scroll changes.
  const fullscreenPath = path.join(tree, 'src/components/FullscreenLayout.tsx')
  replaceExactly(
    fullscreenPath,
    "import React, { createContext, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';",
    "import React, { createContext, type ReactNode, type RefObject, useCallback, useContext, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';",
    'target113 synchronized layout React hooks',
  )
  replaceExactly(
    fullscreenPath,
    "import ScrollBox, { type ScrollBoxHandle } from '../ink/components/ScrollBox.js';\nimport instances from '../ink/instances.js';\nimport { Box, Text } from '../ink.js';",
    `import ScrollBox, { type ScrollBoxHandle } from '../ink/components/ScrollBox.js';
import type { DOMElement } from '../ink/dom.js';
import type { Frame } from '../ink/frame.js';
import instances from '../ink/instances.js';
import { nodeCache } from '../ink/node-cache.js';
import Output from '../ink/output.js';
import renderNodeToOutput, { resetLayoutShifted } from '../ink/render-node-to-output.js';
import { CellWidth, cellAt, createScreen, type Screen, type StylePool } from '../ink/screen.js';
import { isSynchronizedOutputSupported } from '../ink/terminal.js';
import { CURSOR_HOME, cursorPosition, ERASE_LINE, ERASE_SCREEN, ERASE_SCROLLBACK, RESET_SCROLL_REGION, setScrollRegion } from '../ink/termio/csi.js';
import { BSU, ESU, HIDE_CURSOR, SHOW_CURSOR } from '../ink/termio/dec.js';
import { LINK_END, link } from '../ink/termio/osc.js';
import { Box, Text } from '../ink.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';`,
    'target113 synchronized layout Ink imports',
  )
  replaceExactly(
    fullscreenPath,
    "import { isFullscreenEnvEnabled } from '../utils/fullscreen.js';",
    "import { isEnvTruthy } from '../utils/envUtils.js';\nimport { isFullscreenEnvEnabled, isTmuxControlMode } from '../utils/fullscreen.js';",
    'target113 synchronized layout gate imports',
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/components/FullscreenLayout.tsx'],
    /BEGIN TARGET113_SYNCHRONIZED_OUTPUT_WRITER/,
    'case113-synchronized-output-writer',
  )
  replaceBetween(
    fullscreenPath,
    'function renderHistoryLines(',
    'function SynchronizedOutputLayout(',
    `function renderHistoryLines(
  scrollElement: DOMElement,
  from: number,
  to: number,
  columns: number,
  stylePool: StylePool
): string[] {
  const content = scrollElement.childNodes[0] as DOMElement | undefined;
  if (!content) return [];
  if ((scrollElement.scrollHeight ?? 0) <= 0 || to <= from) return [];
  const ink = instances.get(process.stdout);
  if (!ink) return [];
  const height = Math.ceil(to);
  const screen = createScreen(
    columns,
    Math.max(1, height),
    stylePool,
    ink.getCharPool(),
    ink.getHyperlinkPool()
  );
  const output = new Output({ width: columns, height, stylePool, screen });
  resetLayoutShifted();
  renderNodeToOutput(content, output, { offsetX: 0, offsetY: 0, prevScreen: undefined });
  const rendered = output.get();
  content.dirty = true;
  const lines: string[] = [];
  const startRow = Math.max(0, Math.floor(from));
  const endRow = Math.min(height, Math.ceil(to));
  for (let row = startRow; row < endRow; row++) {
    lines.push(serializeSynchronizedRow(rendered, stylePool, row));
  }
  return lines;
}

function SynchronizedOutputLayout(`,
    'target113 synchronized history renderer',
  )
  applyMatchingWorkingTreePatchDirect(
    tree,
    ['src/components/FullscreenLayout.tsx'],
    /if \(isSynchronizedInlineOutputEnabled\(\)\)/,
    'case113-synchronized-layout-branch',
  )

  const inkPath = path.join(tree, 'src/ink/ink.tsx')
  replaceExactly(
    inkPath,
    "import { CURSOR_HOME, cursorMove, cursorPosition, DISABLE_KITTY_KEYBOARD, DISABLE_MODIFY_OTHER_KEYS, ENABLE_KITTY_KEYBOARD, ENABLE_MODIFY_OTHER_KEYS, ERASE_SCREEN } from './termio/csi.js';",
    "import { CURSOR_HOME, cursorMove, cursorPosition, DISABLE_KITTY_KEYBOARD, DISABLE_MODIFY_OTHER_KEYS, ENABLE_KITTY_KEYBOARD, ENABLE_MODIFY_OTHER_KEYS, ERASE_SCREEN, RESET_SCROLL_REGION } from './termio/csi.js';",
    'target113 synchronized Ink scroll-region import',
  )
  for (const [pattern, label] of [
    [/frameSink: \(\(frame: Frame, stylePool: StylePool\)/, 'sink-field'],
    [/A previous process can leave DECSTBM active/, 'margin-reset'],
    [/const sinkResult = this\.frameSink\(frame, this\.stylePool\)/, 'sink-dispatch'],
    [/getStylePool\(\): StylePool/, 'pool-accessors'],
  ]) {
    applyMatchingWorkingTreePatchDirect(
      tree,
      ['src/ink/ink.tsx'],
      pattern,
      `case113-synchronized-ink-${label}`,
    )
  }
  applyMatchingWorkingTreePatch(
    tree,
    ['src/ink/components/ScrollBox.tsx'],
    /getDomElement/,
    'case113-synchronized-scrollbox-handle',
  )

  const replPath = path.join(tree, 'src/screens/REPL.tsx')
  replaceExactly(
    replPath,
    "import { FullscreenLayout, useUnseenDivider, computeUnseenDivider } from '../components/FullscreenLayout.js';",
    "import { FullscreenLayout, isSynchronizedInlineOutputEnabled, SynchronizedOutputTranscriptEnd, useUnseenDivider, computeUnseenDivider } from '../components/FullscreenLayout.js';",
    'target113 synchronized REPL imports',
  )
  replaceExactly(
    replPath,
    'scrollRef={isFullscreenEnvEnabled() ? scrollRef : undefined}',
    'scrollRef={isFullscreenEnvEnabled() || isSynchronizedInlineOutputEnabled() ? scrollRef : undefined}',
    'target113 synchronized REPL scroll handle',
  )
  replaceExactly(
    replPath,
    '              <AwsAuthStatusBox />\n',
    '              <AwsAuthStatusBox />\n              <SynchronizedOutputTranscriptEnd />\n',
    'target113 synchronized REPL transcript marker',
  )
  applyMatchingWorkingTreePatch(
    tree,
    ['src/commands/exit/index.ts'],
    /Exit the CLI/,
    'case113-exit-description',
  )

  const bashPromptPath = path.join(tree, 'src/tools/BashTool/prompt.ts')
  replaceExactly(
    bashPromptPath,
    'never prepend `cd <current-directory>` to a git command — git already operates on the current working tree',
    'never prepend `cd <current-directory>` to a `git` command — `git` already operates on the current working tree',
    'target113 Bash git command quoting',
  )
  const vertexPath = path.join(tree, 'src/components/VertexSetupWizard.tsx')
  if (!fs.existsSync(vertexPath)) {
    writeCurrentSource('src/components/VertexSetupWizard.tsx', tree)
  } else {
    replaceExactly(
      vertexPath,
      "Use 'global' for the multi-region endpoint (recommended), or a specific location like us-east5 if you have regional quota.",
      "Use 'global', 'us', or 'eu' for a multi-region endpoint (recommended), or a specific location like us-east5 if you have regional quota.",
      'target113 Vertex multi-region hint',
    )
  }

  const autoUpdaterPath = path.join(tree, 'src/utils/autoUpdater.ts')
  applyMatchingWorkingTreePatch(
    tree,
    ['src/utils/autoUpdater.ts'],
    /readdir|rename|\brm\b|\bstat\b|dirname|getPlatform|checkGlobalInstallPermissions|retiredWindowsBinaries|combinedOutput|retired-dir cleanup failed|Failed to restore/,
    'case113-windows-auto-updater-retirement',
  )
  if (!fs.readFileSync(autoUpdaterPath, 'utf8').includes("getPlatform() === 'windows'")) {
    throw new Error('target113 Windows auto-updater selector missed normalized platform gate')
  }

  const mainPath = path.join(tree, 'src/main.tsx')
  replaceExactly(
    mainPath,
    'getGlobalConfig, getRemoteControlAtStartup, isAutoUpdaterDisabled, saveGlobalConfig',
    'getGlobalConfig, getProjectPathForConfig, getRemoteControlAtStartup, isAutoUpdaterDisabled, resetTrustDialogAcceptedCacheForTesting, saveGlobalConfig',
    'target113 deep-link config imports',
  )
  replaceExactly(
    mainPath,
    "import { buildDeepLinkBanner } from './utils/deepLink/banner.js';\n",
    "import { buildDeepLinkBanner } from './utils/deepLink/banner.js';\nimport { sanitizeDeepLinkQuery, validateDeepLinkCwd } from './utils/deepLink/parseDeepLink.js';\n",
    'target113 deep-link parser imports',
  )
  replaceExactly(
    mainPath,
    "import { findGitRoot, getBranch, getIsGit, getWorktreeCount } from './utils/git.js';\n",
    "import { findGitRoot, getBranch, getIsGit, getWorktreeCount } from './utils/git.js';\nimport { resetGitFileWatcher } from './utils/git/gitFilesystem.js';\n",
    'target113 deep-link git cache import',
  )
  replaceExactly(
    mainPath,
    'setOriginalCwd, setQuestionPreviewFormat',
    'setOriginalCwd, setProjectRoot, setQuestionPreviewFormat',
    'target113 deep-link project-root import',
  )
  replaceExactly(
    mainPath,
    "import { isInBundledMode, isRunningWithBun } from './utils/bundledMode.js';\n",
    "import { isInBundledMode, isRunningWithBun } from './utils/bundledMode.js';\nimport { clearMemoryFileCaches } from './utils/claudemd.js';\n",
    'target113 deep-link memory cache import',
  )
  replaceExactly(
    mainPath,
    "import { initializeWarningHandler } from './utils/warningHandler.js';\n",
    "import { initializeWarningHandler } from './utils/warningHandler.js';\nimport { updateHooksConfigSnapshot } from './utils/hooks/hooksConfigSnapshot.js';\n",
    'target113 deep-link hooks snapshot import',
  )
  replaceExactly(
    mainPath,
    `    return Number.isFinite(n) ? n : undefined;
  }).hideHelp()).option('--from-pr [value]'`,
    `    return Number.isFinite(n) ? n : undefined;
  }).hideHelp()).addOption(new Option('--prefill-b64 <b64>', 'Base64url-encoded --prefill value (deep-link shell-safe launch paths)').argParser(value => Buffer.from(value, 'base64url').toString('utf8')).hideHelp()).addOption(new Option('--deep-link-cwd-b64 <b64>', 'Base64url-encoded working directory (deep-link shell-safe launch paths)').argParser(value => Buffer.from(value, 'base64url').toString('utf8')).hideHelp()).option('--from-pr [value]'`,
    'target113 deep-link hidden options',
  )
  replaceExactly(
    mainPath,
    `    profileCheckpoint('action_handler_start');

    // --bare`,
    `    profileCheckpoint('action_handler_start');

    if (options.deepLinkOrigin && options.prefillB64 !== undefined && options.prefill === undefined) {
      try {
        options.prefill = sanitizeDeepLinkQuery(options.prefillB64);
      } catch (error) {
        logError(\`Ignoring invalid --prefill-b64: \${error instanceof Error ? error.message : error}\`);
      }
    }
    if (options.deepLinkOrigin && options.deepLinkCwdB64 !== undefined) {
      try {
        validateDeepLinkCwd(options.deepLinkCwdB64);
        process.chdir(options.deepLinkCwdB64);
        setCwd(options.deepLinkCwdB64);
        setOriginalCwd(getCwd());
        setProjectRoot(getCwd());
        getProjectPathForConfig.cache?.clear?.();
        resetTrustDialogAcceptedCacheForTesting();
        clearMemoryFileCaches();
        resetSettingsCache();
        resetGitFileWatcher();
        updateHooksConfigSnapshot();
      } catch (error) {
        logError(\`Ignoring invalid --deep-link-cwd-b64: \${error instanceof Error ? error.message : error}\`);
      }
    }

    // --bare`,
    'target113 deep-link CLI action',
  )

  const claudePath = path.join(tree, 'src/services/api/claude.ts')
  replaceExactly(
    claudePath,
    '  type LLMRequestNewContext,\n  startLLMRequestSpan,',
    '  type LLMRequestNewContext,\n  recordLLMRequestAttempt,\n  startLLMRequestSpan,',
    'target113 request-attempt tracing import',
  )
  replaceExactly(
    claudePath,
    `        clientRequestId =
          getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()
            ? randomUUID()
            : undefined

        // Use raw stream`,
    `        const provider = getAPIProvider()
        clientRequestId =
          (provider === 'firstParty' && isFirstPartyAnthropicBaseUrl()) ||
          (provider === 'anthropicAws' &&
            !process.env.ANTHROPIC_AWS_BASE_URL)
            ? randomUUID()
            : undefined

        recordLLMRequestAttempt(llmSpan, {
          attempt: attemptStartTimes.length,
          clientRequestId,
        })

        // Use raw stream`,
    'target113 request-attempt call path',
  )
  replaceExactly(
    claudePath,
    `      requestId: streamRequestId ?? null,
      stopReason,`,
    `      requestId: streamRequestId ?? null,
      clientRequestId: didFallBackToNonStreaming
        ? undefined
        : clientRequestId,
      stopReason,`,
    'target113 successful client-request-id suppression',
  )
  replaceExactly(
    claudePath,
    `      clientRequestId: didFallBackToNonStreaming
        ? undefined
        : clientRequestId,`,
    '      clientRequestId: didFallBackToNonStreaming ? undefined : clientRequestId,',
    'target113 successful client-request-id source form',
  )

  const loggingPath = path.join(tree, 'src/services/api/logging.ts')
  replaceExactly(
    loggingPath,
    `  void logOTelEvent('api_error', {
    model: model,
    error: errStr,
    status_code: String(status),
    duration_ms: String(durationMs),
    attempt: String(attempt),
    speed: fastMode ? 'fast' : 'normal',
  })`,
    `  void logOTelEvent('api_error', {
    model,
    error: errStr,
    ...(status !== undefined ? { status_code: String(status) } : {}),
    duration_ms: String(durationMs),
    attempt: String(attempt),
    request_id: requestId ?? undefined,
    speed: fastMode ? 'fast' : 'normal',
  })
  if (attempt > 1) {
    void logOTelEvent('api_retries_exhausted', {
      model,
      error: errStr,
      ...(status !== undefined ? { status_code: String(status) } : {}),
      total_attempts: String(attempt),
      total_retry_duration_ms: String(durationMsIncludingRetries),
      speed: fastMode ? 'fast' : 'normal',
    })
  }`,
    'target113 API error OTel metadata',
  )
  replaceExactly(
    loggingPath,
    `    error: errStr,
    attempt,
  })`,
    `    error: errStr,
    attempt,
    requestId: requestId ?? undefined,
    clientRequestId: didFallBackToNonStreaming
      ? undefined
      : clientRequestId,
  })`,
    'target113 API error span identifiers',
  )
  replaceExactly(
    loggingPath,
    `  requestId,
  stopReason,`,
    `  requestId,
  clientRequestId,
  stopReason,`,
    'target113 API success client ID parameter',
  )
  replaceExactly(
    loggingPath,
    `  requestId: string | null
  stopReason:`,
    `  requestId: string | null
  clientRequestId?: string
  stopReason:`,
    'target113 API success client ID type',
  )
  replaceExactly(
    loggingPath,
    `  requestId,
  stopReason,
  didFallBackToNonStreaming,`,
    `  requestId,
  clientRequestId,
  stopReason,
  didFallBackToNonStreaming,`,
    'target113 duration logger client ID parameter',
  )
  replaceExactly(
    loggingPath,
    `  requestId: string | null
  stopReason: BetaStopReason | null
  didFallBackToNonStreaming:`,
    `  requestId: string | null
  clientRequestId?: string
  stopReason: BetaStopReason | null
  didFallBackToNonStreaming:`,
    'target113 duration logger client ID type',
  )
  replaceExactly(
    loggingPath,
    `    requestId,
    stopReason,
    costUSD,`,
    `    requestId,
    clientRequestId,
    stopReason,
    costUSD,`,
    'target113 internal success logger client ID',
  )
  replaceExactly(
    loggingPath,
    `    duration_ms: String(durationMs),
    speed: fastMode ? 'fast' : 'normal',`,
    `    duration_ms: String(durationMs),
    request_id: requestId ?? undefined,
    speed: fastMode ? 'fast' : 'normal',`,
    'target113 API request OTel ID',
  )
  replaceExactly(
    loggingPath,
    `    attempt,
    modelOutput,`,
    `    attempt,
    requestId: requestId ?? undefined,
    clientRequestId,
    modelOutput,`,
    'target113 success span identifiers',
  )
  replaceExactly(
    loggingPath,
    `    clientRequestId: didFallBackToNonStreaming
      ? undefined
      : clientRequestId,`,
    '    clientRequestId: didFallBackToNonStreaming ? undefined : clientRequestId,',
    'target113 error client-request-id source form',
  )
}

writeCase('2.1.107-to-2.1.108', [
  withTargetWorktree('a22c02fc9bf4b772da434470c28e1bb21f5bd73c', tree => {
    const combinedPatch = path.join(tree, '.case107-combined.patch')
    fs.writeFileSync(combinedPatch, case107Combined)
    git(tree, [
      'apply',
      '--3way',
      '--exclude=src/commands.ts',
      combinedPatch,
    ])
    fs.unlinkSync(combinedPatch)
    const commandsPath = path.join(tree, 'src/commands.ts')
    let commands = fs.readFileSync(commandsPath, 'utf8')
    const importAnchor = "import passes from './commands/passes/index.js'\n"
    const registrationAnchor = '  passes,\n'
    if (!commands.includes(importAnchor) || !commands.includes(registrationAnchor)) {
      throw new Error('target 2.1.108 command registry anchors differ')
    }
    commands = commands
      .replace(
        importAnchor,
        `${importAnchor}import {\n  setupBedrock,\n  setupVertex,\n} from './commands/provider-setup/index.js'\n`,
      )
      .replace(
        registrationAnchor,
        `${registrationAnchor}  setupBedrock,\n  setupVertex,\n`,
      )
    fs.writeFileSync(commandsPath, commands)
    for (const relative of [
      'SKILL.md',
      'shared/live-sources.md',
      'shared/models.md',
    ]) {
      writeExtractedClaudeApiDocument(108, relative, tree)
    }
    installFinalClaudeApiRoutingDescription(tree)
    for (const relative of [
      'src/commands/provider-setup/bedrock.tsx',
      'src/commands/provider-setup/index.ts',
      'src/commands/provider-setup/relaunch.ts',
      'src/commands/provider-setup/vertex.tsx',
      'src/components/BackgroundWorkExitDialog.tsx',
      'src/tools/ScheduleWakeupTool/ScheduleWakeupTool.ts',
      'src/tools/ScheduleWakeupTool/prompt.ts',
      'src/utils/promptInputState.ts',
    ]) {
      const filename = path.join(tree, relative)
      fs.writeFileSync(filename, fs.readFileSync(filename, 'utf8').replace(/\n+$/, '\n'))
    }

    // Target 108 replaces the raw figures.tick success marker used by the
    // shared plugin recommendation installer with the design-system status
    // primitive. This owner persists unchanged through target 116.
    const pluginRecommendationPath = path.join(
      tree,
      'src/hooks/usePluginRecommendationBase.tsx',
    )
    replaceExactly(
      pluginRecommendationPath,
      "import figures from 'figures';\n",
      "import { StatusIcon } from '../components/design-system/StatusIcon.js';\n",
      'target 2.1.108 plugin recommendation StatusIcon import',
    )
    replaceExactly(
      pluginRecommendationPath,
      '          {figures.tick} {pluginName} installed · restart to apply\n',
      '          <StatusIcon status="success" withSpace={true} />{pluginName} installed · restart to apply\n',
      'target 2.1.108 plugin recommendation success icon',
    )

    // 2.1.108 introduces the persistent, sealed JavaScript REPL runtime.  The
    // recovered owner is split out of the bundle into a runtime, prompt, and
    // state types.  Use the frozen target-108 semantic tree rather than the
    // cumulative current worktree: later target-116 isolation-latch changes
    // touch several of the same context hunks and must not leak backward.
    const frozenTarget108 = '/tmp/late107-replay.gotzZL/tree'
    for (const relative of [
      'src/tools/REPLTool/REPLTool.ts',
      'src/tools/REPLTool/prompt.ts',
      'src/tools/REPLTool/types.ts',
      'src/Tool.ts',
      'src/state/AppStateStore.ts',
      'src/screens/REPL.tsx',
      'src/services/tools/toolExecution.ts',
      'src/utils/errors.ts',
      'src/tools/BashTool/BashTool.tsx',
      'src/utils/forkedAgent.ts',
      'src/tools/AgentTool/runAgent.ts',
      'src/tools/AgentTool/AgentTool.tsx',
      'src/tools/AgentTool/resumeAgent.ts',
      'src/QueryEngine.ts',
    ]) {
      writeExternalSource(frozenTarget108, relative, tree)
    }

    // These two owners were independently authenticated against target 108
    // after the inherited persistence layer was restored.  Keep their exact
    // historical forms: target 108 adds the transcript-disable gate,
    // ephemeral REPL progress, pending-action wrapper, and async disposal;
    // later targets evolve the projected display name.
    const frozenTarget108SessionBridge =
      '/tmp/late107-finalcheck.ILirXe/tree'
    for (const relative of [
      'src/utils/sessionStorage.ts',
      'src/bridge/remoteBridgeCore.ts',
    ]) {
      writeExternalSource(frozenTarget108SessionBridge, relative, tree)
    }

    // Resume-return itself is proven transitively at its target-90
    // introduction.  Target 108 changes only the compact-model override: use
    // default Sonnet while preserving an explicit 1M-context suffix.  The
    // override is removed again by target 116, so recover it only in this
    // historical semantic tree.
    const historicalModelPath = path.join(tree, 'src/utils/model/model.ts')
    replaceExactly(
      historicalModelPath,
      '// @[MODEL LAUNCH]: Update the default Haiku model (3P providers may lag so keep defaults unchanged).',
      `/**
 * Select the target-108 resume-summary model while retaining an explicit 1M
 * context selection from the running model.
 */
export function getResumeCompactModel(currentModel: ModelName): ModelName {
  return getDefaultSonnetModel() +
    (has1mContext(currentModel) ? '[1m]' : '')
}

// @[MODEL LAUNCH]: Update the default Haiku model (3P providers may lag so keep defaults unchanged).`,
      'target 2.1.108 resume compact model helper',
    )

    // Session-storage stripping and the reactive session title/agent-name
    // graph were introduced before 2.1.108 but are still observable in this
    // target.  Recover the narrow inherited owner/call-path without copying
    // the later target-116 REPL wholesale.
    const historicalMessagesPath = path.join(tree, 'src/utils/messages.ts')
    replaceExactly(
      historicalMessagesPath,
      "import type { AnyObject, Progress } from '../Tool.js'",
      "import type { AnyObject, ApiMetricsEvent, Progress } from '../Tool.js'",
      'target 2.1.108 API metrics event import',
    )
    replaceExactly(
      historicalMessagesPath,
      '  onApiMetrics?: (metrics: { ttftMs: number }) => void,',
      '  onApiMetrics?: (event: ApiMetricsEvent) => void,',
      'target 2.1.108 API metrics event callback type',
    )
    replaceExactly(
      historicalMessagesPath,
      '      onApiMetrics?.({ ttftMs: message.ttftMs })',
      "      onApiMetrics?.({ type: 'start', ttftMs: message.ttftMs })",
      'target 2.1.108 API metrics request start',
    )
    replaceExactly(
      historicalMessagesPath,
      "    case 'message_delta':\n      onSetStreamMode('responding')\n      return",
      "    case 'message_delta':\n      onSetStreamMode('responding')\n      if (message.event.usage.output_tokens != null) {\n        onApiMetrics?.({\n          type: 'end',\n          outputTokens: message.event.usage.output_tokens,\n        })\n      }\n      return",
      'target 2.1.108 API metrics request end',
    )
    const historicalRemoteSessionPath = path.join(
      tree,
      'src/hooks/useRemoteSession.ts',
    )
    replaceExactly(
      historicalRemoteSessionPath,
      "import type { Tool } from '../Tool.js'",
      "import type { ApiMetricsEvent, Tool } from '../Tool.js'",
      'target 2.1.108 remote API metrics import',
    )
    replaceExactly(
      historicalRemoteSessionPath,
      '  setInProgressToolUseIDs?: (f: (prev: Set<string>) => Set<string>) => void\n}',
      '  setInProgressToolUseIDs?: (f: (prev: Set<string>) => Set<string>) => void\n  recordApiMetricsEvent?: (event: ApiMetricsEvent) => void\n}',
      'target 2.1.108 remote API metrics prop type',
    )
    replaceExactly(
      historicalRemoteSessionPath,
      '  setStreamMode,\n  setInProgressToolUseIDs,\n}: UseRemoteSessionProps)',
      '  setStreamMode,\n  setInProgressToolUseIDs,\n  recordApiMetricsEvent,\n}: UseRemoteSessionProps)',
      'target 2.1.108 remote API metrics prop',
    )
    replaceExactly(
      historicalRemoteSessionPath,
      "          if (sdkMessage.subtype === 'task_progress') {\n            return\n          }",
      "          if (\n            sdkMessage.subtype === 'task_progress' ||\n            sdkMessage.subtype === 'task_updated' ||\n            sdkMessage.subtype === 'notification'\n          ) {\n            return\n          }",
      'target 2.1.108 remote non-rendered system events',
    )
    replaceExactly(
      historicalRemoteSessionPath,
      '              setStreamMode,\n              setStreamingToolUses,\n            )',
      '              setStreamMode,\n              setStreamingToolUses,\n              undefined,\n              undefined,\n              recordApiMetricsEvent,\n            )',
      'target 2.1.108 remote API metrics call',
    )
    replaceExactly(
      historicalRemoteSessionPath,
      '    setConnStatus,\n    writeTaskCount,\n  ])',
      '    setConnStatus,\n    writeTaskCount,\n    recordApiMetricsEvent,\n  ])',
      'target 2.1.108 remote API metrics effect dependency',
    )
    const currentMessages = fs.readFileSync(
      path.join(repositoryRoot, 'src/utils/messages.ts'),
      'utf8',
    )
    const stripStart = currentMessages.indexOf(
      'export function stripToolUseResultsForStorage(',
    )
    const stripEnd = currentMessages.indexOf(
      '\nfunction createToolResultMessage<Output>',
      stripStart,
    )
    if (stripStart === -1 || stripEnd === -1) {
      throw new Error('storage-strip helper anchors differ')
    }
    const stripHelper = currentMessages.slice(stripStart, stripEnd)
    replaceExactly(
      historicalMessagesPath,
      '\nfunction createToolResultMessage<Output>',
      `\n${stripHelper}\n\nfunction createToolResultMessage<Output>`,
      'target 2.1.108 storage-strip helper',
    )

    const historicalReplPath = path.join(tree, 'src/screens/REPL.tsx')
    replaceExactly(
      historicalReplPath,
      "import { textForResubmit, handleMessageFromStream, type StreamingToolUse, type StreamingThinking, isCompactBoundaryMessage, getMessagesAfterCompactBoundary, getContentText, createUserMessage, createAssistantMessage, createTurnDurationMessage, createAgentsKilledMessage, createApiMetricsMessage, createSystemMessage, createCommandInputMessage, formatCommandInputTags } from '../utils/messages.js';",
      "import { textForResubmit, handleMessageFromStream, type StreamingToolUse, type StreamingThinking, isCompactBoundaryMessage, getMessagesAfterCompactBoundary, getContentText, createUserMessage, createAssistantMessage, createTurnDurationMessage, createAgentsKilledMessage, createApiMetricsMessage, createSystemMessage, createCommandInputMessage, formatCommandInputTags, stripToolUseResultsForStorage } from '../utils/messages.js';",
      'target 2.1.108 REPL storage-strip import',
    )
    replaceExactly(
      historicalReplPath,
      "import { clearSessionMetadata, resetSessionFilePointer, adoptResumedSessionFile, removeTranscriptMessage, restoreSessionMetadata, getCurrentSessionTitle, isEphemeralToolProgress, isLoggableMessage, saveWorktreeState, getAgentTranscript } from '../utils/sessionStorage.js';",
      "import { clearSessionMetadata, resetSessionFilePointer, adoptResumedSessionFile, removeTranscriptMessage, restoreSessionMetadata, getCurrentSessionTitle, getCurrentSessionAgentName, subscribeSessionAgentNameChanged, subscribeSessionTitleChanged, isEphemeralToolProgress, isLoggableMessage, saveWorktreeState, getAgentTranscript } from '../utils/sessionStorage.js';",
      'target 2.1.108 REPL session metadata imports',
    )
    replaceExactly(
      historicalReplPath,
      '  // Note: standaloneAgentContext is initialized in main.tsx (via initialState) or\n  // ResumeConversation.tsx (via setAppState before rendering REPL) to avoid\n  // useEffect-based state initialization on mount (per CLAUDE.md guidelines)\n',
      '  useEffect(() => subscribeSessionAgentNameChanged(() => {\n    const name = getCurrentSessionAgentName();\n    if (!name) return;\n    setAppState(prev => {\n      if (prev.standaloneAgentContext?.name === name) return prev;\n      return {\n        ...prev,\n        standaloneAgentContext: {\n          ...prev.standaloneAgentContext,\n          name\n        }\n      };\n    });\n  }), [setAppState]);\n',
      'target 2.1.108 REPL agent-name subscription',
    )
    replaceExactly(
      historicalReplPath,
      '  const sessionTitle = terminalTitleFromRename ? getCurrentSessionTitle(getSessionId()) : undefined;',
      '  const sessionTitle = React.useSyncExternalStore(subscribeSessionTitleChanged, () => terminalTitleFromRename ? getCurrentSessionTitle(getSessionId()) : undefined);',
      'target 2.1.108 REPL title subscription',
    )
    replaceExactly(
      historicalReplPath,
      '    queryCheckpoint(\'query_end\');',
      "    setMessages(currentMessages => stripToolUseResultsForStorage(currentMessages, toolUseContext.options.tools));\n    queryCheckpoint('query_end');",
      'target 2.1.108 REPL storage-strip call',
    )
    replaceExactly(
      historicalReplPath,
      'idleMinutes={idleReturnPending.idleMinutes} totalInputTokens={getTotalInputTokens()}',
      'idleMinutes={idleReturnPending.idleMinutes} contextTokens={getTotalInputTokens()}',
      'target 2.1.108 idle-return context token prop',
    )

    // Prompt-cache break detection predates this case, but target 108 adds
    // systemHash/toolsHash to the emitted analytics payload.  Use root's
    // authenticated target-108 owner and call site; cumulative current source
    // separately retains the later target-116 persistence/TTL evolution.
    for (const relative of [
      'src/services/api/promptCacheBreakDetection.ts',
      'src/services/api/claude.ts',
    ]) {
      writeExternalSource(frozenTarget108, relative, tree)
    }

    // The target renders both successful it2 setup states through the shared
    // StatusIcon (rather than embedding a platform-specific check glyph).
    // Target 116 retains this exact rendering, so the cumulative owner is also
    // the authenticated target-108 owner.
    writeCurrentSource('src/utils/swarm/It2SetupPrompt.tsx', tree)

    // The target-108 logo animation is unchanged in target 116.  Install the
    // authenticated owner as a complete unit because the historical source
    // snapshot predates the named animation state machine entirely.
    writeExternalSource(
      frozenTarget108,
      'src/components/LogoV2/AnimatedClawd.tsx',
      tree,
    )

    // Directional focus and click-default semantics first appear in 108 and
    // remain stable through 116, except that the later useFocus wrapper
    // returns the manager's boolean result.  Install the complete reachable
    // owner graph, then restore the target-108 fire-and-forget hook contract.
    for (const relative of [
      'src/ink/focus.ts',
      'src/ink/events/click-event.ts',
      'src/ink/hit-test.ts',
      'src/ink/hooks/use-focus.ts',
      'src/ink/ink.tsx',
      'src/ink/components/App.tsx',
      'src/ink/components/AppContext.ts',
      'src/ink.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    replaceExactly(
      path.join(tree, 'src/ink/hooks/use-focus.ts'),
      `    focusDirection: (direction: FocusDirection) => {
        if (focusManager && rootNode) {
          return focusManager.focusDirection(direction, rootNode)
        }
        return false
      },`,
      `    focusDirection: (direction: FocusDirection) => {
        if (focusManager && rootNode) focusManager.focusDirection(direction, rootNode)
      },`,
      'target 2.1.108 fire-and-forget focus hook',
    )

    // The target already contains the inherited dedicated Vertex overrides
    // for Opus 4.6 and 4.5.  The historical source snapshot predates both;
    // install them in the exact target order without leaking the later 4.7
    // override into target 108.
    const historicalEnvUtilsPath = path.join(tree, 'src/utils/envUtils.ts')
    replaceExactly(
      historicalEnvUtilsPath,
      "  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],\n  ['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS'],",
      "  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],\n  ['claude-opus-4-6', 'VERTEX_REGION_CLAUDE_4_6_OPUS'],\n  ['claude-opus-4-5', 'VERTEX_REGION_CLAUDE_4_5_OPUS'],\n  ['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS'],",
      'target 2.1.108 inherited Vertex Opus overrides',
    )

    // Tabs in both authenticated targets subscribes to Ink focus state before
    // maintaining its independent header-focus state.  The tracked snapshot
    // omitted that hook call.
    writeCurrentSource('src/components/design-system/Tabs.tsx', tree)

    replaceExactly(
      path.join(tree, 'src/keybindings/defaultBindings.ts'),
      "      // Retry loading usage data (only active on error)\n      r: 'settings:retry',\n",
      "      // Retry loading usage data (only active on error)\n      r: 'settings:retry',\n      d: 'settings:periodDay',\n      w: 'settings:periodWeek',\n",
      'target 2.1.108 usage-period keybindings',
    )
    replaceExactly(
      path.join(tree, 'src/keybindings/schema.ts'),
      "  'settings:retry',\n  'settings:close',\n",
      "  'settings:retry',\n  'settings:close',\n  'settings:periodDay',\n  'settings:periodWeek',\n",
      'target 2.1.108 usage-period keybinding actions',
    )

    // Target 108's pre-Pane LogSelector passes its effective (optionally
    // forced) width into the leading Divider.  Target 116 later replaces this
    // surface with Pane, so retain the historical form only here.
    replaceExactly(
      path.join(tree, 'src/components/LogSelector.tsx'),
      '<Divider color="suggestion" />',
      '<Divider color="suggestion" width={columns} />',
      'target 2.1.108 LogSelector divider width',
    )

    replaceExactly(
      path.join(tree, 'src/utils/teleport.tsx'),
      'throw new TeleportOperationError(`${sessionId} not found.`, `${sessionId} not found.\\n${chalk.dim(\'Run /status in Claude Code to check your account.\')}`);',
      'throw new TeleportOperationError(`${sessionId} not found.\\nRun /status in Claude Code to check your account.`, `${sessionId} not found.\\n${chalk.dim(\'Run /status in Claude Code to check your account.\')}`);',
      'target 2.1.108 teleport not-found raw guidance',
    )

    // Team onboarding was introduced before this case but the target-108
    // historical snapshot does not contain its authored owner.  Target 108
    // matches the cumulative implementation except for the later
    // disableModelInvocation metadata flag.
    writeCurrentSource('src/commands/team-onboarding.ts', tree)
    replaceExactly(
      path.join(tree, 'src/commands/team-onboarding.ts'),
      '  disableModelInvocation: true,\n',
      '',
      'target 2.1.108 team-onboarding metadata',
    )
    const teamCommandsPath = path.join(tree, 'src/commands.ts')
    replaceExactly(
      teamCommandsPath,
      "import tasks from './commands/tasks/index.js'\n",
      "import tasks from './commands/tasks/index.js'\nimport teamOnboarding from './commands/team-onboarding.js'\n",
      'target 2.1.108 team-onboarding registry import',
    )
    replaceExactly(
      teamCommandsPath,
      '  tasks,\n',
      '  tasks,\n  teamOnboarding,\n',
      'target 2.1.108 team-onboarding registry entry',
    )

    // The source-map partition places the target updater under /exit, but the
    // complete authenticated owner is the general update/relaunch pair.
    const frozenTarget108Update = '/tmp/late107-verify2.RUCieV/tree'
    for (const relative of [
      'src/commands/update/update.ts',
      'src/utils/relaunch.ts',
    ]) {
      writeExternalSource(frozenTarget108Update, relative, tree)
    }

    // Usage contributors were already live in the 2.1.108 bundle even though
    // the recovered snapshot lacked the authored component.  The component is
    // structurally unchanged in 2.1.116; install it and only its two reachability
    // edits in the historical Usage screen.
    writeCurrentSource('src/components/Settings/UsageContributors.tsx', tree)
    const usagePath = path.join(tree, 'src/components/Settings/Usage.tsx')
    replaceExactly(
      usagePath,
      "import { isEligibleForOverageCreditGrant, OverageCreditUpsell } from '../LogoV2/OverageCreditUpsell.js';\n",
      "import { isEligibleForOverageCreditGrant, OverageCreditUpsell } from '../LogoV2/OverageCreditUpsell.js';\nimport { UsageContributors } from './UsageContributors.js';\n",
      'target 2.1.108 usage-contributors import',
    )
    replaceExactly(
      usagePath,
      '      {utilization.extra_usage && <ExtraUsageSection extraUsage={utilization.extra_usage} maxWidth={maxWidth} />}\n',
      '      <UsageContributors maxWidth={maxWidth} />\n\n      {utilization.extra_usage && <ExtraUsageSection extraUsage={utilization.extra_usage} maxWidth={maxWidth} />}\n',
      'target 2.1.108 usage-contributors rendering',
    )

    // Monitor-backed sleep guidance and validation first become observable in
    // target 108.  The authored target-116 owners retain the same messages but
    // broaden a decimal duration from `N.N` to `N.` as well.  Apply the narrow
    // current hunks, then restore the target-108 `\d+` fractional tail.
    for (const relative of [
      'src/tools/BashTool/prompt.ts',
      'src/tools/BashTool/BashTool.tsx',
      'src/tools/PowerShellTool/prompt.ts',
      'src/tools/PowerShellTool/PowerShellTool.tsx',
    ]) {
      writeExternalSource(frozenTarget108, relative, tree)
    }

    // The 2.1.108 executable already contains plugin version constraints,
    // dependency materialization, rollback, and policy-managed cleanup.  Those
    // owners first became observable as source in the 2.1.110 recovery.  Copy
    // that target-backed implementation, then remove the only later semantic
    // evolution: sharing one ls-remote promise cache per install closure.
    for (const relative of [
      'src/types/plugin.ts',
      'src/utils/plugins/dependencyResolver.ts',
      'src/utils/plugins/pluginDependencyInstaller.ts',
      'src/utils/plugins/pluginInstallationHelpers.ts',
      'src/utils/plugins/pluginLoader.ts',
      'src/utils/plugins/pluginVersioning.ts',
      'src/utils/plugins/schemas.ts',
      'src/services/plugins/pluginOperations.ts',
    ]) {
      writeFromGit(repositoryRoot, '34ff410fe7339937986bccbb2eb848138bb0db1f', relative, tree)
    }
    const versioningPath = path.join(tree, 'src/utils/plugins/pluginVersioning.ts')
    replaceExactly(
      versioningPath,
      `  range: string,\n  lookupCache?: Map<string, Promise<string>>,\n): Promise<ResolvedGitTag | null> {`,
      `  range: string,\n): Promise<ResolvedGitTag | null> {`,
      'target 2.1.108 plugin version resolver signature',
    )
    replaceExactly(
      versioningPath,
      `  let lookup = lookupCache?.get(gitUrl)\n  if (lookup === undefined) {\n    lookup = execFileNoThrow(\n      'git',\n      [...GIT_SSH_ARGS, 'ls-remote', '--tags', '--', gitUrl],\n      { env: { ...process.env, ...GIT_ENV } },\n    ).then(result =>\n      result.code !== 0\n        ? Promise.reject(new Error(\`ls-remote exit \${result.code}\`))\n        : result.stdout,\n    )\n    lookupCache?.set(gitUrl, lookup)\n  }\n\n  let output: string\n  try {\n    output = await lookup\n  } catch (error) {\n    logForDebugging(\n      \`resolveVersionRange: ls-remote failed for \${gitUrl}: \${error instanceof Error ? error.message : String(error)}\`,\n    )\n    return null\n  }`,
      `  const { stdout: output, code } = await execFileNoThrow(\n    'git',\n    [...GIT_SSH_ARGS, 'ls-remote', '--tags', '--', gitUrl],\n    { env: { ...process.env, ...GIT_ENV } },\n  )\n  if (code !== 0) {\n    logForDebugging(\n      \`resolveVersionRange: ls-remote failed for \${gitUrl} (exit \${code})\`,\n    )\n    return null\n  }`,
      'target 2.1.108 uncached plugin version lookup',
    )
    const installationPath = path.join(
      tree,
      'src/utils/plugins/pluginInstallationHelpers.ts',
    )
    replaceExactly(
      installationPath,
      `    const pendingConstraints = new Map<string, string[]>()\n    const tagLookupCache = new Map<string, Promise<string>>()\n`,
      `    const pendingConstraints = new Map<string, string[]>()\n`,
      'target 2.1.108 plugin lookup cache declaration',
    )
    replaceExactly(
      installationPath,
      `            const resolved = await resolveVersionRange(\n              gitUrl,\n              info.entry.name,\n              intersection,\n              tagLookupCache,\n            )`,
      `            const resolved = await resolveVersionRange(\n              gitUrl,\n              info.entry.name,\n              intersection,\n            )`,
      'target 2.1.108 plugin lookup cache argument',
    )

    // The target's managed-plugin reconciliation is newer than both recovered
    // snapshots.  This is the final declaration in its module, so replace that
    // complete function rather than selecting diff hunks (which could retain a
    // duplicate declaration from the stale body).
    const managedMigrationRelative =
      'src/utils/plugins/installedPluginsManager.ts'
    const managedMigrationPath = path.join(tree, managedMigrationRelative)
    const managedMigrationMarker =
      'export async function migrateFromEnabledPlugins(): Promise<void> {'
    const historicalManaged = fs.readFileSync(managedMigrationPath, 'utf8')
    const currentManaged = fs.readFileSync(
      path.join(repositoryRoot, managedMigrationRelative),
      'utf8',
    )
    const historicalManagedIndex = historicalManaged.indexOf(managedMigrationMarker)
    const currentManagedIndex = currentManaged.indexOf(managedMigrationMarker)
    if (historicalManagedIndex < 0 || currentManagedIndex < 0) {
      throw new Error('target 2.1.108 managed-plugin migration anchor differs')
    }
    fs.writeFileSync(
      managedMigrationPath,
      historicalManaged.slice(0, historicalManagedIndex) +
        currentManaged.slice(currentManagedIndex),
    )
    // Authenticated target-108 persistence also carries the truthy
    // resolvedVersion field into the v2 installed-plugin entry.  Root's
    // focused reconstruction was made on this same historical tree after the
    // migration splice above, so use that frozen whole owner to retain both
    // behaviors without importing target-116-only manager changes.
    writeExternalSource(
      '/tmp/late107-final.Wu9dmo/tree',
      managedMigrationRelative,
      tree,
    )

    // Command-scoped Bash permission rules changed from the obsolete colon
    // spelling to the wildcard syntax in 2.1.108.  The later permission-context
    // accessor remains a current-tree evolution and is intentionally excluded.
    const commandRulesPatch = matchingWorkingTreePatch(
      ['src/commands/commit.ts', 'src/commands/commit-push-pr.ts'],
      /const ALLOWED_TOOLS|Bash\(git checkout -b \*\)|Bash\(git add \*\)/,
    )
    const commandRulesPatchPath = path.join(tree, '.case107-command-rules.patch')
    fs.writeFileSync(commandRulesPatchPath, commandRulesPatch)
    git(tree, ['apply', '--3way', commandRulesPatchPath])
    fs.unlinkSync(commandRulesPatchPath)

    // The target exposes per-server OAuth scope overrides and augments the
    // requested scope with offline_access only when the discovered server
    // advertises support.  Keep step-up scopes authoritative and persist them
    // only for the transport-attached provider path.
    const oauthScopePatch = matchingWorkingTreePatch(
      ['src/services/mcp/auth.ts', 'src/services/mcp/types.ts'],
      /configuredScope|Overrode authorization scope|Appended offline_access|appendOfflineAccessIfSupported|scopes: z\.string|_pendingStepUpScope/,
    )
    const oauthScopePatchPath = path.join(tree, '.case107-oauth-scopes.patch')
    fs.writeFileSync(oauthScopePatchPath, oauthScopePatch)
    git(tree, ['apply', '--3way', oauthScopePatchPath])
    fs.unlinkSync(oauthScopePatchPath)

    // Async-rewake hook labels are schema-visible in 2.1.108 even though the
    // executor currently treats them as pass-through metadata.
    const rewakePatch = matchingWorkingTreePatch(
      ['src/schemas/hooks.ts', 'src/utils/hooks.ts'],
      /rewakeMessage|rewakeSummary|TASK_NOTIFICATION_TAG|SUMMARY_TAG|escapeXml|Stop hook feedback|stopHookActive/,
    )
    const rewakePatchPath = path.join(tree, '.case107-rewake.patch')
    fs.writeFileSync(rewakePatchPath, rewakePatch)
    git(tree, ['apply', '--3way', rewakePatchPath])
    fs.unlinkSync(rewakePatchPath)

    // Search input becomes multiline/paste aware in target 108 and receives a
    // session-scoped kill ring. Install the latest behaviorally equivalent
    // reducer/store plus the event payload owner. The historical snapshot's
    // callers still subscribe through useInput, so retain that one adapter in
    // this independently materialized tree; the current target-116 owners are
    // wired directly through onKeyDown/onPaste.
    for (const relative of [
      'src/context/killRing.tsx',
      'src/ink/events/paste-event.ts',
      'src/hooks/useSearchInput.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    const historicalSearchPath = path.join(tree, 'src/hooks/useSearchInput.ts')
    replaceExactly(
      historicalSearchPath,
      "import type { PasteEvent } from '../ink/events/paste-event.js'\n",
      "import type { PasteEvent } from '../ink/events/paste-event.js'\n// Target-108 callers still use the input subscription while the event-prop migration lands.\nimport { useInput } from '../ink.js'\n",
      'target 2.1.108 search-input subscription import',
    )
    replaceExactly(
      historicalSearchPath,
      `  return {
    query,
    queryRef,`,
      `  useInput(
    (_input, _key, event) => {
      handleKeyDown(new KeyboardEvent(event.keypress))
    },
    { isActive },
  )

  return {
    query,
    queryRef,`,
      'target 2.1.108 search-input subscription',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/App.tsx'],
      /KillRingProvider/,
      'case107-kill-ring-provider',
    )

    // A freshly inserted printable character after an attachment pill gets a
    // lazy separating space, except for punctuation that belongs directly to
    // the pill. This exact punctuation inventory persists through target 116.
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/components/PromptInput/utils.ts',
        'src/components/PromptInput/PromptInput.tsx',
      ],
      /isLeadingPunctuation|\.,\?!:;\)\]|isNonSpacePrintable\(input, key\)/,
      'case107-prompt-input-punctuation',
    )

    // Target 108 avoids predictably oversized Git bundles before doing the
    // expensive --all/HEAD work and lets a squashed snapshot retain a
    // synthetic base parent. Start from the current superset, then remove the
    // later in-pack hard stop and no-change comparison so this tree records
    // the exact 108 boundary.
    writeCurrentSource('src/utils/teleport/gitBundle.ts', tree)
    const gitBundlePath = path.join(tree, 'src/utils/teleport/gitBundle.ts')
    replaceBetween(
      gitBundlePath,
      'async function getPackedRepositoryStats(',
      '// Bundle --all',
      `async function getPackedRepositorySize(
  gitRoot: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const result = await execFileNoThrowWithCwd(
    gitExe(),
    ['count-objects', '-v'],
    { cwd: gitRoot, abortSignal: signal },
  )
  if (result.code !== 0) return null
  const sizePack = result.stdout.match(/^size-pack:\\s*(\\d+)/m)
  return sizePack ? Number(sizePack[1]) * 1024 : null
}

// Bundle --all`,
      'target 2.1.108 packed repository helper',
    )
    replaceBetween(
      gitBundlePath,
      `  const { sizeBytes, inPackCount } = await getPackedRepositoryStats(
    gitRoot,
    signal,
  )`,
      '  // Last resort:',
      `  const sizeBytes = await getPackedRepositorySize(gitRoot, signal)
  const skipAll = sizeBytes !== null && sizeBytes > maxBytes
  const skipHead = sizeBytes !== null && sizeBytes > 3 * maxBytes

  if (skipAll && sizeBytes !== null) {
    logForDebugging(
      \`[gitBundle] size-pack \${(sizeBytes / 1024 / 1024).toFixed(0)}MB > \${(maxBytes / 1024 / 1024).toFixed(0)}MB cap; skipping --all\${skipHead ? ' and HEAD' : ''}\`,
    )
  } else {
    const allResult = await mkBundle('--all')
    if (allResult.code !== 0) {
      return {
        ok: false,
        error: \`git bundle create --all failed (\${allResult.code}): \${allResult.stderr.slice(0, 200)}\`,
        failReason: 'git_error',
      }
    }
    const { size: allSize } = await stat(bundlePath)
    if (allSize <= maxBytes) {
      return { ok: true, size: allSize, scope: 'all' }
    }
    logForDebugging(
      \`[gitBundle] --all bundle is \${(allSize / 1024 / 1024).toFixed(1)}MB (> \${(maxBytes / 1024 / 1024).toFixed(0)}MB), retrying HEAD-only\`,
    )
  }

  if (!skipHead) {
    const headResult = await mkBundle('HEAD')
    if (headResult.code !== 0) {
      return {
        ok: false,
        error: \`git bundle create HEAD failed (\${headResult.code}): \${headResult.stderr.slice(0, 200)}\`,
        failReason: 'git_error',
      }
    }
    const { size: headSize } = await stat(bundlePath)
    if (headSize <= maxBytes) {
      return { ok: true, size: headSize, scope: 'head' }
    }
    logForDebugging(
      \`[gitBundle] HEAD bundle is \${(headSize / 1024 / 1024).toFixed(1)}MB, retrying squashed-root\`,
    )
  }

  // Last resort:`,
      'target 2.1.108 bundle size fallback',
    )
    replaceBetween(
      gitBundlePath,
      `  if (baseRef) {
    const [treeResult, baseTreeResult] = await Promise.all(`,
      `  const commitTree = await execFileNoThrowWithCwd(`,
      `  if (baseRef) {
    const baseCommit = await execFileNoThrowWithCwd(
      gitExe(),
      ['commit-tree', \`\${baseRef}^{tree}\`, '-m', 'seed-base'],
      { cwd: gitRoot, abortSignal: signal },
    )
    if (baseCommit.code === 0) {
      parentArgs.push('-p', baseCommit.stdout.trim())
    } else {
      logForDebugging(
        \`[gitBundle] baseRef commit-tree failed (\${baseCommit.code}), squashing without parent: \${baseCommit.stderr.slice(0, 200)}\`,
      )
    }
  }
  const commitTree = await execFileNoThrowWithCwd(`,
      'target 2.1.108 baseRef parent',
    )

    // Target 108's PR-detail fetcher throws a precise gh failure before JSON
    // parsing and predates the additions/deletions payload added by 116.
    writeCurrentSource('src/utils/ghPrStatus.ts', tree)
    const ghPrPath = path.join(tree, 'src/utils/ghPrStatus.ts')
    let ghPr = fs.readFileSync(ghPrPath, 'utf8')
    ghPr = ghPr
      .replace('  additions: number\n  deletions: number\n', '')
      .replace(
        'number,title,state,isDraft,statusCheckRollup,reviewDecision,mergeStateStatus,additions,deletions',
        'number,title,state,isDraft,statusCheckRollup,reviewDecision,mergeStateStatus',
      )
      .replace(
        '    if (code !== 0 || !stdout.trim()) return null\n    try {\n      const data = jsonParse(stdout) as {\n        number: number\n        title: string',
        "    if (code !== 0 || !stdout.trim()) {\n      throw new Error(`gh pr view failed (exit ${code})`)\n    }\n    try {\n      const data = jsonParse(stdout) as {\n        number: number\n        title: string",
      )
      .replace('        additions: number\n        deletions: number\n', '')
      .replace('        additions: data.additions,\n        deletions: data.deletions,\n', '')
    if (
      ghPr.includes('additions: data.additions') ||
      !ghPr.includes('gh pr view failed (exit ${code})')
    ) {
      throw new Error('target 2.1.108 PR-details downgrade anchors differ')
    }
    fs.writeFileSync(ghPrPath, ghPr)

    // A compact operation discards the persistent REPL VM.  The target tells
    // the model explicitly so it does not attempt to reuse pre-compact values.
    const compactReplPatch = matchingWorkingTreePatch(
      ['src/services/compact/prompt.ts', 'src/services/compact/compact.ts'],
      /replVmWasCleared|Your REPL VM state has been cleared|replContexts\[/,
    )
    const compactReplPatchPath = path.join(tree, '.case107-compact-repl.patch')
    fs.writeFileSync(compactReplPatchPath, compactReplPatch)
    git(tree, ['apply', '--3way', compactReplPatchPath])
    fs.unlinkSync(compactReplPatchPath)

    // Worktree enter/exit mutate process-wide cwd and therefore reject calls
    // made under a subagent cwd override; Enter also rejects nested sessions.
    const worktreeGuardPatch = matchingWorkingTreePatch(
      [
        'src/utils/cwd.ts',
        'src/tools/EnterWorktreeTool/EnterWorktreeTool.ts',
        'src/tools/ExitWorktreeTool/ExitWorktreeTool.ts',
      ],
      /hasCwdOverride|cannot be called from a subagent|Already in a worktree session/,
    )
    const worktreeGuardPatchPath = path.join(tree, '.case107-worktree-guards.patch')
    fs.writeFileSync(worktreeGuardPatchPath, worktreeGuardPatch)
    git(tree, ['apply', '--3way', worktreeGuardPatchPath])
    fs.unlinkSync(worktreeGuardPatchPath)

    // The executable switches plugin subcommands from untracked console
    // writes to an Ink root with patchConsole disabled.  The target-108 and
    // target-116 handlers are alpha-equivalent, including suspense progress,
    // waitUntilExit gates, and the intentionally non-Ink update command.
    for (const relative of [
      'src/cli/handlers/plugins.ts',
      'src/services/plugins/pluginCliCommands.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/handlers/util.tsx'],
      /createSubcommandRoot|getBaseRenderOptions|createRoot/,
      'case107-plugin-root-helper',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/main.tsx'],
      /createSubcommandRoot|pluginValidateHandler\(await|pluginListHandler\(await|marketplaceAddHandler\(await|marketplaceListHandler\(await|marketplaceRemoveHandler\(await|marketplaceUpdateHandler\(await|pluginInstallHandler\(await|pluginUninstallHandler\(await|pluginEnableHandler\(await|pluginDisableHandler\(await/,
      'case107-plugin-registration',
    )

    // REPL feature selection and context identity were present in the target
    // but absent from the recovered source.  This owner is unchanged through
    // 2.1.116: Bun-only, explicit env override, then the rollout flag for the
    // interactive/remote entrypoints, with the exact five-tool allowlist.
    writeCurrentSource('src/tools/REPLTool/constants.ts', tree)

    // REPL inner-tool progress is part of the target-108 runtime surface, not
    // merely a presentation detail. Background main sessions and local agents
    // record the inner operation (while suppressing the outer REPL wrapper),
    // and SDK consumers receive the structured repl_call progress envelope.
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/tasks/LocalMainSessionTask.ts',
        'src/tasks/LocalAgentTask/LocalAgentTask.tsx',
        'src/utils/queryHelpers.ts',
      ],
      /REPL_TOOL_NAME|repl_tool_call|inner_tool_name|content\.name !== REPL_TOOL_NAME/,
      'case107-repl-progress-call-path',
    )

    // Target 108 exposes the signed-in account address to the prompt unless
    // the Unix-socket transport is active, and records only the boolean
    // presence in diagnostics.  This changed function also retains the
    // target-91 date-proxy punctuation algorithm, so carry the complete
    // target-backed current hunk into this independently materialized tree.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/context.ts'],
      /getOauthAccountInfo|has_user_email|The user's email address|DATE_PROXY_XOR_KEY|formatCurrentDateForContext/,
      'case107-user-context-email',
    )

    // The published target centralizes all build-gated settings surfaces in a
    // five-entry registry consumed by both the settings and permissions
    // schemas. Restore the registry and its exact call path; the previously
    // recovered monolithic fields remain harmless type-inference aliases and
    // the final registry spread is authoritative at runtime.
    writeCurrentSource('src/utils/settings/featureRegistry.ts', tree)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/settings/types.ts'],
      /featureRegistry|getEnabledSettingFeatures|getSettingFeaturePermissionModes|getSettingFeaturePermissionsShape|getSettingFeatureShape|buildPermissionsSchema|buildSettingsSchema/,
      'case107-settings-feature-registry',
    )

    // Target 108 introduces hash-backed file state. Bodies larger than 4 KiB
    // are evicted while their hash/length remain usable for stale-file checks;
    // injected memory files retain full content for changed-file diffs. The
    // resync owner was already runtime-live but absent from the target commit,
    // so install its complete current-equivalent owner as inherited coverage.
    writeCurrentSource('src/utils/fileStateCache.ts', tree)
    writeCurrentSource('src/utils/toolErrors.ts', tree)
    // Tool-result de-duplication is a reachable target-108 runtime, not a
    // stream helper.  The target keeps the monotonically increasing result
    // id across compaction (only the seen-content map is cleared), while a
    // full conversation clear resets both fields.  Install the exact owner
    // and its complete execution/fork/REPL/compact call graph without leaking
    // the later QueryEngine integration or target-116 compact reset contract.
    replaceExactly(
      path.join(tree, 'src/utils/toolErrors.ts'),
      '  state?.seen.clear()\n  if (state) state.counter = 0\n',
      '  state?.seen.clear()\n',
      'target 2.1.108 compact dedup reset semantics',
    )

    replaceExactly(
      path.join(tree, 'src/Tool.ts'),
      "import type { ContentReplacementState } from './utils/toolResultStorage.js'\n",
      "import type { ContentReplacementState } from './utils/toolResultStorage.js'\nimport type { ToolResultDedupState } from './utils/toolErrors.js'\n",
      'target 2.1.108 dedup context type import',
    )
    replaceExactly(
      path.join(tree, 'src/Tool.ts'),
      '  contentReplacementState?: ContentReplacementState\n  /**\n   * Parent\'s rendered system prompt bytes, frozen at turn start.',
      '  contentReplacementState?: ContentReplacementState\n  /** Per-conversation state for replacing repeated tool results. */\n  resultDedupState?: ToolResultDedupState\n  /**\n   * Parent\'s rendered system prompt bytes, frozen at turn start.',
      'target 2.1.108 dedup context field',
    )

    replaceExactly(
      path.join(tree, 'src/services/tools/toolExecution.ts'),
      'import {\n  formatError,\n  formatZodValidationError,\n} from \'../../utils/toolErrors.js\'\n',
      'import {\n  applyToolResultDedup,\n  formatError,\n  formatZodValidationError,\n} from \'../../utils/toolErrors.js\'\n',
      'target 2.1.108 tool execution dedup import',
    )
    replaceExactly(
      path.join(tree, 'src/services/tools/toolExecution.ts'),
      `    const mappedToolResultBlock = tool.mapToolResultToToolResultBlockParam(
      result.data,
      toolUseID,
    )
    const mappedContent = mappedToolResultBlock.content`,
      `    const rawMappedToolResultBlock = tool.mapToolResultToToolResultBlockParam(
      result.data,
      toolUseID,
    )
    const mappedToolResultBlock = isMcpTool(tool)
      ? rawMappedToolResultBlock
      : applyToolResultDedup(
          rawMappedToolResultBlock,
          tool.name,
          toolUseContext.resultDedupState,
          tool.maxResultSizeChars,
        )
    const mappedContent = rawMappedToolResultBlock.content`,
      'target 2.1.108 tool execution dedup call',
    )

    replaceExactly(
      path.join(tree, 'src/utils/forkedAgent.ts'),
      "import { createAgentId } from './uuid.js'\n",
      "import { createToolResultDedupState } from './toolErrors.js'\nimport { createAgentId } from './uuid.js'\n",
      'target 2.1.108 fork dedup import',
    )
    replaceExactly(
      path.join(tree, 'src/utils/forkedAgent.ts'),
      '    loadedNestedMemoryPaths: new Set<string>(),\n    dynamicSkillDirTriggers: new Set<string>(),',
      '    loadedNestedMemoryPaths: new Set<string>(),\n    resultDedupState: createToolResultDedupState(),\n    dynamicSkillDirTriggers: new Set<string>(),',
      'target 2.1.108 fork dedup state',
    )

    const target108Repl = path.join(tree, 'src/screens/REPL.tsx')
    replaceExactly(
      target108Repl,
      "import { provisionContentReplacementState, reconstructContentReplacementState, type ContentReplacementRecord } from '../utils/toolResultStorage.js';\n",
      "import { provisionContentReplacementState, reconstructContentReplacementState, type ContentReplacementRecord } from '../utils/toolResultStorage.js';\nimport { resetToolResultDedupState, restoreToolResultDedupState } from '../utils/toolErrors.js';\n",
      'target 2.1.108 REPL dedup imports',
    )
    replaceExactly(
      target108Repl,
      `  const [contentReplacementStateRef] = useState(() => ({
    current: provisionContentReplacementState(initialMessages, initialContentReplacements)
  }));`,
      `  const [contentReplacementStateRef] = useState(() => ({
    current: provisionContentReplacementState(initialMessages, initialContentReplacements)
  }));
  const [resultDedupStateRef] = useState(() => ({
    current: restoreToolResultDedupState(initialMessages ?? [])
  }));`,
      'target 2.1.108 REPL dedup state',
    )
    replaceExactly(
      target108Repl,
      '      contentReplacementState: contentReplacementStateRef.current\n    };',
      '      contentReplacementState: contentReplacementStateRef.current,\n      resultDedupState: resultDedupStateRef.current\n    };',
      'target 2.1.108 REPL tool context dedup state',
    )
    replaceExactly(
      target108Repl,
      '          setConversationId\n        });',
      '          setConversationId,\n          resultDedupState: resultDedupStateRef.current\n        });',
      'target 2.1.108 primary clear dedup state',
    )
    replaceExactly(
      target108Repl,
      '                setConversationId\n              });',
      '                setConversationId,\n                resultDedupState: resultDedupStateRef.current\n              });',
      'target 2.1.108 idle clear dedup state',
    )
    replaceExactly(
      target108Repl,
      '    resetMicrocompactState();\n',
      '    resetMicrocompactState();\n    resetToolResultDedupState(resultDedupStateRef.current);\n',
      'target 2.1.108 rewind dedup reset',
    )

    const target108Clear = path.join(tree, 'src/commands/clear/conversation.ts')
    replaceExactly(
      target108Clear,
      "import { getCurrentWorktreeSession } from '../../utils/worktree.js'\n",
      "import { getCurrentWorktreeSession } from '../../utils/worktree.js'\nimport { resetToolResultDedupState, type ToolResultDedupState } from '../../utils/toolErrors.js'\n",
      'target 2.1.108 clear dedup imports',
    )
    replaceExactly(
      target108Clear,
      '  setConversationId,\n}: {',
      '  setConversationId,\n  resultDedupState,\n}: {',
      'target 2.1.108 clear dedup argument',
    )
    replaceExactly(
      target108Clear,
      '  setConversationId?: (id: UUID) => void\n}): Promise<void> {',
      '  setConversationId?: (id: UUID) => void\n  resultDedupState?: ToolResultDedupState\n}): Promise<void> {',
      'target 2.1.108 clear dedup type',
    )
    replaceExactly(
      target108Clear,
      '  loadedNestedMemoryPaths?.clear()\n\n  // Clean out necessary items from App State',
      '  loadedNestedMemoryPaths?.clear()\n  resetToolResultDedupState(resultDedupState)\n  if (resultDedupState) resultDedupState.counter = 0\n\n  // Clean out necessary items from App State',
      'target 2.1.108 clear dedup reset',
    )

    for (const relative of [
      'src/services/compact/autoCompact.ts',
      'src/commands/compact/compact.ts',
    ]) {
      applyMatchingWorkingTreePatch(
        tree,
        [relative],
        /resetToolResultDedupState|context\.resultDedupState|toolUseContext\.resultDedupState/,
        `case107-dedup-compact-${path.basename(relative, path.extname(relative))}`,
      )
    }

    // QueryEngine did not own a de-dup state until a later target.  The frozen
    // REPL-tool handoff accidentally carried property assignments without the
    // corresponding class state; remove those later-only assignments here.
    const target108QueryEngine = path.join(tree, 'src/QueryEngine.ts')
    let target108QueryEngineSource = fs.readFileSync(target108QueryEngine, 'utf8')
    target108QueryEngineSource = target108QueryEngineSource
      .replace(/\n      resultDedupState: this\.resultDedupState,/g, '')
      .replace(/\n      memorySelector: this\.memorySelector,/g, '')
      .replace(/\n      bashRerunAliases: this\.bashRerunAliases,/g, '')
    if (
      /this\.(?:resultDedupState|memorySelector|bashRerunAliases)/.test(
        target108QueryEngineSource,
      )
    ) {
      throw new Error('target 2.1.108 QueryEngine later-state downgrade differs')
    }
    fs.writeFileSync(target108QueryEngine, target108QueryEngineSource)
    // Target 108 makes both lazy proper-lockfile release functions usable by
    // explicit resource management (`await using` / `using`) while preserving
    // their callable release API.
    writeCurrentSource('src/utils/lockfile.ts', tree)
    // The bundled proto and first-party exporter introduce the privileged
    // REPL-code column together.  The exporter removes _PROTO_code from the
    // general metadata blob and forwards it only through repl_code.
    writeCurrentSource(
      'src/types/generated/events_mono/claude_code/v1/claude_code_internal_event.ts',
      tree,
    )
    writeCurrentSource(
      'src/services/analytics/firstPartyEventLoggingExporter.ts',
      tree,
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/attachments.ts'],
      /fileStateMatchesContent|keepContent: true/,
      'case107-file-state-attachments',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/FileWriteTool/FileWriteTool.ts'],
      /fileStateMatchesContent/,
      'case107-file-state-write',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/FileEditTool/FileEditTool.ts'],
      /fileStateMatchesContent/,
      'case107-file-state-edit',
    )

    // The nested voice configuration is already schema-visible in 2.1.108.
    // Its authored shape is retained in 2.1.116, while the internal launch
    // description is later rewritten for the public voice-mode wording.  Copy
    // only this field and restore the exact target-108 description.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/settings/types.ts'],
      /voice: z|tap-to-toggle dictation|autoSubmit:/,
      'case107-voice-settings',
    )
    replaceExactly(
      path.join(tree, 'src/utils/settings/types.ts'),
      ".describe('Voice mode settings (hold-to-talk / tap-to-toggle dictation)'),",
      ".describe('@internal Voice handsfree settings; behavior gated at read sites by feature(VOICE_HANDSFREE). Hidden from public SDK types until external launch; see TODO on voiceEnabled in entitlements.ts.'),",
      'target 2.1.108 voice settings description',
    )

    // First-party analytics exposes coachMode as a Datadog tag and maps it to
    // the one-party coach_mode field.  Do not carry the unrelated later
    // Datadog token hunk into this historical tree.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/analytics/datadog.ts', 'src/services/analytics/metadata.ts'],
      /coachMode|coach_mode/,
      'case107-coach-mode',
    )

    // Synchronous headless plugin installation is externally observable over
    // stream-json: one started/completed bracket plus per-marketplace
    // installed/failed frames.  Keep the schema and runtime progression
    // together so this target tree is independently executable.
    writeCurrentSource('src/utils/plugins/headlessPluginInstall.ts', tree)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/entrypoints/sdk/coreSchemas.ts'],
      /SDKPluginInstallMessageSchema|plugin_install|Headless plugin installation progress/,
      'case107-plugin-install-schema',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/print.ts'],
      /pluginInstallProgress|plugin_install|installPluginsAndApplyMcpInBackground\(|installPluginsForHeadless\(onProgress\)/,
      'case107-plugin-install-stream',
    )

    // Skills created or improved by dream-proposal retain provenance through
    // parsing, command construction, invocation, and load/invoke telemetry.
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/types/command.ts',
        'src/skills/loadSkillsDir.ts',
        'src/utils/telemetry/pluginTelemetry.ts',
        'src/tools/SkillTool/SkillTool.ts',
        'src/utils/processUserInput/processSlashCommand.tsx',
        'src/utils/telemetry/skillLoadedEvent.ts',
      ],
      /createdBy|created_by|improved_by|buildSkillTelemetryFields|skill_created_by/,
      'case107-dream-skill-provenance',
    )

    // The bridge now publishes structured pending-action details.  Target 108
    // uses the raw tool name and intentionally omits tool_use_id from the CCR
    // worker-state projection (the latter is introduced in target 110).
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/sessionState.ts'],
      /raw_command/,
      'case107-bridge-details-type',
    )
    const transportPath = path.join(tree, 'src/bridge/replBridgeTransport.ts')
    replaceExactly(
      transportPath,
      "import type { SessionState } from '../utils/sessionState.js'",
      "import type {\n  RequiresActionDetails,\n  SessionState,\n} from '../utils/sessionState.js'",
      'target 2.1.108 bridge transport details import',
    )
    replaceExactly(
      transportPath,
      '  reportState(state: SessionState): void',
      '  reportState(state: SessionState, details?: RequiresActionDetails): void',
      'target 2.1.108 bridge transport details signature',
    )
    replaceExactly(
      transportPath,
      `    reportState(state) {
      ccr.reportState(state)
    },`,
      `    reportState(state, details) {
      ccr.reportState(state, details)
    },`,
      'target 2.1.108 bridge transport details forwarding',
    )
    // remoteBridgeCore.ts is copied above from the authenticated target-108
    // owner, including the raw tool-name action details branch.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/transports/ccrClient.ts'],
      /raw_command|tool_use_id/,
      'case107-ccr-raw-command',
    )
    const ccrPath = path.join(tree, 'src/cli/transports/ccrClient.ts')
    replaceExactly(
      ccrPath,
      '              request_id: details.request_id,\n              tool_use_id: details.tool_use_id,',
      '              request_id: details.request_id,',
      'target 2.1.108 CCR details omit tool_use_id',
    )

    // Remote Control status links and their transcript UI changed together in
    // target 108.  The URL query key is `environment` (not the stale
    // `bridge` spelling), and the status message is a single compact line with
    // an inline link plus a separately indented upgrade nudge.  The same
    // functions are structurally unchanged in target 116.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/bridge/bridgeStatusUtil.ts'],
      /code\?environment=/,
      'case107-bridge-status-url',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/messages/SystemTextMessage.tsx'],
      /remote-control is active|Code in CLI or at|⎿  /,
      'case107-bridge-status-message',
    )

    // Target 108 replaces the process-global official MCP URL variable with
    // an explicit state holder while retaining the visibility/BFF fetch,
    // telemetry, pagination, and fail-closed lookup behavior introduced in
    // target 101.  The state-safe owner remains equivalent in target 116.
    writeCurrentSource('src/services/mcp/officialRegistry.ts', tree)

    // The CLI highlight helpers are present in the target commit already, but
    // their bundled functions sit beside a source-map partition boundary and
    // therefore have no reliable generated owner attribution.  Reinstalling
    // the tracked owner is unnecessary; the strict semantic test pins the
    // exact recursive emitter traversal, language guard, singleton promise,
    // and extension-to-language-name functions to this authored file.

    // Target 108 replaces the monolithic awaited headless MCP connection with
    // per-server readiness promises and bounded remote retries.  This is a
    // first-party runtime delta (bundle functions Sw5/JOA): failed http/sse/
    // claudeai-proxy servers retry after 500/1500/4000ms, clear the memoized
    // connector first, and dispose a late client when its pending row vanished.
    // MCP_CONNECTION_NONBLOCKING starts the same work but skips both five-second
    // readiness waits; regular servers still start before claude.ai connectors.
    const mcpMainPath = path.join(tree, 'src/main.tsx')
    replaceExactly(
      mcpMainPath,
      "import { clearServerCache } from 'src/services/mcp/client.js';",
      "import { clearServerCache, connectToServer, getServerCacheKey } from 'src/services/mcp/client.js';",
      'target 2.1.108 MCP retry imports',
    )
    replaceBetween(
      mcpMainPath,
      '      // Print-mode MCP: per-server incremental push into headlessStore.',
      "      profileCheckpoint('after_connectMcp_claudeai');",
      `      // Print-mode MCP: each configured server exposes an independent
      // readiness promise. Slow servers keep connecting in the background.
      const MCP_CONNECTION_TIMEOUT_MS = 5_000;
      const MCP_REMOTE_RETRY_DELAYS_MS = [500, 1_500, 4_000];
      const RETRYABLE_REMOTE_MCP_TYPES = new Set([
        'http',
        'sse',
        'claudeai-proxy'
      ]);

      function connectMcpBatch(configs: Record<string, ScopedMcpServerConfig>, label: string): Promise<void>[] {
        const names = Object.keys(configs);
        if (names.length === 0) return [];
        headlessStore.setState(prev => ({
          ...prev,
          mcp: {
            ...prev.mcp,
            clients: [...prev.mcp.clients, ...Object.entries(configs).map(([name, config]) => ({
              name,
              type: 'pending' as const,
              config
            }))]
          }
        }));
        const readinessResolvers = new Map<string, () => void>();
        const readiness = names.map(name => new Promise<void>(resolveReady => {
          readinessResolvers.set(name, resolveReady);
        }));
        void getMcpToolsCommandsAndResources(({ client, tools: connectedTools, commands: connectedCommands }) => {
          headlessStore.setState(prev => ({
            ...prev,
            mcp: {
              ...prev.mcp,
              clients: prev.mcp.clients.some(existing => existing.name === client.name) ? prev.mcp.clients.map(existing => existing.name === client.name ? client : existing) : [...prev.mcp.clients, client],
              tools: uniqBy([...prev.mcp.tools, ...connectedTools], 'name'),
              commands: uniqBy([...prev.mcp.commands, ...connectedCommands], 'name')
            }
          }));
          readinessResolvers.get(client.name)?.();
        }, configs).catch(err => {
          logForDebugging(\`[MCP] \${label} connect error: \${err}\`);
        }).finally(() => {
          for (const resolveReady of readinessResolvers.values()) resolveReady();
          if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_mcp_retry_failed_remote', true)) {
            void retryFailedRemoteMcpServers(configs).catch(err => {
              logForDebugging(\`[MCP] \${label} retry error: \${err}\`);
            });
          }
        });
        return readiness;
      }

      async function retryFailedRemoteMcpServers(configs: Record<string, ScopedMcpServerConfig>): Promise<void> {
        const retryable = Object.entries(configs).filter(([, config]) => RETRYABLE_REMOTE_MCP_TYPES.has(config.type ?? ''));
        if (retryable.length === 0) return;
        for (const delayMs of MCP_REMOTE_RETRY_DELAYS_MS) {
          await new Promise<void>(resolveDelay => setTimeout(resolveDelay, delayMs));
          const failed = retryable.filter(([name]) => headlessStore.getState().mcp.clients.some(client => client.name === name && client.type === 'failed'));
          if (failed.length === 0) {
            logForDebugging('[MCP] Retry: all remote servers connected, stopping');
            return;
          }
          logForDebugging(\`[MCP] Retry: \${failed.length} failed remote server(s) after \${delayMs}ms backoff\`);
          for (const [name, config] of failed) {
            connectToServer.cache.delete(getServerCacheKey(name, config));
          }
          await getMcpToolsCommandsAndResources(({ client, tools: connectedTools, commands: connectedCommands }) => {
            headlessStore.setState(prev => {
              if (!prev.mcp.clients.some(existing => existing.name === client.name)) {
                if (client.type === 'connected') {
                  void clearServerCache(client.name, client.config).catch(() => {});
                }
                return prev;
              }
              return {
                ...prev,
                mcp: {
                  ...prev.mcp,
                  clients: prev.mcp.clients.map(existing => existing.name === client.name ? client : existing),
                  tools: uniqBy([...prev.mcp.tools, ...connectedTools], 'name'),
                  commands: uniqBy([...prev.mcp.commands, ...connectedCommands], 'name')
                }
              };
            });
          }, Object.fromEntries(failed));
        }
        const stillFailed = retryable.filter(([name]) => headlessStore.getState().mcp.clients.some(client => client.name === name && client.type === 'failed'));
        if (stillFailed.length > 0) {
          logForDebugging(\`[MCP] Retry: \${stillFailed.length} remote server(s) still failed after all retries: \${stillFailed.map(([name]) => name).join(', ')}\`);
        }
      }

      async function waitForMcpReadiness(readiness: Promise<void>[], timeoutMs: number): Promise<number> {
        if (readiness.length === 0) return 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<'deadline'>(resolveDeadline => {
          timer = setTimeout(result => result('deadline'), timeoutMs, resolveDeadline);
        });
        try {
          const results = await Promise.all(readiness.map(connection => Promise.race([
            connection.then(() => 'settled' as const, () => 'settled' as const),
            deadline
          ])));
          return results.filter(result => result === 'deadline').length;
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      async function connectWithMcpDeadline(nonblocking: boolean, connection: Promise<void>[] | Promise<Promise<void>[]>, label: string): Promise<void> {
        if (nonblocking) {
          void Promise.resolve(connection).catch(() => {});
          logForDebugging(\`[MCP] \${label} running fully async (MCP_CONNECTION_NONBLOCKING)\`);
          return;
        }
        const startedAt = Date.now();
        let readiness: Promise<void>[];
        if (Array.isArray(connection)) {
          readiness = connection;
        } else {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const result = await Promise.race([connection, new Promise<'deadline'>(resolveDeadline => {
            timer = setTimeout(value => value('deadline'), MCP_CONNECTION_TIMEOUT_MS, resolveDeadline);
          })]);
          if (timer) clearTimeout(timer);
          if (result === 'deadline') {
            connection.catch(() => {});
            logForDebugging(\`[MCP] \${label} not ready after \${MCP_CONNECTION_TIMEOUT_MS}ms — proceeding; background connection continues\`);
            return;
          }
          readiness = result;
        }
        const remainingMs = Math.max(0, MCP_CONNECTION_TIMEOUT_MS - (Date.now() - startedAt));
        const notReady = await waitForMcpReadiness(readiness, remainingMs);
        if (notReady > 0) {
          logForDebugging(\`[MCP] \${label}: \${notReady}/\${readiness.length} not ready after \${MCP_CONNECTION_TIMEOUT_MS}ms — proceeding; background connection continues\`);
        }
      }

      function connectClaudeAiMcp(claudeaiConfigs: Record<string, ScopedMcpServerConfig>): Promise<void>[] {
        if (Object.keys(claudeaiConfigs).length > 0) {
          const claudeaiSigs = new Set<string>();
          for (const config of Object.values(claudeaiConfigs)) {
            const sig = getMcpServerSignature(config);
            if (sig) claudeaiSigs.add(sig);
          }
          const suppressed = new Set<string>();
          for (const [name, config] of Object.entries(regularMcpConfigs)) {
            if (!name.startsWith('plugin:')) continue;
            const sig = getMcpServerSignature(config);
            if (sig && claudeaiSigs.has(sig)) suppressed.add(name);
          }
          if (suppressed.size > 0) {
            logForDebugging(\`[MCP] Lazy dedup: suppressing \${suppressed.size} plugin server(s) that duplicate claude.ai connectors: \${[...suppressed].join(', ')}\`);
            for (const client of headlessStore.getState().mcp.clients) {
              if (!suppressed.has(client.name) || client.type !== 'connected') continue;
              client.client.onclose = undefined;
              void clearServerCache(client.name, client.config).catch(() => {});
            }
            headlessStore.setState(prev => {
              let { clients, tools: currentTools, commands: currentCommands, resources } = prev.mcp;
              clients = clients.filter(client => !suppressed.has(client.name));
              currentTools = currentTools.filter(tool => !tool.mcpInfo || !suppressed.has(tool.mcpInfo.serverName));
              for (const name of suppressed) {
                currentCommands = excludeCommandsByServer(currentCommands, name);
                resources = excludeResourcesByServer(resources, name);
              }
              return {
                ...prev,
                mcp: {
                  ...prev.mcp,
                  clients,
                  tools: currentTools,
                  commands: currentCommands,
                  resources
                }
              };
            });
          }
        }
        const nonPluginConfigs = pickBy(regularMcpConfigs, (_, name) => !name.startsWith('plugin:'));
        const { servers: dedupedClaudeAi } = dedupClaudeAiMcpServers(claudeaiConfigs, nonPluginConfigs);
        return connectMcpBatch(dedupedClaudeAi, 'claudeai');
      }

      const mcpConnectionNonblocking = isEnvTruthy(process.env.MCP_CONNECTION_NONBLOCKING);
      profileCheckpoint('before_connectMcp');
      await connectWithMcpDeadline(mcpConnectionNonblocking, connectMcpBatch(regularMcpConfigs, 'regular'), '--mcp-config servers');
      await connectWithMcpDeadline(mcpConnectionNonblocking, claudeaiConfigPromise.then(connectClaudeAiMcp), 'claude.ai connectors');
      profileCheckpoint('after_connectMcp_claudeai');`,
      'target 2.1.108 headless MCP coordinator',
    )

    // Four observable permission examples still used the pre-108 colon
    // spelling in the recovered source.  The executable consistently exposes
    // the command-prefix wildcard grammar in prompts, CLI help, and defaults.
    const verifierPromptPath = path.join(tree, 'src/commands/init-verifiers.ts')
    let verifierPrompt = fs.readFileSync(verifierPromptPath, 'utf8')
    for (const command of ['npm', 'yarn', 'pnpm', 'bun', 'asciinema', 'curl', 'http']) {
      verifierPrompt = verifierPrompt.replaceAll(
        `Bash(${command}:*)`,
        `Bash(${command} *)`,
      )
    }
    fs.writeFileSync(verifierPromptPath, verifierPrompt)
    const securityReviewPath = path.join(tree, 'src/commands/security-review.ts')
    fs.writeFileSync(
      securityReviewPath,
      fs.readFileSync(securityReviewPath, 'utf8').replaceAll(':*)', ' *)'),
    )
    replaceExactly(
      path.join(tree, 'src/components/permissions/rules/PermissionRuleInput.tsx'),
      '          ruleContent: "ls:*"',
      '          ruleContent: "ls *"',
      'target 2.1.108 permission-rule default',
    )
    replaceExactly(
      path.join(tree, 'src/components/permissions/rules/PermissionRuleDescription.tsx'),
      '          if (ruleValue.ruleContent.endsWith(":*")) {',
      '          if (ruleValue.ruleContent.endsWith(":*") || ruleValue.ruleContent.endsWith(" *")) {',
      'target 2.1.108 permission-rule wildcard display',
    )
    const shellPermissionHelpersPath = path.join(
      tree,
      'src/components/permissions/shellPermissionHelpers.tsx',
    )
    let shellPermissionHelpers = fs.readFileSync(
      shellPermissionHelpersPath,
      'utf8',
    )
    shellPermissionHelpers = shellPermissionHelpers.replace(
      'const command = permissionRuleExtractPrefix(rule.ruleContent) ?? rule.ruleContent;',
      'const command = rule.ruleContent.endsWith(":*") || rule.ruleContent.endsWith(" *")\n      ? rule.ruleContent.slice(0, -2)\n      : rule.ruleContent;',
    )
    if (!shellPermissionHelpers.includes('rule.ruleContent.endsWith(" *")')) {
      throw new Error('target 2.1.108 shell wildcard display transform not applied')
    }
    fs.writeFileSync(shellPermissionHelpersPath, shellPermissionHelpers)
    const bashOptionsPath = path.join(
      tree,
      'src/components/permissions/BashPermissionRequest/bashToolUseOptions.tsx',
    )
    let bashOptions = fs.readFileSync(bashOptionsPath, 'utf8')
    bashOptions = bashOptions
      .replace('e.g., "npm run:*"', 'e.g., "npm run *"')
      .replace("placeholder: 'command prefix (e.g., npm run:*)'", "placeholder: 'command prefix (e.g., npm run *)'")
    if (!bashOptions.includes("placeholder: 'command prefix (e.g., npm run *)'")) {
      throw new Error('target 2.1.108 Bash wildcard placeholder not applied')
    }
    fs.writeFileSync(bashOptionsPath, bashOptions)
    const bashPermissionPath = path.join(
      tree,
      'src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx',
    )
    let bashPermission = fs.readFileSync(bashPermissionPath, 'utf8')
    bashPermission = bashPermission
      .replace('return `${two}:*`', 'return `${two} *`')
      .replace('return `${one}:*`', 'return `${one} *`')
      .replace('setEditablePrefix(`${prefixes[0]}:*`)', 'setEditablePrefix(`${prefixes[0]} *`)')
    if (!bashPermission.includes('return `${two} *`') || !bashPermission.includes('setEditablePrefix(`${prefixes[0]} *`)')) {
      throw new Error('target 2.1.108 Bash wildcard suggestion graph not applied')
    }
    fs.writeFileSync(bashPermissionPath, bashPermission)
    const powershellPermissionPath = path.join(
      tree,
      'src/components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx',
    )
    let powershellPermission = fs.readFileSync(powershellPermissionPath, 'utf8')
    powershellPermission = powershellPermission.replace(
      'setEditablePrefix(`${prefixes[0]}:*`)',
      'setEditablePrefix(`${prefixes[0]} *`)',
    )
    if (!powershellPermission.includes('setEditablePrefix(`${prefixes[0]} *`)')) {
      throw new Error('target 2.1.108 PowerShell wildcard suggestion not applied')
    }
    fs.writeFileSync(powershellPermissionPath, powershellPermission)
    const exitPlanPermissionPath = path.join(
      tree,
      'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
    )
    let exitPlanPermission = fs.readFileSync(exitPlanPermissionPath, 'utf8')
    exitPlanPermission = exitPlanPermission
      .replace("import figures from 'figures';\n", '')
      .replace(
        "import { cacheImagePath, storeImage } from '../../../utils/imageStore.js';",
        "import { cacheImagePath, storeImage } from '../../../utils/imageStore.js';\nimport { StatusIcon } from '../../design-system/StatusIcon.js';",
      )
      .replaceAll(
        '<Text color="success">{figures.tick}Plan saved!</Text>',
        '<Text color="success"><StatusIcon status="success" withSpace />Plan saved!</Text>',
      )
    if ((exitPlanPermission.match(/withSpace \/>Plan saved!/g) ?? []).length !== 2) {
      throw new Error('target 2.1.108 plan-save StatusIcon graph not applied')
    }
    fs.writeFileSync(exitPlanPermissionPath, exitPlanPermission)
    let mcpAndCliMain = fs.readFileSync(mcpMainPath, 'utf8')
    mcpAndCliMain = mcpAndCliMain.replaceAll(
      'Bash(git:*) Edit',
      'Bash(git *) Edit',
    )
    fs.writeFileSync(mcpMainPath, mcpAndCliMain)

    // User-facing examples changed to the command-prefix wildcard grammar.
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/utils/settings/permissionValidation.ts',
        'src/components/permissions/PowerShellPermissionRequest/powershellToolUseOptions.tsx',
        'src/skills/bundled/updateConfig.ts',
      ],
      /Bash\(npm \*\)|Bash\(git \*\)|Bash\(rm -rf \*\)|Get-Process \*/,
      'case107-permission-wildcard-docs',
    )

    // The final strict target-108 pass recovered the complete reusable Table
    // graph and the independently reachable command/UI call paths that use or
    // accompany it.  These files come from the authenticated target-108 tree,
    // not from the later cumulative source: Ultrareview changes again by 116.
    for (const relative of [
      'src/commands/clear/index.ts',
      'src/components/design-system/Table.tsx',
      'src/components/mcp/MCPStdioServerMenu.tsx',
      'src/commands/install-github-app/SuccessStep.tsx',
      'src/cli/handlers/autoMode.ts',
      'src/main.tsx',
      'src/services/api/ultrareviewQuota.ts',
      'src/commands/review/reviewRemote.ts',
      'src/commands/review/UltrareviewOverageDialog.tsx',
      'src/commands/review/ultrareviewCommand.tsx',
      'src/utils/config.ts',
    ]) {
      writeExternalSource('/tmp/late-strict-108', relative, tree)
    }
  }),
])
writeCase('2.1.109-to-2.1.110', [
  withTargetWorktree('34ff410fe7339937986bccbb2eb848138bb0db1f', tree => {
    // Target 110 adds the first-party 10 MiB image payload gate and threads
    // the model/provider-specific limits through every reachable image input
    // and tool-result boundary. Apply this graph before other case-local
    // rewrites touch the same high-traffic owners, then downgrade only the
    // following target111 model override.
    writeCurrentSource('src/utils/imageLimits.ts', tree)
    const target110ImageLimitsPath = path.join(
      tree,
      'src/utils/imageLimits.ts',
    )
    replaceExactly(
      target110ImageLimitsPath,
      `const MODEL_IMAGE_LIMIT_OVERRIDES: Record<string, ImageLimitOverrides> = {
  'claude-opus-4-7': { maxWidth: 2576, maxHeight: 2576 },
}`,
      'const MODEL_IMAGE_LIMIT_OVERRIDES: Record<string, ImageLimitOverrides> = {}',
      'target 2.1.110 empty image model override map',
    )
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/components/CustomSelect/select-input-option.tsx',
        'src/components/PromptInput/PromptInput.tsx',
        'src/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx',
        'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
        'src/hooks/usePasteHandler.ts',
        'src/query.ts',
        'src/screens/REPL.tsx',
        'src/services/api/claude.ts',
        'src/services/mcp/client.ts',
        'src/tools/BashTool/BashTool.tsx',
        'src/tools/BashTool/utils.ts',
        'src/tools/FileReadTool/FileReadTool.ts',
        'src/tools/PowerShellTool/PowerShellTool.tsx',
        'src/utils/attachments.ts',
        'src/utils/imagePaste.ts',
        'src/utils/imageResizer.ts',
        'src/utils/imageValidation.ts',
        'src/utils/messages.ts',
      ],
      /imageLimits|ImageLimits|getImageLimits|getCurrentImageLimits|maxImageBase64Size|validateImagesForAPI|isToolResultBlock|nestedBlock|getQueuedCommandAttachments|limits\.(?:targetRawSize|maxWidth|maxHeight|maxBase64Size)|maxSize: number|base64Size > maxSize|max_bytes: maxSize|ImageSizeError\(oversizedImages, maxSize\)/,
      'case109-dynamic-image-limits',
    )
    // FileWrite compares equivalent proposals by path, then exact content,
    // then content with trailing newlines removed. This target-110 runtime
    // owner is still present in target 116 but was absent from the authored
    // snapshot, so carry only its narrow buildTool member into this case.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/FileWriteTool/FileWriteTool.ts'],
      /inputsEquivalent|input\.content\.replace\(\/\\n\+\$\//,
      'case109-file-write-input-equivalence',
    )

    // The target-110 plugin-list handler already renders through an Ink Root
    // (including JSON/available output and the human list) even though the
    // contemporaneous source snapshot still writes directly to stdout. The
    // function is semantically unchanged in target 116, so transplant that
    // single authenticated owner and its one registry call without carrying
    // later changes to the other plugin subcommands.
    const target110PluginHandlersPath = path.join(
      tree,
      'src/cli/handlers/plugins.ts',
    )
    let target110PluginHandlers = fs.readFileSync(
      target110PluginHandlersPath,
      'utf8',
    )
    const currentPluginHandlers = fs.readFileSync(
      path.join(repositoryRoot, 'src/cli/handlers/plugins.ts'),
      'utf8',
    )
    target110PluginHandlers = target110PluginHandlers.replace(
      "import { basename, dirname } from 'path'\n",
      "import { basename, dirname } from 'path'\nimport React from 'react'\n",
    )
    target110PluginHandlers = target110PluginHandlers.replace(
      "import { plural } from '../../utils/stringUtils.js'\n",
      "import { plural } from '../../utils/stringUtils.js'\nimport { Box, Text, type Root } from '../../ink.js'\n",
    )
    const pluginListStart = 'export async function pluginListHandler'
    const pluginListEnd = '// plugin install (lines 5690–5721)'
    const historicalPluginListStart = target110PluginHandlers.indexOf(
      pluginListStart,
    )
    const historicalPluginListEnd = target110PluginHandlers.indexOf(
      pluginListEnd,
      historicalPluginListStart,
    )
    const currentPluginListStart = currentPluginHandlers.indexOf(pluginListStart)
    const currentPluginListEnd = currentPluginHandlers.indexOf(
      pluginListEnd,
      currentPluginListStart,
    )
    if (
      [
        historicalPluginListStart,
        historicalPluginListEnd,
        currentPluginListStart,
        currentPluginListEnd,
      ].some(index => index < 0)
    ) {
      throw new Error('target 2.1.110 plugin-list owner anchors differ')
    }
    target110PluginHandlers =
      target110PluginHandlers.slice(0, historicalPluginListStart) +
      currentPluginHandlers.slice(currentPluginListStart, currentPluginListEnd) +
      target110PluginHandlers.slice(historicalPluginListEnd)
    fs.writeFileSync(target110PluginHandlersPath, target110PluginHandlers)

    const target110ProcessUserInputPath = path.join(
      tree,
      'src/utils/processUserInput/processUserInput.ts',
    )
    replaceExactly(
      target110ProcessUserInputPath,
      "} from '../imageResizer.js'\nimport { storeImages } from '../imageStore.js'",
      "} from '../imageResizer.js'\nimport { getImageLimits } from '../imageLimits.js'\nimport { storeImages } from '../imageStore.js'",
      'target 2.1.110 process-input image limits import',
    )
    replaceExactly(
      target110ProcessUserInputPath,
      `): Promise<ProcessUserInputBaseResult> {
  let inputString: string | null = null`,
      `): Promise<ProcessUserInputBaseResult> {
  const imageLimits = getImageLimits(context.options.mainLoopModel)
  let inputString: string | null = null`,
      'target 2.1.110 process-input image limit selection',
    )
    replaceExactly(
      target110ProcessUserInputPath,
      'const resized = await maybeResizeAndDownsampleImageBlock(block)',
      `const resized = await maybeResizeAndDownsampleImageBlock(
          block,
          imageLimits,
        )`,
      'target 2.1.110 bridge input image limits',
    )
    replaceExactly(
      target110ProcessUserInputPath,
      'const resized = await maybeResizeAndDownsampleImageBlock(imageBlock)',
      `const resized = await maybeResizeAndDownsampleImageBlock(
        imageBlock,
        imageLimits,
      )`,
      'target 2.1.110 pasted input image limits',
    )

    // The monitor loader/runner is inherited by target 110 even though its
    // source snapshot omitted the authored graph. Apply it before the later
    // case-local plugin-loader edits so the three-way patch still has its
    // original index base.
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/hooks/useManagePlugins.ts',
        'src/utils/plugins/schemas.ts',
        'src/utils/plugins/pluginLoader.ts',
        'src/types/plugin.ts',
        'src/utils/suggestions/skillUsageTracking.ts',
        'src/utils/task/framework.ts',
      ],
      /PluginMonitor|monitors|onSkillInvoked|skillInvoked|createSignal|getIsNonInteractiveSession|getSessionTrustAccepted|createTaskRegistry|TaskRegistry/,
      'case109-plugin-monitor-runtime',
    )
    writeCurrentSource('src/hooks/useTaskRegistry.ts', tree)

    writeFromGit(
      target108,
      '709d3e8',
      'src/commands/provider-setup/relaunch.ts',
      tree,
    )

    // The compiled target already carries the repository-aware review scope
    // and dialog graph that only became visible in the following recovered
    // source snapshot.  Use that first exact authored snapshot for target 110:
    // it owns merge-base/diff-stat preparation, launch propagation, and the
    // PR/branch presentation strings without importing the later source-
    // viability UI evolution.
    for (const relative of [
      'src/commands/review/reviewRemote.ts',
      'src/commands/review/UltrareviewOverageDialog.tsx',
      'src/commands/review/ultrareviewCommand.tsx',
    ]) {
      writeFromGit(
        repositoryRoot,
        '5e168e7272e2eb510b16d7141538bb3f4836749a',
        relative,
        tree,
      )
    }

    // That first authored snapshot is one release newer than the executable
    // target in a handful of narrowly observable places. Reconstruct the
    // exact target-110 graph: direct local merge-base lookup, the original
    // empty-diff diagnostic, no repo-size/model/tag/bundle-failure additions,
    // and a launch result containing only the status flag and visible blocks.
    const target110ReviewRemotePath = path.join(
      tree,
      'src/commands/review/reviewRemote.ts',
    )
    let target110ReviewRemote = fs.readFileSync(
      target110ReviewRemotePath,
      'utf8',
    )
    target110ReviewRemote = target110ReviewRemote
      .replace(
        "import { isRepoTooLargeForBundle } from '../../utils/teleport/gitBundle.js'\n",
        '',
      )
      .replace('  getUltrareviewModel,\n', '')
    const target111ScopePreparation = `  if (await isRepoTooLargeForBundle()) {
    logEvent('tengu_review_remote_precondition_failed', {})
    return {
      ok: false,
      error:
        'Repo is too large to bundle. Push a PR and use \`/ultrareview <PR#>\` instead.',
    }
  }

  const baseBranch = (await getDefaultBranch()) || 'main'
  const mergeBase = (ref: string) =>
    execFileNoThrow(gitExe(), ['merge-base', ref, 'HEAD'], {
      preserveOutputOnError: false,
    })

  let { stdout, code } = await mergeBase(\`origin/\${baseBranch}\`)
  if (code !== 0) {
    const fallback = await mergeBase(baseBranch)
    stdout = fallback.stdout
    code = fallback.code
  }
  const mergeBaseSha = stdout.trim()`
    const target110ScopePreparation = `  const baseBranch = (await getDefaultBranch()) || 'main'
  const { stdout, code } = await execFileNoThrow(
    gitExe(),
    ['merge-base', baseBranch, 'HEAD'],
    { preserveOutputOnError: false },
  )
  const mergeBaseSha = stdout.trim()`
    if (!target110ReviewRemote.includes(target111ScopePreparation)) {
      throw new Error('target 2.1.110 review-scope preparation anchor differs')
    }
    target110ReviewRemote = target110ReviewRemote
      .replace(target111ScopePreparation, target110ScopePreparation)
      .replace(
        `      error: \`It doesn't look like you have any new commits or changes to review against your \${baseBranch} branch. Stage or commit them first?\`,`,
        '      error: `No changes against the ${baseBranch} fork point. Make some commits or stage files first.`,',
      )
      .replace('  const model = getUltrareviewModel()\n', '')
      .replace('    ...(model && { BUGHUNTER_MODEL: model }),\n', '')
      .replaceAll("      tags: ['ultrareview'],\n", '')
      .replace('    let bundleFailure: string | undefined\n', '')
      .replace(
        `      onBundleFail: message => {
        bundleFailure = message
      },
`,
        '',
      )
      .replace(
        `      return failedLaunch(
        bundleFailure ??
          'Repo is too large. Push a PR and use \`/ultrareview <PR#>\` instead.',
      )`,
        "      return failedLaunch(\n        'Repo is too large. Push a PR and use `/ultrareview <PR#>` instead.',\n      )",
      )
      .replace('    sessionId: session.id,\n    sessionUrl,\n', '')
    for (const forbidden of [
      'isRepoTooLargeForBundle',
      'getUltrareviewModel',
      'BUGHUNTER_MODEL',
      "tags: ['ultrareview']",
      'bundleFailure',
      'onBundleFail',
      'sessionId: session.id',
    ]) {
      if (target110ReviewRemote.includes(forbidden)) {
        throw new Error(
          `target 2.1.110 review runtime retained later behavior: \${forbidden}`,
        )
      }
    }
    for (const expected of [
      "['merge-base', baseBranch, 'HEAD']",
      'No changes against the ${baseBranch} fork point.',
      "source: 'ultrareview'",
      'bundleBaseRef: mergeBaseSha',
      'Scope: ${diffStat}',
    ]) {
      if (!target110ReviewRemote.includes(expected)) {
        throw new Error(
          `target 2.1.110 review runtime lacks target behavior: \${expected}`,
        )
      }
    }
    fs.writeFileSync(target110ReviewRemotePath, target110ReviewRemote)

    // The target-110 dialog has the target-111 source-viability call graph,
    // but it does not yet repeat the short diff stat in the confirmation UI.
    // The stat remains visible in the launch result above.
    const target110ReviewDialogPath = path.join(
      tree,
      'src/commands/review/UltrareviewOverageDialog.tsx',
    )
    let target110ReviewDialog = fs.readFileSync(
      target110ReviewDialogPath,
      'utf8',
    )
    target110ReviewDialog = target110ReviewDialog
      .replace(
        `  const scopeStat =
    scope.mode === 'branch' && scope.diffStat ? scope.diffStat : null
`,
        '',
      )
      .replaceAll(
        '        {scopeStat && <Text dimColor>Scope: {scopeStat}</Text>}\n',
        '',
      )
      .replaceAll(
        '      {scopeStat && <Text dimColor>Scope: {scopeStat}</Text>}\n',
        '',
      )
    if (target110ReviewDialog.includes('scopeStat')) {
      throw new Error('target 2.1.110 review dialog retained later scope stat')
    }
    fs.writeFileSync(target110ReviewDialogPath, target110ReviewDialog)

    // The command prepares scope before fetching the overage gate and leaves
    // the dialog subtitle unset for confirmation. Parallel preparation, the
    // explicit duration subtitle, and dialog-shown telemetry are later deltas.
    const target110ReviewCommandPath = path.join(
      tree,
      'src/commands/review/ultrareviewCommand.tsx',
    )
    let target110ReviewCommand = fs.readFileSync(
      target110ReviewCommandPath,
      'utf8',
    )
    target110ReviewCommand = target110ReviewCommand
      .replace(
        `  const [prepared, gate] = await Promise.all([
    prepareRemoteReviewScope(args),
    checkOverageGate(),
  ])
`,
        `  const prepared = await prepareRemoteReviewScope(args)
`,
      )
      .replace(
        '  const scope = prepared.scope\n\n  switch (gate.kind) {',
        '  const scope = prepared.scope\n  const gate = await checkOverageGate()\n\n  switch (gate.kind) {',
      )
      .replace(
        `      if (gate.kind === 'needs-confirm') {
        logEvent('tengu_review_overage_dialog_shown', {})
      }
`,
        '',
      )
      .replace(
        `            gate.kind === 'needs-confirm'
              ? getUltrareviewDurationNote()
              : gate.billingNote || null`,
        `            gate.kind === 'needs-confirm'
              ? null
              : gate.billingNote || null`,
      )
      .replace(
        "import { getUltrareviewDurationNote } from './ultrareviewEnabled.js'\n",
        '',
      )
    if (
      target110ReviewCommand.includes('Promise.all([') ||
      target110ReviewCommand.includes('tengu_review_overage_dialog_shown') ||
      target110ReviewCommand.includes('getUltrareviewDurationNote')
    ) {
      throw new Error('target 2.1.110 review command retained later behavior')
    }
    fs.writeFileSync(target110ReviewCommandPath, target110ReviewCommand)

    // Target 110 introduces the detailed PR-status loader (including
    // additions/deletions) before it appears in recovered src.  Target 116
    // retains the data shape but softens a failed gh invocation to null; the
    // introduction target throws the exact diagnostic before JSON parsing.
    writeCurrentSource('src/utils/ghPrStatus.ts', tree)
    replaceExactly(
      path.join(tree, 'src/utils/ghPrStatus.ts'),
      '    if (code !== 0 || !stdout.trim()) return null\n    try {\n      const data = jsonParse(stdout) as {\n        number: number\n        title: string',
      "    if (code !== 0 || !stdout.trim()) {\n      throw new Error(`gh pr view failed (exit ${code})`)\n    }\n    try {\n      const data = jsonParse(stdout) as {\n        number: number\n        title: string",
      'target 2.1.110 PR-details failure boundary',
    )

    // Transcript mirroring evolves from the single callback introduced at
    // target 97 to the target-110 multi-subscriber array.  The recovered
    // target commit has neither layer, so select the complete observable
    // mirror writer/export/class hunks from current source; these same hunks
    // remain live through target 116.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/sessionStorage.ts'],
      /getCurrentSessionFile|addSessionMirror|fireSessionMirror|SessionMirror|private mirrors|this\.mirrors|mirrorEntries/,
      'case109-session-mirror-array',
    )

    // Non-sync plugin installation returns a mutable completion token.  When
    // the explicit environment gate is enabled, the first query consumes the
    // token exactly once and refreshes commands, agents, hooks and MCP state.
    // The selected hunks also retain target-110 stream-json install progress
    // and its completion-finally behavior.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/print.ts'],
      /Promise<boolean>|installPluginsForHeadless\(onProgress\)|return pluginsInstalled|return false|kickOffBackgroundPluginInstall|backgroundPluginInstall|CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH/,
      'case109-background-plugin-refresh',
    )

    // Target 110 broadens the sleep-blocking detectors to preserve decimal
    // durations (including a trailing decimal point) and compares them as
    // floating-point seconds.  The recovered commit retained the earlier
    // integer-only authored form even though the executable has this delta.
    for (const [relative, integerPattern, decimalPattern] of [
      [
        'src/tools/BashTool/BashTool.tsx',
        'const m = /^sleep\\s+(\\d+)\\s*$/.exec(first);',
        'const m = /^sleep\\s+(\\d+(?:\\.\\d*)?)\\s*$/.exec(first);',
      ],
      [
        'src/tools/PowerShellTool/PowerShellTool.tsx',
        'const m = /^(?:start-sleep|sleep)(?:\\s+-s(?:econds)?)?\\s+(\\d+)\\s*$/i.exec(first);',
        'const m = /^(?:start-sleep|sleep)(?:\\s+-s(?:econds)?)?\\s+(\\d+(?:\\.\\d*)?)\\s*$/i.exec(first);',
      ],
    ]) {
      const filename = path.join(tree, relative)
      replaceExactly(
        filename,
        integerPattern,
        decimalPattern,
        `target 2.1.110 decimal sleep pattern in ${relative}`,
      )
      replaceExactly(
        filename,
        "const secs = parseInt(m[1]!, 10);",
        "const secs = parseFloat(m[1]!);",
        `target 2.1.110 floating sleep duration in ${relative}`,
      )
    }

    // Target 110 moves text editing, paste handling and Vim from the legacy
    // global Ink input callback to focus-scoped DOM KeyboardEvent/PasteEvent
    // handlers.  Materialize the complete graph, then remove the few later
    // target-116 evolutions (event.name, queued Return, Super arrows, the
    // empty-left double press and the kill discovery hint).
    const frozenTarget108KillRing = '/tmp/late107-final.Wu9dmo/tree'
    for (const relative of [
      'src/context/killRing.tsx',
      'src/hooks/useSearchInput.ts',
      'src/components/App.tsx',
    ]) {
      writeExternalSource(frozenTarget108KillRing, relative, tree)
    }
    for (const relative of [
      'src/hooks/useTextInput.ts',
      'src/hooks/useVimInput.ts',
      'src/hooks/usePasteHandler.ts',
      'src/components/BaseTextInput.tsx',
      'src/components/TextInput.tsx',
      'src/components/VimTextInput.tsx',
      'src/components/PromptInput/utils.ts',
      'src/types/textInputTypes.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }

    const target110PromptInput = path.join(
      tree,
      'src/components/PromptInput/PromptInput.tsx',
    )
    replaceExactly(
      target110PromptInput,
      "import { Box, type ClickEvent, type Key, Text, useInput } from '../../ink.js';",
      "import { Box, type ClickEvent, Text, useInput } from '../../ink.js';\nimport type { KeyboardEvent } from '../../ink/events/keyboard-event.js';",
      'target 2.1.110 PromptInput DOM keyboard type import',
    )
    replaceExactly(
      target110PromptInput,
      'const lazySpaceInputFilter = useCallback((input: string, key: Key): string => {',
      'const lazySpaceInputFilter = useCallback((input: string, key: KeyboardEvent): string => {',
      'target 2.1.110 PromptInput DOM input filter type',
    )

    const target110TextInput = path.join(tree, 'src/hooks/useTextInput.ts')
    replaceExactly(
      target110TextInput,
      "    ['a', () => cursor.startOfLogicalLine()],",
      "    ['a', () => cursor.startOfLine()],",
      'target 2.1.110 Ctrl+A visual-line behavior',
    )
    replaceExactly(
      target110TextInput,
      "    ['e', () => cursor.endOfLogicalLine()],",
      "    ['e', () => cursor.endOfLine()],",
      'target 2.1.110 Ctrl+E visual-line behavior',
    )
    for (const fragment of [
      '  onLeftArrowOnEmptyMessage?: (show: boolean) => void\n',
      '  onLeftArrowOnEmptyMessage,\n',
    ]) {
      replaceExactly(
        target110TextInput,
        fragment,
        '',
        'target 2.1.110 lacks later empty-left message callback',
      )
    }
    replaceExactly(
      target110TextInput,
      `  const handleLeftArrowOnEmpty = useDoublePress(
    show => onLeftArrowOnEmptyMessage?.(show),
    () => onLeftArrowOnEmpty?.(),
  )

`,
      '',
      'target 2.1.110 lacks later empty-left double press',
    )
    replaceExactly(
      target110TextInput,
      `    if (killed.length >= 3) {
      addNotification({
        key: 'kill-paste-hint',
        text: 'Ctrl+Y to paste deleted text',
        priority: 'immediate',
        timeoutMs: 5000,
      })
    }
`,
      '',
      'target 2.1.110 lacks later kill paste hint',
    )
    replaceExactly(
      target110TextInput,
      `        if (event.superKey) return cursor.startOfLine()
`,
      '',
      'target 2.1.110 lacks later Super+left navigation',
    )
    replaceExactly(
      target110TextInput,
      `        if (event.superKey) return cursor.endOfLine()
`,
      '',
      'target 2.1.110 lacks later Super+right navigation',
    )
    replaceExactly(
      target110TextInput,
      `        if (!event.shift && cursor.text === '' && onLeftArrowOnEmpty) {
          if (onLeftArrowOnEmptyMessage) handleLeftArrowOnEmpty()
          else onLeftArrowOnEmpty()
          return cursor
        }
`,
      `        if (!event.shift && cursor.text === '' && onLeftArrowOnEmpty) {
          onLeftArrowOnEmpty()
          return cursor
        }
`,
      'target 2.1.110 direct empty-left action',
    )
    let target110TextInputValue = fs.readFileSync(target110TextInput, 'utf8')
    target110TextInputValue = target110TextInputValue.replaceAll(
      'event.name',
      'event.key',
    )
    target110TextInputValue = target110TextInputValue.replace(
      "const UNHANDLED_SPECIAL_KEYS = new Set([\n  'insert',",
      "const UNHANDLED_SPECIAL_KEYS = new Set([\n  'backspace',\n  'delete',\n  'tab',\n  'home',\n  'end',\n  'pageup',\n  'pagedown',\n  'insert',",
    )
    fs.writeFileSync(target110TextInput, target110TextInputValue)

    const target110VimInput = path.join(tree, 'src/hooks/useVimInput.ts')
    fs.writeFileSync(
      target110VimInput,
      fs.readFileSync(target110VimInput, 'utf8').replaceAll(
        'event.name',
        'event.key',
      ),
    )

    const target110PromptUtils = path.join(
      tree,
      'src/components/PromptInput/utils.ts',
    )
    fs.writeFileSync(
      target110PromptUtils,
      fs.readFileSync(target110PromptUtils, 'utf8').replaceAll(
        'event.name',
        'event.key',
      ),
    )

    const target110Paste = path.join(tree, 'src/hooks/usePasteHandler.ts')
    let target110PasteValue = fs.readFileSync(target110Paste, 'utf8')
    target110PasteValue = target110PasteValue
      .replace('  const pendingReturnRef = React.useRef(false)\n', '')
      .replace(
        '  const handleKeyDownRef = React.useRef(nextHandleKeyDown)\n  handleKeyDownRef.current = nextHandleKeyDown\n',
        '',
      )
      .replaceAll(/\n\s*pendingReturnRef\.current = false/g, '')
      .replace(
        'nextHandleKeyDown(createSyntheticKeyboardEvent(text, undefined, false))',
        'nextHandleKeyDown(createSyntheticKeyboardEvent(text, undefined, true))',
      )
      .replace(
        /  function finishPaste\(\): void \{[\s\S]*?\n  \}\n\n  function processPaste/,
        `  function finishPaste(): void {
    setIsPasting(false)
    setTimeout(
      (mounted: typeof isMountedRef, inProgress: typeof pasteInProgressRef) => {
        if (mounted.current) inProgress.current = false
      },
      0,
      isMountedRef,
      pasteInProgressRef,
    )
  }

  function processPaste`,
      )
      .replace(
        `    if (pasteInProgressRef.current && event.key === 'return') {
      event.preventDefault()
      pendingReturnRef.current = true
      return
    }
`,
        '',
      )
    if (
      target110PasteValue.includes('pendingReturn') ||
      target110PasteValue.includes('handleKeyDownRef')
    ) {
      throw new Error('target 2.1.110 paste queued-return removal failed')
    }
    fs.writeFileSync(target110Paste, target110PasteValue)

    const target110BaseInput = path.join(
      tree,
      'src/components/BaseTextInput.tsx',
    )
    replaceExactly(
      target110BaseInput,
      "import { useAutoFocus } from '../ink/hooks/use-auto-focus.js'",
      "import { getFocusManager } from '../ink/focus.js'",
      'target 2.1.110 inline input focus manager import',
    )
    replaceExactly(
      target110BaseInput,
      '  useAutoFocus(inputRef, acceptsInput)',
      `  React.useEffect(() => {
    if (!acceptsInput || !inputRef.current) return
    const focusManager = getFocusManager(inputRef.current)
    focusManager.focus(inputRef.current)
    return focusManager.subscribe(() => {
      const element = inputRef.current
      if (!element || focusManager.activeElement === element) return
      if (!focusManager.activeElement) {
        focusManager.focus(element)
        return
      }
      let parent = element.parentNode
      while (parent) {
        if (parent === focusManager.activeElement) {
          focusManager.focus(element)
          return
        }
        parent = parent.parentNode
      }
    })
  }, [acceptsInput])`,
      'target 2.1.110 inline focused-input subscription',
    )

    for (const relative of [
      'src/components/TextInput.tsx',
      'src/components/VimTextInput.tsx',
    ]) {
      const filename = path.join(tree, relative)
      replaceExactly(
        filename,
        '    onLeftArrowOnEmptyMessage: props.onLeftArrowOnEmptyMessage,\n',
        '',
        `target 2.1.110 lacks later ${relative} empty-left message`,
      )
    }

    // Target 110 expands cloud-workspace detection, terminal color control,
    // post-resize image-block compression, and macOS 27 Terminal.app setup.
    // Select only those target-backed hunks from cumulative current source;
    // unrelated later changes in the same files remain outside this case.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/env.ts'],
      /CODER_WORKSPACE_NAME|DEVPOD_WORKSPACE_UID|DAYTONA_WS_ID|CLOUD_WORKSTATIONS_CLUSTER_ID|C9_USER/,
      'case109-deployment-environment',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/ink/colorize.ts'],
      /NO_COLOR_ARGUMENTS|FORCE_COLOR_ARGUMENTS|TRUECOLOR_TERMS|hasArgumentBeforeDoubleDash|disableChalkForNoColor|boostChalkLevelForKnownTruecolorTerminal|CHALK_DISABLED_FOR_NO_COLOR|CHALK_BOOSTED_FOR_TRUECOLOR_TERM/,
      'case109-terminal-colors',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/imageResizer.ts'],
      /MAX_IMAGE_BLOCK_BYTES|compressImageBlockBuffer|outputBuffer/,
      'case109-image-block-compression',
    )
    const imageResizerPath = path.join(tree, 'src/utils/imageResizer.ts')
    replaceExactly(
      imageResizerPath,
      '        media_type: detectImageFormatFromBuffer(outputBuffer),',
      "        media_type:\n          `image/${resized.mediaType}` as Base64ImageSource['media_type'],",
      'target 2.1.110 image output media type',
    )

    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/terminalSetup/terminalSetup.tsx'],
      /platform, release|darwinMajor|macOSMajorVersion|usesShiftReturn|newlineHint|const lines =/,
      'case109-macos27-terminal-setup',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/fullscreen.ts'],
      /getFeatureValue_CACHED_MAY_BE_STALE|fullscreenGateCached|tengu_pewter_brook/,
      'case109-fullscreen-growthbook-default',
    )
    // Keep the target-110 scalar cache form.  Current source has since moved
    // the same gate into FullscreenState, so selecting its local diff would
    // leave a state.gbGateCached read without the later state declaration.
    writeExternalSource(
      '/tmp/late110-finalX.JC9qfF/tree',
      'src/utils/fullscreen.ts',
      tree,
    )
    // Target 110's fullscreen upsell uses the reduced-motion-aware animated
    // asterisk rather than a static glyph.  Select only the import/render and
    // separator-spacing hunk; the surrounding gate and impression graph is
    // already owned by this boundary.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/LogoV2/FullscreenUpsell.tsx'],
      /AnimatedAsterisk| Try flicker-free rendering/,
      'case109-fullscreen-animated-asterisk',
    )

    // Target 110's /btw panel adds bounded history, retry presentation,
    // clear/fork controls, and the matching side-question/branch call graph.
    // The behavior is unchanged through target 116; install the authored
    // current owners together because the target commit's source snapshot
    // predates the already-bundled support functions.
    for (const relative of [
      'src/commands/btw/btw.tsx',
      'src/utils/sideQuestion.ts',
      'src/commands/branch/branch.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/api/errors.ts'],
      /getAssistantMessageFromErrorInner|apiErrorStatus/,
      'case109-api-error-status-message',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/QueryEngine.ts'],
      /apiErrorStatus|api_error_status/,
      'case109-api-error-status-sdk-result',
    )
    // Target 110 introduces the SDK message provenance/query-suppression
    // protocol together with requesting status, replay attachments, and the
    // successful-result API status.  These are runtime Zod owners, not merely
    // generated TypeScript declarations.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/entrypoints/sdk/coreSchemas.ts'],
      /SDKStatusSchema|requesting|SDKMessageOriginSchema|Provenance of a user-role message|shouldQuery|file_attachments|api_error_status/,
      'case109-sdk-message-protocol',
    )
    // Target 110 adds classifier-backed resolution for worker sandbox network
    // requests and updates the external auto-mode policy prompt.  The current
    // implementation is unchanged at target 116, so select its complete
    // target-backed hunks and install the exact asset; txtRequire removes its
    // single patch-management newline before bundling.
    const target110YoloPath = path.join(
      tree,
      'src/utils/permissions/yoloClassifier.ts',
    )
    let target110Yolo = fs.readFileSync(target110YoloPath, 'utf8')
    target110Yolo = target110Yolo
      .replace(
        "import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'",
        `import {
  getFeatureValue_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_WITH_REFRESH,
} from '../../services/analytics/growthbook.js'`,
      )
      .replace(
        "import { getCacheControl } from '../../services/api/claude.js'",
        `import {
  getCacheControl,
  getExtraBodyParams,
} from '../../services/api/claude.js'`,
      )
      .replace(
        `function txtRequire(mod: string | { default: string }): string {
  return typeof mod === 'string' ? mod : mod.default
}`,
        `function txtRequire(mod: string | { default: string }): string {
  const text = typeof mod === 'string' ? mod : mod.default
  // Source assets are patch-managed text files and therefore carry one
  // trailing newline that is not part of the bundled prompt literal.
  return text.endsWith('\\n') ? text.slice(0, -1) : text
}`,
      )
      .replace(
        "const XML_S1_SUFFIX = '\\nErr on the side of blocking. <block> immediately.'",
        `const XML_S1_SUFFIX = '\\nErr on the side of blocking. <block> immediately.'

/**
 * Two-stage Stage 1 intentionally over-selects possible blocks. User intent
 * and ALLOW exceptions are applied by Stage 2, so the fast pass must not use
 * them to short-circuit the review.
 */
const XML_S1_TWO_STAGE_SUFFIX =
  '\\nErr on the side of blocking. Stage 1 does NOT apply user intent or ALLOW exceptions — stage 2 will handle those. Block if ANY rule could apply. <block> immediately.'`,
      )
      .replace(
        "        { type: 'text' as const, text: XML_S1_SUFFIX },",
        `        {
          type: 'text' as const,
          text: mode === 'both' ? XML_S1_TWO_STAGE_SUFFIX : XML_S1_SUFFIX,
        },`,
      )
      .replaceAll(
        "      querySource: 'auto_mode',\n",
        "      querySource: 'auto_mode',\n      extraBodyParams: getExtraBodyParams(),\n",
      )
      .replaceAll(
        "      querySource: 'auto_mode' as const,\n",
        "      querySource: 'auto_mode' as const,\n      extraBodyParams: getExtraBodyParams(),\n",
      )
    const currentYolo = fs.readFileSync(
      path.join(repositoryRoot, 'src/utils/permissions/yoloClassifier.ts'),
      'utf8',
    )
    const sandboxClassifierStart = currentYolo.indexOf(
      'const SANDBOX_NETWORK_ACCESS_TOOL_NAME',
    )
    if (sandboxClassifierStart < 0) {
      throw new Error('target 2.1.110 sandbox classifier owner anchor differs')
    }
    target110Yolo = `${target110Yolo.trimEnd()}\n\n${currentYolo.slice(sandboxClassifierStart)}`
    for (const expected of [
      'getFeatureValue_CACHED_WITH_REFRESH',
      'getExtraBodyParams',
      'XML_S1_TWO_STAGE_SUFFIX',
      'classifySandboxNetworkAccess',
    ]) {
      if (!target110Yolo.includes(expected)) {
        throw new Error(`target 2.1.110 yolo classifier missed ${expected}`)
      }
    }
    fs.writeFileSync(target110YoloPath, target110Yolo)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/permissions/PermissionMode.ts'],
      /SandboxPermissionModeDecision|getSandboxPermissionModeDecision|classify/,
      'case109-sandbox-permission-mode',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/hooks/useInboxPoller.ts'],
      /getSandboxPermissionModeDecision|classifySandboxNetworkAccess|sendSandboxPermissionResponseViaMailbox|resolveSandboxRequest|Auto-resolving sandbox request/,
      'case109-sandbox-inbox-classifier',
    )
    const externalPromptSource = path.join(
      repositoryRoot,
      'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt',
    )
    const externalPromptDestination = path.join(
      tree,
      'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt',
    )
    fs.mkdirSync(path.dirname(externalPromptDestination), { recursive: true })
    fs.writeFileSync(
      externalPromptDestination,
      fs.readFileSync(externalPromptSource),
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/mcp/vscodeSdkMcp.ts'],
      /tengu_slate_ribbon/,
      'case109-vscode-slate-ribbon-gate',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/ToolSearchTool/prompt.ts'],
      /getToolLocationHint|Deferred tools appear by name in <system-reminder>|PROMPT_HEAD \+ PROMPT_TAIL/,
      'case109-deferred-tool-prompt-location',
    )
    replaceExactly(
      path.join(tree, 'src/tools/ToolSearchTool/prompt.ts'),
      ' * Format one deferred-tool line for the <available-deferred-tools> user\n * message. Search hints (tool.searchHint) are not rendered — the',
      ' * Format one deferred-tool line for the deferred-tools system reminder.\n * Search hints (tool.searchHint) are not rendered — the',
      'target 2.1.110 deferred-tool format documentation',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/toolSearch.ts'],
      /pre-delta feature gate|isDeferredToolsDeltaEnabled\(\): true/,
      'case109-deferred-tool-delta-unconditional',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/telemetry/pluginTelemetry.ts'],
      /has_settings|settings_keys/,
      'case109-plugin-settings-telemetry',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/telemetry/sessionTracing.ts'],
      /SpanStatusCode|hook\(s\) failed/,
      'case109-tracing-error-status',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/shell/bashProvider.ts'],
      /CLAUDE_CODE_REMOTE|export BUN_OPTIONS/,
      'case109-remote-bun-options',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/api/withRetry.ts'],
      /attemptStartTime|attempt_duration_ms/,
      'case109-api-attempt-duration',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/api.ts'],
      /legacyCompatibleInput|old_str|new_str/,
      'case109-file-edit-legacy-aliases',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/handlers/mcp.tsx'],
      /Configured servers:|No MCP servers are configured|configuredServers/,
      'case109-mcp-missing-server-diagnostics',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/update.ts'],
      /daemon|Daemon|minimumVersion|shouldSkipVersion|wasUpdated|channelVersion|readFile|getClaudeConfigHomeDir|isENOENT|safeParseJSON/,
      'case109-update-minimum-version-and-daemon',
    )
    replaceBetween(
      path.join(tree, 'src/cli/update.ts'),
      'async function isClaudeDaemonProcess(pid: number): Promise<boolean> {',
      `async function willDaemonRestartForVersion(
  version: string,
): Promise<boolean> {
  const lock = await getRunningDaemonLock().catch(() => null)
  return Boolean(lock && lock.version !== version)
}`,
      `async function getRunningDaemonLock(): Promise<DaemonLock | null> {
  const lock = await readDaemonLock()
  if (!lock) return null
  try {
    process.kill(lock.pid, 0)
    return lock
  } catch {
    return null
  }
}

async function signalDaemonRestartForVersion(
  version: string,
): Promise<boolean> {
  try {
    const lock = await getRunningDaemonLock()
    if (!lock || lock.version === version) return false
    process.kill(lock.pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}`,
      'target 2.1.110 signals a live daemon directly without the later process identity validation',
    )
    let target110Update = fs.readFileSync(path.join(tree, 'src/cli/update.ts'), 'utf8')
    const latestDaemonBranch = `if (await willDaemonRestartForVersion(result.latestVersion)) {
          writeToStdout(
            chalk.dim(
              'Claude daemon will restart for the upgrade once background jobs finish',
            ) + '\\n',
          )
        }`
    const target110NativeDaemonBranch = `if (await signalDaemonRestartForVersion(result.latestVersion)) {
          writeToStdout(chalk.dim('Signaled claude daemon to restart') + '\\n')
        }`
    if (!target110Update.includes(latestDaemonBranch)) {
      throw new Error('target 2.1.110 native daemon branch anchor differs')
    }
    target110Update = target110Update.replace(
      latestDaemonBranch,
      target110NativeDaemonBranch,
    )
    const latestNpmDaemonBranch = `if (await willDaemonRestartForVersion(latestVersion)) {
        writeToStdout(
          chalk.dim(
            'Claude daemon will restart for the upgrade once background jobs finish',
          ) + '\\n',
        )
      }`
    const target110NpmDaemonBranch = `if (await signalDaemonRestartForVersion(latestVersion)) {
        writeToStdout(chalk.dim('Signaled claude daemon to restart') + '\\n')
      }`
    if (!target110Update.includes(latestNpmDaemonBranch)) {
      throw new Error('target 2.1.110 npm daemon branch anchor differs')
    }
    fs.writeFileSync(
      path.join(tree, 'src/cli/update.ts'),
      target110Update.replace(latestNpmDaemonBranch, target110NpmDaemonBranch),
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/nativeInstaller/installer.ts'],
      /spawnSync|semver|getFeatureValue_CACHED_MAY_BE_STALE|isRosettaTranslated|sysctl\.proc_translated|getCanaryVersion|canaryVersion|canaryExceedsMaxVersion|let arch/,
      'case109-native-canary-and-rosetta',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/config.ts'],
      /generatedUserID|getOrCreateUserID: could not persist userID/,
      'case109-stable-user-id-persistence',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/plugins/schemas.ts'],
      /PLUGIN_SETTINGS_KEYS \(pluginSettingsKeys\.ts\)/,
      'case109-plugin-settings-description',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/ConfigTool/supportedSettings.ts'],
      /\btui:\s*\{|Terminal UI renderer|\['default', 'fullscreen'\]/,
      'case109-config-tool-tui-setting',
    )
    // Target 110 marks hook registrations that may be dispatched from the
    // focus-aware single-key route and teaches the global interceptor to
    // resolve/invoke them after chord handling. The adjacent DOM-event
    // adapter allocated by the compiled target never escapes its local
    // closure; the authored runtime owner is the registry/fallback graph.
    replaceExactly(
      path.join(tree, 'src/keybindings/KeybindingContext.tsx'),
      `  handler: () => void;
};`,
      `  handler: () => void | false | Promise<void>;
  singleKey?: boolean;
};`,
      'target 2.1.110 keybinding handler registration type',
    )
    const target110UseKeybindingPath = path.join(
      tree,
      'src/keybindings/useKeybinding.ts',
    )
    let target110UseKeybinding = fs.readFileSync(
      target110UseKeybindingPath,
      'utf8',
    )
    const plainRegistration = 'keybindingContext.registerHandler({ action, context, handler })'
    if (target110UseKeybinding.split(plainRegistration).length - 1 !== 2) {
      throw new Error('target 2.1.110 single-key registration anchors differ')
    }
    target110UseKeybinding = target110UseKeybinding.replaceAll(
      plainRegistration,
      `keybindingContext.registerHandler({
          action,
          context,
          handler,
          singleKey: true,
        })`,
    )
    fs.writeFileSync(target110UseKeybindingPath, target110UseKeybinding)

    const target110KeybindingSetupPath = path.join(
      tree,
      'src/keybindings/KeybindingProviderSetup.tsx',
    )
    replaceExactly(
      target110KeybindingSetupPath,
      `    handler: () => void;
  }>>());`,
      `    handler: () => void | false | Promise<void>;
    singleKey?: boolean;
  }>>());`,
      'target 2.1.110 keybinding setup registry type',
    )
    replaceExactly(
      target110KeybindingSetupPath,
      `  handler: () => void;
};`,
      `  handler: () => void | false | Promise<void>;
  singleKey?: boolean;
};`,
      'target 2.1.110 interceptor registry type',
    )
    replaceBetween(
      target110KeybindingSetupPath,
      'function ChordInterceptor(t0) {',
      '//# sourceMappingURL=',
      `function ChordInterceptor({
  bindings,
  pendingChordRef,
  setPendingChord,
  activeContexts,
  handlerRegistryRef,
}: {
  bindings: ParsedBinding[];
  pendingChordRef: React.RefObject<ParsedKeystroke[] | null>;
  setPendingChord: (pending: ParsedKeystroke[] | null) => void;
  activeContexts: Set<KeybindingContextName>;
  handlerRegistryRef: React.RefObject<Map<string, Set<HandlerRegistration>>>;
}): null {
  const dispatchKey = useCallback(
    (
      input: string,
      key: Key,
      stopPropagation: () => void,
      allowSingleKey: boolean,
    ) => {
      const registry = handlerRegistryRef.current;
      const handlerContexts = new Set<KeybindingContextName>();
      if (registry) {
        for (const handlers of registry.values()) {
          for (const registration of handlers) {
            handlerContexts.add(registration.context);
          }
        }
      }
      const contexts = [...handlerContexts, ...activeContexts, 'Global'] as KeybindingContextName[];
      const wasInChord = pendingChordRef.current !== null;
      const result = resolveKeyWithChordState(
        input,
        key,
        contexts,
        bindings,
        pendingChordRef.current,
      );

      switch (result.type) {
        case 'chord_started':
          setPendingChord(result.pending);
          stopPropagation();
          return;
        case 'chord_cancelled':
          setPendingChord(null);
          stopPropagation();
          return;
        case 'unbound':
          setPendingChord(null);
          if (wasInChord) {
            stopPropagation();
            return;
          }
          break;
        case 'match':
          setPendingChord(null);
          if (wasInChord) {
            const handlers = registry?.get(result.action);
            if (handlers) {
              for (const registration of handlers) {
                registration.handler();
                stopPropagation();
                break;
              }
            }
            return;
          }
          break;
        case 'none':
          break;
      }

      if (!allowSingleKey || !registry) return;
      const resolvedByContext = new Map<KeybindingContextName, string | null>();
      for (const handlers of registry.values()) {
        for (const registration of handlers) {
          if (!registration.singleKey) continue;
          let action = resolvedByContext.get(registration.context);
          if (action === undefined) {
            const resolved = resolveKeyWithChordState(
              input,
              key,
              [...activeContexts, registration.context, 'Global'],
              bindings,
              null,
            );
            action = resolved.type === 'match' ? resolved.action : null;
            resolvedByContext.set(registration.context, action);
          }
          if (action === registration.action && registration.handler() !== false) {
            stopPropagation();
            return;
          }
        }
      }
    },
    [
      activeContexts,
      bindings,
      handlerRegistryRef,
      pendingChordRef,
      setPendingChord,
    ],
  );

  const handleInput = useCallback(
    (input: string, key: Key, event: InputEvent) => {
      if (
        (key.wheelUp || key.wheelDown) &&
        pendingChordRef.current === null
      ) {
        return;
      }
      dispatchKey(
        input,
        key,
        () => event.stopImmediatePropagation(),
        false,
      );
    },
    [dispatchKey, pendingChordRef],
  );

  useInput(handleInput);
  return null;
}
//# sourceMappingURL=`,
      'target 2.1.110 keybinding single-key interceptor',
    )
    // The advisor runtime is replaced at target 110 with the first-party,
    // experimental-env-or-sage-compass2 flow.  Target 116 keeps that graph
    // and adds only Opus 4.7 to the two model predicates.
    writeCurrentSource('src/utils/advisor.ts', tree)
    const target110AdvisorPath = path.join(tree, 'src/utils/advisor.ts')
    let target110Advisor = fs.readFileSync(target110AdvisorPath, 'utf8')
    const opus47Line = "    m.includes('opus-4-7') ||\n"
    if (target110Advisor.split(opus47Line).length - 1 !== 2) {
      throw new Error('target 2.1.110 advisor Opus 4.7 downgrade anchor differs')
    }
    target110Advisor = target110Advisor.replaceAll(opus47Line, '')
    fs.writeFileSync(target110AdvisorPath, target110Advisor)
    // Target 110 broadens the one-retry PowerShell parser loop from timeout-
    // only retries to every nonzero exit and spawn failure, with one uniform
    // per-attempt diagnostic. Target 116 retains this state machine exactly.
    writeCurrentSource('src/utils/powershell/parser.ts', tree)
    // Target 110 introduces the modal-pager selection-preservation predicate;
    // target 116 retains the same key vocabulary and reachable observer gate.
    writeCurrentSource('src/components/ScrollKeybindingHandler.tsx', tree)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/structuredIO.ts'],
      /SENSITIVE_MCP_INPUT_KEY|redactMcpInputFields|getMcpInputPreview|redactSecrets|BASH_TOOL_NAME|POWERSHELL_TOOL_NAME|buildRequiresActionDetails|rawCommand/,
      'case109-requires-action-mcp-preview',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/constants/prompts.ts'],
      /tengu_verified_vs_assumed|When reporting results, be accurate about what you verified vs\. what you assumed/,
      'case109-verified-vs-assumed-prompt',
    )
    // Heap diagnostics change again by target 116.  Install the authenticated
    // target-110 owners from the frozen historical audit tree rather than
    // leaking the later protected-object/mimalloc summary into this boundary.
    for (const relative of [
      'src/utils/heapDumpService.ts',
      'src/commands/heapdump/heapdump.ts',
      'src/tools/SkillTool/prompt.ts',
      'src/utils/settings/types.ts',
      'src/screens/Doctor.tsx',
    ]) {
      writeExternalSource('/tmp/late110-final.9i14Sk/tree', relative, tree)
    }
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/worktree.ts'],
      /worktree.*lock|--reason|failed to lock|worktree.*unlock|residual dir cleanup|rev-parse.*HEAD|headCommit|fromCwd/,
      'case109-agent-worktree-locking',
    )
    writeCurrentSource('src/utils/teleport/gitBundle.ts', tree)
    const gitBundlePath = path.join(tree, 'src/utils/teleport/gitBundle.ts')
    replaceExactly(
      gitBundlePath,
      `function getBundleMaxBytes(): number {
  return (
    getFeatureValue_CACHED_MAY_BE_STALE<number | null>(
      'tengu_ccr_bundle_max_bytes',
      null,
    ) ?? DEFAULT_BUNDLE_MAX_BYTES
  )
}

`,
      '',
      'target 2.1.110 keeps the bundle-size gate inline',
    )
    replaceExactly(
      gitBundlePath,
      `  | 'empty_repo'
  | 'stash_failed'
  | 'no_changes'`,
      `  | 'empty_repo'`,
      'target 2.1.110 bundle failure union',
    )
    replaceExactly(
      gitBundlePath,
      `/**
 * Fast rejection for repositories whose packed object database is too large
 * even for the squashed bundle fallback. Used by /ultrareview before showing
 * a launch dialog that cannot succeed.
 */
export async function isRepoTooLargeForBundle(options?: {
  cwd?: string
  signal?: AbortSignal
}): Promise<boolean> {
  const gitRoot = findGitRoot(options?.cwd ?? getCwd())
  if (!gitRoot) return false
  const { sizeBytes, inPackCount } = await getPackedRepositoryStats(
    gitRoot,
    options?.signal,
  )
  if (sizeBytes === null) return false
  const maxBytes = getBundleMaxBytes()
  return (
    sizeBytes > 3 * maxBytes &&
    (sizeBytes > 100 * maxBytes ||
      (inPackCount !== null && inPackCount > 5_000_000))
  )
}

`,
      '',
      'target 2.1.110 omits the later preflight helper',
    )
    replaceExactly(
      gitBundlePath,
      `    const [treeResult, baseTreeResult] = await Promise.all(
      [treeRef, \`\${baseRef}^{tree}\`].map(ref =>
        execFileNoThrowWithCwd(gitExe(), ['rev-parse', ref], {
          cwd: gitRoot,
          abortSignal: signal,
        }),
      ),
    )
    if (
      treeResult?.code === 0 &&
      treeResult.stdout.trim() === baseTreeResult?.stdout.trim()
    ) {
      return {
        ok: false,
        error:
          "It doesn't look like you have any new commits or changes to review. Stage or commit them first?",
        failReason: 'no_changes',
      }
    }
`,
      '',
      'target 2.1.110 predates empty-diff bundle rejection',
    )
    replaceExactly(
      gitBundlePath,
      [
        '  // exit 0 + empty stdout = nothing to stash. A failure with an existing',
        '  // HEAD is fatal because proceeding would silently omit local changes.',
        "  const wipStashSha = stashResult.code === 0 ? stashResult.stdout.trim() : ''",
        "  const hasWip = wipStashSha !== ''",
        '  if (stashResult.code !== 0) {',
        '    logForDebugging(',
        '      `[gitBundle] git stash create failed (${stashResult.code}): ${stashResult.stderr.slice(0, 200)}`,',
        '    )',
        '    const head = await execFileNoThrowWithCwd(',
        '      gitExe(),',
        "      ['rev-parse', '--verify', 'HEAD'],",
        '      { cwd: gitRoot },',
        '    )',
        '    if (head.code === 0) {',
        "      logEvent('tengu_ccr_bundle_upload', {",
        '        outcome:',
        "          'stash_failed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,",
        '      })',
        '      return {',
        '        success: false,',
        '        error: `Could not capture uncommitted changes (git stash create: ${stashResult.stderr.trim()}). Run \\`git add .\\` or commit, then retry.`,',
        "        failReason: 'stash_failed',",
        '      }',
        '    }',
        '  } else if (hasWip) {',
      ].join('\n'),
      `  // exit 0 + empty stdout = nothing to stash. Nonzero is rare; non-fatal.
  const wipStashSha = stashResult.code === 0 ? stashResult.stdout.trim() : ''
  const hasWip = wipStashSha !== ''
  if (stashResult.code !== 0) {
    logForDebugging(
      \`[gitBundle] git stash create failed (\${stashResult.code}), proceeding without WIP: \${stashResult.stderr.slice(0, 200)}\`,
    )
  } else if (hasWip) {`,
      'target 2.1.110 non-fatal stash failure',
    )
    replaceExactly(
      gitBundlePath,
      '    const maxBytes = getBundleMaxBytes()',
      `    const maxBytes =
      getFeatureValue_CACHED_MAY_BE_STALE<number | null>(
        'tengu_ccr_bundle_max_bytes',
        null,
      ) ?? DEFAULT_BUNDLE_MAX_BYTES`,
      'target 2.1.110 inline bundle-size gate',
    )
    // Target 110 adds per-repository HEAD watching to the env-less bridge and
    // includes repository/cwd/model context in code-session creation.  The
    // session-context builder predates this transition in the bundle but was
    // absent from the recovered source tree, so install it as a transitive
    // owner needed by the changed bridge initializer.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/git/gitFilesystem.ts'],
      /repoBranches|repoGitDirs|repoBranchListeners|addRepo|getBranchForRepo|addWatchedRepo|onRepoBranchChange|getCachedBranchForRepo/,
      'case109-multi-repo-git-watcher',
    )
    writeCurrentSource('src/bridge/gitSessionContext.ts', tree)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/bridge/codeSessionApi.ts'],
      /GitSessionContext|getCwd|gitContext|const config|buildGitSessionContext|, config/,
      'case109-code-session-context',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/gracefulShutdown.ts'],
      /createHash|hashErrorDetail|sanitizeErrorMessage|extractErrorStackFrames|safeErrorString|errorAnalyticsMetadata|suppressResumeHint/,
      'case109-shutdown-error-metadata',
    )
    // Plugin-contributed settings become observable only after the plugin
    // settings layer has initialized.  Target 110 records premature reads and
    // routes both target-owned consumers through the readiness-aware helper.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/settings/settingsCache.ts'],
      /pluginSettingsBaseInitialized|isPluginSettingsBaseInitialized/,
      'case109-plugin-settings-readiness-cache',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/settings/settings.ts'],
      /isPluginSettingsBaseInitialized|getSettingsAfterPluginLoad|tengu_plugin_settings_premature_read/,
      'case109-plugin-settings-readiness-helper',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/main.tsx'],
      /getSettingsAfterPluginLoad|agentSetting/,
      'case109-plugin-settings-agent-consumer',
    )
    // 2.1.110 extends the intentionally narrow plugin-settings allowlist so a
    // plugin may own its subagent status-line command.  Keep this historical
    // supplement limited to that target-backed schema delta rather than
    // copying the subsequently evolved plugin loader wholesale.
    const pluginLoader = path.join(tree, 'src/utils/plugins/pluginLoader.ts')
    let pluginLoaderValue = fs.readFileSync(pluginLoader, 'utf8')
    const oldAllowlistComment =
      '// Only allowlisted keys are kept (currently: agent)'
    const oldAllowlist = '    .pick({\n      agent: true,\n    })'
    if (!pluginLoaderValue.includes(oldAllowlist)) {
      throw new Error('target 2.1.110 plugin-settings allowlist anchors differ')
    }
    if (pluginLoaderValue.includes(oldAllowlistComment)) {
      pluginLoaderValue = pluginLoaderValue.replace(
        oldAllowlistComment,
        '// Only allowlisted keys are kept (currently: agent, subagentStatusLine)',
      )
    }
    pluginLoaderValue = pluginLoaderValue
      .replace(
        oldAllowlist,
        '    .pick({\n      agent: true,\n      subagentStatusLine: true,\n    })',
      )
    fs.writeFileSync(pluginLoader, pluginLoaderValue)

    // Target 110 evolves the pending-action projection independently of the
    // target-108 introduction: prefer the display name and retain tool_use_id
    // in CCR worker state.  Install the complete target-110 owner set here so
    // this case's own historical tree does not rely on replaying case 107.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/sessionState.ts'],
      /raw_command/,
      'case109-bridge-details-type',
    )
    const transportPath = path.join(tree, 'src/bridge/replBridgeTransport.ts')
    replaceExactly(
      transportPath,
      "import type { SessionState } from '../utils/sessionState.js'",
      "import type {\n  RequiresActionDetails,\n  SessionState,\n} from '../utils/sessionState.js'",
      'target 2.1.110 bridge transport details import',
    )
    replaceExactly(
      transportPath,
      '  reportState(state: SessionState): void',
      '  reportState(state: SessionState, details?: RequiresActionDetails): void',
      'target 2.1.110 bridge transport details signature',
    )
    replaceExactly(
      transportPath,
      `    reportState(state) {
      ccr.reportState(state)
    },`,
      `    reportState(state, details) {
      ccr.reportState(state, details)
    },`,
      'target 2.1.110 bridge transport details forwarding',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/bridge/remoteBridgeCore.ts'],
      /tengu_bridge_requires_action_details|BASH_TOOL_NAME|POWERSHELL_TOOL_NAME|action_description|raw_command|transport\.reportState\('requires_action', details\)/,
      'case109-bridge-details-runtime',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/transports/ccrClient.ts'],
      /raw_command|tool_use_id/,
      'case109-ccr-action-details',
    )

    // Cowork prompt-cache diagnostics become durable at target 110.  The
    // current owner retains that exact persistence/message-history graph but
    // target 116 adds the is1hCacheTTL/queryDepth state and five extra event
    // dimensions, so install the current owner and remove only that later
    // evolution for this historical boundary.
    writeCurrentSource(
      'src/services/api/promptCacheBreakDetection.ts',
      tree,
    )
    const promptCachePath = path.join(
      tree,
      'src/services/api/promptCacheBreakDetection.ts',
    )
    replaceExactly(
      promptCachePath,
      `  isUsingOverage: boolean
  is1hCacheTTL: boolean
  queryDepth?: number
  /** Cache-editing beta header presence`,
      `  isUsingOverage: boolean
  /** Cache-editing beta header presence`,
      'target 2.1.110 prompt-cache state fields',
    )
    replaceExactly(
      promptCachePath,
      `    isUsingOverage: z.boolean(),
    is1hCacheTTL: z.boolean().default(false),
    queryDepth: z.number().optional(),
    cachedMCEnabled: z.boolean(),`,
      `    isUsingOverage: z.boolean(),
    cachedMCEnabled: z.boolean(),`,
      'target 2.1.110 prompt-cache persisted schema',
    )
    replaceExactly(
      promptCachePath,
      `  isUsingOverage?: boolean
  is1hCacheTTL?: boolean
  queryDepth?: number
  cachedMCEnabled?: boolean`,
      `  isUsingOverage?: boolean
  cachedMCEnabled?: boolean`,
      'target 2.1.110 prompt-cache snapshot fields',
    )
    replaceExactly(
      promptCachePath,
      `      isUsingOverage = false,
      is1hCacheTTL = false,
      queryDepth,
      cachedMCEnabled = false,`,
      `      isUsingOverage = false,
      cachedMCEnabled = false,`,
      'target 2.1.110 prompt-cache snapshot destructuring',
    )
    replaceExactly(
      promptCachePath,
      `        isUsingOverage,
        is1hCacheTTL,
        queryDepth,
        cachedMCEnabled,`,
      `        isUsingOverage,
        cachedMCEnabled,`,
      'target 2.1.110 prompt-cache initial state',
    )
    replaceExactly(
      promptCachePath,
      `    prev.isUsingOverage = isUsingOverage
    prev.is1hCacheTTL = is1hCacheTTL
    prev.queryDepth = queryDepth
    prev.cachedMCEnabled = cachedMCEnabled`,
      `    prev.isUsingOverage = isUsingOverage
    prev.cachedMCEnabled = cachedMCEnabled`,
      'target 2.1.110 prompt-cache state refresh',
    )
    replaceExactly(
      promptCachePath,
      `      systemHash: state.systemHash,
      toolsHash: state.toolsHash,
      is1hCacheTTL: state.is1hCacheTTL,
      queryDepth: state.queryDepth,
      querySource,
      model: state.model,
      globalCacheStrategy: state.globalCacheStrategy,
      callNumber: state.callCount,`,
      `      systemHash: state.systemHash,
      toolsHash: state.toolsHash,
      callNumber: state.callCount,`,
      'target 2.1.110 prompt-cache event fields',
    )
    // The recovered snapshot referenced REPLTool lazily from tools.ts but
    // omitted its authored prompt owner.  Targets 110 and 116 have the same
    // async, memoized gh-detection prompt function byte-for-byte modulo names;
    // install that exact cumulative owner so the model-facing prompt is
    // reproducible from this historical source tree.
    writeCurrentSource('src/tools/REPLTool/prompt.ts', tree)

    // Target 110 exposes PushNotification as a deferred tool.  The compiled
    // target already contains the tools.ts/config registration, but its three
    // authored owner files were absent from the recovered snapshot.  Install
    // the exact target-110 files plus the bridge-activity call path that gates
    // mobile delivery.  These owners are unchanged in target 116.
    for (const relative of [
      'src/tools/PushNotificationTool/PushNotificationTool.ts',
      'src/tools/PushNotificationTool/UI.tsx',
      'src/tools/PushNotificationTool/prompt.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    // The dynamic/cloud loop graph was introduced at target 101 and is
    // unchanged through target 110. Materialize that authenticated transitive
    // owner before enabling the formerly forced-false push gate: the existing
    // helper and both call sites then compile to target-110 row 18994 without
    // importing later loop-command evolution.
    writeExternalSource(
      '/tmp/middle101-integrated-final.tPpYsf',
      'src/skills/bundled/loop.ts',
      tree,
    )
    // The loop sentinel owner is also absent from the recovered snapshot.
    // Target 110 makes its push-notification gate live for both loop ticks and
    // Monitor. The current owner retains this target-110 behavior unchanged.
    writeCurrentSource('src/utils/loopSentinels.ts', tree)
    // Monitor itself is a transitive owner absent from the recovered source
    // snapshot. Materialize it so the target-110 change can be proved, then
    // retain the historical placement (guidance after the XML envelope) and
    // omit the later per-agent queue routing added by target 116.
    writeCurrentSource('src/tools/MonitorTool/MonitorTool.ts', tree)
    const target110MonitorPath = path.join(
      tree,
      'src/tools/MonitorTool/MonitorTool.ts',
    )
    replaceExactly(
      target110MonitorPath,
      `  options?: { isHousekeeping?: boolean; agentId?: string },`,
      `  options?: { isHousekeeping?: boolean },`,
      'target 2.1.110 monitor event options',
    )
    replaceExactly(
      target110MonitorPath,
      `    value: \`<task-notification>\${id}
<summary>Monitor event: "\${escapeXml(description)}"</summary>
<event>\${escapeXml(event)}</event>\${pushGuidance}
</task-notification>\`,`,
      `    value: \`<task-notification>\${id}
<summary>Monitor event: "\${escapeXml(description)}"</summary>
<event>\${escapeXml(event)}</event>
</task-notification>\${pushGuidance}\`,`,
      'target 2.1.110 monitor push-guidance placement',
    )
    replaceExactly(
      target110MonitorPath,
      `    priority: 'next',
    agentId: options?.agentId,`,
      `    priority: 'next',`,
      'target 2.1.110 monitor notification routing',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/bootstrap/state.ts'],
      /isReplBridgeActive|setReplBridgeActive|userInteraction|onUserInteraction/,
      'case109-push-bridge-state',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/hooks/useMergedTools.ts'],
      /setReplBridgeActive|replBridgeEnabled|replBridgeOutboundOnly/,
      'case109-push-bridge-hook',
    )

    // Target 110's reconciler makes DOM-style keyboard/paste/wheel handlers
    // acquire a raw-mode reference, including nodes created before App mounts.
    // The recovered target commit retained the older Ink source even though
    // the compiled bundle contains this complete graph.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/ink/events/event-handlers.ts'],
      /WheelEvent|INPUT_EVENT_HANDLER_PROPS|onWheel/,
      'case109-ink-input-handler-set',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/ink/dom.ts'],
      /_holdsRawModeRef|setRawMode|_pendingRawModeDelta/,
      'case109-ink-raw-mode-fields',
    )
    const target110ReconcilerPath = path.join(tree, 'src/ink/reconciler.ts')
    replaceExactly(
      target110ReconcilerPath,
      `import { EVENT_HANDLER_PROPS } from './events/event-handlers.js'`,
      `import {
  EVENT_HANDLER_PROPS,
  INPUT_EVENT_HANDLER_PROPS,
} from './events/event-handlers.js'`,
      'target 2.1.110 Ink input handler import',
    )
    replaceExactly(
      target110ReconcilerPath,
      `function applyProp(node: DOMElement, key: string, value: unknown): void {`,
      `function hasInputEventHandler(node: DOMElement): boolean {
  const handlers = node._eventHandlers
  if (!handlers) return false
  for (const key of INPUT_EVENT_HANDLER_PROPS) {
    if (handlers[key] != null) return true
  }
  return false
}

function updateRootRawModeRef(root: DOMElement, delta: 1 | -1): void {
  if (root.setRawMode) root.setRawMode(delta > 0)
  else root._pendingRawModeDelta = (root._pendingRawModeDelta ?? 0) + delta
}

function syncRawModeRef(node: DOMElement, root: DOMElement): void {
  const shouldHold = hasInputEventHandler(node)
  if (shouldHold === Boolean(node._holdsRawModeRef)) return
  node._holdsRawModeRef = shouldHold
  updateRootRawModeRef(root, shouldHold ? 1 : -1)
}

function releaseRawModeRefs(node: DOMElement, root: DOMElement): void {
  if (node._holdsRawModeRef) {
    node._holdsRawModeRef = false
    updateRootRawModeRef(root, -1)
  }
  for (const child of node.childNodes) {
    if (child.nodeName !== '#text') releaseRawModeRefs(child, root)
  }
}

function applyProp(node: DOMElement, key: string, value: unknown): void {`,
      'target 2.1.110 Ink raw-mode helpers',
    )
    replaceExactly(
      target110ReconcilerPath,
      `    _root: DOMElement,
    hostContext: HostContext,`,
      `    root: DOMElement,
    hostContext: HostContext,`,
      'target 2.1.110 Ink create root',
    )
    replaceExactly(
      target110ReconcilerPath,
      `    for (const [key, value] of Object.entries(newProps)) {
      applyProp(node, key, value)
    }

    if (isDebugRepaintsEnabled()) {`,
      `    for (const [key, value] of Object.entries(newProps)) {
      applyProp(node, key, value)
    }
    syncRawModeRef(node, root)

    if (isDebugRepaintsEnabled()) {`,
      'target 2.1.110 Ink create raw ref',
    )
    replaceExactly(
      target110ReconcilerPath,
      `    cleanupYogaNode(removeNode)
    getFocusManager(node).handleNodeRemoved(removeNode, node)
  },`,
      `    cleanupYogaNode(removeNode)
    getFocusManager(node).handleNodeRemoved(removeNode, node)
    releaseRawModeRefs(removeNode, node)
  },`,
      'target 2.1.110 Ink root removal raw refs',
    )
    replaceExactly(
      target110ReconcilerPath,
      `    const props = diff(oldProps, newProps)
    const style = diff(oldProps['style'] as Styles, newProps['style'] as Styles)

    if (props) {`,
      `    const props = diff(oldProps, newProps)
    const style = diff(oldProps['style'] as Styles, newProps['style'] as Styles)
    let inputEventHandlerChanged = false

    if (props) {`,
      'target 2.1.110 Ink update raw flag',
    )
    replaceExactly(
      target110ReconcilerPath,
      `        if (EVENT_HANDLER_PROPS.has(key)) {
          setEventHandler(node, key, value)
          continue
        }`,
      `        if (EVENT_HANDLER_PROPS.has(key)) {
          setEventHandler(node, key, value)
          if (INPUT_EVENT_HANDLER_PROPS.has(key)) inputEventHandlerChanged = true
          continue
        }`,
      'target 2.1.110 Ink update handler detection',
    )
    replaceExactly(
      target110ReconcilerPath,
      `    if (style && node.yogaNode) {`,
      `    if (inputEventHandlerChanged) syncRawModeRef(node, getRootNode(node))

    if (style && node.yogaNode) {`,
      'target 2.1.110 Ink update raw ref',
    )
    replaceExactly(
      target110ReconcilerPath,
      `      const root = getRootNode(node)
      root.focusManager!.handleNodeRemoved(removeNode, root)
    }
  },`,
      `      const root = getRootNode(node)
      root.focusManager!.handleNodeRemoved(removeNode, root)
      releaseRawModeRefs(removeNode, root)
    }
  },`,
      'target 2.1.110 Ink child removal raw refs',
    )
    const target110InkAppPath = path.join(tree, 'src/ink/components/App.tsx')
    replaceExactly(
      target110InkAppPath,
      `import { EventEmitter } from '../events/emitter.js';`,
      `import type { DOMElement } from '../dom.js';
import { EventEmitter } from '../events/emitter.js';`,
      'target 2.1.110 Ink App root type',
    )
    replaceExactly(
      target110InkAppPath,
      `  readonly dispatchKeyboardEvent: (parsedKey: ParsedKey) => void;
};`,
      `  readonly dispatchKeyboardEvent: (parsedKey: ParsedKey) => void;
  readonly rootNode: DOMElement;
};`,
      'target 2.1.110 Ink App root prop',
    )
    replaceExactly(
      target110InkAppPath,
      `  override componentDidMount() {
    // In accessibility mode, keep the native cursor visible for screen magnifiers and other tools`,
      `  override componentDidMount() {
    const root = this.props.rootNode;
    const pendingRawModeDelta = root._pendingRawModeDelta ?? 0;
    root._pendingRawModeDelta = 0;
    for (let i = 0; i < pendingRawModeDelta; i++) {
      this.handleSetRawMode(true);
    }
    for (let i = 0; i > pendingRawModeDelta; i--) {
      this.handleSetRawMode(false);
    }
    root.setRawMode = this.handleSetRawMode;

    // In accessibility mode, keep the native cursor visible for screen magnifiers and other tools`,
      'target 2.1.110 Ink App pending raw refs',
    )
    replaceExactly(
      target110InkAppPath,
      `  override componentWillUnmount() {
    if (this.props.stdout.isTTY) {`,
      `  override componentWillUnmount() {
    this.props.rootNode.setRawMode = undefined;

    if (this.props.stdout.isTTY) {`,
      'target 2.1.110 Ink App raw callback cleanup',
    )
    const target110InkPath = path.join(tree, 'src/ink/ink.tsx')
    replaceExactly(
      target110InkPath,
      `dispatchKeyboardEvent={this.dispatchKeyboardEvent}>`,
      `dispatchKeyboardEvent={this.dispatchKeyboardEvent} rootNode={this.rootNode}>`,
      'target 2.1.110 Ink App root wiring',
    )

    // Account-backed mobile notification preferences are introduced with the
    // push tool in target 110.  Recover the complete API/store owner, the
    // config gates/toggle/rollback/reachability UI, and the remote-session
    // hydration trigger.  The service and observable flow are unchanged in
    // target 116.
    const earlyPersistenceRoot = '/tmp/early-own-worktrees/90'
    const inheritedPersistencePatch = gitPatch(earlyPersistenceRoot, [
      'diff',
      ...patchArgs,
      '--',
      'src/bridge/remoteBridgeCore.ts',
      'src/bridge/replBridge.ts',
      'src/utils/sessionStorage.ts',
    ])
    const inheritedPersistencePatchPath = path.join(
      tree,
      '.case109-inherited-persistence.patch',
    )
    fs.writeFileSync(inheritedPersistencePatchPath, inheritedPersistencePatch)
    git(tree, ['apply', '--3way', inheritedPersistencePatchPath])
    fs.unlinkSync(inheritedPersistencePatchPath)
    writeExternalSource(
      earlyPersistenceRoot,
      'src/bridge/persistenceSync.ts',
      tree,
    )
    const replBridgeTransportPath = path.join(
      tree,
      'src/bridge/replBridgeTransport.ts',
    )
    replaceExactly(
      replBridgeTransportPath,
      `import type {
  RequiresActionDetails,
  SessionState,
} from '../utils/sessionState.js'
`,
      `import type {
  RequiresActionDetails,
  SessionState,
} from '../utils/sessionState.js'
import type {
  InternalEventReaders,
  InternalEventWriter,
} from './persistenceSync.js'
`,
      'target 2.1.110 persistence transport imports',
    )
    replaceExactly(
      replBridgeTransportPath,
      `  flush(): Promise<void>
}`,
      `  flush(): Promise<void>
  getInternalEventWriter?(): InternalEventWriter
  getInternalEventReaders?(): InternalEventReaders
}`,
      'target 2.1.110 persistence transport surface',
    )
    replaceExactly(
      replBridgeTransportPath,
      `    flush() {
      return ccr.flush()
    },
    connect() {`,
      `    flush() {
      return ccr.flush()
    },
    getInternalEventWriter() {
      return (eventType, payload, options) =>
        ccr.writeInternalEvent(eventType, payload, options)
    },
    getInternalEventReaders() {
      return {
        readMain: () => ccr.readInternalEvents(),
        readSubagents: () => ccr.readSubagentInternalEvents(),
      }
    },
    connect() {`,
      'target 2.1.110 persistence transport adapters',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/sessionStorage.ts'],
      /listAllSubagentTranscriptIdsFromDisk|List the current session's on-disk subagent IDs|Persistence sync stats/,
      'case109-persistence-id-list',
    )
    writeCurrentSource('src/services/notificationPreferences.ts', tree)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/Settings/Config.tsx'],
      /notificationPreferences|PushNotificationPreferences|Push when actions required|tengu_push_notif_pref_changed|PushReachability|pushReachability|No mobile registered|claude\.com\/download#mobile|isEssentialTrafficOnly|getClaudeAIOAuthTokens|Link from/,
      'case109-notification-preferences-config',
    )
    writeCurrentSource('src/bridge/clientPresence.ts', tree)
    const initBridgePath = path.join(tree, 'src/bridge/initReplBridge.ts')
    replaceExactly(
      initBridgePath,
      "import { getFeatureValue_CACHED_WITH_REFRESH } from '../services/analytics/growthbook.js'\n",
      `import {
  getFeatureValue_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_WITH_REFRESH,
} from '../services/analytics/growthbook.js'
import { hydrateNotificationPreferences } from '../services/notificationPreferences.js'
`,
      'target 2.1.110 notification preference imports',
    )
    replaceExactly(
      initBridgePath,
      "import type { PermissionMode } from '../utils/permissions/PermissionMode.js'\n",
      "import type { PermissionMode } from '../utils/permissions/PermissionMode.js'\nimport { isEssentialTrafficOnly } from '../utils/privacyLevel.js'\n",
      'target 2.1.110 notification preference privacy import',
    )
    replaceExactly(
      initBridgePath,
      `import {
  getCurrentSessionTitle,
  saveCustomTitle,
} from '../utils/sessionStorage.js'
`,
      `import {
  clearInternalEventWriter,
  getCurrentSessionTitle,
  listAllSubagentTranscriptIdsFromDisk,
  saveCustomTitle,
  setInternalEventWriter,
} from '../utils/sessionStorage.js'
import { getSessionIngressAuthHeaders } from '../utils/sessionIngressAuth.js'
`,
      'target 2.1.110 session-ingress auth import',
    )
    replaceExactly(
      initBridgePath,
      `import {
  archiveBridgeSession,
  createBridgeSession,
  getBridgeSession,
  updateBridgeSessionTitle,
} from './createSession.js'
`,
      `import {
  archiveBridgeSession,
  createBridgeSession,
  getBridgeSession,
  updateBridgeSessionTitle,
} from './createSession.js'
import {
  cleanupBridgeClientPresence,
  wireBridgeClientPresence,
} from './clientPresence.js'
`,
      'target 2.1.110 bridge presence import',
    )
    replaceExactly(
      initBridgePath,
      "import { setCseShimGate } from './sessionIdCompat.js'\n",
      "import { setCseShimGate, toInfraSessionId } from './sessionIdCompat.js'\n",
      'target 2.1.110 compatible session id import',
    )
    replaceExactly(
      initBridgePath,
      "import { getPollIntervalConfig } from './pollConfig.js'\n",
      "import { getPollIntervalConfig } from './pollConfig.js'\nimport { syncPersistence } from './persistenceSync.js'\n",
      'target 2.1.110 persistence import',
    )
    replaceExactly(
      initBridgePath,
      '  tags?: string[]\n}',
      '  tags?: string[]\n  enableSessionPersistence?: boolean\n}',
      'target 2.1.110 persistence option',
    )
    replaceExactly(
      initBridgePath,
      `    outboundOnly,
    tags,
  } = options ?? {}

  // Wire the cse_ shim`,
      `    outboundOnly,
    tags,
    enableSessionPersistence,
  } = options ?? {}

  let persistenceGeneration = 0
  const persistenceCallbacks = {
    onTransportPersistenceReady: (
      writer: Parameters<typeof setInternalEventWriter>[0],
      readers: Parameters<typeof syncPersistence>[1],
    ): void => {
      const generation = ++persistenceGeneration
      void (async () => {
        try {
          const subagentIds = await listAllSubagentTranscriptIdsFromDisk()
          await syncPersistence(writer, readers, subagentIds)
        } catch (error) {
          logForDebugging(
            \`[bridge:repl] Persistence sync failed: \${errorMessage(error)}\`,
            { level: 'error' },
          )
        }
        if (generation !== persistenceGeneration) {
          logForDebugging(
            '[bridge:repl] Transport torn down during sync — skipping writer install',
          )
          return
        }
        setInternalEventWriter(writer)
        logForDebugging(
          '[bridge:repl] Session persistence enabled — transcript entries forwarded as internal events',
        )
      })()
    },
    onTransportPersistenceTeardown: (): void => {
      persistenceGeneration++
      clearInternalEventWriter()
    },
  }

  // Wire the cse_ shim`,
      'target 2.1.110 persistence coordinator',
    )
    replaceExactly(
      initBridgePath,
      `      outboundOnly,
      tags,
    })`,
      `      outboundOnly,
      tags,
      gitRepoUrl,
      branch,
      ...(enableSessionPersistence ? persistenceCallbacks : {}),
    })`,
      'target 2.1.110 env-less repository and persistence callbacks',
    )
    replaceExactly(
      initBridgePath,
      `  // ── GrowthBook gate: env-less bridge ──────────────────────────────────`,
      `  // Both env-less and environment-backed sessions advertise the repository
  // and branch active when Remote Control starts.
  const branch = await getBranch()
  const gitRepoUrl = await getRemoteUrl()

  // ── GrowthBook gate: env-less bridge ──────────────────────────────────`,
      'target 2.1.110 repository bootstrap before env-less bridge',
    )
    replaceExactly(
      initBridgePath,
      `  const branch = await getBranch()
  const gitRepoUrl = await getRemoteUrl()
  const sessionIngressUrl =`,
      `  const sessionIngressUrl =`,
      'target 2.1.110 remove duplicate v1 repository bootstrap',
    )
    replaceExactly(
      initBridgePath,
      `    previouslyFlushedUUIDs,
    onInboundMessage,
    onPermissionResponse,`,
      `    previouslyFlushedUUIDs,
    onInboundMessage,
    onSessionEstablished: sessionId => {
      wireBridgeClientPresence(
        toInfraSessionId(sessionId),
        sessionIngressUrl,
        getSessionIngressAuthHeaders,
      )
      if (
        getFeatureValue_CACHED_MAY_BE_STALE(
          'tengu_kairos_push_notifications',
          false,
        ) && !isEssentialTrafficOnly()
      ) {
        void hydrateNotificationPreferences()
      }
    },
    onPermissionResponse,`,
      'target 2.1.110 remote-session notification hydration',
    )
    replaceExactly(
      initBridgePath,
      `    onStateChange,
    perpetual,
  })`,
      `    onStateChange,
    perpetual,
    ...(enableSessionPersistence ? persistenceCallbacks : {}),
  })`,
      'target 2.1.110 bridge persistence callbacks',
    )
    replaceExactly(
      initBridgePath,
      '  return initBridgeCore({\n',
      '  const handle = await initBridgeCore({\n',
      'target 2.1.110 bridge handle wrapper start',
    )
    replaceExactly(
      initBridgePath,
      `    perpetual,
    ...(enableSessionPersistence ? persistenceCallbacks : {}),
  })
}

const TITLE_MAX_LEN = 50`,
      `    perpetual,
    ...(enableSessionPersistence ? persistenceCallbacks : {}),
  })
  return wrapBridgeClientPresence(handle)
}

function wrapBridgeClientPresence(
  handle: ReplBridgeHandle | null,
): ReplBridgeHandle | null {
  if (!handle) {
    cleanupBridgeClientPresence()
    return null
  }

  const teardown = handle.teardown.bind(handle)
  handle.teardown = async () => {
    cleanupBridgeClientPresence()
    await teardown()
  }
  return handle
}

const TITLE_MAX_LEN = 50`,
      'target 2.1.110 bridge presence cleanup wrapper',
    )

    const envLessBridgePath = path.join(
      tree,
      'src/bridge/remoteBridgeCore.ts',
    )
    if (
      !fs
        .readFileSync(envLessBridgePath, 'utf8')
        .includes('  onSessionEstablished?: (sessionId: string) => void')
    ) {
      replaceExactly(
        envLessBridgePath,
        `  initialMessages?: Message[]
  onInboundMessage?: (msg: SDKMessage) => void | Promise<void>
  /**`,
        `  initialMessages?: Message[]
  onInboundMessage?: (msg: SDKMessage) => void | Promise<void>
  onSessionEstablished?: (sessionId: string) => void
  /**`,
        'target 2.1.110 env-less session-established callback type',
      )
    }
    replaceExactly(
      envLessBridgePath,
      `  tags?: string[]
  onTransportPersistenceReady?: (`,
      `  tags?: string[]
  gitRepoUrl?: string | null
  branch?: string
  onTransportPersistenceReady?: (`,
      'target 2.1.110 env-less repository options',
    )
    if (
      !fs
        .readFileSync(envLessBridgePath, 'utf8')
        .includes('    onSessionEstablished,')
    ) {
      replaceExactly(
        envLessBridgePath,
        `    initialMessages,
    onInboundMessage,
    onUserMessage,`,
        `    initialMessages,
    onInboundMessage,
    onSessionEstablished,
    onUserMessage,`,
        'target 2.1.110 env-less callback destructuring',
      )
    }
    replaceExactly(
      envLessBridgePath,
      `    outboundOnly,
    tags,
    onTransportPersistenceReady,`,
      `    outboundOnly,
    tags,
    gitRepoUrl = null,
    branch = '',
    onTransportPersistenceReady,`,
      'target 2.1.110 env-less repository destructuring',
    )
    replaceExactly(
      envLessBridgePath,
      `  const createdSessionId = await withRetry(
    () =>
      createCodeSession(baseUrl, accessToken, title, cfg.http_timeout_ms, tags),`,
      `  const { getOriginalCwd } = await import('../bootstrap/state.js')
  const { getMainLoopModel } = await import('../utils/model/model.js')

  const createdSessionId = await withRetry(
    () =>
      createCodeSession(
        baseUrl,
        accessToken,
        title,
        cfg.http_timeout_ms,
        tags,
        gitRepoUrl ? { gitRepoUrl, branch } : undefined,
        getOriginalCwd(),
        getMainLoopModel(),
      ),`,
      'target 2.1.110 env-less code-session context',
    )
    if (
      !fs
        .readFileSync(envLessBridgePath, 'utf8')
        .includes('  onSessionEstablished?.(sessionId)')
    ) {
      replaceExactly(
        envLessBridgePath,
        `  const sessionId: string = createdSessionId
  logForDebugging(\`[remote-bridge] Created session \${sessionId}\`)`,
        `  const sessionId: string = createdSessionId
  onSessionEstablished?.(sessionId)
  logForDebugging(\`[remote-bridge] Created session \${sessionId}\`)`,
        'target 2.1.110 env-less session-established callback',
      )
    }
    replaceExactly(
      envLessBridgePath,
      `  let initialFlushDone = false
  let tornDown = false
  let authRecoveryInFlight = false
  // Latch for onUserMessage`,
      `  let initialFlushDone = false
  let tornDown = false
  let authRecoveryInFlight = false
  let hasPendingAction = false
  const reportBridgeState = (
    state: Parameters<ReplBridgeTransport['reportState']>[0],
    details?: Parameters<ReplBridgeTransport['reportState']>[1],
  ): void => {
    transport.reportState(state, details)
    if (state === 'requires_action' && details) {
      hasPendingAction = true
      transport.reportMetadata({ pending_action: details })
    } else if (hasPendingAction) {
      hasPendingAction = false
      transport.reportMetadata({ pending_action: null })
    }
  }
  // Latch for onUserMessage`,
      'target 2.1.110 pending-action metadata projection',
    )
    replaceExactly(
      envLessBridgePath,
      `  // Latch for onUserMessage — flips true when the callback returns true`,
      `  let unsubscribeRepoBranchChange: (() => void) | undefined
  let invalidateRepoBranch: (() => void) | undefined
  let refreshRepoBranch: (() => Promise<void>) | undefined
  if (gitRepoUrl) {
    void (async () => {
      const { parseGitRemote, parseGitHubRepository } = await import(
        '../utils/detectRepository.js'
      )
      const {
        addWatchedRepo,
        getCachedBranchForRepo,
        onRepoBranchChange,
      } = await import('../utils/git/gitFilesystem.js')
      const parsed = parseGitRemote(gitRepoUrl)
      const repository = parsed
        ? \`\${parsed.owner}/\${parsed.name}\`
        : parseGitHubRepository(gitRepoUrl)
      if (!repository) return
      const cwd = getOriginalCwd()
      await addWatchedRepo(cwd)
      if (tornDown) return

      let previousBranch: string | null | undefined
      refreshRepoBranch = async () => {
        if (tornDown) return
        const currentBranch = await getCachedBranchForRepo(cwd)
        if (
          currentBranch === undefined ||
          currentBranch === previousBranch
        ) {
          return
        }
        previousBranch = currentBranch
        transport.reportMetadata({
          current_branches: { [repository]: currentBranch },
        })
      }
      invalidateRepoBranch = () => {
        previousBranch = undefined
      }
      const onChange = () => void refreshRepoBranch?.()
      unsubscribeRepoBranchChange = onRepoBranchChange(onChange)
      void refreshRepoBranch()
    })().catch(err =>
      logForDebugging(
        \`[remote-bridge] current_branches setup failed: \${errorMessage(err)}\`,
      ),
    )
  }
  // Latch for onUserMessage — flips true when the callback returns true`,
      'target 2.1.110 current-branches coordinator',
    )
    replaceExactly(
      envLessBridgePath,
      `    connectCause = cause
    // Queue writes during rebuild`,
      `    connectCause = cause
    hasPendingAction = false
    invalidateRepoBranch?.()
    onTransportPersistenceTeardown?.()
    // Queue writes during rebuild`,
      'target 2.1.110 current-branches rebuild invalidation',
    )
    replaceExactly(
      envLessBridgePath,
      `      const seq = transport.getLastSequenceNum()
      onTransportPersistenceTeardown?.()
      transport.close()`,
      `      const seq = transport.getLastSequenceNum()
      transport.close()`,
      'target 2.1.110 persistence teardown placement',
    )
    replaceExactly(
      envLessBridgePath,
      `      wireTransportCallbacks()
      transport.connect()
      connectDeadline = setTimeout(`,
      `      wireTransportCallbacks()
      transport.connect()
      void refreshRepoBranch?.()
      connectDeadline = setTimeout(`,
      'target 2.1.110 current-branches rebuild refresh',
    )
    replaceExactly(
      envLessBridgePath,
      `    tornDown = true
    onTransportPersistenceTeardown?.()`,
      `    tornDown = true
    unsubscribeRepoBranchChange?.()
    onTransportPersistenceTeardown?.()`,
      'target 2.1.110 current-branches teardown',
    )
    let envLessBridge = fs.readFileSync(envLessBridgePath, 'utf8')
    envLessBridge = envLessBridge
      .replaceAll(
        "transport.reportState('running')",
        "reportBridgeState('running')",
      )
      .replaceAll(
        "transport.reportState('idle')",
        "reportBridgeState('idle')",
      )
      .replace(
        "transport.reportState('requires_action', details)",
        "reportBridgeState('requires_action', details)",
      )
    if (
      envLessBridge.includes("transport.reportState('running')") ||
      envLessBridge.includes("transport.reportState('idle')") ||
      envLessBridge.includes("transport.reportState('requires_action', details)")
    ) {
      throw new Error('target 2.1.110 bridge-state wrapper replacement incomplete')
    }
    fs.writeFileSync(envLessBridgePath, envLessBridge)

    // Target 110 makes survey submission undoable for three seconds. Keep
    // the exact historical survey owners (including the inherited memory
    // evaluation support they call) and select only the narrow REPL handler
    // and render propagation from the authenticated recovery worktree.
    const target110FeedbackRecovery = '/tmp/late110-ink.hDRM1y/tree'
    for (const relative of [
      'src/components/FeedbackSurvey/useSurveyState.tsx',
      'src/components/FeedbackSurvey/useFeedbackSurvey.tsx',
      'src/components/FeedbackSurvey/useMemorySurvey.tsx',
      'src/components/FeedbackSurvey/usePostCompactSurvey.tsx',
      'src/components/FeedbackSurvey/FeedbackSurvey.tsx',
      'src/components/FeedbackSurvey/FeedbackSurveyView.tsx',
    ]) {
      writeExternalSource(target110FeedbackRecovery, relative, tree)
    }
    applyMatchingExternalWorktreePatch(
      tree,
      target110FeedbackRecovery,
      ['src/screens/REPL.tsx'],
      /showedTranscriptPrompt|handleUndo|memoryEvaluation|feedbackSurvey\.state !== 'closed'/,
      'case109-feedback-survey-undo-repl',
    )

    // Context-hint rejection recovery is introduced in target 110: a keyed
    // zero-budget retry strips the rejected beta, latches thinking clearing,
    // keep-recent microcompacts tool results, applies the server-returned clear
    // IDs to the live REPL transcript, and carries the edits through streaming
    // and non-streaming fallbacks. This follows the external Feedback REPL
    // patch so both narrow historical edits apply against their source bases.
    installContextHintRuntime(tree, 'case109', 110)
    const target110ClaudePath = path.join(tree, 'src/services/api/claude.ts')
    replaceExactly(
      target110ClaudePath,
      `      effortValue: effort,
      extraBodyParams: getExtraBodyParams(),
    })`,
      `      effortValue: effort,
      extraBodyParams: getExtraBodyParams(),
      messagesForAPI,
    })`,
      'target 2.1.110 prompt-cache message history call path',
    )

    // Target 110 adds a dedicated Ultrareview stop path and routes all remote
    // task kills through the inherited TaskRegistry.  Recover only this
    // boundary's helper/call-site delta; the larger latest Ultraplan launch
    // evolution is deliberately not copied into the historical tree.
    const ultraplanPath = path.join(tree, 'src/commands/ultraplan.tsx')
    replaceExactly(
      ultraplanPath,
      "import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';\n",
      "import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';\nimport { isPolicyAllowed } from '../services/policyLimits/index.js';\n",
      'target 2.1.110 remote-session policy import',
    )
    replaceExactly(
      ultraplanPath,
      "import { updateTaskState } from '../utils/task/framework.js';\n",
      "import { updateTaskState } from '../utils/task/framework.js';\nimport type { TaskRegistry } from '../utils/task/framework.js';\n",
      'target 2.1.110 remote stop TaskRegistry type import',
    )
    replaceExactly(
      ultraplanPath,
      'export async function stopUltraplan(taskId: string, sessionId: string, setAppState: (f: (prev: AppState) => AppState) => void): Promise<void> {',
      'export async function stopUltraplan(taskId: string, sessionId: string, taskRegistry: TaskRegistry, setAppState: (f: (prev: AppState) => AppState) => void): Promise<void> {',
      'target 2.1.110 stopUltraplan TaskRegistry parameter',
    )
    replaceExactly(
      ultraplanPath,
      '  await RemoteAgentTask.kill(taskId, setAppState);',
      '  await RemoteAgentTask.kill(taskId, taskRegistry, setAppState);',
      'target 2.1.110 stopUltraplan TaskRegistry kill call',
    )
    replaceExactly(
      ultraplanPath,
      `    onSessionReady\n  } = opts;\n  const {`,
      `    onSessionReady\n  } = opts;\n  if (!isPolicyAllowed('allow_remote_sessions')) {\n    logEvent('tengu_ultraplan_create_failed', {\n      reason: 'policy_blocked' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n    });\n    return \`ultraplan: \${formatPreconditionError({ type: 'policy_blocked' })}\`;\n  }\n  const {`,
      'target 2.1.110 launchUltraplan remote-session policy gate',
    )
    replaceExactly(
      ultraplanPath,
      `}\n\n/**\n * Shared entry for the slash command, keyword trigger, and the plan-approval`,
      `}\n\nexport async function stopUltrareview(taskId: string, sessionId: string, taskRegistry: TaskRegistry, setAppState: (f: (prev: AppState) => AppState) => void): Promise<void> {\n  await RemoteAgentTask.kill(taskId, taskRegistry, setAppState);\n  logEvent('tengu_review_remote_stopped', {});\n  const url = getRemoteSessionUrl(sessionId, process.env.SESSION_INGRESS_URL);\n  enqueuePendingNotification({\n    value: \`Ultrareview stopped.\\n\\nSession: \${url}\`,\n    mode: 'task-notification'\n  });\n  enqueuePendingNotification({\n    value: 'The user stopped the ultrareview session above. Do not respond to the stop notification — wait for their next message.',\n    mode: 'task-notification',\n    isMeta: true\n  });\n}\n\n/**\n * Shared entry for the slash command, keyword trigger, and the plan-approval`,
      'target 2.1.110 stopUltrareview helper',
    )

    const backgroundTasksPath = path.join(
      tree,
      'src/components/tasks/BackgroundTasksDialog.tsx',
    )
    replaceExactly(
      backgroundTasksPath,
      "import { stopUltraplan } from '../../commands/ultraplan.js';",
      "import { stopUltraplan, stopUltrareview } from '../../commands/ultraplan.js';",
      'target 2.1.110 Ultrareview stop import',
    )
    replaceExactly(
      backgroundTasksPath,
      `        if (currentSelection_0.task.isUltraplan) {\n          void stopUltraplan(currentSelection_0.id, currentSelection_0.task.sessionId, setAppState);\n        } else {\n          void killRemoteAgentTask(currentSelection_0.id);\n        }`,
      `        if (currentSelection_0.task.isUltraplan) {\n          void stopUltraplan(currentSelection_0.id, currentSelection_0.task.sessionId, toolUseContext.taskRegistry, setAppState);\n        } else if (currentSelection_0.task.isRemoteReview) {\n          void stopUltrareview(currentSelection_0.id, currentSelection_0.task.sessionId, toolUseContext.taskRegistry, setAppState);\n        } else {\n          void killRemoteAgentTask(currentSelection_0.id);\n        }`,
      'target 2.1.110 list-mode remote stop routing',
    )
    replaceExactly(
      backgroundTasksPath,
      '    await RemoteAgentTask.kill(taskId_3, setAppState);',
      '    await RemoteAgentTask.kill(taskId_3, toolUseContext.taskRegistry, setAppState);',
      'target 2.1.110 generic remote TaskRegistry kill',
    )
    replaceExactly(
      backgroundTasksPath,
      "task_0.isUltraplan ? () => void stopUltraplan(task_0.id, task_0.sessionId, setAppState) : () => void killRemoteAgentTask(task_0.id)",
      "task_0.isUltraplan ? () => void stopUltraplan(task_0.id, task_0.sessionId, toolUseContext.taskRegistry, setAppState) : task_0.isRemoteReview ? () => void stopUltrareview(task_0.id, task_0.sessionId, toolUseContext.taskRegistry, setAppState) : () => void killRemoteAgentTask(task_0.id)",
      'target 2.1.110 detail-mode remote stop routing',
    )

    const skillLoadedPath = path.join(
      tree,
      'src/utils/telemetry/skillLoadedEvent.ts',
    )
    replaceExactly(
      skillLoadedPath,
      "    if (skill.type !== 'prompt') continue\n\n    logEvent('tengu_skill_loaded', {",
      "    if (skill.type !== 'prompt') continue\n    if (skill.source === 'builtin') continue\n\n    logEvent('tengu_skill_loaded', {",
      'target 2.1.110 builtin-skill telemetry exclusion',
    )

    // Strict owner-local literal/property scanning exposed four authored
    // call paths that were present in the target bundle but absent from the
    // checked-in target source. Keep these as narrow target-110 recoveries:
    // the subagent transcript cap/order, the chokidar readiness barrier, the
    // plugin monitor mount graph, and headless queue provenance batching.
    const persistenceSyncPath = path.join(
      tree,
      'src/bridge/persistenceSync.ts',
    )
    replaceExactly(
      persistenceSyncPath,
      `export type InternalEventReaders = {
  readMain(): Promise<InternalEvent[] | null>
  readSubagents(): Promise<InternalEvent[] | null>
}
`,
      `export type InternalEventReaders = {
  readMain(): Promise<InternalEvent[] | null>
  readSubagents(): Promise<InternalEvent[] | null>
}

const MAX_RECENT_SUBAGENT_TRANSCRIPTS = 20
`,
      'target 2.1.110 recent subagent transcript cap',
    )
    replaceExactly(
      persistenceSyncPath,
      `  let uploadedSubagents = 0
  for (const agentId of subagentIds) {
    const entries = await readLocalAfterCompaction(
      getAgentTranscriptPath(agentId as AgentId),
      serverEventIds,
    )`,
      `  let uploadedSubagents = 0
  for (const { agentId, path } of await selectRecentSubagentTranscripts(
    subagentIds,
  )) {
    const entries = await readLocalAfterCompaction(path, serverEventIds)`,
      'target 2.1.110 recent subagent transcript selection call',
    )
    replaceExactly(
      persistenceSyncPath,
      `async function readLocalAfterCompaction(
  path: string,`,
      `async function selectRecentSubagentTranscripts(
  agentIds: string[],
): Promise<Array<{ agentId: string; path: string }>> {
  const candidates = await Promise.all(
    agentIds.map(async agentId => {
      const path = getAgentTranscriptPath(agentId as AgentId)
      try {
        const file = await stat(path)
        return {
          agentId,
          path,
          size: file.size,
          mtimeMs: file.mtimeMs,
        }
      } catch {
        return null
      }
    }),
  )

  return candidates
    .filter(candidate => candidate !== null)
    .filter(candidate => candidate.size <= SKIP_PRECOMPACT_THRESHOLD)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_RECENT_SUBAGENT_TRANSCRIPTS)
}

async function readLocalAfterCompaction(
  path: string,`,
      'target 2.1.110 recent subagent transcript selector',
    )

    const skillChangeDetectorPath = path.join(
      tree,
      'src/utils/skills/skillChangeDetector.ts',
    )
    replaceExactly(
      skillChangeDetectorPath,
      `  watcher.on('add', handleChange)
  watcher.on('change', handleChange)
  watcher.on('unlink', handleChange)

  // Register cleanup`,
      `  watcher.on('add', handleChange)
  watcher.on('change', handleChange)
  watcher.on('unlink', handleChange)

  const initializedWatcher = watcher
  await new Promise<void>(resolve => {
    initializedWatcher.once('ready', resolve)
  })

  // Register cleanup`,
      'target 2.1.110 skill watcher readiness barrier',
    )

    const target110PrintPath = path.join(tree, 'src/cli/print.ts')
    replaceExactly(
      target110PrintPath,
      `    next.mode === 'prompt' &&
    next.workload === head.workload &&
    next.isMeta === head.isMeta
  )`,
      `    next.mode === 'prompt' &&
    next.workload === head.workload &&
    next.isMeta === head.isMeta &&
    next.shouldQuery === head.shouldQuery &&
    areMessageOriginsEqual(head.origin, next.origin)
  )`,
      'target 2.1.110 headless prompt batching provenance',
    )
    if (
      !fs
        .readFileSync(target110PrintPath, 'utf8')
        .includes('function areMessageOriginsEqual(')
    ) {
      replaceExactly(
        target110PrintPath,
        `function isSyntheticSessionTitleInput`,
        `function areMessageOriginsEqual(
  left: QueuedCommand['origin'],
  right: QueuedCommand['origin'],
): boolean {
  if (left === right) return true
  if (!left || !right || left.kind !== right.kind) return false
  if (left.kind === 'peer' && right.kind === 'peer') return left.from === right.from
  if (left.kind === 'channel' && right.kind === 'channel') return left.server === right.server
  return true
}

function isSyntheticSessionTitleInput`,
        'target 2.1.110 headless prompt origin equality helper',
      )
    }

    const target110ReplPath = path.join(tree, 'src/screens/REPL.tsx')
    replaceExactly(
      target110ReplPath,
      "import { useManagePlugins } from '../hooks/useManagePlugins.js';",
      "import { useManagePlugins, usePluginMonitors } from '../hooks/useManagePlugins.js';",
      'target 2.1.110 plugin monitor REPL import',
    )
    replaceExactly(
      target110ReplPath,
      `  useManagePlugins({
    enabled: !isRemoteSession
  });
  const tasksV2`,
      `  useManagePlugins({
    enabled: !isRemoteSession
  });
  usePluginMonitors({
    enabled: !isRemoteSession
  });
  const tasksV2`,
      'target 2.1.110 plugin monitor REPL mount',
    )

    // The headless side-question context factory is already fully state-backed
    // in the target-110 bundle. The public source snapshot omitted both its
    // adapters and the AppState slices they consume. Install the cumulative
    // authored owner, then remove only the five getters introduced at 116.
    writeCurrentSource('src/utils/queryContext.ts', tree)
    const target110QueryContextPath = path.join(tree, 'src/utils/queryContext.ts')
    let target110QueryContext = fs.readFileSync(target110QueryContextPath, 'utf8')
    target110QueryContext = target110QueryContext
      .replace(
        `    getToolPermissionContext: () => getAppState().toolPermissionContext,
    getEffortValue: () => getAppState().effortValue,
    getAutoCompactWindow: () => getAppState().autoCompactWindow,
    getFastMode: () => getAppState().fastMode,
    getCacheBreakerPhrase: () => getAppState().cacheBreakerPhrase,
`,
        '',
      )
      .replace(
        `    // Compatibility with the older response-length shape.
    setResponseLength: () => {},
`,
        '',
      )
    if (
      target110QueryContext.includes('getToolPermissionContext:') ||
      target110QueryContext.includes('Compatibility with the older response-length')
    ) {
      throw new Error('target 2.1.110 query-context downgrade incomplete')
    }
    fs.writeFileSync(target110QueryContextPath, target110QueryContext)
    writeCurrentSource('src/utils/classifierApprovals.ts', tree)

    const target110AppStatePath = path.join(tree, 'src/state/AppStateStore.ts')
    replaceExactly(
      target110AppStatePath,
      `  agentNameRegistry: Map<string, AgentId>
  // Task ID`,
      `  agentNameRegistry: Map<string, AgentId>
  agentTypesInvokedThisSession: Set<string>
  classifierApprovals: {
    approvals: Map<
      string,
      {
        classifier: 'bash' | 'auto-mode'
        matchedRule?: string
        reason?: string
      }
    >
    checking: Set<string>
  }
  teammateColors: {
    assignments: Map<string, AgentColorName>
    index: number
  }
  webBrowser: {
    view: unknown
    logs: unknown[]
    unreadErrors: number
    unreadWarnings: number
    cleanupRegistered: boolean
  }
  // Task ID`,
      'target 2.1.110 query-context AppState fields',
    )
    replaceBetween(
      target110AppStatePath,
      '  // REPL tool VM context',
      '  teamContext?: {',
      `  // One persistent REPL context per agent.
  replContexts: Record<string, unknown>
  teamContext?: {
`,
      'target 2.1.110 query-context REPL state',
    )
    replaceExactly(
      target110AppStatePath,
      `    agentNameRegistry: new Map(),
    verbose: false,`,
      `    agentNameRegistry: new Map(),
    agentTypesInvokedThisSession: new Set(),
    classifierApprovals: {
      approvals: new Map(),
      checking: new Set(),
    },
    teammateColors: {
      assignments: new Map(),
      index: 0,
    },
    webBrowser: {
      view: undefined,
      logs: [],
      unreadErrors: 0,
      unreadWarnings: 0,
      cleanupRegistered: false,
    },
    verbose: false,`,
      'target 2.1.110 query-context AppState defaults',
    )
    replaceExactly(
      target110AppStatePath,
      `  attribution: AttributionState
  todos: { [agentId: string]: TodoList }`,
      `  attribution: AttributionState
  cacheBreakerPhrase?: string
  todos: { [agentId: string]: TodoList }`,
      'target 2.1.110 query-context cache breaker type',
    )
    replaceExactly(
      target110AppStatePath,
      `    attribution: createEmptyAttributionState(),
    mcp: {`,
      `    attribution: createEmptyAttributionState(),
    cacheBreakerPhrase: undefined,
    mcp: {`,
      'target 2.1.110 query-context cache breaker state',
    )
    replaceExactly(
      target110AppStatePath,
      `    todos: {},
    remoteAgentTaskSuggestions: [],`,
      `    todos: {},
    replContexts: {},
    remoteAgentTaskSuggestions: [],`,
      'target 2.1.110 query-context REPL default',
    )

    // Apply the plugin-list registry call after all other target110 main.tsx
    // selections so their three-way hunks still see the original index.
    const target110MainPath = path.join(tree, 'src/main.tsx')
    let target110Main = fs.readFileSync(target110MainPath, 'utf8')
    const currentMain = fs.readFileSync(
      path.join(repositoryRoot, 'src/main.tsx'),
      'utf8',
    )
    const pluginListRegistryStart = '  // Plugin list command'
    const pluginListRegistryEnd = '  // Marketplace subcommands'
    const historicalRegistryStart = target110Main.indexOf(
      pluginListRegistryStart,
    )
    const historicalRegistryEnd = target110Main.indexOf(
      pluginListRegistryEnd,
      historicalRegistryStart,
    )
    const currentRegistryStart = currentMain.indexOf(pluginListRegistryStart)
    const currentRegistryEnd = currentMain.indexOf(
      pluginListRegistryEnd,
      currentRegistryStart,
    )
    if (
      [
        historicalRegistryStart,
        historicalRegistryEnd,
        currentRegistryStart,
        currentRegistryEnd,
      ].some(index => index < 0)
    ) {
      throw new Error('target 2.1.110 plugin-list registry anchors differ')
    }
    target110Main =
      target110Main.slice(0, historicalRegistryStart) +
      currentMain.slice(currentRegistryStart, currentRegistryEnd) +
      target110Main.slice(historicalRegistryEnd)
    fs.writeFileSync(target110MainPath, target110Main)

    // The five remote-workflow slash commands exist only in targets 110-112.
    // Preserve their exact historical owner files and registry entry here;
    // they are deliberately absent from cumulative current source because the
    // feature is removed at 113.
    const target110Recovery = '/tmp/context-hint-history.5ezFS0/110'
    for (const relative of [
      'src/commands/remote-workflows/index.ts',
      'src/commands/remote-workflows/spawner.tsx',
    ]) {
      writeExternalSource(target110Recovery, relative, tree)
    }
    const commandsPath = path.join(tree, 'src/commands.ts')
    replaceExactly(
      commandsPath,
      "import remoteEnv from './commands/remote-env/index.js'\n",
      "import remoteEnv from './commands/remote-env/index.js'\nimport { remoteWorkflowCommands } from './commands/remote-workflows/index.js'\n",
      'target 2.1.110 remote workflow import',
    )
    replaceExactly(
      commandsPath,
      '  remoteEnv,\n',
      '  remoteEnv,\n  ...remoteWorkflowCommands,\n',
      'target 2.1.110 remote workflow registry',
    )
    writeExternalSource(target110Recovery, 'src/utils/teleport.tsx', tree)
  }),
])
writeCase('2.1.110-to-2.1.111', [
  withTargetWorktree('5e168e7272e2eb510b16d7141538bb3f4836749a', tree => {
    // Selected-case regeneration must remain reproducible after the original
    // archaeology worktrees disappear. Bootstrap from the independently
    // pinned supplement, then apply only the bounded, idempotent recoveries
    // whose historical-source evidence is already present in this case.
    if (selectedCase === '2.1.110-to-2.1.111') {
      const existingSupplement = path.join(
        repositoryRoot,
        'recovery/cases/2.1.110-to-2.1.111/semantic-supplement.patch',
      )
      git(tree, ['apply', '--3way', existingSupplement])
      replayTarget111EvidenceGaps(tree)
      replayTarget111MatrixExtras(tree)
      return
    }
    writeFromGit(
      target108,
      'e9e3da6',
      'src/commands/provider-setup/relaunch.ts',
      tree,
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/betas.ts'],
      /provider !== 'anthropicAws'|\^claude-opus-4-7/,
      'case110-opus47-auto-mode',
    )
    const betas = path.join(tree, 'src/utils/betas.ts')
    const value = fs.readFileSync(betas, 'utf8')
    const needle = "    canonical.includes('claude-opus-4-6') ||\n"
    if (!value.includes(needle) || value.includes("canonical.includes('claude-opus-4-7')")) {
      throw new Error('target 2.1.111 betas owner no longer has the expected insertion point')
    }
    fs.writeFileSync(
      betas,
      value.replace(
        needle,
        `${needle}    canonical.includes('claude-opus-4-7') ||\n`,
      ),
    )
    // Opus 4.7's launch changes a complete first-party runtime surface at
    // this boundary. Install only the target111-era deltas over the target
    // commit; cumulative current source retains the later target116 cap and
    // two-headline presentation.
    for (const relative of [
      'src/components/BedrockSetupWizard.tsx',
      'src/components/VertexSetupWizard.tsx',
    ]) {
      writeCurrentSource(relative, tree)
    }
    installTarget111Opus47LogoSurface(tree)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/rateLimitMessages.ts'],
      /RateLimitLeverHint|getRateLimitLeverHint|resolveAppliedEffort|tengu_garnet_plover/,
      'case110-opus47-rate-limit-lever',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/api/errors.ts'],
      /recent Opus variant|opus-4-7|opus_4_7|opus-4-5|opus_4_5/,
      'case110-opus47-api-fallback',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/api/claude.ts'],
      /getCanonicalName|forceBudgetThinking|CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING/,
      'case110-opus47-adaptive-thinking',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/settings/applySettingsChange.ts'],
      /saveGlobalConfig|unpinOpus47LaunchEffort|awaySummaryEnabled =/,
      'case110-opus47-settings-unpin',
    )
    replaceExactly(
      path.join(tree, 'src/utils/settings/applySettingsChange.ts'),
      '      awaySummaryEnabled: isAwaySummaryEnabled(),\n      toolPermissionContext: newContext,',
      `      toolPermissionContext: newContext,
      ...(prev.awaySummaryEnabled !== awaySummaryEnabled
        ? { awaySummaryEnabled }
        : {}),`,
      'target 2.1.111 conditional away-summary propagation',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/commitAttribution.ts'],
      /opus-4-7/,
      'case110-opus47-commit-attribution',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/attribution.ts'],
      /Claude Opus 4\.7/,
      'case110-opus47-attribution-fallback',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/model/validateModel.ts'],
      /opus-4-5|opus_4_5/,
      'case110-opus47-validation-fallback',
    )
    // The latest source factors this branch into modelCommand.ts, but target
    // 111 still authored it in model.tsx. Keep the introduction-era owner
    // rather than trying to select across the later file split.
    writeExternalSource(
      '/tmp/late111-opus.Hnww62',
      'src/commands/model/model.tsx',
      tree,
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/config.ts'],
      /opus47LaunchSeenCount|unpinOpus47LaunchEffort: false/,
      'case110-opus47-config',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/hooks/notifs/useModelMigrationNotifications.tsx'],
      /Model updated to Opus 4\.7|current Opus default \(4\.7/,
      'case110-opus47-migration-notifications',
    )
    const target111AdvisorPath = path.join(tree, 'src/utils/advisor.ts')
    let target111Advisor = fs.readFileSync(target111AdvisorPath, 'utf8')
    const advisorModelAnchor = "    m.includes('opus-4-6') ||\n"
    if (target111Advisor.split(advisorModelAnchor).length - 1 !== 2) {
      throw new Error('target 2.1.111 advisor model anchors differ')
    }
    target111Advisor = target111Advisor.replaceAll(
      advisorModelAnchor,
      `    m.includes('opus-4-7') ||\n${advisorModelAnchor}`,
    )
    fs.writeFileSync(target111AdvisorPath, target111Advisor)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/model/agent.ts'],
      /applyMergedOpusContext|has1mContext|isOpus1mMergeEnabled/,
      'case110-opus47-agent-context',
    )
    const target111AgentPath = path.join(tree, 'src/utils/model/agent.ts')
    replaceExactly(
      target111AgentPath,
      `  const supportsMergedContext =
    getCanonicalName(model).includes('opus') && modelSupports1M(model)
  if (
    isOpus1mMergeEnabled() &&
    !has1mContext(model) &&
    supportsMergedContext
  ) {`,
      `  const canonical = getCanonicalName(model)
  if (
    isOpus1mMergeEnabled() &&
    !has1mContext(model) &&
    (canonical.includes('opus-4-7') || canonical.includes('opus-4-6'))
  ) {`,
      'target 2.1.111 explicit merged Opus families',
    )
    replaceExactly(
      target111AgentPath,
      "import { has1mContext, modelSupports1M } from '../context.js'",
      "import { has1mContext } from '../context.js'",
      'target 2.1.111 merged Opus imports',
    )
    // Opus 4.7 also becomes a Vertex region override in this target.  The
    // changed table unit includes the inherited Opus 4.5/4.6 entries, so keep
    // the complete target-observable ordering in this independently compiled
    // historical tree.
    const envUtilsPath = path.join(tree, 'src/utils/envUtils.ts')
    replaceExactly(
      envUtilsPath,
      "  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],\n  ['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS'],\n",
      "  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],\n  ['claude-opus-4-7', 'VERTEX_REGION_CLAUDE_4_7_OPUS'],\n  ['claude-opus-4-6', 'VERTEX_REGION_CLAUDE_4_6_OPUS'],\n  ['claude-opus-4-5', 'VERTEX_REGION_CLAUDE_4_5_OPUS'],\n  ['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS'],\n",
      'target 2.1.111 Vertex Opus region overrides',
    )
    // The target initializer changes the complete embedded document map, not
    // only the newly introduced migration document.  Install all exact target
    // literals plus the equivalent authored map/prompt owners so this case's
    // introduction tree is independently compilable and behaviorally exact.
    writeAllExtractedClaudeApiDocuments(111, tree)
    writeCurrentSource('src/skills/bundled/claudeApiContent.ts', tree)
    writeCurrentSource('src/skills/bundled/claudeApi.ts', tree)

    // Target 111 advances the public environment model-family catalog to
    // Opus 4.7 / Claude 4.X and replaces the old "same model" fast-mode
    // wording with the exact Opus-4.6-only guidance retained through 116.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/constants/prompts.ts'],
      /LATEST_CLAUDE_MODEL_IDS|The most recent Claude model family is Claude 4\.X|Fast mode for Claude Code uses \$\{FRONTIER_MODEL_NAME\}|includes\('opus-4-7'\)|January 2026/,
      'case110-model-family-prompt',
    )

    // Target 111 adds the Opus 4.7 2576px dimension override to the inherited
    // dynamic image-limit selector.  The complete owner is installed so this
    // introduction tree is independently buildable; the target110 provider
    // gate and call graph remain transitive evidence, not a new target111
    // behavior claim.
    writeCurrentSource('src/utils/imageLimits.ts', tree)

    // Target 111 introduces the 30-second stop grace period and generic
    // sleep-inhibitor lifecycle.  The implementation is byte-observable and
    // remains semantically unchanged through target 116.
    writeCurrentSource('src/services/preventSleep.ts', tree)

    // Target 111 makes the Bash permission-miss taxonomy observable and gates
    // the multi-command prompt guidance.  Select only the diagnostic/property
    // hunks here: cumulative current source also carries later sandbox
    // auto-allow hardening which must not leak into this introduction tree.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/types/permissions.ts'],
      /bashMissKind\?:/,
      'case110-bash-miss-kind-type',
    )
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/tools/BashTool/sedValidation.ts',
        'src/tools/BashTool/pathValidation.ts',
        'src/tools/BashTool/bashCommandHelpers.ts',
        'src/tools/BashTool/bashPermissions.ts',
      ],
      /bashMissKind:/,
      'case110-bash-miss-kind-runtime',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/BashTool/prompt.ts'],
      /getFeatureValue_CACHED_MAY_BE_STALE|tengu_relay_chain_v1|multipleCommandsItems/,
      'case110-bash-relay-prompt-gate',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/BashTool/readOnlyValidation.ts'],
      /parseForSecurityFromAst|getParserModule|isSafeEnvironmentVariable|READ_ONLY_COMMAND_NAMES|READ_ONLY_COMMAND_PREFIXES|NO_ARGUMENT_READ_ONLY_COMMANDS|EXACT_READ_ONLY_ARGV|READ_ONLY_REDIRECT_OPERATORS|astResult|parsedCommand\.(redirects|envVars|argv|text)/,
      'case110-bash-ast-read-only',
    )
    const target111PathValidation = path.join(
      tree,
      'src/tools/BashTool/pathValidation.ts',
    )
    replaceExactly(
      target111PathValidation,
      `        decisionReason: {
          type: 'other',
          reason: \`Dangerous \${command} operation on critical path: \${absolutePath}\`,
        },`,
      `        decisionReason: {
          type: 'other',
          reason: \`Dangerous \${command} operation on critical path: \${absolutePath}\`,
          bashMissKind: 'dangerous-path',
        },`,
      'target 2.1.111 dangerous-removal miss kind',
    )

    // Target 111 adds OSC-11 system-theme watching.  The exact historical
    // watcher probes immediately, while target116 adds an initial-probe latch;
    // use the authenticated target111 owners and their inherited notification
    // dispatch graph rather than copying cumulative current source wholesale.
    const target111ThemeRoot = '/tmp/late111-opus.Hnww62'
    for (const relative of [
      'src/utils/systemThemeWatcher.ts',
      'src/ink/theme-notify.ts',
      'src/ink/terminal-querier.ts',
      'src/ink/components/App.tsx',
      'src/components/design-system/ThemeProvider.tsx',
    ]) {
      writeExternalSource(target111ThemeRoot, relative, tree)
    }

    // Target 111 versions every didOpen/didChange notification and drops only
    // diagnostics older than the manager's current URI version.  Both owners
    // remain semantically unchanged through target 116.
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/services/lsp/LSPServerManager.ts',
        'src/services/lsp/passiveFeedback.ts',
      ],
      /documentVersions|nextDocumentVersion|getDocumentVersion|Dropping stale publishDiagnostics|diagnosticParams\.version|\(v\$\{version\}\)/,
      'case110-lsp-document-version',
    )

    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/PowerShellTool/pathValidation.ts'],
      /Paths beginning with ~user|\/\^~\[\^\/\]\//,
      'case110-powershell-tilde-user-path',
    )

    // Target 111 makes typo distance an explicit bounded option, upgrades the
    // helper to adjacent-transposition-aware Damerau distance, and uses the
    // two-edit surface for command/Skill suggestions.  It also rejects known
    // unavailable commands before attempting interactive module loading.
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/utils/suggestions/commandSuggestions.ts',
        'src/utils/processUserInput/processSlashCommand.tsx',
        'src/tools/SkillTool/SkillTool.ts',
      ],
      /maxEditDistance|substitutionCost|matrix\[leftIndex|Do not guess names|isn't available in this environment|opens an interactive panel/,
      'case110-command-distance-noninteractive',
    )

    // Target 111 removes the stale feature-gated legacy explanation and keeps
    // one concise, unconditional Skill invocation instruction whenever the
    // Skill tool has user-invocable commands.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/constants/prompts.ts'],
      /When the user types .*<skill-name>.*Only use skills listed/,
      'case110-skill-invocation-guidance',
    )

    applyMatchingWorkingTreePatch(
      tree,
      ['src/query.ts'],
      /tengu_ptl_surfaced_to_user|wasGatedByPriorAttempt|surfacedReason/,
      'case110-ptl-surface-telemetry',
    )

    // Target111 owns the pre-consolidation SSH hook with its live mode ref.
    // Latest source factors this lifecycle into useExternalSession, so retain
    // the authenticated introduction-era hook and select only the still-live
    // REPL caller from current source.
    writeExternalSource(
      '/tmp/late111-regenerated.iStTBH/tree',
      'src/hooks/useSSHSession.ts',
      tree,
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/screens/REPL.tsx'],
      /permissionMode: toolPermissionContext\.mode/,
      'case110-ssh-permission-mode-caller',
    )

    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/utils/nativeInstaller/download.ts',
        'src/utils/nativeInstaller/installer.ts',
      ],
      /Use 'latest' or 'stable'|channel !== 'rc'|channel === 'rc'|wasSkipped\?: boolean|wasSkipped: updateResult\.wasSkipped/,
      'case110-native-installer-result',
    )

    // Monitor is a transitive target107 owner whose PushNotification guidance
    // was enabled in target110. Target111 moves that guidance from after the
    // XML envelope to inside task-notification, immediately after </event>.
    // Start from the authenticated target110 owner so later per-agent routing
    // does not leak into the target111 introduction tree.
    writeExternalSource(
      '/tmp/late110-regenerated.udwtHE/tree',
      'src/tools/MonitorTool/MonitorTool.ts',
      tree,
    )
    replaceExactly(
      path.join(tree, 'src/tools/MonitorTool/MonitorTool.ts'),
      `<event>\${escapeXml(event)}</event>
</task-notification>\${pushGuidance}\`,`,
      `<event>\${escapeXml(event)}</event>\${pushGuidance}
</task-notification>\`,`,
      'target 2.1.111 monitor push-guidance placement',
    )

    // Target 111 adds the configurable proxy-auth helper and its reachable
    // startup/retry call graph.  Use the authenticated target111 historical
    // owners rather than the cumulative current files because later source
    // carries additional target116 retry and managed-environment evolution.
    const target111ProxyRoot = '/tmp/late111-image.lo5kmc'
    for (const relative of [
      'src/utils/settings/types.ts',
      'src/utils/proxy.ts',
      'src/utils/managedEnvConstants.ts',
      'src/services/api/withRetry.ts',
      'src/setup.ts',
    ]) {
      writeExternalSource(target111ProxyRoot, relative, tree)
    }

    // Target 111 adds the SDK-to-query appendSubagentSystemPrompt control
    // surface.  Use the frozen authenticated historical owners so the SDK
    // schema, headless seed, both query contexts, subagent cache-safe prompt,
    // and nested option propagation remain one reachable graph.
    const target111AppendPromptRoot = '/tmp/late111-canonical.zv5Xhg/tree'
    for (const relative of [
      'src/Tool.ts',
      'src/tools/AgentTool/runAgent.ts',
      'src/entrypoints/sdk/controlSchemas.ts',
      'src/QueryEngine.ts',
      'src/cli/print.ts',
      'src/main.tsx',
    ]) {
      writeExternalSource(target111AppendPromptRoot, relative, tree)
    }

    // Target111 adds structured, telemetry-safe SDK crash metadata. Install
    // the exact introduction-era helper and unconditional crash/result events
    // after the append-prompt owner copy above; current target116 has a later
    // duplicate-result guard and must not be copied wholesale into this tree.
    const target111PrintPath = path.join(tree, 'src/cli/print.ts')
    replaceExactly(
      target111PrintPath,
      "import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'",
      "import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'\nimport { APIError } from '@anthropic-ai/sdk'",
      'target 2.1.111 SDK crash APIError import',
    )
    replaceExactly(
      target111PrintPath,
      "import { errorMessage, toError } from '../utils/errors.js'",
      "import { errorMessage, toError } from '../utils/errors.js'\nimport { classifyAPIError } from '../services/api/errors.js'\nimport { classifyToolError } from '../services/tools/toolExecution.js'",
      'target 2.1.111 SDK crash classifier imports',
    )
    replaceExactly(
      target111PrintPath,
      `const receivedMessageUuidsOrder: UUID[] = []

function trackReceivedMessageUuid`,
      `const receivedMessageUuidsOrder: UUID[] = []

function getSdkCrashMetadata(error: unknown): {
  error_name: AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
  api_error_status?: number
  cause_name?: AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
} {
  const isApiError = error instanceof APIError
  const errorName = isApiError
    ? classifyAPIError(error)
    : classifyToolError(error)
  const apiErrorStatus =
    isApiError && typeof error.status === 'number' ? error.status : undefined
  const causeName =
    error instanceof Error && error.cause !== undefined
      ? classifyToolError(error.cause)
      : undefined
  return {
    error_name:
      errorName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    api_error_status: apiErrorStatus,
    cause_name:
      causeName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  }
}

function trackReceivedMessageUuid`,
      'target 2.1.111 SDK crash metadata helper',
    )
    replaceExactly(
      target111PrintPath,
      `    } catch (error) {
      // Emit error result message before shutting down`,
      `    } catch (error) {
      logEvent('tengu_sdk_session_crash', getSdkCrashMetadata(error))
      logEvent('tengu_sdk_result', {
        subtype:
          'error_during_execution' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        is_error: true,
        num_turns: 0,
        duration_ms: 0,
        duration_api_ms: 0,
        saw_retry: false,
        saw_compact: false,
      })
      // Emit error result message before shutting down`,
      'target 2.1.111 SDK crash event call path',
    )

    // Target 111 adds the live scroll:bottom shortcut to the fullscreen new-
    // message pill.  Current source also carries target 116's later noSelect
    // property, so select the bounded owner hunk and then remove only that
    // later property from this historical introduction.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/FullscreenLayout.tsx'],
      /useShortcutDisplay|scroll:bottom/,
      'case110-fullscreen-new-message-shortcut',
    )
    replaceExactly(
      path.join(tree, 'src/components/FullscreenLayout.tsx'),
      '<Box noSelect={true} onClick={onClick}',
      '<Box onClick={onClick}',
      'target 2.1.111 fullscreen pill predates noSelect',
    )

    // Target111 adds the VS Code SDK ended-without-result event to the
    // Datadog allowlist. Keep this as a one-line boundary delta; the other SDK
    // allowlist entries are transitive owners introduced earlier.
    replaceExactly(
      path.join(tree, 'src/services/analytics/datadog.ts'),
      `  'tengu_voice_toggled',
  'tengu_team_mem_sync_pull',`,
      `  'tengu_voice_toggled',
  'tengu_vscode_sdk_stream_ended_no_result',
  'tengu_team_mem_sync_pull',`,
      'target 2.1.111 VS Code SDK no-result Datadog event',
    )

    // Target111 adds /routines as a second user-facing name for the existing
    // scheduled-agent skill. Keep this boundary to the descriptor field; the
    // target101 local-only gate is replayed from its own introduction case.
    replaceExactly(
      path.join(tree, 'src/skills/bundled/scheduleRemoteAgents.ts'),
      "    name: 'schedule',\n    description:",
      "    name: 'schedule',\n    aliases: ['routines'],\n    description:",
      'target 2.1.111 schedule routines alias',
    )
    replayTarget111EvidenceGaps(tree)
    replayTarget111MatrixExtras(tree)
  }),
])

function installTarget113RecoveredLiveSourceGaps(tree) {
  // Hash-backed file state was introduced at target108 and remains the live
  // target113 implementation. Replay its exact introduction hunks (including
  // stale-file comparison callers) rather than copying later owner versions.
  applyMatchingPatchArtifact(
    tree,
    path.join(
      repositoryRoot,
      'recovery/cases/2.1.107-to-2.1.108/semantic-supplement.patch',
    ),
    [
      'src/utils/fileStateCache.ts',
      'src/tools/FileEditTool/FileEditTool.ts',
      'src/tools/FileWriteTool/FileWriteTool.ts',
      'src/utils/attachments.ts',
      'src/utils/toolErrors.ts',
    ],
    /createHash|keepContent|MAX_INLINE_FILE_STATE_CONTENT_BYTES|hashFileStateContent|normalizedKey|fileStateMatchesContent/,
    'case112-file-state-hash-prerequisite',
  )

  // The loop-sentinel owner reaches its retained target110 form before this
  // boundary and is absent from the raw target113 source snapshot. It is not
  // changed by either 113→114 or 114→116, so the complete current owner is the
  // exact cumulative prerequisite for readLoopFile and its sentinel graph.
  writeCurrentSource('src/utils/loopSentinels.ts', tree)

  // Target105 SDK memory-recall projection remains live at target113. Restore
  // only its import, two helpers, and attachment dispatch branch; later
  // QueryEngine deferred-tool/message-operation/session changes stay excluded.
  const queryEnginePath = path.join(tree, 'src/QueryEngine.ts')
  replaceExactly(
    queryEnginePath,
    `import { getInMemoryErrors } from './utils/log.js'\nimport { countToolCalls, SYNTHETIC_MESSAGES } from './utils/messages.js'`,
    `import { getInMemoryErrors } from './utils/log.js'\nimport { memoryScopeForPath } from './utils/memoryFileDetection.js'\nimport { countToolCalls, SYNTHETIC_MESSAGES } from './utils/messages.js'`,
    'target113 SDK memory-recall scope import',
  )
  replaceExactly(
    queryEnginePath,
    `export type QueryEngineConfig = {`,
    `const SYNTHESIS_MEMORY_PREFIX = '<synthesis:'

function getSynthesisMemoryDirectory(path: string): string | undefined {
  return path.startsWith(SYNTHESIS_MEMORY_PREFIX)
    ? path.slice(SYNTHESIS_MEMORY_PREFIX.length, -1)
    : undefined
}

function getSdkMemoryRecallEvent(
  memories: Array<{ path: string; content: string }>,
): SDKMessage | undefined {
  if (memories.length === 0) return undefined
  const isSynthesis = getSynthesisMemoryDirectory(memories[0]!.path) !== undefined
  return {
    type: 'system',
    subtype: 'memory_recall',
    mode: isSynthesis ? 'synthesize' : 'select',
    memories: memories.map(memory => {
      const synthesisDirectory = getSynthesisMemoryDirectory(memory.path)
      return {
        path: memory.path,
        scope:
          memoryScopeForPath(synthesisDirectory ?? memory.path) ?? 'personal',
        ...(isSynthesis && { content: memory.content }),
      }
    }),
    uuid: randomUUID(),
    session_id: getSessionId(),
  } as SDKMessage
}

export type QueryEngineConfig = {`,
    'target113 SDK memory-recall projection helper',
  )
  replaceExactly(
    queryEnginePath,
    `          // Extract structured output from StructuredOutput tool calls
          if (message.attachment.type === 'structured_output') {`,
    `          if (message.attachment.type === 'relevant_memories') {
            const memoryRecall = getSdkMemoryRecallEvent(
              message.attachment.memories,
            )
            if (memoryRecall) yield memoryRecall
          }
          // Extract structured output from StructuredOutput tool calls
          else if (message.attachment.type === 'structured_output') {`,
    'target113 SDK memory-recall attachment dispatch',
  )

  // Target113 promotes mirror write failures into the public SDK message
  // union. Restore only that schema and union edge; transcript-mirror,
  // UserPromptExpansion, and post-turn-summary remain owned by later cases.
  const coreSchemasPath = path.join(tree, 'src/entrypoints/sdk/coreSchemas.ts')
  replaceExactly(
    coreSchemasPath,
    `export const SDKAPIRetryMessageSchema = lazySchema(() =>`,
    `export const SDKMirrorErrorMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('system'),
      subtype: z.literal('mirror_error'),
      error: z.string(),
      key: z.object({
        projectKey: z.string(),
        sessionId: z.string(),
        subpath: z.string().optional(),
      }),
      uuid: UUIDPlaceholder(),
      session_id: z.string(),
    })
    .describe(
      'Emitted when SessionStore.append() rejects or times out for a transcript-mirror batch. The batch is dropped (at-most-once delivery); this surfaces the failure so consumers are not silent on data loss.',
    ),
)

export const SDKAPIRetryMessageSchema = lazySchema(() =>`,
    'target113 SDK mirror-error schema',
  )
  replaceExactly(
    coreSchemasPath,
    `    SDKPromptSuggestionMessageSchema(),\n`,
    `    SDKPromptSuggestionMessageSchema(),\n    SDKMirrorErrorMessageSchema(),\n`,
    'target113 SDK mirror-error union edge',
  )

  // Target113 carries both request IDs through Perfetto API-span completion.
  // The caller already supplies them in the historical source; add only the
  // two metadata fields and emitted argument properties.
  const perfettoPath = path.join(tree, 'src/utils/telemetry/perfettoTracing.ts')
  replaceExactly(
    perfettoPath,
    `    messageId?: string\n    success?: boolean`,
    `    messageId?: string\n    requestId?: string\n    clientRequestId?: string\n    success?: boolean`,
    'target113 Perfetto request ID metadata types',
  )
  replaceExactly(
    perfettoPath,
    `    message_id: metadata.messageId ?? pending.args.message_id,\n    success:`,
    `    message_id: metadata.messageId ?? pending.args.message_id,\n    request_id: metadata.requestId,\n    client_request_id: metadata.clientRequestId,\n    success:`,
    'target113 Perfetto request ID fields',
  )
}

function installTarget113GlobalPackageManagerDetection(tree) {
  const updaterPath = path.join(tree, 'src/utils/autoUpdater.ts')
  replaceExactly(
    updaterPath,
    `import { type ReleaseChannel, saveGlobalConfig } from './config.js'\nimport { logForDebugging } from './debug.js'`,
    `import { type ReleaseChannel, saveGlobalConfig } from './config.js'\nimport { isInBundledMode } from './bundledMode.js'\nimport { logForDebugging } from './debug.js'`,
    'target113 package-manager bundled-mode import',
  )
  replaceExactly(
    updaterPath,
    `async function getInstallationPrefix(): Promise<string | null> {`,
    `function detectGlobalPackageManager(): 'bun' | 'npm' {
  const execPath = process.execPath.replace(/\\\\/g, '/')
  const bunInstall = (process.env.BUN_INSTALL ?? '')
    .replace(/\\\\/g, '/')
    .replace(/\\/+$/, '')
  if (
    execPath.includes('/.bun/install/global/') ||
    (bunInstall !== '' &&
      execPath.startsWith(\`${'${bunInstall}'}/install/global/\`))
  ) {
    return 'bun'
  }
  return env.isRunningWithBun() && !isInBundledMode() ? 'bun' : 'npm'
}

async function getInstallationPrefix(): Promise<string | null> {`,
    'target113 package-manager detector',
  )
  replaceExactly(
    updaterPath,
    `  const isBun = env.isRunningWithBun()`,
    `  const isBun = detectGlobalPackageManager() === 'bun'`,
    'target113 install-prefix package-manager selection',
  )
  replaceExactly(
    updaterPath,
    `    await removeClaudeAliasesFromShellConfigs()
    // Check if we're using npm from Windows path in WSL
    if (!env.isRunningWithBun() && env.isNpmFromWindowsPath()) {`,
    `    await removeClaudeAliasesFromShellConfigs()
    const packageManager = detectGlobalPackageManager()
    // Check if we're using npm from Windows path in WSL
    if (packageManager === 'npm' && env.isNpmFromWindowsPath()) {`,
    'target113 updater package-manager call site',
  )
  const packageManagerLine =
    `    const packageManager = detectGlobalPackageManager()\n`
  const legacyPackageManagerLine =
    `    const packageManager = env.isRunningWithBun() ? 'bun' : 'npm'\n`
  let updater = fs.readFileSync(updaterPath, 'utf8')
  if (updater.includes(legacyPackageManagerLine)) {
    updater = updater.replace(legacyPackageManagerLine, '')
  }
  const firstPackageManager = updater.indexOf(packageManagerLine)
  const duplicatePackageManager = updater.indexOf(
    packageManagerLine,
    firstPackageManager + packageManagerLine.length,
  )
  if (firstPackageManager < 0) {
    throw new Error('target113 package-manager caller insertion is missing')
  }
  if (duplicatePackageManager >= 0) {
    updater =
      updater.slice(0, duplicatePackageManager) +
      updater.slice(duplicatePackageManager + packageManagerLine.length)
  }
  fs.writeFileSync(updaterPath, updater)
}

function installTarget113OwnerAndPunctuationRecovery(tree) {
  // Target113 recognizes CJK sentence punctuation as a legal mention
  // boundary for files, MCP resources, and agents. Keep these five regex
  // changes together; their generated target units are adjacent and the
  // focused truth-table proves all four punctuation forms.
  const attachmentsPath = path.join(tree, 'src/utils/attachments.ts')
  for (const [before, after, label] of [
    [
      `  const quotedAtMentionRegex = /(^|\\s)@"([^"]+)"/g`,
      `  const quotedAtMentionRegex = /(^|[\\s。、？！])@"([^"]+)"/g`,
      'quoted file mention punctuation',
    ],
    [
      `  const regularAtMentionRegex = /(^|\\s)@([^\\s]+)\\b/g`,
      `  const regularAtMentionRegex = /(^|[\\s。、？！])@([^\\s]+)\\b/g`,
      'regular file mention punctuation',
    ],
    [
      `  const atMentionRegex = /(^|\\s)@([^\\s]+:[^\\s]+)\\b/g`,
      `  const atMentionRegex = /(^|[\\s。、？！])@([^\\s]+:[^\\s]+)\\b/g`,
      'MCP resource mention punctuation',
    ],
    [
      `  const quotedAgentRegex = /(^|\\s)@"([\\w:.@-]+) \\(agent\\)"/g`,
      `  const quotedAgentRegex = /(^|[\\s。、？！])@"([\\w:.@-]+) \\(agent\\)"/g`,
      'quoted agent mention punctuation',
    ],
    [
      `  const unquotedAgentRegex = /(^|\\s)@(agent-[\\w:.@-]+)/g`,
      `  const unquotedAgentRegex = /(^|[\\s。、？！])@(agent-[\\w:.@-]+)/g`,
      'regular agent mention punctuation',
    ],
  ]) {
    replaceExactly(
      attachmentsPath,
      before,
      after,
      `target113 ${label}`,
    )
  }
}

function installTarget113RecoveredSourceBatch3(tree) {
  // Three bounded target113 source recoveries: URL text is now considered
  // Markdown syntax, subagents may not write report-shaped Markdown files,
  // and notebook cell IDs use cryptographic UUIDs rather than Math.random.
  replaceExactly(
    path.join(tree, 'src/components/Markdown.tsx'),
    'const MD_SYNTAX_RE = /[#*`|[>\\-_~]|\\n\\n|^\\d+\\. |\\n\\d+\\. /;',
    'const MD_SYNTAX_RE =\n  /[#*`|[>\\-_~]|\\n\\n|(?:^|\\n) {0,3}\\d+\\. |https?:\\/\\/|www\\./',
    'target113 Markdown URL syntax',
  )

  const fileWritePath = path.join(tree, 'src/tools/FileWriteTool/FileWriteTool.ts')
  replaceExactly(
    fileWritePath,
    `import { dirname, sep } from 'path'`,
    `import { basename, dirname, sep } from 'path'`,
    'target113 FileWrite basename import',
  )
  replaceExactly(
    fileWritePath,
    `    const fullFilePath = expandPath(file_path)

    // Reject writes to team memory files that contain secrets`,
    `    const fullFilePath = expandPath(file_path)

    if (
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_sub_nomdrep_q7k', false) &&
      toolUseContext.agentId &&
      /^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\\.md$/i.test(
        basename(fullFilePath),
      )
    ) {
      logEvent('tengu_subagent_md_report_blocked', {
        contentBytes: Buffer.byteLength(content),
      })
      return {
        result: false,
        message:
          'Subagents should return findings as text, not write report files. Include this content in your final response instead.',
        errorCode: 5,
      }
    }

    // Reject writes to team memory files that contain secrets`,
    'target113 FileWrite subagent report guard',
  )

  const notebookPath = path.join(
    tree,
    'src/tools/NotebookEditTool/NotebookEditTool.ts',
  )
  replaceExactly(
    notebookPath,
    `import { feature } from 'bun:bundle'`,
    `import { feature } from 'bun:bundle'
import { randomUUID } from 'crypto'`,
    'target113 notebook UUID import',
  )
  replaceExactly(
    notebookPath,
    `Math.random().toString(36).substring(2, 15)`,
    `randomUUID().slice(0, 8)`,
    'target113 notebook cell UUID',
  )

  // Target113 versions didOpen/didChange documents. Select only that graph;
  // target116's sorted getSupportedExtensions API is owned by the later case.
  applyMatchingWorkingTreePatch(
    tree,
    ['src/services/lsp/LSPServerManager.ts'],
    /getDocumentVersion|documentVersions|nextDocumentVersion|\(v\$\{version\}\)|^\+\s+version,$/m,
    'case112-lsp-document-version',
  )
}

function installTarget113BundledInstallationPaths(tree) {
  const filename = path.join(tree, 'src/utils/doctorDiagnostic.ts')
  const current = fs.readFileSync(filename, 'utf8')
  const alreadyInstalled =
    current.includes(`import { getClaudeConfigHomeDir, isEnvTruthy } from './envUtils.js'`) &&
    current.includes(`  const [invokedPath, execPath] = getNormalizedPaths()`) &&
    current.includes(`'/local/node_modules/'`) &&
    current.includes(`'/node_modules/@anthropic-ai/'`)
  if (alreadyInstalled) return
  replaceExactly(
    filename,
    `import { isEnvTruthy } from './envUtils.js'`,
    `import { getClaudeConfigHomeDir, isEnvTruthy } from './envUtils.js'`,
    'target113 bundled installation config-home import',
  )
  replaceExactly(
    filename,
    `  const [invokedPath] = getNormalizedPaths()`,
    `  const [invokedPath, execPath] = getNormalizedPaths()`,
    'target113 bundled installation executable path',
  )
  replaceExactly(
    filename,
    `  if (isInBundledMode()) {
    // Check if this bundled instance was installed by a package manager`,
    `  if (isInBundledMode()) {
    const localNodeModulesPath =
      getClaudeConfigHomeDir()
        .replace(/\\\\/g, '/')
        .replace(/\\/+$/, '') + '/local/node_modules/'
    if (execPath.startsWith(localNodeModulesPath)) {
      return 'npm-local'
    }
    if (execPath.includes('/node_modules/@anthropic-ai/')) {
      return 'npm-global'
    }

    // Check if this bundled instance was installed by a package manager`,
    'target113 bundled installation path classification',
  )
}

function installTarget113InstallRcChannel(tree) {
  const filename = path.join(tree, 'src/commands/install.tsx')
  const value = fs.readFileSync(filename, 'utf8')
  const installedFragments = [
    `target === 'stable' || target === 'rc'`,
    `const autoUpdatesChannel = target === 'rc' ? 'stable' : target;`,
    'autoUpdatesChannel: autoUpdatesChannel',
    'Saved autoUpdatesChannel=${autoUpdatesChannel}',
  ]
  const installedCount = installedFragments.filter(fragment =>
    value.includes(fragment),
  ).length
  // The object uses shorthand in the current authored form, so accept that
  // exact representation in place of the explicit diagnostic fragment.
  const hasCompleteInstalledForm =
    value.includes(`target === 'stable' || target === 'rc'`) &&
    value.includes(
      `const autoUpdatesChannel = target === 'rc' ? 'stable' : target;`,
    ) &&
    value.includes(`          autoUpdatesChannel\n`) &&
    value.includes('Saved autoUpdatesChannel=${autoUpdatesChannel}')
  if (hasCompleteInstalledForm) return
  if (installedCount > 0) {
    throw new Error('target 2.1.113 install rc channel is partially installed')
  }
  replaceExactly(
    filename,
    `        if (target === 'latest' || target === 'stable') {
          updateSettingsForSource('userSettings', {
            autoUpdatesChannel: target
          });
          logForDebugging(\`Install: Saved autoUpdatesChannel=\${target} to user settings\`);
        }`,
    `        if (target === 'latest' || target === 'stable' || target === 'rc') {
          const autoUpdatesChannel = target === 'rc' ? 'stable' : target;
          updateSettingsForSource('userSettings', {
            autoUpdatesChannel
          });
          logForDebugging(\`Install: Saved autoUpdatesChannel=\${autoUpdatesChannel} to user settings\`);
        }`,
    'target 2.1.113 install rc channel normalization',
  )
}

function installTarget113SessionMaterializationAccessors(tree) {
  const filename = path.join(tree, 'src/utils/sessionStorage.ts')
  let value = fs.readFileSync(filename, 'utf8')

  // The two subscriptions and getCurrentSessionFile are inherited target112
  // prerequisites. The target113 delta adds cacheAgentName and a deliberately
  // non-materializing session-file accessor over the same Project singleton.
  if (!value.includes(`import { createSignal } from './signal.js'`)) {
    replaceExactly(
      filename,
      `import { jsonParse, jsonStringify } from './slowOperations.js'`,
      `import { jsonParse, jsonStringify } from './slowOperations.js'
import { createSignal } from './signal.js'`,
      'target 2.1.113 session signal import prerequisite',
    )
    value = fs.readFileSync(filename, 'utf8')
  }
  if (!value.includes('const sessionAgentNameChanged = createSignal()')) {
    replaceExactly(
      filename,
      `import { validateUuid } from './uuid.js'

// Cache MACRO.VERSION`,
      `import { validateUuid } from './uuid.js'

const sessionAgentNameChanged = createSignal()
export const subscribeSessionAgentNameChanged =
  sessionAgentNameChanged.subscribe
const sessionTitleChanged = createSignal()
export const subscribeSessionTitleChanged = sessionTitleChanged.subscribe

// Cache MACRO.VERSION`,
      'target 2.1.113 session signal prerequisite',
    )
    value = fs.readFileSync(filename, 'utf8')
  }
  if (!value.includes('export function getCurrentSessionFile(): string | null {')) {
    replaceExactly(
      filename,
      `type InternalEventWriter = (`,
      `export function getCurrentSessionFile(): string | null {
  return getProject().sessionFile
}

type InternalEventWriter = (`,
      'target 2.1.113 current session-file prerequisite',
    )
    value = fs.readFileSync(filename, 'utf8')
  }
  if (!value.includes('export function getMaterializedSessionFile(): string | null {')) {
    replaceExactly(
      filename,
      `type InternalEventWriter = (`,
      `export function getMaterializedSessionFile(): string | null {
  return project?.sessionFile ?? null
}

type InternalEventWriter = (`,
      'target 2.1.113 non-materializing session-file accessor',
    )
    value = fs.readFileSync(filename, 'utf8')
  }
  if (!value.includes('export function cacheAgentName(agentName: string): void {')) {
    replaceExactly(
      filename,
      `export function cacheSessionTitle(customTitle: string): void {
  getProject().currentSessionTitle = customTitle
}

/**
 * Cache the session mode.`,
      `export function cacheSessionTitle(customTitle: string): void {
  getProject().currentSessionTitle = customTitle
  sessionTitleChanged.emit()
}

export function cacheAgentName(agentName: string): void {
  getProject().currentSessionAgentName = agentName
  sessionAgentNameChanged.emit()
}

/**
 * Cache the session mode.`,
      'target 2.1.113 session cache notifications',
    )
  }
}

function installTarget113SdkInitializeTitleSchema(tree) {
  const filename = path.join(tree, 'src/entrypoints/sdk/controlSchemas.ts')
  const description =
    'Custom session title. When provided, the session uses this title and skips automatic title generation. Has no effect on the persisted title when resuming an existing session.'
  const value = fs.readFileSync(filename, 'utf8')
  if (value.includes(description)) return
  replaceExactly(
    filename,
    `      agents: z.record(z.string(), AgentDefinitionSchema()).optional(),
      promptSuggestions: z.boolean().optional(),`,
    `      agents: z.record(z.string(), AgentDefinitionSchema()).optional(),
      title: z
        .string()
        .optional()
        .describe(
          'Custom session title. When provided, the session uses this title and skips automatic title generation. Has no effect on the persisted title when resuming an existing session.',
        ),
      promptSuggestions: z.boolean().optional(),`,
    'target 2.1.113 SDK initialize title schema',
  )
}

function installTarget113DaemonLockReader(tree) {
  const filename = path.join(tree, 'src/cli/update.ts')
  let value = fs.readFileSync(filename, 'utf8')
  const required = [
    `import { readFile } from 'node:fs/promises'`,
    `import { join } from 'node:path'`,
    `import { getClaudeConfigHomeDir } from 'src/utils/envUtils.js'`,
    `import { isENOENT } from 'src/utils/errors.js'`,
    `import { safeParseJSON } from 'src/utils/json.js'`,
    'async function readDaemonLock()',
  ]
  const present = required.filter(fragment => value.includes(fragment)).length
  if (present === required.length) return
  if (present !== 0) {
    throw new Error('target 2.1.113 daemon-lock reader is partially installed')
  }
  replaceExactly(
    filename,
    `import chalk from 'chalk'`,
    `import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'`,
    'target 2.1.113 daemon-lock Node imports',
  )
  replaceExactly(
    filename,
    `import { getDoctorDiagnostic } from 'src/utils/doctorDiagnostic.js'
import { gracefulShutdown } from 'src/utils/gracefulShutdown.js'`,
    `import { getDoctorDiagnostic } from 'src/utils/doctorDiagnostic.js'
import { getClaudeConfigHomeDir } from 'src/utils/envUtils.js'
import { isENOENT } from 'src/utils/errors.js'
import { gracefulShutdown } from 'src/utils/gracefulShutdown.js'
import { safeParseJSON } from 'src/utils/json.js'`,
    'target 2.1.113 daemon-lock source imports',
  )
  value = fs.readFileSync(filename, 'utf8')
  const current = fs.readFileSync(path.join(repositoryRoot, 'src/cli/update.ts'), 'utf8')
  const startMarker = 'type DaemonLock = {'
  const endMarker = 'async function isClaudeDaemonProcess('
  const start = current.indexOf(startMarker)
  const end = current.indexOf(endMarker, start)
  if (start < 0 || end < 0) {
    throw new Error('target 2.1.113 daemon-lock declaration anchors differ')
  }
  replaceExactly(
    filename,
    `export async function update() {`,
    current.slice(start, end) + `export async function update() {`,
    'target 2.1.113 daemon-lock reader declarations',
  )
}

function replayTarget113SecondHalfStrictTail(tree) {
  const replayFixture = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/test/recovery-2.1.113-second-half-historical-package-replay.json',
      ),
      'utf8',
    ),
  )
  const sourceRoot = path.join(tree, 'src')
  const { candidate } = buildTarget113SecondHalfHistoricalCandidate({
    replayFixture,
    sourceRoot,
  })
  for (const [ownerPath, source] of candidate) {
    if (source === null) continue
    const relative = ownerPath.replace(/^src\//, '')
    const filename = path.join(sourceRoot, relative)
    if (fs.existsSync(filename) && fs.readFileSync(filename, 'utf8') === source) {
      continue
    }
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, source)
  }
}

writeCase('2.1.112-to-2.1.113', [
  withTargetWorktree('d88405d4b4b7ce6e066e1d67e7fc421b54d685f0', tree => {
    // The archaeology-only source snapshots used to construct the original
    // target113 supplement may not survive a host reboot. The canonical
    // generated supplement is independently pinned and replayable at the raw
    // target commit, so selected-case regeneration bootstraps from that exact
    // artifact and then applies newly bounded, idempotent recoveries. This
    // keeps post-reboot regeneration deterministic without weakening the
    // introduction-time apply/build and semantic-evidence checks.
    if (!fs.existsSync(target113)) {
      const existingSupplement = path.join(
        repositoryRoot,
        'recovery/cases/2.1.112-to-2.1.113/semantic-supplement.patch',
      )
      git(tree, ['apply', '--3way', existingSupplement])
      installTarget113BundledInstallationPaths(tree)
      installTarget113InstallRcChannel(tree)
      installTarget113SessionMaterializationAccessors(tree)
      installTarget113SdkInitializeTitleSchema(tree)
      installTarget113DaemonLockReader(tree)
      replayTarget113FirstHalfStrictTail(tree)
      replayTarget113SecondHalfStrictTail(tree)
      return
    }
    // Each introduction supplement is proved against its own target commit.
    // Earlier semantic ownership carries forward through the structural
    // ledgers; do not raw-replay the target-108 supplement into target 113.
    // The authenticated target-113 semantic workspace contains the exact
    // evolved owner versions. Copy those owners directly instead of applying
    // a context-sensitive delta based on a target-108-enriched workspace.
    for (const relative of [
      'src/cli/print.ts',
      'src/commands/copy/copy.tsx',
      'src/commands/exit/exit.tsx',
      'src/commands/review/UltrareviewOverageDialog.tsx',
      'src/components/ScrollKeybindingHandler.tsx',
      'src/hooks/useAwaySummary.ts',
      'src/hooks/useCancelRequest.ts',
      'src/hooks/useReplBridge.tsx',
      'src/hooks/useScheduledTasks.ts',
      'src/ink/colorize.ts',
      'src/tools/BashTool/prompt.ts',
      'src/utils/bash/ast.ts',
      'src/utils/cronTasks.ts',
      'src/utils/intl.ts',
      'src/utils/loopWakeup.ts',
    ]) {
      writeExternalSource(target113, relative, tree)
    }

    installTarget113RecoveredLiveSourceGaps(tree)
    installTarget113OwnerAndPunctuationRecovery(tree)
    installTarget113RecoveredSourceBatch3(tree)
    installTarget113BundledInstallationPaths(tree)

    // Target 113 turns an explicit dangerouslyDisableSandbox request into a
    // dedicated ask when that flag alone disables sandboxing, while preserving
    // deny/ask and rule-derived decisions. Route the resulting ask through the
    // hook, bypass, and auto-mode gates. The target commit predates the
    // target97 recursive safety helper, so include that prerequisite here to
    // keep this introduction tree executable without importing target116's
    // later sandbox-override classifier fallthrough.
    installTarget113SandboxOverridePrerequisite(tree)

    // Target 113 tightens the two Windows shell-string quoting functions:
    // PowerShell rejects Unicode single-quote variants and strips raw double
    // quotes, while cmd.exe drops percent signs instead of expanding/doubling
    // them after normalizing newlines and tabs.  These are the only changed
    // quoting units at this boundary; the earlier quoting introduction is
    // proved in the target-97 case.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/deepLink/terminalLauncher.ts'],
      /Unicode single-quote variant|replaceAll\('"', ''\)|replace\(\/\["%\]\/g, ''\)/,
      'case112-windows-terminal-quoting',
    )

    // Tree.Group first appears at this boundary. The target source snapshot
    // predates even the target-105 Tree base, so materialize the complete
    // target-113 owner while the ledger attributes only the new Group and
    // enclosing-last propagation units to this transition.
    writeCurrentSource('src/components/design-system/Tree.tsx', tree)

    // Target 113 adds the persisted showMessageTimestamps setting and carries
    // it from config/AppState through both settings surfaces into Messages,
    // MessageRow, and the explicit-or-transcript timestamp renderer.  These
    // eight files are the authenticated target113 historical owners; the
    // source-map's PromptSuggestion/Logo candidates are adjacent spillover.
    const target113TimestampRoot =
      '/tmp/late-final-trees.FHK116/2.1.112-to-2.1.113'
    for (const relative of [
      'src/utils/config.ts',
      'src/state/AppStateStore.ts',
      'src/tools/ConfigTool/supportedSettings.ts',
      'src/components/Settings/Config.tsx',
      'src/components/MessageTimestamp.tsx',
      'src/components/MessageRow.tsx',
      'src/components/Messages.tsx',
      'src/main.tsx',
    ]) {
      writeExternalSource(target113TimestampRoot, relative, tree)
    }

    // Target 113 carries the installed version through dependency-resolution
    // failures, force-includes the already installed compatible/demoted
    // plugin, and reconciles plugin.json before installation.  Use the exact
    // authenticated target113 owners; current target116 additionally retains
    // its later telemetry-privacy evolution.
    const target113PluginRoot = '/tmp/late113-current.7SKxz7/tree'
    for (const relative of [
      'src/utils/plugins/dependencyResolver.ts',
      'src/utils/plugins/pluginInstallationHelpers.ts',
      'src/services/plugins/pluginOperations.ts',
    ]) {
      writeExternalSource(target113PluginRoot, relative, tree)
    }

    // Target 113 adds the process-wide active-input registry and clears each
    // MCP server's outstanding input IDs on every terminal disconnect, stale
    // plugin cleanup, and explicit disable path.  These two frozen owners are
    // authenticated together so the state helpers are not installed without
    // their reachable lifecycle edges.
    const target113ActiveInputRoot = '/tmp/late113-verify.Eq0VgW/tree'
    for (const relative of [
      'src/bootstrap/state.ts',
      'src/services/mcp/useManageMCPConnections.ts',
    ]) {
      writeExternalSource(target113ActiveInputRoot, relative, tree)
    }

    // Target 113 generalizes Bash wrapper peeling from the original
    // timeout/time/nice/nohup set to argv-aware nested wrappers.  Select only
    // the authenticated 112->113 table/parser and deny/ask/sandbox routing
    // hunks: the same current owner also carries later environment, miss-kind,
    // and dangerous-removal hardening that does not belong at this boundary.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/BashTool/bashPermissions.ts'],
      /\+  'watch'|stripBasicWrappersFromArgv|WRAPPER_VALUE_FLAGS|wrapperStrippedArgv|astCommand\?: SimpleCommand|stripAllEnvVars: true, skipCompoundCheck: true, astCommand|skipCompoundCheck: astCommand !== undefined|function checkSandboxAutoAllow|astCommand: commands\.length|subcommand\.text/,
      'case113-bash-wrapper-permission',
    )

    // The published target113 retains target97's repeated-horizontal-
    // whitespace normalization, but the reconstructed source commit does not.
    // Replay that complete lexical block after target113's independently
    // selected wrapper hunks so the standalone diff carries both braces and
    // remains parseable without making the three-way patch context dirty.
    installTarget97BashWhitespaceNormalizationPrerequisite(tree)

    // Target 113 first exposes whether the prompt is empty to the footer and
    // uses it to show the background-session left-arrow hint.  Target 116
    // later layers an independent leftArrowPending prop onto this graph, so
    // keep the original one-prop cache shape at its true boundary.
    const target113FooterPath = path.join(
      tree,
      'src/components/PromptInput/PromptInputFooter.tsx',
    )
    replaceExactly(
      target113FooterPath,
      'toolPermissionContext={toolPermissionContext} suppressHint={suppressHint} isLoading={isLoading}',
      'toolPermissionContext={toolPermissionContext} suppressHint={suppressHint} isInputEmpty={!suppressHintFromProps} isLoading={isLoading}',
      'target 2.1.113 background footer empty-input edge',
    )
    const target113FooterLeftPath = path.join(
      tree,
      'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
    )
    replaceExactly(
      target113FooterLeftPath,
      "import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';",
      "import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';\nimport { isBgSession } from '../../utils/concurrentSessions.js';",
      'target 2.1.113 background footer session import',
    )
    replaceExactly(
      target113FooterLeftPath,
      '  suppressHint: boolean;\n  isLoading: boolean;',
      '  suppressHint: boolean;\n  isInputEmpty: boolean;\n  isLoading: boolean;',
      'target 2.1.113 background footer prop type',
    )
    replaceExactly(
      target113FooterLeftPath,
      '  const $ = _c(27);',
      '  const $ = _c(28);',
      'target 2.1.113 background footer memo slots',
    )
    replaceExactly(
      target113FooterLeftPath,
      '    suppressHint,\n    isLoading,',
      '    suppressHint,\n    isInputEmpty,\n    isLoading,',
      'target 2.1.113 background footer prop read',
    )
    replaceExactly(
      target113FooterLeftPath,
      ' || $[21] !== toolPermissionContext) {\n    t5 = <ModeIndicator mode={mode} toolPermissionContext={toolPermissionContext} showHint={t4} isLoading={isLoading}',
      ' || $[21] !== toolPermissionContext || $[27] !== isInputEmpty) {\n    t5 = <ModeIndicator mode={mode} toolPermissionContext={toolPermissionContext} showHint={t4} isInputEmpty={isInputEmpty} isLoading={isLoading}',
      'target 2.1.113 background footer memo edge',
    )
    replaceExactly(
      target113FooterLeftPath,
      '    $[21] = toolPermissionContext;\n    $[22] = t5;',
      '    $[21] = toolPermissionContext;\n    $[27] = isInputEmpty;\n    $[22] = t5;',
      'target 2.1.113 background footer memo value',
    )
    replaceExactly(
      target113FooterLeftPath,
      '  showHint: boolean;\n  isLoading: boolean;',
      '  showHint: boolean;\n  isInputEmpty: boolean;\n  isLoading: boolean;',
      'target 2.1.113 mode indicator prop type',
    )
    replaceExactly(
      target113FooterLeftPath,
      '  showHint,\n  isLoading,',
      '  showHint,\n  isInputEmpty,\n  isLoading,',
      'target 2.1.113 mode indicator prop read',
    )
    replaceExactly(
      target113FooterLeftPath,
      `  } else if (!hasTeammatePills && showHint) {
    parts.push(...hintParts);
  }

  // When we have teammate pills, always render them on their own line above other parts`,
      `  } else if (!hasTeammatePills && showHint) {
    parts.push(...hintParts);
  }
  if (isBgSession() && isInputEmpty) {
    parts.push(<Text dimColor key="bg-detach">
        {figures.arrowLeft} for agents
      </Text>);
  }

  // When we have teammate pills, always render them on their own line above other parts`,
      'target 2.1.113 background left-arrow hint',
    )

    // Target 113 keeps filtering unsafe channel metadata keys but makes that
    // loss observable: partition accepted/rejected entries, log every rejected
    // key in source order at warn level, and serialize only accepted attrs.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/mcp/channelNotification.ts'],
      /lodash-es\/partition|logForDebugging|safeEntries|droppedEntries|meta key\(s\) that don't match/,
      'case112-channel-meta-sanitizer',
    )

    // Target 113 expands transient 529/5xx failures with actionable capacity
    // and retry guidance, trims duplicate terminal punctuation, and shows the
    // first-party status-page suffix for every compatible API provider. Keep
    // this selected hunk separate from earlier request-size/status metadata
    // and later model-fallback changes in the shared current owner.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/api/errors.ts'],
      /The API is at capacity|This is a server-side issue|If it persists, check/,
      'case112-api-server-error-ux',
    )

    // Target 113 hardens queued external-channel messages as explicitly
    // untrusted situational data and distinguishes plugin <input> payloads
    // from ordinary <channel> payloads. Select the new XML prefix plus the
    // helper/import/call hunks without copying unrelated message evolution.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/constants/xml.ts', 'src/utils/messages.ts'],
      /EXTERNAL_PLUGIN_INPUT_PREFIX|wrapExternalChannelText|untrusted external data/,
      'case112-external-channel-trust',
    )

    // Target 113 shortens the /compact command description while retaining
    // its optional-instructions argument hint and command behavior.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/compact/index.ts'],
      /Free up context by summarizing the conversation so far/,
      'case112-compact-description',
    )

    // Target 113 renames the bundled transcript-analysis skill from
    // less-permission-prompts to fewer-permission-prompts.  Its description,
    // prompt body, registration, and executable argument append behavior are
    // otherwise inherited unchanged from the target111 introduction.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/skills/bundled/lessPermissionPrompts.ts'],
      /Fewer Permission Prompts|fewer-permission-prompts/,
      'case112-fewer-permission-prompts-rename',
    )

    installTarget113RetainedRuntimeGaps(tree)
    installTarget113GlobalPackageManagerDetection(tree)
    installTarget113InstallRcChannel(tree)
    installTarget113SessionMaterializationAccessors(tree)
    installTarget113SdkInitializeTitleSchema(tree)
    installTarget113DaemonLockReader(tree)
    replayTarget113FirstHalfStrictTail(tree)
    replayTarget113SecondHalfStrictTail(tree)
  }),
])

writeCase('2.1.114-to-2.1.116', [
  withTargetWorktree('e08046f528857203cbdede147bcab8b8b8021bf7', tree => {
    // Selected-case regeneration must remain reproducible after archaeology
    // scratch worktrees are gone. Bootstrap from the independently pinned,
    // raw-target-replayable canonical supplement, then apply only bounded new
    // idempotent installers. The normal archaeology path remains available
    // when all original source roots are present.
    const target116ArchaeologySentinels = [
      path.join(extractedClaudeApiRoot, 'claude-api-map-2.1.116', 'SKILL.md'),
      '/tmp/bash97-source-9Tlt35/src/commands/plugin/UnifiedInstalledCell.tsx',
      '/tmp/late-final-trees.FHK116/2.1.114-to-2.1.116/src/utils/queryContext.ts',
      '/tmp/late-final-trees.FHK116/2.1.114-to-2.1.116/src/state/AppStateStore.ts',
      '/tmp/late107-replay.gotzZL/tree/src/tools/REPLTool/REPLTool.ts',
      '/tmp/early-own-worktrees/91/src/components/ultraplan/UltraplanChoiceDialog.tsx',
      '/tmp/middle-semantic-final.BKAsET/2.1.97-to-2.1.98/src/services/autoDream/consolidationPrompt.ts',
    ]
    if (
      selectedCase === '2.1.114-to-2.1.116' &&
      target116ArchaeologySentinels.some(filename => !fs.existsSync(filename))
    ) {
      const existingSupplement = path.join(
        repositoryRoot,
        'recovery/cases/2.1.114-to-2.1.116/semantic-supplement.patch',
      )
      git(tree, ['apply', '--3way', existingSupplement])
      installTarget116TrustDialogShortcutFooter(tree)
      installTarget116StrictTailSourceOwners(tree)
      return
    }
    // Cumulative prerequisite: target 108 replaced the raw figures.tick
    // plugin-install success marker with StatusIcon, and that authored graph
    // persists unchanged through target 116.  The isolated target-116 source
    // commit predates the recovery, so replay only those two target-108 hunks
    // here while coverage keeps ownership anchored to 2.1.107-to-2.1.108.
    const pluginRecommendationPath = path.join(
      tree,
      'src/hooks/usePluginRecommendationBase.tsx',
    )
    replaceExactly(
      pluginRecommendationPath,
      "import figures from 'figures';\n",
      "import { StatusIcon } from '../components/design-system/StatusIcon.js';\n",
      'inherited target 2.1.108 plugin recommendation StatusIcon import',
    )
    replaceExactly(
      pluginRecommendationPath,
      '          {figures.tick} {pluginName} installed · restart to apply\n',
      '          <StatusIcon status="success" withSpace={true} />{pluginName} installed · restart to apply\n',
      'inherited target 2.1.108 plugin recommendation success icon',
    )

    // Keep the changed SKILL and model-migration literals reachable through a
    // self-contained source owner.  The direct-map/direct-guide representation
    // is statically equivalent to 2.1.114's conditional insertion.
    writeAllExtractedClaudeApiDocuments(116, tree)
    writeCurrentSource('src/skills/bundled/claudeApiContent.ts', tree)
    writeCurrentSource('src/skills/bundled/claudeApi.ts', tree)
    // The 2.1.116 panel is a real first-party redesign, including custom
    // subagentStatusLine decorations.  The current authored owner was rebuilt
    // directly against the target fragment, so install that complete owner in
    // this case's own semantic tree.
    writeCurrentSource('src/components/CoordinatorAgentStatus.tsx', tree)

    // Target 116 prevents a Remote Control process from recursively starting
    // another bridge session.  Select only the remote-environment predicate,
    // entitlement split, and four fail-closed consumers; persistent Remote
    // Control startup is inherited from the early lineage and is not duplicated
    // in this late supplement.
    const bridgeEnabledPath = path.join(tree, 'src/bridge/bridgeEnabled.ts')
    replaceExactly(
      bridgeEnabledPath,
      "import { feature } from 'bun:bundle'\n",
      "import { feature } from 'bun:bundle'\nimport { getIsRemoteMode } from '../bootstrap/state.js'\n",
      'target 2.1.116 remote-environment state import',
    )
    replaceExactly(
      bridgeEnabledPath,
      `  return feature('BRIDGE_MODE')
    ? isClaudeAISubscriber() &&
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_ccr_bridge', false)
    : false
}

/**
 * Blocking entitlement check for Remote Control.`,
      `  return feature('BRIDGE_MODE')
    ? !isRunningInRemoteEnvironment() && hasBridgeEntitlement()
    : false
}

/**
 * Whether the signed-in account is entitled to Remote Control, independent of
 * whether this particular process may start another Remote Control session.
 */
export function hasBridgeEntitlement(): boolean {
  return (
    isClaudeAISubscriber() &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_ccr_bridge', false)
  )
}

/**
 * Blocking entitlement check for Remote Control.`,
      'target 2.1.116 remote-aware cached bridge gate',
    )
    replaceExactly(
      bridgeEnabledPath,
      `  return feature('BRIDGE_MODE')
    ? isClaudeAISubscriber() &&
        (await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bridge'))
    : false
}`,
      `  return feature('BRIDGE_MODE')
    ? !isRunningInRemoteEnvironment() &&
        isClaudeAISubscriber() &&
        (await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bridge'))
    : false
}`,
      'target 2.1.116 remote-aware blocking bridge gate',
    )
    replaceExactly(
      bridgeEnabledPath,
      `  if (feature('BRIDGE_MODE')) {
    if (!isClaudeAISubscriber()) {`,
      `  if (feature('BRIDGE_MODE')) {
    if (isRunningInRemoteEnvironment()) {
      return 'Remote Control is not available inside a remote session.'
    }
    if (!isClaudeAISubscriber()) {`,
      'target 2.1.116 remote bridge diagnostic',
    )
    replaceExactly(
      bridgeEnabledPath,
      `  return 'Remote Control is not available in this build.'
}

// try/catch:`,
      `  return 'Remote Control is not available in this build.'
}

/** Remote processes must never recursively start another Remote Control session. */
export function isRunningInRemoteEnvironment(): boolean {
  return (
    isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) || getIsRemoteMode()
  )
}

// try/catch:`,
      'target 2.1.116 remote-environment helper',
    )
    replaceExactly(
      bridgeEnabledPath,
      `export function getCcrAutoConnectDefault(): boolean {
  return feature('CCR_AUTO_CONNECT')`,
      `export function getCcrAutoConnectDefault(): boolean {
  if (isRunningInRemoteEnvironment()) return false
  return feature('CCR_AUTO_CONNECT')`,
      'target 2.1.116 remote autoconnect suppression',
    )

    // Target 116 gives the nested voice object precedence over the legacy
    // flat setting while retaining the existing auth and rollout gates.
    replaceExactly(
      path.join(tree, 'src/hooks/useVoiceEnabled.ts'),
      '  const userIntent = useAppState(s => s.settings.voiceEnabled === true)\n',
      `  const userIntent = useAppState(
    s => (s.settings.voice?.enabled ?? s.settings.voiceEnabled) === true,
  )
`,
      'target 2.1.116 nested voice-setting precedence',
    )

    // The published SDK schema drops an internal implementation note from
    // the away-summary setting description. Keep the setting and all runtime
    // behavior inherited; only the observable schema text changes here.
    replaceExactly(
      path.join(tree, 'src/utils/settings/types.ts'),
      '@internal When false, the session recap (shown when you return after being away for 5+ minutes) is disabled. When absent or true, recap is enabled. Hidden from public SDK types until external launch; mirrors voiceHandsfree pattern above.',
      '@internal When false, the session recap (shown when you return after being away for 5+ minutes) is disabled. When absent or true, recap is enabled. Hidden from public SDK types until external launch.',
      'target 2.1.116 away-summary schema description',
    )

    // Target 116 adds the Remote-Control-safe text counterpart for /fast.
    // Keep the shared transition helper and new noninteractive descriptor
    // together while selecting only their registry/import edges from the
    // shared command owners.
    for (const relative of [
      'src/commands/fast/fastModeShared.ts',
      'src/commands/fast/fast-noninteractive.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/commands/fast/fast.tsx',
        'src/commands/fast/index.ts',
        'src/commands.ts',
      ],
      /fastModeShared|fastNonInteractive|supportsNonInteractive|BRIDGE_SAFE_COMMANDS|handleFastModeShortcut/,
      'case114-fast-bridge-counterpart',
    )

    // Target 116 exposes text-safe /mode, /model, and /effort counterparts to
    // Remote Control. Install the bounded handlers/shared adapters, then keep
    // the descriptor/import/registry and JSX-sharing changes narrow in owners
    // that carry unrelated command history.
    for (const relative of [
      'src/commands/mode/availableModes.ts',
      'src/commands/mode/mode.ts',
      'src/commands/mode/index.ts',
      'src/commands/model/modelCommand.ts',
      'src/commands/model/model-noninteractive.ts',
      'src/commands/effort/effort-noninteractive.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/model/model.tsx'],
      /useAppStateStore|modelCommand|executeModelChange|renderCurrentModel/,
      'case114-model-shared-command-adapter',
    )
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/commands/model/index.ts',
        'src/commands/effort/index.ts',
        'src/commands/effort/effort.tsx',
      ],
      /modelNonInteractive|export const model|effortNonInteractive|export const effort|export const HELP/,
      'case114-model-effort-dual-descriptors',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands.ts'],
      /\+import model, \{ modelNonInteractive \}|\+import mode from|\+import effort, \{ effortNonInteractive \}|\n\+  mode,\n/,
      'case114-mode-model-effort-registry',
    )

    // Target 116 replaces the bespoke plugin option text editor with the
    // shared focus-aware Form component.  The options adapter owns first-line
    // trimming, typed coercion, saved-sensitive preservation, and the exact
    // target field/submit presentation.
    writeCurrentSource('src/components/Form.tsx', tree)
    writeCurrentSource('src/commands/plugin/PluginOptionsDialog.tsx', tree)

    // Target 116 also migrates the Bedrock access-key sequence onto the same
    // shared Form. The tracked reconstruction has no base owner, so install
    // the frozen target116 component whole; its focused evidence separates
    // the access-key/Form delta from the inherited provider and probe graph.
    writeCurrentSource('src/components/BedrockSetupWizard.tsx', tree)

    // Target 116 migrates every unified installed plugin/MCP row to the
    // shared focus-aware ListItem surface. Rebase the own-116 change over the
    // authenticated Box-era target97 owner so its MCP authentication shortcut
    // remains transitive rather than being duplicated as a late introduction.
    writeExternalSource(
      '/tmp/bash97-source-9Tlt35',
      'src/commands/plugin/UnifiedInstalledCell.tsx',
      tree,
    )
    const target116UnifiedInstalledPath = path.join(
      tree,
      'src/commands/plugin/UnifiedInstalledCell.tsx',
    )
    const target116UnifiedInstalledSource = fs.readFileSync(
      path.join(repositoryRoot, 'src/commands/plugin/UnifiedInstalledCell.tsx'),
      'utf8',
    )
    const target116UnifiedInstalledBase = fs.readFileSync(
      target116UnifiedInstalledPath,
      'utf8',
    )
    if (
      !target116UnifiedInstalledBase.includes('ConfigurableShortcutHint') ||
      !target116UnifiedInstalledBase.includes('<Box>') ||
      target116UnifiedInstalledBase.includes('<ListItem') ||
      !target116UnifiedInstalledSource.includes('<ListItem') ||
      target116UnifiedInstalledSource.includes("{isSelected ? `${figures.pointer} ` : '  '}")
    ) {
      throw new Error('target 2.1.116 unified installed base/current anchors differ')
    }
    fs.writeFileSync(
      target116UnifiedInstalledPath,
      target116UnifiedInstalledSource,
    )

    // Target 116 uses sentence-case capitalization for the forced Console
    // login method. Select only this observable label from the shared OAuth
    // flow owner and preserve every existing authentication branch.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/ConsoleOAuthFlow.tsx'],
      /Login method pre-selected: API usage billing/,
      'case114-console-login-method-label',
    )

    // Target 116 removes the dot separators from the message-actions footer
    // and groups each persistent navigation hint into a stable fragment.
    // Select only the two MessageActionsBar render hunks; the owner also
    // carries unrelated inherited navigation and copy behavior.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/messageActions.tsx'],
      /applicable\.map\(a_0|<React\.Fragment><Text bold=\{true\} dimColor=\{false\}>\{figures\.arrowUp\}/,
      'case114-message-actions-bar-spacing',
    )

    // Target 116 bounds the unmatched-IDE detail list to four entries and
    // renders the exact remaining-count summary. Select only this render hunk
    // from the shared IDE command owner.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/ide/ide.tsx'],
      /unavailableIDEs\.slice\(0, 4\)|…and \{unavailableIDEs\.length - 4\} more/,
      'case114-ide-unavailable-overflow',
    )

    // Target 116 removes qrcode's default terminal margin and replaces both
    // raw escape instructions with the shared shortcut hint, positioning it
    // before the QR/loading body in remote mode.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/session/session.tsx'],
      /KeyboardShortcutHint|margin: 0|marginBottom=\{1\}|<Box>\{t6\}<Text color="ide"|<T0>\{t4\}\{t7\}\{t8\}\{t5\}<\/T0>/,
      'case114-session-qr-shortcut',
    )

    // Target 116 factors /rename into one result-returning operation shared by
    // the interactive JSX command and a new noninteractive counterpart. Keep
    // the two tracked owner changes narrow and install only the new local
    // command file whole.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/rename/rename.ts'],
      /performRename|Could not generate a name/,
      'case114-rename-shared-operation',
    )
    writeCurrentSource('src/commands/rename/rename-noninteractive.ts', tree)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/rename/index.ts'],
      /renameNonInteractive|aliases: \['name'\]|supportsNonInteractive/,
      'case114-rename-dual-descriptors',
    )

    // Target 116 lets the terminal scroll handler delete the active prompt
    // selection, and surfaces bounded arrow-key/configuration hints. Install
    // the dedicated context owner, then select only the provider, prompt
    // selection bridge, and ScrollKeybindingHandler hunks from heavily shared
    // current owners.
    writeCurrentSource('src/context/selectionDelete.tsx', tree)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/App.tsx'],
      /SelectionDeleteProvider/,
      'case114-selection-delete-provider',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/PromptInput/PromptInput.tsx'],
      /DOMElement|nodeCache|CachedLayout|selectionBounds|SelectionState|getPromptSelectionOffsets|inputContainerRef|selectionDeleteHandlerRef|setHandler|tabIndex=\{-1\}/,
      'case114-prompt-selection-delete',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/ScrollKeybindingHandler.tsx'],
      /useStdin|useSelectionDelete|handlerIsActive|autoCopyConfigHintCount|countGraphemes|timeoutMs|performNamedScroll|repeatedModalPagerAction|isModalPagerInput|showCopiedToast\(text, true\)|tryDelete|arrow-burst|tengu_scroll_arrows_detected|scroll-as-arrows|auto-copy-config-hint|AUTO_COPY_CONFIG_HINT|shouldShowAutoCopyConfigHint|markAutoCopyConfigHintShown|setHandler/,
      'case114-scroll-selection-delete',
    )

    // Target 116 moves both updater download paths from the legacy generated
    // Google Storage bucket to the stable first-party downloads CDN. Keep the
    // two identical URL replacements together and leave updater channel,
    // rollback, package-manager, and sentinel behavior inherited.
    for (const relative of [
      'src/utils/autoUpdater.ts',
      'src/utils/nativeInstaller/download.ts',
    ]) {
      replaceExactly(
        path.join(tree, relative),
        'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases',
        'https://downloads.claude.ai/claude-code-releases',
        `target 2.1.116 release CDN in ${relative}`,
      )
    }

    // Target 116 completes Select's default page/edge navigation surface and
    // registers the four corresponding public keybinding actions. Select only
    // those two hunks; the same files carry unrelated earlier key migrations.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/keybindings/defaultBindings.ts', 'src/keybindings/schema.ts'],
      /select:pageUp|select:pageDown|select:first|select:last/,
      'case114-select-page-navigation',
    )

    // Target 116 makes every Opus 4.7 picker label version-explicit. Select
    // only the four label substitutions; modelOptions also carries unrelated
    // current available-model filtering that must remain outside this case.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/model/modelOptions.ts'],
      /Opus 4\.7(?: \(1M context\))?/,
      'case114-opus47-picker-labels',
    )

    // Target 116 bypasses the local upstream proxy for both JSR registry
    // hosts. Select only the two NO_PROXY entries; this owner also carries
    // inherited proxy-auth, AWS, relay, and lifecycle behavior.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/upstreamproxy/upstreamproxy.ts'],
      /'jsr\.io'|'npm\.jsr\.io'/,
      'case114-upstream-proxy-jsr-bypass',
    )

    // Target 116 exposes the sessions on the user's original tmux server.
    // The helper deliberately addresses the captured socket instead of the
    // process environment (which Claude mutates for nested sessions), bounds
    // the probe, and returns undefined for every unavailable-server outcome.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/swarm/backends/detection.ts'],
      /listUserTmuxSessions|list-sessions|#\{session_name\}/,
      'case114-user-tmux-sessions',
    )

    // Target 116 adds a privacy-preserving query-source bucket to cost and
    // token metrics. Select only the classifier, signature, attributes, and
    // recursive advisor propagation from the shared cost owner, then thread
    // the live streaming and fallback API calls explicitly.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cost-tracker.ts'],
      /QuerySource|getMetricsQuerySource|query_source|querySource\?: QuerySource|advisorUsage\.model,/,
      'case114-query-source-cost-metrics',
    )

    // Target 116 reports errors entering the persistent error-log sink to
    // OTEL exactly once per synchronous logging stack. Recover this narrow
    // helper/caller edge manually so the inherited compaction telemetry
    // function sharing the current diff hunk remains assigned to its earlier
    // boundary.
    const target116TelemetryEventsPath = path.join(
      tree,
      'src/utils/telemetry/events.ts',
    )
    replaceExactly(
      target116TelemetryEventsPath,
      `import { isEnvTruthy } from '../envUtils.js'
import { getTelemetryAttributes } from '../telemetryAttributes.js'`,
      `import { isEnvTruthy } from '../envUtils.js'
import { getErrnoCode } from '../errors.js'
import { getTelemetryAttributes } from '../telemetryAttributes.js'`,
      'target 2.1.116 internal-error errno import',
    )
    replaceExactly(
      target116TelemetryEventsPath,
      `let hasWarnedNoEventLogger = false

function isUserPromptLoggingEnabled()`,
      `let hasWarnedNoEventLogger = false

// Prevent telemetry failures from recursively reporting themselves through
// the global error logger.
let isLoggingInternalError = false

function isUserPromptLoggingEnabled()`,
      'target 2.1.116 internal-error recursion state',
    )
    fs.appendFileSync(
      target116TelemetryEventsPath,
      `

export function logPermissionModeChanged(values: {
  from: string
  to: string
  trigger?: string
}): void {
  if (values.from === values.to) return
  void logOTelEvent('permission_mode_changed', {
    from_mode: values.from,
    to_mode: values.to,
    ...(values.trigger && { trigger: values.trigger }),
  })
}

export function logInternalErrorEvent(error: Error): void {
  if (isLoggingInternalError) return
  isLoggingInternalError = true
  try {
    const errorName =
      error.name !== 'Error'
        ? error.name
        : error.constructor?.name || 'Error'
    const errorCode = getErrnoCode(error)
    void logOTelEvent('internal_error', {
      error_name: errorName,
      error_code:
        errorCode && /^[A-Z][A-Z0-9_]*$/.test(errorCode)
          ? errorCode
          : undefined,
    })
  } finally {
    isLoggingInternalError = false
  }
}
`,
    )

    // Target 116 records every effective permission-mode transition with a
    // stable trigger while suppressing same-mode no-ops. Keep the centralized
    // transition, cycle wrapper, gate kickout, Shift+Tab/auto opt-in, and all
    // ExitPlan edges together with the helper above.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/permissions/permissionSetup.ts'],
      /logPermissionModeChanged|trigger\?: string|auto_gate_denied|isScrubEnabled|allowed_non_write_users|feature gate|getLeaderToolUseConfirmQueue|SetPermissionModeResult|setPermissionMode/,
      'case114-permission-mode-transition',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/permissions/yoloClassifier.ts'],
      /SPECIFIC action under review|same operation|Generic encouragement/,
      'case114-yolo-claudemd-authorization',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/permissions/getNextPermissionMode.ts'],
      /trigger\?: string|trigger,/,
      'case114-permission-mode-cycle',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/PromptInput/PromptInput.tsx'],
      /cyclePermissionMode\([^\n]*shift_tab|transitionPermissionMode\([^\n]*auto_opt_in/,
      'case114-permission-mode-prompt-input',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts'],
      /logPermissionModeChanged|trigger: 'exit_plan_mode'/,
      'case114-permission-mode-exit-plan-v2',
    )
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
      ],
      /logPermissionModeChanged|trigger: 'exit_plan_mode'/,
      'case114-permission-mode-exit-dialog',
    )
    const target116ErrorLogSinkPath = path.join(
      tree,
      'src/utils/errorLogSink.ts',
    )
    replaceExactly(
      target116ErrorLogSinkPath,
      `import { jsonStringify } from './slowOperations.js'`,
      `import { jsonStringify } from './slowOperations.js'
import { logInternalErrorEvent } from './telemetry/events.js'`,
      'target 2.1.116 internal-error sink import',
    )
    replaceExactly(
      target116ErrorLogSinkPath,
      `function logErrorImpl(error: Error): void {
  const errorStr = error.stack || error.message`,
      `function logErrorImpl(error: Error): void {
  logInternalErrorEvent(error)
  const errorStr = error.stack || error.message`,
      'target 2.1.116 internal-error sink edge',
    )

    // Target 116 admits autoUploadSessions as a persisted global config key.
    // Its compiled bridge reader is definition-only and intentionally stays
    // out of authored source; recover only the observable config surface.
    const target116ConfigPath = path.join(tree, 'src/utils/config.ts')
    replaceExactly(
      target116ConfigPath,
      `  // undefined = use default (see getRemoteControlAtStartup() for precedence)
  remoteControlAtStartup?: boolean
`,
      `  // undefined = use default (see getRemoteControlAtStartup() for precedence)
  remoteControlAtStartup?: boolean

  // Automatically mirror eligible sessions to Remote Control.
  autoUploadSessions?: boolean
`,
      'target 2.1.116 auto-upload config type',
    )
    replaceExactly(
      target116ConfigPath,
      `  'prStatusFooterEnabled',
  'remoteControlAtStartup',
  'remoteDialogSeen',`,
      `  'prStatusFooterEnabled',
  'remoteControlAtStartup',
  'autoUploadSessions',
  'remoteDialogSeen',`,
      'target 2.1.116 auto-upload global key',
    )

    // Target 116 extends --remote from creation-only to existing-session
    // attachment by raw session/cse ID or claude.ai URL. Keep the config bit,
    // title-update suppression, parser/telemetry/presentation flow, public CLI
    // wording, and corrected source/branch wrapper argument order together.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/remote/RemoteSessionManager.ts'],
      /isAttachToExisting/,
      'case114-remote-attach-config',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/hooks/useRemoteSession.ts'],
      /isAttachToExisting/,
      'case114-remote-attach-title-gate',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/teleport.tsx'],
      /signal: AbortSignal, source\?: string, branchName\?: string/,
      'case114-remote-attach-wrapper-order',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/main.tsx'],
      /remoteSessionIdPattern|tengu_remote_attach_session|attachedSessionId|description\|session_id\|url|markRemoteControlUsed/,
      'case114-remote-attach-main',
    )

    // Target 116 offers a capped Remote Control hint after twenty idle
    // minutes and permanently suppresses it once Remote Control is used from
    // either /remote-control or a successful --rc startup.
    for (const relative of [
      'src/utils/remoteControlUpsell.ts',
      'src/hooks/notifs/useRemoteControlIdleUpsell.tsx',
    ]) {
      writeCurrentSource(relative, tree)
    }
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/bridge/bridge.tsx'],
      /markRemoteControlUsed/,
      'case114-remote-control-command-used',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/screens/REPL.tsx'],
      /useRemoteControlIdleUpsell/,
      'case114-remote-control-idle-repl',
    )

    // Target 116 treats exact existing terminal bindings as successful,
    // preserving conflicting VS Code args for the user to resolve and leaving
    // already-configured Alacritty/Zed bindings untouched.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/terminalSetup/terminalSetup.tsx'],
      /already configured|different args; leaving it as-is/,
      'case114-terminal-setup-idempotence',
    )
    replaceExactly(
      path.join(tree, 'src/commands/terminalSetup/terminalSetup.tsx'),
      `    // Check if keybinding already exists
    const existingBinding = keybindings.find(binding => binding.key === 'shift+enter' && binding.command === 'workbench.action.terminal.sendSequence' && binding.when === 'terminalFocus');
    if (existingBinding) {
      return \`${'${color(\'warning\', theme)(`Found existing ${editor} terminal Shift+Enter key binding. Remove it to continue.`)}${EOL}${chalk.dim(`See ${formatPathLink(keybindingsPath)}`)}${EOL}'}\`;
    }

`,
      '',
      'target 2.1.116 removes pre-construction VS Code duplicate warning',
    )

    // Target 116 retries one freshly observed needs-auth reconnect after
    // dropping only that memoized server result.  Keep this narrow edge apart
    // from the owner's other late OAuth and result-size changes.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/mcp/client.ts'],
      /Reconnect returned 'needs-auth'; retrying once after cache clear|getServerCacheKey\(name, config\)|logMcpServerConnection|logOTelEvent|isToolDetailsLoggingEnabled|markMcpServerNeedsAuth|getMcpUrlElicitationUrl|McpUrlElicitationDeclinedError|urlElicitationDeclined/,
      'case114-mcp-reconnect-and-connection-telemetry',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/tools/toolExecution.ts'],
      /markMcpServerNeedsAuth/,
      'case114-sdk-mcp-tool-auth-state',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/entrypoints/sdk/controlSchemas.ts'],
      /mcp_call|McpCall/,
      'case114-sdk-mcp-control-schema',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/print.ts'],
      /mcp_call|urlElicitationDeclined|McpUrlElicitationDeclinedError|SDK MCP|MCP server|controlAbortController/,
      'case114-sdk-mcp-print-handler',
    )

    // Target 116 exposes permission-checked file reads to both Remote Control
    // transports and the SDK control channel. Keep the reader, optional bridge
    // callback propagation, schema pair, direct print handler, and the bridge
    // permission-context accessor together while avoiding unrelated shared
    // bridge/SDK evolution in these heavily edited owners.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/bridge/bridgePermissionCallbacks.ts'],
      /readFileForRemote|RemoteFileReadResult|DEFAULT_REMOTE_READ_BYTES|MAX_REMOTE_READ_BYTES/,
      'case114-remote-read-file-reader',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/bridge/bridgeMessaging.ts'],
      /onReadFile|read_file/,
      'case114-remote-read-file-messaging',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/bridge/remoteBridgeCore.ts'],
      /onReadFile/,
      'case114-remote-read-file-core',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/bridge/initReplBridge.ts'],
      /readFileForRemote|getToolPermissionContext|getEmptyToolPermissionContext/,
      'case114-remote-read-file-init',
    )
    // Target 116 requires outbound-only bridge mirrors to satisfy the remote
    // sessions policy in addition to the ordinary Remote Control policy. Keep
    // this guard between the shared policy gate and OAuth refresh path so
    // inbound-capable sessions retain their target114 startup behavior.
    replaceExactly(
      path.join(tree, 'src/bridge/initReplBridge.ts'),
      `  if (!isPolicyAllowed('allow_remote_control')) {
    logBridgeSkip(
      'policy_denied',
      '[bridge:repl] Skipping: allow_remote_control policy not allowed',
    )
    onStateChange?.('failed', "disabled by your organization's policy")
    return null
  }

  // When CLAUDE_BRIDGE_OAUTH_TOKEN is set`,
      `  if (!isPolicyAllowed('allow_remote_control')) {
    logBridgeSkip(
      'policy_denied',
      '[bridge:repl] Skipping: allow_remote_control policy not allowed',
    )
    onStateChange?.('failed', "disabled by your organization's policy")
    return null
  }

  if (outboundOnly && !isPolicyAllowed('allow_remote_sessions')) {
    logBridgeSkip(
      'policy_denied',
      '[bridge:repl] Skipping mirror: allow_remote_sessions policy not allowed',
    )
    onStateChange?.('failed', "disabled by your organization's policy")
    return null
  }

  // When CLAUDE_BRIDGE_OAUTH_TOKEN is set`,
      'target 2.1.116 outbound mirror policy guard',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/entrypoints/sdk/controlSchemas.ts'],
      /SDKControlReadFile|subtype: z\.literal\('read_file'\)/,
      'case114-remote-read-file-schema',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/print.ts'],
      /message\.request\.subtype === 'read_file'|readFileForRemote|getToolPermissionContext: \(\) =>/,
      'case114-remote-read-file-print',
    )

    // Target 116 migrates the agent-server detail, status, and authentication
    // fields to the shared design-system Table. Select only that render/import
    // hunk so the component's inherited reconnect and OAuth behavior remains
    // attributed to its earlier owners.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/mcp/MCPAgentServerMenu.tsx'],
      /design-system\/Table|<Table|<Table\.Row|box="plain"|columns=\{\[\{ bold: true, width: 8 \}/,
      'case114-mcp-agent-server-table',
    )

    // Target 116 replaces MCPReconnect's bespoke spinner/text row with the
    // shared LoadingState surface while preserving reconnect state handling.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/mcp/MCPReconnect.tsx'],
      /design-system\/LoadingState|<LoadingState message="Establishing connection to MCP server"/,
      'case114-mcp-reconnect-loading-state',
    )

    // Target 116 migrates both remaining MCP server detail screens onto the
    // shared Dialog/Table/StatusIcon system. Install each frozen one-owner
    // recovery whole so the large JSX rewrite, chord guide, remote connector
    // route, and its preservation anchors cannot be split into label fragments.
    for (const relative of [
      'src/components/mcp/MCPRemoteServerMenu.tsx',
      'src/components/mcp/MCPStdioServerMenu.tsx',
    ]) {
      writeCurrentSource(relative, tree)
    }

    // Target 116 moves the Shell/Monitor detail metadata into the shared
    // Table, with the command column taking remaining width and the table
    // constrained to the dialog's inner terminal width.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/tasks/ShellDetailDialog.tsx'],
      /design-system\/Table|<Table|<Table\.Row|forceWidth=\{|ratio: 1|_c\(59\)|Loading output/,
      'case114-shell-detail-table',
    )

    // Target 116 shortens deferred-tool descriptions in simple/tool-search
    // modes and reports only the presence of user email in context metrics.
    // Select these two observable API hunks without pulling in unrelated
    // legacy-input or Unicode-normalization changes from the shared owner.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/api.ts'],
      /getToolDescription|tool\.searchHint|has_user_email|userContext\.userEmail/,
      'case114-simple-tool-descriptions-context-metrics',
    )

    // Target 116 consolidates duplicated DirectConnect and SSH lifecycle
    // hooks behind one external-session adapter. Install the three bounded
    // hook owners whole, then route the inherited live permission mode to the
    // SSH wrapper exactly as the target REPL caller does.
    for (const relative of [
      'src/hooks/useExternalSession.ts',
      'src/hooks/useDirectConnect.ts',
      'src/hooks/useSSHSession.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    replaceExactly(
      path.join(tree, 'src/screens/REPL.tsx'),
      `  const sshRemote = useSSHSession({
    session: sshSession,
    setMessages,
    setIsLoading: setIsExternalLoading,
    setToolUseConfirmQueue,
    tools: combinedInitialTools
  });`,
      `  const sshRemote = useSSHSession({
    session: sshSession,
    setMessages,
    setIsLoading: setIsExternalLoading,
    setToolUseConfirmQueue,
    tools: combinedInitialTools,
    permissionMode: toolPermissionContext.mode
  });`,
      'target 2.1.116 shared external-session SSH permission-mode caller',
    )
    replaceExactly(
      path.join(tree, 'src/services/mcp/client.ts'),
      `import {
  ClaudeAuthProvider,
  hasMcpDiscoveryButNoToken,`,
      `import {
  ClaudeAuthProvider,
  clearMcpOAuthEntryIfNoTokens,
  hasMcpDiscoveryButNoToken,`,
      'target 2.1.116 MCP OAuth token cleanup import',
    )
    replaceExactly(
      path.join(tree, 'src/services/mcp/client.ts'),
      `    if (client.type !== 'connected') {
      return {
        client,
        tools: [],
        commands: [],
      }
    }

    if (config.type === 'claudeai-proxy') {`,
      `    if (client.type !== 'connected') {
      return {
        client,
        tools: [],
        commands: [],
      }
    }

    if (config.type === 'http' || config.type === 'sse') {
      clearMcpOAuthEntryIfNoTokens(name, config)
    }

    if (config.type === 'claudeai-proxy') {`,
      'target 2.1.116 reconnect clears empty OAuth entries',
    )

    // Target 116 adds an explicit peer-protocol version to concurrent-session
    // PID records while retaining the preexisting release VERSION field.  The
    // protocol constant and serialized field are one bounded authored delta.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/concurrentSessions.ts'],
      /PEER_PROTOCOL_VERSION|peerProtocol:/,
      'case114-concurrent-session-peer-protocol',
    )

    // Target 116 exposes the manager's canonical, sorted language-extension
    // inventory through its public object surface.  Keep the added return type,
    // closure, and exported method together as one exact owner hunk.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/lsp/LSPServerManager.ts'],
      /getSupportedExtensions|Array\.from\(extensionMap\.keys\(\)\)\.sort\(\)/,
      'case114-lsp-supported-extensions',
    )

    // Target 116 makes the already-shortcut-aware fullscreen new-message
    // pill non-selectable.  The shortcut itself is owned by 110->111 and is
    // replayed cumulatively, so this case installs only the single JSX prop
    // on the target-commit source representation.
    replaceExactly(
      path.join(tree, 'src/components/FullscreenLayout.tsx'),
      '<Box onClick={onClick} onMouseEnter={t1} onMouseLeave={t2}>',
      '<Box noSelect={true} onClick={onClick} onMouseEnter={t1} onMouseLeave={t2}>',
      'target 2.1.116 fullscreen pill noSelect',
    )

    // Target 116 introduces the reusable focus-owning Select used by the
    // skills dialog. Recover the component, its sticky-focus hook, and the
    // exact skills call path. The FocusManager subscription is required for
    // the target behavior that reclaims focus after a temporary descendant
    // closes.
    for (const relative of [
      'src/components/design-system/Select.tsx',
      'src/ink/hooks/use-auto-focus.ts',
      'src/components/skills/SkillsMenu.tsx',
    ]) {
      writeCurrentSource(relative, tree)
    }
    applyMatchingWorkingTreePatch(
      tree,
      ['src/ink/focus.ts'],
      /listeners = new Set|subscribe = \(listener|private notify|this\.notify\(\)/,
      'case114-select-focus-manager',
    )

    // Target 116 makes the displayed review scope repository- and
    // head-branch-aware, distinguishing local changes from a branch diff.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/review/UltrareviewOverageDialog.tsx'],
      /Reviewing \$\{scope\.repo\}|Reviewing local changes on|Reviewing \$\{scope\.headBranch\}/,
      'case114-ultrareview-scope',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/commands/review/reviewRemote.ts'],
      /getCurrentBranch|repo: string|headBranch|Could not detect a GitHub repository|PR mode only supports github\.com|git fetch origin|Pass the base branch explicitly|billingNote: string|max: number/,
      'case114-ultrareview-scope-validation',
    )

    // The target-116 side-question fallback grows five live state getters.
    // Its compiled function also invokes registry/lifecycle adapters already
    // present in the 2.1.114 bundle but omitted from that historical source
    // snapshot.  Install the exact authenticated target-116 owners produced by
    // the focused recovery so this independently compiled tree has both the
    // late delta and its inherited AppState-backed call path.
    const queryContextRecovery =
      '/tmp/late-final-trees.FHK116/2.1.114-to-2.1.116'
    for (const relative of [
      'src/utils/queryContext.ts',
      'src/state/AppStateStore.ts',
    ]) {
      writeExternalSource(queryContextRecovery, relative, tree)
    }

    // Target 116 adds two related runtime surfaces: device-pre-resolved Brief
    // attachments and the organization policy that permanently latches a
    // session to either web-search or non-exempt MCP connectors.  Keep the
    // three Brief owners and the new policy module whole.  Select only latch
    // plumbing from tracked shared owners; for source files absent from the
    // target commit, start from their frozen historical introduction and add
    // the late isolation fields explicitly instead of copying unrelated later
    // evolutions wholesale.
    for (const relative of [
      'src/tools/BriefTool/attachments.ts',
      'src/tools/BriefTool/BriefTool.ts',
      'src/tools/BriefTool/prompt.ts',
      'src/utils/toolIsolation.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/Tool.ts',
        'src/services/tools/toolExecution.ts',
        'src/commands/clear/conversation.ts',
        'src/QueryEngine.ts',
        'src/cli/print.ts',
        'src/utils/forkedAgent.ts',
        'src/tools/AgentTool/runAgent.ts',
      ],
      /ToolIsolationLatch|createToolIsolationLatch|evaluateToolIsolation|isolationLatch|isolationClassifiedAs|tengu_tool_use_isolation_latch_denied/,
      'case114-brief-tool-isolation',
    )
    applyMatchingWorkingTreePatchDirect(
      tree,
      ['src/screens/REPL.tsx'],
      /createToolIsolationLatch|isolationLatch/,
      'case114-brief-tool-isolation-repl',
    )

    // Forked skills must expose their allowed-tools augmentation through both
    // the legacy AppState accessor and the direct permission-context accessor.
    // Keep the helper and only the three narrow propagation sites together.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/forkedAgent.ts'],
      /addAllowedToolsToPermissionContext|modifiedGetToolPermissionContext|ToolPermissionContext/,
      'case114-forked-allowed-tools-accessors',
    )
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/utils/processUserInput/processSlashCommand.tsx',
        'src/tools/SkillTool/SkillTool.ts',
      ],
      /modifiedGetToolPermissionContext/,
      'case114-forked-allowed-tools-callers',
    )

    // Target 116 keeps tool details private by default and, when the explicit
    // OTEL detail gate is enabled, adds Skill and Agent/Task subtype metadata
    // to both the pre-execution span and the result event. Select only the new
    // extractor, its import, and the two gated attribute/parameter blocks.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/analytics/metadata.ts'],
      /extractSubagentType|subagent_type/,
      'case114-tool-subagent-metadata',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/services/tools/toolExecution.ts'],
      /extractSubagentType|toolAttributes\.(?:file_path|full_command|skill_name|subagent_type)|toolParameters\.(?:skill_name|subagent_type)/,
      'case114-tool-subagent-execution',
    )

    // Target 116 makes the remote-task repository precondition actionable by
    // including the exact cwd that was checked.  Keep the getCwd import and
    // the single error branch together without selecting adjacent task-state
    // or task-registry evolution.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tasks/RemoteAgentTask/RemoteAgentTask.tsx'],
      /getCwd|Background tasks require a git repository \(checked:/,
      'case114-remote-task-git-cwd-error',
    )

    const replToolPath = path.join(tree, 'src/tools/REPLTool/REPLTool.ts')
    writeExternalSource(
      '/tmp/late107-replay.gotzZL/tree',
      'src/tools/REPLTool/REPLTool.ts',
      tree,
    )
    replaceExactly(
      replToolPath,
      "import { formatZodValidationError } from '../../utils/toolErrors.js'\n",
      "import { formatZodValidationError } from '../../utils/toolErrors.js'\nimport { evaluateToolIsolation } from '../../utils/toolIsolation.js'\n",
      'target 2.1.116 REPL isolation import',
    )
    replaceExactly(
      replToolPath,
      `      processedInput = parsed.data
      let hookPermissionResult`,
      `      processedInput = parsed.data
      const isolation = evaluateToolIsolation(tool, context)
      if (isolation.denyMessage) {
        logEvent('tengu_tool_use_isolation_latch_denied', {
          toolName: sanitizeToolNameForAnalytics(tool.name),
          toolUseID: toolUseId,
          isMcp: tool.isMcp ?? false,
          isolationLatch: isolation.activeLatch,
          isolationClassifiedAs: isolation.classifiedAs,
          replInnerCall: true,
        })
        return fail(isolation.denyMessage)
      }
      let hookPermissionResult`,
      'target 2.1.116 REPL isolation guard',
    )

    const choicePath = path.join(
      tree,
      'src/components/ultraplan/UltraplanChoiceDialog.tsx',
    )
    writeExternalSource(
      '/tmp/early-own-worktrees/91',
      'src/components/ultraplan/UltraplanChoiceDialog.tsx',
      tree,
    )
    replaceExactly(
      choicePath,
      "import { archiveRemoteSession } from '../../utils/teleport.js'\n",
      "import { archiveRemoteSession } from '../../utils/teleport.js'\nimport type { ToolIsolationLatch } from '../../utils/toolIsolation.js'\n",
      'target 2.1.116 Ultraplan isolation import',
    )
    replaceExactly(
      choicePath,
      '  setConversationId?: (id: any) => void\n}',
      '  setConversationId?: (id: any) => void\n  isolationLatch?: ToolIsolationLatch\n}',
      'target 2.1.116 Ultraplan isolation prop',
    )
    replaceExactly(
      choicePath,
      '  setConversationId,\n}: Props): React.ReactNode {',
      '  setConversationId,\n  isolationLatch,\n}: Props): React.ReactNode {',
      'target 2.1.116 Ultraplan isolation destructure',
    )
    replaceExactly(
      choicePath,
      '          setConversationId,\n        })',
      '          setConversationId,\n          isolationLatch,\n        })',
      'target 2.1.116 Ultraplan isolation clear path',
    )

    // The target-116 Ultraplan launch graph is source-aware: slash, keyword,
    // and exit-plan-mode launches retain their source, preflight repository
    // viability while the dialog is open, clear all bridge modes on consent,
    // and register bounded remote-session cleanup.  Keep the command and new
    // dialog whole, then select only this call path from shared current owners.
    for (const relative of [
      'src/commands/ultraplan.tsx',
      'src/components/ultraplan/UltraplanLaunchDialog.tsx',
      'src/utils/ultraplan/ccrSession.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    const ultraplanStatePath = path.join(tree, 'src/state/AppStateStore.ts')
    replaceExactly(
      ultraplanStatePath,
      '  ultraplanLaunchPending?: { blurb: string }',
      `  ultraplanLaunchPending?: {
    ultraplanArg: string
    source: 'slash' | 'keyword'
    sourcePromise?: Promise<
      import('../utils/background/remote/remoteSession.js').RemoteSourceViability | null
    >
  }`,
      'target 2.1.116 Ultraplan pending launch state',
    )
    applyMatchingWorkingTreePatchDirect(
      tree,
      ['src/screens/REPL.tsx'],
      /^(?![\s\S]*isolationLatch)[\s\S]*(?:UltraplanLaunchDialog|ultraplanLaunchPending|ultraplanArg|sourcePromise|formatCommandInputTags\('ultraplan'|statusMessageId|onStatusMessage)/,
      'case114-ultraplan-repl',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/processUserInput/processUserInput.ts'],
      /ultraplanLaunchPending|source: 'keyword'/,
      'case114-ultraplan-keyword-source',
    )
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
      ],
      /launchUltraplan|source: 'exit_plan_mode'|onStatusMessage/,
      'case114-ultraplan-exit-plan-source',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/background/remote/remoteSession.ts'],
      /RemoteSourceViability|getRemoteSourceViability|bundleSeedEnabled|tengu_ccr_bundle_seed_enabled|getCwd|findGitRoot/,
      'case114-ultraplan-source-viability',
    )
    // Target 116 makes the repository predicate asynchronous so unusual git
    // worktrees missed by the fast filesystem lookup can still be detected.
    // Bundle seeding remains stricter and uses the synchronous root lookup;
    // ordinary remote eligibility accepts the bounded rev-parse fallback.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/background/remote/preconditions.ts'],
      /execFileNoThrow|gitExe|async function checkIsInGitRepo|--is-inside-work-tree/,
      'case114-async-remote-git-precondition',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/background/remote/remoteSession.ts'],
      /await checkIsInGitRepo|bundleSeedGateOn && findGitRoot/,
      'case114-async-remote-git-eligibility',
    )

    // The review dialog shares the same target-114-and-later viability helper
    // instead of retaining a private duplicate. Apply these replacements
    // manually so the adjacent launch-animation and scope-copy hunks stay
    // attributed to their own evidence.
    const reviewDialogPath = path.join(
      tree,
      'src/commands/review/UltrareviewOverageDialog.tsx',
    )
    replaceExactly(
      reviewDialogPath,
      `import { checkGate_CACHED_OR_BLOCKING } from '../../services/analytics/growthbook.js'
import {
  checkGithubAppInstalled,
  checkIsInGitRepo,
} from '../../utils/background/remote/preconditions.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js'
import { isEnvTruthy } from '../../utils/envUtils.js'`,
      `import {
  getRemoteSourceViability,
  type RemoteSourceViability,
} from '../../utils/background/remote/remoteSession.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'`,
      'target 2.1.116 shared review viability imports',
    )
    replaceExactly(
      reviewDialogPath,
      `type ReviewSourceViability = {
  cloneViable: boolean
  bundleSeedEnabled: boolean
}

async function getReviewSourceViability(): Promise<ReviewSourceViability> {
  const [repository, bundleSeedGate] = await Promise.all([
    detectCurrentRepositoryWithHost(),
    checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled'),
  ])
  const bundleSeedEnabled =
    checkIsInGitRepo() &&
    (isEnvTruthy(process.env.CCR_ENABLE_BUNDLE) || bundleSeedGate)
  if (!bundleSeedEnabled) {
    return { cloneViable: false, bundleSeedEnabled }
  }
  return {
    cloneViable:
      repository !== null &&
      (repository.host !== 'github.com' ||
        (await checkGithubAppInstalled(repository.owner, repository.name))),
    bundleSeedEnabled,
  }
}

function formatReviewSourceViability(
  source: ReviewSourceViability,
): string | null {`,
      `function formatReviewSourceViability(
  source: RemoteSourceViability,
): string | null {`,
      'target 2.1.116 shared review viability helper',
    )
    replaceExactly(
      reviewDialogPath,
      '  sourcePromise: Promise<ReviewSourceViability | null> | null',
      '  sourcePromise: Promise<RemoteSourceViability | null> | null',
      'target 2.1.116 shared review viability type',
    )
    replaceExactly(
      reviewDialogPath,
      '    showTerms ? getReviewSourceViability().catch(() => null) : null,',
      '    showTerms ? getRemoteSourceViability().catch(() => null) : null,',
      'target 2.1.116 shared review viability call',
    )
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/teleport.tsx'],
      /onCreateFail|archiveRemoteSession\(|timeoutMs|configuredEnvironment|No configured default|\/\/ Fetch available environments/,
      'case114-ultraplan-teleport',
    )

    // UserPromptExpansion becomes a public, executable hook event in 2.1.116.
    // Select the complete target-backed graph: SDK/input/output schemas,
    // settings and plugin allowlists, event metadata/matching/output parsing,
    // the fast event gate, and inline/fork slash-command blocking/context flow.
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/entrypoints/sdk/coreTypes.ts',
        'src/entrypoints/sdk/coreSchemas.ts',
        'src/types/hooks.ts',
        'src/utils/settings/settings.ts',
        'src/utils/plugins/loadPluginHooks.ts',
        'src/utils/hooks/hooksConfigManager.ts',
        'src/utils/hooks.ts',
        'src/utils/messages.ts',
        'src/utils/processUserInput/processSlashCommand.tsx',
      ],
      /UserPromptExpansion|runUserPromptExpansionHook|executeUserPromptExpansionHooks|hookMessages|HOOK_EVENT_REGISTRY/,
      'case114-user-prompt-expansion',
    )

    // Target 116 makes hook telemetry names privacy-safe without changing the
    // user-facing hook name.  Keep raw matchers only when detailed tool
    // logging is enabled; otherwise normalize tool names, redact MCP server
    // matchers, and omit subagent matchers.  The same sanitized name feeds
    // both OTEL events and the hook span, while raw hook definitions remain
    // behind the tracing + details gate.
    const target116HooksPath = path.join(tree, 'src/utils/hooks.ts')
    replaceExactly(
      target116HooksPath,
      `import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import { logOTelEvent } from './telemetry/events.js'`,
      `import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import {
  isToolDetailsLoggingEnabled,
  sanitizeToolNameForAnalytics,
} from '../services/analytics/metadata.js'
import { logOTelEvent } from './telemetry/events.js'`,
      'target 2.1.116 hook telemetry privacy imports',
    )
    replaceExactly(
      target116HooksPath,
      `const TOOL_HOOK_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000
`,
      `const TOOL_HOOK_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000

export function getTelemetryHookName(
  hookEvent: HookEvent,
  matchQuery?: string,
): string {
  if (!matchQuery) return hookEvent
  if (isToolDetailsLoggingEnabled()) return \`\${hookEvent}:\${matchQuery}\`

  switch (hookEvent) {
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'PermissionRequest':
    case 'PermissionDenied':
      return \`\${hookEvent}:\${sanitizeToolNameForAnalytics(matchQuery)}\`
    case 'Elicitation':
    case 'ElicitationResult':
      return \`\${hookEvent}:mcp_server\`
    case 'SubagentStart':
      return hookEvent
    default:
      return \`\${hookEvent}:\${matchQuery}\`
  }
}
`,
      'target 2.1.116 hook telemetry privacy helper',
    )
    replaceExactly(
      target116HooksPath,
      `  // Collect hook definitions for beta tracing telemetry
  const hookDefinitionsJson = isBetaTracingEnabled()
    ? jsonStringify(getHookDefinitionsForTelemetry(matchingHooks))
    : '[]'

  // Log hook execution start to OTEL (only for beta tracing)
  if (isBetaTracingEnabled()) {
    void logOTelEvent('hook_execution_start', {
      hook_event: hookEvent,
      hook_name: hookName,
      num_hooks: String(matchingHooks.length),
      managed_only: String(shouldAllowManagedHooksOnly()),
      hook_definitions: hookDefinitionsJson,
      hook_source: shouldAllowManagedHooksOnly() ? 'policySettings' : 'merged',
    })
  }

  // Start hook span for beta tracing
  const hookSpan = startHookSpan(
    hookEvent,
    hookName,
    matchingHooks.length,
    hookDefinitionsJson,
  )`,
      `  // Hook definitions and raw tool names may contain user-specific MCP names.
  const shouldLogHookDefinitions =
    isBetaTracingEnabled() && isToolDetailsLoggingEnabled()
  const hookDefinitionsJson = shouldLogHookDefinitions
    ? jsonStringify(getHookDefinitionsForTelemetry(matchingHooks))
    : '[]'
  const telemetryHookName = getTelemetryHookName(hookEvent, matchQuery)

  void logOTelEvent('hook_execution_start', {
    hook_event: hookEvent,
    hook_name: telemetryHookName,
    num_hooks: String(matchingHooks.length),
    managed_only: String(shouldAllowManagedHooksOnly()),
    hook_source: shouldAllowManagedHooksOnly() ? 'policySettings' : 'merged',
    ...(shouldLogHookDefinitions && {
      hook_definitions: hookDefinitionsJson,
    }),
  })

  // Start hook span for beta tracing
  const hookSpan = startHookSpan(
    hookEvent,
    telemetryHookName,
    matchingHooks.length,
    hookDefinitionsJson,
  )`,
      'target 2.1.116 hook telemetry privacy start path',
    )
    replaceExactly(
      target116HooksPath,
      `  // Log hook execution completion to OTEL (only for beta tracing)
  if (isBetaTracingEnabled()) {
    const hookDefinitionsComplete =
      getHookDefinitionsForTelemetry(matchingHooks)

    void logOTelEvent('hook_execution_complete', {
      hook_event: hookEvent,
      hook_name: hookName,
      num_hooks: String(matchingHooks.length),
      num_success: String(outcomes.success),
      num_blocking: String(outcomes.blocking),
      num_non_blocking_error: String(outcomes.non_blocking_error),
      num_cancelled: String(outcomes.cancelled),
      managed_only: String(shouldAllowManagedHooksOnly()),
      hook_definitions: jsonStringify(hookDefinitionsComplete),
      hook_source: shouldAllowManagedHooksOnly() ? 'policySettings' : 'merged',
    })
  }`,
      `  void logOTelEvent('hook_execution_complete', {
    hook_event: hookEvent,
    hook_name: telemetryHookName,
    num_hooks: String(matchingHooks.length),
    num_success: String(outcomes.success),
    num_blocking: String(outcomes.blocking),
    num_non_blocking_error: String(outcomes.non_blocking_error),
    num_cancelled: String(outcomes.cancelled),
    total_duration_ms: String(totalDurationMs),
    managed_only: String(shouldAllowManagedHooksOnly()),
    hook_source: shouldAllowManagedHooksOnly() ? 'policySettings' : 'merged',
    ...(shouldLogHookDefinitions && {
      hook_definitions: hookDefinitionsJson,
    }),
  })`,
      'target 2.1.116 hook telemetry privacy completion path',
    )

    // Target 116 snapshots the number of nested daily memory logs before an
    // auto-dream fork and reports it on successful completion.  Missing or
    // inaccessible log trees are expected and count as zero; unexpected I/O
    // failures are debug-logged without aborting consolidation.
    const target116AutoDreamPath = path.join(
      tree,
      'src/services/autoDream/autoDream.ts',
    )
    replaceExactly(
      target116AutoDreamPath,
      `// (tests call initAutoDream() in beforeEach for a fresh closure).

import type { REPLHookContext }`,
      `// (tests call initAutoDream() in beforeEach for a fresh closure).

import { readdir } from 'fs/promises'
import { join } from 'path'
import type { REPLHookContext }`,
      'target 2.1.116 auto-dream daily-log fs imports',
    )
    replaceExactly(
      target116AutoDreamPath,
      `import { logForDebugging } from '../../utils/debug.js'
import type { ToolUseContext }`,
      `import { logForDebugging } from '../../utils/debug.js'
import { errorMessage, isFsInaccessible } from '../../utils/errors.js'
import { count } from '../../utils/array.js'
import type { ToolUseContext }`,
      'target 2.1.116 auto-dream daily-log helper imports',
    )
    replaceExactly(
      target116AutoDreamPath,
      `      const memoryRoot = getAutoMemPath()
      const transcriptDir = getProjectDir(getOriginalCwd())`,
      `      const memoryRoot = getAutoMemPath()
      const transcriptDir = getProjectDir(getOriginalCwd())
      const dailyLogsFound = await countDailyLogs(memoryRoot)`,
      'target 2.1.116 auto-dream daily-log snapshot',
    )
    replaceExactly(
      target116AutoDreamPath,
      `        sessions_reviewed: sessionIds.length,
      })`,
      `        sessions_reviewed: sessionIds.length,
        daily_logs_found: dailyLogsFound,
      })`,
      'target 2.1.116 auto-dream daily-log telemetry',
    )
    replaceExactly(
      target116AutoDreamPath,
      `
/**
 * Entry point from stopHooks. No-op until initAutoDream() has been called.`,
      `
async function countDailyLogs(memoryRoot: string): Promise<number> {
  try {
    const entries = await readdir(join(memoryRoot, 'logs'), { recursive: true })
    return count(entries, entry => entry.endsWith('.md'))
  } catch (error) {
    if (!isFsInaccessible(error)) {
      logForDebugging(\`[autoDream] countDailyLogs: \${errorMessage(error)}\`)
    }
    return 0
  }
}

/**
 * Entry point from stopHooks. No-op until initAutoDream() has been called.`,
      'target 2.1.116 auto-dream daily-log helper',
    )

    // Target 116 sharpens only the orientation and daily-log source guidance
    // in the consolidation prompt. Apply the two literal replacements over
    // the inherited team-memory owner instead of copying its unrelated graph.
    // The target114 bundle already contains the target98 team-memory branch,
    // although the tracked target116 source overlay omitted that ancestor.
    writeExternalSource(
      '/tmp/middle-semantic-final.BKAsET/2.1.97-to-2.1.98',
      'src/services/autoDream/consolidationPrompt.ts',
      tree,
    )
    const target116ConsolidationPromptPath = path.join(
      tree,
      'src/services/autoDream/consolidationPrompt.ts',
    )
    replaceExactly(
      target116ConsolidationPromptPath,
      '- If \\`logs/\\` or \\`sessions/\\` subdirectories exist (assistant-mode layout), review recent entries there',
      '- \\`ls logs/\\` — recent daily activity logs (one file per day). If a \\`sessions/\\` subdirectory also exists, review recent entries there too',
      'target 2.1.116 auto-dream consolidation orientation guidance',
    )
    replaceExactly(
      target116ConsolidationPromptPath,
      '1. **Daily logs** (\\`logs/YYYY/MM/YYYY-MM-DD.md\\`) if present — these are the append-only stream',
      '1. **Daily logs** (\\`logs/YYYY/MM/YYYY-MM-DD.md\\`) — the append-only activity stream. Read the most recent 1–3 days; each line is prefix-coded (\\`>\\` user, \\`<\\` assistant, \\`.\\` tool call)',
      'target 2.1.116 auto-dream consolidation daily-log guidance',
    )

    // Target 116 evolves the target-110 context-hint controller so short
    // conversations keep the beta header but omit the body. Install the full
    // inherited call path because the changed controller unit invokes it.
    installContextHintRuntime(tree, 'case114', 116)

    // Context-hint recovery above owns other hunks in the same large API
    // function. Thread query-source metrics only after that three-way patch is
    // stable so these two disjoint call-site additions cannot perturb its
    // original index base.
    const querySourceClaudePath = path.join(tree, 'src/services/api/claude.ts')
    replaceExactly(
      querySourceClaudePath,
      `            costUSD += addToTotalSessionCost(
              costUSDForPart,
              usage,
              options.model,
            )`,
      `            costUSD += addToTotalSessionCost(
              costUSDForPart,
              usage,
              options.model,
              options.querySource,
            )`,
      'target 2.1.116 streaming query-source cost metrics',
    )
    replaceExactly(
      querySourceClaudePath,
      `      costUSD += addToTotalSessionCost(
        fallbackCost,
        fallbackUsage,
        options.model,
      )`,
      `      costUSD += addToTotalSessionCost(
        fallbackCost,
        fallbackUsage,
        options.model,
        options.querySource,
      )`,
      'target 2.1.116 fallback query-source cost metrics',
    )

    // Workload identity is a target-116 first-party feature whose wrapper and
    // callers are authored here. The embedded SDK credential providers remain
    // an explicitly unresolved dependency/build-input delta in the ledger.
    for (const relative of [
      'src/constants/oauth.ts',
      'src/utils/workloadIdentity.ts',
      'src/services/api/client.ts',
      'src/utils/http.ts',
      'src/services/api/metricsOptOut.ts',
      'src/services/api/firstTokenDate.ts',
      'src/services/api/withRetry.ts',
      'src/utils/status.tsx',
    ]) {
      writeCurrentSource(relative, tree)
    }
    // The same authenticated withRetry owner also carries target 116's remote
    // retry-watchdog gate.  Copying that owner above intentionally selects the
    // Linux + remote-entrypoint + CLAUDE_CODE_RETRY_WATCHDOG predicate while
    // preserving the WIF, proxy-auth, and onError retry paths in one file.

    // Voice tap-to-toggle becomes executable at the 2.1.116 boundary.  The
    // 2.1.114 bundle still has a parser stub (`return undefined`), no tap
    // recording timers/keybinding branch, and no argument hint.  Install the
    // complete target-backed owners here: several prerequisite mode/cancel
    // fields were introduced earlier in the bundle but are absent from the
    // tracked target source snapshot, and are needed to keep this case-local
    // semantic tree executable.
    for (const relative of [
      'src/commands/voice/index.ts',
      'src/commands/voice/voice.ts',
      'src/hooks/useVoice.ts',
      'src/hooks/useVoiceIntegration.tsx',
      'src/utils/settings/types.ts',
    ]) {
      writeCurrentSource(relative, tree)
    }
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/PromptInput/PromptInput.tsx'],
      /voiceSubmitRef|submit: \(value: string, fromKeybinding\?: boolean\)/,
      'case114-voice-tap-submit-call-path',
    )

    // Target 116 distinguishes tap-to-toggle recording from hold-to-talk in
    // the live voice indicator. Select only the nested voice-mode selector and
    // recording presentation; warmup, processing, and shimmer behavior are
    // inherited and remain untouched.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/components/PromptInput/VoiceIndicator.tsx'],
      /voice\?\.mode|BLACK_CIRCLE|tap to send|voiceMode|ProcessingShimmer|_c\(3\)|\$\[2\]/,
      'case114-voice-tap-indicator',
    )

    // Target 116 expands the newest collapsed text paste when the same text
    // is pasted again. Apply this after the earlier PromptInput permission and
    // voice selections so their shared import/props index is already current.
    // leftArrowPending is propagated but deliberately unused by ModeIndicator
    // in this target; the background hint itself belongs to target113.
    applyMatchingWorkingTreePatch(
      tree,
      [
        'src/history.ts',
        'src/components/PromptInput/PromptInput.tsx',
        'src/components/PromptInput/PromptInputFooter.tsx',
        'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
      ],
      /expandHighestPastedTextRef|MAX_EXPANDABLE_PASTED_CONTENT_LENGTH|latestPasteId|text\.length <= 100_000|leftArrowPending|onLeftArrowOnEmpty|showExpandPasteHint\?:|showExpandPasteHint = false|    showExpandPasteHint,|paste again to expand|isInputEmpty|bg-detach|isBgSession/,
      'case114-repeat-paste-expansion',
    )
    replaceExactly(
      path.join(tree, 'src/components/PromptInput/PromptInput.tsx'),
      `  const [isPasting, setIsPasting] = useState(false);
  const [isExternalEditorActive, setIsExternalEditorActive] = useState(false);`,
      `  const [isPasting, setIsPasting] = useState(false);
  const [showExpandPasteHint, setShowExpandPasteHint] = useState(false);
  const expandPasteHintTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => () => {
    if (expandPasteHintTimerRef.current) {
      clearTimeout(expandPasteHintTimerRef.current);
    }
  }, []);
  const [isExternalEditorActive, setIsExternalEditorActive] = useState(false);`,
      'target 2.1.116 repeat-paste hint state',
    )

    // Target 116 adds the one-time kill-ring discovery hint when Ctrl+U or
    // the equivalent backward-line kill removes at least three characters.
    // Keep the complete current text-input owner: its reducer-backed kill
    // ring is inherited from target 110 and the changed target-116 function
    // is compiled as one structural unit containing both behaviors.
    writeCurrentSource('src/hooks/useTextInput.ts', tree)

    // 2.1.116 replaces the unconditional mobile-app tip with the Remote
    // Control tip and inserts the inherited voice tip immediately after it.
    // Rebuild this narrow array fragment directly so later unrelated tip
    // changes cannot leak into the historical semantic tree.
    const tipsPath = path.join(tree, 'src/services/tips/tipRegistry.ts')
    replaceExactly(
      tipsPath,
      "import { shouldShowOverageCreditUpsell } from '../../components/LogoV2/OverageCreditUpsell.js'\n",
      "import { shouldShowOverageCreditUpsell } from '../../components/LogoV2/OverageCreditUpsell.js'\nimport { isBridgeEnabled } from '../../bridge/bridgeEnabled.js'\n",
      'target 2.1.116 remote tip bridge import',
    )
    replaceExactly(
      tipsPath,
      "import { getGlobalConfig } from '../../utils/config.js'\n",
      "import {\n  getGlobalConfig,\n  getRemoteControlAtStartup,\n} from '../../utils/config.js'\n",
      'target 2.1.116 remote tip config import',
    )
    replaceExactly(
      tipsPath,
      "import { env } from '../../utils/env.js'\n",
      "import { env } from '../../utils/env.js'\nimport {\n  isEnvTruthy,\n  isRunningOnHomespace,\n} from '../../utils/envUtils.js'\n",
      'target 2.1.116 voice tip environment import',
    )
    replaceExactly(
      tipsPath,
      "import { getWorktreeCount } from '../../utils/git.js'\n",
      "import { getWorktreeCount } from '../../utils/git.js'\nimport { createHyperlink } from '../../utils/hyperlink.js'\n",
      'target 2.1.116 remote tip hyperlink import',
    )
    replaceExactly(
      tipsPath,
      "} from '../../utils/sessionStorage.js'\n",
      "} from '../../utils/sessionStorage.js'\nimport { isVoiceModeEnabled } from '../../voice/voiceModeEnabled.js'\n",
      'target 2.1.116 voice tip feature import',
    )
    replaceExactly(
      tipsPath,
      `  {
    id: 'mobile-app',
    content: async () =>
      '/mobile to use Claude Code from the Claude app on your phone',
    cooldownSessions: 15,
    isRelevant: async () => true,
  },
`,
      `  {
    id: 'remote-control',
    content: async ctx => {
      const blue = color('suggestion', ctx.theme)
      return \`Control this session from \${createHyperlink('https://claude.com/download#mobile', 'the Claude mobile app')} · run \${blue('/remote-control')}\`
    },
    cooldownSessions: 15,
    isRelevant: async () =>
      isBridgeEnabled() &&
      !getGlobalConfig().hasUsedRemoteControl &&
      !getRemoteControlAtStartup(),
  },
  {
    id: 'voice-mode',
    content: async () => 'Use /voice to enable push-to-talk dictation',
    cooldownSessions: 10,
    isRelevant: async () =>
      isVoiceModeEnabled() &&
      getInitialSettings().voiceEnabled === undefined &&
      !isRunningOnHomespace() &&
      !isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
      !env.isSSH(),
  },
`,
      'target 2.1.116 remote and voice tip ordering',
    )
    const configPath = path.join(tree, 'src/utils/config.ts')
    replaceExactly(
      configPath,
      '  hasUsedBackgroundTask?: boolean // Whether the user has backgrounded a task (Ctrl+B)\n',
      '  hasUsedBackgroundTask?: boolean // Whether the user has backgrounded a task (Ctrl+B)\n  hasUsedRemoteControl?: boolean // Whether the user has connected Remote Control\n  remoteControlUpsellSeenCount?: number // Number of idle Remote Control upsells shown (capped by the upsell policy)\n  closedIssuesLastChecked?: number // Timestamp of the last GitHub closed-issue poll\n  closedIssuesAcknowledged?: number[] // Closed issue numbers already shown to the user\n',
      'target 2.1.116 remote-use and idle-upsell config state',
    )

    // Target 116 polls the user's recently closed claude-code issues once per
    // day, caches only completed closures, and shows an acknowledgement-aware
    // notification under the exact feature gate. Install the two new owners,
    // then add only their import/render edges to the heavily evolved footer.
    writeCurrentSource('src/utils/closedIssues.ts', tree)
    writeCurrentSource('src/components/ClosedIssueNotice.tsx', tree)
    const notificationsPath = path.join(
      tree,
      'src/components/PromptInput/Notifications.tsx',
    )
    replaceExactly(
      notificationsPath,
      "import { AutoUpdaterWrapper } from '../AutoUpdaterWrapper.js';\n",
      "import { AutoUpdaterWrapper } from '../AutoUpdaterWrapper.js';\nimport { ClosedIssueNotice } from '../ClosedIssueNotice.js';\n",
      'target 2.1.116 closed-issue notification import',
    )
    const autoUpdaterNotice =
      '      {shouldShowAutoUpdater && <AutoUpdaterWrapper verbose={verbose} onAutoUpdaterResult={onAutoUpdaterResult} autoUpdaterResult={autoUpdaterResult} isUpdating={isAutoUpdating} onChangeIsUpdating={onChangeIsUpdating} showSuccessMessage={!isShowingCompactMessage} />}\n'
    replaceExactly(
      notificationsPath,
      autoUpdaterNotice,
      `${autoUpdaterNotice}      <ClosedIssueNotice />\n`,
      'target 2.1.116 closed-issue notification call edge',
    )
    // The late transcript-mirror evolution is spread across SDK schemas,
    // local transcript storage, stdout/bridge filters, and print-mode flush
    // gates.  Select only mirror-specific working-tree hunks: the separate
    // target-97 single-mirror introduction is proved by its own case.
    const transcriptMirrorPatch = matchingWorkingTreePatch(
      [
        'src/entrypoints/sdk/coreSchemas.ts',
        'src/entrypoints/sdk/controlSchemas.ts',
        'src/utils/sessionStorage.ts',
        'src/server/directConnectManager.ts',
        'src/cli/remoteIO.ts',
        'src/main.tsx',
      ],
      /post_turn_summary|SDKPostTurnSummary|transcript_mirror|mirror_error|SessionMirror|sessionMirror|session-mirror|addMirror|fireMirror|addSessionMirror|flushSessionStorage|SDKTranscriptMirror|SDKMirrorError|mirrorEntries|mirrors/,
    )
    const transcriptMirrorPatchPath = path.join(tree, '.case114-transcript-mirror.patch')
    fs.writeFileSync(transcriptMirrorPatchPath, transcriptMirrorPatch)
    git(tree, ['apply', '--3way', transcriptMirrorPatchPath])
    fs.unlinkSync(transcriptMirrorPatchPath)

    // Post-turn summaries are introduced in 2.1.116 as an authored runtime
    // cluster.  Keep the standalone owner whole, and select only its print
    // call-path hunks.  The print selection also owns the adjacent
    // transcript-mirror filter/registration hunks so both late features are
    // applied once instead of asking two overlapping diffs to merge.
    writeCurrentSource('src/services/postTurnSummary.ts', tree)
    applyMatchingWorkingTreePatch(
      tree,
      ['src/cli/print.ts'],
      /PostTurnSummary|postTurnSummary|post_turn_summary|transcript_mirror|SessionMirror|sessionMirror|addMirror|addSessionMirror|flushSessionStorage/,
      'case114-post-turn-summary-and-print-mirror',
    )
    const historicalPath = path.join(tree, 'src/main.tsx')
    let historical = fs.readFileSync(historicalPath, 'utf8')
    const current = fs.readFileSync(path.join(repositoryRoot, 'src/main.tsx'), 'utf8')
    const historicalImport = "import { clearServerCache } from 'src/services/mcp/client.js';"
    const currentImport = "import { clearServerCache, connectToServer, getServerCacheKey } from 'src/services/mcp/client.js';"
    if (!historical.includes(historicalImport) || !current.includes(currentImport)) {
      throw new Error('target 2.1.116 MCP import anchor differs')
    }
    historical = historical.replace(historicalImport, currentImport)
    const startMarker = '      // Print-mode MCP'
    const endMarker = "      profileCheckpoint('after_connectMcp_claudeai');"
    const historicalStart = historical.indexOf(startMarker)
    const historicalEnd = historical.indexOf(endMarker, historicalStart)
    const currentStart = current.indexOf(startMarker)
    const currentEnd = current.indexOf(endMarker, currentStart)
    if ([historicalStart, historicalEnd, currentStart, currentEnd].some(index => index < 0)) {
      throw new Error('target 2.1.116 MCP coordinator anchors differ')
    }
    historical =
      historical.slice(0, historicalStart) +
      current.slice(currentStart, currentEnd) +
      historical.slice(historicalEnd)
    fs.writeFileSync(historicalPath, historical)

    // Target 116 introduces two process-wide SDK/session inputs: the CLI
    // start type used by session telemetry and the optional SDK skill
    // allowlist.  Install only this graph's state, parser, telemetry, SDK
    // initializer, listing, validation, attachment, and prompt-guidance
    // edges; the same shared owners contain unrelated recovered features.
    const sessionStatePath = path.join(tree, 'src/bootstrap/state.ts')
    replaceExactly(
      sessionStatePath,
      `  sessionSource: string | undefined
  questionPreviewFormat: 'markdown' | 'html' | undefined`,
      `  sessionSource: string | undefined
  sessionStartType: 'fresh' | 'resume' | 'continue'
  questionPreviewFormat: 'markdown' | 'html' | undefined`,
      'target 2.1.116 session start state type',
    )
    replaceExactly(
      sessionStatePath,
      `  // Frontmatter hooks from the main thread agent.
  mainThreadAgentHooks: HooksSettings | undefined
  // Remote mode (--remote flag)`,
      `  // Frontmatter hooks from the main thread agent.
  mainThreadAgentHooks: HooksSettings | undefined
  // SDK-provided allowlist for skills available to the main session.
  sessionSkillAllowlist: string[] | undefined
  // Remote mode (--remote flag)`,
      'target 2.1.116 session skill allowlist state type',
    )
    replaceExactly(
      sessionStatePath,
      `    sessionSource: undefined,
    questionPreviewFormat: undefined,`,
      `    sessionSource: undefined,
    sessionStartType: 'fresh',
    questionPreviewFormat: undefined,`,
      'target 2.1.116 session start initial state',
    )
    replaceExactly(
      sessionStatePath,
      `    mainThreadAgentType: undefined,
    mainThreadAgentHooks: undefined,
    // Remote mode`,
      `    mainThreadAgentType: undefined,
    mainThreadAgentHooks: undefined,
    sessionSkillAllowlist: undefined,
    // Remote mode`,
      'target 2.1.116 session skill allowlist initial state',
    )
    replaceExactly(
      sessionStatePath,
      `export function setIsInteractive(value: boolean): void {
  STATE.isInteractive = value
}

export function getClientType(): string {`,
      `export function setIsInteractive(value: boolean): void {
  STATE.isInteractive = value
}

export function getSessionStartType(): 'fresh' | 'resume' | 'continue' {
  return STATE.sessionStartType
}

export function setSessionStartType(
  value: 'fresh' | 'resume' | 'continue',
): void {
  STATE.sessionStartType = value
}

export function getClientType(): string {`,
      'target 2.1.116 session start state accessors',
    )
    replaceExactly(
      sessionStatePath,
      `export function setMainThreadAgentHooks(hooks: HooksSettings | undefined): void {
  STATE.mainThreadAgentHooks = hooks
}

export function getIsRemoteMode(): boolean {`,
      `export function setMainThreadAgentHooks(hooks: HooksSettings | undefined): void {
  STATE.mainThreadAgentHooks = hooks
}

export function getSessionSkillAllowlist(): string[] | undefined {
  return STATE.sessionSkillAllowlist
}

export function setSessionSkillAllowlist(skills: string[] | undefined): void {
  STATE.sessionSkillAllowlist = skills
}

export function getIsRemoteMode(): boolean {`,
      'target 2.1.116 session skill allowlist accessors',
    )

    const sessionMainPath = path.join(tree, 'src/main.tsx')
    replaceExactly(
      sessionMainPath,
      'setSessionPersistenceDisabled, setSessionSource, setUserMsgOptIn',
      'setSessionPersistenceDisabled, setSessionSource, setSessionStartType, setUserMsgOptIn',
      'target 2.1.116 session start main import',
    )
    replaceExactly(
      sessionMainPath,
      `  process.env.CLAUDE_CODE_ENTRYPOINT = isNonInteractive ? 'sdk-cli' : 'cli';
}

// Set by early argv processing`,
      `  process.env.CLAUDE_CODE_ENTRYPOINT = isNonInteractive ? 'sdk-cli' : 'cli';
}

function parseSessionStartType(
  args: string[],
): 'fresh' | 'resume' | 'continue' {
  const delimiterIndex = args.indexOf('--')
  const cliArgs =
    delimiterIndex === -1 ? args : args.slice(0, delimiterIndex)

  if (
    cliArgs.includes('-r') ||
    cliArgs.includes('--resume') ||
    cliArgs.includes('--from-pr') ||
    cliArgs.some(
      arg => arg.startsWith('--resume=') || arg.startsWith('--from-pr='),
    )
  ) {
    return 'resume'
  }
  if (cliArgs.includes('-c') || cliArgs.includes('--continue')) {
    return 'continue'
  }
  return 'fresh'
}

// Set by early argv processing`,
      'target 2.1.116 session start argv parser',
    )
    replaceExactly(
      sessionMainPath,
      `  initializeEntrypoint(isNonInteractive);

  // Determine client type`,
      `  initializeEntrypoint(isNonInteractive);
  setSessionStartType(parseSessionStartType(cliArgs));

  // Determine client type`,
      'target 2.1.116 session start initialization',
    )

    const initPath = path.join(tree, 'src/entrypoints/init.ts')
    replaceExactly(
      initPath,
      `import { getSessionCounter, setMeter } from '../bootstrap/state.js'`,
      `import {
  getSessionCounter,
  getSessionStartType,
  setMeter,
} from '../bootstrap/state.js'`,
      'target 2.1.116 session start telemetry import',
    )
    replaceExactly(
      initPath,
      '    getSessionCounter()?.add(1)',
      '    getSessionCounter()?.add(1, { start_type: getSessionStartType() })',
      'target 2.1.116 session start telemetry attribute',
    )

    const sessionPrintPath = path.join(tree, 'src/cli/print.ts')
    replaceExactly(
      sessionPrintPath,
      `  getInitJsonSchema,
  setSdkAgentProgressSummariesEnabled,
} from 'src/bootstrap/state.js'`,
      `  getInitJsonSchema,
  setSdkAgentProgressSummariesEnabled,
  setSessionSkillAllowlist,
} from 'src/bootstrap/state.js'`,
      'target 2.1.116 SDK skill allowlist print import',
    )
    replaceExactly(
      sessionPrintPath,
      `  if (request.promptSuggestions !== undefined) {
    options.promptSuggestions = request.promptSuggestions
  }

  // Merge agents from stdin`,
      `  if (request.promptSuggestions !== undefined) {
    options.promptSuggestions = request.promptSuggestions
  }
  if (request.skills !== undefined) {
    setSessionSkillAllowlist(request.skills)
  }

  // Merge agents from stdin`,
      'target 2.1.116 SDK skill allowlist initialize request',
    )

    installPrintResumeTelemetry116Prerequisites(tree)
    installTarget116HeadlessMcpAndStartup(tree)
    installTarget116ModelCanonicalization(tree)
    installTarget116MessageOperations(tree)
    installTarget116SynchronizedOutputProbe(tree)
    installTarget116FourLiveResidueGaps(tree)
    installTarget116KeybindingPreDispatch(tree)
    installTarget116ExportRendererKeybindingContext(tree)
    installTarget116BridgePermissionAndSelectorOverflow(tree)
    installTarget116ExactModelCapabilityDispatch(tree)
    installTarget90MemoryTogglePrerequisite(tree)
    installTarget116SessionIndexScanApi(tree)
    installTarget116ResumePickerTelemetry(tree)
    installTarget116RemoteControlSessionSuppression(tree)
    installTarget116ResumeCommandLoadingState(tree)
    installTarget116TaskStopOwnership(tree)
    installTarget116ToolInputUnicodeEscapes(tree)
    installTarget116TeamsDialogShortcutFooter(tree)
    installTarget116TrustDialogShortcutFooter(tree)
    installTarget116StrictTailSourceOwners(tree)
    installTarget116FeedbackSurveyNotSure(tree)
    installTarget101SdkOAuthPrerequisite(tree)
    installTarget111AppendSubagentPromptPrerequisite(tree)
    installTarget113ActiveInputPrerequisite(tree)
    installTarget113SandboxOverrideProducerPrerequisite(tree)
    installTarget97DynamicSystemPromptPrerequisite(tree)
    installTarget97AdditionalModelCostsPrerequisite(tree)
    installTarget97PersistentRuntimePrerequisites(tree)
    installTarget105SystemDiagnosticsPrerequisite(tree)
    installTarget105DeprecationTensePrerequisite(tree)
    installTarget105MemoryFactShapePrerequisite(tree)
    installTarget116FileReadMitigationEvolution(tree)
    installTarget116SdkControlMetadata(tree)
    installTarget116SimplifyNestedConditionals(tree)

    const commandsPath = path.join(tree, 'src/commands.ts')
    replaceExactly(
      commandsPath,
      `export function findCommand(
  commandName: string,
  commands: Command[],
): Command | undefined {
  return commands.find(
    _ =>
      _.name === commandName ||
      getCommandName(_) === commandName ||
      _.aliases?.includes(commandName),
  )
}

export function hasCommand`,
      `export function findCommand(
  commandName: string,
  commands: Command[],
): Command | undefined {
  return commands.find(command => commandMatchesName(command, commandName))
}

function commandMatchesName(command: Command, commandName: string): boolean {
  return (
    command.name === commandName ||
    getCommandName(command) === commandName ||
    (command.aliases?.includes(commandName) ?? false)
  )
}

export function filterCommandsBySessionSkillAllowlist(
  commands: Command[],
  allowlist: string[] | undefined,
): Command[] {
  if (allowlist === undefined) return commands
  return commands.filter(command =>
    allowlist.some(
      skill =>
        commandMatchesName(command, skill) ||
        command.name.endsWith(\`:\${skill}\`),
    ),
  )
}

export function hasCommand`,
      'target 2.1.116 session skill allowlist command filter',
    )

    const skillPromptPath = path.join(tree, 'src/tools/SkillTool/prompt.ts')
    replaceExactly(
      skillPromptPath,
      `import {
  getCommandName,`,
      `import {
  filterCommandsBySessionSkillAllowlist,
  getCommandName,`,
      'target 2.1.116 session skill prompt filter import',
    )
    replaceExactly(
      skillPromptPath,
      `} from 'src/commands.js'
import { COMMAND_NAME_TAG }`,
      `} from 'src/commands.js'
import { getSessionSkillAllowlist } from 'src/bootstrap/state.js'
import { COMMAND_NAME_TAG }`,
      'target 2.1.116 session skill prompt state import',
    )
    replaceExactly(
      skillPromptPath,
      `  const agentCommands = await getSkillToolCommands(cwd)

  return {
    totalCommands: agentCommands.length,
    includedCommands: agentCommands.length,
  }`,
      `  const agentCommands = await getSkillToolCommands(cwd)
  const includedCommands = filterCommandsBySessionSkillAllowlist(
    agentCommands,
    getSessionSkillAllowlist(),
  )

  return {
    totalCommands: agentCommands.length,
    includedCommands: includedCommands.length,
  }`,
      'target 2.1.116 session skill prompt counts',
    )
    replaceExactly(
      skillPromptPath,
      `export function getLimitedSkillToolCommands(cwd: string): Promise<Command[]> {
  return getSkillToolCommands(cwd)
}`,
      `export async function getLimitedSkillToolCommands(
  cwd: string,
): Promise<Command[]> {
  return filterCommandsBySessionSkillAllowlist(
    await getSkillToolCommands(cwd),
    getSessionSkillAllowlist(),
  )
}`,
      'target 2.1.116 limited session skills',
    )

    const skillToolPath = path.join(tree, 'src/tools/SkillTool/SkillTool.ts')
    replaceExactly(
      skillToolPath,
      `import { getProjectRoot } from 'src/bootstrap/state.js'`,
      `import {
  getProjectRoot,
  getSessionSkillAllowlist,
} from 'src/bootstrap/state.js'`,
      'target 2.1.116 session skill tool state import',
    )
    replaceExactly(
      skillToolPath,
      `import {
  builtInCommandNames,
  findCommand,`,
      `import {
  builtInCommandNames,
  filterCommandsBySessionSkillAllowlist,
  findCommand,`,
      'target 2.1.116 session skill tool filter import',
    )
    replaceExactly(
      skillToolPath,
      `    const normalizedCommandName = hasLeadingSlash
      ? trimmed.substring(1)
      : trimmed

    // Remote canonical skill handling`,
      `    const normalizedCommandName = hasLeadingSlash
      ? trimmed.substring(1)
      : trimmed
    const sessionSkillAllowlist =
      context.agentId === undefined ? getSessionSkillAllowlist() : undefined

    // Remote canonical skill handling`,
      'target 2.1.116 session skill main-agent lookup',
    )
    replaceExactly(
      skillToolPath,
      `
    // Check if command is a prompt-based command`,
      `
    if (
      sessionSkillAllowlist !== undefined &&
      filterCommandsBySessionSkillAllowlist(
        [foundCommand],
        sessionSkillAllowlist,
      ).length === 0
    ) {
      return {
        result: false,
        message: \`Skill \${normalizedCommandName} is not in this session's skills allowlist\`,
        errorCode: 8,
      }
    }

    // Check if command is a prompt-based command`,
      'target 2.1.116 session skill validation',
    )

    const attachmentsPath = path.join(tree, 'src/utils/attachments.ts')
    replaceExactly(
      attachmentsPath,
      `import { getSkillToolCommands, getMcpSkillCommands } from '../commands.js'`,
      `import {
  filterCommandsBySessionSkillAllowlist,
  getSkillToolCommands,
  getMcpSkillCommands,
} from '../commands.js'`,
      'target 2.1.116 session skill attachment filter import',
    )
    replaceExactly(
      attachmentsPath,
      `import { getProjectRoot } from '../bootstrap/state.js'`,
      `import {
  getProjectRoot,
  getSessionSkillAllowlist,
} from '../bootstrap/state.js'`,
      'target 2.1.116 session skill attachment state import',
    )
    replaceExactly(
      attachmentsPath,
      `      ? uniqBy([...localCommands, ...mcpSkills], 'name')
      : localCommands

  // When skill search is active`,
      `      ? uniqBy([...localCommands, ...mcpSkills], 'name')
      : localCommands

  if (toolUseContext.agentId === undefined) {
    allCommands = filterCommandsBySessionSkillAllowlist(
      allCommands,
      getSessionSkillAllowlist(),
    )
  }

  // When skill search is active`,
      'target 2.1.116 session skill attachment filtering',
    )

    const promptsPath = path.join(tree, 'src/constants/prompts.ts')
    replaceExactly(
      promptsPath,
      `import { getIsNonInteractiveSession } from '../bootstrap/state.js'`,
      `import {
  getIsNonInteractiveSession,
  getSessionSkillAllowlist,
} from '../bootstrap/state.js'`,
      'target 2.1.116 session skill guidance state import',
    )
    replaceExactly(
      promptsPath,
      `  const hasAskUserQuestionTool = enabledTools.has(ASK_USER_QUESTION_TOOL_NAME)
  const hasSkills =
    skillToolCommands.length > 0 && enabledTools.has(SKILL_TOOL_NAME)`,
      `  const hasAskUserQuestionTool = enabledTools.has(ASK_USER_QUESTION_TOOL_NAME)
  const sessionSkillAllowlist = getSessionSkillAllowlist()
  const hasSkills =
    (sessionSkillAllowlist === undefined
      ? skillToolCommands.length > 0
      : sessionSkillAllowlist.length > 0) && enabledTools.has(SKILL_TOOL_NAME)`,
      'target 2.1.116 session skill guidance filtering',
    )

    // Target 116 exposes live worktree state before optional transcript
    // persistence.  The title/name signals are inherited from an earlier
    // boundary, so this isolated case adds only the new signal and emit edge.
    const sessionStoragePath = path.join(tree, 'src/utils/sessionStorage.ts')
    replaceExactly(
      sessionStoragePath,
      `import { jsonParse, jsonStringify } from './slowOperations.js'
import type { ContentReplacementRecord }`,
      `import { jsonParse, jsonStringify } from './slowOperations.js'
import { createSignal } from './signal.js'

export const worktreeStateSignal =
  createSignal<[worktreeSession: PersistedWorktreeSession | null]>()
import type { ContentReplacementRecord }`,
      'target 2.1.116 worktree state signal',
    )
    replaceExactly(
      sessionStoragePath,
      `  const project = getProject()
  project.currentSessionWorktree = stripped
  // Write eagerly when the file already exists`,
      `  const project = getProject()
  project.currentSessionWorktree = stripped
  worktreeStateSignal.emit(stripped)
  // Write eagerly when the file already exists`,
      'target 2.1.116 worktree state signal emit',
    )

    // Target 116 makes metadata refresh safe in async queue-drain and session-
    // materialization paths by sharing one ordered plan between synchronous
    // and asynchronous writers.  Async filesystem helpers are already
    // selected with transcript mirroring above; select only the class planner,
    // entry conversion, and two awaited call sites here.
    const asyncMetadataPatch = matchingWorkingTreePatch(
      ['src/utils/sessionStorage.ts'],
      /reAppendSessionMetadataAsync|planReAppendSessionMetadata|const entries: Entry\[\]|entries\.push|return \{ sessionFile, entries \}/,
    )
    if (asyncMetadataPatch.length === 0) {
      throw new Error('target 2.1.116 async metadata planner selected no hunks')
    }
    const asyncMetadataPatchPath = path.join(
      tree,
      '.case114-session-metadata-async-planner.patch',
    )
    fs.writeFileSync(asyncMetadataPatchPath, asyncMetadataPatch)
    // The transcript-mirror selection has already modified this file, so use
    // context application instead of index-based three-way application.
    git(tree, ['apply', asyncMetadataPatchPath])
    fs.unlinkSync(asyncMetadataPatchPath)

    // Target 116 adds the opt-in raw API body `file:` transport.  This is a
    // self-contained owner: parse/cache configuration, private file writes,
    // safe reference naming, redacted serialization, and OTel reference
    // metadata all live in the same module.
    writeCurrentSource('src/utils/telemetry/apiBodyLogging.ts', tree)

    // Target 116 adds direct standard-install Git Bash fallbacks ahead of the
    // inherited where.exe-derived lookup.  Keep this boundary narrow: current
    // source also modernizes that inherited lookup, but only the two direct
    // bash.exe paths belong to the 114->116 structural unit.
    const windowsPathsPath = path.join(tree, 'src/utils/windowsPaths.ts')
    replaceExactly(
      windowsPathsPath,
      `import memoize from 'lodash-es/memoize.js'
import * as path from 'path'`,
      `import memoize from 'lodash-es/memoize.js'
import { existsSync } from 'fs'
import * as path from 'path'`,
      'target 2.1.116 Git Bash existsSync import',
    )
    const windowsPathsSource = fs.readFileSync(windowsPathsPath, 'utf8')
    const gitBashStart = windowsPathsSource.indexOf(
      'export const findGitBashPath = memoize',
    )
    if (gitBashStart < 0) {
      throw new Error('target 2.1.116 Git Bash owner anchor differs')
    }
    let gitBashPrefix = windowsPathsSource.slice(0, gitBashStart)
    let gitBashOwner = windowsPathsSource.slice(gitBashStart)
    gitBashOwner = gitBashOwner.replaceAll('checkPathExists(', 'existsSync(')
    const fallbackAnchor = `
  const gitPath = findExecutable('git')`
    if (!gitBashOwner.includes(fallbackAnchor)) {
      throw new Error('target 2.1.116 Git Bash lookup anchor differs')
    }
    gitBashOwner = gitBashOwner.replace(
      fallbackAnchor,
      `
  const defaultLocations = [
    'C:\\\\Program Files\\\\Git\\\\bin\\\\bash.exe',
    'C:\\\\Program Files (x86)\\\\Git\\\\bin\\\\bash.exe',
  ]
  for (const location of defaultLocations) {
    if (existsSync(location)) return location
  }

  const gitPath = findExecutable('git')`,
    )
    fs.writeFileSync(windowsPathsPath, gitBashPrefix + gitBashOwner)

    // Target 116 narrows failIfUnavailable's observable schema description:
    // enabledPlatforms remains an undocumented routing control, but no longer
    // appears among startup-failure causes in the public SDK schema text.
    replaceExactly(
      path.join(tree, 'src/entrypoints/sandboxTypes.ts'),
      '(missing dependencies, unsupported platform, or platform not in enabledPlatforms). ',
      '(missing dependencies or unsupported platform). ',
      'target 2.1.116 sandbox failIfUnavailable description',
    )

    // Target 116 treats Unicode numeric segments as word-like even when the
    // host Intl.Segmenter reports otherwise.  Select only the precompiled
    // number regex and the MeasuredText boundary decision.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/utils/Cursor.ts'],
      /NUMBER_CHAR_REGEX|segment\.isWordLike \|\| NUMBER_CHAR_REGEX/,
      'case114-cursor-numeric-word-boundaries',
    )
    replaceExactly(
      path.join(tree, 'src/utils/Cursor.ts'),
      '          isWordLike: segment.isWordLike ?? false,',
      '          isWordLike,',
      'target 2.1.116 cursor numeric boundary result',
    )

    // Target 116 keeps the async-agent stall watchdog alive on query-layer
    // progress even before a stream message is yielded, and records system
    // subtypes in the terminal stall diagnostic. Both launch and resume paths
    // forward the same callback into runAgent.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/tools/AgentTool/agentToolUtils.ts'],
      /onQueryProgress|query_progress|system:\$\{message\.subtype\}/,
      'case114-async-agent-query-progress-watchdog',
    )
    applyMatchingWorkingTreePatchDirect(
      tree,
      ['src/tools/AgentTool/AgentTool.tsx', 'src/tools/AgentTool/resumeAgent.ts'],
      /makeStream: \(onCacheSafeParams, onQueryProgress\)|onQueryProgress,/,
      'case114-async-agent-query-progress-callers',
    )

    // Target 116 migrates all four user-facing scheduled-agent connector
    // links from the legacy settings route to the canonical customization
    // route without changing the surrounding scheduling workflow.
    applyMatchingWorkingTreePatch(
      tree,
      ['src/skills/bundled/scheduleRemoteAgents.ts'],
      /claude\.ai\/customize\/connectors/,
      'case114-scheduled-agent-connector-route',
    )
    // The route selector above is generated against the target-116 base
    // owner. Replay the earlier target101 gate and target111 alias only after
    // that git-backed selector has finished, so its index remains clean.
    installScheduleSkillPrerequisites(tree)

    // Target 116 hardens the message-history file-cache extractor without
    // changing the rest of queryHelpers: malformed tool inputs are isolated,
    // Read/Write errors are ignored, empty writes remain cacheable, full Read
    // entries use offset 1, and EISDIR is treated as an inaccessible Edit.
    const queryHelpersPath = path.join(tree, 'src/utils/queryHelpers.ts')
    replaceExactly(
      queryHelpersPath,
      `  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
} from '../tools/FileReadTool/prompt.js'`,
      `  FILE_READ_TOOL_NAME,
  isFileUnchangedStub,
} from '../tools/FileReadTool/prompt.js'`,
      'target 2.1.116 file-cache unchanged-stub helper import',
    )
    replaceExactly(
      queryHelpersPath,
      "import { isFsInaccessible } from './errors.js'",
      "import { getErrnoCode, isFsInaccessible } from './errors.js'",
      'target 2.1.116 file-cache errno helper import',
    )
    const historicalQueryHelpers = fs.readFileSync(queryHelpersPath, 'utf8')
    const currentQueryHelpers = fs.readFileSync(
      path.join(repositoryRoot, 'src/utils/queryHelpers.ts'),
      'utf8',
    )
    const extractorStartMarker =
      'export function extractReadFilesFromMessages('
    const extractorEndMarker =
      '/**\n * Extract the top-level CLI tools used in BashTool calls from message history.'
    const historicalExtractorStart = historicalQueryHelpers.indexOf(
      extractorStartMarker,
    )
    const historicalExtractorEnd = historicalQueryHelpers.indexOf(
      extractorEndMarker,
      historicalExtractorStart,
    )
    const currentExtractorStart = currentQueryHelpers.indexOf(
      extractorStartMarker,
    )
    const currentExtractorEnd = currentQueryHelpers.indexOf(
      extractorEndMarker,
      currentExtractorStart,
    )
    if (
      [
        historicalExtractorStart,
        historicalExtractorEnd,
        currentExtractorStart,
        currentExtractorEnd,
      ].some(index => index < 0)
    ) {
      throw new Error('target 2.1.116 query-helper extractor anchors differ')
    }
    fs.writeFileSync(
      queryHelpersPath,
      historicalQueryHelpers.slice(0, historicalExtractorStart) +
        currentQueryHelpers.slice(currentExtractorStart, currentExtractorEnd) +
        historicalQueryHelpers.slice(historicalExtractorEnd),
    )
  }),
])
