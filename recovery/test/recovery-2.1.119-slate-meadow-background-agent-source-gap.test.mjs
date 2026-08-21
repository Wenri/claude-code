import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget119SlateMeadowBackgroundAgentSourceRecovery,
  TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_DONOR,
  TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_INPUT_FILES,
  TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_OUTPUT_FILES,
  TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-slate-meadow-background-agent-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.119-slate-meadow-background-agent-source-gap.json',
    ),
  ),
)
const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target119-slate-meadow-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  for (const spec of [fixture.inputs.builtInAgents]) {
    const result = spawnSync(
      'git',
      ['show', `${fixture.sourceCommit}:${spec.path}`],
      { cwd: root, encoding: null },
    )
    assert.equal(result.status, 0, result.stderr?.toString())
    assert.deepEqual(descriptor(result.stdout), spec.input)
    const filename = path.join(sourceRoot, spec.path.replace(/^src\//, ''))
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, result.stdout)
  }
  return {
    temporary,
    sourceRoot,
    builtInFilename: path.join(
      sourceRoot,
      fixture.inputs.builtInAgents.path.replace(/^src\//, ''),
    ),
    backgroundFilename: path.join(
      sourceRoot,
      fixture.inputs.backgroundAgent.path.replace(/^src\//, ''),
    ),
  }
}

function structuralUnit(structural, side, index) {
  return [
    ...(structural[`unmatched${side}`] ?? []),
    ...structural.regions.map(region => region[side.toLowerCase()]).filter(Boolean),
  ].find(unit => unit.index === index)
}

function parseUnit(bundle, expected) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sourceHash,
  })
  const ast = parse(bytes.toString('utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, expected.nodeType)
  return { bytes, text: bytes.toString('utf8'), node: ast.body[0] }
}

function assertStructuralDescriptor(actual, expected) {
  assert(actual)
  assert.deepEqual(
    {
      nodeType: actual.nodeType,
      start: actual.start,
      end: actual.end,
      sourceHash: actual.sourceHash,
      coarseHash: actual.coarseHash,
    },
    {
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      sourceHash: expected.sourceHash,
      coarseHash: expected.coarseHash,
    },
  )
}

function sourceDeclarations(ts, files) {
  const rows = []
  for (const [relative, declarationName] of files) {
    const filename = path.join(relative.sourceRoot, relative.path)
    const text = fs.readFileSync(filename, 'utf8')
    const parsed = ts.createSourceFile(
      filename,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(parsed.parseDiagnostics.length, 0)
    function visit(node) {
      const functionMatch =
        ts.isFunctionDeclaration(node) && node.name?.text === declarationName
      const variableMatch =
        ts.isVariableDeclaration(node) &&
        node.name.getText(parsed) === declarationName
      if (functionMatch || variableMatch) {
        const declaration = variableMatch ? node.parent.parent : node
        const charStart = declaration.getStart(parsed)
        const charEnd = declaration.end
        const bytes = Buffer.from(text.slice(charStart, charEnd))
        rows.push({
          path: `src/${relative.path}`,
          name: declarationName,
          charStart,
          charEnd,
          ...descriptor(bytes),
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
  }
  return rows
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

test('slate-meadow fixture and recovery exports freeze one exact 2-residue lane', () => {
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 2,
    indicesSha256: sha256(JSON.stringify([9783])),
    residueIdentitiesSha256: sha256(JSON.stringify(fixture.residueIdentities)),
  })
  assert.deepEqual(TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_INPUT_FILES, [
    { path: fixture.inputs.builtInAgents.path, ...fixture.inputs.builtInAgents.input },
    { path: fixture.inputs.backgroundAgent.path, absent: true },
  ])
  assert.deepEqual(TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_OUTPUT_FILES, [
    { path: fixture.inputs.builtInAgents.path, ...fixture.inputs.builtInAgents.output },
    { path: fixture.inputs.backgroundAgent.path, ...fixture.inputs.backgroundAgent.output },
  ])
  assert.deepEqual(
    TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_DONOR,
    {
      path: fixture.inputs.donor.path,
      bytes: fixture.inputs.donor.bytes,
      sha256: fixture.inputs.donor.sha256,
      provenance:
        'byte-identical Target117 authenticated generated-owner recovery postimage',
    },
  )
  const override = TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_OWNER_OVERRIDES[0]
  assert.deepEqual(
    {
      targetIndex: override.targetIndex,
      paths: [...override.paths],
      evidenceIds: [...override.evidenceIds],
    },
    fixture.ownerOverride,
  )
})

test('authenticated lineage binds the retained agent and the new Target119 gate', () => {
  const baseline = fs.readFileSync(path.join(root, fixture.inputs.baselineBundle.path))
  const target = fs.readFileSync(path.join(root, fixture.inputs.targetBundle.path))
  const target117 = fs.readFileSync(path.join(root, fixture.inputs.target117Bundle.path))
  const structuralBytes = fs.readFileSync(
    path.join(root, fixture.inputs.structuralLedger.path),
  )
  assert.deepEqual(descriptor(baseline), {
    bytes: fixture.inputs.baselineBundle.bytes,
    sha256: fixture.inputs.baselineBundle.sha256,
  })
  assert.deepEqual(descriptor(target), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  assert.deepEqual(descriptor(target117), {
    bytes: fixture.inputs.target117Bundle.bytes,
    sha256: fixture.inputs.target117Bundle.sha256,
  })
  const structural = JSON.parse(gunzipSync(structuralBytes))
  assert.deepEqual(descriptor(structuralBytes), {
    bytes: fixture.inputs.structuralLedger.bytes,
    sha256: fixture.inputs.structuralLedger.sha256,
  })
  assertStructuralDescriptor(
    structuralUnit(structural, 'Baseline', fixture.baselineUnit.index),
    fixture.baselineUnit,
  )
  const baselineUnit = parseUnit(baseline, fixture.baselineUnit)
  assert.doesNotMatch(baselineUnit.text, /tengu_slate_meadow/)
  assert.doesNotMatch(baselineUnit.text, /\{CLAUDE_AGENT:/)

  const targetUnits = new Map()
  for (const expected of fixture.targetUnits) {
    assertStructuralDescriptor(
      structuralUnit(structural, 'Target', expected.index),
      expected,
    )
    targetUnits.set(expected.index, parseUnit(target, expected))
  }
  const donorUnit = parseUnit(target117, fixture.target117DonorUnit)
  assert.equal(
    fixture.target117DonorUnit.coarseHash,
    fixture.targetUnits.find(unit => unit.index === 9781).coarseHash,
  )
  for (const marker of [
    'agentType:"claude"',
    'FleetView\'s default',
    'permissionMode:"auto"',
    'isolation:"worktree"',
    'This session is a background job.',
  ]) {
    assert.match(donorUnit.text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(
      targetUnits.get(9781).text,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
  }
  assert.match(targetUnits.get(9779).text, /CLAUDE_AGENT/)
  assert.match(targetUnits.get(9783).text, /tengu_slate_meadow/)
  assert.match(targetUnits.get(9783).text, /CLAUDE_AGENT/)
  assert.match(targetUnits.get(9783).text, /\.push\(q\)/)
  for (const [, kind, value, start, end] of fixture.residueIdentities) {
    const text = target.subarray(start, end).toString('utf8')
    assert.equal(kind === 'string' ? JSON.parse(text) : text, value)
  }
})

test('source replay is exact, typed, executable, idempotent, and fail-closed', async t => {
  const ts = await loadTypeScript()
  const materialized = materializeRawSource()
  t.after(() =>
    fs.rmSync(materialized.temporary, { recursive: true, force: true }),
  )
  assert.equal(fs.existsSync(materialized.backgroundFilename), false)
  assert.deepEqual(
    applyTarget119SlateMeadowBackgroundAgentSourceRecovery({
      sourceRoot: materialized.sourceRoot,
    }),
    {
      status: 'recovered',
      files: [
        fixture.inputs.builtInAgents.path,
        fixture.inputs.backgroundAgent.path,
      ],
    },
  )
  assert.deepEqual(
    applyTarget119SlateMeadowBackgroundAgentSourceRecovery({
      sourceRoot: materialized.sourceRoot,
    }),
    { status: 'already-recovered', files: [] },
  )
  assert.deepEqual(
    descriptor(fs.readFileSync(materialized.builtInFilename)),
    fixture.inputs.builtInAgents.output,
  )
  assert.deepEqual(
    descriptor(fs.readFileSync(materialized.backgroundFilename)),
    fixture.inputs.backgroundAgent.output,
  )
  assert.deepEqual(
    descriptor(fs.readFileSync(path.join(root, fixture.inputs.donor.path))),
    { bytes: fixture.inputs.donor.bytes, sha256: fixture.inputs.donor.sha256 },
  )
  assert.deepEqual(
    descriptor(
      fs.readFileSync(path.join(root, fixture.inputs.donor.target117Helper.path)),
    ),
    {
      bytes: fixture.inputs.donor.target117Helper.bytes,
      sha256: fixture.inputs.donor.target117Helper.sha256,
    },
  )
  assert.deepEqual(
    sourceDeclarations(ts, [
      [
        {
          sourceRoot: materialized.sourceRoot,
          path: fixture.inputs.builtInAgents.path.replace(/^src\//, ''),
        },
        'getBuiltInAgents',
      ],
      [
        {
          sourceRoot: materialized.sourceRoot,
          path: fixture.inputs.backgroundAgent.path.replace(/^src\//, ''),
        },
        'backgroundJobAgent',
      ],
    ]),
    fixture.sourceDeclarations,
  )
  const builtIn = fs.readFileSync(materialized.builtInFilename, 'utf8')
  assert.match(
    builtIn,
    /import \{ backgroundJobAgent as CLAUDE_AGENT \} from '.\/built-in\/backgroundJobAgent\.js'/,
  )
  assert.match(
    builtIn,
    /getFeatureValue_CACHED_MAY_BE_STALE\('tengu_slate_meadow', false\)[\s\S]*agents\.push\(CLAUDE_AGENT\)/,
  )
  const build = spawnSync(
    'bun',
    [
      'build',
      materialized.builtInFilename,
      '--target=node',
      '--external=*',
      '--outfile',
      path.join(materialized.temporary, 'builtInAgents.js'),
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(build.status, 0, build.stderr)

  const mixed = materializeRawSource()
  t.after(() => fs.rmSync(mixed.temporary, { recursive: true, force: true }))
  fs.mkdirSync(path.dirname(mixed.backgroundFilename), { recursive: true })
  fs.copyFileSync(path.join(root, fixture.inputs.donor.path), mixed.backgroundFilename)
  assert.throws(
    () =>
      applyTarget119SlateMeadowBackgroundAgentSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      }),
    /exact all-raw or all-recovered source state/,
  )

  const drift = materializeRawSource()
  t.after(() => fs.rmSync(drift.temporary, { recursive: true, force: true }))
  fs.appendFileSync(drift.builtInFilename, '\n')
  const before = fs.readFileSync(drift.builtInFilename)
  assert.throws(
    () =>
      applyTarget119SlateMeadowBackgroundAgentSourceRecovery({
        sourceRoot: drift.sourceRoot,
      }),
    /exact all-raw or all-recovered source state/,
  )
  assert.deepEqual(fs.readFileSync(drift.builtInFilename), before)
})

test('coverage is either exact provisional state or the complete recovered state', () => {
  const ledger = readCoverage()
  const expected = TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_OWNER_OVERRIDES[0]
  const row = ledger.rows.find(item => item.targetIndex === expected.targetIndex)
  assert(row)
  const ownerById = new Map(ledger.owners.map(owner => [owner.id, owner.path]))
  const paths = row.ownerIds.map(id => ownerById.get(id)).sort()
  const signal = expected.evidenceIds.some(id => row.evidenceIds.includes(id))
  if (!signal) {
    assert.deepEqual(paths, ['src/tools/AgentTool/builtInAgents.ts'])
    assert.deepEqual(row.evidenceIds, ['source-map-attribution', 'semantic-test'])
    return
  }
  assert.deepEqual(paths, [...expected.paths].sort())
  assert.deepEqual(row.evidenceIds, [...expected.evidenceIds])
  assert.equal(row.behavior, expected.behavior)
  for (const id of expected.evidenceIds) {
    assert(ledger.evidence.some(evidence => evidence.id === id))
  }
})
