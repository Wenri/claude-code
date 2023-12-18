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
  TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_EVIDENCE_IDS,
  TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/rate-limit-options-usage-label-owner-overrides.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-rate-limit-options-usage-label-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '0fe7250b7a479e5e32fd41ffa928487395699a212bccb0e5d6decc3d6144f140'
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

function bodyStatementFacts(value, absoluteStart) {
  const statements = parseUnit(value).body[0].body.body
  const rows = statements.map((statement, index) => {
    const serialized = JSON.stringify(canonicalAst(statement))
    return [
      index,
      statement.type,
      absoluteStart + statement.start,
      absoluteStart + statement.end,
      Buffer.byteLength(serialized),
      sha256(serialized),
    ]
  })
  const serialized = JSON.stringify(rows)
  return {
    count: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
    statements,
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
  const indexCounts = JSON.stringify(
    unique.map(index => [
      index,
      indices.filter(candidate => candidate === index).length,
    ]),
  )
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
    indexCountsBytes: Buffer.byteLength(indexCounts),
    indexCountsSha256: sha256(indexCounts),
  }
}

function sourceCacheFacts(value) {
  const sizeMatch = value.match(/_c\((\d+)\)/)
  assert(sizeMatch)
  const indices = [...value.matchAll(/\$\[(\d+)\]/g)].map(match =>
    Number(match[1]),
  )
  const unique = [...new Set(indices)].sort((left, right) => left - right)
  const size = Number(sizeMatch[1])
  return {
    size,
    memberOccurrences: indices.length,
    uniqueIndices: unique.length,
    minIndex: Math.min(...unique),
    maxIndex: Math.max(...unique),
    missingIndices: Array.from({ length: size }, (_, index) => index).filter(
      index => !unique.includes(index),
    ),
  }
}

function assertTargetRegion(ledger, expected) {
  const region = [...ledger.regions, ...ledger.unresolvedTarget].find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
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
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
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

function assertBaselineUnit(ledger, expected) {
  const unit = ledger.unmatchedBaseline.find(
    candidate => candidate.index === expected.targetIndex,
  )
  assert(unit, `baseline u${expected.targetIndex}`)
  assert.deepEqual(
    {
      nodeType: unit.nodeType,
      start: unit.start,
      end: unit.end,
      bytes: unit.end - unit.start,
      tokenCount: unit.tokenCount,
      sha256: unit.sourceHash,
      coarseHash: unit.coarseHash,
    },
    {
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
}

function replaceExactlyOnce(value, before, after) {
  assert.equal(value.split(before).length - 1, 1, before)
  return value.replace(before, after)
}

function normalizedTarget(value) {
  const baseline = fixture.wholeUnitDelta.baselineRegions
  const target = fixture.wholeUnitDelta.targetRegions
  let normalized = value.toString()
  normalized = replaceExactlyOnce(
    normalized,
    `,${target.billingPredicate.text}`,
    '',
  )
  normalized = replaceExactlyOnce(
    normalized,
    target.orgReason.text,
    baseline.orgReason.text,
  )
  normalized = replaceExactlyOnce(
    normalized,
    `,${target.usageLabel.text}`,
    '',
  )
  normalized = replaceExactlyOnce(
    normalized,
    target.requestLabel.text,
    baseline.requestLabel.text,
  )
  normalized = replaceExactlyOnce(
    normalized,
    target.addFundsLabel.text,
    baseline.addFundsLabel.text,
  )
  normalized = replaceExactlyOnce(
    normalized,
    target.switchLabel.text,
    baseline.switchLabel.text,
  )
  normalized = replaceExactlyOnce(
    normalized,
    target.cancelLabel.text,
    baseline.cancelLabel.text,
  )
  return normalized
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
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  return { start, end, ...sourceDescriptor(source.slice(start, end)) }
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1
}

function inlineSourceMap(source) {
  const match = source.match(
    /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([^\n]+)/,
  )
  assert(match)
  return JSON.parse(Buffer.from(match[1], 'base64').toString())
}

function rowIdentity(row) {
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
  const serialized = JSON.stringify(rows.map(rowIdentity))
  return {
    count: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

test('owner override is one frozen static whole-unit admission', () => {
  assert.deepEqual(
    TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.equal(TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_OWNER_OVERRIDES.length, 1)
  const [override] = TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_OWNER_OVERRIDES
  assert.equal(Object.isFrozen(override), true)
  assert.deepEqual(
    {
      key: override.key,
      targetIndex: override.targetIndex,
      paths: override.paths,
      declarations: override.declarations,
      evidenceIds: override.evidenceIds,
    },
    {
      key: '2.1.118-to-2.1.119:18092',
      targetIndex: fixture.targetUnit.targetIndex,
      paths: [fixture.ownerResidues.correctedOwnerPath],
      declarations: ['RateLimitOptionsMenu'],
      evidenceIds: fixture.evidenceIds,
    },
  )
  assert.match(override.behavior, /Admission is static/)
  assert.match(override.behavior, /never authorizes source replay/)
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
})

test('authenticated whole units differ at exactly two statements and seven bounded transformations', () => {
  const ledger = readLedger(fixture.inputs.targetLedger)
  assertBaselineUnit(ledger, fixture.baselineUnit)
  assertTargetRegion(ledger, fixture.targetUnit)
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baseline = slicePinned(baselineBundle, fixture.baselineUnit)
  const target = slicePinned(targetBundle, fixture.targetUnit)

  for (const region of Object.values(fixture.wholeUnitDelta.baselineRegions)) {
    assert.equal(slicePinned(baselineBundle, region).toString(), region.text)
  }
  for (const region of Object.values(fixture.wholeUnitDelta.targetRegions)) {
    assert.equal(slicePinned(targetBundle, region).toString(), region.text)
  }

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

  const baselineBody = bodyStatementFacts(baseline, fixture.baselineUnit.start)
  const targetBody = bodyStatementFacts(target, fixture.targetUnit.start)
  assert.deepEqual(
    {
      count: baselineBody.count,
      jsonBytes: baselineBody.jsonBytes,
      sha256: baselineBody.sha256,
    },
    fixture.baselineUnit.bodyStatements,
  )
  assert.deepEqual(
    {
      count: targetBody.count,
      jsonBytes: targetBody.jsonBytes,
      sha256: targetBody.sha256,
    },
    fixture.targetUnit.bodyStatements,
  )
  const different = []
  for (let index = 0; index < baselineBody.statements.length; index += 1) {
    const baselineStatement = JSON.stringify(
      canonicalAst(baselineBody.statements[index]),
    )
    const targetStatement = JSON.stringify(canonicalAst(targetBody.statements[index]))
    if (baselineStatement !== targetStatement) different.push(index)
  }
  assert.deepEqual(different, fixture.wholeUnitDelta.differentBodyStatementIndices)

  const normalizedText = normalizedTarget(target)
  assert.equal(
    Buffer.byteLength(normalizedText),
    fixture.wholeUnitDelta.normalization.targetTextBytes,
  )
  assert.equal(
    baseline.length,
    fixture.wholeUnitDelta.normalization.baselineTextBytes,
  )
  const normalized = canonicalDescriptor(normalizedText)
  assert.deepEqual(
    { bytes: normalized.bytes, sha256: normalized.sha256 },
    {
      bytes: fixture.wholeUnitDelta.normalization.canonicalAstBytes,
      sha256: fixture.wholeUnitDelta.normalization.canonicalAstSha256,
    },
  )
  assert.equal(normalized.serialized, baselineCanonical.serialized)
  assert.deepEqual(cacheFacts(baseline), fixture.baselineUnit.cache)
  assert.deepEqual(cacheFacts(target), fixture.targetUnit.cache)
})

test('usage-label behavior and retained overage gate are exact', () => {
  const rows = []
  for (const usageBased of [false, true]) {
    for (const needsAdmin of [false, true]) {
      for (const overageState of [false, true]) {
        for (const extraUsageEnabled of [false, true]) {
          const usageLabel = usageBased ? 'usage' : 'extra usage'
          const actionLabel = needsAdmin
            ? overageState
              ? 'Request more'
              : `Request ${usageLabel}`
            : extraUsageEnabled
              ? `Add funds to continue with ${usageLabel}`
              : `Switch to ${usageLabel}`
          const cancelLabel = usageBased
            ? 'Stop'
            : 'Stop and wait for limit to reset'
          rows.push([
            usageBased,
            needsAdmin,
            overageState,
            extraUsageEnabled,
            actionLabel,
            cancelLabel,
          ])
        }
      }
    }
  }
  const serialized = JSON.stringify(rows)
  assert.deepEqual(
    {
      rows: rows.length,
      jsonBytes: Buffer.byteLength(serialized),
      sha256: sha256(serialized),
    },
    {
      rows: fixture.labelContract.rows,
      jsonBytes: fixture.labelContract.jsonBytes,
      sha256: fixture.labelContract.sha256,
    },
  )
  const reasons = JSON.stringify(fixture.labelContract.orgSpendCapReasons)
  assert.equal(
    Buffer.byteLength(reasons),
    fixture.labelContract.orgSpendCapReasonsJsonBytes,
  )
  assert.equal(sha256(reasons), fixture.labelContract.orgSpendCapReasonsSha256)

  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const retained = fixture.wholeUnitDelta.retainedOverage
  assert.equal(slicePinned(baselineBundle, retained.baseline).toString(), retained.baseline.text)
  assert.equal(slicePinned(targetBundle, retained.target).toString(), retained.target.text)
  assert.equal(sha256('"overage"'), retained.literalSha256)
})

test('module export, caller, bindings, and initializer fence the sole UI owner', () => {
  const ledger = readLedger(fixture.inputs.targetLedger)
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  for (const key of ['exportMap', 'caller', 'bindings']) {
    const expected = fixture.moduleBoundary[key]
    assertTargetRegion(ledger, expected)
    assert.equal(slicePinned(targetBundle, expected).toString(), expected.text)
  }

  assertBaselineUnit(ledger, fixture.moduleBoundary.baselineInitializer)
  assertTargetRegion(ledger, fixture.moduleBoundary.targetInitializer)
  const baselineInitializer = slicePinned(
    baselineBundle,
    fixture.moduleBoundary.baselineInitializer,
  )
  const targetInitializer = slicePinned(
    targetBundle,
    fixture.moduleBoundary.targetInitializer,
  )
  const baselineCanonical = canonicalDescriptor(baselineInitializer)
  const targetCanonical = canonicalDescriptor(targetInitializer)
  assert.deepEqual(
    { bytes: baselineCanonical.bytes, sha256: baselineCanonical.sha256 },
    {
      bytes: fixture.moduleBoundary.baselineInitializer.canonicalAstBytes,
      sha256: fixture.moduleBoundary.baselineInitializer.canonicalAstSha256,
    },
  )
  assert.deepEqual(
    { bytes: targetCanonical.bytes, sha256: targetCanonical.sha256 },
    {
      bytes: fixture.moduleBoundary.targetInitializer.canonicalAstBytes,
      sha256: fixture.moduleBoundary.targetInitializer.canonicalAstSha256,
    },
  )
  assert.equal(targetCanonical.serialized, baselineCanonical.serialized)
})

test('Target120 and Target121 retain the exact complete runtime unit', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const target = canonicalDescriptor(slicePinned(targetBundle, fixture.targetUnit))
  for (const lineage of fixture.runtimeLineage) {
    const ledger = readLedger(fixture.inputs[lineage.ledgerInput])
    const bundle = readPinned(fixture.inputs[lineage.bundleInput])
    assertTargetRegion(ledger, lineage)
    const candidate = canonicalDescriptor(slicePinned(bundle, lineage))
    assert.deepEqual(
      { bytes: candidate.bytes, sha256: candidate.sha256 },
      {
        bytes: lineage.canonicalAstBytes,
        sha256: lineage.canonicalAstSha256,
      },
    )
    assert.equal(candidate.serialized, target.serialized)
    assert.equal(cacheFacts(slicePinned(bundle, lineage)).size, 28)
  }
})

test('source lineage authenticates the owner but fails closed against replay', () => {
  const ts = require(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
  const owner = fixture.sourceOwner
  const sourcePath = path.join(sourceRoot, owner.sourceRootPath)
  const stat = fs.lstatSync(sourcePath)
  assert.equal(stat.isFile(), true)
  assert.equal(stat.isSymbolicLink(), false)
  const source = fs.readFileSync(sourcePath, 'utf8')
  assert.deepEqual(sourceDescriptor(source), {
    chars: owner.chars,
    bytes: owner.bytes,
    sha256: owner.sha256,
  })
  for (const commit of [
    owner.target118Commit,
    owner.target119Commit,
    owner.target120Commit,
  ]) {
    assert.equal(gitBlob(commit, owner.path), owner.unchangedBlob)
    assert.equal(sha256(gitShow(commit, owner.path)), owner.sha256)
  }
  const sourceFile = ts.createSourceFile(
    owner.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  assert.deepEqual(
    tsDeclarationDescriptor(sourceFile, source, 'RateLimitOptionsMenu'),
    owner.declaration,
  )
  const declaration = source.slice(owner.declaration.start, owner.declaration.end)
  assert.deepEqual(sourceCacheFacts(declaration), owner.cache)
  for (const marker of owner.requiredMarkers) {
    assert.ok(countOccurrences(source, marker) >= 1, marker)
  }
  for (const marker of owner.missingMarkers) {
    assert.equal(countOccurrences(source, marker), 0, marker)
  }

  const sourceMap = inlineSourceMap(source)
  assert.deepEqual(sourceMap.sources, owner.sourceMap.sources)
  assert.equal(sourceMap.sourcesContent.length, 1)
  const rawSource = sourceMap.sourcesContent[0]
  assert.deepEqual(sourceDescriptor(rawSource), owner.sourceMap.content)
  const rawFile = ts.createSourceFile(
    'rate-limit-options.tsx',
    rawSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(rawFile.parseDiagnostics.length, 0)
  assert.deepEqual(
    tsDeclarationDescriptor(rawFile, rawSource, 'RateLimitOptionsMenu'),
    owner.sourceMap.declaration,
  )
  for (const marker of owner.missingMarkers) {
    assert.equal(countOccurrences(rawSource, marker), 0, marker)
  }

  const later = owner.laterRecovery
  assert.equal(gitBlob(later.commit, owner.path), later.blob)
  const laterSource = gitShow(later.commit, owner.path).toString()
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
  assert.equal(laterFile.parseDiagnostics.length, 0)
  assert.deepEqual(
    tsDeclarationDescriptor(laterFile, laterSource, 'RateLimitOptionsMenu'),
    later.declaration,
  )
  const laterDeclaration = laterSource.slice(
    later.declaration.start,
    later.declaration.end,
  )
  assert.deepEqual(sourceCacheFacts(laterDeclaration), later.cache)
  for (const marker of later.requiredMarkers) {
    assert.ok(countOccurrences(laterSource, marker) >= 1, marker)
  }
  for (const marker of later.missingMarkers) {
    assert.equal(countOccurrences(laterSource, marker), 0, marker)
  }
  assert.equal(
    sha256(inlineSourceMap(laterSource).sourcesContent[0]),
    later.sourceMapContentSha256,
  )
  assert.equal(
    inlineSourceMap(laterSource).sourcesContent[0],
    rawSource,
    'later semantic reconstruction deliberately preserves the stale authored source map',
  )

  const history = spawnSync(
    'git',
    [
      'log',
      '--all',
      '--format=%H',
      "-SisUsageBased = getOauthAccountInfo()?.billingType",
      '--',
      owner.path,
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(history.status, 0, history.stderr)
  assert.deepEqual(history.stdout.trim().split('\n').filter(Boolean), [later.commit])
  assert.notEqual(owner.cache.size, fixture.targetUnit.cache.size)
  assert.notEqual(later.cache.size, fixture.targetUnit.cache.size)
})

test('all nine owner rows are exact and the retained row is not misclassified', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  for (const row of fixture.ownerResidues.rows) {
    const value = targetBundle.subarray(row[3], row[4]).toString()
    assert.ok(
      value === row[2] || value === JSON.stringify(row[2]),
      `${row[1]} ${row[2]}`,
    )
  }
  assert.equal(fixture.ownerResidues.genuineRows.length, 8)
  assert.deepEqual(fixture.ownerResidues.retainedRows, [fixture.ownerResidues.rows[2]])
  const partition = [
    ...fixture.ownerResidues.genuineRows,
    ...fixture.ownerResidues.retainedRows,
  ].sort((left, right) => left[3] - right[3])
  assert.deepEqual(partition, fixture.ownerResidues.rows)

  const reportPath = path.join(root, fixture.inputs.observedReport.path)
  if (!fs.existsSync(reportPath)) return
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const select = rows =>
    rows.filter(row => row.structural.index === fixture.targetUnit.targetIndex)
  const allOwnerRows = select(report.sourceRuntimeOwnerResidueRows)
  const addedOwnerRows = select(report.sourceRuntimeAddedOwnerResidueRows)
  const rawRows = select(report.rows)
  if (allOwnerRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(allOwnerRows),
      fixture.ownerResidues.preCorrectionAllOwnerRows,
    )
  }
  assert.ok(
    addedOwnerRows.length === 0 ||
      JSON.stringify(addedOwnerRows.map(rowIdentity)) ===
        JSON.stringify(fixture.ownerResidues.rows),
    'scanner is exact pre-correction or corrected state',
  )
  if (addedOwnerRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(addedOwnerRows),
      fixture.ownerResidues.preCorrectionAddedOwnerRows,
    )
    for (const row of addedOwnerRows) {
      assert.deepEqual(row.ownerPaths, [fixture.ownerResidues.generatedOwnerPath])
      assert.deepEqual(row.ownerSourceMatches, [])
    }
  }
  assert.ok(
    rawRows.length === 0 ||
      JSON.stringify(rowSetDescriptor(rawRows)) ===
        JSON.stringify(fixture.ownerResidues.preCorrectionRawRows),
  )
})
