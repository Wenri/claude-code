import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget118SkillAuthorBylineSourceRecovery,
  TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE,
  TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE,
  TARGET118_SKILL_AUTHOR_BYLINE_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-skill-author-byline-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-skill-author-byline-source-gap.json',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.117-to-2.1.118/recovered/build-skill-author-byline-source-gap-fixture.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(root, fixture.inputs.targetBundle.path)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const textDescriptor = value => ({ bytes: value.length, sha256: sha256(value) })

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

function writeTempSource(sourceRootPath, input) {
  const filename = path.join(
    sourceRootPath,
    TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE.path.replace(/^src\//, ''),
  )
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, input)
  return filename
}

function sourceDeclaration(ts, input, name, label) {
  const sourceFile = ts.createSourceFile(
    label,
    input,
    ts.ScriptTarget.Latest,
    true,
    label.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, label)
  const declarations = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(declarations.length, 1, `${label}: ${name}`)
  return { sourceFile, declaration: declarations[0] }
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

test('Target118 skill-author byline fixture is deterministic and complete', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 1,
    indicesSha256: sha256(JSON.stringify([fixture.row.targetIndex])),
    residueIdentitiesSha256: sha256(
      JSON.stringify([[fixture.row.targetIndex, ...fixture.row.residue]]),
    ),
  })
  assert.deepEqual(TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE, {
    path: fixture.inputs.rawSource.path,
    bytes: fixture.inputs.rawSource.bytes,
    sha256: fixture.inputs.rawSource.sha256,
  })
  assert.deepEqual(TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE, {
    path: fixture.inputs.recoveredSource.path,
    bytes: fixture.inputs.recoveredSource.bytes,
    sha256: fixture.inputs.recoveredSource.sha256,
  })
  assert.deepEqual(
    TARGET118_SKILL_AUTHOR_BYLINE_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [
      {
        targetIndex: fixture.row.targetIndex,
        paths: [fixture.row.ownerPath],
        evidenceIds: fixture.row.evidenceIds,
        behavior: fixture.row.behavior,
      },
    ],
  )
  assert.deepEqual(
    execFileSync(process.execPath, [builderPath, '--stdout'], { cwd: root }),
    fixtureBytes,
  )
})

test('authenticated bundles pin the complete byline transition and forward lineage', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundlePaths = [
    path.join(root, fixture.inputs.baselineBundle.path),
    targetBundlePath,
    path.join(root, fixture.inputs.forwardBundle.path),
  ]
  const bundleDescriptors = [
    fixture.inputs.baselineBundle,
    fixture.inputs.targetBundle,
    fixture.inputs.forwardBundle,
  ]
  const unitTexts = fixture.temporalUnits.map((unit, index) => {
    const bundle = fs.readFileSync(bundlePaths[index])
    assert.deepEqual(descriptor(bundle), {
      bytes: bundleDescriptors[index].bytes,
      sha256: bundleDescriptors[index].sha256,
    })
    const text = bundle.toString().slice(unit.start, unit.end)
    assert.deepEqual(textDescriptor(text), {
      bytes: unit.bytes,
      sha256: unit.sourceHash,
    })
    const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].type, unit.nodeType)
    return text
  })
  assert.doesNotMatch(unitTexts[0], /trim\(\)|substring|\\xB7 by/)
  for (const text of unitTexts.slice(1)) {
    assert.match(text, /\.trim\(\)/)
    assert.match(text, /\.substring\(1\)/)
    assert.match(text, /\\xB7 by/)
  }
  assert.equal(
    fixture.temporalUnits[1].coarseHash,
    fixture.temporalUnits[2].coarseHash,
  )
  assert.deepEqual(fixture.forwardPair, {
    classification: 'matched',
    baselineUnitIndex: fixture.row.targetIndex,
    targetIndex: fixture.temporalUnits[2].index,
    pairReason: 'exact-scope-normalized-token-hash',
  })

  const targetText = fs.readFileSync(targetBundlePath, 'utf8')
  const [kind, cooked, start, end] = fixture.row.residue
  assert.equal(kind, 'string')
  assert.equal(targetText.slice(start, end), fixture.row.rawResidue)
  const targetUnit = fixture.temporalUnits[1]
  const ast = parse(targetText.slice(targetUnit.start, targetUnit.end), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const bylineElements = []
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (
      node.type === 'TemplateElement' &&
      node.value?.cooked === cooked &&
      node.value?.raw === fixture.row.rawResidue
    ) {
      bylineElements.push(node)
    }
    for (const [key, value] of Object.entries(node)) {
      if (['start', 'end', 'loc', 'range'].includes(key)) continue
      if (Array.isArray(value)) value.forEach(visit)
      else visit(value)
    }
  }
  visit(ast)
  assert.equal(bylineElements.length, 1)
})

test('skill-author replay is exact, typed, idempotent, and fail-closed', async t => {
  const raw = execFileSync('git', [
    'show',
    `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.path}`,
  ], { cwd: root })
  const helper = execFileSync('git', [
    'show',
    `${fixture.inputs.helperSource.commit}:${fixture.inputs.helperSource.path}`,
  ], { cwd: root })
  assert.deepEqual(descriptor(raw), {
    bytes: fixture.inputs.rawSource.bytes,
    sha256: fixture.inputs.rawSource.sha256,
  })
  assert.deepEqual(descriptor(helper), {
    bytes: fixture.inputs.helperSource.bytes,
    sha256: fixture.inputs.helperSource.sha256,
  })
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-skill-author-byline.'),
  )
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const filename = writeTempSource(temporary, raw)
  assert.deepEqual(
    applyTarget118SkillAuthorBylineSourceRecovery({ sourceRoot: temporary }),
    { status: 'recovered', files: [fixture.inputs.rawSource.path] },
  )
  assert.deepEqual(
    applyTarget118SkillAuthorBylineSourceRecovery({ sourceRoot: temporary }),
    { status: 'already-recovered', files: [] },
  )
  const recovered = fs.readFileSync(filename)
  assert.deepEqual(descriptor(recovered), {
    bytes: fixture.inputs.recoveredSource.bytes,
    sha256: fixture.inputs.recoveredSource.sha256,
  })

  const ts = await loadTypeScript()
  const recoveredText = recovered.toString()
  const recoveredDeclaration = sourceDeclaration(
    ts,
    recoveredText,
    fixture.sourceContract.declaration,
    'UI.tsx',
  )
  const recoveredFunction = recoveredText.slice(
    recoveredDeclaration.declaration.getStart(recoveredDeclaration.sourceFile),
    recoveredDeclaration.declaration.end,
  )
  assert.deepEqual(descriptor(Buffer.from(`${recoveredFunction}\n`)), {
    bytes: fixture.sourceSections.after.bytes,
    sha256: fixture.sourceSections.after.sha256,
  })
  const imports = recoveredDeclaration.sourceFile.statements.filter(
    statement =>
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === '../../utils/teamArtifacts.js',
  )
  assert.equal(imports.length, 1)
  assert.deepEqual(
    imports[0].importClause.namedBindings.elements.map(element =>
      element.name.text,
    ),
    [fixture.sourceContract.helperDeclaration],
  )
  const helperDeclaration = sourceDeclaration(
    ts,
    helper.toString(),
    fixture.sourceContract.helperDeclaration,
    'teamArtifacts.ts',
  )
  const helperText = helper
    .toString()
    .slice(
      helperDeclaration.declaration.getStart(helperDeclaration.sourceFile),
      helperDeclaration.declaration.end,
    )
  assert.deepEqual(descriptor(Buffer.from(`${helperText}\n\n`)), {
    bytes: fixture.sourceSections.authorHelper.bytes,
    sha256: fixture.sourceSections.authorHelper.sha256,
  })
  assert(helperText.includes(`source !== '${fixture.sourceContract.teamSource}'`))
  assert(helperText.includes(`'${fixture.sourceContract.teamFeature}'`))
  assert(recoveredFunction.includes(fixture.sourceContract.byline))

  const selectedSource = fs.readFileSync(
    path.join(sourceRoot, fixture.inputs.rawSource.path.replace(/^src\//, '')),
  )
  assert(
    [fixture.inputs.rawSource.sha256, fixture.inputs.recoveredSource.sha256].includes(
      sha256(selectedSource),
    ),
    'selected source root must be the exact raw or recovered package state',
  )

  fs.appendFileSync(filename, '\n// mutation\n')
  assert.throws(
    () => applyTarget118SkillAuthorBylineSourceRecovery({ sourceRoot: temporary }),
    /requires its exact raw or recovered source state/,
  )
})

test('recovered SkillTool display executes the authenticated author contract', async t => {
  const raw = execFileSync('git', [
    'show',
    `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.path}`,
  ], { cwd: root })
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-skill-author-runtime.'),
  )
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const filename = writeTempSource(temporary, raw)
  applyTarget118SkillAuthorBylineSourceRecovery({ sourceRoot: temporary })
  const recovered = fs.readFileSync(filename, 'utf8')
  const ts = await loadTypeScript()
  const { sourceFile, declaration } = sourceDeclaration(
    ts,
    recovered,
    fixture.sourceContract.declaration,
    'UI.tsx',
  )
  const source = recovered
    .slice(declaration.getStart(sourceFile), declaration.end)
    .replace(/^export\s+/, '')
  const javascript = ts.transpileModule(
    `namespace React { export type ReactNode = any }\n` +
      `type Input = { skill?: string }; type Command = any;\n${source}`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const calls = []
  const render = new Function(
    'getTeamArtifactAuthor',
    `${javascript}\nreturn renderToolUseMessage`,
  )((sourceName, skillName) => {
    calls.push([sourceName, skillName])
    return sourceName === 'projectSettings' ? 'Ada' : null
  })
  assert.equal(render({}, { commands: [] }), null)
  assert.equal(
    render(
      { skill: '  /deploy  ' },
      {
        commands: [
          {
            name: 'deploy',
            type: 'prompt',
            source: 'projectSettings',
            loadedFrom: fixture.sourceContract.legacyLoadedFrom,
          },
        ],
      },
    ),
    `/deploy${fixture.sourceContract.byline}Ada`,
  )
  assert.equal(
    render(
      { skill: 'status' },
      { commands: [{ name: 'status', type: 'local-jsx', source: 'projectSettings' }] },
    ),
    'status',
  )
  assert.equal(render({ skill: 'plain' }, { commands: [] }), 'plain')
  assert.deepEqual(calls, [
    ['projectSettings', 'deploy'],
    [undefined, 'status'],
    [undefined, 'plain'],
  ])
})

test('coverage accepts only provisional or exact skill-author evidence', () => {
  const coverage = readCoverage()
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.row.targetIndex,
  )
  assert(row)
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  assert.deepEqual(row.ownerIds.map(ownerId => owners.get(ownerId)), [
    fixture.row.ownerPath,
  ])
  const provisional =
    JSON.stringify(row.evidenceIds) ===
    JSON.stringify(['source-map-attribution', 'semantic-test'])
  if (provisional) return
  assert.deepEqual(row.evidenceIds, fixture.row.evidenceIds)
  assert.equal(row.behavior, fixture.row.behavior)
})
