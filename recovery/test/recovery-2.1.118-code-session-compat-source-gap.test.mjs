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
  applyTarget118CodeSessionCompatSourceRecovery,
  TARGET118_CODE_SESSION_COMPAT_INPUT_FILE,
  TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE,
  TARGET118_CODE_SESSION_COMPAT_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-code-session-compat-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-code-session-compat-source-gap.json',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.117-to-2.1.118/recovered/build-code-session-compat-source-gap-fixture.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(root, fixture.inputs.targetBundle.path)
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')

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

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walk(value, visit)
    } else {
      walk(child, visit)
    }
  }
}

function sourceDeclarations(ts, input, label) {
  const sourceFile = ts.createSourceFile(
    label,
    input,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, label)
  const declarations = new Map()
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      fixture.sourceContract.declarations.includes(statement.name.text)
    ) {
      assert.equal(declarations.has(statement.name.text), false, statement.name.text)
      declarations.set(statement.name.text, statement)
    }
  }
  assert.deepEqual(
    [...declarations.keys()].sort(),
    [...fixture.sourceContract.declarations].sort(),
  )
  return { sourceFile, declarations }
}

function sectionText(input, section) {
  return input.slice(section.start, section.end)
}

function writeTempSource(tempRoot, input) {
  const filename = path.join(
    tempRoot,
    TARGET118_CODE_SESSION_COMPAT_INPUT_FILE.path.replace(/^src\//, ''),
  )
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, input)
  return filename
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

test('Target118 code-session compatibility fixture is deterministic and complete', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 3)
  assert.equal(fixture.summary.residues, 6)
  const indices = fixture.targetUnits.map(unit => unit.index)
  const residues = fixture.targetUnits.flatMap(unit =>
    unit.residues.map(row => [unit.index, ...row]),
  )
  assert.deepEqual(indices, [10809, 10811, 10813])
  assert.equal(
    fixture.summary.indicesSha256,
    sha256(JSON.stringify(indices)),
  )
  assert.equal(
    fixture.summary.residueIdentitiesSha256,
    sha256(JSON.stringify(residues)),
  )
  assert.deepEqual(
    TARGET118_CODE_SESSION_COMPAT_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    fixture.targetUnits.map(unit => ({
      targetIndex: unit.index,
      paths: [unit.ownerPath],
      evidenceIds: unit.evidenceIds,
      behavior: unit.behavior,
    })),
  )
  assert.deepEqual(TARGET118_CODE_SESSION_COMPAT_INPUT_FILE, {
    path: fixture.inputs.rawSource.path,
    bytes: fixture.inputs.rawSource.bytes,
    sha256: fixture.inputs.rawSource.sha256,
  })
  assert.deepEqual(TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE, {
    path: fixture.inputs.recoveredSource.path,
    bytes: fixture.inputs.recoveredSource.bytes,
    sha256: fixture.inputs.recoveredSource.sha256,
  })
  const regenerated = execFileSync(process.execPath, [builderPath, '--stdout'], {
    cwd: root,
  })
  assert.deepEqual(regenerated, fixtureBytes)
})

test('authenticated Target118 units and Target119 lineage pin the complete transition', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const targetBundle = fs.readFileSync(targetBundlePath)
  const targetText = targetBundle.toString()
  assert.deepEqual(descriptor(targetBundle), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  const targetLedgerBytes = fs.readFileSync(
    path.join(root, fixture.inputs.targetStructuralLedger.path),
  )
  assert.deepEqual(descriptor(targetLedgerBytes), {
    bytes: fixture.inputs.targetStructuralLedger.bytes,
    sha256: fixture.inputs.targetStructuralLedger.sha256,
  })
  const targetLedger = JSON.parse(gunzipSync(targetLedgerBytes))
  for (const unit of fixture.targetUnits) {
    const region = targetLedger.regions.find(
      candidate => candidate.target?.index === unit.index,
    )
    assert(region, `u${unit.index}`)
    assert.deepEqual(
      {
        index: region.target.index,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
        tokenCount: region.target.tokenCount,
      },
      {
        index: unit.index,
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        bytes: unit.bytes,
        sourceHash: unit.sourceHash,
        coarseHash: unit.coarseHash,
        tokenCount: unit.tokenCount,
      },
    )
    const unitText = targetText.slice(unit.start, unit.end)
    assert.deepEqual(textDescriptor(unitText), {
      bytes: unit.bytes,
      sha256: unit.sourceHash,
    })
    const ast = parse(unitText, { ecmaVersion: 'latest', sourceType: 'script' })
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].type, unit.nodeType)
    for (const [kind, value, start, end] of unit.residues) {
      const sourceFragment = targetText.slice(start, end)
      assert(
        sourceFragment === value ||
          (kind === 'string' && sourceFragment === JSON.stringify(value)),
        `u${unit.index} ${kind}:${value}`,
      )
    }
  }

  const [convertUnit, listUnit, fetchUnit] = fixture.targetUnits.map(unit =>
    targetText.slice(unit.start, unit.end),
  )
  for (const marker of [
    'worker_status',
    'last_event_at',
    'custom_system_prompt',
    'append_system_prompt',
  ]) {
    assert(convertUnit.includes(marker), marker)
  }
  for (const marker of ['/v1/code/sessions', 'worker_status', 'last_event_at']) {
    assert(listUnit.includes(marker), marker)
  }
  assert(fetchUnit.includes('response_shape'))
  assert.match(fetchUnit, /response_shape\?\?.+\.session/)

  const forwardBundle = fs.readFileSync(
    path.join(root, fixture.inputs.forwardBundle.path),
  )
  const forwardText = forwardBundle.toString()
  assert.deepEqual(descriptor(forwardBundle), {
    bytes: fixture.inputs.forwardBundle.bytes,
    sha256: fixture.inputs.forwardBundle.sha256,
  })
  const forwardLedgerBytes = fs.readFileSync(
    path.join(root, fixture.inputs.forwardStructuralLedger.path),
  )
  assert.deepEqual(descriptor(forwardLedgerBytes), {
    bytes: fixture.inputs.forwardStructuralLedger.bytes,
    sha256: fixture.inputs.forwardStructuralLedger.sha256,
  })
  for (const row of fixture.forwardLineage) {
    const value = forwardText.slice(
      row.target119.start,
      row.target119.end,
    )
    assert.deepEqual(textDescriptor(value), {
      bytes: row.target119.bytes,
      sha256: row.target119.sourceHash,
    })
    if (row.structuralPair) {
      const target = fixture.targetUnits.find(
        unit => unit.index === row.target118Index,
      )
      assert.equal(row.structuralPair.classification, 'matched')
      assert.equal(
        row.structuralPair.pairReason,
        'exact-scope-normalized-token-hash',
      )
      assert.equal(target.coarseHash, row.target119.coarseHash)
    } else {
      assert.equal(row.target118Index, 10813)
      assert(value.includes('response_shape'))
    }
  }
})

test('bounded code-session replay is exact, typed, idempotent, and fail-closed', async t => {
  const raw = execFileSync('git', [
    'show',
    `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.path}`,
  ], { cwd: root })
  const donor = execFileSync('git', [
    'show',
    `${fixture.inputs.donorSource.commit}:${fixture.inputs.donorSource.path}`,
  ], { cwd: root })
  assert.deepEqual(descriptor(raw), {
    bytes: fixture.inputs.rawSource.bytes,
    sha256: fixture.inputs.rawSource.sha256,
  })
  assert.deepEqual(descriptor(donor), {
    bytes: fixture.inputs.donorSource.bytes,
    sha256: fixture.inputs.donorSource.sha256,
  })

  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-code-session-compat.'),
  )
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const filename = writeTempSource(temporary, raw)
  assert.deepEqual(
    applyTarget118CodeSessionCompatSourceRecovery({ sourceRoot: temporary }),
    { status: 'recovered', files: [fixture.inputs.rawSource.path] },
  )
  assert.deepEqual(
    applyTarget118CodeSessionCompatSourceRecovery({ sourceRoot: temporary }),
    { status: 'already-recovered', files: [] },
  )
  const recovered = fs.readFileSync(filename)
  assert.deepEqual(descriptor(recovered), {
    bytes: fixture.inputs.recoveredSource.bytes,
    sha256: fixture.inputs.recoveredSource.sha256,
  })

  const ts = await loadTypeScript()
  const recoveredText = recovered.toString()
  const donorText = donor.toString()
  sourceDeclarations(ts, recoveredText, 'target118-recovered-api.ts')
  sourceDeclarations(ts, donorText, 'target119-donor-api.ts')
  for (const section of fixture.sourceSections) {
    const recoveredSection = sectionText(recoveredText, section.recovered)
    const donorSection = sectionText(donorText, section.donor)
    assert.deepEqual(textDescriptor(recoveredSection), {
      bytes: section.recovered.bytes,
      sha256: section.recovered.sha256,
    })
    assert.deepEqual(textDescriptor(donorSection), {
      bytes: section.donor.bytes,
      sha256: section.donor.sha256,
    })
    if (section.recovered.declaration !== 'fetchSession') {
      assert.equal(recoveredSection, donorSection)
    }
  }
  assert.match(recoveredText, /response_shape\?: SessionsApiSession/)
  assert.match(recoveredText, /responseData\.response_shape \?\? responseData\.session/)
  assert.doesNotMatch(
    sectionText(
      recoveredText,
      fixture.sourceSections.find(
        row => row.recovered.declaration === 'fetchCodeSessionsFromSessionsAPI',
      ).recovered,
    ),
    /x-organization-uuid|anthropic-beta/,
  )

  const packageSource = fs.readFileSync(
    path.join(sourceRoot, fixture.inputs.rawSource.path.replace(/^src\//, '')),
  )
  assert(
    [fixture.inputs.rawSource.sha256, fixture.inputs.recoveredSource.sha256].includes(
      sha256(packageSource),
    ),
    'selected source root must be the exact raw or recovered package state',
  )

  fs.appendFileSync(filename, '\n// mutation\n')
  assert.throws(
    () => applyTarget118CodeSessionCompatSourceRecovery({ sourceRoot: temporary }),
    /requires its exact raw or recovered source state/,
  )
})

test('recovered declarations execute the authenticated CCR compatibility contract', async () => {
  const ts = await loadTypeScript()
  const raw = execFileSync('git', [
    'show',
    `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.path}`,
  ], { cwd: root, encoding: 'utf8' })
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-code-session-runtime.'),
  )
  try {
    const filename = writeTempSource(temporary, raw)
    applyTarget118CodeSessionCompatSourceRecovery({ sourceRoot: temporary })
    const recovered = fs.readFileSync(filename, 'utf8')
    const { sourceFile, declarations } = sourceDeclarations(
      ts,
      recovered,
      'target118-runtime-api.ts',
    )
    const declarationText = fixture.sourceContract.declarations
      .map(name => {
        const declaration = declarations.get(name)
        return recovered
          .slice(declaration.getStart(sourceFile), declaration.end)
          .replace(/^export\s+/, '')
      })
      .join('\n')
    const executable = `
type SessionStatus = 'requires_action' | 'running' | 'idle' | 'archived'
type SessionContextSource = any
type Outcome = any
type SessionResource = any
type SessionsApiSession = any
type CodeSession = any
type GitSource = any
${declarationText}
`
    const javascript = ts.transpileModule(executable, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    })
    const errors =
      javascript.diagnostics?.filter(
        diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
      ) ?? []
    assert.equal(
      errors.length,
      0,
      errors
        .map(diagnostic =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        )
        .join('\n'),
    )
    const requests = []
    const rawSession = {
      id: 'session-1',
      title: null,
      status: 'archived',
      worker_status: 'running',
      environment_id: 'env-1',
      created_at: 'created',
      last_event_at: 'last-event',
      config: {
        sources: [
          {
            type: 'git_repository',
            url: 'https://github.com/anthropics/claude-code',
            revision: 'main',
          },
        ],
        outcomes: null,
        model: 'claude',
      },
    }
    const prepareApiRequest = async () => ({
      accessToken: 'token',
      orgUUID: 'unused',
    })
    const getOauthConfig = () => ({ BASE_API_URL: 'https://api.example' })
    const getOAuthHeaders = token => ({ Authorization: `Bearer ${token}` })
    const axiosGetWithRetry = async (url, config) => {
      requests.push({ kind: 'list', url, config })
      return { status: 200, data: { data: [rawSession] } }
    }
    const axios = {
      async get(url, config) {
        requests.push({ kind: 'fetch', url, config })
        return { status: 200, data: { response_shape: rawSession } }
      },
    }
    const parseGitHubRepository = url =>
      url.replace('https://github.com/', '')
    const factory = new Function(
      'prepareApiRequest',
      'getOauthConfig',
      'getOAuthHeaders',
      'axiosGetWithRetry',
      'axios',
      'parseGitHubRepository',
      'toError',
      'logError',
      `${javascript.outputText}\nreturn { ccrSessionToResource, fetchCodeSessionsFromSessionsAPI, fetchSession }`,
    )
    const recoveredApi = factory(
      prepareApiRequest,
      getOauthConfig,
      getOAuthHeaders,
      axiosGetWithRetry,
      axios,
      parseGitHubRepository,
      value => value,
      () => {},
    )
    assert.deepEqual(recoveredApi.ccrSessionToResource(rawSession), {
      type: 'session',
      id: 'session-1',
      title: null,
      session_status: 'archived',
      environment_id: 'env-1',
      created_at: 'created',
      updated_at: 'last-event',
      session_context: {
        sources: rawSession.config.sources,
        outcomes: null,
        model: 'claude',
        cwd: '',
        custom_system_prompt: null,
        append_system_prompt: null,
      },
    })
    assert.deepEqual(await recoveredApi.fetchCodeSessionsFromSessionsAPI(), [
      {
        id: 'session-1',
        title: 'Untitled',
        description: '',
        status: 'archived',
        repo: {
          name: 'claude-code',
          owner: { login: 'anthropics' },
          default_branch: 'main',
        },
        turns: [],
        created_at: 'created',
        updated_at: 'last-event',
      },
    ])
    assert.deepEqual(
      await recoveredApi.fetchSession('session-1'),
      recoveredApi.ccrSessionToResource(rawSession),
    )
    assert.deepEqual(
      requests.map(row => [row.kind, row.url, row.config.headers]),
      [
        [
          'list',
          'https://api.example/v1/code/sessions',
          { Authorization: 'Bearer token' },
        ],
        [
          'fetch',
          'https://api.example/v1/code/sessions/session-1',
          { Authorization: 'Bearer token' },
        ],
      ],
    )
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('coverage accepts only the complete provisional or exact replay evidence state', () => {
  const coverage = readCoverage()
  const indices = new Set(fixture.targetUnits.map(unit => unit.index))
  const rows = coverage.rows
    .filter(row => indices.has(row.targetIndex))
    .sort((left, right) => left.targetIndex - right.targetIndex)
  assert.equal(rows.length, fixture.targetUnits.length)
  const ownerById = new Map(coverage.owners.map(owner => [owner.id, owner]))
  for (const row of rows) {
    assert.deepEqual(
      row.ownerIds.map(ownerId => ownerById.get(ownerId)?.path),
      [fixture.sourceContract.sourcePath],
    )
  }
  const provisional = rows.every(
    row =>
      JSON.stringify(row.evidenceIds) ===
      JSON.stringify(['source-map-attribution', 'semantic-test']),
  )
  if (provisional) return
  for (const row of rows) {
    const expected = fixture.targetUnits.find(unit => unit.index === row.targetIndex)
    assert.deepEqual(row.evidenceIds, expected.evidenceIds)
    assert.equal(row.behavior, expected.behavior)
  }
})
