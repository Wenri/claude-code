import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE and CLAUDE_CODE_2_1_98_BUNDLE are required'
      : false,
}
const latestOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !latestBundlePath
      ? 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set'
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
const targetUnit = [
  17483,
  12346911,
  12351673,
  '5ccbc15fb6dd7b7c191fd88e301f88cd8bfc53091d02bc52db02cc3d97a431e3',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function sessionsClass(bundle) {
  const anchor = bundle.indexOf('[SessionsWebSocket] Already connecting')
  assert.notEqual(anchor, -1, 'SessionsWebSocket anchor')
  const start = bundle.lastIndexOf('class ', anchor)
  const end = bundle.indexOf('var ', anchor)
  assert.ok(start >= 0 && end > start, 'SessionsWebSocket class range')
  return bundle.slice(start, end)
}

function assertDetachSemantics(owner, label) {
  for (const fragment of [
    'detachListeners',
    '.onopen=',
    '.onmessage=',
    '.onerror=',
    '.onclose=',
    'removeAllListeners()',
    'post-detach error during close',
  ]) {
    assert.ok(owner.includes(fragment), `${label}: ${fragment}`)
  }
  assert.ok(
    owner.indexOf('removeAllListeners()') <
      owner.indexOf('post-detach error during close'),
    `${label}: install the post-detach error sink after removing listeners`,
  )
}

test('2.1.98 pins the complete listener-safe SessionsWebSocket class', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  assert.equal(
    sha256(targetBytes),
    '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
  )

  const [index, start, end, sourceHash] = targetUnit
  const region = structural.regions[index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, sourceHash],
  )
  assert.equal(sha256(targetBytes.toString('utf8').slice(start, end)), sourceHash)
})

test('2.1.98 introduces close-safe listeners for both WebSocket backends', pairOptions, () => {
  const baseline = sessionsClass(fs.readFileSync(baselineBundlePath, 'utf8'))
  const target = sessionsClass(fs.readFileSync(targetBundlePath, 'utf8'))

  assert.equal(baseline.includes('detachListeners'), false)
  assert.equal(baseline.includes('addEventListener("open"'), true)
  assert.equal(baseline.includes('post-detach error during close'), false)
  assertDetachSemantics(target, 'target98')
  assert.ok(target.includes('if(this.state==="closed")return'))
  assert.equal(target.includes('addEventListener("open"'), false)
  assert.ok(
    target.indexOf('this.detachListeners?.()') <
      target.indexOf('this.ws.close()'),
  )
})

test('the listener-detach behavior persists in target 2.1.116', latestOptions, () => {
  const latestBytes = fs.readFileSync(latestBundlePath)
  assert.equal(
    sha256(latestBytes),
    '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
  )
  const latest = sessionsClass(latestBytes.toString('utf8'))
  assertDetachSemantics(latest, 'target116')
  assert.ok(latest.includes('if(this.state==="closed")return'))
  assert.ok(
    latest.indexOf('this.detachListeners?.()') < latest.indexOf('this.ws.close()'),
  )
})

test('source owns listener lifecycle, import cancellation, and close ordering', sourceOptions, () => {
  const owner = source('src/remote/SessionsWebSocket.ts')
  for (const fragment of [
    'private detachListeners: (() => void) | null = null',
    'ws.onopen = () => {',
    'ws.onmessage = (event: MessageEvent) => {',
    'ws.onerror = () => {',
    'ws.onclose = (event: CloseEvent) => {',
    'ws.onopen = null',
    'ws.onmessage = null',
    'ws.onerror = null',
    'ws.onclose = null',
    "const { default: WS } = await import('ws')",
    "if (this.state === 'closed') return",
    'ws.removeAllListeners()',
    '[SessionsWebSocket] post-detach error during close:',
    'this.detachListeners?.()',
    'this.detachListeners = null',
    'this.ws.close()',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }

  assert.ok(
    owner.indexOf("const { default: WS } = await import('ws')") <
      owner.indexOf("if (this.state === 'closed') return"),
  )
  assert.ok(
    owner.indexOf("if (this.state === 'closed') return") <
      owner.indexOf('const ws = new WS(url'),
  )
  const closeStart = owner.indexOf('  close(): void {')
  const closeEnd = owner.indexOf('  reconnect(): void {', closeStart)
  const close = owner.slice(closeStart, closeEnd)
  assert.ok(close.indexOf('this.detachListeners?.()') < close.indexOf('this.ws.close()'))
})
