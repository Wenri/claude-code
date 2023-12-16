import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_UPDATE_ENTRYPOINT_EVIDENCE_IDS,
  TARGET118_UPDATE_ENTRYPOINT_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/update-entrypoint-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-update-entrypoint-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'a82d899f0dd030b08ba21b23f4e588ccfdba43a05889665f9921a519d33428a8'
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_117_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js',
  )
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

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}
const digest = value => sha256(Buffer.from(JSON.stringify(value)))

function readPinned(input, base = root) {
  const value = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function gitFile(commit, input) {
  const result = spawnSync('git', ['show', `${commit}:${input.path}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return result.stdout
}

function gitRev(value) {
  const result = spawnSync('git', ['rev-parse', value], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function canonicalToken(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'string') {
    return `S:${JSON.stringify(token.value)}`
  }
  if (token.type.label === 'num') return `N:${token.value}`
  if (token.type.label === 'regexp') {
    return `R:${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function tokens(bytes, globalStart) {
  const source = bytes.toString('utf8')
  const output = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    const localStart = Buffer.byteLength(source.slice(0, token.start))
    const localEnd = Buffer.byteLength(source.slice(0, token.end))
    output.push({
      canonical: canonicalToken(token),
      value: token.value,
      raw: source.slice(token.start, token.end),
      start: globalStart + localStart,
      end: globalStart + localEnd,
      localStart,
      localEnd,
    })
  }
  return output
}

function normalizedTokens(input, macroValues) {
  const macros = new Set(Object.values(macroValues))
  return input.map(row =>
    macros.has(row.value) ? 'BUILD_MACRO' : row.canonical,
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

async function declaration(input, bytes) {
  const ts = await loadTypeScript()
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    input.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const matches = sourceFile.statements.filter(
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === input.declaration.name,
  )
  assert.equal(matches.length, 1)
  const node = matches[0]
  const characterStart = node.getStart(sourceFile)
  const characterEnd = node.end
  const byteStart = Buffer.byteLength(source.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(source.slice(0, characterEnd))
  assert.deepEqual(
    { characterStart, characterEnd, byteStart, byteEnd },
    {
      characterStart: input.declaration.characterStart,
      characterEnd: input.declaration.characterEnd,
      byteStart: input.declaration.byteStart,
      byteEnd: input.declaration.byteEnd,
    },
  )
  assert.deepEqual(descriptor(bytes.subarray(byteStart, byteEnd)), {
    bytes: input.declaration.bytes,
    sha256: input.declaration.sha256,
  })
  return { source, sourceFile, node }
}

function structuralUnit(row) {
  return {
    targetIndex: row.target.index,
    classification: row.classification,
    start: row.target.start,
    end: row.target.end,
    bytes: row.target.end - row.target.start,
    tokenCount: row.target.tokenCount,
    nodeType: row.target.nodeType,
    sourceHash: row.target.sourceHash,
    coarseHash: row.target.coarseHash,
  }
}

test(
  'Target118 update entrypoint fixture and override are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    readPinned(fixture.inputs.override)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'authenticated-static-whole-unit-owner-proof-no-replay',
    )
    assert.deepEqual(
      TARGET118_UPDATE_ENTRYPOINT_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      fixture.evidenceCatalog.map(row => row.id),
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET118_UPDATE_ENTRYPOINT_OWNER_OVERRIDES.map(row => ({
        key: row.key,
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          key: `${caseName}:${fixture.targetUnit.targetIndex}`,
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.ownerOverride.declarations,
          evidenceIds: fixture.ownerOverride.evidenceIds,
          behavior: fixture.targetUnit.behavior,
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
    assert.equal(
      digest(
        fixture.targetUnit.unsupportedResidues.map(row => [
          fixture.targetUnit.targetIndex,
          ...row,
        ]),
      ),
      fixture.summary.unsupportedResidueIdentitiesSha256,
    )
    assert.equal(fixture.sourceTransition.sourceReplayHelper, null)
  },
)

test(
  'complete update units isolate two source-authenticated insertions and exact predecessor rows',
  { skip: !selected },
  () => {
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
    const baselineBytes = baselineBundle.subarray(
      fixture.baselineUnit.start,
      fixture.baselineUnit.end,
    )
    const targetBytes = targetBundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    assert.deepEqual(descriptor(baselineBytes), {
      bytes: fixture.baselineUnit.bytes,
      sha256: fixture.baselineUnit.sourceHash,
    })
    assert.deepEqual(descriptor(targetBytes), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sourceHash,
    })

    const baseline = tokens(baselineBytes, fixture.baselineUnit.start)
    const target = tokens(targetBytes, fixture.targetUnit.start)
    assert.equal(baseline.length, fixture.canonicalTokenProof.baselineTokens)
    assert.equal(target.length, fixture.canonicalTokenProof.targetTokens)
    const baselineCanonical = normalizedTokens(
      baseline,
      fixture.canonicalTokenProof.baselineMacroValues,
    )
    const targetCanonical = normalizedTokens(
      target,
      fixture.canonicalTokenProof.targetMacroValues,
    )
    assert.equal(
      digest(baselineCanonical),
      fixture.canonicalTokenProof.normalizedBaselineSha256,
    )
    assert.equal(
      digest(targetCanonical),
      fixture.canonicalTokenProof.normalizedTargetSha256,
    )

    const matchedPairs = []
    for (const segment of fixture.canonicalTokenProof.matchedSegments) {
      const baselineSegment = baselineCanonical.slice(
        segment.baselineStart,
        segment.baselineEnd,
      )
      const targetSegment = targetCanonical.slice(
        segment.targetStart,
        segment.targetEnd,
      )
      assert.deepEqual(targetSegment, baselineSegment)
      assert.equal(baselineSegment.length, segment.tokens)
      assert.equal(digest(baselineSegment), segment.canonicalSha256)
      for (let index = 0; index < segment.tokens; index += 1) {
        matchedPairs.push([
          segment.baselineStart + index,
          segment.targetStart + index,
        ])
      }
    }
    assert.equal(matchedPairs.length, baseline.length)
    const baselineMacros = new Set(
      Object.values(fixture.canonicalTokenProof.baselineMacroValues),
    )
    const targetMacros = new Set(
      Object.values(fixture.canonicalTokenProof.targetMacroValues),
    )
    const macroPairs = matchedPairs.filter(([baselineIndex, targetIndex]) => {
      const baselineIsMacro = baselineMacros.has(baseline[baselineIndex].value)
      const targetIsMacro = targetMacros.has(target[targetIndex].value)
      assert.equal(targetIsMacro, baselineIsMacro)
      return baselineIsMacro
    })
    assert.deepEqual(macroPairs, fixture.canonicalTokenProof.macroTokenPairs)
    assert.equal(
      digest(macroPairs),
      fixture.canonicalTokenProof.macroTokenPairsSha256,
    )
    assert.equal(
      macroPairs.length,
      fixture.canonicalTokenProof.metadataTokenCount,
    )
    assert.equal(
      macroPairs.length,
      fixture.canonicalTokenProof.macroObjectCount * 3,
    )
    for (const value of baselineMacros) {
      assert.equal(baseline.filter(row => row.value === value).length, 23)
    }
    for (const value of targetMacros) {
      assert.equal(target.filter(row => row.value === value).length, 23)
    }

    const insertionRanges = fixture.canonicalTokenProof.compiledInsertions
    for (const insertion of insertionRanges) {
      const rows = target.slice(
        insertion.targetTokenStart,
        insertion.targetTokenEnd,
      )
      assert.equal(rows.length, insertion.tokens)
      assert.deepEqual(
        descriptor(
          targetBytes.subarray(
            rows[0].localStart,
            rows.at(-1).localEnd,
          ),
        ),
        insertion.raw,
      )
      assert.deepEqual(
        [rows[0].start, rows.at(-1).end],
        [insertion.targetByteStart, insertion.targetByteEnd],
      )
      assert.equal(
        digest(rows.map(row => row.canonical)),
        insertion.canonicalTokensSha256,
      )
    }
    const reconstructed = [
      ...targetCanonical.slice(0, insertionRanges[0].targetTokenStart),
      ...targetCanonical.slice(
        insertionRanges[0].targetTokenEnd,
        insertionRanges[1].targetTokenStart,
      ),
      ...targetCanonical.slice(insertionRanges[1].targetTokenEnd),
    ]
    assert.deepEqual(reconstructed, baselineCanonical)
    assert.equal(
      digest(reconstructed),
      fixture.canonicalTokenProof.reconstructedBaselineSha256,
    )

    const macroResidues = fixture.targetUnit.residues.filter(row =>
      targetMacros.has(row[1]),
    )
    assert.equal(macroResidues.length, 69)
    assert.equal(
      fixture.targetUnit.residues.length,
      fixture.summary.residues,
    )
    for (const [kind, value, start, end] of fixture.targetUnit.residues) {
      const token = target.find(row => row.start === start && row.end === end)
      assert.ok(token, `${kind}:${value}: exact target token`)
      if (kind === 'string') {
        assert.ok(token.value === value || token.raw === value)
      } else {
        assert.equal(token.raw, value)
      }
    }

    for (const predecessor of fixture.canonicalTokenProof.strictPredecessors) {
      const baselineToken = baseline[predecessor.baselineTokenIndex]
      const targetToken = target[predecessor.targetTokenIndex]
      assert.deepEqual(
        [baselineToken.start, baselineToken.end, baselineToken.raw],
        [
          predecessor.baselineStart,
          predecessor.baselineEnd,
          predecessor.raw,
        ],
      )
      assert.deepEqual(
        [targetToken.start, targetToken.end, targetToken.raw],
        [predecessor.targetStart, predecessor.targetEnd, predecessor.raw],
      )
      const radius = predecessor.contextRadius
      const baselineContext = baselineCanonical.slice(
        predecessor.baselineTokenIndex - radius,
        predecessor.baselineTokenIndex + radius + 1,
      )
      const targetContext = targetCanonical.slice(
        predecessor.targetTokenIndex - radius,
        predecessor.targetTokenIndex + radius + 1,
      )
      assert.deepEqual(targetContext, baselineContext)
      assert.equal(
        digest(targetContext),
        predecessor.canonicalContextSha256,
      )
    }
  },
)

test(
  'structural ledgers and row-scoped owner analysis pin the complete update unit',
  { skip: !selected },
  () => {
    const baselineStructural = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.baselineStructuralLedger)),
    )
    const targetStructural = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
    )
    const baselineRow = baselineStructural.unresolvedTarget.find(
      row => row.target.index === fixture.baselineUnit.targetIndex,
    )
    const targetRow = targetStructural.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(baselineRow)
    assert.ok(targetRow)
    assert.deepEqual(structuralUnit(baselineRow), fixture.baselineUnit)
    assert.deepEqual(
      structuralUnit(targetRow),
      Object.fromEntries(
        Object.entries(fixture.targetUnit).filter(([key]) =>
          [
            'targetIndex',
            'classification',
            'start',
            'end',
            'bytes',
            'tokenCount',
            'nodeType',
            'sourceHash',
            'coarseHash',
          ].includes(key),
        ),
      ),
    )

    const ownerAnalysis = JSON.parse(readPinned(fixture.inputs.ownerAnalysis))
    const mapping = ownerAnalysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(mapping, fixture.ownerAnalysisPin)
  },
)

test(
  'historical update source proves the exact additions and coverage evolves atomically',
  { skip: !selected },
  async () => {
    const historical = fixture.inputs.historicalSource
    assert.equal(
      gitRev(`${historical.baseCommit}^{tree}`),
      historical.baseTree,
    )
    assert.equal(
      gitRev(`${historical.targetCommit}^{tree}`),
      historical.targetTree,
    )
    assert.equal(
      gitRev(`${historical.baseCommit}:${historical.baseFile.path}`),
      historical.baseFile.blob,
    )
    assert.equal(
      gitRev(`${historical.targetCommit}:${historical.targetFile.path}`),
      historical.targetFile.blob,
    )
    const baseBytes = gitFile(historical.baseCommit, historical.baseFile)
    const targetBytes = gitFile(historical.targetCommit, historical.targetFile)
    assert.equal(baseBytes.toString('utf8').length, historical.baseFile.chars)
    assert.equal(targetBytes.toString('utf8').length, historical.targetFile.chars)
    await declaration(historical.baseFile, baseBytes)
    const targetDeclaration = await declaration(
      historical.targetFile,
      targetBytes,
    )

    const targetSource = targetBytes.toString('utf8')
    for (const insertion of fixture.sourceTransition.insertions) {
      const text = targetSource.slice(
        insertion.characterStart,
        insertion.characterEnd,
      )
      assert.equal(text, insertion.text)
      assert.deepEqual(descriptor(text), {
        bytes: insertion.bytes,
        sha256: insertion.sha256,
      })
      assert.deepEqual(
        [
          Buffer.byteLength(targetSource.slice(0, insertion.characterStart)),
          Buffer.byteLength(targetSource.slice(0, insertion.characterEnd)),
        ],
        [insertion.byteStart, insertion.byteEnd],
      )
      assert.equal(
        targetSource.indexOf(insertion.text, insertion.characterEnd),
        -1,
      )
    }
    let stripped = targetSource
    for (const insertion of [...fixture.sourceTransition.insertions].reverse()) {
      stripped =
        stripped.slice(0, insertion.characterStart) +
        stripped.slice(insertion.characterEnd)
    }
    assert.equal(fixture.sourceTransition.removalMatchesBaseFile, true)
    assert.deepEqual(Buffer.from(stripped), baseBytes)

    const ts = await loadTypeScript()
    const importMatches = targetDeclaration.sourceFile.statements.filter(
      node =>
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier.text === 'src/utils/envUtils.js' &&
        node.importClause?.namedBindings?.elements.some(
          element => element.name.text === 'isEnvTruthy',
        ),
    )
    assert.equal(importMatches.length, 1)
    const conditionTexts = []
    const visit = node => {
      if (ts.isIfStatement(node)) {
        conditionTexts.push(node.expression.getText(targetDeclaration.sourceFile))
      }
      ts.forEachChild(node, visit)
    }
    visit(targetDeclaration.node)
    assert.equal(
      conditionTexts.filter(
        text => text === 'isEnvTruthy(process.env.DISABLE_UPDATES)',
      ).length,
      1,
    )
    assert.equal(
      conditionTexts.filter(
        text => text === "homebrewCaskName !== 'claude-code@latest'",
      ).length,
      1,
    )

    const packagedPath = path.join(
      sourceRoot,
      historical.packagePostimage.path.replace(/^src\//, ''),
    )
    const packaged = fs.readFileSync(packagedPath)
    assert.deepEqual(descriptor(packaged), {
      bytes: historical.packagePostimage.bytes,
      sha256: historical.packagePostimage.sha256,
    })
    assert.equal(
      packaged.toString('utf8').length,
      historical.packagePostimage.chars,
    )
    assert.deepEqual(packaged, targetBytes)

    const coveragePath = path.join(
      root,
      'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
    )
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const coverageRow = coverage.rows.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(coverageRow)
    assert.deepEqual(
      {
        targetIndex: coverageRow.targetIndex,
        start: coverageRow.start,
        end: coverageRow.end,
        nodeType: coverageRow.nodeType,
        sourceHash: coverageRow.sourceHash,
        structuralClass: coverageRow.structuralClass,
        disposition: coverageRow.disposition,
      },
      {
        targetIndex: fixture.targetUnit.targetIndex,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        nodeType: fixture.targetUnit.nodeType,
        sourceHash: fixture.targetUnit.sourceHash,
        structuralClass: fixture.targetUnit.classification,
        disposition: 'source-runtime-covered',
      },
    )
    const ownerPaths = coverageRow.ownerIds.map(
      ownerId => coverage.owners.find(owner => owner.id === ownerId)?.path,
    )
    assert.deepEqual(ownerPaths, fixture.ownerOverride.paths)
    const provisional = {
      evidenceIds: ['source-map-attribution', 'semantic-test'],
      behavior:
        'Compiled target unit is attributed to src/cli/update.ts; its authored runtime owner and call path are present in the target semantic tree and current cumulative src/.',
    }
    const corrected = {
      evidenceIds: fixture.evidenceIds,
      behavior: fixture.targetUnit.behavior,
    }
    const state = {
      evidenceIds: coverageRow.evidenceIds,
      behavior: coverageRow.behavior,
    }
    const stateKey = JSON.stringify(state)
    assert.ok(
      [provisional, corrected].some(
        expected => JSON.stringify(expected) === stateKey,
      ),
      'coverage is exactly provisional or exactly corrected',
    )
    if (stateKey === JSON.stringify(corrected)) {
      assert.deepEqual(
        fixture.evidenceCatalog.map(expected => {
          const actual = coverage.evidence.find(row => row.id === expected.id)
          return actual
        }),
        fixture.evidenceCatalog,
      )
    }
  },
)
