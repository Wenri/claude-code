import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RELEASE_2_1_126,
  RELEASE_2_1_126_GENERATED_INPUTS,
  RELEASE_2_1_126_INHERITED_TEST_PROVENANCE,
  ZERO_SHA256,
  assertRelease21126CommitReachability,
  assertRelease21126GeneratedInputContract,
  assertRelease21126InheritedTestProvenance,
  assertRelease21126SourceOracleDeclaration,
  assertRelease21126TopologyFrozen,
} from '../lib/release-2.1.126-input-contract.mjs'

test('pins the skipped-version release boundary', () => {
  assert.deepEqual(RELEASE_2_1_126, {
    baseline: '2.1.124',
    target: '2.1.126',
    skipped: ['2.1.125'],
    case: '2.1.124-to-2.1.126',
    baseRevision: 'ae866640a6d67891fe14aeff5bc41da10784b979',
    officialBulletCount: 33,
    officialSection: 'evidence/CHANGELOG-2.1.126.md',
    officialReleasePresence: 'evidence/RELEASE-2.1.126.json',
    skippedRegistryAbsence: 'evidence/REGISTRY-2.1.125-ABSENCE.json',
  })
})

test('retains the cumulative 2.1.88 source oracle separately from the adjacent baseline', () => {
  const artifacts = RELEASE_2_1_126_GENERATED_INPUTS.artifacts
  assert.deepEqual(artifacts.sourceOracleBundle, {
    bytes: 13_047_043,
    sha256:
      '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f',
  })
  assert.deepEqual(artifacts.sourceOracleMap, {
    bytes: 59_766_257,
    sha256:
      '7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657',
  })
  assert.deepEqual(artifacts.baselineAnalyzableBundle, {
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  })
  assert.notDeepEqual(
    artifacts.sourceOracleBundle,
    artifacts.baselineAnalyzableBundle,
  )
})

test('the complete generated topology is frozen and fail-closed', () => {
  const expected = RELEASE_2_1_126_GENERATED_INPUTS
  assert.ok(expected.attribution.summary.bytes > 0)
  assert.notEqual(expected.attribution.summary.sha256, ZERO_SHA256)
  assert.deepEqual(expected.readable.metadata, {
    bytes: 3_800,
    sha256:
      '44ad1d149d83c150d2caa479d1da16e10ad788b8e7fac63bea8f8ba35d6f1765',
  })
  assert.equal(expected.semanticTopology.totalClusters, 6)
  assert.equal(expected.semanticTopology.focusedTestCount, 3)
  assert.equal(assertRelease21126TopologyFrozen(), expected)
  assert.throws(
    () =>
      assertRelease21126GeneratedInputContract({
        artifacts: [],
        attribution: {},
        attributionSummary: {},
        readable: {},
        readableMetadata: {},
        structural: {},
        structuralProof: {},
      }),
    /invalid artifact identity|generated input artifact|mismatch|must be an array/,
  )
})

test('cross-binds cumulative and adjacent baseline declarations', () => {
  const contract = {
    attribution: {
      baselineArtifact: 'sourceOracleBundle',
      sourceMapArtifact: 'sourceOracleMap',
    },
    readable: { baselineArtifact: 'baselineAnalyzableBundle' },
    structural: { baselineArtifact: 'baselineAnalyzableBundle' },
  }
  const document = {
    sourceOracle: {
      bundleArtifact: 'sourceOracleBundle',
      mapArtifact: 'sourceOracleMap',
    },
    generatedRecovery: {
      attribution: {
        baselineArtifact: 'sourceOracleBundle',
        sourceMapArtifact: 'sourceOracleMap',
      },
      readableDiff: { baselineArtifact: 'baselineAnalyzableBundle' },
      structural: { baselineArtifact: 'baselineAnalyzableBundle' },
    },
  }
  assert.doesNotThrow(() =>
    assertRelease21126SourceOracleDeclaration(document, contract),
  )
  const contradictory = structuredClone(document)
  contradictory.generatedRecovery.structural.baselineArtifact =
    'sourceOracleBundle'
  assert.throws(
    () => assertRelease21126SourceOracleDeclaration(contradictory, contract),
    /adjacent readable\/structural baselines/,
  )
})

test('rejects forged inherited-test provenance', () => {
  const expected = RELEASE_2_1_126_INHERITED_TEST_PROVENANCE
  const obligations = {
    nonActiveOfficialEvidence: {
      priorObligations: structuredClone(expected.priorObligations),
    },
    testCatalog: expected.priorTestIds.map(priorTestId => ({
      inheritedFrom: {
        release: expected.release,
        priorTestId,
        priorObligations: structuredClone(expected.priorObligations),
      },
    })),
  }
  assert.doesNotThrow(() =>
    assertRelease21126InheritedTestProvenance(obligations),
  )
  obligations.testCatalog[0].inheritedFrom.priorObligations.path =
    'recovery/cases/forged-to-2.1.124/semantic/obligations.json'
  assert.throws(
    () => assertRelease21126InheritedTestProvenance(obligations),
    /sealed inherited test provenance/,
  )
})

test('rejects an unreachable source-freeze target commit', () => {
  assert.doesNotThrow(() =>
    assertRelease21126CommitReachability({
      baseToTarget: true,
      targetToHead: true,
    }),
  )
  assert.throws(
    () =>
      assertRelease21126CommitReachability({
        baseToTarget: true,
        targetToHead: false,
      }),
    /not reachable from HEAD/,
  )
})
