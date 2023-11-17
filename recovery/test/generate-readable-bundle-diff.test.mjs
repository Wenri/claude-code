import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { generateReadableBundleDiff } from '../readable-diff/generator.mjs'

function withFixture(baseline, target, callback) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'readable-bundle-diff-test-'),
  )
  const baselinePath = path.join(temporary, 'baseline.js')
  const targetPath = path.join(temporary, 'target.js')
  const outputPath = path.join(temporary, 'output')
  fs.writeFileSync(baselinePath, baseline)
  fs.writeFileSync(targetPath, target)
  try {
    return callback({
      baselinePath,
      outputPath,
      retainIntermediates: true,
      targetPath,
    })
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true })
  }
}

test('renames matched module bindings and preserves public names', () => {
  const baseline = [
    '#!/usr/bin/env node',
    'import {foo as a} from "fixture";',
    'const b=a+1;',
    'function c(x){return b+x}',
    'export {b as publicValue};',
    '',
  ].join('\n')
  const target = [
    '#!/usr/bin/env node',
    'import {foo as q} from "fixture";',
    'const r=q+1;',
    'function s(x){return r+x}',
    'export {r as publicValue};',
    'const added={q};',
    '',
  ].join('\n')

  withFixture(baseline, target, paths => {
    const metadata = generateReadableBundleDiff(paths)
    const normalized = fs.readFileSync(
      path.join(paths.outputPath, 'target.normalized.js'),
      'utf8',
    )
    assert.equal(
      metadata.verification.comparisonInvariantHashesEqual,
      true,
    )
    assert.match(normalized, /import \{foo as a\} from "fixture";/)
    assert.match(normalized, /const b=a\+1;/)
    assert.match(normalized, /function c\(x\)\{return b\+x\}/)
    assert.match(normalized, /export \{b as publicValue\};/)
    assert.match(normalized, /const added=\{q:a\};/)
    assert.ok(metadata.renames.editKinds.shorthandExpansions >= 1)
  })
})

test('does not rename through a nested capture', () => {
  const baseline = [
    'const a=1;',
    'function uniqueBaselineName(){return a+12345}',
    '',
  ].join('\n')
  const target = [
    'const q=1;',
    'function uniqueBaselineName(a){return q+a+12345}',
    '',
  ].join('\n')

  withFixture(baseline, target, paths => {
    const metadata = generateReadableBundleDiff(paths)
    const normalized = fs.readFileSync(
      path.join(paths.outputPath, 'target.normalized.js'),
      'utf8',
    )
    assert.match(normalized, /const q=1;/)
    assert.equal(
      metadata.rejectedRenames.some(
        rejection =>
          rejection.targetName === 'q' &&
          rejection.reason === 'nested-binding-capture',
      ),
      true,
    )
  })
})

test('does not split the module and class-local sides of a class name', () => {
  const baseline = 'class a{method(){return a}}\nconst b=a+12345;\n'
  const target = 'class q{method(){return q}}\nconst r=q+12345;\n'

  withFixture(baseline, target, paths => {
    const metadata = generateReadableBundleDiff(paths)
    const normalized = fs.readFileSync(
      path.join(paths.outputPath, 'target.normalized.js'),
      'utf8',
    )
    assert.equal(
      normalized,
      'class q{method(){return q}}\nconst b=q+12345;\n',
    )
    assert.equal(
      metadata.rejectedRenames.some(
        rejection =>
          rejection.targetName === 'q' &&
          rejection.reason === 'class-name-has-dual-binding',
      ),
      true,
    )
  })
})

test('compact mode retains a deterministic compressed readable diff', () => {
  withFixture('const a=1;\n', 'const b=2;\n', paths => {
    const metadata = generateReadableBundleDiff({
      ...paths,
      retainIntermediates: false,
    })
    assert.equal(
      fs.existsSync(path.join(paths.outputPath, 'target.normalized.js')),
      false,
    )
    const compressed = fs.readFileSync(
      path.join(paths.outputPath, 'normalized.diff.gz'),
    )
    const diff = gunzipSync(compressed).toString('utf8')
    assert.match(diff, /-const a=1;/)
    assert.match(diff, /\+const b=2;/)
    assert.equal(
      metadata.reproducibleIntermediates['normalized.diff'].sha256,
      'eb68e2350ceafb4a5c3f74fcad6a9eb5d4a29827aaf854d1b80e49c687916853',
    )
    assert.deepEqual([...compressed.subarray(4, 8)], [0, 0, 0, 0])
  })
})

test('refuses an output directory containing files', () => {
  withFixture('const a=1;\n', 'const b=1;\n', paths => {
    fs.mkdirSync(paths.outputPath)
    fs.writeFileSync(path.join(paths.outputPath, 'keep'), 'do not replace')
    assert.throws(
      () => generateReadableBundleDiff(paths),
      /Refusing non-empty output directory/,
    )
  })
})
