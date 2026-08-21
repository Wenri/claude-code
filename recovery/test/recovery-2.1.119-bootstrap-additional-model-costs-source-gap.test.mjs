import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget119BootstrapCostsReplay,
  TARGET119_BOOTSTRAP_COSTS_BLOCK,
  TARGET119_BOOTSTRAP_COSTS_DONOR,
  TARGET119_BOOTSTRAP_COSTS_INPUT,
  TARGET119_BOOTSTRAP_COSTS_OUTPUT,
  TARGET119_BOOTSTRAP_COSTS_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-bootstrap-additional-model-costs-source-gap.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-bootstrap-additional-model-costs-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '4dcd5bc3119d85076aaa8b58d220b7db73392030c41bf52fd3ef3d1af2f4f064'
const HELPER_SHA256 =
  '971fea465509d74c4bb3658464b0491bd948e75eadda578c10f6cd8bb8a6a993'
const BUILDER_SHA256 =
  '9447034010323241e02d3f84e6c4d57fa1efb7607feb495c2dc29b1ddd3e2658'
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/replay-bootstrap-additional-model-costs-source-gap.mjs',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-bootstrap-additional-model-costs-source-gap-fixture.mjs',
)
const historicalSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const donorSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_DONOR_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.120/src'),
)
const targetBundlePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
    path.join(
      root,
      '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
    ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function reportRowIdentity(row) {
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

function partitionDescriptor(rows) {
  const serialized = JSON.stringify(rows)
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
      assert.deepEqual(partitionDescriptor(rows), expected.full)
      assert.deepEqual(
        partitionDescriptor(rows.map(reportRowIdentity)),
        expected.identities,
      )
    }
    const coverageRows = coverage.rows.filter(
      row => row.targetIndex === unit.targetIndex,
    )
    assert.deepEqual(partitionDescriptor(coverageRows), unit.coverageRows)
    const ownerIds = new Set(coverageRows.flatMap(row => row.ownerIds))
    assert.deepEqual(
      coverage.owners.filter(owner => ownerIds.has(owner.id)),
      unit.ownerCatalog,
    )
  }
}

function sourceDescriptor(filename) {
  return descriptor(fs.readFileSync(filename))
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function declarationPropertyCounts(ts, sourceFile, statement) {
  const counts = new Map()
  const add = value => counts.set(value, (counts.get(value) ?? 0) + 1)
  function visit(node) {
    const named =
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isBindingElement(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    if (named) add(node.name.text)
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.name)
    ) {
      add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(statement)
  return counts
}

function bootstrapDeclaration(ts, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'bootstrapResponseSchema',
      ),
  )
  assert.equal(matches.length, 1, 'one bootstrapResponseSchema declaration')
  return { source, sourceFile, statement: matches[0] }
}

test(
  'Target119 bootstrap-cost fixture is exact and deterministic',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetIndex, 21176)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 11,
      targetIndicesSha256:
        '8c3e78f3e368a7cdaced706b949ec90bac5adbdefd60dc930bcf1d6b56122982',
      residueIdentitiesSha256:
        'c0a69e69d4d315bcd887b6ec0265039cc95be19a7aa79bae1186688af7afec79',
      sourceBlockBytes: 689,
      sourceBlockSha256:
        '4a0dd60c91117bfd6bbe00f311b504b5a6dbd2bf27ca09f96056a5ab63160295',
    })
    assert.deepEqual(
      fixture.ownerOverride,
      TARGET119_BOOTSTRAP_COSTS_OWNER_OVERRIDES[0],
    )
    assert.deepEqual(fixture.inputs.sourcePreimage, TARGET119_BOOTSTRAP_COSTS_INPUT)
    assert.deepEqual(fixture.inputs.sourcePostimage, TARGET119_BOOTSTRAP_COSTS_OUTPUT)
    assert.deepEqual(fixture.inputs.authenticatedDonor, TARGET119_BOOTSTRAP_COSTS_DONOR)
    assert.equal(
      sha256(
        JSON.stringify(
          fixture.residues.map(residue => [fixture.targetIndex, ...residue]),
        ),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
    const rebuilt = spawnSync(process.execPath, [builderPath], {
      cwd: root,
      encoding: null,
      maxBuffer: 32 * 1024 * 1024,
    })
    assert.equal(rebuilt.status, 0, rebuilt.stderr?.toString())
    assert.deepEqual(rebuilt.stdout, fixtureBytes)
  },
)

test(
  'authenticated Target119 target unit pins every bootstrap-cost residue',
  { skip: !selected },
  () => {
    const target = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(target), fixture.inputs.targetBundle)
    const unit = target.subarray(fixture.target.start, fixture.target.end)
    assert.equal(unit.length, fixture.target.bytes)
    assert.equal(sha256(unit), fixture.target.sourceHash)
    const unitText = unit.toString('utf8')
    for (const marker of fixture.targetMarkers) {
      assert.ok(unitText.includes(marker), marker)
    }
    for (const residue of fixture.residues) {
      const [kind, value, start, end] = residue
      assert.equal(kind, 'property')
      assert.equal(target.subarray(start, end).toString('utf8'), value)
      assert.ok(start >= fixture.target.start)
      assert.ok(end <= fixture.target.end)
    }
  },
)

test(
  'Target119 bootstrap-cost replay is donor-pinned, exact, and idempotent',
  { skip: !selected },
  async () => {
    const selectedFilename = path.join(
      sourceRoot,
      TARGET119_BOOTSTRAP_COSTS_INPUT.path.replace(/^src\//, ''),
    )
    const selectedDescriptor = sourceDescriptor(selectedFilename)
    assert.ok(
      [TARGET119_BOOTSTRAP_COSTS_INPUT, TARGET119_BOOTSTRAP_COSTS_OUTPUT].some(
        expected =>
          selectedDescriptor.bytes === expected.bytes &&
          selectedDescriptor.sha256 === expected.sha256,
      ),
      'selected source is the exact raw preimage or recovered postimage',
    )

    const donorFilename = path.join(
      donorSourceRoot,
      TARGET119_BOOTSTRAP_COSTS_DONOR.path.replace(/^src\//, ''),
    )
    assert.deepEqual(sourceDescriptor(donorFilename), {
      bytes: TARGET119_BOOTSTRAP_COSTS_DONOR.bytes,
      sha256: TARGET119_BOOTSTRAP_COSTS_DONOR.sha256,
    })
    const donor = fs.readFileSync(donorFilename, 'utf8')
    assert.equal(donor.split(TARGET119_BOOTSTRAP_COSTS_BLOCK).length, 2)
    assert.deepEqual(descriptor(Buffer.from(TARGET119_BOOTSTRAP_COSTS_BLOCK)), {
      bytes: TARGET119_BOOTSTRAP_COSTS_DONOR.blockBytes,
      sha256: TARGET119_BOOTSTRAP_COSTS_DONOR.blockSha256,
    })

    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-bootstrap-costs-'),
    )
    const tempFilename = path.join(
      tempRoot,
      TARGET119_BOOTSTRAP_COSTS_INPUT.path.replace(/^src\//, ''),
    )
    fs.mkdirSync(path.dirname(tempFilename), { recursive: true })
    fs.copyFileSync(selectedFilename, tempFilename)
    try {
      const first = applyTarget119BootstrapCostsReplay({ sourceRoot: tempRoot })
      assert.deepEqual(
        first,
        selectedDescriptor.sha256 === TARGET119_BOOTSTRAP_COSTS_INPUT.sha256
          ? { status: 'recovered', changed: true }
          : { status: 'already-recovered', changed: false },
      )
      assert.deepEqual(sourceDescriptor(tempFilename), {
        bytes: TARGET119_BOOTSTRAP_COSTS_OUTPUT.bytes,
        sha256: TARGET119_BOOTSTRAP_COSTS_OUTPUT.sha256,
      })
      assert.deepEqual(applyTarget119BootstrapCostsReplay({ sourceRoot: tempRoot }), {
        status: 'already-recovered',
        changed: false,
      })

      const ts = await loadTypeScript()
      const { source, sourceFile, statement } = bootstrapDeclaration(
        ts,
        tempFilename,
      )
      const declaration = statement.getText(sourceFile)
      for (const marker of fixture.sourceMarkers) {
        assert.ok(declaration.includes(marker), marker)
      }
      const counts = declarationPropertyCounts(ts, sourceFile, statement)
      const expectedCounts = new Map()
      for (const [, value] of fixture.residues) {
        expectedCounts.set(value, (expectedCounts.get(value) ?? 0) + 1)
      }
      for (const [value, count] of expectedCounts) {
        assert.equal(counts.get(value), count, value)
      }
      assert.ok(source.includes(TARGET119_BOOTSTRAP_COSTS_BLOCK))
    } finally {
      fs.rmSync(tempRoot, { recursive: true })
    }
  },
)

test(
  'Target119 bootstrap-cost coverage changes only as a complete proof pair',
  { skip: !selected },
  () => {
    const { phase, report, coverage } = loadArtifactState()
    assert.ok(fixture.latestArtifactProjection.phases.includes(phase))
    assertLatestArtifactProjection(report, coverage)
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const row = coverage.rows.find(item => item.targetIndex === fixture.targetIndex)
    assert.ok(row, 'Target119 bootstrap-cost coverage row')
    assert.deepEqual(
      row.ownerIds.map(ownerId => owners.get(ownerId)),
      fixture.ownerOverride.paths,
    )
    const provisional =
      JSON.stringify(row.evidenceIds) ===
      JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected, 'exact provisional or corrected state')
    assert.equal(
      new Set(
        fixture.ownerOverride.evidenceIds.map(evidenceId =>
          row.evidenceIds.includes(evidenceId),
        ),
      ).size,
      1,
      'proof evidence is atomic',
    )
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
          current.typedAudit,
          current.sourceCoverage,
          {...current.sourceCoverageRaw, bytes: 0},
        ),
      /unknown or hybrid/,
    )
  },
)
