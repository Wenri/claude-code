import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  accountGeneratedDelta,
  encodeStructuralLedger,
} from '../lib/structural-delta.mjs'
import { verifyStructuralLedger } from '../scripts/verify-structural-ledger.mjs'

const LEDGER = fileURLToPath(
  new URL(
    '../cases/2.1.88-to-2.1.89/structural/generated-delta.json.gz',
    import.meta.url,
  ),
)
const LEDGER_BYTES = 2096840
const LEDGER_SHA256 =
  '4196e4df68330e3f0f84614bb37c4ef98dac056c09cb139e796d41bb34afbbf8'
const BASELINE_SHA256 =
  '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f'
const TARGET_SHA256 =
  'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01'

test('checked-in 2.1.88 to 2.1.89 ledger is canonical and exact', () => {
  const result = verifyStructuralLedger({
    filename: LEDGER,
    expectedBaselineSha256: BASELINE_SHA256,
    expectedBytes: LEDGER_BYTES,
    expectedSha256: LEDGER_SHA256,
    expectedTargetSha256: TARGET_SHA256,
    expectedTargetTokens: 4197802,
    expectedTargetUnits: 18181,
  })

  assert.equal(result.status, 'structural-ledger-verified')
  assert.deepEqual(result.coverage.tokens, {
    changed: 124936,
    matched: 3619974,
    moved: 46432,
    unresolved: 406460,
  })
  assert.deepEqual(result.coverage.units, {
    changed: 480,
    matched: 14898,
    moved: 1347,
    unresolved: 1456,
  })
})

test('verifier rejects a canonical gzip with inconsistent coverage', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'structural-ledger-corrupt-'),
  )
  const filename = path.join(directory, 'invalid.json.gz')
  try {
    const report = JSON.parse(gunzipSync(fs.readFileSync(LEDGER)))
    report.coverage.tokens.matched += 1
    fs.writeFileSync(filename, encodeStructuralLedger(report, { gzip: true }))
    assert.throws(
      () =>
        verifyStructuralLedger({
          filename,
          expectedBaselineSha256: BASELINE_SHA256,
          expectedTargetSha256: TARGET_SHA256,
          expectedTargetTokens: 4197802,
          expectedTargetUnits: 18181,
        }),
      /matched token coverage/,
    )
  } finally {
    fs.rmSync(directory, { force: true, recursive: true })
  }
})

test('report and gzip bytes do not depend on source paths', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'structural-ledger-paths-'),
  )
  const sources = {
    baseline:
      'const alpha="first";const beta="second";function get(){return alpha+beta}',
    target:
      'const beta="second";const alpha="first";function read(){return alpha+beta}',
  }
  const reports = []
  try {
    for (const relative of ['one/flat', 'two/deeply/nested']) {
      const sourceDirectory = path.join(directory, relative)
      fs.mkdirSync(sourceDirectory, { recursive: true })
      const baseline = path.join(sourceDirectory, 'old-bundle.js')
      const target = path.join(sourceDirectory, 'new-bundle.js')
      fs.writeFileSync(baseline, sources.baseline)
      fs.writeFileSync(target, sources.target)
      reports.push(accountGeneratedDelta(baseline, target))
    }
  } finally {
    fs.rmSync(directory, { force: true, recursive: true })
  }

  assert.equal('path' in reports[0].baseline, false)
  assert.equal('path' in reports[0].target, false)
  assert.deepEqual(reports[0], reports[1])
  assert.deepEqual(
    encodeStructuralLedger(reports[0], { gzip: true }),
    encodeStructuralLedger(reports[1], { gzip: true }),
  )
})
