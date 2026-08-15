import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const caseRoot = path.join(
  repositoryRoot,
  'recovery/cases/2.1.88-to-2.1.89',
)

function compressedJson(relative) {
  return JSON.parse(gunzipSync(fs.readFileSync(path.join(caseRoot, relative))))
}

function source(relative) {
  return fs.readFileSync(
    path.join(semanticSourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

test('2.1.89 semantic ledger classifies the exact structural nonmatch set', () => {
  const structural = compressedJson('structural/generated-delta.json.gz')
  const coverage = compressedJson('semantic/source-coverage.json.gz')
  const expected = structural.regions
    .filter(region => region.classification !== 'matched')
    .map(region => region.target)
    .sort((left, right) => left.index - right.index)
  const actual = [...coverage.rows].sort(
    (left, right) => left.targetIndex - right.targetIndex,
  )

  assert.equal(actual.length, 3_283)
  assert.equal(coverage.summary.nonmatchedUnits, 3_283)
  assert.equal(coverage.summary.sourceRuntimeGaps, 0)
  assert.equal(coverage.summary.dependencyRuntimeGaps, 149)
  assert.equal(
    actual.some(row => row.disposition === 'source-runtime-gap'),
    false,
  )
  assert.deepEqual(
    actual.map(row => [
      row.targetIndex,
      row.start,
      row.end,
      row.nodeType,
      row.sourceHash,
    ]),
    expected.map(row => [
      row.index,
      row.start,
      row.end,
      row.nodeType,
      row.sourceHash,
    ]),
  )

  const ownerIds = new Set(coverage.owners.map(owner => owner.id))
  for (const owner of coverage.owners) {
    assert.equal(
      fs.statSync(path.join(repositoryRoot, owner.path)).isFile(),
      true,
      owner.path,
    )
    if (owner.anchor) assert.ok(source(owner.path).includes(owner.anchor))
  }
  for (const row of actual) {
    for (const ownerId of row.ownerIds) assert.ok(ownerIds.has(ownerId))
  }
})

test('2.1.89 dependency runtime remains an explicit source-build gap', () => {
  const coverage = compressedJson('semantic/source-coverage.json.gz')
  const dependency = compressedJson('semantic/dependency-coverage.json.gz')
  const rows = coverage.rows.filter(
    row => row.disposition === 'dependency-runtime',
  )
  const audited = dependency.groups.flatMap(group => group.rows)

  assert.equal(rows.length, 149)
  assert.equal(dependency.summary.dependencyRows, 149)
  assert.equal(dependency.summary.dependencyRuntimeGaps, 149)
  assert.equal(dependency.summary.pinnedSourceBuildInputs, 0)
  assert.equal(dependency.summary.exactTargetBundleArtifactRecoverable, true)
  assert.equal(dependency.summary.wholeBundleSemanticEquivalentFromSrc, false)
  assert.equal(
    dependency.buildInputAudit.applicationManifestOrLockfileInTargetCommit,
    false,
  )
  assert.deepEqual(
    audited.map(row => [row.targetIndex, row.sourceHash]).sort(),
    rows.map(row => [row.targetIndex, row.sourceHash]).sort(),
  )
})

test('2.1.89 canonical supplement is content-addressed and complete', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(caseRoot, 'manifest.json'), 'utf8'),
  )
  const descriptor = manifest.semanticSourceLineage?.supplement
  assert.deepEqual(
    [descriptor?.case, descriptor?.path],
    [
      '2.1.88-to-2.1.89',
      'recovery/cases/2.1.88-to-2.1.89/semantic-supplement.patch',
    ],
  )
  assert.equal(Number.isSafeInteger(descriptor.bytes), true)
  assert.match(descriptor.sha256, /^[a-f0-9]{64}$/)

  const cumulativeDescriptor =
    manifest.semanticSourceLineage.cumulativeSupplements.find(
      item => item.case === descriptor.case,
    )
  assert.deepEqual(cumulativeDescriptor, descriptor)

  const patchPath = path.resolve(repositoryRoot, descriptor.path)
  assert.equal(
    patchPath,
    path.join(caseRoot, 'semantic-supplement.patch'),
    'manifest supplement path must resolve to the canonical case artifact',
  )
  const patch = fs.readFileSync(patchPath)
  assert.equal(patch.length, descriptor.bytes)
  assert.equal(
    crypto.createHash('sha256').update(patch).digest('hex'),
    descriptor.sha256,
  )
  assert.equal(
    patch.toString('utf8').match(/^diff --git /gm)?.length,
    79,
  )
})

test('2.1.89 recovered owners retain the cross-cutting runtime call paths', () => {
  const required = new Map([
    ['src/bridge/clientPresence.ts', ['wireBridgeClientPresence']],
    ['src/utils/autoUpdater.ts', ['permission denied', "'no_permissions'"]],
    ['src/utils/desktopDeepLink.ts', ['getDesktopInstallStatus', 'MIN_DESKTOP_VERSION']],
    ['src/utils/sessionStorage.ts', ['No messages found in JSON file', 'sessionKind']],
    ['src/utils/plugins/pluginLoader.ts', ['realpath', 'resolvedTarget']],
    ['src/utils/computerUse/prompt.ts', ['You have a computer-use MCP available']],
    ['src/services/compact/autoCompact.ts', ['shouldUseColdCompaction', 'COLD_COMPACT_MIN_SESSION_MS']],
    ['src/hooks/unifiedSuggestions.ts', ["result.item.type === 'mcp_resource' ? 0.15 : 0"]],
    ['src/services/tools/toolHooks.ts', ["permissionBehavior === 'defer'"]],
    ['src/QueryEngine.ts', ['tool_deferred_unavailable', 'deferred_tool_use']],
    ['src/cli/print.ts', ['Auto-resuming deferred tool', 'Continue from where you left off.']],
    ['src/upstreamproxy/upstreamproxy.ts', ['CCR_UPSTREAM_PROXY_ENABLED']],
    ['src/utils/mcpOutputStorage.ts', ['legacy', 'completionRequirement']],
  ])
  for (const [relative, fragments] of required) {
    const value = source(relative)
    for (const fragment of fragments) {
      assert.ok(value.includes(fragment), `${relative}: ${fragment}`)
    }
  }
})
