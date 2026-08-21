import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_INBOUND_ATTACHMENT_SCHEMA_EVIDENCE_IDS,
  TARGET119_INBOUND_ATTACHMENT_SCHEMA_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/inbound-attachment-schema-inherited-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-inbound-attachment-schema-inherited-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f6df184a15346819cf6c19b62359328cb5db8ed722e07386ef21403cbc58df4b'
const configuredSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function canonicalToken(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'string') return `S:${JSON.stringify(token.value)}`
  if (token.type.label === 'num') return `N:${token.value}`
  if (token.type.label === 'regexp') {
    return `R:${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function canonicalTokens(source) {
  return [...tokenizer(source, { ecmaVersion: 'latest' })].map(canonicalToken)
}

function structuralUnit(input, targetIndex) {
  const ledger = JSON.parse(gunzipSync(readPinned(input)))
  const unit = ledger.regions.find(row => row.target.index === targetIndex)?.target
  assert.ok(unit, `missing structural unit ${targetIndex}`)
  return unit
}

function normalizedUnit(unit) {
  return {
    targetIndex: unit.index ?? unit.targetIndex,
    nodeType: unit.nodeType,
    start: unit.start,
    end: unit.end,
    tokenCount: unit.tokenCount,
    sourceHash: unit.sourceHash,
    coarseHash: unit.coarseHash,
  }
}

function rowTuple(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
    row.disposition,
    row.ownerPaths,
  ]
}

function canonicalRows(rows) {
  const value = rows.map(JSON.stringify).join('\n')
  return { ...descriptor(Buffer.from(value)), tuples: rows }
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

function attachmentDeclaration(ts, bytes) {
  const parsed = ts.createSourceFile(
    fixture.inputs.source.path,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  const matches = []
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(parsed) === 'attachmentSchema') {
        matches.push(statement)
      }
    }
  }
  assert.equal(matches.length, 1)
  const statement = matches[0]
  const start = statement.getStart(parsed)
  const end = statement.end
  return {
    parsed,
    statement,
    descriptor: { start, end, ...descriptor(bytes.subarray(start, end)) },
  }
}

test('Target119 inbound schema override and fixture are frozen', { skip: !selected }, () => {
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
    TARGET119_INBOUND_ATTACHMENT_SCHEMA_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_INBOUND_ATTACHMENT_SCHEMA_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [{ targetIndex: fixture.targetUnit.targetIndex, ...fixture.ownerOverride }],
  )
})

test('complete Target118 and Target119 schema initializers are alpha-token identical', { skip: !selected }, () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  assert.deepEqual(
    normalizedUnit(
      structuralUnit(
        fixture.inputs.baselineStructuralLedger,
        fixture.baselineUnit.targetIndex,
      ),
    ),
    normalizedUnit(fixture.baselineUnit),
  )
  assert.deepEqual(
    normalizedUnit(
      structuralUnit(
        fixture.inputs.targetStructuralLedger,
        fixture.targetUnit.targetIndex,
      ),
    ),
    normalizedUnit(fixture.targetUnit),
  )
  const baseline = baselineBundle.subarray(
    fixture.baselineUnit.start,
    fixture.baselineUnit.end,
  )
  const target = targetBundle.subarray(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(baseline), {
    bytes: fixture.baselineUnit.bytes,
    sha256: fixture.baselineUnit.sourceHash,
  })
  assert.deepEqual(descriptor(target), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  const baselineTokens = canonicalTokens(baseline.toString('utf8'))
  const targetTokens = canonicalTokens(target.toString('utf8'))
  assert.equal(baselineTokens.length, fixture.canonicalTokenProof.tokens)
  assert.equal(targetTokens.length, fixture.canonicalTokenProof.tokens)
  assert.deepEqual(targetTokens, baselineTokens)
  assert.deepEqual(
    descriptor(Buffer.from(JSON.stringify(targetTokens))),
    {
      bytes: fixture.canonicalTokenProof.bytes,
      sha256: fixture.canonicalTokenProof.sha256,
    },
  )
  assert.equal(target.toString().split('is_image').length - 1, 1)
  assert.equal(target.toString().split('nullish').length - 1, 1)
})

test('all owner rows and the retained nullish residue are exact', { skip: !selected }, () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(root, fixture.inputs.typedReport.path), 'utf8'),
  )
  for (const [expected, rows] of [
    [fixture.rows.addedOwner, report.sourceRuntimeAddedOwnerResidueRows],
    [fixture.rows.owner, report.sourceRuntimeOwnerResidueRows],
  ]) {
    const actual = canonicalRows(
      rows
        .filter(row => row.structural.index === fixture.targetUnit.targetIndex)
        .map(rowTuple),
    )
    assert.deepEqual(actual, {
      bytes: expected.canonicalBytes,
      sha256: expected.canonicalSha256,
      tuples: expected.tuples,
    })
  }
  const target = readPinned(fixture.inputs.targetBundle)
  for (const row of fixture.rows.owner.tuples) {
    assert.equal(target.subarray(row[3], row[4]).toString(), row[2])
  }
})

test('historical source authenticates the owner and blocks a late replay', { skip: !selected }, async () => {
  const input = fixture.inputs.source
  for (const commit of input.commits) {
    const blob = spawnSync('git', ['rev-parse', `${commit}:${input.path}`], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(blob.status, 0, blob.stderr)
    assert.equal(blob.stdout.trim(), input.blob)
    const source = spawnSync('git', ['show', `${commit}:${input.path}`], {
      cwd: root,
      encoding: null,
    })
    assert.equal(source.status, 0, source.stderr?.toString())
    assert.deepEqual(descriptor(source.stdout), {
      bytes: input.bytes,
      sha256: input.sha256,
    })
    assert.equal(source.stdout.toString().includes('is_image'), false)
  }
  const selectedBytes = fs.readFileSync(
    path.join(configuredSourceRoot, input.path.slice('src/'.length)),
  )
  assert.deepEqual(descriptor(selectedBytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  const ts = await loadTypeScript()
  const declaration = attachmentDeclaration(ts, selectedBytes)
  assert.deepEqual(declaration.descriptor, input.attachmentSchema)
  const text = declaration.statement.getText(declaration.parsed)
  assert.equal(text.includes('file_uuid: z.string()'), true)
  assert.equal(text.includes('file_name: z.string()'), true)
  assert.equal(text.includes('is_image'), false)
})
