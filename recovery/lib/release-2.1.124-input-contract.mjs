const SHA256 = /^[0-9a-f]{64}$/

export const RELEASE_2_1_124_GENERATED_INPUTS = Object.freeze({
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
      bytes: 13_949_576,
      sha256:
        '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
    }),
    targetAnalyzableBundle: Object.freeze({
      bytes: 13_980_928,
      sha256:
        'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
    }),
    targetPackageJson: Object.freeze({
      bytes: 1_476,
      sha256:
        'd770813a0e1686ed8696fc543644a16c4269b4ac28df85e40c6ee07f751decd9',
    }),
    targetDeclarations: Object.freeze({
      bytes: 117_452,
      sha256:
        '8f907e0e9fd160b857d25881375f73f1bddd3642d372ad52ea71d7ff441f3ddf',
    }),
  }),
  attribution: Object.freeze({
    summary: Object.freeze({
      bytes: 4_364,
      sha256:
        '9df5dd4681d00b4053d226e46a3c7ecb35445408dd2754611464aa05702bfab9',
    }),
    reportFiles: Object.freeze({
      sources: Object.freeze({
        path: 'sources.jsonl.gz',
        bytes: 467_892,
        sha256:
          '9cf80d48545f9f10cae5236259f9825067a93cd01a514351c40994ddac2deb4a',
      }),
      targetInitializers: Object.freeze({
        path: 'target-initializers.jsonl.gz',
        bytes: 119_576,
        sha256:
          'f7bccbbaf030989212143ac0e61d219acf7eae109410cf6fbc33c7b7d7a6417c',
      }),
      targetPartitions: Object.freeze({
        path: 'target-partitions.jsonl.gz',
        bytes: 2_913_743,
        sha256:
          '933f1ee6f9909b2aef4d7947f17ddffac4127c6dfad64a7c00540621ec94ae0b',
      }),
      targetRanges: Object.freeze({
        path: 'target-ranges.jsonl.gz',
        bytes: 3_410_880,
        sha256:
          '3e7d68c0615d346ec18715f879340e6fa2c1627b8a83bb1ef854a2a28bddfb2f',
      }),
    }),
  }),
  readable: Object.freeze({
    metadata: Object.freeze({
      bytes: 3_927,
      sha256:
        '63df67f8ed969f177e54e70ddf09bcf394043d2ba1d93de2d72329d95484ea63',
    }),
  }),
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
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

function same(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), label)
}

function artifactMap(artifacts) {
  assert(Array.isArray(artifacts), 'generated input artifacts must be an array')
  const result = new Map(artifacts.map(artifact => [artifact.id, artifact]))
  assert(result.size === artifacts.length, 'duplicate generated input artifact ID')
  return result
}

export function assertRelease21124GeneratedInputContract({
  artifacts,
  attribution,
  attributionSummary,
  readable,
  readableMetadata,
}) {
  const byId = artifactMap(artifacts)
  const expected = RELEASE_2_1_124_GENERATED_INPUTS
  for (const [id, expectedIdentity] of Object.entries(expected.artifacts)) {
    same(identity(byId.get(id), id), expectedIdentity, `${id}: pinned identity`)
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
        version: '2.1.124',
      },
      targetDeclarations: identity(
        byId.get('targetDeclarations'),
        'target declarations',
      ),
    },
    'attribution release evidence differs from target package artifacts',
  )
  assert(
    attribution.baselineOwnership?.sourceCount === 4_756 &&
      attribution.initializerEvidence?.target?.count === 5_156 &&
      attribution.coverage?.partitionCount === 29_002 &&
      attribution.coverage?.targetRangeCount === 58_003 &&
      attribution.coverage?.targetUtf16 === 13_980_928 &&
      attribution.coverage?.accountedTargetUtf16 === 13_980_928 &&
      attribution.coverage?.unaccountedTargetUtf16 === 0,
    'attribution cumulative-oracle coverage topology',
  )

  const readableInputs = {
    baseline: {
      name: 'cli.inner.js',
      ...identity(
        byId.get('baselineAnalyzableBundle'),
        'readable baseline',
      ),
    },
    target: {
      name: 'cli.inner.js',
      ...identity(byId.get('targetAnalyzableBundle'), 'readable target'),
    },
  }
  same(
    readable?.inputs,
    readableInputs,
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
      inputIdentities: readableInputs,
      metadataIdentity: identity(readableMetadata, 'readable metadata'),
    },
  }
}

export function assertRelease21124SourceOracleDeclaration(
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
}
