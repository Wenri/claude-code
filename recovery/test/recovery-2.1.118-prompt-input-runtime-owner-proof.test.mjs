import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  parse,
  tokenizer,
} from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_PROMPT_INPUT_RUNTIME_EVIDENCE_IDS,
  TARGET118_PROMPT_INPUT_RUNTIME_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/prompt-input-runtime-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-prompt-input-runtime-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '7451ad77574bb70887f2131ed3e457ac3121fd1a21ee539663dfc949a78600d2'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return {
    bytes: Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function readGzipJson(relativePath) {
  return JSON.parse(gunzipSync(fs.readFileSync(path.join(root, relativePath))))
}

function readCoverage(input) {
  return readGzipJson(input.path)
}

function ownerPaths(coverage, row) {
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  return row.ownerIds.map(ownerId => owners.get(ownerId))
}

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walk(value, predicate, values)
    } else {
      walk(child, predicate, values)
    }
  }
  return values
}

function gitBytes(commit, input) {
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

function tokenValue(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'num' || token.type.label === 'string') {
    return `${token.type.label}:${JSON.stringify(token.value)}`
  }
  if (token.type.label === 'regexp') {
    return `regexp:/${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function normalizedTokens(unit) {
  const values = []
  const stream = tokenizer(unit.toString(), { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    values.push(token)
  }
  return {
    tokens: values,
    text: `${values.map(tokenValue).join('\n')}\n`,
  }
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

function parseSource(ts, input, sourcePath) {
  const kind = sourcePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    sourcePath,
    input,
    ts.ScriptTarget.Latest,
    true,
    kind,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, sourcePath)
  return sourceFile
}

function findDeclaration(ts, sourceFile, expected) {
  const matches = []
  const visit = node => {
    const named = node.name?.text === expected.name
    if (
      named &&
      ((expected.kind === 'FunctionDeclaration' &&
        ts.isFunctionDeclaration(node)) ||
        (expected.kind === 'TypeAliasDeclaration' &&
          ts.isTypeAliasDeclaration(node)))
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, expected.name)
  return matches[0]
}

const expectedNormalizedDiff = `--- baseline
+++ target
@@ -259 +259 @@
-string:"INSERT"
+string:"NORMAL"
@@ -7316,8 +7315,0 @@
-)
-)
-return
-;
-if
-(
-ID
-(
@@ -7343,2 +7334,0 @@
-,
-ID
@@ -7359,0 +7350 @@
+!/~
@@ -7363,4 +7353,0 @@
-?.
-ID
-==/!=/===/!==
-string:"ccr"
@@ -7414,0 +7402,25 @@
+.
+ID
+)
+ID
+(
+ID
+.
+ID
+)
+,
+ID
+.
+ID
+=
+null
+;
+if
+(
+ID
+(
+!/~
+num:1
+)
+,
+ID
@@ -11283 +11295,2 @@
-string:"inverseText"
+!/~
+num:0
@@ -11286,2 +11298,0 @@
-string:" "
-,
@@ -11291,2 +11301,0 @@
-,
-string:" "
`

test(
  'Target118 PromptInput fixture pins the complete owner override',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'authenticated-complete-unit-lineage-and-compiler-normalization-proof')
    assert.deepEqual(
      descriptor(
        fs.readFileSync(path.join(root, fixture.inputs.overrideModule.path)),
      ),
      {
        bytes: fixture.inputs.overrideModule.bytes,
        sha256: fixture.inputs.overrideModule.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_PROMPT_INPUT_RUNTIME_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET118_PROMPT_INPUT_RUNTIME_OWNER_OVERRIDES.map(row => ({
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
          paths: [fixture.targetUnit.ownerPath],
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior: fixture.targetUnit.behavior,
        },
      ],
    )
    assert.equal(fixture.summary.units, 1)
    assert.equal(fixture.summary.residues, fixture.targetUnit.residues.length)
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
    for (const input of Object.values(fixture.inputs.baselineOwnerProof)) {
      assert.deepEqual(descriptor(fs.readFileSync(path.join(root, input.path))), {
        bytes: input.bytes,
        sha256: input.sha256,
      })
    }
  },
)

test(
  'authenticated bundles pin the complete Target117 and Target118 PromptInput units',
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

    const structuralBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructural.path),
    )
    assert.deepEqual(descriptor(structuralBytes), {
      bytes: fixture.inputs.targetStructural.bytes,
      sha256: fixture.inputs.targetStructural.sha256,
    })
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const baseline = structural.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.targetIndex,
    )
    const target = structural.regions.find(
      row => row.target?.index === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(
      {
        ...baseline,
        bytes: baseline.end - baseline.start,
      },
      {
        index: fixture.baselineUnit.targetIndex,
        nodeType: fixture.baselineUnit.nodeType,
        parseStatus: 'parsed',
        start: fixture.baselineUnit.start,
        end: fixture.baselineUnit.end,
        tokenCount: fixture.baselineUnit.tokenCount,
        sourceHash: fixture.baselineUnit.sourceHash,
        coarseHash: fixture.baselineUnit.coarseHash,
        location: baseline.location,
        topDefinitionCount: 1,
        bytes: fixture.baselineUnit.bytes,
      },
    )
    assert.deepEqual(
      {
        classification: target.classification,
        index: target.target.index,
        nodeType: target.target.nodeType,
        parseStatus: target.target.parseStatus,
        start: target.target.start,
        end: target.target.end,
        tokenCount: target.target.tokenCount,
        sourceHash: target.target.sourceHash,
        coarseHash: target.target.coarseHash,
        bytes: target.target.end - target.target.start,
      },
      {
        classification: fixture.targetUnit.classification,
        index: fixture.targetUnit.targetIndex,
        nodeType: fixture.targetUnit.nodeType,
        parseStatus: 'parsed',
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sourceHash,
        coarseHash: fixture.targetUnit.coarseHash,
        bytes: fixture.targetUnit.bytes,
      },
    )

    for (const [bundle, unit] of [
      [baselineBundle, fixture.baselineUnit],
      [targetBundle, fixture.targetUnit],
    ]) {
      const value = bundle.subarray(unit.start, unit.end)
      assert.deepEqual(descriptor(value), {
        bytes: unit.bytes,
        sha256: unit.sourceHash,
      })
      const ast = parse(value.toString(), {
        ecmaVersion: 'latest',
        sourceType: 'script',
      })
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, unit.nodeType)
    }
    for (const row of fixture.targetUnit.residues) {
      assert.equal(
        targetBundle.subarray(row[2], row[3]).toString(),
        row[0] === 'string' ? JSON.stringify(row[1]) : row[1],
      )
    }
  },
)

test(
  'complete-unit normalization leaves exactly nine pinned compiler/source-transition hunks',
  { skip: !selected },
  t => {
    const baselineBundle = fs.readFileSync(baselineBundlePath)
    const targetBundle = fs.readFileSync(targetBundlePath)
    const baseline = normalizedTokens(
      baselineBundle.subarray(
        fixture.baselineUnit.start,
        fixture.baselineUnit.end,
      ),
    )
    const target = normalizedTokens(
      targetBundle.subarray(fixture.targetUnit.start, fixture.targetUnit.end),
    )
    assert.equal(baseline.tokens.length, fixture.normalizedUnitProof.baseline.tokens)
    assert.equal(target.tokens.length, fixture.normalizedUnitProof.target.tokens)
    assert.deepEqual(descriptor(baseline.text), {
      bytes: fixture.normalizedUnitProof.baseline.bytes,
      sha256: fixture.normalizedUnitProof.baseline.sha256,
    })
    assert.deepEqual(descriptor(target.text), {
      bytes: fixture.normalizedUnitProof.target.bytes,
      sha256: fixture.normalizedUnitProof.target.sha256,
    })

    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-prompt-input-normalized.'),
    )
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
    const baselinePath = path.join(temporary, 'baseline.tokens')
    const targetPath = path.join(temporary, 'target.tokens')
    fs.writeFileSync(baselinePath, baseline.text)
    fs.writeFileSync(targetPath, target.text)
    const result = spawnSync(
      'diff',
      [
        '--label',
        'baseline',
        '--label',
        'target',
        '-U',
        '0',
        baselinePath,
        targetPath,
      ],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 1)
    assert.equal(result.stderr, '')
    assert.equal(result.stdout, expectedNormalizedDiff)
    assert.deepEqual(descriptor(result.stdout), {
      bytes: fixture.normalizedUnitProof.diff.bytes,
      sha256: fixture.normalizedUnitProof.diff.sha256,
    })
    assert.equal(
      result.stdout.match(/^@@/gm)?.length,
      fixture.normalizedUnitProof.diff.hunks,
    )
  },
)

test(
  'historical source AST pins the PromptInput declaration and supporting Label contract',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    for (const version of ['baseline', 'target']) {
      const lineage = fixture.sourceLineage[version]
      const tree = spawnSync('git', ['rev-parse', `${lineage.commit}^{tree}`], {
        cwd: root,
        encoding: 'utf8',
      })
      assert.equal(tree.status, 0, tree.stderr)
      assert.equal(tree.stdout.trim(), lineage.tree)
      const blob = spawnSync(
        'git',
        ['rev-parse', `${lineage.commit}:${lineage.file.path}`],
        { cwd: root, encoding: 'utf8' },
      )
      assert.equal(blob.status, 0, blob.stderr)
      assert.equal(blob.stdout.trim(), lineage.file.blob)
      const bytes = gitBytes(lineage.commit, lineage.file)
      const source = bytes.toString('utf8')
      const sourceFile = parseSource(ts, source, lineage.file.path)
      const declaration = findDeclaration(
        ts,
        sourceFile,
        lineage.file.declaration,
      )
      const expected = lineage.file.declaration
      assert.equal(declaration.getStart(sourceFile), expected.characterStart)
      assert.equal(declaration.end, expected.characterEnd)
      assert.equal(
        Buffer.byteLength(source.slice(0, declaration.getStart(sourceFile))),
        expected.byteStart,
      )
      assert.equal(
        Buffer.byteLength(source.slice(0, declaration.end)),
        expected.byteEnd,
      )
      assert.deepEqual(descriptor(declaration.getText(sourceFile)), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      if (version === 'target') {
        const live = fs.readFileSync(
          path.join(sourceRoot, lineage.file.path.replace(/^src\//, '')),
        )
        assert.deepEqual(live, bytes)
      }
    }

    const target = fixture.sourceLineage.target
    for (const input of target.supporting ?? fixture.sourceLineage.supporting) {
      const blob = spawnSync(
        'git',
        ['rev-parse', `${target.commit}:${input.path}`],
        { cwd: root, encoding: 'utf8' },
      )
      assert.equal(blob.status, 0, blob.stderr)
      assert.equal(blob.stdout.trim(), input.blob)
      const bytes = gitBytes(target.commit, input)
      assert.deepEqual(
        fs.readFileSync(path.join(sourceRoot, input.path.replace(/^src\//, ''))),
        bytes,
      )
      const source = bytes.toString('utf8')
      const sourceFile = parseSource(ts, source, input.path)
      const declaration = findDeclaration(ts, sourceFile, input.declaration)
      assert.equal(
        declaration.getStart(sourceFile),
        input.declaration.characterStart,
      )
      assert.equal(declaration.end, input.declaration.characterEnd)
      assert.deepEqual(descriptor(declaration.getText(sourceFile)), {
        bytes: input.declaration.bytes,
        sha256: input.declaration.sha256,
      })
    }

    const diff = spawnSync('git', target.diff.args, {
      cwd: root,
      encoding: null,
    })
    assert.equal(diff.status, 0, diff.stderr?.toString())
    assert.deepEqual(descriptor(diff.stdout), {
      bytes: target.diff.bytes,
      sha256: target.diff.sha256,
    })
    const numstat = spawnSync(
      'git',
      [
        'diff',
        '--numstat',
        fixture.sourceLineage.baseline.commit,
        target.commit,
        '--',
        target.file.path,
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(numstat.status, 0, numstat.stderr)
    assert.equal(
      numstat.stdout,
      `${target.diff.insertions}\t${target.diff.deletions}\t${target.file.path}\n`,
    )
  },
)

test(
  'compiled Vim/input/Label forms are bound to retained contexts, not incidental text',
  { skip: !selected },
  () => {
    const baselineBundle = fs.readFileSync(baselineBundlePath)
    const targetBundle = fs.readFileSync(targetBundlePath)
    const baselineUnit = baselineBundle.subarray(
      fixture.baselineUnit.start,
      fixture.baselineUnit.end,
    )
    const targetUnit = targetBundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    const baselineNormalized = normalizedTokens(baselineUnit)
    const targetNormalized = normalizedTokens(targetUnit)
    const withAbsolutePositions = (normalized, start) =>
      normalized.tokens.map(token => ({
        ...token,
        start: token.start + start,
        end: token.end + start,
      }))
    const baselineTokens = withAbsolutePositions(
      baselineNormalized,
      fixture.baselineUnit.start,
    )
    const targetTokens = withAbsolutePositions(
      targetNormalized,
      fixture.targetUnit.start,
    )

    const overlay = fixture.semanticRepresentations.vimOverlayPolarity
    assert.equal(
      baselineBundle.subarray(overlay.baseline.start, overlay.baseline.end).toString(),
      overlay.baseline.text,
    )
    assert.equal(
      targetBundle.subarray(overlay.target.start, overlay.target.end).toString(),
      overlay.target.text,
    )
    for (const mode of overlay.compiledModes) {
      assert.equal(mode === 'INSERT', mode !== 'NORMAL')
    }
    const literalValues = value =>
      walk(
        parse(value.toString(), { ecmaVersion: 'latest' }),
        node => node.type === 'Literal',
      ).map(node => node.value)
    for (const values of [literalValues(baselineUnit), literalValues(targetUnit)]) {
      assert.equal(values.includes('VISUAL'), false)
      assert.equal(values.includes('VISUAL LINE'), false)
      assert(values.includes('INSERT'))
      assert(values.includes('NORMAL'))
    }

    for (const pair of fixture.semanticRepresentations.retainedInputHandler) {
      assert.equal(
        baselineBundle.subarray(pair.baseline.start, pair.baseline.end).toString(),
        pair.target[0] === 'string'
          ? JSON.stringify(pair.target[1])
          : pair.target[1],
      )
      assert.equal(
        targetBundle.subarray(pair.target[2], pair.target[3]).toString(),
        pair.target[0] === 'string'
          ? JSON.stringify(pair.target[1])
          : pair.target[1],
      )
      const baselineIndex = baselineTokens.findIndex(
        token =>
          token.start === pair.baseline.start && token.end === pair.baseline.end,
      )
      const targetIndex = targetTokens.findIndex(
        token => token.start === pair.target[2] && token.end === pair.target[3],
      )
      assert(baselineIndex >= 8, pair.target[1])
      assert(targetIndex >= 8, pair.target[1])
      assert.deepEqual(
        baselineTokens
          .slice(baselineIndex - 8, baselineIndex + 9)
          .map(tokenValue),
        targetTokens
          .slice(targetIndex - 8, targetIndex + 9)
          .map(tokenValue),
      )
    }

    const padded = fixture.semanticRepresentations.paddedLabel
    assert.equal(
      baselineBundle.subarray(padded.baseline.start, padded.baseline.end).toString(),
      padded.baseline.text,
    )
    assert.equal(
      targetBundle.subarray(padded.target.start, padded.target.end).toString(),
      padded.target.text,
    )
    const label = gitBytes(
      fixture.sourceLineage.target.commit,
      fixture.sourceLineage.supporting[0],
    ).toString('utf8')
    for (const marker of [
      "const padding = padded ? ' ' : ''",
      "const foreground = textColor ?? (color ? 'inverseText' : undefined)",
      '{padding}\n      {children}\n      {padding}',
    ]) {
      assert(label.includes(marker), marker)
    }
    const baselineRender = (color, text) => ({
      backgroundColor: color,
      color: 'inverseText',
      children: ` ${text} `,
    })
    const labelRender = (color, text) => ({
      backgroundColor: color,
      color: color ? 'inverseText' : undefined,
      children: ` ${text} `,
    })
    for (const color of ['claude', 'red', '#123456']) {
      assert.deepEqual(labelRender(color, 'banner'), baselineRender(color, 'banner'))
    }
  },
)

test(
  'PromptInput coverage accepts only the pinned provisional or corrected atomic state',
  { skip: !selected },
  () => {
    const baselineCoverageBytes = fs.readFileSync(
      path.join(root, fixture.inputs.baselineCoverage.path),
    )
    assert.deepEqual(descriptor(baselineCoverageBytes), {
      bytes: fixture.inputs.baselineCoverage.bytes,
      sha256: fixture.inputs.baselineCoverage.sha256,
    })
    const baselineCoverage = JSON.parse(gunzipSync(baselineCoverageBytes))
    const baselineRow = baselineCoverage.rows.find(
      row => row.targetIndex === fixture.baselineUnit.targetIndex,
    )
    assert(baselineRow)
    assert.equal(baselineRow.sourceHash, fixture.baselineUnit.sourceHash)
    assert.deepEqual(ownerPaths(baselineCoverage, baselineRow), [
      fixture.targetUnit.ownerPath,
    ])
    assert.deepEqual(baselineRow.evidenceIds, [
      'target117-retained-fullscreen-target-fragments',
      'target117-retained-fullscreen-source-replay-test',
    ])
    const largePromptInputRows = baselineCoverage.rows.filter(
      row =>
        ownerPaths(baselineCoverage, row).includes(fixture.targetUnit.ownerPath) &&
        row.nodeType === fixture.baselineUnit.nodeType &&
        row.end - row.start > 20_000,
    )
    assert.deepEqual(
      largePromptInputRows.map(row => row.targetIndex),
      [fixture.baselineUnit.targetIndex],
    )

    const targetCoverageBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetCoverage.path),
    )
    const targetCoverage = JSON.parse(gunzipSync(targetCoverageBytes))
    const targetRow = targetCoverage.rows.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert(targetRow)
    assert.deepEqual(
      {
        start: targetRow.start,
        end: targetRow.end,
        nodeType: targetRow.nodeType,
        sourceHash: targetRow.sourceHash,
        structuralClass: targetRow.structuralClass,
        disposition: targetRow.disposition,
        paths: ownerPaths(targetCoverage, targetRow),
      },
      {
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        nodeType: fixture.targetUnit.nodeType,
        sourceHash: fixture.targetUnit.sourceHash,
        structuralClass: fixture.targetUnit.classification,
        disposition: 'source-runtime-covered',
        paths: [fixture.targetUnit.ownerPath],
      },
    )
    const targetCoverageDescriptor = descriptor(targetCoverageBytes)
    const provisional =
      JSON.stringify(targetCoverageDescriptor) ===
        JSON.stringify({
          bytes: fixture.inputs.targetCoverage.bytes,
          sha256: fixture.inputs.targetCoverage.sha256,
        }) &&
      JSON.stringify(targetRow.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(targetRow.evidenceIds) ===
        JSON.stringify(fixture.evidenceIds) &&
      targetRow.behavior === fixture.targetUnit.behavior
    assert.ok(provisional || corrected)

    const ownerAnalysisBytes = fs.readFileSync(
      path.join(root, fixture.inputs.ownerAnalysis.path),
    )
    assert.deepEqual(descriptor(ownerAnalysisBytes), {
      bytes: fixture.inputs.ownerAnalysis.bytes,
      sha256: fixture.inputs.ownerAnalysis.sha256,
    })
    const ownerAnalysis = JSON.parse(ownerAnalysisBytes)
    const sourceGap = ownerAnalysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert(sourceGap)
    assert.equal(sourceGap.residues, fixture.summary.residues)
    assert.equal(sourceGap.unsupportedResidues, fixture.summary.residues)
    assert.equal(
      sourceGap.residueIdentitiesSha256,
      fixture.summary.residueIdentitiesSha256,
    )
    assert.deepEqual(sourceGap.ownerPaths, [
      fixture.targetUnit.ownerPath.replace(/^src\//, ''),
    ])
    assert(sourceGap.rowScopedEvidence.sourcePaths.includes(fixture.targetUnit.ownerPath))
  },
)
