import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import { indexBindingIdentifiers, collectRuntimeNameIdentifiers, deriveDeclarationBindingConstraints, deriveBindingConstraints } from '../lib/binding-name-constraints.mjs'
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
function derive(left, right, a = 0, b = 0) {
  return deriveDeclarationBindingConstraints({ ...context(left, right), leftNode: left.program.body[a], rightNode: right.program.body[b] })
}
function emit(right, pairs) {
  const byStart = new Map()
  for (const pair of pairs) {
    if (pair.left.v.name === pair.right.v.name) continue
    for (const node of [...pair.right.v.identifiers, ...pair.right.v.references.map(ref => ref.identifier)]) {
      const edit = { start: node.start, end: node.end, text: pair.left.v.name }
      assert(!byStart.has(edit.start) || byStart.get(edit.start).text === edit.text)
      byStart.set(edit.start, edit)
    }
  }
  const edits = [...byStart.values()].sort((a, b) => a.start - b.start)
  let renamedSource = right.source
  for (const edit of [...edits].reverse()) renamedSource = renamedSource.slice(0, edit.start) + edit.text + renamedSource.slice(edit.end)
  const result = { originalSource: right.source, renamedSource, edits }
  assert.equal(verifyBindingGraph(result).status, 'static-binding-graph-preserved')
  return result
}
function round(groups) {
  const proposed = groups.flatMap(group => group.pairs.map(pair => ({ ...pair, group })))
  const forwardConstraints = new Map(), reverseConstraints = new Map()
  for (const pair of proposed) {
    const f = forwardConstraints.get(pair.right) ?? new Set(), r = reverseConstraints.get(pair.left) ?? new Set()
    f.add(pair.left); r.add(pair.right); forwardConstraints.set(pair.right, f); reverseConstraints.set(pair.left, r)
  }
  const blocked = conflictingSharedClassGroups({ proposed, forwardConstraints, reverseConstraints })
  return { blocked, accepted: proposed.filter(pair => !blocked.has(pair.group) && forwardConstraints.get(pair.right).size === 1 && reverseConstraints.get(pair.left).size === 1) }
}

test('production index preserves both class owners, including a twin with no references', () => {
  for (const body of ['static self(){return NAME}}return NAME', '}}']) {
    const template = body === '}}' ? 'const FN=()=>{class NAME{}};' : `const FN=()=>{class NAME{${body}};`
    const left = index(template.replaceAll('FN', 'a').replaceAll('NAME', 'Apple'))
    const right = index(template.replaceAll('FN', 'b').replaceAll('NAME', 'Pear'))
    const result = derive(left, right)
    assert.equal(result.accepted, true, result.reason)
    const pairs = result.pairs.filter(pair => pair.right.v.name === 'Pear')
    assert.equal(pairs.length, 2)
    assert.deepEqual(pairs.map(pair => pair.right.scope.type).sort(), ['class', 'function'])
    assert(pairs.every(pair => pair.sharedClassOwner === true))
    const emitted = emit(right, result.pairs)
    assert.equal(strictAstDigest(left.source).sha256, strictAstDigest(emitted.renamedSource).sha256)
    assert.equal(result.semanticEquivalenceEstablished, false)
  }
})

test('single-owner class expressions remain supported and co-owner record order is irrelevant', () => {
  const left = index('const a=class Apple{self(){return Apple}};'), right = index('const b=class Pear{self(){return Pear}};')
  const result = derive(left, right)
  assert.equal(result.accepted, true)
  assert.equal(result.pairs.filter(pair => pair.right.v.name === 'Pear').length, 1)
  assert.equal(result.pairs.some(pair => pair.sharedClassOwner), false)
  const a = index('const a=()=>{class Apple{}return Apple};'), b = index('const b=()=>{class Pear{}return Pear};')
  const node = b.program.body[0].declarations[0].init.body.body[0].id
  b.bindingAt.get(node).reverse()
  assert.equal(derive(a, b).accepted, true)
})

test('missing, extra, malformed or unknown multi-owner tokens fail closed', () => {
  const source = 'const a=()=>{class Apple{}return Apple};'
  for (const mutate of [
    rows => [rows[0]], rows => [...rows, rows[0]], rows => [rows[0], rows[0]],
    rows => [rows[0], { ...rows[1], scope: { ...rows[1].scope, upper: {} } }],
    rows => [rows[0], { ...rows[1], v: { ...rows[1].v, defs: [] } }],
    rows => [null, rows[1]], rows => [undefined, rows[1]],
    rows => [rows[0], { ...rows[1], v: { ...rows[1].v, identifiers: null } }],
    () => null,
  ]) {
    const left = index(source), right = index(source), node = right.program.body[0].declarations[0].init.body.body[0].id
    right.bindingAt.set(node, mutate(right.bindingAt.get(node)))
    const result = derive(left, right)
    assert.equal(result.accepted, false)
    assert.equal(Object.hasOwn(result, 'pairs'), false)
  }
  const left = index(source), right = index(source), node = right.program.body[0].declarations[0].init.body.body[0].id
  right.bindingAt.set(node, right.bindingAt.get(node)[0])
  assert.match(derive(left, right).reason, /ownership count/)
})

test('same-spelling class reference swaps and observable token names remain guarded', () => {
  const left = index('const a=()=>{class A{}class B{}return [A,B]};')
  const right = index('const a=()=>{class A{}class B{}return [B,A]};')
  assert.match(derive(left, right).reason, /not reciprocal/)
  assert.equal(derive(index('const a=()=>{class Apple{}return {Apple}};'), index('const b=()=>{class Pear{}return {Pear}};')).accepted, false)
  const old = index('class Apple{};const a=()=>Apple;export {Apple};'), next = index('class Pear{};const b=()=>Pear;export {Pear};')
  const pair = derive(old, next, 2, 2).pairs.find(pair => pair.right.v.name === 'Pear')
  // The production emitter checks all uses of each proposed binding, not only
  // the compared fragment. The external export token therefore forbids its edit.
  assert([...pair.right.v.identifiers, ...pair.right.v.references.map(ref => ref.identifier)].some(node => next.runtimeNames.has(node)))
})

test('an outer conflict rejects its complete coordinated group without choosing a winner', () => {
  const left = index('const a=()=>{class Apple{}return ()=>Apple};const b=()=>{class Banana{}return ()=>Banana};')
  const right = index('const x=()=>{class Pear{}return ()=>Pear};')
  const group = derive(left, right)
  const other = deriveBindingConstraints({ ...context(left, right),
    leftNode: left.program.body[1].declarations[0].init.body.body[1].argument,
    rightNode: right.program.body[0].declarations[0].init.body.body[1].argument })
  assert.equal(group.accepted, true); assert.equal(other.accepted, true)
  for (const groups of [[group, other], [other, group]]) {
    const result = round(groups)
    assert(result.blocked.has(group))
    assert.equal(result.accepted.some(pair => pair.group === group), false)
  }
  const outer = group.pairs.find(pair => pair.right.v.name === 'Pear' && pair.right.scope.type === 'function')
  const established = new Map([[outer.right, outer.left]]), establishedReverse = new Map([[outer.left, outer.right]])
  const state = { established, establishedReverse, sourceAnchors: new Map(established), sourceAnchorsReverse: new Map(establishedReverse) }
  assert.equal(hasConstraintAnchorConflict({ ...state, pairs: other.pairs }), true)
  assert.equal(established.get(outer.right), outer.left)
  assert.equal(established.size, 1)
})

test('actual v10 gap117 complete declarator crosses the shared class token without losing graph context', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./shared-class-v10-fixture.json', import.meta.url)))
  const sources = {}
  for (const side of ['baseline', 'candidate']) {
    for (const row of fixture[side]) {
      assert.equal(Buffer.byteLength(row.text), row.bytes)
      assert.equal(crypto.createHash('sha256').update(row.text).digest('hex'), row.sha256)
    }
    sources[side] = index(fixture[side].map(row => row.text).join(''))
  }
  const { baseline: left, candidate: right } = sources
  const result = derive(left, right, 1, 1)
  assert.equal(result.accepted, true, result.reason)
  assert.equal(result.pairs.filter(pair => pair.left.v.name === 'BE1').length, 2)
  assert(result.pairs.some(pair => pair.left.v.name === 'c64' && pair.right.v.name === '__audit_unmapped_63'))
  const helper = derive(left, right)
  assert.equal(helper.accepted, true)
  const emitted = emit(right, [...result.pairs, ...helper.pairs])
  assert.equal(strictAstDigest(left.source).sha256, strictAstDigest(emitted.renamedSource).sha256)
  assert.equal(fixture.sourceEquivalenceEstablished, false)
})

test('either outer or self owner conflicts reject groups in both reciprocal directions', () => {
  const make = (a, A, b, B) => `const ${a}=()=>{class ${A}{static self(){return ${A}}}return ()=>${A}};const ${b}=()=>{class ${B}{static self(){return ${B}}}return ()=>${B}};`
  const left = index(make('a', 'Apple', 'b', 'Banana')), right = index(make('x', 'Pear', 'y', 'Peach'))
  const group = derive(left, right)
  assert.equal(group.accepted, true)
  for (const role of ['outer', 'self']) for (const direction of ['forward', 'reverse']) {
    const body = (data, i) => data.program.body[i].declarations[0].init.body.body
    const functionNode = (data, i) => role === 'outer' ? body(data, i)[1].argument : body(data, i)[0].body.body[0].value
    const other = deriveBindingConstraints({ ...context(left, right),
      leftNode: functionNode(left, direction === 'forward' ? 1 : 0),
      rightNode: functionNode(right, direction === 'forward' ? 0 : 1) })
    assert.equal(other.accepted, true)
    for (const groups of [[group, other], [other, group]]) {
      const result = round(groups)
      assert(result.blocked.has(group), `${role} ${direction}`)
      assert.equal(result.accepted.some(pair => pair.group === group), false)
    }
  }
})
