import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const temporaryRoot = path.resolve(process.argv[2])
const selectedCase = process.argv[3]

if (!temporaryRoot || !selectedCase) {
  throw new Error('usage: .tmp-verify-middle-ledgers.mjs TEMP_ROOT CASE')
}

const targetCommits = new Map([
  ['2.1.96-to-2.1.97', '45514e405eb6824b3a9c2f7819677f53038cde1e'],
  ['2.1.97-to-2.1.98', '5ecd35c9e33fc10ec040d98e15eff6da20b569e0'],
  ['2.1.98-to-2.1.100', '71adf7f36c3522c296770374910eb1834dfe5d59'],
  ['2.1.100-to-2.1.101', 'f03f4b89f427a311c3ae6493a5e392ef612f5d26'],
  ['2.1.101-to-2.1.104', '0d70d13694c24c8dbe822d6f5705a0449e1d0a34'],
  ['2.1.104-to-2.1.105', '00071c6055eb3c06b6014cf5267e0fe28575c13b'],
  ['2.1.105-to-2.1.107', '3848dd0b1826c7ccf5a5716541ed5d9b7dc93f08'],
])

function version(caseName, side) {
  return caseName.split('-to-')[side === 'target' ? 1 : 0].split('.').map(Number)
}

function compare(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function descriptor(caseName) {
  const relative = `recovery/cases/${caseName}/semantic-supplement.patch`
  const value = fs.readFileSync(path.join(temporaryRoot, relative))
  return {
    case: caseName,
    path: relative,
    bytes: value.length,
    sha256: crypto.createHash('sha256').update(value).digest('hex'),
  }
}

function breakManifestLink(filename) {
  const value = fs.readFileSync(filename)
  fs.unlinkSync(filename)
  fs.writeFileSync(filename, value)
}

function writeManifest(caseName, mutate) {
  const filename = path.join(
    temporaryRoot,
    'recovery/cases',
    caseName,
    'manifest.json',
  )
  breakManifestLink(filename)
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'))
  mutate(manifest)
  fs.writeFileSync(filename, `${JSON.stringify(manifest, null, 2)}\n`)
}

const casesRoot = path.join(temporaryRoot, 'recovery/cases')
const cases = fs
  .readdirSync(casesRoot)
  .filter(caseName => /^\d+\.\d+\.\d+-to-\d+\.\d+\.\d+$/.test(caseName))
  .sort((left, right) => compare(version(left, 'target'), version(right, 'target')))

const selectedTarget = version(selectedCase, 'target')
const supplements = []
for (const caseName of cases) {
  if (compare(version(caseName, 'target'), selectedTarget) > 0) break
  const supplementFilename = path.join(
    casesRoot,
    caseName,
    'semantic-supplement.patch',
  )
  if (!fs.existsSync(supplementFilename)) continue
  const supplement = descriptor(caseName)
  supplements.push(supplement)
  if (caseName !== selectedCase) {
    writeManifest(caseName, manifest => {
      manifest.semanticSourceLineage = { supplement }
    })
  }
}

writeManifest(selectedCase, manifest => {
  const caseRoot = path.join(casesRoot, selectedCase)
  const coveragePath = 'semantic/source-coverage.json.gz'
  const coverageValue = fs.readFileSync(path.join(caseRoot, coveragePath))
  const sourceCoverage = {
    path: coveragePath,
    bytes: coverageValue.length,
    sha256: crypto.createHash('sha256').update(coverageValue).digest('hex'),
  }
  const supplement = supplements.find(item => item.case === selectedCase) ?? null
  manifest.semanticSourceLineage = {
    targetCommit: targetCommits.get(selectedCase),
    supplement,
    cumulativeSupplements: supplements,
    sourceCoverage,
  }
  const assertions = manifest.generatedRecovery.fileAssertions
  for (const item of [
    sourceCoverage,
    supplement && {
      path: 'semantic-supplement.patch',
      bytes: supplement.bytes,
      sha256: supplement.sha256,
    },
  ].filter(Boolean)) {
    const index = assertions.findIndex(assertion => assertion.path === item.path)
    if (index >= 0) assertions[index] = item
    else assertions.push(item)
  }
})
