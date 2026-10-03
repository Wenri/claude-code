import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import { verifyBindingGraph } from '../lib/binding-graph.mjs'
import { strictAstDigest } from '../lib/strict-ast.mjs'
import { collectRuntimeNameIdentifiers, indexBindingIdentifiers, deriveDeclarationBindingConstraints } from '../lib/binding-name-constraints.mjs'

function index(source, declarationIndex = 0) {
  const program = parse(source, { ecmaVersion: 2026, sourceType: 'module', ranges: true })
  const manager = analyze(program, { ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true })
  const records = manager.scopes.flatMap(scope => scope.variables.map(v => ({ v, scope })))
  const bindingAt = indexBindingIdentifiers(records)
  const declarations = program.body.map(node => node.type === 'ExportNamedDeclaration' ? node.declaration : node)
    .filter(node => node?.type === 'VariableDeclaration')
  return { source, program, declarations, node: declarations[declarationIndex], bindingAt,
    runtimeNames: collectRuntimeNameIdentifiers(program) }
}

function argumentsFor(left, right, single = false) {
  return { leftNode: single ? left.node.declarations[0] : left.node,
    rightNode: single ? right.node.declarations[0] : right.node,
    leftDeclaration: single ? left.node : undefined, rightDeclaration: single ? right.node : undefined,
    leftBindingAt: left.bindingAt, rightBindingAt: right.bindingAt,
    leftRuntimeNames: left.runtimeNames, rightRuntimeNames: right.runtimeNames }
}
const derive = (left, right, single = false) => deriveDeclarationBindingConstraints(argumentsFor(left, right, single))

function emitRight(right, result) {
  assert.equal(result.accepted, true)
  const edits = new Map()
  for (const pair of result.pairs) {
    if (pair.left.v.name === pair.right.v.name) continue
    for (const identifier of [...pair.right.v.identifiers, ...pair.right.v.references.map(reference => reference.identifier)]) {
      const edit = { start: identifier.start, end: identifier.end, text: pair.left.v.name }
      assert(!edits.has(edit.start) || edits.get(edit.start).text === edit.text)
      edits.set(edit.start, edit)
    }
  }
  const sorted = [...edits.values()].sort((a, b) => a.start - b.start)
  let renamedSource = right.source
  for (const edit of [...sorted].reverse()) renamedSource = renamedSource.slice(0, edit.start) + edit.text + renamedSource.slice(edit.end)
  return { originalSource: right.source, renamedSource, edits: sorted }
}

test('derives arrow-local and initializer-helper names with actual edit and AST checks', () => {
  const left = index('function cleanup(x){return x}const work=value=>cleanup(value);')
  const right = index('function dispose(x){return x}const task=input=>dispose(input);')
  for (const single of [false, true]) {
    const result = derive(left, right, single)
    assert.equal(result.accepted, true)
    assert.equal(result.semanticEquivalenceEstablished, false)
    assert(result.pairs.some(pair => pair.left.v.name === 'cleanup' && pair.right.v.name === 'dispose'))
    assert(result.pairs.some(pair => pair.left.v.name === 'value' && pair.right.v.name === 'input'))
    const emitted = emitRight(right, result)
    assert.equal(verifyBindingGraph(emitted).status, 'static-binding-graph-preserved')
    const after = index(emitted.renamedSource)
    assert.equal(strictAstDigest(left.source.slice(left.node.start, left.node.end)).sha256,
      strictAstDigest(after.source.slice(after.node.start, after.node.end)).sha256)
  }
})

test('requires matching declaration kind and actual parents for whole declarators', () => {
  for (const kind of ['var', 'let']) {
    for (const single of [false, true]) assert.equal(derive(index('const a=1'), index(`${kind} b=1`), single).accepted, false)
  }
  const left = index('const a=1'), right = index('const b=1')
  const args = argumentsFor(left, right, true)
  assert.match(deriveDeclarationBindingConstraints({ ...args, leftDeclaration: undefined }).reason, /containing/)
  assert.match(deriveDeclarationBindingConstraints({ ...args, rightDeclaration: index('const b=1').node }).reason, /containing/)
  assert.equal(deriveDeclarationBindingConstraints({ ...args, rightNode: right.node }).accepted, false)
  assert.equal(deriveDeclarationBindingConstraints({ ...argumentsFor(left, right), leftBindingAt: undefined }).accepted, false)
  const unsupported = { ...left.node, kind: 'using' }
  assert.equal(deriveDeclarationBindingConstraints({ ...args, leftDeclaration: unsupported }).accepted, false)
})

test('checks complete ordered initializers, operators, literals and pattern topology transactionally', () => {
  for (const [left, right] of [
    ['const a=1,b=2', 'const x=2,y=1'],
    ['const a=1,b=2', 'const x=1'],
    ['let a', 'let x=undefined'],
    ['const a=1+2', 'const x=1-2'],
    ['const a=[1,2]', 'const x=[2,1]'],
    ['const a=[,1]', 'const x=[undefined,1]'],
    ['const [a,,b]=input', 'const [x,y,]=input'],
    ['const [a,...b]=input', 'const [x,y]=input'],
    ['const a=source?.value', 'const x=source.value'],
    ['const a=()=>1', 'const x=async()=>1'],
  ]) {
    const result = derive(index(left), index(right))
    assert.equal(result.accepted, false, `${left} versus ${right}`)
    assert.equal(Object.hasOwn(result, 'pairs'), false)
  }
  assert.equal(derive(index('const a="x"'), index("const b='x'")).accepted, true)
  assert.equal(derive(index('const a=tag`a`'), index('const b=tag`\\x61`')).accepted, false)
})

test('enforces reciprocal resolved bindings including same spelling and destructuring defaults', () => {
  for (const [left, right] of [
    ['const work=(a,b)=>a+b', 'const item=(x,y)=>y+x'],
    ['const work=(a,b)=>a+a', 'const item=(x,y)=>x+y'],
    ['const work=(a,b)=>a+b', 'const item=(a,b)=>b+a'],
    ['const [a,b=a]=input', 'const [x,y=y]=input'],
  ]) assert.match(derive(index(left), index(right)).reason, /not reciprocal/)
  const accepted = derive(index('const [a,b=a]=input'), index('const [x,y=x]=input'))
  assert.equal(accepted.accepted, true)
})

test('preserves unresolved identifiers, resolution roles and scope category', () => {
  assert.match(derive(index('const a=first()'), index('const b=second()')).reason, /Unresolved identifier name/)
  assert.match(derive(index('function helper(){}const a=helper()'), index('const b=helper()')).reason, /Resolved\/unresolved/)
  const left = index('const a=x=>x'), right = index('const b=y=>y')
  right.bindingAt.get(right.node.declarations[0].init.params[0]).scope = { type: 'block' }
  assert.match(derive(left, right).reason, /scope category/)
})

test('preserves runtime keys, shorthand and exported binding names', () => {
  for (const [left, right] of [
    ['const a={key:1}', 'const b={other:1}'],
    ['const a=source.key', 'const b=source.other'],
    ['const {key:a}=source', 'const {other:b}=source'],
    ['const a=x=>({x})', 'const b=y=>({y})'],
    ['export const a=1', 'export const b=1'],
  ]) assert.equal(derive(index(left), index(right)).accepted, false)
  assert.equal(derive(index('const {key:a=1}=source'), index('const {key:b=1}=source')).accepted, true)
})

test('whole-program checker rejects capture outside the compared initializer', () => {
  const left = index('const helper=()=>1;const work=()=>helper()', 1)
  const right = index('const callback=()=>1;const item=()=>callback();function other(){let helper=2;return callback()}', 1)
  const result = derive(left, right)
  assert.equal(result.accepted, true)
  assert.throws(() => verifyBindingGraph(emitRight(right, result)), /Static reference binding changed/)
})

test('independent declaration hypotheses expose conflicts for aggregate rejection', () => {
  const left = index('function first(){}function second(){}const one=()=>first();const two=()=>second()')
  const right = index('function helper(){}const a=()=>helper();const b=()=>helper()')
  const first = derive(left, right)
  left.node = left.declarations[1]; right.node = right.declarations[1]
  const second = derive(left, right)
  assert.equal(first.accepted, true); assert.equal(second.accepted, true)
  const a = first.pairs.find(pair => pair.right.v.name === 'helper')
  const b = second.pairs.find(pair => pair.right.v.name === 'helper')
  assert.equal(a.right, b.right)
  assert.notEqual(a.left, b.left)
  // Neither pair can be preferred by traversal order. The caller must reconcile
  // both with existing source-position anchors before choosing actual names.
})

test('initializer equality does not establish callee values or semantic equivalence', () => {
  const left = index('function cleanup(){return 1}const work=()=>cleanup()')
  const right = index('function dispose(){return 2}const item=()=>dispose()')
  const result = derive(left, right), emitted = emitRight(right, result)
  assert.equal(result.semanticEquivalenceEstablished, false)
  assert.equal(verifyBindingGraph(emitted).status, 'static-binding-graph-preserved')
  assert.equal(runInNewContext(left.source + ';work()'), 1)
  assert.equal(runInNewContext(emitted.renamedSource + ';work()'), 2)
})

test('a single-declarator hypothesis does not claim sibling grouping or program order', () => {
  const left = index('const a=1,b=2'), right = index('const x=1;const y=2')
  assert.equal(derive(left, right).accepted, false)
  const result = derive(left, right, true)
  assert.equal(result.accepted, true)
  assert.equal(result.semanticEquivalenceEstablished, false)
  assert.notEqual(strictAstDigest(left.source).sha256, strictAstDigest(emitRight(right, result).renamedSource).sha256)
})
