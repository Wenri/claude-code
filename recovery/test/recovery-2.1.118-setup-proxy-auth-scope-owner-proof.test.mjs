import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_SETUP_PROXY_AUTH_SCOPE_EVIDENCE_IDS,
  TARGET118_SETUP_PROXY_AUTH_SCOPE_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/setup-proxy-auth-scope-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-setup-proxy-auth-scope-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'de432e5399829807c3e10e5df40b8692fefe57a55f1291e169ab44afa9cdfdc0'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_117_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js',
  )
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const digest = value => sha256(Buffer.from(JSON.stringify(value)))

function readPinned(input, base = root) {
  const value = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function gitFile(input) {
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.historicalSource.commit}:${input.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return result.stdout
}

function canonicalAst(node) {
  if (Array.isArray(node)) return node.map(canonicalAst)
  if (!node || typeof node !== 'object') return node
  const output = {}
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'raw'].includes(key)) continue
    output[key] =
      key === 'name' && node.type === 'Identifier'
        ? '_'
        : canonicalAst(value)
  }
  return output
}

function canonicalUnit(source) {
  return Buffer.from(
    JSON.stringify(
      canonicalAst(
        parse(source, {
          allowHashBang: true,
          ecmaVersion: 'latest',
          sourceType: 'script',
        }),
      ),
    ),
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

test('Target118 setup proxy-auth fixture and override are frozen', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.deepEqual(
    descriptor(fs.readFileSync(path.join(root, fixture.inputs.override.path))),
    {
      bytes: fixture.inputs.override.bytes,
      sha256: fixture.inputs.override.sha256,
    },
  )
  assert.deepEqual(
    TARGET118_SETUP_PROXY_AUTH_SCOPE_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET118_SETUP_PROXY_AUTH_SCOPE_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
    })),
    [
      {
        targetIndex: fixture.targetUnit.targetIndex,
        paths: fixture.ownerOverride.paths,
        declarations: fixture.ownerOverride.declarations,
        evidenceIds: fixture.ownerOverride.evidenceIds,
      },
    ],
  )
  assert.equal(
    digest([fixture.targetUnit.targetIndex]),
    fixture.summary.targetIndicesSha256,
  )
  assert.equal(
    digest(
      fixture.targetUnit.residues.map(row => [
        fixture.targetUnit.targetIndex,
        ...row,
      ]),
    ),
    fixture.summary.residueIdentitiesSha256,
  )
})

test('complete Target117 and Target118 setup units are alpha-equivalent', { skip: !selected }, () => {
  const baselineBundle = fs.readFileSync(baselineBundlePath)
  const targetBundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(baselineBundle), {
    bytes: fixture.inputs.baselineBundle.bytes,
    sha256: fixture.inputs.baselineBundle.sha256,
  })
  assert.deepEqual(descriptor(targetBundle), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  const baselineUnit = baselineBundle.subarray(
    fixture.baselineUnit.start,
    fixture.baselineUnit.end,
  )
  const targetUnit = targetBundle.subarray(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(baselineUnit), {
    bytes: fixture.baselineUnit.bytes,
    sha256: fixture.baselineUnit.sourceHash,
  })
  assert.deepEqual(descriptor(targetUnit), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  for (const unit of [baselineUnit, targetUnit]) {
    assert.deepEqual(descriptor(canonicalUnit(unit.toString('utf8'))), {
      bytes: fixture.canonicalUnit.bytes,
      sha256: fixture.canonicalUnit.sha256,
    })
  }

  const targetLedger = JSON.parse(
    gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
  )
  const targetRegion = targetLedger.regions.find(
    row => row.target.index === fixture.targetUnit.targetIndex,
  )
  assert.ok(targetRegion)
  assert.equal(targetRegion.baselineUnitIndex, fixture.targetUnit.baselineUnitIndex)
  assert.equal(targetRegion.pairReason, fixture.targetUnit.pairReason)
  assert.equal(targetRegion.target.coarseHash, fixture.targetUnit.coarseHash)
  const baselineLedger = JSON.parse(
    gunzipSync(readPinned(fixture.inputs.baselineStructuralLedger)),
  )
  const baselineRegion = [
    ...baselineLedger.regions,
    ...baselineLedger.unresolvedTarget,
  ].find(row => row.target.index === fixture.baselineUnit.targetIndex)
  assert.ok(baselineRegion)
  assert.equal(baselineRegion.target.start, fixture.baselineUnit.start)
  assert.equal(baselineRegion.target.end, fixture.baselineUnit.end)
  assert.equal(baselineRegion.target.sourceHash, fixture.baselineUnit.sourceHash)
})

test('both complete units carry the exact project/local proxy-auth scope contract', { skip: !selected }, () => {
  const baselineBundle = fs.readFileSync(baselineBundlePath)
  const targetBundle = fs.readFileSync(targetBundlePath)
  for (const [bundle, fragment] of [
    [baselineBundle, fixture.proxyAuthFragments.baseline],
    [targetBundle, fixture.proxyAuthFragments.target],
  ]) {
    const value = bundle.subarray(fragment.start, fragment.end)
    assert.deepEqual(descriptor(value), {
      bytes: fragment.bytes,
      sha256: fragment.sha256,
    })
    const text = value.toString('utf8')
    for (const scope of fixture.proxyAuthFragments.scopeValues) {
      assert.equal(text.split(`"${scope}"`).length - 1, 1)
    }
    assert.match(text, /fromProjectOrLocal:/)
    assert.match(text, /trustAccepted:/)
    assert.equal((text.match(/proxyAuthHelper/g) ?? []).length, 3)
  }
  const [kind, value, start, end, baselineCount, targetOrdinal] =
    fixture.targetUnit.residues[0]
  assert.equal(kind, 'string')
  assert.equal(value, 'projectSettings')
  assert.equal(targetBundle.subarray(start, end).toString(), '"projectSettings"')
  assert.ok(targetOrdinal > baselineCount)

  const analysis = JSON.parse(readPinned(fixture.inputs.ownerAnalysis))
  const mapping = analysis.analysis.sourceSupplementGaps.find(
    row => row.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert.ok(mapping)
  assert.deepEqual(mapping.ownerPaths, ['setup.ts'])
  assert.equal(mapping.residueIdentitiesSha256, fixture.summary.residueIdentitiesSha256)
})

test('historical setup source authenticates the owner and blocks partial replay', { skip: !selected }, async () => {
  const source = gitFile(fixture.inputs.historicalSource.file)
  const packaged = fs.readFileSync(
    path.join(
      sourceRoot,
      fixture.inputs.historicalSource.file.path.replace(/^src\//, ''),
    ),
  )
  assert.deepEqual(descriptor(packaged), {
    bytes: fixture.inputs.historicalSource.file.bytes,
    sha256: fixture.inputs.historicalSource.file.sha256,
  })
  const ts = await loadTypeScript()
  const text = source.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.inputs.historicalSource.file.path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  let declaration
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === fixture.inputs.historicalSource.declaration.name
    ) {
      declaration = node
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(declaration)
  const characterStart = declaration.getStart(sourceFile)
  const characterEnd = declaration.end
  const byteStart = Buffer.byteLength(text.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
  assert.deepEqual(
    {
      characterStart,
      characterEnd,
      byteStart,
      byteEnd,
      ...descriptor(source.subarray(byteStart, byteEnd)),
    },
    {
      characterStart: fixture.inputs.historicalSource.declaration.characterStart,
      characterEnd: fixture.inputs.historicalSource.declaration.characterEnd,
      byteStart: fixture.inputs.historicalSource.declaration.byteStart,
      byteEnd: fixture.inputs.historicalSource.declaration.byteEnd,
      bytes: fixture.inputs.historicalSource.declaration.bytes,
      sha256: fixture.inputs.historicalSource.declaration.sha256,
    },
  )
  const declarationText = source.subarray(byteStart, byteEnd).toString('utf8')
  for (const value of fixture.sourceReplayBlocker.absentDeclarationValues) {
    assert.doesNotMatch(declarationText, new RegExp(`\\b${value}\\b`))
  }
  assert.equal(fixture.sourceReplayBlocker.replayHelper, null)
})

test('coverage accepts only generic or complete setup proxy-auth evidence', { skip: !selected }, () => {
  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          `recovery/cases/${caseName}/semantic/source-coverage.json.gz`,
        ),
      ),
    ),
  )
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert.ok(row)
  assert.equal(row.disposition, 'source-runtime-covered')
  assert.deepEqual(row.ownerIds, ['owner-src-setup-ts'])
  assert.ok(
    [
      ['source-map-attribution', 'semantic-test'],
      fixture.ownerOverride.evidenceIds,
    ].some(ids => JSON.stringify(ids) === JSON.stringify(row.evidenceIds)),
  )
})
