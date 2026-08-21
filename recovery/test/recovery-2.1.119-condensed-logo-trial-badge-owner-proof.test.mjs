import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_CONDENSED_LOGO_TRIAL_BADGE_EVIDENCE_IDS,
  TARGET119_CONDENSED_LOGO_TRIAL_BADGE_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/condensed-logo-trial-badge-owner-overrides.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-condensed-logo-trial-badge-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '9563d8bb89a339c36aad3c73fcc4c761b87f513b58e16e508191605065a43862'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)

function descriptor(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function sourceDescriptor(value) {
  return {
    chars: value.length,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function readLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
}

function parseUnit(value) {
  return parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
}

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalAst(entry, value, index))
  }
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (key === 'name' && value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          parent.computed === false &&
          parentKey === 'property') ||
        (parent?.type === 'Property' &&
          parent.computed === false &&
          parent.shorthand === false &&
          parentKey === 'key') ||
        (parent?.type === 'MethodDefinition' &&
          parent.computed === false &&
          parentKey === 'key')
      result[key] = preserve ? child : '@id'
    } else {
      result[key] = canonicalAst(child, value, key)
    }
  }
  return result
}

function canonicalDescriptor(value) {
  const serialized = JSON.stringify(canonicalAst(parseUnit(value)))
  return {
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
    serialized,
  }
}

function bodyStatementDescriptor(value, absoluteStart) {
  const body = parseUnit(value).body[0].body.body
  const rows = body.map((statement, index) => {
    const canonical = JSON.stringify(canonicalAst(statement))
    return [
      index,
      statement.type,
      absoluteStart + statement.start,
      absoluteStart + statement.end,
      Buffer.byteLength(canonical),
      sha256(canonical),
    ]
  })
  const serialized = JSON.stringify(rows)
  return {
    count: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function cacheFacts(value) {
  const ast = parseUnit(value)
  const declaration = ast.body[0].body.body[0].declarations[0]
  assert.equal(declaration.id.type, 'Identifier')
  assert.equal(declaration.init.type, 'CallExpression')
  assert.equal(declaration.init.arguments.length, 1)
  const binding = declaration.id.name
  const identifiers = walk(
    ast,
    node => node.type === 'Identifier' && node.name === binding,
  )
  const members = walk(
    ast,
    node =>
      node.type === 'MemberExpression' &&
      node.computed === true &&
      node.object.type === 'Identifier' &&
      node.object.name === binding &&
      node.property.type === 'Literal' &&
      Number.isInteger(node.property.value),
  )
  assert.equal(identifiers.length, members.length + 1)
  const indices = members.map(member => member.property.value)
  const unique = [...new Set(indices)].sort((left, right) => left - right)
  const indexCounts = unique.map(index => [
    index,
    indices.filter(candidate => candidate === index).length,
  ])
  const serialized = JSON.stringify(indexCounts)
  const size = declaration.init.arguments[0].value
  return {
    size,
    identifierOccurrences: identifiers.length,
    memberOccurrences: members.length,
    uniqueIndices: unique.length,
    minIndex: Math.min(...unique),
    maxIndex: Math.max(...unique),
    missingIndices: Array.from({ length: size }, (_, index) => index).filter(
      index => !unique.includes(index),
    ),
    indexCountsBytes: Buffer.byteLength(serialized),
    indexCountsSha256: sha256(serialized),
  }
}

function normalizedWholeUnitDelta(baselineValue, targetValue) {
  const baselineAst = parseUnit(baselineValue)
  const targetAst = parseUnit(targetValue)
  const baselineBody = baselineAst.body[0].body.body
  const targetBody = targetAst.body[0].body.body
  const statement = source =>
    parseUnit(`function proof(){${source}}`).body[0].body.body[0]

  assert.equal(baselineBody[9].type, 'VariableDeclaration')
  assert.deepEqual(
    targetBody.slice(9, 14).map(node => node.type),
    [
      'VariableDeclaration',
      'BlockStatement',
      'VariableDeclaration',
      'IfStatement',
      'VariableDeclaration',
    ],
  )
  baselineBody.splice(9, 1, statement('let COMMON_CORE;'))
  targetBody.splice(9, 5, statement('let COMMON_CORE;'))

  assert.deepEqual(
    baselineBody.slice(17, 19).map(node => node.type),
    ['VariableDeclaration', 'IfStatement'],
  )
  assert.deepEqual(
    targetBody.slice(17, 19).map(node => node.type),
    ['VariableDeclaration', 'IfStatement'],
  )
  baselineBody.splice(
    17,
    2,
    statement('let PATH_RENDER;'),
    statement('PATH_RENDER;'),
  )
  targetBody.splice(
    17,
    2,
    statement('let PATH_RENDER;'),
    statement('PATH_RENDER;'),
  )

  const normalizeCache = (ast, target) => {
    const declaration = ast.body[0].body.body[0].declarations[0]
    assert.equal(declaration.init.arguments[0].value, target ? 57 : 54)
    declaration.init.arguments[0].value = 54
    declaration.init.arguments[0].raw = '54'
    if (!target) return
    const binding = declaration.id.name
    for (const member of walk(
      ast,
      node =>
        node.type === 'MemberExpression' &&
        node.computed === true &&
        node.object.type === 'Identifier' &&
        node.object.name === binding &&
        node.property.type === 'Literal' &&
        Number.isInteger(node.property.value) &&
        node.property.value >= 23,
    )) {
      member.property.value -= 3
      member.property.raw = String(member.property.value)
    }
  }
  normalizeCache(baselineAst, false)
  normalizeCache(targetAst, true)

  const baseline = JSON.stringify(canonicalAst(baselineAst))
  const target = JSON.stringify(canonicalAst(targetAst))
  assert.equal(target, baseline)
  return {
    bodyStatements: targetAst.body[0].body.body.length,
    canonicalAstBytes: Buffer.byteLength(target),
    canonicalAstSha256: sha256(target),
  }
}

function assertRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      baselineUnitIndex: region.baselineUnitIndex,
      pairReason: region.pairReason,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      classification: expected.classification,
      baselineUnitIndex: expected.baselineUnitIndex,
      pairReason: expected.pairReason,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
  if ('unknownFreeIdentifierCount' in expected) {
    assert.equal(
      region.unknownFreeIdentifierCount,
      expected.unknownFreeIdentifierCount,
    )
  }
  return region
}

function gitShow(commit, sourcePath) {
  const result = spawnSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

function gitBlob(commit, sourcePath) {
  const result = spawnSync('git', ['rev-parse', `${commit}:${sourcePath}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function tsDeclarationDescriptor(ts, sourceFile, source, name) {
  const declaration = sourceFile.statements.find(
    statement => statement.name?.text === name,
  )
  assert(declaration, name)
  const value = source.slice(declaration.pos, declaration.end)
  return {
    start: declaration.pos,
    end: declaration.end,
    ...sourceDescriptor(value),
  }
}

function sourceRowIdentity(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function rowSetDescriptor(rows) {
  const serialized = JSON.stringify(rows.map(sourceRowIdentity))
  return {
    count: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function fullPartitionDescriptor(rows) {
  const serialized = JSON.stringify(rows)
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function identityPartitionDescriptor(rows) {
  const serialized = JSON.stringify(rows.map(sourceRowIdentity))
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
      pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256,
  )
  if (matches.length !== 1) {
    throw new Error('unknown or hybrid Target119 artifact phase')
  }
  return matches[0].phase
}

let artifactState
function loadArtifactState() {
  if (artifactState) return artifactState
  const expected = fixture.artifactPhasePolicy.acceptedPairs.at(-1)
  const typedAuditBytes = fs.readFileSync(
    path.resolve(
      process.env.CLAUDE_CODE_TYPED_AUDIT_PATH ??
        path.join(root, expected.typedAudit.path),
    ),
  )
  const sourceCoverageBytes = fs.readFileSync(
    path.resolve(
      process.env.CLAUDE_CODE_SOURCE_COVERAGE_PATH ??
        path.join(root, expected.sourceCoverage.path),
    ),
  )
  const sourceCoverageRaw = gunzipSync(sourceCoverageBytes)
  artifactState = {
    phase: selectArtifactPhase(
      descriptor(typedAuditBytes),
      descriptor(sourceCoverageBytes),
      descriptor(sourceCoverageRaw),
    ),
    report: JSON.parse(typedAuditBytes),
    coverage: JSON.parse(sourceCoverageRaw),
  }
  return artifactState
}

function assertLatestArtifactProjection(report, coverage) {
  for (const unit of fixture.latestArtifactProjection.units) {
    for (const [key, expected] of Object.entries(unit.partitions)) {
      const rows = report[key].filter(
        row => row.structural.index === unit.targetIndex,
      )
      assert.deepEqual(fullPartitionDescriptor(rows), expected.full)
      assert.deepEqual(identityPartitionDescriptor(rows), expected.identities)
    }
    const coverageRows = coverage.rows.filter(
      row => row.targetIndex === unit.targetIndex,
    )
    assert.deepEqual(
      fullPartitionDescriptor(coverageRows),
      unit.coverageRows,
    )
    const ownerIds = new Set(coverageRows.flatMap(row => row.ownerIds))
    assert.deepEqual(
      coverage.owners.filter(owner => ownerIds.has(owner.id)),
      unit.ownerCatalog,
    )
  }
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1
}

test('Target119 CondensedLogo fixture exposes one static owner override', () => {
  assert.equal(fixture.status.includes('static-whole-unit-proof'), true)
  assert.equal(fixture.summary.units, 1)
  assert.equal(fixture.summary.productionStrictRows, 1)
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.deepEqual(
    TARGET119_CONDENSED_LOGO_TRIAL_BADGE_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(TARGET119_CONDENSED_LOGO_TRIAL_BADGE_OWNER_OVERRIDES, [
    {
      key: '2.1.118-to-2.1.119:16959',
      targetIndex: 16959,
      paths: [fixture.ownerResidues.correctedOwnerPath],
      declarations: ['CondensedLogo'],
      evidenceIds: fixture.evidenceIds,
      behavior: fixture.ownerBehavior,
    },
  ])
})

test('authenticated whole units confine the Target119 change to trial and path regions', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const structural = readLedger(fixture.inputs.targetStructuralLedger)
  const baselineRegion = structural.unmatchedBaseline.find(
    candidate => candidate.index === fixture.baselineUnit.targetIndex,
  )
  assert(baselineRegion)
  assert.deepEqual(
    {
      nodeType: baselineRegion.nodeType,
      start: baselineRegion.start,
      end: baselineRegion.end,
      bytes: baselineRegion.end - baselineRegion.start,
      tokenCount: baselineRegion.tokenCount,
      sha256: baselineRegion.sourceHash,
      coarseHash: baselineRegion.coarseHash,
    },
    {
      nodeType: fixture.baselineUnit.nodeType,
      start: fixture.baselineUnit.start,
      end: fixture.baselineUnit.end,
      bytes: fixture.baselineUnit.bytes,
      tokenCount: fixture.baselineUnit.tokenCount,
      sha256: fixture.baselineUnit.sha256,
      coarseHash: fixture.baselineUnit.coarseHash,
    },
  )
  assertRegion(structural, fixture.targetUnit)

  const baseline = slicePinned(baselineBundle, fixture.baselineUnit)
  const target = slicePinned(targetBundle, fixture.targetUnit)
  assert.deepEqual(canonicalDescriptor(baseline), {
    bytes: fixture.baselineUnit.canonicalAstBytes,
    sha256: fixture.baselineUnit.canonicalAstSha256,
    serialized: canonicalDescriptor(baseline).serialized,
  })
  assert.deepEqual(canonicalDescriptor(target), {
    bytes: fixture.targetUnit.canonicalAstBytes,
    sha256: fixture.targetUnit.canonicalAstSha256,
    serialized: canonicalDescriptor(target).serialized,
  })
  assert.deepEqual(
    bodyStatementDescriptor(baseline, fixture.baselineUnit.start),
    fixture.baselineUnit.bodyStatements,
  )
  assert.deepEqual(
    bodyStatementDescriptor(target, fixture.targetUnit.start),
    fixture.targetUnit.bodyStatements,
  )
  assert.deepEqual(cacheFacts(baseline), fixture.baselineUnit.cache)
  assert.deepEqual(cacheFacts(target), fixture.targetUnit.cache)

  slicePinned(baselineBundle, fixture.wholeUnitDelta.baselineCore)
  slicePinned(targetBundle, fixture.wholeUnitDelta.targetCore)
  slicePinned(baselineBundle, fixture.wholeUnitDelta.baselinePathRender)
  slicePinned(targetBundle, fixture.wholeUnitDelta.targetPathRender)
  assert.deepEqual(
    normalizedWholeUnitDelta(baseline, target),
    {
      bodyStatements: fixture.wholeUnitDelta.normalization.bodyStatements,
      canonicalAstBytes:
        fixture.wholeUnitDelta.normalization.canonicalAstBytes,
      canonicalAstSha256:
        fixture.wholeUnitDelta.normalization.canonicalAstSha256,
    },
  )
})

test('trial badge, width reservation, billing insertion, and path behavior are exact', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const target = slicePinned(targetBundle, fixture.targetUnit).toString()
  const contract = fixture.trialBadgeContract
  const trialBlock = slicePinned(targetBundle, contract.block).toString()
  assert.equal(
    slicePinned(targetBundle, contract.stateCall).toString(),
    'gdH()',
  )
  assert.equal(
    slicePinned(targetBundle, contract.formatCall).toString(),
    'DD$(e)',
  )
  assert.equal(
    slicePinned(targetBundle, contract.widthCall).toString(),
    'O8(` \\xB7 ${KH}`)',
  )
  assert.equal(
    slicePinned(targetBundle, contract.colorConditional).toString(),
    'e.status==="expired"?"suggestion":"warning"',
  )
  assert.match(trialBlock, /H\[15\].*H\[16\]/)
  assert.match(trialBlock, /H\[17\]/)
  assert.match(trialBlock, /H\[18\]/)
  assert.match(trialBlock, /H\[19\]/)
  assert.equal(countOccurrences(trialBlock, '"expired"'), 1)
  assert.equal(
    countOccurrences(target, '"expired"'),
    contract.expiredLiteralOccurrencesInUnit,
  )

  const billing = slicePinned(targetBundle, contract.billingRender).toString()
  assert.match(billing, /H\[28\]!==I/)
  assert.equal(countOccurrences(billing, ',I)'), 2)
  assert.match(
    slicePinned(targetBundle, fixture.wholeUnitDelta.targetCore).toString(),
    /N-C/,
  )
  assert.equal(
    slicePinned(targetBundle, contract.pathCache).toString(),
    'if(H[20]!==g||H[21]!==U)d=[g,U].filter(Boolean),H[20]=g,H[21]=U,H[22]=d;else d=H[22];',
  )
  assert.equal(
    slicePinned(targetBundle, contract.pathJoin).toString(),
    'let l=d.join(" \\xB7 "),i;',
  )
  assert.match(
    slicePinned(targetBundle, fixture.wholeUnitDelta.targetPathRender).toString(),
    /=l&&.*createElement/,
  )
})

test('the authenticated proTrial implementation and local module boundary bind the owner', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const structural = readLedger(fixture.inputs.targetStructuralLedger)
  for (const unit of [
    fixture.proTrialDependency.exportRegistration,
    fixture.proTrialDependency.stateUnit,
    fixture.proTrialDependency.formatUnit,
    fixture.moduleBoundary.targetInitializer,
    fixture.moduleBoundary.effortSelector,
    fixture.moduleBoundary.agentSelector,
  ]) {
    assertRegion(structural, unit)
    slicePinned(targetBundle, unit)
  }

  const exportsText = slicePinned(
    targetBundle,
    fixture.proTrialDependency.exportRegistration,
  ).toString()
  for (const name of ['getProTrialState', 'formatTrialBadge']) {
    assert.equal(countOccurrences(exportsText, `${name}:`), 1)
  }
  const stateText = slicePinned(
    targetBundle,
    fixture.proTrialDependency.stateUnit,
  ).toString()
  assert.match(stateText, /ccOnboardingFlags\?\.e10===!0/)
  assert.match(stateText, /claudeCodeTrialEndsAt\?\?null/)
  const formatText = slicePinned(
    targetBundle,
    fixture.proTrialDependency.formatUnit,
  ).toString()
  for (const marker of [
    '"active"',
    '"expired"',
    '"ineligible"',
    '"not_started"',
    '"Extra usage"',
    '"day"',
    '"days"',
  ]) {
    assert.equal(countOccurrences(formatText, marker), 1, marker)
  }

  const baselineInitializer = slicePinned(
    baselineBundle,
    fixture.moduleBoundary.baselineInitializer,
  )
  const targetInitializer = slicePinned(
    targetBundle,
    fixture.moduleBoundary.targetInitializer,
  )
  assert.equal(
    canonicalDescriptor(targetInitializer).serialized,
    canonicalDescriptor(baselineInitializer).serialized,
  )
  const baselineEffort = slicePinned(
    baselineBundle,
    fixture.moduleBoundary.baselineEffortSelector,
  )
  const targetEffort = slicePinned(
    targetBundle,
    fixture.moduleBoundary.effortSelector,
  )
  assert.equal(
    canonicalDescriptor(targetEffort).serialized,
    canonicalDescriptor(baselineEffort).serialized,
  )
  const baselineAgent = slicePinned(
    baselineBundle,
    fixture.moduleBoundary.baselineAgentSelector,
  )
  const targetAgent = slicePinned(
    targetBundle,
    fixture.moduleBoundary.agentSelector,
  )
  assert.equal(
    canonicalDescriptor(targetAgent).serialized,
    canonicalDescriptor(baselineAgent).serialized,
  )
})

test('Target120 and Target121 preserve the complete Target119 runtime unit', () => {
  const target = slicePinned(
    readPinned(fixture.inputs.targetBundle),
    fixture.targetUnit,
  )
  const targetCanonical = canonicalDescriptor(target)
  for (let index = 0; index < fixture.inputs.laterBundles.length; index += 1) {
    const input = fixture.inputs.laterBundles[index]
    const expected = fixture.runtimeLineage[index]
    const bundle = readPinned(input)
    const ledgerInput = {
      path: input.ledgerPath,
      bytes: input.ledgerBytes,
      sha256: input.ledgerSha256,
    }
    const ledger = readLedger(ledgerInput)
    assertRegion(ledger, expected)
    const unit = slicePinned(bundle, expected)
    assert.deepEqual(canonicalDescriptor(unit), targetCanonical)
  }
})

test('source lineage proves CondensedLogo ownership and blocks replay', () => {
  const ts = require(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
  const owner = fixture.sourceOwner
  const sourcePath = path.join(sourceRoot, owner.path.replace(/^src\//, ''))
  const stat = fs.lstatSync(sourcePath)
  assert.equal(stat.isFile(), true)
  assert.equal(stat.isSymbolicLink(), false)
  const source = fs.readFileSync(sourcePath, 'utf8')
  assert.deepEqual(sourceDescriptor(source), {
    chars: owner.chars,
    bytes: owner.bytes,
    sha256: owner.sha256,
  })
  assert.equal(gitBlob(owner.commit, owner.path), owner.blob)
  assert.equal(sha256(gitShow(owner.commit, owner.path)), owner.sha256)
  const sourceFile = ts.createSourceFile(
    owner.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  assert.deepEqual(
    tsDeclarationDescriptor(ts, sourceFile, source, 'CondensedLogo'),
    owner.declaration,
  )
  for (const marker of owner.requiredMarkers) {
    assert.ok(countOccurrences(source, marker) >= 1, marker)
  }
  for (const marker of owner.missingMarkers) {
    assert.equal(countOccurrences(source, marker), 0, marker)
  }
  assert.equal(countOccurrences(source, `_c(${owner.compilerCacheSize})`), 1)

  const mapMatch = source.match(
    /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([^\n]+)/,
  )
  assert(mapMatch)
  const sourceMap = JSON.parse(Buffer.from(mapMatch[1], 'base64').toString())
  assert.deepEqual(sourceMap.sources, owner.sourceMap.sources)
  assert.equal(sourceMap.sourcesContent.length, 1)
  const rawSource = sourceMap.sourcesContent[0]
  assert.deepEqual(sourceDescriptor(rawSource), owner.sourceMap.content)
  const rawFile = ts.createSourceFile(
    'CondensedLogo.tsx',
    rawSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(rawFile.parseDiagnostics.length, 0)
  assert.deepEqual(
    tsDeclarationDescriptor(ts, rawFile, rawSource, 'CondensedLogo'),
    owner.sourceMap.declaration,
  )
  for (const marker of owner.missingMarkers.slice(0, 3)) {
    assert.equal(countOccurrences(rawSource, marker), 0, marker)
  }

  for (const [, commit, blob] of owner.unchangedGitLineage) {
    assert.equal(gitBlob(commit, owner.path), blob)
    assert.equal(sha256(gitShow(commit, owner.path)), owner.sha256)
  }
  const later = owner.laterSource
  const laterSource = gitShow(later.commit, owner.path).toString()
  assert.equal(gitBlob(later.commit, owner.path), later.blob)
  assert.deepEqual(sourceDescriptor(laterSource), {
    chars: later.chars,
    bytes: later.bytes,
    sha256: later.sha256,
  })
  const laterFile = ts.createSourceFile(
    owner.path,
    laterSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.deepEqual(
    tsDeclarationDescriptor(ts, laterFile, laterSource, 'CondensedLogo'),
    later.declaration,
  )
  assert.ok(countOccurrences(laterSource, later.addedMarker) >= 1)
  for (const marker of later.missingMarkers) {
    assert.equal(countOccurrences(laterSource, marker), 0, marker)
  }

  const falseOwner = fixture.falseGeneratedOwner
  const falsePath = path.join(sourceRoot, falseOwner.path.replace(/^src\//, ''))
  const falseSource = fs.readFileSync(falsePath, 'utf8')
  assert.deepEqual(sourceDescriptor(falseSource), {
    chars: falseOwner.chars,
    bytes: falseOwner.bytes,
    sha256: falseOwner.sha256,
  })
  const falseFile = ts.createSourceFile(
    falseOwner.path,
    falseSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.deepEqual(
    tsDeclarationDescriptor(
      ts,
      falseFile,
      falseSource,
      falseOwner.declaration.name,
    ),
    {
      start: falseOwner.declaration.start,
      end: falseOwner.declaration.end,
      chars: falseOwner.declaration.chars,
      bytes: falseOwner.declaration.bytes,
      sha256: falseOwner.declaration.sha256,
    },
  )
  for (const marker of falseOwner.forbiddenMarkers) {
    assert.equal(countOccurrences(falseSource, marker), 0, marker)
  }

  const dependency = fixture.proTrialDependency.source
  const dependencyPath = path.join(
    sourceRoot,
    dependency.path.replace(/^src\//, ''),
  )
  const dependencySource = fs.readFileSync(dependencyPath, 'utf8')
  assert.deepEqual(sourceDescriptor(dependencySource), {
    chars: dependency.chars,
    bytes: dependency.bytes,
    sha256: dependency.sha256,
  })
  assert.equal(gitBlob(dependency.commit, dependency.path), dependency.blob)
  const dependencyFile = ts.createSourceFile(
    dependency.path,
    dependencySource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.deepEqual(
    tsDeclarationDescriptor(
      ts,
      dependencyFile,
      dependencySource,
      'getProTrialState',
    ),
    dependency.stateDeclaration,
  )
  assert.deepEqual(
    tsDeclarationDescriptor(
      ts,
      dependencyFile,
      dependencySource,
      'formatTrialBadge',
    ),
    dependency.formatDeclaration,
  )
  const baselineDependency = spawnSync(
    'git',
    ['cat-file', '-e', `${dependency.baselineCommit}:${dependency.path}`],
    { cwd: root },
  )
  assert.notEqual(baselineDependency.status, 0)
})

test('the exact one-row correction follows an authenticated artifact phase', () => {
  const { phase, report, coverage } = loadArtifactState()
  assert.ok(fixture.latestArtifactProjection.phases.includes(phase))
  assertLatestArtifactProjection(report, coverage)
})

test('Target119 CondensedLogo artifact generations are exact and fail closed', () => {
  const { phase } = loadArtifactState()
  assert.ok(fixture.latestArtifactProjection.phases.includes(phase))
  for (const pair of fixture.artifactPhasePolicy.acceptedPairs) {
    assert.equal(
      selectArtifactPhase(
        pair.typedAudit,
        pair.sourceCoverage,
        pair.sourceCoverageRaw,
      ),
      pair.phase,
    )
  }
  const [prior, current] = fixture.artifactPhasePolicy.acceptedPairs
  assert.throws(
    () =>
      selectArtifactPhase(
        prior.typedAudit,
        current.sourceCoverage,
        prior.sourceCoverageRaw,
      ),
    /unknown or hybrid/,
  )
  assert.throws(
    () =>
      selectArtifactPhase(
        {...current.typedAudit, bytes: 0},
        current.sourceCoverage,
        current.sourceCoverageRaw,
      ),
    /unknown or hybrid/,
  )
})
