#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.118-to-2.1.119'
const SETUP_PATH = 'src/setup.ts'
const RENDEZVOUS_PATH = 'src/daemon/rendezvous.ts'

export const TARGET119_SETUP_RENDEZVOUS_EVIDENCE_IDS = Object.freeze([
  'target119-setup-rendezvous-authenticated-whole-unit-delta-proof',
  'target119-setup-rendezvous-manual-predecessor-proof',
  'target119-setup-rendezvous-export-implementation-graph-proof',
  'target119-setup-rendezvous-source-gap-replay-test',
  'target119-setup-rendezvous-daemon-gate-semantic-test',
  'target119-setup-rendezvous-static-owner-union-proof',
])

export const TARGET119_SETUP_RENDEZVOUS_DEPENDENCY_TARGET_INDICES =
  Object.freeze([13936, 13937, 13942])

export const TARGET119_SETUP_RENDEZVOUS_PROOF_SPEC = Object.freeze({
  targetIndex: 21685,
  baselineUnitIndex: 20779,
  structuralClassification: 'unresolved',
  coverageDisposition: 'source-runtime-covered',
  existingOwnerIds: Object.freeze(['owner-src-setup-ts']),
  correctedOwnerIds: Object.freeze([
    'owner-src-daemon-rendezvous-ts',
    'owner-src-setup-ts',
  ]),
  sourceCallSitePresentBeforeReplay: false,
  sourceReplayRequired: true,
  strictResidue: Object.freeze({
    kind: 'property',
    value: 'startRendezvousServer',
    start: 13464689,
    end: 13464710,
    baselineCount: 0,
    targetOrdinal: 2,
    targetAdded: true,
  }),
})

export const TARGET119_SETUP_RENDEZVOUS_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:21685`,
    targetIndex: 21685,
    paths: Object.freeze([SETUP_PATH, RENDEZVOUS_PATH]),
    declarations: Object.freeze(['setup', 'startRendezvousServer']),
    dependencyTargetIndices:
      TARGET119_SETUP_RENDEZVOUS_DEPENDENCY_TARGET_INDICES,
    evidenceIds: TARGET119_SETUP_RENDEZVOUS_EVIDENCE_IDS,
    behavior:
      'Target119 u21685 adds exactly one daemon-only gate to the otherwise identifier-canonical Target118 u20779 setup function. The gate dynamically initializes the Target119 rendezvous export module (u13936/u13942), resolves startRendezvousServer to its complete implementation u13937, and calls it only when CLAUDE_BG_BACKEND equals daemon. The exact supplied Target119 setup.ts omits this authenticated call site even though src/daemon/rendezvous.ts contains the complete declaration, so the owner proof is the setup.ts plus daemon/rendezvous.ts union and the minimal source replay restores only that missing gate.',
  }),
])

export const TARGET119_SETUP_RENDEZVOUS_SOURCE_VARIANTS = Object.freeze([
  Object.freeze({
    state: 'target-release-source',
    input: Object.freeze({
      path: SETUP_PATH,
      bytes: 20646,
      sha256:
        '43a7f88331f6136e5bb096c63a33ce99bbbdb5108696a97f017d3c1eb8ef1e35',
    }),
    output: Object.freeze({
      path: SETUP_PATH,
      bytes: 20808,
      sha256:
        'ab632bbf567fb24436d7448980c51bd8caeb577ab9d13dc24ed50661933c5348',
    }),
  }),
  Object.freeze({
    state: 'current-cumulative-source',
    input: Object.freeze({
      path: SETUP_PATH,
      bytes: 21164,
      sha256:
        '4a2233a4ca9cf1fc3ef7849d7b00c5aa20eee456458872470f217764017c6f78',
    }),
    output: Object.freeze({
      path: SETUP_PATH,
      bytes: 21326,
      sha256:
        'a17849a09e2ca1c5ced1484600b6c8377f7eff33f1f6864b083318281a9c6515',
    }),
  }),
])

const SETUP_GATE_ANCHOR = `  }

  // Teammate snapshot — SIMPLE-only gate (no escape hatch, swarm not used in bare)`

const SETUP_GATE_RECOVERY = `  }

  if (process.env.CLAUDE_BG_BACKEND === 'daemon') {
    const { startRendezvousServer } = await import('./daemon/rendezvous.js')
    startRendezvousServer()
  }

  // Teammate snapshot — SIMPLE-only gate (no escape hatch, swarm not used in bare)`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function matches(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: ${label} replay anchor differs`)
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

function realFileBytes(filename, label) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${CASE_NAME}: ${label} must be a real file`)
  }
  return fs.readFileSync(filename)
}

export function buildTarget119SetupRendezvousOutput(source) {
  return replaceExactly(
    source,
    SETUP_GATE_ANCHOR,
    SETUP_GATE_RECOVERY,
    'setup rendezvous gate',
  )
}

export function applyTarget119SetupRendezvousSourceRecovery({ sourceRoot }) {
  const filename = path.join(sourceRoot, SETUP_PATH.replace(/^src\//, ''))
  const current = realFileBytes(filename, SETUP_PATH)
  const state = descriptor(current)

  for (const variant of TARGET119_SETUP_RENDEZVOUS_SOURCE_VARIANTS) {
    if (matches(state, variant.output)) {
      return { status: 'already-recovered', files: [], variant: variant.state }
    }
    if (!matches(state, variant.input)) continue

    const output = Buffer.from(
      buildTarget119SetupRendezvousOutput(current.toString('utf8')),
    )
    if (!matches(descriptor(output), variant.output)) {
      throw new Error(
        `${CASE_NAME}: ${SETUP_PATH} rendezvous replay produced unexpected source`,
      )
    }
    fs.writeFileSync(filename, output)
    return {
      status: 'recovered',
      files: [SETUP_PATH],
      variant: variant.state,
    }
  }

  throw new Error(
    `${CASE_NAME}: setup rendezvous replay requires an exact accepted raw or recovered source state`,
  )
}
