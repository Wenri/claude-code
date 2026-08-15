import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const cases = [
  ['2.1.107-to-2.1.108', '2.1.108'],
  ['2.1.108-to-2.1.109', '2.1.109'],
  ['2.1.109-to-2.1.110', '2.1.110'],
  ['2.1.110-to-2.1.111', '2.1.111'],
  ['2.1.111-to-2.1.112', '2.1.112'],
  ['2.1.112-to-2.1.113', '2.1.113'],
  ['2.1.113-to-2.1.114', '2.1.114'],
  ['2.1.114-to-2.1.116', '2.1.116'],
]

function literals(source) {
  const values = new Set()
  const pattern = /"(?:[^"\\]|\\.)*"/gs
  for (const match of source.matchAll(pattern)) {
    let value
    try {
      value = JSON.parse(match[0])
    } catch {
      continue
    }
    if (
      typeof value === 'string' &&
      value.length >= 14 &&
      value.length <= 400 &&
      !value.includes('\n') &&
      !value.startsWith('../')
    ) {
      values.add(value)
    }
  }
  return [...values].sort((left, right) => right.length - left.length).slice(0, 5)
}

const selected = new Set(process.argv.slice(2))
for (const [caseName, targetVersion] of cases) {
  if (selected.size > 0 && !selected.has(caseName)) continue
  const filename = `/tmp/recovery-semantic-late-b/${caseName}.all-owners.json`
  const report = JSON.parse(fs.readFileSync(filename))
  const targetPath = `/tmp/recovery-semantic-late-b/${targetVersion}.${Number(targetVersion.slice(4)) >= 113 ? 'inner' : 'cli'}.js`
  const target = fs.readFileSync(targetPath, 'utf8')
  const literalRows = new Map()
  for (const row of report.rows) {
    if (
      row.structuralClass === 'moved' ||
      row.alphaByCoarse ||
      row.metadataEquivalent ||
      row.owners.length > 0
    ) {
      continue
    }
    for (const literal of literals(target.slice(row.start, row.end))) {
      const rows = literalRows.get(literal) ?? []
      rows.push(row)
      literalRows.set(literal, rows)
    }
  }
  const patternFile = `/tmp/recovery-semantic-late-b/${caseName}.literal-patterns.txt`
  fs.writeFileSync(patternFile, [...literalRows.keys()].join('\n') + '\n')
  const result = spawnSync(
    'rg',
    ['--json', '-F', '-o', '-f', patternFile, 'src'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `rg exited ${result.status}`)
  }
  for (const line of result.stdout.split('\n')) {
    if (!line) continue
    const event = JSON.parse(line)
    if (event.type !== 'match') continue
    const owner = event.data.path.text
    for (const submatch of event.data.submatches) {
      const literal = submatch.match.text
      for (const row of literalRows.get(literal) ?? []) {
        row.currentOwners ??= []
        const existing = row.currentOwners.find(entry => entry.path === owner)
        if (existing) existing.anchors.push(literal)
        else row.currentOwners.push({ path: owner, anchors: [literal] })
      }
    }
  }
  for (const row of report.rows) {
    if (!row.currentOwners) continue
    row.currentOwners.sort(
      (left, right) =>
        Math.max(...right.anchors.map(anchor => anchor.length)) -
        Math.max(...left.anchors.map(anchor => anchor.length)),
    )
    row.currentOwners = row.currentOwners.slice(0, 8)
  }
  fs.writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`)
  const mapped = report.rows.filter(row => row.currentOwners?.length > 0).length
  console.log(caseName, mapped)
}
