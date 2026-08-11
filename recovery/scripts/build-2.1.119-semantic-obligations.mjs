#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.118-to-2.1.119')
const semanticRoot = path.join(caseRoot, 'semantic')
const outputPath = path.join(semanticRoot, 'obligations.json')
const officialPath = path.join(
  repo,
  'recovery/2.1.119-official-semantic-inventory.json',
)
const directEvidencePath = path.join(
  semanticRoot,
  'adjacent-direct-evidence.json',
)
const hiddenPath = path.join(caseRoot, 'hidden-obligations.json')
const daemonPath = path.join(caseRoot, 'daemon-fleet-query-obligations.json')
const baselinePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  '/home/coder/.cache/claude-code-recovery/preflight-2.1.118-to-2.1.119/artifacts/2.1.118-linux-x64/cli.inner.js'
const targetPath =
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
  '/home/coder/.cache/claude-code-recovery/preflight-2.1.118-to-2.1.119/artifacts/2.1.119-linux-x64/cli.inner.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function metadata(filename) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(repo, filename),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function occurrences(contents, fragment) {
  assert(fragment.length > 0, 'cannot count an empty fragment')
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function witness(text, baseline, target) {
  const value = Buffer.from(text)
  return {
    text,
    bytes: value.length,
    sha256: sha256(value),
    baselineCount: occurrences(baseline, text),
    targetCount: occurrences(target, text),
  }
}

function assertion(sourcePath, fragment) {
  const value = Buffer.from(fragment)
  const source = fs.readFileSync(path.join(repo, sourcePath), 'utf8')
  return {
    path: sourcePath,
    fragment,
    bytes: value.length,
    sha256: sha256(value),
    count: occurrences(source, fragment),
  }
}

const official = JSON.parse(fs.readFileSync(officialPath, 'utf8'))
const directEvidence = JSON.parse(fs.readFileSync(directEvidencePath, 'utf8'))
const hidden = JSON.parse(fs.readFileSync(hiddenPath, 'utf8'))
const daemon = JSON.parse(fs.readFileSync(daemonPath, 'utf8'))
const baselineBytes = fs.readFileSync(baselinePath)
const targetBytes = fs.readFileSync(targetPath)
const baseline = baselineBytes.toString('utf8')
const target = targetBytes.toString('utf8')
const officialBulletTexts = fs
  .readFileSync(path.join(caseRoot, 'evidence/CHANGELOG-2.1.119.md'), 'utf8')
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))

assert(official.schema_version === 2, 'official inventory schema')
assert(official.rows.length === 51, 'official inventory row count')
assert(hidden.obligations.length === 65, 'hidden raw row count')
assert(daemon.obligations.length === 19, 'DFQ raw row count')
assert(directEvidence.schemaVersion === 1, 'direct evidence schema')
assert(directEvidence.rows.length === 84, 'direct evidence row count')
assert(directEvidence.rowCount === 84, 'declared direct evidence row count')
assert(baselineBytes.length === directEvidence.baseline.bytes, 'baseline bytes')
assert(sha256(baselineBytes) === directEvidence.baseline.sha256, 'baseline SHA')
assert(targetBytes.length === directEvidence.target.bytes, 'target bytes')
assert(sha256(targetBytes) === directEvidence.target.sha256, 'target SHA')

const directEvidenceMetadata = metadata(directEvidencePath)
const rawCatalogs = [hiddenPath, daemonPath]
const rawRows = [...hidden.obligations, ...daemon.obligations]
const rawIds = rawRows.map(row => row.id)
const directIds = directEvidence.rows.map(row => row.id)
assert(new Set(rawIds).size === 84, 'unique raw IDs')
assert(new Set(directIds).size === 84, 'unique direct evidence IDs')
assert(
  JSON.stringify(directIds) === JSON.stringify(rawIds),
  'direct evidence must exhaust raw IDs in exact order',
)
assert(
  JSON.stringify(directEvidence.rawCatalogs) ===
    JSON.stringify(rawCatalogs.map(metadata)),
  'direct evidence raw-catalog identities',
)

const changedSourcePaths = new Set(
  fs
    .readFileSync(
      path.join(caseRoot, 'recovered/source-freeze/source-paths.txt'),
      'utf8',
    )
    .trim()
    .split('\n')
    .map(line => line.split('\t').at(-1)),
)

const testFiles = {
  official: 'recovery/test/recovery-2.1.119-official-bullets.test.mjs',
  adjacent:
    'recovery/test/recovery-2.1.119-adjacent-direct-evidence.test.mjs',
  hidden:
    'recovery/test/recovery-2.1.119-hidden-tracing-remote-updater.test.mjs',
  daemon: 'recovery/test/recovery-2.1.119-daemon-fleet-query.test.mjs',
  prompts: 'recovery/test/recovery-2.1.119-official-prompts-plugins.test.mjs',
  platform: 'recovery/test/recovery-2.1.119-platform-persistence.test.mjs',
  ultraplan: 'recovery/test/recovery-2.1.119-ultraplan-dialogs.test.mjs',
  background: 'recovery/test/recovery-2.1.119-background-stop.test.mjs',
}
const semanticTestIdByPath = new Map(
  Object.entries(testFiles).map(([id, filename]) => [filename, id]),
)
const rawTestPathById = new Map(
  [
    ...Object.entries(hidden.testSuites),
    ...Object.entries(daemon.tests),
  ].map(([id, description]) => [id, description.split(' :: ')[0]]),
)

function focusedTestIds(raw) {
  return [
    ...new Set(
      raw.testIds.map(rawTestId => {
        const filename = rawTestPathById.get(rawTestId)
        assert(filename, `${raw.id}: unknown raw test ID ${rawTestId}`)
        const semanticTestId = semanticTestIdByPath.get(filename)
        assert(
          semanticTestId,
          `${raw.id}: raw test is outside the frozen target suite: ${filename}`,
        )
        return semanticTestId
      }),
    ),
  ].sort()
}

const testCatalog = Object.entries(testFiles).map(([id, filename]) => {
  const entry = { id, ...metadata(path.join(repo, filename)) }
  if (id === 'official') {
    entry.evidence = [
      {
        ...metadata(officialPath),
        decodeBase64Fragments: true,
        relation: 'loaded-and-exactly-verified-by-this-test',
      },
    ]
  } else if (id === 'adjacent') {
    entry.evidence = [
      {
        ...directEvidenceMetadata,
        rowCount: 84,
        testPinsIdentity: true,
        relation: 'loaded-and-exactly-verified-by-this-test',
      },
    ]
  }
  return entry
})

function validateTargetRecord(row, fragment, label, absent = false) {
  const value = Buffer.from(fragment.text)
  assert(value.length === fragment.bytes, `${row.id}: ${label} bytes`)
  assert(sha256(value) === fragment.sha256, `${row.id}: ${label} SHA`)
  assert(
    occurrences(baseline, fragment.text) === fragment.baselineCount,
    `${row.id}: ${label} baseline count`,
  )
  assert(
    occurrences(target, fragment.text) === fragment.targetCount,
    `${row.id}: ${label} target count`,
  )
  assert(
    absent ? fragment.targetCount === 0 : fragment.targetCount > 0,
    `${row.id}: ${label} presence`,
  )
}

function validateSourceRecord(row, entry) {
  const value = Buffer.from(entry.fragment)
  assert(value.length === entry.bytes, `${row.id}: source bytes`)
  assert(sha256(value) === entry.sha256, `${row.id}: source SHA`)
  assert(
    occurrences(
      fs.readFileSync(path.join(repo, entry.path), 'utf8'),
      entry.fragment,
    ) === entry.count,
    `${row.id}: source count: ${entry.path}`,
  )
  assert(entry.count > 0, `${row.id}: source witness present`)
}

function adjacentObligation(row, raw) {
  assert(row.id === raw.id, `${raw.id}: exact catalog row ID`)
  assert(row.obligationId === raw.id.toLowerCase(), `${raw.id}: obligation ID`)
  assert(row.classification === raw.classification, `${raw.id}: classification`)
  assert(row.status === raw.status, `${raw.id}: status`)
  assert(JSON.stringify(row.testIds) === JSON.stringify(raw.testIds), `${raw.id}: raw test IDs`)
  assert(row.targetFragments.length > 0, `${raw.id}: target witnesses`)
  for (const fragment of row.targetFragments) {
    validateTargetRecord(row, fragment, 'target witness')
  }
  for (const fragment of row.targetAbsences) {
    validateTargetRecord(row, fragment, 'target absence', true)
  }
  for (const entry of row.sourceAssertions) validateSourceRecord(row, entry)
  for (const entry of row.sourceAbsences) {
    const value = Buffer.from(entry.fragment)
    assert(value.length === entry.bytes, `${row.id}: source absence bytes`)
    assert(sha256(value) === entry.sha256, `${row.id}: source absence SHA`)
    assert(entry.scope === 'src/**/*.{ts,tsx}', `${row.id}: source absence scope`)
    assert(entry.count === 0, `${row.id}: source absence count`)
  }

  const countDifferent = row.targetFragments.some(
    fragment => fragment.baselineCount !== fragment.targetCount,
  )
  const sourceLocalized = row.sourceAssertions.length > 0
  const classification = sourceLocalized
    ? countDifferent
      ? 'source-localized-adjacent'
      : 'source-localized-inherited'
    : 'dependency-adjacent'
  const retainedSourcePaths = [
    ...new Set(
      row.sourceAssertions
        .map(entry => entry.path)
        .filter(sourcePath => !changedSourcePaths.has(sourcePath)),
    ),
  ].sort()
  return {
    id: row.obligationId,
    classification,
    releaseBullets: [],
    hidden: true,
    rationale: `${row.id}: ${row.rationale}`,
    targetFragments: row.targetFragments,
    ...(row.targetAbsences.length > 0
      ? { targetAbsences: row.targetAbsences }
      : {}),
    sourceAssertions: row.sourceAssertions,
    ...(row.sourceAbsences.length > 0
      ? { sourceAbsences: row.sourceAbsences }
      : {}),
    testIds: ['adjacent', ...focusedTestIds(raw)],
    catalogBinding: {
      ...directEvidenceMetadata,
      rawId: row.id,
      rowSha256: sha256(Buffer.from(JSON.stringify(row))),
      kind: row.evidenceKind,
    },
    ...(sourceLocalized
      ? {
          localizationBasis: 'authenticated-behavior-test',
          localizationBoundary:
            'The pinned adjacent direct-evidence suite loads this exact hashed catalog and verifies this row’s exact target counts and source fragment counts and hashes.',
          retainedSourcePaths,
        }
      : {}),
  }
}

function officialObligation(row) {
  if (row.bullet === 51) {
    const voiceFragments = [
      '[voice] startRecording called, platform=',
      '[voice] Recording stopped',
    ]
    return {
      id: row.test_id.replaceAll('.', '-'),
      classification: 'source-localized-inherited',
      releaseBullets: [51],
      rationale:
        'The macOS/VSCode permission-prompt fix is outside the authenticated Linux cli.js source delta. Two directly relevant unchanged Linux voice-flow witnesses bind the shared source boundary, while the focused official test proves audio-capture.node is byte-identical across 2.1.118 and 2.1.119.',
      targetFragments: voiceFragments.map(text => witness(text, baseline, target)),
      sourceAssertions: [
        assertion('src/services/voice.ts', voiceFragments[0]),
        assertion('src/hooks/useVoice.ts', voiceFragments[1]),
      ],
      testIds: ['official'],
      allowCandidateOwnership: true,
    }
  }
  const targetFragments = row.targetFragments.map(fragment => {
    const text = Buffer.from(fragment.base64, 'base64').toString('utf8')
    const value = witness(text, baseline, target)
    assert(
      value.baselineCount === fragment.baseline_count,
      `${row.test_id}: baseline count`,
    )
    assert(
      value.targetCount === fragment.target_count,
      `${row.test_id}: target count`,
    )
    return value
  })
  const sourceAssertions = row.source.map(entry => ({
    path: entry.path,
    fragment: entry.fragment,
    bytes: entry.bytes,
    sha256: entry.sha256,
    count: entry.count,
  }))
  return {
    id: row.test_id.replaceAll('.', '-'),
    classification: targetFragments.some(
      fragment => fragment.baselineCount !== fragment.targetCount,
    )
      ? 'source-localized-adjacent'
      : 'source-localized-inherited',
    releaseBullets: [row.bullet],
    rationale: `${row.changelog}. The direct official-bullet suite authenticates exact target evidence and exact frozen-source assertions.`,
    targetFragments,
    sourceAssertions,
    testIds: ['official'],
    localizationBasis: 'authenticated-behavior-test',
    localizationBoundary:
      'The direct official-bullet suite loads the exact hashed inventory, authenticates every decoded target fragment/count, and checks every frozen source fragment hash/count.',
    retainedSourcePaths: [
      ...new Set(
        sourceAssertions
          .map(entry => entry.path)
          .filter(sourcePath => !changedSourcePaths.has(sourcePath)),
      ),
    ].sort(),
  }
}

const obligations = [
  ...official.rows.map(officialObligation),
  ...directEvidence.rows.map((row, index) =>
    adjacentObligation(row, rawRows[index]),
  ),
]
assert(obligations.length === 135, 'semantic obligation total')
assert(new Set(obligations.map(value => value.id)).size === 135, 'semantic IDs')

const releaseBulletEvidence = official.rows.map(row => ({
  number: row.bullet,
  text: officialBulletTexts[row.bullet - 1],
  sha256: sha256(Buffer.from(officialBulletTexts[row.bullet - 1])),
}))

const output = {
  schemaVersion: 1,
  releaseBulletCount: 51,
  releaseBulletEvidence,
  sourceAliases: {
    'src/commands/advisor.ts': 'src/commands/advisor/advisor.tsx',
  },
  directEvidenceCatalog: {
    ...directEvidenceMetadata,
    rowCount: 84,
    rowIdsSha256: sha256(Buffer.from(directIds.join('\n') + '\n')),
  },
  testCatalog,
  obligations,
}

fs.mkdirSync(semanticRoot, { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
const value = fs.readFileSync(outputPath)
console.log(
  JSON.stringify({
    status: 'semantic-obligations-built',
    path: path.relative(repo, outputPath),
    bytes: value.length,
    sha256: sha256(value),
    obligations: obligations.length,
    sourceLocalized: obligations.filter(value =>
      value.classification.startsWith('source-localized-'),
    ).length,
    directEvidenceRows: directEvidence.rows.length,
  }),
)
