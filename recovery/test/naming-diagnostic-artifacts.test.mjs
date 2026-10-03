import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { namingSummaryPath, assertDistinctDiagnosticPaths, auditWrittenArtifact, declarationPairCoverage, diagnosticDependencyFiles } from '../lib/naming-diagnostic-artifacts.mjs'

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-artifacts-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('derived summary path cannot overwrite emitted JavaScript or an input', t => {
  const root = temporary(t), report = path.join(root, 'out.json.gz'), summary = namingSummaryPath(report)
  assert.equal(summary, path.join(root, 'out.summary.json'))
  assert.throws(() => assertDistinctDiagnosticPaths([], [summary, report, summary]), /paths overlap/)
  fs.writeFileSync(summary, 'input')
  assert.throws(() => assertDistinctDiagnosticPaths([summary], [path.join(root, 'output.js'), report, summary]), /paths overlap/)
  assert.equal(fs.readFileSync(summary, 'utf8'), 'input')
})

test('rejects hardlinked outputs and aliases through symlinked parents', t => {
  const root = temporary(t), input = path.join(root, 'input.js'), output = path.join(root, 'output.js')
  fs.writeFileSync(input, 'input');fs.linkSync(input, output)
  assert.throws(() => assertDistinctDiagnosticPaths([input], [output]), /alias the same file/)
  fs.symlinkSync(root, path.join(root, 'alias'))
  assert.throws(() => assertDistinctDiagnosticPaths([], [path.join(root, 'new.js'), path.join(root, 'alias/new.js')]), /paths overlap/)
})

test('audits actual written bytes and detects subsequent overwrite', t => {
  const filename = path.join(temporary(t), 'output.js')
  fs.writeFileSync(filename, 'const value=1')
  assert.equal(auditWrittenArtifact(filename, 'const value=1').bytes, 13)
  fs.writeFileSync(filename, '{}')
  assert.throws(() => auditWrittenArtifact(filename, 'const value=1'), /artifact differs/)
})

test('headline declaration counts require reciprocal range pairs', () => {
  const rows = [
    { baselineRange: [0, 3], candidateRange: [0, 3], strictAstEqual: true },
    { baselineRange: [0, 3], candidateRange: [4, 7], strictAstEqual: true },
    { baselineRange: [4, 7], candidateRange: [8, 11], strictAstEqual: true },
    { baselineRange: [8, 11], candidateRange: [8, 11], strictAstEqual: true },
    { baselineRange: [12, 15], candidateRange: [12, 15], strictAstEqual: true },
  ]
  const result = declarationPairCoverage([...rows, rows[4]])
  assert.deepEqual(result.counts, { candidateRangePairs: 5, uniqueBaselineRanges: 4, uniqueCandidateRanges: 4, paired: 1, bijectivePairs: 1, nonBijectiveCandidatePairs: 4, strictMatches: 1, nonBijectiveStrictCandidatePairs: 4 })
  assert.equal(result.rows.filter(row => row.pairing === 'nonbijective-range-candidate').length, 4)
  assert.deepEqual(declarationPairCoverage([...rows].reverse()).counts, result.counts)
  assert.throws(() => declarationPairCoverage([rows[0], { ...rows[0], strictAstEqual: false }]), /Contradictory/)
})

test('dependency inventory admits internal file aliases but rejects outside or directory aliases', t => {
  const root = temporary(t), deps = path.join(root, 'node_modules')
  fs.mkdirSync(path.join(deps, 'pkg'), { recursive: true })
  const entry = path.join(deps, 'pkg/index.js'); fs.writeFileSync(entry, 'export const x=1')
  fs.symlinkSync('pkg/index.js', path.join(deps, 'internal'))
  assert.deepEqual(diagnosticDependencyFiles(deps), [entry])
  fs.symlinkSync('pkg', path.join(deps, 'directory-alias'))
  assert.throws(() => diagnosticDependencyFiles(deps), /directory aliases/)
  fs.unlinkSync(path.join(deps, 'directory-alias'))
  const outside = path.join(root, 'outside.js'); fs.writeFileSync(outside, 'outside')
  fs.symlinkSync(outside, path.join(deps, 'outside'))
  assert.throws(() => diagnosticDependencyFiles(deps), /escapes its root/)
  fs.unlinkSync(path.join(deps, 'outside'))
  const alias = path.join(root, 'dependency-alias'); fs.symlinkSync(deps, alias)
  assert.throws(() => diagnosticDependencyFiles(alias), /real directory/)
})

test('actual naming CLI rejects tool, manifest and dependency collisions before reading maps or writing outputs', t => {
  const root = temporary(t), recovery = path.join(root, 'recovery')
  fs.mkdirSync(path.join(recovery, 'scripts'), { recursive: true })
  for (const name of ['lib', 'node_modules']) fs.cpSync(fileURLToPath(new URL('../' + name, import.meta.url)), path.join(recovery, name), { recursive: true, verbatimSymlinks: true })
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(fileURLToPath(new URL('../' + name, import.meta.url)), path.join(recovery, name))
  const script = path.join(recovery, 'scripts/compare-baseline-source-functions.mjs')
  fs.copyFileSync(fileURLToPath(new URL('../scripts/compare-baseline-source-functions.mjs', import.meta.url)), script)
  const inputs = ['baseline.js', 'baseline.map', 'candidate.js', 'candidate.map'].map(name => path.join(root, name))
  for (const p of inputs) fs.writeFileSync(p, p.endsWith('.map') ? JSON.stringify({ version: 3, sources: [], sourcesContent: [], mappings: '' }) : 'const x=1;')
  const flags = ['--baseline-bundle', '--baseline-map', '--candidate-bundle', '--candidate-map'].flatMap((name, i) => [name, inputs[i]])
  const helper = path.join(recovery, 'lib/strict-ast.mjs'), parser = path.join(recovery, 'node_modules/acorn/dist/acorn.mjs')
  const summaryAlias = path.join(root, 'summary.summary.json'); fs.linkSync(helper, summaryAlias)
  const dependencyAlias = path.join(root, 'parser-hardlink.js'); fs.linkSync(parser, dependencyAlias)
  const parentAlias = path.join(root, 'tool-directory'); fs.symlinkSync(path.join(recovery, 'lib'), parentAlias)
  const protectedFiles = [script, helper, parser, path.join(recovery, 'package.json'), path.join(recovery, 'package-lock.json'), path.join(recovery, 'node_modules/eslint-scope/lib/variable.js')]
  const before = new Map(protectedFiles.map(p => [p, fs.readFileSync(p)]))
  const cases = [
    { output: script }, { report: helper }, { report: path.join(recovery, 'package.json') },
    { report: path.join(recovery, 'package-lock.json') }, { report: parser },
    { report: path.join(recovery, 'node_modules/eslint-scope/lib/variable.js') },
    { output: dependencyAlias }, { report: path.join(parentAlias, 'strict-ast.mjs') },
    { report: path.join(root, 'summary.json') },
  ]
  for (const [i, entry] of cases.entries()) {
    const output = entry.output ?? path.join(root, `output-${i}.js`), report = entry.report ?? path.join(root, `report-${i}.json`)
    const result = spawnSync(process.execPath, [script, ...flags, '--output', output, '--report', report], { encoding: 'utf8' })
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /Diagnostic artifact paths (?:overlap|alias the same file)/)
    assert.doesNotMatch(result.stderr, /Baseline map mismatch/)
    for (const [p, bytes] of before) assert.deepEqual(fs.readFileSync(p), bytes)
    if (!entry.output) assert.equal(fs.existsSync(output), false)
  }
  const result = spawnSync(process.execPath, [script, ...flags, '--output', path.join(root, 'safe.js'), '--report', path.join(root, 'safe.json')], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Baseline map mismatch/)
  assert.equal(fs.existsSync(path.join(root, 'safe.js')), false)
  assert.equal(fs.existsSync(path.join(root, 'safe.json')), false)
})
