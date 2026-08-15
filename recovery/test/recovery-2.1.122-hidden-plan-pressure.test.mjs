import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    removedCount: 1,
    planTelemetryCount: 10,
    bridgeLogCount: 1,
    pressureLogCount: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    removedCount: 0,
    planTelemetryCount: 0,
    bridgeLogCount: 0,
    pressureLogCount: 1,
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates removed plan experiment, bridge log, and pressure levels', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'tengu_pewter_ledger'),
      release.removedCount,
    )
    assert.equal(
      occurrences(bundle, 'planStructureVariant'),
      release.planTelemetryCount,
    )
    assert.equal(
      occurrences(bundle, '[bridge:ui] clearStatusLines count='),
      release.bridgeLogCount,
    )
    assert.equal(
      occurrences(bundle, ' level=${'),
      release.pressureLogCount,
    )
  }

  const baseline = readBundle(releases[0])
  const target = readBundle(releases[1])
  for (const removed of [
    'One-line **Context**: what is being changed and why',
    'Hard limit: 40 lines.',
  ]) {
    assert.equal(occurrences(baseline, removed), 1)
    assert.equal(occurrences(target, removed), 0)
  }
  assert.match(target, /return\{level:"blocked",pctLeft:[A-Za-z_$][\w$]*\}/)
  assert.match(
    target,
    /[A-Za-z_$][\w$]*\.level==="compact"\|\|[A-Za-z_$][\w$]*\.level==="blocked"/,
  )
})

test('source fixes the control prompt and removes experiment telemetry', () => {
  const planMode = source('src/utils/planModeV2.ts')
  const messages = source('src/utils/messages.ts')
  const exitPlan = source(
    'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
  )

  for (const removed of [
    'tengu_pewter_ledger',
    'getPewterLedgerVariant',
    'PewterLedgerVariant',
  ]) {
    assert.ok(!planMode.includes(removed), removed)
  }
  for (const removed of [
    'PLAN_PHASE4_TRIM',
    'PLAN_PHASE4_CUT',
    'PLAN_PHASE4_CAP',
    'getPlanPhase4Section',
  ]) {
    assert.ok(!messages.includes(removed), removed)
  }
  assert.ok(messages.includes('${PLAN_PHASE4_CONTROL}'))
  assert.ok(!exitPlan.includes('planStructureVariant'))
  assert.ok(!exitPlan.includes('getPewterLedgerVariant'))
})

test('source threads the target pressure state through all active consumers', () => {
  const compactService = compact(
    source('src/services/compact/autoCompact.ts'),
  )
  for (const fragment of [
    "if (tokenUsage >= blockingLimit) return { level: 'blocked', pctLeft }",
    "return { level: 'compact', pctLeft }",
    "if (tokenUsage >= warningThreshold) return { level: 'warn', pctLeft }",
    "return { level: 'ok' }",
    'config.enabled ? autoCompactThreshold : effectiveContextWindow',
    "`autocompact: tokens=${tokenCount} level=${pressure.level} effectiveWindow=${effectiveWindow}`",
    "return pressure.level === 'compact' || pressure.level === 'blocked'",
  ]) {
    assert.ok(compactService.includes(compact(fragment)), fragment)
  }

  const query = compact(source('src/query.ts'))
  assert.ok(
    query.includes(
      compact(`
        toolUseContext.options.mainLoopModel,
        toolUseContext.getAutoCompactWindow(),
      )
      if (pressure.level === 'blocked')
      `),
    ),
  )

  const warning = compact(source('src/components/TokenWarning.tsx'))
  for (const fragment of [
    'state => state.autoCompactWindow',
    "pressure.level === 'ok'",
    'pressure.pctLeft',
    'isReactiveCompactEligible(model) && !isAutoCompactWindowOverridden(model, autoCompactWindow)',
  ]) {
    assert.ok(warning.includes(compact(fragment)), fragment)
  }

  const notifications = compact(
    source('src/components/PromptInput/Notifications.tsx'),
  )
  assert.ok(notifications.includes('state => state.autoCompactWindow'))
  assert.ok(
    notifications.includes(
      compact(
        "calculateTokenWarningState(tokenUsage, mainLoopModel, autoCompactWindow).level !== 'ok'",
      ),
    ),
  )
})

test('source removes the retired bridge clear diagnostic', () => {
  const bridge = source('src/bridge/bridgeUI.ts')
  assert.ok(!bridge.includes('[bridge:ui] clearStatusLines count='))
  assert.match(
    bridge,
    /if \(statusLineCount <= 0\) return[\s\S]*write\(`\\x1b\[\$\{statusLineCount\}A`\)[\s\S]*write\('\\x1b\[J'\)[\s\S]*statusLineCount = 0/,
  )
})
