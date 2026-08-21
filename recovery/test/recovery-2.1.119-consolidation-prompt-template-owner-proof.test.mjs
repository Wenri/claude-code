import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_CONSOLIDATION_PROMPT_TEMPLATE_EVIDENCE_IDS,
  TARGET119_CONSOLIDATION_PROMPT_TEMPLATE_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/consolidation-prompt-template-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-consolidation-prompt-template-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/consolidation-prompt-template-owner-overrides.mjs',
)
const coveragePath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '6f42e4d8e4100fde9378530a1495a50ecfe5c0b8a02dd1de5d27f10ad77307ca'
const HELPER_SHA256 =
  'd1c45c929e282d4857f9a05b101f39f57ee5661d502db2b0ee7917d42063beb9'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
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

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function parsedFunction(text, expectedName) {
  const tree = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(tree.body.length, 1)
  const declaration = tree.body[0]
  assert.equal(declaration.type, 'FunctionDeclaration')
  assert.equal(declaration.id.name, expectedName)
  const returnStatement = declaration.body.body.find(
    statement => statement.type === 'ReturnStatement',
  )
  assert(returnStatement)
  assert.equal(returnStatement.argument.type, 'TemplateLiteral')
  return { declaration, template: returnStatement.argument }
}

function disabledHelper(bundle, gate, helper) {
  const gateText = bundle.slice(gate.start, gate.end)
  const helperText = bundle.slice(helper.start, helper.end)
  return Function(
    `'use strict';${gateText};${helperText};return ${helper.name}`,
  )()
}

function residueIdentities() {
  return fixture.row.residues.map(residue => [
    fixture.row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ])
}

test(
  'Target119 consolidation-template fixture and owner override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_CONSOLIDATION_PROMPT_TEMPLATE_EVIDENCE_IDS,
    )
    assert.deepEqual(
      TARGET119_CONSOLIDATION_PROMPT_TEMPLATE_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: row.paths,
        declarations: row.declarations,
        evidenceIds: row.evidenceIds,
      })),
      [
        {
          targetIndex: fixture.row.targetIndex,
          paths: fixture.row.ownerPaths,
          declarations: fixture.row.declarations,
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
    assert.equal(
      sha256(JSON.stringify([fixture.row.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(residueIdentities())),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated bundles prove a template-quasi split rather than new summary text',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural delta',
        ),
      ),
    )
    const region = structural.regions.find(
      row => row.target?.index === fixture.target.unit.targetIndex,
    )
    assert(region)
    assert.deepEqual(
      {
        classification: region.classification,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        classification: 'unresolved',
        nodeType: fixture.target.unit.nodeType,
        start: fixture.target.unit.start,
        end: fixture.target.unit.end,
        sourceHash: fixture.target.unit.sha256,
        coarseHash: fixture.target.unit.coarseHash,
      },
    )

    const residue = fixture.row.residues[0]
    const baselineUnit = baseline.slice(
      fixture.baseline.unit.start,
      fixture.baseline.unit.end,
    )
    const targetUnit = target.slice(
      fixture.target.unit.start,
      fixture.target.unit.end,
    )
    assert.deepEqual(descriptor(baselineUnit), {
      bytes: fixture.baseline.unit.bytes,
      sha256: fixture.baseline.unit.sha256,
    })
    assert.deepEqual(descriptor(targetUnit), {
      bytes: fixture.target.unit.bytes,
      sha256: fixture.target.unit.sha256,
    })
    const baselineSuffix = baseline.slice(
      fixture.baseline.suffix.start,
      fixture.baseline.suffix.end,
    )
    const targetSuffix = target.slice(
      fixture.target.suffix.start,
      fixture.target.suffix.end,
    )
    assert.equal(baselineSuffix, residue.value)
    assert.equal(targetSuffix, residue.value)
    assert.deepEqual(descriptor(baselineSuffix), {
      bytes: fixture.baseline.suffix.bytes,
      sha256: fixture.baseline.suffix.sha256,
    })
    assert.deepEqual(descriptor(targetSuffix), {
      bytes: fixture.target.suffix.bytes,
      sha256: fixture.target.suffix.sha256,
    })

    const baselineParsed = parsedFunction(
      baselineUnit,
      fixture.baseline.unit.name,
    )
    const targetParsed = parsedFunction(targetUnit, fixture.target.unit.name)
    const baselineQuasis = baselineParsed.template.quasis.filter(quasi =>
      quasi.value.cooked.endsWith(residue.value),
    )
    const targetQuasis = targetParsed.template.quasis.filter(
      quasi => quasi.value.cooked === residue.value,
    )
    assert.equal(baselineQuasis.length, 1)
    assert.notEqual(baselineQuasis[0].value.cooked, residue.value)
    assert.equal(targetQuasis.length, 1)
    assert.deepEqual(
      {
        start: targetQuasis[0].start + fixture.target.unit.start,
        end: targetQuasis[0].end + fixture.target.unit.start,
      },
      { start: residue.start, end: residue.end },
    )
    const targetQuasiIndex = targetParsed.template.quasis.indexOf(targetQuasis[0])
    const precedingExpression = targetParsed.template.expressions[targetQuasiIndex - 1]
    assert.equal(precedingExpression.type, 'CallExpression')
    assert.equal(precedingExpression.callee.name, 'KE7')

    const helpers = new Map(
      fixture.target.disabledHelpers.map(row => [row.name, row]),
    )
    for (const helper of fixture.target.disabledHelpers) {
      assert.deepEqual(
        descriptor(target.slice(helper.start, helper.end)),
        { bytes: helper.bytes, sha256: helper.sha256 },
        helper.name,
      )
    }
    const qE7 = disabledHelper(target, helpers.get('DV1'), helpers.get('qE7'))
    const KE7 = disabledHelper(target, helpers.get('XV1'), helpers.get('KE7'))
    assert.equal(qE7(), '')
    assert.equal(KE7(), '')
  },
)

test(
  'exact TypeScript template owns the split suffix and matches target runtime output',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const sourceBytes = readExact(
      path.join(sourceRoot, fixture.inputs.source.path.replace(/^src\//, '')),
      fixture.inputs.source,
      'Target119 consolidation source',
    )
    const source = sourceBytes.toString('utf8')
    const sourceFile = ts.createSourceFile(
      fixture.inputs.source.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.deepEqual(sourceFile.parseDiagnostics, [])
    const declaration = sourceFile.statements.find(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === fixture.source.declaration.name,
    )
    assert(declaration)
    const declarationText = source.slice(
      declaration.getStart(sourceFile),
      declaration.end,
    )
    assert.deepEqual(descriptor(declarationText), {
      bytes: fixture.source.declaration.bytes,
      sha256: fixture.source.declaration.sha256,
    })
    assert.deepEqual(
      { start: declaration.getStart(sourceFile), end: declaration.end },
      { start: fixture.source.declaration.start, end: fixture.source.declaration.end },
    )
    const returnStatement = declaration.body.statements.find(ts.isReturnStatement)
    assert(returnStatement)
    assert(ts.isTemplateExpression(returnStatement.expression))
    const ownerSpan = returnStatement.expression.templateSpans.find(
      span =>
        span.expression.getText(sourceFile) === fixture.source.precedingExpression,
    )
    assert(ownerSpan)
    assert.equal(ownerSpan.literal.text, `\n${fixture.row.residues[0].value}`)
    assert.equal(
      source.slice(fixture.source.suffix.start, fixture.source.suffix.end),
      fixture.row.residues[0].value,
    )
    assert.deepEqual(
      descriptor(source.slice(fixture.source.suffix.start, fixture.source.suffix.end)),
      { bytes: fixture.source.suffix.bytes, sha256: fixture.source.suffix.sha256 },
    )

    const constants = new Map()
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const item of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(item.name) &&
          item.initializer &&
          ts.isNoSubstitutionTemplateLiteral(item.initializer)
        ) {
          constants.set(item.name.text, item.initializer.text)
        }
      }
    }
    const imported = {
      DIR_EXISTS_GUIDANCE: '[DIR EXISTS GUIDANCE]',
      ENTRYPOINT_NAME: 'MEMORY.md',
      MAX_ENTRYPOINT_LINES: 321,
    }
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const sourceModule = { exports: {} }
    Function('require', 'module', 'exports', transpiled)(
      specifier => {
        assert.equal(specifier, '../../memdir/memdir.js')
        return imported
      },
      sourceModule,
      sourceModule.exports,
    )
    const sourceFunction = sourceModule.exports.buildConsolidationPrompt
    assert.equal(typeof sourceFunction, 'function')

    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
    ).toString('utf8')
    const targetUnit = target.slice(
      fixture.target.unit.start,
      fixture.target.unit.end,
    )
    const helpers = new Map(
      fixture.target.disabledHelpers.map(row => [row.name, row]),
    )
    const qE7 = disabledHelper(target, helpers.get('DV1'), helpers.get('qE7'))
    const KE7 = disabledHelper(target, helpers.get('XV1'), helpers.get('KE7'))
    const targetFunction = Function(
      'izH',
      'LV1',
      'IW',
      'R6H',
      'PV1',
      'qE7',
      'KE7',
      `'use strict';${targetUnit};return ${fixture.target.unit.name}`,
    )(
      imported.DIR_EXISTS_GUIDANCE,
      constants.get('TEAM_MEMORY_GUIDANCE'),
      imported.ENTRYPOINT_NAME,
      imported.MAX_ENTRYPOINT_LINES,
      constants.get('RECONCILE_MEMORIES_AGAINST_CLAUDE_MD'),
      qE7,
      KE7,
    )
    for (const args of [
      ['/memory', '/transcripts', '', false],
      ['/m with spaces', '/t', 'extra context', false],
      ['/team', '/logs', 'team context', true],
    ]) {
      const sourceOutput = sourceFunction(...args)
      const targetOutput = targetFunction(...args)
      assert.equal(targetOutput, sourceOutput)
      assert.equal(
        targetOutput.split(fixture.row.residues[0].value).length - 1,
        1,
      )
    }
  },
)

test(
  'coverage admits u13902 only through the bounded consolidation owner proof',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const row = coverage.rows.find(
      item => item.targetIndex === fixture.row.targetIndex,
    )
    assert(row)
    const integrated = fixture.evidenceIds.every(id => row.evidenceIds.includes(id))
    if (!integrated) {
      assert.deepEqual(row.evidenceIds, ['source-map-attribution', 'semantic-test'])
      return
    }
    assert.deepEqual(row.evidenceIds, fixture.evidenceIds)
    const ownerPaths = row.ownerIds.map(
      id => coverage.owners.find(owner => owner.id === id)?.path,
    )
    assert.deepEqual(ownerPaths, fixture.row.ownerPaths)
    assert.equal(row.disposition, 'source-runtime-covered')
  },
)
