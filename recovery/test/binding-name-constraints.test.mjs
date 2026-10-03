import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import { verifyBindingGraph } from '../lib/binding-graph.mjs'
import { strictAstDigest } from '../lib/strict-ast.mjs'
import { collectRuntimeNameIdentifiers, indexBindingIdentifiers, deriveBindingConstraints } from '../lib/binding-name-constraints.mjs'

function index(source, functionName = 'work') {
  const program = parse(source, { ecmaVersion: 2026, sourceType: 'module', ranges: true })
  const manager = analyze(program, { ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true })
  const records = manager.scopes.flatMap(scope => scope.variables.map(v => ({ v, scope })))
  const bindingAt = indexBindingIdentifiers(records)
  const nodes = []
  const pending = [program]
  while (pending.length) {
    const node = pending.pop()
    if (!node || typeof node.type !== 'string') continue
    nodes.push(node)
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'range'].includes(key) || !value || typeof value !== 'object') continue
      for (const child of Array.isArray(value) ? value : [value]) if (child?.type) pending.push(child)
    }
  }
  const node = nodes.find(value => value.type === 'FunctionDeclaration' && value.id.name === functionName)
  return { source, program, node, nodes, bindingAt, runtimeNames: collectRuntimeNameIdentifiers(program) }
}

function derive(left, right) {
  return deriveBindingConstraints({ leftNode: left.node, rightNode: right.node,
    leftBindingAt: left.bindingAt, rightBindingAt: right.bindingAt,
    leftRuntimeNames: left.runtimeNames, rightRuntimeNames: right.runtimeNames })
}

function emitRight(right, result) {
  assert.equal(result.accepted, true)
  const edits = new Map()
  for (const pair of result.pairs) {
    const text = pair.left.v.name
    if (text === pair.right.v.name) continue
    for (const identifier of [...pair.right.v.identifiers, ...pair.right.v.references.map(value => value.identifier)]) {
      const prior = edits.get(identifier.start)
      assert(!prior || prior.text === text)
      edits.set(identifier.start, { start: identifier.start, end: identifier.end, text })
    }
  }
  let renamedSource = right.source
  const sorted = [...edits.values()].sort((a, b) => a.start - b.start)
  for (const edit of [...sorted].reverse()) renamedSource = renamedSource.slice(0, edit.start) + edit.text + renamedSource.slice(edit.end)
  return { originalSource: right.source, renamedSource, edits: sorted }
}

test('derives a resolved helper alias then checks actual edits and actual fragment AST', () => {
  const left = index('function cleanup(){} function work(value){cleanup(value)}')
  const right = index('function dispose(){} function work(input){dispose(input)}')
  const result = derive(left, right)
  assert.equal(result.accepted, true)
  assert.equal(result.semanticEquivalenceEstablished, false)
  assert(result.pairs.some(pair => pair.left.v.name === 'cleanup' && pair.right.v.name === 'dispose'))
  const emitted = emitRight(right, result)
  assert.equal(verifyBindingGraph(emitted).status, 'static-binding-graph-preserved')
  const after = index(emitted.renamedSource)
  assert.equal(strictAstDigest(left.source.slice(left.node.start, left.node.end)).sha256,
    strictAstDigest(after.source.slice(after.node.start, after.node.end)).sha256)
})

test('rejects parameter/reference topology swaps and constrains same-spelling references', () => {
  for (const [left, right] of [
    ['function work(a,b){return a+b}', 'function work(c,d){return d+c}'],
    ['function work(a,b){return a+a}', 'function work(c,d){return c+d}'],
    ['function work(a,b){return a+b}', 'function work(a,b){return b+a}'],
  ]) assert.match(derive(index(left), index(right)).reason, /not reciprocal/)
})

test('preserves unresolved names and rejects resolved/unresolved or scope-category changes', () => {
  assert.match(derive(index('function work(){return require("x")}'), index('function work(){return other("x")}')).reason, /Unresolved identifier name/)
  assert.match(derive(index('const x=1;function work(){return x}'), index('function work(){return x}')).reason, /Resolved\/unresolved/)
  const left = index('function work(x){return x}'), right = index('function work(y){return y}')
  const param = right.node.params[0]
  right.bindingAt.get(param).scope = { type: 'block' }
  assert.match(derive(left, right).reason, /scope category/)
})

test('protects property, shorthand, method, label, private and named-export spellings', () => {
  for (const [left, right] of [
    ['function work(x){return x.key}', 'function work(y){return y.other}'],
    ['function work(a){return {a}}', 'function work(b){return {b}}'],
    ['function work(){return {method(){}}}', 'function work(){return {other(){}}}'],
    ['function work(){label:while(true){break label}}', 'function work(){other:while(true){break other}}'],
    ['function work(){class A{#x;get(){return this.#x}}}', 'function work(){class B{#y;get(){return this.#y}}}'],
  ]) assert.equal(derive(index(left), index(right)).accepted, false)
  const left = index('export function publicName(){}', 'publicName')
  const right = index('export function anotherName(){}', 'anotherName')
  assert.match(derive(left, right).reason, /Observable identifier name/)
  assert.equal(derive(index('function work(object,key){return object[key]}'), index('function work(value,index){return value[index]}')).accepted, true)
})

test('collects shared import/export and destructuring default tokens from the whole Program', () => {
  const input = index('import {x, value as alias} from "pkg";export {x,alias as visible};export const {y=1}=object;function work(){return x}')
  const imported = input.program.body[0].specifiers
  assert(input.runtimeNames.has(imported[0].imported))
  assert(input.runtimeNames.has(imported[0].local))
  assert(input.runtimeNames.has(imported[1].imported))
  assert.equal(input.runtimeNames.has(imported[1].local), false)
  const exported = input.program.body[1].specifiers
  assert(input.runtimeNames.has(exported[0].local))
  assert(input.runtimeNames.has(exported[0].exported))
  assert(input.runtimeNames.has(exported[1].exported))
  assert.equal(input.runtimeNames.has(exported[1].local), false)
  const pattern = input.program.body[2].declaration.declarations[0].id.properties[0]
  assert(input.runtimeNames.has(pattern.key))
  assert(input.runtimeNames.has(pattern.value.left))
})

test('rejects every non-name mismatch transactionally without leaking earlier pairs', () => {
  for (const [left, right] of [
    ['function work(a){return a+1}', 'function work(b){return b+2}'],
    ['function work(a){return a+1}', 'function work(b){return b-1}'],
    ['function work(){"use strict";return 1}', 'function work(){"use\\x20strict";return 1}'],
    ['function work(tag){return tag`a`}', 'function work(t){return t`\\x61`}'],
    ['function work(a){return a?.x}', 'function work(b){return b.x}'],
    ['async function work(a){return a}', 'function work(b){return b}'],
    ['function work(){return /x/g}', 'function work(){return /y/g}'],
  ]) {
    const result = derive(index(left), index(right))
    assert.equal(result.accepted, false)
    assert.equal(Object.hasOwn(result, 'pairs'), false)
  }
  assert.equal(derive(index('function work(){return "x"}'), index("function work(){return 'x'}")).accepted, true)
})

test('keeps sibling bindings distinct and supports coordinated shared class tokens', () => {
  const left = index('function work(){function a(){let x=1;return x}function b(){let x=2;return x}return a()+b()}')
  const right = index('function work(){function c(){let y=1;return y}function d(){let z=2;return z}return c()+d()}')
  const result = derive(left, right)
  assert.equal(result.accepted, true)
  assert.equal(result.pairs.filter(pair => pair.left.v.name === 'x').length, 2)
  const oldClass = index('function work(){class Apple{static self(){return Apple}}return new Apple}')
  const newClass = index('function work(){class Pear{static self(){return Pear}}return new Pear}')
  const classResult = derive(oldClass, newClass)
  assert.equal(classResult.accepted, true)
  assert.equal(verifyBindingGraph(emitRight(newClass, classResult)).status, 'static-binding-graph-preserved')
})

test('whole-program checker rejects capture outside the paired function', () => {
  const left = index('function cleanup(){}function work(){cleanup()}')
  const right = index('function dispose(){}function work(){dispose()}function other(){let cleanup=1;return dispose()}')
  const result = derive(left, right)
  assert.equal(result.accepted, true)
  assert.throws(() => verifyBindingGraph(emitRight(right, result)), /Static reference binding changed/)
})

test('candidate pairs expose aggregate conflicts with other anchored functions', () => {
  const oldSource = 'function first(){}function second(){}function work(){first()}function later(){second()}'
  const newSource = 'function helper(){}function work(){helper()}function later(){helper()}'
  const old = index(oldSource), next = index(newSource)
  const first = derive(old, next)
  old.node = old.nodes.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'later')
  next.node = next.nodes.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'later')
  const later = derive(old, next)
  assert.equal(first.accepted, true)
  assert.equal(later.accepted, true)
  const one = first.pairs.find(pair => pair.right.v.name === 'helper')
  const two = later.pairs.find(pair => pair.right.v.name === 'helper')
  assert.equal(one.right, two.right)
  assert.notEqual(one.left, two.left)
  // This API returns hypotheses per function. The caller must reject this
  // aggregate conflict in either traversal order, not accept the first vote.
})

test('matching a caller after naming does not prove its callee implementation', () => {
  const left = index('function cleanup(){return 1}function work(){return cleanup()}')
  const right = index('function dispose(){return 2}function work(){return dispose()}')
  const result = derive(left, right), emitted = emitRight(right, result)
  assert.equal(result.semanticEquivalenceEstablished, false)
  assert.equal(verifyBindingGraph(emitted).status, 'static-binding-graph-preserved')
  assert.equal(runInNewContext(left.source + ';work()'), 1)
  assert.equal(runInNewContext(emitted.renamedSource + ';work()'), 2)
})

test('rejects fragments and missing whole-program context', () => {
  const input = index('function work(){}')
  assert.equal(deriveBindingConstraints({ leftNode: input.program, rightNode: input.program }).accepted, false)
  assert.equal(deriveBindingConstraints({ leftNode: input.node, rightNode: input.node }).accepted, false)
})
