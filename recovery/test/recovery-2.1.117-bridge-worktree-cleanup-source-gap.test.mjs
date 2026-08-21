import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget117BridgeWorktreeCleanupSourceRecovery,
  TARGET117_BRIDGE_WORKTREE_CLEANUP_INPUT_FILE,
  TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-bridge-worktree-cleanup-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-bridge-worktree-cleanup-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = '064027424da52f2f9ad2fc14a3b4635b8d3af7c588d04bd54ed2f1cc424c6277'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expected.bytes, `${label}: bytes`)
  assert.equal(sha256(bytes), expected.sha256, `${label}: SHA-256`)
  return bytes
}

function artifactPath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function gitBytes(commit, sourcePath) {
  return execFileSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
    maxBuffer: 4 * 1024 * 1024,
  })
}

function materialize(bytes, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const filename = path.join(sourceRoot, 'bridge/bridgeMain.ts')
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, sourceRoot, filename }
}

function materializeRaw(prefix) {
  const input = fixture.sourceRecovery.rawSource
  return materialize(gitBytes(input.commit, input.path), prefix)
}

function copyPackaged(prefix) {
  const sourceRoot = path.resolve(
    process.env.CLAUDE_CODE_TARGET_2_1_117_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
  )
  const filename = path.join(sourceRoot, 'bridge/bridgeMain.ts')
  return materialize(fs.readFileSync(filename), prefix)
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end') continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit)
    } else {
      walk(value, visit)
    }
  }
}

function occurrenceCount(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
}

function assertRegion(ledger, witness, label) {
  const region = ledger.regions[witness.target.index]
  assert.ok(region, `${label}: structural region`)
  assert.equal(region.classification, witness.classification, `${label}: class`)
  assert.equal(region.baselineUnitIndex, witness.baselineIndex, `${label}: baseline`)
  assert.equal(region.pairReason, witness.pairReason, `${label}: pair reason`)
  for (const field of [
    'index',
    'nodeType',
    'start',
    'end',
    'tokenCount',
    'sourceHash',
    'coarseHash',
  ]) {
    assert.equal(region.target[field], witness.target[field], `${label}: ${field}`)
  }
  return region
}

async function loadTypeScript() {
  const candidates = [
    process.env.CLAUDE_CODE_TYPESCRIPT_PATH,
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return import(candidate)
  }
  throw new Error('repo-pinned TypeScript is unavailable')
}

function parseSource(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [], `${filename}: parse diagnostics`)
  return sourceFile
}

function namedStatement(sourceFile, name) {
  const rows = sourceFile.statements.filter(node => node.name?.text === name)
  assert.equal(rows.length, 1, `${name}: exact declaration`)
  return rows[0]
}

function assertTextDescriptor(sourceFile, node, expected, label) {
  const text = node.getText(sourceFile)
  assert.deepEqual(descriptor(Buffer.from(text)), expected, label)
  return text
}

function importFor(sourceFile, moduleName) {
  const rows = sourceFile.statements.filter(
    node => node.moduleSpecifier?.text === moduleName,
  )
  assert.equal(rows.length, 1, `${moduleName}: exact import`)
  return rows[0]
}

test(
  '2.1.117 retained bridge-worktree fixture pins raw, donor, and exact replay',
  { skip: !selected },
  async () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      sourceFiles: 1,
      boundedPatches: 8,
      authenticatedTargetUnits: 2,
      compiledCleanupCalls: 3,
      ownerOverrides: 0,
    })
    assert.deepEqual(
      TARGET117_BRIDGE_WORKTREE_CLEANUP_INPUT_FILE,
      {
        path: fixture.sourceRecovery.rawSource.path,
        bytes: fixture.sourceRecovery.rawSource.bytes,
        sha256: fixture.sourceRecovery.rawSource.sha256,
      },
    )
    assert.deepEqual(
      TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE,
      fixture.sourceRecovery.outputFile,
    )
    readExact(
      path.join(repositoryRoot, fixture.sourceRecovery.helper.path),
      fixture.sourceRecovery.helper,
      'replay helper',
    )

    const raw = gitBytes(
      fixture.sourceRecovery.rawSource.commit,
      fixture.sourceRecovery.rawSource.path,
    )
    assert.deepEqual(descriptor(raw), {
      bytes: fixture.sourceRecovery.rawSource.bytes,
      sha256: fixture.sourceRecovery.rawSource.sha256,
    })
    assert.equal(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${fixture.sourceRecovery.rawSource.commit}:${fixture.sourceRecovery.rawSource.path}`,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.sourceRecovery.rawSource.gitBlob,
    )
    const rawText = raw.toString('utf8')
    for (const marker of fixture.sourceRecovery.rawAbsentMarkers) {
      assert.equal(occurrenceCount(rawText, marker), 0, `raw absence: ${marker}`)
    }

    const donorInput = fixture.sourceRecovery.laterSourceDonor
    const donor = gitBytes(donorInput.commit, donorInput.path)
    assert.deepEqual(descriptor(donor), {
      bytes: donorInput.bytes,
      sha256: donorInput.sha256,
    })
    assert.equal(
      execFileSync(
        'git',
        ['rev-parse', `${donorInput.commit}:${donorInput.path}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      donorInput.gitBlob,
    )
    const ts = await loadTypeScript()
    const donorSource = parseSource(ts, donorInput.path, donor.toString('utf8'))
    for (const name of [
      'BridgeWorktree',
      'cleanupBridgeWorktree',
      'runBridgeLoop',
    ]) {
      assertTextDescriptor(
        donorSource,
        namedStatement(donorSource, name),
        fixture.sourceRecovery.declarations[name],
        `donor ${name}`,
      )
    }
    assertTextDescriptor(
      donorSource,
      importFor(donorSource, '../utils/stringUtils.js'),
      fixture.sourceRecovery.imports.plural,
      'donor plural import',
    )
    assertTextDescriptor(
      donorSource,
      importFor(donorSource, '../utils/worktree.js'),
      fixture.sourceRecovery.imports.worktree,
      'donor worktree import',
    )
  },
)

test(
  '2.1.117 bundles authenticate the complete cleanup helper and all three callers',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath(
        'CLAUDE_CODE_BASELINE_2_1_116_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'authenticated 2.1.116 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath(
        'CLAUDE_CODE_TARGET_2_1_117_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'authenticated 2.1.117 bundle',
    ).toString('utf8')
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
      'Target117 structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))

    const runRegion = assertRegion(
      ledger,
      fixture.bundleEvidence.runBridgeLoop,
      'runBridgeLoop',
    )
    const helperRegion = assertRegion(
      ledger,
      fixture.bundleEvidence.cleanupBridgeWorktree,
      'cleanupBridgeWorktree',
    )
    const runSource = target.slice(runRegion.target.start, runRegion.target.end)
    const helperSource = target.slice(
      helperRegion.target.start,
      helperRegion.target.end,
    )
    assert.equal(sha256(runSource), runRegion.target.sourceHash)
    assert.equal(sha256(helperSource), helperRegion.target.sourceHash)

    for (const [marker, count] of Object.entries(
      fixture.bundleEvidence.baselineAndTargetMarkerCounts,
    )) {
      assert.equal(occurrenceCount(baseline, marker), count, `baseline ${marker}`)
      assert.equal(occurrenceCount(target, marker), count, `target ${marker}`)
    }

    const helperAst = parse(helperSource, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const helperDeclaration = helperAst.body[0]
    assert.equal(helperDeclaration.type, 'FunctionDeclaration')
    assert.equal(helperDeclaration.async, true)
    assert.equal(helperDeclaration.params.length, 3)
    const helperName = helperDeclaration.id.name
    const helperCalls = []
    const awaitedCalls = []
    const forceMembers = []
    walk(helperDeclaration, node => {
      if (node.type === 'CallExpression') helperCalls.push(node)
      if (
        node.type === 'AwaitExpression' &&
        node.argument?.type === 'CallExpression'
      ) {
        awaitedCalls.push(node.argument)
      }
      if (
        node.type === 'MemberExpression' &&
        node.property?.name === 'force'
      ) {
        forceMembers.push(node)
      }
    })
    assert.equal(forceMembers.length, 1)
    const changeCall = awaitedCalls.find(call => call.arguments.length === 2)
    assert.ok(changeCall, 'two-argument change inspection call')
    const removeCall = helperCalls.find(
      call =>
        call.arguments.length === 5 &&
        call.arguments[4].type === 'Literal' &&
        call.arguments[4].value === 'bridge',
    )
    assert.ok(removeCall, 'five-argument bridge removal call')
    const pluralCall = helperCalls.find(
      call => call.arguments[1]?.value === 'commit',
    )
    assert.ok(pluralCall, 'commit pluralization call')
    assert.match(helperSource, /q\?\.force\|\|H\.hookBased&&H\.headCommit===void 0/)
    assert.match(helperSource, /git error checking changes/)
    assert.match(helperSource, /worktree removal failed, kept:/)

    const runAst = parse(runSource, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const cleanupCalls = []
    const directRemoveCalls = []
    const headCommitProperties = []
    walk(runAst, node => {
      if (node.type === 'CallExpression' && node.callee?.name === helperName) {
        cleanupCalls.push(node)
      }
      if (
        node.type === 'CallExpression' &&
        node.callee?.name === removeCall.callee.name
      ) {
        directRemoveCalls.push(node)
      }
      if (node.type === 'Property' && node.key?.name === 'headCommit') {
        headCommitProperties.push(node)
      }
    })
    assert.deepEqual(
      cleanupCalls.map(call => call.arguments.length),
      fixture.bundleEvidence.callArgumentCounts,
    )
    assert.equal(directRemoveCalls.length, 0)
    assert.equal(headCommitProperties.length, 1)
    const forceArgument = cleanupCalls[1].arguments[2]
    assert.equal(forceArgument.type, 'ObjectExpression')
    assert.equal(forceArgument.properties.length, 1)
    assert.equal(forceArgument.properties[0].key.name, 'force')
    assert.equal(forceArgument.properties[0].value.type, 'UnaryExpression')
    assert.equal(forceArgument.properties[0].value.operator, '!')
    assert.equal(forceArgument.properties[0].value.argument.value, 0)
    assert.match(runSource, /kept worktree .*session crashed/)

    const nextLedgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.nextStructuralLedger.path),
      fixture.inputs.nextStructuralLedger,
      'Target118 structural ledger',
    )
    const nextLedger = JSON.parse(gunzipSync(nextLedgerBytes))
    const temporal = fixture.bundleEvidence.nextTransition
    const nextRegion = nextLedger.regions.find(
      region => region.baselineUnitIndex === temporal.baselineIndex,
    )
    assert.ok(nextRegion, 'Target118 retained helper pair')
    assert.equal(nextRegion.target.index, temporal.target.index)
    assert.equal(nextRegion.classification, temporal.classification)
    assert.equal(nextRegion.pairReason, temporal.pairReason)
    for (const field of [
      'nodeType',
      'start',
      'end',
      'tokenCount',
      'sourceHash',
      'coarseHash',
    ]) {
      assert.equal(nextRegion.target[field], temporal.target[field], `next ${field}`)
    }
    const nextTarget = readExact(
      artifactPath(
        'CLAUDE_CODE_TARGET_2_1_118_BUNDLE',
        fixture.inputs.nextTargetBundle,
      ),
      fixture.inputs.nextTargetBundle,
      'authenticated 2.1.118 bundle',
    ).toString('utf8')
    assert.equal(
      sha256(nextTarget.slice(temporal.target.start, temporal.target.end)),
      temporal.target.sourceHash,
    )
  },
)

test(
  '2.1.117 bridge-worktree replay is dual-state, donor-exact, and executable',
  { skip: !selected },
  async () => {
    const raw = materializeRaw('target117-bridge-worktree-raw-')
    const packaged = copyPackaged('target117-bridge-worktree-packaged-')
    try {
      assert.equal(
        applyTarget117BridgeWorktreeCleanupSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'recovered',
      )
      assert.equal(
        applyTarget117BridgeWorktreeCleanupSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'already-recovered',
      )
      const packagedInput = descriptor(fs.readFileSync(packaged.filename))
      assert.ok(
        [
          TARGET117_BRIDGE_WORKTREE_CLEANUP_INPUT_FILE.sha256,
          TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE.sha256,
        ].includes(packagedInput.sha256),
        `packaged state ${packagedInput.bytes}/${packagedInput.sha256}`,
      )
      const packagedStatus =
        applyTarget117BridgeWorktreeCleanupSourceRecovery({
          sourceRoot: packaged.sourceRoot,
        }).status
      assert.equal(
        packagedStatus,
        packagedInput.sha256 === TARGET117_BRIDGE_WORKTREE_CLEANUP_INPUT_FILE.sha256
          ? 'recovered'
          : 'already-recovered',
      )

      for (const candidate of [raw, packaged]) {
        const bytes = readExact(
          candidate.filename,
          fixture.sourceRecovery.outputFile,
          'recovered bridgeMain.ts',
        )
        const source = bytes.toString('utf8')
        const ts = await loadTypeScript()
        const sourceFile = parseSource(ts, candidate.filename, source)
        const donor = parseSource(
          ts,
          fixture.sourceRecovery.laterSourceDonor.path,
          gitBytes(
            fixture.sourceRecovery.laterSourceDonor.commit,
            fixture.sourceRecovery.laterSourceDonor.path,
          ).toString('utf8'),
        )
        for (const name of [
          'BridgeWorktree',
          'cleanupBridgeWorktree',
          'runBridgeLoop',
        ]) {
          const recoveredText = assertTextDescriptor(
            sourceFile,
            namedStatement(sourceFile, name),
            fixture.sourceRecovery.declarations[name],
            `recovered ${name}`,
          )
          assert.equal(
            recoveredText,
            namedStatement(donor, name).getText(donor),
            `${name}: donor exact`,
          )
        }
      }

      const ts = await loadTypeScript()
      const recoveredSource = fs.readFileSync(raw.filename, 'utf8')
      const sourceFile = parseSource(ts, raw.filename, recoveredSource)
      const cleanupSource = namedStatement(
        sourceFile,
        'cleanupBridgeWorktree',
      ).getText(sourceFile)
      const javascript = ts.transpileModule(cleanupSource, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText

      async function exercise({ changes, worktree, options, removed = true }) {
        const observations = {
          changeCalls: [],
          removeCalls: [],
          statuses: [],
          debug: [],
        }
        const cleanup = Function(
          'getAgentWorktreeChanges',
          'plural',
          'logForDebugging',
          'removeAgentWorktree',
          `${javascript}\nreturn cleanupBridgeWorktree`,
        )(
          async (...args) => {
            observations.changeCalls.push(args)
            return changes
          },
          (count, unit) => (count === 1 ? unit : `${unit}s`),
          value => observations.debug.push(value),
          async (...args) => {
            observations.removeCalls.push(args)
            return removed
          },
        )
        await cleanup(
          worktree,
          { logStatus: value => observations.statuses.push(value) },
          options,
        )
        return observations
      }

      const clean = await exercise({
        changes: { dirty: false, commitsAhead: 0, gitError: false },
        worktree: {
          worktreePath: '/tmp/clean',
          worktreeBranch: 'bridge-clean',
          gitRoot: '/repo',
          hookBased: false,
          headCommit: 'abc123',
        },
      })
      assert.deepEqual(clean.changeCalls, [['/tmp/clean', 'abc123']])
      assert.deepEqual(clean.removeCalls, [
        ['/tmp/clean', 'bridge-clean', '/repo', false, 'bridge'],
      ])
      assert.deepEqual(clean.statuses, ['removed worktree /tmp/clean'])

      const dirty = await exercise({
        changes: { dirty: true, commitsAhead: 2, gitError: false },
        worktree: { worktreePath: '/tmp/dirty', headCommit: 'def456' },
      })
      assert.equal(dirty.removeCalls.length, 0)
      assert.deepEqual(dirty.statuses, [
        'kept worktree /tmp/dirty · uncommitted changes · 2 commits',
      ])
      assert.match(dirty.debug[0], /dirty=true commitsAhead=2 gitError=false/)

      const gitError = await exercise({
        changes: { dirty: true, commitsAhead: 0, gitError: true },
        worktree: { worktreePath: '/tmp/error', headCommit: 'ghi789' },
      })
      assert.equal(gitError.removeCalls.length, 0)
      assert.deepEqual(gitError.statuses, [
        'kept worktree /tmp/error · git error checking changes',
      ])

      const forced = await exercise({
        changes: { dirty: true, commitsAhead: 9, gitError: true },
        worktree: { worktreePath: '/tmp/forced', hookBased: true },
        options: { force: true },
        removed: false,
      })
      assert.equal(forced.changeCalls.length, 0)
      assert.equal(forced.removeCalls.length, 1)
      assert.deepEqual(forced.statuses, [
        'worktree removal failed, kept: /tmp/forced',
      ])

      const hookWithoutHead = await exercise({
        changes: { dirty: true, commitsAhead: 9, gitError: true },
        worktree: { worktreePath: '/tmp/hook', hookBased: true },
      })
      assert.equal(hookWithoutHead.changeCalls.length, 0)
      assert.equal(hookWithoutHead.removeCalls.length, 1)
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 bridge-worktree replay rejects raw and recovered mutations before writing',
  { skip: !selected },
  () => {
    const raw = materializeRaw('target117-bridge-worktree-mutated-raw-')
    const recovered = materializeRaw('target117-bridge-worktree-mutated-post-')
    try {
      const rawSource = fs.readFileSync(raw.filename, 'utf8').replace(
        'removeAgentWorktree }',
        'removeAgentWorktree as removeAgentWorktreeNow }',
      )
      fs.writeFileSync(raw.filename, rawSource)
      const rawBefore = fs.readFileSync(raw.filename)
      assert.throws(
        () =>
          applyTarget117BridgeWorktreeCleanupSourceRecovery({
            sourceRoot: raw.sourceRoot,
          }),
        /refusing non-target worktree recovery/,
      )
      assert.equal(sha256(fs.readFileSync(raw.filename)), sha256(rawBefore))

      applyTarget117BridgeWorktreeCleanupSourceRecovery({
        sourceRoot: recovered.sourceRoot,
      })
      const postSource = fs.readFileSync(recovered.filename, 'utf8').replace(
        'git error checking changes',
        'git error while checking changes',
      )
      fs.writeFileSync(recovered.filename, postSource)
      const postBefore = fs.readFileSync(recovered.filename)
      assert.throws(
        () =>
          applyTarget117BridgeWorktreeCleanupSourceRecovery({
            sourceRoot: recovered.sourceRoot,
          }),
        /refusing non-target worktree recovery/,
      )
      assert.equal(sha256(fs.readFileSync(recovered.filename)), sha256(postBefore))
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
      fs.rmSync(recovered.temporaryRoot, { recursive: true, force: true })
    }
  },
)
