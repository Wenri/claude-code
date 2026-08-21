#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const caseRoot = path.join(root, 'recovery', 'cases', caseName)
const sourceRoot = path.join(root, '.recovery-tmp', 'semantic-trees', '2.1.119', 'src')
const reportPath = path.join(
  root,
  '.recovery-tmp',
  'residue-audits',
  `${caseName}.typed-audit.json`,
)
const coveragePath = path.join(caseRoot, 'semantic', 'source-coverage.json.gz')
const structuralPath = path.join(caseRoot, 'structural', 'generated-delta.json.gz')
const targetBundlePath = path.join(
  root,
  '.recovery-tmp',
  'authenticated-artifacts',
  '2.1.119-linux-x64',
  'cli.inner.js',
)
const semanticTestPath = path.join(
  root,
  'recovery',
  'test',
  'recovery-2.1.119-daemon-fleet-query.test.mjs',
)
const outputPath = path.join(
  root,
  'recovery',
  'test',
  'recovery-2.1.119-daemon-cluster-residue-proofs.json',
)

const groups = [
  {
    id: 'classifier-and-rendezvous',
    start: 13919,
    end: 13988,
    ownerPaths: [
      'src/jobs/classifier.ts',
      'src/daemon/jobs.ts',
      'src/daemon/rendezvous.ts',
      'src/query/stopHooks.ts',
      'src/services/api/claude.ts',
      'src/utils/taskSummary.ts',
    ],
  },
  {
    id: 'daemon-bootstrap',
    start: 16089,
    end: 16165,
    ownerPaths: [
      'src/daemon/auth.ts',
      'src/daemon/client.ts',
      'src/daemon/config.ts',
      'src/daemon/framing.ts',
      'src/daemon/lock.ts',
      'src/daemon/main.ts',
      'src/daemon/paths.ts',
      'src/daemon/protocol.ts',
      'src/daemon/ptyClient.ts',
      'src/daemon/ptyHost.ts',
      'src/daemon/service.ts',
      'src/daemon/status.ts',
      'src/daemon/workerRegistry.ts',
    ],
  },
  {
    id: 'daemon-hub-and-config',
    start: 18186,
    end: 18525,
    ownerPaths: [
      'src/daemon/auth.ts',
      'src/daemon/config.ts',
      'src/daemon/hub.tsx',
      'src/daemon/jobs.ts',
      'src/daemon/main.ts',
      'src/daemon/service.ts',
      'src/daemon/status.ts',
      'src/daemon/workerRegistry.ts',
      'src/utils/concurrentSessions.ts',
      'src/utils/udsClient.ts',
    ],
  },
  {
    id: 'background-cli',
    start: 18620,
    end: 18727,
    ownerPaths: [
      'src/cli/bg.ts',
      'src/cli/handlers/templateJobs.ts',
      'src/commands/exit/exit.tsx',
      'src/daemon/client.ts',
      'src/daemon/jobs.ts',
      'src/daemon/main.ts',
      'src/jobs/classifier.ts',
    ],
  },
  {
    id: 'daemon-supervisor-and-fleet',
    start: 19361,
    end: 19555,
    ownerPaths: [
      'src/cli/transports/ccrClient.ts',
      'src/components/FleetView.tsx',
      'src/daemon/client.ts',
      'src/daemon/jobs.ts',
      'src/daemon/ptyHost.ts',
      'src/daemon/rendezvous.ts',
      'src/daemon/supervisor.ts',
      'src/hooks/useAwaySummary.ts',
      'src/hooks/useJobStateNameSync.ts',
      'src/services/awaySummary.ts',
      'src/utils/agentsFleet.ts',
      'src/utils/concurrentSessions.ts',
      'src/utils/udsClient.ts',
    ],
  },
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(filename) {
  const value = fs.readFileSync(filename)
  return { bytes: value.length, sha256: sha256(value) }
}

function residueIdentity(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.targetOccurrenceNumber,
  ]
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
const structural = JSON.parse(gunzipSync(fs.readFileSync(structuralPath)))
const targetBundle = fs.readFileSync(targetBundlePath)
const coverageRows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
const evidenceById = new Map(coverage.evidence.map(row => [row.id, row]))
const structuralByIndex = new Map(
  structural.regions.map(row => [row.target.index, row]),
)

const unsupported = report.sourceRuntimeAddedOwnerResidueRows.filter(row => {
  if (!row.targetAdded) return false
  const coverageRow = coverageRows.get(row.structural.index)
  const evidence = (coverageRow?.evidenceIds ?? [])
    .map(id => evidenceById.get(id))
    .filter(Boolean)
  const semanticPaths = new Set(
    evidence
      .filter(item => item.kind === 'semantic-test')
      .map(item => item.path),
  )
  return !evidence.some(
    item =>
      item.kind === 'static-ast' ||
      (item.kind === 'target-fragment' && semanticPaths.has(item.path)),
  )
})

const selected = unsupported.filter(row =>
  groups.some(
    group =>
      row.structural.index >= group.start &&
      row.structural.index <= group.end,
  ),
)
const byIndex = new Map()
for (const row of selected) {
  const rows = byIndex.get(row.structural.index) ?? []
  rows.push(row)
  byIndex.set(row.structural.index, rows)
}

if (byIndex.size !== 191 || selected.length !== 3143) {
  throw new Error(
    `Target119 daemon cluster drift: expected 191 units/3143 residues, got ${byIndex.size}/${selected.length}`,
  )
}

const evidenceIds = [
  'target119-daemon-cluster-target-fragment',
  'target119-daemon-cluster-source-ast-test',
  'target119-daemon-fleet-query-runtime-test',
]

const rows = [...byIndex]
  .sort(([left], [right]) => left - right)
  .map(([targetIndex, residues]) => {
    const group = groups.find(
      item => targetIndex >= item.start && targetIndex <= item.end,
    )
    const region = structuralByIndex.get(targetIndex)
    if (!region) throw new Error(`Missing structural unit ${targetIndex}`)
    const target = region.target
    const slice = targetBundle.subarray(target.start, target.end)
    if (sha256(slice) !== target.sourceHash) {
      throw new Error(`Target119 unit ${targetIndex} bundle slice drift`)
    }
    return {
      targetIndex,
      group: group.id,
      ownerPaths: group.ownerPaths,
      target: {
        classification: region.classification,
        nodeType: target.nodeType,
        start: target.start,
        end: target.end,
        bytes: slice.length,
        sourceHash: target.sourceHash,
      },
      residues: residues.map(residueIdentity),
      evidenceIds,
      behavior: `The authenticated Target119 ${group.id} compiled interval is represented by the recovered multi-file daemon/background runtime cluster and its executable daemon/fleet/query evidence.`,
    }
  })

const sourcePaths = [...new Set(groups.flatMap(group => group.ownerPaths))].sort()
const sourceFiles = sourcePaths.map(sourcePath => ({
  path: sourcePath,
  ...descriptor(path.join(sourceRoot, sourcePath.slice(4))),
}))

const fixture = {
  schemaVersion: 1,
  case: caseName,
  criterion: 'target119-daemon-background-cluster-complete-unit-proof-v1',
  status: 'generator-ready',
  inputs: {
    targetBundle: {
      artifact: '2.1.119-linux-x64/cli.inner.js',
      ...descriptor(targetBundlePath),
    },
    structuralLedger: {
      path: path.relative(root, structuralPath),
      ...descriptor(structuralPath),
    },
    semanticRuntimeTest: {
      path: path.relative(root, semanticTestPath),
      ...descriptor(semanticTestPath),
    },
    sourceTree: {
      targetCommit: '351cd4d13f70a564dc2d90f59ab0093dc6fc7b05',
      files: sourceFiles,
    },
  },
  evidenceIds,
  summary: {
    groups: groups.length,
    units: rows.length,
    residues: selected.length,
    sourceFiles: sourceFiles.length,
    targetIndicesSha256: sha256(
      JSON.stringify(rows.map(row => row.targetIndex)),
    ),
    residueIdentitiesSha256: sha256(
      JSON.stringify(rows.flatMap(row => row.residues)),
    ),
  },
  groups: groups.map(group => ({
    ...group,
    units: rows.filter(row => row.group === group.id).length,
    residues: rows
      .filter(row => row.group === group.id)
      .reduce((sum, row) => sum + row.residues.length, 0),
  })),
  rows,
}

fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`)
process.stdout.write(
  `${path.relative(root, outputPath)} ${descriptor(outputPath).bytes} ${descriptor(outputPath).sha256}\n`,
)
