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
  applyTarget117FallbackTruncatedCountSourceRecovery,
  TARGET117_FALLBACK_TRUNCATED_COUNT_CONTEXT_FILE,
  TARGET117_FALLBACK_TRUNCATED_COUNT_OWNER_OVERRIDES,
  TARGET117_FALLBACK_TRUNCATED_COUNT_POSTIMAGE,
  TARGET117_FALLBACK_TRUNCATED_COUNT_RAW_FILE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-fallback-truncated-count-source-gap.mjs'
import {
  TARGET117_TRUNCATED_COUNT_SOURCE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-truncated-count-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-fallback-truncated-count-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '7cb72d11b156f28c16585346227ad4a18e5269a1f54ca7e0ea2d372d9d28f4fc'
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

function tupleDescriptor(tuple) {
  return { bytes: tuple[1], sha256: tuple[2] }
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

function sourceFilename(sourceRoot, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const raw = fixture.inputs.rawSource
  const filename = sourceFilename(sourceRoot, raw.path)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(
    filename,
    execFileSync('git', ['show', `${raw.commit}:${raw.path}`], {
      cwd: repositoryRoot,
    }),
  )
  const context = fixture.inputs.truncatedCount
  const contextFilename = sourceFilename(sourceRoot, context.path)
  fs.mkdirSync(path.dirname(contextFilename), { recursive: true })
  fs.writeFileSync(contextFilename, TARGET117_TRUNCATED_COUNT_SOURCE)
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of [fixture.inputs.rawSource, fixture.inputs.truncatedCount]) {
    const output = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(sourceFilename(inputRoot, input.path), output)
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
  const functions = descendants(
    ts,
    sourceFile,
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'FallbackToolUseErrorMessage',
  )
  assert.equal(functions.length, 1)
  const declaration = functions[0]
  const [start, end] = expected
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

function walkAcorn(root, visitor, parent = null) {
  if (!root || typeof root !== 'object') return
  if (typeof root.type === 'string') visitor(root, parent)
  for (const [key, value] of Object.entries(root)) {
    if (key === 'start' || key === 'end') continue
    if (Array.isArray(value)) {
      for (const child of value) walkAcorn(child, visitor, root)
    } else if (value && typeof value === 'object' && value.type) {
      walkAcorn(value, visitor, root)
    }
  }
}

function assertContiguousSlots(indices, size) {
  assert.deepEqual(
    [...new Set(indices)].sort((left, right) => left - right),
    Array.from({ length: size }, (_, index) => index),
  )
}

test('Target117 authenticates fallback delegation and its complete compiler-cache unit', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(
    path.join(repositoryRoot, fixture.inputs.helper.path),
    { bytes: fixture.inputs.helper.bytes, sha256: fixture.inputs.helper.sha256 },
  )
  const baseline = readExact(
    path.join(artifactRoot, fixture.inputs.baselineBundle[0]),
    tupleDescriptor(fixture.inputs.baselineBundle),
  )
  const target = readExact(
    path.join(artifactRoot, fixture.inputs.targetBundle[0]),
    tupleDescriptor(fixture.inputs.targetBundle),
  )
  const ledgerBytes = readExact(
    path.join(repositoryRoot, fixture.inputs.structuralLedger[0]),
    tupleDescriptor(fixture.inputs.structuralLedger),
  )
  const ledger = JSON.parse(gunzipSync(ledgerBytes))
  const region = ledger.regions.find(
    row => row.target.index === fixture.target117.unit[0],
  )
  assert.ok(region)
  assert.deepEqual(regionTuple(region), fixture.target117.unit)
  const unitBytes = target.subarray(region.target.start, region.target.end)
  assert.equal(sha256(unitBytes), region.target.sourceHash)

  const [callStart, callEnd, callBytes, callHash] =
    fixture.target117.truncatedCountCall
  const call = target.subarray(callStart, callEnd)
  assert.deepEqual(descriptor(call), { bytes: callBytes, sha256: callHash })
  const residue = fixture.target117.residue
  assert.equal(
    target.subarray(residue[2], residue[3]).toString('utf8'),
    residue[1],
  )
  assert.equal(
    baseline.toString('utf8').includes(call.toString('utf8')),
    false,
  )

  const unitSource = unitBytes.toString('utf8')
  const ast = parse(unitSource, { ecmaVersion: 'latest' })
  let delegate
  let delegateParent
  const slots = []
  walkAcorn(ast, (node, parent) => {
    if (
      node.type === 'MemberExpression' &&
      node.computed &&
      node.object.type === 'Identifier' &&
      node.object.name === '$' &&
      node.property.type === 'Literal' &&
      Number.isInteger(node.property.value)
    ) {
      slots.push(node.property.value)
    }
    if (
      node.type === 'CallExpression' &&
      node.arguments[0]?.type === 'Identifier' &&
      node.arguments[0].name === 'DX' &&
      node.arguments[1]?.type === 'ObjectExpression' &&
      node.arguments[1].properties.some(
        property => property.key.name === 'expandable',
      )
    ) {
      delegate = node
      delegateParent = parent
    }
  })
  assert.ok(delegate)
  const props = Object.fromEntries(
    delegate.arguments[1].properties.map(property => [property.key.name, property.value]),
  )
  assert.equal(props.count.name, 'z')
  assert.equal(props.expandable.type, 'UnaryExpression')
  assert.equal(props.expandable.operator, '!')
  assert.equal(props.expandable.argument.value, 0)
  assert.equal(delegateParent.type, 'LogicalExpression')
  assert.equal(delegateParent.operator, '&&')
  assert.equal(delegateParent.left.operator, '!')
  assert.equal(delegateParent.left.argument.name, 'K')
  assertContiguousSlots(slots, 24)

  assert.deepEqual(
    TARGET117_FALLBACK_TRUNCATED_COUNT_OWNER_OVERRIDES.map(row => [
      row.key,
      row.targetIndex,
      row.paths,
      row.declarations,
      row.evidenceIds,
    ]),
    [[
      `${caseName}:12023`,
      12023,
      [fixture.inputs.rawSource.path, fixture.inputs.truncatedCount.path],
      ['FallbackToolUseErrorMessage', 'TruncatedCount'],
      fixture.evidenceIds,
    ]],
  )
})

test('recovered fallback source exactly delegates non-verbose omitted lines with a closed 24-slot cache', { skip: !selected }, async () => {
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

  const replay = materializeRawSource('target117-fallback-count-ast-')
  try {
    assert.equal(
      applyTarget117FallbackTruncatedCountSourceRecovery({
        sourceRoot: replay.sourceRoot,
      }).status,
      'recovered',
    )
    const post = fixture.inputs.postimage
    const postBytes = readExact(
      sourceFilename(replay.sourceRoot, post.path),
      { bytes: post.bytes, sha256: post.sha256 },
    )
    const ts = await loadTypeScript()
    const sourceFile = parseTsx(ts, post.path, postBytes)
    const declaration = exactFunction(
      ts,
      sourceFile,
      postBytes,
      post.declaration,
    )
    const imports = sourceFile.statements.filter(statement =>
      ts.isImportDeclaration(statement),
    )
    assert.equal(
      imports.some(statement =>
        statement.moduleSpecifier.text === '../keybindings/useShortcutDisplay.js'),
      false,
    )
    assert.equal(
      imports.filter(statement =>
        statement.moduleSpecifier.text === './TruncatedCount.js').length,
      1,
    )
    const delegates = descendants(
      ts,
      declaration,
      node =>
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(sourceFile) === 'TruncatedCount',
    )
    assert.equal(delegates.length, 1)
    const delegate = delegates[0]
    assert.deepEqual(
      [
        delegate.getStart(sourceFile),
        delegate.end,
        ...Object.values(
          descriptor(
            postBytes.subarray(delegate.getStart(sourceFile), delegate.end),
          ),
        ),
      ],
      post.jsx,
    )
    assert.deepEqual(
      delegate.attributes.properties.map(attribute => [
        attribute.name.getText(sourceFile),
        attribute.initializer.expression.getText(sourceFile),
      ]),
      [['count', 'plusLines'], ['expandable', 'true']],
    )
    const guard = delegate.parent
    assert.ok(ts.isBinaryExpression(guard))
    assert.equal(guard.operatorToken.kind, ts.SyntaxKind.AmpersandAmpersandToken)
    assert.equal(guard.left.getText(sourceFile), '!verbose')

    const cacheCalls = descendants(
      ts,
      declaration,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(sourceFile) === '_c',
    )
    assert.equal(cacheCalls.length, 1)
    assert.equal(cacheCalls[0].arguments[0].text, '24')
    const slots = descendants(
      ts,
      declaration,
      node =>
        ts.isElementAccessExpression(node) &&
        node.expression.getText(sourceFile) === '$' &&
        ts.isNumericLiteral(node.argumentExpression),
    ).map(node => Number(node.argumentExpression.text))
    assertContiguousSlots(slots, 24)
    assert.equal(declaration.getText(sourceFile).includes('transcriptShortcut'), false)
  } finally {
    fs.rmSync(replay.temporaryRoot, { recursive: true, force: true })
  }
})

test('fallback truncated-count replay is ordered, raw/package dual-state, idempotent, and fail-closed', { skip: !selected }, () => {
  assert.deepEqual(
    TARGET117_FALLBACK_TRUNCATED_COUNT_RAW_FILE,
    {
      path: fixture.inputs.rawSource.path,
      bytes: fixture.inputs.rawSource.bytes,
      sha256: fixture.inputs.rawSource.sha256,
    },
  )
  assert.deepEqual(
    TARGET117_FALLBACK_TRUNCATED_COUNT_POSTIMAGE,
    {
      path: fixture.inputs.postimage.path,
      bytes: fixture.inputs.postimage.bytes,
      sha256: fixture.inputs.postimage.sha256,
    },
  )
  assert.deepEqual(
    TARGET117_FALLBACK_TRUNCATED_COUNT_CONTEXT_FILE,
    fixture.inputs.truncatedCount,
  )

  const raw = materializeRawSource('target117-fallback-count-raw-')
  try {
    assert.equal(
      applyTarget117FallbackTruncatedCountSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117FallbackTruncatedCountSourceRecovery({
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
        packageSeed = materializeRawSource('target117-fallback-count-seed-')
        assert.equal(
          applyTarget117FallbackTruncatedCountSourceRecovery({
            sourceRoot: packageSeed.sourceRoot,
          }).status,
          'recovered',
        )
        return packageSeed.sourceRoot
      })()
  const packaged = copySelectedSource(
    selectedSourceRoot,
    'target117-fallback-count-package-',
  )
  try {
    const first = applyTarget117FallbackTruncatedCountSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(first.status))
    assert.equal(
      applyTarget117FallbackTruncatedCountSourceRecovery({
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

  const missingContext = materializeRawSource('target117-fallback-count-no-context-')
  try {
    fs.rmSync(
      sourceFilename(missingContext.sourceRoot, fixture.inputs.truncatedCount.path),
    )
    assert.throws(
      () => applyTarget117FallbackTruncatedCountSourceRecovery({
        sourceRoot: missingContext.sourceRoot,
      }),
      /required Target117 context is absent/,
    )
  } finally {
    fs.rmSync(missingContext.temporaryRoot, { recursive: true, force: true })
  }

  const drift = materializeRawSource('target117-fallback-count-drift-')
  try {
    fs.appendFileSync(
      sourceFilename(drift.sourceRoot, fixture.inputs.rawSource.path),
      '\n// drift\n',
    )
    assert.throws(
      () => applyTarget117FallbackTruncatedCountSourceRecovery({
        sourceRoot: drift.sourceRoot,
      }),
      /refusing mixed or non-Target117 state/,
    )
  } finally {
    fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
  }
})
