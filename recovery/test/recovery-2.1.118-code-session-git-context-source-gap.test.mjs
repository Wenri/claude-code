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
  applyTarget118CodeSessionGitContextSourceRecovery,
  TARGET118_CODE_SESSION_GIT_CONTEXT_INPUT_FILES,
  TARGET118_CODE_SESSION_GIT_CONTEXT_OUTPUT_FILES,
  TARGET118_CODE_SESSION_GIT_CONTEXT_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-code-session-git-context-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-code-session-git-context-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'a570fff48542405f406e150c861a0c5dda027ebeaea156cdb4823cd42067031b'
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

function canonicalRowsDigest(rows) {
  return sha256(Buffer.from(JSON.stringify(rows)))
}

function artifactPath(input, environmentVariable) {
  return path.resolve(
    process.env[environmentVariable] ??
      path.join(root, '.recovery-tmp/authenticated-artifacts', input.artifact),
  )
}

function readPinnedFile(input) {
  const bytes = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
}

function gitFile(input, commit = fixture.inputs.targetSource.commit) {
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

function sourceState(sourceRootPath) {
  const [rawApi] = fixture.inputs.rawSource.files
  const [targetApi, targetContext] = fixture.inputs.targetSource.files
  const apiPath = sourceFilePath(sourceRootPath, targetApi.path)
  const contextPath = sourceFilePath(sourceRootPath, targetContext.path)
  const api = descriptor(fs.readFileSync(apiPath))
  const context = fs.existsSync(contextPath)
    ? descriptor(fs.readFileSync(contextPath))
    : { state: 'absent' }
  const raw =
    api.bytes === rawApi.bytes &&
    api.sha256 === rawApi.sha256 &&
    context.state === 'absent'
  const recovered =
    api.bytes === targetApi.bytes &&
    api.sha256 === targetApi.sha256 &&
    context.bytes === targetContext.bytes &&
    context.sha256 === targetContext.sha256
  assert.ok(raw || recovered, 'configured source is one exact raw/recovered state')
  return raw ? 'raw' : 'recovered'
}

function seedRawSource(tempRoot) {
  const rawApi = fixture.inputs.rawSource.files[0]
  const apiPath = sourceFilePath(tempRoot, rawApi.path)
  fs.mkdirSync(path.dirname(apiPath), { recursive: true })
  fs.mkdirSync(
    path.dirname(
      sourceFilePath(tempRoot, fixture.inputs.targetSource.files[1].path),
    ),
    { recursive: true },
  )
  fs.writeFileSync(
    apiPath,
    gitFile(rawApi, fixture.inputs.rawSource.commit),
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

function findFunction(ts, sourceFile, name) {
  const declarations = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(declarations.length, 1, name)
  return declarations[0]
}

test(
  'Target118 code-session git-context fixture pins one complete replay unit',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(
        fs.readFileSync(path.join(root, fixture.inputs.helper.path)),
      ),
      {
        bytes: fixture.inputs.helper.bytes,
        sha256: fixture.inputs.helper.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_CODE_SESSION_GIT_CONTEXT_INPUT_FILES,
      fixture.inputs.rawSource.files.map(file =>
        file.state === 'absent'
          ? { path: file.path, state: file.state }
          : { path: file.path, bytes: file.bytes, sha256: file.sha256 },
      ),
    )
    assert.deepEqual(
      TARGET118_CODE_SESSION_GIT_CONTEXT_OUTPUT_FILES,
      fixture.inputs.targetSource.files.map(file => ({
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
      })),
    )
    assert.deepEqual(
      TARGET118_CODE_SESSION_GIT_CONTEXT_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.ownerOverride.evidenceIds,
          behavior: fixture.ownerOverride.behavior,
        },
      ],
    )
    assert.equal(
      canonicalRowsDigest([fixture.targetUnit.targetIndex]),
      fixture.summary.targetIndicesSha256,
    )
    const proofRows = fixture.targetUnit.residues.map(residue => [
      fixture.targetUnit.targetIndex,
      ...residue,
    ])
    assert.deepEqual(fixture.scannerPartition.rows, proofRows)
    assert.equal(
      canonicalRowsDigest(proofRows),
      fixture.summary.residueIdentitiesSha256,
    )

    const analysis = JSON.parse(readPinnedFile(fixture.inputs.ownerAnalysis))
    const mapping = analysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
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
        rowScopedEvidence: mapping.rowScopedEvidence,
      },
      {
        ownerPaths: [fixture.targetUnit.ownerPath.replace(/^src\//, '')],
        target: {
          classification: fixture.lineage.target.classification,
          start: fixture.lineage.target.start,
          end: fixture.lineage.target.end,
          nodeType: fixture.lineage.target.nodeType,
          sourceHash: fixture.lineage.target.sourceHash,
        },
        residues: fixture.summary.residues,
        unsupportedResidues: fixture.summary.residues,
        residueIdentitiesSha256:
          fixture.scannerPartition.residueIdentitiesSha256,
        unsupportedResidueIdentitiesSha256:
          fixture.summary.residueIdentitiesSha256,
        rowScopedEvidence: {
          obligationIds: [],
          sourcePaths: [],
          testIds: [],
        },
      },
    )

    for (const source of [fixture.inputs.rawSource, fixture.inputs.targetSource]) {
      assert.equal(
        spawnSync('git', ['rev-parse', `${source.commit}^{tree}`], {
          cwd: root,
          encoding: 'utf8',
        }).stdout.trim(),
        source.tree,
      )
    }
    gitFile(
      fixture.inputs.rawSource.files[0],
      fixture.inputs.rawSource.commit,
    )
    const absent = spawnSync(
      'git',
      [
        'cat-file',
        '-e',
        `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.files[1].path}`,
      ],
      { cwd: root },
    )
    assert.notEqual(absent.status, 0)
    for (const input of fixture.inputs.targetSource.files) gitFile(input)
  },
)

test(
  'authenticated Target117/118/119 units pin the retained request contract',
  { skip: !selected },
  () => {
    const baselineBundle = fs.readFileSync(
      artifactPath(fixture.inputs.baselineBundle, 'CLAUDE_CODE_2_1_117_BUNDLE'),
    )
    const targetBundle = fs.readFileSync(
      artifactPath(fixture.inputs.targetBundle, 'CLAUDE_CODE_2_1_118_BUNDLE'),
    )
    const forwardBundle = fs.readFileSync(
      artifactPath(fixture.inputs.forwardBundle, 'CLAUDE_CODE_2_1_119_BUNDLE'),
    )
    for (const [bytes, input] of [
      [baselineBundle, fixture.inputs.baselineBundle],
      [targetBundle, fixture.inputs.targetBundle],
      [forwardBundle, fixture.inputs.forwardBundle],
    ]) {
      assert.deepEqual(descriptor(bytes), {
        bytes: input.bytes,
        sha256: input.sha256,
      })
    }
    const targetLedger = JSON.parse(
      gunzipSync(readPinnedFile(fixture.inputs.targetStructuralLedger)),
    )
    const forwardLedger = JSON.parse(
      gunzipSync(readPinnedFile(fixture.inputs.forwardStructuralLedger)),
    )
    const targetRegion = targetLedger.regions.find(
      region => region.target.index === fixture.lineage.target.index,
    )
    const forwardRegion = forwardLedger.regions.find(
      region => region.target.index === fixture.lineage.forward.index,
    )
    assert.ok(targetRegion)
    assert.ok(forwardRegion)
    assert.deepEqual(
      {
        classification: targetRegion.classification,
        baselineUnitIndex: targetRegion.baselineUnitIndex,
        pairReason: targetRegion.pairReason,
      },
      {
        classification: fixture.lineage.target.classification,
        baselineUnitIndex: fixture.lineage.target.baselineUnitIndex,
        pairReason: fixture.lineage.target.pairReason,
      },
    )
    assert.deepEqual(
      {
        classification: forwardRegion.classification,
        baselineUnitIndex: forwardRegion.baselineUnitIndex,
        pairReason: forwardRegion.pairReason,
      },
      {
        classification: fixture.lineage.forward.classification,
        baselineUnitIndex: fixture.lineage.forward.baselineUnitIndex,
        pairReason: fixture.lineage.forward.pairReason,
      },
    )

    const texts = [
      baselineBundle.subarray(
        fixture.lineage.baseline.start,
        fixture.lineage.baseline.end,
      ),
      targetBundle.subarray(
        fixture.lineage.target.start,
        fixture.lineage.target.end,
      ),
      forwardBundle.subarray(
        fixture.lineage.forward.start,
        fixture.lineage.forward.end,
      ),
    ]
    for (const [index, expected] of [
      fixture.lineage.baseline,
      fixture.lineage.target,
      fixture.lineage.forward,
    ].entries()) {
      assert.deepEqual(descriptor(texts[index]), {
        bytes: expected.bytes,
        sha256: expected.sourceHash,
      })
      const text = texts[index].toString()
      const ast = parse(text, { ecmaVersion: 'latest' })
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, expected.nodeType)
      for (const marker of [
        'buildGitSessionContext',
        'gitRepoUrl',
        'defaultBranch',
        'sources',
        'outcomes',
        'reuse_outcome_branches',
        'cwd:',
        'model:',
        'config:',
      ]) {
        assert.ok(text.includes(marker), `${expected.index}: ${marker}`)
      }
    }
    assert.equal(
      new Set([
        fixture.lineage.baseline.coarseHash,
        fixture.lineage.target.coarseHash,
        fixture.lineage.forward.coarseHash,
      ]).size,
      1,
    )
    const targetText = texts[1]
    for (const residue of fixture.scannerPartition.rows) {
      assert.equal(
        targetBundle.subarray(residue[3], residue[4]).toString(),
        residue[2],
      )
      assert.ok(targetText.includes(residue[2]))
    }
  },
)

test(
  'bounded git-context replay is fail-closed and idempotent in raw/package modes',
  { skip: !selected },
  t => {
    sourceState(sourceRoot)
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-code-session-git-context-'),
    )
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
    seedRawSource(tempRoot)
    assert.deepEqual(
      applyTarget118CodeSessionGitContextSourceRecovery({
        sourceRoot: tempRoot,
      }),
      {
        status: 'recovered',
        files: fixture.inputs.targetSource.files.map(file => file.path),
      },
    )
    for (const input of fixture.inputs.targetSource.files) {
      const replayed = fs.readFileSync(sourceFilePath(tempRoot, input.path))
      assert.deepEqual(replayed, gitFile(input))
    }
    assert.deepEqual(
      applyTarget118CodeSessionGitContextSourceRecovery({
        sourceRoot: tempRoot,
      }),
      {
        status: 'already-recovered',
        files: fixture.inputs.targetSource.files.map(file => file.path),
      },
    )

    const partialRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-code-session-git-context-partial-'),
    )
    t.after(() => fs.rmSync(partialRoot, { recursive: true, force: true }))
    seedRawSource(partialRoot)
    fs.writeFileSync(
      sourceFilePath(partialRoot, fixture.inputs.targetSource.files[0].path),
      gitFile(fixture.inputs.targetSource.files[0]),
    )
    assert.throws(
      () =>
        applyTarget118CodeSessionGitContextSourceRecovery({
          sourceRoot: partialRoot,
        }),
      /requires one exact all-raw or all-recovered state/,
    )
  },
)

test(
  'replayed declarations exactly encode source/outcome construction and request wiring',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const [apiInput, contextInput] = fixture.inputs.targetSource.files
    for (const input of [apiInput, contextInput]) {
      const bytes = gitFile(input)
      const text = bytes.toString()
      const sourceFile = ts.createSourceFile(
        input.path,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, input.path)
      const declaration = findFunction(
        ts,
        sourceFile,
        input.declaration.name,
      )
      const characterStart = declaration.getStart(sourceFile)
      const characterEnd = declaration.end
      const byteStart = Buffer.byteLength(text.slice(0, characterStart))
      const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
      assert.deepEqual(
        {
          name: declaration.name.text,
          characterStart,
          characterEnd,
          byteStart,
          byteEnd,
          ...descriptor(bytes.subarray(byteStart, byteEnd)),
        },
        input.declaration,
      )
      const declarationText = declaration.getText(sourceFile)
      if (declaration.name.text === 'createCodeSession') {
        assert.deepEqual(
          declaration.parameters.map(parameter =>
            parameter.name.getText(sourceFile),
          ),
          [
            'baseUrl',
            'accessToken',
            'title',
            'timeoutMs',
            'tags',
            'gitContext',
            'cwd',
            'model',
          ],
        )
        for (const marker of [
          'cwd: cwd ?? getOriginalCwd()',
          '...(model && { model })',
          'const { buildGitSessionContext } = await import(',
          "'../utils/gitSessionContext.js'",
          'gitContext.defaultBranch',
          'sources.length > 0 || outcomes.length > 0',
          'config.sources = sources',
          'config.outcomes = outcomes',
          'config.reuse_outcome_branches = true',
          'config,',
        ]) {
          assert.ok(declarationText.includes(marker), marker)
        }
      } else {
        assert.deepEqual(
          declaration.parameters.map(parameter =>
            parameter.name.getText(sourceFile),
          ),
          ['gitRepoUrl', 'branch', 'defaultBranch'],
        )
        for (const marker of [
          'if (!gitRepoUrl) return { sources: [], outcomes: [] }',
          'const { parseGitRemote, parseGitHubRepository } = await import(',
          "'./detectRepository.js'",
          "await import('./git.js')",
          'revision && revision !== resolvedDefaultBranch ? [revision] : []',
          'url: `https://${host}/${owner}/${repo}`',
          'repo: `${owner}/${repo}`',
          "return build('github.com', owner, repo)",
          'return { sources: [], outcomes: [] }',
        ]) {
          assert.ok(declarationText.includes(marker), marker)
        }
      }
    }
    const rawApi = gitFile(
      fixture.inputs.rawSource.files[0],
      fixture.inputs.rawSource.commit,
    ).toString()
    for (const absent of [
      'buildGitSessionContext',
      'reuse_outcome_branches',
      'getOriginalCwd',
    ]) {
      assert.equal(rawApi.includes(absent), false, `raw API lacks ${absent}`)
    }
  },
)

test(
  'code-session git-context coverage evolves only as the complete replay proof',
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
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const provisional =
      JSON.stringify(paths) === JSON.stringify(fixture.ownerOverride.paths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) === JSON.stringify(fixture.ownerOverride.paths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected)
  },
)
