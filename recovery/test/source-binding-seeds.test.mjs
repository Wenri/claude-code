import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import { deriveSourceBindingSeeds } from '../lib/source-binding-seeds.mjs'
import { collectRuntimeNameIdentifiers, deriveClassBindingConstraints, indexBindingIdentifiers } from '../lib/binding-name-constraints.mjs'
import { hasConstraintAnchorConflict } from '../lib/constraint-conflicts.mjs'
import { canonicalSourcePath, identicalSourcePaths, indexSourceContents } from '../lib/source-identity.mjs'
import { loadSelectedMappings } from '../lib/source-map.mjs'
import { createUtf16PositionLookup } from '../lib/utf16-source-positions.mjs'
import { verifyBindingGraph } from '../lib/binding-graph.mjs'
import { strictAstDigest } from '../lib/strict-ast.mjs'

const sourceKey = 'node_modules/zod/v4/core/util.js:490:13'
function reindex(data) {
  data.byKey = new Map(); data.byReference = new Map()
  for (const row of data.variables) {
    if (row.key) data.byKey.set(row.key, [...data.byKey.get(row.key) ?? [], row])
    for (const ref of row.refs) data.byReference.set(ref, [...data.byReference.get(ref) ?? [], row])
  }
  return data
}
function index(text, classNames = []) {
  const ast = parse(text, { ecmaVersion: 2026, sourceType: 'module', ranges: true })
  const scope = analyze(ast, { ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true })
  const variables = scope.scopes.flatMap(scope => scope.variables.map(v => ({ v, scope, key: null, refs: [] })))
  for (const row of variables) if (classNames.includes(row.v.name) && row.v.defs[0]?.type === 'ClassName') row.key = sourceKey
  return reindex({ text, ast, scope, variables, bindingAt: indexBindingIdentifiers(variables), runtimeNames: collectRuntimeNameIdentifiers(ast) })
}
const owners = (data, name) => data.variables.filter(row => row.v.name === name && row.v.defs[0]?.type === 'ClassName')
const outer = (data, name) => owners(data, name).find(row => row.scope.type !== 'class')
function classConstraints(left, right, leftNode = left.ast.body[0], rightNode = right.ast.body[0]) {
  return deriveClassBindingConstraints({ leftNode, rightNode,
    leftBindingAt: left.bindingAt, rightBindingAt: right.bindingAt,
    leftRuntimeNames: left.runtimeNames, rightRuntimeNames: right.runtimeNames })
}

// Run the actual bounded indexing/emission portions of the hash-pinned CLI.
// No full bundle parsing, CLI input bypass, output writes, or copied safety loop.
const comparator = fs.readFileSync(new URL('../scripts/compare-baseline-source-functions.mjs', import.meta.url), 'utf8')
assert.match(comparator, /const \{pairs,ambiguous,missing\}=deriveSourceBindingSeeds\(old,rebuilt\);/)
assert.match(comparator, /const toolFiles=.*'source-binding-seeds\.mjs'/)
const indexStart = comparator.indexOf('function index(jsPath,mapPath,sourcePrefixes){')
const indexEnd = comparator.indexOf("if(sha(fs.readFileSync(options['--baseline-bundle']))", indexStart)
assert(indexStart > 0 && indexEnd > indexStart)
function productionIndex(matchingSources) {
  return new Function('fs', 'parse', 'analyze', 'canonicalSourcePath', 'createUtf16PositionLookup', 'loadSelectedMappings',
    'indexBindingIdentifiers', 'collectRuntimeNameIdentifiers', 'matchingSources',
    `${comparator.slice(indexStart, indexEnd)}\nreturn index;`)(fs, parse, analyze, canonicalSourcePath,
    createUtf16PositionLookup, loadSelectedMappings, indexBindingIdentifiers, collectRuntimeNameIdentifiers, matchingSources)
}
const emitStart = comparator.indexOf('const removed=[],captureRepairEvidence=[];')
const emitEnd = comparator.indexOf("fs.mkdirSync(path.dirname(path.resolve(options['--output']))", emitStart)
assert(emitStart > 0 && emitEnd > emitStart)
const emit = new Function('rebuilt', 'pairs', 'parse', 'verifyBindingGraph', 'console',
  `${comparator.slice(emitStart, emitEnd)}\nreturn {named,allEdits,bindingGraph,removed,captureRepairs};`)
const emission = (data, pairs) => emit(data, pairs, parse, verifyBindingGraph, { log() {} })
const strictEqual = (left, right) => strictAstDigest(left).sha256 === strictAstDigest(right).sha256

function vlq(value) {
  let result = '', encoded = value < 0 ? -value * 2 + 1 : value * 2
  do { let digit = encoded & 31; encoded >>>= 5; if (encoded) digit |= 32; result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[digit] } while (encoded)
  return result
}
function sourceMap(text, prefix, content, source = 'node_modules/zod/v4/core/util.js') {
  const data = index(text), row = data.variables.find(row => row.v.defs[0]?.type === 'ClassName' && row.scope.type === 'module')
  const positions = [
    { node: row.v.identifiers[0], line: 490, column: 13 },
    ...row.v.references.map((ref, i) => ({ node: ref.identifier, line: 500 + i, column: 5 })),
  ].sort((a, b) => a.node.start - b.node.start)
  let generated = 0, line = 0, column = 0
  const segments = []
  for (const item of positions) {
    segments.push([item.node.start - generated, 0, item.line - line, item.column - column].map(vlq).join(''))
    segments.push(vlq(item.node.end - item.node.start))
    generated = item.node.end; line = item.line; column = item.column
  }
  return { version: 3, sources: [prefix + source], sourcesContent: [content], names: [], mappings: segments.join(',') }
}
function mappedPair(leftText, rightText, { leftContent = 'same source content', rightContent = leftContent, rightSource } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-class-seeds-'))
  try {
    const leftMap = sourceMap(leftText, '../', leftContent), rightMap = sourceMap(rightText, '/build/', rightContent, rightSource)
    const matching = identicalSourcePaths(indexSourceContents(leftMap, ['../']), indexSourceContents(rightMap, ['/build/']))
    const lookup = productionIndex(matching), result = []
    for (const [name, text, map, prefixes] of [['left', leftText, leftMap, ['../']], ['right', rightText, rightMap, ['/build/']]]) {
      const jsPath = path.join(dir, name + '.js'), mapPath = path.join(dir, name + '.map')
      fs.writeFileSync(jsPath, text); fs.writeFileSync(mapPath, JSON.stringify(map))
      result.push(lookup(jsPath, mapPath, prefixes))
    }
    return result
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

test('production source indexing seeds both class roles from one declaration and only one getter reference', () => {
  const leftText = 'class SX7{constructor(...q){}}const getter=()=>SX7;'
  const rightText = 'class FX7{constructor(...q){}}const getter=()=>FX7;'
  const [left, right] = mappedPair(leftText, rightText)
  assert.equal(left.byKey.get(sourceKey).length, 2)
  assert.deepEqual(owners(right, 'FX7').map(row => row.refs.length), [1, 0])
  const result = deriveSourceBindingSeeds(left, right)
  assert.equal(result.pairs.length, 2)
  assert.deepEqual(result.pairs.map(pair => [pair.old.scope.type, pair.row.scope.type]), [['module', 'module'], ['class', 'class']])
  assert(result.pairs.every(pair => pair.basis === 'shared-class-source-declaration-position' && pair.referenceEvidence.length < 2))
  const output = emission(right, result.pairs)
  assert.equal(output.bindingGraph.status, 'static-binding-graph-preserved')
  assert.equal(strictEqual(leftText, output.named), true)
  assert.equal(classConstraints(left, right).semanticEquivalenceEstablished, false)
})

test('changed source content or distinct full paths cannot supply class keys or reference seeds', () => {
  const leftText = 'class A{}const getter=()=>A;', rightText = 'class B{}const getter=()=>B;'
  for (const options of [{ rightContent: 'changed source content' }, { rightSource: 'node_modules/other/node_modules/zod/v4/core/util.js' }]) {
    const [left, right] = mappedPair(leftText, rightText, options)
    assert.equal(left.byKey.size, 0); assert.equal(right.byKey.size, 0)
    assert.equal(deriveSourceBindingSeeds(left, right).pairs.length, 0)
  }
})

test('record order is irrelevant and nested enclosing scopes retain their exact role', () => {
  for (const [a, b] of [
    ['class A{}', 'class B{}'],
    ['function f(){class A{}return A}', 'function f(){class B{}return B}'],
    ['{class A{static self(){return A}}}', '{class B{static self(){return B}}}'],
  ]) {
    const left = index(a, ['A']), right = index(b, ['B'])
    right.byKey.get(sourceKey).reverse(); right.variables.reverse()
    const result = deriveSourceBindingSeeds(left, right)
    assert.equal(result.pairs.length, 2)
    assert(result.pairs.every(pair => pair.old.scope.type === pair.row.scope.type))
    assert.equal(strictEqual(a, emission(right, result.pairs).named), true)
  }
  const left = index('class A{}', ['A']), right = index('function f(){class B{}}', ['B'])
  assert.equal(deriveSourceBindingSeeds(left, right).pairs.length, 0)
})

test('extra, mixed-declaration, duplicate, malformed and unknown ownership groups fail closed', () => {
  const mutations = [
    rows => [...rows, rows[0]], rows => [rows[0], rows[0]], rows => [rows[0]], () => null,
    rows => [rows[0], null], rows => [rows[0], { ...rows[1], scope: { ...rows[1].scope, upper: {} } }],
    rows => [rows[0], { ...rows[1], scope: { ...rows[1].scope, block: {} } }],
    rows => [rows[0], { ...rows[1], v: { ...rows[1].v, defs: [] } }],
    rows => [rows[0], { ...rows[1], v: { ...rows[1].v, defs: [{ ...rows[1].v.defs[0], type: 'Variable' }] } }],
    rows => [rows[0], { ...rows[1], v: { ...rows[1].v, defs: [{ ...rows[1].v.defs[0], name: { ...rows[1].v.defs[0].name } }] } }],
    rows => [rows[0], { ...rows[1], v: { ...rows[1].v, identifiers: [...rows[1].v.identifiers, rows[1].v.identifiers[0]] } }],
    rows => [rows[0], { ...rows[1], v: { ...rows[1].v, identifiers: null } }],
    rows => [rows[0], { ...rows[1], key: sourceKey + ':other' }],
  ]
  for (const side of ['left', 'right']) for (const mutate of mutations) {
    const left = index('class A{}', ['A']), right = index('class B{}', ['B'])
    const changed = side === 'left' ? left : right
    changed.byKey.set(sourceKey, mutate(changed.byKey.get(sourceKey)))
    const result = deriveSourceBindingSeeds(left, right)
    // A one-record group on both sides is the pre-existing unique-source path;
    // this test changes only one side, so it must never select a class role.
    assert.equal(result.pairs.length, 0)
  }
  for (const side of ['left', 'right']) {
    const left = index('class A{}class C{}', ['A']), right = index('class B{}class D{}', ['B'])
    const changed = side === 'left' ? left : right, name = side === 'left' ? 'C' : 'D'
    changed.byKey.set(sourceKey, [changed.byKey.get(sourceKey)[0], owners(changed, name)[1]])
    assert.equal(deriveSourceBindingSeeds(left, right).pairs.length, 0)
  }
  const left = index('const A=class Inner{};', ['Inner']), right = index('const B=class Other{};', ['Other'])
  // Class expressions keep their existing single-owner path; they are never
  // promoted to a coordinated declaration merely because scope.type is class.
  left.byKey.set(sourceKey, [owners(left, 'Inner')[0], owners(left, 'Inner')[0]])
  right.byKey.set(sourceKey, [owners(right, 'Other')[0], owners(right, 'Other')[0]])
  assert.equal(deriveSourceBindingSeeds(left, right).pairs.length, 0)
})

test('one contradictory reference rejects both roles, even when reference votes are split', () => {
  for (const role of [0, 1]) for (const split of [false, true]) {
    const left = index('class A{}class C{}class D{}', ['A']), right = index('class B{}', ['B'])
    owners(right, 'B')[role].refs = split ? ['ref-C', 'ref-D'] : ['ref-C']
    owners(left, 'C')[role].refs = ['ref-C']; owners(left, 'D')[role].refs = ['ref-D']
    reindex(left); reindex(right)
    assert.equal(deriveSourceBindingSeeds(left, right).pairs.length, 0)
  }
})

test('nonreciprocal source proposals reject the complete class group without choosing a winner', () => {
  for (const role of [0, 1]) for (const reversed of [false, true]) {
    const left = index('class A{static get(){return [A,A]}}const get=()=>[A,A];', ['A'])
    const right = index('class B{}class Other{static get(){return [Other,Other]}}const get=()=>[Other,Other];', ['B'])
    owners(left, 'A')[role].refs = ['ref-1', 'ref-2']
    owners(right, 'Other')[role].refs = ['ref-1', 'ref-2']
    reindex(left); reindex(right)
    if (reversed) right.variables.reverse()
    assert.equal(deriveSourceBindingSeeds(left, right).pairs.length, 0)
  }
})

test('ordinary unique declaration and two-reference seeds keep their prior behavior', () => {
  const left = index('let a=1;const f=()=>[a,a]'), right = index('let b=1;const g=()=>[b,b]')
  const a = left.variables.find(row => row.v.name === 'a'), b = right.variables.find(row => row.v.name === 'b')
  a.key = b.key = 'src/ordinary.ts:1:0'; reindex(left); reindex(right)
  assert.equal(deriveSourceBindingSeeds(left, right).pairs[0].basis, 'unique-source-declaration-position')
  a.key = b.key = null; a.refs = b.refs = ['ref-1', 'ref-2']; reindex(left); reindex(right)
  assert.equal(deriveSourceBindingSeeds(left, right).pairs[0].basis, 'unique-source-reference-positions')
  b.refs = ['ref-1']; reindex(right)
  assert.equal(deriveSourceBindingSeeds(left, right).pairs.length, 0)
})

test('source seeds still require whole-class and source-anchor gates before deriving interior names', () => {
  const left = index('class A{method(q){return q}}', ['A']), right = index('class B{method(k){return k}}', ['B'])
  const seeds = deriveSourceBindingSeeds(left, right).pairs
  assert.equal(seeds.length, 2)
  assert.equal(strictEqual(left.text, emission(right, seeds).named), false)
  const constraints = classConstraints(left, right)
  assert.equal(constraints.accepted, true)
  const all = [...seeds, ...constraints.pairs.map(pair => ({ row: pair.right, old: pair.left, from: pair.right.v.name, to: pair.left.v.name }))]
  assert.equal(strictEqual(left.text, emission(right, all).named), true)
  for (const [a, b] of [
    ['class A{method(){return missing}}', 'class B{method(){return changed}}'],
    ['class A{method(){return 1}}', 'class B{method(){return 2}}'],
    ['class A{method(){}}', 'class B{other(){}}'],
    ['class A{method(q,k){return q+k}}', 'class B{method(q,k){return k+q}}'],
  ]) {
    const x = index(a, ['A']), y = index(b, ['B'])
    assert.equal(classConstraints(x, y).accepted, false)
    assert.equal(strictEqual(a, emission(y, deriveSourceBindingSeeds(x, y).pairs).named), false)
  }
  const x = index('const helper=1,other=2;class A{method(){return helper}}', ['A'])
  const y = index('const local=1;class B{method(){return local}}', ['B'])
  const result = classConstraints(x, y, x.ast.body[1], y.ast.body[1])
  assert.equal(result.accepted, true)
  const local = y.variables.find(row => row.v.name === 'local'), wrong = x.variables.find(row => row.v.name === 'other')
  const established = new Map([[local, wrong]]), establishedReverse = new Map([[wrong, local]])
  assert.equal(hasConstraintAnchorConflict({ pairs: result.pairs, established, establishedReverse,
    sourceAnchors: new Map(established), sourceAnchorsReverse: new Map(establishedReverse) }), true)
})

test('the production emitter still excludes observable names and repairs outside lexical capture', () => {
  const left = index('class A{}const get=()=>A;export {A};', ['A'])
  const right = index('class B{}const get=()=>B;export {B};', ['B'])
  const result = emission(right, deriveSourceBindingSeeds(left, right).pairs)
  assert.equal(result.named, right.text)
  assert.equal(result.bindingGraph.status, 'static-binding-graph-preserved')
  assert.equal(strictEqual(left.text, result.named), false)
  const a = index('class A{}', ['A']), b = index('class B{}function outside(){let A=0;return B}', ['B'])
  const repaired = emission(b, deriveSourceBindingSeeds(a, b).pairs)
  assert(repaired.captureRepairs > 0)
  assert.match(repaired.named, /class A\{\}/)
  assert.match(repaired.named, /let __audit_capture_/)
  assert.equal(repaired.bindingGraph.status, 'static-binding-graph-preserved')
})
