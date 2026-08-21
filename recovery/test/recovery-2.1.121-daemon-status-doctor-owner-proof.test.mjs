import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/daemon-status-doctor-owner-overrides.mjs'

const {
  TARGET121_DAEMON_STATUS_DOCTOR_EVIDENCE_IDS,
  TARGET121_DAEMON_STATUS_DOCTOR_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-daemon-status-doctor-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'e2137a1c2b87b55167c7a06133f52dc2a30146d3d11e90b7550233ebe20e8201'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function exactBufferSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) {
    assert.equal(value.toString('utf8'), expected.exact, label)
  }
  return value.toString('utf8')
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function canonicalDigest(rows) {
  return descriptor(Buffer.from(JSON.stringify(rows)))
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return count
    count += 1
    offset = next + needle.length
  }
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit)
    }
  }
}

function canonicalize(value, parent = null, key = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalize(child, parent, index))
  }
  if (value === null || typeof value !== 'object') return value
  const result = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
    if (value.type === 'Identifier' && childKey === 'name') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed) ||
        (parent?.type === 'Property' &&
          key === 'key' &&
          !parent.computed &&
          !parent.shorthand) ||
        (parent?.type === 'MethodDefinition' &&
          key === 'key' &&
          !parent.computed)
      result[childKey] = preserve ? child : '@id'
    } else {
      result[childKey] = canonicalize(child, value, childKey)
    }
  }
  return result
}

function normalizeBuildFields(node) {
  let count = 0
  walk(node, candidate => {
    if (candidate.type !== 'ObjectExpression') return
    const properties = new Map(
      candidate.properties
        .filter(property => property.type === 'Property')
        .map(property => [property.key.name ?? property.key.value, property]),
    )
    if (!['VERSION', 'BUILD_TIME', 'GIT_SHA'].every(key => properties.has(key))) {
      return
    }
    for (const key of ['VERSION', 'BUILD_TIME', 'GIT_SHA']) {
      const literal = properties.get(key).value
      assert.equal(literal.type, 'Literal')
      literal.value = '@build'
      literal.raw = '"@build"'
    }
    count += 1
  })
  return count
}

function canonicalDescriptor(node, normalizeBuild = false) {
  const copy = structuredClone(node)
  const buildObjectCount = normalizeBuild ? normalizeBuildFields(copy) : 0
  const result = descriptor(Buffer.from(JSON.stringify(canonicalize(copy))))
  return normalizeBuild ? { ...result, buildObjectCount } : result
}

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  assert.equal(node.body.body.length, expected.bodyStatementCount)
  return { node, source, unitStart: expected.start }
}

function nodeAt(parsed, expected) {
  let found
  walk(parsed.node, node => {
    if (
      parsed.unitStart + node.start === expected.start &&
      parsed.unitStart + node.end === expected.end
    ) {
      assert.equal(found, undefined, 'unique AST region')
      found = node
    }
  })
  assert.ok(found, `AST region ${expected.start}..${expected.end}`)
  return found
}

function exactNodeSlice(parsed, expected, label) {
  const node = nodeAt(parsed, expected)
  assert.equal(node.type, expected.nodeType, label)
  const value = parsed.source.slice(node.start, node.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) assert.equal(value, expected.exact, label)
  return { node, value }
}

function buildMemberExpressions(unit) {
  const members = []
  walk(unit, node => {
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.name === 'VERSION' &&
      node.object?.type === 'ObjectExpression'
    ) {
      members.push(node)
    }
  })
  return members
}

function macroFields(member) {
  return Object.fromEntries(
    member.object.properties.map(property => [
      property.key.name ?? property.key.value,
      property.value.value,
    ]),
  )
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
  )
}

function selectedBaselineSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.120/src'),
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function parseTypescript(filename, expected) {
  const ts = typescript()
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return { ts, source, sourceFile }
}

function tsNodeDescriptor(parsed, node, expected, label) {
  const start = node.getStart(parsed.sourceFile)
  const end = node.end
  const value = parsed.source.slice(start, end)
  const first = parsed.sourceFile.getLineAndCharacterOfPosition(start)
  const last = parsed.sourceFile.getLineAndCharacterOfPosition(end)
  assert.deepEqual(
    {
      start,
      end,
      line: first.line + 1,
      endLine: last.line + 1,
      chars: value.length,
      ...descriptor(value),
    },
    {
      start: expected.start,
      end: expected.end,
      line: expected.line,
      endLine: expected.endLine,
      chars: expected.chars,
      bytes: expected.bytes,
      sha256: expected.sha256,
    },
    label,
  )
  return value
}

function findTsNamedDeclaration(parsed, name) {
  const found = []
  const visit = node => {
    if (
      (parsed.ts.isFunctionDeclaration(node) ||
        parsed.ts.isTypeAliasDeclaration(node)) &&
      node.name?.text === name
    ) {
      found.push(node)
    }
    parsed.ts.forEachChild(node, visit)
  }
  visit(parsed.sourceFile)
  assert.equal(found.length, 1, `one ${name}`)
  return found[0]
}

function findTsImport(parsed, moduleName) {
  const found = parsed.sourceFile.statements.filter(
    node =>
      parsed.ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === moduleName,
  )
  assert.equal(found.length, 1, `one ${moduleName} import`)
  return found[0]
}

function findTsNodeAt(parsed, expected) {
  const found = []
  const visit = node => {
    if (
      node.getStart(parsed.sourceFile) === expected.start &&
      node.end === expected.end
    ) {
      found.push(node)
    }
    parsed.ts.forEachChild(node, visit)
  }
  visit(parsed.sourceFile)
  const semanticNodes = found.filter(node => !parsed.ts.isIdentifier(node))
  assert.equal(
    semanticNodes.length,
    1,
    `TS region ${expected.start}..${expected.end}`,
  )
  return semanticNodes[0]
}

test(
  'Target121 daemon status/Doctor fixture and two owner overrides are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      Object.keys(ownerProofModule).sort(),
      [
        'TARGET121_DAEMON_STATUS_DOCTOR_EVIDENCE_IDS',
        'TARGET121_DAEMON_STATUS_DOCTOR_OWNER_OVERRIDES',
      ],
    )
    assert.deepEqual(
      TARGET121_DAEMON_STATUS_DOCTOR_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_DAEMON_STATUS_DOCTOR_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: override.paths,
        declarations: override.declarations,
        evidenceIds: override.evidenceIds,
      })),
      [
        {
          key: `${caseName}:16363`,
          targetIndex: 16363,
          paths: ['src/daemon/status.ts'],
          declarations: ['BgDaemonStatus', 'getBgDaemonStatus'],
          evidenceIds: fixture.evidenceIds,
        },
        {
          key: `${caseName}:16369`,
          targetIndex: 16369,
          paths: ['src/screens/Doctor.tsx'],
          declarations: ['BackgroundServerDetails', 'BackgroundServer'],
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(TARGET121_DAEMON_STATUS_DOCTOR_OWNER_OVERRIDES),
      true,
    )
    assert.match(
      TARGET121_DAEMON_STATUS_DOCTOR_OWNER_OVERRIDES[0].behavior,
      /leases.*leaseClients.*stricter.*static whole-unit owner proof.*no source replay/s,
    )
    assert.match(
      TARGET121_DAEMON_STATUS_DOCTOR_OWNER_OVERRIDES[1].behavior,
      /alpha-canonically identical.*VERSION.*BUILD_TIME.*GIT_SHA.*compiler metadata/s,
    )
  },
)

test(
  'authenticated status producer and Doctor consumer units have exact predecessors',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const baseline = readExact(baselinePath, fixture.inputs.baselineBundle)
    const target = readExact(targetPath, fixture.inputs.targetBundle)
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const parsed = new Map()
    for (const unit of fixture.units) {
      const baselineUnit = parseUnit(
        baseline,
        unit.baseline,
        `Target120 u${unit.baseline.baselineUnitIndex}`,
      )
      const targetUnit = parseUnit(
        target,
        unit.target,
        `Target121 u${unit.target.targetIndex}`,
      )
      parsed.set(unit.target.targetIndex, { baselineUnit, targetUnit })
      const targetRegion = ledger.regions[unit.target.targetIndex]
      assert.equal(targetRegion.classification, unit.target.classification)
      assert.equal(targetRegion.baselineUnitIndex, undefined)
      assert.deepEqual(
        {
          nodeType: targetRegion.target.nodeType,
          start: targetRegion.target.start,
          end: targetRegion.target.end,
          tokenCount: targetRegion.target.tokenCount,
          sourceHash: targetRegion.target.sourceHash,
          coarseHash: targetRegion.target.coarseHash,
          line: targetRegion.target.location.line,
          column: targetRegion.target.location.column,
          unknownFreeIdentifierCount: targetRegion.unknownFreeIdentifierCount,
        },
        {
          nodeType: unit.target.nodeType,
          start: unit.target.start,
          end: unit.target.end,
          tokenCount: unit.target.tokenCount,
          sourceHash: unit.target.sha256,
          coarseHash: unit.target.coarseHash,
          line: unit.target.line,
          column: unit.target.column,
          unknownFreeIdentifierCount: unit.target.unknownFreeIdentifierCount,
        },
      )
      const unmatched = ledger.unmatchedBaseline.find(
        row => row.index === unit.baseline.baselineUnitIndex,
      )
      assert.ok(unmatched)
      assert.deepEqual(
        {
          nodeType: unmatched.nodeType,
          start: unmatched.start,
          end: unmatched.end,
          tokenCount: unmatched.tokenCount,
          sourceHash: unmatched.sourceHash,
          coarseHash: unmatched.coarseHash,
          line: unmatched.location.line,
          column: unmatched.location.column,
        },
        {
          nodeType: unit.baseline.nodeType,
          start: unit.baseline.start,
          end: unit.baseline.end,
          tokenCount: unit.baseline.tokenCount,
          sourceHash: unit.baseline.sha256,
          coarseHash: unit.baseline.coarseHash,
          line: unit.baseline.line,
          column: unit.baseline.column,
        },
      )
    }

    const status = parsed.get(16363)
    assert.deepEqual(
      canonicalDescriptor(status.baselineUnit.node),
      fixture.wholeUnitEvidence.u16363.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(status.targetUnit.node),
      fixture.wholeUnitEvidence.u16363.targetCanonical,
    )
    const baselineStatusNormalized = canonicalDescriptor(
      status.baselineUnit.node,
      true,
    )
    const targetStatusNormalized = canonicalDescriptor(
      status.targetUnit.node,
      true,
    )
    assert.deepEqual(
      {
        bytes: baselineStatusNormalized.bytes,
        sha256: baselineStatusNormalized.sha256,
      },
      fixture.wholeUnitEvidence.u16363.baselineBuildNormalizedCanonical,
    )
    assert.deepEqual(
      {
        bytes: targetStatusNormalized.bytes,
        sha256: targetStatusNormalized.sha256,
      },
      fixture.wholeUnitEvidence.u16363.targetBuildNormalizedCanonical,
    )
    assert.equal(baselineStatusNormalized.buildObjectCount, 1)
    assert.equal(targetStatusNormalized.buildObjectCount, 1)

    const baselineBody = status.baselineUnit.node.body.body
    const targetBody = status.targetUnit.node.body.body
    const baselineInitial = baselineBody[0].declarations.slice(0, 5)
    const targetInitial = targetBody[0].declarations.slice(0, 5)
    const baselineJobs = baselineBody[1].consequent.body[1]
    const targetJobs = targetBody[1].consequent.body[1]
    const baselineProperties = baselineBody[2].argument.properties
    const targetProperties = targetBody[2].argument.properties.slice(0, 13)
    const digestRows = [
      ...baselineInitial.map((node, index) => [
        'initial',
        index,
        canonicalDescriptor(node, true).sha256,
      ]),
      ['jobs', canonicalDescriptor(baselineJobs, true).sha256],
      ...baselineProperties.map(property => [
        'return',
        property.key.name,
        canonicalDescriptor(property, true).sha256,
      ]),
    ]
    assert.equal(digestRows.length, fixture.wholeUnitEvidence.u16363.retainedSubtrees.count)
    assert.deepEqual(
      canonicalDigest(digestRows),
      {
        bytes: fixture.wholeUnitEvidence.u16363.retainedSubtrees.bytes,
        sha256: fixture.wholeUnitEvidence.u16363.retainedSubtrees.sha256,
      },
    )
    for (let index = 0; index < 5; index++) {
      assert.deepEqual(
        canonicalDescriptor(targetInitial[index], true),
        canonicalDescriptor(baselineInitial[index], true),
      )
    }
    assert.deepEqual(
      canonicalDescriptor(targetJobs, true),
      canonicalDescriptor(baselineJobs, true),
    )
    for (let index = 0; index < baselineProperties.length; index++) {
      assert.equal(targetProperties[index].key.name, baselineProperties[index].key.name)
      assert.deepEqual(
        canonicalDescriptor(targetProperties[index], true),
        canonicalDescriptor(baselineProperties[index], true),
      )
    }
    for (const expected of Object.values(
      fixture.wholeUnitEvidence.u16363.targetLeaseContract,
    )) {
      exactNodeSlice(status.targetUnit, expected, expected.exact ?? expected.nodeType)
    }
    exactNodeSlice(
      status.baselineUnit,
      fixture.wholeUnitEvidence.u16363.baselineListSetup,
      'baseline list setup',
    )

    const doctor = parsed.get(16369)
    assert.deepEqual(
      canonicalDescriptor(doctor.baselineUnit.node),
      fixture.wholeUnitEvidence.u16369.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(doctor.targetUnit.node),
      fixture.wholeUnitEvidence.u16369.targetCanonical,
    )
    const baselineDoctorNormalized = canonicalDescriptor(
      doctor.baselineUnit.node,
      true,
    )
    const targetDoctorNormalized = canonicalDescriptor(
      doctor.targetUnit.node,
      true,
    )
    assert.deepEqual(targetDoctorNormalized, baselineDoctorNormalized)
    assert.deepEqual(
      {
        buildObjectCount: targetDoctorNormalized.buildObjectCount,
        bytes: targetDoctorNormalized.bytes,
        sha256: targetDoctorNormalized.sha256,
      },
      fixture.wholeUnitEvidence.u16369.normalizedCompleteUnit,
    )

    for (const [unitName, parsedUnit] of [
      ['u16363', status],
      ['u16369', doctor],
    ]) {
      for (const [side, unit] of [
        ['baseline', parsedUnit.baselineUnit],
        ['target', parsedUnit.targetUnit],
      ]) {
        const expected = fixture.wholeUnitEvidence[unitName].buildMemberExpressions[side]
        const members = buildMemberExpressions(unit.node)
        assert.equal(members.length, expected.length)
        members.forEach((member, index) => {
          const descriptorExpected = expected[index]
          const raw = unit.source.slice(member.start, member.end)
          assert.equal(unit.unitStart + member.start, descriptorExpected.start)
          assert.equal(unit.unitStart + member.end, descriptorExpected.end)
          assert.deepEqual(descriptor(raw), expectedDescriptor(descriptorExpected))
          const fields = macroFields(member)
          const build = fixture.buildMetadata[side]
          assert.equal(fields.VERSION, build.version)
          assert.equal(fields.BUILD_TIME, build.buildTime)
          assert.equal(fields.GIT_SHA, build.gitSha)
          assert.equal(descriptor(raw).sha256, build.memberSha256)
          const normalized = canonicalDescriptor(member, true)
          assert.equal(normalized.buildObjectCount, 1)
          assert.deepEqual(
            { bytes: normalized.bytes, sha256: normalized.sha256 },
            expectedDescriptor(fixture.buildMetadata.normalizedMemberCanonical),
          )
        })
      }
    }
  },
)

test(
  'typed report pins all status/Doctor rows and exactly nine build strings',
  { skip: !selected },
  () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.inputs.typedReport.path),
        'utf8',
      ),
    )
    const rowIdentity = row => [
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.baselineOccurrenceCount,
      row.targetOccurrenceNumber,
      row.targetAdded,
    ]
    const strictIdentity = row => [
      row.structural.index,
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.targetOccurrenceNumber,
    ]
    const correctedByIndex = new Map()
    for (const unit of fixture.units) {
      const index = unit.target.targetIndex
      const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
        row => row.structural.index === index,
      )
      const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
        row => row.structural.index === index,
      )
      const strictRows = report.rows.filter(row => row.structural.index === index)
      const corrected =
        ownerRows.length === unit.correctedOwnerResidues.totalRows
      const expected = corrected
        ? unit.correctedOwnerResidues
        : unit.ownerResidues
      correctedByIndex.set(index, corrected)
      assert.equal(ownerRows.length, expected.totalRows)
      assert.equal(addedRows.length, expected.targetAddedRows)
      assert.equal(strictRows.length, expected.strictRows)
      assert.deepEqual(
        canonicalDigest(ownerRows.map(rowIdentity)),
        expected.rowIdentities,
      )
      assert.deepEqual(
        canonicalDigest(addedRows.map(rowIdentity)),
        expected.addedIdentities,
      )
      assert.deepEqual(
        canonicalDigest(strictRows.map(strictIdentity)),
        unit.ownerResidues.strictIdentities,
      )
      assert.deepEqual(
        strictRows.map(strictIdentity),
        unit.ownerResidues.strictRowsExact,
      )
      for (const row of ownerRows) {
        assert.deepEqual(
          row.ownerPaths,
          [
            corrected
              ? unit.correctedOwnerResidues.ownerPath
              : fixture.ownerCorrection.reportedOwner,
          ],
        )
        assert.deepEqual(row.ownerSourceMatches, [])
      }
      assert.deepEqual(
        [...new Set(strictRows.map(row => row.value))],
        [
          fixture.buildMetadata.target.version,
          fixture.buildMetadata.target.buildTime,
          fixture.buildMetadata.target.gitSha,
        ],
      )
    }
    const statusAdded = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === 16363,
    )
    assert.deepEqual(
      statusAdded
        .filter(row => !Object.values(fixture.buildMetadata.target).includes(row.value))
        .map(row => row.value),
      correctedByIndex.get(16363)
        ? ['clients']
        : ['leases', 'clients', 'leaseClients'],
    )
    const doctorAdded = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === 16369,
    )
    assert.deepEqual(
      doctorAdded
        .filter(row => !Object.values(fixture.buildMetadata.target).includes(row.value))
        .map(row => row.value),
      correctedByIndex.get(16369)
        ? []
        : ['supervisor', 'workersRoster', 'controlReachable'],
    )
  },
)

test(
  'source pins the status producer/Doctor consumer boundary and replay blocker',
  { skip: !selected },
  t => {
    const targetRoot = selectedSourceRoot()
    const baselineRoot = selectedBaselineSourceRoot()
    const paths = {
      baselineStatus: sourceFilename(baselineRoot, fixture.sourceState.status.path),
      targetStatus: sourceFilename(targetRoot, fixture.sourceState.status.path),
      baselineDoctor: sourceFilename(baselineRoot, fixture.sourceState.doctor.path),
      targetDoctor: sourceFilename(targetRoot, fixture.sourceState.doctor.path),
    }
    if (Object.values(paths).some(filename => !fs.existsSync(filename))) {
      t.skip('recovered Target120/121 status source roots are unavailable')
      return
    }
    const baselineStatus = parseTypescript(
      paths.baselineStatus,
      fixture.sourceState.status.target120,
    )
    const targetStatus = parseTypescript(
      paths.targetStatus,
      fixture.sourceState.status.target121,
    )
    for (const [parsed, state] of [
      [baselineStatus, fixture.sourceState.status.target120],
      [targetStatus, fixture.sourceState.status.target121],
    ]) {
      tsNodeDescriptor(
        parsed,
        findTsNamedDeclaration(parsed, 'BgDaemonStatus'),
        state.type,
        'BgDaemonStatus',
      )
      tsNodeDescriptor(
        parsed,
        findTsNamedDeclaration(parsed, 'getBgDaemonStatus'),
        state.declaration,
        'getBgDaemonStatus',
      )
      const macroOffsets = []
      const visit = node => {
        if (
          parsed.ts.isPropertyAccessExpression(node) &&
          node.getText(parsed.sourceFile) === 'MACRO.VERSION'
        ) {
          macroOffsets.push(node.getStart(parsed.sourceFile))
          assert.deepEqual(descriptor(node.getText(parsed.sourceFile)), {
            bytes: 13,
            sha256:
              '1c8884ef2e9a9431c2f7c8c7b3655102d9f3fd272dea6f217682bd5a2b77de83',
          })
        }
        parsed.ts.forEachChild(node, visit)
      }
      visit(parsed.sourceFile)
      assert.deepEqual(macroOffsets, state.macroVersionOffsets)
    }
    for (const key of [
      'leaseType',
      'leaseLocal',
      'leaseRequest',
      'leaseValidation',
      'leaseReturn',
    ]) {
      const expected = fixture.sourceState.status.target121[key]
      const node = findTsNodeAt(targetStatus, expected)
      tsNodeDescriptor(targetStatus, node, expected, key)
    }
    const sourceValidation = targetStatus.source.slice(
      fixture.sourceState.status.target121.leaseValidation.start,
      fixture.sourceState.status.target121.leaseValidation.end,
    )
    assert.match(sourceValidation, /Array\.isArray\(leases\.clients\)/)
    assert.match(sourceValidation, /leases\.clients\.filter/)
    assert.match(sourceValidation, /typeof .*\.pid.*=== 'number'/s)

    const targetBundlePath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (fs.existsSync(targetBundlePath)) {
      const targetBundle = readExact(targetBundlePath, fixture.inputs.targetBundle)
      const compiled = exactBufferSlice(
        targetBundle,
        fixture.wholeUnitEvidence.u16363.targetLeaseContract.leasesBranch,
        'compiled lease branch',
      )
      assert.equal(compiled, 'if(j.ok&&"clients"in j)M=j.clients')
      assert.doesNotMatch(compiled, /Array\.isArray|\.filter/)
    }

    const baselineDoctorBytes = readExact(
      paths.baselineDoctor,
      fixture.sourceState.doctor.target120,
    )
    const targetDoctorBytes = readExact(
      paths.targetDoctor,
      fixture.sourceState.doctor.target121,
    )
    assert.deepEqual(targetDoctorBytes, baselineDoctorBytes)
    const doctor = parseTypescript(
      paths.targetDoctor,
      fixture.sourceState.doctor.target121,
    )
    tsNodeDescriptor(
      doctor,
      findTsImport(doctor, '../daemon/status.js'),
      fixture.sourceState.doctor.statusImport,
      'status import',
    )
    const detailsText = tsNodeDescriptor(
      doctor,
      findTsNamedDeclaration(doctor, 'BackgroundServerDetails'),
      fixture.sourceState.doctor.detailsDeclaration,
      'BackgroundServerDetails',
    )
    const callerText = tsNodeDescriptor(
      doctor,
      findTsNamedDeclaration(doctor, 'BackgroundServer'),
      fixture.sourceState.doctor.callerDeclaration,
      'BackgroundServer',
    )
    assert.equal(countOccurrences(detailsText, 'MACRO.VERSION'), 2)
    for (const field of fixture.cohesion.sharedRuntimeFields) {
      assert.match(detailsText, new RegExp(`\\b${field}\\b`), field)
    }
    assert.match(callerText, /getBgDaemonStatus\(\)/)
    assert.match(callerText, /<BackgroundServerDetails promise=\{promise\}/)

    const stalePath = sourceFilename(
      targetRoot,
      fixture.ownerCorrection.staleOwner.path,
    )
    const staleBytes = readExact(
      stalePath,
      fixture.ownerCorrection.staleOwner,
      'stale MCP owner',
    )
    const staleSource = staleBytes.toString('utf8')
    assert.equal(staleSource.length, fixture.ownerCorrection.staleOwner.chars)
    for (const [marker, expected] of Object.entries(
      fixture.ownerCorrection.staleOwner.markerCounts,
    )) {
      assert.equal(countOccurrences(staleSource, marker), expected, marker)
    }
  },
)
