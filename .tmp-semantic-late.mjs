import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from './recovery/node_modules/acorn/dist/acorn.mjs'
import { indexGeneratedBundle } from './recovery/lib/structural-delta.mjs'

const root = process.cwd()
const cases = [
  ['2.1.107-to-2.1.108', '2.1.107', '2.1.108'],
  ['2.1.108-to-2.1.109', '2.1.108', '2.1.109'],
  ['2.1.109-to-2.1.110', '2.1.109', '2.1.110'],
  ['2.1.110-to-2.1.111', '2.1.110', '2.1.111'],
  ['2.1.111-to-2.1.112', '2.1.111', '2.1.112'],
  ['2.1.112-to-2.1.113', '2.1.112', '2.1.113'],
  ['2.1.113-to-2.1.114', '2.1.113', '2.1.114'],
  ['2.1.114-to-2.1.116', '2.1.114', '2.1.116'],
]

const parseOptions = {
  allowHashBang: true,
  ecmaVersion: 'latest',
  sourceType: 'module',
}

function canonical(source, metadata = false) {
  const result = []
  const stream = tokenizer(source, parseOptions)
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    let raw = source.slice(token.start, token.end)
    if (token.type.label === 'name') raw = '@id'
    if (metadata) {
      raw = raw
        .replace(/2\.1\.(?:107|108|109|110|111|112|113|114|115|116)/g, '2.1.VERSION')
        .replace(/20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/g, 'BUILD_TIME')
        .replace(/external-build-\d+/g, 'external-build-N')
        .replace(/build[-_ ](?:id[-_ ]?)?\d+/gi, 'build-N')
    }
    result.push(token.type.label, raw)
  }
  return result.join('\0')
}

function groups(values, key) {
  const result = new Map()
  values.forEach((value, index) => {
    const hash = key(value)
    const entries = result.get(hash) ?? []
    entries.push(index)
    result.set(hash, entries)
  })
  return result
}

const selected = new Set(process.argv.slice(2))
for (const [caseName, baselineVersion, targetVersion] of cases) {
  if (selected.size > 0 && !selected.has(caseName)) continue
  const caseRoot = path.join(root, 'recovery/cases', caseName)
  const ledger = JSON.parse(
    gunzipSync(fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz'))),
  )
  const baseline = indexGeneratedBundle(
    `/tmp/recovery-semantic-late-b/${baselineVersion}.${Number(baselineVersion.slice(4)) >= 113 ? 'inner' : 'cli'}.js`,
  )
  const target = indexGeneratedBundle(
    `/tmp/recovery-semantic-late-b/${targetVersion}.${Number(targetVersion.slice(4)) >= 113 ? 'inner' : 'cli'}.js`,
  )
  const baselineCoarse = groups(baseline.units, unit => unit.coarseHash)
  const baselineIdentifierCanonical = groups(
    baseline.units,
    unit => canonical(baseline.source.slice(unit.start, unit.end)),
  )
  const baselineMetadataCanonical = groups(
    baseline.units,
    unit => canonical(baseline.source.slice(unit.start, unit.end), true),
  )
  const counters = {
    movedOrChanged: 0,
    unresolvedCoarse: 0,
    unresolvedIdentifierCanonical: 0,
    unresolvedMetadataCanonical: 0,
    unresolvedRemainder: 0,
  }
  const remainder = []
  for (const region of ledger.regions) {
    if (region.classification === 'matched') continue
    if (region.classification !== 'unresolved') {
      counters.movedOrChanged += 1
      continue
    }
    const unit = target.units[region.target.index]
    const source = target.source.slice(unit.start, unit.end)
    if ((baselineCoarse.get(unit.coarseHash) ?? []).length > 0) {
      counters.unresolvedCoarse += 1
    } else if ((baselineIdentifierCanonical.get(canonical(source)) ?? []).length > 0) {
      counters.unresolvedIdentifierCanonical += 1
    } else if ((baselineMetadataCanonical.get(canonical(source, true)) ?? []).length > 0) {
      counters.unresolvedMetadataCanonical += 1
    } else {
      counters.unresolvedRemainder += 1
      remainder.push({
        targetIndex: region.target.index,
        start: region.target.start,
        end: region.target.end,
        nodeType: region.target.nodeType,
        tokenCount: region.target.tokenCount,
        prefix: source.slice(0, 300),
      })
    }
  }
  fs.writeFileSync(
    `/tmp/recovery-semantic-late-b/${caseName}.remainder.json`,
    `${JSON.stringify({ caseName, counters, remainder }, null, 2)}\n`,
  )
  console.log(caseName, JSON.stringify(counters))
}
