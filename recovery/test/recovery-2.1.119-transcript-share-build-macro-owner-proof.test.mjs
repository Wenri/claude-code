import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_EVIDENCE_IDS,
  TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/transcript-share-build-macro-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const testPath =
  'recovery/test/recovery-2.1.119-transcript-share-build-macro-owner-proof.test.mjs'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-transcript-share-build-macro-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f65b5fe3fdd61c688388375e079ead2080b63126524d5afadf38c68322a029c9'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const canonicalDigest = value => sha256(Buffer.from(JSON.stringify(value)))

function readPinned(input, base = root) {
  const bytes = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
}

function canonicalAst(node) {
  if (Array.isArray(node)) return node.map(canonicalAst)
  if (!node || typeof node !== 'object') return node
  const output = {}
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'raw'].includes(key)) continue
    if (key === 'name' && node.type === 'Identifier') {
      output[key] = '_'
      continue
    }
    if (
      key === 'value' &&
      node.type === 'Literal' &&
      typeof value === 'string' &&
      (/^\d+\.\d+\.\d+$/.test(value) ||
        /^20\d\d-.*Z$/.test(value) ||
        /^[a-f0-9]{40}$/.test(value))
    ) {
      output[key] = '<BUILD>'
      continue
    }
    output[key] = canonicalAst(value)
  }
  return output
}

function canonicalUnit(source) {
  return Buffer.from(
    JSON.stringify(
      canonicalAst(
        parse(source, {
          allowHashBang: true,
          ecmaVersion: 'latest',
          sourceType: 'script',
        }),
      ),
    ),
  )
}

function canonicalResidue(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ]
}

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

test(
  'Target119 transcript-share fixture and override are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    readPinned(fixture.inputs.override)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetUnit.targetIndex, 20814)
    assert.deepEqual(
      TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_OWNER_OVERRIDES.map(row => ({
        key: row.key,
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          key: `${caseName}:${fixture.targetUnit.targetIndex}`,
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.ownerOverride.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior: fixture.ownerBehavior,
        },
      ],
    )
    assert.deepEqual(
      fixture.evidenceCatalog.map(item => item.id),
      fixture.evidenceIds,
    )
    assert.ok(fixture.evidenceCatalog.every(item => item.path === testPath))
    assert.equal(
      canonicalDigest([fixture.targetUnit.targetIndex]),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      canonicalDigest(fixture.addedOwnerResidues),
      fixture.summary.addedOwnerResidueIdentitiesSha256,
    )
    assert.equal(
      canonicalDigest(fixture.productionStrictResidues),
      fixture.summary.productionStrictResidueIdentitiesSha256,
    )
    assert.equal(fixture.sourceReplay.authorized, false)
  },
)

test(
  'complete authenticated units differ only by exact Target119 build identity',
  { skip: !selected },
  () => {
    const baselineBundle = readPinned(fixture.inputs.baselineBundle)
    const targetBundle = readPinned(fixture.inputs.targetBundle)
    const structuralBytes = readPinned(fixture.inputs.targetStructuralLedger)
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const region = structural.regions.find(
      item => item.target.index === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(
      {
        classification: region.classification,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        tokenCount: region.target.tokenCount,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        classification: fixture.targetUnit.classification,
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokens,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
      },
    )
    const baseline = baselineBundle.subarray(
      fixture.baselineUnit.start,
      fixture.baselineUnit.end,
    )
    const target = targetBundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    assert.deepEqual(descriptor(baseline), {
      bytes: fixture.baselineUnit.bytes,
      sha256: fixture.baselineUnit.sha256,
    })
    assert.deepEqual(descriptor(target), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sha256,
    })
    for (const [label, value] of Object.entries(
      fixture.baselineUnit.buildIdentity,
    )) {
      assert.equal(baseline.toString().split(value).length - 1, 1, label)
      assert.equal(target.toString().includes(value), false, label)
    }
    for (const [label, value] of Object.entries(
      fixture.targetUnit.buildIdentity,
    )) {
      assert.equal(target.toString().split(value).length - 1, 1, label)
      assert.equal(baseline.toString().includes(value), false, label)
    }
    const baselineCanonical = canonicalUnit(baseline.toString())
    const targetCanonical = canonicalUnit(target.toString())
    assert.deepEqual(descriptor(baselineCanonical), {
      bytes: fixture.canonicalPairedUnit.bytes,
      sha256: fixture.canonicalPairedUnit.sha256,
    })
    assert.deepEqual(targetCanonical, baselineCanonical)
    for (const residue of fixture.addedOwnerResidues) {
      const value = targetBundle
        .subarray(residue[3], residue[4])
        .toString()
      assert.equal(value, residue[1] === 'string' ? JSON.stringify(residue[2]) : residue[2])
    }
    for (const operation of fixture.residuePartitions.completePredecessorPipeline) {
      assert.equal(baseline.toString().includes(`.${operation}(`), true, operation)
      assert.equal(target.toString().includes(`.${operation}(`), true, operation)
    }
  },
)

test(
  'exact historical source owns the declaration and direct source rows',
  { skip: !selected },
  async () => {
    const relativePath = fixture.sourceState.path.replace(/^src\//, '')
    const bytes = readPinned(
      { path: relativePath, ...fixture.sourceState.file },
      sourceRoot,
    )
    for (const historical of fixture.sourceState.historicalCommits) {
      const historicalBytes = execFileSync(
        'git',
        ['show', `${historical.commit}:${fixture.sourceState.path}`],
        { cwd: root },
      )
      assert.deepEqual(
        descriptor(historicalBytes),
        descriptor(bytes),
        `${historical.version}: source bytes`,
      )
      const treeRow = execFileSync(
        'git',
        ['ls-tree', historical.commit, fixture.sourceState.path],
        { cwd: root, encoding: 'utf8' },
      ).trim()
      assert.match(
        treeRow,
        new RegExp(`^100644 blob ${fixture.sourceState.file.gitBlob}\\t`),
        `${historical.version}: source blob`,
      )
    }
    const source = bytes.toString()
    for (const fragment of fixture.sourceState.requiredFragments) {
      assert.equal(source.includes(fragment), true, fragment)
    }
    for (const value of Object.values(fixture.targetUnit.buildIdentity)) {
      assert.equal(source.includes(value), false, value)
    }
    const ts = await loadTypeScript()
    const sourceFile = ts.createSourceFile(
      fixture.sourceState.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const declarations = []
    const imports = []
    const visit = node => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === fixture.sourceState.declaration.name
      ) {
        declarations.push(node)
      }
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier.text === 'fs/promises'
      ) {
        imports.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert.equal(declarations.length, 1)
    assert.equal(imports.length, 1)
    const importedNames = imports[0].importClause.namedBindings.elements
      .map(element => element.name.text)
      .sort()
    assert.deepEqual(importedNames, ['readFile', 'stat'])
    const declaration = declarations[0]
    assert.equal(
      declaration.getStart(sourceFile),
      fixture.sourceState.declaration.start,
    )
    assert.equal(declaration.end, fixture.sourceState.declaration.end)
    assert.deepEqual(
      descriptor(
        Buffer.from(
          source.slice(
            fixture.sourceState.declaration.start,
            fixture.sourceState.declaration.end,
          ),
        ),
      ),
      {
        bytes: fixture.sourceState.declaration.bytes,
        sha256: fixture.sourceState.declaration.sha256,
      },
    )
    const counts = new Map()
    const countIdentifiers = node => {
      if (ts.isIdentifier(node)) {
        counts.set(node.text, (counts.get(node.text) ?? 0) + 1)
      }
      ts.forEachChild(node, countIdentifiers)
    }
    countIdentifiers(declaration)
    assert.deepEqual(
      Object.fromEntries(
        ['size', 'stat', 'readFile', 'MACRO', 'VERSION'].map(name => [
          name,
          counts.get(name) ?? 0,
        ]),
      ),
      { size: 3, stat: 1, readFile: 1, MACRO: 1, VERSION: 1 },
    )
  },
)

test(
  'owner, owner-added, and production-strict residue partitions are exact',
  { skip: !selected },
  () => {
    const report = JSON.parse(
      fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
    )
    const forUnit = rows =>
      rows
        .filter(row => row.structural.index === fixture.targetUnit.targetIndex)
        .map(canonicalResidue)
    const ownerRows = forUnit(report.sourceRuntimeOwnerResidueRows)
    const addedRows = forUnit(report.sourceRuntimeAddedOwnerResidueRows)
    const strictRows = forUnit(report.rows)
    assert.equal(ownerRows.length, fixture.summary.ownerRows)
    assert.equal(
      canonicalDigest(ownerRows),
      fixture.summary.ownerResidueIdentitiesSha256,
    )
    assert.deepEqual(addedRows, fixture.addedOwnerResidues)
    assert.ok(
      JSON.stringify(strictRows) ===
        JSON.stringify(fixture.productionStrictResidues) ||
        strictRows.length === fixture.summary.productionStrictRowsAfterCorrection,
      'strict rows are exact pre-correction build macros or the atomic corrected state',
    )
    const partitionValues = Object.values(fixture.residuePartitions).flat()
    assert.deepEqual(
      [...partitionValues].sort(),
      fixture.addedOwnerResidues.map(row => row[2]).sort(),
    )
    assert.deepEqual(
      fixture.productionStrictResidues.map(row => row[2]).sort(),
      Object.values(fixture.targetUnit.buildIdentity).sort(),
    )
  },
)

test(
  'coverage accepts only provisional or complete static proof state',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(path.join(root, fixture.inputs.targetCoverage.path)),
      ),
    )
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const paths = row.ownerIds.map(id => owners.get(id)).sort()
    const expectedPaths = [...fixture.ownerOverride.paths].sort()
    const provisional =
      JSON.stringify(paths) === JSON.stringify(expectedPaths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) === JSON.stringify(expectedPaths) &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
      row.behavior ===
        TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_OWNER_OVERRIDES[0].behavior
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.equal(provisional || corrected, true)
    if (corrected) {
      const evidence = new Map(coverage.evidence.map(item => [item.id, item]))
      for (const evidenceId of fixture.evidenceIds) {
        assert.equal(evidence.get(evidenceId)?.path, testPath, evidenceId)
      }
    }
  },
)
