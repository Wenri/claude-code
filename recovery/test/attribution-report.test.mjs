import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { verifyAttributionReport } from '../scripts/verify-attribution-report.mjs'

const REPORT = fileURLToPath(
  new URL(
    '../cases/2.1.88-to-2.1.89/attribution',
    import.meta.url,
  ),
)

test('checked-in attribution report exhaustively covers the target', () => {
  const result = verifyAttributionReport({
    reportDirectory: REPORT,
    expectedBaselineSha256:
      '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f',
    expectedSummarySha256:
      'b378e9e54669a4e9188d3f5e32ee81d9e6140b98f49c615843d05eb474c13897',
    expectedTargetSha256:
      'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01',
  })

  assert.equal(result.status, 'attribution-report-verified')
  assert.deepEqual(result.rows, {
    sources: 4756,
    targetInitializers: 4537,
    targetPartitions: 43591,
  })
  assert.deepEqual(result.coverage, {
    accountedTargetUtf16: 13017066,
    targetUtf16: 13017066,
    unaccountedTargetUtf16: 0,
  })
})
