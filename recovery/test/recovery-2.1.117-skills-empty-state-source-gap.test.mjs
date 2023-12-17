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
  applyTarget117SkillsEmptyStateSourceRecovery,
  TARGET117_SKILLS_EMPTY_STATE_CONTEXT_FILE,
  TARGET117_SKILLS_EMPTY_STATE_FILE,
  TARGET117_SKILLS_EMPTY_STATE_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-skills-empty-state-source-gap.mjs'
import { TARGET117_EMPTY_STATE_SOURCE } from '../cases/2.1.116-to-2.1.117/recovered/replay-plugin-empty-state-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-skills-empty-state-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = 'ebdef1f98b4f1a958875634798204518d070d20e6247051845547cce920ab099'
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
  const filename = sourceFilename(sourceRoot, fixture.inputs.context.path)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, TARGET117_EMPTY_STATE_SOURCE)
  assert.deepEqual(
    descriptor(fs.readFileSync(filename)),
    {
      bytes: fixture.inputs.context.bytes,
      sha256: fixture.inputs.context.sha256,
    },
  )
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const input = fixture.inputs.rawSource.file
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
  writeContext(sourceRoot)
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of [fixture.inputs.rawSource.file, fixture.inputs.context]) {
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

function targetRange(target, tuple) {
  const bytes = target.subarray(tuple[0], tuple[1])
  assert.deepEqual(descriptor(bytes), rangeTuple(tuple))
  return bytes.toString('utf8')
}

async function verifyPostimage(sourceRoot) {
  const expected = fixture.inputs.postimage
  const bytes = readExact(
    sourceFilename(sourceRoot, expected.path),
    { bytes: expected.bytes, sha256: expected.sha256 },
  )
  const source = bytes.toString('utf8')
  const ts = await loadTypeScript()
  const sourceFile = parseSource(ts, expected.path, source, ts.ScriptKind.TSX)
  const declaration = exactDeclaration(
    ts,
    sourceFile,
    source,
    expected.declaration,
    expected.declarationTuple,
  )
  for (const tuple of [expected.importTuple, expected.delegateTuple]) {
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
  const emptyStates = descendants(
    ts,
    declaration,
    node => jsxTag(ts, node) === 'EmptyState',
  )
  assert.equal(emptyStates.length, 1)
  const attributes = jsxAttributes(ts, emptyStates[0])
  const hint = attributes.get('hint')
  assert.ok(hint && ts.isStringLiteral(hint))
  assert.equal(hint.text, 'Create skills in .claude/skills/ or ~/.claude/skills/')
  assert.equal(emptyStates[0].children.length, 1)
  assert.equal(emptyStates[0].children[0].getText(sourceFile).trim(), 'No skills found')
  const zeroDialog = emptyStates[0].parent
  assert.equal(jsxTag(ts, zeroDialog), 'Dialog')
  const dialogAttributes = jsxAttributes(ts, zeroDialog)
  assert.equal(dialogAttributes.has('subtitle'), false)
  assert.ok(dialogAttributes.has('title'))
  assert.ok(dialogAttributes.has('onCancel'))
  assert.ok(dialogAttributes.has('hideInputGuide'))
  assert.doesNotMatch(
    declaration.getText(sourceFile),
    /subtitle="No skills found"/,
  )
}

test('Target117 authenticates the complete SkillsMenu unit and exact zero-skills branch', { skip: !selected }, async () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(path.join(repositoryRoot, fixture.inputs.helper.path), {
    bytes: fixture.inputs.helper.bytes,
    sha256: fixture.inputs.helper.sha256,
  })
  readExact(
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
  for (const expected of [
    fixture.target117.sharedComponentUnit,
    fixture.target117.unit,
    fixture.target117.moduleInitializer,
  ]) {
    const region = ledger.regions.find(candidate => candidate.target.index === expected[0])
    assert.ok(region, `structural region u${expected[0]}`)
    assert.deepEqual(regionTuple(region), expected)
    assert.equal(
      sha256(target.subarray(expected[3], expected[4])),
      expected[6],
    )
  }

  const unitTuple = fixture.target117.unit
  const unitText = target
    .subarray(unitTuple[3], unitTuple[4])
    .toString('utf8')
  const ts = await loadTypeScript()
  const sourceFile = parseSource(ts, 'u16800.js', unitText, ts.ScriptKind.JS)
  const declaration = sourceFile.statements.find(ts.isFunctionDeclaration)
  assert.ok(declaration)
  const emptyCalls = descendants(
    ts,
    declaration,
    node =>
      ts.isCallExpression(node) &&
      node.arguments[0]?.getText(sourceFile) === 'L4',
  )
  assert.equal(emptyCalls.length, 1)
  assert.equal(
    emptyCalls[0].arguments[1].getText(sourceFile),
    '{hint:"Create skills in .claude/skills/ or ~/.claude/skills/"}',
  )
  assert.equal(emptyCalls[0].arguments[2].getText(sourceFile), '"No skills found"')
  targetRange(target, fixture.target117.zeroSkillsReturn)
  targetRange(target, fixture.target117.emptyStateCall)
  assert.equal(
    target
      .subarray(fixture.target117.residue[2], fixture.target117.residue[3])
      .toString(),
    'hint',
  )

  const zeroReturn = targetRange(target, fixture.target117.zeroSkillsReturn)
  assert.match(zeroReturn, /title:"Skills"/)
  assert.match(zeroReturn, /hideInputGuide:!0/)
  assert.doesNotMatch(zeroReturn, /subtitle:/)
  assert.match(unitText, /createElement\(Gj6,\{key:q\?"tok":"name",visibleCount:j,wrap:!0,overflowHint:"count"/)
  assert.match(unitText, /createElement\(Gj6\.Item,/)
  assert.match(unitText, /createElement\(bS1,\{skill:/)
  assert.match(unitText, /"Plugin skills are managed via \/plugin"/)
  const initializer = targetRange(target, [
    fixture.target117.moduleInitializer[3],
    fixture.target117.moduleInitializer[4],
    fixture.target117.moduleInitializer[4] - fixture.target117.moduleInitializer[3],
    fixture.target117.moduleInitializer[6],
  ])
  assert.match(initializer, /g3\(\)/)
  assert.match(initializer, /ip7\(\)/)
})

test('raw SkillsMenu replays only its zero-skills branch to the exact postimage', { skip: !selected }, async () => {
  const input = fixture.inputs.rawSource.file
  assert.equal(
    execFileSync('git', ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    fixture.inputs.rawSource.tree,
  )
  assert.equal(
    execFileSync('git', ['rev-parse', `${fixture.inputs.rawSource.commit}:${input.path}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    input.blob,
  )
  const raw = materializeRawSource('target117-skills-empty-raw-')
  try {
    const rawBytes = readExact(
      sourceFilename(raw.sourceRoot, input.path),
      { bytes: input.bytes, sha256: input.sha256 },
    )
    const ts = await loadTypeScript()
    const rawText = rawBytes.toString('utf8')
    const rawFile = parseSource(ts, input.path, rawText, ts.ScriptKind.TSX)
    exactDeclaration(
      ts,
      rawFile,
      rawText,
      input.declaration,
      input.declarationTuple,
    )
    assert.equal(
      applyTarget117SkillsEmptyStateSourceRecovery({ sourceRoot: raw.sourceRoot }).status,
      'recovered',
    )
    await verifyPostimage(raw.sourceRoot)
    assert.equal(
      applyTarget117SkillsEmptyStateSourceRecovery({ sourceRoot: raw.sourceRoot }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
  }
})

test('u16800 owner override remains branch-bounded and source-specific', { skip: !selected }, () => {
  assert.deepEqual(TARGET117_SKILLS_EMPTY_STATE_FILE, {
    path: fixture.inputs.rawSource.file.path,
    declaration: fixture.inputs.rawSource.file.declaration,
    raw: {
      bytes: fixture.inputs.rawSource.file.bytes,
      sha256: fixture.inputs.rawSource.file.sha256,
    },
    postimage: {
      bytes: fixture.inputs.postimage.bytes,
      sha256: fixture.inputs.postimage.sha256,
    },
  })
  assert.deepEqual(TARGET117_SKILLS_EMPTY_STATE_CONTEXT_FILE, {
    path: fixture.inputs.context.path,
    bytes: fixture.inputs.context.bytes,
    sha256: fixture.inputs.context.sha256,
  })
  assert.equal(TARGET117_SKILLS_EMPTY_STATE_OWNER_OVERRIDES.length, 1)
  const override = TARGET117_SKILLS_EMPTY_STATE_OWNER_OVERRIDES[0]
  assert.equal(override.key, `${caseName}:16800`)
  assert.deepEqual(override.paths, [
    fixture.target117.owner,
    fixture.inputs.context.path,
  ])
  assert.deepEqual(override.declarations, fixture.target117.declarations)
  assert.deepEqual(override.evidenceIds, fixture.evidenceIds)
  assert.match(override.behavior, /bounded to that branch/)
  assert.match(override.behavior, /does not claim.*virtual-list/i)
})

test('SkillsMenu replay is package-aware, idempotent, and fail-closed', { skip: !selected }, async () => {
  let seed
  const selectedRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
    : (() => {
        seed = materializeRawSource('target117-skills-empty-seed-')
        applyTarget117SkillsEmptyStateSourceRecovery({ sourceRoot: seed.sourceRoot })
        return seed.sourceRoot
      })()
  const packaged = copySelectedSource(selectedRoot, 'target117-skills-empty-package-')
  try {
    const first = applyTarget117SkillsEmptyStateSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(first.status))
    await verifyPostimage(packaged.sourceRoot)
    assert.equal(
      applyTarget117SkillsEmptyStateSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    if (seed) fs.rmSync(seed.temporaryRoot, { recursive: true, force: true })
  }

  const drift = materializeRawSource('target117-skills-empty-drift-')
  try {
    fs.appendFileSync(
      sourceFilename(drift.sourceRoot, fixture.inputs.rawSource.file.path),
      '\n// drift\n',
    )
    assert.throws(
      () => applyTarget117SkillsEmptyStateSourceRecovery({ sourceRoot: drift.sourceRoot }),
      /refusing non-Target117 state/,
    )
  } finally {
    fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
  }

  const missingContext = materializeRawSource('target117-skills-empty-context-')
  try {
    fs.unlinkSync(sourceFilename(missingContext.sourceRoot, fixture.inputs.context.path))
    assert.throws(
      () => applyTarget117SkillsEmptyStateSourceRecovery({ sourceRoot: missingContext.sourceRoot }),
      /required Target117 EmptyState replay context is absent/,
    )
  } finally {
    fs.rmSync(missingContext.temporaryRoot, { recursive: true, force: true })
  }

  const symlinked = materializeRawSource('target117-skills-empty-symlink-')
  try {
    const targetPath = sourceFilename(
      symlinked.sourceRoot,
      fixture.inputs.rawSource.file.path,
    )
    const linkTarget = `${targetPath}.real`
    fs.renameSync(targetPath, linkTarget)
    fs.symlinkSync(linkTarget, targetPath)
    assert.throws(
      () => applyTarget117SkillsEmptyStateSourceRecovery({ sourceRoot: symlinked.sourceRoot }),
      /expected a real source file/,
    )
  } finally {
    fs.rmSync(symlinked.temporaryRoot, { recursive: true, force: true })
  }
})
