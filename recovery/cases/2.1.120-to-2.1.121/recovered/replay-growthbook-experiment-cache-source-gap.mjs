#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/services/analytics/growthbook.ts',
    bytes: 40526,
    sha256: '42541e6311ebed2d2865332eb7d9b2b99ac46f16d47674e702d7b035c1b96cf4',
  }),
  Object.freeze({
    path: 'src/utils/config.ts',
    bytes: 67413,
    sha256: '81842b83269321ea2f38fa4315fb42aad002b480fa01a8bb9e6a407964b7d20e',
  }),
  Object.freeze({
    path: 'src/components/WarmResumeHint.tsx',
    bytes: 4618,
    sha256: 'b2f45128ba18a31444c69cd01a3131dd9f5231a6ec84080460247295cd598e58',
  }),
])

export const TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/services/analytics/growthbook.ts',
    bytes: 41134,
    sha256: '4ea6c7ae00211865f8b1e7833ef170233162e71987a593cff3f4975b9548bc3b',
  }),
  Object.freeze({
    path: 'src/utils/config.ts',
    bytes: 67503,
    sha256: '402030c1d4c2f2709f785871873d3523dd6057bcc47692ba8881f793b13f1a2c',
  }),
  Object.freeze({
    path: 'src/components/WarmResumeHint.tsx',
    bytes: 4612,
    sha256: '2253a1f9f20cf6867a8f8763bfcc1e598ac867f8c51fc650b5161633011b71f4',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-growthbook-experiment-cache-target-fragment',
  'target121-growthbook-experiment-cache-source-replay-test',
  'target121-growthbook-experiment-cache-source-ast-test',
])

function override(targetIndex, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze(['src/services/analytics/growthbook.ts']),
    evidenceIds: EVIDENCE_IDS,
    behavior,
  })
}

export const TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OWNER_OVERRIDES =
  Object.freeze([
    override(
      6666,
      'The exact GrowthBook owner determines whether a feature is experiment-backed from the live experiment map first, then the persisted experiment-name cache only while GrowthBook is enabled. The coarse firstPartyEventLogger.ts attribution is rejected.',
    ),
    override(
      6674,
      'The exact GrowthBook owner atomically persists the complete evaluated-feature map and a sorted experiment-name list, skipping the write only when both cached values are unchanged. The coarse firstPartyEventLogger.ts attribution is rejected.',
    ),
  ])

export const TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_EVIDENCE_IDS = EVIDENCE_IDS

const ENV_OVERRIDE_DECLARATION = `export function hasGrowthBookEnvOverride(feature: string): boolean {
  const overrides = getEnvOverrides()
  return overrides !== null && feature in overrides
}
`

const CACHE_API_DECLARATIONS = `
export function hasGrowthBookCachedValue(feature: string): boolean {
  return getGlobalConfig().cachedGrowthBookFeatures?.[feature] !== undefined
}

export function isFeatureFromExperiment(feature: string): boolean {
  if (experimentDataByFeature.has(feature)) return true
  if (!isGrowthBookEnabled()) return false
  return (getGlobalConfig().cachedExperimentFeatures ?? []).includes(feature)
}
`

const OLD_SYNC_DECLARATION = `function syncRemoteEvalToDisk(): void {
  const fresh = Object.fromEntries(remoteEvalFeatureValues)
  const config = getGlobalConfig()
  if (isEqual(config.cachedGrowthBookFeatures, fresh)) {
    return
  }
  saveGlobalConfig(current => ({
    ...current,
    cachedGrowthBookFeatures: fresh,
  }))
}`

const NEW_SYNC_DECLARATION = `function syncRemoteEvalToDisk(): void {
  const fresh = Object.fromEntries(remoteEvalFeatureValues)
  const experimentFeatures = Array.from(experimentDataByFeature.keys()).sort()
  const config = getGlobalConfig()
  if (
    isEqual(config.cachedGrowthBookFeatures, fresh) &&
    isEqual(config.cachedExperimentFeatures ?? [], experimentFeatures)
  ) {
    return
  }
  saveGlobalConfig(current => ({
    ...current,
    cachedGrowthBookFeatures: fresh,
    cachedExperimentFeatures: experimentFeatures,
  }))
}`

const CONFIG_CACHE_FIELD = `  // Cached GrowthBook feature values
  cachedGrowthBookFeatures?: { [featureName: string]: unknown }
`

const CONFIG_CACHE_FIELDS = `${CONFIG_CACHE_FIELD}
  // Cached names backed by GrowthBook experiments
  cachedExperimentFeatures?: string[]
`

const OLD_WARM_RESUME_IMPORTS = `  getAllGrowthBookFeatures,
  getFeatureValue_CACHED_MAY_BE_STALE,
  getGrowthBookConfigOverrides,
  hasGrowthBookEnvOverride,
`

const NEW_WARM_RESUME_IMPORTS = `  getFeatureValue_CACHED_MAY_BE_STALE,
  getGrowthBookConfigOverrides,
  hasGrowthBookEnvOverride,
  isFeatureFromExperiment,
`

const OLD_GATE_DECLARATION = `function isGateRegistered(): boolean {
  return (
    hasGrowthBookEnvOverride(WARM_RESUME_GATE) ||
    WARM_RESUME_GATE in getGrowthBookConfigOverrides() ||
    WARM_RESUME_GATE in getAllGrowthBookFeatures()
  )
}`

const NEW_GATE_DECLARATION = `function isGateRegistered(): boolean {
  return (
    isFeatureFromExperiment(WARM_RESUME_GATE) ||
    hasGrowthBookEnvOverride(WARM_RESUME_GATE) ||
    WARM_RESUME_GATE in getGrowthBookConfigOverrides()
  )
}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function replaceExactly(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: ${label} replay anchor differs`)
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

export function buildTarget121GrowthBookExperimentCacheOutputs({
  growthbook,
  config,
  warmResumeHint,
}) {
  const withCacheApis = replaceExactly(
    growthbook,
    ENV_OVERRIDE_DECLARATION,
    ENV_OVERRIDE_DECLARATION + CACHE_API_DECLARATIONS,
    'GrowthBook cache API',
  )
  return Object.freeze({
    growthbook: replaceExactly(
      withCacheApis,
      OLD_SYNC_DECLARATION,
      NEW_SYNC_DECLARATION,
      'GrowthBook disk sync',
    ),
    config: replaceExactly(
      config,
      CONFIG_CACHE_FIELD,
      CONFIG_CACHE_FIELDS,
      'global config experiment-cache type',
    ),
    warmResumeHint: replaceExactly(
      replaceExactly(
        warmResumeHint,
        OLD_WARM_RESUME_IMPORTS,
        NEW_WARM_RESUME_IMPORTS,
        'warm-resume GrowthBook import',
      ),
      OLD_GATE_DECLARATION,
      NEW_GATE_DECLARATION,
      'warm-resume experiment gate',
    ),
  })
}

export function applyTarget121GrowthBookExperimentCacheSourceRecovery({
  sourceRoot,
}) {
  const inputByPath = new Map(
    TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_INPUT_FILES.map(row => [row.path, row]),
  )
  const outputByPath = new Map(
    TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OUTPUT_FILES.map(row => [row.path, row]),
  )
  const files = TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_INPUT_FILES.map(spec => {
    const filename = path.join(sourceRoot, spec.path.replace(/^src\//, ''))
    const value = fs.readFileSync(filename)
    return { filename, path: spec.path, value, actual: descriptor(value) }
  })
  const matches = (actual, expected) =>
    actual.bytes === expected.bytes && actual.sha256 === expected.sha256
  if (files.every(file => matches(file.actual, outputByPath.get(file.path)))) {
    return { status: 'already-recovered', files: [] }
  }
  if (!files.every(file => matches(file.actual, inputByPath.get(file.path)))) {
    throw new Error(
      `${CASE_NAME}: GrowthBook experiment-cache replay requires its exact raw or recovered source state`,
    )
  }

  const raw = Object.fromEntries(
    files.map(file => [file.path, file.value.toString('utf8')]),
  )
  const built = buildTarget121GrowthBookExperimentCacheOutputs({
    growthbook: raw['src/services/analytics/growthbook.ts'],
    config: raw['src/utils/config.ts'],
    warmResumeHint: raw['src/components/WarmResumeHint.tsx'],
  })
  const outputTextByPath = new Map([
    ['src/services/analytics/growthbook.ts', built.growthbook],
    ['src/utils/config.ts', built.config],
    ['src/components/WarmResumeHint.tsx', built.warmResumeHint],
  ])
  const outputs = files.map(file => ({
    ...file,
    output: Buffer.from(outputTextByPath.get(file.path), 'utf8'),
  }))
  for (const file of outputs) {
    if (!matches(descriptor(file.output), outputByPath.get(file.path))) {
      throw new Error(
        `${CASE_NAME}: GrowthBook experiment-cache replay produced unexpected ${file.path}`,
      )
    }
  }
  for (const file of outputs) fs.writeFileSync(file.filename, file.output)
  return {
    status: 'recovered',
    files: TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OUTPUT_FILES.map(row => row.path),
  }
}
