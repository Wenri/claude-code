import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_PLUGIN_THEME_COUNT_EVIDENCE_IDS,
  TARGET118_PLUGIN_THEME_COUNT_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/plugin-theme-count-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-plugin-theme-count-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '5992d5d1aa549825967e5466d5b6ead34ad89ae898af1ca5efdf1a82d6c19a6c'
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

function readPinned(input, base = root) {
  const bytes = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
}

function canonicalRows() {
  return fixture.targetUnit.residues.map(row => [
    fixture.targetUnit.targetIndex,
    ...row,
  ])
}

function canonicalAst(node) {
  if (Array.isArray(node)) {
    return node.flatMap(item => {
      if (
        item?.type === 'ExpressionStatement' &&
        item.expression?.type === 'SequenceExpression'
      ) {
        return item.expression.expressions.map(expression =>
          canonicalAst({ type: 'ExpressionStatement', expression }),
        )
      }
      return [canonicalAst(item)]
    })
  }
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

function replaceExactly(source, operation) {
  assert.equal(source.split(operation.text).length - 1, 1, operation.label)
  assert.equal(source.slice(operation.localStart, operation.localEnd), operation.text)
  assert.deepEqual(descriptor(Buffer.from(operation.text)), {
    bytes: operation.bytes,
    sha256: operation.sha256,
  })
  return source.slice(0, operation.localStart) + source.slice(operation.localEnd)
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
  'Target118 plugin theme-count fixture and static override are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    readPinned(fixture.inputs.override)
    assert.deepEqual(
      TARGET118_PLUGIN_THEME_COUNT_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET118_PLUGIN_THEME_COUNT_OWNER_OVERRIDES.map(row => ({
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
      sha256(JSON.stringify(canonicalRows())),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated bundles and structural ledgers pin the complete units',
  { skip: !selected },
  () => {
    const baseline = readPinned(fixture.inputs.baselineBundle)
    const target = readPinned(fixture.inputs.targetBundle)
    const target119 = readPinned(fixture.inputs.target119Bundle)
    const ledger = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.structuralLedger)),
    )
    const target119Ledger = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.target119StructuralLedger)),
    )
    const targetRegion = ledger.regions.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetRegion)
    assert.equal(targetRegion.classification, fixture.targetUnit.classification)
    assert.deepEqual(targetRegion.target, {
      ...targetRegion.target,
      index: fixture.targetUnit.targetIndex,
      nodeType: fixture.targetUnit.nodeType,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      tokenCount: fixture.targetUnit.tokens,
      sourceHash: fixture.targetUnit.sha256,
      coarseHash: fixture.targetUnit.coarseHash,
    })
    const baselineRegion = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.targetIndex,
    )
    assert.ok(baselineRegion)
    assert.equal(baselineRegion.start, fixture.baselineUnit.start)
    assert.equal(baselineRegion.end, fixture.baselineUnit.end)
    assert.equal(baselineRegion.sourceHash, fixture.baselineUnit.sha256)
    for (const unit of [
      fixture.baselineUnit,
      fixture.targetUnit,
      ...fixture.themeRuntimeDependencies,
    ]) {
      const bundle = unit === fixture.baselineUnit ? baseline : target
      assert.deepEqual(descriptor(bundle.subarray(unit.start, unit.end)), {
        bytes: unit.bytes,
        sha256: unit.sha256,
      })
    }
    for (const residue of fixture.targetUnit.residues) {
      assert.equal(
        target.subarray(residue[2], residue[3]).toString(),
        residue[1],
      )
    }
    const retained = target119Ledger.regions.find(
      row => row.target.index === fixture.target119Retention.targetIndex,
    )
    assert.ok(retained)
    assert.equal(retained.classification, fixture.target119Retention.classification)
    assert.equal(retained.baselineUnitIndex, fixture.target119Retention.baselineUnitIndex)
    assert.equal(retained.pairReason, fixture.target119Retention.pairReason)
    assert.deepEqual(
      descriptor(
        target119.subarray(
          fixture.target119Retention.start,
          fixture.target119Retention.end,
        ),
      ),
      {
        bytes: fixture.target119Retention.bytes,
        sha256: fixture.target119Retention.sha256,
      },
    )
  },
)

test(
  'three exact theme-count edits are the complete Target117 to Target118 delta',
  { skip: !selected },
  () => {
    const baselineBundle = readPinned(fixture.inputs.baselineBundle)
    const targetBundle = readPinned(fixture.inputs.targetBundle)
    const target119Bundle = readPinned(fixture.inputs.target119Bundle)
    const baseline = baselineBundle
      .subarray(fixture.baselineUnit.start, fixture.baselineUnit.end)
      .toString()
    const target = targetBundle
      .subarray(fixture.targetUnit.start, fixture.targetUnit.end)
      .toString()
    for (const operation of fixture.semanticDelta.operations) {
      assert.equal(
        targetBundle.subarray(operation.start, operation.end).toString(),
        operation.text,
      )
    }
    let stripped = target
    let removed = 0
    for (const operation of fixture.semanticDelta.operations) {
      const adjusted = {
        ...operation,
        localStart: operation.localStart - removed,
        localEnd: operation.localEnd - removed,
      }
      stripped = replaceExactly(stripped, adjusted)
      removed += operation.bytes
    }
    assert.deepEqual(descriptor(Buffer.from(stripped)), fixture.semanticDelta.strippedTarget)
    const baselineCanonical = canonicalUnit(baseline)
    const strippedCanonical = canonicalUnit(stripped)
    assert.deepEqual(
      descriptor(baselineCanonical),
      fixture.semanticDelta.canonicalBaselineAndStrippedTarget,
    )
    assert.deepEqual(strippedCanonical, baselineCanonical)
    const targetCanonical = canonicalUnit(target)
    assert.deepEqual(descriptor(targetCanonical), fixture.semanticDelta.canonicalTarget)
    const target119 = target119Bundle
      .subarray(
        fixture.target119Retention.start,
        fixture.target119Retention.end,
      )
      .toString()
    assert.deepEqual(canonicalUnit(target119), targetCanonical)
  },
)

test(
  'recovered source pins the owner boundary and blocks a partial replay',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    for (const source of Object.values(fixture.sourceState).filter(
      value => value && typeof value === 'object' && value.path,
    )) {
      const bytes = readPinned(
        { path: source.path.replace(/^src\//, ''), ...source.file },
        sourceRoot,
      )
      const text = bytes.toString()
      const sourceFile = ts.createSourceFile(
        source.path,
        text,
        ts.ScriptTarget.Latest,
        true,
        source.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      const declarations = []
      const visit = node => {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name?.text === source.declaration.name
        ) {
          declarations.push(node)
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      assert.equal(declarations.length, 1)
      const declaration = declarations[0]
      assert.equal(declaration.getStart(sourceFile), source.declaration.start)
      assert.equal(declaration.end, source.declaration.end)
      assert.deepEqual(
        descriptor(
          Buffer.from(
            text.slice(source.declaration.start, source.declaration.end),
          ),
        ),
        {
          bytes: source.declaration.bytes,
          sha256: source.declaration.sha256,
        },
      )
      for (const marker of source.requiredAbsent ?? []) {
        assert.equal(text.includes(marker), false, marker)
      }
      for (const marker of source.requiredFragments ?? []) {
        assert.equal(text.includes(marker), true, marker)
      }
    }
    assert.match(fixture.sourceState.replayBlockedReason, /asynchronous/)
    assert.match(fixture.sourceState.replayBlockedReason, /enabled array/)
  },
)

test(
  'coverage accepts only the provisional or complete corrected owner state',
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
    assert.equal(row.disposition, 'source-runtime-covered')
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const paths = row.ownerIds.map(id => owners.get(id)).sort()
    const provisional =
      paths.length === 1 &&
      paths[0] === 'src/hooks/useManagePlugins.ts' &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.ownerOverride.paths].sort()) &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
      row.behavior ===
        TARGET118_PLUGIN_THEME_COUNT_OWNER_OVERRIDES[0].behavior
    assert.equal(provisional || corrected, true)
  },
)
