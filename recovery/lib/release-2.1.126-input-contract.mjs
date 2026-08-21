const SHA256 = /^[0-9a-f]{64}$/

export const RELEASE_2_1_126 = Object.freeze({
  baseline: '2.1.124',
  target: '2.1.126',
  skipped: Object.freeze(['2.1.125']),
  case: '2.1.124-to-2.1.126',
  baseRevision: 'ae866640a6d67891fe14aeff5bc41da10784b979',
  officialBulletCount: 33,
  officialSection: 'evidence/CHANGELOG-2.1.126.md',
  officialReleasePresence: 'evidence/RELEASE-2.1.126.json',
  skippedRegistryAbsence: 'evidence/REGISTRY-2.1.125-ABSENCE.json',
})

export const RELEASE_2_1_126_INHERITED_TEST_PROVENANCE = Object.freeze({
  release: RELEASE_2_1_126.baseline,
  priorObligations: Object.freeze({
    path: 'recovery/cases/2.1.123-to-2.1.124/semantic/obligations.json',
    bytes: 364_376,
    sha256:
      'bcb6485e23e6fe65c44fcbe3a5cc3a6c1dd26e8255744cbbd358c0c0e90d509d',
  }),
  priorTestIds: Object.freeze([
    'gateway-doctor-plugins',
    'mcp-oauth-dedup',
    'project-purge',
    'runtime-tail',
    'semantic-delta',
    'skill-activation-telemetry',
    'ui-command-semantics',
    'ui-sdk-tail',
  ]),
})

export const ZERO_SHA256 = '0'.repeat(64)
export const ZERO_IDENTITY = Object.freeze({ bytes: 0, sha256: ZERO_SHA256 })

// Zero identities and zero topology counts are deliberate fail-closed sentinels.
// They are replaced only after the corresponding generated report or reviewed
// source/test topology has been frozen. Pipeline entry points reject them.
export const RELEASE_2_1_126_GENERATED_INPUTS = Object.freeze({
  artifacts: Object.freeze({
    sourceOracleBundle: Object.freeze({
      bytes: 13_047_043,
      sha256:
        '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f',
    }),
    sourceOracleMap: Object.freeze({
      bytes: 59_766_257,
      sha256:
        '7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657',
    }),
    baselineAnalyzableBundle: Object.freeze({
      bytes: 13_980_928,
      sha256:
        'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
    }),
    targetAnalyzableBundle: Object.freeze({
      bytes: 13_980_411,
      sha256:
        'e9d40219be0cad9009c115ec637df4976e987c33d4b7a88cc5f047ead9ad828d',
    }),
    targetPackageJson: Object.freeze({
      bytes: 1_476,
      sha256:
        '83e82576db90bbaeb072858c55ca709409cb214031d1de0a9401680513ded5e5',
    }),
    targetDeclarations: Object.freeze({
      bytes: 117_452,
      sha256:
        '8f907e0e9fd160b857d25881375f73f1bddd3642d372ad52ea71d7ff441f3ddf',
    }),
  }),
  attribution: Object.freeze({
    summary: Object.freeze({
      bytes: 4_365,
      sha256:
        '9024c0593bbd4263d84b5ee56bac7d046f7af9d2063b9688de9632ebe833825b',
    }),
    reportFiles: Object.freeze({
      sources: Object.freeze({
        path: 'sources.jsonl.gz',
        bytes: 467_913,
        sha256:
          '184a7c5ff224cb19d459de6c22fed62ef9534dc9cd754cbad75cab1a18ee4175',
      }),
      targetInitializers: Object.freeze({
        path: 'target-initializers.jsonl.gz',
        bytes: 119_650,
        sha256:
          'e5bb2f1a7ea96f30da926eb9b6c4170b9ca546e4d004e14fbd0a05a51bbbde5d',
      }),
      targetPartitions: Object.freeze({
        path: 'target-partitions.jsonl.gz',
        bytes: 2_913_952,
        sha256:
          '0865834352bb9f1adc5d5d52bda7543217cde47eb4aed817be0e300fbfa46f85',
      }),
      targetRanges: Object.freeze({
        path: 'target-ranges.jsonl.gz',
        bytes: 3_410_427,
        sha256:
          '7108ef063d30d9093a6464fd8164d5533fa515c4f70904e006dbca5e3e97a74c',
      }),
    }),
    topology: Object.freeze({
      sourceCount: 4_756,
      targetInitializerCount: 5_156,
      partitionCount: 29_002,
      targetRangeCount: 58_003,
      targetUtf16: 13_980_411,
    }),
  }),
  readable: Object.freeze({
    metadata: Object.freeze({
      bytes: 3_800,
      sha256:
        '44ad1d149d83c150d2caa479d1da16e10ad788b8e7fac63bea8f8ba35d6f1765',
    }),
  }),
  structural: Object.freeze({
    rawLedger: Object.freeze({
      bytes: 2_257_547,
      sha256:
        'c5032b816690e1df5c30d1286278d674414671a6055ebf726b53b00f1073b88a',
    }),
    metadataNormalizedLedger: Object.freeze({
      bytes: 2_237_149,
      sha256:
        'f7b4ace72ab4505a17b25310399bfacbff3ee07c6378440e6e1e2fdb2888458b',
    }),
    knownDeltaExactLedger: Object.freeze({
      bytes: 2_234_299,
      sha256:
        '66e0052214d8a90a10058f383e09ab7d9480836eeed1d1d41973a83de55fc1c9',
    }),
    knownDeltaProof: Object.freeze({
      bytes: 29_247,
      sha256:
        '4783b90aa281abc386f968ccdba1022a2f08a547a05c7aa7c09a9f517f76308f',
    }),
    targetUnits: 22_358,
    targetTokens: 4_405_944,
  }),
  semanticTopology: Object.freeze({
    totalClusters: 6,
    directClusterCount: 5,
    accountingClusterCount: 1,
    directSourcePathCount: 4,
    supportSourcePathCount: 0,
    retainedSourceRepairPathCount: 1,
    changedSourcePathCount: 5,
    focusedTestCount: 3,
    accountingClusterIds: Object.freeze([5]),
    accountingReasonGroups: Object.freeze({
      'initializer-linkage': Object.freeze([5]),
    }),
    initializerPairedDirectClusterIds: Object.freeze([4]),
    requiredDirectClusterIds: Object.freeze([1, 2, 3, 4, 6]),
  }),
  sourceRecovery: Object.freeze({
    activeSourceCommit: '5b99258953100cc337aa42a047dc7d059657c6f8',
    sourceCommit: '67116ce3153fe7dfd0e18068da822f08d02b9fd9',
    sourceCommitTree: '715d3f9458e7cbad8160ebd9438d96167d178cbc',
    sourceSrcTree: '9c7c4f699cd0cc740dcb5e5341aeb026d4bc2263',
    focusedTestCommit: 'a65f83b9d80d8f9ee1e8bf6e496c6c484dd8524c',
    retainedTestCommit: '67116ce3153fe7dfd0e18068da822f08d02b9fd9',
    baselineWrapperBundle: Object.freeze({
      bytes: 13_981_018,
      sha256:
        '3214b62d9f7e3763a59211ad95a570d03f37e37c6aa87686cd9b6ccf4827eacb',
    }),
    targetWrapperBundle: Object.freeze({
      bytes: 13_980_501,
      sha256:
        '99ea0a1eaab285e1c4fa3602458cdc4ee3f81fc622c3dc90906a7e306dd75a0f',
    }),
    changedSourcePaths: Object.freeze([
      'src/commands/effort/effort.tsx',
      'src/components/PromptInput/PromptInput.tsx',
      'src/services/api/claude.ts',
      'src/services/api/client.ts',
      'src/tools/FileReadTool/FileReadTool.ts',
    ]),
  }),
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function same(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), label)
}

function identity(record, label) {
  assert(
    record &&
      Number.isSafeInteger(record.bytes) &&
      record.bytes >= 0 &&
      typeof record.sha256 === 'string' &&
      SHA256.test(record.sha256),
    `${label}: invalid artifact identity`,
  )
  return { bytes: record.bytes, sha256: record.sha256 }
}

export function assertRelease21126InheritedTestProvenance(obligations) {
  const expected = RELEASE_2_1_126_INHERITED_TEST_PROVENANCE
  const inheritedTests = obligations?.testCatalog
    ?.filter(entry => entry.inheritedFrom !== undefined)
    .sort((left, right) =>
      left.inheritedFrom.priorTestId.localeCompare(
        right.inheritedFrom.priorTestId,
      ))
  assert(Array.isArray(inheritedTests), 'inherited test catalog is absent')
  same(
    obligations.nonActiveOfficialEvidence?.priorObligations,
    expected.priorObligations,
    'sealed prior obligations identity',
  )
  same(
    inheritedTests.map(entry => entry.inheritedFrom.priorTestId),
    expected.priorTestIds,
    'sealed inherited test IDs',
  )
  assert(
    inheritedTests.every(entry =>
      entry.inheritedFrom.release === expected.release &&
        JSON.stringify(entry.inheritedFrom.priorObligations) ===
          JSON.stringify(expected.priorObligations)),
    'sealed inherited test provenance',
  )
  return expected
}

export function assertRelease21126CommitReachability({
  baseToTarget,
  targetToHead,
}) {
  assert(baseToTarget === true, '2.1.124 base is not an ancestor of target')
  assert(targetToHead === true, 'source-freeze target is not reachable from HEAD')
}

function assertFrozenIdentity(record, label) {
  const result = identity(record, label)
  assert(
    result.bytes > 0 && result.sha256 !== ZERO_SHA256,
    `${label}: unfrozen zero sentinel`,
  )
  return result
}

function artifactMap(artifacts) {
  assert(Array.isArray(artifacts), 'generated input artifacts must be an array')
  const result = new Map(artifacts.map(artifact => [artifact.id, artifact]))
  assert(result.size === artifacts.length, 'duplicate generated input artifact ID')
  return result
}

export function assertRelease21126TopologyFrozen() {
  const expected = RELEASE_2_1_126_GENERATED_INPUTS
  for (const [id, record] of Object.entries(expected.artifacts)) {
    assertFrozenIdentity(record, `generated input ${id}`)
  }
  assertFrozenIdentity(expected.attribution.summary, 'attribution summary')
  for (const [id, record] of Object.entries(expected.attribution.reportFiles)) {
    assertFrozenIdentity(record, `attribution ${id}`)
  }
  assertFrozenIdentity(expected.readable.metadata, 'readable metadata')
  for (const [id, record] of Object.entries(expected.structural)) {
    if (id === 'targetUnits' || id === 'targetTokens') continue
    assertFrozenIdentity(record, `structural ${id}`)
  }
  const attribution = expected.attribution.topology
  assert(
    Object.values(attribution).every(
      value => Number.isSafeInteger(value) && value > 0,
    ),
    'attribution topology has an unfrozen zero sentinel',
  )
  const structural = expected.structural
  assert(
    structural.targetUnits > 0 && structural.targetTokens > 0,
    'structural topology has an unfrozen zero sentinel',
  )
  const semantic = expected.semanticTopology
  assert(
    semantic.totalClusters > 0 &&
      semantic.directClusterCount > 0 &&
      semantic.accountingClusterCount > 0 &&
      semantic.directClusterCount + semantic.accountingClusterCount ===
      semantic.totalClusters &&
      semantic.directSourcePathCount > 0 &&
      semantic.retainedSourceRepairPathCount > 0 &&
      semantic.changedSourcePathCount > 0 &&
      semantic.directSourcePathCount +
          semantic.supportSourcePathCount +
          semantic.retainedSourceRepairPathCount ===
        semantic.changedSourcePathCount &&
      semantic.focusedTestCount > 0 &&
      semantic.accountingClusterIds.length === semantic.accountingClusterCount,
    'semantic/source/test topology has an unfrozen zero sentinel',
  )
  const sourceRecovery = expected.sourceRecovery
  assert(
    [
      sourceRecovery.sourceCommit,
      sourceRecovery.activeSourceCommit,
      sourceRecovery.sourceCommitTree,
      sourceRecovery.sourceSrcTree,
      sourceRecovery.focusedTestCommit,
      sourceRecovery.retainedTestCommit,
    ].every(value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)) &&
      sourceRecovery.changedSourcePaths.length ===
        semantic.changedSourcePathCount &&
      new Set(sourceRecovery.changedSourcePaths).size ===
        sourceRecovery.changedSourcePaths.length &&
      JSON.stringify(sourceRecovery.changedSourcePaths) ===
        JSON.stringify([...sourceRecovery.changedSourcePaths].sort()) &&
      sourceRecovery.changedSourcePaths.every(sourcePath =>
        sourcePath.startsWith('src/')),
    'source recovery identity or changed-source topology',
  )
  assertFrozenIdentity(
    sourceRecovery.baselineWrapperBundle,
    'baseline wrapper bundle',
  )
  assertFrozenIdentity(
    sourceRecovery.targetWrapperBundle,
    'target wrapper bundle',
  )
  return expected
}

export function assertRelease21126GeneratedInputContract({
  artifacts,
  attribution,
  attributionSummary,
  readable,
  readableMetadata,
  structural,
  structuralProof,
}) {
  const expected = assertRelease21126TopologyFrozen()
  const byId = artifactMap(artifacts)
  for (const [id, expectedIdentity] of Object.entries(expected.artifacts)) {
    same(
      assertFrozenIdentity(byId.get(id), id),
      expectedIdentity,
      `${id}: pinned identity`,
    )
  }

  const attributionInputs = {
    baselineBundle: identity(byId.get('sourceOracleBundle'), 'source oracle'),
    baselineSourceMap: identity(byId.get('sourceOracleMap'), 'source map'),
    targetBundle: identity(
      byId.get('targetAnalyzableBundle'),
      'attribution target',
    ),
  }
  same(
    attribution?.artifacts,
    attributionInputs,
    'attribution inputs differ from the cumulative source oracle contract',
  )
  same(
    identity(attributionSummary, 'attribution summary'),
    expected.attribution.summary,
    'attribution summary identity',
  )
  same(
    attribution.reportFiles,
    expected.attribution.reportFiles,
    'attribution report-file identities',
  )
  same(
    attribution.releaseEvidence,
    {
      targetPackage: {
        ...identity(byId.get('targetPackageJson'), 'target package.json'),
        name: '@anthropic-ai/claude-code',
        version: RELEASE_2_1_126.target,
      },
      targetDeclarations: identity(
        byId.get('targetDeclarations'),
        'target declarations',
      ),
    },
    'attribution release evidence differs from target package artifacts',
  )
  const topology = expected.attribution.topology
  assert(
    attribution.baselineOwnership?.sourceCount === topology.sourceCount &&
      attribution.initializerEvidence?.target?.count ===
        topology.targetInitializerCount &&
      attribution.coverage?.partitionCount === topology.partitionCount &&
      attribution.coverage?.targetRangeCount === topology.targetRangeCount &&
      attribution.coverage?.targetUtf16 === topology.targetUtf16 &&
      attribution.coverage?.accountedTargetUtf16 === topology.targetUtf16 &&
      attribution.coverage?.unaccountedTargetUtf16 === 0,
    'attribution cumulative-oracle coverage topology',
  )

  const adjacentInputs = {
    baseline: {
      name: 'cli.inner.js',
      ...identity(
        byId.get('baselineAnalyzableBundle'),
        'adjacent baseline',
      ),
    },
    target: {
      name: 'cli.inner.js',
      ...identity(byId.get('targetAnalyzableBundle'), 'adjacent target'),
    },
  }
  same(
    readable?.inputs,
    adjacentInputs,
    'readable diff inputs differ from the adjacent bundle contract',
  )
  same(
    identity(readableMetadata, 'readable metadata'),
    expected.readable.metadata,
    'readable metadata identity',
  )
  assert(
    readable.verification?.comparisonInvariantHashesEqual === true,
    'readable diff changed its comparison invariant',
  )

  same(
    structuralProof?.authenticatedInputs,
    {
      baseline: identity(
        byId.get('baselineAnalyzableBundle'),
        'structural baseline',
      ),
      target: identity(
        byId.get('targetAnalyzableBundle'),
        'structural target',
      ),
    },
    'structural proof inputs differ from the adjacent bundle contract',
  )
  same(
    structural,
    expected.structural,
    'structural report identities or topology differ from the frozen contract',
  )

  return {
    attribution: {
      strategy: 'cumulative-source-oracle',
      baselineArtifact: 'sourceOracleBundle',
      sourceMapArtifact: 'sourceOracleMap',
      targetArtifact: 'targetAnalyzableBundle',
      inputIdentities: attributionInputs,
      summaryIdentity: identity(attributionSummary, 'attribution summary'),
    },
    readable: {
      strategy: 'adjacent-analyzable-bundles',
      baselineArtifact: 'baselineAnalyzableBundle',
      targetArtifact: 'targetAnalyzableBundle',
      inputIdentities: adjacentInputs,
      metadataIdentity: identity(readableMetadata, 'readable metadata'),
    },
    structural: {
      strategy: 'adjacent-analyzable-bundles',
      baselineArtifact: 'baselineAnalyzableBundle',
      targetArtifact: 'targetAnalyzableBundle',
      inputIdentities: structuralProof.authenticatedInputs,
      targetUnits: expected.structural.targetUnits,
      targetTokens: expected.structural.targetTokens,
    },
  }
}

export function assertRelease21126SourceOracleDeclaration(
  document,
  generatedInputContract,
) {
  const attribution = document?.generatedRecovery?.attribution
  assert(
    document?.sourceOracle?.bundleArtifact ===
      generatedInputContract?.attribution?.baselineArtifact &&
      attribution?.baselineArtifact ===
        generatedInputContract?.attribution?.baselineArtifact,
    'source oracle bundle declaration differs from attribution baseline',
  )
  assert(
    document?.sourceOracle?.mapArtifact ===
      generatedInputContract?.attribution?.sourceMapArtifact &&
      attribution?.sourceMapArtifact ===
        generatedInputContract?.attribution?.sourceMapArtifact,
    'source oracle map declaration differs from attribution source map',
  )
  assert(
    document?.generatedRecovery?.readableDiff?.baselineArtifact ===
      generatedInputContract?.readable?.baselineArtifact &&
      document?.generatedRecovery?.structural?.baselineArtifact ===
        generatedInputContract?.structural?.baselineArtifact,
    'adjacent readable/structural baselines differ from the generated contract',
  )
}
