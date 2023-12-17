import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET117_FORK_GATE_SEMANTIC_EVOLUTION_EVIDENCE_IDS,
  TARGET117_FORK_GATE_SEMANTIC_EVOLUTION_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/fork-gate-semantic-evolution-overrides.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-fork-gate-semantic-evolution-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f527b8b58c0c985bba9e456b1dfefbbae2a7e298d80d31dc5fca33bc5b1b2510'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function exactSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value.toString('utf8')
}

function exactStringSlice(source, expected, label) {
  const value = source.slice(expected.start, expected.end)
  assert.equal(value.length, expected.chars ?? expected.end - expected.start)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value
}

function bundlePath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function parseUnit(bytes, expected, label) {
  const source = exactSlice(bytes, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { source, node: program.body[0] }
}

function canonicalAst(source) {
  const program = parse(source, { ecmaVersion: 'latest' })

  function canonicalize(value, parent = undefined, key = undefined) {
    if (Array.isArray(value)) {
      return value.map((child, index) => canonicalize(child, value, index))
    }
    if (value === null || typeof value !== 'object') return value
    const result = {}
    for (const [childKey, child] of Object.entries(value)) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
      if (value.type === 'Identifier' && childKey === 'name') {
        const retain =
          (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
          (parent?.type === 'MemberExpression' &&
            key === 'property' &&
            !parent.computed)
        result[childKey] = retain ? child : '@id'
      } else {
        result[childKey] = canonicalize(child, value, childKey)
      }
    }
    return result
  }

  const normalized = JSON.stringify(canonicalize(program))
  return { normalized, chars: normalized.length, ...descriptor(normalized) }
}

function structuralLedger(expected) {
  return JSON.parse(
    gunzipSync(
      readExact(
        path.join(repositoryRoot, expected.path),
        expected,
        expected.path,
      ),
    ),
  )
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function parseSource(ts, filename, source) {
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${filename}: parse clean`)
  return parsed
}

function statementName(ts, statement) {
  if (statement.name?.text) return statement.name.text
  if (ts.isVariableStatement(statement)) {
    const declarations = statement.declarationList.declarations
    if (declarations.length === 1 && declarations[0].name?.text) {
      return declarations[0].name.text
    }
  }
  return undefined
}

function sourceDeclaration(ts, parsed, name) {
  return parsed.statements.find(statement => statementName(ts, statement) === name)
}

function sourceNodeType(ts, node) {
  if (ts.isVariableStatement(node)) return 'VariableStatement'
  if (ts.isFunctionDeclaration(node)) return 'FunctionDeclaration'
  if (ts.isTypeAliasDeclaration(node)) return 'TypeAliasDeclaration'
  return ts.SyntaxKind[node.kind]
}

function assertSourceDeclaration(ts, parsed, source, expected, label) {
  const node = sourceDeclaration(ts, parsed, expected.name)
  assert.ok(node, `${label}: declaration ${expected.name}`)
  assert.equal(sourceNodeType(ts, node), expected.nodeType, `${label}: node type`)
  assert.equal(node.getStart(parsed), expected.start, `${label}: start`)
  assert.equal(node.end, expected.end, `${label}: end`)
  exactStringSlice(source, expected, `${label}: bytes`)
  return node
}

function gitBytes(commit, sourcePath) {
  return execFileSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
  })
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
  )
}

function selectedSourceFile() {
  return path.join(selectedSourceRoot(), 'tools/AgentTool/forkSubagent.ts')
}

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
}

function returnValue(statement) {
  const target = statement.type === 'IfStatement' ? statement.consequent : statement
  assert.equal(target.type, 'ReturnStatement')
  assert.equal(target.argument.type, 'Literal')
  return target.argument.value
}

function directCallName(expression) {
  assert.equal(expression.type, 'CallExpression')
  assert.equal(expression.callee.type, 'Identifier')
  return expression.callee.name
}

function target117Result({ noninteractive, environment, growthbook }) {
  if (noninteractive) return 'disabled'
  if (environment) return 'env'
  if (growthbook) return 'gb_rollout'
  return 'disabled'
}

function raw117Enabled({ noninteractive, environment, growthbook }) {
  if (noninteractive) return false
  if (environment) return true
  return growthbook
}

function laterSourceResult({ noninteractive, environment, growthbook }) {
  if (environment) return 'env'
  if (noninteractive) return 'disabled'
  if (growthbook) return 'gb_rollout'
  return 'disabled'
}

test(
  'Target117 fork-gate evolution fixture and static override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-semantic-evolution-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET117_FORK_GATE_SEMANTIC_EVOLUTION_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.equal(TARGET117_FORK_GATE_SEMANTIC_EVOLUTION_OVERRIDES.length, 1)
    const override = TARGET117_FORK_GATE_SEMANTIC_EVOLUTION_OVERRIDES[0]
    assert.deepEqual(override, {
      key: `${caseName}:8727`,
      targetIndex: 8727,
      paths: ['src/tools/AgentTool/forkSubagent.ts'],
      declarations: ['resolveForkSubagentSource'],
      evidenceIds: fixture.evidenceIds,
      behavior: override.behavior,
    })
    assert.match(override.behavior, /historical priority order/)
    assert.match(override.behavior, /never a later-source replay/)
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET117_FORK_GATE_SEMANTIC_EVOLUTION_OVERRIDES',
    )
    readExact(path.join(repositoryRoot, fixture.helper.path), fixture.helper)
  },
)

test(
  'Target117 bundle authenticates the resolver, one residue, and its complete fork owner closure',
  { skip: !selected },
  () => {
    const baseline = readExact(
      bundlePath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.bundles.baseline116),
      fixture.bundles.baseline116,
      'Target116 bundle',
    )
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.bundles.target117),
      fixture.bundles.target117,
      'Target117 bundle',
    )
    const ledger = structuralLedger(fixture.structuralLedgers['117'])
    const region = ledger.regions[fixture.target117Resolver.targetIndex]
    assert.deepEqual(
      {
        classification: region.classification,
        targetIndex: region.target.index,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        tokenCount: region.target.tokenCount,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
        topDefinitionCount: region.target.topDefinitionCount,
        unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      },
      {
        classification: fixture.target117Resolver.classification,
        targetIndex: fixture.target117Resolver.targetIndex,
        nodeType: fixture.target117Resolver.nodeType,
        start: fixture.target117Resolver.start,
        end: fixture.target117Resolver.end,
        tokenCount: fixture.target117Resolver.tokenCount,
        sourceHash: fixture.target117Resolver.sha256,
        coarseHash: fixture.target117Resolver.coarseHash,
        topDefinitionCount: fixture.target117Resolver.topDefinitionCount,
        unknownFreeIdentifierCount:
          fixture.target117Resolver.unknownFreeIdentifierCount,
      },
    )

    const baselineGate = parseUnit(
      baseline,
      fixture.baselineDisabledGate,
      'Target116 disabled fork gate',
    )
    assert.equal(baselineGate.source, fixture.baselineDisabledGate.source)
    assert.equal(baselineGate.node.body.body.length, 1)
    assert.equal(baselineGate.node.body.body[0].type, 'ReturnStatement')
    assert.equal(baselineGate.node.body.body[0].argument.type, 'UnaryExpression')
    assert.equal(baselineGate.node.body.body[0].argument.operator, '!')
    assert.equal(baselineGate.node.body.body[0].argument.argument.value, 1)

    const resolver = parseUnit(
      target,
      fixture.target117Resolver,
      'Target117 fork source resolver',
    )
    assert.deepEqual(
      canonicalAst(resolver.source),
      {
        normalized: canonicalAst(resolver.source).normalized,
        ...fixture.target117Resolver.normalizedAst,
      },
    )
    assert.equal(resolver.node.body.body.length, 5)
    assert.deepEqual(
      resolver.node.body.body.map(returnValue),
      fixture.target117Resolver.branches.map(branch => branch.result),
    )
    for (const branch of fixture.target117Resolver.branches) {
      exactSlice(target, branch, `Target117 ${branch.role} branch`)
    }

    const closure = fixture.target117OwnerClosure
    const coordinator = parseUnit(
      target,
      closure.alwaysFalseCoordinatorGate,
      'Target117 coordinator build stub',
    )
    const exportsUnit = parseUnit(target, closure.exportTable, 'Target117 fork exports')
    const getter = parseUnit(target, closure.getSource, 'Target117 fork source getter')
    const reset = parseUnit(target, closure.reset, 'Target117 fork source reset')
    const enabled = parseUnit(target, closure.isEnabled, 'Target117 fork boolean adapter')
    const constants = parseUnit(target, closure.constants, 'Target117 fork constants')
    const dependencies = Object.fromEntries(
      closure.dependencies.map(dependency => [
        dependency.role,
        parseUnit(target, dependency, `Target117 ${dependency.role}`),
      ]),
    )

    const coordinatorName = coordinator.node.id.name
    const noninteractiveName = dependencies.getIsNonInteractiveSession.node.id.name
    const envTruthyName = dependencies.isEnvTruthy.node.id.name
    const featureName = dependencies.getFeatureValueCached.node.id.name
    const body = resolver.node.body.body
    assert.equal(directCallName(body[0].test), coordinatorName)
    assert.equal(directCallName(body[1].test), noninteractiveName)
    assert.equal(directCallName(body[2].test), envTruthyName)
    assert.equal(directCallName(body[3].test), featureName)
    assert.equal(
      coordinator.node.body.body[0].argument.operator,
      '!',
      'coordinator build guard is proven false',
    )
    assert.equal(coordinator.node.body.body[0].argument.argument.value, 1)

    const exportedKeys = exportsUnit.node.expression.arguments[1].properties.map(
      property => property.key.name,
    )
    for (const exportedName of [
      'getForkSubagentSource',
      '_resetForkSubagentSourceTelemetryForTesting',
      'isForkSubagentEnabled',
    ]) {
      assert.ok(exportedKeys.includes(exportedName), `export ${exportedName}`)
    }
    assert.equal(getter.node.body.body.length, 4)
    assert.equal(reset.node.body.body.length, 1)
    assert.equal(enabled.node.body.body.length, 1)
    const enabledReturn = enabled.node.body.body[0]
    assert.equal(enabledReturn.type, 'ReturnStatement')
    assert.equal(enabledReturn.argument.type, 'BinaryExpression')
    assert.equal(enabledReturn.argument.operator, '!==')
    assert.equal(enabledReturn.argument.right.value, 'disabled')
    assert.equal(
      directCallName(enabledReturn.argument.left),
      getter.node.id.name,
      'boolean adapter calls the authenticated source getter',
    )

    const constantValues = new Map(
      constants.node.declarations
        .filter(declaration => declaration.init?.type === 'Literal')
        .map(declaration => [declaration.id.name, declaration.init.value]),
    )
    assert.ok([...constantValues.values()].includes('tengu_copper_fox'))
    assert.ok([...constantValues.values()].includes('CLAUDE_CODE_FORK_SUBAGENT'))
    assert.ok([...constantValues.values()].includes('tengu_fork_subagent_enabled'))
    for (const literal of closure.constantLiterals) {
      exactSlice(target, literal, `Target117 ${literal.role}`)
    }
    exactSlice(target, closure.telemetryCall, 'Target117 source telemetry call')

    assert.equal(
      baseline.toString('utf8').split('"gb_rollout"').length - 1,
      fixture.ownerResidue.baselineOccurrenceCount,
    )
    assert.equal(
      target.toString('utf8').split('"gb_rollout"').length - 1,
      fixture.ownerResidue.targetOccurrenceNumber,
    )
    assert.equal(
      exactSlice(target, fixture.ownerResidue, 'Target117 strict gb_rollout residue'),
      '"gb_rollout"',
    )
  },
)

test(
  'fork resolver is exact through Target120 and authentically evolves in Target121',
  { skip: !selected },
  () => {
    const bundleEnvironment = {
      '2.1.117': 'CLAUDE_CODE_2_1_117_BUNDLE',
      '2.1.118': 'CLAUDE_CODE_2_1_118_BUNDLE',
      '2.1.119': 'CLAUDE_CODE_2_1_119_BUNDLE',
      '2.1.120': 'CLAUDE_CODE_2_1_120_BUNDLE',
      '2.1.121': 'CLAUDE_CODE_2_1_121_BUNDLE',
    }
    const bundleKey = {
      '2.1.117': 'target117',
      '2.1.118': 'target118',
      '2.1.119': 'target119',
      '2.1.120': 'target120',
      '2.1.121': 'target121',
    }
    const units = []
    for (const lineage of fixture.exactLineage) {
      const bundleExpected = fixture.bundles[bundleKey[lineage.version]]
      const bytes = readExact(
        bundlePath(bundleEnvironment[lineage.version], bundleExpected),
        bundleExpected,
        `${lineage.version} bundle`,
      )
      units.push(parseUnit(bytes, lineage, `${lineage.version} fork resolver`))
    }
    const normalized = units.map(unit => canonicalAst(unit.source))
    for (const item of normalized) {
      assert.deepEqual(
        { chars: item.chars, bytes: item.bytes, sha256: item.sha256 },
        fixture.target117Resolver.normalizedAst,
      )
    }
    assert.equal(new Set(normalized.map(item => item.normalized)).size, 1)

    let previous = fixture.exactLineage[0]
    for (const [offset, ledgerKey] of ['118', '119', '120'].entries()) {
      const current = fixture.exactLineage[offset + 1]
      const ledger = structuralLedger(fixture.structuralLedgers[ledgerKey])
      const region = ledger.regions[current.targetIndex]
      assert.equal(region.target.index, current.targetIndex)
      assert.equal(region.baselineUnitIndex, previous.targetIndex)
      assert.equal(region.classification, 'matched')
      assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
      assert.equal(region.target.sourceHash, current.sha256)
      assert.equal(region.target.coarseHash, current.coarseHash)
      previous = current
    }

    const target121Bytes = readExact(
      bundlePath('CLAUDE_CODE_2_1_121_BUNDLE', fixture.bundles.target121),
      fixture.bundles.target121,
      'Target121 bundle',
    )
    const evolved = parseUnit(
      target121Bytes,
      fixture.target121Evolution,
      'Target121 evolved fork resolver',
    )
    const evolvedNormalized = canonicalAst(evolved.source)
    assert.deepEqual(
      {
        chars: evolvedNormalized.chars,
        bytes: evolvedNormalized.bytes,
        sha256: evolvedNormalized.sha256,
      },
      fixture.target121Evolution.normalizedAst,
    )
    assert.notEqual(
      evolvedNormalized.normalized,
      normalized[0].normalized,
      'Target121 is a semantic evolution, not alpha-renaming',
    )
    exactSlice(
      target121Bytes,
      fixture.target121Evolution.environmentBranch,
      'Target121 environment-priority branch',
    )
    exactSlice(
      target121Bytes,
      fixture.target121Evolution.noninteractiveBranch,
      'Target121 noninteractive branch',
    )
    assert.ok(
      fixture.target121Evolution.environmentBranch.ordinal <
        fixture.target121Evolution.noninteractiveBranch.ordinal,
    )

    const transition = structuralLedger(fixture.structuralLedgers['121'])
    const targetRow = transition.regions[fixture.target121Evolution.targetIndex]
    assert.equal(targetRow.classification, 'unresolved')
    assert.equal(targetRow.target.sourceHash, fixture.target121Evolution.sha256)
    const oldRow = transition.unmatchedBaseline.find(
      row => row.index === fixture.target121Evolution.baselineUnitIndex,
    )
    assert.ok(oldRow, 'Target120 resolver becomes unmatched at Target121')
    assert.equal(oldRow.sourceHash, fixture.exactLineage.at(-1).sha256)
  },
)

test(
  'raw/package source preserves Target117 enablement while later source is rejected as replay',
  { skip: !selected },
  () => {
    const ts = typescript()
    const sourceWitnesses = fixture.sourceWitnesses
    for (const [label, witness] of Object.entries(sourceWitnesses)) {
      const bytes = gitBytes(witness.commit, witness.path)
      assert.deepEqual(descriptor(bytes), expectedDescriptor(witness.file), `${label}: git file`)
      const source = bytes.toString('utf8')
      assert.equal(source.length, witness.file.chars)
      const parsed = parseSource(ts, `${label}:${witness.path}`, source)
      const declarations = witness.declarations ?? [witness.declaration]
      for (const declaration of declarations) {
        assertSourceDeclaration(ts, parsed, source, declaration, label)
      }
      if (witness.logEventImport) {
        exactStringSlice(source, witness.logEventImport, `${label}: logEvent import`)
      }
    }

    const selectedFilename = selectedSourceFile()
    assertRealFile(selectedFilename, 'selected Target117 fork source')
    const selectedBytes = fs.readFileSync(selectedFilename)
    const selectedDescriptor = descriptor(selectedBytes)
    const selectedState = Object.entries(sourceWitnesses).find(([, witness]) => {
      const expected = expectedDescriptor(witness.file)
      return (
        selectedDescriptor.bytes === expected.bytes &&
        selectedDescriptor.sha256 === expected.sha256
      )
    })
    assert.ok(selectedState, 'selected source is an exact raw or later witness')

    const rawBytes = gitBytes(
      sourceWitnesses.rawTarget117.commit,
      sourceWitnesses.rawTarget117.path,
    )
    const rawSource = rawBytes.toString('utf8')
    const rawParsed = parseSource(ts, sourceWitnesses.rawTarget117.path, rawSource)
    const rawGate = sourceDeclaration(ts, rawParsed, 'isForkSubagentEnabled')
    const rawBody = rawGate.body.statements
    assert.equal(rawBody.length, 3)
    assert.match(rawBody[0].getText(rawParsed), /getIsNonInteractiveSession/)
    assert.match(rawBody[1].getText(rawParsed), /CLAUDE_CODE_FORK_SUBAGENT/)
    assert.match(rawBody[2].getText(rawParsed), /tengu_copper_fox/)
    assert.equal(sourceDeclaration(ts, rawParsed, 'resolveForkSubagentSource'), undefined)
    assert.equal(sourceDeclaration(ts, rawParsed, 'getForkSubagentSource'), undefined)

    const later = sourceWitnesses.laterEvolved
    const laterSource = gitBytes(later.commit, later.path).toString('utf8')
    const laterParsed = parseSource(ts, later.path, laterSource)
    const resolver = sourceDeclaration(ts, laterParsed, 'resolveForkSubagentSource')
    const laterBody = resolver.body.statements
    assert.equal(laterBody.length, 4)
    assert.match(laterBody[0].getText(laterParsed), /CLAUDE_CODE_FORK_SUBAGENT/)
    assert.match(laterBody[1].getText(laterParsed), /getIsNonInteractiveSession/)
    assert.match(laterBody[2].getText(laterParsed), /tengu_copper_fox/)
    assert.ok(laterSource.includes(later.intentComment))
    assert.match(
      sourceDeclaration(ts, laterParsed, 'getForkSubagentSource').getText(laterParsed),
      /logEvent\('tengu_fork_subagent_enabled', \{ source \}\)/,
    )

    for (const expected of fixture.truthTable) {
      assert.equal(target117Result(expected), expected.target117Source)
      assert.equal(raw117Enabled(expected), expected.raw117Enabled)
      assert.equal(laterSourceResult(expected), expected.laterSource)
      assert.equal(
        target117Result(expected) !== 'disabled',
        raw117Enabled(expected),
        `raw source preserves Target117 enablement for ${JSON.stringify(expected)}`,
      )
    }
    const divergences = fixture.truthTable.filter(
      row => row.target117Source !== row.laterSource,
    )
    assert.equal(divergences.length, 2)
    assert.ok(divergences.every(row => row.noninteractive && row.environment))
    assert.equal(fixture.sourceReplayBlocker.divergentInputs.length, 1)
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.match(fixture.sourceReplayBlocker.decision, /no source replay/)
  },
)
