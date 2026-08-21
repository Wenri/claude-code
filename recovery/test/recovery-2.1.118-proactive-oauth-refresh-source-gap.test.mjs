import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget118ProactiveOAuthRefreshSourceRecovery,
  buildTarget118ProactiveOAuthRefreshOutput,
  TARGET118_PROACTIVE_OAUTH_REFRESH_INPUT_FILES,
  TARGET118_PROACTIVE_OAUTH_REFRESH_OUTPUT_FILES,
  TARGET118_PROACTIVE_OAUTH_REFRESH_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-proactive-oauth-refresh-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-proactive-oauth-refresh-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c46c413c82e4151693007b89541239d156791fce64482211646887ce54c94dd3'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function canonicalDigest(value) {
  return sha256(Buffer.from(JSON.stringify(value)))
}

function readPinnedFile(input) {
  const bytes = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
}

function artifactPath(input, environmentVariable) {
  return path.resolve(
    process.env[environmentVariable] ??
      path.join(root, '.recovery-tmp/authenticated-artifacts', input.artifact),
  )
}

function gitFile(input) {
  const commit = fixture.inputs.rawSource.commit
  const result = spawnSync('git', ['show', `${commit}:${input.path}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  assert.equal(
    spawnSync('git', ['rev-parse', `${commit}:${input.path}`], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim(),
    input.blob,
  )
  return result.stdout
}

function sourceFilePath(sourceRootPath, relative) {
  return path.join(sourceRootPath, relative.replace(/^src\//, ''))
}

function recoveredFile(input) {
  const rawInput = fixture.inputs.rawSource.files.find(
    candidate => candidate.path === input.path,
  )
  assert.ok(rawInput)
  const output = buildTarget118ProactiveOAuthRefreshOutput(
    input.path,
    gitFile(rawInput).toString(),
  )
  assert.deepEqual(descriptor(output), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return output
}

function sourceState(sourceRootPath) {
  const states = fixture.inputs.rawSource.files.map(rawInput => {
    const recoveredInput = fixture.inputs.recoveredSource.files.find(
      candidate => candidate.path === rawInput.path,
    )
    assert.ok(recoveredInput)
    const actual = descriptor(
      fs.readFileSync(sourceFilePath(sourceRootPath, rawInput.path)),
    )
    if (
      actual.bytes === rawInput.bytes &&
      actual.sha256 === rawInput.sha256
    ) {
      return 'raw'
    }
    if (
      actual.bytes === recoveredInput.bytes &&
      actual.sha256 === recoveredInput.sha256
    ) {
      return 'recovered'
    }
    return 'unknown'
  })
  assert.ok(
    states.every(state => state === 'raw') ||
      states.every(state => state === 'recovered'),
    `configured source must be exact all-raw/all-recovered, got ${states.join(',')}`,
  )
  return states[0]
}

function seedRawSource(tempRoot) {
  for (const input of fixture.inputs.rawSource.files) {
    const filename = sourceFilePath(tempRoot, input.path)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, gitFile(input))
  }
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

function findNamedDeclaration(sourceFile, name) {
  const declarations = sourceFile.statements.filter(
    statement => statement.name?.text === name,
  )
  assert.equal(declarations.length, 1, name)
  return declarations[0]
}

function descendants(ts, node, predicate) {
  const found = []
  const visit = current => {
    if (predicate(current)) found.push(current)
    ts.forEachChild(current, visit)
  }
  visit(node)
  return found
}

test(
  'Target118 proactive OAuth fixture pins two complete units and exact evidence',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'authenticated-bounded-source-replay')
    assert.deepEqual(
      descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
      {
        bytes: fixture.inputs.helper.bytes,
        sha256: fixture.inputs.helper.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_PROACTIVE_OAUTH_REFRESH_INPUT_FILES,
      fixture.inputs.rawSource.files.map(({ path, bytes, sha256 }) => ({
        path,
        bytes,
        sha256,
      })),
    )
    assert.deepEqual(
      TARGET118_PROACTIVE_OAUTH_REFRESH_OUTPUT_FILES,
      fixture.inputs.recoveredSource.files.map(({ path, bytes, sha256 }) => ({
        path,
        bytes,
        sha256,
      })),
    )
    assert.deepEqual(
      TARGET118_PROACTIVE_OAUTH_REFRESH_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      fixture.targetUnits.map(unit => ({
        targetIndex: unit.targetIndex,
        paths: [unit.ownerPath],
        declarations: unit.declarations,
        evidenceIds: fixture.evidenceIds,
        behavior: unit.behavior,
      })),
    )

    const targetIndices = fixture.targetUnits.map(unit => unit.targetIndex)
    assert.equal(canonicalDigest(targetIndices), fixture.summary.targetIndicesSha256)
    const rows = fixture.targetUnits.flatMap(unit =>
      unit.residues.map(residue => [unit.targetIndex, ...residue]),
    )
    assert.deepEqual(fixture.scannerPartition.rows, rows)
    assert.equal(canonicalDigest(rows), fixture.summary.residueIdentitiesSha256)
    assert.equal(fixture.summary.units, fixture.targetUnits.length)
    assert.equal(fixture.summary.residues, rows.length)

    const analysis = JSON.parse(readPinnedFile(fixture.inputs.ownerAnalysis))
    for (const unit of fixture.targetUnits) {
      const mapping = analysis.analysis.sourceSupplementGaps.find(
        row => row.targetIndex === unit.targetIndex,
      )
      assert.ok(mapping)
      assert.deepEqual(
        {
          ownerPaths: mapping.ownerPaths,
          target: mapping.target,
          residues: mapping.residues,
          unsupportedResidues: mapping.unsupportedResidues,
          residueIdentitiesSha256: mapping.residueIdentitiesSha256,
          unsupportedResidueIdentitiesSha256:
            mapping.unsupportedResidueIdentitiesSha256,
        },
        {
          ownerPaths: [unit.ownerPath.replace(/^src\//, '')],
          target: {
            classification: unit.classification,
            start: unit.start,
            end: unit.end,
            nodeType: unit.nodeType,
            sourceHash: unit.sourceHash,
          },
          residues: unit.residues.length,
          unsupportedResidues: unit.residues.length,
          residueIdentitiesSha256: canonicalDigest(
            unit.residues.map(residue => [unit.targetIndex, ...residue]),
          ),
          unsupportedResidueIdentitiesSha256: canonicalDigest(
            unit.residues.map(residue => [unit.targetIndex, ...residue]),
          ),
        },
      )
    }

    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.rawSource.tree,
    )
    for (const input of fixture.inputs.rawSource.files) gitFile(input)

    const provenance = fixture.inputs.transitiveSourceEvidence
    const directEvidence = JSON.parse(readPinnedFile(provenance.directEvidence))
    const row = directEvidence.rows.find(
      candidate => candidate.id === provenance.directEvidence.rowId,
    )
    assert.ok(row)
    assert.equal(canonicalDigest(row), provenance.directEvidence.rowSha256)
    assert.equal(row.obligationId, provenance.obligations.obligationId)
    assert.deepEqual(
      provenance.sourceAssertions.map(expected =>
        row.sourceAssertions.find(
          assertion =>
            assertion.path === expected.path &&
            assertion.fragment === expected.fragment,
        ),
      ),
      provenance.sourceAssertions,
    )
    const obligations = JSON.parse(readPinnedFile(provenance.obligations))
    const obligation = obligations.obligations.find(
      candidate => candidate.id === provenance.obligations.obligationId,
    )
    assert.ok(obligation)
    assert.equal(
      obligation.catalogBinding.rowSha256,
      provenance.directEvidence.rowSha256,
    )
    readPinnedFile(provenance.sourceOverlay)
    readPinnedFile(provenance.boundaryTest)
  },
)

test(
  'authenticated Target118 fragments pin the callback and reattach partition',
  { skip: !selected },
  () => {
    const targetBundle = fs.readFileSync(
      artifactPath(fixture.inputs.targetBundle, 'CLAUDE_CODE_2_1_118_BUNDLE'),
    )
    assert.deepEqual(descriptor(targetBundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledger = JSON.parse(
      gunzipSync(readPinnedFile(fixture.inputs.targetStructuralLedger)),
    )
    for (const unit of fixture.targetUnits) {
      const region = ledger.regions.find(
        candidate => candidate.target.index === unit.targetIndex,
      )
      assert.ok(region)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          classification: unit.classification,
          nodeType: unit.nodeType,
          start: unit.start,
          end: unit.end,
          tokenCount: unit.tokenCount,
          sourceHash: unit.sourceHash,
          coarseHash: unit.coarseHash,
        },
      )
      const bytes = targetBundle.subarray(unit.start, unit.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: unit.bytes,
        sha256: unit.sourceHash,
      })
      const text = bytes.toString()
      const ast = parse(text, { ecmaVersion: 'latest' })
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, unit.nodeType)
      for (const residue of unit.residues) {
        assert.equal(
          targetBundle.subarray(residue[2], residue[3]).toString(),
          residue[1],
        )
        assert.ok(text.includes(residue[1]))
      }
      if (unit.targetIndex === 18793) {
        assert.match(
          text,
          /getAccessToken:async\(\)=>\{let ([$\w]+)=_\(\);if\(f\)await f\(\);return _\(\)\?\?\1\}/,
        )
      } else {
        assert.match(text, /onProactiveRefresh:async\(\)=>\{await [$\w]+\(\)\}/)
      }
    }
  },
)

test(
  'bounded proactive OAuth replay is fail-closed and idempotent in raw/package modes',
  { skip: !selected },
  t => {
    sourceState(sourceRoot)
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-proactive-oauth-refresh-'),
    )
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
    seedRawSource(tempRoot)
    assert.deepEqual(
      applyTarget118ProactiveOAuthRefreshSourceRecovery({
        sourceRoot: tempRoot,
      }),
      {
        status: 'recovered',
        files: fixture.inputs.recoveredSource.files.map(file => file.path),
      },
    )
    for (const input of fixture.inputs.recoveredSource.files) {
      assert.deepEqual(
        fs.readFileSync(sourceFilePath(tempRoot, input.path)),
        recoveredFile(input),
      )
    }
    assert.deepEqual(
      applyTarget118ProactiveOAuthRefreshSourceRecovery({
        sourceRoot: tempRoot,
      }),
      {
        status: 'already-recovered',
        files: fixture.inputs.recoveredSource.files.map(file => file.path),
      },
    )

    const partialRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-proactive-oauth-refresh-partial-'),
    )
    t.after(() => fs.rmSync(partialRoot, { recursive: true, force: true }))
    seedRawSource(partialRoot)
    const recoveredInput = fixture.inputs.recoveredSource.files[0]
    fs.writeFileSync(
      sourceFilePath(partialRoot, recoveredInput.path),
      recoveredFile(recoveredInput),
    )
    assert.throws(
      () =>
        applyTarget118ProactiveOAuthRefreshSourceRecovery({
          sourceRoot: partialRoot,
        }),
      /requires one exact all-raw or all-recovered state/,
    )

    const unknownRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-proactive-oauth-refresh-unknown-'),
    )
    t.after(() => fs.rmSync(unknownRoot, { recursive: true, force: true }))
    seedRawSource(unknownRoot)
    fs.appendFileSync(
      sourceFilePath(unknownRoot, fixture.inputs.rawSource.files[0].path),
      '\n// unpinned mutation\n',
    )
    assert.throws(
      () =>
        applyTarget118ProactiveOAuthRefreshSourceRecovery({
          sourceRoot: unknownRoot,
        }),
      /requires one exact all-raw or all-recovered state/,
    )
  },
)

test(
  'replayed source AST awaits refresh and returns fresh-or-stale token exactly',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const sourceFiles = new Map()
    for (const input of fixture.inputs.recoveredSource.files) {
      const bytes = recoveredFile(input)
      const text = bytes.toString()
      const sourceFile = ts.createSourceFile(
        input.path,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, input.path)
      sourceFiles.set(input.path, { input, bytes, text, sourceFile })
      for (const expected of input.declarations) {
        const declaration = findNamedDeclaration(sourceFile, expected.name)
        const characterStart = declaration.getStart(sourceFile)
        const characterEnd = declaration.end
        const byteStart = Buffer.byteLength(text.slice(0, characterStart))
        const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
        assert.deepEqual(
          {
            kind: ts.SyntaxKind[declaration.kind],
            name: declaration.name.text,
            characterStart,
            characterEnd,
            byteStart,
            byteEnd,
            ...descriptor(bytes.subarray(byteStart, byteEnd)),
          },
          expected,
        )
      }
    }

    const remote = sourceFiles.get('src/bridge/remoteBridgeCore.ts')
    const params = findNamedDeclaration(
      remote.sourceFile,
      'EnvLessBridgeParams',
    )
    const proactiveMembers = params.type.members.filter(
      member => member.name?.getText(remote.sourceFile) === 'onProactiveRefresh',
    )
    assert.equal(proactiveMembers.length, 1)
    assert.ok(proactiveMembers[0].questionToken)
    assert.equal(
      proactiveMembers[0].type.getText(remote.sourceFile),
      '() => Promise<void>',
    )

    const remoteFunction = findNamedDeclaration(
      remote.sourceFile,
      'initEnvLessBridgeCore',
    )
    assert.equal(remoteFunction.parameters[0].name.getText(remote.sourceFile), 'params')
    const parameterBindings = descendants(
      ts,
      remoteFunction.body,
      node =>
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer?.getText(remote.sourceFile) === 'params',
    )
    assert.equal(parameterBindings.length, 1)
    const parameterBinding = parameterBindings[0].name
    for (const name of [
      'onAuth401',
      'onProactiveRefresh',
      'reattachSessionId',
      'reattachSequenceNum',
    ]) {
      assert.equal(
        parameterBinding.elements.filter(
          element => element.name.getText(remote.sourceFile) === name,
        ).length,
        1,
      )
    }
    const schedulerCalls = descendants(
      ts,
      remoteFunction,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(remote.sourceFile) ===
          'createTokenRefreshScheduler',
    )
    assert.equal(schedulerCalls.length, 1)
    const schedulerOptions = schedulerCalls[0].arguments[0]
    assert.ok(ts.isObjectLiteralExpression(schedulerOptions))
    const getAccessTokenProperties = schedulerOptions.properties.filter(
      property => property.name?.getText(remote.sourceFile) === 'getAccessToken',
    )
    assert.equal(getAccessTokenProperties.length, 1)
    const tokenArrow = getAccessTokenProperties[0].initializer
    assert.ok(ts.isArrowFunction(tokenArrow))
    assert.ok(tokenArrow.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword))
    const tokenArrowText = tokenArrow.getText(remote.sourceFile)
    for (const marker of [
      'const stale = getAccessToken()',
      'if (onProactiveRefresh) await onProactiveRefresh()',
      'return getAccessToken() ?? stale',
    ]) {
      assert.ok(tokenArrowText.includes(marker), marker)
    }
    assert.equal(
      descendants(
        ts,
        tokenArrow,
        node => ts.isIdentifier(node) && node.text === 'onAuth401',
      ).length,
      0,
    )

    const makeTokenArrow = (getAccessToken, onProactiveRefresh) =>
      Function(
        'getAccessToken',
        'onProactiveRefresh',
        `return (${tokenArrowText})`,
      )(getAccessToken, onProactiveRefresh)
    let token = 'stale-token'
    let callbackCalls = 0
    const refreshed = makeTokenArrow(
      () => token,
      async () => {
        callbackCalls += 1
        await Promise.resolve()
        token = 'fresh-token'
      },
    )
    assert.equal(await refreshed(), 'fresh-token')
    assert.equal(callbackCalls, 1)
    assert.equal(
      await makeTokenArrow(() => 'stale-token', async () => {})(),
      'stale-token',
    )
    assert.equal(
      await makeTokenArrow(() => 'stale-token', undefined)(),
      'stale-token',
    )
    await assert.rejects(
      makeTokenArrow(
        () => 'stale-token',
        async () => {
          throw new Error('refresh rejected')
        },
      )(),
      /refresh rejected/,
    )

    const wrapper = sourceFiles.get('src/bridge/initReplBridge.ts')
    const wrapperFunction = findNamedDeclaration(
      wrapper.sourceFile,
      'initReplBridge',
    )
    const coreCalls = descendants(
      ts,
      wrapperFunction,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(wrapper.sourceFile) === 'initEnvLessBridgeCore',
    )
    assert.equal(coreCalls.length, 1)
    const coreOptions = coreCalls[0].arguments[0]
    assert.ok(ts.isObjectLiteralExpression(coreOptions))
    const callbackProperties = coreOptions.properties.filter(
      property =>
        property.name?.getText(wrapper.sourceFile) === 'onProactiveRefresh',
    )
    assert.equal(callbackProperties.length, 1)
    const callbackArrow = callbackProperties[0].initializer
    assert.ok(ts.isArrowFunction(callbackArrow))
    assert.ok(callbackArrow.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword))
    assert.equal(
      callbackArrow.body.getText(wrapper.sourceFile),
      '{\n        await checkAndRefreshOAuthTokenIfNeeded()\n      }',
    )
    const callbackArrowText = callbackArrow.getText(wrapper.sourceFile)
    let releaseRefresh
    let refreshCalls = 0
    const refreshBarrier = new Promise(resolve => {
      releaseRefresh = resolve
    })
    const callback = Function(
      'checkAndRefreshOAuthTokenIfNeeded',
      `return (${callbackArrowText})`,
    )(async () => {
      refreshCalls += 1
      await refreshBarrier
    })
    let callbackSettled = false
    const pending = callback().then(() => {
      callbackSettled = true
    })
    await Promise.resolve()
    assert.equal(refreshCalls, 1)
    assert.equal(callbackSettled, false)
    releaseRefresh()
    await pending
    assert.equal(callbackSettled, true)

    const rawRemote = gitFile(fixture.inputs.rawSource.files[0]).toString()
    assert.ok(rawRemote.includes('reattachSessionId?: string'))
    assert.ok(rawRemote.includes('reattachSequenceNum?: number'))
    assert.equal(rawRemote.includes('onProactiveRefresh?: () => Promise<void>'), false)
    const rawWrapper = gitFile(fixture.inputs.rawSource.files[1]).toString()
    assert.equal(rawWrapper.includes('onProactiveRefresh: async () =>'), false)
  },
)

test(
  'proactive OAuth coverage evolves only as one atomic two-unit replay proof',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            root,
            'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const states = fixture.targetUnits.map(unit => {
      const row = coverage.rows.find(
        candidate => candidate.targetIndex === unit.targetIndex,
      )
      assert.ok(row)
      const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
      const exactOwner = JSON.stringify(paths) === JSON.stringify([unit.ownerPath])
      const provisional =
        exactOwner &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(['source-map-attribution', 'semantic-test'])
      const corrected =
        exactOwner &&
        JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
        row.behavior === unit.behavior
      assert.ok(provisional || corrected, `unexpected coverage state ${unit.targetIndex}`)
      return corrected ? 'corrected' : 'provisional'
    })
    assert.ok(
      states.every(state => state === 'provisional') ||
        states.every(state => state === 'corrected'),
      `partial proactive OAuth correction: ${states.join(',')}`,
    )
  },
)
