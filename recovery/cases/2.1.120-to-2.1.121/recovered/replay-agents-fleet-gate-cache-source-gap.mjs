#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_AGENTS_FLEET_GATE_CACHE_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/utils/agentsFleet.ts',
    bytes: 3660,
    sha256: '60d70ee8719145a1df786903fc2fd1ff2a0ee151c9537c1db5799eeefa0a0fda',
  }),
])

export const TARGET121_AGENTS_FLEET_GATE_CACHE_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/utils/agentsFleet.ts',
    bytes: 3648,
    sha256: 'b0157d6a9b1ca7bf97b559faaf45e9e1241ae3a068b3df977b9b8ae62a8cb243',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-agents-fleet-gate-cache-target-fragment',
  'target121-agents-fleet-gate-cache-source-replay-test',
  'target121-agents-fleet-gate-cache-source-ast-test',
])

export const TARGET121_AGENTS_FLEET_GATE_CACHE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:6723`,
    targetIndex: 6723,
    paths: Object.freeze(['src/utils/agentsFleet.ts']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The authenticated fleet-cache hydrator initializes settings before evaluating the fleet gate, then skips GrowthBook initialization for disabled, environment-overridden, or already persisted feature values. Its exact owner is utils/agentsFleet.ts, where the bounded replay replaces the reconstructed config-override check with the target hasGrowthBookCachedValue API and preserves the 300 ms fail-open initialization boundary.',
  }),
])

export const TARGET121_AGENTS_FLEET_GATE_CACHE_EVIDENCE_IDS = EVIDENCE_IDS

const OLD_GROWTHBOOK_IMPORT = `import {
  getFeatureValue_CACHED_MAY_BE_STALE,
  getGrowthBookConfigOverrides,
  hasGrowthBookEnvOverride,
  initializeGrowthBook,
} from '../services/analytics/growthbook.js'`

const NEW_GROWTHBOOK_IMPORT = `import {
  getFeatureValue_CACHED_MAY_BE_STALE,
  hasGrowthBookCachedValue,
  hasGrowthBookEnvOverride,
  initializeGrowthBook,
} from '../services/analytics/growthbook.js'`

const OLD_HYDRATOR = `export async function ensureFleetGateHydrated(): Promise<void> {
  if (getSessionSettingsCache() === null) getSettingsWithErrors()
  if (
    isFleetDisabled() ||
    hasGrowthBookEnvOverride('tengu_slate_meadow') ||
    'tengu_slate_meadow' in getGrowthBookConfigOverrides()
  ) {
    return
  }
  await withTimeout(
    initializeGrowthBook(),
    300,
    'gb-before-fleet-gate',
  ).catch(() => {})
}`

const NEW_HYDRATOR = `export async function ensureFleetGateHydrated(): Promise<void> {
  if (getSessionSettingsCache() === null) getSettingsWithErrors()
  if (
    isFleetDisabled() ||
    hasGrowthBookEnvOverride('tengu_slate_meadow') ||
    hasGrowthBookCachedValue('tengu_slate_meadow')
  ) {
    return
  }
  await withTimeout(
    initializeGrowthBook(),
    300,
    'gb-before-fleet-gate',
  ).catch(() => {})
}`

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

export function buildTarget121AgentsFleetGateCacheOutput(agentsFleet) {
  return replaceExactly(
    replaceExactly(
      agentsFleet,
      OLD_GROWTHBOOK_IMPORT,
      NEW_GROWTHBOOK_IMPORT,
      'agents-fleet GrowthBook import',
    ),
    OLD_HYDRATOR,
    NEW_HYDRATOR,
    'agents-fleet cache hydrator',
  )
}

export function applyTarget121AgentsFleetGateCacheSourceRecovery({
  sourceRoot,
}) {
  const input = TARGET121_AGENTS_FLEET_GATE_CACHE_INPUT_FILES[0]
  const output = TARGET121_AGENTS_FLEET_GATE_CACHE_OUTPUT_FILES[0]
  const filename = path.join(sourceRoot, input.path.replace(/^src\//, ''))
  const raw = fs.readFileSync(filename)
  const actual = descriptor(raw)
  if (matches(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!matches(actual, input)) {
    throw new Error(
      `${CASE_NAME}: agents-fleet gate-cache replay requires its exact raw or recovered source state`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121AgentsFleetGateCacheOutput(raw.toString('utf8')),
    'utf8',
  )
  if (!matches(descriptor(recovered), output)) {
    throw new Error(
      `${CASE_NAME}: agents-fleet gate-cache replay produced unexpected source`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}
