import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { indexGeneratedBundle } from '../lib/structural-delta.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const fixtureFilename = fileURLToPath(
  new URL(
    './recovery-2.1.117-paired-local-residue-proofs.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixtureFilename)
const fixture = JSON.parse(fixtureBytes)
const fixtureSha256 =
  '1429f1b7884b1565d78a677c754b2dc7de50b6b46eae773021bdb2bafbe1b1e1'
const expectedIndices = [
  14883, 15586, 15714, 16292, 16480, 16761, 16765, 16801, 17167,
  18925, 19185, 19676, 19703, 20182, 20569, 20604, 20695, 20707,
  20709, 20726, 20727, 20731, 20733, 20744,
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags]
      .sort()
      .join('')}`
  }
  if (kind === 'number') return `number:${Number(value)}`
  return `${kind}:${JSON.stringify(value)}`
}

function collect(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const grouped = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const occurrences = grouped.get(key) ?? []
    occurrences.push({ start: node.start, end: node.end })
    grouped.set(key, occurrences)
  }
  function walk(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node)
      else if (typeof node.value === 'string') add('string', node.value, node)
      else if (typeof node.value === 'number') add('number', node.value, node)
      else if (node.bigint !== undefined) add('bigint', node.bigint, node)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        walk(child)
      }
    }
  }
  walk(ast)
  for (const occurrences of grouped.values()) {
    occurrences.sort((left, right) => left.start - right.start)
  }
  return { ast, grouped }
}

function localCount(grouped, kind, value) {
  return (grouped.get(identity(kind, value)) ?? []).length
}

test(
  'target117 paired-local fixture is exact and source-owner complete',
  { skip: !selected ? `not applicable to ${selectedCase}` : false },
  () => {
    assert.equal(sha256(fixtureBytes), fixtureSha256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      expectedIndices,
    )
    assert.equal(fixture.summary.units, expectedIndices.length)
    assert.equal(
      fixture.summary.residues,
      fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
    )
    assert.equal(fixture.summary.residues, 63)
    for (const row of fixture.rows) {
      assert.equal(row.pairReason, 'unique-coarse-structural-hash')
      assert.equal(row.baseline.coarseHash, row.target.coarseHash)
      assert.ok(row.ownerPaths.length > 0, `u${row.targetIndex}: owners`)
      for (const owner of row.ownerPaths) {
        assert.match(owner, /^src\//)
        assert.ok(
          fs.existsSync(path.join(sourceRoot, owner.slice(4))),
          `u${row.targetIndex}: ${owner} exists`,
        )
      }
      for (const residue of row.residues) {
        assert.ok(
          residue.targetOccurrenceNumber > residue.baselineOccurrenceCount,
          `u${row.targetIndex}: exact global target addition`,
        )
        assert.equal(
          residue.baselineLocalCount,
          residue.targetLocalCount,
          `u${row.targetIndex}: ${identity(residue.kind, residue.value)} local count`,
        )
        assert.ok(residue.targetLocalCount > 0)
      }
    }
  },
)

test(
  'authenticated 116/117 units prove every paired-local residue invariant',
  {
    skip: !selected
      ? `not applicable to ${selectedCase}`
      : !process.env.CLAUDE_CODE_2_1_116_BUNDLE ||
          !process.env.CLAUDE_CODE_2_1_117_BUNDLE
        ? 'authenticated 2.1.116 and 2.1.117 bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const baselineFilename = process.env.CLAUDE_CODE_2_1_116_BUNDLE
    const targetFilename = process.env.CLAUDE_CODE_2_1_117_BUNDLE
    const baselineBytes = fs.readFileSync(baselineFilename)
    const targetBytes = fs.readFileSync(targetFilename)
    assert.deepEqual(
      { bytes: baselineBytes.length, sha256: sha256(baselineBytes) },
      fixture.inputs.baselineBundle,
    )
    assert.deepEqual(
      { bytes: targetBytes.length, sha256: sha256(targetBytes) },
      fixture.inputs.targetBundle,
    )
    const structuralBytes = fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    )
    assert.deepEqual(
      { bytes: structuralBytes.length, sha256: sha256(structuralBytes) },
      fixture.inputs.structural,
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const baseline = indexGeneratedBundle(baselineFilename)
    const target = indexGeneratedBundle(targetFilename)
    const baselineGlobal = collect(baseline.source).grouped
    const targetGlobal = collect(target.source).grouped

    for (const row of fixture.rows) {
      const region = structural.regions[row.targetIndex]
      assert.equal(region.classification, 'changed')
      assert.equal(region.baselineUnitIndex, row.baseline.index)
      assert.equal(region.pairReason, row.pairReason)
      const baselineUnit = baseline.publicUnits[row.baseline.index]
      const targetUnit = target.publicUnits[row.targetIndex]
      assert.deepEqual(
        {
          index: row.baseline.index,
          start: baselineUnit.start,
          end: baselineUnit.end,
          nodeType: baselineUnit.nodeType,
          sourceHash: baselineUnit.sourceHash,
          coarseHash: baselineUnit.coarseHash,
        },
        row.baseline,
      )
      assert.deepEqual(
        {
          start: targetUnit.start,
          end: targetUnit.end,
          nodeType: targetUnit.nodeType,
          sourceHash: targetUnit.sourceHash,
          coarseHash: targetUnit.coarseHash,
        },
        row.target,
      )
      const baselineLocal = collect(
        baseline.source.slice(baselineUnit.start, baselineUnit.end),
      ).grouped
      const targetLocal = collect(
        target.source.slice(targetUnit.start, targetUnit.end),
      ).grouped
      for (const residue of row.residues) {
        const key = identity(residue.kind, residue.value)
        assert.equal(
          localCount(baselineLocal, residue.kind, residue.value),
          residue.baselineLocalCount,
          `u${row.targetIndex}: ${key} baseline local`,
        )
        assert.equal(
          localCount(targetLocal, residue.kind, residue.value),
          residue.targetLocalCount,
          `u${row.targetIndex}: ${key} target local`,
        )
        assert.equal(
          (baselineGlobal.get(key) ?? []).length,
          residue.baselineOccurrenceCount,
          `u${row.targetIndex}: ${key} baseline global`,
        )
        const occurrence = (targetGlobal.get(key) ?? [])[residue.targetOccurrenceNumber - 1]
        assert.deepEqual(
          occurrence,
          { start: residue.start, end: residue.end },
          `u${row.targetIndex}: ${key} exact target ordinal`,
        )
      }
    }
  },
)
