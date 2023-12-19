import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  replayTarget120BootstrapStateSupplement,
  replayTarget120CcrStatusCategoryGuardSupplement,
  replayTarget120ClassifierSurfaceTelemetrySupplement,
  replayTarget120CliPrintControlTelemetrySupplement,
  replayTarget120DaemonStatusRecoveryTelemetrySupplement,
  replayTarget120EnvironmentShellAnalyticsSupplement,
  replayTarget120ExitWorktreeCwdOverrideSupplement,
  replayTarget120FleetViewLiveRepositorySupplement,
  replayTarget120FeedbackSurveyOptionsSupplement,
  replayTarget120InternalNetworkProbeStubSupplement,
  replayTarget120ManagedAgentsSupplement,
  replayTarget120McpEffortFallbackSupplement,
  replayTarget120UltrareviewNoopTaskRegistrySupplement,
  replayTarget120MoreRightSessionRestorationSupplement,
  replayTarget120ReplSurveyStackSupplement,
  replayTarget120OrphanPtySidecarSupplement,
  replayTarget120SafeEnvPowershellSupplement,
  replayTarget120SkillChangeDetectorLifecycleSupplement,
  replayTarget120TailSupplements,
  TARGET120_BOOTSTRAP_STATE_REPLAY,
  TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY,
  TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY,
  TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY,
  TARGET120_DAEMON_STATUS_RECOVERY_TELEMETRY_REPLAY,
  TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY,
  TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY,
  TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY,
  TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY,
  TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY,
  TARGET120_MANAGED_AGENTS_REPLAY,
  TARGET120_MCP_EFFORT_FALLBACK_REPLAY,
  TARGET120_ULTRAREVIEW_NOOP_TASK_REGISTRY_REPLAY,
  TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY,
  TARGET120_REPL_SURVEY_STACK_REPLAY,
  TARGET120_ORPHAN_PTY_SIDECAR_REPLAY,
  TARGET120_SAFE_ENV_POWERSHELL_REPLAY,
  TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY,
  TARGET120_TAIL_SUPPLEMENT_OWNER_OVERRIDES,
  TARGET120_TAIL_SUPPLEMENT_REPLAY_ORDER,
} from './replay-target120-tail-supplements.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.120-tail-supplement-replay.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '48ee3b1fb740028837e1a05768faf025b332840f1ed67bd06fff87ce08cc48a5'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const targetPath = process.env.CLAUDE_CODE_2_1_120_BUNDLE

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, label)
  return bytes
}

function readReplayInput(filename, replay, label) {
  if (!fs.existsSync(filename)) {
    if (replay.preimage?.absent === true) {
      return { bytes: null, state: 'preimage' }
    }
    assert.fail(`${label}: required pinned preimage is absent`)
  }
  const bytes = fs.readFileSync(filename)
  const actual = descriptor(bytes)
  if (
    actual.bytes === replay.preimage.bytes &&
    actual.sha256 === replay.preimage.sha256
  ) {
    return { bytes, state: 'preimage' }
  }
  if (
    actual.bytes === replay.postimage.bytes &&
    actual.sha256 === replay.postimage.sha256
  ) {
    return { bytes, state: 'postimage' }
  }
  if (
    replay.ownerPath === TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.ownerPath &&
    replay.preimage.bytes ===
      TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.owners[0].preimage.bytes &&
    actual.bytes === TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.postimage.bytes &&
    actual.sha256 ===
      TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.postimage.sha256
  ) {
    return { bytes, state: 'downstream-postimage' }
  }
  const downstreamReplOwner = TARGET120_REPL_SURVEY_STACK_REPLAY.owners.find(
    owner => owner.ownerPath === replay.ownerPath,
  )
  if (
    downstreamReplOwner &&
    replay.postimage.bytes ===
      TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners.find(
        owner => owner.ownerPath === replay.ownerPath,
      )?.postimage.bytes &&
    actual.bytes === downstreamReplOwner.postimage.bytes &&
    actual.sha256 === downstreamReplOwner.postimage.sha256
  ) {
    return { bytes, state: 'downstream-postimage' }
  }
  assert.fail(
    `${label}: expected pinned preimage ${JSON.stringify(replay.preimage)} or postimage ${JSON.stringify(replay.postimage)}, received ${JSON.stringify(actual)}`,
  )
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(fs.existsSync(filename), 'the repository-pinned TypeScript compiler exists')
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

test('target120 bounded supplement replay fixture is exact and generator-ready', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.119-to-2.1.120')
  assert.equal(fixture.status, 'case-owned-replay-ready')
  assert.deepEqual(fixture.summary, {
    units: 28,
    residues: 159,
    ownerFiles: 32,
    remainingSupplementUnits: 11,
    remainingSupplementResidues: 140,
  })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [
      370,
      371,
      TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.targetIndex,
      TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.targetIndex,
      TARGET120_SAFE_ENV_POWERSHELL_REPLAY.targetIndex,
      TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY.targetIndex,
      ...TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY.targetIndices,
      18593,
      TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.targetIndex,
      19492,
      19500,
      19509,
      ...TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY.targetIndices,
      TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.targetIndex,
      TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY.targetIndex,
      ...TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY.targetIndices,
      ...TARGET120_REPL_SURVEY_STACK_REPLAY.targetIndices,
      TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.targetIndex,
      TARGET120_MANAGED_AGENTS_REPLAY.targetIndex,
      ...TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY.targetIndices,
      TARGET120_MCP_EFFORT_FALLBACK_REPLAY.targetIndex,
      TARGET120_ULTRAREVIEW_NOOP_TASK_REGISTRY_REPLAY.targetIndex,
    ],
  )
  assert.deepEqual(
    fixture.coverageOwnerOverrides,
    Object.fromEntries(
      Object.entries(TARGET120_TAIL_SUPPLEMENT_OWNER_OVERRIDES).map(
        ([targetIndex, owners]) => [targetIndex, owners],
      ),
    ),
  )
  assert.deepEqual(
    fixture.replayOrder,
    TARGET120_TAIL_SUPPLEMENT_REPLAY_ORDER,
  )
  assert.deepEqual(
    fixture.replayClusters['bootstrap-state'].preimage,
    TARGET120_BOOTSTRAP_STATE_REPLAY.preimage,
  )
  assert.deepEqual(
    fixture.replayClusters['bootstrap-state'].postimage,
    TARGET120_BOOTSTRAP_STATE_REPLAY.postimage,
  )
  const managedAgents = fixture.rows.find(row => row.targetIndex === 21627)
  assert.deepEqual(
    fixture.replayClusters['managed-agents-api-reference'].preimage,
    TARGET120_MANAGED_AGENTS_REPLAY.preimage,
  )
  assert.deepEqual(
    fixture.replayClusters['managed-agents-api-reference'].postimage,
    TARGET120_MANAGED_AGENTS_REPLAY.postimage,
  )
  assert.deepEqual(
    fixture.replayClusters['safe-env-powershell'].preimage,
    TARGET120_SAFE_ENV_POWERSHELL_REPLAY.preimage,
  )
  assert.deepEqual(
    fixture.replayClusters['safe-env-powershell'].postimage,
    TARGET120_SAFE_ENV_POWERSHELL_REPLAY.postimage,
  )
  assert.deepEqual(
    fixture.replayClusters['classifier-surface-telemetry'].owners.map(owner => ({
      ownerPath: owner.ownerPath,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
    TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY.owners.map(owner => ({
      ownerPath: owner.ownerPath,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
  )
  assert.deepEqual(
    fixture.replayClusters['skill-change-detector-lifecycle'].owners.map(
      owner => ({
        ownerPath: owner.ownerPath,
        preimage: owner.preimage,
        postimage: owner.postimage,
      }),
    ),
    TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY.owners.map(owner => ({
      ownerPath: owner.ownerPath,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
  )
  assert.deepEqual(
    fixture.replayClusters['orphan-pty-sidecar-cleanup'].preimage,
    TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.preimage,
  )
  assert.deepEqual(
    fixture.replayClusters['orphan-pty-sidecar-cleanup'].postimage,
    TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.postimage,
  )
  assert.deepEqual(
    fixture.replayClusters['daemon-status-recovery-telemetry'].owners.map(
      owner => ({
        ownerPath: owner.ownerPath,
        targetIndices: owner.targetIndices,
        preimage: owner.preimage,
        postimage: owner.postimage,
      }),
    ),
    TARGET120_DAEMON_STATUS_RECOVERY_TELEMETRY_REPLAY.owners.map(owner => ({
      ownerPath: owner.ownerPath,
      targetIndices: owner.targetIndices,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
  )
  assert.deepEqual(
    fixture.replayClusters['environment-shell-analytics'].owners.map(
      owner => ({
        ownerPath: owner.ownerPath,
        preimage: owner.preimage,
        postimage: owner.postimage,
      }),
    ),
    TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.owners.map(owner => ({
      ownerPath: owner.ownerPath,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
  )
  assert.deepEqual(
    fixture.replayClusters['internal-network-probe-stub'].preimage,
    TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.preimage,
  )
  assert.deepEqual(
    fixture.replayClusters['internal-network-probe-stub'].postimage,
    TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.postimage,
  )
  assert.deepEqual(
    fixture.replayClusters['exit-worktree-cwd-override-guard'].owners.map(
      owner => ({
        ownerPath: owner.ownerPath,
        preimage: owner.preimage,
        postimage: owner.postimage,
      }),
    ),
    TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY.owners.map(owner => ({
      ownerPath: owner.ownerPath,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
  )
  assert.deepEqual(
    fixture.replayClusters['ccr-status-category-guard'].preimage,
    TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.preimage,
  )
  assert.deepEqual(
    fixture.replayClusters['ccr-status-category-guard'].postimage,
    TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.postimage,
  )
  assert.deepEqual(
    fixture.replayClusters['mcp-effort-fallback'].preimage,
    TARGET120_MCP_EFFORT_FALLBACK_REPLAY.preimage,
  )
  assert.deepEqual(
    fixture.replayClusters['mcp-effort-fallback'].postimage,
    TARGET120_MCP_EFFORT_FALLBACK_REPLAY.postimage,
  )
  assert.deepEqual(
    fixture.replayClusters['ultrareview-noop-task-registry'].owners.map(
      owner => ({
        ownerPath: owner.ownerPath,
        preimage: owner.preimage,
        postimage: owner.postimage,
      }),
    ),
    TARGET120_ULTRAREVIEW_NOOP_TASK_REGISTRY_REPLAY.owners.map(owner => ({
      ownerPath: owner.ownerPath,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
  )
  assert.deepEqual(
    fixture.replayClusters['fleetview-live-repositories-and-attachment'].preimage,
    TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY.preimage,
  )
  assert.deepEqual(
    fixture.replayClusters['fleetview-live-repositories-and-attachment'].postimage,
    TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY.postimage,
  )
  assert.deepEqual(
    fixture.replayClusters['feedback-survey-options'].owners.map(owner => ({
      ownerPath: owner.ownerPath,
      targetIndices: owner.targetIndices,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
    TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY.owners.map(owner => ({
      ownerPath: owner.ownerPath,
      targetIndices: owner.targetIndices,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
  )
  assert.deepEqual(
    fixture.replayClusters['moreright-session-restoration'].owners.map(
      owner => ({
        ownerPath: owner.ownerPath,
        preimage: owner.preimage,
        postimage: owner.postimage,
      }),
    ),
    TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners.map(owner => ({
      ownerPath: owner.ownerPath,
      preimage: owner.preimage,
      postimage: owner.postimage,
    })),
  )
  assert.deepEqual(
    fixture.replayClusters['repl-survey-stack-and-undo'].owners.map(owner => ({
      ownerPath: owner.ownerPath,
      preimage: owner.preimage,
      postimage: owner.postimage,
      replacementOperations: owner.replacementOperations,
    })),
    TARGET120_REPL_SURVEY_STACK_REPLAY.owners.map(owner => ({
      ownerPath: owner.ownerPath,
      preimage: owner.preimage,
      postimage: owner.postimage,
      replacementOperations: owner.replacements.length,
    })),
  )
  assert.deepEqual(
    fixture.replayClusters['cli-print-control-and-telemetry'],
    {
      targetIndices: TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY.targetIndices,
      ownerPath: TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY.ownerPath,
      preimage: TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY.preimage,
      postimage: TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY.postimage,
      targetRegion: TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY.targetRegion,
      replacementOperations:
        TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY.replacements.length,
      sourceReplayResidues: 5,
      compilerResidues: 8,
    },
  )
  assert.equal(managedAgents.replacement.before, TARGET120_MANAGED_AGENTS_REPLAY.before)
  assert.equal(managedAgents.replacement.after, TARGET120_MANAGED_AGENTS_REPLAY.after)
  const classificationBytes = readExact(
    path.join(repositoryRoot, fixture.inputs.classification.path),
    {
      bytes: fixture.inputs.classification.bytes,
      sha256: fixture.inputs.classification.sha256,
    },
    'tail classification',
  )
  const classification = JSON.parse(classificationBytes)
  assert.ok(
    classification.categories['source-supplement'].indices.includes(21627),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(21277),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(2578),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(19809),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(21892),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(21858),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(21966),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(19627),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(19629),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(20957),
  )
  assert.ok(
    classification.categories['source-supplement'].indices.includes(20958),
  )
  readExact(
    path.join(repositoryRoot, fixture.inputs.structural.path),
    {
      bytes: fixture.inputs.structural.bytes,
      sha256: fixture.inputs.structural.sha256,
    },
    'structural ledger',
  )
})

test(
  'target120 bootstrap-state replay is AST-bound, byte-exact, and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 historical source root is required'
        : false,
  },
  async () => {
    const input = readReplayInput(
      path.join(sourceRoot, TARGET120_BOOTSTRAP_STATE_REPLAY.ownerPath.slice(4)),
      TARGET120_BOOTSTRAP_STATE_REPLAY,
      'bootstrap-state historical preimage',
    )
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-bootstrap-state-replay-'),
    )
    try {
      const temporaryFile = path.join(
        temporaryRoot,
        TARGET120_BOOTSTRAP_STATE_REPLAY.ownerPath.slice(4),
      )
      fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
      fs.writeFileSync(temporaryFile, input.bytes)
      assert.deepEqual(
        replayTarget120BootstrapStateSupplement({ sourceRoot: temporaryRoot }),
        input.state === 'preimage'
          ? {
              changes: [
                {
                  ownerPath: TARGET120_BOOTSTRAP_STATE_REPLAY.ownerPath,
                  targetIndices: [370, 371],
                },
              ],
              state: 'replayed',
            }
          : { changes: [], state: 'already-replayed' },
      )
      const replayed = readExact(
        temporaryFile,
        TARGET120_BOOTSTRAP_STATE_REPLAY.postimage,
        'bootstrap-state replay postimage',
      )
      assert.deepEqual(
        replayTarget120BootstrapStateSupplement({ sourceRoot: temporaryRoot }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const source = replayed.toString('utf8')
      const sourceFile = ts.createSourceFile(
        temporaryFile,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      const functions = new Map()
      function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name) {
          functions.set(node.name.text, node)
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      for (const name of [
        'getFridayFundayDisabledForSession',
        'setFridayFundayDisabledForSession',
        'resetInteractionBaseline',
      ]) {
        assert.ok(functions.has(name), 'bootstrap state declares ' + name)
      }
      assert.match(
        functions
          .get('getFridayFundayDisabledForSession')
          .getText(sourceFile),
        /return STATE\.fridayFundayDisabledForSession/,
      )
      assert.match(
        functions
          .get('setFridayFundayDisabledForSession')
          .getText(sourceFile),
        /STATE\.fridayFundayDisabledForSession = true/,
      )
      assert.match(
        source,
        /fridayFundayDisabledForSession: false/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 managed-agents replay is bounded, byte-exact, and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 historical source root is required'
        : false,
  },
  () => {
    const input = readReplayInput(
      path.join(sourceRoot, TARGET120_MANAGED_AGENTS_REPLAY.ownerPath.slice(4)),
      TARGET120_MANAGED_AGENTS_REPLAY,
      'managed-agents replay input',
    )
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-tail-replay-'),
    )
    try {
      const temporaryFile = path.join(
        temporaryRoot,
        TARGET120_MANAGED_AGENTS_REPLAY.ownerPath.slice(4),
      )
      fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
      fs.writeFileSync(temporaryFile, input.bytes)
      assert.deepEqual(
        replayTarget120ManagedAgentsSupplement({ sourceRoot: temporaryRoot }),
        input.state === 'preimage'
          ? {
              changes: [
                {
                  ownerPath: TARGET120_MANAGED_AGENTS_REPLAY.ownerPath,
                  targetIndex: 21627,
                },
              ],
              state: 'replayed',
            }
          : { changes: [], state: 'already-replayed' },
      )
      assert.deepEqual(
        descriptor(fs.readFileSync(temporaryFile)),
        TARGET120_MANAGED_AGENTS_REPLAY.postimage,
      )
      assert.deepEqual(replayTarget120ManagedAgentsSupplement({ sourceRoot: temporaryRoot }), {
        changes: [],
        state: 'already-replayed',
      })
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 safe-env replay is AST-bound, byte-exact, and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 historical source root is required'
        : false,
  },
  async () => {
    const input = readReplayInput(
      path.join(sourceRoot, TARGET120_SAFE_ENV_POWERSHELL_REPLAY.ownerPath.slice(4)),
      TARGET120_SAFE_ENV_POWERSHELL_REPLAY,
      'safe-env replay input',
    )
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-safe-env-replay-'),
    )
    try {
      const temporaryFile = path.join(
        temporaryRoot,
        TARGET120_SAFE_ENV_POWERSHELL_REPLAY.ownerPath.slice(4),
      )
      fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
      fs.writeFileSync(temporaryFile, input.bytes)
      assert.deepEqual(
        replayTarget120SafeEnvPowershellSupplement({ sourceRoot: temporaryRoot }),
        input.state === 'preimage'
          ? {
              changes: [
                {
                  ownerPath: TARGET120_SAFE_ENV_POWERSHELL_REPLAY.ownerPath,
                  targetIndex: 11081,
                },
              ],
              state: 'replayed',
            }
          : { changes: [], state: 'already-replayed' },
      )
      const replayed = readExact(
        temporaryFile,
        TARGET120_SAFE_ENV_POWERSHELL_REPLAY.postimage,
        'safe-env replay postimage',
      )
      assert.deepEqual(
        replayTarget120SafeEnvPowershellSupplement({ sourceRoot: temporaryRoot }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const source = replayed.toString('utf8')
      const sourceFile = ts.createSourceFile(
        temporaryFile,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      const safeEnvValues = []
      function visit(node) {
        if (
          ts.isVariableDeclaration(node) &&
          node.name.getText(sourceFile) === 'SAFE_ENV_VARS' &&
          node.initializer &&
          ts.isNewExpression(node.initializer)
        ) {
          const array = node.initializer.arguments?.[0]
          assert.ok(array && ts.isArrayLiteralExpression(array))
          for (const element of array.elements) {
            if (ts.isStringLiteral(element)) safeEnvValues.push(element.text)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      assert.equal(
        safeEnvValues.filter(value => value === 'CLAUDE_CODE_USE_POWERSHELL_TOOL').length,
        1,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 environment-shell analytics replay is AST-bound and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-environment-shell-replay-'),
    )
    try {
      const inputStates = new Map()
      for (const owner of TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': environment-shell replay input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
        fs.writeFileSync(temporaryFile, input.bytes)
        inputStates.set(owner.ownerPath, input.state)
      }
      const expectedChanges =
        TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.owners
          .filter(owner => inputStates.get(owner.ownerPath) === 'preimage')
          .map(owner => ({
            ownerPath: owner.ownerPath,
            targetIndex: 2576,
          }))
      assert.deepEqual(
        replayTarget120EnvironmentShellAnalyticsSupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state:
            expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120EnvironmentShellAnalyticsSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const parsed = new Map()
      const replayed = new Map()
      for (const owner of TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.owners) {
        const filename = path.join(temporaryRoot, owner.ownerPath.slice(4))
        const expectedPostimage =
          inputStates.get(owner.ownerPath) === 'downstream-postimage'
            ? TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.postimage
            : owner.postimage
        const bytes = readExact(
          filename,
          expectedPostimage,
          owner.ownerPath + ': environment-shell replay postimage',
        )
        const source = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0)
        parsed.set(owner.ownerPath, sourceFile)
        replayed.set(owner.ownerPath, source)
      }

      const envFile = parsed.get('src/utils/env.ts')
      const envSource = replayed.get('src/utils/env.ts')
      const functions = new Map()
      const knownShells = []
      function visitEnv(node) {
        if (ts.isFunctionDeclaration(node) && node.name) {
          functions.set(node.name.text, node.getText(envFile))
        }
        if (
          ts.isVariableDeclaration(node) &&
          node.name.getText(envFile) === 'KNOWN_SHELL_EXECUTABLES' &&
          node.initializer &&
          ts.isNewExpression(node.initializer)
        ) {
          const array = node.initializer.arguments?.[0]
          assert.ok(array && ts.isArrayLiteralExpression(array))
          for (const element of array.elements) {
            if (ts.isStringLiteral(element)) knownShells.push(element.text)
          }
        }
        ts.forEachChild(node, visitEnv)
      }
      visitEnv(envFile)
      assert.match(
        functions.get('getShellForAnalytics'),
        /process\.env\.SHELL \|\| process\.env\.COMSPEC \|\| ''/,
      )
      assert.match(
        functions.get('classifyShellExecutable'),
        /KNOWN_SHELL_EXECUTABLES\.has\(executable\)/,
      )
      assert.equal(envSource.split('process.env.COMSPEC').length - 1, 1)

      const classify = shellPath => {
        if (!shellPath) return 'none'
        const executable = shellPath
          .split(/[/\\]/)
          .pop()
          .toLowerCase()
          .replace(/\.exe$/, '')
        return new Set(knownShells).has(executable) ? executable : 'other'
      }
      const environmentShell = (shell, comspec) => classify(shell || comspec || '')
      assert.equal(environmentShell('/bin/zsh', 'C:\\Windows\\cmd.exe'), 'zsh')
      assert.equal(environmentShell('', 'C:\\Windows\\cmd.exe'), 'cmd')
      assert.equal(environmentShell(undefined, undefined), 'none')

      const shellSource = replayed.get('src/utils/Shell.ts')
      assert.equal(
        shellSource.split(
          "import { classifyShellExecutable } from './env.js'",
        ).length - 1,
        1,
      )
      assert.equal(
        shellSource.split('function classifyShellExecutable(').length - 1,
        0,
      )
      assert.match(
        shellSource,
        /getExecutorShell[\s\S]*classifyShellExecutable\(provider\.shellPath\)/,
      )

      const metadataSource = replayed.get(
        'src/services/analytics/metadata.ts',
      )
      assert.equal(metadataSource.split('  shell: string').length - 1, 1)
      assert.equal(
        metadataSource.split('    shell: getShellForAnalytics(),').length - 1,
        1,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 internal-network probe stub replay is authenticated, AST-bound, and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-internal-network-probe-replay-'),
    )
    try {
      const inputStates = new Map()
      for (const owner of TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': internal-network predecessor input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
        fs.writeFileSync(temporaryFile, input.bytes)
        inputStates.set(owner.ownerPath, input.state)
      }

      replayTarget120EnvironmentShellAnalyticsSupplement({
        sourceRoot: temporaryRoot,
      })
      const alreadyReplayed =
        inputStates.get(TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.ownerPath) ===
        'downstream-postimage'
      assert.deepEqual(
        replayTarget120InternalNetworkProbeStubSupplement({
          sourceRoot: temporaryRoot,
        }),
        alreadyReplayed
          ? { changes: [], state: 'already-replayed' }
          : {
              changes: [
                {
                  ownerPath: TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.ownerPath,
                  targetIndex:
                    TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.targetIndex,
                },
              ],
              state: 'replayed',
            },
      )
      assert.deepEqual(
        replayTarget120InternalNetworkProbeStubSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const filename = path.join(
        temporaryRoot,
        TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.ownerPath.slice(4),
      )
      const bytes = readExact(
        filename,
        TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.postimage,
        'internal-network probe replay postimage',
      )
      const source = bytes.toString('utf8')
      const ts = await loadTypeScript()
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)

      let probeFunction
      let envInitializer
      function visit(node) {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name?.text === 'probeInternalNetworkAccess'
        ) {
          probeFunction = node
        }
        if (
          ts.isVariableDeclaration(node) &&
          node.name.getText(sourceFile) === 'env' &&
          node.initializer &&
          ts.isObjectLiteralExpression(node.initializer)
        ) {
          envInitializer = node.initializer
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      assert.ok(probeFunction)
      assert.ok(
        probeFunction.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword,
        ),
      )
      assert.equal(probeFunction.type?.getText(sourceFile), 'Promise<null>')
      assert.equal(probeFunction.body?.statements.length, 1)
      assert.ok(ts.isReturnStatement(probeFunction.body.statements[0]))
      assert.equal(
        probeFunction.body.statements[0].expression?.kind,
        ts.SyntaxKind.NullKeyword,
      )
      assert.ok(envInitializer)
      assert.equal(
        envInitializer.properties.filter(
          property =>
            ts.isShorthandPropertyAssignment(property) &&
            property.name.text === 'probeInternalNetworkAccess',
        ).length,
        1,
      )
      assert.equal(
        source.split('function probeInternalNetworkAccess(').length - 1,
        1,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 exit-worktree cwd-override replay is AST-bound and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-exit-worktree-replay-'),
    )
    try {
      const inputStates = new Map()
      for (const owner of TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': exit-worktree replay input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
        fs.writeFileSync(temporaryFile, input.bytes)
        inputStates.set(owner.ownerPath, input.state)
      }
      const expectedChanges =
        TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY.owners
          .filter(owner => inputStates.get(owner.ownerPath) === 'preimage')
          .map(owner => ({
            ownerPath: owner.ownerPath,
            targetIndex: 13763,
          }))
      assert.deepEqual(
        replayTarget120ExitWorktreeCwdOverrideSupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state:
            expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120ExitWorktreeCwdOverrideSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const parsed = new Map()
      const replayed = new Map()
      for (const owner of TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY.owners) {
        const filename = path.join(temporaryRoot, owner.ownerPath.slice(4))
        const bytes = readExact(
          filename,
          owner.postimage,
          owner.ownerPath + ': exit-worktree replay postimage',
        )
        const source = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0)
        parsed.set(owner.ownerPath, sourceFile)
        replayed.set(owner.ownerPath, source)
      }

      const cwdFile = parsed.get('src/utils/cwd.ts')
      let hasCwdOverride
      function visitCwd(node) {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name?.text === 'hasCwdOverride'
        ) {
          hasCwdOverride = node
        }
        ts.forEachChild(node, visitCwd)
      }
      visitCwd(cwdFile)
      assert.ok(hasCwdOverride, 'hasCwdOverride export exists')
      assert.ok(
        hasCwdOverride.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ),
        'hasCwdOverride is exported',
      )
      assert.match(
        hasCwdOverride.getText(cwdFile),
        /cwdOverrideStorage\.getStore\(\) !== undefined/,
      )

      const exitSource = replayed.get(
        'src/tools/ExitWorktreeTool/ExitWorktreeTool.ts',
      )
      assert.equal(
        exitSource.split("import { hasCwdOverride } from '../../utils/cwd.js'")
          .length - 1,
        1,
      )
      assert.match(
        exitSource,
        /userFacingName\(input\)[\s\S]*input\?\.action === 'remove'[\s\S]*'Cleaning up worktree'/,
      )
      assert.ok(
        exitSource.indexOf('if (hasCwdOverride())') <
          exitSource.indexOf('const session = getCurrentWorktreeSession()'),
        'cwd override guard runs before mutable worktree state is read',
      )
      assert.match(
        exitSource,
        /hasCwdOverride\(\)[\s\S]*errorCode: 5/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 CCR status-category guard replay is authenticated, AST-bound, and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const input = readReplayInput(
      path.join(
        sourceRoot,
        TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.ownerPath.slice(4),
      ),
      TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY,
      'CCR status-category replay input',
    )
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-ccr-status-category-replay-'),
    )
    try {
      const filename = path.join(
        temporaryRoot,
        TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.ownerPath.slice(4),
      )
      fs.mkdirSync(path.dirname(filename), { recursive: true })
      fs.writeFileSync(filename, input.bytes)
      assert.deepEqual(
        replayTarget120CcrStatusCategoryGuardSupplement({
          sourceRoot: temporaryRoot,
        }),
        input.state === 'preimage'
          ? {
              changes: [
                {
                  ownerPath:
                    TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.ownerPath,
                  targetIndex:
                    TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.targetIndex,
                },
              ],
              state: 'replayed',
            }
          : { changes: [], state: 'already-replayed' },
      )
      assert.deepEqual(
        replayTarget120CcrStatusCategoryGuardSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const bytes = readExact(
        filename,
        TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.postimage,
        'CCR status-category replay postimage',
      )
      const source = bytes.toString('utf8')
      const ts = await loadTypeScript()
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      let guardFunction
      let reportMetadataMethod
      function visit(node) {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name?.text === 'hasStatusCategory'
        ) {
          guardFunction = node
        }
        if (
          ts.isMethodDeclaration(node) &&
          node.name.getText(sourceFile) === 'reportMetadata'
        ) {
          reportMetadataMethod = node
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      assert.ok(guardFunction)
      assert.equal(
        guardFunction.type?.getText(sourceFile),
        'value is { status_category: string }',
      )
      const guardSource = guardFunction.getText(sourceFile)
      for (const marker of [
        'value !== null',
        "typeof value === 'object'",
        "'status_category' in value",
        "typeof value.status_category === 'string'",
      ]) {
        assert.equal(guardSource.split(marker).length - 1, 1, marker)
      }
      assert.ok(reportMetadataMethod)
      const methodSource = reportMetadataMethod.getText(sourceFile)
      assert.equal(
        methodSource.split('hasStatusCategory(postTurnSummary)').length - 1,
        1,
      )
      assert.equal(
        methodSource.split("postTurnSummary.status_category === 'blocked'")
          .length - 1,
        1,
      )
      assert.equal(
        source.split("'status_category' in value").length - 1,
        1,
      )

      const normalizeMetadata = metadata => {
        const postTurnSummary = metadata.post_turn_summary
        const valid =
          postTurnSummary !== null &&
          typeof postTurnSummary === 'object' &&
          'status_category' in postTurnSummary &&
          typeof postTurnSummary.status_category === 'string'
        return valid && postTurnSummary.status_category === 'blocked'
          ? {
              ...metadata,
              post_turn_summary: {
                ...postTurnSummary,
                status_category: 'need_input',
              },
            }
          : metadata
      }
      for (const post_turn_summary of [null, 42, {}, { status_category: 7 }]) {
        const metadata = { post_turn_summary }
        assert.equal(normalizeMetadata(metadata), metadata)
      }
      assert.deepEqual(
        normalizeMetadata({
          post_turn_summary: { status_category: 'blocked', detail: 'approval' },
        }),
        {
          post_turn_summary: {
            status_category: 'need_input',
            detail: 'approval',
          },
        },
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 MCP effort fallback replay is authenticated, AST-bound, and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const replay = TARGET120_MCP_EFFORT_FALLBACK_REPLAY
    const input = readReplayInput(
      path.join(sourceRoot, replay.ownerPath.slice(4)),
      replay,
      'MCP effort-fallback replay input',
    )
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-mcp-effort-fallback-replay-'),
    )
    try {
      const filename = path.join(temporaryRoot, replay.ownerPath.slice(4))
      fs.mkdirSync(path.dirname(filename), { recursive: true })
      fs.writeFileSync(filename, input.bytes)
      assert.deepEqual(
        replayTarget120McpEffortFallbackSupplement({
          sourceRoot: temporaryRoot,
        }),
        input.state === 'preimage'
          ? {
              changes: [
                {
                  ownerPath: replay.ownerPath,
                  targetIndex: replay.targetIndex,
                },
              ],
              state: 'replayed',
            }
          : { changes: [], state: 'already-replayed' },
      )
      assert.deepEqual(
        replayTarget120McpEffortFallbackSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const bytes = readExact(
        filename,
        replay.postimage,
        'MCP effort-fallback replay postimage',
      )
      const source = bytes.toString('utf8')
      const ts = await loadTypeScript()
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      const effortProperties = []
      function visit(node) {
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(sourceFile) === 'getEffortValue'
        ) {
          effortProperties.push(node)
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      assert.equal(effortProperties.length, 1)
      const effortProperty = effortProperties[0]
      assert.ok(ts.isArrowFunction(effortProperty.initializer))
      assert.equal(
        effortProperty.initializer.body.getText(sourceFile),
        'undefined',
      )
      assert.match(
        source,
        /const toolUseContext = \{[\s\S]*getEffortValue: \(\) => undefined,[\s\S]*\} as unknown as ToolUseContext/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 Ultrareview no-op task-registry replay is authenticated, AST-bound, and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const replay = TARGET120_ULTRAREVIEW_NOOP_TASK_REGISTRY_REPLAY
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-ultrareview-task-registry-replay-'),
    )
    try {
      const inputStates = new Map()
      for (const owner of replay.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': Ultrareview task-registry replay input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
        fs.writeFileSync(temporaryFile, input.bytes)
        inputStates.set(owner.ownerPath, input.state)
      }
      const expectedChanges = replay.owners
        .filter(owner => inputStates.get(owner.ownerPath) === 'preimage')
        .map(owner => ({
          ownerPath: owner.ownerPath,
          targetIndex: replay.targetIndex,
        }))
      assert.deepEqual(
        replayTarget120UltrareviewNoopTaskRegistrySupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state: expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120UltrareviewNoopTaskRegistrySupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const replayed = new Map()
      for (const owner of replay.owners) {
        const filename = path.join(temporaryRoot, owner.ownerPath.slice(4))
        const bytes = readExact(
          filename,
          owner.postimage,
          owner.ownerPath + ': Ultrareview task-registry postimage',
        )
        const source = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0)
        replayed.set(owner.ownerPath, { source, sourceFile })
      }

      const framework = replayed.get('src/utils/task/framework.ts')
      const registryDeclarations = []
      function visitFramework(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(framework.sourceFile) === 'NOOP_TASK_REGISTRY') {
          registryDeclarations.push(node)
        }
        ts.forEachChild(node, visitFramework)
      }
      visitFramework(framework.sourceFile)
      assert.equal(registryDeclarations.length, 1)
      const registry = registryDeclarations[0].initializer
      assert.ok(ts.isObjectLiteralExpression(registry))
      assert.deepEqual(
        registry.properties.map(property => property.name.getText(framework.sourceFile)),
        [
          'register',
          'update',
          'remove',
          'evictTerminal',
          'applyOffsetsAndEvict',
          'get',
          'all',
        ],
      )
      for (const property of registry.properties.slice(0, 5)) {
        assert.ok(ts.isMethodDeclaration(property))
        assert.equal(property.body.statements.length, 0)
      }
      const getMethod = registry.properties[5]
      const allMethod = registry.properties[6]
      assert.equal(
        getMethod.body.statements[0].expression.getText(framework.sourceFile),
        'undefined',
      )
      assert.equal(
        allMethod.body.statements[0].expression.getText(framework.sourceFile),
        '{}',
      )

      const ultrareview = replayed.get('src/cli/handlers/ultrareview.ts')
      assert.equal(
        ultrareview.source.split(
          "import { NOOP_TASK_REGISTRY } from '../../utils/task/framework.js'",
        ).length - 1,
        1,
      )
      assert.equal(
        ultrareview.source.split(
          'context: { abortController, taskRegistry: NOOP_TASK_REGISTRY }',
        ).length - 1,
        1,
      )
      assert.ok(
        ultrareview.source.indexOf('skipTaskRegistration: true') <
          ultrareview.source.indexOf('taskRegistry: NOOP_TASK_REGISTRY'),
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 FleetView live-repository replay is authenticated, AST-bound, and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const replay = TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY
    const input = readReplayInput(
      path.join(sourceRoot, replay.ownerPath.slice(4)),
      replay,
      'FleetView live-repository replay input',
    )
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-fleetview-live-repository-replay-'),
    )
    try {
      const temporaryFile = path.join(temporaryRoot, replay.ownerPath.slice(4))
      fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
      fs.writeFileSync(temporaryFile, input.bytes)
      const expectedChanges =
        input.state === 'preimage'
          ? [
              {
                ownerPath: replay.ownerPath,
                targetIndices: replay.targetIndices,
              },
            ]
          : []
      assert.deepEqual(
        replayTarget120FleetViewLiveRepositorySupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state: expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120FleetViewLiveRepositorySupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )
      const sourceBytes = readExact(
        temporaryFile,
        replay.postimage,
        'FleetView live-repository replay postimage',
      )
      const source = sourceBytes.toString('utf8')
      const ts = await loadTypeScript()
      const sourceFile = ts.createSourceFile(
        temporaryFile,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      for (const marker of [
        "const jobOrigins = [...(jobs ?? []), ...pendingJobs]",
        ".join('\\x00')",
        "jobOrigins.split('\\x00')",
        'const availableRepositories = useMemo(() => {',
        'const rowState = { attaching: attachingJobId === job.id }',
        '!rowState.attaching',
        'const footerState = { canPin }',
        'footerState.canPin',
      ]) {
        assert.ok(source.includes(marker), marker)
      }
      assert.equal(source.split(".join('\\x00')").length - 1, 1)
      assert.equal(source.split("jobOrigins.split('\\x00')").length - 1, 1)
      assert.equal(source.split('footerState.canPin').length - 1, 2)
      assert.ok(
        source.indexOf('const rowState = { attaching: attachingJobId === job.id }') <
          source.indexOf('!rowState.attaching'),
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 feedback survey options replay is AST-bound and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-feedback-survey-replay-'),
    )
    try {
      const inputStates = new Map()
      for (const owner of TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': feedback-survey replay input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        if (input.bytes) {
          fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
          fs.writeFileSync(temporaryFile, input.bytes)
        }
        inputStates.set(owner.ownerPath, input.state)
      }
      const expectedChanges = TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY.owners
        .filter(owner => inputStates.get(owner.ownerPath) === 'preimage')
        .map(owner => ({
          ownerPath: owner.ownerPath,
          targetIndices: owner.targetIndices,
        }))
      assert.deepEqual(
        replayTarget120FeedbackSurveyOptionsSupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state:
            expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120FeedbackSurveyOptionsSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const parsed = new Map()
      const replayed = new Map()
      for (const owner of TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY.owners) {
        const filename = path.join(temporaryRoot, owner.ownerPath.slice(4))
        const bytes = readExact(
          filename,
          owner.postimage,
          owner.ownerPath + ': feedback-survey replay postimage',
        )
        const source = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0)
        parsed.set(owner.ownerPath, sourceFile)
        replayed.set(owner.ownerPath, source)
      }

      const surveyOptionsFile = parsed.get(
        'src/components/FeedbackSurvey/SurveyOptions.tsx',
      )
      let surveyOptionsFunction
      function visitSurveyOptions(node) {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name?.text === 'SurveyOptions'
        ) {
          surveyOptionsFunction = node
        }
        ts.forEachChild(node, visitSurveyOptions)
      }
      visitSurveyOptions(surveyOptionsFile)
      assert.ok(surveyOptionsFunction, 'shared SurveyOptions export exists')
      const surveyOptionsSource = surveyOptionsFunction.getText(
        surveyOptionsFile,
      )
      for (const marker of [
        'optionWidth',
        'marginTop',
        'tabIndex={-1}',
        'onSelect(key)',
        'userMessageBackgroundHover',
      ]) {
        assert.ok(
          surveyOptionsSource.includes(marker),
          'shared option behavior marker ' + marker,
        )
      }

      const feedbackSource = replayed.get(
        'src/components/FeedbackSurvey/FeedbackSurveyView.tsx',
      )
      assert.equal(feedbackSource.split("'4': 'not_sure'").length - 1, 1)
      assert.equal(feedbackSource.split("label: 'Unsure'").length - 1, 1)
      assert.match(
        feedbackSource,
        /if \(input === '4'\) return showNotSure/,
      )
      assert.match(
        feedbackSource,
        /isValidDigit: digit => isValidResponseInput\(digit, showNotSure\)/,
      )
      assert.equal(feedbackSource.split('mountDelayMs,').length - 1, 2)
      assert.equal(feedbackSource.split('optionWidth={OPTION_WIDTH}').length - 1, 1)

      const memorySource = replayed.get(
        'src/components/FeedbackSurvey/MemoryWriteSurvey.tsx',
      )
      assert.equal(
        memorySource.split("from './SurveyOptions.js'").length - 1,
        1,
      )
      assert.equal(memorySource.split('function SurveyOptions(').length - 1, 0)
      assert.equal(memorySource.split('optionWidth={OPTION_WIDTH}').length - 1, 1)
      assert.equal(memorySource.split("label: 'Keep'").length - 1, 1)
      assert.equal(memorySource.split("label: 'Undo'").length - 1, 1)
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 MoreRight session-restoration replay is AST-bound and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-moreright-session-replay-'),
    )
    try {
      const inputStates = new Map()
      for (const owner of TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': moreright-session replay input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
        fs.writeFileSync(temporaryFile, input.bytes)
        inputStates.set(owner.ownerPath, input.state)
      }
      const expectedChanges =
        TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners
          .filter(owner => inputStates.get(owner.ownerPath) === 'preimage')
          .map(owner => ({
            ownerPath: owner.ownerPath,
            targetIndex: 21277,
          }))
      assert.deepEqual(
        replayTarget120MoreRightSessionRestorationSupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state:
            expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120MoreRightSessionRestorationSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const replayed = new Map()
      for (const owner of TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners) {
        const filename = path.join(temporaryRoot, owner.ownerPath.slice(4))
        const downstreamOwner = TARGET120_REPL_SURVEY_STACK_REPLAY.owners.find(
          candidate => candidate.ownerPath === owner.ownerPath,
        )
        const expectedPostimage =
          inputStates.get(owner.ownerPath) === 'downstream-postimage'
            ? downstreamOwner.postimage
            : owner.postimage
        const bytes = readExact(
          filename,
          expectedPostimage,
          owner.ownerPath + ': moreright-session replay postimage',
        )
        const source = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0)
        replayed.set(owner.ownerPath, source)
      }

      const hookSource = replayed.get('src/moreright/useMoreRight.tsx')
      for (const marker of [
        'resultDedupState?: M;',
        'onSessionRestored: (all: M[]) => Promise<void>;',
        'ownsInput: boolean;',
        'onSessionRestored: async () => {},',
        'ownsInput: false',
      ]) {
        assert.equal(
          hookSource.split(marker).length - 1,
          1,
          'MoreRight stub contract marker ' + marker,
        )
      }

      const replSource = replayed.get('src/screens/REPL.tsx')
      assert.equal(replSource.split('mrOnSessionRestored').length - 1, 4)
      assert.equal(replSource.split('mrOwnsInput').length - 1, 3)
      assert.match(
        replSource,
        /onTurnComplete: mrOnTurnComplete,\n    onSessionRestored: mrOnSessionRestored,\n    render: mrRender,\n    ownsInput: mrOwnsInput/,
      )
      assert.match(
        replSource,
        /setToolJSX,\n    resultDedupState: resultDedupStateRef\.current\n  \}\);/,
      )
      assert.match(
        replSource,
        /restoreSessionCronTasks\(initialMessages\);\n      void mrOnSessionRestored\(initialMessages\);/,
      )
      assert.match(
        replSource,
        /setMessages\(prev\.slice\(0, messageIndex\)\);\n    void mrOnSessionRestored\(prev\.slice\(0, messageIndex\)\);\n    \/\/ Careful, this has to happen after setMessages/,
      )
      assert.match(
        replSource,
        /\}, \[setMessages, setAppState, mrOnSessionRestored\]\);/,
      )
      assert.equal(
        replSource.split(
          'hasActiveLocalJsxUI: isShowingLocalJSXCommand || mrOwnsInput',
        ).length - 1,
        1,
      )
      assert.equal(
        replSource.split(
          'onOpenBackgroundTasks: isShowingLocalJSXCommand || mrOwnsInput ? undefined : () => setShowBashesDialog(true)',
        ).length - 1,
        1,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 REPL survey-stack replay is authenticated-source-shaped, AST-bound, and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 source root is required'
        : false,
  },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-repl-survey-stack-replay-'),
    )
    try {
      const prerequisiteStates = new Map()
      for (const owner of TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': REPL survey prerequisite input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
        fs.writeFileSync(temporaryFile, input.bytes)
        prerequisiteStates.set(owner.ownerPath, input.state)
      }
      const prerequisiteChanges =
        TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners
          .filter(owner => prerequisiteStates.get(owner.ownerPath) === 'preimage')
          .map(owner => ({
            ownerPath: owner.ownerPath,
            targetIndex:
              TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.targetIndex,
          }))
      assert.deepEqual(
        replayTarget120MoreRightSessionRestorationSupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: prerequisiteChanges,
          state:
            prerequisiteChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )

      const inputStates = new Map()
      for (const owner of TARGET120_REPL_SURVEY_STACK_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const temporaryFile = path.join(temporaryRoot, relativePath)
        let input
        if (fs.existsSync(temporaryFile)) {
          const bytes = fs.readFileSync(temporaryFile)
          const actual = descriptor(bytes)
          if (
            actual.bytes === owner.preimage.bytes &&
            actual.sha256 === owner.preimage.sha256
          ) {
            input = { bytes, state: 'preimage' }
          } else if (
            actual.bytes === owner.postimage.bytes &&
            actual.sha256 === owner.postimage.sha256
          ) {
            input = { bytes, state: 'postimage' }
          } else {
            assert.fail(
              `${owner.ownerPath}: prepared REPL survey input is neither pinned preimage nor postimage: ${JSON.stringify(actual)}`,
            )
          }
        } else {
          input = readReplayInput(
            path.join(sourceRoot, relativePath),
            owner,
            owner.ownerPath + ': REPL survey replay input',
          )
          fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
          fs.writeFileSync(temporaryFile, input.bytes)
        }
        inputStates.set(owner.ownerPath, input.state)
      }
      const expectedChanges = TARGET120_REPL_SURVEY_STACK_REPLAY.owners
        .filter(owner => inputStates.get(owner.ownerPath) === 'preimage')
        .map(owner => ({
          ownerPath: owner.ownerPath,
          targetIndices: TARGET120_REPL_SURVEY_STACK_REPLAY.targetIndices,
        }))
      assert.deepEqual(
        replayTarget120ReplSurveyStackSupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state:
            expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120ReplSurveyStackSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const replayed = new Map()
      for (const owner of TARGET120_REPL_SURVEY_STACK_REPLAY.owners) {
        const filename = path.join(temporaryRoot, owner.ownerPath.slice(4))
        const bytes = readExact(
          filename,
          owner.postimage,
          owner.ownerPath + ': REPL survey replay postimage',
        )
        const source = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        )
        assert.equal(
          sourceFile.parseDiagnostics.length,
          0,
          owner.ownerPath + ': REPL survey postimage parses',
        )
        replayed.set(owner.ownerPath, source)
      }

      const surveyState = replayed.get(
        'src/components/FeedbackSurvey/useSurveyState.tsx',
      )
      for (const marker of [
        'const SUBMIT_DELAY_MS = 3000;',
        "setState('pending');",
        'pendingSubmitTimer.current = setTimeout(processSelection, SUBMIT_DELAY_MS, selected);',
        'clearTimeout(pendingSubmitTimer.current);',
        "setState('open');",
        'handleUndo,',
      ]) {
        assert.ok(surveyState.includes(marker), 'survey-state marker ' + marker)
      }

      const feedback = replayed.get(
        'src/components/FeedbackSurvey/FeedbackSurvey.tsx',
      )
      for (const marker of [
        "state === 'pending'",
        'onUndo={handleUndo}',
        'useKeybindingPreDispatch((_input, key) => {',
        'if (key.escape)',
        "not_sure: 'Unsure'",
        'memoryEvaluation?: MemorySurveyEvaluation;',
        'showNotSure?: boolean;',
        'mountDelayMs: 0,',
      ]) {
        assert.ok(feedback.includes(marker), 'feedback-view marker ' + marker)
      }

      const feedbackHook = replayed.get(
        'src/components/FeedbackSurvey/useFeedbackSurvey.tsx',
      )
      assert.ok(feedbackHook.includes("'pending'"))
      assert.equal(feedbackHook.split('handleUndo,').length - 1, 2)

      const memoryHook = replayed.get(
        'src/components/FeedbackSurvey/useMemorySurvey.tsx',
      )
      for (const marker of [
        "const MEMORY_SURVEY_PROBABILITY_GATE = 'tengu_velvet_moth';",
        'lastMemoryEvaluation?: LastMemoryEvaluation;',
        'evaluationRef.current = nextEvaluation;',
        'judge_classification:',
        'memory_impact_summary?: string | null;',
        'evaluation,',
        'handleUndo,',
      ]) {
        assert.ok(memoryHook.includes(marker), 'memory-survey marker ' + marker)
      }

      const postCompactHook = replayed.get(
        'src/components/FeedbackSurvey/usePostCompactSurvey.tsx',
      )
      assert.equal(postCompactHook.split('handleUndo').length - 1, 4)

      const repl = replayed.get('src/screens/REPL.tsx')
      const priorities = [
        "states.memoryWrite !== 'closed'",
        "states.postCompact !== 'closed'",
        "states.memory !== 'closed'",
        "states.feedback !== 'closed'",
        "states.frustration !== 'closed'",
      ].map(marker => repl.indexOf(marker))
      assert.ok(priorities.every(index => index >= 0))
      assert.deepEqual([...priorities].sort((a, b) => a - b), priorities)
      for (const marker of [
        'function ActiveSurvey(t0)',
        'handleUndo={postCompactSurvey.handleUndo}',
        'handleUndo={memorySurvey.handleUndo}',
        'handleUndo={feedbackSurvey.handleUndo}',
        'memoryEvaluation={memorySurvey.evaluation ?? undefined}',
        'showNotSure={true}',
        '<ActiveSurvey memoryWriteSurvey={memoryWriteSurvey}',
      ]) {
        assert.equal(repl.split(marker).length - 1, 1, 'REPL marker ' + marker)
      }
      assert.equal(repl.includes('showedTranscriptPrompt'), false)
      assert.equal(
        repl.includes('Frustration-triggered transcript sharing prompt'),
        false,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 classifier-surface telemetry replay is AST-bound and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 historical source root is required'
        : false,
  },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-classifier-surface-replay-'),
    )
    try {
      const inputStates = new Map()
      for (const owner of TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': classifier-surface replay input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
        fs.writeFileSync(temporaryFile, input.bytes)
        inputStates.set(owner.ownerPath, input.state)
      }
      const expectedChanges =
        TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY.owners
          .filter(owner => inputStates.get(owner.ownerPath) === 'preimage')
          .map(owner => ({
            ownerPath: owner.ownerPath,
            targetIndices: [14042, 14060],
          }))
      assert.deepEqual(
        replayTarget120ClassifierSurfaceTelemetrySupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state:
            expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120ClassifierSurfaceTelemetrySupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const replayed = new Map()
      for (const owner of TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY.owners) {
        const filename = path.join(temporaryRoot, owner.ownerPath.slice(4))
        const bytes = readExact(
          filename,
          owner.postimage,
          owner.ownerPath + ': classifier-surface replay postimage',
        )
        const source = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0)
        replayed.set(owner.ownerPath, source)
      }
      const classifier = replayed.get('src/jobs/classifier.ts')
      assert.equal(
        classifier.split('function surfaceFlags(').length - 1,
        1,
      )
      assert.equal(classifier.split('...surfaceFlags(surfaces)').length - 1, 3)
      assert.match(
        classifier,
        /logEvent\('tengu_bg_classify', \{\n    path,\n    engine,\n    \.\.\.surfaceFlags\(surfaces\),/,
      )
      const stopHooks = replayed.get('src/query/stopHooks.ts')
      assert.equal(stopHooks.split('const classifierSurfaces =').length - 1, 1)
      assert.equal(stopHooks.split('classifierSurfaces!,').length - 1, 1)
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 orphan-pty-sidecar replay is AST-bound and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 historical source root is required'
        : false,
  },
  async () => {
    const input = readReplayInput(
      path.join(
        sourceRoot,
        TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.ownerPath.slice(4),
      ),
      TARGET120_ORPHAN_PTY_SIDECAR_REPLAY,
      'orphan-pty-sidecar replay input',
    )
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-orphan-pty-sidecar-replay-'),
    )
    try {
      const temporaryFile = path.join(
        temporaryRoot,
        TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.ownerPath.slice(4),
      )
      fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
      fs.writeFileSync(temporaryFile, input.bytes)
      assert.deepEqual(
        replayTarget120OrphanPtySidecarSupplement({
          sourceRoot: temporaryRoot,
        }),
        input.state === 'preimage'
          ? {
              changes: [
                {
                  ownerPath: TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.ownerPath,
                  targetIndex: 19480,
                },
              ],
              state: 'replayed',
            }
          : { changes: [], state: 'already-replayed' },
      )
      const replayed = readExact(
        temporaryFile,
        TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.postimage,
        'orphan-pty-sidecar replay postimage',
      )
      assert.deepEqual(
        replayTarget120OrphanPtySidecarSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const source = replayed.toString('utf8')
      const sourceFile = ts.createSourceFile(
        temporaryFile,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      for (const marker of [
        "const sockets = new Set(entries.filter(entry => entry.endsWith('.sock')))",
        "entry.endsWith('.sock.err')",
        '!sockets.has(entry.slice(0, -4))',
        'void unlink(join(ptyDir, entry)).catch(() => {})',
        "encodeControlFrame({ t: 'kill', sig: 'SIGTERM' })",
      ]) {
        assert.equal(source.split(marker).length - 1, 1, marker)
      }

      const sidecarsToDelete = entries => {
        const sockets = new Set(entries.filter(entry => entry.endsWith('.sock')))
        return entries.filter(
          entry =>
            entry.endsWith('.sock.err') &&
            !sockets.has(entry.slice(0, -4)),
        )
      }
      assert.deepEqual(
        sidecarsToDelete([
          'active.sock',
          'active.sock.err',
          'stale.sock.err',
          'unrelated.txt',
        ]),
        ['stale.sock.err'],
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 daemon status, recovery, and telemetry replay is AST-bound and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 historical source root is required'
        : false,
  },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-daemon-status-replay-'),
    )
    try {
      const inputStates = new Map()
      for (const owner of TARGET120_DAEMON_STATUS_RECOVERY_TELEMETRY_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': daemon-status replay input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
        fs.writeFileSync(temporaryFile, input.bytes)
        inputStates.set(owner.ownerPath, input.state)
      }
      const expectedChanges =
        TARGET120_DAEMON_STATUS_RECOVERY_TELEMETRY_REPLAY.owners
          .filter(owner => inputStates.get(owner.ownerPath) === 'preimage')
          .map(owner => ({
            ownerPath: owner.ownerPath,
            targetIndices: owner.targetIndices,
          }))
      assert.deepEqual(
        replayTarget120DaemonStatusRecoveryTelemetrySupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state:
            expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120DaemonStatusRecoveryTelemetrySupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const parsed = new Map()
      const replayed = new Map()
      for (const owner of TARGET120_DAEMON_STATUS_RECOVERY_TELEMETRY_REPLAY.owners) {
        const filename = path.join(temporaryRoot, owner.ownerPath.slice(4))
        const bytes = readExact(
          filename,
          owner.postimage,
          owner.ownerPath + ': daemon-status replay postimage',
        )
        const source = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          owner.ownerPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0)
        parsed.set(owner.ownerPath, sourceFile)
        replayed.set(owner.ownerPath, source)
      }

      const mainSource = replayed.get('src/daemon/main.ts')
      const mainFile = parsed.get('src/daemon/main.ts')
      const telemetryUptimeInitializers = new Map()
      function visitMain(node) {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(mainFile) === 'logEvent' &&
          node.arguments.length >= 2 &&
          ts.isStringLiteral(node.arguments[0]) &&
          ts.isObjectLiteralExpression(node.arguments[1])
        ) {
          const eventName = node.arguments[0].text
          const uptimeProperty = node.arguments[1].properties.find(
            property =>
              ts.isPropertyAssignment(property) &&
              property.name.getText(mainFile) === 'uptime_ms',
          )
          if (uptimeProperty && ts.isPropertyAssignment(uptimeProperty)) {
            telemetryUptimeInitializers.set(
              eventName,
              uptimeProperty.initializer.getText(mainFile),
            )
          }
        }
        ts.forEachChild(node, visitMain)
      }
      visitMain(mainFile)
      assert.deepEqual(
        Object.fromEntries(telemetryUptimeInitializers),
        {
          tengu_daemon_worker_permanent_exit: 'uptime',
          tengu_daemon_worker_crash: 'uptime',
        },
      )
      assert.equal(mainSource.split('uptime_ms: uptime').length - 1, 2)
      const duplicateDaemonStart = mainSource.indexOf(
        '  const running = await getRunningDaemon()',
      )
      const duplicateDaemonEnd = mainSource.indexOf(
        '    stream.end()',
        duplicateDaemonStart,
      )
      assert.ok(duplicateDaemonStart >= 0 && duplicateDaemonEnd > duplicateDaemonStart)
      const duplicateDaemonBlock = mainSource.slice(
        duplicateDaemonStart,
        duplicateDaemonEnd,
      )
      assert.ok(duplicateDaemonBlock.includes("process.platform === 'win32'"))
      for (const marker of [
        'taskkill /PID ${running.pid}',
        'Run `claude daemon stop` to stop it, then retry.',
      ]) {
        assert.equal(duplicateDaemonBlock.split(marker).length - 1, 1, marker)
      }

      const duplicateDaemonRecovery = (platform, pid) =>
        platform === 'win32'
          ? `Stop it with \`taskkill /PID ${pid}\`, then retry.`
          : 'Run `claude daemon stop` to stop it, then retry.'
      assert.equal(
        duplicateDaemonRecovery('win32', 4321),
        'Stop it with `taskkill /PID 4321`, then retry.',
      )
      assert.equal(
        duplicateDaemonRecovery('linux', 4321),
        'Run `claude daemon stop` to stop it, then retry.',
      )

      const cliSource = replayed.get('src/daemon/cli.ts')
      assert.equal(
        cliSource.split(
          'daemon service is not installed (service install is disabled in this version; the daemon runs on demand)',
        ).length - 1,
        1,
      )
      const hubSource = replayed.get('src/daemon/hub.tsx')
      assert.equal(
        hubSource.split('not installed (runs on demand)').length - 1,
        1,
      )
      assert.match(
        hubSource,
        /return data\.serviceInstalled[\s\S]*installed · not running[\s\S]*not installed \(runs on demand\)/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 skill-change-detector lifecycle replay is AST-bound and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 historical source root is required'
        : false,
  },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-skill-change-detector-replay-'),
    )
    try {
      const inputStates = new Map()
      for (const owner of TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          owner,
          owner.ownerPath + ': skill-change-detector replay input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
        fs.writeFileSync(temporaryFile, input.bytes)
        inputStates.set(owner.ownerPath, input.state)
      }
      const expectedChanges =
        TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY.owners
          .filter(owner => inputStates.get(owner.ownerPath) === 'preimage')
          .map(owner => ({
            ownerPath: owner.ownerPath,
            targetIndex: 20794,
          }))
      assert.deepEqual(
        replayTarget120SkillChangeDetectorLifecycleSupplement({
          sourceRoot: temporaryRoot,
        }),
        {
          changes: expectedChanges,
          state:
            expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
        },
      )
      assert.deepEqual(
        replayTarget120SkillChangeDetectorLifecycleSupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const ts = await loadTypeScript()
      const replayed = new Map()
      for (const owner of TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY.owners) {
        const filename = path.join(temporaryRoot, owner.ownerPath.slice(4))
        const bytes = readExact(
          filename,
          owner.postimage,
          owner.ownerPath + ': skill-change-detector replay postimage',
        )
        const source = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0)
        replayed.set(owner.ownerPath, source)
      }

      const refresh = replayed.get('src/utils/plugins/refresh.ts')
      assert.equal(refresh.split('const pluginsChanged = createSignal()').length - 1, 1)
      assert.equal(
        refresh.split('export const onPluginsChanged = pluginsChanged.subscribe')
          .length - 1,
        1,
      )
      assert.equal(refresh.split('pluginsChanged.emit()').length - 1, 1)

      const detector = replayed.get(
        'src/utils/skills/skillChangeDetector.ts',
      )
      for (const marker of [
        'export function createSkillChangeDetector(',
        'const unsubscribePluginChanges = onPluginsChanged(',
        'unsubscribeDynamicSkills = onDynamicSkillsLoaded(',
        "initializedWatcher.once('ready', resolve)",
        'unsubscribePluginChanges()',
        '[Symbol.asyncDispose]: dispose',
      ]) {
        assert.equal(detector.split(marker).length - 1, 1, marker)
      }
      assert.match(detector, /path\.split\(\/\[\/\\\\\]\//)
      assert.equal(detector.includes('testOverrides'), false)
      assert.equal(detector.includes('resetForTesting'), false)
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 cli-print control and telemetry replay is AST-bound and idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 historical source root is required'
        : false,
  },
  async () => {
    const replay = TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY
    const input = readReplayInput(
      path.join(sourceRoot, replay.ownerPath.slice(4)),
      replay,
      'cli-print replay input',
    )
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-cli-print-replay-'),
    )
    try {
      const temporaryFile = path.join(temporaryRoot, replay.ownerPath.slice(4))
      fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
      fs.writeFileSync(temporaryFile, input.bytes)
      assert.deepEqual(
        replayTarget120CliPrintControlTelemetrySupplement({
          sourceRoot: temporaryRoot,
        }),
        input.state === 'preimage'
          ? {
              changes: [
                {
                  ownerPath: replay.ownerPath,
                  targetIndices: replay.targetIndices,
                },
              ],
              state: 'replayed',
            }
          : { changes: [], state: 'already-replayed' },
      )
      const replayed = readExact(
        temporaryFile,
        replay.postimage,
        'cli-print replay postimage',
      )
      assert.deepEqual(
        replayTarget120CliPrintControlTelemetrySupplement({
          sourceRoot: temporaryRoot,
        }),
        { changes: [], state: 'already-replayed' },
      )

      const source = replayed.toString('utf8')
      const ts = await loadTypeScript()
      const sourceFile = ts.createSourceFile(
        temporaryFile,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      assert.equal(source.split('30_000').length - 1, 2)
      assert.equal(source.split("logEvent('tengu_sdk_result'").length - 1, 3)
      assert.equal(
        source.split("logEvent('tengu_sdk_session_crash'").length - 1,
        1,
      )
      for (const marker of [
        "message.subtype === 'api_retry'",
        "message.subtype === 'compact_boundary'",
        'sdkRetryStatus = Math.max(',
        'getTotalAPIDuration() - sdkApiDurationStart',
        "message.request.subtype === 'mcp_call'",
        'callMCPToolWithUrlElicitationRetry({',
        'structuredContent: result.structuredContent',
        '_meta: result._meta',
        'error.code === ErrorCode.UrlElicitationRequired',
        "error.name === 'McpSessionExpiredError'",
        'controlRequestAbortController.signal.addEventListener(',
        'controlRequestAbortController.signal.removeEventListener(',
      ]) {
        assert.equal(
          source.split(marker).length - 1,
          1,
          'cli-print source marker ' + marker,
        )
      }
      for (const compilerOnly of [
        "'2.1.120'",
        "'2026-04-24T19:00:49Z'",
        "'080f07fb4224786b965b9ea0a35f0cff594f2eb6'",
        "kind: 'peer'",
      ]) {
        assert.equal(
          source.includes(compilerOnly),
          false,
          'compiler-only residue is not admitted to source: ' + compilerOnly,
        )
      }

      fs.appendFileSync(temporaryFile, '\n// fail-closed tamper\n')
      assert.throws(
        () =>
          replayTarget120CliPrintControlTelemetrySupplement({
            sourceRoot: temporaryRoot,
          }),
        /pinned historical preimage/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'target120 cumulative supplement replay uses its frozen order and is idempotent',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target120 historical source root is required'
        : false,
  },
  () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target120-cumulative-tail-replay-'),
    )
    try {
      const expectedChanges = []
      const stage = (replay, change) => {
        const relativePath = replay.ownerPath.slice(4)
        const input = readReplayInput(
          path.join(sourceRoot, relativePath),
          replay,
          replay.ownerPath + ': cumulative replay input',
        )
        const temporaryFile = path.join(temporaryRoot, relativePath)
        if (input.bytes) {
          fs.mkdirSync(path.dirname(temporaryFile), { recursive: true })
          fs.writeFileSync(temporaryFile, input.bytes)
        }
        if (input.state === 'preimage') expectedChanges.push(change)
      }
      stage(TARGET120_BOOTSTRAP_STATE_REPLAY, {
        ownerPath: TARGET120_BOOTSTRAP_STATE_REPLAY.ownerPath,
        targetIndices: [370, 371],
      })
      stage(TARGET120_MANAGED_AGENTS_REPLAY, {
        ownerPath: TARGET120_MANAGED_AGENTS_REPLAY.ownerPath,
        targetIndex: 21627,
      })
      stage(TARGET120_SAFE_ENV_POWERSHELL_REPLAY, {
        ownerPath: TARGET120_SAFE_ENV_POWERSHELL_REPLAY.ownerPath,
        targetIndex: 11081,
      })
      for (const owner of TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY.owners) {
        stage(owner, {
          ownerPath: owner.ownerPath,
          targetIndices: [14042, 14060],
        })
      }
      for (const owner of TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY.owners) {
        stage(owner, {
          ownerPath: owner.ownerPath,
          targetIndex: 20794,
        })
      }
      stage(TARGET120_ORPHAN_PTY_SIDECAR_REPLAY, {
        ownerPath: TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.ownerPath,
        targetIndex: 19480,
      })
      for (const owner of TARGET120_DAEMON_STATUS_RECOVERY_TELEMETRY_REPLAY.owners) {
        stage(owner, {
          ownerPath: owner.ownerPath,
          targetIndices: owner.targetIndices,
        })
      }
      for (const owner of TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.owners) {
        stage(owner, {
          ownerPath: owner.ownerPath,
          targetIndex: 2576,
        })
      }
      const internalNetworkSourceDescriptor = descriptor(
        fs.readFileSync(
          path.join(
            sourceRoot,
            TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.ownerPath.slice(4),
          ),
        ),
      )
      if (
        internalNetworkSourceDescriptor.bytes !==
          TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.postimage.bytes ||
        internalNetworkSourceDescriptor.sha256 !==
          TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.postimage.sha256
      ) {
        expectedChanges.push({
          ownerPath: TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.ownerPath,
          targetIndex: TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.targetIndex,
        })
      }
      for (const owner of TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY.owners) {
        stage(owner, {
          ownerPath: owner.ownerPath,
          targetIndex: 13763,
        })
      }
      stage(TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY, {
        ownerPath: TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.ownerPath,
        targetIndex: TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY.targetIndex,
      })
      stage(TARGET120_MCP_EFFORT_FALLBACK_REPLAY, {
        ownerPath: TARGET120_MCP_EFFORT_FALLBACK_REPLAY.ownerPath,
        targetIndex: TARGET120_MCP_EFFORT_FALLBACK_REPLAY.targetIndex,
      })
      for (const owner of TARGET120_ULTRAREVIEW_NOOP_TASK_REGISTRY_REPLAY.owners) {
        stage(owner, {
          ownerPath: owner.ownerPath,
          targetIndex:
            TARGET120_ULTRAREVIEW_NOOP_TASK_REGISTRY_REPLAY.targetIndex,
        })
      }
      stage(TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY, {
        ownerPath: TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY.ownerPath,
        targetIndices: TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY.targetIndices,
      })
      for (const owner of TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY.owners) {
        stage(owner, {
          ownerPath: owner.ownerPath,
          targetIndices: owner.targetIndices,
        })
      }
      for (const owner of TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners) {
        stage(owner, {
          ownerPath: owner.ownerPath,
          targetIndex: 21277,
        })
      }
      for (const owner of TARGET120_REPL_SURVEY_STACK_REPLAY.owners) {
        const relativePath = owner.ownerPath.slice(4)
        const temporaryFile = path.join(temporaryRoot, relativePath)
        if (fs.existsSync(temporaryFile)) {
          const actual = descriptor(fs.readFileSync(temporaryFile))
          const priorOwner =
            TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners.find(
              candidate => candidate.ownerPath === owner.ownerPath,
            )
          const accepted = [owner.preimage, owner.postimage, priorOwner?.preimage]
            .filter(Boolean)
            .some(
              expected =>
                actual.bytes === expected.bytes &&
                actual.sha256 === expected.sha256,
            )
          assert.ok(
            accepted,
            owner.ownerPath + ': cumulative overlap has a pinned replay state',
          )
          if (
            actual.bytes !== owner.postimage.bytes ||
            actual.sha256 !== owner.postimage.sha256
          ) {
            expectedChanges.push({
              ownerPath: owner.ownerPath,
              targetIndices: TARGET120_REPL_SURVEY_STACK_REPLAY.targetIndices,
            })
          }
          continue
        }
        stage(owner, {
          ownerPath: owner.ownerPath,
          targetIndices: TARGET120_REPL_SURVEY_STACK_REPLAY.targetIndices,
        })
      }
      stage(TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY, {
        ownerPath: TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY.ownerPath,
        targetIndices: TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY.targetIndices,
      })
      assert.deepEqual(replayTarget120TailSupplements({ sourceRoot: temporaryRoot }), {
        changes: expectedChanges,
        state: expectedChanges.length > 0 ? 'replayed' : 'already-replayed',
      })
      assert.deepEqual(replayTarget120TailSupplements({ sourceRoot: temporaryRoot }), {
        changes: [],
        state: 'already-replayed',
      })
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
  },
)

test(
  'authenticated target120 proves bootstrap state, safe env, and the u21627 postimage',
  {
    skip:
      semanticCase !== fixture.case || !targetPath
        ? 'the exact target120 case and authenticated target bundle are required'
        : false,
  },
  () => {
    const targetBytes = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'authenticated target120 inner bundle',
    )
    const structuralBytes = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.structural.path),
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const region = structural.regions[21627]
    const targetUnit = targetBytes
      .toString('utf8')
      .slice(region.target.start, region.target.end)
    assert.equal(sha256(Buffer.from(targetUnit)), region.target.sourceHash)
    const ast = parse(targetUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const values = []
    walk(ast, node => {
      if (node.type === 'Literal' && typeof node.value === 'string') {
        values.push(node.value)
      }
    })
    const managedAgents = values.find(value =>
      value.startsWith('# Managed Agents — Endpoint Reference'),
    )
    assert.ok(managedAgents, 'managed-agents target literal')
    assert.deepEqual(
      descriptor(Buffer.from(managedAgents)),
      TARGET120_MANAGED_AGENTS_REPLAY.postimage,
    )
    assert.equal(
      managedAgents.split(TARGET120_MANAGED_AGENTS_REPLAY.after).length - 1,
      1,
    )
    assert.equal(
      managedAgents.split(TARGET120_MANAGED_AGENTS_REPLAY.before).length - 1,
      0,
    )

    const targetText = targetBytes.toString('utf8')
    const exportRegion = structural.regions[370]
    const exportUnit = targetText.slice(
      exportRegion.target.start,
      exportRegion.target.end,
    )
    assert.equal(sha256(Buffer.from(exportUnit)), exportRegion.target.sourceHash)
    for (const marker of [
      'setFridayFundayDisabledForSession',
      'resetInteractionBaseline',
      'getFridayFundayDisabledForSession',
    ]) {
      assert.ok(exportUnit.includes(marker), 'u370 export marker ' + marker)
    }
    const initialRegion = structural.regions[371]
    const initialUnit = targetText.slice(
      initialRegion.target.start,
      initialRegion.target.end,
    )
    assert.equal(sha256(Buffer.from(initialUnit)), initialRegion.target.sourceHash)
    assert.ok(initialUnit.includes('fridayFundayDisabledForSession:!1'))
    assert.ok(
      targetText.includes(
        'function hm4(){return p$.fridayFundayDisabledForSession}',
      ),
      'authenticated target getter reads the session flag',
    )
    assert.ok(
      targetText.includes(
        'function Im4(){p$.fridayFundayDisabledForSession=!0}',
      ),
      'authenticated target setter permanently disables the session feature',
    )

    const safeEnvRegion = structural.regions[11081]
    const safeEnvUnit = targetText.slice(
      safeEnvRegion.target.start,
      safeEnvRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(safeEnvUnit)),
      safeEnvRegion.target.sourceHash,
    )
    assert.equal(
      safeEnvUnit.split('CLAUDE_CODE_USE_POWERSHELL_TOOL').length - 1,
      1,
      'authenticated target safe-env set contains the PowerShell gate once',
    )

    const environmentShellRegion = structural.regions[2576]
    const environmentShellUnit = targetText.slice(
      environmentShellRegion.target.start,
      environmentShellRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(environmentShellUnit)),
      environmentShellRegion.target.sourceHash,
    )
    const environmentShellAst = parse(environmentShellUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const environmentProperties = []
    walk(environmentShellAst, node => {
      if (
        node.type === 'MemberExpression' &&
        !node.computed &&
        node.property?.type === 'Identifier'
      ) {
        environmentProperties.push(node.property.name)
      }
    })
    assert.ok(environmentProperties.includes('SHELL'))
    assert.ok(environmentProperties.includes('COMSPEC'))
    assert.equal(environmentShellUnit.split('||').length - 1, 2)
    const environmentShellFunction = environmentShellAst.body[0]
    assert.equal(environmentShellFunction.type, 'FunctionDeclaration')
    assert.equal(
      targetText.split(`shell:${environmentShellFunction.id.name}()`).length - 1,
      1,
      'authenticated environment context invokes the COMSPEC-aware classifier',
    )

    const internalNetworkRegion = structural.regions[2578]
    const internalNetworkUnit = targetText.slice(
      internalNetworkRegion.target.start,
      internalNetworkRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(internalNetworkUnit)),
      internalNetworkRegion.target.sourceHash,
    )
    const internalNetworkAst = parse(internalNetworkUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const internalNetworkProbeBindings = []
    walk(internalNetworkAst, node => {
      if (
        node.type === 'Property' &&
        !node.computed &&
        node.key?.type === 'Identifier' &&
        node.key.name === 'probeInternalNetworkAccess' &&
        node.value?.type === 'Identifier'
      ) {
        internalNetworkProbeBindings.push(node.value.name)
      }
    })
    assert.equal(internalNetworkProbeBindings.length, 1)
    const internalNetworkProbeName = internalNetworkProbeBindings[0]
    assert.equal(
      targetText.split(
        `async function ${internalNetworkProbeName}(){return null}`,
      ).length - 1,
      1,
      'authenticated target binds the environment probe to one fail-closed null stub',
    )

    const exitWorktreeRegion = structural.regions[13763]
    const exitWorktreeUnit = targetText.slice(
      exitWorktreeRegion.target.start,
      exitWorktreeRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(exitWorktreeUnit)),
      exitWorktreeRegion.target.sourceHash,
    )
    parse(exitWorktreeUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    assert.equal(
      exitWorktreeUnit.split('Cleaning up worktree').length - 1,
      1,
      'authenticated target names destructive worktree removal as cleanup',
    )
    assert.equal(
      exitWorktreeUnit.split(
        'ExitWorktree cannot be called from a subagent with a cwd override',
      ).length - 1,
      1,
      'authenticated target refuses process-wide cwd mutation under an override',
    )
    assert.match(
      exitWorktreeUnit,
      /userFacingName\([^)]*\)\{return [^}]*\?\.action==="remove"\?"Cleaning up worktree":"Exiting worktree"\}/,
    )
    const cwdOverrideDetectors = [
      ...targetText.matchAll(
        /function ([\w$]+)\(\)\{return ([\w$]+)\.getStore\(\)!==void 0\}/g,
      ),
    ]
    const invokedCwdOverrideDetector = cwdOverrideDetectors.find(match =>
      exitWorktreeUnit.includes(`if(${match[1]}())`),
    )
    assert.ok(
      invokedCwdOverrideDetector,
      'authenticated ExitWorktree guard invokes an AsyncLocalStorage presence detector',
    )

    const ccrStatusRegion = structural.regions[19809]
    const ccrStatusUnit = targetText.slice(
      ccrStatusRegion.target.start,
      ccrStatusRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(ccrStatusUnit)),
      ccrStatusRegion.target.sourceHash,
    )
    const ccrStatusAst = parse(ccrStatusUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const ccrStatusFunction = ccrStatusAst.body[0]
    assert.equal(ccrStatusFunction.type, 'FunctionDeclaration')
    assert.equal(ccrStatusFunction.body.body.length, 1)
    assert.equal(ccrStatusFunction.body.body[0].type, 'ReturnStatement')
    assert.equal(ccrStatusUnit.split('"status_category"in').length - 1, 1)
    assert.equal(ccrStatusUnit.split('.status_category').length - 1, 1)
    assert.match(
      ccrStatusUnit,
      /!==null&&typeof [\w$]+==="object"&&"status_category"in [\w$]+&&typeof [\w$]+\.status_category==="string"/,
    )

    const mcpEffortRegion = structural.regions[21892]
    const mcpEffortUnit = targetText.slice(
      mcpEffortRegion.target.start,
      mcpEffortRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(mcpEffortUnit)),
      mcpEffortRegion.target.sourceHash,
    )
    const mcpEffortAst = parse(mcpEffortUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const effortFallbacks = []
    walk(mcpEffortAst, node => {
      if (
        node.type === 'Property' &&
        !node.computed &&
        node.key?.type === 'Identifier' &&
        node.key.name === 'getEffortValue'
      ) {
        effortFallbacks.push(node.value)
      }
    })
    assert.equal(effortFallbacks.length, 1)
    const effortFallback = effortFallbacks[0]
    assert.equal(effortFallback.type, 'ArrowFunctionExpression')
    assert.equal(effortFallback.params.length, 0)
    assert.equal(effortFallback.body.type, 'BlockStatement')
    assert.equal(effortFallback.body.body.length, 1)
    assert.equal(effortFallback.body.body[0].type, 'ReturnStatement')
    assert.equal(effortFallback.body.body[0].argument, null)

    const ultrareviewRegion = structural.regions[21966]
    const ultrareviewUnit = targetText.slice(
      ultrareviewRegion.target.start,
      ultrareviewRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(ultrareviewUnit)),
      ultrareviewRegion.target.sourceHash,
    )
    const ultrareviewAst = parse(ultrareviewUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const taskRegistryBindings = []
    walk(ultrareviewAst, node => {
      if (
        node.type === 'Property' &&
        !node.computed &&
        node.key?.type === 'Identifier' &&
        node.key.name === 'taskRegistry' &&
        node.value?.type === 'Identifier'
      ) {
        taskRegistryBindings.push(node.value.name)
      }
    })
    assert.equal(taskRegistryBindings.length, 1)
    const taskRegistryBinding = taskRegistryBindings[0]
    assert.ok(ultrareviewUnit.includes('skipTaskRegistration:!0'))
    assert.equal(
      targetText.split(
        `${taskRegistryBinding}={register(){},update(){},remove(){},evictTerminal(){},applyOffsetsAndEvict(){},get(){return},all(){return{}}}`,
      ).length - 1,
      1,
      'authenticated Ultrareview context receives the shared exact no-op registry',
    )

    const fleetRowRegion = structural.regions[19627]
    const fleetRowUnit = targetText.slice(
      fleetRowRegion.target.start,
      fleetRowRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(fleetRowUnit)),
      fleetRowRegion.target.sourceHash,
    )
    parse(fleetRowUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    assert.ok(fleetRowUnit.includes('deleteArmed:w,attaching:j'))
    assert.ok(fleetRowUnit.includes('W=j?void 0:'))

    const fleetViewRegion = structural.regions[19629]
    const fleetViewUnit = targetText.slice(
      fleetViewRegion.target.start,
      fleetViewRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(fleetViewUnit)),
      fleetViewRegion.target.sourceHash,
    )
    parse(fleetViewUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    for (const marker of [
      '.sort().join("\\x00")',
      '.split("\\x00")',
      'attaching:DH===s6.id',
      'canPin:!!f7&&!Cv',
    ]) {
      assert.equal(
        fleetViewUnit.split(marker).length - 1,
        1,
        'authenticated FleetView marker ' + marker,
      )
    }

    const feedbackUnits = new Map()
    for (const targetIndex of TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY.targetIndices) {
      const feedbackRegion = structural.regions[targetIndex]
      const feedbackUnit = targetText.slice(
        feedbackRegion.target.start,
        feedbackRegion.target.end,
      )
      assert.equal(
        sha256(Buffer.from(feedbackUnit)),
        feedbackRegion.target.sourceHash,
        'authenticated feedback structural hash u' + targetIndex,
      )
      const feedbackAst = parse(feedbackUnit, {
        allowHashBang: true,
        ecmaVersion: 'latest',
        sourceType: 'module',
      })
      feedbackUnits.set(targetIndex, { source: feedbackUnit, ast: feedbackAst })
    }
    const surveyOptionsFunction = feedbackUnits.get(20931).ast.body[0]
    assert.equal(surveyOptionsFunction.type, 'FunctionDeclaration')
    const surveyOptionsName = surveyOptionsFunction.id.name
    const sharedOptionsUnit = feedbackUnits.get(20931).source
    for (const marker of [
      'options:',
      'optionWidth:',
      'onSelect:',
      'marginTop:',
      'tabIndex:-1',
      'userMessageBackgroundHover',
    ]) {
      assert.ok(
        sharedOptionsUnit.includes(marker),
        'authenticated shared survey option marker ' + marker,
      )
    }
    const feedbackViewUnit = feedbackUnits.get(20935).source
    for (const marker of [
      'messageBold:',
      'mountDelayMs:',
      'showNotSure:',
      'optionWidth:',
      'wrap:"wrap"',
    ]) {
      assert.ok(
        feedbackViewUnit.includes(marker),
        'authenticated feedback view marker ' + marker,
      )
    }
    assert.ok(
      feedbackViewUnit.includes(`createElement(${surveyOptionsName},`),
      'authenticated feedback view uses the shared option component',
    )
    assert.match(
      targetText,
      /\{"0":"dismissed","1":"bad","2":"fine","3":"good","4":"not_sure"\}/,
    )
    assert.match(targetText, /\{key:"4",label:"Unsure"\}/)
    const memoryWriteDigitGuard = feedbackUnits.get(20951).ast.body[0]
    assert.equal(memoryWriteDigitGuard.type, 'FunctionDeclaration')
    assert.equal(memoryWriteDigitGuard.body.body.length, 1)
    const memoryWriteDigitReturn = memoryWriteDigitGuard.body.body[0]
    assert.equal(memoryWriteDigitReturn.type, 'ReturnStatement')
    assert.equal(memoryWriteDigitReturn.argument.type, 'LogicalExpression')
    assert.equal(memoryWriteDigitReturn.argument.operator, '||')
    assert.deepEqual(
      [
        memoryWriteDigitReturn.argument.left.right.value,
        memoryWriteDigitReturn.argument.right.right.value,
      ],
      ['1', '2'],
      'authenticated MemoryWriteSurvey digit guard accepts only Keep/Undo',
    )
    const memoryWriteUnit = feedbackUnits.get(20952).source
    assert.ok(
      memoryWriteUnit.includes(
        `isValidDigit:${memoryWriteDigitGuard.id.name}`,
      ),
      'authenticated MemoryWriteSurvey consumes its adjacent exact digit guard',
    )
    assert.ok(
      memoryWriteUnit.includes(`createElement(${surveyOptionsName},`),
      'authenticated memory-write survey uses the shared option component',
    )
    assert.ok(memoryWriteUnit.includes('optionWidth:'))
    for (const marker of ['Memory ', 'updated', 'written', 'auto-hides in ']) {
      assert.equal(
        memoryWriteUnit.split(marker).length - 1,
        1,
        'authenticated memory-write marker ' + marker,
      )
    }

    const surfaceFlagsRegion = structural.regions[14042]
    const surfaceFlagsUnit = targetText.slice(
      surfaceFlagsRegion.target.start,
      surfaceFlagsRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(surfaceFlagsUnit)),
      surfaceFlagsRegion.target.sourceHash,
    )
    assert.ok(
      surfaceFlagsUnit.includes('`surface_${q}`'),
      'authenticated target derives a boolean flag per classifier surface',
    )
    const classifierRegion = structural.regions[14060]
    const classifierUnit = targetText.slice(
      classifierRegion.target.start,
      classifierRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(classifierUnit)),
      classifierRegion.target.sourceHash,
    )
    assert.ok(classifierUnit.includes('engine:A'))
    assert.ok(classifierUnit.includes('...dJ6(z)'))

    const orphanPtyRegion = structural.regions[19480]
    const orphanPtyUnit = targetText.slice(
      orphanPtyRegion.target.start,
      orphanPtyRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(orphanPtyUnit)),
      orphanPtyRegion.target.sourceHash,
    )
    for (const marker of [
      '.endsWith(".sock.err")',
      '.has(z.slice(0,-4))',
      '{t:"kill",sig:"SIGTERM"}',
    ]) {
      assert.equal(
        orphanPtyUnit.split(marker).length - 1,
        1,
        'authenticated orphan PTY marker ' + marker,
      )
    }

    const daemonUnits = new Map()
    for (const targetIndex of [18593, 19492, 19500, 19509]) {
      const daemonRegion = structural.regions[targetIndex]
      const daemonUnit = targetText.slice(
        daemonRegion.target.start,
        daemonRegion.target.end,
      )
      assert.equal(
        sha256(Buffer.from(daemonUnit)),
        daemonRegion.target.sourceHash,
        'authenticated daemon structural hash u' + targetIndex,
      )
      parse(daemonUnit, {
        allowHashBang: true,
        ecmaVersion: 'latest',
        sourceType: 'module',
      })
      daemonUnits.set(targetIndex, daemonUnit)
    }
    assert.equal(
      daemonUnits.get(18593).split('not installed (runs on demand)').length - 1,
      1,
      'authenticated daemon hub reports the on-demand status',
    )
    const workerTelemetryUnit = daemonUnits.get(19492)
    assert.equal(workerTelemetryUnit.split('uptime_ms:').length - 1, 2)
    for (const eventName of [
      'tengu_daemon_worker_permanent_exit',
      'tengu_daemon_worker_crash',
    ]) {
      assert.equal(
        workerTelemetryUnit.split(eventName).length - 1,
        1,
        'authenticated daemon worker event ' + eventName,
      )
    }
    const duplicateDaemonUnit = daemonUnits.get(19500)
    assert.equal(duplicateDaemonUnit.split('taskkill /PID').length - 1, 1)
    assert.equal(duplicateDaemonUnit.split('claude daemon stop').length - 1, 1)
    assert.match(
      duplicateDaemonUnit,
      /another daemon is already running \(pid=\$\{[^}]+\}, version=\$\{[^}]+\}\)\. \$\{[^}]+\}/,
    )
    assert.equal(
      daemonUnits
        .get(19509)
        .split(
          'daemon service is not installed (service install is disabled in this version; the daemon runs on demand)',
        ).length - 1,
      1,
      'authenticated service gate explains the on-demand policy',
    )

    const skillChangeRegion = structural.regions[20794]
    const skillChangeUnit = targetText.slice(
      skillChangeRegion.target.start,
      skillChangeRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(skillChangeUnit)),
      skillChangeRegion.target.sourceHash,
    )
    for (const marker of [
      'Kf8.subscribe(()=>A.emit())',
      'W.once("ready",()=>Z())',
      '[Symbol.asyncDispose]:J',
      'subscribe:A.subscribe',
    ]) {
      assert.equal(
        skillChangeUnit.split(marker).length - 1,
        1,
        'authenticated skill-change detector marker ' + marker,
      )
    }
    const skillAst = parse(skillChangeUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const regexPatterns = []
    walk(skillAst, node => {
      if (node.type === 'Literal' && node.regex) {
        regexPatterns.push(node.regex.pattern)
      }
    })
    assert.ok(
      regexPatterns.includes('[/\\\\]'),
      'authenticated detector ignores .git for POSIX and Windows separators',
    )
    assert.equal(
      targetText.split('Kf8.emit()').length - 1,
      1,
      'authenticated plugin refresh emits exactly one detector invalidation',
    )

    const moreRightRegion = structural.regions[21277]
    const moreRightUnit = targetText.slice(
      moreRightRegion.target.start,
      moreRightRegion.target.end,
    )
    assert.equal(
      sha256(Buffer.from(moreRightUnit)),
      moreRightRegion.target.sourceHash,
      'authenticated MoreRight session-restoration structural hash',
    )
    const moreRightAst = parse(moreRightUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    let sessionRestoredAlias
    let ownsInputAlias
    let hookCall
    walk(moreRightAst, node => {
      if (node.type !== 'VariableDeclarator' || node.id?.type !== 'ObjectPattern') {
        return
      }
      const bindings = new Map(
        node.id.properties
          .filter(property => property.type === 'Property')
          .map(property => [property.key.name, property.value.name]),
      )
      if (bindings.has('onSessionRestored') && bindings.has('ownsInput')) {
        sessionRestoredAlias = bindings.get('onSessionRestored')
        ownsInputAlias = bindings.get('ownsInput')
        hookCall = node.init
      }
    })
    assert.ok(sessionRestoredAlias, 'authenticated target binds onSessionRestored')
    assert.ok(ownsInputAlias, 'authenticated target binds ownsInput')
    assert.equal(hookCall?.type, 'CallExpression')
    const hookArgument = hookCall.arguments[0]
    assert.equal(hookArgument?.type, 'ObjectExpression')
    const resultDedupProperty = hookArgument.properties.find(
      property =>
        property.type === 'Property' &&
        property.key?.name === 'resultDedupState',
    )
    assert.ok(resultDedupProperty, 'authenticated target passes result-dedup state')
    assert.equal(resultDedupProperty.value.type, 'MemberExpression')
    assert.equal(resultDedupProperty.value.property.name, 'current')

    const sessionRestoreCalls = []
    const ownedInputGates = new Map()
    walk(moreRightAst, node => {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === sessionRestoredAlias
      ) {
        sessionRestoreCalls.push(node)
      }
      if (
        node.type === 'Property' &&
        ['hasActiveLocalJsxUI', 'onOpenBackgroundTasks'].includes(
          node.key?.name,
        )
      ) {
        let containsOwnsInput = false
        walk(node.value, child => {
          if (
            child.type === 'Identifier' &&
            child.name === ownsInputAlias
          ) {
            containsOwnsInput = true
          }
        })
        if (containsOwnsInput) ownedInputGates.set(node.key.name, node.value)
      }
    })
    assert.equal(
      sessionRestoreCalls.length,
      2,
      'authenticated target restores MoreRight for initial and rewound transcripts',
    )
    assert.ok(
      sessionRestoreCalls.some(call => call.arguments[0]?.type === 'Identifier'),
      'authenticated initial transcript is passed to MoreRight',
    )
    assert.ok(
      sessionRestoreCalls.some(
        call =>
          call.arguments[0]?.type === 'CallExpression' &&
          call.arguments[0].callee?.type === 'MemberExpression' &&
          call.arguments[0].callee.property?.name === 'slice',
      ),
      'authenticated rewound transcript slice is passed to MoreRight',
    )
    assert.equal(
      ownedInputGates.get('hasActiveLocalJsxUI')?.type,
      'LogicalExpression',
      'authenticated queue processing honors MoreRight input ownership',
    )
    assert.equal(
      ownedInputGates.get('onOpenBackgroundTasks')?.type,
      'ConditionalExpression',
      'authenticated background navigation honors MoreRight input ownership',
    )
  },
)

test(
  'authenticated target120 proves the centralized REPL survey stack and undo lifecycle',
  {
    skip:
      semanticCase !== fixture.case || !targetPath
        ? 'the exact target120 case and authenticated target bundle are required'
        : false,
  },
  () => {
    const targetBytes = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'authenticated target120 inner bundle',
    )
    const structuralBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structural.path),
      {
        bytes: fixture.inputs.structural.bytes,
        sha256: fixture.inputs.structural.sha256,
      },
      'authenticated target120 structural ledger',
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const targetText = targetBytes.toString('utf8')
    const units = new Map()
    for (const targetIndex of TARGET120_REPL_SURVEY_STACK_REPLAY.targetIndices) {
      const region = structural.regions[targetIndex]
      assert.equal(region.target.index, targetIndex)
      assert.equal(region.target.parseStatus, 'parsed')
      const unit = targetText.slice(region.target.start, region.target.end)
      assert.equal(
        sha256(Buffer.from(unit)),
        region.target.sourceHash,
        'authenticated REPL survey structural hash u' + targetIndex,
      )
      units.set(targetIndex, unit)
    }

    const priorityUnit = units.get(20957)
    assert.equal(
      priorityUnit,
      'function UZ4(H){if(H.memoryWrite!=="closed")return"memoryWrite";if(H.postCompact!=="closed")return"postCompact";if(H.memory!=="closed")return"memory";if(H.feedback!=="closed")return"feedback";if(H.frustration!=="closed")return"frustration";return null}',
    )
    const dispatcherUnit = units.get(20958)
    const ast = parse(priorityUnit + dispatcherUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const functions = new Map(
      ast.body
        .filter(node => node.type === 'FunctionDeclaration')
        .map(node => [node.id.name, node]),
    )
    assert.deepEqual([...functions.keys()], ['UZ4', 'QZ4'])
    const switchCases = []
    walk(functions.get('QZ4'), node => {
      if (node.type === 'SwitchCase') switchCases.push(node.test?.value ?? null)
    })
    assert.deepEqual(switchCases, [
      'memoryWrite',
      'postCompact',
      'memory',
      'feedback',
      'frustration',
      null,
      null,
    ])
    for (const marker of [
      'memoryWriteSurvey:q,postCompactSurvey:K,memorySurvey:_,feedbackSurvey:A,frustrationDetection:z',
      'memoryWrite:q.state,postCompact:K.state,memory:_.state,feedback:A.state,frustration:z.state',
      'handleUndo:K.handleUndo',
      'handleUndo:_.handleUndo',
      'memoryEvaluation:w,showNotSure:!0',
      'handleUndo:A.handleUndo',
      'handleUndo:VG5',
      '$[36]!==z.handleTranscriptSelect||$[37]!==z.state||$[38]!==M||$[39]!==f',
    ]) {
      assert.equal(
        dispatcherUnit.split(marker).length - 1,
        1,
        'authenticated REPL dispatcher marker ' + marker,
      )
    }
    assert.equal(dispatcherUnit.split('$[37]').length - 1, 2)
    assert.equal(dispatcherUnit.split('$[38]').length - 1, 2)
    assert.equal(dispatcherUnit.split('$[39]').length - 1, 2)

    for (const marker of [
      'Y("pending"),j.current=setTimeout(P,F25,v)',
      'W=T0.useCallback(()=>{if(j.current)clearTimeout(j.current),j.current=null;M(null),w.current=null,Y("open")},[])',
      '{state:f,lastResponse:O,open:L,handleSelect:G,handleUndo:W,handleTranscriptSelect:Z}',
      'XG5={bad:"Bad",fine:"Fine",good:"Good",not_sure:"Unsure"}',
      'd25="tengu_velvet_moth"',
      '{state:P,lastResponse:G,evaluation:O,handleSelect:Z,handleUndo:v,handleTranscriptSelect:k}',
    ]) {
      assert.equal(
        targetText.split(marker).length - 1,
        1,
        'authenticated survey lifecycle marker ' + marker,
      )
    }
  },
)

test(
  'authenticated target120 proves cli-print telemetry, bounded drains, MCP control, and compiler residues',
  {
    skip:
      semanticCase !== fixture.case || !targetPath
        ? 'the exact target120 case and authenticated target bundle are required'
        : false,
  },
  () => {
    const replay = TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY
    const targetBytes = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'authenticated target120 inner bundle',
    )
    const structuralBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structural.path),
      {
        bytes: fixture.inputs.structural.bytes,
        sha256: fixture.inputs.structural.sha256,
      },
      'authenticated target120 structural ledger',
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const region = structural.regions[replay.targetIndices[0]]
    assert.equal(region.target.index, replay.targetIndices[0])
    assert.equal(region.target.parseStatus, 'parsed')
    assert.deepEqual(
      {
        bytes: region.target.end - region.target.start,
        sha256: region.target.sourceHash,
      },
      replay.targetRegion,
    )
    const targetUnit = targetBytes
      .toString('utf8')
      .slice(region.target.start, region.target.end)
    assert.deepEqual(descriptor(Buffer.from(targetUnit)), replay.targetRegion)
    const ast = parse(targetUnit, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })

    const literals = []
    const sdkResultPayloadKeys = []
    const timerCalls = []
    const mcpPayloads = []
    const abortListenerObjects = { add: new Set(), remove: new Set() }
    let mathMaxCalls = 0
    let readFileProperties = 0
    let urlElicitationCodeChecks = 0
    let peerProperty
    const parents = new WeakMap()
    function inspect(node, parent) {
      if (node === null || typeof node !== 'object') return
      if (Array.isArray(node)) {
        for (const child of node) inspect(child, parent)
        return
      }
      if (parent) parents.set(node, parent)
      if (node.type === 'Literal') literals.push(node.value)
      if (
        node.type === 'CallExpression' &&
        node.arguments[0]?.type === 'Literal' &&
        node.arguments[0].value === 'tengu_sdk_result' &&
        node.arguments[1]?.type === 'ObjectExpression'
      ) {
        sdkResultPayloadKeys.push(
          new Set(
            node.arguments[1].properties
              .filter(property => property.type === 'Property')
              .map(property => property.key.name ?? property.key.value),
          ),
        )
      }
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'setTimeout' &&
        node.arguments[1]?.type === 'Literal' &&
        node.arguments[1].value === 30_000
      ) {
        timerCalls.push(node)
      }
      if (node.type === 'ObjectExpression') {
        const keys = new Set(
          node.properties
            .filter(property => property.type === 'Property')
            .map(property => property.key.name ?? property.key.value),
        )
        if (
          keys.has('content') &&
          keys.has('structuredContent') &&
          keys.has('_meta')
        ) {
          mcpPayloads.push(node)
        }
      }
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        ['addEventListener', 'removeEventListener'].includes(
          node.callee.property?.name,
        ) &&
        node.arguments[0]?.type === 'Literal' &&
        node.arguments[0].value === 'abort'
      ) {
        const key =
          node.callee.property.name === 'addEventListener' ? 'add' : 'remove'
        abortListenerObjects[key].add(
          targetUnit.slice(node.callee.object.start, node.callee.object.end),
        )
      }
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee.object?.type === 'Identifier' &&
        node.callee.object.name === 'Math' &&
        node.callee.property?.name === 'max'
      ) {
        mathMaxCalls++
      }
      if (
        node.type === 'MemberExpression' &&
        node.property?.name === 'readFile'
      ) {
        readFileProperties++
      }
      if (
        node.type === 'MemberExpression' &&
        node.property?.name === 'UrlElicitationRequired'
      ) {
        urlElicitationCodeChecks++
      }
      if (
        node.type === 'Property' &&
        (node.key?.name ?? node.key?.value) === 'kind' &&
        node.value?.type === 'Literal' &&
        node.value.value === 'peer'
      ) {
        peerProperty = node
      }
      for (const [key, child] of Object.entries(node)) {
        if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
          inspect(child, node)
        }
      }
    }
    inspect(ast, null)

    assert.equal(sdkResultPayloadKeys.length, 3)
    assert.ok(
      sdkResultPayloadKeys.some(
        keys => keys.has('run_phase') && keys.has('exit_code'),
      ),
      'authenticated cleanup telemetry records phase and exit code',
    )
    assert.ok(
      sdkResultPayloadKeys.some(
        keys => keys.has('retry_status') && keys.has('api_error_status'),
      ),
      'authenticated result telemetry records retry and API status',
    )
    assert.ok(
      sdkResultPayloadKeys.some(
        keys =>
          keys.has('saw_retry') &&
          keys.has('saw_compact') &&
          !keys.has('retry_status'),
      ),
      'authenticated crash fallback has the closed zero-result shape',
    )
    assert.equal(
      literals.filter(value => value === 'tengu_sdk_session_crash').length,
      1,
    )
    assert.equal(mathMaxCalls, 1)
    assert.equal(timerCalls.length, 2)
    assert.equal(mcpPayloads.length, 1)
    assert.equal(urlElicitationCodeChecks, 1)
    assert.ok(readFileProperties >= 1)
    for (const marker of [
      'Not a fully-qualified MCP tool name: ',
      'mcp_call does not support SDK MCP servers. ',
      'URL elicitation required (no URL in error data): ',
      'MCP session expired for ',
    ]) {
      assert.ok(targetUnit.includes(marker), 'authenticated MCP marker ' + marker)
    }
    assert.ok(literals.includes('mcp_call'))
    assert.ok(
      [...abortListenerObjects.add].some(value =>
        abortListenerObjects.remove.has(value),
      ),
      'authenticated MCP control call removes its parent abort listener',
    )

    for (const [value, count] of [
      ['2.1.120', 2],
      ['2026-04-24T19:00:49Z', 2],
      ['080f07fb4224786b965b9ea0a35f0cff594f2eb6', 2],
      ['peer', 1],
    ]) {
      assert.equal(
        literals.filter(candidate => candidate === value).length,
        count,
        'authenticated compiler residue ' + value,
      )
    }
    assert.ok(peerProperty, 'authenticated target contains the peer-origin arm')
    let peerConditional = parents.get(peerProperty)
    while (peerConditional && peerConditional.type !== 'ConditionalExpression') {
      peerConditional = parents.get(peerConditional)
    }
    assert.equal(peerConditional?.test?.type, 'Identifier')
    const peerSelector = peerConditional.test.name
    let selectorDeclaration
    walk(ast, node => {
      if (
        node.type === 'VariableDeclarator' &&
        node.id?.type === 'Identifier' &&
        node.id.name === peerSelector
      ) {
        selectorDeclaration = node
      }
    })
    assert.equal(selectorDeclaration?.init?.type, 'UnaryExpression')
    assert.equal(selectorDeclaration.init.operator, 'void')
    assert.equal(selectorDeclaration.init.argument?.value, 0)
  },
)
