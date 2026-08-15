import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const cases = [
  {
    case: '2.1.88-to-2.1.89',
    targetCommit: 'ae5a27f9446042e9df589189889c110703ab351c',
    supplement: true,
  },
  {
    case: '2.1.89-to-2.1.90',
    targetCommit: '2ba94f2c67c645119e4f33ee9a68e7e14449c238',
    supplement: true,
  },
  {
    case: '2.1.90-to-2.1.91',
    targetCommit: 'cb8a3dbe788589c66326d345c54d35abd5603850',
    supplement: true,
  },
  {
    case: '2.1.91-to-2.1.92',
    targetCommit: '696930f29337e98869337eb59f55ead81f242abb',
    supplement: true,
  },
  {
    case: '2.1.92-to-2.1.94',
    targetCommit: '7edbf6deb50ef0c59765d3e6d05170b52915dac1',
    supplement: true,
  },
  {
    case: '2.1.94-to-2.1.96',
    targetCommit: '2f146603111bff7168baee238bdb62839d7d0802',
    supplement: true,
  },
]

function descriptor(filename, caseName) {
  const value = fs.readFileSync(path.join(root, filename))
  return {
    ...(caseName ? { case: caseName } : {}),
    path: filename,
    bytes: value.length,
    sha256: crypto.createHash('sha256').update(value).digest('hex'),
  }
}

const cumulative = []
for (const item of cases) {
  const caseRoot = path.join(root, 'recovery', 'cases', item.case)
  const manifestPath = path.join(caseRoot, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  let supplement = null
  if (item.supplement) {
    supplement = descriptor(
      `recovery/cases/${item.case}/semantic-supplement.patch`,
      item.case,
    )
    cumulative.push(supplement)
  }
  const sourceCoverage = descriptor(
    `recovery/cases/${item.case}/semantic/source-coverage.json.gz`,
  )
  const dependencyCoverage = descriptor(
    `recovery/cases/${item.case}/semantic/dependency-coverage.json.gz`,
  )
  sourceCoverage.path = 'semantic/source-coverage.json.gz'
  dependencyCoverage.path = 'semantic/dependency-coverage.json.gz'

  manifest.semanticSourceLineage = {
    targetCommit: item.targetCommit,
    cumulativeSupplements: cumulative.map(value => ({ ...value })),
    supplement,
    sourceCoverage,
  }

  const assertions = new Map(
    manifest.generatedRecovery.fileAssertions.map(assertion => [
      assertion.path,
      assertion,
    ]),
  )
  if (supplement) {
    assertions.set('semantic-supplement.patch', {
      path: 'semantic-supplement.patch',
      bytes: supplement.bytes,
      sha256: supplement.sha256,
    })
  }
  assertions.set(sourceCoverage.path, sourceCoverage)
  assertions.set(dependencyCoverage.path, dependencyCoverage)
  manifest.generatedRecovery.fileAssertions = [...assertions.values()]

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(item.case, supplement?.sha256 ?? '(no supplement)', sourceCoverage.sha256)
}
