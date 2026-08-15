import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const treeRoot = process.argv[2] ?? '/tmp/late-semantic-trees.q8KB7T'
const currentSource = process.argv.includes('--current')
const cases = [
  ['2.1.107-to-2.1.108', '2.1.107.cli.js', '2.1.108.cli.js'],
  ['2.1.108-to-2.1.109', '2.1.108.cli.js', '2.1.109.cli.js'],
  ['2.1.109-to-2.1.110', '2.1.109.cli.js', '2.1.110.cli.js'],
  ['2.1.110-to-2.1.111', '2.1.110.cli.js', '2.1.111.cli.js'],
  ['2.1.111-to-2.1.112', '2.1.111.cli.js', '2.1.112.cli.js'],
  ['2.1.112-to-2.1.113', '2.1.112.cli.js', '2.1.113.inner.js'],
  ['2.1.113-to-2.1.114', '2.1.113.inner.js', '2.1.114.inner.js'],
  ['2.1.114-to-2.1.116', '2.1.114.inner.js', '2.1.116.inner.js'],
]

const only = process.argv.find(value => value.startsWith('--case='))?.slice(7)
for (const [caseName, baseline, target] of cases) {
  if (only && only !== caseName) continue
  const caseRoot = path.join(root, 'recovery/cases', caseName)
  const result = spawnSync(
    process.execPath,
    [
      'recovery/scripts/inspect-semantic-literal-gaps.mjs',
      '--baseline', path.join('/tmp/recovery-semantic-late-b', baseline),
      '--target', path.join('/tmp/recovery-semantic-late-b', target),
      '--source-root', currentSource ? path.join(root, 'src') : path.join(treeRoot, caseName, 'src'),
      '--structural', path.join(caseRoot, 'structural/generated-delta.json.gz'),
      '--partitions', path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
      '--sources', path.join(caseRoot, 'attribution/sources.jsonl.gz'),
      '--coverage', path.join(caseRoot, 'semantic/source-coverage.json.gz'),
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 },
  )
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  fs.writeFileSync(
    path.join('/tmp/recovery-semantic-late-b', `${caseName}.${currentSource ? 'current-' : ''}typed-audit.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  const unique = values => new Set((values ?? []).map(row => row.structural?.index)).size
  process.stdout.write(`${JSON.stringify({
    caseName,
    targetAddedOccurrences: report.targetAddedOccurrences,
    absentFromSource: report.absentFromSource,
    sourceRuntimeAddedOccurrences: report.sourceRuntimeAddedOccurrences,
    sourceRuntimeAddedOwnerResidues: report.sourceRuntimeAddedOwnerResidues,
    sourceRuntimeAddedOwnerResidueUnits: unique(
      report.rows?.filter(
        row =>
          row.disposition === 'source-runtime-covered' &&
          row.ownerSourceMatches?.length === 0,
      ),
    ),
    sourceRuntimeTargetOccurrences: report.sourceRuntimeTargetOccurrences,
    sourceRuntimeOwnerResidues: report.sourceRuntimeOwnerResidues,
    sourceRuntimeOwnerResidueUnits: unique(report.sourceRuntimeOwnerResidueRows),
  })}\n`)
}
