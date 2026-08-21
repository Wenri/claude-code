import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import {
  TARGET118_SCHEDULE_ONE_OFF_GATE_INPUT,
  TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT,
  TARGET118_SCHEDULE_ONE_OFF_GATE_OWNER_OVERRIDES,
  applyTarget118ScheduleOneOffGateReplay,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-schedule-one-off-gate-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-schedule-one-off-gate-source-gap.json',
    ),
  ),
)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function decodeTargetToken(raw) {
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    try {
      return Function(`return (${raw})`)()
    } catch {
      // Template fragments are decoded by the bounded escape pass below.
    }
  }
  return raw
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_match, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\`/g, '`')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
}

async function loadTypeScript() {
  const imported = await import(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    )
  )
  return imported.default ?? imported
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

function materializeRawOwner() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'target118-schedule-gate-'))
  const sourceRoot = path.join(temp, 'src')
  const filename = path.join(
    sourceRoot,
    'skills/bundled/scheduleRemoteAgents.ts',
  )
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const source = execFileSync(
    'git',
    [
      'show',
      `${fixture.targetCommit}:src/skills/bundled/scheduleRemoteAgents.ts`,
    ],
    { cwd: root },
  )
  assert.deepEqual(descriptor(source), {
    bytes: TARGET118_SCHEDULE_ONE_OFF_GATE_INPUT.bytes,
    sha256: TARGET118_SCHEDULE_ONE_OFF_GATE_INPUT.sha256,
  })
  fs.writeFileSync(filename, source)
  return { temp, sourceRoot, filename }
}

test('Target118 schedule gate fixture pins two complete units and thirty residues', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 2)
  assert.equal(fixture.summary.residues, 30)
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [20566, 20567],
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.flatMap(row => row.residues))),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    TARGET118_SCHEDULE_ONE_OFF_GATE_OWNER_OVERRIDES.map(row => row.targetIndex),
    [20566, 20567],
  )
})

test('authenticated Target118 bundle pins the prompt and invocation units', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), fixture.inputs.targetBundle)
  for (const row of fixture.rows) {
    const slice = bundle.subarray(row.target.start, row.target.end)
    assert.equal(slice.length, row.target.bytes, `u${row.targetIndex}: bytes`)
    assert.equal(sha256(slice), row.target.sourceHash, `u${row.targetIndex}: hash`)
    for (const residue of row.residues) {
      assert(residue.start >= row.target.start)
      assert(residue.end <= row.target.end)
      assert.equal(
        decodeTargetToken(
          bundle.subarray(residue.start, residue.end).toString(),
        ),
        residue.value,
        `u${row.targetIndex}:${residue.start}`,
      )
    }
  }
})

test('Target118 schedule gate replay is exact, idempotent, and executable', async t => {
  const { temp, sourceRoot, filename } = materializeRawOwner()
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))

  assert.equal(
    applyTarget118ScheduleOneOffGateReplay({ sourceRoot }).status,
    'recovered',
  )
  assert.deepEqual(descriptor(fs.readFileSync(filename)), {
    bytes: TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT.bytes,
    sha256: TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT.sha256,
  })
  assert.equal(
    applyTarget118ScheduleOneOffGateReplay({ sourceRoot }).status,
    'already-recovered',
  )

  const ts = await loadTypeScript()
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declarations = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      ['buildPrompt', 'registerScheduleRemoteAgentsSkill'].includes(
        statement.name?.text,
      ),
  )
  assert.equal(declarations.length, 2)
  for (const marker of Object.values(fixture.sourceMarkers)) {
    assert(source.includes(marker), marker)
  }

  const buildPrompt = declarations.find(
    statement => statement.name?.text === 'buildPrompt',
  )
  assert(buildPrompt)
  const functionText = source.slice(buildPrompt.getStart(sourceFile), buildPrompt.end)
  const compiled = ts.transpileModule(functionText, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const makePrompt = new Function(
    'formatSetupNotes',
    'BASE_QUESTION',
    'ASK_USER_QUESTION_TOOL_NAME',
    'jsonStringify',
    'REMOTE_TRIGGER_TOOL_NAME',
    `${compiled}\nreturn buildPrompt`,
  )(
    notes => notes.join('\n'),
    'question',
    'AskUserQuestion',
    JSON.stringify,
    'mcp__remote_trigger__manage',
  )
  const options = {
    userTimezone: 'UTC',
    nowUtcIso: '2026-08-16T00:00:00.000Z',
    nowLocal: 'Sun, Aug 16, 2026, 12:00 AM',
    connectorsInfo: 'none',
    gitRepoUrl: null,
    environmentsInfo: 'env',
    createdEnvironment: null,
    setupNotes: [],
    needsGitHubAccessReminder: false,
    userArgs: 'schedule it',
  }
  const disabled = makePrompt({ ...options, oneOffEnabled: false })
  const enabled = makePrompt({ ...options, oneOffEnabled: true })
  assert(disabled.includes(' on a recurring cron schedule'))
  assert(!disabled.includes('run_once_at'))
  assert(!disabled.includes('Current Time (for one-off runs)'))
  assert(enabled.includes('once at a specific time'))
  assert(enabled.includes('run_once_at'))
  assert(enabled.includes('Current Time (for one-off runs)'))
  assert(enabled.includes('run_once_fired'))
})

test('Target118 schedule gate coverage changes only as a complete proof pair', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const states = []
  for (const expected of TARGET118_SCHEDULE_ONE_OFF_GATE_OWNER_OVERRIDES) {
    const row = rows.get(expected.targetIndex)
    assert(row)
    const ownerPaths = row.ownerIds.map(id => owners.get(id))
    assert.deepEqual(ownerPaths, [...expected.paths])
    const evidence = expected.evidenceIds.map(id => row.evidenceIds.includes(id))
    assert.equal(new Set(evidence).size, 1, `u${expected.targetIndex}: partial evidence`)
    states.push(evidence[0] ? 'recovered' : 'provisional')
  }
  assert.equal(new Set(states).size, 1, `mixed schedule gate state: ${states}`)
})
