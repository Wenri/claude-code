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
import { applyTarget117CcdSessionRatingTelemetrySourceRecovery } from '../cases/2.1.116-to-2.1.117/recovered/replay-ccd-session-rating-telemetry-source-gap.mjs'
import {
  applyTarget117HeadlessStreamingTestExportSourceRecovery,
  TARGET117_HEADLESS_STREAMING_TEST_EXPORT_OWNER_OVERRIDES,
  TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_FILE,
  TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_POSTIMAGE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-headless-streaming-test-export-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-headless-streaming-test-export-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '0a36d05373c1b5e30b9fae114701030ce6db99078fc569e9056bbdea42977918'
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
  assert.match(sourcePath, /^src\//)
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const sourcePath of [
    fixture.inputs.sourceFile.path,
    'src/services/mcp/vscodeSdkMcp.ts',
  ]) {
    const bytes = execFileSync(
      'git',
      ['show', `${fixture.inputs.rawTargetSourceCommit}:${sourcePath}`],
      { cwd: repositoryRoot },
    )
    const filename = sourceFilename(sourceRoot, sourcePath)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, bytes)
  }
  return { temporaryRoot, sourceRoot }
}

function copyPackagedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  for (const sourcePath of [
    fixture.inputs.sourceFile.path,
    'src/services/mcp/vscodeSdkMcp.ts',
    'src/services/mcp/ccdSessionMcp.ts',
  ]) {
    const source = sourceFilename(sourceRoot, sourcePath)
    if (!fs.existsSync(source)) continue
    const destination = sourceFilename(outputRoot, sourcePath)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
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

function descendants(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function exactStreamingDeclaration(ts, sourceFile, source) {
  const expected = fixture.inputs.sourceFile.streamingDeclaration
  const matches = descendants(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === expected.name,
  )
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
  assert.equal(declaration.getStart(sourceFile), expected.start)
  assert.equal(declaration.end, expected.end)
  const bytes = Buffer.from(
    source.slice(declaration.getStart(sourceFile), declaration.end),
  )
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return declaration
}

function findExportAlias(ts, sourceFile) {
  const matches = []
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      continue
    }
    for (const element of statement.exportClause.elements) {
      if (
        element.name.text ===
        fixture.inputs.sourceFile.exportDeclaration.exported
      ) {
        matches.push({ element, statement })
      }
    }
  }
  return matches
}

function assertExportAlias(ts, sourceRoot, exactRawPostimage = false) {
  const bytes = fs.readFileSync(sourceFilename(sourceRoot))
  if (exactRawPostimage) {
    assert.deepEqual(descriptor(bytes), fixture.inputs.sourceFile.rawPostimage)
  }
  const source = bytes.toString('utf8')
  const sourceFile = parseSource(ts, fixture.inputs.sourceFile.path, source)
  const aliases = findExportAlias(ts, sourceFile)
  assert.equal(aliases.length, 1)
  const { element, statement } = aliases[0]
  assert.equal(element.propertyName?.text, 'runHeadlessStreaming')
  assert.equal(element.name.text, '_runHeadlessStreamingForTesting')
  if (exactRawPostimage) {
    const expected = fixture.inputs.sourceFile.exportDeclaration
    assert.equal(ts.SyntaxKind[statement.kind], expected.nodeType)
    assert.equal(statement.getStart(sourceFile), expected.start)
    assert.equal(statement.end, expected.end)
    const statementBytes = Buffer.from(
      source.slice(statement.getStart(sourceFile), statement.end),
    )
    assert.deepEqual(descriptor(statementBytes), {
      bytes: expected.bytes,
      sha256: expected.sha256,
    })
  }
  return { aliases, bytes, source, sourceFile }
}

function assertTargetUnit(ledger, expected) {
  const [
    index,
    classification,
    nodeType,
    start,
    end,
    tokenCount,
    sourceHash,
    coarseHash,
  ] = expected
  const entry = ledger.unresolvedTarget.find(
    candidate => candidate.target.index === index,
  )
  assert.deepEqual(
    [
      entry.target.index,
      entry.classification,
      entry.target.nodeType,
      entry.target.start,
      entry.target.end,
      entry.target.tokenCount,
      entry.target.sourceHash,
      entry.target.coarseHash,
    ],
    [
      index,
      classification,
      nodeType,
      start,
      end,
      tokenCount,
      sourceHash,
      coarseHash,
    ],
  )
}

test(
  '2.1.117 headless-streaming export fixture pins the raw owner declaration and helper',
  { skip: !selected },
  async () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 1,
      recoveredFiles: 1,
      ownerOverrides: 1,
      behaviorWitnessUnits: 1,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'case-owned helper',
    )
    assert.deepEqual(TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(
      TARGET117_HEADLESS_STREAMING_TEST_EXPORT_RAW_POSTIMAGE,
      {
        path: fixture.inputs.sourceFile.path,
        ...fixture.inputs.sourceFile.rawPostimage,
      },
    )
    assert.deepEqual(
      TARGET117_HEADLESS_STREAMING_TEST_EXPORT_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:20636`,
          targetIndex: 20636,
          paths: ['src/cli/print.ts'],
          declarations: [
            'runHeadlessStreaming',
            '_runHeadlessStreamingForTesting',
          ],
          evidenceIds: fixture.evidenceIds,
          behavior:
            'Target117 adds the _runHeadlessStreamingForTesting export-map property as an exact alias of the existing runHeadlessStreaming declaration; the bounded source replay restores that alias without admitting the separately unsupported streaming function body.',
        },
      ],
    )

    const revision =
      `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`
    assert.equal(
      execFileSync('git', ['rev-parse', revision], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      fixture.inputs.sourceFile.blob,
    )
    const raw = execFileSync('git', ['show', revision], {
      cwd: repositoryRoot,
    })
    assert.deepEqual(descriptor(raw), fixture.inputs.sourceFile.input)
    const source = raw.toString('utf8')
    const ts = await loadTypeScript()
    const sourceFile = parseSource(ts, fixture.inputs.sourceFile.path, source)
    const declaration = exactStreamingDeclaration(ts, sourceFile, source)
    assert.equal(findExportAlias(ts, sourceFile).length, 0)
    const calls = descendants(
      ts,
      sourceFile,
      node =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'runHeadlessStreaming',
    )
    assert.equal(calls.length, 1)
    assert.ok(calls[0].pos < declaration.pos)
    let forOf = calls[0].parent
    while (forOf && !ts.isForOfStatement(forOf)) forOf = forOf.parent
    assert.ok(forOf)
    assert.equal(forOf.awaitModifier.kind, ts.SyntaxKind.AwaitKeyword)
  },
)

test(
  '2.1.117 bundles authenticate the export-map delta and its exact streaming function binding',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath(
        'CLAUDE_CODE_BASELINE_2_1_116_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'authenticated 2.1.116 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath(
        'CLAUDE_CODE_TARGET_2_1_117_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'authenticated 2.1.117 bundle',
    ).toString('utf8')
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
      'structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))

    const [
      baselineIndex,
      ,
      baselineNodeType,
      baselineStart,
      baselineEnd,
      baselineTokens,
      baselineHash,
      baselineCoarseHash,
    ] = fixture.baselineAbsence.baselineExportUnit
    const baselineEntry = ledger.unmatchedBaseline.find(
      entry => entry.index === baselineIndex,
    )
    assert.deepEqual(
      [
        baselineEntry.index,
        baselineEntry.nodeType,
        baselineEntry.start,
        baselineEntry.end,
        baselineEntry.tokenCount,
        baselineEntry.sourceHash,
        baselineEntry.coarseHash,
      ],
      [
        baselineIndex,
        baselineNodeType,
        baselineStart,
        baselineEnd,
        baselineTokens,
        baselineHash,
        baselineCoarseHash,
      ],
    )
    const baselineUnit = Buffer.from(
      baseline.slice(baselineStart, baselineEnd),
    )
    assert.deepEqual(descriptor(baselineUnit), {
      bytes: baselineEnd - baselineStart,
      sha256: baselineHash,
    })
    assert.equal(
      baselineUnit.toString('utf8'),
      fixture.baselineAbsence.exactSource,
    )

    assertTargetUnit(ledger, fixture.row.targetUnit)
    const [, , , start, end, , unitHash] = fixture.row.targetUnit
    const targetUnit = Buffer.from(target.slice(start, end))
    assert.deepEqual(descriptor(targetUnit), {
      bytes: end - start,
      sha256: unitHash,
    })
    assert.equal(targetUnit.toString('utf8'), fixture.row.exactSource)

    const baselineAst = parse(baselineUnit.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const targetAst = parse(targetUnit.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const baselineProperties = baselineAst.body[0].expression.arguments[1].properties
    const targetProperties = targetAst.body[0].expression.arguments[1].properties
    assert.equal(targetProperties.length, baselineProperties.length + 1)
    assert.deepEqual(
      targetProperties.slice(0, -1).map(property => property.key.name),
      baselineProperties.map(property => property.key.name),
    )
    const added = targetProperties.at(-1)
    assert.equal(added.key.name, fixture.row.residue[1])
    assert.equal(added.value.type, 'ArrowFunctionExpression')
    assert.equal(added.value.body.name, fixture.behaviorWitness.minifiedName)
    const [, value, residueStart, residueEnd, occurrence, baselineCount] =
      fixture.row.residue
    assert.equal(baselineCount, 0)
    assert.equal(occurrence, 1)
    assert.equal(target.slice(residueStart, residueEnd), value)
    assert.equal(added.key.start + start, residueStart)
    assert.equal(added.key.end + start, residueEnd)

    assertTargetUnit(ledger, fixture.behaviorWitness.streamingTargetUnit)
    const [, , , functionStart, functionEnd, , functionHash] =
      fixture.behaviorWitness.streamingTargetUnit
    const functionUnit = Buffer.from(target.slice(functionStart, functionEnd))
    assert.deepEqual(descriptor(functionUnit), {
      bytes: functionEnd - functionStart,
      sha256: functionHash,
    })
    const functionAst = parse(functionUnit.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(functionAst.body.length, 1)
    assert.equal(functionAst.body[0].type, 'FunctionDeclaration')
    assert.equal(
      functionAst.body[0].id.name,
      fixture.behaviorWitness.minifiedName,
    )
  },
)

test(
  '2.1.117 headless-streaming export replay is dual-state and composes in either print-replay order',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const raw = materializeRawSource('target117-headless-export-raw-')
    try {
      assert.equal(
        applyTarget117HeadlessStreamingTestExportSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'recovered',
      )
      assert.equal(
        applyTarget117HeadlessStreamingTestExportSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'already-recovered',
      )
      const recovered = assertExportAlias(ts, raw.sourceRoot, true)
      exactStreamingDeclaration(ts, recovered.sourceFile, recovered.source)
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    for (const order of ['ccd-first', 'export-first']) {
      const composed = materializeRawSource(`target117-headless-${order}-`)
      try {
        if (order === 'ccd-first') {
          applyTarget117CcdSessionRatingTelemetrySourceRecovery({
            sourceRoot: composed.sourceRoot,
          })
          applyTarget117HeadlessStreamingTestExportSourceRecovery({
            sourceRoot: composed.sourceRoot,
          })
        } else {
          applyTarget117HeadlessStreamingTestExportSourceRecovery({
            sourceRoot: composed.sourceRoot,
          })
          applyTarget117CcdSessionRatingTelemetrySourceRecovery({
            sourceRoot: composed.sourceRoot,
          })
        }
        assertExportAlias(ts, composed.sourceRoot)
        assert.equal(
          applyTarget117HeadlessStreamingTestExportSourceRecovery({
            sourceRoot: composed.sourceRoot,
          }).status,
          'already-recovered',
        )
        assert.equal(
          applyTarget117CcdSessionRatingTelemetrySourceRecovery({
            sourceRoot: composed.sourceRoot,
          }).status,
          'already-recovered',
        )
      } finally {
        fs.rmSync(composed.temporaryRoot, { recursive: true, force: true })
      }
    }

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    const packaged = copyPackagedSource(
      packagedRoot,
      'target117-headless-export-packaged-',
    )
    try {
      const result = applyTarget117HeadlessStreamingTestExportSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      assertExportAlias(ts, packaged.sourceRoot)
      assert.equal(
        applyTarget117HeadlessStreamingTestExportSourceRecovery({
          sourceRoot: packaged.sourceRoot,
        }).status,
        'already-recovered',
      )
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 headless-streaming export replay rejects wrong aliases, duplicates, and signature mutation',
  { skip: !selected },
  () => {
    const mutations = [
      source =>
        `${source}\nexport { runHeadless as _runHeadlessStreamingForTesting }\n`,
      source =>
        `${source}\nexport { runHeadlessStreaming as _runHeadlessStreamingForTesting }\nexport { runHeadlessStreaming as _runHeadlessStreamingForTesting }\n`,
      source =>
        source.replace(
          'function runHeadlessStreaming(',
          'function runHeadlessStreamingChanged(',
        ),
    ]
    for (const [index, mutate] of mutations.entries()) {
      const candidate = materializeRawSource(
        `target117-headless-export-mutation-${index}-`,
      )
      try {
        const filename = sourceFilename(candidate.sourceRoot)
        const mutated = Buffer.from(mutate(fs.readFileSync(filename, 'utf8')))
        fs.writeFileSync(filename, mutated)
        assert.throws(
          () =>
            applyTarget117HeadlessStreamingTestExportSourceRecovery({
              sourceRoot: candidate.sourceRoot,
            }),
          /refusing non-target headless streaming context/,
        )
        assert.deepEqual(fs.readFileSync(filename), mutated)
      } finally {
        fs.rmSync(candidate.temporaryRoot, { recursive: true, force: true })
      }
    }
  },
)
