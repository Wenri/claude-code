#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  buildTarget118SkillAuthorBylineOutput,
  TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE,
  TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE,
  TARGET118_SKILL_AUTHOR_BYLINE_OWNER_OVERRIDES,
} from './replay-skill-author-byline-source-gap.mjs'

const root = process.cwd()
const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_COMMIT = 'bd846a24e3886322888f02b9f747c132a4a32314'
const TARGET_INDEX = 12691
const BASELINE_INDEX = 12597
const FORWARD_INDEX = 12856
const targetBundlePath =
  '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js'
const baselineBundlePath =
  '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js'
const forwardBundlePath =
  '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js'
const targetLedgerPath =
  'recovery/cases/2.1.117-to-2.1.118/structural/generated-delta.json.gz'
const forwardLedgerPath =
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-skill-author-byline-source-gap.json',
)
const helperSourcePath = 'src/utils/teamArtifacts.ts'
const targetResidue = Object.freeze([
  'string',
  ' · by ',
  7920854,
  7920863,
  0,
  1,
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

function gitSource(sourcePath) {
  return execFileSync('git', ['show', `${SOURCE_COMMIT}:${sourcePath}`], {
    cwd: root,
  })
}

function describeSection(input, startMarker, endMarker, declaration) {
  const start = input.indexOf(startMarker)
  const second = input.indexOf(startMarker, start + 1)
  const end = input.indexOf(endMarker, start)
  if (start < 0 || second >= 0 || end < start) {
    throw new Error(`${CASE_NAME}: ${declaration} section is not unique`)
  }
  const value = input.slice(start, end)
  return { declaration, start, end, ...descriptor(Buffer.from(value)) }
}

function structuralUnit(unit) {
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
  const rawSource = gitSource(TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE.path)
  const recoveredSource = Buffer.from(
    buildTarget118SkillAuthorBylineOutput(rawSource.toString()),
  )
  const helperSource = gitSource(helperSourcePath)
  if (
    JSON.stringify(descriptor(rawSource)) !==
    JSON.stringify({
      bytes: TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE.bytes,
      sha256: TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE.sha256,
    })
  ) {
    throw new Error(`${CASE_NAME}: SkillTool UI input drifted`)
  }
  if (
    JSON.stringify(descriptor(recoveredSource)) !==
    JSON.stringify({
      bytes: TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE.bytes,
      sha256: TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE.sha256,
    })
  ) {
    throw new Error(`${CASE_NAME}: SkillTool UI postimage drifted`)
  }

  const baselineBundle = fs.readFileSync(path.join(root, baselineBundlePath))
  const targetBundle = fs.readFileSync(path.join(root, targetBundlePath))
  const forwardBundle = fs.readFileSync(path.join(root, forwardBundlePath))
  const baselineText = baselineBundle.toString()
  const targetText = targetBundle.toString()
  const forwardText = forwardBundle.toString()
  const targetLedgerBytes = fs.readFileSync(path.join(root, targetLedgerPath))
  const forwardLedgerBytes = fs.readFileSync(path.join(root, forwardLedgerPath))
  const targetLedger = JSON.parse(gunzipSync(targetLedgerBytes))
  const forwardLedger = JSON.parse(gunzipSync(forwardLedgerBytes))
  const baseline = targetLedger.unmatchedBaseline.find(
    unit => unit.index === BASELINE_INDEX,
  )
  const targetRegion = targetLedger.regions.find(
    region => region.target?.index === TARGET_INDEX,
  )
  const forwardRegion = forwardLedger.regions.find(
    region => region.target?.index === FORWARD_INDEX,
  )
  if (!baseline || !targetRegion || !forwardRegion) {
    throw new Error(`${CASE_NAME}: SkillTool structural lineage is incomplete`)
  }
  const units = [
    { version: '2.1.117', ...structuralUnit(baseline) },
    { version: '2.1.118', ...structuralUnit(targetRegion.target) },
    { version: '2.1.119', ...structuralUnit(forwardRegion.target) },
  ]
  for (const [index, input] of [baselineText, targetText, forwardText].entries()) {
    const unit = units[index]
    if (sha256(input.slice(unit.start, unit.end)) !== unit.sourceHash) {
      throw new Error(`${unit.version}: SkillTool unit bytes drifted`)
    }
  }
  if (
    forwardRegion.classification !== 'matched' ||
    forwardRegion.baselineUnitIndex !== TARGET_INDEX ||
    forwardRegion.pairReason !== 'exact-scope-normalized-token-hash'
  ) {
    throw new Error(`${CASE_NAME}: SkillTool forward lineage drifted`)
  }
  const [kind, cooked, start, end] = targetResidue
  const rawResidue = targetText.slice(start, end)
  if (kind !== 'string' || rawResidue !== ' \\xB7 by ') {
    throw new Error(`${CASE_NAME}: SkillTool author-byline residue drifted`)
  }

  const ownerOverride = TARGET118_SKILL_AUTHOR_BYLINE_OWNER_OVERRIDES[0]
  const residueIdentity = [TARGET_INDEX, ...targetResidue]
  const fixture = {
    schemaVersion: 1,
    case: CASE_NAME,
    status: 'case-owned-replay-ready',
    summary: {
      units: 1,
      residues: 1,
      indicesSha256: sha256(JSON.stringify([TARGET_INDEX])),
      residueIdentitiesSha256: sha256(JSON.stringify([residueIdentity])),
    },
    inputs: {
      baselineBundle: describeFile(baselineBundlePath),
      targetBundle: describeFile(targetBundlePath),
      forwardBundle: describeFile(forwardBundlePath),
      targetStructuralLedger: describeFile(targetLedgerPath),
      forwardStructuralLedger: describeFile(forwardLedgerPath),
      rawSource: {
        commit: SOURCE_COMMIT,
        path: TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE.path,
        ...descriptor(rawSource),
      },
      recoveredSource: {
        path: TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE.path,
        ...descriptor(recoveredSource),
      },
      helperSource: {
        commit: SOURCE_COMMIT,
        path: helperSourcePath,
        ...descriptor(helperSource),
      },
    },
    temporalUnits: units,
    forwardPair: {
      classification: forwardRegion.classification,
      baselineUnitIndex: forwardRegion.baselineUnitIndex,
      targetIndex: forwardRegion.target.index,
      pairReason: forwardRegion.pairReason,
    },
    row: {
      targetIndex: TARGET_INDEX,
      ownerPath: ownerOverride.paths[0],
      evidenceIds: [...ownerOverride.evidenceIds],
      behavior: ownerOverride.behavior,
      residue: targetResidue,
      rawResidue,
    },
    sourceSections: {
      before: describeSection(
        rawSource.toString(),
        'export function renderToolUseMessage(',
        'export function renderToolUseProgressMessage',
        'renderToolUseMessage',
      ),
      after: describeSection(
        recoveredSource.toString(),
        'export function renderToolUseMessage(',
        'export function renderToolUseProgressMessage',
        'renderToolUseMessage',
      ),
      authorHelper: describeSection(
        helperSource.toString(),
        'export function getTeamArtifactAuthor(',
        'export async function getUnseenTeamArtifacts',
        'getTeamArtifactAuthor',
      ),
    },
    sourceContract: {
      declaration: 'renderToolUseMessage',
      helperDeclaration: 'getTeamArtifactAuthor',
      teamFeature: 'tengu_tussock_oriole',
      teamSource: 'projectSettings',
      legacyLoadedFrom: 'commands_DEPRECATED',
      byline: ' · by ',
    },
  }
  const serialized = `${JSON.stringify(fixture, null, 2)}\n`
  if (process.argv.includes('--stdout')) process.stdout.write(serialized)
  else {
    fs.writeFileSync(fixturePath, serialized)
    console.log(fixturePath)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
