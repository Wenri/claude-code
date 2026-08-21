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
  TARGET118_LOAD_INITIAL_MESSAGES_INHERITED_EVIDENCE_IDS,
  TARGET118_LOAD_INITIAL_MESSAGES_INHERITED_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/load-initial-messages-inherited-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-load-initial-messages-inherited-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'd68ccca0aee0e90a9b8d41b89c44ecccdd72c1a840ce875b60662fb995dae7ac'
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

function tokens(source, offset) {
  const output = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    output.push({
      canonical: canonicalToken(token),
      raw: source.slice(token.start, token.end),
      start: offset + token.start,
      end: offset + token.end,
    })
  }
  return output
}

function targetSubsequence(target, baseline) {
  const targetToBaseline = []
  const baselineOnly = []
  let targetIndex = 0
  for (
    let baselineIndex = 0;
    baselineIndex < baseline.length;
    baselineIndex += 1
  ) {
    if (
      targetIndex < target.length &&
      target[targetIndex].canonical === baseline[baselineIndex].canonical
    ) {
      targetToBaseline[targetIndex] = baselineIndex
      targetIndex += 1
    } else {
      baselineOnly.push([
        baselineIndex,
        baseline[baselineIndex].canonical,
        baseline[baselineIndex].raw,
        baseline[baselineIndex].start,
        baseline[baselineIndex].end,
      ])
    }
  }
  return { matchedTargetTokens: targetIndex, baselineOnly, targetToBaseline }
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

async function readDeclaration(input, bytes, pinOffsets = true) {
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
  const matches = []
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === input.declaration.name
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  const characterStart = declaration.getStart(sourceFile)
  const characterEnd = declaration.end
  const byteStart = Buffer.byteLength(source.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(source.slice(0, characterEnd))
  if (pinOffsets) {
    assert.deepEqual(
      { characterStart, characterEnd, byteStart, byteEnd },
      {
        characterStart: input.declaration.characterStart,
        characterEnd: input.declaration.characterEnd,
        byteStart: input.declaration.byteStart,
        byteEnd: input.declaration.byteEnd,
      },
    )
  }
  const declarationBytes = bytes.subarray(byteStart, byteEnd)
  assert.deepEqual(descriptor(declarationBytes), {
    bytes: input.declaration.bytes,
    sha256: input.declaration.sha256,
  })
  return declarationBytes
}

test(
  'Target118 loadInitialMessages fixture and override are frozen',
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
      TARGET118_LOAD_INITIAL_MESSAGES_INHERITED_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET118_LOAD_INITIAL_MESSAGES_INHERITED_OWNER_OVERRIDES.map(row => ({
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
  },
)

test(
  'complete Target118 tokens are the exact Target117 deletion subsequence',
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
    const baselineTokens = tokens(
      baselineBytes.toString(),
      fixture.baselineUnit.start,
    )
    const targetTokens = tokens(targetBytes.toString(), fixture.targetUnit.start)
    for (const [actual, expected] of [
      [baselineTokens, fixture.canonicalTokenProof.baseline],
      [targetTokens, fixture.canonicalTokenProof.target],
    ]) {
      const canonical = actual.map(row => row.canonical)
      assert.deepEqual(descriptor(Buffer.from(JSON.stringify(canonical))), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      assert.equal(actual.length, expected.tokens)
    }
    const alignment = targetSubsequence(targetTokens, baselineTokens)
    assert.equal(
      alignment.matchedTargetTokens,
      fixture.canonicalTokenProof.matchedTargetTokens,
    )
    assert.equal(alignment.matchedTargetTokens, targetTokens.length)
    assert.deepEqual(
      alignment.baselineOnly,
      fixture.canonicalTokenProof.baselineOnlyTokens,
    )

    const targetLedger = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
    )
    const targetRegion = [
      ...targetLedger.regions,
      ...targetLedger.unresolvedTarget,
    ].find(row => row.target.index === fixture.targetUnit.targetIndex)
    assert.ok(targetRegion)
    assert.equal(targetRegion.classification, fixture.targetUnit.classification)
    assert.equal(targetRegion.target.start, fixture.targetUnit.start)
    assert.equal(targetRegion.target.end, fixture.targetUnit.end)
    assert.equal(targetRegion.target.tokenCount, fixture.targetUnit.tokenCount)
    assert.equal(targetRegion.target.sourceHash, fixture.targetUnit.sourceHash)
    assert.equal(targetRegion.target.coarseHash, fixture.targetUnit.coarseHash)

    const baselineLedger = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.baselineStructuralLedger)),
    )
    const baselineRegion = [
      ...baselineLedger.regions,
      ...baselineLedger.unresolvedTarget,
    ].find(row => row.target.index === fixture.baselineUnit.targetIndex)
    assert.ok(baselineRegion)
    assert.equal(
      baselineRegion.classification,
      fixture.baselineUnit.classification,
    )
    assert.equal(
      baselineRegion.baselineUnitIndex,
      fixture.baselineUnit.baselineUnitIndex,
    )
    assert.equal(baselineRegion.pairReason, fixture.baselineUnit.pairReason)
    assert.equal(baselineRegion.target.start, fixture.baselineUnit.start)
    assert.equal(baselineRegion.target.end, fixture.baselineUnit.end)
    assert.equal(baselineRegion.target.tokenCount, fixture.baselineUnit.tokenCount)
    assert.equal(baselineRegion.target.sourceHash, fixture.baselineUnit.sourceHash)
    assert.equal(baselineRegion.target.coarseHash, fixture.baselineUnit.coarseHash)
  },
)

test(
  'all four strict rows map to exact inherited predecessor contexts',
  { skip: !selected },
  () => {
    const baselineBundle = fs.readFileSync(baselineBundlePath)
    const targetBundle = fs.readFileSync(targetBundlePath)
    const baselineTokens = tokens(
      baselineBundle
        .subarray(fixture.baselineUnit.start, fixture.baselineUnit.end)
        .toString(),
      fixture.baselineUnit.start,
    )
    const targetTokens = tokens(
      targetBundle
        .subarray(fixture.targetUnit.start, fixture.targetUnit.end)
        .toString(),
      fixture.targetUnit.start,
    )
    const alignment = targetSubsequence(targetTokens, baselineTokens)
    assert.equal(
      fixture.canonicalTokenProof.residuePredecessors.length,
      fixture.targetUnit.residues.length,
    )
    for (let index = 0; index < fixture.targetUnit.residues.length; index += 1) {
      const residue = fixture.targetUnit.residues[index]
      const predecessor = fixture.canonicalTokenProof.residuePredecessors[index]
      const [targetIndex, baselineIndex, baselineStart, baselineEnd, raw, radius, contextSha256] = predecessor
      const targetToken = targetTokens[targetIndex]
      const baselineToken = baselineTokens[baselineIndex]
      assert.deepEqual([targetToken.start, targetToken.end], residue.slice(2, 4))
      assert.equal(alignment.targetToBaseline[targetIndex], baselineIndex)
      assert.deepEqual(
        [baselineToken.start, baselineToken.end, baselineToken.raw],
        [baselineStart, baselineEnd, raw],
      )
      assert.equal(targetToken.raw, raw)
      const baselineContext = baselineTokens
        .slice(baselineIndex - radius, baselineIndex + radius + 1)
        .map(row => row.canonical)
      const targetContext = targetTokens
        .slice(targetIndex - radius, targetIndex + radius + 1)
        .map(row => row.canonical)
      assert.deepEqual(targetContext, baselineContext)
      assert.equal(digest(targetContext), contextSha256)
      assert.equal(
        targetBundle.subarray(residue[2], residue[3]).toString(),
        residue[1],
      )
    }
    const analysis = JSON.parse(readPinned(fixture.inputs.ownerAnalysis))
    const mapping = analysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(mapping)
    assert.deepEqual(mapping.ownerPaths, ['cli/print.ts'])
    assert.equal(mapping.residues, fixture.summary.residues)
    assert.equal(
      mapping.residueIdentitiesSha256,
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'historical and packaged source pin the byte-identical owner declaration',
  { skip: !selected },
  async () => {
    const historical = fixture.inputs.historicalSource
    const baseBytes = gitFile(historical.baseCommit, historical.baseFile)
    const targetBytes = gitFile(historical.targetCommit, historical.targetFile)
    const packagedBytes = fs.readFileSync(
      path.join(sourceRoot, historical.targetFile.path.replace(/^src\//, '')),
    )
    const baseDeclaration = await readDeclaration(
      historical.baseFile,
      baseBytes,
    )
    const targetDeclaration = await readDeclaration(
      historical.targetFile,
      targetBytes,
    )
    const packagedDeclaration = await readDeclaration(
      historical.targetFile,
      packagedBytes,
      false,
    )
    assert.equal(baseDeclaration.equals(targetDeclaration), true)
    assert.equal(targetDeclaration.equals(packagedDeclaration), true)
    assert.equal(
      fixture.sourceOwnerProof.packageEnvelopeMode,
      'exact-declaration-after-unrelated-case-supplements',
    )
    assert.equal(fixture.sourceOwnerProof.sourceReplayHelper, null)

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
    assert.deepEqual(row.ownerIds, ['owner-src-cli-print-ts'])
    assert.ok(
      [
        ['source-map-attribution', 'semantic-test'],
        fixture.ownerOverride.evidenceIds,
      ].some(ids => JSON.stringify(ids) === JSON.stringify(row.evidenceIds)),
    )
  },
)
