import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const semanticSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT

const cumulativeOwnerSuccessors = new Map([
  ['src/bridge/gitSessionContext.ts', 'src/utils/gitSessionContext.ts'],
  ['src/commands/provider-setup/bedrock.tsx', 'src/commands/setup-bedrock/setup-bedrock.tsx'],
  ['src/commands/provider-setup/index.ts', 'src/components/ConsoleOAuthWizards.tsx'],
  ['src/commands/provider-setup/relaunch.ts', 'src/components/ConsoleOAuthWizards.tsx'],
  ['src/commands/provider-setup/vertex.tsx', 'src/commands/setup-vertex/setup-vertex.tsx'],
  ['src/commands/stop-hook/StopHookDialog.tsx', 'src/commands/loops/loops.tsx'],
  ['src/components/VertexSetupWizard.tsx', 'src/components/ConsoleOAuthWizards.tsx'],
  ['src/components/agents/AgentsRuntimeMenu.tsx', 'src/components/agents/AgentsMenu.tsx'],
  ['src/components/agents/RunningAgents.tsx', 'src/components/agents/AgentsMenu.tsx'],
  ['src/components/ultraplan/UltraplanChoiceDialog.tsx', 'src/components/UltraplanChoiceDialog.tsx'],
  ['src/components/ultraplan/UltraplanLaunchDialog.tsx', 'src/components/UltraplanLaunchDialog.tsx'],
  ['src/tools/MonitorTool/MonitorTool.ts', 'src/tools/MonitorTool/MonitorTool.tsx'],
  ['src/utils/imageLimits.ts', 'src/utils/imageResizer.ts'],
  ['src/utils/model/bedrockModelUpgrade.tsx', 'src/utils/model/bedrockUpgrade.ts'],
  ['src/utils/model/vertexModelUpgrade.ts', 'src/utils/model/vertexUpgrade.ts'],
  ['src/utils/wrappedContentSerializer.ts', 'src/utils/feedbackPayload.ts'],
  ['src/components/ToolProgressOverlay.tsx', 'src/components/ToolProgress.tsx'],
  ['src/components/messageRating.tsx', 'src/context/messageRating.tsx'],
  ['src/utils/loopSentinels.ts', 'src/tools/ScheduleWakeupTool/prompt.ts'],
  ['src/utils/loopWakeup.ts', 'src/utils/loopDynamic.ts'],
  ['src/commands/recap.ts', 'src/commands/recap/recap.ts'],
  ['src/components/BackgroundWorkExitDialog.tsx', 'src/components/BackgroundExitDialog.tsx'],
  ['src/components/messages/RecalledMemory.tsx', 'src/components/messages/AttachmentMessage.tsx'],
  ['src/hooks/notifs/useSkillTruncationNotification.tsx', 'src/hooks/notifs/useSkillTruncationNotification.ts'],
])
const cumulativeOwnerTombstones = new Set(['src/utils/autoModeDenials.ts'])

function source(relative) {
  const filename =
    semanticSourceRoot && relative.startsWith('src/')
      ? path.join(semanticSourceRoot, relative.slice('src/'.length))
      : path.join(repositoryRoot, relative)
  return fs.readFileSync(filename, 'utf8')
}

function caseTestOptions(...cases) {
  return {
    skip:
      semanticCase && !cases.includes(semanticCase)
        ? `not applicable to ${semanticCase}`
        : false,
  }
}

function ownerFilename(relative) {
  return semanticSourceRoot && relative.startsWith('src/')
    ? path.join(semanticSourceRoot, relative.slice('src/'.length))
    : path.join(repositoryRoot, relative)
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
}

const middleCases = [
  ['2.1.96-to-2.1.97', 4450],
  ['2.1.97-to-2.1.98', 2509],
  ['2.1.98-to-2.1.100', 80],
  ['2.1.100-to-2.1.101', 2522],
  ['2.1.101-to-2.1.104', 79],
  ['2.1.104-to-2.1.105', 5643],
  ['2.1.105-to-2.1.107', 83],
]

test('middle semantic ledgers classify every structural nonmatch and account for every cumulative source owner', () => {
  const selectedCases = semanticCase
    ? middleCases.filter(([caseName]) => caseName === semanticCase)
    : middleCases
  assert.equal(selectedCases.length > 0, true, semanticCase ?? 'middle case inventory')
  for (const [caseName, expectedRows] of selectedCases) {
    const ledger = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            repositoryRoot,
            'recovery/cases',
            caseName,
            'semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    assert.equal(ledger.rows.length, expectedRows, caseName)
    assert.equal(ledger.summary.nonmatchedUnits, expectedRows, caseName)
    assert.equal(ledger.summary.sourceRuntimeGaps, 0, caseName)
    assert.equal(
      ledger.rows.some(row => row.disposition === 'source-runtime-gap'),
      false,
      caseName,
    )
    for (const owner of ledger.owners) {
      if (
        semanticSourceRoot &&
        owner.transitiveFromCase
      ) {
        assert.match(owner.transitiveFromCase, /^\d+\.\d+\.\d+-to-\d+\.\d+\.\d+$/)
        assert.equal(
          fs.statSync(path.join(repositoryRoot, owner.path)).isFile(),
          true,
          `${caseName}: transitive current owner ${owner.path}`,
        )
        continue
      }
      if (!semanticSourceRoot && cumulativeOwnerTombstones.has(owner.path)) {
        assert.equal(fs.existsSync(ownerFilename(owner.path)), false, owner.path)
        continue
      }
      const currentOwner = semanticSourceRoot
        ? owner.path
        : (cumulativeOwnerSuccessors.get(owner.path) ?? owner.path)
      assert.equal(
        fs.statSync(ownerFilename(currentOwner)).isFile(),
        true,
        `${caseName}: ${owner.path} -> ${currentOwner}`,
      )
    }
  }
})

const exactTargetCases = [
  ['2.1.96-to-2.1.97', 'CLAUDE_CODE_2_1_97_BUNDLE', '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'],
  ['2.1.97-to-2.1.98', 'CLAUDE_CODE_2_1_98_BUNDLE', '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556'],
  ['2.1.98-to-2.1.100', 'CLAUDE_CODE_2_1_100_BUNDLE', 'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be'],
  ['2.1.100-to-2.1.101', 'CLAUDE_CODE_2_1_101_BUNDLE', 'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb'],
  ['2.1.101-to-2.1.104', 'CLAUDE_CODE_2_1_104_BUNDLE', 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39'],
  ['2.1.104-to-2.1.105', 'CLAUDE_CODE_2_1_105_BUNDLE', '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75'],
  ['2.1.105-to-2.1.107', 'CLAUDE_CODE_2_1_107_BUNDLE', '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844'],
]

for (const [caseName, environment, expectedBundleHash] of exactTargetCases) {
  const bundleFilename = process.env[environment]
  test(
    `${caseName} authenticates every source-covered target structural owner`,
    {
      skip:
        semanticCase && semanticCase !== caseName
          ? `not applicable to ${semanticCase}`
          : bundleFilename
            ? false
            : `${environment} not provided`,
    },
    () => {
      const bytes = fs.readFileSync(bundleFilename)
      assert.equal(
        crypto.createHash('sha256').update(bytes).digest('hex'),
        expectedBundleHash,
      )
      const target = bytes.toString('utf8')
      const caseDirectory = path.join(repositoryRoot, 'recovery/cases', caseName)
      const ledger = JSON.parse(
        gunzipSync(
          fs.readFileSync(path.join(caseDirectory, 'semantic/source-coverage.json.gz')),
        ),
      )
      const structural = JSON.parse(
        gunzipSync(
          fs.readFileSync(path.join(caseDirectory, 'structural/generated-delta.json.gz')),
        ),
      )
      for (const row of ledger.rows) {
        if (row.disposition !== 'source-runtime-covered') continue
        const region = structural.regions[row.targetIndex]
        assert.deepEqual(
          [region.target.start, region.target.end, region.target.sourceHash],
          [row.start, row.end, row.sourceHash],
          `${caseName}: target unit ${row.targetIndex}`,
        )
        const targetOwner = target.slice(row.start, row.end)
        assert.equal(
          crypto.createHash('sha256').update(targetOwner).digest('hex'),
          row.sourceHash,
          `${caseName}: target unit ${row.targetIndex}`,
        )
      }
    },
  )
}

test('2.1.97 source owns the expanded Claude API managed-agent routing guide', caseTestOptions('2.1.96-to-2.1.97'), () => {
  assertFragments('src/skills/bundled/claudeApi.ts', [
    '**Managed Agents (server-managed stateful agents):**',
    'shared/managed-agents-overview.md',
    '{lang}/managed-agents/README.md',
    'curl/managed-agents.md',
  ])
  assertFragments('src/utils/envUtils.ts', [
    "['claude-opus-4-6', 'VERTEX_REGION_CLAUDE_4_6_OPUS']",
  ])
  assertFragments('src/utils/model/modelSupportOverrides.ts', [
    "modelEnvVar: 'ANTHROPIC_CUSTOM_MODEL_OPTION'",
    "capabilitiesEnvVar: 'ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES'",
  ])
  assertFragments('src/utils/managedEnvConstants.ts', [
    "'ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES'",
    "'VERTEX_REGION_CLAUDE_4_6_OPUS'",
  ])
  if (semanticSourceRoot && semanticCase === '2.1.96-to-2.1.97') {
    assertFragments('src/utils/authPortable.ts', [
      'result.stderr',
      'Failed to delete keychain entry: ${result.stderr}',
    ])
  } else {
    assertFragments('src/utils/authPortable.ts', [
      'result.exitCode !== 0',
      "throw new Error('Failed to delete keychain entry')",
    ])
  }
  assertFragments('src/utils/markdownConfigLoader.ts', ["'routines'"])
  assertFragments('src/utils/config.ts', [
    'briefTranscript?: boolean',
    'briefTranscript: false',
    "'briefTranscript'",
  ])
  assertFragments('src/utils/settings/types.ts', [
    semanticCase === '2.1.96-to-2.1.97'
      ? 'Default transcript view mode on startup'
      : 'Default transcript view: chat (SendUserMessage checkpoints only) or transcript (full)',
  ])
  if (!semanticSourceRoot) {
    assertFragments('src/utils/effort.ts', [
      'export function resolveAppliedEffort(',
      'export function modelSupportsMaxEffort(',
      "return 'Maximum capability with deepest reasoning'",
    ])
    assertFragments('src/tools/AgentTool/runAgent.ts', [
      'const agentGetEffortValue =',
      'agentDefinition.effort !== undefined',
      'getEffortValue: agentGetEffortValue',
    ])
  } else if (semanticCase === '2.1.96-to-2.1.97') {
    assertFragments('src/utils/effort.ts', [
      'export function clampEffortValue(',
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_pyrite_wren', false)",
      'EFFORT_LEVELS.indexOf(normalized) > EFFORT_LEVELS.indexOf(maximum)',
      "return 'Maximum capability with deepest reasoning'",
    ])
    assertFragments('src/tools/AgentTool/runAgent.ts', [
      "clampEffortValue(state.effortValue, 'medium')",
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_flint_heron', false)",
      'Do not emit text between tool calls. Inter-tool narration is never shown to the user',
    ])
  } else {
    assertFragments('src/utils/effort.ts', [
      'export function resolveAppliedEffort(',
      'export function modelSupportsMaxEffort(',
      "return 'Maximum capability with deepest reasoning'",
    ])
    assertFragments('src/tools/AgentTool/runAgent.ts', [
      'const effortValue =',
      'agentDefinition.effort !== undefined',
      'effortValue,',
    ])
  }
  assertFragments('src/utils/permissions/shellRuleMatching.ts', [
    'normalizeWhitespace = false',
    "trimmedPattern.replace(/[ \\t]+/g, ' ')",
    "command.replace(/[ \\t]+/g, ' ')",
    'regex.test(commandToMatch)',
  ])
  assertFragments('src/tools/BashTool/pathValidation.ts', [
    'function filterOutFlagsWithArguments(',
    "'--output-delimiter'",
    "new Set(['-d', '--delimiters'])",
    "dangerousRedirectionReason === 'network_device'",
    'Redirect involving /dev/tcp or /dev/udp opens a network connection',
    "/^\\/dev\\/(tcp|udp)\\//.test(r.target)",
  ])
  assertFragments('src/utils/bash/commands.ts', [
    "dangerousRedirectionReason?: 'network_device' | 'shell_expansion'",
    "/^\\/dev\\/(tcp|udp)\\//.test(target)",
    "dangerousRedirectionReason = 'network_device'",
    "dangerousRedirectionReason = 'shell_expansion'",
  ])
  assertFragments(
    semanticSourceRoot
      ? 'src/tools/BashTool/readOnlyValidation.ts'
      : 'src/tools/BashTool/pathValidation.ts', [
    '/^\\/dev\\/(tcp|udp)\\//',
    ],
  )
  assertFragments('src/tools/shared/gitOperationTracking.ts', [
    'const GH_PR_CHECKOUT_RE =',
    '/\\bgh\\s+pr\\s+checkout\\b[^&|;]*\\s(\\d+)(?=\\s|$|[&|;])/',
    "const args = ['pr', 'view', ...(prNumber ? [prNumber] : []), '--json', 'url']",
    'void linkCurrentSessionToPr(checkoutMatch[1]).catch(() => {})',
    'void linkCurrentSessionToPr().catch(() => {})',
  ])
})

test('2.1.98 source owners preserve subprocess, monitor, Vertex, and dynamic-prompt runtime behavior', caseTestOptions('2.1.97-to-2.1.98'), () => {
  assertFragments('src/utils/subprocessEnv.ts', [
    'CLAUDE_CODE_ENTRYPOINT',
    'subprocessEnv',
  ])
  assertFragments('src/tools/BashTool/shouldUseSandbox.ts', [
    'isScrubEnabled',
    'isScrubSandboxAvailable',
  ])
  if (semanticSourceRoot) {
    assertFragments('src/tools/MonitorTool/MonitorTool.ts', [
      'FLOOD_DURATION_MS',
      'TOKEN_REFILL_MS',
      'emitTaskTerminatedSdk',
      'killTask(',
    ])
  } else {
    assertFragments('src/tools/MonitorTool/MonitorTool.tsx', [
      'TOKEN_REFILL_INTERVAL_MS',
      'killTask(',
    ])
    assertFragments('src/tools/MonitorTool/stream.ts', [
      'TOKEN_REFILL_INTERVAL_MS',
    ])
    assertFragments('src/tasks/LocalShellTask/killShellTasks.ts', [
      'emitTaskTerminatedSdk',
      'killTask(',
    ])
  }
  assertFragments(
    'src/components/permissions/MonitorPermissionRequest/MonitorPermissionRequest.tsx',
    ['shouldShowAlwaysAllowOptions', 'suggestions.length > 0'],
  )
  assertFragments('src/tools/MonitorTool/prompt.ts', [
    'Each stdout line is an event',
    'grep --line-buffered',
    'automatically stopped',
    'persistent: true',
  ])
  assertFragments(
    semanticSourceRoot
      ? 'src/components/VertexSetupWizard.tsx'
      : 'src/components/ConsoleOAuthWizards.tsx',
    semanticSourceRoot
      ? [
          'verifyVertexSetup',
          'probeVertexModel',
          'getVertexModelCandidates',
          'buildVertexEnvironment',
          'Calling Google Cloud',
        ]
      : [
          'verifyVertex',
          'probeVertexModel',
          'buildVertexEnvironment',
          'Calling Google Cloud',
        ],
  )
  assertFragments('src/constants/prompts.ts', [
    'excludeDynamicSections',
    'getExcludedDynamicSectionsContent',
    semanticSourceRoot
      ? "systemPromptSection('anti_verbosity'"
      : 'systemPromptSection(`anti_verbosity',
  ])
  assertFragments('src/QueryEngine.ts', ['excludeDynamicSections'])
  assertFragments('src/cli/print.ts', [
    'excludeDynamicSections',
  ])
  assertFragments('src/main.tsx', ['excludeDynamicSystemPromptSections'])
})

test('2.1.100 prompt owners preserve the gated concise communication style', caseTestOptions('2.1.98-to-2.1.100'), () => {
  assertFragments('src/constants/prompts.ts', [
    ...(semanticSourceRoot
      ? [
          "getCanonicalName(model).includes('opus-4-6')",
          "clientDataCache?.quiet_salted_ember === 'true'",
        ]
      : [
          'function getAntiVerbositySection(model: string)',
          'systemPromptSection(`anti_verbosity',
        ]),
    "End-of-turn summary: one or two sentences. What changed and what's next. Nothing else.",
    'respond in 2-3 sentences with a recommendation and the main tradeoff',
    'Length limits: keep text between tool calls to \\u226425 words',
  ])
})

test('2.1.101 prompt owners add the UI verification honesty rule', caseTestOptions('2.1.100-to-2.1.101'), () => {
  assertFragments('src/constants/prompts.ts', [
    "if you can't test the UI, say so explicitly rather than claiming success",
  ])
})

test('2.1.104 prompt owners add the published text-output contract', caseTestOptions('2.1.101-to-2.1.104'), () => {
  assertFragments('src/constants/prompts.ts', [
    '# Text output (does not apply to tool calls)',
  ])
})

test('2.1.101 source owners preserve unavailable-tool, brief, and settings notification semantics', caseTestOptions('2.1.100-to-2.1.101'), () => {
  assertFragments('src/services/tools/toolExecution.ts', [
    'getUnavailableToolHint',
    'is not available inside subagents',
    'Complete the task with the tools provided and return findings to the orchestrator',
  ])
  assertFragments('src/services/tools/StreamingToolExecutor.ts', [
    ...(semanticSourceRoot ? ['getUnavailableToolHint', 'unavailableHint'] : []),
  ])
  assertFragments(
    'src/query/stopHooks.ts',
    semanticSourceRoot
      ? [
          'briefEnforcementMessage',
          'BRIEF_ENFORCE_SENTINEL',
          "command: 'brief-mode-enforce'",
        ]
      : [
          'briefEnforcementError',
          'BRIEF_ENFORCE_SENTINEL',
          'getBriefEnforceText()',
        ],
  )
  assertFragments('src/utils/settings/settings.ts', [
    'settingsChanged.emit(source)',
    'resetSettingsCache()',
  ])
  assertFragments('src/utils/settings/changeDetector.ts', [
    "from './settingsSignal.js'",
    'settingsChanged.emit(source)',
  ])
})

test('2.1.105 MCP large-output owner and caller preserve format-aware recovery behavior', caseTestOptions('2.1.104-to-2.1.105'), () => {
  assertFragments('src/utils/mcpOutputStorage.ts', [
    "override !== 'legacy'",
    'lineStats.count > 1',
    semanticSourceRoot
      ? 'lineStats.maxLen <= readCharacterBudget'
      : 'lineStats.maxLen <= safeReadChars',
    "jq 'type, length, keys?'",
    "the file's lines are too long for Read's offset/limit",
    semanticSourceRoot
      ? 'Math.floor(readCharacterBudget / (lineStats.maxLen + lineOverhead))'
      : 'Math.floor(safeReadChars / (lineStats.maxLen + 8))',
    'Give it the instruction above verbatim',
  ])
  assertFragments('src/services/mcp/client.ts', [
    semanticSourceRoot ? 'singlePlainTextBlock' : 'const singlePlainText =',
    semanticSourceRoot
      ? "!('annotations' in content[0])"
      : "!('annotations' in persistedContent[0])",
    semanticSourceRoot
      ? "!('_meta' in content[0])"
      : "!('_meta' in persistedContent[0])",
    'persistedAs',
    'blockCount',
    'lineStats = { count: lines.length, maxLen }',
  ])
})

const bundleCases = [
  {
    version: '2.1.97',
    environment: 'CLAUDE_CODE_2_1_97_BUNDLE',
    sha256: '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
    fragments: [
      'Redirect involving /dev/tcp or /dev/udp opens a network connection',
      'network_device',
      '--output-delimiter',
      'gh\\s+pr\\s+checkout',
      'tengu_pyrite_wren',
      'Do not emit text between tool calls. Inter-tool narration is never shown to the user',
    ],
  },
  {
    version: '2.1.98',
    environment: 'CLAUDE_CODE_2_1_98_BUNDLE',
    sha256: '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
    fragments: [
      'streams events from a long-running script',
      'Set up Google Vertex AI',
      'Move per-machine sections',
    ],
  },
  {
    version: '2.1.100',
    environment: 'CLAUDE_CODE_2_1_100_BUNDLE',
    sha256: 'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
    fragments: ['Length limits: keep text between tool calls to ≤25 words'],
  },
  {
    version: '2.1.101',
    environment: 'CLAUDE_CODE_2_1_101_BUNDLE',
    sha256: 'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
    fragments: [
      'is not available inside subagents',
      "if you can't test the UI, say so explicitly rather than claiming success",
      'brief-mode-enforce',
    ],
  },
  {
    version: '2.1.104',
    environment: 'CLAUDE_CODE_2_1_104_BUNDLE',
    sha256: 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    fragments: ['# Text output (does not apply to tool calls)'],
  },
  {
    version: '2.1.105',
    environment: 'CLAUDE_CODE_2_1_105_BUNDLE',
    sha256: '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    fragments: [
      "the file's lines are too long for Read's offset/limit",
      'Give it the instruction above verbatim',
      'persistedAs',
    ],
  },
]

for (const bundleCase of bundleCases) {
  const filename = process.env[bundleCase.environment]
  test(
    `${bundleCase.version} authenticated target contains the pinned semantic fragments`,
    { skip: filename ? false : `${bundleCase.environment} not provided` },
    () => {
      const bytes = fs.readFileSync(filename)
      assert.equal(
        crypto.createHash('sha256').update(bytes).digest('hex'),
        bundleCase.sha256,
      )
      const bundle = bytes.toString('utf8')
      for (const fragment of bundleCase.fragments) {
        assert.ok(bundle.includes(fragment), `${bundleCase.version}: ${fragment}`)
      }
    },
  )
}
