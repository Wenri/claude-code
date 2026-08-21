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
  TARGET119_ONBOARDING_RETAINED_EVIDENCE_IDS,
  TARGET119_ONBOARDING_RETAINED_OWNER_OVERRIDES,
  TARGET119_ONBOARDING_RETAINED_PROOF_SPEC,
  TARGET119_RETAINED_CONFIRMATION_CLUSTER_EVIDENCE_IDS,
  TARGET119_RETAINED_CONFIRMATION_CLUSTER_OWNER_OVERRIDES,
  TARGET119_RETAINED_CONFIRMATION_CLUSTER_PROOF_SPECS,
} from '../cases/2.1.118-to-2.1.119/recovered/onboarding-retained-confirmation-owner-overrides.mjs'
import { TARGET117_CONFIRMATION_OWNER_OVERRIDES } from '../cases/2.1.116-to-2.1.117/recovered/replay-confirmation-source-gaps.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-onboarding-retained-confirmation-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/onboarding-retained-confirmation-owner-overrides.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'afff6726d1284b8329cb1bd5ebee030eaf48d27102ba741e57fc3d7c3436396a'
const HELPER_SHA256 =
  'c8fea395d3a3255653f2107531e26b21f4444921b45ead76fcb03d99a4df495e'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function partitionDescriptor(rows) {
  const bytes = Buffer.from(JSON.stringify(rows))
  return { rows: rows.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

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

function propertyOffsets(source, expectedNames) {
  const offsets = new Map([...expectedNames].map(name => [name, []]))
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
    if (offsets.has(property?.name)) {
      offsets.get(property.name).push([property.start, property.end])
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
  for (const matches of offsets.values()) {
    matches.sort((left, right) => left[0] - right[0])
  }
  return offsets
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function findFunction(ts, sourceFile, name) {
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${name}: one function declaration`)
  return matches[0]
}

function gitBlob(commit, sourcePath) {
  const result = spawnSync('git', ['rev-parse', `${commit}:${sourcePath}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function structuralUnit(region) {
  return {
    classification: region.classification,
    baselineUnitIndex: region.baselineUnitIndex,
    pairReason: region.pairReason,
    unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
    target: {
      index: region.target.index,
      nodeType: region.target.nodeType,
      parseStatus: region.target.parseStatus,
      start: region.target.start,
      end: region.target.end,
      tokenCount: region.target.tokenCount,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
      topDefinitionCount: region.target.topDefinitionCount,
    },
  }
}

function proofSpec(row) {
  return {
    targetIndex: row.targetIndex,
    baselineUnitIndex: row.baselineUnitIndex,
    historicalTargetIndex: row.historicalTargetIndex,
    ownerPath: row.ownerPaths[0],
    declaration: row.declaration,
    representation: row.representation,
    residues: row.strictResidues.map(
      ({ baselineCounterpart, historicalCounterpart, ...residue }) => residue,
    ),
  }
}

test(
  'Target119 retained-confirmation cluster fixture and overrides remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 2)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.rows.length, 4)
    assert.deepEqual(
      TARGET119_RETAINED_CONFIRMATION_CLUSTER_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET119_RETAINED_CONFIRMATION_CLUSTER_PROOF_SPECS,
      fixture.rows.map(proofSpec),
    )
    assert.deepEqual(
      TARGET119_RETAINED_CONFIRMATION_CLUSTER_OWNER_OVERRIDES.map(
        ({ behavior: _behavior, ...override }) => override,
      ),
      fixture.rows.map(row => ({
        key: `${caseName}:${row.targetIndex}`,
        targetIndex: row.targetIndex,
        paths: row.ownerPaths,
        evidenceIds: fixture.evidenceIds,
      })),
    )
    assert.deepEqual(
      TARGET119_ONBOARDING_RETAINED_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET119_ONBOARDING_RETAINED_OWNER_OVERRIDES, [
      TARGET119_RETAINED_CONFIRMATION_CLUSTER_OWNER_OVERRIDES[0],
    ])
    assert.deepEqual(
      TARGET119_ONBOARDING_RETAINED_PROOF_SPEC,
      TARGET119_RETAINED_CONFIRMATION_CLUSTER_PROOF_SPECS[0],
    )

    const empty = fixture.partitionSnapshot.emptySourceRuntimePartition
    assert.deepEqual(partitionDescriptor(empty.canonicalRows), {
      rows: empty.rows,
      jsonBytes: empty.jsonBytes,
      sha256: empty.sha256,
    })
    const strictRows = []
    for (const partition of fixture.partitionSnapshot.byTarget) {
      assert.equal(partition.owner, 'emptySourceRuntimePartition')
      assert.equal(partition.addedOwner, 'emptySourceRuntimePartition')
      assert.equal(partition.coverageTargetRowPresent, false)
      assert.deepEqual(partitionDescriptor(partition.strict.canonicalRows), {
        rows: partition.strict.rows,
        jsonBytes: partition.strict.jsonBytes,
        sha256: partition.strict.sha256,
      })
      strictRows.push(...partition.strict.canonicalRows)
    }
    assert.deepEqual(strictRows, fixture.partitionSnapshot.strictAggregate.canonicalRows)
    assert.deepEqual(partitionDescriptor(strictRows), {
      rows: fixture.partitionSnapshot.strictAggregate.rows,
      jsonBytes: fixture.partitionSnapshot.strictAggregate.jsonBytes,
      sha256: fixture.partitionSnapshot.strictAggregate.sha256,
    })

    assert.equal(fixture.summary.units, fixture.rows.length)
    assert.equal(
      fixture.summary.residues,
      fixture.rows.flatMap(row => row.strictResidues).length,
    )
    assert.equal(
      fixture.summary.crossReleaseUnits,
      fixture.rows.flatMap(row => row.units).length,
    )
    assert.equal(
      sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      fixture.partitionSnapshot.strictAggregate.sha256,
      fixture.summary.strictResidueIdentitiesSha256,
    )
    assert.equal(
      sha256(
        JSON.stringify(
          fixture.rows.flatMap(row =>
            row.units.map(unit => [unit.targetIndex, unit.start, unit.end]),
          ),
        ),
      ),
      fixture.summary.crossReleaseUnitsSha256,
    )
    assert.equal(fixture.summary.replayRequired, false)
    assert.equal(fixture.sourceReplay.mode, 'static')
    assert.equal(fixture.sourceReplay.authorized, false)
  },
)

test(
  'complete Targets 117-119 units prove the four matched confirmation lineages',
  {
    skip: selected ? false : `not applicable to ${selectedCase}`,
    timeout: 60000,
  },
  () => {
    const bundles = new Map([
      [
        '2.1.117',
        readExact(
          artifactPath(
            'CLAUDE_CODE_2_1_117_BUNDLE',
            fixture.inputs.historicalBundle,
          ),
          fixture.inputs.historicalBundle,
          'Target117 bundle',
        ).toString('utf8'),
      ],
      [
        '2.1.118',
        readExact(
          artifactPath(
            'CLAUDE_CODE_2_1_118_BUNDLE',
            fixture.inputs.baselineBundle,
          ),
          fixture.inputs.baselineBundle,
          'Target118 bundle',
        ).toString('utf8'),
      ],
      [
        '2.1.119',
        readExact(
          artifactPath(
            'CLAUDE_CODE_2_1_119_BUNDLE',
            fixture.inputs.targetBundle,
          ),
          fixture.inputs.targetBundle,
          'Target119 bundle',
        ).toString('utf8'),
      ],
    ])
    const targetStructural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.targetStructural.path),
          fixture.inputs.targetStructural,
          'Target119 structural ledger',
        ),
      ),
    )
    const baselineStructural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.baselineStructural.path),
          fixture.inputs.baselineStructural,
          'Target118 structural ledger',
        ),
      ),
    )
    const propertyNames = new Set(
      fixture.rows.flatMap(row =>
        row.strictResidues.map(residue => residue.value),
      ),
    )
    const propertyCache = new Map(
      [...bundles].map(([release, source]) => [
        release,
        propertyOffsets(source, propertyNames),
      ]),
    )
    const offsets = (release, property) =>
      propertyCache.get(release).get(property)

    for (const row of fixture.rows) {
      const units = Object.fromEntries(row.units.map(unit => [unit.release, unit]))
      for (const unit of row.units) {
        const text = bundles.get(unit.release).slice(unit.start, unit.end)
        assert.deepEqual(descriptor(Buffer.from(text)), {
          bytes: unit.bytes,
          sha256: unit.sha256,
        })
        assert.equal(tokenCount(text), unit.tokens)
      }
      const targetText = bundles
        .get('2.1.119')
        .slice(units['2.1.119'].start, units['2.1.119'].end)
      const confirmation = targetText.slice(
        row.confirmationObject.localStart,
        row.confirmationObject.localEnd,
      )
      assert.equal(confirmation, row.confirmationObject.targetText)
      assert.deepEqual(descriptor(Buffer.from(confirmation)), {
        bytes: row.confirmationObject.targetBytes,
        sha256: row.confirmationObject.targetSha256,
      })

      assert.deepEqual(
        structuralUnit(targetStructural.regions[row.targetIndex]),
        {
          classification: row.structuralLineage.classification,
          baselineUnitIndex: row.baselineUnitIndex,
          pairReason: row.structuralLineage.pairReason,
          unknownFreeIdentifierCount:
            row.structuralLineage.unknownFreeIdentifierCount,
          target: {
            index: row.targetIndex,
            nodeType: 'FunctionDeclaration',
            parseStatus: 'parsed',
            start: units['2.1.119'].start,
            end: units['2.1.119'].end,
            tokenCount: units['2.1.119'].tokens,
            sourceHash: units['2.1.119'].sha256,
            coarseHash: row.structuralLineage.coarseHash,
            topDefinitionCount: 1,
          },
        },
      )
      assert.deepEqual(
        structuralUnit(baselineStructural.regions[row.baselineUnitIndex]),
        {
          classification: row.structuralLineage.classification,
          baselineUnitIndex: row.historicalTargetIndex,
          pairReason: row.structuralLineage.pairReason,
          unknownFreeIdentifierCount:
            row.structuralLineage.unknownFreeIdentifierCount,
          target: {
            index: row.baselineUnitIndex,
            nodeType: 'FunctionDeclaration',
            parseStatus: 'parsed',
            start: units['2.1.118'].start,
            end: units['2.1.118'].end,
            tokenCount: units['2.1.118'].tokens,
            sourceHash: units['2.1.118'].sha256,
            coarseHash: row.structuralLineage.coarseHash,
            topDefinitionCount: 1,
          },
        },
      )

      for (const residue of row.strictResidues) {
        const historicalOffsets = offsets('2.1.117', residue.value)
        const baselineOffsets = offsets('2.1.118', residue.value)
        const targetOffsets = offsets('2.1.119', residue.value)
        assert.equal(
          historicalOffsets.length,
          fixture.globalPropertyOccurrenceCounts['2.1.117'][residue.value],
        )
        assert.equal(baselineOffsets.length, residue.baselineCount)
        assert.equal(
          baselineOffsets.length,
          fixture.globalPropertyOccurrenceCounts['2.1.118'][residue.value],
        )
        assert.equal(
          targetOffsets.length,
          fixture.globalPropertyOccurrenceCounts['2.1.119'][residue.value],
        )
        assert.deepEqual(
          historicalOffsets[residue.historicalCounterpart.globalOrdinal - 1],
          [
            residue.historicalCounterpart.start,
            residue.historicalCounterpart.end,
          ],
        )
        assert.deepEqual(
          baselineOffsets[residue.baselineCounterpart.globalOrdinal - 1],
          [residue.baselineCounterpart.start, residue.baselineCounterpart.end],
        )
        assert.deepEqual(targetOffsets[residue.targetOrdinal - 1], [
          residue.start,
          residue.end,
        ])
        assert.equal(
          residue.historicalCounterpart.globalOrdinal,
          residue.baselineCounterpart.globalOrdinal,
        )
        assert.ok(residue.targetOrdinal > residue.baselineCount)
        assert.ok(
          residue.start - units['2.1.119'].start >=
            row.confirmationObject.localStart,
        )
        assert.ok(
          residue.end - units['2.1.119'].start <=
            row.confirmationObject.localEnd,
        )
      }
    }
  },
)

test(
  'unchanged source declarations and Target117 proofs close all four owners',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const sourceRoot = path.resolve(
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
    )
    const ts = await loadTypeScript()
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

    for (const row of fixture.rows) {
      const source = readExact(
        path.join(sourceRoot, row.sourceFile.path.slice(4)),
        row.sourceFile,
        row.sourceFile.path,
      ).toString('utf8')
      const sourceFile = ts.createSourceFile(
        row.sourceFile.path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      const declaration = findFunction(
        ts,
        sourceFile,
        row.sourceDeclaration.name,
      )
      const start = declaration.getStart(sourceFile)
      const end = declaration.end
      const declarationText = source.slice(start, end)
      assert.deepEqual(
        {
          name: row.sourceDeclaration.name,
          start,
          end,
          ...descriptor(Buffer.from(declarationText)),
        },
        row.sourceDeclaration,
      )
      for (const label of row.choiceLabels) {
        assert.ok(declarationText.includes(label), `${row.declaration}: ${label}`)
      }
      for (const fragment of ['<Select', 'options=', 'onChange=']) {
        assert.ok(
          declarationText.includes(fragment),
          `${row.declaration}: ${fragment}`,
        )
      }
      assert.equal(declarationText.includes('confirmLabel'), false)
      assert.equal(declarationText.includes('cancelLabel'), false)

      for (const commit of fixture.sourceCommits) {
        assert.equal(
          gitBlob(commit, row.sourceFile.path),
          row.sourceFile.gitBlob,
        )
      }

      const historicalRow = historicalFixture.rows.find(
        candidate => candidate.targetIndex === row.historicalTargetIndex,
      )
      assert.deepEqual(
        {
          targetIndex: historicalRow.targetIndex,
          kind: historicalRow.kind,
          ownerPath: historicalRow.owner,
          declaration: historicalRow.declaration,
          file: historicalRow.file,
          source: historicalRow.source,
          strings: historicalRow.strings,
        },
        {
          targetIndex: row.historicalTargetIndex,
          kind: row.historicalOwnerKind,
          ownerPath: row.ownerPaths[0],
          declaration: row.declaration,
          file: [row.sourceFile.bytes, row.sourceFile.sha256],
          source: [
            row.sourceDeclaration.start,
            row.sourceDeclaration.end,
            row.sourceDeclaration.bytes,
            row.sourceDeclaration.sha256,
          ],
          strings: row.choiceLabels,
        },
      )
      for (const residue of row.strictResidues) {
        assert.deepEqual(
          historicalRow.residues.find(
            candidate =>
              candidate[0] === residue.kind && candidate[1] === residue.value,
          ),
          [
            residue.kind,
            residue.value,
            residue.historicalCounterpart.start,
            residue.historicalCounterpart.end,
            residue.historicalCounterpart.globalOrdinal,
          ],
        )
      }
      const historicalOverride = TARGET117_CONFIRMATION_OWNER_OVERRIDES.find(
        candidate => candidate.targetIndex === row.historicalTargetIndex,
      )
      assert.deepEqual(historicalOverride.paths, row.ownerPaths)
      assert.ok(
        historicalOverride.evidenceIds.includes(
          'target117-confirmation-legacy-select-equivalence-test',
        ),
      )
    }
  },
)
