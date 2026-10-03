import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import { indexBindingIdentifiers, collectRuntimeNameIdentifiers, deriveClassBindingConstraints, deriveBindingConstraints } from '../lib/binding-name-constraints.mjs'
import { conflictingSharedClassGroups, hasConstraintAnchorConflict } from '../lib/constraint-conflicts.mjs'
import { verifyBindingGraph } from '../lib/binding-graph.mjs'
import { strictAstDigest } from '../lib/strict-ast.mjs'

function index(source) {
  const program = parse(source, { ecmaVersion: 2026, sourceType: 'module', ranges: true })
  const manager = analyze(program, { ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true })
  const records = manager.scopes.flatMap(scope => scope.variables.map(v => ({ v, scope })))
  return { source, program, records, bindingAt: indexBindingIdentifiers(records), runtimeNames: collectRuntimeNameIdentifiers(program) }
}
const context = (left, right) => ({ leftBindingAt: left.bindingAt, rightBindingAt: right.bindingAt,
  leftRuntimeNames: left.runtimeNames, rightRuntimeNames: right.runtimeNames })
const derive = (left, right, a = 0, b = a) => deriveClassBindingConstraints({ ...context(left, right),
  leftNode: left.program.body[a], rightNode: right.program.body[b] })
function emit(right, pairs) {
  const edits = new Map()
  for (const pair of pairs) {
    if (pair.left.v.name === pair.right.v.name) continue
    for (const node of [...pair.right.v.identifiers, ...pair.right.v.references.map(ref => ref.identifier)]) {
      const edit = { start: node.start, end: node.end, text: pair.left.v.name }
      assert(!edits.has(edit.start) || edits.get(edit.start).text === edit.text)
      edits.set(edit.start, edit)
    }
  }
  const sorted = [...edits.values()].sort((a, b) => a.start - b.start)
  let renamedSource = right.source
  for (const edit of [...sorted].reverse()) renamedSource = renamedSource.slice(0, edit.start) + edit.text + renamedSource.slice(edit.end)
  return { originalSource: right.source, renamedSource, edits: sorted }
}
function round(groups) {
  const proposed = groups.flatMap(group => group.pairs.map(pair => ({ ...pair, group })))
  const forwardConstraints = new Map(), reverseConstraints = new Map()
  for (const pair of proposed) {
    const f = forwardConstraints.get(pair.right) ?? new Set(), r = reverseConstraints.get(pair.left) ?? new Set()
    f.add(pair.left); r.add(pair.right); forwardConstraints.set(pair.right, f); reverseConstraints.set(pair.left, r)
  }
  const blocked = conflictingSharedClassGroups({ proposed, forwardConstraints, reverseConstraints })
  return { blocked, accepted: proposed.filter(pair => !blocked.has(pair.group) &&
    forwardConstraints.get(pair.right).size === 1 && reverseConstraints.get(pair.left).size === 1) }
}

// Exercise the actual production seed traversal without invoking its hash-pinned
// full-bundle CLI. The fragment has the same objects and guards as the comparator.
const comparator = fs.readFileSync(new URL('../scripts/compare-baseline-source-functions.mjs', import.meta.url), 'utf8')
const start = comparator.indexOf('const seenConstraintClasses=new Set();')
const end = comparator.indexOf('const statsForKind=', start)
assert(start > 0 && end > start)
const productionSeeds = new Function('old', 'rebuilt', 'anchorSnapshot', 'sourceAnchors', 'anchorConflicts',
  'deriveClassBindingConstraints', `const proposed=[];const classConstraintStats={sourcePairedClasses:0,derivedPairedClasses:0,completeShapeAccepted:0,anchorConflicts:0};\n${comparator.slice(start, end)}\nreturn {proposed,classConstraintStats};`)
function seeds(left, right, anchors, source = anchors) {
  const established = new Map(anchors.map(a => [a.row, a.old])), establishedReverse = new Map(anchors.map(a => [a.old, a.row]))
  const sourceAnchors = new Map(source.map(a => [a.row, a.old])), sourceAnchorsReverse = new Map(source.map(a => [a.old, a.row]))
  return productionSeeds(left, right, anchors, sourceAnchors,
    result => hasConstraintAnchorConflict({ pairs: result.pairs, established, establishedReverse, sourceAnchors, sourceAnchorsReverse }),
    deriveClassBindingConstraints)
}

function classAnchor(left, right, a, b = a, key = 'fixture-source-position') {
  const outer = (data, node) => data.records.find(row => row.scope.type === 'module' && row.v.identifiers.includes(node.id))
  return { old: outer(left, left.program.body[a]), row: outer(right, right.program.body[b]), key }
}

test('only complete named class declarations enter the new API', () => {
  const left = index('class Apple{}'), right = index('class Pear{}')
  assert.equal(derive(left, right).accepted, true)
  for (const node of [
    index('const a=class Named{}').program.body[0].declarations[0].init,
    index('function f(){}').program.body[0],
    index('export default class{}').program.body[0].declaration,
    { ...left.program.body[0], body: null },
  ]) assert.match(deriveClassBindingConstraints({ ...context(left, right), leftNode: node, rightNode: node }).reason, /Whole named class declarations/)
  assert.equal(deriveClassBindingConstraints({ leftNode: left.program.body[0], rightNode: right.program.body[0] }).accepted, false)
})

test('whole class traversal preserves ordered members, heritage, fields, literals and runtime names', () => {
  for (const [a, b] of [
    ['class A{value=1}', 'class B{value=2}'],
    ['class A extends Parent{}', 'class B extends Other{}'],
    ['class A{first(){}second(){}}', 'class B{second(){}first(){}}'],
    ['class A{method(){}}', 'class B{other(){}}'],
    ['class A{field=1}', 'class B{other=1}'],
    ['class A{static value=1}', 'class B{value=1}'],
    ['class A{static {run(1)}}', 'class B{static {run(2)}}'],
    ['class A{#value=1;get(){return this.#value}}', 'class B{#other=1;get(){return this.#other}}'],
    ['class A{method(q){return {q}}}', 'class B{method(k){return {k}}}'],
    ['class A{method(){return external}}', 'class B{method(){return changed}}'],
  ]) {
    const result = derive(index(a), index(b))
    assert.equal(result.accepted, false, `${a} versus ${b}`)
    assert.equal(Object.hasOwn(result, 'pairs'), false)
  }
  const left = index('export class Apple{}'), right = index('export class Pear{}')
  assert.match(deriveClassBindingConstraints({ ...context(left, right), leftNode: left.program.body[0].declaration,
    rightNode: right.program.body[0].declaration }).reason, /Observable identifier name/)
})

test('reciprocal local names and resolution roles remain required', () => {
  assert.match(derive(index('class A{method(a,b){return a+b}}'), index('class B{method(a,b){return b+a}}')).reason, /not reciprocal/)
  assert.match(derive(index('class Helper{}class A{method(){return Helper}}'), index('class B{method(){return Helper}}'), 1, 0).reason, /Resolved\/unresolved/)
  const left = index('class A{static self(){return A}}'), right = index('class B{static self(){return B}}')
  right.bindingAt.set(right.program.body[0].id, null)
  assert.match(derive(left, right).reason, /Unsupported shared identifier ownership/)
})

test('production traversal needs an existing anchor and deduplicates coordinated owners', () => {
  const left = index('class Apple{method(q){return q}}'), right = index('class Pear{method(k){return k}}')
  assert.equal(seeds(left, right, []).proposed.length, 0)
  const outer = classAnchor(left, right, 0)
  const inner = { old: left.records.find(row => row.scope.type === 'class'), row: right.records.find(row => row.scope.type === 'class'), key: outer.key }
  const result = seeds(left, right, [outer, inner])
  assert.equal(result.classConstraintStats.sourcePairedClasses, 1)
  assert.equal(result.classConstraintStats.completeShapeAccepted, 1)
  assert.equal(new Set(result.proposed.map(pair => pair.group)).size, 1)
  assert.equal(seeds(left, right, [outer], []).classConstraintStats.derivedPairedClasses, 1)
  const a = index('const Apple=class{}'), b = index('const Pear=class{}')
  const unsupported = { old: a.records.find(row => row.v.name === 'Apple'), row: b.records.find(row => row.v.name === 'Pear'), key: 'source' }
  assert.equal(seeds(a, b, [unsupported]).proposed.length, 0)
})

test('source-anchor conflicts reject complete classes and late derived conflicts abort', () => {
  const left = index('class Helper{}class Other{}class A{method(){return Helper}}')
  const right = index('class H{}class B{method(){return H}}')
  const seed = classAnchor(left, right, 2, 1), wrong = classAnchor(left, right, 1, 0)
  const checked = seeds(left, right, [seed, wrong])
  assert.equal(checked.classConstraintStats.anchorConflicts, 1)
  assert.equal(checked.proposed.some(pair => pair.anchor === seed.key && pair.left.v.name === 'Helper'), false)
  assert.throws(() => seeds(left, right, [seed, wrong], [seed]), /Late conflict with a derived naming hypothesis/)
})

test('coordinated class owner conflicts reject their whole original-round groups in either order', () => {
  const left = index('class Apple{static self(){return Apple}}class Banana{static self(){return Banana}}')
  const right = index('class Pear{static self(){return Pear}}')
  const group = derive(left, right)
  const other = deriveBindingConstraints({ ...context(left, right), leftNode: left.program.body[1].body.body[0].value,
    rightNode: right.program.body[0].body.body[0].value })
  assert.equal(group.accepted, true); assert.equal(other.accepted, true)
  for (const groups of [[group, other], [other, group]]) {
    const result = round(groups)
    assert(result.blocked.has(group))
    assert.equal(result.accepted.some(pair => pair.group === group), false)
  }
})

test('whole-program observable uses and capture checks remain obligations after class discovery', () => {
  const left = index('class Helper{}class A{method(){return Helper}};export {Helper};')
  const right = index('class H{}class B{method(){return H}};export {H};')
  const pair = derive(left, right, 1).pairs.find(p => p.right.v.name === 'H')
  assert([...pair.right.v.identifiers, ...pair.right.v.references.map(r => r.identifier)].some(node => right.runtimeNames.has(node)))
  const a = index('class Helper{}class A{method(){return Helper}}')
  const b = index('class H{}class B{method(){return H}}function outside(){let Helper=0;return H}')
  assert.throws(() => verifyBindingGraph(emit(b, derive(a, b, 1).pairs)), /Static reference binding changed/)
})

test('bounded v11 class fixtures discover missing bindings with exact edits and static graph checks', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./whole-class-v11-fixture.json', import.meta.url)))
  assert.equal(fixture.sourceEquivalenceEstablished, false)
  for (const example of fixture.cases) {
    for (const side of ['baseline', 'candidate']) for (const row of example[side]) {
      assert.equal(row.range[1] - row.range[0], row.text.length)
      assert.equal(Buffer.byteLength(row.text), row.bytes)
      assert.equal(crypto.createHash('sha256').update(row.text).digest('hex'), row.sha256)
    }
    const left = index(example.baseline.map(row => row.text).join('')), right = index(example.candidate.map(row => row.text).join(''))
    assert(example.sourceAnchors.every(anchor => anchor.to === example.anchorName && anchor.basis === 'unique-source-reference-positions' && anchor.referenceEvidence.length >= 2))
    const seed = classAnchor(left, right, example.seedIndex, example.seedIndex, example.sourceAnchors[0].origin)
    const first = seeds(left, right, [seed])
    assert.equal(first.classConstraintStats.completeShapeAccepted, 1)
    for (const name of example.expectedDerivedNames) assert(first.proposed.some(p => p.left.v.name === name))
    const anchors = first.proposed.map(pair => ({ old: pair.left, row: pair.right, key: 'derived-from-' + seed.key }))
    const next = seeds(left, right, anchors, [])
    const groups = [...new Set([...first.proposed, ...next.proposed].map(pair => pair.group))]
    const accepted = round(groups)
    assert.equal(accepted.blocked.size, 0)
    const result = emit(right, accepted.accepted)
    assert.equal(verifyBindingGraph(result).status, 'static-binding-graph-preserved')
    assert.equal(strictAstDigest(left.source).sha256, strictAstDigest(result.renamedSource).sha256)
    assert(groups.every(group => group.semanticEquivalenceEstablished === false))
    if (example.anchorName === 'MJ') {
      // A lone outer-reference proposal does not cover the helper's self owner.
      assert.throws(() => verifyBindingGraph(emit(right, first.proposed)), /Static reference binding changed/)
      assert.equal(accepted.accepted.filter(pair => pair.left.v.name === 'wP8' && pair.sharedClassOwner).length, 2)
    }
  }
})
