import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { inspectCandidateBindings, emitFrozenNaming, RESERVED_NAMES } from './backend.mjs'
import { convertDiscoveryNamePlan, prepareDiscoveryNamePlan, replayPreparedDiscoveryNamePlan } from './converter.mjs'
import { canonical, sha256, currentToolPins } from './toolchain.mjs'

const toolPins = currentToolPins()
function fixture(source, changes, expected) {
  const candidateBytes = Buffer.from(source), inventory = inspectCandidateBindings(candidateBytes)
  const projection = { schemaVersion: 1, kind: 'pinned-discovery-name-plan-projection',
    reportSha256: sha256('synthetic independently pinned report'), sourceProfileSha256: sha256('synthetic source profile'),
    candidateSha256: sha256(candidateBytes), observedNamedSha256: sha256(expected),
    bindings: inventory.bindings.map(row => ({ from: row.from, to: changes[row.from] ?? row.from, identifierRanges: row.identity.identifierRanges })) }
  return { candidateBytes, projection }
}
function options(f, reservedNames = []) {
  const projectionBytes = Buffer.from(canonical(f.projection))
  return { candidateBytes: f.candidateBytes, projectionBytes, expectedProjectionSha256: sha256(projectionBytes), toolPins,
    targetId: 'tiny-observed-name-plan-replay', reservedNames }
}
function convert(f, reservedNames) { return convertDiscoveryNamePlan(options(f, reservedNames)) }

test('converts only three-field assignments, derives complete class owners, skips no-ops and replays exact observed bytes', () => {
  const source = 'const a=1; class A {static value=a; self(){return A}} new A; export const keep=2;'
  const expected = 'const longer=1; class Named {static value=longer; self(){return Named}} new Named; export const keep=2;'
  const f = fixture(source, { a: 'longer', A: 'Named' }, expected), result = convert(f)
  assert.equal(result.outputBytes.toString(), expected)
  assert.equal(result.receipt.bindingGraph.status, 'static-binding-graph-preserved')
  const recipe = JSON.parse(result.recipeBytes)
  assert.equal(recipe.bindings.length, 3)
  assert(recipe.bindings.every(row => Object.keys(row).sort().join(',') === 'from,identity,to'))
  assert(!result.recipeBytes.includes(Buffer.from(f.projection.reportSha256)))
  assert(!result.recipeBytes.includes(Buffer.from(f.projection.sourceProfileSha256)))
  assert.equal(result.conversionReceipt.unchangedAssignmentsSkipped, 1)
  assert.equal(result.conversionReceipt.provenance.originalReportIndependentlyRead, false)
  assert.equal(result.conversionReceipt.observedNamePlanReproduced, true)
  assert.equal(result.conversionReceipt.mandatoryExactNameAcceptanceEstablished, false)
  assert.deepEqual(recipe.reservedNames, [])
  // The frozen output does not need the discovery projection at replay time.
  const replay = emitFrozenNaming({ candidateBytes: f.candidateBytes, recipeBytes: result.recipeBytes, expectedRecipeSha256: result.expectedRecipeSha256, toolPins })
  assert(replay.outputBytes.equals(result.outputBytes))
})

test('supports omitted unchanged assignments and complete repeated-declaration identities', () => {
  const source = 'var a=1; var a; let b=2; a+b;'
  const f = fixture(source, { a: 'chosen' }, 'var chosen=1; var chosen; let b=2; chosen+b;')
  f.projection.bindings = f.projection.bindings.filter(row => row.from === 'a')
  f.projection.bindings[0].identifierRanges.reverse() // order is not an ownership selector
  assert.equal(convert(f).conversionReceipt.frozenBindingCount, 1)
  f.projection.bindings[0].identifierRanges.pop()
  assert.throws(() => convert(f), /missing or incomplete/)
})

test('rejects omitted changes using pinned observed output even when graph remains valid', () => {
  const f = fixture('const a=1; a;', { a: 'named' }, 'const named=1; named;')
  f.projection.bindings = []
  assert.throws(() => convert(f), /missing, extra or changed assignment/)
  const changed = fixture('const a=1; a;', { a: 'different' }, 'const named=1; named;')
  assert.throws(() => convert(changed), /missing, extra or changed assignment/)
})

test('rejects class owner omissions, conflicting assignments and excess duplicates', () => {
  for (const mutate of [
    f => f.projection.bindings.pop(),
    f => { f.projection.bindings[1].to = 'Other' },
    f => f.projection.bindings.push(structuredClone(f.projection.bindings[0])),
  ]) {
    const f = fixture('class A { self(){return A} } new A;', { A: 'Named' }, 'class Named { self(){return Named} } new Named;')
    mutate(f); assert.throws(() => convert(f), /owner-group omission|Conflicting discovery/)
  }
  const f = fixture('let a=1;a;', { a: 'named' }, 'let named=1;named;')
  f.projection.bindings.push(structuredClone(f.projection.bindings[0]))
  assert.throws(() => convert(f), /owner-group omission or duplicate/)
})

test('rejects wrong candidate, projection pin, spelling, range identity and malformed range lists', () => {
  const f = fixture('const a=1;a;', { a: 'b' }, 'const b=1;b;')
  assert.throws(() => convertDiscoveryNamePlan({ ...options(f), expectedProjectionSha256: '0'.repeat(64) }), /projection digest differs/)
  for (const mutate of [
    f => { f.projection.candidateSha256 = '0'.repeat(64) },
    f => { f.projection.bindings[0].from = 'wrong' },
    f => { f.projection.bindings[0].identifierRanges[0][0]++ },
    f => { f.projection.bindings[0].identifierRanges = [] },
    f => { f.projection.bindings[0].identifierRanges.push([...f.projection.bindings[0].identifierRanges[0]]) },
    f => { f.projection.bindings[0].identifierRanges = [[0, 1.5]] },
  ]) { const copy = structuredClone(f); copy.candidateBytes = Buffer.from(copy.candidateBytes); mutate(copy); assert.throws(() => convert(copy)) }
})

test('rejects target bodies, report AST fields, extra assignment metadata and recipe overrides', () => {
  for (const field of ['body', 'targetSource', 'baseline', 'referencePath', 'results', 'sourceMap']) {
    const f = fixture('let a=1;a;', { a: 'b' }, 'let b=1;b;'); f.projection[field] = 'target body'
    assert.throws(() => convert(f), /only the body-free projection/)
  }
  for (const field of ['origin', 'basis', 'identity', 'shared', 'referenceRanges']) {
    const f = fixture('let a=1;a;', { a: 'b' }, 'let b=1;b;'); f.projection.bindings[0][field] = 'not accepted'
    assert.throws(() => convert(f), /only the body-free projection/)
  }
  const f = fixture('let a=1;a;', { a: 'b' }, 'let b=1;b;')
  assert.throws(() => convertDiscoveryNamePlan({ ...options(f), targetSource: 'body' }), /only the body-free projection/)
})

test('preserves actual runtime-key/collision/capture gates rather than trusting a matching output hash', () => {
  for (const [source, changes, expected] of [
    ['let a=1;const obj={a};', { a: 'b' }, 'let b=1;const obj={b};'],
    ['let a=1,b=2;a+b;', { a: 'b' }, 'let b=1,b=2;b+b;'],
    ['let x=1;function f(a=x){return a}', { a: 'x' }, 'let x=1;function f(x=x){return x}'],
  ]) assert.throws(() => convert(fixture(source, changes, expected)), /Runtime-name|collision|capture/)
  const safe = fixture('let x=1;function f(a=x){var z=2;return a+z}', { x: 'z' }, 'let z=1;function f(a=z){var z=2;return a+z}')
  assert.equal(convert(safe).receipt.bindingGraph.status, 'static-binding-graph-preserved')
})

test('explicit no-reservation profile permits current v2 names without adding a free-symbol pass', () => {
  const source = 'let y58=1;y58; free;'
  assert.equal(convert(fixture(source, {}, source)).outputBytes.toString(), source)
  assert.throws(() => convert(fixture(source, {}, source), [...RESERVED_NAMES]), /Reserved spelling remains/)
  const f = fixture('free;', {}, 'renamed;')
  f.projection.bindings.push({ from: 'free', to: 'renamed', identifierRanges: [[0, 4]] })
  assert.throws(() => convert(f), /missing or incomplete/)
})

test('supports separate preparation/replay processes with explicit unverified preparation and no projection at replay', () => {
  const f = fixture('const a=1;a;', { a: 'longer' }, 'const longer=1;longer;')
  const prepared = prepareDiscoveryNamePlan(options(f))
  assert.equal(prepared.preparationStatus, 'prepared-unverified')
  const manifest = JSON.parse(prepared.conversionManifestBytes)
  assert.equal(manifest.observedNamePlanReproduced, false)
  assert.equal(manifest.requiresFrozenEmitterReplay, true)
  assert(!Object.hasOwn(prepared, 'outputBytes'))
  const childInput = { candidate: f.candidateBytes.toString('base64'), recipe: prepared.recipeBytes.toString('base64'),
    manifest: prepared.conversionManifestBytes.toString('base64'), expectedRecipeSha256: prepared.expectedRecipeSha256,
    expectedConversionManifestSha256: prepared.expectedConversionManifestSha256, toolPins }
  const childCode = `import fs from 'node:fs'; import {replayPreparedDiscoveryNamePlan} from ${JSON.stringify(new URL('./converter.mjs', import.meta.url).href)};
    const p=JSON.parse(fs.readFileSync(0,'utf8'));
    const r=replayPreparedDiscoveryNamePlan({candidateBytes:Buffer.from(p.candidate,'base64'),recipeBytes:Buffer.from(p.recipe,'base64'),conversionManifestBytes:Buffer.from(p.manifest,'base64'),expectedRecipeSha256:p.expectedRecipeSha256,expectedConversionManifestSha256:p.expectedConversionManifestSha256,toolPins:p.toolPins});
    console.log(JSON.stringify({output:r.outputBytes.toString(),status:r.conversionReceipt.status,graph:r.receipt.bindingGraph.status}));`
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', '--input-type=module', '-e', childCode], { input: JSON.stringify(childInput), encoding: 'utf8', timeout: 30000 })
  assert.equal(child.status, 0, child.stderr)
  assert.deepEqual(JSON.parse(child.stdout), { output: 'const longer=1;longer;', status: 'observed-name-plan-reproduced', graph: 'static-binding-graph-preserved' })
})

test('unverified preparation cannot hide omitted changes or manifest tampering at replay', () => {
  const f = fixture('const a=1;a;', { a: 'longer' }, 'const longer=1;longer;')
  f.projection.bindings = []
  const prepared = prepareDiscoveryNamePlan(options(f))
  const replayOptions = { candidateBytes: f.candidateBytes, recipeBytes: prepared.recipeBytes, expectedRecipeSha256: prepared.expectedRecipeSha256,
    conversionManifestBytes: prepared.conversionManifestBytes, expectedConversionManifestSha256: prepared.expectedConversionManifestSha256, toolPins }
  assert.equal(prepared.preparationStatus, 'prepared-unverified')
  assert.throws(() => replayPreparedDiscoveryNamePlan(replayOptions), /missing, extra or changed assignment/)
  assert.throws(() => replayPreparedDiscoveryNamePlan({ ...replayOptions, expectedConversionManifestSha256: '0'.repeat(64) }), /manifest digest differs/)
  const bad = JSON.parse(prepared.conversionManifestBytes); bad.observedNamePlanReproduced = true
  const bytes = Buffer.from(canonical(bad))
  assert.throws(() => replayPreparedDiscoveryNamePlan({ ...replayOptions, conversionManifestBytes: bytes, expectedConversionManifestSha256: sha256(bytes) }))
})

test('preparation never serializes body-valued names or malformed profile options into a frozen recipe', () => {
  for (const to of ['a;arbitraryBody()', 'a b', '\\u0062', 'await']) {
    const f = fixture('let a=1;a;', { a: to }, 'irrelevant')
    assert.throws(() => prepareDiscoveryNamePlan(options(f)))
  }
  const f = fixture('let a=1;a;', { a: 'b' }, 'let b=1;b;')
  assert.throws(() => prepareDiscoveryNamePlan({ ...options(f), targetId: { body: 'arbitrary code' } }), /bounded target ID/)
  assert.throws(() => prepareDiscoveryNamePlan({ ...options(f), reservedNames: { body: 'arbitrary code' } }), /reservations must explicitly/)
})
