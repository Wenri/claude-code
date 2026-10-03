import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { emitFrozenNaming, inspectCandidateBindings, RESERVED_NAMES } from './backend.mjs'
import { canonical, currentToolPins, ROOT, RECOVERY, sha256 } from './toolchain.mjs'
import { runCLI } from './cli.mjs'

const require = createRequire(path.join(RECOVERY, 'package.json'))
const { parse } = require('acorn')
const pins = currentToolPins()
function fixture(source, changes = {}) {
  const candidateBytes = Buffer.from(source), inventory = inspectCandidateBindings(candidateBytes)
  const recipe = { schemaVersion: 1, kind: 'reviewed-bound-symbol-emission-recipe', targetId: 'tiny-review-only',
    candidate: inventory.candidate, toolPinsSha256: sha256(canonical(pins)), reservedNames: [...RESERVED_NAMES],
    bindings: inventory.bindings.filter(row => Object.hasOwn(changes, row.from)).map(row => ({ ...row, to: changes[row.from] })) }
  return { candidateBytes, recipe, toolPins: pins }
}
function options(f) {
  const recipeBytes = Buffer.from(canonical(f.recipe))
  return { candidateBytes: f.candidateBytes, recipeBytes, expectedRecipeSha256: sha256(recipeBytes), toolPins: f.toolPins }
}
function run(f) { return emitFrozenNaming(options(f)) }
function reject(source, changes, mutate, pattern) {
  const f = fixture(source, changes); mutate?.(f)
  assert.throws(() => run(f), pattern)
}
function verifyReceipt(source, outputBytes, receipt) {
  let inputByte = 0, outputByte = 0, inputUtf16 = 0, outputUtf16 = 0
  const original = Buffer.from(source), output = outputBytes.toString('utf8')
  for (const part of receipt.lineage) {
    assert.equal(part.inputBytes[0], inputByte); assert.equal(part.outputBytes[0], outputByte)
    assert.equal(part.inputUtf16[0], inputUtf16); assert.equal(part.outputUtf16[0], outputUtf16)
    const a = original.subarray(...part.inputBytes), b = outputBytes.subarray(...part.outputBytes)
    if (part.kind === 'unchanged') { assert(a.equals(b)); assert.equal(sha256(a), part.sha256) }
    else { assert.equal(a.toString(), part.from); assert.equal(b.toString(), part.to); assert(Number.isInteger(part.tokenIndex)) }
    assert.equal(a.toString(), source.slice(...part.inputUtf16)); assert.equal(b.toString(), output.slice(...part.outputUtf16))
    inputByte = part.inputBytes[1]; outputByte = part.outputBytes[1]; inputUtf16 = part.inputUtf16[1]; outputUtf16 = part.outputUtf16[1]
  }
  assert.equal(inputByte, original.length); assert.equal(outputByte, outputBytes.length)
  assert.equal(inputUtf16, source.length); assert.equal(outputUtf16, output.length)
  assert.equal(receipt.input.sha256, sha256(original)); assert.equal(receipt.output.sha256, sha256(outputBytes))
}
function stripPositions(value) {
  if (Array.isArray(value)) return value.map(stripPositions)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'range', 'loc'].includes(key)).map(([key, v]) => [key, stripPositions(v)]))
  return value
}

test('emits candidate bytes only, complete references, omitted unchanged bindings and exact unequal-width lineage', () => {
  const source = '#!/usr/bin/env node\n/* 😀 café */ const a=1; function f(x){let z=x+a;return ()=>z+a} f(a);'
  const f = fixture(source, { a: 'longName', x: 'input', z: 'ζ' }), result = run(f)
  const expected = '#!/usr/bin/env node\n/* 😀 café */ const longName=1; function f(input){let ζ=input+longName;return ()=>ζ+longName} f(longName);'
  assert.equal(result.outputBytes.toString(), expected)
  assert.equal(result.receipt.suppliedBindingCount, 3)
  assert.equal(result.receipt.bindingGraph.status, 'static-binding-graph-preserved')
  assert.equal(result.receipt.finalTargetAstEqualityEstablished, false)
  assert.equal(result.receipt.semanticEquivalenceEstablished, false)
  assert.deepEqual(stripPositions(parse(result.outputBytes.toString(), { ecmaVersion: 2026, sourceType: 'module' })), stripPositions(parse(expected, { ecmaVersion: 2026, sourceType: 'module' })))
  verifyReceipt(source, result.outputBytes, result.receipt)
  const a = result.receipt.selectedBindingCoverage.find(row => row.from === 'a')
  assert.equal(a.distinctTokenCount, 4)
  assert.equal(a.referenceRanges.length, 4) // includes initializer write, sharing declaration token
})

test('complete class outer/self owners share one physical declaration edit', () => {
  const source = 'class A extends Base { static self=A; method(){return A} } new A;'
  const f = fixture(source, { A: 'Renamed' }), result = run(f)
  assert.equal(f.recipe.bindings.length, 2)
  assert.equal(result.outputBytes.toString(), 'class Renamed extends Base { static self=Renamed; method(){return Renamed} } new Renamed;')
  assert.deepEqual(result.receipt.edits[0].ownerRecords, [0, 1])
  assert.equal(result.receipt.edits.length, 4)
  verifyReceipt(source, result.outputBytes, result.receipt)
})

test('supports consistent simultaneous swaps and repeated var declaration identity', () => {
  const source = 'var a=1; var a; var b=2; function f(){return a+b}';
  const f = fixture(source, { a: 'b', b: 'a' }), result = run(f)
  assert.equal(result.outputBytes.toString(), 'var b=1; var b; var a=2; function f(){return b+a}')
  assert.equal(f.recipe.bindings[0].identity.identifierRanges.length, 2)
  verifyReceipt(source, result.outputBytes, result.receipt)
})

test('explicit alias imports/exports and computed properties retain external/runtime names', () => {
  const source = 'import {external as a} from "pkg"; export {a as visible}; const obj={}; obj[a]; obj.a;';
  const result = run(fixture(source, { a: 'inner' }))
  assert.equal(result.outputBytes.toString(), 'import {external as inner} from "pkg"; export {inner as visible}; const obj={}; obj[inner]; obj.a;')
})

test('empty and no-op recipes do not require unselected bindings and preserve every byte', () => {
  for (const source of ['', '\ufeffconst x=1; x;', 'const x=1; x;']) for (const changes of [{}, source.includes('x') ? { x: 'x' } : {}]) {
    const result = run(fixture(source, changes))
    assert.equal(result.outputBytes.toString(), source); assert.equal(result.receipt.edits.length, 0)
    verifyReceipt(source, result.outputBytes, result.receipt)
  }
})

test('rejects stale recipe/candidate/tool digests and stale tool closure', () => {
  const f = fixture('let a=1;a;', { a: 'b' }), opts = options(f)
  assert.throws(() => emitFrozenNaming({ ...opts, expectedRecipeSha256: '0'.repeat(64) }), /recipe digest differs/)
  reject('let a=1;a;', { a: 'b' }, f => { f.candidateBytes = Buffer.from('let a=2;a;') }, /Candidate hash differs/)
  reject('let a=1;a;', { a: 'b' }, f => { f.candidateBytes = Buffer.from('let a=10;a;') }, /byte length differs/)
  reject('let a=1;a;', { a: 'b' }, f => { f.recipe.toolPinsSha256 = '0'.repeat(64) }, /tool pins digest differs/)
  assert.throws(() => emitFrozenNaming({ ...opts, toolPins: { ...pins, nodeVersion: 'v0' } }), /tool\/dependency closure or runtime differs/)
})

test('rejects missing, extra, duplicate, stale and spelling-inconsistent symbol records', () => {
  const cases = [
    [f => { f.recipe.bindings[0].identity.scope.index++ }, /declaration identity/],
    [f => { f.recipe.bindings[0].identity.identifierRanges[0][0]++ }, /declaration identity/],
    [f => { f.recipe.bindings[0].identity.definitions[0].kind = 'const' }, /declaration identity/],
    [f => { f.recipe.bindings[0].identity.scope.upperIndex = 123 }, /declaration identity/],
    [f => { f.recipe.bindings[0].from = 'wrong' }, /expected spelling/],
    [f => { f.recipe.bindings.push(structuredClone(f.recipe.bindings[0])) }, /Duplicate binding/],
    [f => { f.recipe.bindings.push({ from: 'ghost', to: 'name', identity: {} }) }, /declaration identity/],
    [f => { f.recipe.bindings[0].referenceRanges = [] }, /unsupported payload/],
  ]
  for (const [mutate, pattern] of cases) reject('let a=1;a;', { a: 'b' }, mutate, pattern)
})

test('rejects partial, conflicting and forged class owner groups', () => {
  const source = 'class A { self(){return A} } new A;'
  reject(source, { A: 'B' }, f => { f.recipe.bindings.pop() }, /complete owner group/)
  reject(source, { A: 'B' }, f => { f.recipe.bindings[1].to = 'C' }, /one target spelling/)
  reject(source, { A: 'B' }, f => { f.recipe.bindings[0].shared = true }, /unsupported payload/)
  reject(source, { A: 'B' }, f => { f.recipe.bindings[1].identity = f.recipe.bindings[0].identity }, /Duplicate binding/)
})

test('rejects same-scope collisions, nested capture, free capture and loss of resolution', () => {
  reject('let a=1,b=2;a+b;', { a: 'b' }, null, /scope name collision/)
  reject('let a=1;function f(b){return a+b}', { a: 'b' }, null, /capture/)
  reject('let a=1;function f(){return external+a}', { a: 'external' }, null, /capture/)
  reject('let outer=1;function f(a){return a+outer}', { a: 'outer' }, null, /capture/)
})

test('default-parameter resolution respects body declaration exclusion without skipping reference checks', () => {
  for (const source of [
    'let x=1; function f(a=x){var x=2;return a+x}',
    'let x=1; function f(a=x){let x=2;return a+x}',
    'function f(a=x){var x=2;return a+x}',
    'let x=1; function f(a=()=>x){var x=2;return a+x}',
  ]) {
    const result = run(fixture(source))
    assert.equal(result.outputBytes.toString(), source)
    assert.equal(result.receipt.bindingGraph.status, 'static-binding-graph-preserved')
  }
  // The body z declaration cannot capture the parameter initializer's z.
  const source = 'let x=1; function f(a=x){var z=2;return a+z}'
  assert.equal(run(fixture(source, { x: 'z' })).outputBytes.toString(), 'let z=1; function f(a=z){var z=2;return a+z}')
  // Renaming a body-only binding does not capture an unresolved default name.
  const unresolved = 'function f(a=x){var y=2;return a+y}'
  assert.equal(run(fixture(unresolved, { y: 'x' })).outputBytes.toString(), 'function f(a=x){var x=2;return a+x}')
  // Select the outer binding alone despite equal current body spelling.
  const f = fixture('let x=1; function f(a=x){var x=2;return a+x}', { x: 'outer' })
  f.recipe.bindings = f.recipe.bindings.filter(record => record.identity.scope.type === 'module')
  assert.equal(run(f).outputBytes.toString(), 'let outer=1; function f(a=outer){var x=2;return a+x}')
  // A parameter's own binding really can capture its initializer, including
  // unresolved names and a nested initializer closure. All must still fail.
  reject('let x=1; function f(a=x){return a}', { a: 'x' }, null, /capture/)
  reject('let x=1; function f(a=x){return a}', { x: 'a' }, null, /capture/)
  reject('function f(a=x){return a}', { a: 'x' }, null, /capture/)
  reject('let x=1; function f(a=()=>x){return a}', { a: 'x' }, null, /capture/)
})

test('refuses shared property, destructuring, import and export runtime token edits', () => {
  for (const source of ['const a=1; const obj={a};', 'const {a}=obj;a;', 'const {a=1}=obj;a;',
    'import {a} from "pkg";a;', 'const a=1;export {a};', 'export const a=1;', 'export function a(){}', 'export class a{}']) {
    reject(source, { a: 'b' }, null, /Runtime-name token/)
  }
})

test('does not search-and-replace properties, literals, comments, labels or free identifiers', () => {
  const source = 'let a=1; obj.a; "a"; /* a */ aLabel: while(false){break aLabel} a; free;'
  const result = run(fixture(source, { a: 'renamed' }))
  assert.equal(result.outputBytes.toString(), 'let renamed=1; obj.a; "a"; /* a */ aLabel: while(false){break aLabel} renamed; free;')
  reject('free;', {}, f => { f.recipe.bindings.push({ from: 'free', to: 'bound', identity: { identifierRanges: [[0, 4]] } }) }, /declaration identity/)
})

test('reserves synthetic names across lexical tokens, including properties and escaped tokens', () => {
  for (const reserved of RESERVED_NAMES) {
    reject('let a=1;a;', { a: reserved }, null, /Reserved synthesized spelling/)
    reject(`const ${reserved}=1; ${reserved};`, {}, null, /Reserved spelling remains/)
    reject(`obj.${reserved}`, {}, null, /Reserved spelling remains/)
  }
  reject('obj.\\u007958', {}, null, /Reserved spelling remains/)
  const result = run(fixture('let y58=1;y58;', { y58: 'allocated' }))
  assert.equal(result.outputBytes.toString(), 'let allocated=1;allocated;')
  reject('let a=1;', { a: 'b' }, f => { f.recipe.reservedNames = ['y58'] }, /Reservations must explicitly/)
  const unreserved = fixture('let y58=1;y58;')
  unreserved.recipe.reservedNames = []
  assert.equal(run(unreserved).outputBytes.toString(), 'let y58=1;y58;')
})

test('rejects nonidentifier/body/escape replacements and unexpected recipe/argument payloads', () => {
  for (const to of ['a;b', 'obj.x', 'return', '\\u0062', ' b', 'b/*x*/', 'await', 'eval', 'arguments']) {
    reject('let a=1;a;', { a: to }, null)
  }
  reject('let \\u0061=1;a;', { a: 'b' }, null, /token bytes differ/)
  for (const key of ['referenceSource', 'referencePath', 'map', 'body', 'edits']) reject('let a=1;', {}, f => { f.recipe[key] = 'arbitrary target content' }, /unsupported payload/)
  assert.throws(() => emitFrozenNaming({ ...options(fixture('let a=1;')), targetSource: 'arbitrary body' }), /unsupported payload/)
  const f = fixture('let a=1;'), opts = options(f), bad = Buffer.from(JSON.stringify(f.recipe, null, 2))
  assert.throws(() => emitFrozenNaming({ ...opts, recipeBytes: bad, expectedRecipeSha256: sha256(bad) }), /canonical JSON/)
  const duplicate = Buffer.from(opts.recipeBytes.toString().replace('"schemaVersion":1', '"schemaVersion":0,"schemaVersion":1'))
  assert.throws(() => emitFrozenNaming({ ...opts, recipeBytes: duplicate, expectedRecipeSha256: sha256(duplicate) }), /canonical JSON/)
})

test('explicit target naming under eval/reflection never claims semantic equivalence', () => {
  const result = run(fixture('let a=1; eval("a"); function f(){return a} f.toString();', { a: 'chosen', f: 'named' }))
  assert.equal(result.outputBytes.toString(), 'let chosen=1; eval("a"); function named(){return chosen} named.toString();')
  assert.equal(result.receipt.semanticEquivalenceEstablished, false)
  assert.equal(result.receipt.bindingGraph.semanticEquivalenceEstablished, false)
})

test('CLI emits auditable new files and rejects path/inode/dependency/report collisions before writes', () => {
  const directory = fs.mkdtempSync(path.join(ROOT, '.tiny-cli-'))
  try {
    const f = fixture('const a=1;a;', { a: 'renamed' }), opts = options(f)
    const input = path.join(directory, 'candidate.js'), recipe = path.join(directory, 'recipe.json'), pinsPath = path.join(directory, 'pins.json')
    fs.writeFileSync(input, f.candidateBytes); fs.writeFileSync(recipe, opts.recipeBytes); fs.writeFileSync(pinsPath, canonical(pins))
    const output = path.join(directory, 'output.js'), receipt = path.join(directory, 'receipt.json')
    const argv = (a = output, b = receipt) => ['--candidate', input, '--recipe', recipe, '--recipe-sha256', opts.expectedRecipeSha256,
      '--tool-pins', pinsPath, '--tool-pins-sha256', sha256(canonical(pins)), '--output', a, '--receipt', b]
    const initial = fs.readFileSync(input)
    assert.throws(() => runCLI(argv(input)), /overlap/)
    assert.throws(() => runCLI(argv(output, output)), /overlap/)
    assert.throws(() => runCLI(argv(path.join(ROOT, 'backend.mjs'))), /overlap/)
    assert.throws(() => runCLI(argv(path.join(RECOVERY, 'node_modules/acorn/package.json'))), /overlap/)
    assert.throws(() => runCLI(argv(path.join(RECOVERY, 'node_modules/new-unwanted-file.js'))), /dependency directory/)
    const dependencyAlias = path.join(directory, 'dependency-alias'); fs.symlinkSync(path.join(RECOVERY, 'node_modules'), dependencyAlias)
    assert.throws(() => runCLI(argv(path.join(dependencyAlias, 'new-unwanted-file.js'))), /dependency directory/)
    const hard = path.join(directory, 'hard.js'); fs.linkSync(input, hard)
    assert.throws(() => runCLI(argv(hard)), /same file/)
    const sym = path.join(directory, 'sym.js'); fs.symlinkSync(input, sym)
    assert.throws(() => runCLI(argv(sym)), /regular file/)
    assert(initial.equals(fs.readFileSync(input))); assert(!fs.existsSync(output)); assert(!fs.existsSync(receipt))
    const actual = runCLI(argv())
    assert.equal(actual.status, 'emitted-frozen-bound-names')
    assert.equal(fs.readFileSync(output, 'utf8'), 'const renamed=1;renamed;')
    const savedReceipt = JSON.parse(fs.readFileSync(receipt))
    verifyReceipt(f.candidateBytes.toString(), fs.readFileSync(output), savedReceipt)
    assert.throws(() => runCLI(argv()), /EEXIST/)
    assert.throws(() => runCLI([...argv(), '--reference', 'not-accepted']), /Require exactly/)
    const partial = path.join(directory, 'partial.js')
    assert.throws(() => runCLI(argv(partial, receipt)), /EEXIST/)
    assert(!fs.existsSync(partial), 'failed pair must clean only its own newly created artifact')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
