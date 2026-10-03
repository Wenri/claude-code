import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function namingSummaryPath(reportPath) {
  return reportPath.replace(/(?:\.json)?(?:\.gz)?$/, '') + '.summary.json'
}

// Protect the installed, already-loaded parser/scope closure as well as our
// source tools. Permit only internal file aliases (such as npm's .bin entry),
// never traverse a symlinked dependency directory or an outside target.
export function diagnosticDependencyFiles(directory) {
  const root = path.resolve(directory), rootStatus = fs.lstatSync(root)
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink() && fs.realpathSync(root) === root,
    'Diagnostic dependency root must be a real directory')
  const files = []
  function visit(current) {
    for (const name of fs.readdirSync(current).sort()) {
      const filename = path.join(current, name), status = fs.lstatSync(filename)
      if (status.isSymbolicLink()) {
        const target = fs.realpathSync(filename), relative = path.relative(root, target)
        assert(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep),
          'Diagnostic dependency alias escapes its root')
        assert(fs.statSync(target).isFile(), 'Diagnostic dependency directory aliases are unsupported')
      } else if (status.isDirectory()) visit(filename)
      else {
        assert(status.isFile(), 'Diagnostic dependency input must be a regular file')
        files.push(filename)
      }
    }
  }
  visit(root)
  return files
}

function physicalDestination(filename) {
  let ancestor = path.resolve(filename)
  const suffix = []
  while (true) {
    try { return path.join(fs.realpathSync(ancestor), ...suffix) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = path.dirname(ancestor)
      if (parent === ancestor) throw error
      suffix.unshift(path.basename(ancestor)); ancestor = parent
    }
  }
}

export function assertDistinctDiagnosticPaths(inputPaths, outputPaths) {
  const destinations = new Map(), inodes = new Map()
  for (const [kind, files] of [['input', inputPaths], ['output', outputPaths]]) {
    for (const filename of files) {
      let status
      try { status = fs.lstatSync(filename) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      if (kind === 'output' && status) assert(status.isFile() && !status.isSymbolicLink(), 'Diagnostic output must be a regular file or new path')
      const destination = physicalDestination(filename)
      assert(!destinations.has(destination), `Diagnostic artifact paths overlap: ${filename}`)
      destinations.set(destination, filename)
      if (status) {
        const actual = fs.statSync(filename), identity = `${actual.dev}:${actual.ino}`
        assert(!inodes.has(identity), `Diagnostic artifact paths alias the same file: ${filename}`)
        inodes.set(identity, filename)
      }
    }
  }
}

export function auditWrittenArtifact(filename, expectedBytes) {
  const actual = fs.readFileSync(filename)
  assert(actual.equals(Buffer.from(expectedBytes)), `Written diagnostic artifact differs: ${filename}`)
  return { path: filename, bytes: actual.length, sha256: crypto.createHash('sha256').update(actual).digest('hex') }
}

// A range-pair observation is not necessarily a distinct declaration witness.
// Only one-to-one relationships contribute to the headline strict-match count.
export function declarationPairCoverage(rows) {
  const leftPeers = new Map(), rightPeers = new Map(), unique = new Map()
  function rangeKey(range) {
    assert(Array.isArray(range) && range.length === 2 && range.every(Number.isSafeInteger) && range[0] >= 0 && range[1] > range[0], 'Invalid declarator range')
    return range.join(':')
  }
  for (const row of rows) {
    const left = rangeKey(row.baselineRange), right = rangeKey(row.candidateRange), key = `${left}|${right}`
    assert.equal(typeof row.strictAstEqual, 'boolean')
    if (unique.has(key)) {
      assert.equal(unique.get(key).row.strictAstEqual, row.strictAstEqual, 'Contradictory duplicate declarator comparison')
      continue
    }
    unique.set(key, { row, left, right })
    const a = leftPeers.get(left) ?? new Set(), b = rightPeers.get(right) ?? new Set()
    a.add(right); b.add(left); leftPeers.set(left, a); rightPeers.set(right, b)
  }
  const results = [...unique.values()].map(({ row, left, right }) => ({ ...row,
    pairing: leftPeers.get(left).size === 1 && rightPeers.get(right).size === 1 ? 'bijective-range-pair' : 'nonbijective-range-candidate' }))
  const bijective = results.filter(row => row.pairing === 'bijective-range-pair')
  return { rows: results, counts: {
    candidateRangePairs: results.length,
    uniqueBaselineRanges: leftPeers.size, uniqueCandidateRanges: rightPeers.size,
    paired: bijective.length, bijectivePairs: bijective.length,
    nonBijectiveCandidatePairs: results.length - bijective.length,
    strictMatches: bijective.filter(row => row.strictAstEqual).length,
    nonBijectiveStrictCandidatePairs: results.filter(row => row.pairing !== 'bijective-range-pair' && row.strictAstEqual).length,
  } }
}
