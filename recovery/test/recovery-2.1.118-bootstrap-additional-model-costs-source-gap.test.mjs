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
  applyTarget118BootstrapCostsSourceRecovery,
  TARGET118_BOOTSTRAP_COSTS_BLOCK,
  TARGET118_BOOTSTRAP_COSTS_DONOR,
  TARGET118_BOOTSTRAP_COSTS_EVIDENCE_IDS,
  TARGET118_BOOTSTRAP_COSTS_INPUT,
  TARGET118_BOOTSTRAP_COSTS_OUTPUT,
  TARGET118_BOOTSTRAP_COSTS_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-bootstrap-additional-model-costs-source-gap.mjs'
import {
  TARGET119_BOOTSTRAP_COSTS_BLOCK,
  TARGET119_BOOTSTRAP_COSTS_DONOR,
  TARGET119_BOOTSTRAP_COSTS_INPUT,
  TARGET119_BOOTSTRAP_COSTS_OUTPUT,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-bootstrap-additional-model-costs-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-bootstrap-additional-model-costs-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '046c408a7e82dcb4f9fc37f6e6f83a3019d7b00323e4ad853d8ba1f34dee46a1'
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
const donorRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_DONOR_SOURCE_ROOT ??
    path.join(root, fixture.authenticatedDonor.root),
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

function gitBytes(lineage) {
  assert.equal(
    spawnSync('git', ['rev-parse', `${lineage.commit}^{tree}`], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim(),
    lineage.tree,
  )
  const result = spawnSync(
    'git',
    ['show', `${lineage.commit}:${lineage.file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: lineage.file.bytes,
    sha256: lineage.file.sha256,
  })
  assert.equal(
    spawnSync('git', ['rev-parse', `${lineage.commit}:${lineage.file.path}`], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim(),
    lineage.file.blob,
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

function normalizedTokens(bytes) {
  const values = []
  const stream = tokenizer(bytes.toString(), { ecmaVersion: 'latest' })
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

function walk(ts, node, predicate, matches = []) {
  if (predicate(node)) matches.push(node)
  ts.forEachChild(node, child => {
    walk(ts, child, predicate, matches)
  })
  return matches
}

function findVariable(ts, sourceFile, name) {
  const matches = walk(
    ts,
    sourceFile,
    node => ts.isVariableDeclaration(node) && node.name?.text === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0]
}

function pinVariable(ts, source, sourceFile, expected) {
  const declaration = findVariable(ts, sourceFile, expected.name)
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

function propertyName(ts, node) {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isStringLiteral(node)) return node.text
  assert.fail('unsupported property name')
}

function schemaObject(ts, declaration) {
  const calls = walk(
    ts,
    declaration,
    node =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'object' &&
      node.arguments.length === 1 &&
      ts.isObjectLiteralExpression(node.arguments[0]) &&
      node.arguments[0].properties.some(
        property => propertyName(ts, property.name) === 'client_data',
      ),
  )
  assert.equal(calls.length, 1, 'bootstrap response object')
  return calls[0].arguments[0]
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
    `configured bootstrap source is not an exact pre/postimage: ` +
      `${actual.bytes}/${actual.sha256}`,
  )
}

test(
  'Target118 bootstrap-cost fixture pins the complete retained unit and replay',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    readPinnedFile(fixture.inputs.helper)
    assert.deepEqual(
      TARGET118_BOOTSTRAP_COSTS_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET118_BOOTSTRAP_COSTS_INPUT, fixture.sourceReplay.input)
    assert.deepEqual(
      TARGET118_BOOTSTRAP_COSTS_OUTPUT,
      Object.fromEntries(
        Object.entries(fixture.sourceReplay.output).filter(
          ([key]) => key !== 'declaration',
        ),
      ),
    )
    assert.deepEqual(
      TARGET118_BOOTSTRAP_COSTS_OWNER_OVERRIDES.map(row => ({
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
    assert.deepEqual(
      analysis.analysis.sourceSupplementGaps.find(
        row => row.targetIndex === fixture.targetUnit.targetIndex,
      ),
      fixture.ownerAnalysisSnapshot,
    )
  },
)

test(
  'authenticated Target117 and Target118 bootstrap units are compiler-identical',
  { skip: !selected },
  () => {
    const baselineBundle = artifact(
      fixture.inputs.baselineBundle,
      baselineBundlePath,
    )
    const targetBundle = artifact(fixture.inputs.targetBundle, targetBundlePath)
    const structural = JSON.parse(
      gunzipSync(readPinnedFile(fixture.inputs.targetStructural)),
    )
    const region = structural.regions.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert(region)
    assert.equal(region.baselineUnitIndex, fixture.baselineUnit.targetIndex)
    assert.deepEqual(
      {
        classification: region.classification,
        targetIndex: region.target.index,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        tokenCount: region.target.tokenCount,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      Object.fromEntries(
        Object.entries(fixture.targetUnit).filter(([key]) =>
          [
            'classification',
            'targetIndex',
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
      const ast = parse(bytes.toString(), { ecmaVersion: 'latest' })
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, unit.nodeType)
    }
    const baseline = normalizedTokens(baselineUnit)
    const target = normalizedTokens(targetUnit)
    assert.deepEqual(descriptor(baseline.text), {
      bytes: fixture.normalizedUnitProof.baseline.bytes,
      sha256: fixture.normalizedUnitProof.baseline.sha256,
    })
    assert.deepEqual(descriptor(target.text), {
      bytes: fixture.normalizedUnitProof.target.bytes,
      sha256: fixture.normalizedUnitProof.target.sha256,
    })
    assert.equal(baseline.tokens.length, fixture.baselineUnit.tokenCount)
    assert.equal(target.tokens.length, fixture.targetUnit.tokenCount)
    assert.equal(baseline.text, target.text)
    for (const residue of fixture.targetUnit.residues) {
      const [kind, value, start, end] = residue
      assert.equal(kind, 'property')
      assert.equal(targetBundle.subarray(start, end).toString(), value)
      const relativeStart = start - fixture.targetUnit.start
      assert.equal(
        baselineUnit.subarray(relativeStart, relativeStart + value.length).toString(),
        value,
      )
    }
    for (const marker of fixture.targetMarkers) {
      assert(targetUnit.toString().includes(marker), marker)
    }
  },
)

test(
  'historical source omission and authenticated later replay pin one exact block',
  { skip: !selected },
  async () => {
    const baseline = gitBytes(fixture.sourceLineage.baseline)
    const target = gitBytes(fixture.sourceLineage.target)
    assert.deepEqual(baseline, target)
    assert.equal(target.includes(TARGET118_BOOTSTRAP_COSTS_BLOCK), false)
    const ts = await loadTypeScript()
    const rawParsed = parseSource(
      ts,
      target,
      fixture.sourceLineage.target.file.path,
    )
    pinVariable(
      ts,
      rawParsed.source,
      rawParsed.sourceFile,
      fixture.sourceLineage.target.file.declaration,
    )

    const donorBytes = fs.readFileSync(
      path.join(
        donorRoot,
        fixture.authenticatedDonor.file.path.replace(/^src\//, ''),
      ),
    )
    assert.deepEqual(descriptor(donorBytes), {
      bytes: fixture.authenticatedDonor.file.bytes,
      sha256: fixture.authenticatedDonor.file.sha256,
    })
    assert.equal(
      donorBytes.toString().split(TARGET118_BOOTSTRAP_COSTS_BLOCK).length,
      2,
    )
    assert.deepEqual(descriptor(TARGET118_BOOTSTRAP_COSTS_BLOCK), {
      bytes: fixture.summary.sourceBlockBytes,
      sha256: fixture.summary.sourceBlockSha256,
    })

    for (const input of Object.values(
      fixture.inputs.authenticatedLaterReplay,
    )) {
      readPinnedFile(input)
    }
    const laterFixture = JSON.parse(
      readPinnedFile(fixture.inputs.authenticatedLaterReplay.fixture),
    )
    assert.deepEqual(TARGET119_BOOTSTRAP_COSTS_INPUT, TARGET118_BOOTSTRAP_COSTS_INPUT)
    assert.deepEqual(TARGET119_BOOTSTRAP_COSTS_OUTPUT, TARGET118_BOOTSTRAP_COSTS_OUTPUT)
    assert.deepEqual(TARGET119_BOOTSTRAP_COSTS_DONOR, TARGET118_BOOTSTRAP_COSTS_DONOR)
    assert.equal(TARGET119_BOOTSTRAP_COSTS_BLOCK, TARGET118_BOOTSTRAP_COSTS_BLOCK)
    assert.deepEqual(laterFixture.inputs.sourcePreimage, fixture.sourceReplay.input)
    assert.deepEqual(
      laterFixture.inputs.sourcePostimage,
      Object.fromEntries(
        Object.entries(fixture.sourceReplay.output).filter(
          ([key]) => key !== 'declaration',
        ),
      ),
    )
    assert.deepEqual(laterFixture.inputs.authenticatedDonor, {
      ...fixture.authenticatedDonor.file,
      blockBytes: fixture.authenticatedDonor.block.bytes,
      blockSha256: fixture.authenticatedDonor.block.sha256,
    })
  },
)

test(
  'bootstrap-cost replay is exact, AST-bound, idempotent, and fail closed',
  { skip: !selected },
  async t => {
    assert(['input', 'output'].includes(sourceState(sourceRoot)))
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-bootstrap-costs.'),
    )
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
    const filename = sourceFilename(temporary)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    const raw = gitBytes(fixture.sourceLineage.target)
    fs.writeFileSync(filename, raw)
    assert.deepEqual(
      applyTarget118BootstrapCostsSourceRecovery({ sourceRoot: temporary }),
      { changed: true, path: fixture.sourceReplay.output.path },
    )
    const output = fs.readFileSync(filename)
    assert.deepEqual(descriptor(output), {
      bytes: fixture.sourceReplay.output.bytes,
      sha256: fixture.sourceReplay.output.sha256,
    })
    assert.deepEqual(
      applyTarget118BootstrapCostsSourceRecovery({ sourceRoot: temporary }),
      { changed: false, path: fixture.sourceReplay.output.path },
    )

    const ts = await loadTypeScript()
    const parsed = parseSource(ts, output, fixture.sourceReplay.output.path)
    const declaration = pinVariable(
      ts,
      parsed.source,
      parsed.sourceFile,
      fixture.sourceReplay.output.declaration,
    )
    const object = schemaObject(ts, declaration)
    assert.deepEqual(
      object.properties.map(property => propertyName(ts, property.name)),
      ['client_data', 'additional_model_options', 'additional_model_costs'],
    )
    const costs = object.properties.find(
      property => propertyName(ts, property.name) === 'additional_model_costs',
    )
    assert(ts.isPropertyAssignment(costs))
    assert.equal(
      walk(
        ts,
        costs.initializer,
        node =>
          ts.isPropertyAccessExpression(node) && node.name.text === 'number',
      ).length,
      5,
    )
    for (const marker of fixture.sourceReplay.markers) {
      assert(declaration.getText(parsed.sourceFile).includes(marker), marker)
    }

    fs.writeFileSync(filename, Buffer.concat([raw, Buffer.from('\n')]))
    assert.throws(
      () => applyTarget118BootstrapCostsSourceRecovery({ sourceRoot: temporary }),
      /unsupported preimage/,
    )
  },
)

test(
  'bootstrap-cost coverage accepts only exact provisional or corrected evidence',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(path.join(root, fixture.inputs.targetCoverage.path)),
      ),
    )
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
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
    const state = { evidenceIds: row.evidenceIds, behavior: row.behavior }
    assert.ok(
      Object.values(fixture.coverageStates).some(
        expected => JSON.stringify(expected) === JSON.stringify(state),
      ),
      JSON.stringify(state),
    )
  },
)
