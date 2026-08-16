import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  buildSemanticCorrespondence,
  encodeSemanticCorrespondence,
  semanticCorrespondenceSummary,
} from '../scripts/build-semantic-correspondence.mjs'
import { verifySemanticCorrespondence } from '../scripts/verify-semantic-correspondence.mjs'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function gitBlobSha1(value) {
  return crypto
    .createHash('sha1')
    .update(`blob ${value.length}\0`)
    .update(value)
    .digest('hex')
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`)
}

function writeJsonLinesGzip(filename, rows) {
  const value = Buffer.from(`${rows.map(row => JSON.stringify(row)).join('\n')}\n`)
  fs.writeFileSync(filename, gzipSync(value, { level: 9, mtime: 0 }))
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-correspondence-'))
  const attribution = path.join(root, 'attribution')
  const sourceRoot = path.join(root, 'src')
  fs.mkdirSync(attribution)
  fs.mkdirSync(sourceRoot)
  const sourceText = 'export const answer = 2\n'
  fs.writeFileSync(path.join(sourceRoot, 'answer.ts'), sourceText)
  const testPath = path.join(root, 'recovery/test/answer.test.mjs')
  const testText = "import assert from 'node:assert/strict'\nassert.equal(2, 2)\n"
  fs.mkdirSync(path.dirname(testPath), { recursive: true })
  fs.writeFileSync(testPath, testText)
  const baselineText = 'const answer=1;dependency();'
  const targetText = 'const answer=2;dependency();'
  const releaseBullet = 'Changed the answer from one to two'
  const baseline = path.join(root, 'baseline.js')
  const target = path.join(root, 'target.js')
  fs.writeFileSync(baseline, baselineText)
  fs.writeFileSync(target, targetText)

  const sources = [
    { sourceIndex: 0, source: '../src/answer.ts' },
    { sourceIndex: 1, source: '../node_modules/example/index.js' },
  ]
  const partitions = [
    {
      id: 'partition-1',
      target: {
        offsetStart: 0,
        offsetEnd: 15,
        utf16Length: 15,
        sha256: sha256(targetText.slice(0, 15)),
      },
      attributedSourceIndex: 0,
      sourceCandidates: [0],
      relocatedSourceCandidates: [],
      boundarySourceIndices: { left: 0, right: 0 },
      classification: 'changed-same-source',
      confidence: 'high',
      attributedSourceIndex: 0,
      baseline: { utf16Length: 15 },
    },
    {
      id: 'partition-2',
      target: {
        offsetStart: 15,
        offsetEnd: targetText.length,
        utf16Length: targetText.length - 15,
        sha256: sha256(targetText.slice(15)),
      },
      attributedSourceIndex: 1,
      sourceCandidates: [1],
      relocatedSourceCandidates: [],
      boundarySourceIndices: { left: 1, right: 1 },
      classification: 'exact-generated',
      confidence: 'high',
      baseline: { utf16Length: targetText.length - 15 },
    },
  ]
  writeJsonLinesGzip(path.join(attribution, 'sources.jsonl.gz'), sources)
  writeJsonLinesGzip(path.join(attribution, 'target-initializers.jsonl.gz'), [
    { status: 'anchored-single-baseline-unit' },
  ])
  writeJsonLinesGzip(
    path.join(attribution, 'target-partitions.jsonl.gz'),
    partitions,
  )
  const targetRanges = partitions.map((partition, partitionIndex) => ({
    kind: 'partition',
    id: partition.id,
    target: partition.target,
    classification: partition.classification,
    confidence: partition.confidence,
    sourceIndices: [partition.attributedSourceIndex],
    partitionIndex,
  }))
  writeJsonLinesGzip(
    path.join(attribution, 'target-ranges.jsonl.gz'),
    targetRanges,
  )
  const reportEvidence = name => {
    const value = fs.readFileSync(path.join(attribution, name))
    return { path: name, bytes: value.length, sha256: sha256(value) }
  }
  writeJson(path.join(attribution, 'summary.json'), {
    schemaVersion: 1,
    kind: 'generated-source-ownership-and-attribution-inventory',
    offsetUnit: 'utf16-code-units',
    artifacts: {
      baselineBundle: { sha256: sha256(baselineText) },
      targetBundle: { sha256: sha256(targetText) },
    },
    baselineOwnership: { sourceCount: 2 },
    initializerEvidence: {
      target: { count: 1, statuses: { 'anchored-single-baseline-unit': 1 } },
    },
    releaseEvidence: {
      officialChangelog: {
        bulletCount: 1,
        bullets: [releaseBullet],
      },
    },
    coverage: {
      partitionCount: 2,
      targetPartitionUtf16: targetText.length,
      exactAnchorCount: 0,
      exactAnchorTargetUtf16: 0,
      exactGeneratedPartitionCount: 1,
      exactGeneratedTargetUtf16: targetText.length - 15,
      changedHighConfidencePartitionCount: 1,
      changedHighConfidenceTargetUtf16: 15,
      changedCandidatePartitionCount: 0,
      changedCandidateTargetUtf16: 0,
      unresolvedPartitionCount: 0,
      unresolvedTargetUtf16: 0,
      accountedTargetUtf16: targetText.length,
      targetUtf16: targetText.length,
      unaccountedTargetUtf16: 0,
      targetRangeCount: 2,
      targetRangeUtf16: targetText.length,
    },
    reportFiles: {
      sources: reportEvidence('sources.jsonl.gz'),
      targetInitializers: reportEvidence('target-initializers.jsonl.gz'),
      targetPartitions: reportEvidence('target-partitions.jsonl.gz'),
      targetRanges: reportEvidence('target-ranges.jsonl.gz'),
    },
  })

  const structural = {
    schemaVersion: 1,
    kind: 'experimental-structural-generated-delta-ledger',
    baseline: {
      bytes: Buffer.byteLength(baselineText),
      sha256: sha256(baselineText),
      utf16Length: baselineText.length,
      tokenCount: 8,
      unitCount: 2,
      failureCount: 0,
      tokenAccounting: { accounted: 8, scanned: 8 },
    },
    target: {
      bytes: Buffer.byteLength(targetText),
      sha256: sha256(targetText),
      utf16Length: targetText.length,
      tokenCount: 8,
      unitCount: 2,
      failureCount: 0,
      tokenAccounting: { accounted: 8, scanned: 8 },
    },
    regions: [
      {
        classification: 'changed',
        baselineUnitIndex: 0,
        target: { index: 0, start: 0, end: 15, tokenCount: 5 },
      },
      {
        classification: 'matched',
        baselineUnitIndex: 1,
        target: {
          index: 1,
          start: 15,
          end: targetText.length,
          tokenCount: 3,
        },
      },
    ],
    pairCount: 2,
    unmatchedBaseline: [],
    unresolvedTarget: [],
    coverage: {
      units: { changed: 1, matched: 1, moved: 0, unresolved: 0, total: 2 },
      tokens: {
        changed: 5,
        matched: 3,
        moved: 0,
        unresolved: 0,
        total: 8,
        ledgerTotal: 8,
        resolved: 8,
      },
      moveEvidence: {
        unique: { tokens: 0, units: 0 },
        ambiguousDuplicate: { tokens: 0, units: 0 },
      },
    },
  }
  const structuralPath = path.join(root, 'structural.json.gz')
  fs.writeFileSync(
    structuralPath,
    gzipSync(Buffer.from(`${JSON.stringify(structural)}\n`), {
      level: 9,
      mtime: 0,
    }),
  )

  const sourceFragment = 'answer = 2'
  const targetFragment = 'answer=2'
  const changelogPath = path.join(root, 'CHANGELOG-section.md')
  fs.writeFileSync(changelogPath, `# 1.0.0\n\n- ${releaseBullet}\n`)
  const obligationsPath = path.join(root, 'obligations.json')
  writeJson(obligationsPath, {
    schemaVersion: 1,
    releaseBulletCount: 1,
    releaseBulletEvidence: [
      {
        number: 1,
        text: releaseBullet,
        sha256: sha256(releaseBullet),
      },
    ],
    testCatalog: [
      {
        id: 'answer-change',
        path: 'recovery/test/answer.test.mjs',
        bytes: Buffer.byteLength(testText),
        sha256: sha256(testText),
      },
    ],
    obligations: [
      {
        id: 'answer-change',
        classification: 'source-localized-adjacent',
        releaseBullets: [1],
        hidden: false,
        rationale: 'The authenticated target and recovered source both change the answer.',
        targetFragments: [
          {
            text: targetFragment,
            bytes: Buffer.byteLength(targetFragment),
            sha256: sha256(targetFragment),
            baselineCount: 0,
            targetCount: 1,
          },
        ],
        sourceAssertions: [
          {
            path: 'src/answer.ts',
            fragment: sourceFragment,
            sha256: sha256(sourceFragment),
            count: 1,
          },
        ],
        testIds: ['answer-change'],
      },
    ],
  })

  return {
    attribution,
    baseline,
    changelogPath,
    obligationsPath,
    root,
    sourceRoot,
    structuralPath,
    target,
  }
}

function useObligationReleaseEvidence(files) {
  const release = '1.0.0'
  const bullet = 'Changed the answer from one to two'
  const evidenceRoot = path.join(files.root, 'recovery/cases/example/evidence')
  const provenancePath = path.join(evidenceRoot, 'provenance.json')
  const fullPath = path.join(evidenceRoot, 'official-CHANGELOG.md')
  const sectionPath = path.join(evidenceRoot, 'CHANGELOG-1.0.0.md')
  const section = `## ${release}\n\n- ${bullet}\n`
  fs.mkdirSync(evidenceRoot, { recursive: true })
  fs.writeFileSync(sectionPath, section)
  fs.writeFileSync(fullPath, `# Changelog\n\n${section}`)
  const record = filename => {
    const value = fs.readFileSync(filename)
    return {
      path: path.relative(files.root, filename).replaceAll('\\', '/'),
      bytes: value.length,
      sha256: sha256(value),
    }
  }
  writeJson(provenancePath, {
    schemaVersion: 1,
    release,
    git: { tag: `v${release}`, commit: '1'.repeat(40) },
    changelog: {
      fullPath: 'evidence/official-CHANGELOG.md',
      fullBytes: record(fullPath).bytes,
      fullSha256: record(fullPath).sha256,
      fullGitBlobSha1: gitBlobSha1(fs.readFileSync(fullPath)),
      sectionPath: 'evidence/CHANGELOG-1.0.0.md',
      sectionBytes: record(sectionPath).bytes,
      sectionSha256: record(sectionPath).sha256,
      bulletCount: 1,
    },
  })
  const attributionPath = path.join(files.attribution, 'summary.json')
  const attribution = JSON.parse(fs.readFileSync(attributionPath))
  delete attribution.releaseEvidence
  writeJson(attributionPath, attribution)
  const obligations = JSON.parse(fs.readFileSync(files.obligationsPath))
  obligations.officialReleaseEvidence = {
    provenance: record(provenancePath),
    fullChangelog: record(fullPath),
    sectionArtifact: record(sectionPath),
    section: release,
    bulletCount: 1,
    bullets: [bullet],
  }
  writeJson(files.obligationsPath, obligations)
  files.changelogPath = sectionPath
  return { fullPath, provenancePath, record, section, sectionPath }
}

function generate(files) {
  const report = buildSemanticCorrespondence({
    attributionDirectory: files.attribution,
    baselinePath: files.baseline,
    changelogPath: files.changelogPath,
    obligationsPath: files.obligationsPath,
    sourceRoot: files.sourceRoot,
    structuralPath: files.structuralPath,
    targetPath: files.target,
  })
  const encoded = encodeSemanticCorrespondence(report)
  const reportPath = path.join(files.root, 'semantic-correspondence.json.gz')
  const summaryPath = path.join(files.root, 'summary.json')
  fs.writeFileSync(reportPath, encoded.compressed)
  const summary = semanticCorrespondenceSummary(report, encoded.compressed)
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  return { encoded, report, reportPath, summaryPath }
}

test('builds and verifies exhaustive bundle-to-source semantic correspondence', () => {
  const files = fixture()
  try {
    const generated = generate(files)
    assert.equal(generated.report.coverage.targetTokens, 8)
    assert.equal(generated.report.coverage.accountedTokens, 8)
    assert.equal(generated.report.coverage.unclassifiedTokens, 0)
    assert.equal(
      generated.report.coverage.ownershipTokens['source-attributed-high'],
      5,
    )
    assert.equal(
      generated.report.coverage.ownershipTokens['dependency-attributed-high'],
      3,
    )
    const result = verifySemanticCorrespondence({
      attributionDirectory: files.attribution,
      baselinePath: files.baseline,
      changelogPath: files.changelogPath,
      expectedReportSha256: sha256(generated.encoded.compressed),
      obligationsPath: files.obligationsPath,
      reportPath: generated.reportPath,
      sourceRoot: files.sourceRoot,
      structuralPath: files.structuralPath,
      summaryPath: generated.summaryPath,
      targetPath: files.target,
    })
    assert.equal(result.status, 'whole-bundle-source-correspondence-verified')
    assert.equal(result.obligations.releaseBulletsCovered, 1)
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('uses independently pinned obligation release evidence when attribution is incremental', () => {
  const files = fixture()
  try {
    const release = useObligationReleaseEvidence(files)
    const generated = generate(files)
    const { path: _path, ...fullEvidence } = release.record(release.fullPath)
    assert.deepEqual(generated.report.inputs.officialChangelog, fullEvidence)
    assert.equal(generated.report.coverage.obligations.releaseBulletsCovered, 1)
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('rejects a fully repinned release section that occurs twice in the official changelog', () => {
  const files = fixture()
  try {
    const release = useObligationReleaseEvidence(files)
    fs.writeFileSync(
      release.fullPath,
      `# Changelog\n\n${release.section}${release.section}`,
    )
    const provenance = JSON.parse(fs.readFileSync(release.provenancePath))
    provenance.changelog.fullBytes = release.record(release.fullPath).bytes
    provenance.changelog.fullSha256 = release.record(release.fullPath).sha256
    provenance.changelog.fullGitBlobSha1 = gitBlobSha1(
      fs.readFileSync(release.fullPath),
    )
    writeJson(release.provenancePath, provenance)
    const obligations = JSON.parse(fs.readFileSync(files.obligationsPath))
    obligations.officialReleaseEvidence.fullChangelog =
      release.record(release.fullPath)
    obligations.officialReleaseEvidence.provenance =
      release.record(release.provenancePath)
    writeJson(files.obligationsPath, obligations)
    assert.throws(
      () => generate(files),
      /official section containment in full changelog: expected 1, got 2/,
    )
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('rejects an uncovered release bullet', () => {
  const files = fixture()
  try {
    const obligations = JSON.parse(fs.readFileSync(files.obligationsPath))
    obligations.releaseBulletCount = 2
    const secondBullet = 'Added a second uncovered behavior'
    obligations.releaseBulletEvidence.push({
      number: 2,
      text: secondBullet,
      sha256: sha256(secondBullet),
    })
    fs.appendFileSync(files.changelogPath, `- ${secondBullet}\n`)
    const attributionSummaryPath = path.join(files.attribution, 'summary.json')
    const attributionSummary = JSON.parse(fs.readFileSync(attributionSummaryPath))
    attributionSummary.releaseEvidence.officialChangelog.bulletCount = 2
    attributionSummary.releaseEvidence.officialChangelog.bullets.push(secondBullet)
    writeJson(attributionSummaryPath, attributionSummary)
    writeJson(files.obligationsPath, obligations)
    assert.throws(() => generate(files), /release bullet 2 is not covered/)
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('rejects a non-release obligation not marked hidden', () => {
  const files = fixture()
  try {
    const obligations = JSON.parse(fs.readFileSync(files.obligationsPath))
    obligations.obligations[0].releaseBullets = []
    delete obligations.obligations[0].hidden
    writeJson(files.obligationsPath, obligations)
    assert.throws(
      () => generate(files),
      /answer-change: non-release obligation must be marked hidden/,
    )
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('rejects source drift after the report is frozen', () => {
  const files = fixture()
  try {
    const generated = generate(files)
    fs.writeFileSync(path.join(files.sourceRoot, 'answer.ts'), 'export const answer = 3\n')
    assert.throws(
      () => verifySemanticCorrespondence({
        attributionDirectory: files.attribution,
        baselinePath: files.baseline,
        changelogPath: files.changelogPath,
        obligationsPath: files.obligationsPath,
        reportPath: generated.reportPath,
        sourceRoot: files.sourceRoot,
        structuralPath: files.structuralPath,
        summaryPath: generated.summaryPath,
        targetPath: files.target,
      }),
      /source fragment count/,
    )
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('rejects source assertion traversal', () => {
  const files = fixture()
  try {
    const obligations = JSON.parse(fs.readFileSync(files.obligationsPath))
    obligations.obligations[0].sourceAssertions[0].path =
      'src/../../outside.ts'
    writeJson(files.obligationsPath, obligations)
    assert.throws(() => generate(files), /unsafe relative path/)
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('rejects attribution report path traversal', () => {
  const files = fixture()
  try {
    const summaryPath = path.join(files.attribution, 'summary.json')
    const summary = JSON.parse(fs.readFileSync(summaryPath))
    summary.reportFiles.sources.path = '../../sources.jsonl.gz'
    writeJson(summaryPath, summary)
    assert.throws(() => generate(files), /unsafe relative path/)
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('rejects a rewritten target range ownership ledger', () => {
  const files = fixture()
  try {
    const rangesPath = path.join(files.attribution, 'target-ranges.jsonl.gz')
    const rows = gunzipSync(fs.readFileSync(rangesPath))
      .toString('utf8')
      .trimEnd()
      .split('\n')
      .map(JSON.parse)
    rows[0].sourceIndices = [1]
    writeJsonLinesGzip(rangesPath, rows)
    const summaryPath = path.join(files.attribution, 'summary.json')
    const summary = JSON.parse(fs.readFileSync(summaryPath))
    const value = fs.readFileSync(rangesPath)
    summary.reportFiles.targetRanges.bytes = value.length
    summary.reportFiles.targetRanges.sha256 = sha256(value)
    writeJson(summaryPath, summary)
    assert.throws(
      () => generate(files),
      /partition source indices/,
    )
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('rejects a bundle witness paired with an unrelated source assertion', () => {
  const files = fixture()
  try {
    const unrelated = 'export const unrelated = true\n'
    fs.writeFileSync(path.join(files.sourceRoot, 'unrelated.ts'), unrelated)
    const obligations = JSON.parse(fs.readFileSync(files.obligationsPath))
    obligations.obligations[0].sourceAssertions = [
      {
        path: 'src/unrelated.ts',
        fragment: 'unrelated = true',
        sha256: sha256('unrelated = true'),
        count: 1,
      },
    ]
    writeJson(files.obligationsPath, obligations)
    assert.throws(
      () => generate(files),
      /bundle witness is not owned by an asserted source path/,
    )
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('accepts an explicit authenticated behavior-test localization boundary', () => {
  const files = fixture()
  try {
    const obligations = JSON.parse(fs.readFileSync(files.obligationsPath))
    const testEntry = obligations.testCatalog[0]
    const testPath = path.join(files.root, testEntry.path)
    const testText =
      fs.readFileSync(testPath, 'utf8') +
      '// authenticated target behavior: answer=2\n' +
      '// recovered source: src/answer.ts :: answer = 2\n'
    fs.writeFileSync(testPath, testText)
    testEntry.bytes = Buffer.byteLength(testText)
    testEntry.sha256 = sha256(testText)
    const obligation = obligations.obligations[0]
    obligation.localizationBasis = 'authenticated-behavior-test'
    obligation.localizationBoundary =
      'The target source map has no defensible application owner for this compiled behavior.'
    writeJson(files.obligationsPath, obligations)
    const generated = generate(files)
    assert.equal(
      generated.report.coverage.obligations.manualLocalizationCount,
      1,
    )
    assert.deepEqual(
      generated.report.obligationWitnesses[0].manualLocalization
        .changedSourcePaths,
      ['src/answer.ts'],
    )
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})

test('rejects a manual localization not bound inside its authenticated test', () => {
  const files = fixture()
  try {
    const obligations = JSON.parse(fs.readFileSync(files.obligationsPath))
    const obligation = obligations.obligations[0]
    obligation.localizationBasis = 'authenticated-behavior-test'
    obligation.localizationBoundary =
      'The target source map has no defensible application owner for this compiled behavior.'
    writeJson(files.obligationsPath, obligations)
    assert.throws(
      () => generate(files),
      /bound test does not contain target behavior fragment/,
    )
  } finally {
    fs.rmSync(files.root, { recursive: true, force: true })
  }
})
