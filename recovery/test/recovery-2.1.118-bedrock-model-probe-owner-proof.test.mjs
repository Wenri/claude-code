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
  TARGET118_BEDROCK_MODEL_PROBE_EVIDENCE_IDS,
  TARGET118_BEDROCK_MODEL_PROBE_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/bedrock-model-probe-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-bedrock-model-probe-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'a98bbbe597654b365fb7a14df485e5d6ffa44c8f5bf7c4ee96c2f4699443192d'
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

function gitFile(input) {
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.historicalSource.commit}:${input.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return result.stdout
}

function normalizedTokens(source) {
  const values = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    if (token.type.label === 'name') values.push('ID')
    else if (token.type.label === 'string') {
      values.push(`string:${JSON.stringify(token.value)}`)
    } else if (token.type.label === 'num') values.push(`num:${token.value}`)
    else values.push(token.type.label)
  }
  return { tokens: values.length, value: Buffer.from(`${values.join('\n')}\n`) }
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

test('Target118 Bedrock probe fixture and override are frozen', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.case, caseName)
  assert.deepEqual(
    descriptor(fs.readFileSync(path.join(root, fixture.inputs.override.path))),
    {
      bytes: fixture.inputs.override.bytes,
      sha256: fixture.inputs.override.sha256,
    },
  )
  assert.deepEqual(
    TARGET118_BEDROCK_MODEL_PROBE_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET118_BEDROCK_MODEL_PROBE_OWNER_OVERRIDES.map(row => ({
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
        evidenceIds: fixture.ownerOverride.evidenceIds,
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
})

test('authenticated predecessor and target are complete alpha-equivalent probe units', { skip: !selected }, () => {
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
  const baselineUnit = baselineBundle.subarray(
    fixture.baselineUnit.start,
    fixture.baselineUnit.end,
  )
  const targetUnit = targetBundle.subarray(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(baselineUnit), {
    bytes: fixture.baselineUnit.bytes,
    sha256: fixture.baselineUnit.sourceHash,
  })
  assert.deepEqual(descriptor(targetUnit), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })

  for (const unit of [baselineUnit, targetUnit]) {
    const normalized = normalizedTokens(unit.toString('utf8'))
    assert.equal(normalized.tokens, fixture.normalizedUnit.tokens)
    assert.deepEqual(descriptor(normalized.value), {
      bytes: fixture.normalizedUnit.bytes,
      sha256: fixture.normalizedUnit.sha256,
    })
  }

  const targetLedger = JSON.parse(
    gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
  )
  const targetRegion = targetLedger.regions.find(
    row => row.target.index === fixture.targetUnit.targetIndex,
  )
  assert.ok(targetRegion)
  assert.equal(targetRegion.baselineUnitIndex, fixture.targetUnit.baselineUnitIndex)
  assert.equal(targetRegion.pairReason, fixture.targetUnit.pairReason)
  assert.deepEqual(
    {
      start: targetRegion.target.start,
      end: targetRegion.target.end,
      tokenCount: targetRegion.target.tokenCount,
      sourceHash: targetRegion.target.sourceHash,
      coarseHash: targetRegion.target.coarseHash,
    },
    {
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      tokenCount: fixture.targetUnit.tokenCount,
      sourceHash: fixture.targetUnit.sourceHash,
      coarseHash: fixture.targetUnit.coarseHash,
    },
  )

  const baselineLedger = JSON.parse(
    gunzipSync(readPinned(fixture.inputs.baselineStructuralLedger)),
  )
  const baselineRegion = baselineLedger.regions.find(
    row => row.target.index === fixture.baselineUnit.targetIndex,
  )
  assert.ok(baselineRegion)
  assert.equal(baselineRegion.target.start, fixture.baselineUnit.start)
  assert.equal(baselineRegion.target.end, fixture.baselineUnit.end)
  assert.equal(baselineRegion.target.sourceHash, fixture.baselineUnit.sourceHash)
})

test('the sole strict timeout residue is inside the authenticated options object', { skip: !selected }, () => {
  const targetBundle = fs.readFileSync(targetBundlePath)
  const [kind, value, start, end, baselineCount, targetOrdinal] =
    fixture.targetUnit.residues[0]
  assert.equal(kind, 'property')
  assert.equal(value, 'timeout')
  assert.equal(targetBundle.subarray(start, end).toString(), value)
  assert.equal(targetBundle.subarray(end, end + 5).toString(), ':8000')
  assert.ok(targetOrdinal > baselineCount)

  const analysis = JSON.parse(readPinned(fixture.inputs.ownerAnalysis))
  const mapping = analysis.analysis.sourceSupplementGaps.find(
    row => row.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert.ok(mapping)
  assert.deepEqual(mapping.ownerPaths, [
    fixture.targetUnit.provisionalOwnerPath.replace(/^src\//, ''),
  ])
  assert.equal(mapping.residues, 1)
  assert.equal(
    mapping.residueIdentitiesSha256,
    fixture.summary.residueIdentitiesSha256,
  )
})

test('exact TypeScript source owns the complete Bedrock model probe contract', { skip: !selected }, async () => {
  assert.equal(
    spawnSync(
      'git',
      ['rev-parse', `${fixture.inputs.historicalSource.commit}^{tree}`],
      { cwd: root, encoding: 'utf8' },
    ).stdout.trim(),
    fixture.inputs.historicalSource.tree,
  )
  const source = gitFile(fixture.inputs.historicalSource.file)
  const rejected = gitFile(fixture.inputs.rejectedProvisionalOwner)
  const packaged = fs.readFileSync(
    path.join(
      sourceRoot,
      fixture.inputs.historicalSource.file.path.replace(/^src\//, ''),
    ),
  )
  assert.deepEqual(descriptor(packaged), {
    bytes: fixture.inputs.historicalSource.file.bytes,
    sha256: fixture.inputs.historicalSource.file.sha256,
  })

  const ts = await loadTypeScript()
  const text = source.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.inputs.historicalSource.file.path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  let declaration
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === fixture.inputs.historicalSource.declaration.name
    ) {
      declaration = node
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(declaration)
  const characterStart = declaration.getStart(sourceFile)
  const characterEnd = declaration.end
  const byteStart = Buffer.byteLength(text.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
  assert.deepEqual(
    {
      characterStart,
      characterEnd,
      byteStart,
      byteEnd,
      ...descriptor(source.subarray(byteStart, byteEnd)),
    },
    {
      characterStart: fixture.inputs.historicalSource.declaration.characterStart,
      characterEnd: fixture.inputs.historicalSource.declaration.characterEnd,
      byteStart: fixture.inputs.historicalSource.declaration.byteStart,
      byteEnd: fixture.inputs.historicalSource.declaration.byteEnd,
      bytes: fixture.inputs.historicalSource.declaration.bytes,
      sha256: fixture.inputs.historicalSource.declaration.sha256,
    },
  )

  const declarationText = source.subarray(byteStart, byteEnd).toString('utf8')
  for (const moduleName of fixture.sourceContract.dynamicImports) {
    assert.match(declarationText, new RegExp(`import\\('${moduleName.replaceAll('.', '\\.')}'\\)`))
  }
  for (const property of fixture.sourceContract.baseOptionProperties) {
    assert.match(declarationText, new RegExp(`\\b${property}\\s*:`))
  }
  assert.match(declarationText, /maxRetries:\s*0/)
  assert.match(declarationText, /timeout:\s*8_000/)
  assert.match(declarationText, /max_tokens:\s*1/)
  assert.match(declarationText, /status\s*===\s*429/)
  for (const marker of [
    'probeBedrockModel',
    'AnthropicBedrock',
    'ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION',
    'AWS_BEARER_TOKEN_BEDROCK',
    'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  ]) {
    assert.doesNotMatch(rejected.toString('utf8'), new RegExp(marker))
  }
})

test('coverage accepts only the provisional or exact Bedrock probe owner state', { skip: !selected }, () => {
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
  const provisional = {
    ownerIds: ['owner-src-components-ClaudeInChromeOnboarding-tsx'],
    evidenceIds: ['source-map-attribution', 'semantic-test'],
  }
  const corrected = {
    ownerIds: ['owner-src-utils-model-bedrockUpgrade-ts'],
    evidenceIds: fixture.ownerOverride.evidenceIds,
  }
  assert.ok(
    [provisional, corrected].some(
      expected =>
        JSON.stringify(row.ownerIds) === JSON.stringify(expected.ownerIds) &&
        JSON.stringify(row.evidenceIds) === JSON.stringify(expected.evidenceIds),
    ),
  )
})
