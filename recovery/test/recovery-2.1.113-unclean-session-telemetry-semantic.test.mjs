import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE

const BASELINE_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const TARGET_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
const targetUnit = {
  index: 4_587,
  start: 2_043_593,
  end: 2_044_763,
  nodeType: 'FunctionDeclaration',
  sourceHash:
    'f2e075d27d116a64035bce95eadd24fe654b127858b3ade5d21c241270189c30',
}
const targetResidues = [
  [2_044_106, 2_044_138, 'Prior session exited uncleanly: '],
  [2_044_189, 2_044_207, 'tengu_unclean_exit'],
  [2_044_210, 2_044_225, 'session_age_sec'],
  [2_044_273, 2_044_286, 'prior_version'],
  [2_044_313, 2_044_331, 'on_current_version'],
]

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

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function authenticatedBundle(filename, expectedHash) {
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedHash)
  return bytes.toString('utf8')
}

function identity(unit) {
  return [unit.index, unit.start, unit.end, unit.nodeType, unit.sourceHash]
}

function executableTarget(target, records) {
  const slice = target.slice(targetUnit.start, targetUnit.end)
  const files = Object.keys(records)
  const reads = []
  const removals = []
  const debug = []
  const events = []
  const state = Function(
    'KT8',
    'Jk',
    'T_',
    'N',
    'xH',
    'ZvH',
    'E8',
    'alH',
    'bj4',
    'n$',
    'l',
    `let qT8=false,rLq=[]; return {count:${slice}, prior:()=>rLq, swept:()=>qT8}`,
  )(
    () => '/sessions',
    {
      readdir: async () => files,
      readFile: async filename => {
        reads.push(filename)
        return JSON.stringify(records[path.basename(filename)])
      },
      unlink: async filename => {
        removals.push(filename)
      },
    },
    () => false,
    message => debug.push(message),
    error => String(error),
    () => false,
    () => 'linux',
    path,
    () => ({
      safeParse(value) {
        const valid =
          value &&
          typeof value.pid === 'number' &&
          typeof value.sessionId === 'string' &&
          typeof value.startedAt === 'number' &&
          ['interactive', 'bg', 'daemon', 'daemon-worker'].includes(value.kind)
        return valid ? { success: true, data: value } : { success: false }
      },
    }),
    JSON.parse,
    (name, metadata) => events.push({ name, metadata }),
  )
  return { ...state, debug, events, reads, removals }
}

test(
  'target113 adds unclean interactive-session capture and telemetry to the live stale-file sweep',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
  },
  () => {
    const baseline = authenticatedBundle(baselinePath, BASELINE_SHA256)
    const target = authenticatedBundle(targetPath, TARGET_SHA256)
    const row = structural.unresolvedTarget.find(
      entry => entry.target.index === targetUnit.index,
    )
    assert.ok(row)
    assert.deepEqual(identity(row.target), identity(targetUnit))
    assert.equal(
      sha256(target.slice(targetUnit.start, targetUnit.end)),
      targetUnit.sourceHash,
    )
    for (const [start, end, raw] of targetResidues) {
      assert.equal(target.slice(start, end), raw)
    }
    for (const marker of [
      'Prior session exited uncleanly: ',
      'tengu_unclean_exit',
      'session_age_sec',
      'prior_version',
      'on_current_version',
    ]) {
      assert.equal(occurrences(baseline, marker), 0, marker)
      assert.ok(occurrences(target, marker) >= 1, marker)
    }
  },
)

test(
  'the authenticated sweep records only valid interactive peers and only during its first sweep',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const target = authenticatedBundle(targetPath, TARGET_SHA256)
    const now = Date.now()
    const runtime = executableTarget(target, {
      '9.json': {
        pid: 9,
        sessionId: 'newer',
        startedAt: now - 2_000,
        version: '2.1.113',
        kind: 'interactive',
      },
      '8.json': {
        pid: 8,
        sessionId: 'older',
        startedAt: now - 5_000,
        version: '2.1.112',
        kind: 'interactive',
      },
      '7.json': {
        pid: 7,
        sessionId: 'background',
        startedAt: now - 3_000,
        version: '2.1.113',
        kind: 'bg',
      },
      'notes.txt': { not: 'a peer record' },
    })

    assert.equal(await runtime.count(), 0)
    assert.deepEqual(
      runtime.prior().map(record => record.sessionId),
      ['newer', 'older'],
    )
    assert.equal(runtime.events.length, 2)
    assert.deepEqual(
      runtime.events.map(event => event.name),
      ['tengu_unclean_exit', 'tengu_unclean_exit'],
    )
    assert.equal(runtime.events[0].metadata.on_current_version, true)
    assert.equal(runtime.events[1].metadata.on_current_version, false)
    assert.ok(runtime.events[0].metadata.session_age_sec >= 1)
    assert.equal(runtime.events[1].metadata.prior_version, '2.1.112')
    assert.equal(runtime.debug.length, 2)
    assert.equal(runtime.reads.length, 3)
    assert.equal(runtime.removals.length, 3)
    assert.equal(runtime.swept(), true)

    await runtime.count()
    assert.equal(runtime.reads.length, 3)
    assert.equal(runtime.events.length, 2)
  },
)

test(
  'authored concurrent-session cleanup preserves the target one-shot telemetry contract',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/concurrentSessions.ts'),
      'utf8',
    )
    for (const fragment of [
      'const peerRecordSchema = lazySchema',
      'const priorUncleanSessions:',
      'let sweptPriorSessions = false',
      'prior?.success',
      "prior.data.kind === 'interactive'",
      'Prior session exited uncleanly:',
      "logEvent('tengu_unclean_exit'",
      'session_age_sec:',
      "prior_version: prior.data.version ?? 'unknown'",
      'on_current_version: prior.data.version === MACRO.VERSION',
      'priorUncleanSessions.sort((a, b) => b.startedAt - a.startedAt)',
      'sweptPriorSessions = true',
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
  },
)
