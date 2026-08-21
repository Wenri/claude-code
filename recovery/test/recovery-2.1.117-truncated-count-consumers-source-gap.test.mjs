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
  applyTarget117TruncatedCountConsumerSourceRecovery,
  TARGET117_TRUNCATED_COUNT_CONSUMER_CONTEXT_FILE,
  TARGET117_TRUNCATED_COUNT_CONSUMER_FILES,
  TARGET117_TRUNCATED_COUNT_CONSUMER_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-truncated-count-consumers-source-gap.mjs'
import {
  TARGET117_TRUNCATED_COUNT_SOURCE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-truncated-count-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-truncated-count-consumers-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = '42989f56d9278d467fbeaabc7864216bdc2936cd861e8115be04f2ef49fa647b'
const artifactRoot = path.join(repositoryRoot, '.recovery-tmp/authenticated-artifacts')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function tupleDescriptor(tuple) {
  return { bytes: tuple[2], sha256: tuple[3] }
}

function fileTupleDescriptor(tuple) {
  return { bytes: tuple[1], sha256: tuple[2] }
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

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of fixture.inputs.rawSource.files) {
    const filename = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(
      filename,
      execFileSync(
        'git',
        ['show', `${fixture.inputs.rawSource.commit}:${input.path}`],
        { cwd: repositoryRoot },
      ),
    )
  }
  const context = sourceFilename(sourceRoot, fixture.inputs.context.path)
  fs.mkdirSync(path.dirname(context), { recursive: true })
  fs.writeFileSync(context, TARGET117_TRUNCATED_COUNT_SOURCE)
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of [
    ...fixture.inputs.rawSource.files,
    fixture.inputs.context,
  ]) {
    const output = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(sourceFilename(inputRoot, input.path), output)
  }
  return { temporaryRoot, sourceRoot }
}

function regionTuple(region) {
  return [
    region.target.index,
    region.classification,
    region.target.nodeType,
    region.target.start,
    region.target.end,
    region.target.tokenCount,
    region.target.sourceHash,
    region.target.coarseHash,
  ]
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

function targetDelegates(ast) {
  const calls = []
  walkAcorn(ast, (node, parent) => {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property.name === 'createElement' &&
      node.arguments[0]?.type === 'Identifier' &&
      node.arguments[0].name === 'DX'
    ) {
      calls.push({ node, parent })
    }
  })
  return calls
}

function targetProps(call) {
  const properties = call.arguments[1].properties
  const byName = Object.fromEntries(
    properties.map(property => [property.key.name, property.value]),
  )
  return {
    count: byName.count.name,
    unit: byName.unit?.value ?? null,
    expandable:
      byName.expandable?.type === 'UnaryExpression' &&
      byName.expandable.operator === '!' &&
      byName.expandable.argument.value === 0,
  }
}

function cacheSlots(ast) {
  const slots = []
  walkAcorn(ast, node => {
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
  })
  return [...new Set(slots)].sort((left, right) => left - right)
}

function assertContiguousSlots(slots, size) {
  assert.deepEqual(slots, Array.from({ length: size }, (_, index) => index))
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

function parseTsx(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function exactDeclaration(ts, sourceFile, source, expected) {
  const [name, start, end, bytes, hash] = expected
  const matches = descendants(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.equal(matches.length, 1, name)
  const declaration = matches[0]
  assert.deepEqual([declaration.getStart(sourceFile), declaration.end], [start, end])
  const declarationBytes = Buffer.from(source.slice(start, end))
  assert.deepEqual(descriptor(declarationBytes), { bytes, sha256: hash })
  return declaration
}

function jsxProps(ts, element, sourceFile) {
  const values = {}
  for (const property of element.attributes.properties) {
    const name = property.name.getText(sourceFile)
    if (!property.initializer) {
      values[name] = true
    } else if (ts.isStringLiteral(property.initializer)) {
      values[name] = property.initializer.text
    } else {
      const expression = property.initializer.expression
      values[name] = expression.kind === ts.SyntaxKind.TrueKeyword
        ? true
        : expression.getText(sourceFile)
    }
  }
  if (element.tagName.getText(sourceFile) === 'TruncatedCount') {
    values.unit ??= null
    values.expandable ??= false
  }
  return values
}

function sourceDelegates(ts, declaration, sourceFile) {
  return descendants(
    ts,
    declaration,
    node =>
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(sourceFile) === 'TruncatedCount',
  )
}

function sourceCacheSlots(ts, declaration, sourceFile) {
  return [
    ...new Set(
      descendants(
        ts,
        declaration,
        node =>
          ts.isElementAccessExpression(node) &&
          node.expression.getText(sourceFile) === '$' &&
          ts.isNumericLiteral(node.argumentExpression),
      ).map(node => Number(node.argumentExpression.text)),
    ),
  ].sort((left, right) => left - right)
}

test('Target117 authenticates every truncated-count consumer unit and its dispatcher dependency', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(
    path.join(repositoryRoot, fixture.inputs.helper.path),
    { bytes: fixture.inputs.helper.bytes, sha256: fixture.inputs.helper.sha256 },
  )
  const baseline = readExact(
    path.join(artifactRoot, fixture.inputs.baselineBundle[0]),
    fileTupleDescriptor(fixture.inputs.baselineBundle),
  )
  const target = readExact(
    path.join(artifactRoot, fixture.inputs.targetBundle[0]),
    fileTupleDescriptor(fixture.inputs.targetBundle),
  )
  const ledgerBytes = readExact(
    path.join(repositoryRoot, fixture.inputs.structuralLedger[0]),
    fileTupleDescriptor(fixture.inputs.structuralLedger),
  )
  const ledger = JSON.parse(gunzipSync(ledgerBytes))

  const dependent = fixture.dependentTarget117
  const dependentRegion = ledger.regions.find(
    region => region.target.index === dependent.index,
  )
  assert.ok(dependentRegion)
  assert.deepEqual(regionTuple(dependentRegion), dependent.unit)
  assert.equal(dependentRegion.baselineUnitIndex, dependent.baselineUnitIndex)
  assert.equal(dependentRegion.pairReason, dependent.pairReason)
  const dependentBytes = target.subarray(dependent.unit[3], dependent.unit[4])
  assert.equal(sha256(dependentBytes), dependent.unit[6])
  const memoryBranch = target.subarray(
    dependent.memoryBranch[0],
    dependent.memoryBranch[1],
  )
  assert.deepEqual(descriptor(memoryBranch), tupleDescriptor(dependent.memoryBranch))
  const dependentAst = parse(dependentBytes.toString('utf8'), {
    ecmaVersion: 'latest',
  })
  assertContiguousSlots(cacheSlots(dependentAst), 53)
  let dispatcherCall
  walkAcorn(dependentAst, node => {
    if (
      node.type === 'CallExpression' &&
      node.callee.property?.name === 'createElement' &&
      node.arguments[0]?.name === 'W$1'
    ) dispatcherCall = node
  })
  assert.ok(dispatcherCall)
  const dispatcherProps = Object.fromEntries(
    dispatcherCall.arguments[1].properties.map(property => [
      property.key.name,
      property.value,
    ]),
  )
  assert.equal(dispatcherProps.verbose.name, 'j')
  assert.ok(memoryBranch.toString('utf8').includes('j=_||!!A'))
  const binding = target.subarray(
    dependent.limitBinding[0],
    dependent.limitBinding[1],
  )
  assert.deepEqual(descriptor(binding), tupleDescriptor(dependent.limitBinding))
  assert.equal(binding.toString('utf8'), 'P$1=3')

  for (const proof of fixture.target117) {
    const region = ledger.regions.find(region => region.target.index === proof.index)
    assert.ok(region, `unit ${proof.index}`)
    assert.deepEqual(regionTuple(region), proof.unit)
    const unitBytes = target.subarray(proof.unit[3], proof.unit[4])
    assert.equal(sha256(unitBytes), proof.unit[6])
    const callBytes = target.subarray(proof.call[0], proof.call[1])
    assert.deepEqual(descriptor(callBytes), tupleDescriptor(proof.call))
    const ast = parse(unitBytes.toString('utf8'), { ecmaVersion: 'latest' })
    const calls = targetDelegates(ast)
    assert.equal(calls.length, 1, `unit ${proof.index} delegate count`)
    assert.deepEqual(targetProps(calls[0].node), proof.targetProps)

    if (proof.index === 12519) {
      assert.equal(calls[0].parent.arguments[0].name, '_8')
      assert.ok(unitBytes.toString('utf8').includes('E=L>0&&'))
      assert.ok(unitBytes.toString('utf8').includes('.slice(0,P$1)'))
      assertContiguousSlots(cacheSlots(ast), 22)
    } else if (proof.index === 12843) {
      assert.equal(calls[0].parent.type, 'LogicalExpression')
      assert.equal(calls[0].parent.left.type, 'UnaryExpression')
      assert.equal(calls[0].parent.left.argument.name, '_')
      assertContiguousSlots(cacheSlots(ast), 31)
    } else {
      assert.notEqual(calls[0].parent.type, 'LogicalExpression')
    }

    for (const residue of proof.residues) {
      const [kind, value, baselineCount, occurrence, start, end] = residue
      assert.ok(Number.isInteger(baselineCount) && baselineCount >= 0)
      assert.ok(Number.isInteger(occurrence) && occurrence > baselineCount)
      const text = target.subarray(start, end).toString('utf8')
      assert.equal(kind === 'string' ? JSON.parse(text) : text, value)
      assert.equal(start >= proof.unit[3] && end <= proof.unit[4], true)
      assert.equal(
        baseline.subarray(start, end).equals(target.subarray(start, end)),
        false,
      )
    }
  }

  assert.deepEqual(
    TARGET117_TRUNCATED_COUNT_CONSUMER_OWNER_OVERRIDES.map(row => [
      row.key,
      row.targetIndex,
      row.paths,
      row.declarations,
      row.evidenceIds,
    ]),
    fixture.target117.map(proof => [
      `${caseName}:${proof.index}`,
      proof.index,
      [proof.owner, fixture.inputs.context.path],
      proof.index === 12519
        ? ['SystemTextMessage', 'MemorySavedMessage', 'TruncatedCount']
        : [proof.declaration, 'TruncatedCount'],
      fixture.evidenceIds,
    ]),
  )
})

test('recovered Target117 source has exact imports, declarations, guards, and temporal semantics', { skip: !selected }, async () => {
  const raw = fixture.inputs.rawSource
  assert.equal(
    execFileSync('git', ['rev-parse', `${raw.commit}^{tree}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    raw.tree,
  )
  const replay = materializeRawSource('target117-truncated-consumers-ast-')
  try {
    for (const input of raw.files) {
      assert.equal(
        execFileSync('git', ['rev-parse', `${raw.commit}:${input.path}`], {
          cwd: repositoryRoot,
          encoding: 'utf8',
        }).trim(),
        input.blob,
      )
      const bytes = readExact(sourceFilename(replay.sourceRoot, input.path), {
        bytes: input.bytes,
        sha256: input.sha256,
      })
      const ts = await loadTypeScript()
      const source = bytes.toString('utf8')
      const sourceFile = parseTsx(ts, input.path, source)
      const declarations = input.declarations ?? [
        [
          fixture.target117.find(proof => proof.owner === input.path).declaration,
          ...input.declaration,
        ],
      ]
      for (const expected of declarations) {
        exactDeclaration(ts, sourceFile, source, expected)
      }
    }

    assert.equal(
      applyTarget117TruncatedCountConsumerSourceRecovery({
        sourceRoot: replay.sourceRoot,
      }).status,
      'recovered',
    )
    const ts = await loadTypeScript()
    const declarationByIndex = new Map()
    for (const post of fixture.inputs.postimages) {
      const bytes = readExact(sourceFilename(replay.sourceRoot, post.path), {
        bytes: post.bytes,
        sha256: post.sha256,
      })
      const source = bytes.toString('utf8')
      const sourceFile = parseTsx(ts, post.path, source)
      const declarations = post.declarations ?? [[
        fixture.target117.find(proof => proof.owner === post.path).declaration,
        ...post.declaration,
      ]]
      for (const expected of declarations) {
        const declaration = exactDeclaration(ts, sourceFile, source, expected)
        declarationByIndex.set(`${post.path}:${expected[0]}`, {
          declaration,
          sourceFile,
          source,
        })
      }
      const importModule = post.path.includes('/tools/')
        ? '../../components/TruncatedCount.js'
        : '../TruncatedCount.js'
      assert.equal(
        sourceFile.statements.filter(
          statement =>
            ts.isImportDeclaration(statement) &&
            statement.moduleSpecifier.text === importModule,
        ).length,
        1,
      )
    }

    for (const proof of fixture.target117) {
      const selectedDeclaration = declarationByIndex.get(
        `${proof.owner}:${proof.declaration}`,
      )
      const { declaration, sourceFile } = selectedDeclaration
      const delegates = sourceDelegates(ts, declaration, sourceFile)
      assert.equal(delegates.length, 1, `source unit ${proof.index}`)
      assert.deepEqual(jsxProps(ts, delegates[0], sourceFile), proof.sourceProps)
      if (proof.index === 12519) {
        assert.ok(ts.isJsxElement(delegates[0].parent))
        assert.equal(
          delegates[0].parent.openingElement.tagName.getText(sourceFile),
          'MessageResponse',
        )
        assert.ok(ts.isBinaryExpression(delegates[0].parent.parent))
        assert.equal(delegates[0].parent.parent.left.getText(sourceFile), 'hiddenCount > 0')
        assertContiguousSlots(sourceCacheSlots(ts, declaration, sourceFile), 22)
      } else if (proof.index === 12843) {
        assert.ok(ts.isBinaryExpression(delegates[0].parent))
        assert.equal(delegates[0].parent.left.getText(sourceFile), '!verbose')
      } else {
        assert.equal(ts.isBinaryExpression(delegates[0].parent), false)
      }
    }

    const system = declarationByIndex.get(
      'src/components/messages/SystemTextMessage.tsx:SystemTextMessage',
    )
    const memory = declarationByIndex.get(
      'src/components/messages/SystemTextMessage.tsx:MemorySavedMessage',
    )
    const systemCalls = descendants(
      ts,
      system.declaration,
      node =>
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(system.sourceFile) === 'MemorySavedMessage',
    )
    assert.equal(systemCalls.length, 1)
    assert.equal(
      jsxProps(ts, systemCalls[0], system.sourceFile).verbose,
      't1',
    )
    assert.equal(
      descendants(
        ts,
        system.declaration,
        node =>
          ts.isVariableDeclaration(node) &&
          node.name.getText(system.sourceFile) === 't1' &&
          node.initializer?.getText(system.sourceFile) ===
            'verbose || !!isTranscriptMode',
      ).length,
      1,
    )
    assert.equal(
      system.declaration.getText(system.sourceFile).includes('recap:{" "}'),
      true,
    )
    assertContiguousSlots(
      sourceCacheSlots(ts, system.declaration, system.sourceFile),
      53,
    )
    assert.equal(
      descendants(
        ts,
        system.declaration,
        node =>
          ts.isCallExpression(node) &&
          node.expression.getText(system.sourceFile) === '_c',
      )[0].arguments[0].text,
      '53',
    )
    assert.equal(
      memory.declaration
        .getText(memory.sourceFile)
        .includes('writtenPaths.slice(0, MAX_MEMORY_FILES_TO_SHOW)'),
      true,
    )
    const limitDeclarations = descendants(
      ts,
      system.sourceFile,
      node =>
        ts.isVariableDeclaration(node) &&
        node.name.getText(system.sourceFile) === 'MAX_MEMORY_FILES_TO_SHOW',
    )
    assert.equal(limitDeclarations.length, 1)
    assert.equal(limitDeclarations[0].initializer.text, '3')
    assert.equal(
      memory.declaration.getText(memory.sourceFile).includes('verbose ? writtenPaths'),
      true,
    )
  } finally {
    fs.rmSync(replay.temporaryRoot, { recursive: true, force: true })
  }
})

test('consumer replay is ordered, raw/package dual-state, idempotent, atomic, and fail-closed', { skip: !selected }, () => {
  assert.deepEqual(
    TARGET117_TRUNCATED_COUNT_CONSUMER_CONTEXT_FILE,
    fixture.inputs.context,
  )
  assert.deepEqual(
    TARGET117_TRUNCATED_COUNT_CONSUMER_FILES.map(file => ({
      path: file.path,
      raw: file.raw,
      postimage: file.postimage,
    })),
    fixture.inputs.rawSource.files.map((raw, index) => ({
      path: raw.path,
      raw: { bytes: raw.bytes, sha256: raw.sha256 },
      postimage: {
        bytes: fixture.inputs.postimages[index].bytes,
        sha256: fixture.inputs.postimages[index].sha256,
      },
    })),
  )

  const raw = materializeRawSource('target117-truncated-consumers-raw-')
  try {
    assert.equal(
      applyTarget117TruncatedCountConsumerSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117TruncatedCountConsumerSourceRecovery({
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
        packageSeed = materializeRawSource('target117-truncated-consumers-seed-')
        assert.equal(
          applyTarget117TruncatedCountConsumerSourceRecovery({
            sourceRoot: packageSeed.sourceRoot,
          }).status,
          'recovered',
        )
        return packageSeed.sourceRoot
      })()
  const packaged = copySelectedSource(
    selectedSourceRoot,
    'target117-truncated-consumers-package-',
  )
  try {
    const first = applyTarget117TruncatedCountConsumerSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(first.status))
    assert.equal(
      applyTarget117TruncatedCountConsumerSourceRecovery({
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

  const missingContext = materializeRawSource(
    'target117-truncated-consumers-no-context-',
  )
  try {
    fs.rmSync(sourceFilename(missingContext.sourceRoot, fixture.inputs.context.path))
    assert.throws(
      () => applyTarget117TruncatedCountConsumerSourceRecovery({
        sourceRoot: missingContext.sourceRoot,
      }),
      /required Target117 context is absent/,
    )
  } finally {
    fs.rmSync(missingContext.temporaryRoot, { recursive: true, force: true })
  }

  const drift = materializeRawSource('target117-truncated-consumers-drift-')
  try {
    fs.appendFileSync(
      sourceFilename(drift.sourceRoot, fixture.inputs.rawSource.files[2].path),
      '\n// drift\n',
    )
    assert.throws(
      () => applyTarget117TruncatedCountConsumerSourceRecovery({
        sourceRoot: drift.sourceRoot,
      }),
      /refusing mixed or non-Target117 state/,
    )
  } finally {
    fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
  }

  const mixed = materializeRawSource('target117-truncated-consumers-mixed-')
  try {
    const post = fixture.inputs.postimages[0]
    const postSeed = materializeRawSource('target117-truncated-consumers-post-')
    try {
      applyTarget117TruncatedCountConsumerSourceRecovery({
        sourceRoot: postSeed.sourceRoot,
      })
      fs.copyFileSync(
        sourceFilename(postSeed.sourceRoot, post.path),
        sourceFilename(mixed.sourceRoot, post.path),
      )
    } finally {
      fs.rmSync(postSeed.temporaryRoot, { recursive: true, force: true })
    }
    assert.throws(
      () => applyTarget117TruncatedCountConsumerSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      }),
      /Refusing mixed truncated-count consumer recovery/,
    )
  } finally {
    fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
  }
})
