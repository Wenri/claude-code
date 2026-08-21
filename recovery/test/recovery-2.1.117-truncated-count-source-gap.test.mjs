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
  applyTarget117TruncatedCountSourceRecovery,
  TARGET117_TRUNCATED_COUNT_CALLER_POSTIMAGE,
  TARGET117_TRUNCATED_COUNT_CONTEXT_FILES,
  TARGET117_TRUNCATED_COUNT_OWNER_OVERRIDES,
  TARGET117_TRUNCATED_COUNT_RAW_CALLER_FILE,
  TARGET117_TRUNCATED_COUNT_RECOVERED_FILE,
  TARGET117_TRUNCATED_COUNT_SOURCE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-truncated-count-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-truncated-count-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f88e0ca2729d0d9d66ec687fb41631458d52fff579c6c6fbccee67884af2c553'
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

function tupleDescriptor(tuple) {
  return { bytes: tuple[0], sha256: tuple[1] }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, label)
  return bytes
}

function sourceFilename(sourceRoot, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function readLedger(input) {
  const bytes = readExact(
    path.join(repositoryRoot, input[0]),
    { bytes: input[1], sha256: input[2] },
    input[0],
  )
  return JSON.parse(gunzipSync(bytes))
}

function regionTuple(region) {
  const target = region.target
  return [
    target.index,
    region.classification,
    target.nodeType,
    target.start,
    target.end,
    target.tokenCount,
    target.sourceHash,
    target.coarseHash,
  ]
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const sourcePaths = [
    ...fixture.inputs.contextFiles.map(input => input[0]),
    fixture.inputs.callerFile.path,
  ]
  for (const sourcePath of sourcePaths) {
    const bytes = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawTargetSource.commit}:${sourcePath}`,
      ],
      { cwd: repositoryRoot },
    )
    const filename = sourceFilename(sourceRoot, sourcePath)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, bytes)
  }
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const sourcePaths = [
    ...fixture.inputs.contextFiles.map(input => input[0]),
    fixture.inputs.callerFile.path,
    fixture.inputs.recoveredFile.path,
  ]
  for (const sourcePath of sourcePaths) {
    const input = sourceFilename(inputRoot, sourcePath)
    if (!fs.existsSync(input)) continue
    const output = sourceFilename(sourceRoot, sourcePath)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(input, output)
  }
  return { temporaryRoot, sourceRoot }
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
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

function parseTsx(ts, filename, bytes) {
  const sourceFile = ts.createSourceFile(
    filename,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function exactFunction(ts, sourceFile, bytes, expected) {
  const [name, start, end, byteCount, hash] = expected
  const matches = descendants(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.equal(matches.length, 1, name)
  const declaration = matches[0]
  assert.deepEqual(
    [
      declaration.name.text,
      declaration.getStart(sourceFile),
      declaration.end,
      ...Object.values(descriptor(bytes.subarray(start, end))),
    ],
    expected,
    name,
  )
  return declaration
}

test('Target117 authenticates the complete truncated-count module and its caller', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  const helper = fixture.inputs.helper
  readExact(
    path.join(repositoryRoot, helper.path),
    { bytes: helper.bytes, sha256: helper.sha256 },
  )
  assert.equal(
    execFileSync('git', ['rev-parse', `${fixture.inputs.rawTargetSource.commit}^{tree}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    fixture.inputs.rawTargetSource.tree,
  )

  for (const [sourcePath, blob, bytes, hash] of fixture.inputs.contextFiles) {
    assert.equal(
      execFileSync('git', ['rev-parse', `${fixture.inputs.rawTargetSource.commit}:${sourcePath}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      blob,
    )
    const source = execFileSync(
      'git',
      ['show', `${fixture.inputs.rawTargetSource.commit}:${sourcePath}`],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(source), { bytes, sha256: hash })
  }

  const caller = fixture.inputs.callerFile
  assert.equal(
    execFileSync('git', ['rev-parse', `${fixture.inputs.rawTargetSource.commit}:${caller.path}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    caller.blob,
  )
  const rawCaller = execFileSync(
    'git',
    ['show', `${fixture.inputs.rawTargetSource.commit}:${caller.path}`],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(rawCaller), tupleDescriptor(caller.input))

  const baseline = readExact(
    path.join(artifactRoot, fixture.inputs.baselineBundle.artifact),
    {
      bytes: fixture.inputs.baselineBundle.bytes,
      sha256: fixture.inputs.baselineBundle.sha256,
    },
  )
  const targetInput = fixture.inputs.targetBundles[0]
  const target = readExact(
    path.join(artifactRoot, targetInput[0]),
    { bytes: targetInput[1], sha256: targetInput[2] },
  )
  const ledger = readLedger(fixture.inputs.structuralLedgers[0])

  for (const expected of fixture.target117.units) {
    const region = ledger.regions.find(row => row.target.index === expected[0])
    assert.ok(region, `target unit ${expected[0]}`)
    assert.deepEqual(regionTuple(region), expected)
    const unit = target.subarray(expected[3], expected[4])
    assert.equal(unit.length, expected[4] - expected[3])
    assert.equal(sha256(unit), expected[6])
  }

  const [start, end, bytes, hash] = fixture.target117.moduleRange
  const moduleBytes = target.subarray(start, end)
  assert.deepEqual(descriptor(moduleBytes), { bytes, sha256: hash })
  const moduleSource = moduleBytes.toString('utf8')
  assert.equal(countOccurrences(moduleSource, 'function DX('), 1)
  assert.equal(countOccurrences(moduleSource, 'function dc8('), 1)
  assert.equal(countOccurrences(moduleSource, '{count:q,unit:K,expandable:_}=H'), 1)
  assert.equal(countOccurrences(moduleSource, 'if(q<=0)return null'), 1)
  assert.equal(countOccurrences(moduleSource, 'createElement(iM,null)'), 1)
  assert.equal(countOccurrences(moduleSource, 'function dc8(H,$="line")'), 1)
  assert.equal(countOccurrences(moduleSource, 'if(H<=0)return""'), 1)
  assert.equal(countOccurrences(moduleSource, '\\u2026 +${H} ${A6(H,$)}'), 1)

  const formatterSource = target
    .subarray(fixture.target117.units[1][3], fixture.target117.units[1][4])
    .toString('utf8')
  const targetFormatter = new Function(
    'A6',
    `${formatterSource}; return dc8`,
  )((count, singular, plural = `${singular}s`) =>
    count === 1 ? singular : plural,
  )
  assert.equal(targetFormatter(0), '')
  assert.equal(targetFormatter(1), '… +1 line')
  assert.equal(targetFormatter(2), '… +2 lines')
  assert.equal(targetFormatter(3, 'file'), '… +3 files')

  const residue = fixture.target117.residue
  assert.equal(target.subarray(residue[2], residue[3]).toString(), residue[1])
  assert.equal(countOccurrences(baseline.toString('utf8'), residue[1]), 1)
  assert.equal(countOccurrences(target.toString('utf8'), residue[1]), 6)

  const callerUnit = fixture.target117.units.find(
    unit => unit[0] === fixture.target117.caller.unitIndex,
  )
  const callerSource = target.subarray(callerUnit[3], callerUnit[4]).toString()
  const localOffset = fixture.target117.caller.symbolOffset - callerUnit[3]
  assert.equal(callerSource.slice(localOffset, localOffset + 2), 'DX')
  assert.equal(
    countOccurrences(callerSource, fixture.target117.caller.call),
    1,
  )

  assert.deepEqual(
    TARGET117_TRUNCATED_COUNT_OWNER_OVERRIDES.map(row => row.targetIndex),
    [8615, 8616, 12828],
  )
})

test('Target117 truncated-count behavior has exact structural lineage through Target121', { skip: !selected }, () => {
  const lineageGroups = [fixture.lineage.component, fixture.lineage.formatter]
  for (let transition = 0; transition < 4; transition++) {
    const ledger = readLedger(fixture.inputs.structuralLedgers[transition + 1])
    const bundleInput = fixture.inputs.targetBundles[transition + 1]
    const bundle = readExact(
      path.join(artifactRoot, bundleInput[0]),
      { bytes: bundleInput[1], sha256: bundleInput[2] },
    )
    for (const lineage of lineageGroups) {
      const [baselineIndex, targetIndex, targetHash] = lineage[transition]
      const region = ledger.regions.find(
        row => row.baselineUnitIndex === baselineIndex && row.target.index === targetIndex,
      )
      assert.ok(region, `${baselineIndex}->${targetIndex}`)
      assert.equal(region.classification, 'matched')
      assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
      assert.equal(region.target.sourceHash, targetHash)
      assert.equal(
        sha256(bundle.subarray(region.target.start, region.target.end)),
        targetHash,
      )
    }
  }
})

test('recovered source preserves the target formatter, render guard, and bounded caller graph', { skip: !selected }, async () => {
  const ts = await loadTypeScript()
  const recoveredBytes = Buffer.from(TARGET117_TRUNCATED_COUNT_SOURCE)
  assert.deepEqual(descriptor(recoveredBytes), {
    bytes: fixture.inputs.recoveredFile.bytes,
    sha256: fixture.inputs.recoveredFile.sha256,
  })
  assert.deepEqual(
    TARGET117_TRUNCATED_COUNT_RECOVERED_FILE,
    {
      path: fixture.inputs.recoveredFile.path,
      bytes: fixture.inputs.recoveredFile.bytes,
      sha256: fixture.inputs.recoveredFile.sha256,
    },
  )

  const sourceFile = parseTsx(
    ts,
    fixture.inputs.recoveredFile.path,
    recoveredBytes,
  )
  const declarations = new Map()
  for (const expected of fixture.inputs.recoveredFile.declarations) {
    declarations.set(
      expected[0],
      exactFunction(ts, sourceFile, recoveredBytes, expected),
    )
  }
  const imports = new Map(
    sourceFile.statements
      .filter(statement => ts.isImportDeclaration(statement))
      .map(statement => [statement.moduleSpecifier.text, statement]),
  )
  assert.deepEqual([...imports.keys()], [
    'react',
    '../ink.js',
    '../utils/stringUtils.js',
    './CtrlOToExpand.js',
  ])

  const component = declarations.get('TruncatedCount')
  assert.equal(component.parameters.length, 1)
  const bindings = component.parameters[0].name.elements.map(element => [
    element.name.text,
    element.initializer?.getText(sourceFile) ?? null,
  ])
  assert.deepEqual(bindings, [
    ['count', null],
    ['unit', "'line'"],
    ['expandable', 'false'],
  ])
  const componentText = component.getText(sourceFile)
  assert.equal(countOccurrences(componentText, 'if (count <= 0) return null'), 1)
  assert.equal(countOccurrences(componentText, 'formatTruncatedCount(count, unit)'), 1)
  assert.equal(countOccurrences(componentText, '<Text dimColor={true}>'), 1)
  assert.equal(countOccurrences(componentText, '<CtrlOToExpand />'), 1)
  assert.equal(countOccurrences(componentText, 'expandable &&'), 1)

  const transpiled = ts.transpileModule(TARGET117_TRUNCATED_COUNT_SOURCE, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: fixture.inputs.recoveredFile.path,
    reportDiagnostics: true,
  })
  assert.equal(transpiled.diagnostics.length, 0)
  const transpiledAst = parse(transpiled.outputText, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const formatter = transpiledAst.body.find(
    node => node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration' &&
      node.declaration.id.name === 'formatTruncatedCount',
  ).declaration
  const formatterText = transpiled.outputText.slice(formatter.start, formatter.end)
  const sourceFormatter = new Function(
    'plural',
    `${formatterText}; return formatTruncatedCount`,
  )((count, singular, plural = `${singular}s`) =>
    count === 1 ? singular : plural,
  )
  assert.equal(sourceFormatter(-1), '')
  assert.equal(sourceFormatter(1), '… +1 line')
  assert.equal(sourceFormatter(2), '… +2 lines')
  assert.equal(sourceFormatter(4, 'tool use'), '… +4 tool uses')

  const { temporaryRoot, sourceRoot } = materializeRawSource(
    'target117-truncated-count-ast-',
  )
  try {
    assert.equal(
      applyTarget117TruncatedCountSourceRecovery({ sourceRoot }).status,
      'recovered',
    )
    const callerBytes = readExact(
      sourceFilename(sourceRoot, fixture.inputs.callerFile.path),
      tupleDescriptor(fixture.inputs.callerFile.output),
    )
    const callerAst = parseTsx(
      ts,
      fixture.inputs.callerFile.path,
      callerBytes,
    )
    const callerDeclaration = exactFunction(
      ts,
      callerAst,
      callerBytes,
      [
        'FileEditToolUseRejectedMessage',
        ...fixture.inputs.callerFile.outputDeclaration,
      ],
    )
    const callerText = callerDeclaration.getText(callerAst)
    assert.equal(countOccurrences(callerText, '<TruncatedCount count={plusLines} />'), 1)
    assert.equal(countOccurrences(callerText, 'plusLines > 0'), 0)
    assert.equal(
      callerAst.statements.filter(
        statement => ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text === './TruncatedCount.js',
      ).length,
      1,
    )
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('truncated-count replay is raw/package dual-state, idempotent, and fail-closed', { skip: !selected }, () => {
  assert.deepEqual(TARGET117_TRUNCATED_COUNT_CONTEXT_FILES, fixture.inputs.contextFiles.map(
    ([sourcePath, , bytes, hash]) => ({ path: sourcePath, bytes, sha256: hash }),
  ))
  assert.deepEqual(TARGET117_TRUNCATED_COUNT_RAW_CALLER_FILE, {
    path: fixture.inputs.callerFile.path,
    ...tupleDescriptor(fixture.inputs.callerFile.input),
  })
  assert.deepEqual(TARGET117_TRUNCATED_COUNT_CALLER_POSTIMAGE, {
    path: fixture.inputs.callerFile.path,
    ...tupleDescriptor(fixture.inputs.callerFile.output),
  })

  const raw = materializeRawSource('target117-truncated-count-raw-')
  try {
    const first = applyTarget117TruncatedCountSourceRecovery({
      sourceRoot: raw.sourceRoot,
    })
    assert.equal(first.status, 'recovered')
    assert.equal(first.ownerOverrides, 3)
    readExact(
      sourceFilename(raw.sourceRoot, fixture.inputs.callerFile.path),
      tupleDescriptor(fixture.inputs.callerFile.output),
    )
    readExact(
      sourceFilename(raw.sourceRoot, fixture.inputs.recoveredFile.path),
      {
        bytes: fixture.inputs.recoveredFile.bytes,
        sha256: fixture.inputs.recoveredFile.sha256,
      },
    )
    const second = applyTarget117TruncatedCountSourceRecovery({
      sourceRoot: raw.sourceRoot,
    })
    assert.equal(second.status, 'already-recovered')
  } finally {
    fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
  }

  let packageSeed
  const selectedSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
    : (() => {
        packageSeed = materializeRawSource(
          'target117-truncated-count-package-seed-',
        )
        applyTarget117TruncatedCountSourceRecovery({
          sourceRoot: packageSeed.sourceRoot,
        })
        return packageSeed.sourceRoot
      })()
  const packaged = copySelectedSource(
    selectedSourceRoot,
    'target117-truncated-count-package-',
  )
  try {
    const first = applyTarget117TruncatedCountSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(first.status))
    const second = applyTarget117TruncatedCountSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.equal(second.status, 'already-recovered')
  } finally {
    fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    if (packageSeed) {
      fs.rmSync(packageSeed.temporaryRoot, { recursive: true, force: true })
    }
  }

  const badContext = materializeRawSource('target117-truncated-count-bad-context-')
  try {
    fs.appendFileSync(
      sourceFilename(badContext.sourceRoot, fixture.inputs.contextFiles[0][0]),
      '\n// drift\n',
    )
    assert.throws(
      () => applyTarget117TruncatedCountSourceRecovery({
        sourceRoot: badContext.sourceRoot,
      }),
      /refusing non-Target117 context/,
    )
  } finally {
    fs.rmSync(badContext.temporaryRoot, { recursive: true, force: true })
  }

  const badModule = materializeRawSource('target117-truncated-count-bad-module-')
  try {
    const filename = sourceFilename(
      badModule.sourceRoot,
      fixture.inputs.recoveredFile.path,
    )
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, `${TARGET117_TRUNCATED_COUNT_SOURCE}// drift\n`)
    assert.throws(
      () => applyTarget117TruncatedCountSourceRecovery({
        sourceRoot: badModule.sourceRoot,
      }),
      /expected absent or recovered/,
    )
  } finally {
    fs.rmSync(badModule.temporaryRoot, { recursive: true, force: true })
  }

  const mixed = materializeRawSource('target117-truncated-count-mixed-')
  try {
    applyTarget117TruncatedCountSourceRecovery({ sourceRoot: mixed.sourceRoot })
    const rawCaller = execFileSync(
      'git',
      ['show', `${fixture.inputs.rawTargetSource.commit}:${fixture.inputs.callerFile.path}`],
      { cwd: repositoryRoot },
    )
    fs.writeFileSync(
      sourceFilename(mixed.sourceRoot, fixture.inputs.callerFile.path),
      rawCaller,
    )
    assert.throws(
      () => applyTarget117TruncatedCountSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      }),
      /Refusing mixed truncated-count recovery/,
    )
  } finally {
    fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
  }
})
