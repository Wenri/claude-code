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
  applyTarget118WarmResumeSessionKindSourceRecovery,
  TARGET118_WARM_RESUME_SESSION_KIND_INPUT_FILES,
  TARGET118_WARM_RESUME_SESSION_KIND_OUTPUT_FILES,
  TARGET118_WARM_RESUME_SESSION_KIND_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-warm-resume-session-kind-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-warm-resume-session-kind-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '5e3e3cb57c118f16712d446da62fccc3bc8e85bf8ae72e46b0928e9afba2ffae'
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

function gitSource(file) {
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.rawSource.commit}:${file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: file.bytes,
    sha256: file.sha256,
  })
  assert.equal(
    spawnSync(
      'git',
      ['rev-parse', `${fixture.inputs.rawSource.commit}:${file.path}`],
      { cwd: root, encoding: 'utf8' },
    ).stdout.trim(),
    file.blob,
  )
  return result.stdout
}

function materializeRawSources(prefix = 'target118-warm-resume-') {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporary, 'src')
  for (const file of fixture.inputs.rawSource.files) {
    const filename = sourceFilename(sourceRoot, file.path)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, gitSource(file))
  }
  return { temporary, sourceRoot }
}

function sourceState(sourceRoot) {
  const actual = fixture.inputs.rawSource.files.map(file =>
    descriptor(fs.readFileSync(sourceFilename(sourceRoot, file.path))),
  )
  const raw = actual.every((value, index) =>
    sameDescriptor(value, fixture.inputs.rawSource.files[index]),
  )
  const recovered = actual.every((value, index) =>
    sameDescriptor(value, fixture.inputs.recoveredSource.files[index]),
  )
  return { raw, recovered, actual }
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

function findFunction(ts, sourceFile, name) {
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, name)
  return matches[0]
}

function parseSourceFiles(ts, sourceRoot) {
  const values = new Map()
  for (const file of fixture.inputs.recoveredSource.files) {
    const bytes = fs.readFileSync(sourceFilename(sourceRoot, file.path))
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
      file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0, file.path)
    values.set(file.path, { bytes, text, sourceFile })
  }
  return values
}

test(
  'Target118 WarmResume session-kind fixture freezes exact inputs and override',
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
    assert.deepEqual(
      TARGET118_WARM_RESUME_SESSION_KIND_INPUT_FILES,
      fixture.inputs.rawSource.files.map(file => ({
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
      })),
    )
    assert.deepEqual(
      TARGET118_WARM_RESUME_SESSION_KIND_OUTPUT_FILES,
      fixture.inputs.recoveredSource.files,
    )
    assert.deepEqual(
      TARGET118_WARM_RESUME_SESSION_KIND_OWNER_OVERRIDES.map(row => ({
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
    for (const file of fixture.inputs.rawSource.files) gitSource(file)
  },
)

test(
  'authenticated Target118 launch unit invokes the exact concurrent-session-kind binding',
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
    for (const expected of [fixture.targetUnit, fixture.supportingTargetUnit]) {
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

    const launch = parsed.get(fixture.targetUnit.targetIndex)
    assert.equal(launch.type, 'FunctionDeclaration')
    assert.equal(launch.body.body.length, 5)
    assert.deepEqual(
      launch.body.body.map(statement => statement.type),
      [
        'IfStatement',
        'IfStatement',
        'IfStatement',
        'IfStatement',
        'ReturnStatement',
      ],
    )
    const [argv, sessionKind, teammate, ci, success] = launch.body.body
    assert.equal(argv.test.type, 'BinaryExpression')
    assert.equal(argv.test.operator, '>')
    assert.equal(argv.test.right.value, 2)
    assert.equal(argv.test.left.property.name, 'length')
    assert.equal(argv.test.left.object.property.name, 'argv')
    assert.equal(argv.test.left.object.object.name, 'process')
    assert.equal(sessionKind.test.type, 'BinaryExpression')
    assert.equal(sessionKind.test.operator, '!==')
    assert.equal(sessionKind.test.left.type, 'CallExpression')
    assert.equal(sessionKind.test.right.type, 'UnaryExpression')
    assert.equal(sessionKind.test.right.operator, 'void')
    assert.equal(sessionKind.test.right.argument.value, 0)
    assert.equal(teammate.test.type, 'CallExpression')
    assert.equal(ci.test.type, 'MemberExpression')
    assert.equal(ci.test.property.name, 'isCI')
    assert.equal(success.argument.operator, '!')
    assert.equal(success.argument.argument.value, 0)

    const sessionKindBinding = parsed.get(
      fixture.supportingTargetUnit.targetIndex,
    )
    assert.equal(sessionKindBinding.type, 'FunctionDeclaration')
    assert.equal(
      sessionKind.test.left.callee.name,
      sessionKindBinding.id.name,
      'launch guard calls the pinned concurrent-session-kind binding',
    )
    assert.equal(sessionKindBinding.body.body.length, 1)
    assert.equal(sessionKindBinding.body.body[0].type, 'ReturnStatement')
    assert.equal(sessionKindBinding.body.body[0].argument, null)

    for (const residue of fixture.targetUnit.residues) {
      const [kind, value, start, end] = residue
      const text = bundle.subarray(start, end).toString()
      assert.equal(kind === 'string' ? JSON.parse(text) : text, value)
    }
  },
)

test(
  'recovered source exports and consumes the exact session-kind eligibility contract',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const materialized = materializeRawSources()
    try {
      assert.equal(
        applyTarget118WarmResumeSessionKindSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }).status,
        'recovered',
      )
      const sources = parseSourceFiles(ts, materialized.sourceRoot)
      for (const expected of fixture.inputs.recoveredSource.declarations) {
        const { text, sourceFile } = sources.get(expected.path)
        const declaration = findFunction(ts, sourceFile, expected.name)
        const start = declaration.getStart(sourceFile)
        const end = declaration.end
        assert.deepEqual(
          {
            start,
            end,
            ...descriptor(Buffer.from(text.slice(start, end))),
          },
          {
            start: expected.start,
            end: expected.end,
            bytes: expected.bytes,
            sha256: expected.sha256,
          },
        )
      }

      const warm = sources.get('src/components/WarmResumeHint.tsx')
      const imports = warm.sourceFile.statements.filter(ts.isImportDeclaration)
      const sessionImports = imports.filter(
        declaration =>
          declaration.moduleSpecifier.text === '../utils/concurrentSessions.js',
      )
      assert.equal(sessionImports.length, 1)
      assert.deepEqual(
        sessionImports[0].importClause.namedBindings.elements.map(
          element => element.name.text,
        ),
        ['envSessionKind'],
      )
      const launch = findFunction(ts, warm.sourceFile, 'isLaunchEligible')
      assert.deepEqual(
        launch.body.statements.map(statement => statement.getText(warm.sourceFile)),
        [
          'if (process.argv.length > 2) return false',
          'if (envSessionKind() !== undefined) return false',
          'if (isTeammate()) return false',
          'if (env.isCI) return false',
          'return true',
        ],
      )

      const concurrent = sources.get('src/utils/concurrentSessions.ts')
      const binding = findFunction(
        ts,
        concurrent.sourceFile,
        'envSessionKind',
      )
      assert.ok(
        binding.modifiers.some(
          modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ),
      )
      const bindingText = binding.getText(concurrent.sourceFile)
      for (const marker of [
        "feature('BG_SESSIONS')",
        'process.env.CLAUDE_CODE_SESSION_KIND',
        "k === 'bg'",
        "k === 'daemon'",
        "k === 'daemon-worker'",
        'return undefined',
      ]) {
        assert.ok(bindingText.includes(marker), marker)
      }
    } finally {
      fs.rmSync(materialized.temporary, { recursive: true, force: true })
    }
  },
)

test(
  'WarmResume replay is atomic, idempotent, package-aware, and fail-closed',
  { skip: !selected },
  () => {
    const raw = materializeRawSources('target118-warm-resume-idempotent-')
    try {
      assert.deepEqual(sourceState(raw.sourceRoot), {
        raw: true,
        recovered: false,
        actual: fixture.inputs.rawSource.files.map(file => ({
          bytes: file.bytes,
          sha256: file.sha256,
        })),
      })
      assert.equal(
        applyTarget118WarmResumeSessionKindSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'recovered',
      )
      assert.equal(
        applyTarget118WarmResumeSessionKindSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'already-recovered',
      )
    } finally {
      fs.rmSync(raw.temporary, { recursive: true, force: true })
    }

    const mixed = materializeRawSources('target118-warm-resume-mixed-')
    try {
      applyTarget118WarmResumeSessionKindSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      })
      const warm = fixture.inputs.rawSource.files[0]
      fs.writeFileSync(sourceFilename(mixed.sourceRoot, warm.path), gitSource(warm))
      assert.throws(
        () =>
          applyTarget118WarmResumeSessionKindSourceRecovery({
            sourceRoot: mixed.sourceRoot,
          }),
        /mixed or unknown/,
      )
    } finally {
      fs.rmSync(mixed.temporary, { recursive: true, force: true })
    }

    const mutated = materializeRawSources('target118-warm-resume-mutated-')
    try {
      const filename = sourceFilename(
        mutated.sourceRoot,
        fixture.inputs.rawSource.files[1].path,
      )
      fs.appendFileSync(filename, '\n// drift\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () =>
          applyTarget118WarmResumeSessionKindSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /mixed or unknown/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(mutated.temporary, { recursive: true, force: true })
    }

    const configured = sourceState(configuredSourceRoot)
    assert.ok(
      configured.raw || configured.recovered,
      `configured source must be an exact raw or recovered state: ${JSON.stringify(configured.actual)}`,
    )
  },
)

test(
  'WarmResume session-kind owner coverage evolves atomically',
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
