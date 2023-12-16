import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_TRANSCRIPT_SHARE_STATIC_EVIDENCE_IDS,
  TARGET118_TRANSCRIPT_SHARE_STATIC_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/transcript-share-static-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-transcript-share-static-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = 'e771b6fc9b716b4371af6c54678b1871ad68fd5265bde7448233f7b96d6ee5a7'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function readPinned(input, base = root) {
  const bytes = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
}

function canonicalAst(node) {
  if (Array.isArray(node)) return node.map(canonicalAst)
  if (!node || typeof node !== 'object') return node
  const output = {}
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'raw'].includes(key)) continue
    if (key === 'name' && node.type === 'Identifier') {
      output[key] = '_'
      continue
    }
    if (
      key === 'value' &&
      node.type === 'Literal' &&
      typeof value === 'string' &&
      (/^\d+\.\d+\.\d+$/.test(value) ||
        /^20\d\d-.*Z$/.test(value) ||
        /^[a-f0-9]{40}$/.test(value))
    ) {
      output[key] = '<BUILD>'
      continue
    }
    output[key] = canonicalAst(value)
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

test(
  'Target118 transcript-share fixture and override are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    readPinned(fixture.inputs.override)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      TARGET118_TRANSCRIPT_SHARE_STATIC_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET118_TRANSCRIPT_SHARE_STATIC_OWNER_OVERRIDES.map(row => ({
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
          evidenceIds: fixture.evidenceIds,
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
          fixture.targetUnit.residues.map(row => [
            fixture.targetUnit.targetIndex,
            ...row,
          ]),
        ),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated paired units differ only by exact build identity',
  { skip: !selected },
  () => {
    const baselineBundle = readPinned(fixture.inputs.baselineBundle)
    const targetBundle = readPinned(fixture.inputs.targetBundle)
    const baseline = baselineBundle.subarray(
      fixture.baselineUnit.start,
      fixture.baselineUnit.end,
    )
    const target = targetBundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    assert.deepEqual(descriptor(baseline), {
      bytes: fixture.baselineUnit.bytes,
      sha256: fixture.baselineUnit.sha256,
    })
    assert.deepEqual(descriptor(target), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sha256,
    })
    for (const [label, value] of Object.entries(
      fixture.baselineUnit.buildIdentity,
    )) {
      assert.equal(baseline.toString().includes(value), true, label)
      assert.equal(target.toString().includes(value), false, label)
    }
    for (const [label, value] of Object.entries(
      fixture.targetUnit.buildIdentity,
    )) {
      assert.equal(target.toString().includes(value), true, label)
      assert.equal(baseline.toString().includes(value), false, label)
    }
    const baselineCanonical = canonicalUnit(baseline.toString())
    const targetCanonical = canonicalUnit(target.toString())
    assert.deepEqual(
      descriptor(baselineCanonical),
      {
        bytes: fixture.canonicalPairedUnit.bytes,
        sha256: fixture.canonicalPairedUnit.sha256,
      },
    )
    assert.deepEqual(targetCanonical, baselineCanonical)
    for (const residue of fixture.targetUnit.residues) {
      assert.equal(
        targetBundle.subarray(residue[2], residue[3]).toString(),
        residue[0] === 'string' ? JSON.stringify(residue[1]) : residue[1],
      )
    }
  },
)

test(
  'exact source AST owns the size guard and generated version field',
  { skip: !selected },
  async () => {
    const bytes = readPinned(
      {
        path: fixture.sourceState.path.replace(/^src\//, ''),
        ...fixture.sourceState.file,
      },
      sourceRoot,
    )
    const source = bytes.toString()
    for (const fragment of fixture.sourceState.requiredFragments) {
      assert.equal(source.includes(fragment), true, fragment)
    }
    const ts = await loadTypeScript()
    const sourceFile = ts.createSourceFile(
      fixture.sourceState.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const declarations = []
    const visit = node => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === fixture.sourceState.declaration.name
      ) {
        declarations.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert.equal(declarations.length, 1)
    const declaration = declarations[0]
    assert.equal(declaration.getStart(sourceFile), fixture.sourceState.declaration.start)
    assert.equal(declaration.end, fixture.sourceState.declaration.end)
    assert.deepEqual(
      descriptor(
        Buffer.from(
          source.slice(
            fixture.sourceState.declaration.start,
            fixture.sourceState.declaration.end,
          ),
        ),
      ),
      {
        bytes: fixture.sourceState.declaration.bytes,
        sha256: fixture.sourceState.declaration.sha256,
      },
    )
    let sizeIdentifiers = 0
    const countSizeIdentifiers = node => {
      if (ts.isIdentifier(node) && node.text === 'size') sizeIdentifiers += 1
      ts.forEachChild(node, countSizeIdentifiers)
    }
    countSizeIdentifiers(declaration)
    const declarationText = declaration.getText(sourceFile)
    assert.equal(sizeIdentifiers, 3)
    assert.equal((declarationText.match(/MACRO\.VERSION/g) ?? []).length, 1)
  },
)

test(
  'coverage accepts only provisional or complete static proof state',
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
    const paths = row.ownerIds.map(id => owners.get(id)).sort()
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.ownerOverride.paths].sort()) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.ownerOverride.paths].sort()) &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
      row.behavior ===
        TARGET118_TRANSCRIPT_SHARE_STATIC_OWNER_OVERRIDES[0].behavior
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.equal(provisional || corrected, true)
  },
)
