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
  TARGET119_LOGO_V2_TRIAL_BADGE_EVIDENCE_IDS,
  TARGET119_LOGO_V2_TRIAL_BADGE_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/logo-v2-trial-badge-owner-overrides.mjs'
import { TARGET117_PERMISSION_CONFIRMATION_OWNER_OVERRIDES } from '../cases/2.1.116-to-2.1.117/recovered/replay-permission-confirmation-panel-source-gaps.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-logo-v2-trial-badge-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '73c0b757526958a7f7a10166a3829728c0beb11a6f090eeb7a064262ec752f13'
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
  const rows = parseUnit(value).body[0].body.body.map((statement, index) => {
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

function replaceReleaseMetadata(ast) {
  let replacements = 0
  walk(ast.body[0].body.body[7], node => {
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      /^(2\.1\.|20\d\d-|[0-9a-f]{40}$)/.test(node.value)
    ) {
      node.value = 'RELEASE'
      node.raw = '"RELEASE"'
      replacements += 1
    }
  })
  return replacements
}

function proofStatement(source) {
  return parseUnit(`function proof(){${source}}`).body[0].body.body[0]
}

function normalizedWholeUnitDelta(baselineValue, targetValue) {
  const baselineAst = parseUnit(baselineValue)
  const targetAst = parseUnit(targetValue)
  const baselineBody = baselineAst.body[0].body.body
  const targetBody = targetAst.body[0].body.body
  assert.equal(
    replaceReleaseMetadata(baselineAst),
    fixture.wholeUnitDelta.normalization.releaseLiteralCountPerUnit,
  )
  assert.equal(
    replaceReleaseMetadata(targetAst),
    fixture.wholeUnitDelta.normalization.releaseLiteralCountPerUnit,
  )

  assert.equal(targetBody[25].type, 'BlockStatement')
  targetBody.splice(25, 1)
  assert.equal(baselineBody[26].type, 'VariableDeclaration')
  assert.equal(targetBody[26].type, 'VariableDeclaration')
  baselineBody.splice(26, 1, proofStatement('let THEME_LAYOUT;'))
  targetBody.splice(26, 1, proofStatement('let THEME_LAYOUT;'))
  assert.equal(baselineBody[27].type, 'IfStatement')
  assert.equal(targetBody[27].type, 'IfStatement')
  baselineBody.splice(27, 1, proofStatement('let COMPACT_LAYOUT;'))
  targetBody.splice(27, 1, proofStatement('let COMPACT_LAYOUT;'))
  assert.equal(baselineBody[28].type, 'VariableDeclaration')
  assert.deepEqual(
    targetBody.slice(28, 31).map(node => node.type),
    ['VariableDeclaration', 'IfStatement', 'VariableDeclaration'],
  )
  baselineBody.splice(28, 1, proofStatement('let FULL_LAYOUT;'))
  targetBody.splice(28, 3, proofStatement('let FULL_LAYOUT;'))
  assert.equal(baselineBody[39].type, 'IfStatement')
  assert.equal(targetBody[39].type, 'IfStatement')
  baselineBody.splice(39, 1, proofStatement('CWD_RENDER;'))
  targetBody.splice(39, 1, proofStatement('CWD_RENDER;'))

  const baselineCache = baselineBody[0].declarations[0]
  const targetCache = targetBody[0].declarations[0]
  assert.equal(baselineCache.init.arguments[0].value, 126)
  assert.equal(targetCache.init.arguments[0].value, 131)
  targetCache.init.arguments[0].value = 126
  targetCache.init.arguments[0].raw = '126'
  const binding = targetCache.id.name
  for (const member of walk(
    targetAst,
    node =>
      node.type === 'MemberExpression' &&
      node.computed === true &&
      node.object.type === 'Identifier' &&
      node.object.name === binding &&
      node.property.type === 'Literal' &&
      Number.isInteger(node.property.value),
  )) {
    if (member.property.value >= 68) member.property.value -= 5
    else if (member.property.value >= 58) member.property.value -= 2
    member.property.raw = String(member.property.value)
  }

  const baseline = JSON.stringify(canonicalAst(baselineAst))
  const target = JSON.stringify(canonicalAst(targetAst))
  assert.equal(target, baseline)
  return {
    bodyStatements: targetBody.length,
    canonicalAstBytes: Buffer.byteLength(target),
    canonicalAstSha256: sha256(target),
  }
}

function releaseNormalizedDescriptor(value) {
  const ast = parseUnit(value)
  const replacements = replaceReleaseMetadata(ast)
  const serialized = JSON.stringify(canonicalAst(ast))
  return {
    replacements,
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
    serialized,
  }
}

function assertRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert(region, `u${expected.targetIndex}`)
  const actual = {
    classification: region.classification,
    nodeType: region.target.nodeType,
    start: region.target.start,
    end: region.target.end,
    bytes: region.target.end - region.target.start,
    tokenCount: region.target.tokenCount,
    sha256: region.target.sourceHash,
    coarseHash: region.target.coarseHash,
  }
  const wanted = {
    classification: expected.classification,
    nodeType: expected.nodeType,
    start: expected.start,
    end: expected.end,
    bytes: expected.bytes,
    tokenCount: expected.tokenCount,
    sha256: expected.sha256,
    coarseHash: expected.coarseHash,
  }
  assert.deepEqual(actual, wanted)
  if ('baselineUnitIndex' in expected) {
    assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
    assert.equal(region.pairReason, expected.pairReason)
  }
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

function tsDeclarationDescriptor(sourceFile, source, name) {
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

function countOccurrences(value, needle) {
  return value.split(needle).length - 1
}

test('Target119 LogoV2 fixture exposes one static owner and is disjoint from Target117 u16982', () => {
  assert.equal(fixture.status.includes('static-whole-unit-proof'), true)
  assert.equal(fixture.summary.units, 1)
  assert.equal(fixture.summary.productionStrictRows, 2)
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.deepEqual(
    TARGET119_LOGO_V2_TRIAL_BADGE_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(TARGET119_LOGO_V2_TRIAL_BADGE_OWNER_OVERRIDES, [
    {
      key: '2.1.118-to-2.1.119:16982',
      targetIndex: 16982,
      paths: [fixture.ownerResidues.correctedOwnerPath],
      declarations: ['LogoV2'],
      evidenceIds: fixture.evidenceIds,
      behavior: fixture.ownerBehavior,
    },
  ])

  const collision = fixture.priorTarget117Collision
  readPinned({
    path: collision.helperPath,
    bytes: collision.helperBytes,
    sha256: collision.helperSha256,
  })
  const prior = TARGET117_PERMISSION_CONFIRMATION_OWNER_OVERRIDES.find(
    override => override.key === collision.key,
  )
  assert(prior)
  assert.deepEqual(prior.paths, collision.paths)
  const overlap = TARGET119_LOGO_V2_TRIAL_BADGE_OWNER_OVERRIDES[0].paths.filter(
    ownerPath => prior.paths.includes(ownerPath),
  )
  assert.deepEqual(overlap, collision.overlap)
})

test('authenticated baseline and target units differ only in the bounded LogoV2 regions', () => {
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
  const baselineCanonical = canonicalDescriptor(baseline)
  const targetCanonical = canonicalDescriptor(target)
  assert.deepEqual(
    { bytes: baselineCanonical.bytes, sha256: baselineCanonical.sha256 },
    {
      bytes: fixture.baselineUnit.canonicalAstBytes,
      sha256: fixture.baselineUnit.canonicalAstSha256,
    },
  )
  assert.deepEqual(
    { bytes: targetCanonical.bytes, sha256: targetCanonical.sha256 },
    {
      bytes: fixture.targetUnit.canonicalAstBytes,
      sha256: fixture.targetUnit.canonicalAstSha256,
    },
  )
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

  for (const key of [
    'baselineReleaseMetadata',
    'targetReleaseMetadata',
    'baselineLogoData',
    'targetLogoData',
    'targetTrialBlock',
    'baselineTheme',
    'targetTheme',
    'baselineCompactLayout',
    'targetCompactLayout',
    'baselineFullLayout',
    'targetFullLayout',
    'baselineCwdRender',
    'targetCwdRender',
  ]) {
    slicePinned(
      key.startsWith('baseline') ? baselineBundle : targetBundle,
      fixture.wholeUnitDelta[key],
    )
  }
  assert.equal(
    canonicalDescriptor(
      slicePinned(baselineBundle, fixture.wholeUnitDelta.baselineLogoData),
    ).serialized,
    canonicalDescriptor(
      slicePinned(targetBundle, fixture.wholeUnitDelta.targetLogoData),
    ).serialized,
  )
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

test('trial state, colors, filtered paths, and both badge insertions are exact', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const target = slicePinned(targetBundle, fixture.targetUnit).toString()
  const contract = fixture.trialBadgeContract
  const trialBlock = slicePinned(
    targetBundle,
    fixture.wholeUnitDelta.targetTrialBlock,
  ).toString()
  assert.equal(slicePinned(targetBundle, contract.stateCall).toString(), 'gdH()')
  assert.equal(
    slicePinned(targetBundle, contract.formatCall).toString(),
    'DD$(eH)',
  )
  assert.equal(
    slicePinned(targetBundle, contract.colorConditional).toString(),
    'eH.status==="expired"?"suggestion":"warning"',
  )
  assert.match(trialBlock, /H\[28\].*H\[29\]/)
  assert.match(trialBlock, /H\[30\]/)
  assert.match(trialBlock, /a=X\$/)
  assert.equal(countOccurrences(target, '"expired"'), 1)
  assert.equal(
    countOccurrences(target, '.filter(Boolean)'),
    contract.filteredBooleanCallsInUnit,
  )
  assert.equal(
    slicePinned(targetBundle, contract.compactFilteredPath).toString(),
    '[l&&`@${l}`,f$].filter(Boolean).join(" \\xB7 ")',
  )
  assert.equal(
    slicePinned(targetBundle, contract.fullFilteredPath).toString(),
    '[KH,e].filter(Boolean)',
  )
  assert.equal(
    slicePinned(targetBundle, contract.conditionalCwdRender).toString(),
    'MH&&P6.createElement(V,{dimColor:!0},MH)',
  )
  assert.equal(countOccurrences(target, ',uH,a)),'), 1)
  assert.equal(countOccurrences(target, ',nH,QH,a)'), 1)
  assert.equal(target.indexOf(',a)),oH') + fixture.targetUnit.start, contract.compactTrialInsertionOffset)
  assert.equal(target.indexOf(',nH,QH,a)') + fixture.targetUnit.start + 7, contract.fullTrialInsertionOffset)

  const baseline = slicePinned(
    readPinned(fixture.inputs.baselineBundle),
    fixture.baselineUnit,
  ).toString()
  assert.equal(countOccurrences(baseline, '"expired"'), 0)
  assert.equal(countOccurrences(baseline, '.filter(Boolean)'), 0)
  assert.equal(countOccurrences(baseline, 'billingType:'), 1)
  assert.equal(countOccurrences(target, 'billingType:'), 1)
  assert.match(
    slicePinned(targetBundle, fixture.wholeUnitDelta.targetTheme).toString(),
    /\("theme","dark"\)\.value/,
  )
})

test('authenticated proTrial functions and LogoV2 module boundary bind the owner', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const structural = readLedger(fixture.inputs.targetStructuralLedger)
  for (const unit of [
    fixture.proTrialDependency.exportRegistration,
    fixture.proTrialDependency.stateUnit,
    fixture.proTrialDependency.formatUnit,
    fixture.moduleBoundary.initializer,
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
  assert.match(exportsText, /getProTrialState:\(\)=>gdH/)
  assert.match(exportsText, /formatTrialBadge:\(\)=>DD\$/)
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
  assert.equal(
    slicePinned(targetBundle, fixture.moduleBoundary.effortSelector).toString(),
    'function eo1(H){return H.effortValue}',
  )
  assert.equal(
    slicePinned(targetBundle, fixture.moduleBoundary.agentSelector).toString(),
    'function Ha1(H){return H.agent}',
  )
})

test('Target120 preserves the complete runtime unit modulo authenticated release metadata', () => {
  const target = slicePinned(
    readPinned(fixture.inputs.targetBundle),
    fixture.targetUnit,
  )
  const target120Ledger = readLedger(fixture.inputs.target120StructuralLedger)
  assertRegion(target120Ledger, fixture.runtimeLineage.target120Unit)
  const target120 = slicePinned(
    readPinned(fixture.inputs.target120Bundle),
    fixture.runtimeLineage.target120Unit,
  )
  const targetNormalized = releaseNormalizedDescriptor(target)
  const target120Normalized = releaseNormalizedDescriptor(target120)
  for (const normalized of [targetNormalized, target120Normalized]) {
    assert.deepEqual(
      {
        replacements: normalized.replacements,
        bytes: normalized.bytes,
        sha256: normalized.sha256,
      },
      {
        replacements:
          fixture.runtimeLineage.releaseNormalized.releaseLiteralCountPerUnit,
        bytes: fixture.runtimeLineage.releaseNormalized.canonicalAstBytes,
        sha256: fixture.runtimeLineage.releaseNormalized.canonicalAstSha256,
      },
    )
  }
  assert.equal(target120Normalized.serialized, targetNormalized.serialized)
  const target120Text = target120.toString()
  assert.equal(countOccurrences(target120Text, '"expired"'), 1)
  assert.equal(countOccurrences(target120Text, '.filter(Boolean)'), 2)
})

test('source and git lineage authenticate LogoV2 but fail closed against replay', () => {
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
    tsDeclarationDescriptor(sourceFile, source, 'LogoV2'),
    owner.declaration,
  )
  assert.equal(countOccurrences(source, `_c(${owner.compilerCacheSize})`), 1)
  for (const marker of owner.requiredMarkers) {
    assert.ok(countOccurrences(source, marker) >= 1, marker)
  }
  for (const marker of owner.missingMarkers) {
    assert.equal(countOccurrences(source, marker), 0, marker)
  }

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
    'LogoV2.tsx',
    rawSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(rawFile.parseDiagnostics.length, 0)
  assert.deepEqual(
    tsDeclarationDescriptor(rawFile, rawSource, 'LogoV2'),
    owner.sourceMap.declaration,
  )
  for (const marker of owner.missingMarkers) {
    assert.equal(countOccurrences(rawSource, marker), 0, marker)
  }

  const baseline = owner.baselineSource
  const baselineSource = gitShow(baseline.commit, owner.path).toString()
  assert.equal(gitBlob(baseline.commit, owner.path), baseline.blob)
  assert.deepEqual(sourceDescriptor(baselineSource), {
    chars: baseline.chars,
    bytes: baseline.bytes,
    sha256: baseline.sha256,
  })
  const baselineFile = ts.createSourceFile(
    owner.path,
    baselineSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.deepEqual(
    tsDeclarationDescriptor(baselineFile, baselineSource, 'LogoV2'),
    baseline.declaration,
  )
  assert.equal(countOccurrences(baselineSource, baseline.missingThemeMarker), 0)

  assert.equal(
    gitBlob(owner.unchangedTarget120.commit, owner.path),
    owner.unchangedTarget120.blob,
  )
  assert.equal(
    sha256(gitShow(owner.unchangedTarget120.commit, owner.path)),
    owner.sha256,
  )
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
    tsDeclarationDescriptor(laterFile, laterSource, 'LogoV2'),
    later.declaration,
  )
  assert.ok(countOccurrences(laterSource, later.addedMarker) >= 1)
  for (const marker of later.missingMarkers) {
    assert.equal(countOccurrences(laterSource, marker), 0, marker)
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
  assert.equal(
    sha256(gitShow(dependency.commit, dependency.path)),
    dependency.sha256,
  )
  const dependencyFile = ts.createSourceFile(
    dependency.path,
    dependencySource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(dependencyFile.parseDiagnostics.length, 0)
  assert.deepEqual(
    tsDeclarationDescriptor(
      dependencyFile,
      dependencySource,
      'getProTrialState',
    ),
    dependency.stateDeclaration,
  )
  assert.deepEqual(
    tsDeclarationDescriptor(
      dependencyFile,
      dependencySource,
      'formatTrialBadge',
    ),
    dependency.formatDeclaration,
  )

  const history = spawnSync(
    'git',
    ['log', '--all', '--format=%H', '-SformatTrialBadge', '--', owner.path],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(history.status, 0, history.stderr)
  assert.equal(history.stdout.trim(), '')
  assert.notEqual(owner.compilerCacheSize, fixture.targetUnit.cache.size)
})

test('the exact five-row admission is fail closed and report-state tolerant', () => {
  const reportPath = path.join(root, fixture.inputs.observedTargetReport.path)
  if (!fs.existsSync(reportPath)) return
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const select = rows =>
    rows.filter(row => row.structural.index === fixture.targetUnit.targetIndex)
  const allOwnerRows = select(report.sourceRuntimeOwnerResidueRows)
  const addedOwnerRows = select(report.sourceRuntimeAddedOwnerResidueRows)
  const rawRows = select(report.rows)

  assert.ok(
    addedOwnerRows.length === 0 ||
      JSON.stringify(addedOwnerRows.map(sourceRowIdentity)) ===
        JSON.stringify(fixture.ownerResidues.rows),
    'scanner is exact pre-correction or corrected state',
  )
  if (allOwnerRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(allOwnerRows),
      fixture.ownerResidues.preCorrectionAllOwnerRows,
    )
  }
  if (addedOwnerRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(addedOwnerRows),
      fixture.ownerResidues.preCorrectionAddedOwnerRows,
    )
    for (const row of addedOwnerRows) {
      assert.deepEqual(row.ownerPaths, [fixture.ownerResidues.generatedOwnerPath])
      assert.deepEqual(row.ownerSourceMatches, [])
      assert.deepEqual(
        row.sourceMatches,
        fixture.ownerResidues.sourceMatches[row.value],
      )
    }
    assert.deepEqual(
      addedOwnerRows.slice(fixture.ownerResidues.releaseMetadataRows).map(sourceRowIdentity),
      fixture.ownerResidues.productionRows,
    )
  }
  assert.deepEqual(
    rowSetDescriptor(rawRows),
    fixture.ownerResidues.preCorrectionRawRows,
  )

  const targetBundle = readPinned(fixture.inputs.targetBundle)
  for (const row of fixture.ownerResidues.rows) {
    const [, kind, value, start, end] = row
    const expected = kind === 'string' ? JSON.stringify(value) : value
    assert.equal(targetBundle.subarray(start, end).toString(), expected)
  }
})
