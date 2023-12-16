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
  TARGET119_UDS_CLIENT_OWNER_OVERRIDES,
  TARGET119_UDS_CLIENT_PROOF_SPECS,
} from '../cases/2.1.118-to-2.1.119/recovered/uds-client-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-uds-client-owner-proofs.json',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-uds-client-owner-proofs.mjs',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/uds-client-owner-overrides.mjs',
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
  '10a79af5c7a50f230e5905c7d644e5514754ed9e30f315d0388b4a37378972da'
const BUILDER_SHA256 =
  '2cefc23f7855c9f8f01ca30f96bb7c731cd29597416ef163a313f375c1d12b96'
const HELPER_SHA256 =
  '478639a09922e4c72ef165564f1d82c79695203a1c62e9f92ab5e244537ef25c'
const RECOVERED_SOURCE_PHASE = Object.freeze({
  source: Object.freeze({
    path: 'src/utils/udsClient.ts',
    bytes: 7275,
    sha256: 'af64419e15b607cce8e1eb3aaab6683d29cf4a958433630bd0f29bc83c23dfec',
  }),
  sourceScopes: Object.freeze({
    listAllLiveSessions: Object.freeze({
      start: 5838,
      end: 6624,
      bytes: 786,
      sha256: '6f6b0585decc8b6af06c15a08460018d9226b97c15bd0217f1b2fe9af29561b1',
    }),
  }),
})

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

function identity(kind, value) {
  return JSON.stringify([kind, value])
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
      if (typeof node.value === 'string') {
        add('string', node.value, node.start, node.end)
      } else if (typeof node.value === 'number') {
        add('number', String(node.value), node.start, node.end)
      }
    } else if (node.type === 'TemplateElement') {
      add(
        'string',
        node.value?.cooked ?? node.value?.raw,
        node.start,
        node.end,
      )
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
    if (property) {
      add('property', property.name, property.start, property.end)
    }
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

function targetIdentifierOffsets(source, baseOffset, names) {
  const offsets = Object.fromEntries(names.map(name => [name, []]))
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Identifier' && offsets[node.name]) {
      offsets[node.name].push(baseOffset + node.start)
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(ast)
  return offsets
}

function canonicalRows() {
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
  'Target119 UDS-client owner fixture and helpers remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 3,
      residues: 4,
      sourceFiles: 1,
      representations: {
        'closed-validator-set-hoisting': 2,
        'complete-declaration-lowering': 2,
      },
      targetIndicesSha256:
        '7e021b4a203aa49d61b40cc235d3ddacf0cdc5eef4af2a2e68e8a0d69e457a09',
      residueIdentitiesSha256:
        '64f9678a2333ec049f8ffb9436cb8ef1453b85d1d8ada3778af876eff7c861d6',
    })
    assert.equal(
      sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalRows())),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.deepEqual(
      fixture.ownerOverrides,
      TARGET119_UDS_CLIENT_OWNER_OVERRIDES,
    )
    assert.deepEqual(
      fixture.rows.map(row => ({
        targetIndex: row.targetIndex,
        sourceScopes: row.sourceScopes.map(scope => scope.name),
        representation: row.representation,
        residues: row.residues.map(residue => ({
          kind: residue.kind,
          value: residue.value,
          start: residue.start,
          end: residue.end,
          baselineCount: residue.baselineCount,
          targetOrdinal: residue.targetOrdinal,
        })),
      })),
      TARGET119_UDS_CLIENT_PROOF_SPECS,
    )
  },
)

test(
  'authenticated UDS module, complete units, source scopes, and residues remain exact',
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
      'Target119 frozen analysis',
    )
    const sourceInput = fixture.inputs.sourceFiles[0]
    const sourceBytes = fs.readFileSync(
      path.join(sourceRoot, sourceInput.path.replace(/^src\//, '')),
    )
    const sourceFileDescriptor = descriptor(sourceBytes)
    const historicalPhase =
      sourceFileDescriptor.bytes === sourceInput.bytes &&
      sourceFileDescriptor.sha256 === sourceInput.sha256
    const recoveredPhase =
      sourceFileDescriptor.bytes === RECOVERED_SOURCE_PHASE.source.bytes &&
      sourceFileDescriptor.sha256 === RECOVERED_SOURCE_PHASE.source.sha256
    assert.ok(
      historicalPhase || recoveredPhase,
      `${sourceInput.path}: unrecognized Target119 source phase ${JSON.stringify(sourceFileDescriptor)}`,
    )
    const moduleBytes = targetBytes.subarray(
      fixture.targetModule.start,
      fixture.targetModule.end,
    )
    assert.deepEqual(descriptor(moduleBytes), {
      bytes: fixture.targetModule.bytes,
      sha256: fixture.targetModule.sha256,
    })
    assert.deepEqual(
      targetIdentifierOffsets(
        moduleBytes.toString('utf8'),
        fixture.targetModule.start,
        Object.keys(fixture.targetModule.identifierOffsets),
      ),
      fixture.targetModule.identifierOffsets,
    )
    assert.deepEqual(
      descriptor(
        targetBytes.subarray(
          fixture.targetModule.exportTable.start,
          fixture.targetModule.exportTable.end,
        ),
      ),
      {
        bytes: fixture.targetModule.exportTable.bytes,
        sha256: fixture.targetModule.exportTable.sha256,
      },
    )
    const baselineOccurrences = bundleOccurrences(baselineBytes.toString('utf8'))
    const targetOccurrences = bundleOccurrences(targetBytes.toString('utf8'))
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
      assert.deepEqual(row.source, sourceInput)
      for (const scope of row.sourceScopes) {
        const expectedScope = recoveredPhase
          ? RECOVERED_SOURCE_PHASE.sourceScopes[scope.name] ?? scope
          : scope
        assert.deepEqual(
          descriptor(
            sourceBytes.subarray(expectedScope.start, expectedScope.end),
          ),
          { bytes: expectedScope.bytes, sha256: expectedScope.sha256 },
          `${row.source.path}#${scope.name}`,
        )
      }
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
  'Target119 UDS-client proof builder reproduces the fixture exactly',
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
  'Target119 UDS-client coverage evolves as one exact owner/evidence set',
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
    const coverageRows = new Map(
      coverage.rows.map(row => [row.targetIndex, row]),
    )
    const fixtureRows = new Map(
      fixture.rows.map(row => [row.targetIndex, row]),
    )
    const states = new Set()
    for (const expected of TARGET119_UDS_CLIENT_OWNER_OVERRIDES) {
      const row = coverageRows.get(expected.targetIndex)
      const proof = fixtureRows.get(expected.targetIndex)
      assert.ok(row, `u${expected.targetIndex}: coverage row`)
      assert.deepEqual(
        {
          start: row.start,
          end: row.end,
          nodeType: row.nodeType,
          sourceHash: row.sourceHash,
        },
        {
          start: proof.target.start,
          end: proof.target.end,
          nodeType: proof.target.nodeType,
          sourceHash: proof.target.sourceHash,
        },
      )
      const actualPaths = row.ownerIds.map(ownerId => owners.get(ownerId))
      const provisional =
        JSON.stringify(actualPaths) ===
          JSON.stringify(proof.priorOwnerPaths) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(['source-map-attribution', 'semantic-test']) &&
        row.behavior ===
          'Compiled target unit is attributed to src/utils/fileHistory.ts; its authored runtime owner and call path are present in the target semantic tree and current cumulative src/.'
      const corrected =
        JSON.stringify(actualPaths) === JSON.stringify(expected.paths) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(expected.evidenceIds) &&
        row.behavior === expected.behavior
      assert.ok(
        provisional || corrected,
        `u${expected.targetIndex}: exact provisional or corrected coverage`,
      )
      states.add(corrected ? 'corrected' : 'provisional')
    }
    assert.equal(states.size, 1, `mixed UDS-client state: ${[...states]}`)
  },
)
