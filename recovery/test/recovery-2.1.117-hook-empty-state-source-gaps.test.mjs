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
  applyTarget117HookEmptyStateSourceRecovery,
  TARGET117_HOOK_EMPTY_STATE_CONTEXT_FILE,
  TARGET117_HOOK_EMPTY_STATE_FILES,
  TARGET117_HOOK_EMPTY_STATE_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-hook-empty-state-source-gaps.mjs'
import { TARGET117_EMPTY_STATE_SOURCE } from '../cases/2.1.116-to-2.1.117/recovered/replay-plugin-empty-state-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-hook-empty-state-source-gaps.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = '100647edf7f8076fa31c23766fe7a84b8f5eedcf86d4da22035a8a24ffeca2d7'
const artifactRoot = path.join(repositoryRoot, '.recovery-tmp/authenticated-artifacts')

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

function fileTuple(tuple) {
  return { bytes: tuple[1], sha256: tuple[2] }
}

function rangeTuple(tuple) {
  return { bytes: tuple[2], sha256: tuple[3] }
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

function sourceFilename(sourceRoot, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function writeContext(sourceRoot) {
  const filename = sourceFilename(
    sourceRoot,
    TARGET117_HOOK_EMPTY_STATE_CONTEXT_FILE.path,
  )
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, TARGET117_EMPTY_STATE_SOURCE)
  assert.deepEqual(
    descriptor(fs.readFileSync(filename)),
    {
      bytes: TARGET117_HOOK_EMPTY_STATE_CONTEXT_FILE.bytes,
      sha256: TARGET117_HOOK_EMPTY_STATE_CONTEXT_FILE.sha256,
    },
  )
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
  writeContext(sourceRoot)
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of fixture.inputs.rawSource.files) {
    const output = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(sourceFilename(inputRoot, input.path), output)
  }
  const contextOutput = sourceFilename(sourceRoot, fixture.inputs.context.path)
  fs.mkdirSync(path.dirname(contextOutput), { recursive: true })
  fs.copyFileSync(sourceFilename(inputRoot, fixture.inputs.context.path), contextOutput)
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

function parseSource(ts, filename, source, kind) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function exactDeclaration(ts, sourceFile, source, name, tuple) {
  const declarations = sourceFile.statements.filter(
    node => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.equal(declarations.length, 1, name)
  const declaration = declarations[0]
  assert.deepEqual(
    [declaration.getStart(sourceFile), declaration.end],
    tuple.slice(0, 2),
  )
  assert.deepEqual(
    descriptor(Buffer.from(source.slice(tuple[0], tuple[1]))),
    rangeTuple(tuple),
  )
  return declaration
}

function jsxTag(ts, node) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText()
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText()
  return null
}

function jsxAttributes(ts, node) {
  const attributes = ts.isJsxElement(node)
    ? node.openingElement.attributes.properties
    : node.attributes.properties
  return new Map(
    attributes
      .filter(ts.isJsxAttribute)
      .map(attribute => [attribute.name.getText(), attribute.initializer]),
  )
}

function stringAttribute(ts, attribute) {
  assert.ok(attribute && ts.isStringLiteral(attribute))
  return attribute.text
}

function cacheFacts(ts, sourceFile, declaration) {
  const cacheCalls = descendants(
    ts,
    declaration,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === '_c' &&
      node.arguments.length === 1,
  )
  assert.equal(cacheCalls.length, 1)
  const cacheSize = Number(cacheCalls[0].arguments[0].getText(sourceFile))
  const indices = descendants(
    ts,
    declaration,
    node =>
      ts.isElementAccessExpression(node) &&
      node.expression.getText(sourceFile) === '$' &&
      node.argumentExpression &&
      ts.isNumericLiteral(node.argumentExpression),
  ).map(node => Number(node.argumentExpression.text))
  return {
    cacheSize,
    min: Math.min(...indices),
    max: Math.max(...indices),
    unique: [...new Set(indices)].sort((left, right) => left - right),
  }
}

async function verifyRecoveredSource(sourceRoot) {
  const ts = await loadTypeScript()
  for (const expected of fixture.inputs.postimages) {
    const bytes = readExact(
      sourceFilename(sourceRoot, expected.path),
      { bytes: expected.bytes, sha256: expected.sha256 },
    )
    const source = bytes.toString('utf8')
    const sourceFile = parseSource(ts, expected.path, source, ts.ScriptKind.TSX)
    const declaration = exactDeclaration(
      ts,
      sourceFile,
      source,
      expected.declaration,
      expected.declarationTuple,
    )

    if (expected.path.endsWith('KeyboardShortcutHint.tsx')) {
      exactDeclaration(
        ts,
        sourceFile,
        source,
        'formatKeyboardShortcut',
        expected.formatterDeclarationTuple,
      )
      assert.match(source, /chord\?: string \| string\[\]/)
      assert.match(
        declaration.getText(sourceFile),
        /chord === undefined \? \(shortcut \?\? ''\) : formatKeyboardShortcut\(chord, format\)/,
      )
      assert.match(declaration.getText(sourceFile), /if \(!display\) return null/)
      continue
    }

    for (const tuple of [
      expected.importTuple,
      expected.emptyStateImportTuple,
      expected.delegateTuple,
      expected.inputGuideTuple,
      expected.keyboardCallTuple,
    ]) {
      assert.deepEqual(
        descriptor(Buffer.from(source.slice(tuple[0], tuple[1]))),
        rangeTuple(tuple),
      )
    }

    const imports = sourceFile.statements.filter(ts.isImportDeclaration)
    assert.equal(
      imports.filter(
        node => node.moduleSpecifier.text === '../design-system/EmptyState.js',
      ).length,
      1,
    )
    assert.equal(
      imports.filter(
        node =>
          node.moduleSpecifier.text ===
          '../design-system/KeyboardShortcutHint.js',
      ).length,
      1,
    )
    const inkImport = imports.find(node => node.moduleSpecifier.text === '../../ink.js')
    assert.ok(inkImport)
    assert.equal(inkImport.importClause.namedBindings.getText(sourceFile), '{ Box }')

    const facts = cacheFacts(ts, sourceFile, declaration)
    assert.equal(facts.cacheSize, expected.cacheSize)
    assert.equal(facts.min, 0)
    assert.equal(facts.max, expected.cacheSize - 1)
    assert.deepEqual(
      facts.unique,
      Array.from({ length: expected.cacheSize }, (_, index) => index),
    )

    const emptyStates = descendants(
      ts,
      declaration,
      node => jsxTag(ts, node) === 'EmptyState',
    )
    assert.equal(emptyStates.length, 1)
    const emptyAttributes = jsxAttributes(ts, emptyStates[0])
    assert.equal(
      stringAttribute(ts, emptyAttributes.get('hint')),
      'To add hooks, edit settings.json directly or ask Claude.',
    )
    assert.equal(emptyStates[0].children.length, 1)
    assert.equal(
      emptyStates[0].children[0].getText(sourceFile),
      'No hooks configured for this event.',
    )
    assert.equal(emptyAttributes.has('gap'), false)

    const helperName = expected.declaration === 'SelectHookMode' ? '_temp' : '_temp2'
    const helper = exactDeclaration(
      ts,
      sourceFile,
      source,
      helperName,
      expected.inputGuideTuple,
    )
    const hints = descendants(
      ts,
      helper,
      node => jsxTag(ts, node) === 'KeyboardShortcutHint',
    )
    assert.equal(hints.length, 1)
    const hintAttributes = jsxAttributes(ts, hints[0])
    assert.equal(stringAttribute(ts, hintAttributes.get('chord')), 'escape')
    assert.equal(stringAttribute(ts, hintAttributes.get('action')), 'go back')
    assert.doesNotMatch(source, /<Text>Esc to go back<\/Text>/)
    assert.doesNotMatch(source, /flexDirection="column" gap=\{1\}/)

    const dialogs = descendants(
      ts,
      declaration,
      node => jsxTag(ts, node) === 'Dialog',
    )
    assert.equal(dialogs.length, 2)
    const guided = dialogs.filter(node => jsxAttributes(ts, node).has('inputGuide'))
    assert.equal(guided.length, 1)
    const inputGuide = jsxAttributes(ts, guided[0]).get('inputGuide')
    assert.ok(inputGuide && ts.isJsxExpression(inputGuide))
    assert.equal(inputGuide.expression.getText(sourceFile), helperName)
  }
}

function targetRange(target, tuple) {
  const bytes = target.subarray(tuple[0], tuple[1])
  assert.deepEqual(descriptor(bytes), rangeTuple(tuple))
  return bytes.toString('utf8')
}

function targetUnit(target, unit) {
  return targetRange(target, [
    unit[3],
    unit[4],
    unit[4] - unit[3],
    unit[6],
  ])
}

test('Target117 authenticates both hook consumers and their retained component graph', { skip: !selected }, async () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(path.join(repositoryRoot, fixture.inputs.helper.path), {
    bytes: fixture.inputs.helper.bytes,
    sha256: fixture.inputs.helper.sha256,
  })
  const baseline = readExact(
    path.join(artifactRoot, fixture.inputs.baselineBundle[0]),
    fileTuple(fixture.inputs.baselineBundle),
  )
  const target = readExact(
    path.join(artifactRoot, fixture.inputs.targetBundle[0]),
    fileTuple(fixture.inputs.targetBundle),
  )
  const ledger = JSON.parse(
    gunzipSync(
      readExact(
        path.join(repositoryRoot, fixture.inputs.structuralLedger[0]),
        fileTuple(fixture.inputs.structuralLedger),
      ),
    ),
  )
  const expectedRegions = [
    fixture.target117.sharedComponentUnit,
    fixture.target117.sharedComponentBinding,
    fixture.target117.sharedComponentInitializer,
    fixture.target117.keyboardShortcutUnit,
    fixture.target117.keyboardShortcutInitializer,
    ...fixture.target117.consumers.flatMap(consumer => [
      consumer.unit,
      consumer.inputGuideUnit,
      consumer.moduleInitializer,
    ]),
  ]
  for (const expected of expectedRegions) {
    const region = ledger.regions.find(candidate => candidate.target.index === expected[0])
    assert.ok(region, `structural region u${expected[0]}`)
    assert.deepEqual(regionTuple(region), expected)
    assert.equal(
      sha256(target.subarray(expected[3], expected[4])),
      expected[6],
    )
  }

  const ts = await loadTypeScript()
  const shared = targetUnit(target, fixture.target117.sharedComponentUnit)
  assert.match(shared, /^function L4\(/)
  assert.match(shared, /\.c\(9\)/)
  assert.equal((shared.match(/createElement\(/g) ?? []).length, 4)
  const keyboard = targetUnit(target, fixture.target117.keyboardShortcutUnit)
  assert.match(keyboard, /\{chord:q,action:K,format:_,parens:A,bold:f\}/)
  assert.match(keyboard, /\.c\(12\)/)
  assert.match(keyboard, /typeof q==="string"\?\[q\]:q/)
  assert.match(keyboard, /if\(!M\)return null/)
  assert.ok(
    baseline.includes('chord:"escape",action:"go back"'),
    'keyboard input-guide behavior is retained from baseline',
  )

  for (const consumer of fixture.target117.consumers) {
    const unitText = targetUnit(target, consumer.unit)
    const unit = parseSource(ts, `u${consumer.targetIndex}.js`, unitText, ts.ScriptKind.JS)
    const declaration = unit.statements.find(ts.isFunctionDeclaration)
    assert.ok(declaration)
    const cacheCalls = descendants(
      ts,
      declaration,
      node =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'c',
    )
    assert.equal(cacheCalls.length, 1)
    assert.equal(Number(cacheCalls[0].arguments[0].getText(unit)), consumer.cacheSize)
    assert.match(unitText, /\.length===0/)
    assert.doesNotMatch(unitText, /gap:/)

    const sharedCalls = descendants(
      ts,
      declaration,
      node =>
        ts.isCallExpression(node) &&
        node.arguments[0]?.getText(unit) === 'L4',
    )
    assert.equal(sharedCalls.length, 1)
    assert.equal(
      sharedCalls[0].arguments[1].getText(unit),
      '{hint:"To add hooks, edit settings.json directly or ask Claude."}',
    )
    assert.equal(
      sharedCalls[0].arguments[2].getText(unit),
      '"No hooks configured for this event."',
    )
    targetRange(target, consumer.call)
    assert.equal(
      target.subarray(consumer.residue[2], consumer.residue[3]).toString(),
      consumer.residue[1],
    )

    const helperText = targetUnit(target, consumer.inputGuideUnit)
    assert.match(helperText, /createElement\(K\$,\{chord:"escape",action:"go back"\}\)/)
    targetRange(target, consumer.inputGuideCall)
    const initializer = targetUnit(target, consumer.moduleInitializer)
    assert.match(initializer, /g3\(\);r6\(\)/)
    assert.ok(initializer.indexOf('g3();') < initializer.indexOf('r6();'))
  }
})

test('raw Target117 source replays to exact whole-unit postimages', { skip: !selected }, async () => {
  assert.equal(
    execFileSync('git', ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    fixture.inputs.rawSource.tree,
  )
  for (const input of fixture.inputs.rawSource.files) {
    assert.equal(
      execFileSync('git', ['rev-parse', `${fixture.inputs.rawSource.commit}:${input.path}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      input.blob,
    )
  }
  const raw = materializeRawSource('target117-hook-empty-raw-')
  try {
    assert.equal(
      applyTarget117HookEmptyStateSourceRecovery({ sourceRoot: raw.sourceRoot }).status,
      'recovered',
    )
    await verifyRecoveredSource(raw.sourceRoot)
    assert.equal(
      applyTarget117HookEmptyStateSourceRecovery({ sourceRoot: raw.sourceRoot }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
  }
})

test('hook EmptyState overrides close exactly u17078/u17083 with corrected ownership', { skip: !selected }, () => {
  assert.deepEqual(
    TARGET117_HOOK_EMPTY_STATE_FILES.map(file => [
      file.path,
      file.postimage.bytes,
      file.postimage.sha256,
    ]),
    fixture.inputs.postimages.map(file => [file.path, file.bytes, file.sha256]),
  )
  assert.deepEqual(
    TARGET117_HOOK_EMPTY_STATE_OWNER_OVERRIDES.map(override => override.key),
    [`${caseName}:17078`, `${caseName}:17083`],
  )
  for (const [index, override] of TARGET117_HOOK_EMPTY_STATE_OWNER_OVERRIDES.entries()) {
    const expected = fixture.target117.consumers[index]
    assert.equal(override.targetIndex, expected.targetIndex)
    assert.equal(override.paths[0], expected.owner)
    assert.ok(override.paths.includes(fixture.inputs.context.path))
    assert.ok(
      override.paths.includes(
        'src/components/design-system/KeyboardShortcutHint.tsx',
      ),
    )
    assert.deepEqual(
      override.evidenceIds,
      fixture.evidenceIds,
    )
  }
  assert.equal(
    TARGET117_HOOK_EMPTY_STATE_OWNER_OVERRIDES[1].paths.includes(
      fixture.target117.consumers[1].staleGeneratedOwner,
    ),
    false,
  )
})

test('hook EmptyState replay is package-aware, atomic, idempotent, and fail-closed', { skip: !selected }, async () => {
  let seed
  const selectedRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
    : (() => {
        seed = materializeRawSource('target117-hook-empty-seed-')
        applyTarget117HookEmptyStateSourceRecovery({ sourceRoot: seed.sourceRoot })
        return seed.sourceRoot
      })()
  const packaged = copySelectedSource(selectedRoot, 'target117-hook-empty-package-')
  try {
    const first = applyTarget117HookEmptyStateSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(first.status))
    await verifyRecoveredSource(packaged.sourceRoot)
    assert.equal(
      applyTarget117HookEmptyStateSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    if (seed) fs.rmSync(seed.temporaryRoot, { recursive: true, force: true })
  }

  const mixed = materializeRawSource('target117-hook-empty-mixed-')
  try {
    applyTarget117HookEmptyStateSourceRecovery({ sourceRoot: mixed.sourceRoot })
    const rawInput = fixture.inputs.rawSource.files[0]
    fs.writeFileSync(
      sourceFilename(mixed.sourceRoot, rawInput.path),
      execFileSync('git', ['show', `${fixture.inputs.rawSource.commit}:${rawInput.path}`], {
        cwd: repositoryRoot,
      }),
    )
    assert.throws(
      () => applyTarget117HookEmptyStateSourceRecovery({ sourceRoot: mixed.sourceRoot }),
      /Refusing mixed Target117 hook EmptyState recovery/,
    )
  } finally {
    fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
  }

  const drift = materializeRawSource('target117-hook-empty-drift-')
  try {
    const stablePath = sourceFilename(
      drift.sourceRoot,
      fixture.inputs.rawSource.files[1].path,
    )
    const stableBefore = fs.readFileSync(stablePath)
    fs.appendFileSync(
      sourceFilename(drift.sourceRoot, fixture.inputs.rawSource.files[0].path),
      '\n// drift\n',
    )
    assert.throws(
      () => applyTarget117HookEmptyStateSourceRecovery({ sourceRoot: drift.sourceRoot }),
      /refusing mixed or non-Target117 state/,
    )
    assert.equal(fs.readFileSync(stablePath).equals(stableBefore), true)
  } finally {
    fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
  }

  const missingContext = materializeRawSource('target117-hook-empty-context-')
  try {
    fs.unlinkSync(sourceFilename(missingContext.sourceRoot, fixture.inputs.context.path))
    assert.throws(
      () => applyTarget117HookEmptyStateSourceRecovery({ sourceRoot: missingContext.sourceRoot }),
      /required Target117 EmptyState replay context is absent/,
    )
  } finally {
    fs.rmSync(missingContext.temporaryRoot, { recursive: true, force: true })
  }

  const symlinked = materializeRawSource('target117-hook-empty-symlink-')
  try {
    const targetPath = sourceFilename(
      symlinked.sourceRoot,
      fixture.inputs.rawSource.files[0].path,
    )
    const linkTarget = `${targetPath}.real`
    fs.renameSync(targetPath, linkTarget)
    fs.symlinkSync(linkTarget, targetPath)
    assert.throws(
      () => applyTarget117HookEmptyStateSourceRecovery({ sourceRoot: symlinked.sourceRoot }),
      /expected a real source file/,
    )
  } finally {
    fs.rmSync(symlinked.temporaryRoot, { recursive: true, force: true })
  }
})
