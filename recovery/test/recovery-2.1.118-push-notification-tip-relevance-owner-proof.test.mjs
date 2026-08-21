import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_PUSH_NOTIFICATION_TIP_RELEVANCE_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/push-notification-tip-relevance-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-push-notification-tip-relevance-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '44c8383be2583bde99e859d1ab92ef9754e7aadbc42f80d946a03068747fdc9f'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const configuredSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sourceFilename(sourceRoot) {
  return path.join(
    sourceRoot,
    fixture.inputs.historicalSource.file.path.slice('src/'.length),
  )
}

function gitSource() {
  const input = fixture.inputs.historicalSource
  const result = spawnSync(
    'git',
    ['show', `${input.commit}:${input.file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.file.bytes,
    sha256: input.file.sha256,
  })
  return result.stdout
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

function walk(node, predicate, matches = []) {
  if (!node || typeof node !== 'object') return matches
  if (predicate(node)) matches.push(node)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walk(value, predicate, matches)
    } else {
      walk(child, predicate, matches)
    }
  }
  return matches
}

function memberName(node) {
  if (node?.type !== 'MemberExpression' || node.computed) return undefined
  return node.property?.name
}

let typescriptPromise
async function loadTypeScript() {
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

function exactDeclaration(ts, sourceFile, bytes) {
  const expected = fixture.inputs.historicalSource.declaration
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === expected.name) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  assert.deepEqual(
    {
      name: declaration.name.text,
      start,
      end,
      ...descriptor(bytes.subarray(start, end)),
    },
    expected,
  )
  return declaration
}

test(
  'Target118 push-notification tip-relevance fixture and override are deterministic',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(fs.readFileSync(path.join(root, fixture.inputs.override.path))),
      {
        bytes: fixture.inputs.override.bytes,
        sha256: fixture.inputs.override.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_PUSH_NOTIFICATION_TIP_RELEVANCE_OWNER_OVERRIDES.map(row => ({
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
      sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(
        JSON.stringify(
          fixture.targetUnit.residues.map(residue => [
            fixture.targetUnit.targetIndex,
            ...residue,
          ]),
        ),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.historicalSource.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.historicalSource.tree,
    )
    assert.equal(
      spawnSync(
        'git',
        [
          'rev-parse',
          `${fixture.inputs.historicalSource.commit}:${fixture.inputs.historicalSource.file.path}`,
        ],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.historicalSource.file.blob,
    )
    gitSource()
  },
)

test(
  'authenticated Target118 u17757 is the complete push-notification tip predicate',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledgerBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(ledgerBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const region = ledger.regions.find(
      candidate => candidate.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(region)
    assert.deepEqual(
      {
        classification: region.classification,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        tokenCount: region.target.tokenCount,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        classification: fixture.targetUnit.classification,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        bytes: fixture.targetUnit.bytes,
        tokenCount: fixture.targetUnit.tokenCount,
        nodeType: fixture.targetUnit.nodeType,
        sourceHash: fixture.targetUnit.sourceHash,
        coarseHash: fixture.targetUnit.coarseHash,
      },
    )
    const unitBytes = bundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    assert.deepEqual(descriptor(unitBytes), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sourceHash,
    })
    const declaration = parse(unitBytes.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    }).body[0]
    assert.equal(declaration.type, 'FunctionDeclaration')
    const members = walk(
      declaration,
      node =>
        node.type === 'MemberExpression' &&
        ['agentPushNotifEnabled', 'pushNotifUpsellSeenCount'].includes(
          memberName(node),
        ),
    )
    assert.deepEqual(members.map(memberName), ['agentPushNotifEnabled'])
    assert.equal(
      walk(
        declaration,
        node => node.type === 'LogicalExpression' && node.operator === '&&',
      ).length,
      3,
    )
    for (const [kind, value, start, end] of fixture.targetUnit.residues) {
      assert.equal(kind, 'property')
      assert.equal(bundle.subarray(start, end).toString('utf8'), value)
      assert.ok(start >= fixture.targetUnit.start && end <= fixture.targetUnit.end)
    }
  },
)

test(
  'historical and packaged source execute the exact tip-relevance guard graph',
  { skip: !selected },
  async () => {
    const historical = gitSource()
    const packaged = fs.readFileSync(sourceFilename(configuredSourceRoot))
    assert.deepEqual(descriptor(packaged), {
      bytes: fixture.inputs.historicalSource.file.bytes,
      sha256: fixture.inputs.historicalSource.file.sha256,
    })
    assert.deepEqual(packaged, historical)
    const ts = await loadTypeScript()
    const sourceFile = ts.createSourceFile(
      fixture.inputs.historicalSource.file.path,
      historical.toString('utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    const declaration = exactDeclaration(ts, sourceFile, historical)
    const declarationText = declaration.getText(sourceFile)
    for (const marker of [
      '!isBridgeEnabled()',
      "'tengu_kairos_push_notifications'",
      'config.hasUsedRemoteControl === true',
      'getRemoteControlAtStartup()',
      'config.agentPushNotifEnabled !== true',
    ]) {
      assert.ok(declarationText.includes(marker), marker)
    }

    const javascript = ts.transpileModule(
      `${declarationText}\nexports.isPushNotificationTipRelevant = isPushNotificationTipRelevant`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    function load({
      bridge = true,
      feature = true,
      startup = false,
      config = { hasUsedRemoteControl: true },
    }) {
      const module = { exports: {} }
      new Function(
        'exports',
        'module',
        'isBridgeEnabled',
        'getFeatureValue_CACHED_MAY_BE_STALE',
        'getGlobalConfig',
        'getRemoteControlAtStartup',
        javascript,
      )(
        module.exports,
        module,
        () => bridge,
        (key, fallback) => {
          assert.equal(key, 'tengu_kairos_push_notifications')
          assert.equal(fallback, false)
          return feature
        },
        () => config,
        () => startup,
      )
      return module.exports.isPushNotificationTipRelevant
    }
    assert.equal(load({ bridge: false })(), false)
    assert.equal(load({ feature: false })(), false)
    assert.equal(load({ config: {} })(), false)
    assert.equal(load({ startup: true, config: {} })(), true)
    assert.equal(
      load({
        config: { hasUsedRemoteControl: true, agentPushNotifEnabled: true },
      })(),
      false,
    )
    assert.equal(load({ config: { hasUsedRemoteControl: true } })(), true)
  },
)

test(
  'push-notification tip-relevance coverage evolves atomically',
  { skip: !selected },
  () => {
    const coverage = readCoverage()
    const owners = new Map(
      coverage.owners.map(owner => [owner.id, owner.path]),
    )
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([fixture.targetUnit.provisionalOwnerPath]) &&
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
