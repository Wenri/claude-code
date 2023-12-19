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
  TARGET117_MCP_CLIENT_MIXED_EVIDENCE_IDS,
  TARGET117_MCP_CLIENT_MIXED_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/mcp-client-mixed-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-mcp-client-mixed-owner-proof.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '90595fc0102af37cf4373f8ab970b19d5a87100e58b5099063d4549b8014462b'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function bundlePath(environmentName, input) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, input.path),
  )
}

function walk(node, visit, parent = undefined, ancestors = []) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent, ancestors)
    return
  }
  if (typeof node.type === 'string') visit(node, parent, ancestors)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit, node, [...ancestors, node])
    }
  }
}

function literalPositions(program, value, offset = 0) {
  const positions = []
  walk(program, node => {
    if (node.type === 'Literal' && node.value === value) {
      positions.push({ start: offset + node.start, end: offset + node.end })
    }
  })
  positions.sort((left, right) => left.start - right.start)
  return positions
}

function propertyPositions(program, value, offset = 0) {
  const positions = []
  walk(program, node => {
    if (
      node.type === 'Property' &&
      !node.computed &&
      ((node.key.type === 'Identifier' && node.key.name === value) ||
        (node.key.type === 'Literal' && node.key.value === value))
    ) {
      positions.push({
        start: offset + node.key.start,
        end: offset + node.key.end,
      })
    }
  })
  positions.sort((left, right) => left.start - right.start)
  return positions
}

function objectLiteralFields(object) {
  return Object.fromEntries(
    object.properties
      .filter(
        property =>
          property.type === 'Property' &&
          !property.computed &&
          property.value?.type === 'Literal',
      )
      .map(property => [
        property.key.name ?? property.key.value,
        property.value.value,
      ]),
  )
}

function assertTargetCompanionSemantics(program) {
  assert.equal(program.body.length, 1)
  const declaration = program.body[0]
  assert.equal(declaration.type, 'FunctionDeclaration')
  assert.equal(declaration.async, true)
  assert.equal(declaration.id.name, fixture.targetCompanion.functionName)
  assert.equal(declaration.params.length, 1)
  assert.equal(declaration.params[0].type, 'Identifier')
  const parameter = declaration.params[0].name
  assert.equal(declaration.body.body.length, 4)

  const [sdkGuard, connectionDeclaration, connectedGuard, resultReturn] =
    declaration.body.body
  assert.equal(sdkGuard.type, 'IfStatement')
  assert.equal(sdkGuard.test.type, 'BinaryExpression')
  assert.equal(sdkGuard.test.operator, '===')
  assert.equal(sdkGuard.test.left.type, 'MemberExpression')
  assert.equal(sdkGuard.test.left.property.name, 'type')
  assert.equal(sdkGuard.test.left.object.property.name, 'config')
  assert.equal(sdkGuard.test.left.object.object.name, parameter)
  assert.equal(sdkGuard.test.right.value, 'sdk')
  assert.equal(sdkGuard.consequent.type, 'ReturnStatement')
  assert.equal(sdkGuard.consequent.argument.name, parameter)

  assert.equal(connectionDeclaration.type, 'VariableDeclaration')
  assert.equal(connectionDeclaration.declarations.length, 1)
  const connection = connectionDeclaration.declarations[0]
  assert.equal(connection.id.type, 'Identifier')
  assert.equal(connection.init.type, 'AwaitExpression')
  assert.equal(connection.init.argument.type, 'CallExpression')
  assert.equal(connection.init.argument.arguments.length, 2)
  assert.deepEqual(
    connection.init.argument.arguments.map(argument => argument.property.name),
    ['name', 'config'],
  )
  assert.ok(
    connection.init.argument.arguments.every(
      argument => argument.object.name === parameter,
    ),
  )

  assert.equal(connectedGuard.type, 'IfStatement')
  assert.equal(connectedGuard.test.type, 'BinaryExpression')
  assert.equal(connectedGuard.test.operator, '!==')
  assert.equal(connectedGuard.test.left.object.name, connection.id.name)
  assert.equal(connectedGuard.test.left.property.name, 'type')
  assert.equal(connectedGuard.test.right.value, 'connected')
  assert.equal(connectedGuard.consequent.type, 'ThrowStatement')
  const thrown = connectedGuard.consequent.argument
  assert.equal(thrown.type, 'NewExpression')
  assert.equal(thrown.arguments.length, 2)
  assert.equal(thrown.arguments[0].type, 'TemplateLiteral')
  assert.equal(thrown.arguments[0].expressions.length, 1)
  assert.equal(thrown.arguments[0].expressions[0].object.name, parameter)
  assert.equal(thrown.arguments[0].expressions[0].property.name, 'name')
  assert.equal(thrown.arguments[1].value, 'MCP server not connected')

  assert.equal(resultReturn.type, 'ReturnStatement')
  assert.equal(resultReturn.argument.name, connection.id.name)
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

function tsDescendants(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function assertExactSourceDeclaration(ts, bytes, label) {
  assert.deepEqual(
    descriptor(bytes),
    { bytes: fixture.source.bytes, sha256: fixture.source.sha256 },
    `${label}: complete source`,
  )
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.source.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${label}: parses`)
  const declarations = tsDescendants(
    ts,
    sourceFile,
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === fixture.source.declaration.name,
  )
  assert.equal(declarations.length, 1, `${label}: exact function declaration`)
  const declaration = declarations[0]
  const start = declaration.getStart(sourceFile)
  assert.deepEqual({
    name: declaration.name.text,
    start,
    end: declaration.end,
    ...descriptor(bytes.subarray(start, declaration.end)),
  }, fixture.source.declaration, `${label}: declaration identity`)
  assert.ok(
    declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword),
    `${label}: exported`,
  )
  assert.ok(
    declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword),
    `${label}: async`,
  )
  const declarationText = declaration.getText(sourceFile)
  assert.match(declarationText, /client\.config\.type === 'sdk'/)
  assert.match(declarationText, /return client/)
  assert.match(
    declarationText,
    /await connectToServer\(client\.name, client\.config\)/,
  )
  assert.match(declarationText, /connectedClient\.type !== 'connected'/)
  assert.match(
    declarationText,
    /new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS/,
  )
  assert.match(declarationText, /MCP server not connected/)
  assert.match(declarationText, /return connectedClient/)
}

test(
  '2.1.117 MCP client fixture freezes the complete mixed residue unit',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 4,
      buildMetadataResidues: 3,
      sourceExportResidues: 1,
      matchedCompanionUnits: 1,
      sourceFiles: 1,
      sourceReplays: 0,
      ownerOverrides: 1,
    })
    assert.deepEqual(
      [...TARGET117_MCP_CLIENT_MIXED_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET117_MCP_CLIENT_MIXED_OWNER_OVERRIDES.map(override => ({
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
    assert.equal(
      fixture.residues.filter(row => row.proof === 'build-metadata-object').length,
      fixture.summary.buildMetadataResidues,
    )
    assert.equal(
      fixture.residues.filter(row => row.proof === 'matched-companion-export').length,
      fixture.summary.sourceExportResidues,
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
        ['rev-parse', `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.source.blob,
    )
  },
)

test(
  '2.1.117 authenticated u14619 closes its build metadata and matched MCP export',
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
    assert.deepEqual(
      descriptor(unitBytes),
      { bytes: fixture.targetUnit.bytes, sha256: fixture.targetUnit.sha256 },
    )
    const unitAst = parse(unitBytes.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(unitAst.body.length, 1)
    assert.equal(unitAst.body[0].type, fixture.targetUnit.nodeType)

    const macroObjects = []
    walk(unitAst, node => {
      if (node.type !== 'ObjectExpression') return
      const fields = objectLiteralFields(node)
      if (
        Object.entries(fixture.buildMetadataObject.fields).every(
          ([name, value]) => fields[name] === value,
        )
      ) {
        macroObjects.push(node)
      }
    })
    assert.equal(macroObjects.length, 1, 'one exact Target117 build-metadata object')
    const macroObject = macroObjects[0]
    const macroBytes = unitBytes.subarray(macroObject.start, macroObject.end)
    assert.deepEqual(
      {
        start: fixture.targetUnit.start + macroObject.start,
        end: fixture.targetUnit.start + macroObject.end,
        ...descriptor(macroBytes),
      },
      {
        start: fixture.buildMetadataObject.start,
        end: fixture.buildMetadataObject.end,
        bytes: fixture.buildMetadataObject.bytes,
        sha256: fixture.buildMetadataObject.sha256,
      },
      'exact build-metadata object',
    )

    const exportProperties = []
    walk(unitAst, (node, parent) => {
      if (
        node.type === 'Property' &&
        !node.computed &&
        node.key?.type === 'Identifier' &&
        node.key.name === fixture.targetExport.property &&
        node.value?.type === 'Identifier' &&
        node.value.name === fixture.targetExport.binding &&
        parent?.type === 'ObjectExpression'
      ) {
        exportProperties.push({ node, parent })
      }
    })
    assert.equal(exportProperties.length, 1, 'one ensureConnectedClient export')
    const exported = exportProperties[0]
    assert.deepEqual(
      [
        fixture.targetUnit.start + exported.node.start,
        fixture.targetUnit.start + exported.node.end,
      ],
      [fixture.targetExport.propertyStart, fixture.targetExport.propertyEnd],
    )
    const registrarCalls = []
    walk(unitAst, node => {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === fixture.targetExport.registrar &&
        node.arguments.includes(exported.parent)
      ) {
        registrarCalls.push(node)
      }
    })
    assert.equal(registrarCalls.length, 1, 'export object is passed to one registrar')

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
    for (const residue of fixture.residues) {
      const positions =
        residue.literalKind === 'string'
          ? literalPositions
          : propertyPositions
      const baselineOccurrences = positions(baselineAst, residue.value)
      const targetOccurrences = positions(targetAst, residue.value)
      assert.equal(
        baselineOccurrences.length,
        residue.baselineOccurrenceCount,
        `${residue.value}: baseline count`,
      )
      assert.equal(
        targetOccurrences.length,
        residue.targetOccurrenceCount,
        `${residue.value}: target count`,
      )
      assert.deepEqual(
        targetOccurrences[residue.targetOccurrenceNumber - 1],
        { start: residue.start, end: residue.end },
        `${residue.value}: exact target-added ordinal`,
      )
    }

    const companionRegion = ledger.regions.find(
      row => row.target.index === fixture.targetCompanion.targetIndex,
    )
    assert.ok(companionRegion, `u${fixture.targetCompanion.targetIndex}`)
    assert.deepEqual({
      classification: companionRegion.classification,
      nodeType: companionRegion.target.nodeType,
      start: companionRegion.target.start,
      end: companionRegion.target.end,
      tokenCount: companionRegion.target.tokenCount,
      sourceHash: companionRegion.target.sourceHash,
      coarseHash: companionRegion.target.coarseHash,
      baselineUnitIndex: companionRegion.baselineUnitIndex,
      pairReason: companionRegion.pairReason,
    }, {
      classification: fixture.targetCompanion.classification,
      nodeType: fixture.targetCompanion.nodeType,
      start: fixture.targetCompanion.start,
      end: fixture.targetCompanion.end,
      tokenCount: fixture.targetCompanion.tokenCount,
      sourceHash: fixture.targetCompanion.sha256,
      coarseHash: fixture.targetCompanion.coarseHash,
      baselineUnitIndex: fixture.targetCompanion.baselineUnitIndex,
      pairReason: fixture.targetCompanion.pairReason,
    })
    const companionBytes = targetBytes.subarray(
      fixture.targetCompanion.start,
      fixture.targetCompanion.end,
    )
    assert.deepEqual(
      descriptor(companionBytes),
      {
        bytes: fixture.targetCompanion.bytes,
        sha256: fixture.targetCompanion.sha256,
      },
    )
    assertTargetCompanionSemantics(
      parse(companionBytes.toString('utf8'), {
        ecmaVersion: 'latest',
        sourceType: 'script',
      }),
    )
  },
)

test(
  '2.1.117 raw and packaged MCP client preserve exact ensureConnectedClient semantics',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const rawBytes = execFileSync(
      'git',
      ['show', `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`],
      { cwd: repositoryRoot },
    )
    assertExactSourceDeclaration(ts, rawBytes, 'raw ff0339 source')

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    assertExactSourceDeclaration(
      ts,
      fs.readFileSync(path.join(packagedRoot, fixture.source.path.slice(4))),
      'packaged Target117 source',
    )
  },
)
