import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_SECONDARY_STATIC_OWNER_OVERRIDES,
  TARGET119_SECONDARY_STATIC_PROOF_SPECS,
} from '../cases/2.1.118-to-2.1.119/recovered/secondary-static-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-secondary-static-owner-proofs.json',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-secondary-static-owner-proofs.mjs',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/secondary-static-owner-overrides.mjs',
)
const historicalSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '0097c23f8eac1d0597c5e8f8c69736adf61cfd64ea94871c26c5a30a1397b58e'
const BUILDER_SHA256 =
  '23eb51df80af8c6ed8b44fc0be688f6769114a2aa41b53457c3378f410635c94'
const HELPER_SHA256 =
  '140aa1f87955c4683c6b4b312e32f6b548468cce7a01439123e48eb107346c07'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function canonicalFlags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value,
  ])
}

function bundleOccurrences(source) {
  const occurrences = new Map()
  function add(kind, value, start, end) {
    const key = identity(kind, value)
    const rows = occurrences.get(key) ?? []
    rows.push({ start, end })
    occurrences.set(key, rows)
  }
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node.start, node.end)
      else if (typeof node.value === 'string') {
        add('string', node.value, node.start, node.end)
      } else if (typeof node.value === 'number') {
        add('number', String(node.value), node.start, node.end)
      }
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw, node.start, node.end)
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
    if (property) add('property', property.name, property.start, property.end)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  for (const rows of occurrences.values()) {
    rows.sort((left, right) => left.start - right.start)
  }
  return occurrences
}

function canonicalFixtureRows() {
  return fixture.rows.flatMap(row =>
    row.residues.map(residue => [
      row.targetIndex,
      residue.kind,
      residue.value,
      residue.start,
      residue.end,
      residue.baselineCount,
      residue.targetOrdinal,
    ]),
  )
}

test(
  'Target119 secondary static-owner fixture and helpers remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 7,
      residues: 10,
      sourceFiles: 7,
      representationCounts: {
        'build-metadata-object-expansion': 3,
        'minified-typeof-undefined': 1,
        'named-import-member-lowering': 6,
      },
      targetIndicesSha256:
        '86028c35859ad0645fe09f8a3f21d42c39b7dc5abecdf8d5ee5935f90927b4fb',
      residueIdentitiesSha256:
        '13bde77d75a68971e11998a1dc6a7800839d42b08fa5cf0f25681c110faa39d3',
    })
    assert.equal(
      sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalFixtureRows())),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.deepEqual(
      fixture.ownerOverrides,
      TARGET119_SECONDARY_STATIC_OWNER_OVERRIDES,
    )
    assert.deepEqual(
      fixture.rows.map(row => ({
        targetIndex: row.targetIndex,
        scopeName: row.scope.name,
        representations: row.residues.map(residue => ({
          kind: residue.kind,
          value: residue.value,
          representation: residue.representation,
          ...(residue.proof.module
            ? {
                module: residue.proof.module,
                importedName: residue.proof.importedName,
              }
            : {}),
        })),
      })),
      TARGET119_SECONDARY_STATIC_PROOF_SPECS,
    )
  },
)

test(
  'authenticated bundles and source scopes pin every secondary static residue',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baselineBytes = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 baseline bundle',
    )
    const targetBytes = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 target bundle',
    )
    const structuralBytes = readExact(
      path.join(root, fixture.inputs.structural.path),
      fixture.inputs.structural,
      'Target119 structural delta',
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    readExact(
      path.join(root, fixture.inputs.frozenAnalysis.path),
      fixture.inputs.frozenAnalysis,
      'Target119 frozen owner-residue analysis',
    )
    const baselineOccurrences = bundleOccurrences(baselineBytes.toString('utf8'))
    const targetOccurrences = bundleOccurrences(targetBytes.toString('utf8'))
    const sourceInputs = new Map(
      fixture.inputs.sourceFiles.map(source => [source.path, source]),
    )
    for (const row of fixture.rows) {
      const region = regions.get(row.targetIndex)
      assert.ok(region, `u${row.targetIndex}: structural region`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          sourceHash: region.target.sourceHash,
        },
        row.target,
      )
      assert.equal(
        sha256(targetBytes.subarray(row.target.start, row.target.end)),
        row.target.sourceHash,
      )
      const sourceBytes = readExact(
        path.join(sourceRoot, row.ownerPath.replace(/^src\//, '')),
        sourceInputs.get(row.ownerPath),
        row.ownerPath,
      )
      assert.deepEqual(
        {
          path: row.ownerPath,
          ...descriptor(sourceBytes),
        },
        row.source,
      )
      assert.deepEqual(
        {
          start: row.scope.start,
          end: row.scope.end,
          ...descriptor(sourceBytes.subarray(row.scope.start, row.scope.end)),
        },
        {
          start: row.scope.start,
          end: row.scope.end,
          bytes: row.scope.bytes,
          sha256: row.scope.sha256,
        },
      )
      for (const residue of row.residues) {
        const key = identity(residue.kind, residue.value)
        assert.equal(
          (baselineOccurrences.get(key) ?? []).length,
          residue.baselineCount,
        )
        assert.deepEqual(
          (targetOccurrences.get(key) ?? [])[residue.targetOrdinal - 1],
          { start: residue.start, end: residue.end },
        )
        assert.ok(
          residue.start >= row.target.start && residue.end <= row.target.end,
        )
      }
    }
  },
)

test(
  'Target119 secondary static proof builder reproduces the fixture exactly',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const result = spawnSync(process.execPath, [builderPath], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(result.stdout, fixtureBytes.toString('utf8'))
  },
)

test(
  'Target119 secondary static coverage evolves as one exact evidence set',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            root,
            'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
    const states = new Set()
    for (const expected of TARGET119_SECONDARY_STATIC_OWNER_OVERRIDES) {
      const row = rows.get(expected.targetIndex)
      assert.ok(row, `u${expected.targetIndex}: coverage row`)
      assert.deepEqual(
        row.ownerIds.map(ownerId => owners.get(ownerId)),
        expected.paths,
      )
      const provisional =
        JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
      const corrected =
        JSON.stringify(row.evidenceIds) === JSON.stringify(expected.evidenceIds) &&
        row.behavior === expected.behavior
      assert.ok(
        provisional || corrected,
        `u${expected.targetIndex}: exact provisional or corrected evidence`,
      )
      states.add(corrected ? 'corrected' : 'provisional')
    }
    assert.equal(states.size, 1, `mixed secondary-static state: ${[...states]}`)
  },
)
