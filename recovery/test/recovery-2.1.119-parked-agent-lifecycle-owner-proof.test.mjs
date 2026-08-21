import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  TARGET119_PARKED_AGENT_LIFECYCLE_EVIDENCE_IDS,
  TARGET119_PARKED_AGENT_LIFECYCLE_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/parked-agent-lifecycle-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-parked-agent-lifecycle-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/parked-agent-lifecycle-owner-overrides.mjs',
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
  '79896bbab13bfe766a06734ade40a9d1cb224a6029f566711c6afad86e1cdd10'
const HELPER_SHA256 =
  'a5d5ef397e53a9b538d060d584bd604f10f2ebb36b80294dfbc748dac31fc760'

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

function artifactPath(version, input) {
  const environment = `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
  return process.env[environment]
    ? path.resolve(process.env[environment])
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

function canonicalResidues() {
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

function structuralRegion(structural, targetIndex) {
  const matches = structural.regions.filter(
    region => region.target.index === targetIndex,
  )
  assert.equal(matches.length, 1, `one structural region for u${targetIndex}`)
  return matches[0]
}

function assertUnit(bundle, expected, label) {
  const text = bundle.slice(expected.start, expected.end)
  assert.deepEqual(descriptor(text), {
    bytes: expected.end - expected.start,
    sha256: expected.sha256,
  }, label)
  return text
}

function targetLifecycle(task, now) {
  const terminal = ['completed', 'failed', 'killed'].includes(task.status)
  if (!terminal || task.retain) return 'running'
  if (task.status === 'completed' && task.keepaliveCount > 0) return 'parked'
  if (task.evictAfter === undefined || task.evictAfter > now) return 'evicting'
  return 'gone'
}

function sourceWakeEligible(task) {
  return (
    task.isLocal &&
    task.status === 'completed' &&
    !task.retain &&
    task.keepaliveCount > 0
  )
}

test(
  'Target119 parked-agent fixture, override, and coverage evolve atomically',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_PARKED_AGENT_LIFECYCLE_EVIDENCE_IDS,
    )
    assert.deepEqual(
      TARGET119_PARKED_AGENT_LIFECYCLE_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        evidenceIds: [...row.evidenceIds],
      })),
      fixture.rows.map(row => ({
        targetIndex: row.targetIndex,
        paths: [row.ownerPath],
        evidenceIds: fixture.evidenceIds,
      })),
    )
    const indices = fixture.rows.map(row => row.targetIndex)
    assert.equal(
      sha256(JSON.stringify(indices)),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalResidues())),
      fixture.summary.residueIdentitiesSha256,
    )

    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const coverageRows = new Map(
      coverage.rows
        .filter(row => indices.includes(row.targetIndex))
        .map(row => [row.targetIndex, row]),
    )
    assert.equal(coverageRows.size, 2)
    const exactStates = indices.map(index => {
      const row = coverageRows.get(index)
      const paths = row.ownerIds.map(ownerId =>
        coverage.owners.find(owner => owner.id === ownerId)?.path,
      )
      assert.deepEqual(paths, [fixture.rows[0].ownerPath])
      return fixture.evidenceIds.every(id => row.evidenceIds.includes(id))
    })
    assert(
      exactStates.every(Boolean) || exactStates.every(state => !state),
      'coverage must be entirely provisional or entirely corrected',
    )
  },
)

test(
  'authenticated Target119 units form one bounded LocalAgentTask lifecycle cluster',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baseline = readExact(
      artifactPath('2.1.118', fixture.inputs.bundles['118']),
      fixture.inputs.bundles['118'],
      'Target118 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('2.1.119', fixture.inputs.bundles['119']),
      fixture.inputs.bundles['119'],
      'Target119 bundle',
    ).toString('utf8')
    assert.equal((baseline.match(/"parked"/g) ?? []).length, 0)
    assert.equal((target.match(/"parked"/g) ?? []).length, 2)
    assert.equal((target.match(/"evicting"/g) ?? []).length, 1)

    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural['119'].path),
          fixture.inputs.structural['119'],
          'Target119 structural ledger',
        ),
      ),
    )
    for (const unit of fixture.target.units) {
      const region = structuralRegion(structural, unit.targetIndex)
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        {
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          nodeType: unit.nodeType,
          start: unit.start,
          end: unit.end,
          tokenCount: unit.tokenCount,
          sourceHash: unit.sha256,
          coarseHash: unit.coarseHash,
        },
      )
      assertUnit(target, unit, `Target119 u${unit.targetIndex}`)
    }
    for (const unit of fixture.target.adjacentOwnerUnits.slice(0, 3)) {
      const region = structuralRegion(structural, unit.targetIndex)
      assert.equal(region.classification, 'matched')
      assertUnit(target, unit, `Target119 owner neighbor u${unit.targetIndex}`)
    }
    assert.equal(
      fixture.target.adjacentOwnerUnits[0].end,
      fixture.target.adjacentOwnerUnits[1].start,
    )
    assert.equal(
      fixture.target.adjacentOwnerUnits[1].end,
      fixture.target.units[0].start,
    )
    assert.equal(fixture.target.units[0].end, fixture.target.units[1].start)
    assert.equal(
      fixture.target.units[1].end,
      fixture.target.adjacentOwnerUnits[2].start,
    )

    const consumerRegion = structuralRegion(
      structural,
      fixture.target.consumer.targetIndex,
    )
    assert.equal(consumerRegion.target.sourceHash, fixture.target.consumer.sha256)
    assertUnit(target, fixture.target.consumer, 'Target119 wake-router consumer')
    const call = target.slice(
      fixture.target.consumer.parkedCall.start,
      fixture.target.consumer.parkedCall.end,
    )
    assert.deepEqual(descriptor(call), {
      bytes: fixture.target.consumer.parkedCall.bytes,
      sha256: fixture.target.consumer.parkedCall.sha256,
    })

    const [lifecycleText, parkedText] = fixture.target.units.map(unit =>
      target.slice(unit.start, unit.end),
    )
    const lifecycleName = lifecycleText.match(/^function ([^(]+)/)?.[1]
    const parkedName = parkedText.match(/^function ([^(]+)/)?.[1]
    assert(lifecycleName && parkedName)
    assert.equal(
      [...target.matchAll(new RegExp(`\\b${lifecycleName}\\(`, 'g'))].length,
      2,
      'lifecycle classifier has only its declaration and parked predicate call',
    )
    assert.equal(
      [...target.matchAll(new RegExp(`\\b${parkedName}\\(`, 'g'))].length,
      2,
      'parked predicate has only its declaration and wake-router call',
    )
  },
)

test(
  'lifecycle, parked predicate, and wake consumer remain exact through Target121',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    let priorLifecycle = fixture.target.units[0].targetIndex
    let priorParked = fixture.target.units[1].targetIndex
    let priorConsumer = fixture.target.consumer.targetIndex
    for (const lineage of fixture.forwardLineage) {
      const version = lineage.version
      const bundle = readExact(
        artifactPath(version, fixture.inputs.bundles[version.slice(-3)]),
        fixture.inputs.bundles[version.slice(-3)],
        `Target${version.slice(-3)} bundle`,
      ).toString('utf8')
      const structural = JSON.parse(
        gunzipSync(
          readExact(
            path.join(root, fixture.inputs.structural[version.slice(-3)].path),
            fixture.inputs.structural[version.slice(-3)],
            `Target${version.slice(-3)} structural ledger`,
          ),
        ),
      )
      for (const [key, prior] of [
        ['lifecycle', priorLifecycle],
        ['parked', priorParked],
        ['consumer', priorConsumer],
      ]) {
        const expected = lineage[key]
        const region = structuralRegion(structural, expected.targetIndex)
        assert.equal(region.classification, 'matched')
        assert.equal(region.baselineUnitIndex, prior)
        assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
        assert.equal(region.target.coarseHash, expected.coarseHash)
        assertUnit(bundle, expected, `${version} ${key}`)
      }
      const call = bundle.slice(
        lineage.parkedCall.start,
        lineage.parkedCall.end,
      )
      assert.deepEqual(descriptor(call), {
        bytes: lineage.parkedCall.bytes,
        sha256: lineage.parkedCall.sha256,
      })
      priorLifecycle = lineage.lifecycle.targetIndex
      priorParked = lineage.parked.targetIndex
      priorConsumer = lineage.consumer.targetIndex
    }
  },
)

test(
  'historical source owns the fields and expresses the live parked condition inline',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const sources = new Map()
    for (const expected of fixture.inputs.sourceFiles) {
      const filename = path.join(sourceRoot, expected.path.replace(/^src\//, ''))
      const source = readExact(filename, expected, expected.path).toString('utf8')
      sources.set(expected.path, source)
      assert.equal(
        fs.realpathSync(filename),
        filename,
        `${expected.path} must not resolve through a symlink`,
      )
    }
    for (const expected of fixture.source.declarations) {
      const source = sources.get(expected.path)
      const sourceFile = ts.createSourceFile(
        expected.path,
        source,
        ts.ScriptTarget.Latest,
        true,
        expected.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      const matches = sourceFile.statements.filter(
        statement => statement.name?.text === expected.name,
      )
      assert.equal(matches.length, 1, `${expected.path}#${expected.name}`)
      const statement = matches[0]
      const text = source.slice(statement.getStart(sourceFile), statement.end)
      assert.deepEqual(
        {
          start: statement.getStart(sourceFile),
          end: statement.end,
          ...descriptor(text),
        },
        {
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          sha256: expected.sha256,
        },
      )
    }
    const inline = fixture.source.inlineParkedRejection
    const wake = sources.get(inline.path)
    assert.deepEqual(
      descriptor(wake.slice(inline.start, inline.end)),
      { bytes: inline.bytes, sha256: inline.sha256 },
    )
    assert.equal(fixture.source.replayHelper, null)
    assert.equal(fixture.source.privateHelperNamesAuthenticated, false)
  },
)

test(
  'inline wake selection is exhaustive-equivalent to the authenticated parked predicate',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const now = 10_000
    for (const isLocal of [false, true]) {
      for (const status of [
        'pending',
        'running',
        'completed',
        'failed',
        'killed',
      ]) {
        for (const retain of [false, true]) {
          for (const keepaliveCount of [0, 1, 3]) {
            for (const evictAfter of [undefined, now - 1, now, now + 1]) {
              const task = {
                isLocal,
                status,
                retain,
                keepaliveCount,
                evictAfter,
              }
              const parked = targetLifecycle(task, now) === 'parked'
              assert.equal(sourceWakeEligible(task), isLocal && parked)
            }
          }
        }
      }
    }
    assert.equal(
      targetLifecycle(
        { status: 'running', retain: false, keepaliveCount: 0 },
        now,
      ),
      'running',
    )
    assert.equal(
      targetLifecycle(
        { status: 'completed', retain: false, keepaliveCount: 1 },
        now,
      ),
      'parked',
    )
    assert.equal(
      targetLifecycle(
        { status: 'failed', retain: false, keepaliveCount: 0 },
        now,
      ),
      'evicting',
    )
    assert.equal(
      targetLifecycle(
        {
          status: 'killed',
          retain: false,
          keepaliveCount: 0,
          evictAfter: now,
        },
        now,
      ),
      'gone',
    )
  },
)
