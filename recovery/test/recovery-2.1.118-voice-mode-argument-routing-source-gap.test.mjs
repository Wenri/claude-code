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
  applyTarget118VoiceModeArgumentRoutingSourceRecovery,
  TARGET118_VOICE_MODE_ARGUMENT_ROUTING_INPUT,
  TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OUTPUT,
  TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-voice-mode-argument-routing-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-voice-mode-argument-routing-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '4053d8a2b4a679d9d053902c2b834dd69b4e480f3c0e40d6d39d7260a60c5624'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const configuredSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sourceFilename(sourceRoot) {
  const resolvedRoot = path.resolve(sourceRoot)
  const filename = path.resolve(
    resolvedRoot,
    fixture.inputs.rawSource.file.path.slice('src/'.length),
  )
  assert.ok(filename.startsWith(`${resolvedRoot}${path.sep}`))
  return filename
}

function gitBytes(input) {
  const result = spawnSync(
    'git',
    ['show', `${input.commit}:${input.file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.file.bytes,
    sha256: input.file.sha256,
  })
  return result.stdout
}

function materializeSource(bytes, prefix = 'target118-voice-mode-') {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporary, 'src')
  const filename = sourceFilename(sourceRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporary, sourceRoot, filename }
}

function walk(node, predicate, matches = []) {
  if (!node || typeof node !== 'object') return matches
  if (predicate(node)) matches.push(node)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walk(value, predicate, matches)
    } else {
      walk(child, predicate, matches)
    }
  }
  return matches
}

let typescriptPromise
async function loadTypeScript() {
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

function parseSource(ts, bytes) {
  const sourceFile = ts.createSourceFile(
    fixture.inputs.rawSource.file.path,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return sourceFile
}

function namedDeclarations(ts, sourceFile, bytes) {
  const declarations = new Map()
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement)
      continue
    }
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        declarations.set(declaration.name.text, statement)
      }
    }
  }
  return new Map(
    [...declarations].map(([name, declaration]) => {
      const start = declaration.getStart(sourceFile)
      const end = declaration.end
      return [
        name,
        {
          node: declaration,
          descriptor: {
            name,
            start,
            end,
            ...descriptor(bytes.subarray(start, end)),
          },
        },
      ]
    }),
  )
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

test(
  'Target118 voice-mode fixture freezes helper and both authenticated source revisions',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
      {
        bytes: fixture.inputs.helper.bytes,
        sha256: fixture.inputs.helper.sha256,
      },
    )
    assert.deepEqual(TARGET118_VOICE_MODE_ARGUMENT_ROUTING_INPUT, {
      path: fixture.inputs.rawSource.file.path,
      bytes: fixture.inputs.rawSource.file.bytes,
      sha256: fixture.inputs.rawSource.file.sha256,
    })
    assert.deepEqual(TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OUTPUT, {
      path: fixture.inputs.recoveredSource.file.path,
      bytes: fixture.inputs.recoveredSource.file.bytes,
      sha256: fixture.inputs.recoveredSource.file.sha256,
    })
    assert.deepEqual(
      TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: ['parseMode', 'call'],
          evidenceIds: fixture.ownerOverride.evidenceIds,
          behavior: fixture.ownerOverride.behavior,
        },
      ],
    )
    assert.equal(
      sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(
        JSON.stringify(
          fixture.targetUnit.residues.map(residue => [
            fixture.targetUnit.targetIndex,
            ...residue,
          ]),
        ),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
    for (const source of [
      fixture.inputs.rawSource,
      fixture.inputs.laterDonorSource,
    ]) {
      assert.equal(
        spawnSync('git', ['rev-parse', `${source.commit}^{tree}`], {
          cwd: root,
          encoding: 'utf8',
        }).stdout.trim(),
        source.tree,
      )
      assert.equal(
        spawnSync(
          'git',
          ['rev-parse', `${source.commit}:${source.file.path}`],
          { cwd: root, encoding: 'utf8' },
        ).stdout.trim(),
        source.file.blob,
      )
      gitBytes(source)
    }
  },
)

test(
  'authenticated Target118 voice target freezes the complete parser and argument-routing units',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const structuralBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(structuralBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const structural = JSON.parse(gunzipSync(structuralBytes))
    for (const expected of [fixture.supportingTargetUnit, fixture.targetUnit]) {
      const region = structural.regions.find(
        item => item.target.index === expected.targetIndex,
      )
      assert.ok(region)
      assert.deepEqual(
        {
          classification: region.classification,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          tokenCount: region.target.tokenCount,
          nodeType: region.target.nodeType,
          sourceHash: region.target.sourceHash,
        },
        {
          classification: expected.classification,
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          tokenCount: expected.tokenCount,
          nodeType: expected.nodeType,
          sourceHash: expected.sourceHash,
        },
      )
      assert.equal(
        sha256(bundle.subarray(expected.start, expected.end)),
        expected.sourceHash,
      )
    }

    const parserText = bundle.subarray(
      fixture.supportingTargetUnit.start,
      fixture.supportingTargetUnit.end,
    )
    const parserAst = parse(parserText.toString(), { ecmaVersion: 'latest' })
    assert.equal(parserAst.body.length, 1)
    assert.equal(parserAst.body[0].type, 'FunctionDeclaration')
    assert.deepEqual(
      walk(parserAst, node => node.type === 'Literal')
        .map(node => node.value)
        .filter(value => typeof value === 'string'),
      ['', 'hold', 'tap', 'off', 'invalid'],
    )

    const targetText = bundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    const targetAst = parse(targetText.toString(), { ecmaVersion: 'latest' })
    assert.equal(targetAst.body.length, 1)
    assert.equal(targetAst.body[0].type, 'VariableDeclaration')
    assert.equal(targetAst.body[0].declarations.length, 2)
    assert.equal(targetAst.body[0].declarations[0].init.value, 2)
    assert.equal(targetAst.body[0].declarations[1].init.type, 'ArrowFunctionExpression')
    assert.equal(targetAst.body[0].declarations[1].init.async, true)
    const properties = new Set(
      walk(targetAst, node => node.type === 'Property').map(
        node => node.key.name ?? node.key.value,
      ),
    )
    for (const property of [
      'voice',
      'enabled',
      'mode',
      'tap_mode',
      'voiceLangHintShownCount',
      'voiceLangHintLastLanguage',
    ]) {
      assert.ok(properties.has(property), `Target118 target property ${property}`)
    }
    const targetSource = targetText.toString()
    for (const marker of [
      'Unknown mode:',
      'Use hold, tap, or off.',
      'Tap ${w} (with input empty) to start, tap again to send.',
      'Hold ${w} to record.',
      'Voice mode enabled (${M}). ${j}${W}',
    ]) {
      assert.ok(targetSource.includes(marker), `Target118 target marker ${marker}`)
    }
    const [residue] = fixture.targetUnit.residues
    assert.equal(
      bundle.subarray(residue[2], residue[3]).toString(),
      residue[1],
    )
    assert.ok(
      residue[2] >= fixture.targetUnit.start &&
        residue[3] <= fixture.targetUnit.end,
    )
  },
)

test(
  'Target118 voice replay is exact, idempotent, and rejects drift',
  { skip: !selected },
  () => {
    const raw = gitBytes(fixture.inputs.rawSource)
    const donor = gitBytes(fixture.inputs.laterDonorSource)
    assert.deepEqual(descriptor(donor), {
      bytes: fixture.inputs.recoveredSource.file.bytes,
      sha256: fixture.inputs.recoveredSource.file.sha256,
    })

    const replay = materializeSource(raw)
    try {
      assert.deepEqual(
        applyTarget118VoiceModeArgumentRoutingSourceRecovery({
          sourceRoot: replay.sourceRoot,
        }),
        {
          status: 'recovered',
          files: [fixture.inputs.recoveredSource.file.path],
          ownerOverrides: 1,
        },
      )
      assert.deepEqual(fs.readFileSync(replay.filename), donor)
      assert.deepEqual(
        applyTarget118VoiceModeArgumentRoutingSourceRecovery({
          sourceRoot: replay.sourceRoot,
        }),
        { status: 'already-recovered', files: [], ownerOverrides: 1 },
      )
    } finally {
      fs.rmSync(replay.temporary, { recursive: true, force: true })
    }

    const drifted = Buffer.from(raw)
    drifted[drifted.length - 2] ^= 1
    const drift = materializeSource(drifted, 'target118-voice-drift-')
    try {
      assert.throws(
        () =>
          applyTarget118VoiceModeArgumentRoutingSourceRecovery({
            sourceRoot: drift.sourceRoot,
          }),
        /requires the exact raw or recovered source/,
      )
    } finally {
      fs.rmSync(drift.temporary, { recursive: true, force: true })
    }
  },
)

test(
  'Target118 voice recovered declarations are exact and cover every changed behavior',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const raw = gitBytes(fixture.inputs.rawSource)
    const donor = gitBytes(fixture.inputs.laterDonorSource)
    const rawDeclarations = namedDeclarations(
      ts,
      parseSource(ts, raw),
      raw,
    )
    assert.deepEqual(
      fixture.inputs.rawSource.declarations.map(item =>
        rawDeclarations.get(item.name)?.descriptor,
      ),
      fixture.inputs.rawSource.declarations,
    )
    assert.equal(rawDeclarations.has('parseMode'), false)

    const sourceBytes = fs.readFileSync(sourceFilename(configuredSourceRoot))
    const sourceState =
      sha256(sourceBytes) === fixture.inputs.rawSource.file.sha256
        ? 'raw'
        : sha256(sourceBytes) === fixture.inputs.recoveredSource.file.sha256
          ? 'package'
          : 'invalid'
    assert.notEqual(sourceState, 'invalid')
    let recovered = sourceBytes
    if (sourceState === 'raw') {
      const replay = materializeSource(sourceBytes, 'target118-voice-source-')
      try {
        applyTarget118VoiceModeArgumentRoutingSourceRecovery({
          sourceRoot: replay.sourceRoot,
        })
        recovered = fs.readFileSync(replay.filename)
      } finally {
        fs.rmSync(replay.temporary, { recursive: true, force: true })
      }
    }
    assert.deepEqual(recovered, donor)

    const recoveredSourceFile = parseSource(ts, recovered)
    const recoveredDeclarations = namedDeclarations(
      ts,
      recoveredSourceFile,
      recovered,
    )
    assert.deepEqual(
      fixture.inputs.recoveredSource.declarations.map(item =>
        recoveredDeclarations.get(item.name)?.descriptor,
      ),
      fixture.inputs.recoveredSource.declarations,
    )
    const parseMode = recoveredDeclarations.get('parseMode')?.node
    assert.ok(ts.isFunctionDeclaration(parseMode))
    assert.equal(parseMode.parameters.length, 1)
    assert.equal(parseMode.parameters[0].name.getText(recoveredSourceFile), 'argument')
    const call = recoveredDeclarations.get('call')?.node
    assert.ok(ts.isVariableStatement(call))
    const callDeclaration = call.declarationList.declarations.find(
      declaration => declaration.name.getText(recoveredSourceFile) === 'call',
    )
    assert.ok(callDeclaration)
    assert.ok(ts.isArrowFunction(callDeclaration.initializer))
    assert.equal(callDeclaration.initializer.modifiers?.[0]?.kind, ts.SyntaxKind.AsyncKeyword)
    assert.equal(
      callDeclaration.initializer.parameters[0].name.getText(recoveredSourceFile),
      'argument',
    )
    const recoveredText = recovered.toString()
    for (const marker of [
      "currentSettings.voice?.enabled ?? currentSettings.voiceEnabled === true",
      "requestedMode === 'off'",
      'voice: { ...currentSettings.voice, enabled: false }',
      'voice: { ...currentSettings.voice, enabled: true, mode }',
      "tap_mode: mode === 'tap'",
      'Tap ${key} (with input empty) to start, tap again to send.',
      'Voice mode enabled (${mode}). ${instruction}${langNote}',
    ]) {
      assert.ok(recoveredText.includes(marker), `recovered source marker ${marker}`)
    }
    assert.equal(recoveredText.includes('Voice mode enabled. Hold ${key}'), false)
  },
)

test(
  'Target118 voice coverage evolves atomically from the provisional row to replay evidence',
  { skip: !selected },
  () => {
    const coverage = readCoverage()
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const row = coverage.rows.find(
      item => item.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    assert.deepEqual(paths, fixture.ownerOverride.paths)
    const provisional =
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test']) &&
      row.behavior ===
        `Compiled target unit is attributed to ${fixture.ownerOverride.paths.join(', ')}; its authored runtime owner and call path are present in the target semantic tree and current cumulative src/.`
    const corrected =
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected)
  },
)
