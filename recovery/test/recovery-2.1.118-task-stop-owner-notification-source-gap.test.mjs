import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget118TaskStopOwnerNotificationSourceRecovery,
  TARGET118_TASK_STOP_OWNER_NOTIFICATION_DONOR_FILE,
  TARGET118_TASK_STOP_OWNER_NOTIFICATION_INPUT_FILE,
  TARGET118_TASK_STOP_OWNER_NOTIFICATION_OUTPUT_FILE,
  TARGET118_TASK_STOP_OWNER_NOTIFICATION_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-task-stop-owner-notification-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-task-stop-owner-notification-source-gap.json',
)
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function assertDescriptor(value, expected) {
  assert.deepEqual(descriptor(value), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
}

function git(args, encoding = null) {
  const result = spawnSync('git', args, { cwd: root, encoding })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

function bundlePath(version) {
  return (
    process.env[`CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`] ??
    path.join(
      root,
      `.recovery-tmp/authenticated-artifacts/${version}-linux-x64/cli.inner.js`,
    )
  )
}

function loadLedger(spec) {
  const bytes = fs.readFileSync(path.join(root, spec.path))
  assertDescriptor(bytes, spec)
  return JSON.parse(gunzipSync(bytes))
}

function findTargetRegion(ledger, expected) {
  const region =
    ledger.regions.find(row => row.target.index === expected.index) ??
    ledger.unresolvedTarget.find(row => row.target.index === expected.index)
  assert.ok(region, `missing target unit ${expected.index}`)
  assert.deepEqual(
    {
      classification: region.classification,
      index: region.target.index,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      sourceHash: region.target.sourceHash,
    },
    {
      classification: expected.classification,
      index: expected.index,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      sourceHash: expected.sourceHash,
    },
  )
  return region
}

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-task-stop-owner-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const filename = path.join(sourceRoot, 'tasks/stopTask.ts')
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(
    filename,
    git([
      'show',
      `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.path}`,
    ]),
  )
  return { temporary, sourceRoot, filename }
}

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function targetNotifier(targetUnit) {
  const factory = new Function(
    'mt$',
    'Fk',
    'hO',
    'UA',
    'OJ',
    'oD',
    'Fz',
    'TA',
    'kA',
    `${targetUnit}; return Cj7`,
  )
  const queued = []
  const escapeXml = value =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  const notify = factory(
    value => value ?? 'main session',
    'tool-use-id',
    escapeXml,
    'task-notification',
    'task-id',
    'status',
    'summary',
    command => queued.push(command),
    value => value,
  )
  return { notify, queued }
}

test('Target118 task-stop fixture pins helper, donor, and raw source identities', () => {
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assertDescriptor(
    fs.readFileSync(path.join(root, fixture.inputs.helper.path)),
    fixture.inputs.helper,
  )
  assert.deepEqual(
    TARGET118_TASK_STOP_OWNER_NOTIFICATION_INPUT_FILE,
    {
      path: fixture.inputs.rawSource.path,
      bytes: fixture.inputs.rawSource.bytes,
      sha256: fixture.inputs.rawSource.sha256,
    },
  )
  assert.deepEqual(
    TARGET118_TASK_STOP_OWNER_NOTIFICATION_DONOR_FILE,
    {
      path: fixture.inputs.cumulativeDonor.path,
      bytes: fixture.inputs.cumulativeDonor.bytes,
      sha256: fixture.inputs.cumulativeDonor.sha256,
      blob: fixture.inputs.cumulativeDonor.blob,
    },
  )
  assert.deepEqual(
    TARGET118_TASK_STOP_OWNER_NOTIFICATION_OUTPUT_FILE,
    {
      path: fixture.inputs.postimage.path,
      bytes: fixture.inputs.postimage.bytes,
      sha256: fixture.inputs.postimage.sha256,
    },
    'postimage export intentionally carries only its top-level descriptor',
  )
})

test('authenticated Target117 and Target118 units pin the stopper identity delta', () => {
  const baseline = fs.readFileSync(bundlePath('2.1.117'))
  const target = fs.readFileSync(bundlePath('2.1.118'))
  assertDescriptor(baseline, fixture.inputs.baselineBundle)
  assertDescriptor(target, fixture.inputs.targetBundle)
  const baselineLedger = loadLedger(fixture.inputs.baselineStructuralLedger)
  const targetLedger = loadLedger(fixture.inputs.targetStructuralLedger)

  for (const unit of fixture.baselineUnits) {
    findTargetRegion(baselineLedger, unit)
    const slice = baseline.subarray(unit.start, unit.end)
    assertDescriptor(slice, { bytes: unit.bytes, sha256: unit.sourceHash })
  }
  for (const unit of fixture.targetUnits) {
    findTargetRegion(targetLedger, unit)
    const slice = target.subarray(unit.start, unit.end)
    assertDescriptor(slice, { bytes: unit.bytes, sha256: unit.sourceHash })
  }

  const baselineNotifier = baseline
    .subarray(fixture.baselineUnits[0].start, fixture.baselineUnits[0].end)
    .toString('utf8')
  assert.match(baselineNotifier, /was stopped by main session/)
  assert.doesNotMatch(baselineNotifier, /stopperAgentId/)

  const formatter = target
    .subarray(fixture.targetUnits[0].start, fixture.targetUnits[0].end)
    .toString('utf8')
  assert.match(formatter, /return .+\?\?"main session"/)
  const notifierUnit = target
    .subarray(fixture.targetUnits[1].start, fixture.targetUnits[1].end)
    .toString('utf8')
  assert.match(notifierUnit, /stopperAgentId/)
  assert.match(notifierUnit, /was stopped by \$\{/)
  const stopUnit = target
    .subarray(fixture.targetUnits[2].start, fixture.targetUnits[2].end)
    .toString('utf8')
  assert.match(stopUnit, /agentId!==void 0/)
  assert.match(stopUnit, /ownerAgentId/)

  const targetAdded = fixture.strictOwnerUnit.targetAddedResidues
  assert.deepEqual(targetAdded, [
    ['property', 'stopperAgentId', 8401695, 8401709, 1],
    ['string', '" was stopped by ', 8401728, 8401745, 1],
  ])
})

test('authenticated notifier routes escaped XML to the owner with explicit and main stoppers', () => {
  const target = fs.readFileSync(bundlePath('2.1.118'), 'utf8')
  const unitSpec = fixture.targetUnits[1]
  const { notify, queued } = targetNotifier(
    target.slice(unitSpec.start, unitSpec.end),
  )
  notify({
    taskId: fixture.runtime.taskId,
    toolUseId: fixture.runtime.toolUseId,
    description: fixture.runtime.description,
    ownerAgentId: fixture.runtime.ownerAgentId,
    stopperAgentId: fixture.runtime.stopperAgentId,
  })
  notify({
    taskId: 'task-<main>',
    description: 'escape & check',
    ownerAgentId: fixture.runtime.ownerAgentId,
  })
  assert.equal(queued.length, 2)
  assert.deepEqual(
    {
      mode: queued[0].mode,
      priority: queued[0].priority,
      agentId: queued[0].agentId,
    },
    {
      mode: fixture.runtime.mode,
      priority: fixture.runtime.priority,
      agentId: fixture.runtime.ownerAgentId,
    },
  )
  assert.match(
    queued[0].value,
    /Task "compile docs" was stopped by a-stopper00000001/,
  )
  assert.match(queued[0].value, /<tool-use-id>tool-7<\/tool-use-id>/)
  assert.match(queued[1].value, /task-&lt;main&gt;/)
  assert.match(queued[1].value, /escape &amp; check" was stopped by main session/)
})

test('replay restores exact source declarations and is idempotent and fail-closed', async t => {
  const { temporary, sourceRoot, filename } = materializeRawSource()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  assertDescriptor(fs.readFileSync(filename), fixture.inputs.rawSource)
  assert.equal(
    applyTarget118TaskStopOwnerNotificationSourceRecovery({ sourceRoot })
      .status,
    'recovered',
  )
  const postimage = fs.readFileSync(filename)
  assertDescriptor(postimage, fixture.inputs.postimage)
  assert.equal(
    applyTarget118TaskStopOwnerNotificationSourceRecovery({ sourceRoot })
      .status,
    'already-recovered',
  )

  const ts = await loadTypeScript()
  const text = postimage.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.inputs.postimage.path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declarations = new Map()
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      declarations.set(node.name.text, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  for (const [name, expected] of Object.entries(
    fixture.inputs.postimage.declarations,
  )) {
    const declaration = declarations.get(name)
    assert.ok(declaration, `missing ${name}`)
    const start = declaration.getStart(sourceFile)
    const end = declaration.end
    assert.deepEqual(
      [start, end, end - start, sha256(Buffer.from(text.slice(start, end)))],
      expected,
    )
  }
  const notifier = declarations
    .get('enqueueTaskStoppedNotification')
    .getText(sourceFile)
  assert.match(notifier, /stopperAgentId\?: AgentId/)
  assert.match(notifier, /formatAgentId\(stopperAgentId\)/)
  assert.match(notifier, /priority: 'next'/)
  assert.match(notifier, /agentId: asAgentId\(ownerAgentId\)/)
  const stopTask = declarations.get('stopTask').getText(sourceFile)
  assert.match(stopTask, /callerAgentId !== task\.agentId/)
  assert.match(stopTask, /stopperAgentId: callerAgentId/)

  fs.appendFileSync(filename, ' ')
  assert.throws(
    () =>
      applyTarget118TaskStopOwnerNotificationSourceRecovery({ sourceRoot }),
    /refusing unknown preimage/,
  )
})

test('coverage applies the task-stop owner correction atomically', () => {
  assert.deepEqual(
    TARGET118_TASK_STOP_OWNER_NOTIFICATION_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
    })),
    [
      {
        targetIndex: fixture.strictOwnerUnit.targetIndex,
        paths: ['src/tasks/stopTask.ts'],
        evidenceIds: fixture.evidenceIds,
      },
    ],
  )
  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.strictOwnerUnit.targetIndex,
  )
  assert.ok(row)
  const provisional =
    row.ownerIds.length === 1 &&
    row.ownerIds[0] === 'owner-src-tasks-DreamTask-DreamTask-ts' &&
    row.evidenceIds.includes('source-map-attribution')
  const corrected =
    row.ownerIds.length === 1 &&
    row.ownerIds[0] === 'owner-src-tasks-stopTask-ts' &&
    fixture.evidenceIds.every(id => row.evidenceIds.includes(id))
  assert.ok(provisional || corrected)
})
