import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

const root = process.cwd()
const cases = [
  '2.1.96-to-2.1.97',
  '2.1.97-to-2.1.98',
  '2.1.98-to-2.1.100',
  '2.1.100-to-2.1.101',
  '2.1.101-to-2.1.104',
  '2.1.104-to-2.1.105',
  '2.1.105-to-2.1.107',
]
const selectedCase = process.argv
  .find(argument => argument.startsWith('--case='))
  ?.slice('--case='.length)

function packageFromReason(reason) {
  const match = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(reason)
  return match?.[1] ?? 'unresolved-bundled-dependency'
}

for (const caseName of cases) {
  if (selectedCase && selectedCase !== caseName) continue
  const caseRoot = path.join(root, 'recovery/cases', caseName)
  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join(caseRoot, 'semantic/source-coverage.json.gz')),
    ),
  )
  const grouped = new Map()
  for (const row of coverage.rows.filter(
    candidate => candidate.disposition === 'dependency-runtime',
  )) {
    const packageName = packageFromReason(row.reason)
    const rows = grouped.get(packageName) ?? []
    rows.push({
      targetIndex: row.targetIndex,
      sourceHash: row.sourceHash,
      structuralClass: row.structuralClass,
      classification: 'material-or-unresolved-delta-unpinned',
    })
    grouped.set(packageName, rows)
  }
  const groups = [...grouped]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([packageName, rows]) => ({
      package: packageName,
      summary: {
        dependencyRows: rows.length,
        identifierOrMetadataEquivalent: 0,
        materialOrUnresolvedDelta: rows.length,
        sourceBuildInputPinned: false,
      },
      artifactRecovery: {
        exactTargetBundlePinned: true,
        sourceArchivePinned: false,
        dependencyGraphPinned: false,
        buildRecipePinned: false,
      },
      gap:
        'The authenticated target bundle preserves the compiled dependency bytes, but the target commit contains no root application package manifest/lockfile, dependency source archive, or hermetic build recipe. The dependency semantics therefore cannot be regenerated from pinned src/build inputs.',
      rows,
    }))
  const dependencyRows = groups.reduce(
    (total, group) => total + group.rows.length,
    0,
  )
  const dependency = {
    schemaVersion: 1,
    case: caseName,
    targetVersion: coverage.targetVersion,
    targetCommit: coverage.targetCommit,
    criterion: 'whole-bundle-dependency-build-input-v1',
    summary: {
      dependencyRows,
      identifierOrMetadataEquivalent: 0,
      materialOrUnresolvedDelta: dependencyRows,
      pinnedSourceBuildInputs: 0,
      dependencyRuntimeGaps: dependencyRows,
      exactTargetBundleArtifactRecoverable: true,
      wholeBundleSemanticEquivalentFromSrc: false,
    },
    buildInputAudit: {
      applicationManifestOrLockfileInTargetCommit: false,
      dependencySourceArchivePinned: false,
      dependencyBuildRecipePinned: false,
      conclusion:
        'First-party semantic coverage is audited separately. Whole-bundle source reproduction remains incomplete because dependency/build inputs are not pinned, even when an adjacent bundle has no changed dependency rows.',
    },
    groups,
  }
  const target = path.join(caseRoot, 'semantic/dependency-coverage.json.gz')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    target,
    gzipSync(`${JSON.stringify(dependency)}\n`, { level: 9, mtime: 0 }),
  )
  console.log(`${caseName}: ${dependencyRows} unresolved dependency rows`)
}
