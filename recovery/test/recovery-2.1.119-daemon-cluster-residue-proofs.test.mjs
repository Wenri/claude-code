import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-daemon-cluster-residue-proofs.json',
)
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
  )
const EVOLVED_RUNTIME_TEST_DESCRIPTOR = Object.freeze({
  bytes: 37338,
  sha256: '3b7b3abed447197cb79e1a9a873b4a4f8d5e476a440ef7228b2f4e075ec1e2f8',
})
const RECOVERED_SOURCE_FILE_DESCRIPTORS = Object.freeze({
  'src/utils/udsClient.ts': Object.freeze({
    bytes: 7275,
    sha256: 'af64419e15b607cce8e1eb3aaab6683d29cf4a958433630bd0f29bc83c23dfec',
  }),
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

test('target119 daemon cluster fixture is exhaustive and internally exact', () => {
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.summary.groups, 5)
  assert.equal(fixture.summary.units, 191)
  assert.equal(fixture.summary.residues, 3143)
  assert.equal(new Set(fixture.rows.map(row => row.targetIndex)).size, 191)
  assert.equal(
    fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
    3143,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
    fixture.summary.targetIndicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.flatMap(row => row.residues))),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    fixture.groups.map(group => [group.units, group.residues]),
    [
      [20, 95],
      [28, 152],
      [35, 524],
      [31, 419],
      [77, 1953],
    ],
  )
})

test('target119 daemon cluster authenticates every target unit and residue range', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target119 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  for (const row of fixture.rows) {
    const slice = bundle.subarray(row.target.start, row.target.end)
    assert.equal(slice.length, row.target.bytes, `unit ${row.targetIndex}`)
    assert.equal(sha256(slice), row.target.sourceHash, `unit ${row.targetIndex}`)
    for (const residue of row.residues) {
      const [, , , start, end] = residue
      assert(start >= row.target.start && end <= row.target.end)
    }
  }
})

test('target119 daemon cluster binds exact recovered source files and runtime evidence', () => {
  const runtimeTest = fs.readFileSync(
    path.join(root, fixture.inputs.semanticRuntimeTest.path),
  )
  const runtimeDescriptor = descriptor(runtimeTest)
  assert.ok(
    [fixture.inputs.semanticRuntimeTest, EVOLVED_RUNTIME_TEST_DESCRIPTOR].some(
      expected =>
        expected.bytes === runtimeDescriptor.bytes &&
        expected.sha256 === runtimeDescriptor.sha256,
    ),
    `unrecognized daemon runtime-test phase: ${JSON.stringify(runtimeDescriptor)}`,
  )
  for (const expected of fixture.inputs.sourceTree.files) {
    const value = fs.readFileSync(
      path.join(sourceRoot, expected.path.replace(/^src\//, '')),
    )
    const actual = descriptor(value)
    const recovered = RECOVERED_SOURCE_FILE_DESCRIPTORS[expected.path]
    assert.ok(
      [expected, recovered].filter(Boolean).some(
        candidate =>
          candidate.bytes === actual.bytes &&
          candidate.sha256 === actual.sha256,
      ),
      `${expected.path}: unrecognized Target119 source phase ${JSON.stringify(actual)}`,
    )
  }
  const runtimeText = runtimeTest.toString('utf8')
  for (const expected of fixture.inputs.sourceTree.files) {
    const basename = path.basename(expected.path)
    assert(
      runtimeText.includes(expected.path) ||
        fixture.groups.some(group => group.ownerPaths.includes(expected.path)),
      `missing daemon-cluster evidence binding for ${basename}`,
    )
  }
})

test('target119 daemon cluster coverage uses the frozen complete-unit owners and evidence', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  for (const expected of fixture.rows) {
    const row = rows.get(expected.targetIndex)
    assert(row, `missing coverage row ${expected.targetIndex}`)
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.deepEqual(
      row.ownerIds.map(id => owners.get(id)).sort(),
      [...expected.ownerPaths].sort(),
      `owner paths ${expected.targetIndex}`,
    )
    for (const evidenceId of expected.evidenceIds) {
      assert(row.evidenceIds.includes(evidenceId), `${expected.targetIndex}:${evidenceId}`)
    }
  }
})
