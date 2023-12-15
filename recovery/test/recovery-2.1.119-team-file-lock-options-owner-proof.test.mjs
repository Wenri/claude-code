import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_TEAM_FILE_LOCK_OPTIONS_EVIDENCE_IDS,
  TARGET119_TEAM_FILE_LOCK_OPTIONS_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/team-file-lock-options-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-team-file-lock-options-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/team-file-lock-options-owner-overrides.mjs',
)
const coveragePath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '9118f6577b32e1d9b801c2c68d2e2ebec0645ea09ef51fb3d30f943a9365d936'
const HELPER_SHA256 =
  '90ddd476b9ba8d3172698b6a51ef5de5208a8cadcc770a578db23b5ffe17815b'
const TEAM_ROLE_DESCRIPTION =
  'Type/role of the team lead (e.g., "researcher", "test-runner"). Used for team file and inter-agent coordination.'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
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

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit)
    }
  }
}

function lockOptions(unitText) {
  const tree = parse(unitText, { ecmaVersion: 'latest', sourceType: 'script' })
  const matches = []
  walk(tree, node => {
    if (node.type !== 'ObjectExpression') return
    const keys = node.properties.map(property =>
      property.key.type === 'Identifier' ? property.key.name : property.key.value,
    )
    if (keys.includes('realpath') && keys.includes('retries')) matches.push(node)
  })
  assert.equal(matches.length, 1)
  const node = matches[0]
  return { node, text: unitText.slice(node.start, node.end), tree }
}

function residueIdentities() {
  return fixture.row.residues.map(residue => [
    fixture.row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ])
}

test(
  'Target119 team-file lock fixture and static owner override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_TEAM_FILE_LOCK_OPTIONS_EVIDENCE_IDS,
    )
    assert.deepEqual(
      TARGET119_TEAM_FILE_LOCK_OPTIONS_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: row.paths,
        declarations: row.declarations,
        evidenceIds: row.evidenceIds,
      })),
      [
        {
          targetIndex: fixture.row.targetIndex,
          paths: fixture.row.ownerPaths,
          declarations: fixture.row.declarations,
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
    assert.equal(
      sha256(JSON.stringify([fixture.row.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(residueIdentities())),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated Target119 initializer adds only the live no-op compromise callback',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural delta',
        ),
      ),
    )
    const regionByIndex = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    const targetRegion = regionByIndex.get(fixture.target.unit.targetIndex)
    assert(targetRegion)
    assert.deepEqual(
      {
        classification: targetRegion.classification,
        nodeType: targetRegion.target.nodeType,
        start: targetRegion.target.start,
        end: targetRegion.target.end,
        sourceHash: targetRegion.target.sourceHash,
        coarseHash: targetRegion.target.coarseHash,
      },
      {
        classification: 'unresolved',
        nodeType: fixture.target.unit.nodeType,
        start: fixture.target.unit.start,
        end: fixture.target.unit.end,
        sourceHash: fixture.target.unit.sha256,
        coarseHash: fixture.target.unit.coarseHash,
      },
    )

    const baselineUnit = baseline.slice(
      fixture.baseline.unit.start,
      fixture.baseline.unit.end,
    )
    const targetUnit = target.slice(
      fixture.target.unit.start,
      fixture.target.unit.end,
    )
    assert.deepEqual(descriptor(baselineUnit), {
      bytes: fixture.baseline.unit.bytes,
      sha256: fixture.baseline.unit.sha256,
    })
    assert.deepEqual(descriptor(targetUnit), {
      bytes: fixture.target.unit.bytes,
      sha256: fixture.target.unit.sha256,
    })
    assert.equal(
      (baselineUnit.match(new RegExp(TEAM_ROLE_DESCRIPTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length,
      1,
    )
    assert.equal(
      (targetUnit.match(new RegExp(TEAM_ROLE_DESCRIPTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length,
      1,
    )

    const baselineLock = lockOptions(baselineUnit)
    const targetLock = lockOptions(targetUnit)
    assert.deepEqual(
      {
        start: baselineLock.node.start + fixture.baseline.unit.start,
        end: baselineLock.node.end + fixture.baseline.unit.start,
        ...descriptor(baselineLock.text),
      },
      fixture.baseline.lockOptions,
    )
    assert.deepEqual(
      {
        start: targetLock.node.start + fixture.target.unit.start,
        end: targetLock.node.end + fixture.target.unit.start,
        ...descriptor(targetLock.text),
      },
      fixture.target.lockOptions,
    )
    const baselineValue = Function(`return (${baselineLock.text})`)()
    const targetValue = Function(`return (${targetLock.text})`)()
    assert.deepEqual(baselineValue, {
      realpath: false,
      retries: { retries: 10, minTimeout: 5, maxTimeout: 100 },
    })
    assert.equal(typeof targetValue.onCompromised, 'function')
    assert.doesNotThrow(() => targetValue.onCompromised(new Error('stale lock')))
    delete targetValue.onCompromised
    assert.deepEqual(targetValue, baselineValue)
    assert.equal(
      target.slice(
        fixture.target.onCompromisedProperty.start,
        fixture.target.onCompromisedProperty.end,
      ),
      'onCompromised:()=>{}',
    )
    assert.deepEqual(
      descriptor(
        target.slice(
          fixture.target.onCompromisedProperty.start,
          fixture.target.onCompromisedProperty.end,
        ),
      ),
      {
        bytes: fixture.target.onCompromisedProperty.bytes,
        sha256: fixture.target.onCompromisedProperty.sha256,
      },
    )

    for (const expected of fixture.target.supportingUnits) {
      const region = regionByIndex.get(expected.targetIndex)
      assert(region)
      assert.equal(region.classification, 'matched')
      assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
      assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
      assert.deepEqual(
        descriptor(target.slice(expected.start, expected.end)),
        { bytes: expected.bytes, sha256: expected.sha256 },
        expected.role,
      )
    }
    const updateUnit = fixture.target.supportingUnits.find(
      row => row.role === 'updateTeamFile',
    )
    assert.match(target.slice(updateUnit.start, updateUnit.end), /\.\.\.lk1/)
  },
)

test(
  'retained authored lineage proves the base lock graph while current source stays fail closed',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const source = readExact(
      path.join(sourceRoot, fixture.inputs.source.path.replace(/^src\//, '')),
      fixture.inputs.source,
      'Target119 teamHelpers source',
    ).toString('utf8')
    const sourceFile = ts.createSourceFile(
      fixture.inputs.source.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.deepEqual(sourceFile.parseDiagnostics, [])
    const inputSchema = sourceFile.statements.find(
      statement =>
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          declaration => declaration.name.getText(sourceFile) === 'inputSchema',
        ),
    )
    assert(inputSchema)
    const inputSchemaText = source.slice(
      inputSchema.getStart(sourceFile),
      inputSchema.end,
    )
    assert.deepEqual(descriptor(inputSchemaText), {
      bytes: fixture.source.inputSchemaDeclaration.bytes,
      sha256: fixture.source.inputSchemaDeclaration.sha256,
    })
    assert.deepEqual(
      { start: inputSchema.getStart(sourceFile), end: inputSchema.end },
      {
        start: fixture.source.inputSchemaDeclaration.start,
        end: fixture.source.inputSchemaDeclaration.end,
      },
    )
    assert.equal(
      inputSchemaText.includes(
        'Type/role of the team lead (e.g., "researcher", "test-runner"). ',
      ),
      true,
    )
    assert.equal(
      inputSchemaText.includes('Used for team file and inter-agent coordination.'),
      true,
    )
    for (const name of fixture.source.requiredAbsentDeclarations) {
      assert.equal(source.includes(name), false, `${name} remains absent`)
    }

    const donor = readExact(
      path.join(root, fixture.inputs.retainedSourceDonor.path),
      fixture.inputs.retainedSourceDonor,
      'authenticated retained team-file source replay',
    ).toString('utf8')
    for (const exact of [
      '+const TEAM_FILE_LOCK_OPTIONS = {',
      '+  realpath: false,',
      '+  retries: { retries: 10, minTimeout: 5, maxTimeout: 100 },',
      '+export async function updateTeamFile<T>(',
      '+      lockfilePath: `${teamFilePath}.lock`,',
      '+      ...TEAM_FILE_LOCK_OPTIONS,',
      '+export async function removeTeamMember(',
    ]) {
      assert.equal(donor.split(exact).length - 1, 1, exact)
    }
    assert.equal(donor.includes('+  onCompromised:'), false)
  },
)

test(
  'coverage changes u14123 only from coarse attribution to the exact temporal proof',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const row = coverage.rows.find(
      item => item.targetIndex === fixture.row.targetIndex,
    )
    assert(row)
    const integrated = fixture.evidenceIds.every(id => row.evidenceIds.includes(id))
    if (!integrated) {
      assert.deepEqual(row.evidenceIds, ['source-map-attribution', 'semantic-test'])
      return
    }
    assert.deepEqual(row.evidenceIds, fixture.evidenceIds)
    assert.deepEqual(
      row.ownerIds.map(id => coverage.owners.find(owner => owner.id === id)?.path),
      fixture.row.ownerPaths,
    )
    assert.equal(row.disposition, 'source-runtime-covered')
  },
)
