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
  applyTarget118TuiTelemetrySourceRecovery,
  TARGET118_TUI_TELEMETRY_INPUT_FILE,
  TARGET118_TUI_TELEMETRY_OUTPUT_FILES,
  TARGET118_TUI_TELEMETRY_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-tui-telemetry-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-tui-telemetry-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '3afa6c2523f5a7ee4b9070bf4a5c9ac7c9fa946f5feac78d50b1bd4665403c08'
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

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function sourceFilename(sourceRoot, relativePath) {
  return path.join(sourceRoot, relativePath.slice('src/'.length))
}

function gitSource() {
  const source = fixture.inputs.rawSource.file
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.rawSource.commit}:${source.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: source.bytes,
    sha256: source.sha256,
  })
  assert.equal(
    spawnSync(
      'git',
      ['rev-parse', `${fixture.inputs.rawSource.commit}:${source.path}`],
      { cwd: root, encoding: 'utf8' },
    ).stdout.trim(),
    source.blob,
  )
  return result.stdout
}

function materializeRawSource(prefix = 'target118-tui-telemetry-') {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporary, 'src')
  const tuiFilename = sourceFilename(
    sourceRoot,
    fixture.inputs.rawSource.file.path,
  )
  fs.mkdirSync(path.dirname(tuiFilename), { recursive: true })
  fs.writeFileSync(tuiFilename, gitSource())
  return { temporary, sourceRoot, tuiFilename }
}

function sourceState(sourceRoot) {
  const tuiFilename = sourceFilename(
    sourceRoot,
    fixture.inputs.rawSource.file.path,
  )
  const scrollFilename = sourceFilename(
    sourceRoot,
    fixture.inputs.recoveredSource.files[1].path,
  )
  const tui = descriptor(fs.readFileSync(tuiFilename))
  const scrollExists = fs.statSync(scrollFilename, { throwIfNoEntry: false })
  const scroll = scrollExists
    ? descriptor(fs.readFileSync(scrollFilename))
    : null
  const rawTui = sameDescriptor(tui, fixture.inputs.rawSource.file)
  const recoveredTui = sameDescriptor(
    tui,
    fixture.inputs.recoveredSource.files[0],
  )
  const exactScroll =
    scroll !== null &&
    sameDescriptor(scroll, fixture.inputs.recoveredSource.files[1])
  return {
    raw: rawTui && (scroll === null || exactScroll),
    recovered: recoveredTui && exactScroll,
    tui,
    scroll,
  }
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

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function propertyName(node) {
  if (node?.computed) return undefined
  return node?.key?.name ?? node?.key?.value
}

function memberName(node) {
  if (node?.type !== 'MemberExpression' || node.computed) return undefined
  return node.property?.name
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

function declarationNamed(ts, sourceFile, name) {
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      matches.push(node)
    }
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        declaration => declaration.name.getText(sourceFile) === name,
      )
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, name)
  return matches[0]
}

test(
  'Target118 TUI telemetry fixture freezes helper, donor, and inherited evidence',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    for (const input of [
      fixture.inputs.helper,
      fixture.inputs.donor,
      fixture.inputs.inheritedEvidence,
    ]) {
      assert.deepEqual(descriptor(fs.readFileSync(path.join(root, input.path))), {
        bytes: input.bytes,
        sha256: input.sha256,
      })
    }
    assert.deepEqual(TARGET118_TUI_TELEMETRY_INPUT_FILE, {
      path: fixture.inputs.rawSource.file.path,
      bytes: fixture.inputs.rawSource.file.bytes,
      sha256: fixture.inputs.rawSource.file.sha256,
    })
    assert.deepEqual(
      TARGET118_TUI_TELEMETRY_OUTPUT_FILES,
      fixture.inputs.recoveredSource.files,
    )
    assert.deepEqual(
      TARGET118_TUI_TELEMETRY_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.targetUnit.ownerPaths,
          declarations: fixture.targetUnit.declarations,
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
    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.rawSource.tree,
    )
    gitSource()
    const inheritedEvidence = fs.readFileSync(
      path.join(root, fixture.inputs.inheritedEvidence.path),
      'utf8',
    )
    assert.match(inheritedEvidence, /ink\/scroll-config\.ts/)
    assert.match(inheritedEvidence, /getScrollConfig/)
  },
)

test(
  'authenticated Target118 command binds telemetry to the shared scroll configuration',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledgerBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(ledgerBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const parsed = new Map()
    for (const expected of [
      fixture.targetUnit,
      ...fixture.supportingTargetUnits,
    ]) {
      const region = ledger.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
      )
      assert.ok(region, `u${expected.targetIndex}`)
      assert.deepEqual(
        {
          classification: region.classification,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          tokenCount: region.target.tokenCount,
          nodeType: region.target.nodeType,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          classification: expected.classification,
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          tokenCount: expected.tokenCount,
          nodeType: expected.nodeType,
          sourceHash: expected.sourceHash,
          coarseHash: expected.coarseHash,
        },
      )
      const bytes = bundle.subarray(expected.start, expected.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: expected.bytes,
        sha256: expected.sourceHash,
      })
      parsed.set(
        expected.targetIndex,
        parse(bytes.toString('utf8'), {
          ecmaVersion: 'latest',
          sourceType: 'script',
        }).body[0],
      )
    }

    const command = parsed.get(fixture.targetUnit.targetIndex)
    const telemetryCalls = walk(
      command,
      node =>
        node.type === 'CallExpression' &&
        node.arguments[0]?.value === 'tengu_tui_command' &&
        node.arguments[1]?.type === 'ObjectExpression',
    )
    assert.equal(telemetryCalls.length, 1)
    const telemetry = telemetryCalls[0].arguments[1]
    assert.deepEqual(telemetry.properties.map(propertyName), [
      'fullscreen',
      'from',
      'to',
      'session_age_ms',
      'bounce',
      'scroll_decay_curve',
      'scroll_base',
      'scroll_xtermjs',
    ])
    const scrollProperties = telemetry.properties.slice(-3)
    assert.deepEqual(
      scrollProperties.map(property => memberName(property.value)),
      ['useDecayCurve', 'base', 'xtermJs'],
    )
    const scrollBinding = scrollProperties[0].value.object.name
    assert.ok(
      scrollProperties.every(property => property.value.object.name === scrollBinding),
    )
    const scrollInitializer = walk(
      command,
      node =>
        node.type === 'VariableDeclarator' &&
        node.id?.name === scrollBinding &&
        node.init?.type === 'CallExpression',
    )
    assert.equal(scrollInitializer.length, 1)
    const getScrollConfig = parsed.get(7322)
    assert.equal(
      scrollInitializer[0].init.callee.name,
      getScrollConfig.id.name,
    )
    const configObjects = walk(
      getScrollConfig,
      node =>
        node.type === 'ObjectExpression' &&
        node.properties.some(property => propertyName(property) === 'useDecayCurve'),
    )
    assert.equal(configObjects.length, 1)
    assert.deepEqual(configObjects[0].properties.map(propertyName), [
      'useDecayCurve',
      'useAdaptiveDrain',
      'base',
      'xtermJs',
      'termProgram',
      'xtversion',
      'wtSession',
      'scrollSpeedEnv',
      'platform',
    ])
    const speedBase = parsed.get(7323)
    assert.equal(speedBase.type, 'FunctionDeclaration')
    assert.equal(
      walk(
        speedBase,
        node =>
          node.type === 'CallExpression' &&
          node.callee?.type === 'MemberExpression' &&
          node.callee.object?.name === 'Math' &&
          memberName(node.callee) === 'min',
      ).length,
      1,
    )

    for (const residue of fixture.targetUnit.residues) {
      const [kind, value, start, end] = residue
      const text = bundle.subarray(start, end).toString()
      assert.equal(kind === 'string' ? JSON.parse(text) : text, value)
    }
  },
)

test(
  'recovered source emits exact transition and scroll-policy telemetry',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const materialized = materializeRawSource()
    try {
      assert.equal(
        applyTarget118TuiTelemetrySourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }).status,
        'recovered',
      )
      const sources = new Map()
      for (const file of fixture.inputs.recoveredSource.files) {
        const bytes = fs.readFileSync(
          sourceFilename(materialized.sourceRoot, file.path),
        )
        assert.deepEqual(descriptor(bytes), {
          bytes: file.bytes,
          sha256: file.sha256,
        })
        const text = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          file.path,
          text,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0, file.path)
        sources.set(file.path, { bytes, text, sourceFile })
      }
      for (const expected of fixture.inputs.recoveredSource.declarations) {
        const source = sources.get(expected.path)
        const declaration = declarationNamed(
          ts,
          source.sourceFile,
          expected.name,
        )
        const start = declaration.getStart(source.sourceFile)
        const end = declaration.end
        assert.deepEqual(
          {
            start,
            end,
            ...descriptor(Buffer.from(source.text.slice(start, end))),
          },
          {
            start: expected.start,
            end: expected.end,
            bytes: expected.bytes,
            sha256: expected.sha256,
          },
        )
      }

      const tui = sources.get('src/commands/tui/tui.ts')
      const imports = tui.sourceFile.statements.filter(ts.isImportDeclaration)
      assert.equal(
        imports.filter(
          declaration =>
            declaration.moduleSpecifier.text === '../../ink/scroll-config.js' &&
            declaration.importClause.namedBindings.elements.some(
              element => element.name.text === 'getScrollConfig',
            ),
        ).length,
        1,
      )
      const callStatement = declarationNamed(ts, tui.sourceFile, 'call')
      const callDeclaration = callStatement.declarationList.declarations[0]
      const arrow = callDeclaration.initializer
      const arrowText = arrow.getText(tui.sourceFile)
      for (const marker of [
        'const current =',
        'const scrollConfig = getScrollConfig()',
        'from: current',
        'to: renderer',
        'session_age_ms: Math.round(process.uptime() * 1_000)',
        "process.env.CLAUDE_CODE_TUI_JUST_SWITCHED === 'fullscreen'",
        "renderer === 'default'",
        'scroll_decay_curve: scrollConfig.useDecayCurve',
        'scroll_base: scrollConfig.base',
        'scroll_xtermjs: scrollConfig.xtermJs',
      ]) {
        assert.ok(arrowText.includes(marker), marker)
      }

      const emitted = ts.transpileModule(`const call = ${arrowText}`, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
      const events = []
      const settings = []
      const relaunches = []
      const executable = Function(
        'getScrollConfig',
        'logEvent',
        'isFullscreenEnvEnabled',
        'relaunch',
        'getInitialSettings',
        'updateSettingsForSource',
        'RENDERERS',
        `${emitted}\nreturn call`,
      )(
        () => ({ useDecayCurve: true, base: 3, xtermJs: true }),
        (name, payload) => events.push({ name, payload }),
        () => true,
        options => {
          relaunches.push(options)
          return { relaunched: true }
        },
        () => ({ tui: 'fullscreen' }),
        (scope, value) => {
          settings.push({ scope, value })
          return {}
        },
        ['default', 'fullscreen'],
      )
      const originalUptime = process.uptime
      const originalSwitch = process.env.CLAUDE_CODE_TUI_JUST_SWITCHED
      try {
        process.uptime = () => 12.345
        process.env.CLAUDE_CODE_TUI_JUST_SWITCHED = 'fullscreen'
        assert.deepEqual(await executable('default'), { relaunched: true })
      } finally {
        process.uptime = originalUptime
        if (originalSwitch === undefined) {
          delete process.env.CLAUDE_CODE_TUI_JUST_SWITCHED
        } else {
          process.env.CLAUDE_CODE_TUI_JUST_SWITCHED = originalSwitch
        }
      }
      assert.deepEqual(settings, [
        { scope: 'userSettings', value: { tui: 'default' } },
      ])
      assert.deepEqual(events, [
        {
          name: 'tengu_tui_command',
          payload: {
            fullscreen: false,
            from: 'fullscreen',
            to: 'default',
            session_age_ms: 12345,
            bounce: true,
            scroll_decay_curve: true,
            scroll_base: 3,
            scroll_xtermjs: true,
          },
        },
      ])
      assert.deepEqual(relaunches, [
        {
          freshIfNoTranscript: true,
          env: { CLAUDE_CODE_TUI_JUST_SWITCHED: 'default' },
          dropEnv: [
            'CLAUDE_CODE_NO_FLICKER',
            'CLAUDE_CODE_FORCE_FULLSCREEN_UPSELL',
          ],
        },
      ])

      const scroll = sources.get('src/ink/scroll-config.ts')
      const scrollText = scroll.text
      for (const marker of [
        "useDecayCurve: xtermJs || platform === 'win32' || wtSession",
        'useAdaptiveDrain: xtermJs',
        'base: readScrollSpeedBase(xtermJs)',
        "termProgram: process.env.TERM_PROGRAM ?? 'unset'",
        "scrollSpeedEnv: process.env.CLAUDE_CODE_SCROLL_SPEED ?? 'unset'",
        'Math.min(parsed, 20)',
      ]) {
        assert.ok(scrollText.includes(marker), marker)
      }
    } finally {
      fs.rmSync(materialized.temporary, { recursive: true, force: true })
    }
  },
)

test(
  'TUI telemetry replay accepts absent or inherited config and rejects drift',
  { skip: !selected },
  () => {
    for (const inherited of [false, true]) {
      const materialized = materializeRawSource(
        `target118-tui-${inherited ? 'inherited' : 'absent'}-`,
      )
      try {
        if (inherited) {
          const destination = sourceFilename(
            materialized.sourceRoot,
            fixture.inputs.recoveredSource.files[1].path,
          )
          fs.mkdirSync(path.dirname(destination), { recursive: true })
          fs.copyFileSync(path.join(root, fixture.inputs.donor.path), destination)
        }
        assert.equal(
          applyTarget118TuiTelemetrySourceRecovery({
            sourceRoot: materialized.sourceRoot,
          }).status,
          'recovered',
        )
        assert.equal(
          applyTarget118TuiTelemetrySourceRecovery({
            sourceRoot: materialized.sourceRoot,
          }).status,
          'already-recovered',
        )
      } finally {
        fs.rmSync(materialized.temporary, { recursive: true, force: true })
      }
    }

    const mutated = materializeRawSource('target118-tui-mutated-')
    try {
      fs.appendFileSync(mutated.tuiFilename, '\n// drift\n')
      const before = fs.readFileSync(mutated.tuiFilename)
      assert.throws(
        () =>
          applyTarget118TuiTelemetrySourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /mixed or unknown/,
      )
      assert.deepEqual(fs.readFileSync(mutated.tuiFilename), before)
    } finally {
      fs.rmSync(mutated.temporary, { recursive: true, force: true })
    }

    const configured = sourceState(configuredSourceRoot)
    assert.ok(
      configured.raw || configured.recovered,
      `configured source must be exact raw/inherited or recovered: ${JSON.stringify(configured)}`,
    )
  },
)

test(
  'TUI telemetry owner coverage evolves atomically',
  { skip: !selected },
  () => {
    const coverage = readCoverage()
    const owners = new Map(
      coverage.owners.map(owner => [owner.id, owner.path]),
    )
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([fixture.targetUnit.provisionalOwnerPath]) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) === JSON.stringify(fixture.ownerOverride.paths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected)
  },
)
