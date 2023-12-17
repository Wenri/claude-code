import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET117_PROCESS_SLASH_COMMAND_DCE_EVIDENCE_IDS,
  TARGET117_PROCESS_SLASH_COMMAND_DCE_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/process-slash-command-dce-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-process-slash-command-dce-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '58c25aadb56b14c0b1c1bca1434168ac9f5caff02ce59f115d42a0916ce5ea92'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
}

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  return path.resolve(explicit ?? path.join(repositoryRoot, input.path))
}

function walk(node, visit, parent = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent)
    return
  }
  if (typeof node.type === 'string') visit(node, parent)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit, node)
    }
  }
}

function stringLiteralPositions(program, value, offset = 0) {
  const positions = []
  walk(program, node => {
    if (node.type === 'Literal' && node.value === value) {
      positions.push({ start: offset + node.start, end: offset + node.end })
    }
  })
  positions.sort((left, right) => left.start - right.start)
  return positions
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

function sourceFilename(sourceRoot) {
  return path.join(path.resolve(sourceRoot), fixture.source.path.slice(4))
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

function exactSourceDeclaration(ts, bytes, label) {
  assert.deepEqual(descriptor(bytes), {
    bytes: fixture.source.bytes,
    sha256: fixture.source.sha256,
  }, `${label}: complete source`)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.source.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${label}: parses`)
  const declarations = descendants(
    ts,
    sourceFile,
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === fixture.source.declaration.name,
  )
  assert.equal(declarations.length, 1)
  const declaration = declarations[0]
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  assert.deepEqual({
    name: declaration.name.text,
    start,
    end,
    ...descriptor(bytes.subarray(start, end)),
  }, fixture.source.declaration, `${label}: declaration`)

  const forbidden = descendants(
    ts,
    declaration,
    node =>
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === fixture.residue.value,
  )
  assert.equal(forbidden.length, 0, `${label}: no synthetic dead string`)

  const invalidEvents = descendants(
    ts,
    declaration,
    node => {
      if (!ts.isCallExpression(node) || node.expression.getText(sourceFile) !== 'logEvent') {
        return false
      }
      return node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === 'tengu_input_slash_invalid'
    },
  )
  assert.equal(invalidEvents.length, 2)
  const suggestionEvent = invalidEvents.find(event =>
    event.arguments[1]?.getText(sourceFile).includes('had_suggestion'),
  )
  assert.ok(suggestionEvent, `${label}: suggestion telemetry`)
  const eventText = suggestionEvent.arguments[1].getText(sourceFile)
  assert.match(eventText, /input: commandName/)
  assert.match(eventText, /had_suggestion: Boolean\(suggestion\)/)

  const imports = sourceFile.statements.filter(statement =>
    ts.isImportDeclaration(statement),
  )
  const importOwns = (moduleName, importedName) =>
    imports.some(statement =>
      statement.moduleSpecifier.text === moduleName &&
      statement.importClause?.namedBindings?.elements.some(
        element => element.name.text === importedName,
      ),
    )
  assert.ok(
    importOwns('../../services/analytics/index.js', 'logEvent'),
    `${label}: analytics import`,
  )
  assert.ok(
    importOwns('../slashCommandParsing.js', 'parseSlashCommand'),
    `${label}: parser import`,
  )
  assert.ok(
    importOwns('src/commands.js', 'builtInCommandNames'),
    `${label}: command registry import`,
  )

  const declarationText = declaration.getText(sourceFile)
  assert.match(declarationText, /const parsed = parseSlashCommand\(inputString\)/)
  assert.match(declarationText, /if \(!hasCommand\(commandName, context\.options\.commands\)\)/)
  assert.match(declarationText, /if \(looksLikeCommand\(commandName\) && !isFilePath\)/)
}

test(
  '2.1.117 processSlashCommand fixture freezes one DCE-only owner row',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 1,
      sourceFiles: 1,
      sourceReplays: 0,
      ownerOverrides: 1,
    })
    assert.deepEqual(
      [...TARGET117_PROCESS_SLASH_COMMAND_DCE_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET117_PROCESS_SLASH_COMMAND_DCE_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: [...override.paths],
        declarations: [...override.declarations],
        evidenceIds: [...override.evidenceIds],
      })),
      [{
        key: `${caseName}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.source.path],
        declarations: [fixture.source.declaration.name],
        evidenceIds: fixture.evidenceIds,
      }],
    )
    assert.match(
      TARGET117_PROCESS_SLASH_COMMAND_DCE_OWNER_OVERRIDES[0].behavior,
      /local always-false conditional/,
    )
    assert.equal(
      execFileSync(
        'git',
        ['rev-parse', `${fixture.source.rawTargetSourceCommit}^{tree}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.source.rawTargetSourceTree,
    )
    assert.equal(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.source.blob,
    )
  },
)

test(
  '2.1.117 bundle proves mcp-template-unmatched is dominated by false',
  { skip: !selected },
  () => {
    const baselineBytes = readExact(
      bundlePath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'baseline bundle',
    )
    const targetBytes = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'target bundle',
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const region = ledger.regions.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(region, `u${fixture.targetUnit.targetIndex}`)
    assert.deepEqual({
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      tokenCount: region.target.tokenCount,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    }, {
      classification: fixture.targetUnit.classification,
      nodeType: fixture.targetUnit.nodeType,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      tokenCount: fixture.targetUnit.tokenCount,
      sourceHash: fixture.targetUnit.sha256,
      coarseHash: fixture.targetUnit.coarseHash,
    })

    const unitBytes = targetBytes.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    assert.deepEqual(descriptor(unitBytes), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sha256,
    })
    const unitAst = parse(unitBytes.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(unitAst.body.length, 1)
    assert.equal(unitAst.body[0].type, fixture.targetUnit.nodeType)

    const literalPositions = stringLiteralPositions(
      unitAst,
      fixture.residue.value,
      fixture.targetUnit.start,
    )
    assert.deepEqual(literalPositions, [{
      start: fixture.residue.start,
      end: fixture.residue.end,
    }])
    const baselineAst = parse(baselineBytes.toString('utf8'), {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const targetAst = parse(targetBytes.toString('utf8'), {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const baselineOccurrences = stringLiteralPositions(
      baselineAst,
      fixture.residue.value,
    )
    const targetOccurrences = stringLiteralPositions(targetAst, fixture.residue.value)
    assert.equal(
      baselineOccurrences.length,
      fixture.residue.baselineOccurrenceCount,
    )
    assert.equal(targetOccurrences.length, fixture.residue.targetOccurrenceCount)
    assert.deepEqual(
      targetOccurrences[fixture.residue.targetOccurrenceNumber - 1],
      { start: fixture.residue.start, end: fixture.residue.end },
    )

    const conditionalMatches = []
    walk(unitAst, node => {
      if (
        node.type === 'ConditionalExpression' &&
        node.consequent?.type === 'Literal' &&
        node.consequent.value === fixture.residue.value
      ) {
        conditionalMatches.push(node)
      }
    })
    assert.equal(conditionalMatches.length, 1)
    const conditional = conditionalMatches[0]
    assert.equal(conditional.test.type, 'Identifier')
    assert.equal(conditional.test.name, fixture.deadBinding.minifiedName)

    const declarators = []
    const identifiers = []
    const writes = []
    const guardUses = []
    walk(unitAst, (node, parent) => {
      if (
        node.type === 'VariableDeclarator' &&
        node.id?.type === 'Identifier' &&
        node.id.name === fixture.deadBinding.minifiedName
      ) {
        declarators.push(node)
      }
      if (
        node.type === 'Identifier' &&
        node.name === fixture.deadBinding.minifiedName
      ) {
        identifiers.push([
          fixture.targetUnit.start + node.start,
          fixture.targetUnit.start + node.end,
        ])
      }
      if (
        (node.type === 'AssignmentExpression' &&
          node.left?.type === 'Identifier' &&
          node.left.name === fixture.deadBinding.minifiedName) ||
        (node.type === 'UpdateExpression' &&
          node.argument?.type === 'Identifier' &&
          node.argument.name === fixture.deadBinding.minifiedName)
      ) {
        writes.push(node)
      }
      if (
        node.type === 'Identifier' &&
        node.name === fixture.deadBinding.minifiedName &&
        parent?.type === 'LogicalExpression' &&
        parent.operator === '||'
      ) {
        guardUses.push(node)
      }
    })
    assert.equal(declarators.length, 1)
    assert.equal(declarators[0].init.type, 'UnaryExpression')
    assert.equal(declarators[0].init.operator, '!')
    assert.equal(declarators[0].init.argument.value, 1)
    assert.equal(!declarators[0].init.argument.value, false)
    assert.deepEqual(identifiers, fixture.deadBinding.identifierRanges)
    assert.equal(writes.length, fixture.deadBinding.writesAfterDeclaration)
    assert.equal(guardUses.length, 1)
  },
)

test(
  '2.1.117 raw and packaged processSlashCommand keep the live telemetry path',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const rawBytes = execFileSync(
      'git',
      ['show', `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`],
      { cwd: repositoryRoot },
    )
    exactSourceDeclaration(ts, rawBytes, 'raw ff0339 source')

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    exactSourceDeclaration(
      ts,
      fs.readFileSync(sourceFilename(packagedRoot)),
      'packaged Target117 source',
    )
  },
)
