import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const root = process.cwd()
const treeRoot = process.argv[2]
if (!treeRoot) throw new Error('usage: .tmp-audit-middle-residues.mjs TREE_ROOT [--rows]')

const cases = [
  ['2.1.96-to-2.1.97', '2.1.96', '2.1.97'],
  ['2.1.97-to-2.1.98', '2.1.97', '2.1.98'],
  ['2.1.98-to-2.1.100', '2.1.98', '2.1.100'],
  ['2.1.100-to-2.1.101', '2.1.100', '2.1.101'],
  ['2.1.101-to-2.1.104', '2.1.101', '2.1.104'],
  ['2.1.104-to-2.1.105', '2.1.104', '2.1.105'],
  ['2.1.105-to-2.1.107', '2.1.105', '2.1.107'],
]

for (const [caseName, baseline, target] of cases) {
  const only = process.argv.find(argument => argument.startsWith('--case='))?.slice(7)
  if (only && caseName !== only) continue
  const caseRoot = path.join(root, 'recovery/cases', caseName)
  const result = spawnSync(
    process.execPath,
    [
      'recovery/scripts/inspect-semantic-literal-gaps.mjs',
      '--baseline', `/tmp/claude-middle-audit.DB5eTC/${baseline}/package/cli.js`,
      '--target', `/tmp/claude-middle-audit.DB5eTC/${target}/package/cli.js`,
      '--source-root', path.join(treeRoot, caseName, 'src'),
      '--structural', path.join(caseRoot, 'structural/generated-delta.json.gz'),
      '--partitions', path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
      '--sources', path.join(caseRoot, 'attribution/sources.jsonl.gz'),
      '--coverage', path.join(caseRoot, 'semantic/source-coverage.json.gz'),
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  )
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  const audit = JSON.parse(result.stdout)
  const ledger = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join(caseRoot, 'semantic/source-coverage.json.gz')),
    ),
  )
  const rowByIndex = new Map(ledger.rows.map(row => [row.targetIndex, row]))
  const classified = audit.rows.map(residue => {
    const coverage = rowByIndex.get(residue.structural?.index)
    return {
      ...residue,
      disposition: coverage?.disposition ?? 'matched-or-unpartitioned',
      ownerIds: coverage?.ownerIds ?? [],
      ownerPaths: (coverage?.ownerIds ?? []).map(
        id => ledger.owners.find(owner => owner.id === id)?.path,
      ),
    }
  })
  const byDisposition = Object.fromEntries(
    [...new Set(classified.map(row => row.disposition))]
      .sort()
      .map(disposition => [
        disposition,
        classified.filter(row => row.disposition === disposition).length,
      ]),
  )
  const review = classified.filter(row =>
    ['source-runtime-covered', 'matched-or-unpartitioned'].includes(
      row.disposition,
    ),
  )
  console.log(
    JSON.stringify(
      {
        caseName,
        absentFromSource: audit.absentFromSource,
        absentFromSourceByKind: audit.absentFromSourceByKind,
        sourceRuntimeAddedOccurrences: audit.sourceRuntimeAddedOccurrences,
        sourceRuntimeAddedOwnerResidues:
          audit.sourceRuntimeAddedOwnerResidues,
        sourceRuntimeTargetOccurrences: audit.sourceRuntimeTargetOccurrences,
        sourceRuntimeOwnerResidues: audit.sourceRuntimeOwnerResidues,
        sourceRuntimeOwnerResiduesByKind:
          audit.sourceRuntimeOwnerResiduesByKind,
        byDisposition,
        reviewCount: review.length,
        ...(process.argv.includes('--rows') ? { review } : {}),
      },
      null,
      2,
    ),
  )
}
