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
  TARGET117_TRANSCRIPT_LEARN_MORE_EVIDENCE_IDS,
  TARGET117_TRANSCRIPT_LEARN_MORE_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/transcript-learn-more-owner-overrides.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-transcript-learn-more-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '95c7df636a913cf86902e360e895209c418f58cae55b42b3013db7890832f70b'

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
    if (['end', 'loc', 'range', 'start'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, callback)
    } else {
      walk(value, callback)
    }
  }
}

function createElementCalls(node) {
  const calls = []
  walk(node, candidate => {
    if (
      candidate.type === 'CallExpression' &&
      candidate.callee.type === 'MemberExpression' &&
      !candidate.callee.computed &&
      candidate.callee.property.type === 'Identifier' &&
      candidate.callee.property.name === 'createElement'
    ) {
      calls.push(candidate)
    }
  })
  return calls
}

function propertyName(property) {
  assert.equal(property.type, 'Property')
  assert.equal(property.computed, false)
  return property.key.name ?? property.key.value
}

function cacheSize(functionNode) {
  const first = functionNode.body.body[0]
  assert.equal(first.type, 'VariableDeclaration')
  const cache = first.declarations[0]
  assert.equal(cache.init.type, 'CallExpression')
  assert.equal(cache.init.arguments.length, 1)
  assert.equal(cache.init.arguments[0].type, 'Literal')
  return cache.init.arguments[0].value
}

function stripAbsoluteRegion(source, unit, region, replacement) {
  const start = region.start - unit.start
  const end = region.end - unit.start
  assert.deepEqual(
    descriptor(source.slice(start, end)),
    expectedDescriptor(region),
    `region ${region.start}..${region.end}`,
  )
  return source.slice(0, start) + replacement + source.slice(end)
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

function ledgerTargetFacts(region) {
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

function expectedLedgerTargetFacts(expected) {
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
    ts.ScriptKind.TSX,
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
  if (expected.nodeType) {
    assert.equal(sourceNodeType(ts, node), expected.nodeType, `${label}: node type`)
  }
  assert.equal(node.getStart(parsed), expected.start, `${label}: start`)
  assert.equal(node.end, expected.end, `${label}: end`)
  exactStringSlice(source, expected, `${label}: declaration bytes`)
  return node
}

function stringArrayInitializer(ts, statement) {
  assert.ok(ts.isVariableStatement(statement))
  assert.equal(statement.declarationList.declarations.length, 1)
  let initializer = statement.declarationList.declarations[0].initializer
  while (ts.isAsExpression(initializer)) initializer = initializer.expression
  assert.ok(ts.isArrayLiteralExpression(initializer))
  return initializer.elements.map(element => {
    assert.ok(ts.isStringLiteral(element))
    return element.text
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
  'Target117 transcript learn-more fixture and static override wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET117_TRANSCRIPT_LEARN_MORE_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.equal(TARGET117_TRANSCRIPT_LEARN_MORE_OWNER_OVERRIDES.length, 1)
    const override = TARGET117_TRANSCRIPT_LEARN_MORE_OWNER_OVERRIDES[0]
    assert.deepEqual(override, {
      key: `${caseName}:19751`,
      targetIndex: 19751,
      paths: ['src/components/FeedbackSurvey/TranscriptSharePrompt.tsx'],
      declarations: ['TranscriptSharePrompt'],
      evidenceIds: fixture.evidenceIds,
      behavior: override.behavior,
    })
    assert.match(override.behavior, /shared clickable learn-more runtime helper/)
    assert.match(override.behavior, /static whole-unit owner proof/)
    assert.match(override.behavior, /never a guessed source replay/)
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET117_TRANSCRIPT_LEARN_MORE_OWNER_OVERRIDES',
    )
    readExact(path.join(repositoryRoot, fixture.helper.path), fixture.helper)
  },
)

test(
  'Target117 authenticates one clickable-link substitution and its runtime dependency',
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

    for (const expected of [
      fixture.targetPrompt,
      fixture.learnMoreRuntimeHelper,
      fixture.learnMoreRuntimeInitializer,
      fixture.promptInitializers.target,
    ]) {
      const region = ledger.regions[expected.targetIndex]
      assert.deepEqual(
        ledgerTargetFacts(region),
        expectedLedgerTargetFacts(expected),
      )
      assert.equal(
        region.unknownFreeIdentifierCount,
        expected.unknownFreeIdentifierCount,
      )
    }
    for (const expected of [
      fixture.baselinePrompt,
      fixture.promptInitializers.baseline,
    ]) {
      const unit = ledger.unmatchedBaseline.find(
        row =>
          row.index === expected.baselineIndex &&
          row.sourceHash === expected.sha256,
      )
      assert.ok(unit, `unmatched baseline unit ${expected.baselineIndex}`)
      assert.deepEqual(
        {
          nodeType: unit.nodeType,
          start: unit.start,
          end: unit.end,
          tokenCount: unit.tokenCount,
          sourceHash: unit.sourceHash,
          coarseHash: unit.coarseHash,
          topDefinitionCount: unit.topDefinitionCount,
        },
        {
          nodeType: expected.nodeType,
          start: expected.start,
          end: expected.end,
          tokenCount: expected.tokenCount,
          sourceHash: expected.sha256,
          coarseHash: expected.coarseHash,
          topDefinitionCount: expected.topDefinitionCount,
        },
      )
    }

    const baselinePrompt = parseUnit(
      baseline,
      fixture.baselinePrompt,
      'Target116 TranscriptSharePrompt',
    )
    const targetPrompt = parseUnit(
      target,
      fixture.targetPrompt,
      'Target117 TranscriptSharePrompt',
    )
    const helper = parseUnit(
      target,
      fixture.learnMoreRuntimeHelper,
      'Target117 shared learn-more helper',
    )
    const helperInitializer = parseUnit(
      target,
      fixture.learnMoreRuntimeInitializer,
      'Target117 shared learn-more initializer',
    )
    assert.equal(cacheSize(baselinePrompt.node), 13)
    assert.equal(cacheSize(targetPrompt.node), 13)
    assert.equal(cacheSize(helper.node), fixture.learnMoreRuntimeHelper.cacheSize)

    const objectPatterns = []
    walk(helper.node, node => {
      if (node.type === 'ObjectPattern') objectPatterns.push(node)
    })
    const urlProperty = objectPatterns
      .flatMap(pattern => pattern.properties)
      .find(property => propertyName(property) === fixture.learnMoreRuntimeHelper.prop)
    assert.ok(urlProperty, 'helper destructures url')
    assert.equal(urlProperty.value.type, 'Identifier')

    const helperCalls = createElementCalls(helper.node)
    assert.equal(helperCalls.length, 2)
    const [outerHelperCall, innerLinkCall] = helperCalls
    assert.equal(outerHelperCall.arguments.length, 4)
    assert.equal(outerHelperCall.arguments[1].type, 'ObjectExpression')
    assert.equal(
      propertyName(outerHelperCall.arguments[1].properties[0]),
      'dimColor',
    )
    const dimColor = outerHelperCall.arguments[1].properties[0].value
    assert.equal(dimColor.type, 'UnaryExpression')
    assert.equal(dimColor.operator, '!')
    assert.equal(dimColor.argument.value, 0)
    assert.equal(
      outerHelperCall.arguments[2].value,
      fixture.learnMoreRuntimeHelper.label,
    )
    assert.equal(outerHelperCall.arguments[3], innerLinkCall)
    assert.equal(innerLinkCall.arguments[1].type, 'ObjectExpression')
    assert.equal(propertyName(innerLinkCall.arguments[1].properties[0]), 'url')
    assert.equal(
      innerLinkCall.arguments[1].properties[0].value.name,
      urlProperty.value.name,
      'nested clickable component receives the destructured url',
    )

    const baselineInner = exactSlice(
      baseline,
      fixture.semanticChange.baselineInnerCall,
      'Target116 manual learn-more call',
    )
    const targetInner = exactSlice(
      target,
      fixture.semanticChange.targetInnerCall,
      'Target117 shared learn-more call',
    )
    exactSlice(
      baseline,
      fixture.semanticChange.baselineOuterCall,
      'Target116 learn-more Box',
    )
    exactSlice(
      target,
      fixture.semanticChange.targetOuterCall,
      'Target117 learn-more Box',
    )
    assert.match(baselineInner, /dimColor:!0.*Learn more:/)
    assert.ok(targetInner.includes(`createElement(${helper.node.id.name},`))
    assert.ok(targetInner.includes(`url:${JSON.stringify(fixture.ownerResidue.value)}`))
    assert.equal(targetInner.includes('dimColor'), false)

    const strippedBaseline = stripAbsoluteRegion(
      baselinePrompt.source,
      fixture.baselinePrompt,
      fixture.semanticChange.baselineInnerCall,
      fixture.semanticChange.sentinel,
    )
    const strippedTarget = stripAbsoluteRegion(
      targetPrompt.source,
      fixture.targetPrompt,
      fixture.semanticChange.targetInnerCall,
      fixture.semanticChange.sentinel,
    )
    assert.deepEqual(
      { chars: strippedBaseline.length, ...descriptor(strippedBaseline) },
      fixture.semanticChange.strippedBaseline,
    )
    assert.deepEqual(
      { chars: strippedTarget.length, ...descriptor(strippedTarget) },
      fixture.semanticChange.strippedTarget,
    )
    const normalizedBaseline = canonicalAst(strippedBaseline)
    const normalizedTarget = canonicalAst(strippedTarget)
    assert.equal(normalizedBaseline.normalized, normalizedTarget.normalized)
    assert.deepEqual(
      {
        chars: normalizedTarget.chars,
        bytes: normalizedTarget.bytes,
        sha256: normalizedTarget.sha256,
      },
      fixture.semanticChange.preservedNormalizedAst,
    )

    const baselineInitializer = parseUnit(
      baseline,
      fixture.promptInitializers.baseline,
      'Target116 prompt initializer',
    )
    const targetInitializer = parseUnit(
      target,
      fixture.promptInitializers.target,
      'Target117 prompt initializer',
    )
    const helperInitializerName = helperInitializer.node.declarations[0].id.name
    const addedInvocation = exactSlice(
      target,
      fixture.promptInitializers.addedHelperInvocation,
      'Target117 added helper initializer call',
    )
    assert.equal(addedInvocation, `${helperInitializerName}();`)
    const strippedInitializer = stripAbsoluteRegion(
      targetInitializer.source,
      fixture.promptInitializers.target,
      fixture.promptInitializers.addedHelperInvocation,
      '',
    )
    assert.deepEqual(
      { chars: strippedInitializer.length, ...descriptor(strippedInitializer) },
      fixture.promptInitializers.strippedTarget,
    )
    const normalizedBaselineInitializer = canonicalAst(baselineInitializer.source)
    const normalizedTargetInitializer = canonicalAst(strippedInitializer)
    assert.equal(
      normalizedBaselineInitializer.normalized,
      normalizedTargetInitializer.normalized,
    )
    assert.deepEqual(
      {
        chars: normalizedTargetInitializer.chars,
        bytes: normalizedTargetInitializer.bytes,
        sha256: normalizedTargetInitializer.sha256,
      },
      fixture.promptInitializers.preservedNormalizedAst,
    )

    const baselineText = baseline.toString('utf8')
    const targetText = target.toString('utf8')
    const quotedResidue = JSON.stringify(fixture.ownerResidue.value)
    assert.equal(
      countOccurrences(baselineText, quotedResidue),
      fixture.ownerResidue.baselineOccurrenceCount,
    )
    assert.equal(
      countOccurrences(targetText, quotedResidue),
      fixture.ownerResidue.targetOccurrenceNumber,
    )
    assert.equal(
      exactSlice(target, fixture.ownerResidue, 'Target117 URL residue'),
      quotedResidue,
    )
    assert.equal(
      countOccurrences(targetText, `createElement(${helper.node.id.name},{url:`),
      fixture.learnMoreRuntimeHelper.targetCallCount,
    )
    assert.equal(
      countOccurrences(targetText, `${helperInitializerName}();`),
      fixture.learnMoreRuntimeHelper.targetInitializerInvocationCount,
    )
  },
)

test(
  'clickable learn-more prompt, helper, and initializer remain exact through Target121',
  { skip: !selected },
  () => {
    const bundleEnvironment = {
      target117: 'CLAUDE_CODE_2_1_117_BUNDLE',
      target118: 'CLAUDE_CODE_2_1_118_BUNDLE',
      target119: 'CLAUDE_CODE_2_1_119_BUNDLE',
      target120: 'CLAUDE_CODE_2_1_120_BUNDLE',
      target121: 'CLAUDE_CODE_2_1_121_BUNDLE',
    }
    const canonicalByRole = {
      prompt: [],
      helper: [],
      helperInitializer: [],
      promptInitializer: [],
    }

    for (const [lineageIndex, lineage] of fixture.exactLineage.entries()) {
      const bundleExpected = fixture.bundles[lineage.bundleKey]
      const bytes = readExact(
        bundlePath(bundleEnvironment[lineage.bundleKey], bundleExpected),
        bundleExpected,
        `${lineage.version} bundle`,
      )
      const ledger = structuralLedger(fixture.structuralLedgers[lineage.ledgerKey])
      for (const role of Object.keys(canonicalByRole)) {
        const expected = lineage[role]
        const unit = parseUnit(bytes, expected, `${lineage.version} ${role}`)
        const normalized = canonicalAst(unit.source)
        canonicalByRole[role].push(normalized.normalized)
        assert.deepEqual(
          {
            chars: normalized.chars,
            bytes: normalized.bytes,
            sha256: normalized.sha256,
          },
          fixture.lineageNormalizedAst[role],
        )

        const region = ledger.regions[expected.targetIndex]
        assert.deepEqual(
          ledgerTargetFacts(region),
          expectedLedgerTargetFacts(expected),
        )
        if (lineageIndex === 0) {
          assert.equal(region.classification, 'unresolved')
          assert.equal(region.baselineUnitIndex, undefined)
        } else {
          assert.equal(region.classification, 'matched')
          assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
          assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
        }
      }
    }
    for (const values of Object.values(canonicalByRole)) {
      assert.equal(new Set(values).size, 1)
    }
  },
)

test(
  'raw/package and later source both leave the clickable helper identity fail-closed',
  { skip: !selected },
  () => {
    const ts = typescript()
    const raw = fixture.sourceWitnesses.rawTarget117
    const later = fixture.sourceWitnesses.laterPromptShape
    const rejected = fixture.sourceWitnesses.rejectedPositionalTreeifyOwner

    for (const witness of [raw, later, rejected]) {
      const bytes = gitBytes(witness.commit, witness.path)
      assert.deepEqual(
        descriptor(bytes),
        expectedDescriptor(witness.file),
        `${witness.path}: git source`,
      )
      assert.equal(gitBlob(witness.commit, witness.path), witness.blob)
    }

    const selectedPromptFilename = selectedSourceFile(raw.path)
    const selectedTreeifyFilename = selectedSourceFile(rejected.path)
    assertRealFile(selectedPromptFilename, 'selected Target117 prompt source')
    assertRealFile(selectedTreeifyFilename, 'selected Target117 treeify source')
    const selectedPrompt = readExact(
      selectedPromptFilename,
      raw.file,
      'selected Target117 prompt source',
    ).toString('utf8')
    const selectedTreeify = readExact(
      selectedTreeifyFilename,
      rejected.file,
      'selected Target117 treeify source',
    ).toString('utf8')

    const rawSource = gitBytes(raw.commit, raw.path).toString('utf8')
    const rawParsed = parseSource(ts, raw.path, rawSource)
    const rawPrompt = assertSourceDeclaration(
      ts,
      rawParsed,
      rawSource,
      raw.declaration,
      'raw Target117 prompt',
    )
    const rawPromptText = rawPrompt.getText(rawParsed)
    assert.match(rawPromptText, new RegExp(`_c\\(${raw.cacheSize}\\)`))
    assert.deepEqual(
      stringArrayInitializer(
        ts,
        sourceDeclaration(ts, rawParsed, 'RESPONSE_INPUTS'),
      ),
      raw.responseInputs,
    )
    const rawManualBox = exactStringSlice(
      rawSource,
      raw.manualLearnMoreBox,
      'raw Target117 manual learn-more Box',
    )
    assert.match(rawManualBox, /^<Box marginLeft=\{2\}><Text dimColor=\{true\}>/)
    assert.ok(rawManualBox.includes(fixture.ownerResidue.value))
    assert.equal(/<(?:Link|ClickableLink|LearnMore)/.test(rawPromptText), false)
    assert.equal(selectedPrompt, rawSource)

    const laterSource = gitBytes(later.commit, later.path).toString('utf8')
    const laterParsed = parseSource(ts, later.path, laterSource)
    const laterPrompt = assertSourceDeclaration(
      ts,
      laterParsed,
      laterSource,
      later.declaration,
      'later prompt source',
    )
    for (const key of [
      'responseInputsDeclaration',
      'inputToResponseDeclaration',
      'responseOptionsDeclaration',
      'isValidResponseInputDeclaration',
    ]) {
      assertSourceDeclaration(
        ts,
        laterParsed,
        laterSource,
        later[key],
        `later ${later[key].name}`,
      )
    }
    assert.deepEqual(
      stringArrayInitializer(
        ts,
        sourceDeclaration(ts, laterParsed, 'RESPONSE_INPUTS'),
      ),
      later.responseInputs,
    )
    const laterManualBox = exactStringSlice(
      laterSource,
      later.manualLearnMoreBox,
      'later manual learn-more Box',
    )
    assert.match(laterManualBox, /<Text dimColor>/)
    assert.ok(laterManualBox.includes(fixture.ownerResidue.value))
    assert.equal(
      /<(?:Link|ClickableLink|LearnMore)/.test(laterPrompt.getText(laterParsed)),
      false,
    )

    for (const forbidden of rejected.forbiddenText) {
      assert.equal(
        selectedTreeify.includes(forbidden),
        false,
        `positional treeify owner excludes ${forbidden}`,
      )
    }
    assert.equal(fixture.learnMoreRuntimeHelper.authoredDeclarationName, null)
    assert.equal(fixture.learnMoreRuntimeHelper.ownerPath, null)
    assert.equal(
      fixture.learnMoreRuntimeHelper.rejectedPositionalOwnerPath,
      rejected.path,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.match(fixture.sourceReplayBlocker.decision, /no source replay/)
    assert.match(fixture.sourceReplayBlocker.decision, /no guessed helper path/)
  },
)
