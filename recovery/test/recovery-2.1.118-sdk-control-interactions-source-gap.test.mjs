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
  applyTarget118SdkControlInteractionsSourceRecovery,
  TARGET118_SDK_CONTROL_INTERACTIONS_EVIDENCE_IDS,
  TARGET118_SDK_CONTROL_INTERACTIONS_INPUT_FILE,
  TARGET118_SDK_CONTROL_INTERACTIONS_OUTPUT_FILE,
  TARGET118_SDK_CONTROL_INTERACTIONS_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-sdk-control-interactions-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-sdk-control-interactions-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '2a55cb995a3141ea2b95d16ef78c0334d9ea6b508dd190bcedc68614cfc99e1a'
const baselineBundlePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_117_BUNDLE ??
    path.join(
      root,
      '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js',
    ),
)
const targetBundlePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
    path.join(
      root,
      '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
    ),
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

function canonicalDigest(value) {
  return sha256(Buffer.from(JSON.stringify(value)))
}

function readPinnedFile(input) {
  const bytes = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
}

function artifact(input, filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
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
  assert.equal(
    spawnSync('git', ['rev-parse', `${commit}:${input.path}`], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim(),
    input.blob,
  )
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

function normalizedTokens(bytes, absoluteStart = 0) {
  const values = []
  const stream = tokenizer(bytes.toString(), { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    values.push({
      ...token,
      absoluteStart: token.start + absoluteStart,
      absoluteEnd: token.end + absoluteStart,
    })
  }
  return {
    tokens: values,
    text: `${values.map(tokenValue).join('\n')}\n`,
  }
}

function matchingWindows(tokens, expected, radius) {
  let count = 0
  for (let index = radius; index < tokens.length - radius; index += 1) {
    const actual = tokens
      .slice(index - radius, index + radius + 1)
      .map(tokenValue)
    if (JSON.stringify(actual) === JSON.stringify(expected)) count += 1
  }
  return count
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

function parseSource(ts, bytes, sourcePath) {
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, sourcePath)
  return { source, sourceFile }
}

function findVariables(ts, sourceFile, name) {
  const matches = []
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name?.text === name) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return matches
}

function pinVariable(ts, source, sourceFile, expected) {
  const matches = findVariables(ts, sourceFile, expected.name)
  assert.equal(matches.length, 1, expected.name)
  const declaration = matches[0]
  const characterStart = declaration.getStart(sourceFile)
  const characterEnd = declaration.end
  const byteStart = Buffer.byteLength(source.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(source.slice(0, characterEnd))
  assert.deepEqual(
    {
      name: declaration.name.text,
      kind: 'VariableDeclaration',
      characterStart,
      characterEnd,
      byteStart,
      byteEnd,
      ...descriptor(Buffer.from(source).subarray(byteStart, byteEnd)),
    },
    expected,
  )
  return declaration
}

function walk(ts, node, predicate, matches = []) {
  if (predicate(node)) matches.push(node)
  ts.forEachChild(node, child => {
    walk(ts, child, predicate, matches)
  })
  return matches
}

function objectContract(ts, declaration) {
  const calls = walk(
    ts,
    declaration,
    node =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'object' &&
      node.arguments.length === 1 &&
      ts.isObjectLiteralExpression(node.arguments[0]),
  )
  assert.equal(calls.length, 1, declaration.name.text)
  const object = calls[0].arguments[0]
  return object.properties.map(property => {
    assert(
      ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property),
      declaration.name.text,
    )
    if (ts.isIdentifier(property.name)) return property.name.text
    if (ts.isStringLiteral(property.name)) return property.name.text
    assert.fail(`${declaration.name.text}: unsupported property name`)
  })
}

function stringLiterals(ts, declaration) {
  return walk(ts, declaration, node => ts.isStringLiteral(node)).map(
    node => node.text,
  )
}

function requestUnionBranches(ts, declaration) {
  const calls = walk(
    ts,
    declaration,
    node =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'union' &&
      node.arguments.length === 1 &&
      ts.isArrayLiteralExpression(node.arguments[0]),
  )
  assert.equal(calls.length, 1, declaration.name.text)
  return calls[0].arguments[0].elements.map(element => {
    assert(ts.isCallExpression(element), declaration.name.text)
    assert(ts.isIdentifier(element.expression), declaration.name.text)
    assert.equal(element.arguments.length, 0, declaration.name.text)
    return element.expression.text
  })
}

function sourceFilename(sourceRootPath) {
  return path.join(
    sourceRootPath,
    fixture.sourceReplay.input.path.replace(/^src\//, ''),
  )
}

function sourceState(sourceRootPath) {
  const actual = descriptor(fs.readFileSync(sourceFilename(sourceRootPath)))
  for (const state of ['input', 'output']) {
    const expected = fixture.sourceReplay[state]
    if (
      actual.bytes === expected.bytes &&
      actual.sha256 === expected.sha256
    ) {
      return state
    }
  }
  assert.fail(
    `configured SDK control source is not an exact pre/postimage: ` +
      `${actual.bytes}/${actual.sha256}`,
  )
}

test(
  'Target118 SDK-control fixture pins one complete unit and one atomic replay',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'authenticated-inherited-complete-unit-source-gap-replay',
    )
    assert.deepEqual(descriptor(readPinnedFile(fixture.inputs.helper)), {
      bytes: fixture.inputs.helper.bytes,
      sha256: fixture.inputs.helper.sha256,
    })
    assert.deepEqual(
      TARGET118_SDK_CONTROL_INTERACTIONS_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET118_SDK_CONTROL_INTERACTIONS_INPUT_FILE, {
      path: fixture.sourceReplay.input.path,
      bytes: fixture.sourceReplay.input.bytes,
      sha256: fixture.sourceReplay.input.sha256,
    })
    assert.deepEqual(TARGET118_SDK_CONTROL_INTERACTIONS_OUTPUT_FILE, {
      path: fixture.sourceReplay.output.path,
      bytes: fixture.sourceReplay.output.bytes,
      sha256: fixture.sourceReplay.output.sha256,
    })
    assert.deepEqual(
      TARGET118_SDK_CONTROL_INTERACTIONS_OWNER_OVERRIDES.map(row => ({
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
      canonicalDigest([fixture.targetUnit.targetIndex]),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      canonicalDigest(
        fixture.targetUnit.residues.map(row => [
          fixture.targetUnit.targetIndex,
          ...row,
        ]),
      ),
      fixture.summary.residueIdentitiesSha256,
    )

    const analysis = JSON.parse(readPinnedFile(fixture.inputs.ownerAnalysis))
    const sourceGap = analysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(sourceGap, fixture.ownerAnalysisSnapshot)
  },
)

test(
  'authenticated Target117 and Target118 units retain every SDK interaction residue in unique contexts',
  { skip: !selected },
  () => {
    const baselineBundle = artifact(
      fixture.inputs.baselineBundle,
      baselineBundlePath,
    )
    const targetBundle = artifact(fixture.inputs.targetBundle, targetBundlePath)
    const structuralBytes = readPinnedFile(fixture.inputs.targetStructural)
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const baseline = structural.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.targetIndex,
    )
    const target = structural.regions.find(
      row => row.target?.index === fixture.targetUnit.targetIndex,
    )
    assert(baseline)
    assert(target)
    assert.deepEqual(
      {
        targetIndex: baseline.index,
        nodeType: baseline.nodeType,
        start: baseline.start,
        end: baseline.end,
        bytes: baseline.end - baseline.start,
        tokenCount: baseline.tokenCount,
        sourceHash: baseline.sourceHash,
        coarseHash: baseline.coarseHash,
      },
      fixture.baselineUnit,
    )
    assert.deepEqual(
      {
        targetIndex: target.target.index,
        classification: target.classification,
        nodeType: target.target.nodeType,
        start: target.target.start,
        end: target.target.end,
        bytes: target.target.end - target.target.start,
        tokenCount: target.target.tokenCount,
        sourceHash: target.target.sourceHash,
        coarseHash: target.target.coarseHash,
      },
      Object.fromEntries(
        Object.entries(fixture.targetUnit).filter(([key]) =>
          [
            'targetIndex',
            'classification',
            'nodeType',
            'start',
            'end',
            'bytes',
            'tokenCount',
            'sourceHash',
            'coarseHash',
          ].includes(key),
        ),
      ),
    )

    const baselineUnit = baselineBundle.subarray(
      fixture.baselineUnit.start,
      fixture.baselineUnit.end,
    )
    const targetUnit = targetBundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    for (const [bytes, unit] of [
      [baselineUnit, fixture.baselineUnit],
      [targetUnit, fixture.targetUnit],
    ]) {
      assert.deepEqual(descriptor(bytes), {
        bytes: unit.bytes,
        sha256: unit.sourceHash,
      })
      const ast = parse(bytes.toString(), {
        ecmaVersion: 'latest',
        sourceType: 'script',
      })
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, unit.nodeType)
    }

    const baselineTokens = normalizedTokens(
      baselineUnit,
      fixture.baselineUnit.start,
    ).tokens
    const targetTokens = normalizedTokens(
      targetUnit,
      fixture.targetUnit.start,
    ).tokens
    assert.equal(
      fixture.retainedResidueContexts.length,
      fixture.targetUnit.residues.length,
    )
    for (const context of fixture.retainedResidueContexts) {
      assert(fixture.targetUnit.residues.some(row =>
        JSON.stringify(row) === JSON.stringify(context.targetResidue)))
      const [kind, value, start, end] = context.targetResidue
      assert.equal(
        targetBundle.subarray(start, end).toString(),
        kind === 'string' ? JSON.stringify(value) : value,
      )
      assert.equal(
        baselineBundle
          .subarray(context.baseline.start, context.baseline.end)
          .toString(),
        kind === 'string' ? JSON.stringify(value) : value,
      )
      const baselineToken = baselineTokens[context.baseline.tokenIndex]
      const targetToken = targetTokens[context.targetTokenIndex]
      assert.deepEqual(
        [baselineToken.absoluteStart, baselineToken.absoluteEnd],
        [context.baseline.start, context.baseline.end],
      )
      assert.deepEqual(
        [targetToken.absoluteStart, targetToken.absoluteEnd],
        [start, end],
      )
      assert.equal(tokenValue(baselineToken), tokenValue(targetToken))
      for (const proof of context.radiusProofs) {
        const targetWindow = targetTokens
          .slice(
            context.targetTokenIndex - proof.radius,
            context.targetTokenIndex + proof.radius + 1,
          )
          .map(tokenValue)
        const baselineWindow = baselineTokens
          .slice(
            context.baseline.tokenIndex - proof.radius,
            context.baseline.tokenIndex + proof.radius + 1,
          )
          .map(tokenValue)
        assert.deepEqual(targetWindow, baselineWindow)
        assert.equal(canonicalDigest(targetWindow), proof.sha256)
        assert.equal(
          matchingWindows(targetTokens, targetWindow, proof.radius),
          1,
        )
        assert.equal(
          matchingWindows(baselineTokens, baselineWindow, proof.radius),
          1,
        )
      }
    }
  },
)

test(
  'complete-unit and raw-source diffs prove the interactions are inherited source gaps',
  { skip: !selected },
  async t => {
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
      path.join(os.tmpdir(), 'target118-sdk-control-unit-diff.'),
    )
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
    const baselinePath = path.join(temporary, 'baseline.tokens')
    const targetPath = path.join(temporary, 'target.tokens')
    fs.writeFileSync(baselinePath, baseline.text)
    fs.writeFileSync(targetPath, target.text)
    const unitDiff = spawnSync(
      'diff',
      [
        '--label',
        'baseline',
        '--label',
        'target',
        '-U1',
        baselinePath,
        targetPath,
      ],
      { encoding: 'utf8' },
    )
    assert.equal(unitDiff.status, 1)
    assert.equal(unitDiff.stderr, '')
    assert.deepEqual(descriptor(unitDiff.stdout), {
      bytes: fixture.normalizedUnitProof.diff.bytes,
      sha256: fixture.normalizedUnitProof.diff.sha256,
    })
    assert.equal(
      unitDiff.stdout.match(/^@@/gm)?.length,
      fixture.normalizedUnitProof.diff.hunks,
    )
    for (const retainedLiteral of [
      'mcp_call',
      'request_user_dialog',
      'message_rated',
      'cancelled',
      'tool_use',
      'assistant_text',
    ]) {
      assert.equal(unitDiff.stdout.includes(retainedLiteral), false)
    }

    const ts = await loadTypeScript()
    for (const lineage of [
      fixture.sourceLineage.baseline,
      fixture.sourceLineage.target,
    ]) {
      assert.equal(
        spawnSync('git', ['rev-parse', `${lineage.commit}^{tree}`], {
          cwd: root,
          encoding: 'utf8',
        }).stdout.trim(),
        lineage.tree,
      )
      const bytes = gitBytes(lineage.commit, lineage.file)
      const { source, sourceFile } = parseSource(
        ts,
        bytes,
        lineage.file.path,
      )
      pinVariable(
        ts,
        source,
        sourceFile,
        lineage.file.requestInnerDeclaration,
      )
      for (const name of fixture.targetUnit.declarations.slice(0, -1)) {
        assert.equal(findVariables(ts, sourceFile, name).length, 0, name)
      }
    }

    const sourceDiff = spawnSync('git', fixture.sourceLineage.target.diff.args, {
      cwd: root,
      encoding: null,
    })
    assert.equal(sourceDiff.status, 0, sourceDiff.stderr?.toString())
    assert.deepEqual(descriptor(sourceDiff.stdout), {
      bytes: fixture.sourceLineage.target.diff.bytes,
      sha256: fixture.sourceLineage.target.diff.sha256,
    })
    const sourceDiffText = sourceDiff.stdout.toString()
    for (const name of fixture.targetUnit.declarations.slice(0, -1)) {
      assert.equal(sourceDiffText.includes(name), false, name)
    }
    const numstat = spawnSync(
      'git',
      [
        'diff',
        '--numstat',
        fixture.sourceLineage.baseline.commit,
        fixture.sourceLineage.target.commit,
        '--',
        fixture.sourceLineage.target.file.path,
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(numstat.status, 0, numstat.stderr)
    assert.equal(
      numstat.stdout,
      `${fixture.sourceLineage.target.diff.insertions}\t` +
        `${fixture.sourceLineage.target.diff.deletions}\t` +
        `${fixture.sourceLineage.target.file.path}\n`,
    )
  },
)

test(
  'bounded replay restores exact donor declarations and all request-union branches',
  { skip: !selected },
  async t => {
    const ts = await loadTypeScript()
    const donorDeclarations = new Map()
    for (const donor of fixture.recoveredDonors) {
      assert.equal(
        spawnSync('git', ['rev-parse', `${donor.commit}^{tree}`], {
          cwd: root,
          encoding: 'utf8',
        }).stdout.trim(),
        donor.tree,
      )
      const bytes = gitBytes(donor.commit, donor.file)
      const { source, sourceFile } = parseSource(ts, bytes, donor.file.path)
      for (const expected of donor.declarations) {
        pinVariable(ts, source, sourceFile, expected)
        assert.equal(donorDeclarations.has(expected.name), false, expected.name)
        donorDeclarations.set(expected.name, expected)
      }
    }
    assert.equal(
      spawnSync(
        'git',
        [
          'merge-base',
          '--is-ancestor',
          fixture.recoveredDonors[0].commit,
          fixture.recoveredDonors[1].commit,
        ],
        { cwd: root },
      ).status,
      0,
    )

    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-sdk-control-replay.'),
    )
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
    const filename = sourceFilename(temporary)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    const raw = gitBytes(
      fixture.sourceLineage.target.commit,
      fixture.sourceLineage.target.file,
    )
    fs.writeFileSync(filename, raw)
    assert.deepEqual(
      applyTarget118SdkControlInteractionsSourceRecovery({
        sourceRoot: temporary,
      }),
      { changed: true, path: fixture.sourceReplay.output.path },
    )
    const output = fs.readFileSync(filename)
    assert.deepEqual(descriptor(output), {
      bytes: fixture.sourceReplay.output.bytes,
      sha256: fixture.sourceReplay.output.sha256,
    })
    assert.deepEqual(
      applyTarget118SdkControlInteractionsSourceRecovery({
        sourceRoot: temporary,
      }),
      { changed: false, path: fixture.sourceReplay.output.path },
    )

    const parsed = parseSource(ts, output, fixture.sourceReplay.output.path)
    const declarations = new Map()
    for (const expected of fixture.sourceReplay.output.declarations) {
      const declaration = pinVariable(
        ts,
        parsed.source,
        parsed.sourceFile,
        expected,
      )
      declarations.set(expected.name, declaration)
      const donor = donorDeclarations.get(expected.name)
      if (donor) {
        assert.deepEqual(
          { bytes: expected.bytes, sha256: expected.sha256 },
          { bytes: donor.bytes, sha256: donor.sha256 },
        )
      }
    }
    for (const contract of fixture.sourceReplay.contracts) {
      const declaration = declarations.get(contract.name)
      assert(declaration, contract.name)
      assert.deepEqual(objectContract(ts, declaration), contract.properties)
      const literals = stringLiterals(ts, declaration)
      for (const literal of contract.literals) {
        assert(literals.includes(literal), `${contract.name}:${literal}`)
      }
    }
    const union = requestUnionBranches(
      ts,
      declarations.get('SDKControlRequestInnerSchema'),
    )
    for (const branch of fixture.sourceReplay.requestUnionBranches) {
      assert.equal(union.filter(value => value === branch).length, 1, branch)
    }
    for (const response of fixture.targetUnit.declarations.filter(name =>
      name.endsWith('ResponseSchema'),
    )) {
      assert.equal(union.includes(response), false, response)
    }

    fs.writeFileSync(filename, Buffer.concat([raw.subarray(0, -1), Buffer.from('!')]))
    assert.throws(
      () =>
        applyTarget118SdkControlInteractionsSourceRecovery({
          sourceRoot: temporary,
        }),
      /unsupported preimage/,
    )
    assert(['input', 'output'].includes(sourceState(sourceRoot)))
  },
)

test(
  'SDK-control coverage accepts only the exact provisional or corrected atomic state',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(path.join(root, fixture.inputs.targetCoverage.path)),
      ),
    )
    const owners = new Map(
      coverage.owners.map(owner => [owner.id, owner.path]),
    )
    const rows = coverage.rows.filter(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.equal(rows.length, 1)
    const row = rows[0]
    assert.deepEqual(
      {
        start: row.start,
        end: row.end,
        nodeType: row.nodeType,
        sourceHash: row.sourceHash,
        structuralClass: row.structuralClass,
        disposition: row.disposition,
        ownerPaths: row.ownerIds.map(ownerId => owners.get(ownerId)),
      },
      {
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        nodeType: fixture.targetUnit.nodeType,
        sourceHash: fixture.targetUnit.sourceHash,
        structuralClass: fixture.targetUnit.classification,
        disposition: 'source-runtime-covered',
        ownerPaths: [fixture.targetUnit.ownerPath],
      },
    )
    const state = {
      evidenceIds: row.evidenceIds,
      behavior: row.behavior,
    }
    assert.ok(
      Object.values(fixture.coverageStates).some(
        expected => JSON.stringify(state) === JSON.stringify(expected),
      ),
      JSON.stringify(state),
    )
    assert.deepEqual(
      fixture.coverageStates.corrected.evidenceIds,
      fixture.evidenceIds,
    )
    assert.equal(
      fixture.coverageStates.corrected.behavior,
      fixture.targetUnit.behavior,
    )
  },
)
