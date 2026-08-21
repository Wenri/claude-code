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
  applyTarget118RestoreCodeDiffStatsSourceRecovery,
  buildTarget118RestoreCodeDiffStatsOutput,
  TARGET118_RESTORE_CODE_DIFF_STATS_INPUT_FILE,
  TARGET118_RESTORE_CODE_DIFF_STATS_OUTPUT_FILE,
  TARGET118_RESTORE_CODE_DIFF_STATS_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-restore-code-diff-stats-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-restore-code-diff-stats-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '8d03e2ca5441fef5aecd6ddc22351aa59a4aa0e60969a21134b07e578532245c'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function canonicalDigest(value) {
  return sha256(Buffer.from(JSON.stringify(value)))
}

function readPinnedFile(input) {
  const bytes = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
}

function artifactPath(input, environmentVariable) {
  return path.resolve(
    process.env[environmentVariable] ??
      path.join(root, '.recovery-tmp/authenticated-artifacts', input.artifact),
  )
}

function gitFile() {
  const input = fixture.inputs.rawSource.file
  const commit = fixture.inputs.rawSource.commit
  const result = spawnSync('git', ['show', `${commit}:${input.path}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  assert.equal(
    spawnSync('git', ['rev-parse', `${commit}:${input.path}`], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim(),
    input.blob,
  )
  return result.stdout
}

function sourceFilePath(sourceRootPath) {
  return path.join(
    sourceRootPath,
    fixture.inputs.rawSource.file.path.replace(/^src\//, ''),
  )
}

function recoveredFile() {
  const output = buildTarget118RestoreCodeDiffStatsOutput(gitFile().toString())
  assert.deepEqual(descriptor(output), {
    bytes: fixture.inputs.recoveredSource.file.bytes,
    sha256: fixture.inputs.recoveredSource.file.sha256,
  })
  return output
}

function sourceState(sourceRootPath) {
  const actual = descriptor(fs.readFileSync(sourceFilePath(sourceRootPath)))
  const raw = fixture.inputs.rawSource.file
  const recovered = fixture.inputs.recoveredSource.file
  if (actual.bytes === raw.bytes && actual.sha256 === raw.sha256) return 'raw'
  if (
    actual.bytes === recovered.bytes &&
    actual.sha256 === recovered.sha256
  ) {
    return 'recovered'
  }
  assert.fail(`configured MessageSelector is not exact: ${actual.bytes}/${actual.sha256}`)
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

function findFunction(ts, sourceFile, name) {
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0]
}

function pinDeclaration(ts, sourceFile, text, bytes, expected) {
  const declaration = findFunction(ts, sourceFile, expected.name)
  const characterStart = declaration.getStart(sourceFile)
  const characterEnd = declaration.end
  const byteStart = Buffer.byteLength(text.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
  assert.deepEqual(
    {
      name: declaration.name.text,
      characterStart,
      characterEnd,
      byteStart,
      byteEnd,
      ...descriptor(bytes.subarray(byteStart, byteEnd)),
    },
    expected,
  )
  return declaration
}

function elementFactory(type, props, ...children) {
  if (typeof type === 'function') {
    return type({ ...(props ?? {}), ...(children.length ? { children } : {}) })
  }
  return { type, props: props ?? {}, children }
}

function cacheRuntime() {
  return count => Array(count).fill(Symbol.for('react.memo_cache_sentinel'))
}

function normalizeRendered(value) {
  if (value === false || value === null || value === undefined) return undefined
  if (!value || typeof value !== 'object') return value
  const children = []
  for (const child of value.children.map(normalizeRendered)) {
    if (child === undefined) continue
    if (
      typeof child === 'string' &&
      typeof children[children.length - 1] === 'string'
    ) {
      children[children.length - 1] += child
    } else {
      children.push(child)
    }
  }
  return { type: value.type, props: value.props, children }
}

test(
  'Target118 restore-code diff fixture pins one complete source-gap unit',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'authenticated-bounded-source-replay')
    assert.deepEqual(
      descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
      {
        bytes: fixture.inputs.helper.bytes,
        sha256: fixture.inputs.helper.sha256,
      },
    )
    assert.deepEqual(TARGET118_RESTORE_CODE_DIFF_STATS_INPUT_FILE, {
      path: fixture.inputs.rawSource.file.path,
      bytes: fixture.inputs.rawSource.file.bytes,
      sha256: fixture.inputs.rawSource.file.sha256,
    })
    assert.deepEqual(TARGET118_RESTORE_CODE_DIFF_STATS_OUTPUT_FILE, {
      path: fixture.inputs.recoveredSource.file.path,
      bytes: fixture.inputs.recoveredSource.file.bytes,
      sha256: fixture.inputs.recoveredSource.file.sha256,
    })
    assert.deepEqual(
      TARGET118_RESTORE_CODE_DIFF_STATS_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: [fixture.targetUnit.ownerPath],
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior: fixture.targetUnit.behavior,
        },
      ],
    )
    assert.equal(
      canonicalDigest([fixture.targetUnit.targetIndex]),
      fixture.summary.targetIndicesSha256,
    )
    const rows = fixture.targetUnit.residues.map(residue => [
      fixture.targetUnit.targetIndex,
      ...residue,
    ])
    assert.deepEqual(fixture.scannerPartition.rows, rows)
    assert.equal(canonicalDigest(rows), fixture.summary.residueIdentitiesSha256)

    const analysis = JSON.parse(readPinnedFile(fixture.inputs.ownerAnalysis))
    const mapping = analysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(mapping)
    assert.deepEqual(
      {
        ownerPaths: mapping.ownerPaths,
        target: mapping.target,
        residues: mapping.residues,
        unsupportedResidues: mapping.unsupportedResidues,
        residueIdentitiesSha256: mapping.residueIdentitiesSha256,
        unsupportedResidueIdentitiesSha256:
          mapping.unsupportedResidueIdentitiesSha256,
        rowScopedEvidence: mapping.rowScopedEvidence,
      },
      {
        ownerPaths: [fixture.targetUnit.ownerPath.replace(/^src\//, '')],
        target: {
          classification: fixture.targetUnit.classification,
          start: fixture.targetUnit.start,
          end: fixture.targetUnit.end,
          nodeType: fixture.targetUnit.nodeType,
          sourceHash: fixture.targetUnit.sourceHash,
        },
        residues: fixture.summary.residues,
        unsupportedResidues: fixture.summary.residues,
        residueIdentitiesSha256: fixture.summary.residueIdentitiesSha256,
        unsupportedResidueIdentitiesSha256:
          fixture.summary.residueIdentitiesSha256,
        rowScopedEvidence: {
          obligationIds: [],
          sourcePaths: [],
          testIds: [],
        },
      },
    )
    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.rawSource.tree,
    )
    gitFile()
  },
)

test(
  'authenticated caller and stats helper pin the complete compiled behavior',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(
      artifactPath(fixture.inputs.targetBundle, 'CLAUDE_CODE_2_1_118_BUNDLE'),
    )
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledger = JSON.parse(
      gunzipSync(readPinnedFile(fixture.inputs.targetStructuralLedger)),
    )
    for (const expected of [fixture.targetUnit, fixture.supportingTargetUnit]) {
      const region = ledger.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
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
      const ast = parse(bytes.toString(), { ecmaVersion: 'latest' })
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, expected.nodeType)
    }
    const callerText = bundle
      .subarray(fixture.targetUnit.start, fixture.targetUnit.end)
      .toString()
    for (const marker of [
      'filesChanged.length',
      'basename(',
      ' and ',
      ' other files',
      '{added:q.insertions,removed:q.deletions}',
      'The code will be restored',
      '"in "',
    ]) {
      assert.ok(callerText.includes(marker), marker)
    }
    const helperText = bundle
      .subarray(
        fixture.supportingTargetUnit.start,
        fixture.supportingTargetUnit.end,
      )
      .toString()
    for (const marker of [
      'added:',
      'removed:',
      'bold:',
      'q===0&&K===0',
      'q>0&&K>0&&" "',
      'diffAddedWord',
      'diffRemovedWord',
    ]) {
      assert.ok(helperText.includes(marker), marker)
    }
    for (const [index, row] of fixture.scannerPartition.rows.entries()) {
      assert.equal(
        bundle.subarray(row[3], row[4]).toString(),
        fixture.scannerPartition.rawTargetSlices[index],
      )
    }
  },
)

test(
  'bounded restore-code diff replay is fail-closed and idempotent in package mode',
  { skip: !selected },
  t => {
    sourceState(sourceRoot)
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-restore-code-diff-stats-'),
    )
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
    const filename = sourceFilePath(tempRoot)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, gitFile())
    assert.deepEqual(
      applyTarget118RestoreCodeDiffStatsSourceRecovery({
        sourceRoot: tempRoot,
      }),
      {
        status: 'recovered',
        files: [fixture.inputs.recoveredSource.file.path],
      },
    )
    assert.deepEqual(fs.readFileSync(filename), recoveredFile())
    assert.deepEqual(
      applyTarget118RestoreCodeDiffStatsSourceRecovery({
        sourceRoot: tempRoot,
      }),
      {
        status: 'already-recovered',
        files: [fixture.inputs.recoveredSource.file.path],
      },
    )
    fs.appendFileSync(filename, '\n// unpinned mutation\n')
    assert.throws(
      () =>
        applyTarget118RestoreCodeDiffStatsSourceRecovery({
          sourceRoot: tempRoot,
        }),
      /requires exact raw or recovered state/,
    )
  },
)

test(
  'replayed source caller and stats helper are runtime-equivalent to target units',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const rawBytes = gitFile()
    const recoveredBytes = recoveredFile()
    const rawText = rawBytes.toString()
    const recoveredText = recoveredBytes.toString()
    const rawSource = ts.createSourceFile(
      'MessageSelector.raw.tsx',
      rawText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const recoveredSource = ts.createSourceFile(
      'MessageSelector.recovered.tsx',
      recoveredText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(rawSource.parseDiagnostics.length, 0)
    assert.equal(recoveredSource.parseDiagnostics.length, 0)
    for (const expected of fixture.inputs.rawSource.file.declarations) {
      pinDeclaration(ts, rawSource, rawText, rawBytes, expected)
    }
    const recoveredDeclarations = new Map()
    for (const expected of fixture.inputs.recoveredSource.file.declarations) {
      recoveredDeclarations.set(
        expected.name,
        pinDeclaration(
          ts,
          recoveredSource,
          recoveredText,
          recoveredBytes,
          expected,
        ),
      )
    }
    const rawCaller = findFunction(ts, rawSource, 'RestoreCodeConfirmation')
    const rawHelper = findFunction(ts, rawSource, 'DiffStatsText')
    assert.ok(rawCaller.getText(rawSource).includes('_c(14)'))
    assert.ok(
      rawCaller
        .getText(rawSource)
        .includes('<DiffStatsText diffStats={diffStatsForRestore} />'),
    )
    assert.ok(rawHelper.getText(rawSource).includes('_c(7)'))
    assert.equal(rawHelper.getText(rawSource).includes('added === 0'), false)

    const caller = recoveredDeclarations.get('RestoreCodeConfirmation')
    const helper = recoveredDeclarations.get('DiffStatsText')
    const callerText = caller.getText(recoveredSource)
    const helperText = helper.getText(recoveredSource)
    for (const marker of [
      '_c(15)',
      'diffStatsForRestore.deletions',
      'diffStatsForRestore.insertions',
      '<DiffStatsText added={diffStatsForRestore.insertions} removed={diffStatsForRestore.deletions} />',
      'The code will be restored',
      ' in {fileLabel}.',
    ]) {
      assert.ok(callerText.includes(marker), marker)
    }
    for (const marker of [
      '_c(10)',
      'added === 0 && removed === 0',
      'added > 0 && removed > 0 && " "',
      'color="diffAddedWord" bold={bold}',
      'color="diffRemovedWord" bold={bold}',
    ]) {
      assert.ok(helperText.includes(marker), marker)
    }

    const bundle = fs.readFileSync(
      artifactPath(fixture.inputs.targetBundle, 'CLAUDE_CODE_2_1_118_BUNDLE'),
    )
    const targetCallerText = bundle
      .subarray(fixture.targetUnit.start, fixture.targetUnit.end)
      .toString()
    const targetHelperText = bundle
      .subarray(
        fixture.supportingTargetUnit.start,
        fixture.supportingTargetUnit.end,
      )
      .toString()
    const targetCallerName = parse(targetCallerText, {
      ecmaVersion: 'latest',
    }).body[0].id.name
    const targetHelperName = parse(targetHelperText, {
      ecmaVersion: 'latest',
    }).body[0].id.name

    const react = { Fragment: 'Fragment', createElement: elementFactory }
    const compileSourceFunction = declaration => {
      const emitted = ts.transpileModule(
        declaration.getText(recoveredSource),
        {
          compilerOptions: {
            jsx: ts.JsxEmit.React,
            module: ts.ModuleKind.None,
            target: ts.ScriptTarget.ES2022,
          },
        },
      ).outputText
      return emitted
    }
    const sourceHelper = Function(
      '_c',
      'React',
      'Text',
      `${compileSourceFunction(helper)}; return DiffStatsText`,
    )(cacheRuntime(), react, 'Text')
    const targetHelper = Function(
      'iEK',
      'XXH',
      'k',
      `${targetHelperText}; return ${targetHelperName}`,
    )({ c: cacheRuntime() }, react, 'Text')

    for (const input of [
      { added: 0, removed: 0 },
      { added: 3, removed: 0 },
      { added: 0, removed: 4 },
      { added: 3, removed: 4 },
      { added: 1, removed: 2, bold: true },
    ]) {
      assert.deepEqual(
        normalizeRendered(sourceHelper(input)),
        normalizeRendered(targetHelper(input)),
        JSON.stringify(input),
      )
    }

    const makeSourceCaller = () =>
      Function(
        '_c',
        'React',
        'Text',
        'path',
        'DiffStatsText',
        `${compileSourceFunction(caller)}; return RestoreCodeConfirmation`,
      )(
        cacheRuntime(),
        react,
        'Text',
        path,
        input => sourceHelper(input),
      )
    const makeTargetCaller = () =>
      Function(
        'n48',
        'W6',
        'k',
        'tFH',
        'OU',
        `${targetCallerText}; return ${targetCallerName}`,
      )(
        { c: cacheRuntime() },
        react,
        'Text',
        path,
        input => targetHelper(input),
      )
    for (const diffStatsForRestore of [
      { filesChanged: [], insertions: 0, deletions: 0 },
      { filesChanged: ['/tmp/a.ts'], insertions: 3, deletions: 0 },
      {
        filesChanged: ['/tmp/a.ts', '/tmp/b.ts'],
        insertions: 0,
        deletions: 4,
      },
      {
        filesChanged: ['/tmp/a.ts', '/tmp/b.ts', '/tmp/c.ts'],
        insertions: 3,
        deletions: 4,
      },
    ]) {
      assert.deepEqual(
        normalizeRendered(makeSourceCaller()({ diffStatsForRestore })),
        normalizeRendered(makeTargetCaller()({ diffStatsForRestore })),
        JSON.stringify(diffStatsForRestore),
      )
    }
  },
)

test(
  'restore-code diff coverage evolves only as the complete replay proof',
  { skip: !selected },
  () => {
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
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const exactOwner =
      JSON.stringify(paths) === JSON.stringify([fixture.targetUnit.ownerPath])
    const provisional =
      exactOwner &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      exactOwner &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
      row.behavior === fixture.targetUnit.behavior
    assert.ok(provisional || corrected)
  },
)
