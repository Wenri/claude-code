import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-tail-semantic-correspondence-admissions.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '9a7a048bd05ff2e122013da11fa6effcfc4da4d9764b1dbc650da893adc095ba'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const targetPath = process.env.CLAUDE_CODE_2_1_121_BUNDLE
const EVOLVED_ARTIFACT_DESCRIPTORS = new Map([
  [
    'recovery/test/recovery-2.1.121-direct-evidence.test.mjs',
    {
      bytes: 9811,
      sha256:
        '42ab6a027653eae552ce701906a3d156ff7b36e222159bb3fe0d7f711a465e4f',
    },
  ],
  [
    'recovery/test/recovery-2.1.121-tail-residue-classification.json',
    {
      bytes: 12892,
      sha256:
        '46b1f52dabba93d0506dead02d21995b92d1dfbeaf7e373d12df3f9c11a37300',
    },
  ],
  [
    'recovery/test/recovery-2.1.121-tail-residue-classification.test.mjs',
    {
      bytes: 347,
      sha256:
        '68f8d0040ab499c4a85021a5b6daa80c12f2f3968d7debf979c5a0d55c8d58da',
    },
  ],
  [
    'recovery/test/recovery-late-tail-residue-classification-helpers.mjs',
    {
      bytes: 18675,
      sha256:
        '0338c0e9ae527d903eefce588c685045b44b5801d7aa07b5e504303949db7c62',
    },
  ],
  [
    'recovery/test/recovery-late-tail-generator-evidence-helpers.mjs',
    {
      bytes: 31992,
      sha256:
        '0a087466b1fdd83ced9985cec467ed1bc8b989502d168bc089cc2e1a11edc0c9',
    },
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function evolvedDescriptor(filename, historicalDescriptor) {
  return EVOLVED_ARTIFACT_DESCRIPTORS.get(filename) ?? historicalDescriptor
}

function readExact(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expected.bytes, label + ': byte count')
  assert.equal(sha256(bytes), expected.sha256, label + ': SHA-256')
  return bytes
}

function occurrenceCount(source, fragment) {
  return source.split(fragment).length - 1
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(
    fs.existsSync(filename),
    'the repository-pinned TypeScript compiler exists',
  )
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

function readInputs() {
  const classification = JSON.parse(
    readExact(
      path.join(repositoryRoot, fixture.inputs.classification.path),
      evolvedDescriptor(
        fixture.inputs.classification.path,
        fixture.inputs.classification,
      ),
      'target121 tail classification',
    ),
  )
  const correspondence = JSON.parse(
    gunzipSync(
      readExact(
        path.join(
          repositoryRoot,
          fixture.inputs.semanticCorrespondence.path,
        ),
        fixture.inputs.semanticCorrespondence,
        'target121 semantic correspondence',
      ),
    ),
  )
  const structural = JSON.parse(
    gunzipSync(
      readExact(
        path.join(repositoryRoot, fixture.inputs.structural.path),
        fixture.inputs.structural,
        'target121 structural ledger',
      ),
    ),
  )
  return { classification, correspondence, structural }
}

test(
  'target121 semantic-correspondence admissions are exact and strictly contained',
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, '2.1.120-to-2.1.121')
    assert.equal(fixture.status, 'generator-ready-fail-closed')
    assert.deepEqual(fixture.summary, {
      candidateWitnessUnits: 33,
      candidateWitnessObligations: 28,
      candidateWitnessTests: 21,
      admittedResidues: 33,
      admittedUnits: 18,
      buildMetadataResidues: 27,
      sourceSemanticResidues: 6,
      completelyDischargedUnits: 0,
      retainedSupplementUnits: 97,
      retainedSupplementResidues: 1315,
    })

    const { classification, correspondence, structural } = readInputs()
    const supplementIndices = new Set(
      classification.categories['source-supplement'].indices,
    )
    const regions = new Map(
      correspondence.regions.map(region => [region.index, region]),
    )
    const witnesses = correspondence.obligationWitnesses.map(witness => ({
      ...witness,
      ranges: witness.bundleWitnesses.flatMap(
        bundle => bundle.targetRanges ?? [],
      ),
    }))
    const candidateWitnessUnits =
      classification.categories['source-supplement'].indices.filter(index => {
        const unit = regions.get(index)
        return witnesses.some(witness =>
          witness.ranges.some(
            range => range.start >= unit.start && range.end <= unit.end,
          ),
        )
      })
    assert.deepEqual(candidateWitnessUnits, fixture.candidateWitnessUnits)

    const candidateWitnesses = witnesses.filter(witness =>
      candidateWitnessUnits.some(index => {
        const unit = regions.get(index)
        return witness.ranges.some(
          range => range.start >= unit.start && range.end <= unit.end,
        )
      }),
    )
    assert.equal(
      new Set(candidateWitnesses.map(witness => witness.id)).size,
      fixture.summary.candidateWitnessObligations,
    )
    assert.equal(
      new Set(candidateWitnesses.flatMap(witness => witness.testIds)).size,
      fixture.summary.candidateWitnessTests,
    )

    const admittedRows = fixture.groups.flatMap(group => group.rows)
    assert.equal(admittedRows.length, fixture.summary.admittedResidues)
    assert.equal(
      new Set(admittedRows.map(row => row.targetIndex)).size,
      fixture.summary.admittedUnits,
    )
    assert.deepEqual(
      [...new Set(admittedRows.map(row => row.targetIndex))].sort(
        (left, right) => left - right,
      ),
      [...fixture.admittedUnits].sort((left, right) => left - right),
    )
    assert.deepEqual(
      fixture.candidateWitnessUnits.filter(
        index => !fixture.admittedUnits.includes(index),
      ),
      fixture.witnessedButStrictlyUnadmittedUnits,
    )

    const residueIdentities = new Set()
    for (const group of fixture.groups) {
      const witness = witnesses.find(
        candidate => candidate.id === group.obligationId,
      )
      assert.ok(witness, 'semantic witness ' + group.obligationId)
      assert.deepEqual(group.sourcePaths, witness.sourcePaths)
      assert.deepEqual(group.testIds, witness.testIds)
      assert.deepEqual(group.catalogBinding, witness.catalogBinding)
      assert.equal(typeof group.behavior, 'string')
      assert.ok(group.behavior.length > 0)
      for (const row of group.rows) {
        assert.ok(
          supplementIndices.has(row.targetIndex),
          `u${row.targetIndex} remains in the provisional supplement set`,
        )
        const region = structural.regions[row.targetIndex].target
        assert.equal(region.sourceHash, row.sourceHash)
        assert.ok(region.start <= row.start && region.end >= row.end)
        assert.ok(
          witness.ranges.some(
            range =>
              range.start === row.witnessRange.start &&
              range.end === row.witnessRange.end,
          ),
          `${group.obligationId} owns the exact frozen witness range`,
        )
        assert.ok(
          row.witnessRange.start <= row.start &&
            row.witnessRange.end >= row.end,
          `${group.obligationId} strictly contains the admitted residue`,
        )
        const identity = `${row.targetIndex}:${row.start}:${row.end}:${row.literalKind}:${row.value}`
        assert.equal(residueIdentities.has(identity), false, identity)
        residueIdentities.add(identity)
      }
    }
  },
)

test('target121 evolved tail artifact closure is byte-exact', () => {
  for (const [filename, expected] of EVOLVED_ARTIFACT_DESCRIPTORS) {
    readExact(
      path.join(repositoryRoot, filename),
      expected,
      'target121 evolved tail artifact ' + filename,
    )
  }
})

test('target121 semantic-correspondence catalog bindings are byte-exact', () => {
  const { correspondence } = readInputs()
  const obligationsPath = path.join(
    repositoryRoot,
    'recovery/cases/2.1.120-to-2.1.121/semantic/obligations.json',
  )
  const obligationsBytes = readExact(
    obligationsPath,
    correspondence.inputs.obligations,
    'target121 obligations catalog',
  )
  const obligations = JSON.parse(obligationsBytes)
  const testsById = new Map(
    correspondence.testCatalog.map(entry => [entry.id, entry]),
  )
  const obligationsById = new Map(
    obligations.obligations.map(entry => [entry.id, entry]),
  )

  const verifiedTests = new Set()
  const verifiedCatalogs = new Set()
  for (const group of fixture.groups) {
    const obligation = obligationsById.get(group.obligationId)
    assert.ok(obligation, 'pinned obligation ' + group.obligationId)
    assert.equal(obligation.rationale, group.behavior)
    const referencedPaths = [
      ...(obligation.sourceAssertions ?? []),
      ...(obligation.sourceAbsences ?? []),
      ...(obligation.sourceRemovals ?? []),
    ].map(assertion => assertion.path)
    assert.deepEqual(
      [...new Set(referencedPaths)].sort(),
      [...group.sourcePaths].sort(),
      group.obligationId + ': pinned source paths',
    )

    for (const testId of group.testIds) {
      if (verifiedTests.has(testId)) continue
      const catalogEntry = testsById.get(testId)
      assert.ok(catalogEntry, 'pinned test catalog entry ' + testId)
      readExact(
        path.join(repositoryRoot, catalogEntry.path),
        evolvedDescriptor(catalogEntry.path, catalogEntry),
        'pinned semantic test ' + testId,
      )
      for (const evidence of catalogEntry.evidence ?? []) {
        readExact(
          path.join(repositoryRoot, evidence.path),
          evidence,
          testId + ': pinned evidence ' + evidence.path,
        )
      }
      verifiedTests.add(testId)
    }

    const binding = group.catalogBinding
    if (!verifiedCatalogs.has(binding.path)) {
      const catalogBytes = fs.readFileSync(
        path.join(repositoryRoot, binding.path),
      )
      assert.equal(sha256(catalogBytes), binding.sha256)
      if (binding.bytes !== undefined) {
        assert.equal(catalogBytes.length, binding.bytes)
      }
      verifiedCatalogs.add(binding.path)
    }
    const catalog = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, binding.path)),
    )
    const rawRow = catalog.rows.find(row => row.id === binding.rawId)
    assert.ok(rawRow, group.obligationId + ': direct-evidence row')
    assert.equal(
      sha256(Buffer.from(JSON.stringify(rawRow))),
      binding.rowSha256,
      group.obligationId + ': direct-evidence row hash',
    )
  }
})

test(
  'target121 semantic-correspondence source assertions are AST-clean and exact',
  {
    skip:
      semanticCase !== fixture.case
        ? 'the exact target121 semantic source root is required'
        : false,
  },
  async () => {
    const { correspondence } = readInputs()
    const obligations = JSON.parse(
      readExact(
        path.join(
          repositoryRoot,
          'recovery/cases/2.1.120-to-2.1.121/semantic/obligations.json',
        ),
        correspondence.inputs.obligations,
        'target121 obligations catalog',
      ),
    )
    const obligationsById = new Map(
      obligations.obligations.map(entry => [entry.id, entry]),
    )
    const ts = await loadTypeScript()
    const parsedPaths = new Set()
    for (const group of fixture.groups) {
      const obligation = obligationsById.get(group.obligationId)
      for (const assertion of obligation.sourceAssertions ?? []) {
        assert.deepEqual(
          descriptor(Buffer.from(assertion.fragment)),
          { bytes: assertion.bytes, sha256: assertion.sha256 },
          group.obligationId + ': source assertion identity',
        )
        const relativePath = assertion.path.startsWith('src/')
          ? assertion.path.slice(4)
          : assertion.path
        const filename = path.join(sourceRoot, relativePath)
        const source = fs.readFileSync(filename, 'utf8')
        assert.equal(
          occurrenceCount(source, assertion.fragment),
          assertion.count,
          `${group.obligationId}: ${assertion.path}: ${assertion.fragment}`,
        )
        if (!parsedPaths.has(filename) && /\.[cm]?[jt]sx?$/.test(filename)) {
          const sourceFile = ts.createSourceFile(
            filename,
            source,
            ts.ScriptTarget.Latest,
            true,
            filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
          )
          assert.equal(
            sourceFile.parseDiagnostics.length,
            0,
            assertion.path + ': TypeScript parse diagnostics',
          )
          parsedPaths.add(filename)
        }
      }
      for (const absence of [
        ...(obligation.sourceAbsences ?? []),
        ...(obligation.sourceRemovals ?? []),
      ]) {
        assert.equal(
          sha256(Buffer.from(absence.fragment)),
          absence.sha256,
          group.obligationId + ': source absence identity',
        )
        const relativePath = absence.path.startsWith('src/')
          ? absence.path.slice(4)
          : absence.path
        const filename = path.join(sourceRoot, relativePath)
        if (fs.existsSync(filename)) {
          assert.equal(
            fs.readFileSync(filename, 'utf8').includes(absence.fragment),
            false,
            `${group.obligationId}: removed fragment in ${absence.path}`,
          )
        }
      }
    }
  },
)

test(
  'authenticated target121 contains every admitted residue at its frozen range',
  {
    skip:
      semanticCase !== fixture.case || !targetPath
        ? 'the exact target121 case and authenticated target bundle are required'
        : false,
  },
  () => {
    const targetBytes = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'authenticated target121 inner bundle',
    )
    const targetText = targetBytes.toString('utf8')
    const { structural } = readInputs()
    const parsedUnits = new Map()
    for (const row of fixture.groups.flatMap(group => group.rows)) {
      const region = structural.regions[row.targetIndex].target
      const unit = targetText.slice(region.start, region.end)
      assert.equal(
        sha256(Buffer.from(unit)),
        row.sourceHash,
        `u${row.targetIndex}: authenticated structural hash`,
      )
      if (!parsedUnits.has(row.targetIndex)) {
        parsedUnits.set(
          row.targetIndex,
          parse(unit, {
            allowHashBang: true,
            ecmaVersion: 'latest',
            sourceType: 'module',
          }),
        )
      }
      let found = false
      walk(parsedUnits.get(row.targetIndex), node => {
        if (
          row.literalKind === 'string' &&
          node.type === 'Literal' &&
          node.value === row.value &&
          region.start + node.start === row.start &&
          region.start + node.end === row.end
        ) {
          found = true
        }
        if (
          row.literalKind === 'property' &&
          node.type === 'Identifier' &&
          node.name === row.value &&
          region.start + node.start === row.start &&
          region.start + node.end === row.end
        ) {
          found = true
        }
      })
      assert.ok(
        found,
        `u${row.targetIndex}: ${row.literalKind} ${row.value} at ${row.start}-${row.end}`,
      )
    }
  },
)
