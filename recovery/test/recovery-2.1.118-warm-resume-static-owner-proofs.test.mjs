import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_WARM_RESUME_STATIC_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/warm-resume-static-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-warm-resume-static-owner-proofs.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '3bc12c165470e91076b628b9eb31847dc0583528c1ad19f03deafde51bfcd5dd'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
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

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function memberName(node) {
  if (node?.type !== 'MemberExpression' || node.computed) return undefined
  return node.property?.name
}

function gitSource() {
  const source = fixture.inputs.source.file
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.source.commit}:${source.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: source.bytes,
    sha256: source.sha256,
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

function declarationsNamed(ts, sourceFile, name) {
  const matches = []
  function visit(node) {
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        declaration => declaration.name.getText(sourceFile) === name,
      )
    ) {
      matches.push(node)
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return matches
}

test(
  'Target118 WarmResume static fixture and owner overrides are deterministic',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    const overrideBytes = fs.readFileSync(
      path.join(root, fixture.inputs.override.path),
    )
    assert.deepEqual(descriptor(overrideBytes), {
      bytes: fixture.inputs.override.bytes,
      sha256: fixture.inputs.override.sha256,
    })
    assert.deepEqual(
      TARGET118_WARM_RESUME_STATIC_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      fixture.rows.map(row => ({
        targetIndex: row.targetIndex,
        paths: [row.ownerPath],
        declarations: row.declarations,
        evidenceIds: fixture.evidenceIds,
        behavior: row.behavior,
      })),
    )
    assert.ok(
      fixture.rows.every(row => row.ownerPath !== row.provisionalOwnerPath),
    )
    const indices = fixture.rows.map(row => row.targetIndex)
    const residues = fixture.rows.flatMap(row =>
      row.residues.map(residue => [row.targetIndex, ...residue]),
    )
    assert.deepEqual(
      { units: indices.length, residues: residues.length },
      { units: fixture.summary.units, residues: fixture.summary.residues },
    )
    assert.equal(
      sha256(JSON.stringify(indices)),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(residues)),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.source.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.source.tree,
    )
    assert.equal(
      spawnSync(
        'git',
        [
          'rev-parse',
          `${fixture.inputs.source.commit}:${fixture.inputs.source.file.path}`,
        ],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.source.file.blob,
    )
  },
)

test(
  'authenticated Target118 units close complete WarmResume eligibility and variant behavior',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const structuralBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(structuralBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const units = new Map()
    for (const expected of fixture.rows) {
      const region = structural.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
      )
      assert.ok(region, `u${expected.targetIndex}`)
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
          classification: expected.classification,
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          tokenCount: expected.tokenCount,
          nodeType: expected.nodeType,
          sourceHash: expected.sourceHash,
          coarseHash: expected.coarseHash,
        },
      )
      const bytes = bundle.subarray(expected.start, expected.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: expected.bytes,
        sha256: expected.sourceHash,
      })
      const unit = parse(bytes.toString(), {
        ecmaVersion: 'latest',
        sourceType: 'script',
      }).body[0]
      assert.equal(unit.type, expected.nodeType)
      units.set(expected.targetIndex, unit)
      for (const residue of expected.residues) {
        const [kind, value, start, end] = residue
        const text = bundle.subarray(start, end).toString()
        assert.equal(kind === 'string' ? JSON.parse(text) : text, value)
      }
    }

    const eligibility = units.get(16625)
    const returns = walk(
      eligibility,
      node => node.type === 'ReturnStatement',
    )
    assert.equal(returns.length, 1)
    const returnText = bundle
      .subarray(returns[0].argument.start + fixture.rows[0].start,
        returns[0].argument.end + fixture.rows[0].start)
      .toString()
    assert.match(returnText, /\.sessionKind===void 0/)
    assert.match(returnText, /!.*\.isTeammate/)

    const moduleInitializer = units.get(16630)
    const variantArrays = walk(
      moduleInitializer,
      node =>
        node.type === 'ArrayExpression' &&
        JSON.stringify(node.elements.map(element => element?.value)) ===
          JSON.stringify(['0', '1', '2', '3']),
    )
    assert.equal(variantArrays.length, 1)
    assert.equal(
      walk(
        moduleInitializer,
        node => memberName(node) === 'isTeammate',
      ).length,
      0,
    )
  },
)

test(
  'historical and packaged WarmResume source retain both exact declarations',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const historical = gitSource()
    const packaged = fs.readFileSync(
      path.join(
        sourceRoot,
        fixture.inputs.source.file.path.replace(/^src\//, ''),
      ),
    )

    for (const [label, bytes] of [
      ['historical', historical],
      ['packaged', packaged],
    ]) {
      const sourceFile = ts.createSourceFile(
        fixture.inputs.source.file.path,
        bytes.toString('utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, label)
      for (const expected of fixture.inputs.source.declarations) {
        const matches = declarationsNamed(ts, sourceFile, expected.name)
        assert.equal(matches.length, 1, `${label}: ${expected.name}`)
        const declaration = matches[0]
        const start = declaration.getStart(sourceFile)
        const end = declaration.end
        assert.deepEqual(
          descriptor(bytes.subarray(start, end)),
          { bytes: expected.bytes, sha256: expected.sha256 },
          `${label}: ${expected.name}`,
        )
        if (label === 'historical') {
          assert.deepEqual(
            { start, end },
            { start: expected.start, end: expected.end },
            expected.name,
          )
        }
      }
    }
  },
)

test(
  'WarmResume static owner coverage evolves atomically',
  { skip: !selected },
  () => {
    const coverage = readCoverage()
    const owners = new Map(
      coverage.owners.map(owner => [owner.id, owner.path]),
    )
    const states = new Set()
    for (const expected of fixture.rows) {
      const row = coverage.rows.find(
        candidate => candidate.targetIndex === expected.targetIndex,
      )
      assert.ok(row, `u${expected.targetIndex}`)
      const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
      const provisional =
        JSON.stringify(paths) ===
          JSON.stringify([expected.provisionalOwnerPath]) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(['source-map-attribution', 'semantic-test'])
      const corrected =
        JSON.stringify(paths) === JSON.stringify([expected.ownerPath]) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(fixture.evidenceIds) &&
        row.behavior === expected.behavior
      assert.ok(provisional || corrected, `u${expected.targetIndex}`)
      states.add(corrected ? 'corrected' : 'provisional')
    }
    assert.equal(states.size, 1, 'WarmResume owner coverage evolves atomically')
  },
)
