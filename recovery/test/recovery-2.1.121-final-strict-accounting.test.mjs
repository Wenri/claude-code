import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.121-final-strict-accounting.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '1534d38e4d4b0edfe04bf475f8a4f72ae3153387ba7c512bd05649362a296054'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
    path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
)

const REQUIRED_PHASE_PROOFS = [
  'agents-handler-groups-owner-proof',
  'build-metadata-residue-proofs',
  'daemon-cli-parse-kind-args-export-owner-proof',
  'daemon-main-log-rotation-strict-number-owner-proof',
  'daemon-main-owner-proofs',
  'daemon-spare-connect-owner-proof',
  'daemon-spare-export-binding-owner-proof',
  'daemon-supervisor-create-server-owner-proof',
  'daemon-supervisor-handle-control-strict-owner-proof',
  'daemon-worker-config-run-daemon-owner-proof',
  'dangerous-mode-pre-dialog-source-gap',
  'entrypoint-dce-existing-closure-audit',
  'headless-restored-task-clear-owner-proof',
  'main-run-first-allowed-owner-proof',
  'main-run-growthbook-timeout-owner-proof',
  'main-run-is-absolute-owner-proof',
  'main-run-resume-error-name-owner-proof',
  'main-run-second-allowed-owner-proof',
  'main-run-session-state-owner-proof',
  'main-run-teammate-colors-index-owner-proof',
  'main-run-view-mode-source-gap',
  'peer-credentials-macos-owner-proof',
  'plugin-prune-command-source-gap',
  'remote-io-internal-metadata-owner-proof',
  'ultrareview-handler-owner-proof',
]

const REQUIRED_TRANSITIVE_PHASE_ARTIFACTS = [
  'recovery/cases/2.1.120-to-2.1.121/recovered/build-daemon-supervisor-owner-proofs.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/daemon-spare-connect-owner-evidence.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/daemon-supervisor-owner-overrides.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/main-run-first-allowed-owner-evidence.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/main-run-growthbook-timeout-owner-evidence.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/main-run-is-absolute-owner-evidence.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/main-run-resume-error-name-owner-evidence.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/main-run-second-allowed-owner-evidence.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/main-run-session-state-owner-evidence.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/main-run-teammate-colors-index-owner-evidence.mjs',
  'recovery/cases/2.1.120-to-2.1.121/recovered/peer-credentials-macos-owner-evidence.mjs',
  'recovery/test/recovery-2.1.121-tail-residue-classification.json',
  'recovery/test/recovery-2.1.121-tail-residue-classification.test.mjs',
  'recovery/test/recovery-late-tail-generator-evidence-helpers.mjs',
  'recovery/test/recovery-late-tail-residue-classification-helpers.mjs',
]

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

const digestJson = value => sha256(Buffer.from(JSON.stringify(value)))

const canonicalRow = row => [
  row.structural.index,
  row.literalKind,
  row.value,
  row.target.start,
  row.target.end,
  row.baselineOccurrenceCount,
  row.targetOccurrenceNumber,
  row.targetAdded,
]

const canonicalCoverageRow = row => [
  row.targetIndex,
  row.start,
  row.end,
  row.nodeType,
  row.sourceHash,
  row.structuralClass,
  row.disposition,
  row.ownerIds ?? [],
  row.evidenceIds ?? [],
  row.behavior,
]

const sortedRows = rows =>
  [...rows].sort(
    (left, right) =>
      left.structural.index - right.structural.index ||
      left.target.start - right.target.start ||
      left.target.end - right.target.end ||
      left.literalKind.localeCompare(right.literalKind) ||
      left.value.localeCompare(right.value),
  )

const sortedUnique = values => [...new Set(values)].sort()

function exactFile(input, label) {
  const filename = path.resolve(repositoryRoot, input.path)
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  }, label)
  return bytes
}

function loadFrozenInputs() {
  const reportBytes = exactFile(fixture.inputs.typedReport, 'typed report')
  const coverageGzip = exactFile(
    fixture.inputs.sourceCoverage,
    'source coverage gzip',
  )
  const coverageRaw = gunzipSync(coverageGzip)
  assert.deepEqual(
    descriptor(coverageRaw),
    {
      bytes: fixture.inputs.sourceCoverage.rawBytes,
      sha256: fixture.inputs.sourceCoverage.rawSha256,
    },
    'source coverage raw',
  )
  const structuralGzip = exactFile(
    fixture.inputs.structuralLedger,
    'structural ledger',
  )
  return {
    report: JSON.parse(reportBytes),
    coverage: JSON.parse(coverageRaw),
    structural: JSON.parse(gunzipSync(structuralGzip)),
  }
}

function collectPathDescriptors(value, output) {
  if (value === null || typeof value !== 'object') return
  if (
    !Array.isArray(value) &&
    typeof value.path === 'string' &&
    Number.isInteger(value.bytes) &&
    typeof value.sha256 === 'string'
  ) {
    const entries = output.get(value.path) ?? []
    entries.push({ bytes: value.bytes, sha256: value.sha256 })
    output.set(value.path, entries)
  }
  for (const child of Object.values(value)) {
    collectPathDescriptors(child, output)
  }
}

function admittedRowsForProof(proofId, proofFixture) {
  if (
    proofId === 'dangerous-mode-pre-dialog-source-gap' ||
    proofId === 'plugin-prune-command-source-gap'
  ) {
    return proofFixture.rowBoundary.admitted
  }
  if (proofId === 'daemon-worker-config-run-daemon-owner-proof') {
    const phase = proofFixture.phaseEvolution.acceptedArtifactPairs.find(
      item => item.name === 'postDaemonOwner',
    )
    assert.ok(phase, `${proofId}: postDaemonOwner phase`)
    return Object.values(phase.physicalRows).flatMap(item => item.rowsExact)
  }
  if (
    proofId === 'daemon-supervisor-create-server-owner-proof' ||
    proofId === 'daemon-main-log-rotation-strict-number-owner-proof' ||
    proofId === 'daemon-cli-parse-kind-args-export-owner-proof'
  ) {
    return [proofFixture.rowBoundary.admitted]
  }
  if (proofId === 'daemon-supervisor-handle-control-strict-owner-proof') {
    return proofFixture.rowBoundary.admittedRows
  }
  if (proofId === 'daemon-main-owner-proofs') {
    const phase = proofFixture.physicalPhases.postDaemonOwner
    assert.equal(
      phase.strict.physicalIdentities.sha256,
      digestJson(
        [...proofFixture.compilerResidues, ...proofFixture.buildMacroResidues]
          .map(item => [...item.slice(0, 7), true])
          .sort((left, right) => left[3] - right[3]),
      ),
      `${proofId}: exact postDaemonOwner strict identities`,
    )
    return [...proofFixture.compilerResidues, ...proofFixture.buildMacroResidues]
      .map(item => [...item.slice(0, 7), true])
      .sort((left, right) => left[3] - right[3])
  }
  if (proofId === 'entrypoint-dce-existing-closure-audit') {
    return proofFixture.strictPartition.identities
  }
  assert.fail(`${proofId}: no proof-specific admitted-row selector`)
}

test('Target121 final strict-accounting fixture and immutable artifacts are exact', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')

  const artifactPaths = fixture.artifacts.map(item => item.path)
  assert.equal(new Set(artifactPaths).size, artifactPaths.length)
  assert.deepEqual([...artifactPaths].sort(), artifactPaths)
  for (const artifact of fixture.artifacts) {
    exactFile(artifact, `proof artifact ${artifact.path}`)
    assert.deepEqual(sortedUnique(artifact.roles), artifact.roles)
    assert.deepEqual(sortedUnique(artifact.evidenceIds), artifact.evidenceIds)
  }
  assert.equal(
    digestJson(
      fixture.artifacts.map(item => [
        item.path,
        item.bytes,
        item.sha256,
        item.roles,
        item.evidenceIds,
      ]),
    ),
    fixture.summary.artifactSetSha256,
  )

  const phaseIds = fixture.phaseProofs.map(item => item.id).sort()
  assert.deepEqual(phaseIds, REQUIRED_PHASE_PROOFS)
  assert.equal(new Set(phaseIds).size, phaseIds.length)
  const artifactSet = new Set(artifactPaths)
  const artifactByPath = new Map(
    fixture.artifacts.map(item => [item.path, item]),
  )
  const transitiveDescriptors = new Map()
  for (const proof of fixture.phaseProofs) {
    assert.ok(proof.evidenceIds.length > 0, `${proof.id}: evidence IDs`)
    assert.deepEqual(sortedUnique(proof.evidenceIds), proof.evidenceIds)
    for (const artifactPath of proof.artifactPaths) {
      assert.ok(
        artifactSet.has(artifactPath),
        `${proof.id}: registered artifact ${artifactPath}`,
      )
    }
    for (const artifactPath of proof.artifactPaths.filter(item =>
      item.endsWith('.json'),
    )) {
      collectPathDescriptors(
        JSON.parse(fs.readFileSync(path.resolve(repositoryRoot, artifactPath))),
        transitiveDescriptors,
      )
    }
  }
  assert.deepEqual(
    [...REQUIRED_TRANSITIVE_PHASE_ARTIFACTS].sort(),
    REQUIRED_TRANSITIVE_PHASE_ARTIFACTS,
  )
  for (const artifactPath of REQUIRED_TRANSITIVE_PHASE_ARTIFACTS) {
    const artifact = artifactByPath.get(artifactPath)
    assert.ok(artifact, `registered transitive artifact ${artifactPath}`)
    const descriptors = transitiveDescriptors.get(artifactPath)
    assert.ok(descriptors?.length > 0, `referenced transitive artifact ${artifactPath}`)
    for (const pinned of descriptors) {
      assert.deepEqual(
        pinned,
        { bytes: artifact.bytes, sha256: artifact.sha256 },
        `transitive descriptor ${artifactPath}`,
      )
    }
  }
})

test('Target121 physical production-strict universe and every unit digest are exact', () => {
  const { report } = loadFrozenInputs()
  const rows = sortedRows(report.rows)
  const targetIndices = [...new Set(rows.map(row => row.structural.index))].sort(
    (left, right) => left - right,
  )
  assert.equal(rows.length, fixture.summary.rows)
  assert.equal(targetIndices.length, fixture.summary.units)
  assert.equal(digestJson(targetIndices), fixture.summary.targetIndicesSha256)
  assert.equal(
    digestJson(rows.map(canonicalRow)),
    fixture.summary.rowIdentitySha256,
  )

  const grouped = new Map()
  for (const row of rows) {
    const values = grouped.get(row.structural.index) ?? []
    values.push(row)
    grouped.set(row.structural.index, values)
  }
  const actualUnitClaims = [...grouped]
    .sort(([left], [right]) => left - right)
    .map(([targetIndex, values]) => ({
      targetIndex,
      rows: values.length,
      rowIdentitySha256: digestJson(values.map(canonicalRow)),
    }))
  assert.deepEqual(actualUnitClaims, fixture.unitClaims)
  assert.equal(
    digestJson(
      actualUnitClaims.map(item => [
        item.targetIndex,
        item.rows,
        item.rowIdentitySha256,
      ]),
    ),
    fixture.summary.unitClaimsSha256,
  )
})

test('Target121 proof claims are disjoint, evidence-backed, and leave zero unassigned rows', () => {
  const { report, coverage, structural } = loadFrozenInputs()
  const rows = sortedRows(report.rows)
  const coverageByIndex = new Map(
    coverage.rows.map(row => [row.targetIndex, row]),
  )
  const evidenceById = new Map(
    coverage.evidence.map(item => [item.id, item]),
  )
  const artifactSet = new Set([
    ...fixture.artifacts.map(item => item.path),
    fixture.inputs.typedReport.path,
    fixture.inputs.sourceCoverage.path,
    fixture.inputs.structuralLedger.path,
  ])
  const phaseById = new Map(fixture.phaseProofs.map(item => [item.id, item]))
  const claimed = new Map()

  for (const claim of fixture.claims) {
    assert.equal(digestJson(claim.targetIndices), claim.targetIndicesSha256)
    assert.deepEqual(
      [...claim.targetIndices].sort((left, right) => left - right),
      claim.targetIndices,
    )
    assert.equal(
      new Set(claim.evidenceIds).size,
      claim.evidenceIds.length,
      `${claim.id}: unique evidence IDs`,
    )
    for (const artifactPath of claim.artifactPaths) {
      assert.ok(artifactSet.has(artifactPath), `${claim.id}: ${artifactPath}`)
    }

    const targetSet = new Set(claim.targetIndices)
    const startSet = claim.targetStarts
      ? new Set(claim.targetStarts)
      : null
    if (startSet) {
      assert.equal(digestJson(claim.targetStarts), claim.targetStartsSha256)
    }
    const selected = rows.filter(
      row =>
        targetSet.has(row.structural.index) &&
        (!startSet || startSet.has(row.target.start)),
    )
    assert.equal(selected.length, claim.rows, `${claim.id}: physical rows`)
    assert.equal(
      digestJson(selected.map(canonicalRow)),
      claim.rowIdentitySha256,
      `${claim.id}: physical row identities`,
    )
    for (const row of selected) {
      const key = JSON.stringify(canonicalRow(row))
      assert.equal(claimed.has(key), false, `${claim.id}: duplicate ${key}`)
      claimed.set(key, claim.id)

      const region = structural.regions[row.structural.index]
      assert.ok(region, `${claim.id}: structural u${row.structural.index}`)
      assert.equal(region.target.index, row.structural.index)
      assert.equal(region.target.sourceHash, row.structural.sourceHash)
      assert.equal(region.classification, row.structural.classification)
      assert.ok(row.target.start >= region.target.start)
      assert.ok(row.target.end <= region.target.end)
    }

    if (claim.mode === 'coverage-evidence') {
      const coverageRows = claim.targetIndices.map(targetIndex => {
        const row = coverageByIndex.get(targetIndex)
        assert.ok(row, `${claim.id}: coverage u${targetIndex}`)
        const region = structural.regions[targetIndex]
        assert.equal(region.target.index, targetIndex)
        assert.equal(row.start, region.target.start)
        assert.equal(row.end, region.target.end)
        assert.equal(row.sourceHash, region.target.sourceHash)
        assert.equal(row.structuralClass, region.classification)
        assert.equal(row.disposition, claim.coverageDisposition)
        assert.deepEqual(row.evidenceIds, claim.evidenceIds)
        return row
      })
      assert.equal(coverageRows.length, claim.coverageRows)
      assert.equal(
        digestJson(coverageRows.map(canonicalCoverageRow)),
        claim.coverageRowIdentitySha256,
      )
      for (const evidenceId of claim.evidenceIds) {
        const evidence = evidenceById.get(evidenceId)
        assert.ok(evidence, `${claim.id}: evidence ${evidenceId}`)
        if (evidence.path) {
          assert.ok(
            claim.artifactPaths.includes(evidence.path),
            `${claim.id}: evidence artifact ${evidence.path}`,
          )
        }
      }
    } else if (claim.mode === 'matched-structural') {
      for (const targetIndex of claim.targetIndices) {
        assert.equal(coverageByIndex.has(targetIndex), false)
        const region = structural.regions[targetIndex]
        assert.equal(region.classification, 'matched')
        assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
        assert.ok(Number.isInteger(region.baselineUnitIndex))
      }
      assert.deepEqual(claim.evidenceIds, ['structural-pairing'])
    } else if (claim.mode === 'composite-case-proof') {
      assert.equal(claim.id, 'build-metadata-u22106')
      assert.equal(claim.proofId, 'u22106-build-metadata-composite')
      const firstAllowed = phaseById.get('main-run-first-allowed-owner-proof')
      const buildMetadata = phaseById.get('build-metadata-residue-proofs')
      assert.ok(firstAllowed)
      assert.ok(buildMetadata)
      assert.deepEqual(claim.artifactPaths, [
        ...firstAllowed.artifactPaths,
        ...buildMetadata.artifactPaths,
      ])
      assert.deepEqual(claim.evidenceIds, [
        ...firstAllowed.evidenceIds,
        ...buildMetadata.evidenceIds,
      ])
      const firstAllowedFixture = JSON.parse(
        fs.readFileSync(
          path.resolve(repositoryRoot, firstAllowed.artifactPaths[0]),
        ),
      )
      const buildMetadataFixture = JSON.parse(
        fs.readFileSync(
          path.resolve(repositoryRoot, buildMetadata.artifactPaths[0]),
        ),
      )
      assert.equal(
        firstAllowedFixture.rowClassification.buildMacroOrdinals.length,
        selected.length,
      )
      assert.deepEqual(
        sortedUnique(selected.map(row => row.value)),
        sortedUnique(firstAllowedFixture.rowClassification.buildMacroValues),
      )
      assert.deepEqual(
        sortedUnique(Object.values(buildMetadataFixture.macro)),
        sortedUnique(selected.map(row => row.value)),
      )
      const expectedRows = firstAllowedFixture.rowClassification.buildMacroOrdinals
        .map(ordinal => [
          22106,
          ...firstAllowedFixture.reportSnapshot.addedRows.exact[ordinal],
        ])
        .sort((left, right) => left[3] - right[3])
      assert.deepEqual(selected.map(canonicalRow), expectedRows)
      assert.deepEqual(
        {
          bytes: firstAllowedFixture.inputs.targetBundle.bytes,
          sha256: firstAllowedFixture.inputs.targetBundle.sha256,
        },
        { bytes: structural.target.bytes, sha256: structural.target.sha256 },
      )
      assert.deepEqual(
        {
          bytes: buildMetadataFixture.inputs.targetBundle.bytes,
          sha256: buildMetadataFixture.inputs.targetBundle.sha256,
        },
        { bytes: structural.target.bytes, sha256: structural.target.sha256 },
      )
      const targetBundle = fs.readFileSync(
        path.resolve(repositoryRoot, firstAllowedFixture.inputs.targetBundle.path),
        'utf8',
      )
      assert.deepEqual(descriptor(Buffer.from(targetBundle)), {
        bytes: structural.target.bytes,
        sha256: structural.target.sha256,
      })
      const macroObject = `{ISSUES_EXPLAINER:"report the issue at https://github.com/anthropics/claude-code/issues",PACKAGE_URL:"@anthropic-ai/claude-code",README_URL:"https://code.claude.com/docs/en/overview",VERSION:"${buildMetadataFixture.macro.VERSION}",FEEDBACK_CHANNEL:"https://github.com/anthropics/claude-code/issues",BUILD_TIME:"${buildMetadataFixture.macro.BUILD_TIME}",GIT_SHA:"${buildMetadataFixture.macro.GIT_SHA}"}`
      const macroStarts = []
      for (
        let start = targetBundle.indexOf(macroObject);
        start !== -1;
        start = targetBundle.indexOf(macroObject, start + macroObject.length)
      ) {
        macroStarts.push(start)
      }
      const macroKeyByValue = new Map([
        [buildMetadataFixture.macro.VERSION, 'VERSION'],
        [buildMetadataFixture.macro.BUILD_TIME, 'BUILD_TIME'],
        [buildMetadataFixture.macro.GIT_SHA, 'GIT_SHA'],
      ])
      for (const row of selected) {
        const macroStart = macroStarts.find(
          start =>
            row.target.start >= start &&
            row.target.end <= start + macroObject.length,
        )
        assert.ok(macroStart !== undefined, `u22106 macro object at ${row.target.start}`)
        const key = macroKeyByValue.get(row.value)
        const valueOffset = macroObject.indexOf(`${key}:${JSON.stringify(row.value)}`) +
          key.length + 1
        assert.equal(row.target.start, macroStart + valueOffset)
        assert.equal(
          targetBundle.slice(row.target.start, row.target.end),
          JSON.stringify(row.value),
        )
      }
      assert.ok(
        firstAllowedFixture.claim.includes(
          'six VERSION/BUILD_TIME/GIT_SHA rows remain separately classified build macros',
        ),
      )
    } else {
      assert.equal(claim.mode, 'case-proof')
      const proof = phaseById.get(claim.proofId)
      assert.ok(proof, `${claim.id}: phase proof ${claim.proofId}`)
      assert.deepEqual(claim.artifactPaths, proof.artifactPaths)
      assert.deepEqual(claim.evidenceIds, proof.evidenceIds)
      const proofFixturePath = proof.artifactPaths.find(item =>
        item.endsWith('.json'),
      )
      assert.ok(proofFixturePath, `${claim.id}: JSON proof fixture`)
      const proofFixture = JSON.parse(
        fs.readFileSync(path.resolve(repositoryRoot, proofFixturePath)),
      )
      const admittedRows = admittedRowsForProof(claim.proofId, proofFixture)
      const proofResidues = new Set(
        admittedRows.map(item => JSON.stringify(item.slice(0, 7))),
      )
      assert.equal(
        proofResidues.size,
        admittedRows.length,
        `${claim.id}: unique admitted proof rows`,
      )
      for (const row of selected) {
        const identity = JSON.stringify(canonicalRow(row).slice(0, 7))
        assert.ok(
          proofResidues.has(identity),
          `${claim.id}: proof fixture row ${identity}`,
        )
      }
    }
  }

  const unassigned = rows.filter(
    row => !claimed.has(JSON.stringify(canonicalRow(row))),
  )
  assert.equal(claimed.size, rows.length)
  assert.equal(unassigned.length, fixture.summary.unassignedRows)
  assert.equal(
    digestJson(unassigned.map(canonicalRow)),
    fixture.summary.unassignedRowIdentitySha256,
  )
  assert.equal(fixture.summary.unassignedRows, 0)

  const dependencyRows = rows.filter(
    row =>
      coverageByIndex.get(row.structural.index)?.disposition ===
      'dependency-runtime',
  )
  assert.equal(
    new Set(dependencyRows.map(row => row.structural.index)).size,
    fixture.summary.unresolvedDependencyUnits,
  )
  assert.equal(dependencyRows.length, fixture.summary.unresolvedDependencyRows)
  assert.equal(
    digestJson(dependencyRows.map(canonicalRow)),
    fixture.summary.unresolvedDependencyRowIdentitySha256,
  )
  for (const row of coverage.rows.filter(
    item => item.disposition === 'dependency-runtime',
  )) {
    assert.match(
      row.reason,
      /whole-bundle (?:source-reproduction gap|reproduction from source remains unverified)/,
    )
    for (const evidenceId of row.evidenceIds) {
      const evidence = evidenceById.get(evidenceId)
      assert.ok(evidence)
      if (evidenceId === 'dependency-attribution') {
        assert.match(evidence.detail, /explicit whole-bundle source-reproduction gap/)
      }
    }
  }

  assert.equal(
    digestJson(
      fixture.claims.map(item => [
        item.id,
        item.proofId,
        item.rows,
        item.rowIdentitySha256,
      ]),
    ),
    fixture.summary.claimSetSha256,
  )
})

test('Target121 strict accounting accepts only a frozen full first-party owner projection', () => {
  const { report, coverage } = loadFrozenInputs()
  const strictIndices = new Set(
    report.rows.map(row => row.structural.index),
  )
  const ownerById = new Map(coverage.owners.map(item => [item.id, item]))
  const expectedPaths = sortedUnique(
    coverage.rows
      .filter(row => strictIndices.has(row.targetIndex))
      .flatMap(row => row.ownerIds ?? [])
      .map(ownerId => {
        const owner = ownerById.get(ownerId)
        assert.ok(owner, `coverage owner ${ownerId}`)
        assert.match(owner.path, /^src\//)
        return owner.path.replace(/^src\//, '')
      }),
  )
  assert.ok(expectedPaths.length > 100, 'complete first-party owner projection')
  for (const profile of fixture.sourceProfiles) {
    assert.deepEqual(
      profile.files.map(item => item.path),
      expectedPaths,
      `${profile.name}: exact owner paths`,
    )
    assert.equal(
      digestJson(
        profile.files.map(item => [item.path, item.bytes, item.sha256]),
      ),
      profile.manifestSha256,
      `${profile.name}: manifest`,
    )
  }

  const actualFiles = expectedPaths.map(filePath => {
    const bytes = fs.readFileSync(path.join(sourceRoot, filePath))
    return { path: filePath, ...descriptor(bytes) }
  })
  const actualManifest = digestJson(
    actualFiles.map(item => [item.path, item.bytes, item.sha256]),
  )
  const selected = fixture.sourceProfiles.find(
    profile => profile.manifestSha256 === actualManifest,
  )
  assert.ok(selected, `unexpected Target121 source profile: ${sourceRoot}`)
  assert.deepEqual(actualFiles, selected.files)
  assert.deepEqual(
    fixture.sourceProfiles.map(profile => profile.name),
    ['raw-historical', 'recovered-package'],
  )
  assert.equal(
    new Set(fixture.sourceProfiles.map(profile => profile.manifestSha256)).size,
    2,
  )
})
