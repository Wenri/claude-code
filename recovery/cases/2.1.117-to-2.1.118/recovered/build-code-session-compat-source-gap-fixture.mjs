#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  buildTarget118CodeSessionCompatOutput,
  TARGET118_CODE_SESSION_COMPAT_INPUT_FILE,
  TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE,
  TARGET118_CODE_SESSION_COMPAT_OWNER_OVERRIDES,
} from './replay-code-session-compat-source-gap.mjs'

const root = process.cwd()
const CASE_NAME = '2.1.117-to-2.1.118'
const RAW_SOURCE_COMMIT = 'bd846a24e3886322888f02b9f747c132a4a32314'
const DONOR_SOURCE_COMMIT = '351cd4d13f70a564dc2d90f59ab0093dc6fc7b05'
const SOURCE_PATH = TARGET118_CODE_SESSION_COMPAT_INPUT_FILE.path
const targetBundlePath =
  '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js'
const forwardBundlePath =
  '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js'
const targetLedgerPath =
  'recovery/cases/2.1.117-to-2.1.118/structural/generated-delta.json.gz'
const forwardLedgerPath =
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-code-session-compat-source-gap.json',
)

const EXPECTED_RESIDUES = Object.freeze([
  Object.freeze([10809, 'string', 'updated_at', 6294579, 6294591, 0, 1]),
  Object.freeze([10809, 'property', 'last_event_at', 6294611, 6294624, 0, 1]),
  Object.freeze([
    10809,
    'property',
    'custom_system_prompt',
    6294741,
    6294761,
    0,
    1,
  ]),
  Object.freeze([
    10809,
    'property',
    'append_system_prompt',
    6294767,
    6294787,
    0,
    1,
  ]),
  Object.freeze([10811, 'property', 'last_event_at', 6295780, 6295793, 0, 2]),
  Object.freeze([10813, 'property', 'response_shape', 6296432, 6296446, 0, 1]),
])

const FORWARD_INDICES = new Map([
  [10809, 10935],
  [10811, 10937],
  [10813, 10939],
])

const SECTION_BOUNDS = Object.freeze([
  Object.freeze({
    declaration: 'ccrSessionToResource',
    start: 'export function ccrSessionToResource(',
    end: 'export const CodeSessionSchema = lazySchema',
  }),
  Object.freeze({
    declaration: 'fetchCodeSessionsFromSessionsAPI',
    start: 'export async function fetchCodeSessionsFromSessionsAPI()',
    end: '/**\n * Creates OAuth headers for API requests',
  }),
  Object.freeze({
    declaration: 'fetchSession',
    start: 'export async function fetchSession(',
    end: '/**\n * Extracts the first branch name from a session',
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function describeFile(relativePath) {
  const value = fs.readFileSync(path.join(root, relativePath))
  return { path: relativePath, ...descriptor(value) }
}

function gitSource(commit) {
  return execFileSync('git', ['show', `${commit}:${SOURCE_PATH}`], {
    cwd: root,
  })
}

function sectionDescriptor(input, section) {
  const start = input.indexOf(section.start)
  const secondStart = input.indexOf(section.start, start + 1)
  const end = input.indexOf(section.end, start)
  if (start < 0 || secondStart >= 0 || end < start) {
    throw new Error(`${CASE_NAME}: ${section.declaration} section is not unique`)
  }
  const value = Buffer.from(input.slice(start, end))
  return {
    declaration: section.declaration,
    start,
    end,
    ...descriptor(value),
  }
}

function structuralUnit(region) {
  const unit = region.target
  return {
    index: unit.index,
    nodeType: unit.nodeType,
    start: unit.start,
    end: unit.end,
    bytes: unit.end - unit.start,
    sourceHash: unit.sourceHash,
    coarseHash: unit.coarseHash,
    tokenCount: unit.tokenCount,
  }
}

function main() {
  const rawSource = gitSource(RAW_SOURCE_COMMIT)
  const donorSource = gitSource(DONOR_SOURCE_COMMIT)
  const recoveredSource = Buffer.from(
    buildTarget118CodeSessionCompatOutput(rawSource.toString()),
  )
  if (
    descriptor(rawSource).bytes !== TARGET118_CODE_SESSION_COMPAT_INPUT_FILE.bytes ||
    descriptor(rawSource).sha256 !== TARGET118_CODE_SESSION_COMPAT_INPUT_FILE.sha256
  ) {
    throw new Error(`${CASE_NAME}: raw source input drifted`)
  }
  if (
    descriptor(recoveredSource).bytes !==
      TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE.bytes ||
    descriptor(recoveredSource).sha256 !==
      TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE.sha256
  ) {
    throw new Error(`${CASE_NAME}: recovered source output drifted`)
  }

  const targetBundle = fs.readFileSync(path.join(root, targetBundlePath))
  const forwardBundle = fs.readFileSync(path.join(root, forwardBundlePath))
  const targetBundleText = targetBundle.toString()
  const forwardBundleText = forwardBundle.toString()
  const targetLedgerBytes = fs.readFileSync(path.join(root, targetLedgerPath))
  const forwardLedgerBytes = fs.readFileSync(path.join(root, forwardLedgerPath))
  const targetLedger = JSON.parse(gunzipSync(targetLedgerBytes))
  const forwardLedger = JSON.parse(gunzipSync(forwardLedgerBytes))
  const rowsByIndex = new Map()
  for (const [targetIndex, kind, value, start, end, baselineCount, ordinal] of
    EXPECTED_RESIDUES) {
    const fragment = targetBundleText.slice(start, end)
    if (fragment !== value && fragment !== JSON.stringify(value)) {
      throw new Error(`${CASE_NAME}: u${targetIndex} ${kind}:${value} drifted`)
    }
    const rows = rowsByIndex.get(targetIndex) ?? []
    rows.push([kind, value, start, end, baselineCount, ordinal])
    rowsByIndex.set(targetIndex, rows)
  }

  const targetUnits = TARGET118_CODE_SESSION_COMPAT_OWNER_OVERRIDES.map(
    override => {
      const region = targetLedger.regions.find(
        candidate => candidate.target?.index === override.targetIndex,
      )
      if (!region) throw new Error(`${CASE_NAME}: missing u${override.targetIndex}`)
      const unit = structuralUnit(region)
      if (
        sha256(targetBundleText.slice(unit.start, unit.end)) !== unit.sourceHash
      ) {
        throw new Error(`${CASE_NAME}: u${unit.index} target bytes drifted`)
      }
      return {
        ...unit,
        ownerPath: override.paths[0],
        evidenceIds: [...override.evidenceIds],
        behavior: override.behavior,
        residues: rowsByIndex.get(unit.index),
      }
    },
  )

  const forwardLineage = targetUnits.map(unit => {
    const forwardIndex = FORWARD_INDICES.get(unit.index)
    const region = forwardLedger.regions.find(
      candidate => candidate.target?.index === forwardIndex,
    )
    if (!region) {
      throw new Error(`${CASE_NAME}: missing forward u${forwardIndex}`)
    }
    const forward = structuralUnit(region)
    if (
      sha256(forwardBundleText.slice(forward.start, forward.end)) !==
      forward.sourceHash
    ) {
      throw new Error(`${CASE_NAME}: forward u${forward.index} bytes drifted`)
    }
    return {
      target118Index: unit.index,
      target119: forward,
      structuralPair:
        region.baselineUnitIndex === unit.index
          ? {
              classification: region.classification,
              baselineUnitIndex: region.baselineUnitIndex,
              pairReason: region.pairReason,
            }
          : null,
    }
  })

  const residueIdentities = targetUnits.flatMap(unit =>
    unit.residues.map(row => [unit.index, ...row]),
  )
  const fixture = {
    schemaVersion: 1,
    case: CASE_NAME,
    summary: {
      units: targetUnits.length,
      residues: residueIdentities.length,
      indicesSha256: sha256(
        JSON.stringify(targetUnits.map(unit => unit.index)),
      ),
      residueIdentitiesSha256: sha256(JSON.stringify(residueIdentities)),
    },
    inputs: {
      targetBundle: describeFile(targetBundlePath),
      targetStructuralLedger: describeFile(targetLedgerPath),
      forwardBundle: describeFile(forwardBundlePath),
      forwardStructuralLedger: describeFile(forwardLedgerPath),
      rawSource: {
        commit: RAW_SOURCE_COMMIT,
        path: SOURCE_PATH,
        ...descriptor(rawSource),
      },
      donorSource: {
        commit: DONOR_SOURCE_COMMIT,
        path: SOURCE_PATH,
        ...descriptor(donorSource),
      },
      recoveredSource: {
        path: SOURCE_PATH,
        ...descriptor(recoveredSource),
      },
    },
    targetUnits,
    forwardLineage,
    sourceSections: SECTION_BOUNDS.map(section => ({
      recovered: sectionDescriptor(recoveredSource.toString(), section),
      donor: sectionDescriptor(donorSource.toString(), section),
    })),
    evidenceIds: [...TARGET118_CODE_SESSION_COMPAT_OWNER_OVERRIDES[0].evidenceIds],
    sourceContract: {
      sourcePath: SOURCE_PATH,
      declarations: SECTION_BOUNDS.map(section => section.declaration),
      endpoint: '/v1/code/sessions',
      legacyEndpoint: '/v1/sessions',
      responseAlternatives: ['response_shape', 'session'],
      defaultStatus: 'idle',
      archivedStatus: 'archived',
      defaultTitle: 'Untitled',
    },
  }
  const serialized = `${JSON.stringify(fixture, null, 2)}\n`
  if (process.argv.includes('--stdout')) {
    process.stdout.write(serialized)
  } else {
    fs.writeFileSync(fixturePath, serialized)
    console.log(fixturePath)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
