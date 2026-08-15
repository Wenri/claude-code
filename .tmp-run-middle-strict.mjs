import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = process.cwd()
const artifactsRoot = '/tmp/claude-recovery-all-artifacts.9cj1Zk'
const scanner = path.join(
  repositoryRoot,
  'recovery/scripts/inspect-semantic-literal-gaps.mjs',
)
const selectedCase = process.argv[2]
const cases = [
  [
    '2.1.96-to-2.1.97',
    process.env.CLAUDE_CODE_MIDDLE_97_SOURCE_ROOT ??
      '/tmp/middle97-final-generated.MCbXm4/tree/src',
  ],
  ['2.1.97-to-2.1.98', '/tmp/middle98-final-generated.8jWjnB/tree/src'],
  ['2.1.98-to-2.1.100', '/tmp/middle100-generated.frIIGl/src'],
  ['2.1.100-to-2.1.101', '/tmp/middle101-rating-generated.27909.3286494/src'],
  ['2.1.101-to-2.1.104', '/tmp/middle104-generated2.uvyG1u/src'],
  [
    '2.1.104-to-2.1.105',
    process.env.CLAUDE_CODE_MIDDLE_105_SOURCE_ROOT ??
      '/tmp/middle105-final-live.Lot70q/src',
  ],
  ['2.1.105-to-2.1.107', '/tmp/middle107-generated.cEC5BK/src'],
].filter(([caseName]) => !selectedCase || caseName === selectedCase)

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'))
}

function readGzipJson(filename) {
  return JSON.parse(gunzipSync(fs.readFileSync(filename)).toString('utf8'))
}

for (const [caseName, sourceRoot] of cases) {
  const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
  const manifest = readJson(path.join(caseRoot, 'manifest.json'))
  const artifact = id =>
    path.join(
      artifactsRoot,
      manifest.artifacts.find(item => item.id === id).localPath,
    )
  const structural = path.join(
    caseRoot,
    manifest.generatedRecovery.structural.path ??
      manifest.generatedRecovery.structural.ledger,
  )
  const attributionDirectory = manifest.generatedRecovery.attribution.directory
  const partitions = path.join(
    caseRoot,
    manifest.generatedRecovery.attribution.targetPartitions ??
      `${attributionDirectory}/target-partitions.jsonl.gz`,
  )
  const sources = path.join(
    caseRoot,
    manifest.generatedRecovery.attribution.sources ??
      `${attributionDirectory}/sources.jsonl.gz`,
  )
  const coverageFilename = path.join(
    caseRoot,
    'semantic/source-coverage.json.gz',
  )
  const result = spawnSync(
    process.execPath,
    [
      scanner,
      '--baseline', artifact('baselineBundle'),
      '--target', artifact('targetBundle'),
      '--source-root', sourceRoot,
      '--structural', structural,
      '--partitions', partitions,
      '--sources', sources,
      '--coverage', coverageFilename,
    ],
    { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    throw new Error(`${caseName}: scanner failed (${result.status})`)
  }
  const report = JSON.parse(result.stdout)
  const coverage = readGzipJson(coverageFilename)
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const evidence = new Map(coverage.evidence.map(item => [item.id, item]))
  const badUnits = new Set()
  const genericResidueUnits = new Set()
  const genericAddedResidueUnits = new Set()
  const genericAddedResidues = new Map()
  for (const residue of report.sourceRuntimeOwnerResidueRows) {
    const row = rows.get(residue.structural?.index)
    if (!row) {
      badUnits.add(residue.structural?.index ?? null)
      continue
    }
    const items = row.evidenceIds.map(id => evidence.get(id))
    const testPaths = new Set(
      items.filter(item => item?.kind === 'semantic-test').map(item => item.path),
    )
    if (
      testPaths.size === 1 &&
      testPaths.has('recovery/test/middle-semantic-source-coverage.test.mjs') &&
      !items.some(item => item?.kind === 'static-ast')
    ) {
      genericResidueUnits.add(row.targetIndex)
      if (residue.targetAdded) {
        genericAddedResidueUnits.add(row.targetIndex)
        const list = genericAddedResidues.get(row.targetIndex) ?? []
        const rawValue =
          typeof residue.value === 'string'
            ? residue.value
            : JSON.stringify(residue.value)
        list.push({
          kind: residue.literalKind,
          value:
            rawValue.length > 160
              ? `${rawValue.slice(0, 157)}...`
              : rawValue,
          owners: residue.ownerPaths,
        })
        genericAddedResidues.set(row.targetIndex, list)
      }
    }
    const explicit = items.some(
      item =>
        item?.kind === 'static-ast' ||
        (item?.kind === 'target-fragment' && testPaths.has(item.path)),
    )
    if (!explicit) badUnits.add(row.targetIndex)
  }
  const summary = {
    case: caseName,
    targetAddedOccurrences: report.targetAddedOccurrences,
    absentFromSource: report.absentFromSource,
    sourceRuntimeAddedOccurrences: report.sourceRuntimeAddedOccurrences,
    sourceRuntimeAddedOwnerResidues:
      report.sourceRuntimeAddedOwnerResidues,
    sourceRuntimeTargetOccurrences: report.sourceRuntimeTargetOccurrences,
    sourceRuntimeOwnerResidues: report.sourceRuntimeOwnerResidues,
    residueUnits: new Set(
      report.sourceRuntimeOwnerResidueRows.map(row => row.structural?.index),
    ).size,
    unclassifiedAddedOccurrences: report.unclassifiedAddedOccurrences,
    badResidueUnits: [...badUnits].sort((left, right) => left - right),
    genericResidueUnits: [...genericResidueUnits].sort(
      (left, right) => left - right,
    ),
    genericAddedResidueUnits: [...genericAddedResidueUnits].sort(
      (left, right) => left - right,
    ),
    genericAddedResidues: [...genericAddedResidues]
      .sort(([left], [right]) => left - right)
      .map(([unit, residues]) => ({
        unit,
        residues: [
          ...new Map(
            residues.map(item => [`${item.kind}:${item.value}`, item]),
          ).values(),
        ],
      })),
  }
  console.log(JSON.stringify(summary))
  if (summary.unclassifiedAddedOccurrences !== 0 || badUnits.size !== 0) {
    process.exitCode = 1
  }
}
