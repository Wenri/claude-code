import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const treeRoot =
  process.argv.slice(2).find(value => !value.startsWith('--')) ??
  path.join(root, '.recovery-tmp', 'semantic-trees')
const artifactRoot =
  process.env.CLAUDE_CODE_AUTHENTICATED_ARTIFACT_ROOT ??
  path.join(root, '.recovery-tmp', 'authenticated-artifacts')
const outputRoot = path.join(root, '.recovery-tmp', 'residue-audits')
fs.mkdirSync(outputRoot, { recursive: true })
const currentSource = process.argv.includes('--current')
const cases = [
  ['2.1.107-to-2.1.108', '2.1.107', '2.1.108'],
  ['2.1.108-to-2.1.109', '2.1.108', '2.1.109'],
  ['2.1.109-to-2.1.110', '2.1.109', '2.1.110'],
  ['2.1.110-to-2.1.111', '2.1.110', '2.1.111'],
  ['2.1.111-to-2.1.112', '2.1.111', '2.1.112'],
  ['2.1.112-to-2.1.113', '2.1.112', '2.1.113'],
  ['2.1.113-to-2.1.114', '2.1.113', '2.1.114'],
  ['2.1.114-to-2.1.116', '2.1.114', '2.1.116'],
  ['2.1.116-to-2.1.117', '2.1.116', '2.1.117'],
  ['2.1.117-to-2.1.118', '2.1.117', '2.1.118'],
  ['2.1.118-to-2.1.119', '2.1.118', '2.1.119'],
  ['2.1.119-to-2.1.120', '2.1.119', '2.1.120'],
  ['2.1.120-to-2.1.121', '2.1.120', '2.1.121'],
]

function bundlePath(version) {
  return Number(version.slice(4)) >= 113
    ? path.join(artifactRoot, `${version}-linux-x64`, 'cli.inner.js')
    : path.join(artifactRoot, version, 'package', 'cli.js')
}

const only = process.argv.find(value => value.startsWith('--case='))?.slice(7)
for (const [caseName, baselineVersion, targetVersion] of cases) {
  if (only && only !== caseName) continue
  const caseRoot = path.join(root, 'recovery/cases', caseName)
  const result = spawnSync(
    process.execPath,
    [
      'recovery/scripts/inspect-semantic-literal-gaps.mjs',
      '--baseline', bundlePath(baselineVersion),
      '--target', bundlePath(targetVersion),
      '--source-root', currentSource ? path.join(root, 'src') : path.join(treeRoot, targetVersion, 'src'),
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
    path.join(outputRoot, `${caseName}.${currentSource ? 'current-' : ''}typed-audit.json`),
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
