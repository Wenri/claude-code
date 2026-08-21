import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/fleet-view-runtime-status-owner-overrides.mjs'

const {
  TARGET121_FLEET_VIEW_RUNTIME_STATUS_EVIDENCE_IDS,
  TARGET121_FLEET_VIEW_RUNTIME_STATUS_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const gitEvidenceRepositoryRoot = path.resolve(
  process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ?? repositoryRoot,
)
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-fleet-view-runtime-status-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '0c9e00759791e91b9e89dcb7d8596a7d78f9119bb9325e90585d291acd7b78b1'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

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

function exactBufferSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) {
    assert.equal(value.toString('utf8'), expected.exact, label)
  }
  return value.toString('utf8')
}

function exactStringSlice(source, expected, label) {
  const value = source.slice(expected.start, expected.end)
  assert.equal(value.length, expected.chars ?? expected.end - expected.start)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function canonicalize(value, parent = null, key = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalize(child, value, index))
  }
  if (value === null || typeof value !== 'object') return value
  const result = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
    if (value.type === 'Identifier' && childKey === 'name') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed) ||
        (parent?.type === 'Property' &&
          key === 'key' &&
          !parent.computed &&
          !parent.shorthand) ||
        (parent?.type === 'MethodDefinition' &&
          key === 'key' &&
          !parent.computed)
      result[childKey] = preserve ? child : '@id'
    } else if (
      value.type === 'Literal' &&
      childKey === 'value' &&
      [
        '2.1.120',
        '2.1.121',
        '2026-04-24T19:00:49Z',
        '2026-04-27T01:32:27Z',
        '080f07fb4224786b965b9ea0a35f0cff594f2eb6',
        '16ffea721a0a39bc787a236dc19fb62307180b75',
      ].includes(child)
    ) {
      result[childKey] = '@build'
    } else {
      result[childKey] = canonicalize(child, value, childKey)
    }
  }
  return result
}

function canonicalDescriptor(node) {
  return descriptor(JSON.stringify(canonicalize(node)))
}

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  return { node, source }
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit)
    }
  }
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

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function sourceFilename(root, selectedPath) {
  assert.ok(selectedPath.startsWith('src/'))
  return path.join(root, selectedPath.slice(4))
}

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
}

function parseTsSource(expected, root) {
  const filename = sourceFilename(root, expected.selectedPath)
  assertRealFile(filename, expected.selectedPath)
  const bytes = readExact(filename, expected, expected.selectedPath)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    expected.selectedPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return { source, sourceFile, ts }
}

function fleetViewDeclaration(parsed) {
  const declaration = parsed.sourceFile.statements.find(
    node =>
      parsed.ts.isFunctionDeclaration(node) && node.name?.text === 'FleetView',
  )
  assert.ok(declaration, 'FleetView declaration')
  return declaration
}

function assertFleetViewSource(expected, root) {
  const parsed = parseTsSource(expected, root)
  const declaration = fleetViewDeclaration(parsed)
  assert.equal(declaration.getStart(parsed.sourceFile), expected.fleetViewDeclaration.start)
  assert.equal(declaration.end, expected.fleetViewDeclaration.end)
  const declarationSource = exactStringSlice(
    parsed.source,
    expected.fleetViewDeclaration,
    `${expected.selectedPath}: FleetView`,
  )
  assert.equal(
    countOccurrences(declarationSource, 'useLayoutEffect('),
    expected.lexicalCounts.useLayoutEffectCalls,
  )
  assert.equal(
    countOccurrences(declarationSource, "Couldn't "),
    expected.lexicalCounts.couldntInDeclaration,
  )
  assert.equal(
    countOccurrences(parsed.source, 'no job focused'),
    expected.lexicalCounts.noJobFocused,
  )
  assert.equal(
    countOccurrences(parsed.source, 'cliVersion'),
    expected.lexicalCounts.cliVersion,
  )
  assert.equal(
    countOccurrences(declarationSource, 'MACRO.VERSION'),
    expected.lexicalCounts.macroVersion,
  )
  return parsed
}

function gitText(args) {
  return execFileSync('git', args, {
    cwd: gitEvidenceRepositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function assertGitFile(expected) {
  assert.equal(
    gitText(['rev-parse', `${expected.commit}:${expected.selectedPath}`]),
    expected.blob,
  )
}

function assertLedgerRegion(region, expected) {
  assert.equal(region.classification, expected.classification)
  assert.equal(region.target.index, expected.targetIndex)
  assert.equal(region.target.nodeType, expected.nodeType)
  assert.equal(region.target.start, expected.start)
  assert.equal(region.target.end, expected.end)
  assert.equal(region.target.tokenCount, expected.tokenCount)
  assert.equal(region.target.sourceHash, expected.sha256)
  assert.equal(region.target.coarseHash, expected.coarseHash)
  assert.equal(region.unknownFreeIdentifierCount, expected.unknownFreeIdentifierCount)
}

function assertUnmatchedBaseline(ledger, expected) {
  const actual = ledger.unmatchedBaseline.find(
    candidate => candidate.index === expected.baselineUnitIndex,
  )
  assert.ok(actual, `baseline u${expected.baselineUnitIndex}`)
  assert.equal(actual.nodeType, expected.nodeType)
  assert.equal(actual.start, expected.start)
  assert.equal(actual.end, expected.end)
  assert.equal(actual.tokenCount, expected.tokenCount)
  assert.equal(actual.sourceHash, expected.sha256)
  assert.equal(actual.coarseHash, expected.coarseHash)
}

function strictSlice(bundle, row) {
  const [kind, value, start, end] = row
  const actual = bundle.subarray(start, end).toString('utf8')
  if (kind === 'property') assert.equal(actual, value)
  else if (value === "Couldn't ") assert.equal(actual, value)
  else assert.equal(actual, JSON.stringify(value))
}

test(
  'Target121 FleetView runtime/status owner proof exports are exact and static',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      TARGET121_FLEET_VIEW_RUNTIME_STATUS_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_FLEET_VIEW_RUNTIME_STATUS_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: override.paths,
        declarations: override.declarations,
        evidenceIds: override.evidenceIds,
      })),
      [20945, 20949].map(targetIndex => ({
        key: `${caseName}:${targetIndex}`,
        targetIndex,
        paths: ['src/components/FleetView.tsx'],
        declarations: ['FleetView'],
        evidenceIds: fixture.evidenceIds,
      })),
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(fixture.generatorWiring.expectedAddedOwnerImpact, {
      units: -2,
      residues: -116,
    })
  },
)

test(
  'Target121 authenticates complete FleetView/status units and their direct call boundary',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_120_INNER_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const fleetBaseline = parseUnit(
      baselineBundle,
      fixture.units.fleetView.baseline,
      'Target120 FleetView predecessor',
    )
    const fleetTarget = parseUnit(
      targetBundle,
      fixture.units.fleetView.target,
      'Target121 FleetView',
    )
    const statusBaseline = parseUnit(
      baselineBundle,
      fixture.units.jobStatus.baseline,
      'Target120 job status',
    )
    const statusTarget = parseUnit(
      targetBundle,
      fixture.units.jobStatus.target,
      'Target121 job status',
    )
    parseUnit(
      targetBundle,
      fixture.units.moduleInitializer,
      'Target121 FleetView module initializer',
    )
    assertLedgerRegion(ledger.regions[20945], fixture.units.fleetView.target)
    assertLedgerRegion(ledger.regions[20949], fixture.units.jobStatus.target)
    assertLedgerRegion(ledger.regions[20953], fixture.units.moduleInitializer)
    assertUnmatchedBaseline(ledger, fixture.units.fleetView.baseline)
    assertUnmatchedBaseline(ledger, fixture.units.jobStatus.baseline)

    const baselineCall = exactBufferSlice(
      baselineBundle,
      fixture.units.fleetView.directStatusCall.baseline,
      'Target120 FleetView status call',
    )
    const targetCall = exactBufferSlice(
      targetBundle,
      fixture.units.fleetView.directStatusCall.target,
      'Target121 FleetView status call',
    )
    assert.deepEqual(
      canonicalDescriptor(parse(baselineCall, { ecmaVersion: 'latest' }).body[0]),
      fixture.units.fleetView.directStatusCall.canonical,
    )
    assert.deepEqual(
      canonicalDescriptor(parse(targetCall, { ecmaVersion: 'latest' }).body[0]),
      fixture.units.fleetView.directStatusCall.canonical,
    )

    assert.deepEqual(
      canonicalDescriptor(statusBaseline.node),
      expectedDescriptor(fixture.units.jobStatus.normalizedWholeUnit),
    )
    assert.deepEqual(
      canonicalDescriptor(statusTarget.node),
      expectedDescriptor(fixture.units.jobStatus.normalizedWholeUnit),
    )
    assert.equal(fleetTarget.node.body.type, 'BlockStatement')
    assert.equal(fleetBaseline.node.body.type, 'BlockStatement')

    for (const label of fixture.units.jobStatus.runtimeLabels) {
      assert.equal(targetBundle.subarray(label.start, label.end).toString(), label.value)
      assert.deepEqual(descriptor(label.value), expectedDescriptor(label))
    }
    let cacheSize = null
    walk(statusTarget.node, node => {
      if (
        cacheSize === null &&
        node.type === 'CallExpression' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal' &&
        node.arguments[0].value === 40
      ) {
        cacheSize = 40
      }
    })
    assert.equal(cacheSize, 40)
    for (const row of fixture.strictResidues.fleetView) strictSlice(targetBundle, row)
    for (const row of fixture.strictResidues.jobStatus) strictSlice(targetBundle, row)
  },
)

test(
  'Target121 FleetView source proves ownership but rejects an invented partial replay',
  { skip: !selected },
  () => {
    const baseline = fixture.sourceStates.baseline120
    const target = fixture.sourceStates.target121
    assertGitFile(baseline)
    assertGitFile(target)
    assert.equal(gitText(['rev-parse', `${target.commit}^{tree}`]), target.tree)

    assertFleetViewSource(
      baseline,
      path.resolve(
        process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
          path.join(
            repositoryRoot,
            '.recovery-tmp/semantic-trees/2.1.120/src',
          ),
      ),
    )
    const selectedTargetRoot = path.resolve(
      process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
        process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
    )
    const parsedTarget = assertFleetViewSource(target, selectedTargetRoot)
    exactStringSlice(
      parsedTarget.source,
      target.layoutEffectAnchor,
      'Target121 authored layout effect',
    )
    assert.equal(countOccurrences(parsedTarget.source, 'no job focused'), 0)
    assert.equal(countOccurrences(parsedTarget.source, 'cliVersion'), 0)
    assert.match(parsedTarget.source, /detail && selected/)
    assert.match(parsedTarget.source, /selected\.state\.detail/)
    assert.equal(fixture.sourceReplayBlocker.decision.includes('no replay'), true)
  },
)

test(
  'Target121 frozen residue partition and fail-closed wiring remain explicit',
  { skip: !selected },
  () => {
    const [fleetView, jobStatus] = fixture.frozenSharedSnapshot.units
    assert.deepEqual(
      [fleetView.targetIndex, fleetView.ownerRows.count, fleetView.addedRows.count, fleetView.rawStrictRows.count],
      [20945, 1651, 95, 7],
    )
    assert.deepEqual(
      [jobStatus.targetIndex, jobStatus.ownerRows.count, jobStatus.addedRows.count, jobStatus.rawStrictRows.count],
      [20949, 211, 21, 6],
    )
    assert.equal(fixture.strictResidues.fleetView.length, 7)
    assert.equal(fixture.strictResidues.jobStatus.length, 6)
    assert.deepEqual(fixture.generatorWiring.expectedRawStrictImpact, {
      units: -2,
      residues: -13,
    })
    assert.equal(
      fixture.ownerCorrection.correctedOwner,
      'src/components/FleetView.tsx',
    )
    assert.match(
      fixture.ownerCorrection.internalStatusDeclaration,
      /authored symbol unavailable/,
    )
  },
)
