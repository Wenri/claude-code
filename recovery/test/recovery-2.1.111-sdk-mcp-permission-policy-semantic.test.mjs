import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE

const BASELINE_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const TARGET_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'
const targetUnit = {
  index: 19_378,
  start: 13_516_669,
  end: 13_518_616,
  nodeType: 'FunctionDeclaration',
  sourceHash:
    '3fc064c7b387b7c4dc7f6f5e0344db4819dc98c2f11fdccaa9241a7286a5a33e',
}
const targetResidues = [
  [13_517_758, 13_517_775, 'permission_policy'],
  [13_517_778, 13_517_792, '"always_allow"'],
  [13_517_813, 13_517_830, 'permission_policy'],
  [13_517_833, 13_517_846, '"always_deny"'],
  [13_517_893, 13_517_904, 'policyRules'],
  [13_518_197, 13_518_204, 'session'],
  [13_518_228, 13_518_239, 'policyRules'],
  [13_518_306, 13_518_313, 'session'],
  [13_518_334, 13_518_350, 'alwaysAllowRules'],
  [13_518_360, 13_518_375, 'alwaysDenyRules'],
  [13_518_387, 13_518_403, 'alwaysAllowRules'],
  [13_518_411, 13_518_426, 'alwaysDenyRules'],
  [13_518_435, 13_518_451, 'alwaysAllowRules'],
  [13_518_454, 13_518_469, 'alwaysDenyRules'],
]

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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function readAuthenticated(filename, expectedHash) {
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedHash)
  return bytes.toString('utf8')
}

function unitIdentity(unit) {
  return [unit.index, unit.start, unit.end, unit.nodeType, unit.sourceHash]
}

function targetFunction(target) {
  const slice = target.slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(slice), targetUnit.sourceHash)
  return Function(
    'P07',
    'GRK',
    'j6',
    'WG',
    'OL',
    'NS',
    'r1',
    'tC',
    `return (${slice})`,
  )(
    value => ({ ...value, scope: 'dynamic' }),
    () => true,
    () => {},
    async () => {},
    async () => {
      throw new Error('an unchanged server must not reconnect')
    },
    async () => [],
    error => error,
    (server, tool) => `mcp__${server}__${tool}`,
  )
}

test(
  'target111 adds dynamic MCP permission-policy replacement to the live reconcile unit',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.110 and 2.1.111 bundles are required'
        : false,
  },
  () => {
    const baseline = readAuthenticated(baselinePath, BASELINE_SHA256)
    const target = readAuthenticated(targetPath, TARGET_SHA256)
    const row = structural.unresolvedTarget.find(
      entry => entry.target.index === targetUnit.index,
    )
    assert.ok(row)
    assert.deepEqual(unitIdentity(row.target), unitIdentity(targetUnit))

    const slice = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(slice), targetUnit.sourceHash)
    for (const fragment of [
      'permission_policy',
      'always_allow',
      'always_deny',
      'policyRules:new Set',
      'alwaysAllowRules',
      'alwaysDenyRules',
    ]) {
      assert.ok(slice.includes(fragment), fragment)
    }
    for (const [start, end, raw] of targetResidues) {
      assert.equal(target.slice(start, end), raw)
      assert.ok(start >= targetUnit.start && end <= targetUnit.end)
    }
    assert.equal(occurrences(baseline, 'policyRules'), 0)
    assert.equal(occurrences(target, 'policyRules'), 3)
  },
)

test(
  'the authenticated target replaces stale dynamic rules while preserving manual and ask rules',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.111 bundle is required'
        : false,
  },
  async () => {
    const target = readAuthenticated(targetPath, TARGET_SHA256)
    const reconcile = targetFunction(target)
    const config = {
      type: 'http',
      url: 'https://example.invalid/mcp',
      tools: [
        { name: 'read', permission_policy: 'always_allow' },
        { name: 'destroy', permission_policy: 'always_deny' },
        { name: 'confirm', permission_policy: 'always_ask' },
      ],
    }
    const previousState = {
      clients: [],
      tools: [],
      configs: { demo: config },
      policyRules: new Set(['mcp__old__read', 'mcp__old__destroy']),
    }
    let appStateUpdater
    const result = await reconcile(
      { demo: config },
      previousState,
      updater => {
        appStateUpdater = updater
      },
    )

    assert.deepEqual(
      [...result.newState.policyRules],
      ['mcp__demo__read', 'mcp__demo__destroy'],
    )
    assert.equal(typeof appStateUpdater, 'function')
    const manualAllow = 'Bash(git status)'
    const manualDeny = 'Read(.env)'
    const previousAppState = {
      mcp: { tools: [], clients: [] },
      toolPermissionContext: {
        alwaysAllowRules: {
          session: ['mcp__old__read', manualAllow],
          projectSettings: ['Read(src/**)'],
        },
        alwaysDenyRules: {
          session: ['mcp__old__destroy', manualDeny],
        },
        alwaysAskRules: { session: ['mcp__demo__confirm'] },
      },
    }
    const next = appStateUpdater(previousAppState)
    assert.deepEqual(next.toolPermissionContext.alwaysAllowRules.session, [
      manualAllow,
      'mcp__demo__read',
    ])
    assert.deepEqual(next.toolPermissionContext.alwaysDenyRules.session, [
      manualDeny,
      'mcp__demo__destroy',
    ])
    assert.strictEqual(
      next.toolPermissionContext.alwaysAskRules,
      previousAppState.toolPermissionContext.alwaysAskRules,
    )
    assert.deepEqual(
      next.toolPermissionContext.alwaysAllowRules.projectSettings,
      ['Read(src/**)'],
    )
  },
)

test(
  'authored print-mode reconciliation owns the same policy lifecycle',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(path.join(sourceRoot, 'cli/print.ts'), 'utf8')
    for (const fragment of [
      'policyRules: new Set()',
      'policyRules: Set<string>',
      'for (const [serverName, config] of Object.entries(desiredConfigs))',
      "config.type !== 'http' && config.type !== 'sse'",
      'buildMcpToolName(serverName, tool.name)',
      "tool.permission_policy === 'always_allow'",
      "tool.permission_policy === 'always_deny'",
      'policyRules: new Set([...alwaysAllowRules, ...alwaysDenyRules])',
      'rule => !currentState.policyRules.has(rule)',
      'session: [...retainedRules, ...replacements]',
      'alwaysAllowRules: updatedAlwaysAllowRules',
      'alwaysDenyRules: updatedAlwaysDenyRules',
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
  },
)
