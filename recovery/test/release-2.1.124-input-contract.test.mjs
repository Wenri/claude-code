import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RELEASE_2_1_124_GENERATED_INPUTS,
  assertRelease21124GeneratedInputContract,
  assertRelease21124SourceOracleDeclaration,
} from '../lib/release-2.1.124-input-contract.mjs'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function fixture() {
  const expected = RELEASE_2_1_124_GENERATED_INPUTS
  const artifacts = Object.entries(expected.artifacts).map(([id, value]) => ({
    id,
    ...value,
  }))
  const byId = new Map(artifacts.map(artifact => [artifact.id, artifact]))
  const identity = id => ({
    bytes: byId.get(id).bytes,
    sha256: byId.get(id).sha256,
  })
  return {
    artifacts,
    attribution: {
      artifacts: {
        baselineBundle: identity('sourceOracleBundle'),
        baselineSourceMap: identity('sourceOracleMap'),
        targetBundle: identity('targetAnalyzableBundle'),
      },
      releaseEvidence: {
        targetPackage: {
          ...identity('targetPackageJson'),
          name: '@anthropic-ai/claude-code',
          version: '2.1.124',
        },
        targetDeclarations: identity('targetDeclarations'),
      },
      baselineOwnership: { sourceCount: 4_756 },
      initializerEvidence: { target: { count: 5_156 } },
      coverage: {
        partitionCount: 29_002,
        targetRangeCount: 58_003,
        targetUtf16: 13_980_928,
        accountedTargetUtf16: 13_980_928,
        unaccountedTargetUtf16: 0,
      },
      reportFiles: clone(expected.attribution.reportFiles),
    },
    attributionSummary: clone(expected.attribution.summary),
    readable: {
      inputs: {
        baseline: {
          name: 'cli.inner.js',
          ...identity('baselineAnalyzableBundle'),
        },
        target: {
          name: 'cli.inner.js',
          ...identity('targetAnalyzableBundle'),
        },
      },
      verification: { comparisonInvariantHashesEqual: true },
    },
    readableMetadata: clone(expected.readable.metadata),
  }
}

test('binds cumulative attribution and adjacent readable inputs separately', () => {
  const contract = assertRelease21124GeneratedInputContract(fixture())
  assert.equal(contract.attribution.strategy, 'cumulative-source-oracle')
  assert.equal(contract.attribution.baselineArtifact, 'sourceOracleBundle')
  assert.equal(contract.attribution.sourceMapArtifact, 'sourceOracleMap')
  assert.equal(contract.readable.strategy, 'adjacent-analyzable-bundles')
  assert.equal(
    contract.readable.baselineArtifact,
    'baselineAnalyzableBundle',
  )
})

function declaration(contract) {
  return {
    sourceOracle: {
      bundleArtifact: contract.attribution.baselineArtifact,
      mapArtifact: contract.attribution.sourceMapArtifact,
    },
    generatedRecovery: { attribution: clone(contract.attribution) },
  }
}

test('cross-binds source oracle declarations to attribution', () => {
  const contract = assertRelease21124GeneratedInputContract(fixture())
  assert.doesNotThrow(() =>
    assertRelease21124SourceOracleDeclaration(declaration(contract), contract),
  )
  for (const [field, pattern] of [
    ['bundleArtifact', /source oracle bundle declaration/],
    ['mapArtifact', /source oracle map declaration/],
  ]) {
    const document = declaration(contract)
    document.sourceOracle[field] = 'contradictory-artifact'
    assert.throws(
      () =>
        assertRelease21124SourceOracleDeclaration(document, contract),
      pattern,
    )
  }
})

for (const [label, mutate, pattern] of [
  [
    'repinned source-map artifact',
    value => {
      value.artifacts.find(artifact => artifact.id === 'sourceOracleMap')
        .sha256 = `0${value.artifacts
          .find(artifact => artifact.id === 'sourceOracleMap')
          .sha256.slice(1)}`
    },
    /sourceOracleMap: pinned identity/,
  ],
  [
    'attribution source-map mismatch',
    value => {
      value.attribution.artifacts.baselineSourceMap.sha256 =
        `0${value.attribution.artifacts.baselineSourceMap.sha256.slice(1)}`
    },
    /cumulative source oracle contract/,
  ],
  [
    'target package version mismatch',
    value => {
      value.attribution.releaseEvidence.targetPackage.version = '2.1.123'
    },
    /target package artifacts/,
  ],
  [
    'adjacent readable baseline mismatch',
    value => {
      value.readable.inputs.baseline.bytes -= 1
    },
    /adjacent bundle contract/,
  ],
  [
    'repinned attribution summary',
    value => {
      value.attributionSummary.bytes -= 1
    },
    /attribution summary identity/,
  ],
]) {
  test(`rejects ${label}`, () => {
    const value = fixture()
    mutate(value)
    assert.throws(
      () => assertRelease21124GeneratedInputContract(value),
      pattern,
    )
  })
}
