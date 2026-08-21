#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  TARGET119_LATER_DONOR_RUNTIME_FILES,
  TARGET119_LATER_DONOR_RUNTIME_OWNER_OVERRIDES,
} from './replay-later-donor-runtime-source-gaps.mjs'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')
const intermediateRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.120/src',
)
const donorRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src')
const reportPath = path.join(
  root,
  '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
)
const structuralPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
)
const targetBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
)
const output = path.join(
  root,
  'recovery/test/recovery-2.1.119-later-donor-runtime-source-gaps.json',
)

const TARGET_MARKERS = new Map([
  [
    2565,
    [
      'CODER_WORKSPACE_NAME',
      'DEVPOD_WORKSPACE_UID',
      'DAYTONA_WS_ID',
      'GOOGLE_CLOUD_WORKSTATIONS',
      'gcp-cloud-workstations',
      'C9_PID',
      'aws-cloud9',
    ],
  ],
  [12841, ['forwardSubagentText', 'background_hint']],
  [19046, ['skipSpill']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function canonicalResidue(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ]
}

const targetBundle = fs.readFileSync(targetBundlePath)
const targetText = targetBundle.toString('utf8')
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const regions = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const report = JSON.parse(fs.readFileSync(reportPath))
const reportRows = new Map()
for (const row of report.sourceRuntimeAddedOwnerResidueRows) {
  const values = reportRows.get(row.structural.index) ?? []
  values.push(row)
  reportRows.set(row.structural.index, values)
}

const sourceFiles = TARGET119_LATER_DONOR_RUNTIME_FILES.map(file => {
  const relative = file.path.replace(/^src\//, '')
  const before = fs.readFileSync(path.join(sourceRoot, relative))
  const intermediate = fs.readFileSync(path.join(intermediateRoot, relative))
  const donor = fs.readFileSync(path.join(donorRoot, relative))
  if (
    before.length !== file.before.bytes ||
    sha256(before) !== file.before.sha256
  ) {
    throw new Error(`${file.path}: Target119 source preimage drifted`)
  }
  if (donor.length !== file.after.bytes || sha256(donor) !== file.after.sha256) {
    throw new Error(`${file.path}: Target121 donor postimage drifted`)
  }
  return {
    path: file.path,
    before: file.before,
    intermediate: descriptor(intermediate),
    authenticatedDonor: {
      release: '2.1.121',
      ...file.after,
    },
    after: file.after,
  }
})

const rows = TARGET119_LATER_DONOR_RUNTIME_OWNER_OVERRIDES.map(override => {
  const region = regions.get(override.targetIndex)
  if (!region) throw new Error(`u${override.targetIndex}: structural region absent`)
  const unit = targetText.slice(region.target.start, region.target.end)
  if (sha256(unit) !== region.target.sourceHash) {
    throw new Error(`u${override.targetIndex}: target unit hash mismatch`)
  }
  const markers = TARGET_MARKERS.get(override.targetIndex)
  for (const marker of markers) {
    if (!unit.includes(marker)) {
      throw new Error(`u${override.targetIndex}: target marker ${marker} absent`)
    }
  }
  const residues = reportRows.get(override.targetIndex) ?? []
  if (residues.length !== 1) {
    throw new Error(`u${override.targetIndex}: expected one exact residue`)
  }
  const residue = residues[0]
  const owner = override.paths[0].slice(4)
  if (
    JSON.stringify(residue.ownerPaths) !== JSON.stringify([owner]) ||
    (residue.sourceMatches ?? []).includes(owner)
  ) {
    throw new Error(`u${override.targetIndex}: source-gap owner state drifted`)
  }
  return {
    targetIndex: override.targetIndex,
    ownerPath: override.paths[0],
    behavior: override.behavior,
    evidenceIds: override.evidenceIds,
    target: {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      sourceHash: region.target.sourceHash,
      tokenCount: region.target.tokenCount,
    },
    targetMarkers: markers,
    residues: [
      {
        kind: residue.literalKind,
        value: residue.value,
        start: residue.target.start,
        end: residue.target.end,
        baselineCount: residue.baselineOccurrenceCount,
        targetOrdinal: residue.targetOccurrenceNumber,
      },
    ],
  }
})

const canonicalRows = rows.flatMap(row =>
  row.residues.map(residue => [
    row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ]),
)
const reportCanonicalRows = rows.flatMap(row =>
  (reportRows.get(row.targetIndex) ?? []).map(canonicalResidue),
)
if (JSON.stringify(canonicalRows) !== JSON.stringify(reportCanonicalRows)) {
  throw new Error('Target119 later-donor residue identities drifted')
}

const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  targetVersion: '2.1.119',
  status: 'authenticated-bounded-later-donor-runtime-source-replay',
  criterion:
    'exact-target119-unit-and-residue-with-exact-target121-source-postimage',
  evidenceIds: [
    'target119-later-donor-runtime-source-gap-target-fragment',
    'target119-later-donor-runtime-source-gap-source-replay-test',
  ],
  inputs: {
    targetBundle: descriptor(targetBundle),
    structural: {
      path:
        'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
      ...descriptor(structuralBytes),
    },
    sourceFiles,
  },
  sourceDiffs: [
    {
      path: 'src/utils/env.ts',
      boundedChanges: [
        'Coder, DevPod, Daytona, Google Cloud Workstations, and AWS Cloud9 detection branches',
      ],
    },
    {
      path: 'src/tools/AgentTool/AgentTool.tsx',
      boundedChanges: [
        'prompt model forwarding',
        'background-hint progress event',
        'optional subagent-text progress forwarding',
        'clear progress event',
      ],
    },
    {
      path: 'src/utils/ShellCommand.ts',
      boundedChanges: [
        'skipSpill interface option',
        'skipSpill implementation option',
        'pipe spill guard',
      ],
    },
  ],
  ownerOverrides: TARGET119_LATER_DONOR_RUNTIME_OWNER_OVERRIDES,
  summary: {
    units: rows.length,
    residues: canonicalRows.length,
    sourceFiles: sourceFiles.length,
    targetIndicesSha256: sha256(
      Buffer.from(JSON.stringify(rows.map(row => row.targetIndex))),
    ),
    residueIdentitiesSha256: sha256(
      Buffer.from(JSON.stringify(canonicalRows)),
    ),
  },
  rows,
}

fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
process.stdout.write(`${output} ${JSON.stringify(fixture.summary)}\n`)
