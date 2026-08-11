import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_234_618
const BASELINE_SHA256 =
  '84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa'
const TARGET_BYTES = 13_720_987
const TARGET_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const repo = fileURLToPath(new URL('../..', import.meta.url))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, environmentName + ' must be set')
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, environmentName + ': byte length')
  assert.equal(sha256(bytes), expectedSha256, environmentName + ': SHA-256')
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(sourcePath, fragments) {
  const contents = compact(fs.readFileSync(path.join(repo, sourcePath), 'utf8'))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      sourcePath + ': ' + fragment,
    )
  }
}

const BUNDLE_FRAGMENTS = [
  ['monitor schema', 'Monitor names must be unique within a plugin', 1, 1],
  [
    'component containment',
    'Paths in plugin.json must not use ".." to reference files outside the plugin directory',
    1,
    1,
  ],
  [
    'NPM traversal rejection',
    'Package reference cannot contain ".." path segments',
    1,
    1,
  ],
  [
    'managed hook exception',
    'Skipping plugin hooks - allowManagedHooksOnly is enabled and no managed plugins',
    2,
    2,
  ],
  [
    'managed registry reconciliation',
    'Dropped orphaned managed entry for ',
    1,
    1,
  ],
  [
    'marketplace rollback',
    'Failed to clean up stale marketplace backup directory.',
    1,
    1,
  ],
  ['refresh cooldown', 'Skipping refresh for marketplace', 1, 1],
  [
    'project-only discover state',
    'All available plugins are installed for this project.',
    1,
    1,
  ],
  ['plugin traversal UI', 'Path escapes plugin directory:', 1, 1],
  [
    'insights handoff',
    'Output the text between <message> tags verbatim as your entire response. Do not omit any line:',
    1,
    1,
  ],
  [
    'Bash cwd guidance',
    'never prepend `cd <current-directory>` to a `git` command',
    1,
    1,
  ],
  [
    'Read no-reread stub',
    'Wasted call \\u2014 file unchanged since your last Read.',
    1,
    1,
  ],
  [
    'Agent cost steering',
    '**Do not spawn agents unless the user asks.**',
    1,
    1,
  ],
  [
    'core exploratory guidance',
    'For exploratory questions ("what could we do about X?", "how should we approach this?", "what do you think?"), respond in 2-3 sentences',
    1,
    1,
  ],
  [
    'Bash rerun schema',
    "Rerun a prior command exactly by passing the alias from a previous result's [rerun: bN] footer",
    1,
    1,
  ],
  ['Bash rerun telemetry', 'tengu_bash_rerun_used', 2, 2],
  ['sandbox override prompt', 'Run outside of the sandbox', 2, 2],
  [
    'Agent result verification',
    "Trust but verify: an agent's summary describes what it intended to do, not necessarily what it did.",
    1,
    1,
  ],
]

const READ_NO_REREAD_SEMANTIC_EVIDENCE = [
  [
    [
      'Wasted call \\u2014 file unchanged since your last Read.',
      1,
      1,
      '6597f3047125b433ba1b46addd27e505e60bee8bc7be34621b622b4de1b42c3a',
    ],
    [
      'tengu_noreread_q7m_velvet',
      1,
      1,
      '3da4f2d56dc64a422a9617579a0743749766417942e927b4e0325e438bed7e9b',
    ],
  ],
  [
    [
      'src/tools/FileReadTool/prompt.ts',
      'Wasted call — file unchanged since your last Read.',
      1,
      '6bdf398fad121905b0c7b3bcaf7a4746684bf4cc717d2cf4039041f82d4ff6b4',
    ],
    [
      'src/tools/FileReadTool/prompt.ts',
      'tengu_noreread_q7m_velvet',
      1,
      '3da4f2d56dc64a422a9617579a0743749766417942e927b4e0325e438bed7e9b',
    ],
  ],
]

test('official plugin and prompt witnesses come from authenticated bundles', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_118_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )
  for (const [name, fragment, baselineCount, targetCount] of BUNDLE_FRAGMENTS) {
    assert.equal(
      occurrences(baseline, fragment),
      baselineCount,
      name + ': baseline count',
    )
    assert.equal(
      occurrences(target, fragment),
      targetCount,
      name + ': target count',
    )
  }
})

test('Read no-reread witnesses bind the exact bundle and source bytes', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_118_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )
  const [targetEvidence, sourceEvidence] = READ_NO_REREAD_SEMANTIC_EVIDENCE
  for (const [fragment, baselineCount, targetCount, fragmentSha256] of
    targetEvidence) {
    assert.equal(sha256(fragment), fragmentSha256, fragment)
    assert.equal(occurrences(baseline, fragment), baselineCount, fragment)
    assert.equal(occurrences(target, fragment), targetCount, fragment)
  }
  for (const [sourcePath, fragment, count, fragmentSha256] of sourceEvidence) {
    assert.equal(sha256(fragment), fragmentSha256, sourcePath + ': ' + fragment)
    const source = fs.readFileSync(path.join(repo, sourcePath), 'utf8')
    assert.equal(occurrences(source, fragment), count, sourcePath + ': ' + fragment)
  }
})

test('recovers plugin monitors, path hardening, and managed hooks', () => {
  assertSourceFragments('src/utils/plugins/schemas.ts', [
    'PluginMonitorSchema',
    'Monitor names must be unique within a plugin',
    'Package reference cannot contain ".." path segments',
  ])
  assertSourceFragments('src/utils/plugins/pluginLoader.ts', [
    'resolvePluginComponentPath',
    "type: 'path-traversal'",
    'loadPluginMonitors',
    'hasPluginCacheContents',
  ])
  assertSourceFragments('src/hooks/usePluginMonitors.ts', [
    'createLineBatcher',
    'createTokenBucket',
    "monitor => monitor.when === 'always'",
    'monitor.when === `on-skill-invoke:${skillName}`',
    'shouldUseSandbox: false',
  ])
  assertSourceFragments('src/utils/suggestions/skillUsageTracking.ts', [
    'skillInvoked.emit(skillName)',
  ])
  assertSourceFragments('src/utils/sessionStart.ts', [
    'shouldAllowManagedHooksOnly() && getManagedPluginNames() === null',
  ])
})

test('recovers registry, atomic promotion, refresh, and plugin UI semantics', () => {
  assertSourceFragments('src/utils/plugins/installedPluginsManager.ts', [
    'Dropped orphaned managed entry for ${pluginId}',
    "installation.scope !== 'managed'",
    'Collapsed ${pluginId} to single managed entry',
  ])
  assertSourceFragments('src/utils/plugins/marketplaceManager.ts', [
    'const marketplaceRefreshes = new Map',
    'const backupPath = `${cachePath}.bak`',
    'await fs.rename(cachePath, backupPath)',
    'await fs.rename(backupPath, cachePath)',
    'options?.skipIfRecent && entry.lastUpdated',
    'elapsed < 30_000',
  ])
  assertSourceFragments('src/utils/plugins/officialMarketplaceGcs.ts', [
    'const backup = `${installLocation}.backup`',
    'await rename(installLocation, backup)',
    'await rename(staging, installLocation)',
    'await rename(backup, installLocation)',
  ])
  assertSourceFragments('src/services/plugins/pluginOperations.ts', [
    'skipIfRecent: true',
    'version shown may be stale',
  ])
  assertSourceFragments('src/commands/plugin/DiscoverPlugins.tsx', [
    "reason = 'all-plugins-project-installed'",
    'All available plugins are installed for this project.',
    'Use the Browse tab to install at user scope.',
  ])
  assertSourceFragments('src/commands/plugin/PluginErrors.tsx', [
    "case 'path-traversal'",
    'Paths in plugin.json must not use ".." to reference files outside the plugin directory',
  ])
})

test('recovers insights, Bash, Read, Agent, and core prompt semantics', () => {
  assertSourceFragments('src/commands/insights.ts', [
    'At-a-glance summary (for your context only — the user has not seen any output yet):',
    'Output the text between <message> tags verbatim as your entire response. Do not omit any line:',
  ])
  assertSourceFragments('src/tools/BashTool/prompt.ts', [
    "'tengu_relay_chain_v1'",
    'never prepend `cd <current-directory>` to a `git` command',
    "emit {rerun:'bN'} from the result footer",
  ])
  assertSourceFragments('src/tools/FileReadTool/prompt.ts', [
    "'tengu_noreread_q7m_velvet'",
    'Wasted call — file unchanged since your last Read.',
    'file state is current in your context — no need to Read it back',
    'isFileUnchangedStub',
  ])
  assertSourceFragments('src/tools/FileEditTool/FileEditTool.ts', [
    'isNoRereadEnabled() && !userModified',
  ])
  assertSourceFragments('src/tools/FileWriteTool/FileWriteTool.ts', [
    'isNoRereadEnabled() && !userModified',
  ])
  assertSourceFragments('src/utils/queryHelpers.ts', [
    '!isFileUnchangedStub(content.content)',
  ])
  assertSourceFragments('src/services/compact/compact.ts', [
    'isFileUnchangedStub(block.content)',
  ])
  assertSourceFragments('src/tools/AgentTool/prompt.ts', [
    "'tengu_willow_prism'",
    '**Do not spawn agents unless the user asks.**',
    '## When not to use',
    'Trust but verify:',
    'A new ${AGENT_TOOL_NAME} call',
  ])
  assertSourceFragments('src/utils/attachments.ts', [
    "getSubscriptionType() !== 'pro' && !shouldSteerAgentCost()",
  ])
  assertSourceFragments('src/constants/prompts.ts', [
    'For UI or frontend changes, start the dev server and use the feature in a browser',
    'For exploratory questions',
    "'tengu_verified_vs_assumed'",
    'When reporting results, be accurate about what you verified vs. what you assumed.',
  ])
})

test('recovers full Bash rerun and authenticated dependency behavior', () => {
  assertSourceFragments('src/tools/BashTool/rerun.ts', [
    "'tengu_velvet_anchor'",
    'return { map: new Map(), nextId: 1 }',
    "const alias = `b${aliases.nextId++}`",
    'Unknown rerun alias',
    'return `[rerun: ${alias}]`',
  ])
  assertSourceFragments('src/tools/BashTool/BashTool.tsx', [
    "rerun: z.string().optional().describe",
    'BLOCKED_SLEEP_THRESHOLD_SECONDS = 25',
    '/^sleep\\s+(\\d+(?:\\.\\d*)?)\\s*$/',
    'cmd === `xargs ${prefix}`',
    'matchWildcardPattern(`xargs ${pattern}`, cmd)',
    "reason: 'dangerouslyDisableSandbox'",
    "message: 'Run outside of the sandbox'",
  ])
  assertSourceFragments('src/services/tools/toolExecution.ts', [
    "'rerun' and 'command' are mutually exclusive",
    "logEvent('tengu_bash_rerun_used'",
    "commandBytes: Buffer.byteLength(resolved.command, 'utf8')",
    'registerBashRerunAlias',
    'mappedToolResultBlock.content',
    '`${formattedError}\\n${formatBashRerunFooter(bashRerunAlias)}`',
  ])
  assertSourceFragments('src/QueryEngine.ts', [
    'private bashRerunAliases = createBashRerunAliases()',
    'bashRerunAliases: this.bashRerunAliases',
  ])
  assertSourceFragments('src/screens/REPL.tsx', [
    'const bashRerunAliasesRef = useRef(createBashRerunAliases())',
    'bashRerunAliases: bashRerunAliasesRef.current',
  ])
  assertSourceFragments('src/utils/forkedAgent.ts', [
    'bashRerunAliases: createBashRerunAliases()',
  ])
})
