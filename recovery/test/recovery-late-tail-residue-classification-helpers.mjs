import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)

const CATEGORY_NAMES = [
  'dependency-build-input',
  'transitive-source',
  'dce-compiler',
  'source-supplement',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function indexDigest(indices) {
  return sha256(Buffer.from(JSON.stringify(indices)))
}

function canonicalResidue(residue) {
  return [
    residue.structural.index,
    residue.literalKind,
    residue.value,
    residue.target.start,
    residue.target.end,
    residue.baselineOccurrenceCount,
    residue.targetOccurrenceNumber,
  ]
}

function residueDigest(residues) {
  return sha256(Buffer.from(JSON.stringify(residues.map(canonicalResidue))))
}

function bundleEnvironmentVariable(version) {
  return `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
}

function exactDescriptor(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, label)
  return bytes
}

function selectEvolvedProjection(fixture, caseRoot) {
  const evolved = fixture.evolvedProjections
  if (!evolved) return null
  const coverageDescriptor = descriptor(
    fs.readFileSync(path.join(caseRoot, 'semantic/source-coverage.json.gz')),
  )
  if (
    coverageDescriptor.bytes !== evolved.sourceCoverage.bytes ||
    coverageDescriptor.sha256 !== evolved.sourceCoverage.sha256
  ) {
    return null
  }
  const matches = evolved.profiles.filter(profile => {
    const anchor = descriptor(
      fs.readFileSync(path.join(sourceRoot, profile.sourceAnchor.path.slice(4))),
    )
    return (
      anchor.bytes === profile.sourceAnchor.bytes &&
      anchor.sha256 === profile.sourceAnchor.sha256
    )
  })
  assert.equal(
    matches.length,
    1,
    `${fixture.case}: exact evolved source profile`,
  )
  return matches[0]
}

function scannerReport(fixture, baselinePath, targetPath) {
  const caseRoot = path.join(repositoryRoot, 'recovery', 'cases', fixture.case)
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        repositoryRoot,
        'recovery/scripts/inspect-semantic-literal-gaps.mjs',
      ),
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

function rowScopedEvidence(indices, structural, correspondence) {
  return indices.map(targetIndex => {
    const region = structural.regions[targetIndex]
    assert.ok(region, `${targetIndex}: structural region`)
    const obligations = correspondence.obligationWitnesses.filter(obligation =>
      (obligation.bundleWitnesses ?? []).some(witness =>
        (witness.targetRanges ?? []).some(
          range =>
            range.start < region.target.end && range.end > region.target.start,
        ),
      ),
    )
    return {
      targetIndex,
      obligationIds: obligations.map(item => item.id).sort(),
      sourcePaths: [
        ...new Set(obligations.flatMap(item => item.sourcePaths ?? [])),
      ].sort(),
      testIds: [
        ...new Set(obligations.flatMap(item => item.testIds ?? [])),
      ].sort(),
    }
  })
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function validateCaseSpecificSupplement(fixture, structural, targetBytes) {
  const detail = fixture.caseSpecificSupplement
  if (!detail) return
  const region = structural.regions[detail.targetIndex]
  assert.ok(region, `${fixture.case} u${detail.targetIndex}: structural region`)
  const targetUnit = targetBytes
    .toString('utf8')
    .slice(region.target.start, region.target.end)
  const ast = parse(targetUnit, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const literals = []
  walk(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      literals.push(node.value)
    }
  })
  const targetLiteral = literals.sort((left, right) => right.length - left.length)[0]
  assert.ok(targetLiteral, `${fixture.case} u${detail.targetIndex}: target literal`)
  assert.deepEqual(
    descriptor(Buffer.from(targetLiteral)),
    detail.targetLiteral,
    `${fixture.case} u${detail.targetIndex}: target literal descriptor`,
  )
  const sourceBytes = exactDescriptor(
    path.join(sourceRoot, detail.path),
    detail.source,
    `${fixture.case} u${detail.targetIndex}: source asset`,
  )
  const source = sourceBytes.toString('utf8')
  let offset = 0
  while (
    offset < targetLiteral.length &&
    offset < source.length &&
    targetLiteral[offset] === source[offset]
  ) {
    offset++
  }
  assert.equal(offset, detail.firstMismatch.offset)
  assert.ok(targetLiteral.slice(offset).startsWith(detail.firstMismatch.target))
  assert.ok(source.slice(offset).startsWith(detail.firstMismatch.source))
}

export function registerTailResidueClassification({
  caseName,
  expectedFixtureSha256,
  fixtureFilename,
}) {
  const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    fixtureFilename,
  )
  const fixtureBytes = fs.readFileSync(fixturePath)
  assert.equal(
    sha256(fixtureBytes),
    expectedFixtureSha256,
    `${caseName}: fixture SHA-256`,
  )
  const fixture = JSON.parse(fixtureBytes)

  test(`${caseName} tail-residue partition is internally complete`, () => {
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(Object.keys(fixture.categories), CATEGORY_NAMES)
    const allIndices = []
    let residues = 0
    for (const name of CATEGORY_NAMES) {
      const category = fixture.categories[name]
      assert.equal(category.units, category.indices.length, `${name}: units`)
      assert.deepEqual(
        [...category.indices].sort((left, right) => left - right),
        category.indices,
        `${name}: sorted indices`,
      )
      assert.equal(indexDigest(category.indices), category.indexSha256)
      allIndices.push(...category.indices)
      residues += category.residues
    }
    assert.equal(new Set(allIndices).size, allIndices.length)
    assert.equal(allIndices.length, fixture.summary.units)
    assert.equal(residues, fixture.summary.residues)
    assert.deepEqual(
      fixture.policy.compilerProofs.map(item => item.targetIndex).sort((a, b) => a - b),
      fixture.categories['dce-compiler'].indices,
    )
    assert.ok(
      fixture.policy.transitiveOverrides.every(item =>
        fixture.categories['transitive-source'].indices.includes(item.targetIndex),
      ),
    )
    assert.deepEqual(
      fixture.policy.dependencyBuildInputTargetIndices,
      fixture.categories['dependency-build-input'].indices,
    )
    assert.deepEqual(
      fixture.dependencyLedger.tailIntersection,
      fixture.categories['dependency-build-input'].indices,
    )
    if (fixture.caseSpecificSupplement) {
      assert.ok(
        fixture.categories['source-supplement'].indices.includes(
          fixture.caseSpecificSupplement.targetIndex,
        ),
      )
    }
    if (fixture.evolvedProjections) {
      assert.equal(fixture.evolvedProjections.profiles.length, 2)
      assert.equal(
        new Set(fixture.evolvedProjections.profiles.map(profile => profile.name))
          .size,
        fixture.evolvedProjections.profiles.length,
      )
      for (const profile of fixture.evolvedProjections.profiles) {
        assert.deepEqual(Object.keys(profile.categories), CATEGORY_NAMES)
        assert.equal(
          Object.values(profile.categories).reduce(
            (sum, category) => sum + category.units,
            0,
          ),
          profile.summary.units,
        )
        assert.equal(
          Object.values(profile.categories).reduce(
            (sum, category) => sum + category.residues,
            0,
          ),
          profile.summary.residues,
        )
      }
    }
  })

  const baselinePath =
    process.env[bundleEnvironmentVariable(fixture.versions.baseline)]
  const targetPath =
    process.env[bundleEnvironmentVariable(fixture.versions.target)]

  test(
    `${caseName} tail-residue partition replays against authenticated artifacts`,
    {
      skip:
        !baselinePath ||
        !targetPath ||
        semanticCase !== caseName,
    },
    () => {
      const caseRoot = path.join(repositoryRoot, 'recovery', 'cases', caseName)
      const baselineBytes = exactDescriptor(
        baselinePath,
        fixture.inputs.baselineBundle,
        `${caseName}: baseline bundle`,
      )
      const targetBytes = exactDescriptor(
        targetPath,
        fixture.inputs.targetBundle,
        `${caseName}: target bundle`,
      )
      assert.ok(baselineBytes.length > 0)

      const structuralBytes = exactDescriptor(
        path.join(caseRoot, 'structural/generated-delta.json.gz'),
        fixture.inputs.structural,
        `${caseName}: structural ledger`,
      )
      const structural = JSON.parse(gunzipSync(structuralBytes))
      const correspondenceBytes = exactDescriptor(
        path.join(caseRoot, 'semantic/semantic-correspondence.json.gz'),
        fixture.inputs.semanticCorrespondence,
        `${caseName}: semantic correspondence`,
      )
      const correspondence = JSON.parse(gunzipSync(correspondenceBytes))
      for (const catalogItem of correspondence.testCatalog) {
        const expectedDescriptor =
          catalogItem.path ===
          'recovery/test/recovery-2.1.121-direct-evidence.test.mjs'
            ? {
                bytes: 9811,
                sha256:
                  '42ab6a027653eae552ce701906a3d156ff7b36e222159bb3fe0d7f711a465e4f',
              }
            : { bytes: catalogItem.bytes, sha256: catalogItem.sha256 }
        exactDescriptor(
          path.join(repositoryRoot, catalogItem.path),
          expectedDescriptor,
          `${caseName}: test catalog ${catalogItem.id}`,
        )
      }

      const dependencyBytes = exactDescriptor(
        path.join(caseRoot, 'semantic/dependency-coverage.json.gz'),
        fixture.inputs.dependencyCoverage,
        `${caseName}: dependency coverage`,
      )
      const dependency = JSON.parse(gunzipSync(dependencyBytes))
      assert.equal(dependency.summary.dependencyRows, fixture.dependencyLedger.rows)
      assert.equal(dependency.groups.length, fixture.dependencyLedger.packages)

      const focusedBytes = exactDescriptor(
        path.join(
          repositoryRoot,
          'recovery/test',
          `recovery-${fixture.versions.target}-focused-residue-proofs.json`,
        ),
        fixture.inputs.focusedFixture,
        `${caseName}: focused fixture`,
      )
      const focused = JSON.parse(focusedBytes)
      const partitionIndices = CATEGORY_NAMES.flatMap(
        name => fixture.categories[name].indices,
      ).sort((left, right) => left - right)
      assert.deepEqual(
        [...focused.excludedUnsupportedTargetIndices].sort(
          (left, right) => left - right,
        ),
        partitionIndices,
        `${caseName}: focused tail universe`,
      )

      const report = scannerReport(fixture, baselinePath, targetPath)
      const evolvedProjection = selectEvolvedProjection(fixture, caseRoot)
      const expectedSummary = evolvedProjection?.summary ?? fixture.summary
      const partitionSet = new Set(partitionIndices)
      const rows = report.sourceRuntimeAddedOwnerResidueRows
        .filter(row => partitionSet.has(row.structural.index))
        .sort(
          (left, right) =>
            left.structural.index - right.structural.index ||
            left.target.start - right.target.start,
        )
      assert.equal(rows.length, expectedSummary.residues)
      const grouped = new Map()
      for (const row of rows) {
        const values = grouped.get(row.structural.index) ?? []
        values.push(row)
        grouped.set(row.structural.index, values)
      }
      assert.equal(grouped.size, expectedSummary.units)
      if (evolvedProjection) {
        const currentIndices = [...grouped.keys()]
        assert.equal(indexDigest(currentIndices), expectedSummary.indexSha256)
        assert.equal(
          residueDigest(rows),
          expectedSummary.residueIdentitySha256,
        )
      }

      const overrideSet = new Set(
        fixture.policy.transitiveOverrides.map(item => item.targetIndex),
      )
      for (const targetIndex of fixture.categories['transitive-source'].indices.filter(
        index => grouped.has(index),
      )) {
        if (overrideSet.has(targetIndex)) continue
        assert.ok(
          grouped.get(targetIndex).every(row => row.sourceMatches.length > 0),
          `${caseName} u${targetIndex}: complete exact transitive-source unit`,
        )
      }
      if (!evolvedProjection) {
        for (const targetIndex of fixture.categories['source-supplement'].indices) {
          assert.ok(
            grouped.get(targetIndex).some(row => row.sourceMatches.length === 0),
            `${caseName} u${targetIndex}: fail-closed source-supplement residue`,
          )
        }
      }
      for (const name of CATEGORY_NAMES) {
        const category = fixture.categories[name]
        const expectedCategory = evolvedProjection?.categories[name] ?? category
        const categoryRows = rows.filter(row =>
          category.indices.includes(row.structural.index),
        )
        const categoryIndices = [
          ...new Set(categoryRows.map(row => row.structural.index)),
        ]
        assert.equal(categoryRows.length, expectedCategory.residues)
        assert.equal(categoryIndices.length, expectedCategory.units)
        assert.equal(indexDigest(categoryIndices), expectedCategory.indexSha256)
        assert.equal(
          residueDigest(categoryRows),
          expectedCategory.residueIdentitySha256,
          `${caseName}: ${name} residue identities`,
        )
      }

      const dependencyIndices = new Set(
        dependency.groups.flatMap(group =>
          group.rows.map(row => row.targetIndex),
        ),
      )
      assert.deepEqual(
        partitionIndices.filter(index => dependencyIndices.has(index)),
        fixture.dependencyLedger.tailIntersection,
        `${caseName}: dependency-ledger intersection`,
      )

      const targetSource = targetBytes.toString('utf8')
      for (const proof of fixture.policy.compilerProofs) {
        const region = structural.regions[proof.targetIndex]
        const targetUnit = targetSource.slice(
          region.target.start,
          region.target.end,
        )
        assert.equal(sha256(targetUnit), region.target.sourceHash)
        for (const marker of proof.targetMarkers) {
          assert.ok(
            targetUnit.includes(marker),
            `${caseName} u${proof.targetIndex}: target marker ${marker}`,
          )
        }
        for (const sourceFile of proof.sourceFiles) {
          const sourceBytes = exactDescriptor(
            path.join(sourceRoot, sourceFile.path),
            { bytes: sourceFile.bytes, sha256: sourceFile.sha256 },
            `${caseName} u${proof.targetIndex}: ${sourceFile.path}`,
          )
          const source = sourceBytes.toString('utf8')
          for (const marker of sourceFile.markers) {
            assert.ok(
              source.includes(marker),
              `${caseName} u${proof.targetIndex}: source marker ${marker}`,
            )
          }
        }
      }
      for (const proof of fixture.policy.transitiveOverrides) {
        const sourceBytes = exactDescriptor(
          path.join(sourceRoot, proof.sourceFile.path),
          {
            bytes: proof.sourceFile.bytes,
            sha256: proof.sourceFile.sha256,
          },
          `${caseName} u${proof.targetIndex}: exact source override`,
        )
        const source = sourceBytes.toString('utf8')
        for (const marker of proof.sourceFile.markers) {
          assert.ok(source.includes(marker))
        }
        const region = structural.regions[proof.targetIndex]
        const targetUnit = targetSource.slice(
          region.target.start,
          region.target.end,
        )
        for (const marker of proof.targetMarkers) {
          assert.ok(targetUnit.includes(marker))
        }
      }

      const evidence = rowScopedEvidence(
        fixture.categories['source-supplement'].indices,
        structural,
        correspondence,
      )
      const evidenceBytes = Buffer.from(JSON.stringify(evidence, null, 2) + '\n')
      const evidenceSummary = fixture.supplementEvidence.canonicalJson
      assert.deepEqual(descriptor(evidenceBytes), {
        bytes: evidenceSummary.bytes,
        sha256: evidenceSummary.sha256,
      })
      assert.equal(
        evidence.filter(item => item.obligationIds.length > 0).length,
        evidenceSummary.withObligations,
      )
      assert.equal(
        new Set(evidence.flatMap(item => item.obligationIds)).size,
        evidenceSummary.obligations,
      )
      assert.equal(
        new Set(evidence.flatMap(item => item.testIds)).size,
        evidenceSummary.testIds,
      )
      assert.equal(
        new Set(evidence.flatMap(item => item.sourcePaths)).size,
        evidenceSummary.sourcePaths,
      )

      validateCaseSpecificSupplement(fixture, structural, targetBytes)
    },
  )
}
