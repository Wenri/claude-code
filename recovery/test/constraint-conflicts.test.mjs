import assert from 'node:assert/strict'
import test from 'node:test'
import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import { hasConstraintAnchorConflict, conflictingSharedClassGroups } from '../lib/constraint-conflicts.mjs'
import { collectRuntimeNameIdentifiers, indexBindingIdentifiers, deriveBindingConstraints, deriveDeclarationBindingConstraints } from '../lib/binding-name-constraints.mjs'
import { verifyBindingGraph } from '../lib/binding-graph.mjs'
import { strictAstDigest } from '../lib/strict-ast.mjs'

function state(pairs) {
  const established = new Map(pairs.map(pair => [pair.right, pair.left]))
  const establishedReverse = new Map(pairs.map(pair => [pair.left, pair.right]))
  return { established, establishedReverse, sourceAnchors: new Map(established), sourceAnchorsReverse: new Map(establishedReverse) }
}
function add(context, pairs) {
  for (const pair of pairs) {
    context.established.set(pair.right, pair.left)
    context.establishedReverse.set(pair.left, pair.right)
  }
}

test('source conflicts reject ordinarily in either direction without mutating maps', () => {
  const a = {}, b = {}, x = {}, y = {}, context = state([{ left: a, right: x }])
  assert.equal(hasConstraintAnchorConflict({ ...context, pairs: [{ left: a, right: x }] }), false)
  assert.equal(hasConstraintAnchorConflict({ ...context, pairs: [{ left: b, right: x }] }), true)
  assert.equal(hasConstraintAnchorConflict({ ...context, pairs: [{ left: a, right: y }] }), true)
  assert.deepEqual([...context.established], [[x, a]])
  assert.deepEqual([...context.establishedReverse], [[a, x]])
  assert.deepEqual([...context.sourceAnchors], [[x, a]])
})

test('late derived conflicts abort in either direction, including mixed source conflicts', () => {
  const a = {}, b = {}, c = {}, x = {}, y = {}, z = {}, context = state([{ left: a, right: x }])
  add(context, [{ left: b, right: y }])
  for (const pairs of [
    [{ left: c, right: y }], [{ left: b, right: z }],
    [{ left: c, right: x }, { left: c, right: y }],
    [{ left: c, right: y }, { left: c, right: x }],
    [{ left: b, right: x }],
  ]) assert.throws(() => hasConstraintAnchorConflict({ ...context, pairs }), /Late conflict with a derived/)
  assert.equal(context.established.get(y), b)
  assert.equal(context.sourceAnchors.has(y), false)
})

function index(source) {
  const program = parse(source, { ecmaVersion: 2026, sourceType: 'module', ranges: true })
  const manager = analyze(program, { ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true })
  const records = new Map(), top = new Map()
  for (const scope of manager.scopes) for (const variable of scope.variables) {
    const record = { v: variable, scope }; records.set(variable, record)
    if (scope.type === 'module') top.set(variable.name, record)
  }
  const bindingAt = indexBindingIdentifiers([...records.values()])
  const declarations = new Map()
  for (const declaration of program.body) if (declaration.type === 'VariableDeclaration') {
    for (const node of declaration.declarations) declarations.set(node.id.name, { node, declaration })
  }
  return { source, program, top, declarations, bindingAt, runtimeNames: collectRuntimeNameIdentifiers(program) }
}
function derive(left, right, leftName, rightName) {
  const shared = { leftBindingAt: left.bindingAt, rightBindingAt: right.bindingAt,
    leftRuntimeNames: left.runtimeNames, rightRuntimeNames: right.runtimeNames }
  if (left.declarations.has(leftName)) {
    const a = left.declarations.get(leftName), b = right.declarations.get(rightName)
    return deriveDeclarationBindingConstraints({ ...shared, leftNode: a.node, rightNode: b.node,
      leftDeclaration: a.declaration, rightDeclaration: b.declaration })
  }
  return deriveBindingConstraints({ ...shared,
    leftNode: left.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === leftName),
    rightNode: right.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === rightName) })
}
const baseline = 'function first(){return 1}function second(){return 2}const a=()=>first();const b=()=>chain();const chain=()=>second();function seed(){return a()+b()}'
function prepare(rightSource, reverseOrder = false) {
  const left = index(baseline), right = index(rightSource)
  const context = state([{ left: left.top.get('seed'), right: right.top.get('seed') }])
  const first = derive(left, right, 'seed', 'seed')
  assert.equal(first.accepted, true)
  assert.equal(hasConstraintAnchorConflict({ ...context, pairs: first.pairs }), false)
  add(context, first.pairs)
  const second = [derive(left, right, 'a', 'x'), derive(left, right, 'b', 'y')]
  if (reverseOrder) second.reverse()
  // Check every complete result against the same prior-round snapshot.
  for (const result of second) {
    assert.equal(result.accepted, true)
    assert.equal(hasConstraintAnchorConflict({ ...context, pairs: result.pairs }), false)
  }
  add(context, second.flatMap(result => result.pairs))
  return { left, right, context, third: derive(left, right, 'chain', 'link') }
}

test('real AST constraints expose a third-pass conflict regardless of prior traversal order', () => {
  const source = 'function helper(){return 1}const x=()=>helper();const y=()=>link();const link=()=>helper();function seed(){return x()+y()}'
  for (const reverseOrder of [false, true]) {
    const { context, third } = prepare(source, reverseOrder)
    assert.equal(third.accepted, true)
    let reachedEmission = false
    assert.throws(() => {
      hasConstraintAnchorConflict({ ...context, pairs: third.pairs })
      reachedEmission = true
    }, /Late conflict with a derived/)
    assert.equal(reachedEmission, false)
  }
})

test('nonconflicting multi-hop constraints preserve bindings and actual whole AST equality', () => {
  const source = 'function helper(){return 1}function other(){return 2}const x=()=>helper();const y=()=>link();const link=()=>other();function seed(){return x()+y()}'
  const { left, right, context, third } = prepare(source)
  assert.equal(third.accepted, true)
  assert.equal(hasConstraintAnchorConflict({ ...context, pairs: third.pairs }), false)
  add(context, third.pairs)
  const edits = new Map()
  for (const [from, to] of context.established) {
    if (from.v.name === to.v.name) continue
    for (const node of [...from.v.identifiers, ...from.v.references.map(reference => reference.identifier)]) {
      edits.set(node.start, { start: node.start, end: node.end, text: to.v.name })
    }
  }
  const sorted = [...edits.values()].sort((a, b) => a.start - b.start)
  let renamedSource = right.source
  for (const edit of [...sorted].reverse()) renamedSource = renamedSource.slice(0, edit.start) + edit.text + renamedSource.slice(edit.end)
  assert.equal(verifyBindingGraph({ originalSource: source, renamedSource, edits: sorted }).status, 'static-binding-graph-preserved')
  assert.equal(strictAstDigest(renamedSource).sha256, strictAstDigest(left.source).sha256)
  assert.equal(third.semanticEquivalenceEstablished, false)
})

test('changed initializer yields no transactional pairs to expand', () => {
  const left = index('const a=()=>1'), right = index('const b=()=>2')
  const result = derive(left, right, 'a', 'b')
  assert.equal(result.accepted, false)
  assert.equal(Object.hasOwn(result, 'pairs'), false)
})
