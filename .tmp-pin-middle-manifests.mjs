import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const repositoryRoot = process.cwd()
const caseRoot = path.join(repositoryRoot, 'recovery/cases')
const targetCommits = new Map([
  ['2.1.96-to-2.1.97', '45514e405eb6824b3a9c2f7819677f53038cde1e'],
  ['2.1.97-to-2.1.98', '5ecd35c9e33fc10ec040d98e15eff6da20b569e0'],
  ['2.1.98-to-2.1.100', '71adf7f36c3522c296770374910eb1834dfe5d59'],
  ['2.1.100-to-2.1.101', 'f03f4b89f427a311c3ae6493a5e392ef612f5d26'],
  ['2.1.101-to-2.1.104', '0d70d13694c24c8dbe822d6f5705a0449e1d0a34'],
  ['2.1.104-to-2.1.105', '00071c6055eb3c06b6014cf5267e0fe28575c13b'],
  ['2.1.105-to-2.1.107', '3848dd0b1826c7ccf5a5716541ed5d9b7dc93f08'],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function version(caseName) {
  return caseName.split('-to-')[1].split('.').map(Number)
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function pinnedFile(caseName, relative) {
  const value = fs.readFileSync(path.join(caseRoot, caseName, relative))
  return { path: relative, bytes: value.length, sha256: sha256(value) }
}

function supplement(caseName) {
  const pinned = pinnedFile(caseName, 'semantic-supplement.patch')
  return {
    case: caseName,
    path: `recovery/cases/${caseName}/${pinned.path}`,
    bytes: pinned.bytes,
    sha256: pinned.sha256,
  }
}

const allCases = fs
  .readdirSync(caseRoot)
  .filter(caseName => /^\d+\.\d+\.\d+-to-\d+\.\d+\.\d+$/.test(caseName))
  .sort((left, right) => compareVersions(version(left), version(right)))
const allSupplements = allCases
  .filter(caseName =>
    fs.existsSync(path.join(caseRoot, caseName, 'semantic-supplement.patch')),
  )
  .map(supplement)

for (const [caseName, targetCommit] of targetCommits) {
  const manifestFilename = path.join(caseRoot, caseName, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestFilename, 'utf8'))
  const selectedTarget = version(caseName)
  const cumulativeSupplements = allSupplements.filter(item =>
    compareVersions(version(item.case), selectedTarget) <= 0,
  )
  const ownSupplement = cumulativeSupplements.find(item => item.case === caseName)
  if (!ownSupplement) throw new Error(`${caseName}: own supplement is missing`)
  const sourceCoverage = pinnedFile(
    caseName,
    'semantic/source-coverage.json.gz',
  )
  const dependencyCoverage = pinnedFile(
    caseName,
    'semantic/dependency-coverage.json.gz',
  )
  manifest.semanticSourceLineage = {
    targetCommit,
    cumulativeSupplements,
    supplement: ownSupplement,
    sourceCoverage,
  }
  const assertions = manifest.generatedRecovery.fileAssertions
  for (const assertion of [
    {
      path: 'semantic-supplement.patch',
      bytes: ownSupplement.bytes,
      sha256: ownSupplement.sha256,
    },
    sourceCoverage,
    dependencyCoverage,
  ]) {
    const existing = assertions.findIndex(item => item.path === assertion.path)
    if (existing === -1) assertions.push(assertion)
    else assertions[existing] = assertion
  }
  fs.writeFileSync(manifestFilename, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(
    JSON.stringify({
      case: caseName,
      supplement: ownSupplement,
      sourceCoverage,
      dependencyCoverage,
      cumulativeSupplements: cumulativeSupplements.length,
    }),
  )
}
