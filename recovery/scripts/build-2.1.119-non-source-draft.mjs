#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const priorCase = path.join(
  repo,
  'recovery/cases/2.1.117-to-2.1.118/manifest.json',
)
const caseRoot = path.join(repo, 'recovery/cases/2.1.118-to-2.1.119')
const draftPath = path.join(caseRoot, 'manifest.non-source-draft.json')
const officialInventoryPath = path.join(
  repo,
  'recovery/2.1.119-official-semantic-inventory.json',
)
const hiddenObligationsPath = path.join(caseRoot, 'hidden-obligations.json')
const daemonFleetQueryObligationsPath = path.join(
  caseRoot,
  'daemon-fleet-query-obligations.json',
)
const sourceFreezeRoot = path.join(caseRoot, 'recovered/source-freeze')
const sourceOverlayPath = path.join(caseRoot, 'recovered/source-facing-overlay.patch')
const adjacentDirectEvidencePath = path.join(
  caseRoot,
  'semantic/adjacent-direct-evidence.json',
)
const cacheRoot =
  process.env.CLAUDE_CODE_2_1_119_PREFLIGHT ??
  '/home/coder/.cache/claude-code-recovery/preflight-2.1.118-to-2.1.119'

const prior = JSON.parse(fs.readFileSync(priorCase, 'utf8'))
const priorArtifacts = new Map(prior.artifacts.map(value => [value.id, value]))
const freezeIndex = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'freeze-index.json'), 'utf8'),
)
const packageMembers = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'package-members.json'), 'utf8'),
)
const nativeInventory = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'binary-extraction/inventory.json'), 'utf8'),
)
const cachedReadableMetadata = JSON.parse(
  fs.readFileSync(path.join(cacheRoot, 'generated/readable-diff/metadata.json'), 'utf8'),
)
const publishedReadableOutputNames = [
  'normalized.diff.gz',
  'statements.diff',
  'renames.tsv',
]
const publishedReadableOutputSet = new Set(publishedReadableOutputNames)
for (const [name, evidence] of Object.entries(cachedReadableMetadata.outputs)) {
  if (publishedReadableOutputSet.has(name)) continue
  const intermediate = cachedReadableMetadata.reproducibleIntermediates?.[name]
  if (JSON.stringify(intermediate) !== JSON.stringify(evidence)) {
    throw new Error(
      `unpublished readable-diff output is not a reproducible intermediate: ${name}`,
    )
  }
}
const readableMetadata = {
  ...cachedReadableMetadata,
  outputs: Object.fromEntries(
    publishedReadableOutputNames.map(name => {
      const evidence = cachedReadableMetadata.outputs[name]
      if (evidence === undefined) {
        throw new Error(`missing published readable-diff output: ${name}`)
      }
      return [name, evidence]
    }),
  ),
}
const officialInventory = JSON.parse(fs.readFileSync(officialInventoryPath, 'utf8'))
const hiddenObligations = JSON.parse(fs.readFileSync(hiddenObligationsPath, 'utf8'))
const daemonFleetQueryObligations = JSON.parse(
  fs.readFileSync(daemonFleetQueryObligationsPath, 'utf8'),
)
const sourceFreezeIdentity = JSON.parse(
  fs.readFileSync(path.join(sourceFreezeRoot, 'identity.json'), 'utf8'),
)
const adjacentDirectEvidence = JSON.parse(
  fs.readFileSync(adjacentDirectEvidencePath, 'utf8'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function renamePrior(id, newId, argument) {
  const value = clone(priorArtifacts.get(id))
  value.id = newId
  value.argument = argument
  return value
}

function framedTree(files) {
  const hash = crypto.createHash('sha256')
  for (const file of files) {
    hash
      .update(file.path)
      .update('\0')
      .update(String(file.bytes))
      .update('\0')
      .update(file.sha256)
      .update('\n')
  }
  return hash.digest('hex')
}

function packageFramedTree(members) {
  const hash = crypto.createHash('sha256')
  for (const member of members) {
    if (member.target === null) continue
    hash
      .update(member.path)
      .update('\0')
      .update(member.target.mode)
      .update('\0')
      .update(member.target.sha256)
      .update('\0')
  }
  return hash.digest('hex')
}

function verifyFreeze() {
  let bytes = 0
  for (const assertion of freezeIndex.files) {
    const value = fs.readFileSync(path.join(caseRoot, assertion.path))
    if (value.length !== assertion.bytes || sha256(value) !== assertion.sha256) {
      throw new Error(`non-source freeze mismatch: ${assertion.path}`)
    }
    bytes += value.length
  }
  if (
    freezeIndex.case !== '2.1.118-to-2.1.119' ||
    freezeIndex.summary.files !== freezeIndex.files.length ||
    freezeIndex.summary.bytes !== bytes
  ) {
    throw new Error('non-source freeze index summary mismatch')
  }
}

function cacheCandidates() {
  const roots = [
    'generated/attribution/sources.jsonl.gz',
    'generated/attribution/summary.json',
    'generated/attribution/target-initializers.jsonl.gz',
    'generated/attribution/target-partitions.jsonl.gz',
    'generated/attribution/target-ranges.jsonl.gz',
    'generated/readable-diff/metadata.json',
    'generated/readable-diff/normalized.diff.gz',
    'generated/readable-diff/renames.tsv',
    'generated/readable-diff/statements.diff',
    'generated/structural/generated-delta.json.gz',
  ]
  return roots.map(relative => {
    const value = fs.readFileSync(path.join(cacheRoot, relative))
    return { path: relative, bytes: value.length, sha256: sha256(value) }
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function verifySemanticCatalogInputs() {
  const adjacentDirectEvidenceBytes = fs.readFileSync(adjacentDirectEvidencePath)
  assert(
    adjacentDirectEvidenceBytes.length === 156609 &&
      sha256(adjacentDirectEvidenceBytes) ===
        '6f3829ac9fd4da733d9bf960f7a4834df789caa246ecc3f50fda281b33a2d1d7',
    'adjacent direct-evidence catalog identity mismatch',
  )
  assert(
    adjacentDirectEvidence.schemaVersion === 1 &&
      adjacentDirectEvidence.release === '2.1.119' &&
      adjacentDirectEvidence.rowCount === 84 &&
      adjacentDirectEvidence.rows.length === 84,
    'adjacent direct-evidence catalog shape mismatch',
  )
  assert(officialInventory.schema_version === 2, 'official inventory schema mismatch')
  assert(officialInventory.release === '2.1.119', 'official inventory release mismatch')
  assert(
    officialInventory.direct_all_51_test_coverage === true,
    'official inventory does not claim direct 51-bullet coverage',
  )
  assert(officialInventory.rows.length === 51, 'official inventory must contain 51 rows')
  assert(
    new Set(officialInventory.rows.map(row => row.bullet)).size === 51 &&
      officialInventory.rows.every((row, index) => row.bullet === index + 1),
    'official inventory bullet numbering is incomplete or duplicated',
  )
  assert(
    new Set(officialInventory.rows.map(row => row.test_id)).size === 51,
    'official inventory test IDs are not unique',
  )
  for (const row of officialInventory.rows) {
    assert(row.status, `official bullet ${row.bullet} has no status`)
    assert(row.direct_test, `official bullet ${row.bullet} has no direct test`)
    assert(
      Array.isArray(row.targetFragments) && row.targetFragments.length > 0,
      `official bullet ${row.bullet} has no target fragment`,
    )
    assert(Array.isArray(row.source), `official bullet ${row.bullet} has no source array`)
    if (row.bullet !== 51) {
      assert(row.source.length > 0, `official bullet ${row.bullet} has no source witness`)
    }
  }

  const closedStatuses = new Set([
    'implemented_verified',
    'audited_closed',
    'audited_inert',
    'audited_noise',
    'authenticated_inert',
  ])
  const verifyAdjacentLedger = (ledger, label, expectedCount, testCatalog) => {
    assert(ledger.schemaVersion === 1, `${label} schema mismatch`)
    assert(
      Array.isArray(ledger.obligations) && ledger.obligations.length === expectedCount,
      `${label} must contain ${expectedCount} obligations`,
    )
    assert(
      new Set(ledger.obligations.map(obligation => obligation.id)).size === expectedCount,
      `${label} obligation IDs are not unique`,
    )
    for (const obligation of ledger.obligations) {
      assert(obligation.classification, `${obligation.id} has no classification`)
      assert(closedStatuses.has(obligation.status), `${obligation.id} is not closed`)
      assert(
        obligation.target && typeof obligation.target === 'object',
        `${obligation.id} has no target witness`,
      )
      assert(
        Array.isArray(obligation.source) && obligation.source.length > 0,
        `${obligation.id} has no source witness`,
      )
      assert(
        Array.isArray(obligation.testIds) && obligation.testIds.length > 0,
        `${obligation.id} has no direct/grouped test binding`,
      )
      for (const testId of obligation.testIds) {
        assert(testCatalog[testId], `${obligation.id} references unknown test ID ${testId}`)
      }
    }
  }

  verifyAdjacentLedger(
    hiddenObligations,
    'hidden ledger',
    65,
    hiddenObligations.testSuites,
  )
  verifyAdjacentLedger(
    daemonFleetQueryObligations,
    'daemon/Fleet/query ledger',
    19,
    daemonFleetQueryObligations.tests,
  )

  return {
    official: 51,
    hidden: 65,
    daemonFleetQuery: 19,
    total: 135,
    unclassified: 0,
    unverified: 0,
  }
}

function verifySourceFreeze() {
  const identityBytes = fs.readFileSync(path.join(sourceFreezeRoot, 'identity.json'))
  assert(
    sha256(identityBytes) ===
      'c09e68d719fc865e48bec591c8006cd4a243bbc65ead567b4807caeee2fdc866',
    'source freeze identity SHA-256 mismatch',
  )
  assert(sourceFreezeIdentity.schemaVersion === 1, 'source freeze schema mismatch')
  assert(sourceFreezeIdentity.case === '2.1.118-to-2.1.119', 'source freeze case mismatch')
  assert(
    sourceFreezeIdentity.kind === 'authenticated-source-overlay-freeze',
    'source freeze kind mismatch',
  )
  assert(
    sourceFreezeIdentity.base.commit === 'bd846a24e3886322888f02b9f747c132a4a32314' &&
      sourceFreezeIdentity.base.tree === '695e9409899f783a90899d5ff7b06cef0129b7e0' &&
      sourceFreezeIdentity.base.srcTree === 'a404264d155cde23ec7479fc7e69d1edec7d92a9' &&
      sourceFreezeIdentity.base.bundleSha256 ===
        '84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa',
    'source freeze base identity mismatch',
  )
  assert(
    sourceFreezeIdentity.target.tree === 'bceb0af2f6b5261fab23b9d8fee51cf48f1b2dd2' &&
      sourceFreezeIdentity.target.srcTree === '9e807992d428e7e23a0ad96e3a53e286d372afd7' &&
      sourceFreezeIdentity.target.bundleSha256 ===
        '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef',
    'source freeze target identity mismatch',
  )
  const overlay = fs.readFileSync(sourceOverlayPath)
  assert(
    overlay.length === sourceFreezeIdentity.overlay.bytes &&
      sha256(overlay) === sourceFreezeIdentity.overlay.sha256 &&
      sourceFreezeIdentity.overlay.sha256 ===
        '623cfd2740598d7a6f7cc0a7f72bfebd5000eeae13d6ccb3295f594b0abef794',
    'source-facing overlay identity mismatch',
  )
  assert(
    sourceFreezeIdentity.verification.applyToBaseTree === true &&
      sourceFreezeIdentity.verification.completeSrcByteCompare === true &&
      sourceFreezeIdentity.verification.reverseToBaseTree === true &&
      sourceFreezeIdentity.verification.forwardToTargetTree === true &&
      sourceFreezeIdentity.verification.runtimeImports.newlyUnresolved === 0 &&
      sourceFreezeIdentity.verification.targetTests.passed === 86 &&
      sourceFreezeIdentity.verification.targetTests.files === 8 &&
      sourceFreezeIdentity.verification.targetTests.failed === 0 &&
      sourceFreezeIdentity.verification.retainedTests.failed === 0 &&
      sourceFreezeIdentity.verification.syntaxBuilds.failed === 0,
    'source freeze verification is not closed',
  )

  const checksumLines = fs
    .readFileSync(path.join(sourceFreezeRoot, 'SHA256SUMS'), 'utf8')
    .trim()
    .split('\n')
  const assertions = checksumLines.map(line => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line)
    assert(match, `invalid source freeze checksum line: ${line}`)
    const [, expectedSha256, name] = match
    const filename = path.join(sourceFreezeRoot, name)
    const value = fs.readFileSync(filename)
    assert(sha256(value) === expectedSha256, `source freeze file mismatch: ${name}`)
    return {
      path: `recovered/source-freeze/${name}`,
      bytes: value.length,
      sha256: expectedSha256,
    }
  })
  const checksums = fs.readFileSync(path.join(sourceFreezeRoot, 'SHA256SUMS'))
  assertions.push({
    path: 'recovered/source-freeze/SHA256SUMS',
    bytes: checksums.length,
    sha256: sha256(checksums),
  })
  assertions.push({
    path: 'recovered/source-facing-overlay.patch',
    bytes: overlay.length,
    sha256: sha256(overlay),
  })
  return {
    identity: clone(sourceFreezeIdentity),
    identitySha256: sha256(identityBytes),
    fileAssertions: assertions.sort((a, b) => a.path.localeCompare(b.path)),
  }
}

function readLiteralArray(testFile, declaration) {
  const source = fs.readFileSync(path.join(repo, testFile), 'utf8')
  const declarationOffset = source.indexOf(`const ${declaration} = [`)
  assert(declarationOffset !== -1, `${testFile}: missing ${declaration}`)
  const start = source.indexOf('[', declarationOffset)
  let depth = 0
  let quote = null
  let escaped = false
  for (let offset = start; offset < source.length; offset += 1) {
    const character = source[offset]
    if (quote !== null) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character
      continue
    }
    if (character === '[') depth += 1
    else if (character === ']') {
      depth -= 1
      if (depth === 0) {
        return vm.runInNewContext(source.slice(start, offset + 1), Object.create(null))
      }
    }
  }
  throw new Error(`${testFile}: unterminated ${declaration}`)
}

function buildAuthenticatedTestCoverage() {
  const officialTest = 'recovery/test/recovery-2.1.119-official-bullets.test.mjs'
  const suites = [
    {
      file: 'recovery/test/recovery-2.1.119-adjacent-direct-evidence.test.mjs',
      arrays: [],
      expectedWitnesses: 199,
      witnesses: adjacentDirectEvidence.rows.flatMap(row => [
        ...row.targetFragments,
        ...row.targetAbsences,
      ]),
      obligationIds: adjacentDirectEvidence.rows.map(row => row.id),
    },
    {
      file: officialTest,
      arrays: [],
      expectedWitnesses: 79,
      witnesses: officialInventory.rows.flatMap(row => row.targetFragments),
      obligationIds: officialInventory.rows.map(row => row.test_id),
    },
    {
      file: 'recovery/test/recovery-2.1.119-hidden-tracing-remote-updater.test.mjs',
      arrays: ['BUNDLE_FRAGMENTS'],
      targetEvidenceArrays: ['MANAGED_MEMORY_SEMANTIC_EVIDENCE'],
      expectedWitnesses: 33,
    },
    {
      file: 'recovery/test/recovery-2.1.119-daemon-fleet-query.test.mjs',
      arrays: ['FRAGMENTS', 'DAEMON_EVENT_COUNTS'],
      daemonEvidenceArrays: ['DAEMON_SEMANTIC_EVIDENCE'],
      expectedWitnesses: 94,
    },
    {
      file: 'recovery/test/recovery-2.1.119-official-prompts-plugins.test.mjs',
      arrays: ['BUNDLE_FRAGMENTS'],
      targetEvidenceArrays: ['READ_NO_REREAD_SEMANTIC_EVIDENCE'],
      expectedWitnesses: 20,
      obligationIds: [
        'INH-019-plugin-monitor-runtime',
        'INH-020-plugin-path-containment',
        'INH-021-managed-plugin-hooks-and-registry',
        'INH-022-marketplace-atomic-promotion-and-refresh',
        'INH-023-plugin-project-scope-ux',
        'INH-024-insights-verbatim-handoff',
        'INH-025-bash-cwd-guidance',
        'INH-026-bash-rerun-sleep-and-sandbox',
        'INH-027-read-no-reread',
        'INH-028-agent-steering-and-result-verification',
        'INH-029-core-exploratory-and-verification-prompt',
      ],
    },
    {
      file: 'recovery/test/recovery-2.1.119-platform-persistence.test.mjs',
      arrays: ['BUNDLE_FRAGMENTS'],
      expectedWitnesses: 9,
      obligationIds: [
        'INH-030-message-client-platform-telemetry',
        'INH-031-first-attempt-request-id',
        'INH-032-env-less-bridge-session-persistence',
        'HID-036-update-reconnect-flush',
      ],
    },
    {
      file: 'recovery/test/recovery-2.1.119-ultraplan-dialogs.test.mjs',
      arrays: ['TARGET_FRAGMENTS'],
      expectedWitnesses: 15,
      obligationIds: ['HID-034-ultraplan-dialogs-and-handoff'],
    },
    {
      file: 'recovery/test/recovery-2.1.119-background-stop.test.mjs',
      arrays: ['TARGET_FRAGMENTS'],
      expectedWitnesses: 22,
      obligationIds: ['HID-035-background-stop-and-detach'],
    },
  ]

  const testIdFiles = new Map()
  for (const [testId, description] of Object.entries(hiddenObligations.testSuites)) {
    testIdFiles.set(testId, description.split(' :: ')[0])
  }
  for (const [testId, description] of Object.entries(daemonFleetQueryObligations.tests)) {
    testIdFiles.set(testId, description.split(' :: ')[0])
  }
  const adjacentByFile = new Map(suites.map(suite => [suite.file, []]))
  for (const obligation of [
    ...hiddenObligations.obligations,
    ...daemonFleetQueryObligations.obligations,
  ]) {
    for (const testId of obligation.testIds) {
      const testFile = testIdFiles.get(testId)
      assert(testFile, `${obligation.id}: test file is unknown for ${testId}`)
      assert(adjacentByFile.has(testFile), `${obligation.id}: untracked test file ${testFile}`)
      adjacentByFile.get(testFile).push(obligation.id)
    }
  }

  let authenticatedWitnesses = 0
  for (const suite of suites) {
    if (!suite.witnesses) {
      suite.witnesses = [
        ...suite.arrays.flatMap(name => readLiteralArray(suite.file, name)),
        ...(suite.targetEvidenceArrays ?? []).flatMap(
          name => readLiteralArray(suite.file, name)[0],
        ),
        ...(suite.daemonEvidenceArrays ?? []).flatMap(name =>
          readLiteralArray(suite.file, name).flatMap(
            ([, targetEvidence, , targetAbsences]) => [
              ...targetEvidence,
              ...targetAbsences,
            ],
          ),
        ),
      ]
    }
    assert(
      suite.witnesses.length === suite.expectedWitnesses,
      `${suite.file}: authenticated witness count mismatch`,
    )
    suite.obligationIds = [
      ...new Set([
        ...(suite.obligationIds ?? []),
        ...(adjacentByFile.get(suite.file) ?? []),
      ]),
    ].sort()
    assert(suite.obligationIds.length > 0, `${suite.file}: no consuming obligations`)
    authenticatedWitnesses += suite.witnesses.length
    const bytes = fs.readFileSync(path.join(repo, suite.file))
    suite.bytes = bytes.length
    suite.sha256 = sha256(bytes)
    suite.witnessInventorySha256 = sha256(
      Buffer.from(JSON.stringify(suite.witnesses), 'utf8'),
    )
    suite.authenticatedWitnesses = suite.witnesses.length
    suite.losslessSemanticGrouping = true
    delete suite.arrays
    delete suite.targetEvidenceArrays
    delete suite.daemonEvidenceArrays
    delete suite.expectedWitnesses
    delete suite.witnesses
  }

  const expectedFiles = fs
    .readdirSync(path.join(repo, 'recovery/test'))
    .filter(name => /^recovery-2\.1\.119-.*\.test\.mjs$/.test(name))
    .map(name => `recovery/test/${name}`)
    .sort()
  assert(
    JSON.stringify(suites.map(suite => suite.file).sort()) === JSON.stringify(expectedFiles),
    'not every 2.1.119 recovery test file is represented exactly once',
  )
  assert(authenticatedWitnesses === 471, 'authenticated witness total mismatch')
  const adjacentObligationIds = new Set(
    suites.flatMap(suite =>
      suite.file === officialTest ? [] : suite.obligationIds,
    ),
  )
  assert(
    adjacentObligationIds.size ===
      hiddenObligations.obligations.length + daemonFleetQueryObligations.obligations.length &&
      [...hiddenObligations.obligations, ...daemonFleetQueryObligations.obligations].every(
        obligation => adjacentObligationIds.has(obligation.id),
      ),
    'not every hidden/daemon obligation is consumed by an authenticated test suite',
  )

  return {
    testFiles: suites.length,
    authenticatedWitnesses,
    unconsumedTestFiles: 0,
    unconsumedAuthenticatedWitnesses: 0,
    suites,
  }
}

verifyFreeze()
const semanticCatalogContract = verifySemanticCatalogInputs()
const sourceFreeze = verifySourceFreeze()
const authenticatedTestCoverage = buildAuthenticatedTestCoverage()

const baselineTarball = renamePrior(
  'targetTarball',
  'baselineTarball',
  'baseline-tarball',
)
const baselineDeclarations = renamePrior(
  'targetDeclarations',
  'baselineDeclarations',
  'baseline-dts',
)
baselineDeclarations.archive = 'baselineTarball'
const baselinePackageJson = renamePrior(
  'targetPackageJson',
  'baselinePackageJson',
  'baseline-package-json',
)
baselinePackageJson.archive = 'baselineTarball'
const baselineInstall = renamePrior(
  'targetInstall',
  'baselineInstall',
  'baseline-install',
)
baselineInstall.archive = 'baselineTarball'
const baselinePlatformTarball = renamePrior(
  'targetPlatformTarball',
  'baselinePlatformTarball',
  'baseline-platform-tarball',
)
const baselineExecutable = renamePrior(
  'targetExecutable',
  'baselineExecutable',
  'baseline-executable',
)
baselineExecutable.archive = 'baselinePlatformTarball'
const baselineBundle = renamePrior(
  'targetBundle',
  'baselineBundle',
  'baseline',
)
baselineBundle.byteSlice.sourceArtifact = 'baselineExecutable'
const baselineAnalyzableBundle = renamePrior(
  'targetAnalyzableBundle',
  'baselineAnalyzableBundle',
  'baseline-analyzable',
)
baselineAnalyzableBundle.byteSlice.sourceArtifact = 'baselineBundle'
const baselineImageProcessorJs = renamePrior(
  'targetImageProcessorJs',
  'baselineImageProcessorJs',
  'baseline-image-js',
)
baselineImageProcessorJs.byteSlice.sourceArtifact = 'baselineExecutable'
const baselineAudioCaptureJs = renamePrior(
  'targetAudioCaptureJs',
  'baselineAudioCaptureJs',
  'baseline-audio-js',
)
baselineAudioCaptureJs.byteSlice.sourceArtifact = 'baselineExecutable'

const targetArtifacts = [
  {
    id: 'targetTarball',
    argument: 'target-tarball',
    localPath: '2.1.119/package.tgz',
    bytes: 13541,
    sha256: '70213032ec5bede0b88a78d9bc4fa3619d81e507a3ffe4dd0bebb15b15f335f2',
    url: 'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.119.tgz',
  },
  {
    id: 'targetDeclarations',
    argument: 'target-dts',
    archive: 'targetTarball',
    archiveMember: 'package/sdk-tools.d.ts',
    localPath: '2.1.119/package/sdk-tools.d.ts',
    bytes: 117452,
    sha256: '8f907e0e9fd160b857d25881375f73f1bddd3642d372ad52ea71d7ff441f3ddf',
  },
  {
    id: 'targetPackageJson',
    argument: 'target-package-json',
    archive: 'targetTarball',
    archiveMember: 'package/package.json',
    localPath: '2.1.119/package/package.json',
    bytes: 1476,
    sha256: '259bdf03c602afccdaad60445bcf533b50a7a61d467109045ed45a452008b1e2',
  },
  {
    id: 'targetInstall',
    argument: 'target-install',
    archive: 'targetTarball',
    archiveMember: 'package/install.cjs',
    localPath: '2.1.119/package/install.cjs',
    bytes: 6307,
    sha256: '574cb5fd945d2adba5901a9ae508b62ca539e5a91dcd877840fc174844ed79d2',
  },
  {
    id: 'targetPlatformTarball',
    argument: 'target-platform-tarball',
    localPath: '2.1.119-linux-x64/package.tgz',
    bytes: 76696630,
    sha256: '2a97954a862fc1dc096601f011eb46adeea0d95d08ac98fcd272ca1681ae9ca8',
    url: 'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.119.tgz',
  },
  {
    id: 'targetExecutable',
    argument: 'target-executable',
    archive: 'targetPlatformTarball',
    archiveMember: 'package/claude',
    localPath: '2.1.119-linux-x64/package/claude',
    bytes: 245230208,
    sha256: 'cca43053f062949495596b11b6fd1b59cf79102adb13bacbe66997e6fae41e4a',
  },
  {
    id: 'targetBundle',
    argument: 'target',
    localPath: '2.1.119-linux-x64/cli.js',
    bytes: 13721077,
    sha256: 'bc814388b51cbcb5114db927e60f8fbb5e12409532a89137429975556c29464e',
    byteSlice: {
      sourceArtifact: 'targetExecutable',
      offset: 229546328,
      bytes: 13721077,
      prefixHex: '2f2f204062756e204062797465636f6465',
    },
  },
  {
    id: 'targetAnalyzableBundle',
    argument: 'target-analyzable',
    localPath: '2.1.119-linux-x64/cli.inner.js',
    bytes: 13720987,
    sha256: '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef',
    byteSlice: { sourceArtifact: 'targetBundle', offset: 87, bytes: 13720987 },
  },
  {
    id: 'targetCliJsc',
    argument: 'target-cli-jsc',
    localPath: '2.1.119-linux-x64/cli.jsc',
    bytes: 120854672,
    sha256: '8582ccaaf502507cd2639aba35cdf917d3bc07becb87921c0e54320bcf8dfa68',
    byteSlice: {
      sourceArtifact: 'targetExecutable',
      offset: 108691584,
      bytes: 120854672,
    },
  },
  ...[
    ['targetImageProcessorJs', 'target-image-js', 'image-processor.js', 243267438, 2564, '46a48a5c7d8b85d668b5e599092d1b92e4e26a2fa152d7b7e44fb86df9e0308e'],
    ['targetAudioCaptureJs', 'target-audio-js', 'audio-capture.js', 243270033, 2562, 'c34cedf53a591a0ff1f888572fb657148ec82eadc7be61a2b6676b0b9b178190'],
    ['targetImageProcessorNative', 'target-image-native', 'image-processor.node', 243272630, 1458656, '418c92f2e5d688ecf0fe24ab490123c7bdb6d62ca72983431244665f179a4405'],
    ['targetAudioCaptureNative', 'target-audio-native', 'audio-capture.node', 244731319, 492184, '7e89edf4dde9b69b6c55a310788ad999e2d0dd469d8a31c529cf28f3ea5e929c'],
  ].map(([id, argument, name, offset, bytes, digest]) => ({
    id,
    argument,
    localPath: `2.1.119-linux-x64/${name}`,
    bytes,
    sha256: digest,
    byteSlice: {
      sourceArtifact: 'targetExecutable',
      offset,
      bytes,
      ...(name.endsWith('.node') ? { prefixHex: '7f454c46' } : {}),
    },
  })),
]

const officialChangelog = {
  id: 'officialChangelog',
  argument: 'changelog',
  localPath: 'evidence/claude-code-CHANGELOG-ab3ce06c.md',
  bytes: 255309,
  sha256: '88d929d9b71befc31ce318a9425d721b671ff5d8ca23cc4d0275f8e7244bb88a',
  url: 'https://raw.githubusercontent.com/anthropics/claude-code/ab3ce06c9ac0a6a0405850e642b80b0bb2c9fb25/CHANGELOG.md',
}

const targetEmbeddedFiles = nativeInventory.modules
  .filter(module => module.path.endsWith('.js'))
  .map(module => ({
    path: module.path.replace('/$bunfs/root/', ''),
    bytes: module.content.bytes,
    sha256: module.content.sha256,
  }))
const targetPackageFiles = packageMembers.members
  .filter(member => member.target !== null)
  .map(member => ({
    path: member.path,
    bytes: member.target.bytes,
    sha256: member.target.sha256,
  }))
const nonSourceCacheCandidates = cacheCandidates()

const manifest = {
  schemaVersion: 4,
  case: '2.1.118-to-2.1.119',
  draft: {
    kind: 'authenticated-evidence-and-source-freeze',
    status: 'semantic-correspondence-and-final-docs-pending',
    generatedBy: 'recovery/scripts/build-2.1.119-non-source-draft.mjs',
    rule:
      'Published artifacts, non-source evidence, and the immutable source overlay identity are frozen. Semantic correspondence hashes and final report/runbook identities remain pending.',
  },
  releaseAdjacency: {
    baseline: '2.1.118',
    target: '2.1.119',
    targetIsNextPublishedVersion: true,
    skipped: [],
    skippedVersionsAbsent: true,
    provenance: 'evidence/provenance.json',
  },
  recoveryScope: {
    platform: 'linux-x64',
    completeness: 'authenticated-artifacts-and-source-overlay-complete-semantic-pending',
    authoredSourceTextObservable: false,
    authenticatedNativeContainer: true,
    exactPublishedPackageTreeReconstruction: true,
    exactPublishedBundleReconstruction: true,
    exactEmbeddedJavaScriptGraphReconstruction: true,
    allTargetUtf16Accounted: true,
    allTargetTokensClassified: true,
    sourceClosurePending: false,
    semanticClosurePending: true,
  },
  artifacts: [
    baselineTarball,
    baselineDeclarations,
    baselinePackageJson,
    baselineInstall,
    ...targetArtifacts.slice(0, 4),
    baselinePlatformTarball,
    baselineExecutable,
    baselineBundle,
    baselineAnalyzableBundle,
    baselineImageProcessorJs,
    baselineAudioCaptureJs,
    ...targetArtifacts.slice(4),
    clone(priorArtifacts.get('sourceOracleBundle')),
    clone(priorArtifacts.get('sourceOracleMap')),
    officialChangelog,
  ],
  baselineOracle: clone(prior.baselineOracle),
  sourceOracle: {
    bundleArtifact: 'sourceOracleBundle',
    mapArtifact: 'sourceOracleMap',
    relationship: prior.sourceOracle.relationship,
    appliedSourceTree: {
      status: 'immutable-source-freeze-bound',
      base: {
        commit: sourceFreeze.identity.base.commit,
        tree: sourceFreeze.identity.base.tree,
        srcTree: sourceFreeze.identity.base.srcTree,
      },
      patchSet: 'recovered/source-facing-overlay.patch',
      fileCount: sourceFreeze.identity.source.files,
      bytes: sourceFreeze.identity.source.bytes,
      files: 'recovered/source-freeze/source-files.sha256',
    },
  },
  sourceLineage: {
    status: 'immutable-source-freeze-bound',
    root: 'src',
    baseCommit: sourceFreeze.identity.base.commit,
    baseGitTree: sourceFreeze.identity.base.tree,
    baseSrcGitTree: sourceFreeze.identity.base.srcTree,
    targetGitTree: sourceFreeze.identity.target.tree,
    targetSrcGitTree: sourceFreeze.identity.target.srcTree,
    patchSet: '2.1.118-to-2.1.119-incremental',
    patchOrder: ['recovered/source-facing-overlay.patch'],
    patchStats: {
      files: sourceFreeze.identity.overlay.changedPaths,
      insertions: sourceFreeze.identity.overlay.insertions,
      deletions: sourceFreeze.identity.overlay.deletions,
    },
    target: {
      files: sourceFreeze.identity.source.files,
      bytes: sourceFreeze.identity.source.bytes,
      manifest: 'recovered/source-freeze/source-files.sha256',
      manifestSha256:
        sourceFreeze.fileAssertions.find(
          assertion => assertion.path === 'recovered/source-freeze/source-files.sha256',
        ).sha256,
    },
    verification: clone(sourceFreeze.identity.verification),
  },
  targetAssertions: {
    declarationChange: { kind: 'unchanged' },
    packageVersionChange: { baseline: '2.1.118', target: '2.1.119' },
    packageJsonChange: { kind: 'exact-artifact' },
    bundleFragments: [],
    status: 'authenticated-test-witnesses-bound-semantic-ledger-pending',
  },
  recoveredEdits: [],
  recoveredFileAssertions: [],
  generatedRecovery: {
    packageMembers: {
      report: 'package-members.json',
      baselineTarball: {
        bytes: baselineTarball.bytes,
        sha256: baselineTarball.sha256,
      },
      baselineMembers: packageMembers.summary.baselineMemberCount,
      targetMembers: packageMembers.summary.targetMemberCount,
      targetMemberBytes: targetPackageFiles.reduce((sum, file) => sum + file.bytes, 0),
      targetFramedTreeSha256: packageFramedTree(packageMembers.members),
      unchanged: packageMembers.summary.unchanged,
      changed: packageMembers.summary.changed,
      added: packageMembers.summary.added,
      removed: packageMembers.summary.removed,
      modeOnlyChanged: 0,
      changedMemberPayloads: [
        {
          member: 'package/package.json',
          algorithm: 'zstd-dictionary-patch',
          path: 'diff/package.json.zstd-delta',
        },
      ],
      addedMemberPayloads: [],
    },
    exactBundleDelta: {
      algorithm: 'zstd-dictionary-patch',
      path: 'diff/cli.js.zstd-delta',
      baselineArtifact: 'baselineBundle',
      targetArtifact: 'targetBundle',
      reconstructsTargetExactly: true,
    },
    embeddedCode: {
      status: 'all-plain-javascript-bun-modules-exact',
      files: [
        ['src/entrypoints/cli.js', 'baselineBundle', 'targetBundle', 'diff/cli.js.zstd-delta'],
        ['image-processor.js', 'baselineImageProcessorJs', 'targetImageProcessorJs', 'diff/image-processor.js.zstd-delta'],
        ['audio-capture.js', 'baselineAudioCaptureJs', 'targetAudioCaptureJs', 'diff/audio-capture.js.zstd-delta'],
      ].map(([file, baselineArtifact, targetArtifact, payload]) => ({
        path: file,
        algorithm: 'zstd-dictionary-patch',
        baselineArtifact,
        targetArtifact,
        payload,
      })),
      targetFiles: targetEmbeddedFiles.length,
      targetBytes: targetEmbeddedFiles.reduce((sum, file) => sum + file.bytes, 0),
      targetFramedTreeSha256: framedTree(targetEmbeddedFiles),
    },
    bunExtraction: {
      status: 'authenticated-linux-x64-bun-graph',
      inventory: 'binary-extraction/inventory.json',
      discoveryOutput: 'binary-extraction/bun-graph.txt',
      executableArtifact: 'targetExecutable',
      analyzableArtifact: 'targetAnalyzableBundle',
      moduleArtifacts: [
        { index: 0, contentArtifact: 'targetBundle', jscArtifact: 'targetCliJsc' },
        { index: 1, contentArtifact: 'targetImageProcessorJs' },
        { index: 2, contentArtifact: 'targetAudioCaptureJs' },
        { index: 3, contentArtifact: 'targetImageProcessorNative' },
        { index: 4, contentArtifact: 'targetAudioCaptureNative' },
      ],
    },
    attribution: {
      status: 'non-source-cache-candidate-authenticated-inputs',
      directory: 'attribution',
      baselineArtifact: 'sourceOracleBundle',
      sourceMapArtifact: 'sourceOracleMap',
      targetArtifact: 'targetAnalyzableBundle',
      offsetUnit: 'utf16-code-units',
      targetUtf16: 13720987,
      accountedTargetUtf16: 13720987,
      unaccountedTargetUtf16: 0,
      targetRanges: 'attribution/target-ranges.jsonl.gz',
      targetRangeCount: 58513,
      targetRangeUtf16: 13720987,
    },
    structural: {
      status: 'non-source-cache-candidate-authenticated-inputs',
      ledger: 'structural/generated-delta.json.gz',
      baselineArtifact: 'baselineAnalyzableBundle',
      targetArtifact: 'targetAnalyzableBundle',
      targetUnits: 21893,
      targetTokens: 4312550,
      matchedTokens: 3499586,
      movedCandidateTokens: 36691,
      coarseChangedTokens: 215646,
      unresolvedTokens: 560627,
      exactStructuralFraction: 0.8199967536608271,
      resolvedStructuralFraction: 0.8700010434661627,
    },
    readableDiff: {
      status: 'non-source-cache-candidate-authenticated-inputs',
      directory: 'readable-diff',
      comparisonInvariantHashesEqual:
        readableMetadata.verification.comparisonInvariantHashesEqual,
      metadata: 'readable-diff/metadata.json',
      fullDiff: 'readable-diff/normalized.diff.gz',
      baselineArtifact: 'baselineAnalyzableBundle',
      targetArtifact: 'targetAnalyzableBundle',
    },
    semanticCorrespondence: {
      status: 'pending-semantic-closure',
      required: [
        'semantic/README.md',
        'semantic/obligations.json',
        'semantic/semantic-correspondence.json.gz',
        'semantic/summary.json',
      ],
    },
    semanticCatalogContract: {
      status: 'verified-input-ledgers-awaiting-final-correspondence',
      ...semanticCatalogContract,
      authenticatedTestCoverage,
      ledgers: [
        {
          path: 'recovery/2.1.119-official-semantic-inventory.json',
          obligations: semanticCatalogContract.official,
        },
        {
          path: 'hidden-obligations.json',
          obligations: semanticCatalogContract.hidden,
        },
        {
          path: 'daemon-fleet-query-obligations.json',
          obligations: semanticCatalogContract.daemonFleetQuery,
        },
      ],
    },
    fileAssertions: freezeIndex.files,
  },
  sourceFreeze: {
    status: 'immutable-and-verified',
    identity: 'recovered/source-freeze/identity.json',
    identitySha256: sourceFreeze.identitySha256,
    overlay: {
      path: 'recovered/source-facing-overlay.patch',
      bytes: sourceFreeze.identity.overlay.bytes,
      sha256: sourceFreeze.identity.overlay.sha256,
    },
    fileAssertions: sourceFreeze.fileAssertions,
  },
  nonSourceFreeze: {
    index: 'freeze-index.json',
    indexBytes: fs.statSync(path.join(caseRoot, 'freeze-index.json')).size,
    indexSha256: sha256(fs.readFileSync(path.join(caseRoot, 'freeze-index.json'))),
    files: freezeIndex.summary.files,
    bytes: freezeIndex.summary.bytes,
    verified: true,
    cacheCandidates: nonSourceCacheCandidates,
  },
  pendingSourceClosure: {
    status: 'source-frozen-semantic-correspondence-pending',
    manifestFields: [
      'recoveryScope.completeness and final unresolved claim',
      'targetAssertions.bundleFragments',
      'recoveredEdits',
      'recoveredFileAssertions',
      'generatedRecovery.semanticCorrespondence',
      'generatedRecovery.fileAssertions for source-dependent outputs',
    ],
    caseFiles: [
      'RECOVERY_RUNBOOK.md',
      'REPORT.md',
      'semantic/README.md',
      'semantic/obligations.json',
      'semantic/semantic-correspondence.json.gz',
      'semantic/summary.json',
    ],
    sourceInputs: [
      'schema-v1 semantic/obligations.json generated losslessly from the verified 135-row input contract',
      'semantic correspondence report and summary with zero unverified obligations',
      'final recovery runbook/report and their manifest assertions',
    ],
  },
}

fs.writeFileSync(
  path.join(caseRoot, 'readable-diff/metadata.json'),
  `${JSON.stringify(readableMetadata, null, 2)}\n`,
)
fs.writeFileSync(draftPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(
  JSON.stringify({
    status: 'non-source-draft-built',
    path: path.relative(repo, draftPath),
    bytes: fs.statSync(draftPath).size,
    sha256: sha256(fs.readFileSync(draftPath)),
    artifacts: manifest.artifacts.length,
    frozenFiles: freezeIndex.files.length,
    frozenBytes: freezeIndex.summary.bytes,
    cacheCandidates: nonSourceCacheCandidates.length,
    sourceClosure: manifest.pendingSourceClosure.status,
  }),
)
