import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget117InboundClientPlatformSourceRecovery,
  TARGET117_INBOUND_CLIENT_PLATFORM_OWNER_OVERRIDES,
  TARGET117_INBOUND_CLIENT_PLATFORM_POSTIMAGE,
  TARGET117_INBOUND_CLIENT_PLATFORM_RAW_FILE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-inbound-client-platform-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-inbound-client-platform-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '26a523fa42167a993b8ee44a9e43718466e48f044c96395c0a78a16f7609666b'
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

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const sourcePath = fixture.inputs.rawSource.path
  const bytes = execFileSync(
    'git',
    ['show', `${fixture.inputs.rawSource.commit}:${sourcePath}`],
    { cwd: repositoryRoot },
  )
  const filename = sourceFilename(sourceRoot, sourcePath)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const sourcePath = fixture.inputs.rawSource.path
  const input = sourceFilename(inputRoot, sourcePath)
  const output = sourceFilename(sourceRoot, sourcePath)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.copyFileSync(input, output)
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

function parseTs(ts, filename, bytes) {
  const sourceFile = ts.createSourceFile(
    filename,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function exactFunction(ts, sourceFile, bytes, expected) {
  const [start, end, byteCount, hash] = expected
  const matches = descendants(
    ts,
    sourceFile,
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'extractInboundMessageFields',
  )
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  assert.deepEqual(
    [
      declaration.getStart(sourceFile),
      declaration.end,
      ...Object.values(descriptor(bytes.subarray(start, end))),
    ],
    expected,
  )
  return declaration
}

test('Target117 authenticates the inbound client-platform unit, residues, and bounded owner', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(
    path.join(repositoryRoot, fixture.inputs.helper.path),
    {
      bytes: fixture.inputs.helper.bytes,
      sha256: fixture.inputs.helper.sha256,
    },
  )

  const raw = fixture.inputs.rawSource
  assert.equal(
    execFileSync('git', ['rev-parse', `${raw.commit}^{tree}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    raw.tree,
  )
  assert.equal(
    execFileSync('git', ['rev-parse', `${raw.commit}:${raw.path}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    raw.blob,
  )
  const rawBytes = execFileSync('git', ['show', `${raw.commit}:${raw.path}`], {
    cwd: repositoryRoot,
  })
  assert.deepEqual(descriptor(rawBytes), { bytes: raw.bytes, sha256: raw.sha256 })

  const donor = fixture.inputs.laterDonor
  assert.equal(
    execFileSync('git', ['rev-parse', `${donor.commit}^{tree}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    donor.tree,
  )
  assert.equal(
    execFileSync('git', ['rev-parse', `${donor.commit}:${donor.path}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    donor.blob,
  )
  const donorBytes = execFileSync(
    'git',
    ['show', `${donor.commit}:${donor.path}`],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(donorBytes), {
    bytes: donor.bytes,
    sha256: donor.sha256,
  })

  const baselineInput = fixture.inputs.baselineBundle
  readExact(
    path.join(artifactRoot, baselineInput[0]),
    { bytes: baselineInput[1], sha256: baselineInput[2] },
  )
  const targetInput = fixture.inputs.targetBundles[0]
  const target = readExact(
    path.join(artifactRoot, targetInput[0]),
    { bytes: targetInput[1], sha256: targetInput[2] },
  )
  const ledger = readLedger(fixture.inputs.structuralLedgers[0])
  const expected = fixture.target117.unit
  const region = ledger.regions.find(row => row.target.index === expected[0])
  assert.ok(region)
  assert.deepEqual(regionTuple(region), expected)
  const targetUnit = target.subarray(expected[3], expected[4])
  assert.equal(targetUnit.toString('utf8'), fixture.target117.exactSource)
  assert.deepEqual(descriptor(targetUnit), {
    bytes: expected[4] - expected[3],
    sha256: expected[6],
  })

  const residueTexts = ['"client_platform"', 'client_platform', 'client_platform', 'clientPlatform']
  assert.deepEqual(
    fixture.target117.residues.map((row, index) => [
      ...row,
      target.subarray(row[2], row[3]).toString('utf8'),
      residueTexts[index],
    ]),
    fixture.target117.residues.map((row, index) => [
      ...row,
      residueTexts[index],
      residueTexts[index],
    ]),
  )
  for (const [index, start, hash] of fixture.target117.callWitnesses) {
    const witness = ledger.regions.find(row => row.target.index === index)
    assert.ok(witness, `target witness ${index}`)
    assert.ok(witness.target.start <= start && start < witness.target.end)
    assert.equal(witness.target.sourceHash, hash)
    assert.equal(target.subarray(start, start + 4).toString('utf8'), 'iK8(')
  }

  assert.deepEqual(
    TARGET117_INBOUND_CLIENT_PLATFORM_OWNER_OVERRIDES.map(row => [
      row.key,
      row.targetIndex,
      row.paths,
      row.declarations,
      row.evidenceIds,
    ]),
    [[
      `${caseName}:18561`,
      18561,
      [raw.path],
      ['extractInboundMessageFields'],
      fixture.evidenceIds,
    ]],
  )
  assert.equal(
    TARGET117_INBOUND_CLIENT_PLATFORM_OWNER_OVERRIDES.some(
      row => row.targetIndex === 20646,
    ),
    false,
  )
})

test('Target117 inbound client-platform unit has exact structural lineage through Target121', { skip: !selected }, () => {
  for (let transition = 0; transition < fixture.lineage.length; transition++) {
    const [baselineIndex, targetIndex, targetHash] = fixture.lineage[transition]
    const ledger = readLedger(fixture.inputs.structuralLedgers[transition + 1])
    const bundleInput = fixture.inputs.targetBundles[transition + 1]
    const bundle = readExact(
      path.join(artifactRoot, bundleInput[0]),
      { bytes: bundleInput[1], sha256: bundleInput[2] },
    )
    const region = ledger.regions.find(
      row =>
        row.baselineUnitIndex === baselineIndex &&
        row.target.index === targetIndex,
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
})

test('later donor is the exact bounded source postimage with guarded extraction semantics', { skip: !selected }, async () => {
  const ts = await loadTypeScript()
  const raw = fixture.inputs.rawSource
  const donor = fixture.inputs.laterDonor
  const rawBytes = execFileSync('git', ['show', `${raw.commit}:${raw.path}`], {
    cwd: repositoryRoot,
  })
  const postBytes = execFileSync('git', ['show', `${donor.commit}:${donor.path}`], {
    cwd: repositoryRoot,
  })
  const rawAst = parseTs(ts, raw.path, rawBytes)
  const postAst = parseTs(ts, donor.path, postBytes)
  exactFunction(ts, rawAst, rawBytes, raw.declaration)
  const declaration = exactFunction(ts, postAst, postBytes, donor.declaration)
  const declarationText = declaration.getText(postAst)

  const returnTypeText = declaration.type.getText(postAst)
  assert.equal((returnTypeText.match(/clientPlatform/g) ?? []).length, 1)
  assert.match(returnTypeText, /clientPlatform:\s*string\s*\|\s*undefined/)
  const clientBindings = descendants(
    ts,
    declaration,
    node =>
      ts.isVariableDeclaration(node) && node.name.getText(postAst) === 'clientPlatform',
  )
  assert.equal(clientBindings.length, 1)
  const initializer = clientBindings[0].initializer
  assert.ok(ts.isConditionalExpression(initializer))
  assert.equal(
    initializer.condition.getText(postAst),
    "'client_platform' in msg && typeof msg.client_platform === 'string'",
  )
  assert.equal(initializer.whenTrue.getText(postAst), 'msg.client_platform')
  assert.equal(initializer.whenFalse.getText(postAst), 'undefined')
  const returns = descendants(ts, declaration, node => ts.isReturnStatement(node))
  const objectReturn = returns.find(node => ts.isObjectLiteralExpression(node.expression))
  assert.ok(objectReturn)
  assert.deepEqual(
    objectReturn.expression.properties.map(property => property.name.getText(postAst)),
    ['content', 'uuid', 'clientPlatform'],
  )

  const transpiled = ts.transpileModule(
    declarationText.replace(/^export\s+/, ''),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: donor.path,
      reportDiagnostics: true,
    },
  )
  assert.equal(transpiled.diagnostics.length, 0)
  const extract = new Function(
    'normalizeImageBlocks',
    `${transpiled.outputText}; return extractInboundMessageFields`,
  )(blocks => blocks)
  assert.equal(extract({ type: 'assistant', message: { content: 'x' } }), undefined)
  assert.equal(extract({ type: 'user' }), undefined)
  assert.equal(extract({ type: 'user', message: { content: [] } }), undefined)
  assert.deepEqual(
    extract({
      type: 'user',
      message: { content: 'hello' },
      uuid: 'u',
      client_platform: 'ios',
    }),
    { content: 'hello', uuid: 'u', clientPlatform: 'ios' },
  )
  assert.deepEqual(
    extract({
      type: 'user',
      message: { content: 'hello' },
      uuid: 3,
      client_platform: false,
    }),
    { content: 'hello', uuid: undefined, clientPlatform: undefined },
  )
})

test('inbound client-platform replay is raw/package dual-state, idempotent, and fail-closed', { skip: !selected }, () => {
  assert.deepEqual(TARGET117_INBOUND_CLIENT_PLATFORM_RAW_FILE, {
    path: fixture.inputs.rawSource.path,
    bytes: fixture.inputs.rawSource.bytes,
    sha256: fixture.inputs.rawSource.sha256,
  })
  assert.deepEqual(TARGET117_INBOUND_CLIENT_PLATFORM_POSTIMAGE, {
    path: fixture.inputs.laterDonor.path,
    bytes: fixture.inputs.laterDonor.bytes,
    sha256: fixture.inputs.laterDonor.sha256,
  })

  const raw = materializeRawSource('target117-inbound-platform-raw-')
  try {
    const first = applyTarget117InboundClientPlatformSourceRecovery({
      sourceRoot: raw.sourceRoot,
    })
    assert.equal(first.status, 'recovered')
    assert.equal(first.ownerOverrides, 1)
    readExact(
      sourceFilename(raw.sourceRoot, fixture.inputs.rawSource.path),
      {
        bytes: fixture.inputs.laterDonor.bytes,
        sha256: fixture.inputs.laterDonor.sha256,
      },
    )
    assert.equal(
      applyTarget117InboundClientPlatformSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
  }

  let packageSeed
  const selectedSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
    : (() => {
        packageSeed = materializeRawSource('target117-inbound-platform-package-seed-')
        applyTarget117InboundClientPlatformSourceRecovery({
          sourceRoot: packageSeed.sourceRoot,
        })
        return packageSeed.sourceRoot
      })()
  const packaged = copySelectedSource(
    selectedSourceRoot,
    'target117-inbound-platform-package-',
  )
  try {
    const first = applyTarget117InboundClientPlatformSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(first.status))
    assert.equal(
      applyTarget117InboundClientPlatformSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    if (packageSeed) {
      fs.rmSync(packageSeed.temporaryRoot, { recursive: true, force: true })
    }
  }

  const drift = materializeRawSource('target117-inbound-platform-drift-')
  try {
    const filename = sourceFilename(drift.sourceRoot, fixture.inputs.rawSource.path)
    fs.appendFileSync(filename, '\n// drift\n')
    assert.throws(
      () => applyTarget117InboundClientPlatformSourceRecovery({
        sourceRoot: drift.sourceRoot,
      }),
      /refusing mixed or non-Target117 state/,
    )
  } finally {
    fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
  }

  const mixed = materializeRawSource('target117-inbound-platform-mixed-')
  try {
    const filename = sourceFilename(mixed.sourceRoot, fixture.inputs.rawSource.path)
    const source = fs.readFileSync(filename, 'utf8').replace(
      '    uuid,\n',
      '    uuid,\n    clientPlatform,\n',
    )
    fs.writeFileSync(filename, source)
    assert.throws(
      () => applyTarget117InboundClientPlatformSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      }),
      /refusing mixed or non-Target117 state/,
    )
  } finally {
    fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
  }
})
