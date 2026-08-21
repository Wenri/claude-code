import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget119SetupRendezvousSourceRecovery,
  buildTarget119SetupRendezvousOutput,
  TARGET119_SETUP_RENDEZVOUS_DEPENDENCY_TARGET_INDICES,
  TARGET119_SETUP_RENDEZVOUS_EVIDENCE_IDS,
  TARGET119_SETUP_RENDEZVOUS_OWNER_OVERRIDES,
  TARGET119_SETUP_RENDEZVOUS_PROOF_SPEC,
  TARGET119_SETUP_RENDEZVOUS_SOURCE_VARIANTS,
} from '../cases/2.1.118-to-2.1.119/recovered/setup-rendezvous-server-strict-property-source-recovery.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const semanticRoot = path.join(root, '.recovery-tmp/semantic-trees')
const selectedSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(root, 'src')
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-setup-rendezvous-server-strict-property-source-gap.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/setup-rendezvous-server-strict-property-source-recovery.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '004c2df8da729923878cc9dbee3faa2e2d6e059ba1106cf6ee6414591558b210'
const HELPER_SHA256 =
  'a10024d010240fd3487ce3394a42a286a788004dd0236623db2c0f88b38f68f4'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const jsonDescriptor = value => {
  const bytes = Buffer.from(JSON.stringify(value))
  return {
    rows: Array.isArray(value) ? value.length : undefined,
    jsonBytes: bytes.length,
    sha256: sha256(bytes),
  }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function resolveArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const match = fixture.artifactPhasePolicy.accepted.find(
    phase =>
      phase.typedAudit.bytes === typedAudit.bytes &&
      phase.typedAudit.sha256 === typedAudit.sha256 &&
      phase.sourceCoverage.bytes === sourceCoverage.bytes &&
      phase.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      (phase.sourceCoverageRaw === undefined
        ? sourceCoverageRaw === undefined
        : sourceCoverageRaw !== undefined &&
          phase.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
          phase.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256),
  )
  if (!match) throw new Error('unrecognized Target119 report/coverage pair')
  return match.phase
}

function tokenCount(source) {
  const tokens = []
  parse(source, {
    ecmaVersion: 'latest',
    onToken: tokens,
    sourceType: 'module',
  })
  assert.equal(tokens.at(-1).type.label, 'eof')
  return tokens.length - 1
}

function parseUnit(bundle, expected) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  const text = bytes.toString('utf8')
  const ast = parse(text, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, expected.nodeType)
  assert.equal(tokenCount(text), expected.tokenCount)
  return { bytes, text, ast, node: ast.body[0] }
}

function containsIdentifier(node, name) {
  if (node === null || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(child => containsIdentifier(child, name))
  if (node.type === 'Identifier' && node.name === name) return true
  return Object.entries(node).some(
    ([key, child]) =>
      !['end', 'loc', 'range', 'raw', 'start'].includes(key) &&
      containsIdentifier(child, name),
  )
}

function daemonGateStatements(program) {
  assert.equal(program.body.length, 1)
  const declaration = program.body[0]
  assert.equal(declaration.type, 'FunctionDeclaration')
  return declaration.body.body.filter(
    node =>
      node.type === 'IfStatement' &&
      containsIdentifier(node.test, 'CLAUDE_BG_BACKEND'),
  )
}

function canonicalValue(value) {
  const identifiers = new Map()
  function clean(child) {
    if (Array.isArray(child)) return child.map(clean)
    if (child === null || typeof child !== 'object') return child
    const output = {}
    for (const key of Object.keys(child).sort()) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
      let nested = child[key]
      if (child.type === 'Identifier' && key === 'name') {
        if (!identifiers.has(nested)) {
          identifiers.set(nested, `i${identifiers.size}`)
        }
        nested = identifiers.get(nested)
      }
      output[key] = clean(nested)
    }
    return output
  }
  return Buffer.from(JSON.stringify(clean(value)))
}

function canonicalProgram(source, { removeDaemonGate = false } = {}) {
  const program = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  if (removeDaemonGate) {
    const gates = daemonGateStatements(program)
    assert.equal(gates.length, 1)
    const body = program.body[0].body.body
    body.splice(body.indexOf(gates[0]), 1)
  }
  return canonicalValue(program)
}

function occurrenceOffsets(source, value) {
  const offsets = []
  for (let start = source.indexOf(value); start >= 0; start = source.indexOf(value, start + 1)) {
    offsets.push(start)
  }
  return offsets
}

function structuralUnit(structural, side, index) {
  if (side === 'target') {
    return structural.regions.map(region => region.target).find(unit => unit.index === index)
  }
  return [
    ...structural.unmatchedBaseline,
    ...structural.regions.map(region => region.baseline).filter(Boolean),
  ].find(unit => unit.index === index)
}

function assertStructuralUnit(actual, expected) {
  assert(actual)
  assert.deepEqual(
    {
      index: actual.index,
      nodeType: actual.nodeType,
      start: actual.start,
      end: actual.end,
      tokenCount: actual.tokenCount,
      sourceHash: actual.sourceHash,
      coarseHash: actual.coarseHash,
    },
    {
      index: expected.index,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      tokenCount: expected.tokenCount,
      sourceHash: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
}

function gitBlob(commit, sourcePath) {
  const result = spawnSync('git', ['rev-parse', `${commit}:${sourcePath}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function gitPathPresent(commit, sourcePath) {
  return (
    spawnSync('git', ['cat-file', '-e', `${commit}:${sourcePath}`], {
      cwd: root,
      encoding: 'utf8',
    }).status === 0
  )
}

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function sourceFile(ts, filename, text) {
  const parsed = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function functionDeclarations(ts, parsed, text, name) {
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      const start = node.getStart(parsed)
      const end = node.end
      matches.push({ start, end, ...descriptor(Buffer.from(text.slice(start, end))) })
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return matches
}

function sourceDaemonGates(ts, parsed, text) {
  const matches = []
  function visit(node) {
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(parsed) ===
        "process.env.CLAUDE_BG_BACKEND === 'daemon'"
    ) {
      const start = node.getStart(parsed)
      const end = node.end
      matches.push({ node, text: text.slice(start, end), start, end })
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return matches
}

async function runCompiledGate(exact, backend) {
  const events = []
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const execute = new AsyncFunction(
    'process',
    'JX6',
    'yE7',
    `${exact}; return true`,
  )
  await execute(
    { env: backend === undefined ? {} : { CLAUDE_BG_BACKEND: backend } },
    () => events.push('initialize'),
    { startRendezvousServer: () => events.push('start') },
  )
  return events
}

function rendezvousMocks(socketPath) {
  const events = []
  const processMock = {
    env: socketPath ? { CLAUDE_BG_RENDEZVOUS_SOCK: socketPath } : {},
    exit: code => events.push(['exit', code]),
  }
  const server = {
    on(event) {
      events.push(['on', event])
      return this
    },
    listen(value) {
      events.push(['listen', value])
      return this
    },
    unref() {
      events.push(['unref'])
      return this
    },
    close() {
      events.push(['close'])
    },
  }
  return {
    events,
    processMock,
    server,
    modules: {
      fsPromises: {
        async unlink(value) {
          events.push(['unlink', value])
        },
      },
      net: {
        createServer() {
          events.push(['createServer'])
          return server
        },
      },
      decoder: { StringDecoder },
      timers: { setTimeout: async () => {} },
      debug: { logForDebugging: (...args) => events.push(['debug', ...args]) },
    },
  }
}

async function runCompiledRendezvous(unitText, socketPath) {
  const harness = rendezvousMocks(socketPath)
  const factory = Function(
    'process',
    'VE7',
    'kE7',
    'NE7',
    'y',
    'aV1',
    `let cGH,b6H;${unitText};return rV1`,
  )
  const start = factory(
    harness.processMock,
    harness.modules.fsPromises,
    harness.modules.net,
    harness.modules.decoder,
    harness.modules.debug.logForDebugging,
    () => {},
  )
  await start()
  return harness
}

async function runSourceRendezvous(ts, source, socketPath) {
  const harness = rendezvousMocks(socketPath)
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  function requireMock(request) {
    if (request === 'fs/promises') return harness.modules.fsPromises
    if (request === 'net') return harness.modules.net
    if (request === 'string_decoder') return harness.modules.decoder
    if (request === 'timers/promises') return harness.modules.timers
    if (request === '../utils/debug.js') return harness.modules.debug
    throw new Error(`unexpected rendezvous import ${request}`)
  }
  Function('require', 'module', 'exports', 'process', output)(
    requireMock,
    module,
    module.exports,
    harness.processMock,
  )
  await module.exports.startRendezvousServer()
  return harness
}

test(
  'Target119 setup rendezvous fixture, helper exports, and current artifact phase remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetVersion, '2.1.119')
    assert.deepEqual(
      TARGET119_SETUP_RENDEZVOUS_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET119_SETUP_RENDEZVOUS_DEPENDENCY_TARGET_INDICES,
      fixture.ownerCorrection.dependencyTargetIndices,
    )
    assert.deepEqual(
      TARGET119_SETUP_RENDEZVOUS_SOURCE_VARIANTS,
      fixture.sourceReplay.variants.map(variant => ({
        state: variant.state,
        input: { path: fixture.sourceReplay.path, ...variant.input },
        output: {
          path: fixture.sourceReplay.path,
          bytes: variant.output.bytes,
          sha256: variant.output.sha256,
        },
      })),
    )
    assert.deepEqual(TARGET119_SETUP_RENDEZVOUS_PROOF_SPEC, {
      targetIndex: fixture.ownerCorrection.targetIndex,
      baselineUnitIndex: fixture.units.baselineSetup.index,
      structuralClassification: fixture.units.targetSetup.classification,
      coverageDisposition:
        fixture.snapshotPartitions.coverageRows[0].disposition,
      existingOwnerIds: fixture.ownerCorrection.existingOwnerIds,
      correctedOwnerIds: fixture.ownerCorrection.correctedOwnerIds,
      sourceCallSitePresentBeforeReplay: false,
      sourceReplayRequired: fixture.sourceReplay.required,
      strictResidue: {
        kind: 'property',
        value: fixture.snapshotPartitions.typedResidues[0].value,
        start: fixture.snapshotPartitions.typedResidues[0].target.start,
        end: fixture.snapshotPartitions.typedResidues[0].target.end,
        baselineCount:
          fixture.snapshotPartitions.typedResidues[0]
            .baselineOccurrenceCount,
        targetOrdinal:
          fixture.snapshotPartitions.typedResidues[0]
            .targetOccurrenceNumber,
        targetAdded: fixture.snapshotPartitions.typedResidues[0].targetAdded,
      },
    })
    assert.deepEqual(TARGET119_SETUP_RENDEZVOUS_OWNER_OVERRIDES[0], {
      key: `${caseName}:21685`,
      targetIndex: 21685,
      paths: fixture.ownerCorrection.paths,
      declarations: fixture.ownerCorrection.declarations,
      dependencyTargetIndices:
        fixture.ownerCorrection.dependencyTargetIndices,
      evidenceIds: fixture.evidenceIds,
      behavior: TARGET119_SETUP_RENDEZVOUS_OWNER_OVERRIDES[0].behavior,
    })

    const [current, postRendezvous, postStreaming] =
      fixture.artifactPhasePolicy.accepted
    assert.equal(
      resolveArtifactPhase(current.typedAudit, current.sourceCoverage),
      'post-u21367-current',
    )
    assert.equal(
      resolveArtifactPhase(
        postRendezvous.typedAudit,
        postRendezvous.sourceCoverage,
      ),
      'post-rendezvous',
    )
    assert.equal(
      resolveArtifactPhase(
        postStreaming.typedAudit,
        postStreaming.sourceCoverage,
        postStreaming.sourceCoverageRaw,
      ),
      'post-streaming',
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          postStreaming.typedAudit,
          postStreaming.sourceCoverage,
        ),
      /unrecognized/,
    )
    const previousTyped = {
      bytes: 24701325,
      sha256:
        'e4fc8b6cc60092ba5bd3b451cefcd1bc1834bc988cb7b4f062e57cb1767cbe0b',
    }
    const previousCoverage = {
      bytes: 377500,
      sha256:
        '69b05794654d35c242fef43ae7f1844ca947c677c1f2de72d9b1d34f9972ab03',
    }
    assert.throws(
      () => resolveArtifactPhase(previousTyped, previousCoverage),
      /unrecognized/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(previousTyped, postRendezvous.sourceCoverage),
      /unrecognized/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(postRendezvous.typedAudit, previousCoverage),
      /unrecognized/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          current.typedAudit,
          postRendezvous.sourceCoverage,
        ),
      /unrecognized/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          postRendezvous.typedAudit,
          current.sourceCoverage,
        ),
      /unrecognized/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          { bytes: 1, sha256: '0'.repeat(64) },
          { bytes: 2, sha256: 'f'.repeat(64) },
        ),
      /unrecognized/,
    )

    assert.deepEqual(
      jsonDescriptor(fixture.snapshotPartitions.typedResidues),
      fixture.snapshotPartitions.typedResiduesDescriptor,
    )
    assert.deepEqual(
      jsonDescriptor(fixture.snapshotPartitions.coverageRows),
      fixture.snapshotPartitions.coverageRowsDescriptor,
    )
    assert.deepEqual(
      jsonDescriptor(fixture.snapshotPartitions.ownerCatalog),
      fixture.snapshotPartitions.ownerCatalogDescriptor,
    )
    assert.deepEqual(
      jsonDescriptor(fixture.postRendezvous.typedResidues),
      fixture.postRendezvous.typedResiduesDescriptor,
    )
    assert.deepEqual(
      jsonDescriptor(fixture.postRendezvous.coverageRows),
      fixture.postRendezvous.coverageRowsDescriptor,
    )
    assert.deepEqual(
      fixture.postRendezvous.typedResidues[0].ownerPaths,
      ['daemon/rendezvous.ts', 'setup.ts'],
    )
    assert.deepEqual(fixture.postStreaming, {
      typedResiduesDescriptor:
        fixture.postRendezvous.typedResiduesDescriptor,
      coverageRowsDescriptor: fixture.postRendezvous.coverageRowsDescriptor,
      typedResiduesUnchangedFromPostRendezvous: true,
      coverageRowsUnchangedFromPostRendezvous: true,
      sourceSetupUnchangedFromPostRendezvous: true,
    })
    assert.deepEqual(fixture.postRendezvous.coverageRows[0], {
      targetIndex: 21685,
      start: fixture.units.targetSetup.start,
      end: fixture.units.targetSetup.end,
      nodeType: fixture.units.targetSetup.nodeType,
      sourceHash: fixture.units.targetSetup.sha256,
      structuralClass: fixture.units.targetSetup.classification,
      disposition: 'source-runtime-covered',
      ownerIds: [
        'owner-src-setup-ts',
        'owner-src-daemon-rendezvous-ts',
      ],
      evidenceIds: fixture.evidenceIds,
      behavior: TARGET119_SETUP_RENDEZVOUS_OWNER_OVERRIDES[0].behavior,
    })
    assert.deepEqual(fixture.postRendezvous.sourceSetup, {
      path: fixture.sourceReplay.path,
      bytes: fixture.sourceReplay.variants[0].output.bytes,
      sha256: fixture.sourceReplay.variants[0].output.sha256,
    })
    assert.equal(
      sha256(Buffer.from(JSON.stringify([21685]))),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(
        Buffer.from(
          JSON.stringify([
            [
              21685,
              'property',
              'startRendezvousServer',
              13464689,
              13464710,
              0,
              2,
              true,
            ],
          ]),
        ),
      ),
      fixture.summary.strictResidueIdentitiesSha256,
    )
  },
)

test(
  'complete Target119 setup unit is Target118 u20779 plus exactly one daemon rendezvous gate',
  {
    skip: selected ? false : `not applicable to ${selectedCase}`,
    timeout: 30000,
  },
  async () => {
    const structuralBytes = readExact(
      path.join(root, fixture.inputs.structural.path),
      fixture.inputs.structural,
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_BASELINE_ARTIFACT', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_TARGET_ARTIFACT', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const baselineSpec = fixture.units.baselineSetup
    const targetSpec = fixture.units.targetSetup
    assertStructuralUnit(
      structuralUnit(structural, 'baseline', baselineSpec.index),
      baselineSpec,
    )
    assertStructuralUnit(
      structuralUnit(structural, 'target', targetSpec.index),
      targetSpec,
    )
    const targetRegion = structural.regions.find(
      region => region.target.index === targetSpec.index,
    )
    assert.equal(targetRegion.classification, 'unresolved')
    assert.equal(targetRegion.unknownFreeIdentifierCount, 4)
    assert.equal(
      structural.unmatchedBaseline.some(unit => unit.index === baselineSpec.index),
      true,
    )

    const baseline = parseUnit(baselineBundle, baselineSpec)
    const target = parseUnit(targetBundle, targetSpec)
    assert.equal(baseline.node.body.body.length, 22)
    assert.equal(target.node.body.body.length, 23)
    const gates = daemonGateStatements(target.ast)
    assert.equal(gates.length, 1)
    const gate = gates[0]
    assert.equal(target.node.body.body.indexOf(gate), 5)
    assert.deepEqual(
      {
        localStart: gate.start,
        localEnd: gate.end,
        start: targetSpec.start + gate.start,
        end: targetSpec.start + gate.end,
        ...descriptor(Buffer.from(target.text.slice(gate.start, gate.end))),
      },
      {
        localStart: fixture.units.daemonBranch.localStart,
        localEnd: fixture.units.daemonBranch.localEnd,
        start: fixture.units.daemonBranch.start,
        end: fixture.units.daemonBranch.end,
        bytes: fixture.units.daemonBranch.bytes,
        sha256: fixture.units.daemonBranch.sha256,
      },
    )
    assert.equal(
      target.text.slice(gate.start, gate.end),
      fixture.units.daemonBranch.exact,
    )
    assert.deepEqual(
      descriptor(canonicalValue(gate)),
      fixture.units.daemonBranch.canonicalAst,
    )
    assert.deepEqual(
      descriptor(canonicalProgram(baseline.text)),
      fixture.units.canonicalPredecessorProof.baselineCanonicalAst,
    )
    assert.deepEqual(
      descriptor(canonicalProgram(target.text)),
      fixture.units.canonicalPredecessorProof.targetCanonicalAst,
    )
    assert.deepEqual(
      descriptor(canonicalProgram(target.text, { removeDaemonGate: true })),
      fixture.units.canonicalPredecessorProof
        .targetWithoutDaemonBranchCanonicalAst,
    )
    assert.deepEqual(
      canonicalProgram(target.text, { removeDaemonGate: true }),
      canonicalProgram(baseline.text),
    )
    assert.deepEqual(
      occurrenceOffsets(baselineBundle.toString('utf8'), 'startRendezvousServer'),
      [],
    )
    assert.deepEqual(
      occurrenceOffsets(targetBundle.toString('utf8'), 'startRendezvousServer'),
      [8773089, 13464689],
    )
    assert.deepEqual(
      occurrenceOffsets(target.text, 'startRendezvousServer'),
      [323],
    )
    assert.deepEqual(
      await runCompiledGate(fixture.units.daemonBranch.exact, undefined),
      [],
    )
    assert.deepEqual(
      await runCompiledGate(fixture.units.daemonBranch.exact, 'peer'),
      [],
    )
    assert.deepEqual(
      await runCompiledGate(fixture.units.daemonBranch.exact, 'daemon'),
      ['initialize', 'start'],
    )
  },
)

test(
  'rendezvous export, complete implementation, and initializer authenticate the u21685 dependency graph',
  {
    skip: selected ? false : `not applicable to ${selectedCase}`,
    timeout: 30000,
  },
  async () => {
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
        ),
      ),
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_TARGET_ARTIFACT', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const parsed = new Map()
    for (const unit of fixture.units.dependencyUnits) {
      assertStructuralUnit(
        structuralUnit(structural, 'target', unit.index),
        unit,
      )
      const region = structural.regions.find(
        candidate => candidate.target.index === unit.index,
      )
      assert.equal(region.classification, 'unresolved')
      parsed.set(unit.index, parseUnit(targetBundle, unit))
    }
    const exportUnit = parsed.get(13936).text
    const implementationUnit = parsed.get(13937).text
    const initializerUnit = parsed.get(13942).text
    assert.equal(exportUnit, fixture.units.dependencyUnits[0].exact)
    assert.match(
      exportUnit,
      /startRendezvousServer:\(\)=>rV1/,
    )
    assert.match(fixture.units.daemonBranch.exact, /JX6\(\),yE7/)
    assert.equal(initializerUnit, fixture.units.dependencyUnits[2].exact)
    assert.match(initializerUnit, /VE7=require\("fs\/promises"\)/)
    assert.match(initializerUnit, /kE7=require\("net"\)/)
    assert.match(initializerUnit, /NE7=require\("string_decoder"\)/)
    assert.match(
      implementationUnit,
      /^async function rV1\(\)\{let H=process\.env\.CLAUDE_BG_RENDEZVOUS_SOCK/,
    )
    assert.match(implementationUnit, /if\(!H\|\|cGH\)return/)
    assert.match(implementationUnit, /delete process\.env\.CLAUDE_BG_RENDEZVOUS_SOCK/)
    assert.match(implementationUnit, /cGH=kE7\.createServer/)
    assert.match(implementationUnit, /cGH\.listen\(H\),cGH\.unref\(\)/)

    const skipped = await runCompiledRendezvous(implementationUnit, undefined)
    assert.deepEqual(skipped.events, [])
    const compiled = await runCompiledRendezvous(
      implementationUnit,
      '/tmp/target119-rendezvous.sock',
    )
    assert.deepEqual(compiled.events, [
      ['unlink', '/tmp/target119-rendezvous.sock'],
      ['createServer'],
      ['on', 'error'],
      ['listen', '/tmp/target119-rendezvous.sock'],
      ['unref'],
    ])
    assert.equal(
      Object.hasOwn(
        compiled.processMock.env,
        'CLAUDE_BG_RENDEZVOUS_SOCK',
      ),
      false,
    )
    assert.equal(
      sha256(
        Buffer.from(
          JSON.stringify(TARGET119_SETUP_RENDEZVOUS_DEPENDENCY_TARGET_INDICES),
        ),
      ),
      fixture.summary.dependencyTargetIndicesSha256,
    )
    assert.equal(
      sha256(Buffer.from(JSON.stringify([13936, 13937, 13942, 21685]))),
      fixture.summary.completeGraphTargetIndicesSha256,
    )
  },
)

test(
  'exact source graph proves the missing setup call and retained rendezvous implementation',
  {
    skip: selected ? false : `not applicable to ${selectedCase}`,
    timeout: 30000,
  },
  async () => {
    const ts = await loadTypeScript()
    const baseline = fixture.sourceGraph.baseline
    const target = fixture.sourceGraph.target
    const baselineSetup = readExact(
      path.join(semanticRoot, '2.1.118', baseline.setup.path),
      baseline.setup,
    )
    const targetSetup = readExact(
      path.join(semanticRoot, '2.1.119', target.setup.path),
      target.setup,
    )
    const targetRendezvous = readExact(
      path.join(semanticRoot, '2.1.119', target.rendezvous.path),
      target.rendezvous,
    )
    const retainedSetup = readExact(
      path.join(
        semanticRoot,
        '2.1.120',
        fixture.sourceGraph.retainedTarget120.setup.path,
      ),
      fixture.sourceGraph.retainedTarget120.setup,
    )
    const retainedRendezvous = readExact(
      path.join(
        semanticRoot,
        '2.1.120',
        fixture.sourceGraph.retainedTarget120.rendezvous.path,
      ),
      fixture.sourceGraph.retainedTarget120.rendezvous,
    )
    assert.deepEqual(baselineSetup, targetSetup)
    assert.deepEqual(targetSetup, retainedSetup)
    assert.deepEqual(targetRendezvous, retainedRendezvous)
    assert.equal(gitBlob(baseline.commit, baseline.setup.path), baseline.setup.gitBlobSha1)
    assert.equal(gitBlob(target.commit, target.setup.path), target.setup.gitBlobSha1)
    assert.equal(
      gitBlob(target.commit, target.rendezvous.path),
      target.rendezvous.gitBlobSha1,
    )
    assert.equal(
      gitPathPresent(baseline.commit, target.rendezvous.path),
      baseline.rendezvousPathPresent,
    )

    const targetSetupText = targetSetup.toString('utf8')
    const targetRendezvousText = targetRendezvous.toString('utf8')
    const setupParsed = sourceFile(
      ts,
      target.setup.path,
      targetSetupText,
    )
    const rendezvousParsed = sourceFile(
      ts,
      target.rendezvous.path,
      targetRendezvousText,
    )
    assert.deepEqual(
      functionDeclarations(ts, setupParsed, targetSetupText, 'setup'),
      [target.setup.setupDeclaration],
    )
    assert.deepEqual(
      functionDeclarations(
        ts,
        rendezvousParsed,
        targetRendezvousText,
        'startRendezvousServer',
      ),
      [
        {
          start: target.rendezvous.declaration.start,
          end: target.rendezvous.declaration.end,
          bytes: target.rendezvous.declaration.bytes,
          sha256: target.rendezvous.declaration.sha256,
        },
      ],
    )
    assert.deepEqual(
      sourceDaemonGates(ts, setupParsed, targetSetupText),
      [],
    )
    assert.equal(targetSetupText.includes('startRendezvousServer'), false)
    assert.equal(targetRendezvousText.includes('startRendezvousServer'), true)

    const sourceRuntime = await runSourceRendezvous(
      ts,
      targetRendezvousText,
      '/tmp/target119-rendezvous.sock',
    )
    assert.deepEqual(sourceRuntime.events, [
      ['unlink', '/tmp/target119-rendezvous.sock'],
      ['createServer'],
      ['on', 'error'],
      ['listen', '/tmp/target119-rendezvous.sock'],
      ['unref'],
    ])
  },
)

test(
  'minimal source replay restores only the authenticated daemon gate and is fail closed',
  {
    skip: selected ? false : `not applicable to ${selectedCase}`,
    timeout: 30000,
  },
  async () => {
    const ts = await loadTypeScript()
    const selectedSetupPath = path.join(selectedSourceRoot, 'setup.ts')
    const selectedSetup = fs.readFileSync(selectedSetupPath)
    const selectedState = descriptor(selectedSetup)
    const selectedVariant = fixture.sourceReplay.variants.find(
      variant =>
        (variant.input.bytes === selectedState.bytes &&
          variant.input.sha256 === selectedState.sha256) ||
        (variant.output.bytes === selectedState.bytes &&
          variant.output.sha256 === selectedState.sha256),
    )
    assert(selectedVariant, `unsupported selected setup source ${JSON.stringify(selectedState)}`)

    for (const variant of fixture.sourceReplay.variants) {
      const inputSpec = TARGET119_SETUP_RENDEZVOUS_SOURCE_VARIANTS.find(
        candidate => candidate.state === variant.state,
      ).input
      const sourceRoot =
        variant.state === 'target-release-source'
          ? path.join(semanticRoot, '2.1.119/src')
          : path.join(root, 'src')
      const input = readExact(
        path.join(sourceRoot, inputSpec.path.replace(/^src\//, '')),
        variant.input,
      )
      const outputText = buildTarget119SetupRendezvousOutput(
        input.toString('utf8'),
      )
      const output = Buffer.from(outputText)
      assert.deepEqual(descriptor(output), {
        bytes: variant.output.bytes,
        sha256: variant.output.sha256,
      })
      assert.equal(output.length - input.length, fixture.sourceReplay.deltaBytes)
      const parsed = sourceFile(ts, fixture.sourceReplay.path, outputText)
      assert.deepEqual(
        functionDeclarations(ts, parsed, outputText, 'setup'),
        [variant.output.setupDeclaration],
      )
      const gates = sourceDaemonGates(ts, parsed, outputText)
      assert.equal(gates.length, 1)
      assert.deepEqual(
        descriptor(Buffer.from(gates[0].text)),
        {
          bytes: fixture.sourceReplay.branch.bytes,
          sha256: fixture.sourceReplay.branch.sha256,
        },
      )
      assert.match(
        gates[0].text,
        /const \{ startRendezvousServer \} = await import\('\.\/daemon\/rendezvous\.js'\)/,
      )
      assert.match(gates[0].text, /startRendezvousServer\(\)/)

      const temporary = fs.mkdtempSync(
        path.join(os.tmpdir(), 'target119-setup-rendezvous-'),
      )
      try {
        const temporarySetup = path.join(temporary, 'setup.ts')
        fs.writeFileSync(temporarySetup, input)
        assert.deepEqual(
          applyTarget119SetupRendezvousSourceRecovery({
            sourceRoot: temporary,
          }),
          {
            status: 'recovered',
            files: ['src/setup.ts'],
            variant: variant.state,
          },
        )
        assert.deepEqual(descriptor(fs.readFileSync(temporarySetup)), {
          bytes: variant.output.bytes,
          sha256: variant.output.sha256,
        })
        assert.deepEqual(
          applyTarget119SetupRendezvousSourceRecovery({
            sourceRoot: temporary,
          }),
          {
            status: 'already-recovered',
            files: [],
            variant: variant.state,
          },
        )
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true })
      }
    }

    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-setup-rendezvous-reject-'),
    )
    try {
      fs.writeFileSync(path.join(temporary, 'setup.ts'), 'export {}\n')
      assert.throws(
        () =>
          applyTarget119SetupRendezvousSourceRecovery({ sourceRoot: temporary }),
        /exact accepted raw or recovered source state/,
      )
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true })
    }
  },
)

test(
  'u21685 receives the exact two-owner correction and one replay admission',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const typed = fixture.snapshotPartitions.typedResidues
    const coverage = fixture.snapshotPartitions.coverageRows
    assert.equal(typed.length, 1)
    assert.equal(coverage.length, 1)
    assert.deepEqual(typed[0].ownerPaths, ['setup.ts'])
    assert.deepEqual(typed[0].ownerSourceMatches, [])
    assert.deepEqual(typed[0].sourceMatches, [])
    assert.deepEqual(coverage[0].ownerIds, ['owner-src-setup-ts'])
    assert.deepEqual(fixture.ownerCorrection.correctedOwnerIds, [
      'owner-src-daemon-rendezvous-ts',
      'owner-src-setup-ts',
    ])
    assert.deepEqual(fixture.ownerCorrection.paths, [
      'src/setup.ts',
      'src/daemon/rendezvous.ts',
    ])
    assert.equal(fixture.ownerCorrection.coverageGeneratorWiringAuthorized, true)
    assert.equal(fixture.ownerCorrection.sourceReplayAuthorized, true)
    assert.equal(fixture.sourceReplay.required, true)
    assert.equal(fixture.sourceReplay.decision, 'minimal-required-source-gap-replay')
    assert.equal(
      sha256(
        Buffer.from(
          JSON.stringify([
            [fixture.units.baselineSetup.index, fixture.units.baselineSetup.start, fixture.units.baselineSetup.end],
            [fixture.units.targetSetup.index, fixture.units.targetSetup.start, fixture.units.targetSetup.end],
          ]),
        ),
      ),
      fixture.summary.crossReleaseUnitsSha256,
    )
    assert.equal(
      sha256(
        Buffer.from(
          JSON.stringify([...fixture.ownerCorrection.paths].sort()),
        ),
      ),
      fixture.summary.correctedOwnerPathsSha256,
    )
  },
)
