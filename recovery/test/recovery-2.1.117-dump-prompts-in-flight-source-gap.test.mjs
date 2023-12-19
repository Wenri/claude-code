import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget117DumpPromptsInFlightSourceRecovery,
  TARGET117_DUMP_PROMPTS_IN_FLIGHT_INPUT_FILE,
  TARGET117_DUMP_PROMPTS_IN_FLIGHT_OUTPUT_FILE,
  TARGET117_DUMP_PROMPTS_IN_FLIGHT_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-dump-prompts-in-flight-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-dump-prompts-in-flight-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f7045d1e5cad42721652e41bd24174964612a1b8f279e7333a7379fec7d62f5a'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expected.bytes, `${label}: bytes`)
  assert.equal(sha256(bytes), expected.sha256, `${label}: SHA-256`)
  return bytes
}

function artifactPath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(sourceRoot, sourcePath = fixture.inputs.sourceFile.path) {
  assert.match(sourcePath, /^src\//, `${sourcePath}: normalized source path`)
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(
    filename.startsWith(`${root}${path.sep}`),
    `${sourcePath}: remains below source root`,
  )
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const bytes = execFileSync(
    'git',
    [
      'show',
      `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
    ],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(bytes), fixture.inputs.sourceFile.input)
  const filename = sourceFilename(sourceRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  const destination = sourceFilename(outputRoot)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(sourceFilename(sourceRoot), destination)
  return { temporaryRoot, sourceRoot: outputRoot }
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function propertyOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, node => {
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property?.name === 'dumpInFlight') {
      occurrences.push({ start: property.start, end: property.end })
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  return occurrences
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(fs.existsSync(filename), 'repo-pinned TypeScript is available')
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

function parseSource(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parses`)
  return sourceFile
}

function namedDeclaration(ts, sourceFile, expected) {
  const matches = []
  function visit(node) {
    if (
      ts.SyntaxKind[node.kind] === expected.nodeType &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === expected.name
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${expected.name}: one exact declaration`)
  const declaration = matches[0]
  assert.equal(declaration.getStart(sourceFile), expected.start)
  assert.equal(declaration.end, expected.end)
  return declaration
}

function assertDeclaration(ts, sourceFile, source, expected) {
  const declaration = namedDeclaration(ts, sourceFile, expected)
  const bytes = Buffer.from(
    source.slice(declaration.getStart(sourceFile), declaration.end),
  )
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return declaration
}

function descendants(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function isDumpInFlightAccess(ts, node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'dumpInFlight'
  )
}

function assertExactPostimage(sourceRoot) {
  readExact(
    sourceFilename(sourceRoot),
    fixture.inputs.sourceFile.output,
    'recovered dumpPrompts.ts',
  )
}

test(
  '2.1.117 dump-prompts fixture pins the corrected owner and exact replay',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.summary.units, 2)
    assert.equal(fixture.summary.residues, 4)
    assert.equal(fixture.summary.ownerOverrides, 2)

    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'case-owned helper',
    )
    assert.deepEqual(
      TARGET117_DUMP_PROMPTS_IN_FLIGHT_INPUT_FILE,
      {
        path: fixture.inputs.sourceFile.path,
        ...fixture.inputs.sourceFile.input,
      },
    )
    assert.deepEqual(
      TARGET117_DUMP_PROMPTS_IN_FLIGHT_OUTPUT_FILE,
      {
        path: fixture.inputs.sourceFile.path,
        ...fixture.inputs.sourceFile.output,
      },
    )
    assert.deepEqual(
      TARGET117_DUMP_PROMPTS_IN_FLIGHT_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: [...override.paths],
        declarations: [...override.declarations],
        evidenceIds: [...override.evidenceIds],
      })),
      fixture.rows.map(row => ({
        key: `${caseName}:${row.targetIndex}`,
        targetIndex: row.targetIndex,
        paths: [row.owner],
        declarations: row.declarations,
        evidenceIds: fixture.evidenceIds,
      })),
    )

    for (const input of [
      fixture.inputs.sourceFile,
      fixture.inputs.rejectedSourceMapOwner,
    ]) {
      const bytes = execFileSync(
        'git',
        ['show', `${fixture.inputs.rawTargetSourceCommit}:${input.path}`],
        { cwd: repositoryRoot },
      )
      assert.equal(
        execFileSync(
          'git',
          ['rev-parse', `${fixture.inputs.rawTargetSourceCommit}:${input.path}`],
          { cwd: repositoryRoot, encoding: 'utf8' },
        ).trim(),
        input.blob,
        `${input.path}: blob identity`,
      )
      const expected = input.input ?? input
      assert.deepEqual(descriptor(bytes), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
    }
    const rejected = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.rejectedSourceMapOwner.path}`,
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    assert.doesNotMatch(rejected, /dumpInFlight/)
  },
)

test(
  '2.1.117 bundles authenticate both in-flight units, all four residues, and the 2.1.116 contrast',
  { skip: !selected },
  () => {
    const baselineBytes = readExact(
      artifactPath('CLAUDE_CODE_BASELINE_2_1_116_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'authenticated 2.1.116 bundle',
    )
    const targetBytes = readExact(
      artifactPath('CLAUDE_CODE_TARGET_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'authenticated 2.1.117 bundle',
    )
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
      'structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    assert.deepEqual(
      { bytes: ledger.baseline.bytes, sha256: ledger.baseline.sha256 },
      {
        bytes: fixture.inputs.baselineBundle.bytes,
        sha256: fixture.inputs.baselineBundle.sha256,
      },
    )
    assert.deepEqual(
      { bytes: ledger.target.bytes, sha256: ledger.target.sha256 },
      {
        bytes: fixture.inputs.targetBundle.bytes,
        sha256: fixture.inputs.targetBundle.sha256,
      },
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.doesNotMatch(baseline, /dumpInFlight/)

    for (const witness of fixture.baselineWitnesses) {
      const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
        witness.baselineUnit
      assert.equal(classification, 'unmatched')
      assert.equal(baseline.slice(start, end), witness.exactSource)
      assert.equal(sha256(Buffer.from(witness.exactSource)), sourceHash)
      const ledgerUnit = ledger.unmatchedBaseline.find(unit => unit.index === index)
      assert.deepEqual(
        [
          ledgerUnit.index,
          classification,
          ledgerUnit.nodeType,
          ledgerUnit.start,
          ledgerUnit.end,
          ledgerUnit.tokenCount,
          ledgerUnit.sourceHash,
          ledgerUnit.coarseHash,
        ],
        [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash],
      )
    }

    const expectedOccurrences = fixture.rows
      .flatMap(row => row.residues)
      .map(([, , start, end]) => ({ start, end }))
      .sort((left, right) => left.start - right.start)
    assert.deepEqual(propertyOccurrences(target), expectedOccurrences)

    for (const row of fixture.rows) {
      const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
        row.targetUnit
      assert.equal(target.slice(start, end), row.exactSource)
      assert.equal(sha256(Buffer.from(row.exactSource)), sourceHash)
      const ledgerEntry = ledger.unresolvedTarget.find(
        entry => entry.target.index === index,
      )
      assert.deepEqual(
        [
          ledgerEntry.target.index,
          ledgerEntry.classification,
          ledgerEntry.target.nodeType,
          ledgerEntry.target.start,
          ledgerEntry.target.end,
          ledgerEntry.target.tokenCount,
          ledgerEntry.target.sourceHash,
          ledgerEntry.target.coarseHash,
        ],
        [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash],
      )
      for (const [kind, value, residueStart, residueEnd, occurrence, baselineCount] of
        row.residues) {
        assert.equal(kind, 'property')
        assert.equal(value, 'dumpInFlight')
        assert.equal(target.slice(residueStart, residueEnd), value)
        assert.equal(residueStart >= start && residueEnd <= end, true)
        assert.equal(
          expectedOccurrences.findIndex(item => item.start === residueStart) + 1,
          occurrence,
        )
        assert.equal(baselineCount, 0)
      }
    }

    const releaseUnitAst = parse(fixture.rows[0].exactSource, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    let finallyRelease = 0
    walk(releaseUnitAst, node => {
      if (
        node.type === 'AssignmentExpression' &&
        node.left?.type === 'MemberExpression' &&
        node.left.property?.name === 'dumpInFlight' &&
        node.right?.type === 'UnaryExpression' &&
        node.right.operator === '!' &&
        node.right.argument?.type === 'Literal' &&
        node.right.argument.value === 1
      ) {
        finallyRelease++
      }
    })
    assert.equal(finallyRelease, 1, 'compiled cleanup releases the guard')

    const admissionUnitAst = parse(fixture.rows[1].exactSource, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    let falseDefault = 0
    let falseGuard = 0
    let trueAdmission = 0
    walk(admissionUnitAst, node => {
      if (
        node.type === 'Property' &&
        node.key?.name === 'dumpInFlight' &&
        node.value?.type === 'UnaryExpression' &&
        node.value.operator === '!' &&
        node.value.argument?.type === 'Literal' &&
        node.value.argument.value === 1
      ) {
        falseDefault++
      }
      if (
        node.type === 'UnaryExpression' &&
        node.operator === '!' &&
        node.argument?.type === 'MemberExpression' &&
        node.argument.property?.name === 'dumpInFlight'
      ) {
        falseGuard++
      }
      if (
        node.type === 'AssignmentExpression' &&
        node.left?.type === 'MemberExpression' &&
        node.left.property?.name === 'dumpInFlight' &&
        node.right?.type === 'UnaryExpression' &&
        node.right.operator === '!' &&
        node.right.argument?.type === 'Literal' &&
        node.right.argument.value === 0
      ) {
        trueAdmission++
      }
    })
    assert.deepEqual(
      { falseDefault, falseGuard, trueAdmission },
      { falseDefault: 1, falseGuard: 1, trueAdmission: 1 },
    )
  },
)

test(
  '2.1.117 dump-prompts replay is dual-state and preserves exact admission/release semantics',
  { skip: !selected },
  async () => {
    const raw = materializeRawSource('target117-dump-prompts-in-flight-raw-')
    try {
      assert.doesNotMatch(fs.readFileSync(sourceFilename(raw.sourceRoot), 'utf8'), /dumpInFlight/)
      const first = applyTarget117DumpPromptsInFlightSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117DumpPromptsInFlightSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      assertExactPostimage(raw.sourceRoot)

      const source = fs.readFileSync(sourceFilename(raw.sourceRoot), 'utf8')
      const ts = await loadTypeScript()
      const sourceAst = parseSource(ts, fixture.inputs.sourceFile.path, source)
      const declarations = new Map(
        fixture.inputs.sourceFile.declarations.map(expected => [
          expected.name,
          assertDeclaration(ts, sourceAst, source, expected),
        ]),
      )

      const state = declarations.get('DumpState')
      const stateMembers = state.type.members.filter(
        member => member.name && ts.isIdentifier(member.name),
      )
      const stateField = stateMembers.filter(
        member => member.name.text === 'dumpInFlight',
      )
      assert.equal(stateField.length, 1)
      assert.equal(stateField[0].type.kind, ts.SyntaxKind.BooleanKeyword)

      const dumpRequest = declarations.get('dumpRequest')
      const tryStatements = descendants(ts, dumpRequest, ts.isTryStatement)
      assert.equal(tryStatements.length, 1)
      assert.ok(tryStatements[0].finallyBlock, 'cleanup is structurally finally')
      const releases = descendants(
        ts,
        tryStatements[0].finallyBlock,
        node =>
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          isDumpInFlightAccess(ts, node.left) &&
          node.right.kind === ts.SyntaxKind.FalseKeyword,
      )
      assert.equal(releases.length, 1)

      const createFetch = declarations.get('createDumpPromptsFetch')
      const accesses = descendants(ts, createFetch, node =>
        isDumpInFlightAccess(ts, node),
      )
      assert.equal(accesses.length, 2, 'guard and admission property accesses')
      const defaults = descendants(
        ts,
        createFetch,
        node =>
          ts.isPropertyAssignment(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === 'dumpInFlight' &&
          node.initializer.kind === ts.SyntaxKind.FalseKeyword,
      )
      const guards = descendants(
        ts,
        createFetch,
        node =>
          ts.isPrefixUnaryExpression(node) &&
          node.operator === ts.SyntaxKind.ExclamationToken &&
          isDumpInFlightAccess(ts, node.operand),
      )
      const admissions = descendants(
        ts,
        createFetch,
        node =>
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          isDumpInFlightAccess(ts, node.left) &&
          node.right.kind === ts.SyntaxKind.TrueKeyword,
      )
      const schedules = descendants(
        ts,
        createFetch,
        node =>
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'setImmediate' &&
          node.arguments.length === 5 &&
          ts.isIdentifier(node.arguments[0]) &&
          node.arguments[0].text === 'dumpRequest',
      )
      assert.deepEqual(
        {
          admissions: admissions.length,
          defaults: defaults.length,
          guards: guards.length,
          schedules: schedules.length,
        },
        { admissions: 1, defaults: 1, guards: 1, schedules: 1 },
      )
      assert.ok(
        guards[0].getStart(sourceAst) < admissions[0].getStart(sourceAst) &&
          admissions[0].getStart(sourceAst) < schedules[0].getStart(sourceAst),
        'guard precedes admission and admission precedes scheduling',
      )
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    const packaged = copySelectedSource(
      packagedRoot,
      'target117-dump-prompts-in-flight-packaged-',
    )
    try {
      const result = applyTarget117DumpPromptsInFlightSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(
        ['recovered', 'already-recovered'].includes(result.status),
        `package state ${result.status}`,
      )
      assertExactPostimage(packaged.sourceRoot)
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 dump-prompts replay rejects mutation before writing',
  { skip: !selected },
  () => {
    const mutated = materializeRawSource('target117-dump-prompts-in-flight-mutated-')
    try {
      fs.appendFileSync(sourceFilename(mutated.sourceRoot), '\n// mutation\n')
      const before = fs.readFileSync(sourceFilename(mutated.sourceRoot))
      assert.throws(
        () =>
          applyTarget117DumpPromptsInFlightSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /Refusing non-target dump-prompts in-flight recovery/,
      )
      assert.deepEqual(fs.readFileSync(sourceFilename(mutated.sourceRoot)), before)
    } finally {
      fs.rmSync(mutated.temporaryRoot, { recursive: true, force: true })
    }
  },
)
