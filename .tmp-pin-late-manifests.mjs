import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = process.cwd()
const caseRoot = path.join(repositoryRoot, 'recovery/cases')
const lateCases = [
  {
    case: '2.1.107-to-2.1.108',
    targetCommit: 'a22c02fc9bf4b772da434470c28e1bb21f5bd73c',
    supplement: true,
    cumulativeSupplements: 14,
  },
  {
    case: '2.1.108-to-2.1.109',
    targetCommit: '24f983bdbd6a2f1dadba452f9bdd6aea077c3238',
    supplement: false,
    cumulativeSupplements: 14,
  },
  {
    case: '2.1.109-to-2.1.110',
    targetCommit: '34ff410fe7339937986bccbb2eb848138bb0db1f',
    supplement: true,
    cumulativeSupplements: 15,
  },
  {
    case: '2.1.110-to-2.1.111',
    targetCommit: '5e168e7272e2eb510b16d7141538bb3f4836749a',
    supplement: true,
    cumulativeSupplements: 16,
  },
  {
    case: '2.1.111-to-2.1.112',
    targetCommit: '7a202a296a5d4278f75fd0bdb3ef870e98a34452',
    supplement: false,
    cumulativeSupplements: 16,
  },
  {
    case: '2.1.112-to-2.1.113',
    targetCommit: 'd88405d4b4b7ce6e066e1d67e7fc421b54d685f0',
    supplement: true,
    cumulativeSupplements: 17,
  },
  {
    case: '2.1.113-to-2.1.114',
    targetCommit: 'f7d9656548fd1e7849a9e243d9950dbb7307690c',
    supplement: false,
    cumulativeSupplements: 17,
  },
  {
    case: '2.1.114-to-2.1.116',
    targetCommit: 'e08046f528857203cbdede147bcab8b8b8021bf7',
    supplement: true,
    cumulativeSupplements: 18,
  },
]
const expectedSupplementCases = [
  '2.1.88-to-2.1.89',
  '2.1.89-to-2.1.90',
  '2.1.90-to-2.1.91',
  '2.1.91-to-2.1.92',
  '2.1.92-to-2.1.94',
  '2.1.94-to-2.1.96',
  '2.1.96-to-2.1.97',
  '2.1.97-to-2.1.98',
  '2.1.98-to-2.1.100',
  '2.1.100-to-2.1.101',
  '2.1.101-to-2.1.104',
  '2.1.104-to-2.1.105',
  '2.1.105-to-2.1.107',
  '2.1.107-to-2.1.108',
  '2.1.109-to-2.1.110',
  '2.1.110-to-2.1.111',
  '2.1.112-to-2.1.113',
  '2.1.114-to-2.1.116',
]
const managedAssertionPaths = new Set([
  'semantic-supplement.patch',
  'semantic/source-coverage.json.gz',
  'semantic/dependency-coverage.json.gz',
])
const sourceCriterion = 'compiled-ast-function-semantics-v1'
const dependencyCriterion = 'whole-bundle-dependency-build-input-v1'
const sha256Pattern = /^[0-9a-f]{64}$/
const casePattern =
  /^(\d+)\.(\d+)\.(\d+)-to-(\d+)\.(\d+)\.(\d+)$/
const snapshots = new Map()

function fail(message) {
  throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function targetVersion(caseName) {
  const match = casePattern.exec(caseName)
  if (!match) fail(caseName + ': invalid recovery case name')
  return match.slice(4, 7).map(Number)
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function compareCases(left, right) {
  const versionOrder = compareVersions(
    targetVersion(left),
    targetVersion(right),
  )
  if (versionOrder !== 0) return versionOrder
  return left < right ? -1 : left > right ? 1 : 0
}

function targetVersionString(caseName) {
  return caseName.split('-to-')[1]
}

function snapshotFile(filename, label) {
  const absolute = path.resolve(filename)
  const existing = snapshots.get(absolute)
  if (existing) return existing.value
  if (!fs.existsSync(absolute)) fail(label + ': file is missing')
  const value = fs.readFileSync(absolute)
  snapshots.set(absolute, {
    label,
    bytes: value.length,
    sha256: sha256(value),
    value,
  })
  return value
}

function pinnedFile(caseName, relative) {
  const value = snapshotFile(
    path.join(caseRoot, caseName, relative),
    caseName + ' ' + relative,
  )
  return {
    path: relative,
    bytes: value.length,
    sha256: sha256(value),
  }
}

function supplementDescriptor(caseName) {
  const pinned = pinnedFile(caseName, 'semantic-supplement.patch')
  if (pinned.bytes === 0) fail(caseName + ': semantic supplement is empty')
  const value = snapshotFile(
    path.join(caseRoot, caseName, pinned.path),
    caseName + ' semantic supplement',
  )
  const headers = [
    ...value
      .toString('utf8')
      .matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm),
  ]
  if (headers.length === 0) {
    fail(caseName + ': semantic supplement has no Git patch entries')
  }
  for (const header of headers) {
    if (header[1] !== header[2] || !header[1].startsWith('src/')) {
      fail(
        caseName +
          ': semantic supplement may modify only matching src/ paths',
      )
    }
  }
  return {
    case: caseName,
    path:
      'recovery/cases/' +
      caseName +
      '/semantic-supplement.patch',
    bytes: pinned.bytes,
    sha256: pinned.sha256,
  }
}

function assertionFromSupplement(descriptor) {
  return {
    path: 'semantic-supplement.patch',
    bytes: descriptor.bytes,
    sha256: descriptor.sha256,
  }
}

function parseLedger(caseName, kind, pinned, expectedCommit) {
  const label = caseName + ' semantic ' + kind + ' coverage'
  let ledger
  try {
    const filename = path.join(caseRoot, caseName, pinned.path)
    const value = snapshotFile(filename, label)
    ledger = JSON.parse(gunzipSync(value).toString('utf8'))
  } catch (error) {
    fail(label + ': cannot parse gzip JSON: ' + error.message)
  }
  if (
    ledger === null ||
    typeof ledger !== 'object' ||
    Array.isArray(ledger)
  ) {
    fail(label + ': ledger root must be an object')
  }
  if (ledger.schemaVersion !== 1) {
    fail(label + ': unsupported schemaVersion')
  }
  if (ledger.case !== caseName) fail(label + ': case differs')
  if (ledger.targetVersion !== targetVersionString(caseName)) {
    fail(label + ': targetVersion differs')
  }
  if (ledger.targetCommit !== expectedCommit) {
    fail(label + ': targetCommit differs')
  }
  const expectedCriterion =
    kind === 'source' ? sourceCriterion : dependencyCriterion
  if (ledger.criterion !== expectedCriterion) {
    fail(label + ': criterion differs')
  }
}

function validateTargetCommit(caseName, targetCommit) {
  if (!/^[0-9a-f]{40}$/.test(targetCommit)) {
    fail(caseName + ': targetCommit is not a full lowercase Git commit')
  }
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', targetCommit + '^{commit}'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  )
  if (result.status !== 0) {
    fail(
      caseName +
        ': targetCommit does not resolve: ' +
        result.stderr.trim(),
    )
  }
  if (result.stdout.trim() !== targetCommit) {
    fail(caseName + ': targetCommit resolves to a different commit')
  }
}

function validateAssertions(caseName, assertions) {
  if (!Array.isArray(assertions)) {
    fail(caseName + ': generatedRecovery.fileAssertions must be an array')
  }
  const seen = new Set()
  for (const assertion of assertions) {
    if (
      assertion === null ||
      typeof assertion !== 'object' ||
      Array.isArray(assertion)
    ) {
      fail(caseName + ': file assertion must be an object')
    }
    if (typeof assertion.path !== 'string' || assertion.path.length === 0) {
      fail(caseName + ': file assertion path is missing')
    }
    if (seen.has(assertion.path)) {
      fail(caseName + ': duplicate file assertion ' + assertion.path)
    }
    seen.add(assertion.path)
    if (
      !Number.isSafeInteger(assertion.bytes) ||
      assertion.bytes < 0
    ) {
      fail(caseName + ': invalid byte count for ' + assertion.path)
    }
    if (
      typeof assertion.sha256 !== 'string' ||
      !sha256Pattern.test(assertion.sha256)
    ) {
      fail(caseName + ': invalid SHA-256 for ' + assertion.path)
    }
  }
}

function validateManifest(caseName, manifest, expectedCommit) {
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest)
  ) {
    fail(caseName + ': manifest root must be an object')
  }
  if (manifest.case !== caseName) fail(caseName + ': manifest case differs')
  if (
    manifest.generatedRecovery === null ||
    typeof manifest.generatedRecovery !== 'object' ||
    Array.isArray(manifest.generatedRecovery)
  ) {
    fail(caseName + ': generatedRecovery must be an object')
  }
  validateAssertions(
    caseName,
    manifest.generatedRecovery.fileAssertions,
  )
  const existing = manifest.semanticSourceLineage
  if (
    existing !== undefined &&
    (existing === null ||
      typeof existing !== 'object' ||
      Array.isArray(existing))
  ) {
    fail(caseName + ': existing semanticSourceLineage must be an object')
  }
  if (
    existing?.targetCommit !== undefined &&
    existing.targetCommit !== expectedCommit
  ) {
    fail(caseName + ': existing semantic targetCommit differs')
  }
}

function assertSnapshotsUnchanged() {
  for (const [filename, expected] of snapshots) {
    if (!fs.existsSync(filename)) {
      fail(expected.label + ': disappeared during preflight')
    }
    const value = fs.readFileSync(filename)
    if (
      value.length !== expected.bytes ||
      sha256(value) !== expected.sha256
    ) {
      fail(expected.label + ': changed during preflight')
    }
  }
}

if (!fs.existsSync(path.join(repositoryRoot, '.git'))) {
  fail('run from the recovery repository root')
}
if (!fs.existsSync(caseRoot)) fail('recovery/cases is missing')

const explicitLateOrder = lateCases.map(item => item.case)
const sortedLateOrder = [...explicitLateOrder].sort(compareCases)
if (JSON.stringify(explicitLateOrder) !== JSON.stringify(sortedLateOrder)) {
  fail('late case table is not in target-version order')
}
const maximumTarget = targetVersion(lateCases.at(-1).case)
const allCases = fs
  .readdirSync(caseRoot)
  .filter(caseName => casePattern.test(caseName))
  .filter(
    caseName =>
      compareVersions(targetVersion(caseName), maximumTarget) <= 0,
  )
  .sort(compareCases)
const discoveredSupplementCases = allCases.filter(caseName =>
  fs.existsSync(
    path.join(caseRoot, caseName, 'semantic-supplement.patch'),
  ),
)
if (
  JSON.stringify(discoveredSupplementCases) !==
  JSON.stringify(expectedSupplementCases)
) {
  fail(
    'semantic supplement case set differs: ' +
      JSON.stringify(discoveredSupplementCases),
  )
}
const allSupplements = discoveredSupplementCases.map(supplementDescriptor)
const supplementsByCase = new Map(
  allSupplements.map(descriptor => [descriptor.case, descriptor]),
)
const plans = []

for (const item of lateCases) {
  validateTargetCommit(item.case, item.targetCommit)
  const manifestFilename = path.join(caseRoot, item.case, 'manifest.json')
  const manifestBytes = snapshotFile(
    manifestFilename,
    item.case + ' manifest',
  )
  let manifest
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch (error) {
    fail(item.case + ': cannot parse manifest: ' + error.message)
  }
  validateManifest(item.case, manifest, item.targetCommit)

  const ownSupplement = supplementsByCase.get(item.case) ?? null
  if ((ownSupplement !== null) !== item.supplement) {
    fail(item.case + ': own supplement expectation differs')
  }
  const selectedTarget = targetVersion(item.case)
  const cumulativeSupplements = allSupplements.filter(
    descriptor =>
      compareVersions(
        targetVersion(descriptor.case),
        selectedTarget,
      ) <= 0,
  )
  if (
    cumulativeSupplements.length !== item.cumulativeSupplements
  ) {
    fail(item.case + ': cumulative supplement count differs')
  }
  if (
    ownSupplement !== null &&
    !cumulativeSupplements.some(
      descriptor =>
        descriptor.case === item.case &&
        descriptor.sha256 === ownSupplement.sha256,
    )
  ) {
    fail(item.case + ': own supplement is absent from cumulative lineage')
  }

  const sourceCoverage = pinnedFile(
    item.case,
    'semantic/source-coverage.json.gz',
  )
  const dependencyCoverage = pinnedFile(
    item.case,
    'semantic/dependency-coverage.json.gz',
  )
  parseLedger(
    item.case,
    'source',
    sourceCoverage,
    item.targetCommit,
  )
  parseLedger(
    item.case,
    'dependency',
    dependencyCoverage,
    item.targetCommit,
  )

  manifest.semanticSourceLineage = {
    targetCommit: item.targetCommit,
    cumulativeSupplements: cumulativeSupplements.map(descriptor => ({
      ...descriptor,
    })),
    supplement:
      ownSupplement === null ? null : { ...ownSupplement },
    sourceCoverage,
  }
  const preservedAssertions =
    manifest.generatedRecovery.fileAssertions.filter(
      assertion => !managedAssertionPaths.has(assertion.path),
    )
  manifest.generatedRecovery.fileAssertions = [
    ...preservedAssertions,
    ...(ownSupplement === null
      ? []
      : [assertionFromSupplement(ownSupplement)]),
    sourceCoverage,
    dependencyCoverage,
  ]
  validateAssertions(
    item.case,
    manifest.generatedRecovery.fileAssertions,
  )
  plans.push({
    case: item.case,
    filename: manifestFilename,
    value: JSON.stringify(manifest, null, 2) + '\n',
    targetCommit: item.targetCommit,
    supplement: ownSupplement,
    sourceCoverage,
    dependencyCoverage,
    cumulativeSupplements: cumulativeSupplements.length,
  })
}

assertSnapshotsUnchanged()

for (const plan of plans) {
  fs.writeFileSync(plan.filename, plan.value)
  process.stdout.write(
    JSON.stringify({
      case: plan.case,
      targetCommit: plan.targetCommit,
      supplement: plan.supplement,
      sourceCoverage: plan.sourceCoverage,
      dependencyCoverage: plan.dependencyCoverage,
      cumulativeSupplements: plan.cumulativeSupplements,
    }) + '\n',
  )
}
