import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  TARGET119_BINARY_COMMAND_VALIDATION_EVIDENCE_IDS,
  TARGET119_BINARY_COMMAND_VALIDATION_INPUT_FILES,
  TARGET119_BINARY_COMMAND_VALIDATION_OUTPUT_FILES,
  TARGET119_BINARY_COMMAND_VALIDATION_OWNER_OVERRIDES,
  applyTarget119BinaryCommandValidationSourceRecovery,
  buildTarget119BinaryCommandValidationOutput,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-binary-command-name-validation-source-gap.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-binary-command-validation-source-gap.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/replay-binary-command-name-validation-source-gap.mjs',
)
const coveragePath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '39c276733f1a1e547125cc6fa51f3436ac758ec58c0cc2dc9c79ef61d673fabf'
const HELPER_SHA256 =
  'fc48e2917e16dca70da56f2b9f15a7618e6556242cea45d19be7abe1eaa3475e'
const RAW_SOURCE_COMMIT = '351cd4d13f70a564dc2d90f59ab0093dc6fc7b05'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function readExact(filename, expected, label = filename) {
  const value = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(value),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return value
}

function gitBytes(object) {
  return execFileSync('git', ['show', object], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 4 * 1024 * 1024,
  })
}

function canonicalRows() {
  return fixture.row.residues.map(residue => [
    fixture.row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ])
}

function stateOf(bytes) {
  const actual = descriptor(bytes)
  const input = TARGET119_BINARY_COMMAND_VALIDATION_INPUT_FILES[0]
  const output = TARGET119_BINARY_COMMAND_VALIDATION_OUTPUT_FILES[0]
  if (actual.bytes === input.bytes && actual.sha256 === input.sha256) return 'raw'
  if (actual.bytes === output.bytes && actual.sha256 === output.sha256)
    return 'recovered'
  assert.fail(`unknown binaryCheck.ts state ${actual.bytes}/${actual.sha256}`)
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

test(
  'Target119 binary-command validation fixture and replay helper are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_BINARY_COMMAND_VALIDATION_EVIDENCE_IDS,
    )
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 3,
      strictResidues: 1,
      targetIndicesSha256:
        'ec97bb05063dbb22aef01198a550c9ee98075e2da3018cc75ab9a7942126a06d',
      residueIdentitiesSha256:
        '4da9fb90a508453a6d78e39b5f6569005e829faa9468391c3281e326a08f5257',
    })
    assert.equal(
      sha256(JSON.stringify([fixture.row.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalRows())),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.deepEqual(TARGET119_BINARY_COMMAND_VALIDATION_OWNER_OVERRIDES, [
      {
        key: `${caseName}:20977`,
        targetIndex: 20977,
        paths: fixture.row.ownerPaths,
        declarations: fixture.row.declarations,
        evidenceIds: fixture.evidenceIds,
        behavior:
          'Binary lookup rejects unsafe command names before consulting the cache or PATH. Windows accepts drive and backslash syntax through the platform-specific pattern; Unix retains the narrower slash-safe pattern.',
      },
    ])
  },
)

test(
  'authenticated Target119 binary-validation units and residues stay exact',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 bundle',
    )
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
    )
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural ledger',
        ),
      ),
    )
    for (const expected of [fixture.supportingUnit, fixture.row]) {
      const region = structural.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
      )
      assert.ok(region)
      assert.equal(region.classification, expected.classification)
      assert.equal(region.baselineUnitIndex, expected.baseline.targetIndex)
      assert.equal(region.pairReason, expected.pairReason)
      assert.deepEqual(
        {
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          sha256: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        expected.target,
      )
      assert.equal(
        sha256(target.subarray(expected.target.start, expected.target.end)),
        expected.target.sha256,
      )
      assert.equal(
        sha256(
          baseline.subarray(expected.baseline.start, expected.baseline.end),
        ),
        expected.baseline.sha256,
      )
    }
    for (const residue of fixture.row.residues) {
      const literal = target
        .subarray(residue.start, residue.end)
        .toString('utf8')
      if (residue.kind === 'string') assert.equal(JSON.parse(literal), residue.value)
      else {
        assert.equal(residue.kind, 'regexp')
        assert.equal(literal, `/${residue.value.pattern}/${residue.value.flags}`)
      }
    }
  },
)

test(
  'Target119 source replay is exact, AST-scoped, and platform-safe',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const input = TARGET119_BINARY_COMMAND_VALIDATION_INPUT_FILES[0]
    const output = TARGET119_BINARY_COMMAND_VALIDATION_OUTPUT_FILES[0]
    const raw = gitBytes(`${RAW_SOURCE_COMMIT}:${input.path}`)
    assert.deepEqual(descriptor(raw), {
      bytes: input.bytes,
      sha256: input.sha256,
    })
    const donor = gitBytes(`${fixture.inputs.donor.commit}:${fixture.inputs.donor.path}`)
    assert.deepEqual(descriptor(donor), {
      bytes: fixture.inputs.donor.bytes,
      sha256: fixture.inputs.donor.sha256,
    })
    assert.equal(
      execFileSync('git', ['rev-parse', `${fixture.inputs.donor.commit}:${fixture.inputs.donor.path}`], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      fixture.inputs.donor.gitBlob,
    )
    const recovered = Buffer.from(
      buildTarget119BinaryCommandValidationOutput(raw.toString('utf8')),
    )
    assert.deepEqual(descriptor(recovered), {
      bytes: output.bytes,
      sha256: output.sha256,
    })
    assert.deepEqual(recovered, donor)

    const source = recovered.toString('utf8')
    const sourceFile = ts.createSourceFile(
      input.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    const getPlatformImports = sourceFile.statements.filter(
      statement =>
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.text === './platform.js' &&
        statement.importClause?.namedBindings?.elements.some(
          element => element.name.text === 'getPlatform',
        ),
    )
    assert.equal(getPlatformImports.length, 1)
    const patternDeclarations = []
    const functions = []
    const visit = node => {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(sourceFile) === 'SAFE_BINARY_NAME_PATTERN'
      )
        patternDeclarations.push(node)
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'isBinaryInstalled'
      )
        functions.push(node)
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert.equal(patternDeclarations.length, 1)
    assert.equal(functions.length, 1)
    for (const [name, node] of [
      ['SAFE_BINARY_NAME_PATTERN', patternDeclarations[0]],
      ['isBinaryInstalled', functions[0]],
    ]) {
      const expected = fixture.source.declarations[name]
      const text = source.slice(node.getStart(sourceFile), node.end)
      assert.deepEqual(
        {
          start: node.getStart(sourceFile),
          end: node.end,
          chars: text.length,
          sha256: sha256(text),
        },
        expected,
      )
    }
    const body = functions[0].getText(sourceFile)
    const guard = body.indexOf('SAFE_BINARY_NAME_PATTERN.test(trimmedCommand)')
    assert.ok(guard > 0)
    assert.ok(guard < body.indexOf('binaryCache.get(trimmedCommand)'))
    assert.ok(guard < body.indexOf('which(trimmedCommand)'))

    const windows = /^[A-Za-z0-9/\\][A-Za-z0-9_.+:\\?/-]*$/
    const unix = /^[A-Za-z0-9/][A-Za-z0-9_.+/-]*$/
    for (const command of ['C:\\Tools\\bin.exe', '\\server\\tool', 'git?.exe'])
      assert.equal(windows.test(command), true, command)
    for (const command of ['git', '/usr/local/bin/node', 'rust-analyzer'])
      assert.equal(unix.test(command), true, command)
    for (const command of ['git;rm', '$(touch x)', 'tool name', 'a\nnext']) {
      assert.equal(windows.test(command), false, command)
      assert.equal(unix.test(command), false, command)
    }
    assert.equal(unix.test('C:\\Tools\\bin.exe'), false)
  },
)

test(
  'Target119 binary-validation replay is idempotent and fails closed',
  { skip: !selected },
  () => {
    const input = TARGET119_BINARY_COMMAND_VALIDATION_INPUT_FILES[0]
    const output = TARGET119_BINARY_COMMAND_VALIDATION_OUTPUT_FILES[0]
    const raw = gitBytes(`${RAW_SOURCE_COMMIT}:${input.path}`)
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-binary-validation-'),
    )
    try {
      const utils = path.join(temporaryRoot, 'utils')
      fs.mkdirSync(utils, { recursive: true })
      const filename = path.join(utils, 'binaryCheck.ts')
      fs.writeFileSync(filename, raw)
      assert.deepEqual(
        applyTarget119BinaryCommandValidationSourceRecovery({
          sourceRoot: temporaryRoot,
        }),
        { status: 'recovered', files: [input.path] },
      )
      assert.deepEqual(descriptor(fs.readFileSync(filename)), {
        bytes: output.bytes,
        sha256: output.sha256,
      })
      assert.deepEqual(
        applyTarget119BinaryCommandValidationSourceRecovery({
          sourceRoot: temporaryRoot,
        }),
        { status: 'already-recovered', files: [] },
      )
      fs.appendFileSync(filename, '\n// drift\n')
      assert.throws(
        () =>
          applyTarget119BinaryCommandValidationSourceRecovery({
            sourceRoot: temporaryRoot,
          }),
        /requires exact raw or recovered/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }

    const linkRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-binary-validation-link-'),
    )
    const externalRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-binary-validation-real-'),
    )
    try {
      fs.mkdirSync(path.join(linkRoot, 'utils'))
      const external = path.join(externalRoot, 'binaryCheck.ts')
      fs.writeFileSync(external, raw)
      fs.symlinkSync(external, path.join(linkRoot, 'utils/binaryCheck.ts'))
      assert.throws(
        () =>
          applyTarget119BinaryCommandValidationSourceRecovery({
            sourceRoot: linkRoot,
          }),
        /real source file|symlink/,
      )
    } finally {
      fs.rmSync(linkRoot, { recursive: true, force: true })
      fs.rmSync(externalRoot, { recursive: true, force: true })
    }
  },
)

test(
  'Target119 binary-validation coverage evolves only as an atomic evidence row',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.row.targetIndex,
    )
    assert.ok(row)
    const paths = row.ownerIds.map(
      ownerId => coverage.owners.find(owner => owner.id === ownerId)?.path,
    )
    assert.deepEqual(paths, fixture.row.ownerPaths)
    const provisional = ['source-map-attribution', 'semantic-test']
    assert.ok(
      JSON.stringify(row.evidenceIds) === JSON.stringify(provisional) ||
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(fixture.evidenceIds),
      `unexpected evidence state ${JSON.stringify(row.evidenceIds)}`,
    )
    if (JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds)) {
      assert.equal(
        row.behavior,
        TARGET119_BINARY_COMMAND_VALIDATION_OWNER_OVERRIDES[0].behavior,
      )
    }
  },
)

test(
  'selected Target119 source is an exact raw or recovered binary-validation state',
  { skip: !selected },
  () => {
    const filename = path.join(sourceRoot, 'utils/binaryCheck.ts')
    assert.ok(['raw', 'recovered'].includes(stateOf(fs.readFileSync(filename))))
  },
)
