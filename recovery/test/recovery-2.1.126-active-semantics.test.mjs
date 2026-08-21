import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot =
  process.env.CLAUDE_CODE_2_1_126_SOURCE_ROOT ?? repo

const releases = {
  baseline: {
    env: 'CLAUDE_CODE_2_1_124_BUNDLE',
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
  target: {
    env: 'CLAUDE_CODE_2_1_126_BUNDLE',
    bytes: 13_980_411,
    sha256:
      'e9d40219be0cad9009c115ec637df4976e987c33d4b7a88cc5f047ead9ad828d',
  },
}

const statementSlices = {
  baseline: [
    ['stream-client', 2_852_649, 2_853_411, '0cb408a1e61658d0687ba83afda5cb8c99883e9a0a422248d681b8ea8526553f'],
    ['file-read-model-exemption', 9_226_235, 9_226_273, '00ef67e6791e11c5b45986223405f3d1ec135a27b4b2cd32b5fdd08e6885bba7'],
    ['file-read-result', 9_226_598, 9_230_792, '1ed34871b9326244f5c583549450a29c558b6786eafa20ca4b5e79796c18503a'],
    ['file-read-reminder-declarations', 9_231_442, 9_231_844, '2326cbbd6634f6caae1780720480df6deb40f71e8ae657eb8e8e9e07867c843c'],
    ['file-read-initializer', 9_231_844, 9_240_483, '4c81e832fc4273e14cff0b839649c49ec7e4f137feab186509535e4c79cad99e'],
    ['effort-set', 11_258_918, 11_259_739, '2574071bfb6f33234263777b7c9954e2901aaa9c66767db951c052defb5c4310'],
    ['effort-unset', 11_259_943, 11_260_388, '6c35448580e5e2b47a193db405fe30a202dfe779cefd43c2ae934d040b364920'],
    ['effort-initializer', 11_266_468, 11_266_795, '224525ef049882b47ba144fb62e992a8368bd4bee0a306d71b6ea501f20f1963'],
    ['stream-query', 11_902_199, 11_925_701, 'e41072595a0e63e37fdd3a0266289919184cbc3864d554ea74524593c9b03dfb'],
  ],
  target: [
    ['stream-timeout-helper', 2_851_304, 2_851_396, '382441803fd00579637b0cc6cf8ab32e34532fab79d11458855268cfd34495a7'],
    ['stream-client', 2_852_741, 2_853_426, '6a7d21830f4fbdba0026d4420cd5c769d61521c1aa8cd5d33551b019ec61f503'],
    ['file-read-result', 9_226_575, 9_230_734, 'b396555bbaf648919a0081adb3b070f9b9fd5fbf054f63b8935c1e11a5d8cec1'],
    ['file-read-declarations', 9_231_384, 9_231_431, '69b77d354765bfde3b5e1898de1cf5e9a759f3bed1e63c5f7f43db5bce11d72e'],
    ['file-read-initializer', 9_231_431, 9_239_771, '0ee987f052c1a875e79a356f36e0d19e1f0dadf35e54a6eac7a415b5bfd51b10'],
    ['effort-set', 11_258_206, 11_259_159, '554f8295b370ba8e6f986a8f8663372ac80a8125a496b54aa3aeb1e4620609a8'],
    ['effort-unset', 11_259_363, 11_259_926, 'dc27179a431cd66fbb0083b5ab5ce3cb9000efd254b460c35244a1411a636547'],
    ['effort-initializer', 11_266_006, 11_266_338, '6c6ed9ce9024d715634fe81d7fb9f49357e75183bd46042290142acc2c8d435e'],
    ['stream-query', 11_901_742, 11_925_184, 'e7cec693269bae0ef6899d2436c796220aaa2272091642303e9ec8521a3246bc'],
  ],
}

const malwareReminder =
  'Whenever you read a file, you should consider whether it would be considered malware.'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.env} byte length`)
  assert.equal(sha256(bytes), release.sha256, `${release.env} SHA-256`)
  return bytes
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragment(relative, fragment) {
  assert.ok(
    compact(source(relative)).includes(compact(fragment)),
    `${relative}: missing ${compact(fragment)}`,
  )
}

function functionSection(contents, start, end) {
  const from = contents.indexOf(start)
  const to = contents.indexOf(end, from)
  assert.ok(from >= 0, `missing function boundary ${start}`)
  assert.ok(to > from, `missing function boundary ${end}`)
  return contents.slice(from, to)
}

function assertOrdered(contents, fragments, label) {
  let cursor = -1
  for (const fragment of fragments) {
    const next = contents.indexOf(fragment, cursor + 1)
    assert.ok(next > cursor, `${label}: missing or misordered ${fragment}`)
    cursor = next
  }
}

test('authenticates every active 2.1.124 to 2.1.126 statement surface', () => {
  const bundles = {
    baseline: readBundle(releases.baseline),
    target: readBundle(releases.target),
  }
  for (const [side, rows] of Object.entries(statementSlices)) {
    for (const [label, start, end, expectedSha256] of rows) {
      const statement = bundles[side].subarray(start, end)
      assert.equal(statement.length, end - start, `${side} ${label} width`)
      assert.equal(
        sha256(statement),
        expectedSha256,
        `${side} ${label} statement SHA-256`,
      )
    }
  }

  const baseline = bundles.baseline.toString('utf8')
  const target = bundles.target.toString('utf8')
  assert.equal(occurrences(baseline, 'CLAUDE_STREAM_IDLE_TIMEOUT_MS'), 2)
  assert.equal(occurrences(target, 'CLAUDE_STREAM_IDLE_TIMEOUT_MS'), 1)
  assert.equal(occurrences(baseline, malwareReminder), 1)
  assert.equal(occurrences(target, malwareReminder), 0)
  assert.equal(occurrences(baseline, 'Failed to set effort level:'), 0)
  assert.equal(occurrences(target, 'Failed to set effort level:'), 2)
})

test('uses one shared five-minute stream timeout in client and query paths', () => {
  const client = source('src/services/api/client.ts')
  const claude = source('src/services/api/claude.ts')

  assertSourceFragment(
    'src/services/api/client.ts',
    `export function getStreamIdleTimeoutMs(): number {
      return Math.max(
        Number(process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS) || 0,
        300_000,
      )
    }`,
  )
  assertSourceFragment(
    'src/services/api/client.ts',
    'addStreamIdleTimeout(response.body, getStreamIdleTimeoutMs())',
  )
  assertSourceFragment(
    'src/services/api/claude.ts',
    'const STREAM_IDLE_TIMEOUT_MS = getStreamIdleTimeoutMs()',
  )
  assert.equal(
    occurrences(client + claude, 'CLAUDE_STREAM_IDLE_TIMEOUT_MS'),
    1,
    'the environment value is parsed only by the shared helper',
  )
  assert.equal(
    occurrences(client + claude, "parseInt(process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS"),
    0,
  )
})

test('removes the per-read malware reminder and its model side channel', () => {
  const fileRead = source('src/tools/FileReadTool/FileReadTool.ts')
  assertSourceFragment(
    'src/tools/FileReadTool/FileReadTool.ts',
    'content = memoryFileFreshnessPrefix(data) + formatFileLines(data.file)',
  )
  for (const removed of [
    'CYBER_RISK_MITIGATION_REMINDER',
    'MITIGATION_EXEMPT_MODELS',
    'shouldIncludeFileReadMitigation',
    'fileReadModels',
    'getCanonicalName',
    malwareReminder,
  ]) {
    assert.equal(fileRead.includes(removed), false, `removed ${removed}`)
  }
})

test('persists effort before telemetry/config mutation and returns write errors', () => {
  const effort = source('src/commands/effort/effort.tsx')
  assertSourceFragment(
    'src/commands/effort/effort.tsx',
    "import { updateSettingsForSource } from '../../utils/settings/settings.js'",
  )

  const set = functionSection(
    effort,
    'function setEffortValue(',
    'export function showCurrentEffort(',
  )
  assertOrdered(
    set,
    [
      'const remoteSuffix = applyRemoteEffort(persistable)',
      'if (persistable !== undefined)',
      "updateSettingsForSource('userSettings'",
      'if (result.error)',
      'Failed to set effort level:',
      "logEvent('tengu_effort_command'",
      'unpinLaunchEffort()',
    ],
    'set effort ordering',
  )

  const unset = functionSection(
    effort,
    'function unsetEffortLevel(',
    'export function executeEffort(',
  )
  assertOrdered(
    unset,
    [
      'const remoteSuffix = applyRemoteEffort(undefined)',
      "updateSettingsForSource('userSettings'",
      'effortLevel: undefined',
      'if (result.error)',
      'Failed to set effort level:',
      "logEvent('tengu_effort_command'",
      'unpinLaunchEffort()',
    ],
    'unset effort ordering',
  )
})
