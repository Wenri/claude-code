import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const baselineUnit = {
  start: 2042420,
  end: 2043236,
  sourceHash:
    'dc1542dfece805f04bc6bb5c50551a4e5da361a532762d42f8e8d0db1efe4adf',
}
const targetUnit = {
  index: 4596,
  start: 2044746,
  end: 2045630,
  sourceHash:
    '6be844b5193adf8d484870e6f4006838afe89186ab2ff64d72bb07bcc1b041c4',
}
const peerProtocolProperty = {
  typedAuditRow: 27,
  start: 2045439,
  end: 2045451,
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function registrationWindow(bundle) {
  const marker = '[concurrentSessions] register failed:'
  const end = bundle.indexOf(marker)
  assert.notEqual(end, -1, 'concurrent-session registration marker')
  return bundle.slice(Math.max(0, end - 1_300), end)
}

test(
  'target116 authenticates the added peerProtocol PID-record property',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(
      sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
      baselineUnit.sourceHash,
    )
    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
    )
    assert.equal(
      sha256(target.slice(targetUnit.start, targetUnit.end)),
      targetUnit.sourceHash,
    )
    assert.equal(
      target.slice(peerProtocolProperty.start, peerProtocolProperty.end),
      'peerProtocol',
      `typed-audit row ${peerProtocolProperty.typedAuditRow}`,
    )

    const baselineRecord = registrationWindow(baseline)
    const targetRecord = registrationWindow(target)
    assert.match(baselineRecord, /startedAt:Date\.now\(\),version:/)
    assert.match(baselineRecord, /\.VERSION,kind:/)
    assert.doesNotMatch(baselineRecord, /peerProtocol:/)
    assert.match(targetRecord, /startedAt:Date\.now\(\),version:/)
    assert.match(targetRecord, /\.VERSION,peerProtocol:/)

    const peerBinding = targetRecord.match(
      /\.VERSION,peerProtocol:([A-Za-z_$][\w$]*),kind:/,
    )?.[1]
    assert.ok(peerBinding, 'minified peer-protocol binding')
    const declarationWindow = target.slice(targetUnit.end, targetUnit.end + 3_000)
    assert.match(
      declarationWindow,
      new RegExp(`(?:^|[,;])${peerBinding}=1(?:[,;])`),
    )
  },
)

test(
  'source writes release and peer protocol versions into PID records',
  sourceOptions,
  () => {
    const owner = source('src/utils/concurrentSessions.ts')
    const protocol = owner.indexOf('const PEER_PROTOCOL_VERSION = 1')
    const startedAt = owner.indexOf('startedAt: Date.now()')
    const version = owner.indexOf('version: MACRO.VERSION', startedAt)
    const peer = owner.indexOf(
      'peerProtocol: PEER_PROTOCOL_VERSION',
      startedAt,
    )
    const kind = owner.indexOf('kind,', startedAt)

    assert.ok(protocol >= 0, 'peer protocol stays pinned to version 1')
    assert.ok(startedAt >= 0, 'PID record start timestamp')
    assert.ok(version > startedAt, 'release version follows the timestamp')
    assert.ok(peer > version, 'peer protocol follows the release version')
    assert.ok(kind > peer, 'session kind follows peer protocol')
  },
)
