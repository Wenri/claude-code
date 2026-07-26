import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { accountGeneratedDelta } from '../lib/structural-delta.mjs'

function compare(baselineSource, targetSource) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'structural-delta-test-'),
  )
  const baseline = path.join(directory, 'baseline.js')
  const target = path.join(directory, 'target.js')
  fs.writeFileSync(baseline, baselineSource)
  fs.writeFileSync(target, targetSource)
  try {
    return accountGeneratedDelta(baseline, target)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('self comparison accounts for and matches every token', () => {
  const source =
    'var alpha=1,beta=2;function add(value){return value+alpha-beta}console.log(add(3));'
  const report = compare(source, source)
  assert.equal(report.target.failureCount, 0)
  assert.equal(report.coverage.tokens.ledgerTotal, report.target.tokenCount)
  assert.equal(report.coverage.tokens.matched, report.target.tokenCount)
  assert.equal(report.coverage.tokens.changed, 0)
  assert.equal(report.coverage.tokens.moved, 0)
  assert.equal(report.coverage.tokens.unresolved, 0)
})

test('matches scope-correct local and global alpha renaming', () => {
  const report = compare(
    'var alpha=1,beta=2;function add(value){return value+alpha-beta}console.log(add(3));',
    'var q=1,z=2;function g(k){return k+q-z}console.log(g(3));',
  )
  assert.equal(report.coverage.tokens.matched, report.target.tokenCount)
  assert.equal(report.coverage.tokens.unresolved, 0)
})

test('does not hide operand or argument swaps', () => {
  const report = compare(
    'var alpha=1,beta=2;function subtract(){return alpha-beta}subtract(alpha,beta);',
    'var q=1,z=2;function subtract(){return z-q}subtract(z,q);',
  )
  assert.ok(report.coverage.tokens.changed > 0)
  assert.ok(report.coverage.tokens.matched < report.target.tokenCount)
})

test('preserves runtime property keys and shorthand values', () => {
  const report = compare(
    'var alpha=1,beta=2;function value(){return {kept:alpha,alpha}};',
    'var q=1,z=2;function value(){return {kept:z,q}};',
  )
  assert.ok(report.coverage.tokens.changed > 0)
  assert.ok(report.coverage.tokens.matched < report.target.tokenCount)
})

test('classifies exact reordered statements as moved', () => {
  const report = compare(
    'const alpha="alpha literal";const beta="beta literal";',
    'const beta="beta literal";const alpha="alpha literal";',
  )
  assert.equal(report.coverage.units.unresolved, 0)
  assert.ok(report.coverage.units.moved >= 1)
  assert.ok(report.coverage.tokens.moved > 0)
})

test('leaves an added target statement unresolved', () => {
  const report = compare(
    'const alpha="alpha literal";',
    'const alpha="alpha literal";const added="target only";',
  )
  assert.equal(report.coverage.units.unresolved, 1)
  assert.ok(report.coverage.tokens.unresolved > 0)
  assert.equal(report.coverage.tokens.ledgerTotal, report.target.tokenCount)
})
