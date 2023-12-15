import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_AWAY_SUMMARY_RUNTIME_EVIDENCE_IDS,
  TARGET118_AWAY_SUMMARY_RUNTIME_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/away-summary-runtime-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-away-summary-runtime-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '40bdd4a8b7fe235b3a18e13b729a24746b9832bc7f0cc61bc84ba1ebde0e4d4c'
const target118SourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function readPinned(input, base = root) {
  const bytes = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
}

function sourceRelative(input) {
  return input.path.replace(/^src\//, '')
}

function tokenValue(token) {
  if (token.type.label === 'name') return '_'
  if (token.type.label === 'string') return JSON.stringify(token.value)
  if (token.type.label === 'num') return String(token.value)
  if (token.type.label === 'regexp') {
    return `/${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function normalizedTokens(source) {
  const values = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    values.push(tokenValue(token))
  }
  return values
}

function tokenDescriptor(tokens) {
  return descriptor(Buffer.from(JSON.stringify(tokens)))
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

function readFunction(ts, sourceRoot, input) {
  const bytes = readPinned(
    { path: sourceRelative(input), bytes: input.bytes, sha256: input.sha256 },
    sourceRoot,
  )
  const source = bytes.toString()
  const sourceFile = ts.createSourceFile(
    input.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    input.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, input.path)
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
  assert.equal(matches.length, 1, input.declaration.name)
  const declaration = matches[0]
  assert.equal(declaration.getStart(sourceFile), input.declaration.start)
  assert.equal(declaration.end, input.declaration.end)
  assert.deepEqual(
    descriptor(
      Buffer.from(
        source.slice(input.declaration.start, input.declaration.end),
      ),
    ),
    {
      bytes: input.declaration.bytes,
      sha256: input.declaration.sha256,
    },
  )
  return { source, sourceFile, declaration }
}

test(
  'Target118 away-summary fixture and override are frozen',
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
      TARGET118_AWAY_SUMMARY_RUNTIME_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET118_AWAY_SUMMARY_RUNTIME_OWNER_OVERRIDES.map(row => ({
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
          evidenceIds: fixture.evidenceIds,
          behavior: fixture.targetUnit.behavior,
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
      fixture.summary.strictResidueIdentitiesSha256,
    )
  },
)

test(
  'authenticated complete units differ by only the result-contract lowering',
  { skip: !selected },
  () => {
    const baselineBundle = readPinned(fixture.inputs.baselineBundle)
    const targetBundle = readPinned(fixture.inputs.targetBundle)
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
      sha256: fixture.baselineUnit.sha256,
    })
    assert.deepEqual(descriptor(target), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sha256,
    })

    for (const fragment of Object.values(fixture.resultContractFragments)) {
      const bundle = fragment.start < fixture.targetUnit.start
        ? baselineBundle
        : targetBundle
      const bytes = bundle.subarray(fragment.start, fragment.end)
      assert.equal(bytes.toString(), fragment.text)
      assert.deepEqual(descriptor(bytes), {
        bytes: fragment.bytes,
        sha256: fragment.sha256,
      })
    }
    for (const residue of fixture.targetUnit.residues) {
      assert.equal(
        targetBundle.subarray(residue[2], residue[3]).toString(),
        residue[0] === 'string' ? JSON.stringify(residue[1]) : residue[1],
      )
    }

    const baselineTokens = normalizedTokens(baseline.toString())
    const targetTokens = normalizedTokens(target.toString())
    assert.equal(baselineTokens.length, fixture.normalizedTokenProof.baseline.tokens)
    assert.equal(targetTokens.length, fixture.normalizedTokenProof.target.tokens)
    assert.deepEqual(
      tokenDescriptor(baselineTokens),
      {
        bytes: fixture.normalizedTokenProof.baseline.bytes,
        sha256: fixture.normalizedTokenProof.baseline.sha256,
      },
    )
    assert.deepEqual(
      tokenDescriptor(targetTokens),
      {
        bytes: fixture.normalizedTokenProof.target.bytes,
        sha256: fixture.normalizedTokenProof.target.sha256,
      },
    )

    const normalizedTarget = [...targetTokens]
    const [guardEdit, textEdit] = fixture.normalizedTokenProof.edits
    assert.deepEqual(
      normalizedTarget.slice(guardEdit.at, guardEdit.at + guardEdit.remove.length),
      guardEdit.remove,
    )
    normalizedTarget.splice(
      guardEdit.at,
      guardEdit.remove.length,
      ...guardEdit.insert,
    )
    assert.deepEqual(
      normalizedTarget.slice(
        textEdit.atAfterPriorEdits,
        textEdit.atAfterPriorEdits + textEdit.remove.length,
      ),
      textEdit.remove,
    )
    normalizedTarget.splice(
      textEdit.atAfterPriorEdits,
      textEdit.remove.length,
      ...textEdit.insert,
    )
    assert.deepEqual(normalizedTarget, baselineTokens)
    assert.deepEqual(tokenDescriptor(normalizedTarget), {
      bytes: fixture.normalizedTokenProof.common.bytes,
      sha256: fixture.normalizedTokenProof.common.sha256,
    })
  },
)

test(
  'complete scanner partition and strict residues are exact',
  { skip: !selected },
  () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
        ),
      ),
    )
    const allRows = report.sourceRuntimeOwnerResidueRows
      .filter(row => row.structural.index === fixture.targetUnit.targetIndex)
      .map(row => [
        row.literalKind,
        row.value,
        row.target.start,
        row.target.end,
        row.baselineOccurrenceCount,
        row.targetOccurrenceNumber,
        row.targetAdded,
      ])
    assert.equal(allRows.length, fixture.summary.completeOwnerRows)
    assert.deepEqual(descriptor(Buffer.from(JSON.stringify(allRows))), {
      bytes: fixture.summary.completeOwnerRowsBytes,
      sha256: fixture.summary.completeOwnerRowsSha256,
    })
    assert.deepEqual(
      allRows.filter(row => row[6]).map(row => row.slice(0, 6)),
      fixture.targetUnit.residues,
    )
  },
)

test(
  'source lineage identifies useAwaySummary and blocks an unsafe replay',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const target118 = fixture.sourceStates.target118
    const hook118 = readFunction(ts, target118SourceRoot, target118.hook)
    const service118 = readFunction(ts, target118SourceRoot, target118.service)
    const rejected = readFunction(
      ts,
      target118SourceRoot,
      target118.rejectedOwner,
    )

    for (const fragment of [
      'const result = await generateAwaySummary(',
      'messagesRef.current,',
      "result.kind !== 'ok'",
      'createAwaySummaryMessage(result.text)',
    ]) {
      assert.equal(hook118.source.includes(fragment), true, fragment)
    }
    for (const absent of [
      'cacheCompletedAtRef',
      'options?.force',
      'RECAP_TRIGGER_FILENAME',
    ]) {
      assert.equal(hook118.source.includes(absent), false, absent)
    }
    for (const fragment of [
      "{ kind: 'ok' | 'api-error'; text: string }",
      'messages: readonly Message[]',
      "return { kind: 'ok', text: getAssistantMessageText(response) }",
    ]) {
      assert.equal(service118.source.includes(fragment), true, fragment)
    }
    for (const fragment of [
      'AwaySummary',
      'generateAwaySummary',
      'result.kind',
      'options?.force',
    ]) {
      assert.equal(rejected.source.includes(fragment), false, fragment)
    }

    const laterRoot = path.join(root, fixture.sourceStates.target119Later.root)
    const hook119 = readFunction(
      ts,
      laterRoot,
      fixture.sourceStates.target119Later.hook,
    )
    const service119 = readFunction(
      ts,
      laterRoot,
      fixture.sourceStates.target119Later.service,
    )
    for (const fragment of [
      'const result = await generateAwaySummary(controller.signal)',
      "result.kind !== 'ok'",
      'const content =',
      'result.text',
      'options?.force',
      'Math.min(delayRef.current, cacheTtl * 0.8)',
      'RECAP_TRIGGER_FILENAME',
    ]) {
      assert.equal(hook119.source.includes(fragment), true, fragment)
    }
    for (const fragment of [
      "{ kind: 'ok' | 'api-error'; text: string }",
      'generateAwaySummary(\n  signal: AbortSignal,',
      "return text ? { kind: 'ok', text } : { kind: 'failed' }",
    ]) {
      assert.equal(service119.source.includes(fragment), true, fragment)
    }

    // Target118 has the new result union but the old blur-timer implementation;
    // Target119 has the target runtime core plus a later background-trigger effect.
    // Neither exact tuple is a faithful authored Target118 replay postimage.
    assert.notEqual(target118.hook.sha256, fixture.sourceStates.target119Later.hook.sha256)
    assert.notEqual(
      target118.service.sha256,
      fixture.sourceStates.target119Later.service.sha256,
    )
  },
)

test(
  'nullable and discriminated result contracts preserve the live recap flow',
  { skip: !selected },
  () => {
    const oldResult = (value, count) =>
      value === null
        ? null
        : count < 3
          ? `${value} (disable recaps in /config)`
          : value
    const newResult = (value, count) =>
      value.kind !== 'ok'
        ? null
        : count < 3
          ? `${value.text} (disable recaps in /config)`
          : value.text
    for (const count of [0, 2, 3, 10]) {
      assert.equal(newResult({ kind: 'failed' }, count), oldResult(null, count))
      assert.equal(newResult({ kind: 'aborted' }, count), oldResult(null, count))
      assert.equal(
        newResult({ kind: 'ok', text: 'recap' }, count),
        oldResult('recap', count),
      )
    }
  },
)

test(
  'coverage accepts only the exact provisional or corrected owner state',
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
    const paths = row.ownerIds.map(id => owners.get(id)).sort()
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([fixture.targetUnit.rejectedOwnerPath]) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.ownerOverride.paths].sort()) &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
      row.behavior ===
        TARGET118_AWAY_SUMMARY_RUNTIME_OWNER_OVERRIDES[0].behavior
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.equal(provisional || corrected, true)
  },
)
