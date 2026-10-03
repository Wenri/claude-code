import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { accountGeneratedDelta } from '../lib/structural-delta.mjs'

// Synthetic normalization regressions, separate from frozen release ledgers.
function compareSources(baselineSource, targetSource) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'structural-semantics-'))
  try {
    const baseline = path.join(directory, 'baseline.js')
    const target = path.join(directory, 'target.js')
    fs.writeFileSync(baseline, baselineSource)
    fs.writeFileSync(target, targetSource)
    return accountGeneratedDelta(baseline, target)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

for (const [name, baseline, target] of [
  ['external function names', 'parseInt("1.5");', 'parseFloat("1.5");'],
  [
    'automatic semicolon insertion',
    'function f(){return\n1}f();',
    'function f(){return 1}f();',
  ],
  [
    'shorthand property names',
    'const a=1;JSON.stringify({a});',
    'const b=1;JSON.stringify({b});',
  ],
  [
    'shorthand property value bindings with unchanged runtime names',
    'function f(){let a=1,b=2;return JSON.stringify({a})}f();',
    'function f(){let b=1,a=2;return JSON.stringify({a})}f();',
  ],
  [
    'destructuring shorthand assignment bindings with unchanged runtime names',
    'function f(){let a,b;({a,b}={a:1,b:2});return a}f();',
    'function f(){let b,a;({a,b}={a:1,b:2});return b}f();',
  ],
  [
    'defaulted destructuring shorthand bindings with unchanged runtime names',
    'function f(){let a,b;({a=1,b=2}={});return a}f();',
    'function f(){let b,a;({a=1,b=2}={});return b}f();',
  ],
  [
    'bindings observable through direct eval',
    'function f(){let a=1;return eval("typeof a")}f();',
    'function f(){let b=1;return eval("typeof a")}f();',
  ],
  [
    'cross-unit bindings observable through direct eval',
    'const a=1;function f(){return eval("typeof a")}f();',
    'const b=1;function f(){return eval("typeof a")}f();',
  ],
  [
    'ancestor bindings captured by nested direct eval',
    'function f(){let a=1;return (()=>eval("typeof a"))()}f();',
    'function f(){let b=1;return (()=>eval("typeof a"))()}f();',
  ],
  [
    'block bindings shadowing an eval-visible ancestor',
    'function f(){let a=1;{let a=2;return eval("a")}}f();',
    'function f(){let a=1;{let b=2;return eval("a")}}f();',
  ],
  [
    'bindings visible to an unsupported eval argument expression',
    'function f(){let a=1;return eval("typeof x".replace("x","a"))}f();',
    'function f(){let b=1;return eval("typeof x".replace("x","a"))}f();',
  ],
]) {
  test(`structural identity preserves ${name}`, () => {
    assert.notEqual(runInNewContext(baseline), runInNewContext(target))
    const report = compareSources(baseline, target)
    assert.ok(
      report.coverage.units.changed + report.coverage.units.unresolved > 0,
      'behaviorally different bundles must not be entirely exact structural matches',
    )
  })
}

test('direct eval does not prevent renaming unrelated sibling-function locals', () => {
  const baseline = 'function dynamic(code){return eval(code)}function sibling(a){let x=a+1;return x}dynamic("typeof x")+sibling(2);'
  const target = 'function dynamic(code){return eval(code)}function sibling(b){let y=b+1;return y}dynamic("typeof x")+sibling(2);'
  assert.equal(runInNewContext(baseline), runInNewContext(target))
  const report = compareSources(baseline, target)
  assert.equal(report.coverage.units.matched, report.coverage.units.total)
  assert.equal(report.normalization.directEvalIdentifierSpellingPreserved, true)
})

test('eval in a parent scope cannot see locals inside its child function', () => {
  const baseline = 'function parent(code){function child(x){return x+1}return eval(code)+child(2)}parent("typeof x");'
  const target = 'function parent(code){function child(y){return y+1}return eval(code)+child(2)}parent("typeof x");'
  assert.equal(runInNewContext(baseline), runInNewContext(target))
  const report = compareSources(baseline, target)
  assert.equal(report.coverage.units.matched, report.coverage.units.total)
})

test('structural identity preserves named export declarations', () => {
  const report = compareSources(
    'export const a=1;',
    'export const b=1;',
  )
  assert.ok(report.coverage.units.changed + report.coverage.units.unresolved > 0)
})

test('stable shorthand runtime names allow unrelated local and function renaming', () => {
  const baseline = 'function f(){let a=1,b=2;return JSON.stringify({a})+b}f();'
  const target = 'function g(){let a=1,c=2;return JSON.stringify({a})+c}g();'
  assert.equal(runInNewContext(baseline), runInNewContext(target))
  const report = compareSources(baseline, target)
  assert.equal(report.coverage.units.matched, report.coverage.units.total)
})

test('explicit destructuring aliases allow bound-value renaming with fixed keys', () => {
  const baseline = 'function f(){let {a:x,b:y}={a:1,b:2};return x+y}f();'
  const target = 'function g(){let {a:p,b:q}={a:1,b:2};return p+q}g();'
  assert.equal(runInNewContext(baseline), runInNewContext(target))
  const report = compareSources(baseline, target)
  assert.equal(report.coverage.units.matched, report.coverage.units.total)
})

test('ordinary bound alpha renaming still matches across units', () => {
  const baseline = 'const a=1;function add(x){return x+a}add(2);'
  const target = 'const b=1;function sum(y){return y+b}sum(2);'
  assert.equal(runInNewContext(baseline), runInNewContext(target))
  const report = compareSources(baseline, target)
  assert.equal(report.coverage.units.matched, report.coverage.units.total)
  assert.deepEqual(report.normalization, {
    version: 4,
    criterion: 'scope-normalized-token-and-ast-topology-v4',
    externalIdentifierSpellingPreserved: true,
    runtimePropertyAndExportNamesPreserved: true,
    runtimeNameBindingIdentityPreserved: true,
    directEvalIdentifierSpellingPreserved: false,
    directEvalPolicy: 'preserve-lexically-visible-bindings-and-all-bundle-top-or-free-names',
    semanticEquivalenceEstablished: false,
  })
  assert.match(report.claim, /does not prove universal semantics/)
})
