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
  TARGET117_AGENT_MCP_CONFIG_EVIDENCE_IDS,
  TARGET117_AGENT_MCP_CONFIG_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/agent-mcp-config-owner-overrides.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-agent-mcp-config-owner-proof.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '5299fb2e26d1ba1116ef4ebfefb57ba19e415c4eb08551b72d7b3e0b45758310'

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

function walk(node, callback) {
  if (!node || typeof node !== 'object') return
  callback(node)
  for (const [key, value] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, callback)
    } else {
      walk(value, callback)
    }
  }
}

function unwrapChain(node) {
  return node.type === 'ChainExpression' ? node.expression : node
}

function logicalOperands(node, operator) {
  if (node.type === 'LogicalExpression' && node.operator === operator) {
    return [
      ...logicalOperands(node.left, operator),
      ...logicalOperands(node.right, operator),
    ]
  }
  return [node]
}

function propertyName(node) {
  assert.equal(node.computed, false)
  return node.property?.name ?? node.key?.name ?? node.key?.value
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return count
    count += 1
    offset = next + needle.length
  }
}

function targetLedgerFacts(region) {
  return {
    classification: region.classification,
    targetIndex: region.target.index,
    nodeType: region.target.nodeType,
    start: region.target.start,
    end: region.target.end,
    tokenCount: region.target.tokenCount,
    sourceHash: region.target.sourceHash,
    coarseHash: region.target.coarseHash,
    topDefinitionCount: region.target.topDefinitionCount,
  }
}

function expectedTargetLedgerFacts(expected) {
  return {
    classification: expected.classification,
    targetIndex: expected.targetIndex,
    nodeType: expected.nodeType,
    start: expected.start,
    end: expected.end,
    tokenCount: expected.tokenCount,
    sourceHash: expected.sha256,
    coarseHash: expected.coarseHash,
    topDefinitionCount: 1,
  }
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
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${filename}: parse clean`)
  return parsed
}

function sourceDeclaration(ts, parsed, name) {
  return parsed.statements.find(statement => statement.name?.text === name)
}

function assertSourceDeclaration(ts, parsed, source, expected, label) {
  const node = sourceDeclaration(ts, parsed, expected.name)
  assert.ok(node, `${label}: declaration ${expected.name}`)
  assert.ok(ts.isFunctionDeclaration(node), `${label}: function declaration`)
  assert.equal(node.getStart(parsed), expected.start, `${label}: start`)
  assert.equal(node.end, expected.end, `${label}: end`)
  exactStringSlice(source, expected, `${label}: declaration bytes`)
  return node
}

function sourceImports(ts, parsed) {
  return parsed.statements
    .filter(statement => ts.isImportDeclaration(statement))
    .map(statement => {
      const clause = statement.importClause
      const elements = clause?.namedBindings?.elements ?? []
      return {
        module: statement.moduleSpecifier.text,
        names: elements.map(element => element.name.text),
        typeOnlyNames: elements
          .filter(element => clause.isTypeOnly || element.isTypeOnly)
          .map(element => element.name.text),
      }
    })
}

function gitBytes(commit, sourcePath) {
  return execFileSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
  })
}

function gitBlob(commit, sourcePath) {
  return execFileSync('git', ['rev-parse', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
  )
}

function selectedSourceFile(sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(selectedSourceRoot(), sourcePath.slice(4))
}

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
}

test(
  'Target117 agent MCP fixture and owner override wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-static-exact-source-owner-proof')
    assert.deepEqual(
      TARGET117_AGENT_MCP_CONFIG_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.equal(TARGET117_AGENT_MCP_CONFIG_OWNER_OVERRIDES.length, 1)
    const override = TARGET117_AGENT_MCP_CONFIG_OWNER_OVERRIDES[0]
    assert.deepEqual(override, {
      key: `${caseName}:20260`,
      targetIndex: 20260,
      paths: ['src/services/mcp/agentConfig.ts'],
      declarations: ['mergeMainAgentMcpServers'],
      evidenceIds: fixture.evidenceIds,
      behavior: override.behavior,
    })
    assert.match(override.behavior, /reports blocked names through onBlocked/)
    assert.match(override.behavior, /rejects the positional/)
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET117_AGENT_MCP_CONFIG_OWNER_OVERRIDES',
    )
    readExact(path.join(repositoryRoot, fixture.helper.path), fixture.helper)
  },
)

test(
  'Target117 bundle authenticates the complete MCP merge unit and sole added residue',
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
    const region = ledger.regions[fixture.targetUnit.targetIndex]
    assert.deepEqual(
      targetLedgerFacts(region),
      expectedTargetLedgerFacts(fixture.targetUnit),
    )
    assert.equal(
      region.unknownFreeIdentifierCount,
      fixture.targetUnit.unknownFreeIdentifierCount,
    )

    const unit = parseUnit(target, fixture.targetUnit, 'Target117 MCP merge unit')
    const fn = unit.node
    assert.equal(fn.params.length, 3)
    assert.ok(fn.params.every(parameter => parameter.type === 'Identifier'))
    const [explicitConfigs, agent, options] = fn.params.map(parameter => parameter.name)
    assert.equal(fn.body.body.length, 6)

    const [guard, converted, emptyGuard, filtered, blockedGuard, result] =
      fn.body.body
    assert.equal(guard.type, 'IfStatement')
    const guards = logicalOperands(guard.test, '||')
    assert.equal(guards.length, 3)
    assert.equal(guards[0].type, 'UnaryExpression')
    assert.equal(guards[0].operator, '!')
    assert.equal(guards[0].argument.name, agent)
    const strictConfig = unwrapChain(guards[1])
    assert.equal(strictConfig.type, 'MemberExpression')
    assert.equal(strictConfig.object.name, options)
    assert.equal(propertyName(strictConfig), 'strictMcpConfig')
    assert.equal(guards[2].type, 'CallExpression')
    assert.equal(guard.consequent.type, 'ReturnStatement')
    assert.equal(guard.consequent.argument.name, explicitConfigs)

    assert.equal(converted.type, 'VariableDeclaration')
    assert.equal(converted.declarations[0].init.type, 'CallExpression')
    assert.equal(converted.declarations[0].init.arguments[0].name, agent)
    const convertedName = converted.declarations[0].id.name

    assert.equal(emptyGuard.type, 'IfStatement')
    assert.equal(emptyGuard.test.type, 'BinaryExpression')
    assert.equal(emptyGuard.test.operator, '===')
    assert.equal(emptyGuard.test.right.value, 0)
    assert.equal(emptyGuard.consequent.argument.name, explicitConfigs)
    const keysLength = emptyGuard.test.left
    assert.equal(keysLength.type, 'MemberExpression')
    assert.equal(propertyName(keysLength), 'length')
    assert.equal(keysLength.object.type, 'CallExpression')
    assert.equal(propertyName(keysLength.object.callee), 'keys')
    assert.equal(keysLength.object.arguments[0].name, convertedName)

    assert.equal(filtered.type, 'VariableDeclaration')
    const filteredDeclaration = filtered.declarations[0]
    assert.equal(filteredDeclaration.id.type, 'ObjectPattern')
    assert.deepEqual(
      filteredDeclaration.id.properties.map(property => property.key.name),
      ['allowed', 'blocked'],
    )
    assert.equal(filteredDeclaration.init.type, 'CallExpression')
    assert.equal(filteredDeclaration.init.arguments[0].name, convertedName)
    const allowedName = filteredDeclaration.id.properties[0].value.name
    const blockedName = filteredDeclaration.id.properties[1].value.name

    assert.equal(blockedGuard.type, 'IfStatement')
    assert.equal(blockedGuard.test.type, 'BinaryExpression')
    assert.equal(blockedGuard.test.operator, '>')
    assert.equal(blockedGuard.test.left.object.name, blockedName)
    assert.equal(propertyName(blockedGuard.test.left), 'length')
    assert.equal(blockedGuard.test.right.value, 0)
    const blockedCall = unwrapChain(blockedGuard.consequent.expression)
    assert.equal(blockedCall.type, 'CallExpression')
    const blockedMember = unwrapChain(blockedCall.callee)
    assert.equal(blockedMember.type, 'MemberExpression')
    assert.equal(propertyName(blockedMember), 'onBlocked')
    assert.equal(blockedCall.arguments[0].name, blockedName)

    assert.equal(result.type, 'ReturnStatement')
    assert.equal(result.argument.type, 'ObjectExpression')
    assert.deepEqual(
      result.argument.properties.map(property => {
        assert.equal(property.type, 'SpreadElement')
        return property.argument.name
      }),
      [allowedName, explicitConfigs],
      'allowed agent configs are merged before explicit configs',
    )

    const residueMembers = []
    walk(fn, node => {
      if (
        node.type === 'MemberExpression' &&
        !node.computed &&
        node.property.name === fixture.ownerResidue.value
      ) {
        residueMembers.push(node.property)
      }
    })
    assert.equal(residueMembers.length, 1)
    assert.equal(
      residueMembers[0].start + fixture.targetUnit.start,
      fixture.ownerResidue.start,
    )
    assert.equal(
      residueMembers[0].end + fixture.targetUnit.start,
      fixture.ownerResidue.end,
    )
    assert.equal(
      exactSlice(target, fixture.ownerResidue, 'Target117 onBlocked residue'),
      fixture.ownerResidue.value,
    )
    assert.equal(
      countOccurrences(baseline.toString('utf8'), fixture.ownerResidue.value),
      fixture.ownerResidue.baselineOccurrenceCount,
    )
    assert.equal(
      countOccurrences(target.toString('utf8'), fixture.ownerResidue.value),
      fixture.ownerResidue.targetOccurrenceCount,
    )
  },
)

test(
  'raw/package source proves agentConfig ownership and rejects the positional dialog owner',
  { skip: !selected },
  () => {
    const ts = typescript()
    const owner = fixture.sourceOwner
    const rejected = fixture.rejectedPositionalOwner
    for (const witness of [owner, rejected]) {
      const bytes = gitBytes(witness.commit, witness.path)
      assert.deepEqual(
        descriptor(bytes),
        expectedDescriptor(witness.file),
        `${witness.path}: git source`,
      )
      assert.equal(gitBlob(witness.commit, witness.path), witness.blob)

      const selectedFilename = selectedSourceFile(witness.path)
      assertRealFile(selectedFilename, `${witness.path}: selected source`)
      assert.deepEqual(
        descriptor(fs.readFileSync(selectedFilename)),
        expectedDescriptor(witness.file),
        `${witness.path}: package source`,
      )
    }

    const ownerSource = gitBytes(owner.commit, owner.path).toString('utf8')
    assert.equal(ownerSource.length, owner.file.chars)
    const ownerParsed = parseSource(ts, owner.path, ownerSource)
    assert.deepEqual(sourceImports(ts, ownerParsed), owner.imports)
    const declaration = assertSourceDeclaration(
      ts,
      ownerParsed,
      ownerSource,
      owner.declaration,
      'agentConfig owner',
    )
    assert.equal(declaration.parameters.length, 3)
    assert.deepEqual(
      declaration.parameters.map(parameter => parameter.name.getText(ownerParsed)),
      ['explicitDynamicConfigs', 'agent', 'options'],
    )
    assert.equal(declaration.body.statements.length, 6)
    const declarationText = declaration.getText(ownerParsed)
    for (const semantic of [
      '!agent || options?.strictMcpConfig || doesEnterpriseMcpConfigExist()',
      'agentMcpSpecsToScopedConfigs(agent)',
      'Object.keys(agentConfigs).length === 0',
      'filterMcpServersByPolicy(agentConfigs)',
      'blocked.length > 0',
      'options?.onBlocked?.(blocked)',
      'return { ...allowed, ...explicitDynamicConfigs }',
    ]) {
      assert.ok(declarationText.includes(semantic), semantic)
    }
    assert.equal(ownerSource.indexOf('onBlocked'), owner.onBlockedTypeStart)
    assert.equal(
      ownerSource.indexOf('onBlocked', owner.onBlockedTypeStart + 1),
      owner.onBlockedCallStart,
    )

    const rejectedSource = gitBytes(rejected.commit, rejected.path).toString('utf8')
    assert.equal(rejectedSource.length, rejected.file.chars)
    const rejectedParsed = parseSource(ts, rejected.path, rejectedSource)
    const rejectedDeclaration = assertSourceDeclaration(
      ts,
      rejectedParsed,
      rejectedSource,
      rejected.declaration,
      'positional dialog owner',
    )
    const rejectedText = rejectedDeclaration.getText(rejectedParsed)
    for (const forbidden of rejected.forbiddenText) {
      assert.equal(rejectedText.includes(forbidden), false, forbidden)
    }
    assert.equal(fixture.generatorWiring.replayHelper, null)
  },
)

test(
  'the authenticated agent MCP merge behavior remains exact through Target121',
  { skip: !selected },
  () => {
    const bundleEnvironment = {
      target117: 'CLAUDE_CODE_2_1_117_BUNDLE',
      target118: 'CLAUDE_CODE_2_1_118_BUNDLE',
      target119: 'CLAUDE_CODE_2_1_119_BUNDLE',
      target120: 'CLAUDE_CODE_2_1_120_BUNDLE',
      target121: 'CLAUDE_CODE_2_1_121_BUNDLE',
    }
    const normalizedUnits = []
    for (const [index, expected] of fixture.exactLineage.entries()) {
      const bundleExpected = fixture.bundles[expected.bundleKey]
      const bytes = readExact(
        bundlePath(bundleEnvironment[expected.bundleKey], bundleExpected),
        bundleExpected,
        `${expected.version} bundle`,
      )
      const unit = parseUnit(bytes, expected, `${expected.version} MCP merge`)
      const normalized = canonicalAst(unit.source)
      normalizedUnits.push(normalized.normalized)
      assert.deepEqual(
        {
          chars: normalized.chars,
          bytes: normalized.bytes,
          sha256: normalized.sha256,
        },
        fixture.lineageNormalizedAst,
      )

      const ledger = structuralLedger(fixture.structuralLedgers[expected.ledgerKey])
      const region = ledger.regions[expected.targetIndex]
      assert.deepEqual(
        targetLedgerFacts(region),
        expectedTargetLedgerFacts(expected),
      )
      if (index === 0) {
        assert.equal(region.baselineUnitIndex, undefined)
      } else {
        assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
        assert.equal(region.pairReason, expected.pairReason)
      }
    }
    assert.equal(new Set(normalizedUnits).size, 1)
  },
)
