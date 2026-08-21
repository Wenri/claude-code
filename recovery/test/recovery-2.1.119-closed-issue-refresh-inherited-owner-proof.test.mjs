import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_CLOSED_ISSUE_REFRESH_EVIDENCE_IDS,
  TARGET119_CLOSED_ISSUE_REFRESH_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/closed-issue-refresh-inherited-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-closed-issue-refresh-inherited-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '5ed3b581c58ed290136e88f43227000155059c11740c70f7592b7b3cd18a9a6f'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
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

function unitSlice(bundle, unit) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(value), {
    bytes: unit.bytes,
    sha256: unit.sourceHash,
  })
  return value.toString('utf8')
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
  ]
}

function canonicalRows(rows) {
  const tuples = rows.map(rowTuple)
  const value = Buffer.from(JSON.stringify(tuples))
  return { ...descriptor(value), tuples }
}

function git(args, encoding = null) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding,
    maxBuffer: 16 * 1024 * 1024,
  })
  return result
}

test('Target119 closed-issue refresh override and fixture are frozen', { skip: !selected }, () => {
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
    TARGET119_CLOSED_ISSUE_REFRESH_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_CLOSED_ISSUE_REFRESH_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
    })),
    [{ targetIndex: fixture.units.target.index, ...fixture.ownerOverride }],
  )
})

test('complete refresh units are alpha-token identical from Target118 through Target121', { skip: !selected }, () => {
  const ledger = JSON.parse(gunzipSync(readPinned(fixture.inputs.structuralLedger)))
  const region = ledger.regions.find(
    row => row.target.index === fixture.units.target.index,
  )
  assert.equal(region.classification, 'changed')
  assert.equal(region.baselineUnitIndex, fixture.units.baseline.index)
  assert.equal(region.pairReason, 'unique-coarse-structural-hash')
  for (const key of ['start', 'end', 'tokenCount', 'sourceHash', 'coarseHash']) {
    assert.equal(region.target[key], fixture.units.target[key])
  }

  const versions = [
    [fixture.inputs.baselineBundle, fixture.units.baseline],
    [fixture.inputs.targetBundle, fixture.units.target],
    [fixture.inputs.target120Bundle, fixture.units.target120],
    [fixture.inputs.target121Bundle, fixture.units.target121],
  ]
  let expectedTokens
  for (const [input, unit] of versions) {
    const source = unitSlice(readPinned(input), unit)
    const tokens = canonicalTokens(source)
    assert.equal(tokens.length, fixture.canonicalTokenProof.tokens)
    const encoded = Buffer.from(JSON.stringify(tokens))
    assert.deepEqual(descriptor(encoded), {
      bytes: fixture.canonicalTokenProof.bytes,
      sha256: fixture.canonicalTokenProof.sha256,
    })
    expectedTokens ??= tokens
    assert.deepEqual(tokens, expectedTokens)
  }
})

test('all twelve apparent Target119 additions are exact retained-unit occurrences', { skip: !selected }, () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(root, fixture.inputs.typedReport.path), 'utf8'),
  )
  const added = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === fixture.units.target.index,
  )
  const actualAdded = canonicalRows(added)
  assert.deepEqual(actualAdded, {
    bytes: fixture.rows.addedOwner.canonicalBytes,
    sha256: fixture.rows.addedOwner.canonicalSha256,
    tuples: fixture.rows.addedOwner.tuples,
  })
  const owner = report.sourceRuntimeOwnerResidueRows.filter(
    row => row.structural.index === fixture.units.target.index,
  )
  const actualOwner = canonicalRows(owner)
  assert(
    [fixture.rows.owner, fixture.rows.correctedOwner].some(
      expected =>
        owner.length === expected.count &&
        actualOwner.bytes === expected.canonicalBytes &&
        actualOwner.sha256 === expected.canonicalSha256,
    ),
    'owner rows must be the exact provisional or corrected-owner state',
  )
  const target = readPinned(fixture.inputs.targetBundle)
  for (const row of fixture.rows.addedOwner.tuples) {
    const slice = target.subarray(row[3], row[4]).toString()
    assert.equal(row[1] === 'string' ? JSON.parse(slice) : slice, row[2])
  }
})

test('later source authenticates the owner while the Target119 source graph blocks replay', { skip: !selected }, () => {
  const lineage = fixture.sourceLineage
  const source = git(
    ['show', `${lineage.authenticatedCommit}:${lineage.path}`],
    null,
  )
  assert.equal(source.status, 0, source.stderr?.toString())
  assert.deepEqual(descriptor(source.stdout), {
    bytes: lineage.bytes,
    sha256: lineage.sha256,
  })
  const blob = git(
    ['rev-parse', `${lineage.authenticatedCommit}:${lineage.path}`],
    'utf8',
  )
  assert.equal(blob.status, 0, blob.stderr)
  assert.equal(blob.stdout.trim(), lineage.blob)

  const text = source.stdout.toString('utf8')
  const declarationStart = text.indexOf(
    `async function ${lineage.declaration}()`,
  )
  const declarationEnd = text.indexOf(
    'async function readClosedIssueCache()',
    declarationStart,
  )
  assert.ok(declarationStart >= 0 && declarationEnd > declarationStart)
  const declaration = text.slice(declarationStart, declarationEnd)
  for (const marker of [
    "if (!getIsInteractive()) return null",
    "if (isEssentialTrafficOnly()) return null",
    "'anthropics/claude-code'",
    "preserveOutputOnError: false",
    "issue.stateReason === 'COMPLETED'",
    "await mkdir(dirname(filename), { recursive: true })",
    "await writeFile(filename, jsonStringify(closedIssues)",
    'closedIssuesLastChecked: now',
  ]) {
    assert.equal(declaration.includes(marker), true, marker)
  }

  const absent = git(
    ['cat-file', '-e', `${lineage.target119Commit}:${lineage.path}`],
    'utf8',
  )
  assert.notEqual(absent.status, 0)
  const selectedModule = path.join(
    sourceRoot,
    lineage.path.slice('src/'.length),
  )
  if (fs.existsSync(selectedModule)) {
    assert.deepEqual(descriptor(fs.readFileSync(selectedModule)), {
      bytes: lineage.bytes,
      sha256: lineage.sha256,
    })
  } else {
    const notifications = fs.readFileSync(
      path.join(sourceRoot, 'components/PromptInput/Notifications.tsx'),
    )
    const config = fs.readFileSync(path.join(sourceRoot, 'utils/config.ts'))
    assert.deepEqual(descriptor(notifications), lineage.target119Notifications)
    assert.deepEqual(descriptor(config), lineage.target119Config)
    assert.equal(notifications.includes(Buffer.from('ClosedIssueNotice')), false)
    assert.equal(config.includes(Buffer.from('closedIssuesLastChecked')), false)
  }

  const falseOwner = fs.readFileSync(
    path.join(sourceRoot, lineage.falseOwner.slice('src/'.length)),
    'utf8',
  )
  assert.equal(falseOwner.includes('my-closed-issues.json'), false)
  assert.equal(falseOwner.includes('closedIssuesLastChecked'), false)
})
