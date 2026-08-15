import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const root = process.cwd()
const artifactRoot = '/tmp/claude-middle-audit.DB5eTC'

const cases = [
  ['2.1.96-to-2.1.97', '2.1.97', '45514e4'],
  ['2.1.97-to-2.1.98', '2.1.98', '5ecd35c'],
  ['2.1.98-to-2.1.100', '2.1.100', '71adf7f'],
  ['2.1.100-to-2.1.101', '2.1.101', 'f03f4b8'],
  ['2.1.101-to-2.1.104', '2.1.104', '0d70d13'],
  ['2.1.104-to-2.1.105', '2.1.105', '00071c6'],
  ['2.1.105-to-2.1.107', '2.1.107', '3848dd0'],
]

function readGzipJson(filename) {
  return JSON.parse(gunzipSync(fs.readFileSync(filename)).toString('utf8'))
}

function readGzipJsonLines(filename) {
  return gunzipSync(fs.readFileSync(filename))
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
}

function changedTargetIndexes(diff) {
  const indexes = new Set()
  let targetLine = 0
  let inHunk = false
  for (const line of diff.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (header) {
      targetLine = Number(header[1]) - 1
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('diff ') || line.startsWith('@@ ')) {
      inHunk = false
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      indexes.add(targetLine)
      targetLine += 1
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Baseline-only line.
    } else if (line.startsWith(' ')) {
      targetLine += 1
    } else if (line === '\\ No newline at end of file') {
      // No line-number effect.
    }
  }
  return indexes
}

function sourceKind(source) {
  if (!source) return 'unknown'
  if (source.includes('/node_modules/')) return 'dependency'
  if (source.includes('/src/') || source.startsWith('../src/')) return 'application'
  return 'generated'
}

function normalizeOwner(source) {
  if (!source) return null
  if (source.startsWith('../src/')) return source.slice(3)
  return source
}

function binaryContaining(rows, offset, startKey, endKey) {
  let low = 0
  let high = rows.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const row = rows[middle]
    if (offset < row[startKey]) high = middle - 1
    else if (offset >= row[endKey]) low = middle + 1
    else return row
  }
  return null
}

function literals(source) {
  const found = []
  try {
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
    const visit = value => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        for (const item of value) visit(item)
        return
      }
      if (value.type === 'Literal' && typeof value.value === 'string' && value.value.length >= 12) {
        found.push(value.value)
      }
      if (value.type === 'TemplateElement') {
        const cooked = value.value?.cooked
        if (typeof cooked === 'string' && cooked.length >= 12) found.push(cooked)
      }
      for (const [key, child] of Object.entries(value)) {
        if (key !== 'start' && key !== 'end' && key !== 'loc') visit(child)
      }
    }
    visit(ast)
  } catch {
    // A structural unit should parse, but keep classification conservative.
  }
  return [...new Set(found)].sort((a, b) => b.length - a.length)
}

for (const [caseName, targetVersion, targetCommit] of cases) {
  const caseDir = path.join(root, 'recovery/cases', caseName)
  const ledger = readGzipJson(path.join(caseDir, 'structural/generated-delta.json.gz'))
  const sources = readGzipJsonLines(path.join(caseDir, 'attribution/sources.jsonl.gz'))
  const sourceByIndex = new Map(sources.map(row => [row.sourceIndex, row.source]))
  const initializers = readGzipJsonLines(path.join(caseDir, 'attribution/target-initializers.jsonl.gz'))
  const partitions = readGzipJsonLines(path.join(caseDir, 'attribution/target-partitions.jsonl.gz'))
  const diff = fs.readFileSync(path.join(artifactRoot, `${caseName}-readable/statements.diff`), 'utf8')
  const semanticIndexes = changedTargetIndexes(diff)
  const bundle = fs.readFileSync(path.join(artifactRoot, targetVersion, 'package/cli.js'), 'utf8')
  const changedFiles = new Set(
    execFileSync('git', ['diff', '--name-only', `${targetCommit}^`, targetCommit, '--', 'src'], { cwd: root, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean),
  )
  const sourceCache = new Map()
  const sourceAtCommit = owner => {
    if (sourceCache.has(owner)) return sourceCache.get(owner)
    try {
      const text = execFileSync('git', ['show', `${targetCommit}:${owner}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      sourceCache.set(owner, text)
      return text
    } catch {
      sourceCache.set(owner, null)
      return null
    }
  }

  const summary = new Map()
  const samples = new Map()
  const bump = (key, row) => {
    summary.set(key, (summary.get(key) ?? 0) + 1)
    const current = samples.get(key) ?? []
    if (current.length < 5) current.push(row)
    samples.set(key, current)
  }

  for (const region of ledger.regions.filter(row => row.classification !== 'matched')) {
    const target = region.target
    if (region.classification === 'moved' || !semanticIndexes.has(target.index)) {
      bump('alpha-equivalent', { index: target.index, start: target.start, class: region.classification })
      continue
    }
    const snippet = bundle.slice(target.start, target.end)
    if (target.start < 2230 || /VERSION:"2\.1\.|BUILD_TIME:|@anthropic-ai\/claude-code/.test(snippet)) {
      bump('generated-metadata', { index: target.index, start: target.start, snippet: snippet.slice(0, 160) })
      continue
    }
    const initializer = binaryContaining(initializers, target.start, 'regionStart', 'regionEnd')
    let sourceIndexes = initializer?.sourceVotes?.map(vote => vote.value) ?? []
    if (sourceIndexes.length === 0) {
      const partition = binaryContaining(
        partitions.map(row => ({ ...row, targetStart: row.target.offsetStart, targetEnd: row.target.offsetEnd })),
        target.start,
        'targetStart',
        'targetEnd',
      )
      sourceIndexes = partition?.attributedSourceIndex !== null && partition?.attributedSourceIndex !== undefined
        ? [partition.attributedSourceIndex]
        : partition?.sourceCandidates ?? []
    }
    const ownerSources = [...new Set(sourceIndexes.map(index => sourceByIndex.get(index)).filter(Boolean))]
    const kinds = [...new Set(ownerSources.map(sourceKind))]
    if (kinds.length > 0 && kinds.every(kind => kind === 'dependency')) {
      bump('dependency-runtime', { index: target.index, start: target.start, owners: ownerSources.slice(0, 4), snippet: snippet.slice(0, 160) })
      continue
    }
    const owners = ownerSources.filter(source => sourceKind(source) === 'application').map(normalizeOwner)
    const coveredByDiff = owners.filter(owner => changedFiles.has(owner))
    if (coveredByDiff.length > 0) {
      bump(`source-covered:${coveredByDiff.join(',')}`, { index: target.index, start: target.start, snippet: snippet.slice(0, 160) })
      continue
    }
    let literalOwner = null
    let literal = null
    for (const owner of owners) {
      const ownerText = sourceAtCommit(owner)
      if (!ownerText) continue
      literal = literals(snippet).find(value => value.length >= 16 && ownerText.includes(value))
      if (literal) {
        literalOwner = owner
        break
      }
    }
    if (literalOwner) {
      bump(`source-literal:${literalOwner}`, { index: target.index, start: target.start, literal: literal.slice(0, 120) })
      continue
    }
    bump(`gap:${owners.join(',') || 'unowned'}`, {
      index: target.index,
      start: target.start,
      end: target.end,
      initializerStatus: initializer?.status,
      owners,
      snippet: snippet.slice(0, 300),
    })
  }

  console.log(`\n===== ${caseName} semantic target indexes=${semanticIndexes.size}`)
  for (const [key, count] of [...summary].sort((a, b) => b[1] - a[1])) {
    console.log(`${count}\t${key}\t${JSON.stringify(samples.get(key))}`)
  }
}
