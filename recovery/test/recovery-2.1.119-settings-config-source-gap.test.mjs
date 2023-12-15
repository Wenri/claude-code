import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  parse,
  parseExpressionAt,
} from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_SETTINGS_CONFIG_EVIDENCE_IDS,
  TARGET119_SETTINGS_CONFIG_INPUT_FILES,
  TARGET119_SETTINGS_CONFIG_OUTPUT_FILES,
  TARGET119_SETTINGS_CONFIG_OWNER_OVERRIDES,
  applyTarget119SettingsConfigReleaseChannelSourceRecovery,
  buildTarget119SettingsConfigReleaseChannelOutput,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-settings-config-release-channel-source-gap.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-settings-config-source-gap.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/replay-settings-config-release-channel-source-gap.mjs',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '40edd90925ef32678559e32e4fcda763c524afffa4918af0d304a1c12f4e97cc'
const HELPER_SHA256 =
  '9778e1b91a2873dc020b7b0a6c79242e2f91a9b2e3020903d3b2d5d9c29b9256'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  return {
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function parseUnit(value) {
  return parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
}

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalAst(entry, value, index))
  }
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (key === 'name' && value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          parent.computed === false &&
          parentKey === 'property') ||
        (parent?.type === 'Property' &&
          parent.computed === false &&
          parent.shorthand === false &&
          parentKey === 'key') ||
        (parent?.type === 'MethodDefinition' &&
          parent.computed === false &&
          parentKey === 'key')
      result[key] = preserve ? child : '@id'
    } else {
      result[key] = canonicalAst(child, value, key)
    }
  }
  return result
}

function canonicalDescriptorFromAst(ast) {
  const serialized = JSON.stringify(canonicalAst(ast))
  return {
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function canonicalUnitDescriptor(value) {
  return canonicalDescriptorFromAst(parseUnit(value))
}

function statementRows(unitBytes, absoluteStart) {
  const source = unitBytes.toString()
  const declaration = parseUnit(unitBytes).body[0]
  return declaration.body.body.map((statement, index) => {
    const value = source.slice(statement.start, statement.end)
    const canonical = JSON.stringify(canonicalAst(statement))
    return [
      index,
      statement.type,
      absoluteStart + statement.start,
      absoluteStart + statement.end,
      Buffer.byteLength(value),
      sha256(value),
      Buffer.byteLength(canonical),
      sha256(canonical),
    ]
  })
}

function rowsDescriptor(rows) {
  const serialized = JSON.stringify(rows)
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function sourceRowIdentity(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function assertRegion(structural, expected) {
  const region = structural.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      classification: expected.classification,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
  if ('baselineUnitIndex' in expected) {
    assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
    assert.equal(region.pairReason, expected.pairReason)
  }
  return region
}

function gitBytes(commit, filename) {
  return execFileSync('git', ['show', `${commit}:${filename}`], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 4 * 1024 * 1024,
  })
}

function gitBlob(commit, filename) {
  return execFileSync('git', ['rev-parse', `${commit}:${filename}`], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function walkTs(ts, node, predicate, values = []) {
  if (predicate(node)) values.push(node)
  ts.forEachChild(node, child => {
    walkTs(ts, child, predicate, values)
  })
  return values
}

function tsNodeDescriptor(sourceFile, source, node) {
  const start = node.getStart(sourceFile)
  const end = node.getEnd()
  const value = source.slice(start, end)
  return {
    start,
    end,
    bytes: Buffer.byteLength(value),
    chars: value.length,
    sha256: sha256(value),
  }
}

function tsDeclarationDescriptor(sourceFile, source, name) {
  const declaration = sourceFile.statements.find(
    statement => statement.name?.text === name,
  )
  assert(declaration, name)
  return tsNodeDescriptor(sourceFile, source, declaration)
}

function markerCounts(source) {
  const occurrences = needle => source.split(needle).length - 1
  return {
    leftArrowLabel: occurrences('← opens agents'),
    leftArrowProperty: occurrences('leftArrowOpensAgents'),
    macroVersion: occurrences('MACRO.VERSION'),
    rcLiteral: occurrences("'rc'"),
    slowLiteral: occurrences("'slow'"),
  }
}

function sourceState(bytes) {
  const actual = descriptor(bytes)
  const input = TARGET119_SETTINGS_CONFIG_INPUT_FILES[0]
  const output = TARGET119_SETTINGS_CONFIG_OUTPUT_FILES[0]
  if (actual.bytes === input.bytes && actual.sha256 === input.sha256) return 'raw'
  if (actual.bytes === output.bytes && actual.sha256 === output.sha256)
    return 'recovered'
  assert.fail(`unknown Config.tsx state ${actual.bytes}/${actual.sha256}`)
}

function makeTempSource(configBytes) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target119-settings-config-'),
  )
  const directory = path.join(temporaryRoot, 'components/Settings')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'Config.tsx'), configBytes)
  return temporaryRoot
}

test(
  'Target119 Settings Config fixture and one-file replay helper are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.replayDecision.mode, 'bounded-source-replay')
    assert.deepEqual(
      TARGET119_SETTINGS_CONFIG_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET119_SETTINGS_CONFIG_INPUT_FILES, [
      {
        path: fixture.sourceRecovery.path,
        bytes: fixture.sourceRecovery.raw.bytes,
        sha256: fixture.sourceRecovery.raw.sha256,
      },
    ])
    assert.deepEqual(TARGET119_SETTINGS_CONFIG_OUTPUT_FILES, [
      {
        path: fixture.sourceRecovery.path,
        bytes: fixture.sourceRecovery.post.bytes,
        sha256: fixture.sourceRecovery.post.sha256,
      },
    ])
    assert.deepEqual(TARGET119_SETTINGS_CONFIG_OWNER_OVERRIDES, [
      {
        key: `${caseName}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.sourceRecovery.path],
        declarations: ['getEffectiveConfig', 'Config'],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
    ])
  },
)

test(
  'authenticated Target119 Config is a complete 15-statement unit with an exact residue set',
  { skip: !selected },
  () => {
    const baseline = readPinned(fixture.inputs.baselineBundle)
    const target = readPinned(fixture.inputs.targetBundle)
    const structural = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
    )

    const baselineRegion = structural.unmatchedBaseline.find(
      candidate => candidate.index === fixture.baselineUnit.baselineIndex,
    )
    assert(baselineRegion)
    assert.deepEqual(
      {
        nodeType: baselineRegion.nodeType,
        start: baselineRegion.start,
        end: baselineRegion.end,
        bytes: baselineRegion.end - baselineRegion.start,
        tokenCount: baselineRegion.tokenCount,
        sha256: baselineRegion.sourceHash,
        coarseHash: baselineRegion.coarseHash,
      },
      {
        nodeType: fixture.baselineUnit.nodeType,
        start: fixture.baselineUnit.start,
        end: fixture.baselineUnit.end,
        bytes: fixture.baselineUnit.bytes,
        tokenCount: fixture.baselineUnit.tokenCount,
        sha256: fixture.baselineUnit.sha256,
        coarseHash: fixture.baselineUnit.coarseHash,
      },
    )
    const baselineUnit = slicePinned(baseline, fixture.baselineUnit)
    assert.deepEqual(
      canonicalUnitDescriptor(baselineUnit),
      {
        bytes: fixture.baselineUnit.canonicalAstBytes,
        sha256: fixture.baselineUnit.canonicalAstSha256,
      },
    )
    const baselineStatements = rowsDescriptor(
      statementRows(baselineUnit, fixture.baselineUnit.start),
    )
    assert.deepEqual(
      {
        statements: baselineStatements.rows,
        jsonBytes: baselineStatements.jsonBytes,
        sha256: baselineStatements.sha256,
      },
      fixture.baselineUnit.bodyStatements,
    )

    assertRegion(structural, fixture.targetUnit)
    const targetUnit = slicePinned(target, fixture.targetUnit)
    assert.deepEqual(canonicalUnitDescriptor(targetUnit), {
      bytes: fixture.targetUnit.canonicalAstBytes,
      sha256: fixture.targetUnit.canonicalAstSha256,
    })
    const targetStatements = rowsDescriptor(
      statementRows(targetUnit, fixture.targetUnit.start),
    )
    assert.deepEqual(
      {
        statements: targetStatements.rows,
        jsonBytes: targetStatements.jsonBytes,
        sha256: targetStatements.sha256,
      },
      fixture.targetUnit.bodyStatements,
    )
    const targetDeclaration = parseUnit(targetUnit).body[0]
    assert.equal(targetDeclaration.type, 'FunctionDeclaration')
    assert.deepEqual(
      targetDeclaration.params[0].properties.map(property => property.key.name),
      fixture.targetUnit.props,
    )

    const reportPath = path.join(root, fixture.inputs.targetReport.path)
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
      const select = rows =>
        rows.filter(
          row => row.structural.index === fixture.targetUnit.targetIndex,
        )
      const added = select(report.sourceRuntimeAddedOwnerResidueRows)
      assert.ok(
        added.length === 0 ||
          JSON.stringify(added.map(sourceRowIdentity)) ===
            JSON.stringify(fixture.ownerResidues.rows),
        'scanner is exact pre/post-evidence state',
      )
      if (added.length > 0) {
        assert.deepEqual(
          rowsDescriptor(added.map(sourceRowIdentity)),
          fixture.ownerResidues.addedOwnerRows,
        )
        assert.deepEqual(
          rowsDescriptor(
            select(report.sourceRuntimeOwnerResidueRows).map(sourceRowIdentity),
          ),
          fixture.ownerResidues.allOwnerRows,
        )
        for (const row of added) {
          assert.deepEqual(row.ownerPaths, [fixture.ownerResidues.ownerPath])
        }
      }
      const strict = select(report.rows)
      assert.ok(
        strict.length === 0 ||
          rowsDescriptor(strict.map(sourceRowIdentity)).sha256 ===
            fixture.ownerResidues.rawScannerRows.sha256,
      )
    }

    for (const row of fixture.ownerResidues.rows) {
      const raw = target.subarray(row[3], row[4]).toString()
      const value = raw.startsWith('"') ? JSON.parse(raw) : raw
      assert.equal(value, row[2])
    }
  },
)

test(
  'left-arrow, release-channel, and build-macro runtime contracts are exact',
  { skip: !selected },
  () => {
    const baseline = readPinned(fixture.inputs.baselineBundle)
    const target = readPinned(fixture.inputs.targetBundle)
    const structural = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
    )
    const arrow = fixture.supportingUnits.arrowSymbols
    assertRegion(structural, {
      ...arrow,
      unknownFreeIdentifierCount: 0,
    })
    slicePinned(target, arrow)
    const arrowDeclarator = slicePinned(target, arrow.declarator).toString()
    const arrowAst = parse(`var ${arrowDeclarator}`, {
      ecmaVersion: 'latest',
    }).body[0].declarations[0]
    assert.equal(arrowAst.init.raw, arrow.declarator.raw)
    assert.equal(arrowAst.init.value, arrow.declarator.value)

    for (const key of ['effectiveConfig', 'configInitializer']) {
      const expected = fixture.supportingUnits[key]
      assertRegion(structural, expected)
      slicePinned(target, expected)
    }

    const unitText = slicePinned(target, fixture.targetUnit).toString()
    const baselineText = slicePinned(baseline, fixture.baselineUnit).toString()
    assert.equal(baselineText.includes(' opens agents'), false)
    assert.equal(baselineText.includes('"slow"'), false)

    const leftArrow = fixture.runtimeContract.leftArrowAgents
    const label = slicePinned(target, leftArrow.labelTemplate).toString()
    assert.equal(label, '`${A4H} opens agents`')
    const setting = slicePinned(target, leftArrow.settingObject).toString()
    assert.match(setting, /id:"leftArrowOpensAgents"/)
    assert.match(setting, /setting:"leftArrowOpensAgents"/)
    assert.match(setting, /value:String\(/)
    const change = slicePinned(target, leftArrow.changeTemplate).toString()
    assert.match(change, /Enabled/)
    assert.match(change, /Disabled/)
    assert.match(change, /opens agents/)

    const release = fixture.runtimeContract.releaseChannelDisplay
    const expressions = release.expressions.map(expected =>
      slicePinned(target, expected).toString(),
    )
    assert.equal(new Set(expressions).size, 1)
    assert.equal(unitText.split('"slow"').length - 1, 2)
    assert.equal(unitText.split('"rc"').length - 1, 2)
    for (const expression of expressions) {
      const ast = parseExpressionAt(expression, 0, { ecmaVersion: 'latest' })
      assert.deepEqual(
        canonicalDescriptorFromAst(ast),
        release.canonicalExpression,
      )
      assert.equal(ast.type, 'ConditionalExpression')
      assert.equal(ast.test.operator, '===')
      assert.equal(ast.test.right.value, release.input)
      assert.equal(ast.consequent.value, release.display)
      assert.equal(ast.alternate.operator, '??')
      assert.equal(ast.alternate.right.value, release.fallback)
    }

    const macro = fixture.runtimeContract.buildMacro
    const objects = macro.objectExpressions.map(expected =>
      slicePinned(target, expected).toString(),
    )
    assert.equal(new Set(objects).size, 1)
    for (const [index, source] of objects.entries()) {
      const object = parseExpressionAt(source, 0, { ecmaVersion: 'latest' })
      const properties = Object.fromEntries(
        object.properties.map(property => [
          property.key.name ?? property.key.value,
          property.value.value,
        ]),
      )
      for (const [key, value] of Object.entries(macro.values)) {
        assert.equal(properties[key], value)
      }
      const memberStart = macro.objectExpressions[index].start
      const member = target.subarray(memberStart, memberStart + macro.memberExpressionBytes)
      assert.equal(sha256(member), macro.memberExpressionSha256)
      assert.equal(member.toString().endsWith('.VERSION'), true)
    }
  },
)

test(
  'source lineage, same-release rc semantics, and Settings caller authenticate the replay boundary',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const source = fixture.sourceRecovery
    const rawBytes = gitBytes(source.commit, source.path)
    assert.deepEqual(descriptor(rawBytes), {
      bytes: source.raw.bytes,
      sha256: source.raw.sha256,
    })
    assert.equal(gitBlob(source.commit, source.path), source.blob)
    const raw = rawBytes.toString()
    const rawFile = ts.createSourceFile(
      source.path,
      raw,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(rawFile.parseDiagnostics.length, 0)
    assert.deepEqual(
      tsDeclarationDescriptor(rawFile, raw, 'getEffectiveConfig'),
      source.raw.getEffectiveConfig,
    )
    assert.deepEqual(
      tsDeclarationDescriptor(rawFile, raw, 'Config'),
      source.raw.Config,
    )
    assert.deepEqual(markerCounts(raw), source.raw.markerCounts)

    const baseline = fixture.sourceBoundary.baseline
    const baselineBytes = gitBytes(baseline.commit, baseline.path)
    assert.deepEqual(descriptor(baselineBytes), {
      bytes: baseline.bytes,
      sha256: baseline.sha256,
    })
    assert.equal(gitBlob(baseline.commit, baseline.path), baseline.blob)
    const baselineSource = baselineBytes.toString()
    const baselineFile = ts.createSourceFile(
      baseline.path,
      baselineSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(baselineFile.parseDiagnostics.length, 0)
    assert.deepEqual(
      tsDeclarationDescriptor(baselineFile, baselineSource, 'Config'),
      baseline.Config,
    )
    assert.deepEqual(markerCounts(baselineSource), baseline.markerCounts)

    const diff = execFileSync(
      'git',
      [
        'diff',
        '--no-ext-diff',
        '--no-color',
        '--no-renames',
        baseline.commit,
        source.commit,
        '--',
        source.path,
      ],
      { cwd: root, encoding: 'buffer' },
    )
    assert.deepEqual(descriptor(diff), {
      bytes: fixture.sourceBoundary.gitDiff.bytes,
      sha256: fixture.sourceBoundary.gitDiff.sha256,
    })
    assert.equal(
      diff.toString().split('\n').length - 1,
      fixture.sourceBoundary.gitDiff.lines,
    )
    assert.match(diff.toString(), /leftArrowOpensAgents/)
    assert.match(diff.toString(), /function getEffectiveConfig/)

    const sourceNodes = walkTs(ts, rawFile, () => true)
    const nodeWithDescriptor = expected => {
      const node = sourceNodes.find(candidate => {
        const actual = tsNodeDescriptor(rawFile, raw, candidate)
        return actual.start === expected.start && actual.end === expected.end
      })
      assert(node, `${expected.start}..${expected.end}`)
      assert.deepEqual(tsNodeDescriptor(rawFile, raw, node), expected)
      return node
    }
    nodeWithDescriptor(fixture.sourceBoundary.leftArrowSource.labelProperty)
    nodeWithDescriptor(fixture.sourceBoundary.leftArrowSource.settingObject)
    nodeWithDescriptor(fixture.sourceBoundary.leftArrowSource.changeTemplate)
    for (const expected of fixture.sourceBoundary.macroSourceExpressions) {
      const node = nodeWithDescriptor({ ...expected, chars: expected.bytes })
      assert.equal(raw.slice(node.getStart(), node.getEnd()), 'MACRO.VERSION')
    }

    const schema = source.sameReleaseSchema
    const schemaBytes = gitBytes(source.commit, schema.path)
    assert.deepEqual(descriptor(schemaBytes), {
      bytes: schema.bytes,
      sha256: schema.sha256,
    })
    assert.equal(gitBlob(source.commit, schema.path), schema.blob)
    const schemaText = schemaBytes.toString()
    assert.equal(schemaText.slice(schema.enumCall.start, schema.enumCall.end),
      "z\n        .enum(['latest', 'stable', 'rc'])")
    assert.equal(
      sha256(schemaText.slice(schema.enumCall.start, schema.enumCall.end)),
      schema.enumCall.sha256,
    )

    const donor = source.sameReleaseDisplayDonor
    const donorBytes = gitBytes(source.commit, donor.path)
    assert.deepEqual(descriptor(donorBytes), {
      bytes: donor.bytes,
      sha256: donor.sha256,
    })
    assert.equal(gitBlob(source.commit, donor.path), donor.blob)
    const donorDeclaration = donorBytes
      .toString()
      .slice(donor.declaration.start, donor.declaration.end)
    assert.equal(
      donorDeclaration,
      "displayChannel = channel === 'rc' ? 'slow' : channel",
    )
    assert.equal(sha256(donorDeclaration), donor.declaration.sha256)

    const caller = fixture.sourceBoundary.settingsCaller
    const callerBytes = gitBytes(source.commit, caller.path)
    assert.deepEqual(descriptor(callerBytes), {
      bytes: caller.bytes,
      sha256: caller.sha256,
    })
    assert.equal(gitBlob(source.commit, caller.path), caller.blob)
    assert.equal(gitBlob(baseline.commit, caller.path), caller.blob)
    const callerText = callerBytes.toString()
    const callerFile = ts.createSourceFile(
      caller.path,
      callerText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(callerFile.parseDiagnostics.length, 0)
    assert.deepEqual(
      tsDeclarationDescriptor(callerFile, callerText, 'Settings'),
      caller.Settings,
    )
    for (const expected of [caller.import, caller.configJsx]) {
      const value = callerText.slice(expected.start, expected.end)
      assert.equal(Buffer.byteLength(value), expected.bytes)
      assert.equal(sha256(value), expected.sha256)
    }
  },
)

test(
  'bounded Config replay is exact, parse-clean, idempotent, and package-aware',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const source = fixture.sourceRecovery
    const rawBytes = gitBytes(source.commit, source.path)
    const post = Buffer.from(
      buildTarget119SettingsConfigReleaseChannelOutput(rawBytes.toString()),
    )
    assert.deepEqual(descriptor(post), {
      bytes: source.post.bytes,
      sha256: source.post.sha256,
    })
    const postText = post.toString()
    const postFile = ts.createSourceFile(
      source.path,
      postText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(postFile.parseDiagnostics.length, 0)
    assert.deepEqual(
      tsDeclarationDescriptor(postFile, postText, 'getEffectiveConfig'),
      source.post.getEffectiveConfig,
    )
    assert.deepEqual(
      tsDeclarationDescriptor(postFile, postText, 'Config'),
      source.post.Config,
    )
    assert.deepEqual(markerCounts(postText), source.post.markerCounts)

    const conditionals = walkTs(
      ts,
      postFile,
      node =>
        ts.isConditionalExpression(node) &&
        postText
          .slice(node.condition.getStart(postFile), node.condition.getEnd())
          .includes("autoUpdatesChannel === 'rc'"),
    )
    assert.equal(conditionals.length, 2)
    assert.deepEqual(
      conditionals.map(node =>
        tsNodeDescriptor(postFile, postText, node),
      ),
      source.postConditionalExpressions.map(expected => ({
        ...expected,
        chars: expected.bytes,
      })),
    )
    for (const node of conditionals) {
      const expression = postText.slice(node.getStart(postFile), node.getEnd())
      assert.deepEqual(
        canonicalDescriptorFromAst(
          parseExpressionAt(expression, 0, { ecmaVersion: 'latest' }),
        ),
        fixture.runtimeContract.releaseChannelDisplay.canonicalExpression,
      )
    }

    const rawTail = rawBytes
      .toString()
      .slice(source.sourceMapTail.rawStart)
    const postTail = postText.slice(source.sourceMapTail.postStart)
    assert.equal(rawTail, postTail)
    assert.deepEqual(descriptor(postTail), {
      bytes: source.sourceMapTail.bytes,
      sha256: source.sourceMapTail.sha256,
    })
    assert.equal(postTail.length, source.sourceMapTail.chars)

    const temporaryRoot = makeTempSource(rawBytes)
    try {
      assert.deepEqual(
        applyTarget119SettingsConfigReleaseChannelSourceRecovery({
          sourceRoot: temporaryRoot,
        }),
        {
          status: 'recovered',
          files: [source.path],
        },
      )
      const recovered = fs.readFileSync(
        path.join(temporaryRoot, 'components/Settings/Config.tsx'),
      )
      assert.deepEqual(recovered, post)
      assert.deepEqual(
        applyTarget119SettingsConfigReleaseChannelSourceRecovery({
          sourceRoot: temporaryRoot,
        }),
        { status: 'already-recovered', files: [] },
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }

    const configured = fs.readFileSync(
      path.join(sourceRoot, 'components/Settings/Config.tsx'),
    )
    assert.ok(['raw', 'recovered'].includes(sourceState(configured)))
    const packageRoot = makeTempSource(configured)
    try {
      const result =
        applyTarget119SettingsConfigReleaseChannelSourceRecovery({
          sourceRoot: packageRoot,
        })
      assert.equal(
        result.status,
        sourceState(configured) === 'raw' ? 'recovered' : 'already-recovered',
      )
      assert.deepEqual(
        descriptor(
          fs.readFileSync(
            path.join(packageRoot, 'components/Settings/Config.tsx'),
          ),
        ),
        { bytes: source.post.bytes, sha256: source.post.sha256 },
      )
    } finally {
      fs.rmSync(packageRoot, { recursive: true, force: true })
    }
  },
)

test(
  'Config replay rejects drift and symlinks before writing',
  { skip: !selected },
  () => {
    const source = fixture.sourceRecovery
    const rawBytes = gitBytes(source.commit, source.path)
    const drifted = Buffer.from(rawBytes)
    drifted[0] = drifted[0] === 0x69 ? 0x49 : 0x69
    const driftRoot = makeTempSource(drifted)
    try {
      assert.throws(
        () =>
          applyTarget119SettingsConfigReleaseChannelSourceRecovery({
            sourceRoot: driftRoot,
          }),
        /requires exact raw or recovered/,
      )
      assert.deepEqual(
        fs.readFileSync(
          path.join(driftRoot, 'components/Settings/Config.tsx'),
        ),
        drifted,
      )
    } finally {
      fs.rmSync(driftRoot, { recursive: true, force: true })
    }

    const symlinkRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-settings-config-symlink-'),
    )
    try {
      const directory = path.join(symlinkRoot, 'components/Settings')
      fs.mkdirSync(directory, { recursive: true })
      const donor = path.join(symlinkRoot, 'Config.real.tsx')
      fs.writeFileSync(donor, rawBytes)
      fs.symlinkSync(donor, path.join(directory, 'Config.tsx'))
      assert.throws(
        () =>
          applyTarget119SettingsConfigReleaseChannelSourceRecovery({
            sourceRoot: symlinkRoot,
          }),
        /expected a real source file/,
      )
      assert.deepEqual(fs.readFileSync(donor), rawBytes)
    } finally {
      fs.rmSync(symlinkRoot, { recursive: true, force: true })
    }

    const badSource = rawBytes
      .toString()
      .replace(
        "value: settingsData?.autoUpdatesChannel ?? 'latest',",
        "value: settingsData?.autoUpdatesChannel ?? 'stable',",
      )
    assert.throws(
      () => buildTarget119SettingsConfigReleaseChannelOutput(badSource),
      /expected one anchor, got 0/,
    )
  },
)
