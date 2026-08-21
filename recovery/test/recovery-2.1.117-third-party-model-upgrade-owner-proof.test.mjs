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
  TARGET117_THIRD_PARTY_MODEL_UPGRADE_EVIDENCE_IDS,
  TARGET117_THIRD_PARTY_MODEL_UPGRADE_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/third-party-model-upgrade-owner-overrides.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-third-party-model-upgrade-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'bac80049acb4dc7568baaee9ed17277b24124dd33a194111a70b863ec354be3c'

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

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
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

function parseUnit(bundle, expected, label) {
  const source = exactSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { source, node: program.body[0] }
}

function walk(node, callback, parent = undefined, key = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      walk(node[index], callback, node, index)
    }
    return
  }
  if (typeof node.type === 'string') callback(node, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, callback, node, childKey)
    }
  }
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
            !parent.computed) ||
          (parent?.type === 'MethodDefinition' &&
            key === 'key' &&
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

function cacheSize(functionNode) {
  const first = functionNode.body.body[0]
  assert.equal(first.type, 'VariableDeclaration')
  const cache = first.declarations[0]
  assert.equal(cache.init.type, 'CallExpression')
  assert.equal(cache.init.arguments.length, 1)
  assert.equal(cache.init.arguments[0].type, 'Literal')
  return cache.init.arguments[0].value
}

function stripControlRegion(source, expected) {
  assert.deepEqual(
    descriptor(source.slice(expected.localStart, expected.localEnd)),
    expectedDescriptor(expected),
  )
  return (
    source.slice(0, expected.localStart) +
    'let L;' +
    source.slice(expected.localEnd)
  )
}

function normalizeBaselineWholeUnit(source) {
  let output = stripControlRegion(
    source,
    fixture.controlSubstitution.baselineRegion,
  )
  assert.equal((output.match(/\.c\(28\)/g) ?? []).length, 1)
  output = output.replace('.c(28)', '.c(27)')
  output = output.replace(/\$\[(2[0-7])\]/g, (_, value) => {
    return `$[${Number(value) - 1}]`
  })
  return output
}

function normalizeTargetWholeUnit(source) {
  return stripControlRegion(source, fixture.controlSubstitution.targetRegion)
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
}

function parseSource(filename, expected, declarationName) {
  assertRealFile(filename, expected.path ?? filename)
  const bytes = readExact(filename, expected, expected.path ?? filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parse clean`)
  let declaration
  if (declarationName) {
    declaration = sourceFile.statements.find(
      node => ts.isFunctionDeclaration(node) && node.name?.text === declarationName,
    )
    assert.ok(declaration, `${filename}: ${declarationName}`)
    assert.equal(declaration.getStart(sourceFile), expected.declaration.start)
    assert.equal(declaration.end, expected.declaration.end)
    exactStringSlice(
      source,
      expected.declaration,
      `${filename}: ${declarationName} declaration`,
    )
  }
  return { source, sourceFile, declaration }
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before)
  assert.ok(first >= 0, `${label}: anchor exists`)
  assert.equal(source.indexOf(before, first + before.length), -1, `${label}: unique`)
  return source.slice(0, first) + after + source.slice(first + before.length)
}

function deriveCandidate(source) {
  let output = replaceExactlyOnce(
    source,
    "import { Select } from './CustomSelect/index.js'",
    "import { ConfirmationButtons } from './ConfirmationButtons.js'",
    'controls import',
  )
  output = replaceExactlyOnce(
    output,
    [
      '        <Select',
      '          options={[',
      "            { label: 'Yes', value: 'confirm' },",
      "            { label: 'No', value: 'cancel' },",
      '          ]}',
      '          defaultFocusValue="confirm"',
      '          visibleOptionCount={2}',
      "          onChange={value => onDone(value === 'confirm')}",
      '          onCancel={() => onDone(false)}',
      '        />',
    ].join('\n'),
    [
      '        <ConfirmationButtons',
      '          onConfirm={() => onDone(true)}',
      '          onCancel={() => onDone(false)}',
      '        />',
    ].join('\n'),
    'confirmation controls',
  )
  return output
}

function gitText(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
}

test(
  'Target117 third-party model-upgrade fixture and static override wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-static-owner-proof-source-replay-blocked')
    assert.deepEqual(
      TARGET117_THIRD_PARTY_MODEL_UPGRADE_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET117_THIRD_PARTY_MODEL_UPGRADE_OWNER_OVERRIDES[0],
      {
        key: `${caseName}:20218`,
        targetIndex: 20218,
        paths: [
          'src/components/ThirdPartyModelUpgradeDialog.tsx',
          'src/components/ConfirmationButtons.tsx',
        ],
        declarations: ['ThirdPartyModelUpgradeDialog', 'ConfirmationButtons'],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET117_THIRD_PARTY_MODEL_UPGRADE_OWNER_OVERRIDES[0].behavior,
      },
    )
    assert.match(
      TARGET117_THIRD_PARTY_MODEL_UPGRADE_OWNER_OVERRIDES[0].behavior,
      /Select adapter.*ConfirmationButtons.*onDone\(true\).*onDone\(false\).*static whole-unit owner proof.*never a source replay/,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)

    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'Target117 structural ledger',
        ),
      ),
    )
    const target = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(target, 'u20218 structural unit')
    assert.deepEqual(
      {
        nodeType: target.target.nodeType,
        start: target.target.start,
        end: target.target.end,
        tokenCount: target.target.tokenCount,
        topDefinitionCount: target.target.topDefinitionCount,
        unknownFreeIdentifierCount: target.unknownFreeIdentifierCount,
        sha256: target.target.sourceHash,
        coarseHash: target.target.coarseHash,
      },
      {
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
        sha256: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
      },
    )
    const baseline = ledger.unmatchedBaseline.find(
      unit => unit.index === fixture.baselineUnit.baselineIndex,
    )
    assert.ok(baseline, 'u20147 unmatched baseline component')
    assert.equal(baseline.sourceHash, fixture.baselineUnit.sha256)
    assert.equal(baseline.coarseHash, fixture.baselineUnit.coarseHash)
    assert.equal(fixture.ownerResidue.strictUnderEvidenceValidator, true)
    assert.equal(fixture.ownerResidue.generatedOwner, 'components/ClaudeInChromeOnboarding.tsx')
    assert.equal(
      fixture.ownerResidue.correctedOwner,
      'components/ThirdPartyModelUpgradeDialog.tsx',
    )
  },
)

test(
  'authenticated whole units prove exactly the Select-to-ConfirmationButtons substitution',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_116_INNER_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'Target116 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 inner bundle',
    )
    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineUnit,
      'Target116 third-party model upgrade dialog',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target117 third-party model upgrade dialog',
    )
    assert.equal(cacheSize(baseline.node), fixture.baselineUnit.cacheSize)
    assert.equal(cacheSize(target.node), fixture.targetUnit.cacheSize)
    assert.equal(
      exactSlice(
        baselineBundle,
        fixture.controlSubstitution.baselineSelectCall,
        'Target116 Select call',
      ),
      fixture.controlSubstitution.baselineSelectCall.exact,
    )
    assert.equal(
      exactSlice(
        targetBundle,
        fixture.controlSubstitution.targetConfirmationCall,
        'Target117 ConfirmationButtons call',
      ),
      fixture.controlSubstitution.targetConfirmationCall.exact,
    )
    assert.equal(
      exactSlice(targetBundle, fixture.ownerResidue, 'onConfirm residue'),
      fixture.ownerResidue.value,
    )

    const targetConfirmationCalls = []
    walk(target.node, candidate => {
      if (candidate.type !== 'CallExpression') return
      const object = candidate.arguments[1]
      if (object?.type !== 'ObjectExpression') return
      const keys = object.properties.map(property => property.key.name)
      if (keys.includes('onConfirm')) targetConfirmationCalls.push(keys)
    })
    assert.deepEqual(targetConfirmationCalls, [['onConfirm', 'onCancel']])

    const normalizedBaseline = canonicalAst(
      normalizeBaselineWholeUnit(baseline.source),
    )
    const normalizedTarget = canonicalAst(normalizeTargetWholeUnit(target.source))
    assert.equal(normalizedBaseline.normalized, normalizedTarget.normalized)
    assert.deepEqual(
      {
        chars: normalizedTarget.chars,
        bytes: normalizedTarget.bytes,
        sha256: normalizedTarget.sha256,
      },
      {
        chars:
          fixture.controlSubstitution.canonicalWholeUnitEquivalence
            .normalizedChars,
        bytes:
          fixture.controlSubstitution.canonicalWholeUnitEquivalence
            .normalizedBytes,
        sha256:
          fixture.controlSubstitution.canonicalWholeUnitEquivalence.sha256,
      },
    )
  },
)

test(
  'Target117 initializer and shared ConfirmationButtons dependency are independently authenticated',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_116_INNER_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'Target116 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 inner bundle',
    )
    for (const expected of [
      fixture.moduleInitializers.baselineBinding,
      fixture.moduleInitializers.baselineInitializer,
    ]) {
      assert.equal(
        exactSlice(baselineBundle, expected, `baseline u${expected.baselineIndex}`),
        expected.exact,
      )
    }
    for (const expected of [
      fixture.moduleInitializers.targetBinding,
      fixture.moduleInitializers.targetInitializer,
    ]) {
      assert.equal(
        exactSlice(targetBundle, expected, `target u${expected.targetIndex}`),
        expected.exact,
      )
    }
    assert.match(fixture.moduleInitializers.baselineInitializer.exact, /s1\(\)/)
    assert.match(fixture.moduleInitializers.targetInitializer.exact, /YM\(\)/)

    const ledger = JSON.parse(
      gunzipSync(
        fs.readFileSync(path.join(repositoryRoot, fixture.structuralLedger.path)),
      ),
    )
    for (const expected of [
      fixture.confirmationDependency.targetDeclaration,
      fixture.confirmationDependency.targetInitializer,
    ]) {
      const region = ledger.regions.find(
        row => row.target.index === expected.targetIndex,
      )
      assert.ok(region, `u${expected.targetIndex}: structural region`)
      assert.equal(region.target.sourceHash, expected.sha256)
      assert.equal(region.target.coarseHash, expected.coarseHash)
      parseUnit(targetBundle, expected, `Target117 u${expected.targetIndex}`)
    }

    const selectedHelper = sourceFilename(
      selectedSourceRoot(),
      fixture.confirmationDependency.selectedSource.path,
    )
    if (fs.existsSync(selectedHelper)) {
      parseSource(
        selectedHelper,
        fixture.confirmationDependency.selectedSource,
        'ConfirmationButtons',
      )
    }
  },
)

test(
  'the absent Target117 source graph and stale Target118 donor keep source replay fail closed',
  { skip: !selected },
  () => {
    const root = selectedSourceRoot()
    const missingComponent = sourceFilename(
      root,
      fixture.sourceGraph.raw117.componentPath,
    )
    assert.equal(fs.existsSync(missingComponent), false, 'Target117 owner is absent')
    const selectedCaller = sourceFilename(root, fixture.sourceGraph.raw117.caller.path)
    assertRealFile(selectedCaller, 'Target117 interactiveHelpers')
    const selectedCallerBytes = readExact(
      selectedCaller,
      fixture.sourceGraph.raw117.caller,
      'Target117 interactiveHelpers',
    )
    const selectedCallerSource = selectedCallerBytes.toString('utf8')
    assert.equal(
      (selectedCallerSource.match(/ThirdPartyModelUpgradeDialog/g) ?? []).length,
      fixture.sourceGraph.raw117.caller.componentOccurrenceCount,
    )
    assert.equal(
      (selectedCallerSource.match(/toBedrockId/g) ?? []).length,
      fixture.sourceGraph.raw117.caller.bedrockProviderOccurrenceCount,
    )
    assert.equal(
      (selectedCallerSource.match(/toVertexId/g) ?? []).length,
      fixture.sourceGraph.raw117.caller.vertexProviderOccurrenceCount,
    )
    assert.equal(
      gitText([
        'rev-parse',
        `${fixture.sourceGraph.raw117.commit}^{tree}`,
      ]),
      fixture.sourceGraph.raw117.tree,
    )
    assert.equal(
      gitText([
        'rev-parse',
        `${fixture.sourceGraph.raw117.commit}:src/interactiveHelpers.tsx`,
      ]),
      fixture.sourceGraph.raw117.caller.blob,
    )

    const witness = fixture.sourceGraph.target118Witness
    const witnessFilename = path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.118', witness.path)
    const donor = parseSource(
      witnessFilename,
      witness,
      'ThirdPartyModelUpgradeDialog',
    )
    assert.equal(gitText(['rev-parse', `${witness.commit}^{tree}`]), witness.tree)
    assert.equal(
      gitText(['rev-parse', `${witness.commit}:${witness.path}`]),
      witness.blob,
    )
    for (const needle of witness.requiresPresent) {
      assert.equal(donor.source.includes(needle), true, `donor has ${needle}`)
    }
    for (const needle of witness.requiresAbsent) {
      assert.equal(donor.source.includes(needle), false, `donor lacks ${needle}`)
    }

    const candidate = deriveCandidate(donor.source)
    assert.equal(candidate.length, fixture.sourceGraph.boundedSemanticCandidate.chars)
    assert.deepEqual(
      descriptor(candidate),
      expectedDescriptor(fixture.sourceGraph.boundedSemanticCandidate),
    )
    const candidateFilename = 'ThirdPartyModelUpgradeDialog.candidate.tsx'
    const ts = typescript()
    const candidateFile = ts.createSourceFile(
      candidateFilename,
      candidate,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(candidateFile.parseDiagnostics.length, 0)
    const declaration = candidateFile.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'ThirdPartyModelUpgradeDialog',
    )
    assert.equal(
      declaration.getStart(candidateFile),
      fixture.sourceGraph.boundedSemanticCandidate.declaration.start,
    )
    assert.equal(
      declaration.end,
      fixture.sourceGraph.boundedSemanticCandidate.declaration.end,
    )
    exactStringSlice(
      candidate,
      fixture.sourceGraph.boundedSemanticCandidate.declaration,
      'bounded semantic candidate declaration',
    )
    assert.match(candidate, /<ConfirmationButtons/)
    assert.match(candidate, /onConfirm=\{\(\) => onDone\(true\)\}/)
    assert.equal(candidate.includes('<Select'), false)
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /component.*caller paths are absent.*Target118.*Select adapter.*unreachable.*inferred graph/,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
  },
)
