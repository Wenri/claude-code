import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const fixtures = new Map([
  [
    '2.1.116-to-2.1.117',
    {
      filename: 'recovery-2.1.117-exact-owner-correction-proofs.json',
      sha256: 'bbb341433dc7cc89ade360910d36108872a49b30e8040c0a3ac22d9cf17222c6',
    },
  ],
  [
    '2.1.117-to-2.1.118',
    {
      filename: 'recovery-2.1.118-exact-owner-correction-proofs.json',
      sha256: 'f2aabc4de2c0a1ea1bc07f0f33163575cc261d6339b67f1704d6e77cb46abab2',
    },
  ],
  [
    '2.1.118-to-2.1.119',
    {
      filename: 'recovery-2.1.119-exact-owner-correction-proofs.json',
      sha256: 'f1fad70110ac326f70b04c1bcb80915abe8ccabd6bd8f827f3a7de40f2abba7d',
    },
  ],
  [
    '2.1.119-to-2.1.120',
    {
      filename: 'recovery-2.1.120-exact-owner-correction-proofs.json',
      sha256: '093af3565913bb0c32a6b7b9aae125018e7a52d5066f7ba7c3972470bd7abee3',
    },
  ],
  [
    '2.1.120-to-2.1.121',
    {
      filename: 'recovery-2.1.121-exact-owner-correction-proofs.json',
      sha256: '8f05fe44b7062cb90180565bc0954d6b798cf7a89cb8b1b6a8543a01f525cf6c',
    },
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readFixture(caseName) {
  const descriptor = fixtures.get(caseName)
  assert.ok(descriptor, `${caseName}: fixture descriptor`)
  const filename = path.join(path.dirname(fileURLToPath(import.meta.url)), descriptor.filename)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), descriptor.sha256, `${caseName}: fixture SHA-256`)
  return JSON.parse(bytes)
}

function bundleEnvironmentVariable(version) {
  return `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
}

function sourceFilename(owner) {
  const direct = path.join(sourceRoot, owner.replace(/^src\//, ''))
  const nested = path.join(sourceRoot, owner)
  const filename = fs.existsSync(direct) ? direct : nested
  assert.ok(fs.existsSync(filename), `${owner}: source owner exists`)
  return filename
}

function scannerReport(caseName, baselinePath, targetPath) {
  const caseRoot = path.join(repositoryRoot, 'recovery', 'cases', caseName)
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, 'recovery/scripts/inspect-semantic-literal-gaps.mjs'),
      '--baseline',
      baselinePath,
      '--target',
      targetPath,
      '--source-root',
      sourceRoot,
      '--structural',
      path.join(caseRoot, 'structural/generated-delta.json.gz'),
      '--partitions',
      path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
      '--sources',
      path.join(caseRoot, 'attribution/sources.jsonl.gz'),
      '--coverage',
      path.join(caseRoot, 'semantic/source-coverage.json.gz'),
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 1024 * 1024 * 1024,
    },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

for (const caseName of semanticCase ? [semanticCase] : [...fixtures.keys()]) {
  if (!fixtures.has(caseName)) continue
  const fixture = readFixture(caseName)

  test(`${caseName} exact owner-correction fixture is fail-closed`, () => {
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.rows.length, fixture.summary.units)
    assert.equal(
      fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
      fixture.summary.residues,
    )
    assert.equal(new Set(fixture.rows.map(row => row.targetIndex)).size, fixture.rows.length)
    for (const row of fixture.rows) {
      assert.ok(row.currentOwnerPaths.length > 0, `u${row.targetIndex}: prior owner`)
      assert.ok(!row.currentOwnerPaths.includes(row.correctedOwner))
      assert.deepEqual([...new Set(row.candidateUniverse)].sort(), row.candidateUniverse)
      assert.ok(row.candidateUniverse.includes(row.correctedOwner))
      assert.ok(row.residues.length > 0, `u${row.targetIndex}: residues`)
      for (const residue of row.residues) {
        assert.ok(residue.start >= row.target.start)
        assert.ok(residue.end <= row.target.end)
      }
    }
  })

  const baselinePath = process.env[
    bundleEnvironmentVariable(fixture.versions.baseline)
  ]
  const targetPath = process.env[
    bundleEnvironmentVariable(fixture.versions.target)
  ]

  test(
    `${caseName} exact alternate owners close every authenticated typed residue`,
    { skip: !baselinePath || !targetPath || semanticCase !== caseName },
    () => {
      const baselineBytes = fs.readFileSync(baselinePath)
      const targetBytes = fs.readFileSync(targetPath)
      assert.deepEqual(
        { bytes: baselineBytes.length, sha256: sha256(baselineBytes) },
        fixture.inputs.baselineBundle,
      )
      assert.deepEqual(
        { bytes: targetBytes.length, sha256: sha256(targetBytes) },
        fixture.inputs.targetBundle,
      )

      const structuralBytes = fs.readFileSync(
        path.join(
          repositoryRoot,
          'recovery/cases',
          caseName,
          'structural/generated-delta.json.gz',
        ),
      )
      assert.deepEqual(
        { bytes: structuralBytes.length, sha256: sha256(structuralBytes) },
        fixture.inputs.structural,
      )
      const structural = JSON.parse(gunzipSync(structuralBytes))
      const structuralByIndex = new Map(
        structural.regions.map(region => [region.target.index, region]),
      )
      const targetSource = targetBytes.toString('utf8')
      const coverage = JSON.parse(
        gunzipSync(
          fs.readFileSync(
            path.join(
              repositoryRoot,
              'recovery/cases',
              caseName,
              'semantic/source-coverage.json.gz',
            ),
          ),
        ),
      )
      const coverageByIndex = new Map(
        coverage.rows.map(row => [row.targetIndex, row]),
      )
      const ownersById = new Map(
        coverage.owners.map(owner => [owner.id, owner.path]),
      )
      const report = scannerReport(caseName, baselinePath, targetPath)
      const missingIndices = new Set(
        report.sourceRuntimeAddedOwnerResidueRows.map(row => row.structural.index),
      )

      for (const row of fixture.rows) {
        const region = structuralByIndex.get(row.targetIndex)
        assert.ok(region, `${caseName} u${row.targetIndex}: structural region`)
        assert.deepEqual(
          {
            classification: region.classification,
            start: region.target.start,
            end: region.target.end,
            nodeType: region.target.nodeType,
            sourceHash: region.target.sourceHash,
          },
          row.target,
        )
        assert.equal(
          sha256(targetSource.slice(row.target.start, row.target.end)),
          row.target.sourceHash,
          `${caseName} u${row.targetIndex}: target unit SHA-256`,
        )
        assert.ok(
          !missingIndices.has(row.targetIndex),
          `${caseName} u${row.targetIndex}: corrected owner has no missing residue`,
        )

        const coverageRow = coverageByIndex.get(row.targetIndex)
        assert.ok(coverageRow, `${caseName} u${row.targetIndex}: coverage row`)
        assert.deepEqual(
          coverageRow.ownerIds.map(ownerId => ownersById.get(ownerId)),
          [...new Set([...row.currentOwnerPaths, row.correctedOwner])],
          `${caseName} u${row.targetIndex}: exact coalesced owner union`,
        )

        const ownerBytes = fs.readFileSync(sourceFilename(row.correctedOwner))
        assert.deepEqual(
          { bytes: ownerBytes.length, sha256: sha256(ownerBytes) },
          row.source,
          `${caseName} u${row.targetIndex}: exact historical owner bytes`,
        )
      }
    },
  )
}
