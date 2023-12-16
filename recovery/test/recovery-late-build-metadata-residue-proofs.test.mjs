import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const fixtures = new Map([
  [
    '2.1.116-to-2.1.117',
    {
      filename: 'recovery-2.1.117-build-metadata-residue-proofs.json',
      sha256: '3a714bee033e0f4db1469a9f58c3c575dc0a9290d951657ec3b92673656ef75c',
    },
  ],
  [
    '2.1.117-to-2.1.118',
    {
      filename: 'recovery-2.1.118-build-metadata-residue-proofs.json',
      sha256: 'f5e5fdd7bfd2894b91e0a86fa41a276b147ddec8f5ec1214415f13f96fa99cf3',
    },
  ],
  [
    '2.1.118-to-2.1.119',
    {
      filename: 'recovery-2.1.119-build-metadata-residue-proofs.json',
      sha256: '8da77b269856a968beaae741547bfc2339fe34790b29ab0457e72ccce8aae31a',
    },
  ],
  [
    '2.1.119-to-2.1.120',
    {
      filename: 'recovery-2.1.120-build-metadata-residue-proofs.json',
      sha256: 'a0e8314a2903384793deb0f5e43072345d78c4eb7b28b569c0ff687a654adac5',
    },
  ],
  [
    '2.1.120-to-2.1.121',
    {
      filename: 'recovery-2.1.121-build-metadata-residue-proofs.json',
      sha256: 'de449ce0213d7a2a8c71f8b0bfb830fe34aec37255c76e4dfb81dd568f10dd49',
    },
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readFixture(caseName) {
  const descriptor = fixtures.get(caseName)
  assert.ok(descriptor, `${caseName}: fixture descriptor`)
  const filename = path.join(path.dirname(fileURLToPath(import.meta.url)), descriptor.filename)
  const value = fs.readFileSync(filename)
  assert.equal(sha256(value), descriptor.sha256, `${caseName}: fixture SHA-256`)
  return { filename, fixture: JSON.parse(value) }
}

function bundleEnvironmentVariable(version) {
  return `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
}

function identity(kind, value) {
  return `${kind}:${JSON.stringify(value)}`
}

function literalIdentity(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return identity('string', node.value)
  }
  if (node.type === 'TemplateElement') {
    const value = node.value?.cooked ?? node.value?.raw
    if (typeof value === 'string') return identity('string', value)
  }
  return null
}

function walk(node, ancestors, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, ancestors, visit)
    return
  }
  if (typeof node.type === 'string') visit(node, ancestors)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, [...ancestors, node], visit)
    }
  }
}

function objectLiteralFields(node) {
  if (node.type !== 'ObjectExpression') return new Map()
  return new Map(
    node.properties
      .filter(
        property =>
          property.type === 'Property' &&
          !property.computed &&
          property.value?.type === 'Literal',
      )
      .map(property => [
        property.key.name ?? property.key.value,
        property.value.value,
      ]),
  )
}

function macroOccurrences(source, macro) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const allowed = new Set(Object.values(macro).map(value => identity('string', value)))
  const grouped = new Map([...allowed].map(value => [value, []]))
  walk(ast, [], (node, ancestors) => {
    const value = literalIdentity(node)
    if (!value || !allowed.has(value)) return
    const enclosingMacroObjects = ancestors.filter(ancestor => {
      const fields = objectLiteralFields(ancestor)
      return (
        fields.get('VERSION') === macro.VERSION &&
        fields.get('BUILD_TIME') === macro.BUILD_TIME &&
        fields.get('GIT_SHA') === macro.GIT_SHA
      )
    })
    grouped.get(value).push({
      start: node.start,
      end: node.end,
      enclosingMacroObjects: enclosingMacroObjects.length,
    })
  })
  return grouped
}

function scannerReport(caseName, fixture, baselinePath, targetPath) {
  const caseRoot = path.join(repositoryRoot, 'recovery', 'cases', caseName)
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, 'recovery/scripts/inspect-semantic-literal-gaps.mjs'),
      '--baseline',
      baselinePath,
      '--target',
      targetPath,
      '--source-root',
      sourceRoot,
      '--structural',
      path.join(caseRoot, 'structural/generated-delta.json.gz'),
      '--partitions',
      path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
      '--sources',
      path.join(caseRoot, 'attribution/sources.jsonl.gz'),
      '--coverage',
      path.join(caseRoot, 'semantic/source-coverage.json.gz'),
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 1024 * 1024 * 1024,
    },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

for (const caseName of semanticCase ? [semanticCase] : [...fixtures.keys()]) {
  if (!fixtures.has(caseName)) continue
  const { fixture } = readFixture(caseName)

  test(`${caseName} build metadata fixture is internally complete`, () => {
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.macro.VERSION, fixture.versions.target)
    assert.equal(fixture.rows.length, fixture.summary.units)
    assert.equal(
      fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
      fixture.summary.residues,
    )
    assert.ok(fixture.summary.units > 0)
    assert.ok(fixture.summary.residues >= fixture.summary.units)
    assert.equal(new Set(fixture.rows.map(row => row.targetIndex)).size, fixture.rows.length)
    for (const row of fixture.rows) {
      assert.ok(row.ownerPaths.length > 0, `${caseName} u${row.targetIndex}: owners`)
      assert.ok(row.residues.length > 0, `${caseName} u${row.targetIndex}: residues`)
      for (const residue of row.residues) {
        assert.equal(residue.kind, 'string')
        assert.ok(Object.values(fixture.macro).includes(residue.value))
        assert.ok(residue.start >= row.target.start && residue.end <= row.target.end)
      }
    }
  })

  const baselinePath = process.env[
    bundleEnvironmentVariable(fixture.versions.baseline)
  ]
  const targetPath = process.env[
    bundleEnvironmentVariable(fixture.versions.target)
  ]

  test(
    `${caseName} macro-only target-added residues are generated build identity`,
    { skip: !baselinePath || !targetPath || semanticCase !== caseName },
    () => {
      const baselineBytes = fs.readFileSync(baselinePath)
      const targetBytes = fs.readFileSync(targetPath)
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
      const structuralByIndex = new Map(
        structural.regions.map(region => [region.target.index, region]),
      )
      const targetSource = targetBytes.toString('utf8')
      const baselineOccurrences = macroOccurrences(
        baselineBytes.toString('utf8'),
        fixture.macro,
      )
      const targetOccurrences = macroOccurrences(targetSource, fixture.macro)
      const report = scannerReport(
        caseName,
        fixture,
        baselinePath,
        targetPath,
      )
      const reportByIndex = new Map()
      for (const residue of report.sourceRuntimeAddedOwnerResidueRows) {
        const values = reportByIndex.get(residue.structural.index) ?? []
        values.push({
          kind: residue.literalKind,
          value: residue.value,
          start: residue.target.start,
          end: residue.target.end,
          baselineOccurrenceCount: residue.baselineOccurrenceCount,
          targetOccurrenceNumber: residue.targetOccurrenceNumber,
        })
        reportByIndex.set(residue.structural.index, values)
      }

      for (const row of fixture.rows) {
        const region = structuralByIndex.get(row.targetIndex)
        assert.ok(region, `${caseName} u${row.targetIndex}: structural region`)
        assert.deepEqual(
          {
            classification: region.classification,
            start: region.target.start,
            end: region.target.end,
            nodeType: region.target.nodeType,
            sourceHash: region.target.sourceHash,
          },
          row.target,
        )
        assert.equal(
          sha256(targetSource.slice(row.target.start, row.target.end)),
          row.target.sourceHash,
          `${caseName} u${row.targetIndex}: exact target slice`,
        )
        const reportResidues = reportByIndex.get(row.targetIndex) ?? []
        reportResidues.sort((left, right) => left.start - right.start)
        assert.deepEqual(
          reportResidues,
          row.residues,
          `${caseName} u${row.targetIndex}: complete macro-only residue set`,
        )
        for (const residue of row.residues) {
          const key = identity(residue.kind, residue.value)
          const baselineValues = baselineOccurrences.get(key) ?? []
          const targetValues = targetOccurrences.get(key) ?? []
          assert.equal(baselineValues.length, residue.baselineOccurrenceCount)
          const occurrence = targetValues[residue.targetOccurrenceNumber - 1]
          assert.deepEqual(
            occurrence && { start: occurrence.start, end: occurrence.end },
            { start: residue.start, end: residue.end },
          )
          assert.equal(
            occurrence.enclosingMacroObjects,
            1,
            `${caseName} u${row.targetIndex}: one exact build-macro object`,
          )
        }
        for (const ownerPath of row.ownerPaths) {
          const direct = path.join(sourceRoot, ownerPath.replace(/^src\//, ''))
          const nested = path.join(sourceRoot, ownerPath)
          const filename = fs.existsSync(direct) ? direct : nested
          assert.ok(fs.existsSync(filename), `${caseName}: owner ${ownerPath}`)
          const ownerSource = fs.readFileSync(filename, 'utf8')
          assert.ok(!ownerSource.includes(fixture.macro.BUILD_TIME))
          assert.ok(!ownerSource.includes(fixture.macro.GIT_SHA))
        }
      }
    },
  )
}
