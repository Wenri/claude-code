import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  TARGET119_UDS_REGISTRY_BLOCK_AFTER,
  TARGET119_UDS_REGISTRY_BLOCK_BEFORE,
  TARGET119_UDS_REGISTRY_INPUT,
  TARGET119_UDS_REGISTRY_OUTPUT,
  TARGET119_UDS_REGISTRY_OWNER_OVERRIDES,
  TARGET119_UDS_REGISTRY_RESIDUES,
  applyTarget119UdsRegistryReplay,
  buildTarget119UdsRegistryOutput,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-uds-registry-source-gap.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-uds-registry-source-gap.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/replay-uds-registry-source-gap.mjs',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-uds-registry-source-gap-fixture.mjs',
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
  '70b9bc56d9c2a4efef2bb5e04c2de1b5e34a95b5cbd82f36e5f0c5c113247fc9'
const BUILDER_SHA256 =
  'e0988a5c5ef6ffb9852928e4d57ece44016457da2b45daf86242af1bc506839c'
const HELPER_SHA256 =
  'f63c9671686e28f81740c7ff7dbc0dd10f87de00b031e781bb23f0d5f61383c5'

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

function sourceState(bytes) {
  const actual = descriptor(bytes)
  if (
    actual.bytes === TARGET119_UDS_REGISTRY_INPUT.bytes &&
    actual.sha256 === TARGET119_UDS_REGISTRY_INPUT.sha256
  ) {
    return 'raw'
  }
  if (
    actual.bytes === TARGET119_UDS_REGISTRY_OUTPUT.bytes &&
    actual.sha256 === TARGET119_UDS_REGISTRY_OUTPUT.sha256
  ) {
    return 'recovered'
  }
  assert.fail(`unknown UDS registry source ${actual.bytes}/${actual.sha256}`)
}

function rawSourceFrom(bytes) {
  if (sourceState(bytes) === 'raw') return bytes
  const output = Buffer.from(
    bytes
      .toString('utf8')
      .replace(
        TARGET119_UDS_REGISTRY_BLOCK_AFTER,
        TARGET119_UDS_REGISTRY_BLOCK_BEFORE,
      ),
  )
  assert.deepEqual(descriptor(output), {
    bytes: TARGET119_UDS_REGISTRY_INPUT.bytes,
    sha256: TARGET119_UDS_REGISTRY_INPUT.sha256,
  })
  return output
}

test(
  'Target119 UDS registry replay fixture and helpers remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 18,
      targetIndicesSha256:
        'b7e37458c2ae5f09c5e13619f7fb76b3621beef147181199947981453dbe09fe',
      residueIdentitiesSha256:
        '2cf15bc8f2bcfe781acf43d43b91380e80586777200ee430ead752505f54617a',
    })
    assert.equal(
      sha256(JSON.stringify([12161])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalRows())),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.deepEqual(
      fixture.ownerOverrides,
      TARGET119_UDS_REGISTRY_OWNER_OVERRIDES,
    )
    assert.deepEqual(fixture.rows[0].residues, TARGET119_UDS_REGISTRY_RESIDUES)
  },
)

test(
  'authenticated Target119 UDS registry unit and source replay stay exact',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    readExact(
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
    const region = structural.regions.find(
      candidate => candidate.target.index === fixture.rows[0].targetIndex,
    )
    assert.ok(region)
    assert.deepEqual(
      {
        classification: region.classification,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        sourceHash: region.target.sourceHash,
      },
      fixture.rows[0].target,
    )
    assert.equal(
      sha256(targetBytes.subarray(region.target.start, region.target.end)),
      fixture.rows[0].target.sourceHash,
    )
    assert.deepEqual(
      descriptor(
        targetBytes.subarray(
          fixture.targetModule.start,
          fixture.targetModule.end,
        ),
      ),
      { bytes: fixture.targetModule.bytes, sha256: fixture.targetModule.sha256 },
    )
    const liveSource = fs.readFileSync(
      path.join(
        sourceRoot,
        fixture.inputs.sourcePreimage.path.replace(/^src\//, ''),
      ),
    )
    const rawSource = rawSourceFrom(liveSource)
    const recoveredSource = Buffer.from(
      buildTarget119UdsRegistryOutput(rawSource.toString('utf8')),
    )
    assert.deepEqual(descriptor(recoveredSource), {
      bytes: fixture.inputs.sourcePostimage.bytes,
      sha256: fixture.inputs.sourcePostimage.sha256,
    })
    assert.deepEqual(
      descriptor(
        rawSource.subarray(
          fixture.inputs.sourcePreimageScope.start,
          fixture.inputs.sourcePreimageScope.end,
        ),
      ),
      {
        bytes: fixture.inputs.sourcePreimageScope.bytes,
        sha256: fixture.inputs.sourcePreimageScope.sha256,
      },
    )
    assert.deepEqual(
      descriptor(
        recoveredSource.subarray(
          fixture.inputs.sourcePostimageScope.start,
          fixture.inputs.sourcePostimageScope.end,
        ),
      ),
      {
        bytes: fixture.inputs.sourcePostimageScope.bytes,
        sha256: fixture.inputs.sourcePostimageScope.sha256,
      },
    )
  },
)

test(
  'Target119 UDS registry replay is fail-closed and idempotent in raw and package modes',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const liveSource = fs.readFileSync(
      path.join(
        sourceRoot,
        fixture.inputs.sourcePreimage.path.replace(/^src\//, ''),
      ),
    )
    const rawSource = rawSourceFrom(liveSource)
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-uds-registry-replay-'),
    )
    try {
      const filename = path.join(temporaryRoot, 'utils/udsClient.ts')
      fs.mkdirSync(path.dirname(filename), { recursive: true })
      fs.writeFileSync(filename, rawSource)
      assert.deepEqual(applyTarget119UdsRegistryReplay({ sourceRoot: temporaryRoot }), {
        status: 'recovered',
        changed: true,
      })
      assert.deepEqual(descriptor(fs.readFileSync(filename)), {
        bytes: fixture.inputs.sourcePostimage.bytes,
        sha256: fixture.inputs.sourcePostimage.sha256,
      })
      assert.deepEqual(applyTarget119UdsRegistryReplay({ sourceRoot: temporaryRoot }), {
        status: 'already-recovered',
        changed: false,
      })
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
    }
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
  'Target119 UDS registry coverage evolves atomically with replay state',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const liveSource = fs.readFileSync(
      path.join(
        sourceRoot,
        fixture.inputs.sourcePreimage.path.replace(/^src\//, ''),
      ),
    )
    const replayState = sourceState(liveSource)
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
    const row = coverage.rows.find(candidate => candidate.targetIndex === 12161)
    assert.ok(row)
    const expected = TARGET119_UDS_REGISTRY_OWNER_OVERRIDES[0]
    const actualPaths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const provisional =
      JSON.stringify(actualPaths) ===
        JSON.stringify(fixture.rows[0].priorOwnerPaths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test']) &&
      row.behavior ===
        'Compiled target unit is attributed to src/utils/fileHistory.ts; its authored runtime owner and call path are present in the target semantic tree and current cumulative src/.'
    const corrected =
      JSON.stringify(actualPaths) === JSON.stringify(expected.paths) &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(expected.evidenceIds) &&
      row.behavior === expected.behavior
    assert.ok(provisional || corrected)
    if (replayState === 'recovered') {
      assert.ok(corrected, 'recovered source requires corrected coverage')
    }
  },
)
