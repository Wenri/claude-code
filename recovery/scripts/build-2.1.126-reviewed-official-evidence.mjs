#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const priorCatalogPath = path.join(
  repo,
  'recovery/cases/2.1.123-to-2.1.124/semantic/direct-evidence.json',
)
const changelogPath = path.join(
  repo,
  'recovery/cases/2.1.124-to-2.1.126/evidence/CHANGELOG-2.1.126.md',
)
const outputPath = path.join(
  repo,
  'recovery/2.1.126-reviewed-official-evidence.json',
)

const reviews = new Map([
  [1, {
    inheritedRowIds: ['gateway-doctor-plugins'],
    selectors: [
      ['gateway-doctor-plugins', 'src/utils/model/gatewayModelDiscovery.ts', '/v1/models?limit=1000'],
      ['gateway-doctor-plugins', 'src/utils/model/modelOptions.ts', 'getGatewayModelOptions'],
    ],
    rationale:
      'The sealed gateway discovery row retains both the authenticated model-list sentinel and the source path that adds discovered models to the picker.',
  }],
  [2, {
    inheritedRowIds: [
      'cli-project-warning-helper',
      'project-purge',
      'project-purge-directory-enumeration',
    ],
    selectors: [
      ['cli-project-warning-helper', 'src/cli/exit.ts', 'cliWarn'],
      ['project-purge', 'src/cli/handlers/project.tsx', 'purgeProjectHandler'],
      ['project-purge-directory-enumeration', 'src/utils/sessionStoragePortable.ts', 'findProjectDirs'],
    ],
    rationale:
      'The sealed purge command, directory enumeration, and warning-helper rows retain the command surface and its reviewed deletion-support source.',
  }],
  [3, {
    inheritedRowIds: ['tool-execution-classifier'],
    selectors: [
      ['tool-execution-classifier', 'src/utils/permissions/permissions.ts', 'Dangerous rmdir operation'],
    ],
    rationale:
      'The sealed permission row retains the bypass safety-net witness that continues to require approval for catastrophic recursive directory removal.',
  }],
  [4, {
    inheritedRowIds: ['oauth-mcp-auth'],
    selectors: [
      ['oauth-mcp-auth', 'src/cli/handlers/auth.ts', 'Paste code here if prompted'],
    ],
    rationale:
      'The sealed OAuth row retains the terminal paste fallback used when the localhost browser callback cannot complete.',
  }],
  [5, {
    inheritedRowIds: ['brief-skill-telemetry'],
    selectors: [
      ['brief-skill-telemetry', 'src/tools/SkillTool/SkillTool.ts', 'recordSkillActivated'],
    ],
    rationale:
      'The sealed skill telemetry row retains the invocation-trigger bundle sentinel and the reviewed activation-recording callsite.',
  }],
  [6, {
    inheritedRowIds: ['tool-execution-classifier'],
    selectors: [
      ['tool-execution-classifier', 'src/services/tools/toolExecution.ts', 'setInProgressToolUseIDs'],
    ],
    rationale:
      'The sealed tool-execution row retains the post-permission in-progress transition that keeps a stalled permission check out of the running-tool state.',
  }],
  [7, {
    inheritedRowIds: ['settings-runtime'],
    selectors: [
      ['settings-runtime', 'src/utils/auth.ts', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST'],
    ],
    rationale:
      'The sealed settings/runtime row retains the host-managed provider branch used to preserve deployment-controlled analytics behavior.',
  }],
  [8, {
    inheritedRowIds: ['terminal-bash-scroll'],
    selectors: [
      ['terminal-bash-scroll', 'src/utils/shell/powershellDetection.ts', '.dotnet'],
    ],
    rationale:
      'The sealed Windows terminal row retains the reviewed PowerShell probing path for installations outside the ordinary PATH search.',
  }],
  [9, {
    inheritedRowIds: ['commands-ui'],
    selectors: [
      ['commands-ui', 'src/constants/prompts.ts', 'Shell: PowerShell'],
    ],
    rationale:
      'The sealed command/UI row retains the system prompt that identifies PowerShell as the primary Windows shell while keeping Bash available.',
  }],
  [11, {
    inheritedRowIds: ['settings-runtime'],
    selectors: [
      ['settings-runtime', 'src/utils/sandbox/sandbox-adapter.ts', 'const allowManagedDomainsOnly'],
      ['settings-runtime', 'src/utils/sandbox/sandbox-adapter.ts', 'policySettings.sandbox?.filesystem?.allowRead'],
    ],
    rationale:
      'The sealed settings/runtime row retains both managed-domain and managed-read-path aggregation across every policy tier.',
  }],
  [12, {
    inheritedRowIds: ['image-read-retry'],
    selectors: [
      ['image-read-retry', 'src/services/api/claude.ts', 'Removed oversized image at messages.'],
      ['image-read-retry', 'src/utils/imageResizer.ts', 'getImageDimensionsFromBuffer'],
    ],
    rationale:
      'The sealed image/retry row retains dimension-aware resizing and the targeted retry removal of an oversized historical image.',
  }],
  [13, {
    inheritedRowIds: ['oauth-mcp-auth'],
    selectors: [
      ['oauth-mcp-auth', 'src/services/api/errors.ts', 'organization has disabled Claude subscription access'],
    ],
    rationale:
      'The sealed OAuth row retains the organization-policy error classification and its administrator guidance instead of routing to login.',
  }],
  [14, {
    inheritedRowIds: ['oauth-mcp-auth'],
    selectors: [
      ['oauth-mcp-auth', 'src/services/oauth/auth-code-listener.ts', '127.0.0.1'],
      ['oauth-mcp-auth', 'src/services/oauth/client.ts', 'timeout: 30000'],
    ],
    rationale:
      'The sealed OAuth row retains the explicit loopback listener and extended client timeout used by slow, proxied, and callback-limited environments.',
  }],
  [15, {
    inheritedRowIds: ['settings-runtime'],
    selectors: [
      ['settings-runtime', 'src/utils/auth.ts', 'refreshTokenUsed = lockedTokens.refreshToken'],
    ],
    rationale:
      'The sealed settings/runtime row retains the locked refresh-token identity used to avoid clearing a concurrently replaced valid credential.',
  }],
  [16, {
    inheritedRowIds: ['tool-execution-classifier'],
    selectors: [
      ['tool-execution-classifier', 'src/components/messages/SystemAPIErrorMessage.tsx', 'retryDeadline - Date.now()'],
    ],
    rationale:
      'The sealed tool/runtime row retains deadline-based retry countdown calculation, preventing a stale zero-second display between attempts.',
  }],
  [19, {
    inheritedRowIds: ['compact-messages'],
    selectors: [
      ['compact-messages', 'src/components/Messages.tsx', '!turnsWithReplacementText.has'],
    ],
    rationale:
      'The sealed message-rendering row retains the per-turn replacement-text guard that prevents later assistant text from being hidden.',
  }],
  [20, {
    inheritedRowIds: ['terminal-bash-scroll'],
    selectors: [
      ['terminal-bash-scroll', 'src/ink/scroll-config.ts', 'version >= 1_092_000'],
    ],
    rationale:
      'The sealed terminal row retains the affected Cursor and VS Code wheel-flood version window and its corrected scroll configuration.',
  }],
  [21, {
    inheritedRowIds: ['oauth-mcp-auth'],
    selectors: [
      ['oauth-mcp-auth', 'src/services/mcp/config.ts', 'hasExpiredMcpAccessTokenWithoutRefresh(name'],
    ],
    rationale:
      'The sealed MCP/OAuth row retains the credential-state distinction used to avoid suppressing valid managed connectors behind stale manual servers.',
  }],
  [22, {
    inheritedRowIds: ['commands-ui'],
    selectors: [
      ['commands-ui', 'src/cli/bg.ts', '\\x1B[0m'],
    ],
    rationale:
      'The sealed command/UI row retains the terminal-state reset added when leaving the attached no-flicker terminal surface on Windows.',
  }],
  [24, {
    inheritedRowIds: ['tool-execution-classifier'],
    selectors: [
      ['tool-execution-classifier', 'src/tools/AgentTool/runAgent.ts', "callSite: 'attachments_subagent'"],
    ],
    rationale:
      'The sealed tool-execution row retains first-turn deferred-tool attachment propagation for forked skills and subagents.',
  }],
  [25, {
    inheritedRowIds: ['tool-execution-classifier'],
    selectors: [
      ['tool-execution-classifier', 'src/tools/EnterPlanModeTool/EnterPlanModeTool.ts', 'getAllowedChannels().length > 0'],
    ],
    rationale:
      'The sealed tool-execution row retains the interactive-session guard that no longer removes plan-mode tools merely because channels are configured.',
  }],
  [26, {
    inheritedRowIds: ['sdk-print-share'],
    selectors: [
      ['sdk-print-share', 'src/QueryEngine.ts', 'origin: options?.origin'],
    ],
    rationale:
      'The sealed SDK row retains origin propagation on every terminal result, preserving remote transcript routing when messaging tools are absent.',
  }],
  [27, {
    inheritedRowIds: ['gateway-doctor-plugins'],
    selectors: [
      ['gateway-doctor-plugins', 'src/commands/plugin/ManagePlugins.tsx', "operation !== 'uninstall'"],
    ],
    rationale:
      'The sealed plugin row retains the operation guard that prevents a successful uninstall from being reported through the enabled path.',
  }],
  [28, {
    inheritedRowIds: ['image-read-retry'],
    selectors: [
      ['image-read-retry', 'src/utils/attachments.ts', 'MAX_EDITED_TEXT_FILE_SNIPPET_BUDGET'],
    ],
    rationale:
      'The sealed attachment row retains the aggregate edited-file snippet budget that bounds linter-generated file-modified reminders.',
  }],
  [29, {
    inheritedRowIds: ['commands-ui', 'oauth-mcp-auth'],
    selectors: [
      ['commands-ui', 'src/hooks/useReplBridge.tsx', "detail || '/remote-control'"],
      ['oauth-mcp-auth', 'src/bridge/trustedDevice.ts', 'getTrustedDeviceUnenrolledReason'],
    ],
    rationale:
      'The sealed Remote Control rows retain per-attempt result details and the up-front trusted-device enrollment failure check.',
  }],
  [30, {
    inheritedRowIds: ['commands-ui', 'oauth-mcp-auth'],
    selectors: [
      ['commands-ui', 'src/components/PromptInput/PromptInputFooter.tsx', 'replBridgeError'],
      ['oauth-mcp-auth', 'src/bridge/trustedDevice.ts', 'getTrustedDeviceUnenrolledReason'],
    ],
    rationale:
      'The sealed Remote Control rows retain the explicit initial error state and the reviewed reason surfaced for trusted-device failures.',
  }],
  [31, {
    inheritedRowIds: ['terminal-bash-scroll'],
    selectors: [
      ['terminal-bash-scroll', 'src/ink/termio/osc.ts', 'POWERSHELL_CLIPBOARD_COMMAND ='],
    ],
    rationale:
      'The sealed Windows terminal row retains stdin-based PowerShell clipboard transport, keeping copied contents out of process arguments.',
  }],
  [32, {
    inheritedRowIds: ['image-read-retry'],
    selectors: [
      ['image-read-retry', 'src/utils/powershell/parser.ts', "$tok.Kind -eq $tk::Generic"],
    ],
    rationale:
      'The sealed PowerShell parser witness retains exact stop-parsing-token recognition without treating a bare double dash as that token.',
  }],
  [33, {
    inheritedRowIds: ['sdk-print-share', 'tool-execution-classifier'],
    selectors: [
      ['sdk-print-share', 'src/QueryEngine.ts', 'origin: options?.origin'],
      ['tool-execution-classifier', 'src/services/tools/StreamingToolExecutor.ts', 'hasCompletedResults = false'],
    ],
    rationale:
      'The sealed SDK and streaming rows retain terminal result provenance and one-pass completed-result tracking for malformed parallel tool batches.',
  }],
])

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

const section = fs.readFileSync(changelogPath, 'utf8')
const bullets = section
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))
assert.equal(bullets.length, 33, 'official bullet count')

const expectedRetained = Array.from({ length: 33 }, (_, index) => index + 1)
  .filter(number => ![10, 17, 18].includes(number))
assert.deepEqual(
  [...reviews.keys(), 23].sort((left, right) => left - right),
  expectedRetained,
  'reviewed bullet coverage',
)

const priorCatalog = JSON.parse(fs.readFileSync(priorCatalogPath, 'utf8'))
assert.equal(priorCatalog.case, '2.1.123-to-2.1.124')
assert.equal(priorCatalog.release, '2.1.124')
assert.equal(priorCatalog.complete, true)
const priorById = new Map(priorCatalog.rows.map(row => [row.id, row]))
assert.equal(priorById.size, priorCatalog.rows.length, 'unique prior rows')

function selectWitness(rowId, sourcePath, needle) {
  const row = priorById.get(rowId)
  assert.ok(row, 'unknown inherited row ' + rowId)
  const matches = row.sourceAssertions.filter(
    witness => witness.path === sourcePath && witness.fragment.includes(needle),
  )
  assert.equal(
    matches.length,
    1,
    rowId + ': expected one source witness for ' + sourcePath + ' / ' + needle,
  )
  const { path: witnessPath, fragment, count } = matches[0]
  assert.equal(
    occurrences(fs.readFileSync(path.join(repo, witnessPath), 'utf8'), fragment),
    count,
    rowId + ': current source witness count',
  )
  return { path: witnessPath, fragment, count }
}

function canonicalWitnesses(witnesses) {
  const unique = new Map(
    witnesses.map(witness => [
      JSON.stringify([witness.path, witness.fragment, witness.count]),
      witness,
    ]),
  )
  return [...unique.values()].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.fragment.localeCompare(right.fragment) ||
      left.count - right.count,
  )
}

const rows = expectedRetained.map(releaseBullet => {
  const id = 'B' + String(releaseBullet).padStart(2, '0')
  const title = bullets[releaseBullet - 1]
  if (releaseBullet === 23) {
    const bindingFragment = "'ctrl+l': 'chat:clearInput',"
    const bindingPath = 'src/keybindings/defaultBindings.ts'
    const handlerFragment = `const handleClearInput = useCallback(() => {
    setRedrawVersion(version => version + 1);
    clearActionShortcutRef.current = clearInputShortcut;
    clearDoublePress();
  }, [clearInputShortcut, clearDoublePress]);`
    const handlerPath = 'src/components/PromptInput/PromptInput.tsx'
    const sourceAssertions = canonicalWitnesses([
      {
        path: bindingPath,
        fragment: bindingFragment,
        count: occurrences(
          fs.readFileSync(path.join(repo, bindingPath), 'utf8'),
          bindingFragment,
        ),
      },
      {
        path: handlerPath,
        fragment: handlerFragment,
        count: occurrences(
          fs.readFileSync(path.join(repo, handlerPath), 'utf8'),
          handlerFragment,
        ),
      },
    ])
    for (const witness of sourceAssertions) {
      assert.equal(witness.count, 1, 'B23 source witness ' + witness.path)
    }
    return {
      id,
      releaseBullet,
      title,
      disposition: 'target-retained-source-repair',
      retained: true,
      targetFragments: [
        '"ctrl+l":"chat:clearInput"',
        '"chat:clearInput":PC',
        'm9("chat:clearInput","Chat","ctrl+l")',
        'PC=Aq.useCallback(()=>{z1((y$)=>y$+1),b9.current=y7,iz()},[y7,iz])',
      ].sort(),
      sourceAssertions,
      observedBehavior:
        'Both adjacent bundles bind Ctrl+L to chat:clearInput, whose callback only increments redraw state, updates the shortcut reference, and invokes the fullscreen double-press helper; recovered source now preserves that redraw-only prompt behavior.',
      rationale:
        'This byte-identical target-retained behavior repairs an inherited source gap that the sealed 2.1.124 direct catalog did not project; it is not part of the adjacent active bundle delta.',
    }
  }

  const review = reviews.get(releaseBullet)
  assert.ok(review, id + ': missing review')
  const inheritedRowIds = [...review.inheritedRowIds].sort()
  assert.equal(
    new Set(inheritedRowIds).size,
    inheritedRowIds.length,
    id + ': duplicate inherited rows',
  )
  const inheritedRows = inheritedRowIds.map(rowId => {
    const row = priorById.get(rowId)
    assert.ok(row, id + ': unknown inherited row ' + rowId)
    return row
  })
  const targetFragments = [
    ...new Set(
      inheritedRows.flatMap(row =>
        row.targetFragments.map(fragment => fragment.text),
      ),
    ),
  ].sort()
  const sourceAssertions = canonicalWitnesses(
    review.selectors.map(selector => selectWitness(...selector)),
  )
  for (const rowId of inheritedRowIds) {
    assert.ok(
      review.selectors.some(selector => selector[0] === rowId),
      id + ': inherited row lacks a selected source witness: ' + rowId,
    )
  }
  return {
    id,
    releaseBullet,
    title,
    disposition: 'inherited-retained',
    retained: true,
    inheritedRowIds,
    targetFragments,
    sourceAssertions,
    rationale: review.rationale,
  }
})

const output = {
  schemaVersion: 1,
  case: '2.1.124-to-2.1.126',
  baseline: '2.1.124',
  release: '2.1.126',
  complete: true,
  rows,
}
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({
  status: '2.1.126-reviewed-official-evidence-built',
  rows: rows.length,
  inheritedRetained: rows.filter(
    row => row.disposition === 'inherited-retained',
  ).length,
  releaseNoteDiscrepancies: rows.filter(
    row => row.disposition === 'authenticated-release-note-discrepancy',
  ).length,
  targetRetainedSourceRepairs: rows.filter(
    row => row.disposition === 'target-retained-source-repair',
  ).length,
}))
