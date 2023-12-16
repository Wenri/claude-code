import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_APPROVE_API_KEY_RETAINED_EVIDENCE_IDS,
  TARGET119_APPROVE_API_KEY_RETAINED_OWNER_OVERRIDES,
  TARGET119_APPROVE_API_KEY_RETAINED_PROOF_SPEC,
} from '../cases/2.1.118-to-2.1.119/recovered/approve-api-key-retained-confirmation-owner-overrides.mjs'
import {
  TARGET117_CONFIRMATION_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-confirmation-source-gaps.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-approve-api-key-retained-confirmation-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/approve-api-key-retained-confirmation-owner-overrides.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '852fcb399e99a80dbb191ab497ed8a645fb3a40206fe16077464ef4546327a1d'
const HELPER_SHA256 =
  '59a345333077561d4a5f8a807010bce2a3036073e72e0853f2a9e96dab0ca16a'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function canonicalAst(source) {
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const identifiers = new Map()
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean)
    if (value === null || typeof value !== 'object') return value
    const result = {}
    for (const key of Object.keys(value).sort()) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
      let child = value[key]
      if (value.type === 'Identifier' && key === 'name') {
        if (!identifiers.has(child)) {
          identifiers.set(child, `i${identifiers.size}`)
        }
        child = identifiers.get(child)
      }
      result[key] = clean(child)
    }
    return result
  }
  return Buffer.from(JSON.stringify(clean(ast)))
}

function tokenCount(source) {
  const tokens = []
  parse(source, {
    ecmaVersion: 'latest',
    onToken: tokens,
    sourceType: 'module',
  })
  assert.equal(tokens.at(-1).type.label, 'eof')
  return tokens.length - 1
}

function propertyOffsets(source, expectedName) {
  const offsets = []
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    const property =
      ['MethodDefinition', 'Property', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property?.name === expectedName) {
      offsets.push([property.start, property.end])
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  return offsets.sort((left, right) => left[0] - right[0])
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function findDeclaration(ts, sourceFile, name) {
  const matches = []
  function visit(node) {
    if (node.name && ts.isIdentifier(node.name) && node.name.text === name) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${name}: one declaration`)
  return matches[0]
}

function gitBlob(commit, sourcePath) {
  const result = spawnSync(
    'git',
    ['rev-parse', `${commit}:${sourcePath}`],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target119 ApproveApiKey retained-owner fixture and override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.partitionSnapshot, {
      typedAuditBytes: 24727372,
      typedAuditSha256:
        '44893d07b612b3b5d6589da39ede97a02f57031e124875fad8b80cbc384d8e96',
      productionStrictRows: 1,
      ownerResidueRows: 0,
      addedOwnerResidueRows: 0,
      unclassifiedAddedOccurrenceRows: 0,
    })
    assert.deepEqual(
      TARGET119_APPROVE_API_KEY_RETAINED_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET119_APPROVE_API_KEY_RETAINED_OWNER_OVERRIDES[0],
      {
        key: `${caseName}:${fixture.row.targetIndex}`,
        targetIndex: fixture.row.targetIndex,
        paths: fixture.row.ownerPaths,
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET119_APPROVE_API_KEY_RETAINED_OWNER_OVERRIDES[0].behavior,
      },
    )
    assert.deepEqual(TARGET119_APPROVE_API_KEY_RETAINED_PROOF_SPEC, {
      targetIndex: fixture.row.targetIndex,
      baselineUnitIndex: fixture.structuralPair.baselineUnitIndex,
      historicalTargetIndex: fixture.historicalOwnerProof.targetIndex,
      ownerPath: fixture.row.ownerPaths[0],
      declaration: fixture.row.declaration,
      representation: fixture.row.representation,
      residue: fixture.row.residue,
    })
    assert.equal(fixture.summary.replayRequired, false)
    assert.equal(
      sha256(JSON.stringify([fixture.row.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(
        JSON.stringify([
          [
            fixture.row.targetIndex,
            fixture.row.residue.kind,
            fixture.row.residue.value,
            fixture.row.residue.start,
            fixture.row.residue.end,
            fixture.row.residue.baselineCount,
            fixture.row.residue.targetOrdinal,
            fixture.row.residue.targetAdded,
          ],
        ]),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(
      sha256(
        JSON.stringify(
          fixture.units.map(unit => [unit.targetIndex, unit.start, unit.end]),
        ),
      ),
      fixture.summary.crossReleaseUnitsSha256,
    )
  },
)

test(
  'complete Targets 117-119 ApproveApiKey units are one retained confirmation AST',
  {
    skip: selected ? false : `not applicable to ${selectedCase}`,
    timeout: 30000,
  },
  () => {
    const bundles = new Map([
      [
        '2.1.117',
        readExact(
          artifactPath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.historicalBundle),
          fixture.inputs.historicalBundle,
          'Target117 bundle',
        ).toString('utf8'),
      ],
      [
        '2.1.118',
        readExact(
          artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
          fixture.inputs.baselineBundle,
          'Target118 bundle',
        ).toString('utf8'),
      ],
      [
        '2.1.119',
        readExact(
          artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
          fixture.inputs.targetBundle,
          'Target119 bundle',
        ).toString('utf8'),
      ],
    ])
    for (const unit of fixture.units) {
      const unitText = bundles.get(unit.release).slice(unit.start, unit.end)
      assert.deepEqual(descriptor(Buffer.from(unitText)), {
        bytes: unit.bytes,
        sha256: unit.sha256,
      })
      assert.equal(tokenCount(unitText), unit.tokens)
      assert.deepEqual(descriptor(canonicalAst(unitText)), fixture.canonicalAst)
      const confirmation = unitText.slice(
        fixture.confirmationObject.localStart,
        fixture.confirmationObject.localEnd,
      )
      assert.equal(confirmation, fixture.confirmationObject.text)
      assert.deepEqual(
        descriptor(Buffer.from(confirmation)),
        {
          bytes: fixture.confirmationObject.bytes,
          sha256: fixture.confirmationObject.sha256,
        },
      )
    }

    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural ledger',
        ),
      ),
    )
    const region = structural.regions[fixture.row.targetIndex]
    const targetUnit = fixture.units.find(unit => unit.release === '2.1.119')
    assert.deepEqual(
      {
        classification: region.classification,
        pairReason: region.pairReason,
        baselineUnitIndex: region.baselineUnitIndex,
        unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
        target: {
          index: region.target.index,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
      },
      {
        classification: fixture.structuralPair.classification,
        pairReason: fixture.structuralPair.pairReason,
        baselineUnitIndex: fixture.structuralPair.baselineUnitIndex,
        unknownFreeIdentifierCount:
          fixture.structuralPair.unknownFreeIdentifierCount,
        target: {
          index: targetUnit.targetIndex,
          nodeType: 'FunctionDeclaration',
          start: targetUnit.start,
          end: targetUnit.end,
          tokenCount: targetUnit.tokens,
          sourceHash: targetUnit.sha256,
          coarseHash: fixture.structuralPair.targetCoarseHash,
        },
      },
    )

    const baselineProperties = propertyOffsets(
      bundles.get('2.1.118'),
      fixture.row.residue.value,
    )
    const targetProperties = propertyOffsets(
      bundles.get('2.1.119'),
      fixture.row.residue.value,
    )
    assert.equal(baselineProperties.length, fixture.row.residue.baselineCount)
    assert.equal(
      targetProperties.length,
      fixture.row.targetGlobalOccurrenceCount,
    )
    assert.deepEqual(
      baselineProperties[fixture.row.baselineCounterpart.globalOrdinal - 1],
      [
        fixture.row.baselineCounterpart.start,
        fixture.row.baselineCounterpart.end,
      ],
    )
    assert.deepEqual(
      targetProperties[fixture.row.residue.targetOrdinal - 1],
      [fixture.row.residue.start, fixture.row.residue.end],
    )
    assert.equal(
      fixture.row.residue.start - targetUnit.start,
      fixture.row.baselineCounterpart.start -
        fixture.units.find(unit => unit.release === '2.1.118').start,
    )
  },
)

test(
  'unchanged ApproveApiKey source and Target117 proof close retained owner lineage',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const sourceRoot = path.resolve(
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
    )
    const source = readExact(
      path.join(sourceRoot, fixture.inputs.sourceFile.path.slice(4)),
      fixture.inputs.sourceFile,
      fixture.inputs.sourceFile.path,
    ).toString('utf8')
    const ts = await loadTypeScript()
    const sourceFile = ts.createSourceFile(
      fixture.inputs.sourceFile.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    const declaration = findDeclaration(
      ts,
      sourceFile,
      fixture.sourceLineage.declaration.name,
    )
    const start = declaration.getStart(sourceFile)
    const end = declaration.end
    const declarationText = source.slice(start, end)
    assert.deepEqual(
      {
        name: fixture.sourceLineage.declaration.name,
        start,
        end,
        ...descriptor(Buffer.from(declarationText)),
      },
      fixture.sourceLineage.declaration,
    )
    for (const fragment of [
      '<Select defaultValue="no" defaultFocusValue="no"',
      "onChange={value_0 => onChange(value_0 as 'yes' | 'no')}",
      'onCancel={() => onChange("no")}',
      '<Text>No (<Text bold={true}>recommended</Text>)</Text>',
    ]) {
      assert.ok(declarationText.includes(fragment), fragment)
    }
    assert.equal(declarationText.includes('cancelLabel'), false)

    for (const commit of fixture.sourceLineage.commits) {
      assert.equal(
        gitBlob(commit, fixture.inputs.sourceFile.path),
        fixture.sourceLineage.blob,
      )
    }

    const historicalFixture = JSON.parse(
      readExact(
        path.join(root, fixture.inputs.historicalProof.path),
        fixture.inputs.historicalProof,
        'Target117 confirmation proof',
      ),
    )
    readExact(
      path.join(root, fixture.inputs.historicalHelper.path),
      fixture.inputs.historicalHelper,
      'Target117 confirmation helper',
    )
    const historicalRow = historicalFixture.rows.find(
      row => row.targetIndex === fixture.historicalOwnerProof.targetIndex,
    )
    assert.deepEqual(
      {
        targetIndex: historicalRow.targetIndex,
        kind: historicalRow.kind,
        ownerPath: historicalRow.owner,
        declaration: historicalRow.declaration,
        cancelLabel: historicalRow.residues.find(
          residue => residue[0] === 'property' && residue[1] === 'cancelLabel',
        ),
      },
      {
        targetIndex: fixture.historicalOwnerProof.targetIndex,
        kind: fixture.historicalOwnerProof.kind,
        ownerPath: fixture.historicalOwnerProof.ownerPath,
        declaration: fixture.historicalOwnerProof.declaration,
        cancelLabel: [
          'property',
          'cancelLabel',
          fixture.historicalOwnerProof.cancelLabel.start,
          fixture.historicalOwnerProof.cancelLabel.end,
          fixture.historicalOwnerProof.cancelLabel.globalOrdinal,
        ],
      },
    )
    const historicalOverride = TARGET117_CONFIRMATION_OWNER_OVERRIDES.find(
      row => row.targetIndex === fixture.historicalOwnerProof.targetIndex,
    )
    assert.deepEqual(historicalOverride.paths, [fixture.row.ownerPaths[0]])
    assert.ok(
      historicalOverride.evidenceIds.includes(
        'target117-confirmation-legacy-select-equivalence-test',
      ),
    )
  },
)
