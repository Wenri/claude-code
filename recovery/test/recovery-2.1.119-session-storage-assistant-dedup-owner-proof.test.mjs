import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  parse,
  parseExpressionAt,
} from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_EVIDENCE_IDS,
  TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/session-storage-assistant-dedup-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-session-storage-assistant-dedup-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '484fc1db416b8dd797163c940f7a4366ea307305940362b7256d4c7649bbd604'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

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

function readLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
}

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      canonicalAst(entry, value, index),
    )
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
  const ast = parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const serialized = JSON.stringify(canonicalAst(ast))
  return {
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
    serialized,
  }
}

function walkAcorn(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walkAcorn(child, predicate, values)
    } else {
      walkAcorn(value, predicate, values)
    }
  }
  return values
}

function policyFacts(value) {
  const ast = parseExpressionAt(value.toString(), 0, {
    ecmaVersion: 'latest',
  })
  assert.equal(ast.type, 'ObjectExpression')
  return {
    ast,
    entries: Object.fromEntries(
      ast.properties.map(property => [
        property.key.name ?? property.key.value,
        property.value.value,
      ]),
    ),
  }
}

function assertTargetRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert.ok(region, `u${expected.targetIndex}`)
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
      unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
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
      unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount,
    },
  )
  if ('baselineUnitIndex' in expected) {
    assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
    assert.equal(region.pairReason, expected.pairReason)
  }
  return region
}

function assertBaselineUnit(ledger, expected) {
  const unit = ledger.unmatchedBaseline.find(
    candidate => candidate.index === expected.targetIndex,
  )
  assert.ok(unit, `baseline u${expected.targetIndex}`)
  assert.deepEqual(
    {
      nodeType: unit.nodeType,
      start: unit.start,
      end: unit.end,
      bytes: unit.end - unit.start,
      tokenCount: unit.tokenCount,
      sha256: unit.sourceHash,
      coarseHash: unit.coarseHash,
      topDefinitionCount: unit.topDefinitionCount,
    },
    {
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
      topDefinitionCount: expected.topDefinitionCount,
    },
  )
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
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function gitShow(commit, sourcePath) {
  const result = spawnSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

test('Target119 session-storage fixture exposes one frozen static override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.deepEqual(
    TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.equal(
    Object.isFrozen(
      TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_OWNER_OVERRIDES,
    ),
    true,
  )
  assert.equal(
    TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_OWNER_OVERRIDES.length,
    1,
  )
  const [override] =
    TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_OWNER_OVERRIDES
  assert.equal(Object.isFrozen(override), true)
  assert.deepEqual(
    {
      key: override.key,
      targetIndex: override.targetIndex,
      paths: [...override.paths],
      declarations: [...override.declarations],
      evidenceIds: [...override.evidenceIds],
      behavior: override.behavior,
    },
    {
      key: `${fixture.case}:${fixture.targetUnit.targetIndex}`,
      targetIndex: fixture.targetUnit.targetIndex,
      paths: [fixture.ownerResidues.correctedOwnerPath],
      declarations: ['Project', 'appendEntry', 'isTranscriptMessage'],
      evidenceIds: fixture.evidenceIds,
      behavior: fixture.ownerBehavior,
    },
  )
  assert.deepEqual(
    descriptor(readPinned(fixture.inputs.ownerOverride)),
    {
      bytes: fixture.inputs.ownerOverride.bytes,
      sha256: fixture.inputs.ownerOverride.sha256,
    },
  )
  assert.equal(fixture.sourceReplayBlocker.replayHelper, null)
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.match(
    fixture.sourceReplayBlocker.decision,
    /static whole-unit owner proof only; no replay helper and no source writes/,
  )
  assert.match(override.behavior, /never authorizes a source replay/)
})

test('authenticated complete initializer differs only in three release macros', () => {
  const ledger = readLedger(fixture.inputs.targetLedger)
  assertBaselineUnit(ledger, fixture.baselineUnit)
  assertTargetRegion(ledger, fixture.moduleBoundary.prebinding)
  assertTargetRegion(ledger, fixture.targetUnit)

  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baseline = slicePinned(baselineBundle, fixture.baselineUnit)
  const target = slicePinned(targetBundle, fixture.targetUnit)
  const prebinding = slicePinned(targetBundle, fixture.moduleBoundary.prebinding)

  const baselineCanonical = canonicalDescriptor(baseline)
  const targetCanonical = canonicalDescriptor(target)
  assert.deepEqual(
    {
      bytes: baselineCanonical.bytes,
      sha256: baselineCanonical.sha256,
    },
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
  const prebindingCanonical = canonicalDescriptor(prebinding)
  assert.deepEqual(
    {
      bytes: prebindingCanonical.bytes,
      sha256: prebindingCanonical.sha256,
    },
    {
      bytes: fixture.moduleBoundary.prebinding.canonicalAstBytes,
      sha256: fixture.moduleBoundary.prebinding.canonicalAstSha256,
    },
  )

  let normalized = target.toString()
  for (const replacement of fixture.wholeUnitEquivalence.replacements) {
    assert.equal(
      slicePinned(baselineBundle, replacement.baseline).toString(),
      replacement.baseline.text,
    )
    assert.equal(
      slicePinned(targetBundle, replacement.target).toString(),
      replacement.target.text,
    )
    assert.equal(normalized.split(replacement.target.text).length, 2)
    normalized = normalized.replace(
      replacement.target.text,
      replacement.baseline.text,
    )
  }
  assert.deepEqual(descriptor(normalized), {
    bytes: fixture.wholeUnitEquivalence.normalizedTargetBytes,
    sha256: fixture.wholeUnitEquivalence.normalizedTargetSha256,
  })
  const normalizedCanonical = canonicalDescriptor(normalized)
  assert.deepEqual(
    {
      bytes: normalizedCanonical.bytes,
      sha256: normalizedCanonical.sha256,
    },
    {
      bytes: fixture.wholeUnitEquivalence.canonicalAstBytes,
      sha256: fixture.wholeUnitEquivalence.canonicalAstSha256,
    },
  )
  assert.equal(normalizedCanonical.serialized, baselineCanonical.serialized)

  const prebindingAst = parse(prebinding.toString(), {
    ecmaVersion: 'latest',
  })
  const bindingNames = prebindingAst.body[0].declarations.map(
    declaration => declaration.id.name,
  )
  assert.ok(bindingNames.includes(fixture.moduleBoundary.declaredPolicyBinding))
  const targetAst = parse(target.toString(), { ecmaVersion: 'latest' })
  const assignments = walkAcorn(
    targetAst,
    node =>
      node.type === 'AssignmentExpression' &&
      node.left.type === 'Identifier' &&
      node.left.name === fixture.moduleBoundary.declaredPolicyBinding &&
      node.right.type === 'ObjectExpression',
  )
  assert.equal(assignments.length, 1)
  assert.equal(
    fixture.targetUnit.start + assignments[0].right.start,
    fixture.policy.target.start,
  )
  assert.equal(
    fixture.targetUnit.start + assignments[0].right.end,
    fixture.policy.target.end,
  )
})

test('the complete append policy and assistant route are retained exactly', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baseline = slicePinned(baselineBundle, fixture.policy.baseline)
  const target = slicePinned(targetBundle, fixture.policy.target)
  assert.equal(target.toString(), baseline.toString())
  assert.deepEqual(policyFacts(target).entries, fixture.policy.entries)
  assert.equal(Object.keys(fixture.policy.entries).length, 25)

  for (const input of [fixture.policy.baseline, fixture.policy.target]) {
    const bundle = input === fixture.policy.baseline ? baselineBundle : targetBundle
    const canonical = canonicalDescriptor(
      Buffer.from(`(${slicePinned(bundle, input).toString()})`),
    )
    assert.deepEqual(
      { bytes: canonical.bytes, sha256: canonical.sha256 },
      {
        bytes: input.canonicalAstBytes,
        sha256: input.canonicalAstSha256,
      },
    )
  }

  const assistant = fixture.policy.assistantProperty
  for (const [bundle, start, end] of [
    [baselineBundle, assistant.baselineStart, assistant.baselineEnd],
    [targetBundle, assistant.targetStart, assistant.targetEnd],
  ]) {
    const value = bundle.subarray(start, end)
    assert.deepEqual(descriptor(value), {
      bytes: assistant.bytes,
      sha256: assistant.sha256,
    })
    assert.equal(value.toString(), assistant.text)
  }
  assert.deepEqual(
    fixture.ownerResidues.rows[fixture.ownerResidues.retainedOccurrenceOrderRows[0]],
    [18951, 'property', 'assistant', 11569281, 11569290, 2, 13, true],
  )
  assert.deepEqual(
    fixture.ownerResidues.releaseMetadataRows.map(
      index => fixture.ownerResidues.rows[index][2],
    ),
    Object.values(fixture.macro.target),
  )
})

test('Target119 source binds assistant dedup but is not a table replay preimage', async () => {
  const expected = fixture.target119Source
  const sourcePath = path.join(
    sourceRoot,
    expected.path.replace(/^src\//, ''),
  )
  const sourceBytes = fs.readFileSync(sourcePath)
  const source = sourceBytes.toString()
  assert.deepEqual(sourceDescriptor(source), {
    chars: expected.chars,
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  const gitBytes = gitShow(expected.commit, expected.path)
  assert.equal(gitBytes.equals(sourceBytes), true)
  assert.equal(
    spawnSync('git', ['rev-parse', `${expected.commit}^{tree}`], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim(),
    expected.tree,
  )
  assert.equal(
    spawnSync('git', ['rev-parse', `${expected.commit}:${expected.path}`], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim(),
    expected.blob,
  )

  const ts = await loadTypeScript()
  const sourceFile = ts.createSourceFile(
    expected.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, expected.parseDiagnostics)
  const nodes = []
  const visit = node => {
    nodes.push(node)
    node.forEachChild(visit)
  }
  visit(sourceFile)
  const project = nodes.find(
    node => ts.isClassDeclaration(node) && node.name?.text === 'Project',
  )
  const appendEntry = nodes.find(
    node =>
      ts.isMethodDeclaration(node) &&
      node.name?.getText(sourceFile) === 'appendEntry',
  )
  const isTranscriptMessage = nodes.find(
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'isTranscriptMessage',
  )
  assert.ok(project)
  assert.ok(appendEntry)
  assert.ok(isTranscriptMessage)

  for (const [node, input] of [
    [project, expected.projectClass],
    [appendEntry, expected.appendEntry],
    [isTranscriptMessage, expected.isTranscriptMessage],
  ]) {
    const start = node.getStart(sourceFile)
    const value = source.slice(start, node.end)
    assert.deepEqual(
      {
        characterStart: start,
        characterEnd: node.end,
        byteStart: Buffer.byteLength(source.slice(0, start)),
        byteEnd: Buffer.byteLength(source.slice(0, node.end)),
        bytes: Buffer.byteLength(value),
        sha256: sha256(value),
      },
      {
        characterStart: input.characterStart,
        characterEnd: input.characterEnd,
        byteStart: input.byteStart,
        byteEnd: input.byteEnd,
        bytes: input.bytes,
        sha256: input.sha256,
      },
    )
  }

  const guardTypes = []
  const collectGuardTypes = node => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.expression.getText(sourceFile) === 'entry' &&
      node.left.name.text === 'type' &&
      ts.isStringLiteral(node.right)
    ) {
      guardTypes.push(node.right.text)
    }
    node.forEachChild(collectGuardTypes)
  }
  collectGuardTypes(isTranscriptMessage)
  assert.deepEqual(guardTypes, expected.isTranscriptMessage.types)

  const markers = [
    ["entry.type === 'content-replacement'", 'contentReplacementTestStart'],
    ["entry.type === 'fork-context-ref'", 'forkContextRefTestStart'],
    [
      'const messageSet = await getSessionMessages(sessionId)',
      'messageSetDeclarationStart',
    ],
    ['if (isTranscriptMessage(entry))', 'remoteTranscriptGuardStart'],
  ]
  const appendStart = appendEntry.getStart(sourceFile)
  const appendText = source.slice(appendStart, appendEntry.end)
  for (const [needle, field] of markers) {
    const local = appendText.indexOf(needle)
    assert.notEqual(local, -1, needle)
    assert.equal(appendStart + local, expected.architecture[field])
  }
  assert.equal(
    (source.match(/ENTRY_APPEND_POLICY/g) ?? []).length,
    expected.architecture.entryAppendPolicyDeclarationCount,
  )
  assert.equal(
    (source.match(/dedup-transcript/g) ?? []).length,
    expected.architecture.dedupTranscriptLiteralCount,
  )

  const prior = JSON.parse(readPinned(fixture.inputs.priorTarget118PolicyProof))
  assert.equal(
    prior.inputs.historicalSource.appendEntryMethod.sha256,
    expected.appendEntry.sha256,
  )
  assert.equal(
    prior.inputs.historicalSource.appendEntryMethod.bytes,
    expected.appendEntry.bytes,
  )
  const priorSource = gitShow(
    prior.inputs.historicalSource.commit,
    prior.inputs.historicalSource.file.path,
  ).toString()
  const priorMethod = priorSource.slice(
    prior.inputs.historicalSource.appendEntryMethod.characterStart,
    prior.inputs.historicalSource.appendEntryMethod.characterEnd,
  )
  assert.equal(priorMethod, appendText)
})

test('Target120 retains the policy and Target121 adds only frame-link', () => {
  for (const [bundleInput, ledgerInput, unit, policy] of [
    [
      fixture.inputs.target120Bundle,
      fixture.inputs.target120Ledger,
      fixture.laterRuntimeLineage.target120Unit,
      fixture.laterRuntimeLineage.target120Policy,
    ],
    [
      fixture.inputs.target121Bundle,
      fixture.inputs.target121Ledger,
      fixture.laterRuntimeLineage.target121Unit,
      fixture.laterRuntimeLineage.target121Policy,
    ],
  ]) {
    const bundle = readPinned(bundleInput)
    assertTargetRegion(readLedger(ledgerInput), unit)
    slicePinned(bundle, unit)
    const policyBytes = slicePinned(bundle, policy)
    const assistant = bundle.subarray(
      policy.assistantStart,
      policy.assistantEnd,
    )
    assert.deepEqual(descriptor(assistant), {
      bytes: fixture.policy.assistantProperty.bytes,
      sha256: fixture.policy.assistantProperty.sha256,
    })
    assert.equal(assistant.toString(), fixture.policy.assistantProperty.text)
    if (unit.targetIndex === 19022) {
      assert.deepEqual(policyFacts(policyBytes).entries, fixture.policy.entries)
      assert.equal(policyBytes.toString(), slicePinned(
        readPinned(fixture.inputs.targetBundle),
        fixture.policy.target,
      ).toString())
    } else {
      const entries = policyFacts(policyBytes).entries
      assert.equal(entries['frame-link'], 'always')
      delete entries['frame-link']
      assert.deepEqual(entries, fixture.policy.entries)
      const withoutAddedEntry = policyBytes
        .toString()
        .replace(policy.soleAddedEntryText, '')
      assert.deepEqual(descriptor(withoutAddedEntry), {
        bytes: policy.withoutAddedEntryBytes,
        sha256: policy.withoutAddedEntrySha256,
      })
    }
  }
})

test('scanner rows are exact in either pre-correction or corrected state', () => {
  const observed = fixture.inputs.observedReport
  const reportPath = path.join(root, observed.path)
  if (!fs.existsSync(reportPath)) return
  const bytes = fs.readFileSync(reportPath)
  assert.equal(observed.mutableAfterCorrection, true)
  if (sha256(bytes) === observed.observedSha256) {
    assert.equal(bytes.length, observed.observedBytes)
  }
  const report = JSON.parse(bytes)
  const select = rows =>
    rows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
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
      JSON.stringify(rawRows.map(rowIdentity)) ===
        JSON.stringify(
          fixture.ownerResidues.releaseMetadataRows.map(
            index => fixture.ownerResidues.rows[index],
          ),
        ),
  )
  if (rawRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(rawRows),
      fixture.ownerResidues.preCorrectionRawRows,
    )
  }

  const targetBundle = readPinned(fixture.inputs.targetBundle)
  for (const row of fixture.ownerResidues.rows) {
    const actual = targetBundle.subarray(row[3], row[4]).toString()
    assert.ok(actual === row[2] || actual === JSON.stringify(row[2]))
  }
})
