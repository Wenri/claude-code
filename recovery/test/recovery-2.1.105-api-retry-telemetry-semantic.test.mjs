import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const unit = [
  12757,
  9748937,
  9750636,
  '86eb08bc698eb33f6a1248d8d1516d3f4d30fc1ad3a9f3c0c08c6efeb5edf741',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrenceCount(contents, value) {
  return contents.split(value).length - 1
}

test(
  'target105 introduces exhausted-retry OTLP telemetry in the API error owner',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(occurrenceCount(baseline, 'api_retries_exhausted'), 0)
    assert.equal(occurrenceCount(target, 'api_retries_exhausted'), 1)

    const [index, start, end, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    const owner = target.slice(start, end)
    assert.equal(sha256(owner), hash)
    for (const fragment of [
      'api_error',
      'api_retries_exhausted',
      'status_code',
      'total_attempts',
      'total_retry_duration_ms',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    assert.match(owner, /O>1\)/)
  },
)

test(
  'authored API error telemetry omits absent status and reports only exhausted retries',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'services/api/logging.ts'),
      'utf8',
    )
    const start = source.indexOf('// Log API error event for OTLP')
    const end = source.indexOf(
      '// Pass the span to correctly match responses to requests',
      start,
    )
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const body = source.slice(start, end)
    for (const fragment of [
      "logOTelEvent('api_error'",
      "if (attempt > 1)",
      "logOTelEvent('api_retries_exhausted'",
      '...(status !== undefined ? { status_code: status } : {})',
      'total_attempts: String(attempt)',
      'total_retry_duration_ms: String(durationMsIncludingRetries)',
    ]) {
      assert.ok(body.includes(fragment), fragment)
    }
    assert.equal(body.includes('status_code: String(status)'), false)

    const events = []
    const logOTelEvent = (name, fields) => events.push({ name, fields })
    const emit = new Function(
      'logOTelEvent',
      `return function emit({model, errStr, status, durationMs, attempt, fastMode, durationMsIncludingRetries, requestId, querySource}) {${body}}`,
    )(logOTelEvent)

    emit({
      model: 'claude',
      errStr: 'network',
      status: undefined,
      durationMs: 12,
      durationMsIncludingRetries: 12,
      attempt: 1,
      fastMode: false,
      requestId: null,
      querySource: undefined,
    })
    assert.deepEqual(events.map(event => event.name), ['api_error'])
    assert.equal('status_code' in events[0].fields, false)

    events.length = 0
    emit({
      model: 'claude',
      errStr: 'rate limit',
      status: '429',
      durationMs: 20,
      durationMsIncludingRetries: 75,
      attempt: 3,
      fastMode: true,
      requestId: 'req_1',
      querySource: 'sdk',
    })
    assert.deepEqual(events.map(event => event.name), [
      'api_error',
      'api_retries_exhausted',
    ])
    assert.deepEqual(
      {
        status: events[1].fields.status_code,
        attempts: events[1].fields.total_attempts,
        duration: events[1].fields.total_retry_duration_ms,
        speed: events[1].fields.speed,
      },
      { status: '429', attempts: '3', duration: '75', speed: 'fast' },
    )

    const isCurrent = sourceRoot === path.resolve(repositoryRoot, 'src')
    if (isCurrent) {
      assert.equal(events[0].fields.request_id, 'req_1')
      assert.equal(events[0].fields.query_source, 'sdk')
      assert.equal(events[1].fields.query_source, 'sdk')
    } else {
      assert.equal('request_id' in events[0].fields, false)
      assert.equal('query_source' in events[0].fields, false)
      assert.equal('query_source' in events[1].fields, false)
    }
  },
)

test(
  'target116 retains retry telemetry and adds request/query attribution',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.equal(occurrenceCount(latest, 'api_retries_exhausted'), 1)
    const at = latest.indexOf('api_retries_exhausted')
    const graph = latest.slice(at - 800, at + 500)
    assert.match(graph, /request_id/)
    assert.equal(occurrenceCount(graph, 'query_source'), 2)
    assert.match(graph, /total_retry_duration_ms/)
  },
)
