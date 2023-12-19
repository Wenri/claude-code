import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_INPUT_FILE,
  TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_OUTPUT_FILE,
  TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_OWNER_OVERRIDES,
  applyTarget118StructuredOutputAlwaysLoadSourceRecovery,
  buildTarget118StructuredOutputAlwaysLoadOutput,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-structured-output-always-load-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-structured-output-always-load-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '3bfb67ecce325df7b715f7c20fba1b46b0218a7a464c51ddd7cbfd9a019ab13e'
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

function gitFile(file) {
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.historicalSource.commit}:${file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: file.bytes,
    sha256: file.sha256,
  })
  return result.stdout
}

function walkAcorn(node, visit) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walkAcorn(value, visit)
    } else {
      walkAcorn(child, visit)
    }
  }
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

function exactFunction(ts, bytes, expected) {
  const text = bytes.toString()
  const sourceFile = ts.createSourceFile(
    'source.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === expected.name) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  const characterStart = declaration.getStart(sourceFile)
  const characterEnd = declaration.end
  const byteStart = Buffer.byteLength(text.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
  assert.deepEqual(
    {
      name: declaration.name.text,
      characterStart,
      characterEnd,
      byteStart,
      byteEnd,
      ...descriptor(bytes.subarray(byteStart, byteEnd)),
    },
    expected,
  )
  return { declaration, sourceFile }
}

test(
  'Target118 structured-output always-load fixture and helper are deterministic',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
      {
        bytes: fixture.inputs.helper.bytes,
        sha256: fixture.inputs.helper.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_INPUT_FILE,
      {
        path: fixture.sourceReplay.path,
        ...fixture.sourceReplay.before,
      },
    )
    assert.deepEqual(
      TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_OUTPUT_FILE,
      {
        path: fixture.sourceReplay.path,
        ...fixture.sourceReplay.after,
      },
    )
    assert.deepEqual(
      TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.ownerOverride.evidenceIds,
          behavior: fixture.ownerOverride.behavior,
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
    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.historicalSource.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.historicalSource.tree,
    )
    for (const file of [
      fixture.inputs.historicalSource.file,
      fixture.inputs.consumerSource.file,
    ]) {
      assert.equal(
        spawnSync(
          'git',
          [
            'rev-parse',
            `${fixture.inputs.historicalSource.commit}:${file.path}`,
          ],
          { cwd: root, encoding: 'utf8' },
        ).stdout.trim(),
        file.blob,
      )
      gitFile(file)
    }
  },
)

test(
  'authenticated Target118 structured-output tool pins alwaysLoad on the complete unit',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledgerBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(ledgerBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const region = ledger.regions.find(
      candidate => candidate.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(region)
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
        classification: fixture.targetUnit.classification,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        bytes: fixture.targetUnit.bytes,
        tokenCount: fixture.targetUnit.tokenCount,
        nodeType: fixture.targetUnit.nodeType,
        sourceHash: fixture.targetUnit.sourceHash,
        coarseHash: fixture.targetUnit.coarseHash,
      },
    )
    const unit = bundle.subarray(fixture.targetUnit.start, fixture.targetUnit.end)
    assert.deepEqual(descriptor(unit), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sourceHash,
    })
    const ast = parse(unit.toString(), { ecmaVersion: 'latest' })
    const properties = []
    walkAcorn(ast, node => {
      if (node.type === 'Property') properties.push(node)
    })
    const alwaysLoad = properties.filter(
      property => property.key.name === 'alwaysLoad',
    )
    assert.equal(alwaysLoad.length, 1)
    assert.equal(alwaysLoad[0].value.type, 'UnaryExpression')
    assert.equal(alwaysLoad[0].value.operator, '!')
    assert.equal(alwaysLoad[0].value.argument.value, 0)
    for (const marker of [
      'alwaysLoad:!0',
      'inputJSONSchema:{type:"object"',
      'required:["ok"]',
      'additionalProperties:!1',
      'You MUST call this tool exactly once at the end of your response.',
    ]) {
      assert.ok(unit.toString().includes(marker), `target marker ${marker}`)
    }
    const [residue] = fixture.targetUnit.residues
    assert.equal(
      bundle.subarray(residue[2], residue[3]).toString(),
      residue[1],
    )
  },
)

test(
  'bounded structured-output replay is exact, idempotent, and fail closed',
  { skip: !selected },
  () => {
    const input = gitFile(fixture.inputs.historicalSource.file)
    const output = Buffer.from(
      buildTarget118StructuredOutputAlwaysLoadOutput(input.toString()),
    )
    assert.deepEqual(descriptor(output), fixture.sourceReplay.after)
    const configured = fs.readFileSync(
      path.join(
        sourceRoot,
        fixture.sourceReplay.path.replace(/^src\//, ''),
      ),
    )
    assert.ok(
      [fixture.sourceReplay.before, fixture.sourceReplay.after].some(
        expected =>
          expected.bytes === configured.length &&
          expected.sha256 === sha256(configured),
      ),
    )

    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-structured-output-'),
    )
    try {
      const filename = path.join(temporaryRoot, 'utils/hooks/hookHelpers.ts')
      fs.mkdirSync(path.dirname(filename), { recursive: true })
      fs.writeFileSync(filename, input)
      assert.equal(
        applyTarget118StructuredOutputAlwaysLoadSourceRecovery({
          sourceRoot: temporaryRoot,
        }).status,
        'recovered',
      )
      assert.deepEqual(descriptor(fs.readFileSync(filename)), {
        bytes: fixture.sourceReplay.after.bytes,
        sha256: fixture.sourceReplay.after.sha256,
      })
      assert.equal(
        applyTarget118StructuredOutputAlwaysLoadSourceRecovery({
          sourceRoot: temporaryRoot,
        }).status,
        'already-recovered',
      )
      fs.appendFileSync(filename, '\n// drift\n')
      assert.throws(
        () =>
          applyTarget118StructuredOutputAlwaysLoadSourceRecovery({
            sourceRoot: temporaryRoot,
          }),
        /exact raw or recovered source state/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  'recovered producer and exact ToolSearch consumer enforce immediate availability',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const input = gitFile(fixture.inputs.historicalSource.file)
    const output = Buffer.from(
      buildTarget118StructuredOutputAlwaysLoadOutput(input.toString()),
    )
    const before = exactFunction(
      ts,
      input,
      fixture.inputs.historicalSource.inputDeclaration,
    )
    const after = exactFunction(
      ts,
      output,
      fixture.inputs.historicalSource.outputDeclaration,
    )
    assert.equal(
      before.declaration.getText(before.sourceFile).includes('alwaysLoad'),
      false,
    )
    const recoveredText = after.declaration.getText(after.sourceFile)
    assert.ok(recoveredText.includes('alwaysLoad: true'))
    for (const marker of [
      '...SyntheticOutputTool',
      'inputSchema: hookResponseSchema()',
      "required: ['ok']",
      'additionalProperties: false',
      'You MUST call this tool exactly once at the end of your response.',
    ]) {
      assert.ok(recoveredText.includes(marker), `recovered marker ${marker}`)
    }

    const consumer = gitFile(fixture.inputs.consumerSource.file)
    const parsedConsumer = exactFunction(
      ts,
      consumer,
      fixture.inputs.consumerSource.declaration,
    )
    const consumerText = parsedConsumer.declaration.getText(
      parsedConsumer.sourceFile,
    )
    assert.ok(
      consumerText.indexOf('if (tool.alwaysLoad === true) return false') <
        consumerText.indexOf('if (tool.isMcp === true) return true'),
    )
    const isDeferred = tool => {
      if (tool.alwaysLoad === true) return false
      if (tool.isMcp === true) return true
      return tool.shouldDefer === true
    }
    assert.equal(isDeferred({ alwaysLoad: true, shouldDefer: true }), false)
    assert.equal(isDeferred({ alwaysLoad: true, isMcp: true }), false)
    assert.equal(isDeferred({ isMcp: true }), true)
  },
)

test(
  'structured-output always-load coverage evolves atomically',
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
    assert.deepEqual(
      row.ownerIds.map(ownerId => owners.get(ownerId)),
      fixture.ownerOverride.paths,
    )
    const provisional =
      JSON.stringify(row.evidenceIds) ===
      JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected)
  },
)
