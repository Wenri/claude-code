import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
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

const pins = new Map([
  [
    16460,
    [
      11_804_247,
      11_813_250,
      'fb56f182e82c653bf5664479323699ce558abc1c0ddf65fca3c745d1206bfc19',
    ],
  ],
  [
    17631,
    [
      12_389_609,
      12_396_253,
      'e6d52316ef37dac0abf6c8dfe0eaf72d3d528a27dbe4715843da6b4dae84143a',
    ],
  ],
  [
    18270,
    [
      12_964_320,
      12_967_151,
      'e158de053d9dd0a660c2e8b70f5251aa16c75e53c04bcb74e1f0eab67a305818',
    ],
  ],
  [
    18311,
    [
      12_995_233,
      13_026_296,
      'ffa600788dab52a91c004f97a210876e2be8fb66181acea5af5c59b97a405cc9',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readOwner(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function extractMethodBody(source, methodName) {
  const marker = `${methodName}()`
  const methodStart = source.indexOf(marker)
  assert.notEqual(methodStart, -1, `${methodName} declaration`)
  const bodyStart = source.indexOf('{', methodStart + marker.length)
  assert.notEqual(bodyStart, -1, `${methodName} body`)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(bodyStart + 1, index)
    }
  }
  assert.fail(`${methodName} body is unterminated`)
}

function compileMethodBody(body) {
  return Function(`return function () {${body}}`)()
}

test(
  'target92 pins the complete delivery-ack graph and its guarded print drain',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    for (const [index, [start, end, sourceHash]] of pins) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      'flushDeliveryAcks(){return this.deliveryUploader.flush()}',
      'flushDeliveryAcks(){return Promise.resolve()}',
      'flushDeliveryAcks(){return this.ccrClient?.flushDeliveryAcks()??Promise.resolve()}',
      'await q.flushInternalEvents()',
      'await Promise.race([q.flushDeliveryAcks(),C7(5000,void 0,{unref:!0})])',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }

    if (baselineBundlePath) {
      const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
      assert.equal(baseline.includes('flushDeliveryAcks'), false)
    }
  },
)

test(
  'source delivery methods preserve uploader, no-op, and optional remote delegation results',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const ccrBody = extractMethodBody(
      readOwner('cli/transports/ccrClient.ts'),
      'flushDeliveryAcks',
    )
    const structuredBody = extractMethodBody(
      readOwner('cli/structuredIO.ts'),
      'flushDeliveryAcks',
    )
    const remoteBody = extractMethodBody(
      readOwner('cli/remoteIO.ts'),
      'flushDeliveryAcks',
    )

    const deliveryResult = Promise.resolve('delivery-drained')
    let deliveryCalls = 0
    const ccrResult = compileMethodBody(ccrBody).call({
      deliveryUploader: {
        flush() {
          deliveryCalls += 1
          return deliveryResult
        },
      },
    })
    assert.equal(ccrResult, deliveryResult)
    assert.equal(deliveryCalls, 1)

    const noOpResult = compileMethodBody(structuredBody).call({})
    assert.ok(noOpResult instanceof Promise)
    assert.equal(await noOpResult, undefined)

    let remoteCalls = 0
    const delegatedResult = compileMethodBody(remoteBody).call({
      ccrClient: {
        flushDeliveryAcks() {
          remoteCalls += 1
          return deliveryResult
        },
      },
    })
    assert.equal(delegatedResult, deliveryResult)
    assert.equal(remoteCalls, 1)
    assert.equal(await compileMethodBody(remoteBody).call({ ccrClient: null }), undefined)
  },
)

test(
  'print drains delivery acknowledgements after internal events and only before live idle',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const print = readOwner('cli/print.ts')
    const internal = print.indexOf('await structuredIO.flushInternalEvents()')
    const phase = print.indexOf("runPhase = 'finally_post_flush'", internal)
    const guard = print.indexOf('if (!isShuttingDown())', phase)
    const delivery = print.indexOf('structuredIO.flushDeliveryAcks()', guard)
    const timeout = print.indexOf("sleep(5000, undefined, { unref: true })", delivery)
    const idleGuard = print.indexOf('if (!isShuttingDown())', guard + 1)
    const idle = [
      "notifySessionStateChanged('idle')",
      "structuredIO.sessionState.notifyStateChanged('idle')",
    ]
      .map(marker => print.indexOf(marker, idleGuard))
      .find(position => position !== -1) ?? -1

    for (const [name, position] of Object.entries({
      internal,
      phase,
      guard,
      delivery,
      timeout,
      idleGuard,
      idle,
    })) {
      assert.notEqual(position, -1, name)
    }
    assert.ok(internal < phase)
    assert.ok(phase < guard)
    assert.ok(guard < delivery)
    assert.ok(delivery < timeout)
    assert.ok(timeout < idleGuard)
    assert.ok(idleGuard < idle)
  },
)
