import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  buildTarget113SecondHalfHistoricalCandidate,
  sha256Target113Replay,
} from './recovery-2.1.113-second-half-replay-helper.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const historicalPackageSelected = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_TARGET_COMMIT,
)
const requireRawReplay = process.env.CLAUDE_CODE_SEMANTIC_REQUIRE_REPLAY === '1'
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-second-half-safe-static-owner-proofs.json',
    import.meta.url,
  ),
)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const replayFixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-second-half-historical-package-replay.json',
    import.meta.url,
  ),
)
const replayFixtureBytes = fs.readFileSync(replayFixturePath)
const replayFixture = JSON.parse(replayFixtureBytes)
const replayHelperPath = fileURLToPath(
  new URL('./recovery-2.1.113-second-half-replay-helper.mjs', import.meta.url),
)
const replayHelperBytes = fs.readFileSync(replayHelperPath)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 = '1815e14ec96ae9d2df185e9f2c645a813a653b613c6cbae9a408551e46bee5cf'
const REPLAY_FIXTURE_SHA256 = 'f95e360ca0892f351d3959ac698829ad6b71e24649aff0d0e1473f7fad7073c0'
const REPLAY_HELPER_SHA256 = '922a5c10111f9de8d0fb6b444e2b526d6d4408e202d167e41be156e4281998a5'
const STRICT_TAIL_INDICES = [
  17590, 17681, 17806, 17927, 17929, 17941, 17944, 18280, 18303, 18305,
  18451, 18785, 18796, 18839, 18844, 19028, 19030, 19220, 19322, 19417,
  19434, 19454, 19672, 19684, 19726, 19795, 19798, 19801, 19803, 19839,
  19875, 19921, 20211, 20294, 20319, 20323, 20393, 20404, 20409, 20413,
]
const PACKAGE_ONLY_INDICES = [
  18153, 18361, 18599, 19234, 19427, 19685, 19741, 20034, 20146, 20149,
  20241,
]
const EXCLUDED_INDICES = [19322, 20409, 20413]
const ADMITTED_INDICES = [
  17590, 17681, 17806, 17927, 17929, 17941, 17944, 18153, 18280, 18303,
  18305, 18361, 18451, 18599, 18785, 18796, 18839, 18844, 19028, 19030,
  19220, 19234, 19417, 19427, 19434, 19454, 19672, 19684, 19685, 19726,
  19741, 19795, 19798, 19801, 19803, 19839, 19875, 19921, 20034, 20146,
  20149, 20211, 20241, 20294, 20319, 20323, 20393, 20404,
]
const CURRENT_ONLY_INDICES = [18280, 18303, 19839, 19875]
const SOURCE_REPLAY_REQUIRED_INDICES = [
  17927, 18153, 18361, 18599, 18785, 18796, 18839, 19234, 19417, 19427,
  19684, 19685, 19741, 20034, 20146, 20149, 20241, 20404,
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags].sort().join('')}`
  }
  return `${kind}:${
    kind === 'string' || kind === 'property' ? JSON.stringify(value) : String(value)
  }`
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function collectOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, node => {
    if (node.type === 'Literal') {
      let literalIdentity
      if (node.regex) literalIdentity = identity('regexp', node.regex)
      else if (typeof node.value === 'string') {
        literalIdentity = identity('string', node.value)
      } else if (typeof node.value === 'number') {
        literalIdentity = identity('number', node.value)
      } else if (node.bigint !== undefined) {
        literalIdentity = identity('bigint', node.bigint)
      }
      if (literalIdentity) {
        occurrences.push({
          end: node.end,
          identity: literalIdentity,
          start: node.start,
        })
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') {
        occurrences.push({
          end: node.end,
          identity: identity('string', value),
          start: node.start,
        })
      }
    }

    const isProperty =
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
        node.computed === false &&
        node.key?.type === 'Identifier') ||
      (node.type === 'MemberExpression' &&
        node.computed === false &&
        node.property?.type === 'Identifier')
    if (isProperty) {
      const property = node.key ?? node.property
      occurrences.push({
        end: property.end,
        identity: identity('property', property.name),
        start: property.start,
      })
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  const grouped = new Map()
  for (const occurrence of occurrences) {
    const values = grouped.get(occurrence.identity) ?? []
    values.push(occurrence)
    grouped.set(occurrence.identity, values)
  }
  return grouped
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifacts.targetInnerSha256) {
    return bytes.toString('utf8')
  }
  assert.equal(digest, fixture.artifacts.targetWrapperSha256)
  const inner = bytes.subarray(87, bytes.length - 3)
  assert.equal(sha256(inner), fixture.artifacts.targetInnerSha256)
  return inner.toString('utf8')
}

function selectedSourceFilename(ownerPath) {
  const relative = ownerPath.replace(/^src\//, '')
  return path.join(sourceRoot, relative)
}

function selectedGroupIsAlreadyRecovered(group) {
  return Object.entries(replayFixture.candidateSha256ByGroup[group.id]).every(
    ([ownerPath, allowedHashes]) => {
      const filename = selectedSourceFilename(ownerPath)
      return (
        fs.existsSync(filename) &&
        allowedHashes.includes(sha256(fs.readFileSync(filename)))
      )
    },
  )
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

function buildHistoricalCandidate() {
  return buildTarget113SecondHalfHistoricalCandidate({
    replayFixture,
    sourceRoot,
  })
}

function parseCandidateSource(ts, ownerPath, source) {
  const scriptKind = ownerPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const parsed = ts.createSourceFile(
    ownerPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )
  assert.deepEqual(
    parsed.parseDiagnostics.map(diagnostic => diagnostic.messageText),
    [],
    `${ownerPath}: candidate parses`,
  )
  return parsed
}

function findNamedDeclaration(ts, parsed, name) {
  let found
  const visit = node => {
    if (found) return
    if (
      ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
        node.name?.text === name) ||
      (ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === name)
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
}

test('the second-half Target113 fixture is an exact fail-closed partition', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 2)
  assert.equal(fixture.case, caseName)
  assert.equal(fixture.lane, 'target113-second-half-safe-static-owner-corrections')
  assert.deepEqual(fixture.derivation.strictTailRequestedIndices, STRICT_TAIL_INDICES)
  assert.deepEqual(fixture.derivation.packageOnlyIndices, PACKAGE_ONLY_INDICES)
  assert.deepEqual(fixture.derivation.admittedIndices, ADMITTED_INDICES)
  assert.deepEqual(fixture.derivation.excludedIndices, EXCLUDED_INDICES)
  assert.deepEqual(
    fixture.derivation.sourceReplayRequiredIndices,
    SOURCE_REPLAY_REQUIRED_INDICES,
  )
  assert.deepEqual(fixture.derivation.compilerEquivalentIndices, [])
  assert.equal(sha256(replayFixtureBytes), REPLAY_FIXTURE_SHA256)
  assert.equal(sha256(replayHelperBytes), REPLAY_HELPER_SHA256)
  assert.equal(
    fixture.historicalPackageReplayFixture,
    path.basename(replayFixturePath),
  )
  assert.deepEqual(
    replayFixture.sourceReplayRequiredIndices,
    SOURCE_REPLAY_REQUIRED_INDICES,
  )
  assert.deepEqual(replayFixture.compilerEquivalentIndices, [])
  assert.deepEqual(
    replayFixture.groups.flatMap(group => group.indices).sort((a, b) => a - b),
    SOURCE_REPLAY_REQUIRED_INDICES,
  )

  const allAudited = [...new Set([...STRICT_TAIL_INDICES, ...PACKAGE_ONLY_INDICES])].sort(
    (left, right) => left - right,
  )
  assert.deepEqual(fixture.derivation.allAuditedIndices, allAudited)
  assert.deepEqual(
    fixture.units.map(unit => unit.index),
    ADMITTED_INDICES,
  )
  assert.deepEqual(
    fixture.excludedUnits.map(unit => unit.index),
    EXCLUDED_INDICES,
  )
  assert.deepEqual(
    [...ADMITTED_INDICES, ...EXCLUDED_INDICES].sort((left, right) => left - right),
    allAudited,
  )
  assert.equal(fixture.units.length, 48)
  assert.equal(fixture.excludedUnits.length, 3)
  assert.equal(
    fixture.units.reduce((total, unit) => total + unit.residues.length, 0),
    114,
  )
  assert.equal(
    fixture.excludedUnits.reduce((total, unit) => total + unit.residues.length, 0),
    8,
  )

  const reconciliation = fixture.derivation.integratedScanReconciliation
  assert.equal(reconciliation.scannerResidueCount, 112)
  assert.equal(reconciliation.fixtureResidueCount, 114)
  assert.deepEqual(
    reconciliation.unitCounts['17590'].fixtureOnlyAuthenticatedAuxiliary,
    [
      'string:"\\"type\\":\\"custom-title\\""@10950785',
      'string:"\\"type\\":\\"tag\\""@10950957',
    ],
  )
  assert.match(reconciliation.unitCounts['17590'].reason, /authenticated target-added/)
  assert.deepEqual(
    fixture.units.find(unit => unit.index === 19684).residues.map(residue => [
      residue.kind,
      residue.value,
      residue.start,
    ]),
    [
      ['string', 'decay', 11980481],
      ['string', ' · platform=', 11980522],
      ['string', 'linux', 11980539],
    ],
  )
  assert.deepEqual(
    fixture.units.find(unit => unit.index === 20404).residues.map(residue => [
      residue.kind,
      residue.value,
      residue.start,
    ]),
    [
      ['property', 'default', 12899165],
      ['property', 'createElement', 12899173],
      ['property', 'default', 12899199],
      ['property', 'createElement', 12899207],
      ['property', 'default', 12899646],
      ['property', 'createElement', 12899654],
      ['property', 'default', 12900337],
      ['property', 'createElement', 12900345],
      ['property', 'default', 12900371],
      ['property', 'createElement', 12900379],
    ],
  )
  const integratedScanPath = path.join(repositoryRoot, reconciliation.path)
  if (fs.existsSync(integratedScanPath)) {
    assert.equal(
      sha256(fs.readFileSync(integratedScanPath)),
      reconciliation.sha256,
      'fresh integrated scan is pinned',
    )
    const integratedScan = JSON.parse(fs.readFileSync(integratedScanPath))
    const scanRows = integratedScan.sourceRuntimeAddedOwnerResidueRows
    for (const index of [19684, 20404]) {
      const fixtureRows = fixture.units
        .find(unit => unit.index === index)
        .residues.map(residue => [residue.kind, residue.value, residue.start])
      const currentRows = scanRows
        .filter(row => row.structural.index === index)
        .map(row => [row.literalKind, row.value, row.target.start])
        .sort((left, right) => left[2] - right[2])
      assert.deepEqual(currentRows, fixtureRows, `${index}: fresh scan rows are exact`)
    }
  }

  const allUnits = [...fixture.units, ...fixture.excludedUnits]
  const residueStarts = allUnits.flatMap(unit =>
    unit.residues.map(residue => residue.start),
  )
  assert.equal(new Set(residueStarts).size, residueStarts.length)
  for (const unit of allUnits) {
    assert.ok(unit.residues.length > 0, `${unit.index}: complete non-empty unit`)
    assert.equal(
      unit.residues.every(
        residue =>
          residue.start >= unit.structural.start && residue.end <= unit.structural.end,
      ),
      true,
      `${unit.index}: every residue stays inside its exact structural unit`,
    )
    assert.equal(
      unit.evidenceIds.every(evidenceId => fixture.evidenceCatalog[evidenceId]),
      true,
      `${unit.index}: every evidence id is declared`,
    )
  }

  assert.deepEqual(
    fixture.units
      .filter(unit => unit.mapping.ownerKind === 'current-only-recovered')
      .map(unit => unit.index),
    CURRENT_ONLY_INDICES,
  )
  assert.deepEqual(
    fixture.units
      .filter(unit => unit.mapping.ownerKind === 'historical-replay-dependency')
      .map(unit => unit.index),
    [18305],
  )
  assert.equal(fixture.units.find(unit => unit.index === 18305).replayRecipeId, 'u18361')
  assert.deepEqual(
    fixture.units
      .filter(unit => unit.mapping.ownerKind === 'historical-package-gap')
      .map(unit => unit.index),
    SOURCE_REPLAY_REQUIRED_INDICES,
  )
  for (const unit of fixture.units) {
    assert.equal(unit.mapping.primaryOwner.startsWith('src/'), true)
    assert.equal(
      unit.mapping.sourceOwners.filter(owner => owner.role === 'primary').length,
      1,
      `${unit.index}: exactly one primary owner`,
    )
    assert.equal(
      unit.mapping.sourceOwners[0].path,
      unit.mapping.primaryOwner,
      `${unit.index}: primary owner mapping is generator-ready`,
    )
    assert.ok(unit.sourceAssertions.length > 0, `${unit.index}: source AST mapping`)
  }

  for (const unit of fixture.units.filter(unit => PACKAGE_ONLY_INDICES.includes(unit.index))) {
    assert.equal(unit.evidenceIds.includes('historical-owner-hash'), false)
    assert.equal(unit.evidenceIds.includes('historical-package-gap'), true)
    assert.equal(unit.evidenceIds.includes('target113-source-replay'), true)
    assert.ok(
      replayFixture.groups.some(group => group.id === unit.replayRecipeId),
      `${unit.index}: replay group exists`,
    )
  }

  assert.deepEqual(
    fixture.excludedUnits.map(unit => [unit.index, unit.delegatedLane, unit.reason]),
    [
      [19322, 'target113-live-risk', 'daemon-path-initializer-live-risk'],
      [20409, 'target113-live-risk', 'daemon-lock-reader-live-risk'],
      [20413, 'target113-live-risk', 'daemon-lock-import-graph-live-risk'],
    ],
  )
})

test('the selected source root has the exact admitted owner disposition', {
  skip: !selected ? `not applicable to ${semanticCase}` : false,
}, () => {
  const historicalCandidate = historicalPackageSelected
    ? buildHistoricalCandidate().candidate
    : null
  for (const unit of fixture.units) {
    for (const owner of unit.mapping.sourceOwners) {
      const filename = selectedSourceFilename(owner.path)
      if (historicalPackageSelected && owner.historicalPresence === 'absent') {
        assert.equal(
          fs.existsSync(filename),
          false,
          `${unit.index}: ${owner.path} remains an authenticated-target-only historical owner`,
        )
        continue
      }
      if (historicalPackageSelected && owner.historicalPresence === 'replayed') {
        if (fs.existsSync(filename)) {
          const digest = sha256(fs.readFileSync(filename))
          assert.ok(
            owner.historicalSha256.includes(digest) ||
              (owner.rawHistoricalPresence === 'present' &&
                owner.rawHistoricalSha256.includes(digest)),
            `${unit.index}: ${owner.path} is an exact raw or replayed owner`,
          )
        } else {
          assert.equal(owner.rawHistoricalPresence, 'absent')
        }
        const replayedSource = historicalCandidate.get(owner.path)
        assert.equal(typeof replayedSource, 'string', `${unit.index}: replayed owner exists`)
        assert.ok(
          owner.historicalSha256.includes(sha256(replayedSource)),
          `${unit.index}: ${owner.path} post-replay hash is pinned`,
        )
        continue
      }
      assert.equal(fs.existsSync(filename), true, `${unit.index}: ${owner.path} exists`)
      const digest = sha256(fs.readFileSync(filename))
      if (historicalPackageSelected) {
        assert.ok(
          owner.historicalSha256.includes(digest),
          `${unit.index}: ${owner.path} is an exact materialized/final Target113 owner`,
        )
      } else {
        assert.equal(
          digest,
          owner.currentSha256,
          `${unit.index}: ${owner.path} is the exact cumulative owner`,
        )
      }
    }
  }
})

test('all historical source gaps replay fail-closed into a parsed Target113 candidate', {
  skip: !selected || !historicalPackageSelected
    ? 'TARGET_COMMIT package source is required'
    : false,
}, async () => {
  assert.equal(
    process.env.CLAUDE_CODE_SEMANTIC_TARGET_COMMIT,
    fixture.artifacts.targetCommit,
    'candidate is tied to the authenticated Target113 commit',
  )
  const ts = await loadTypeScript()
  const { appliedByGroup, candidate } = buildHistoricalCandidate()
  for (const group of replayFixture.groups) {
    if (requireRawReplay && !selectedGroupIsAlreadyRecovered(group)) {
      assert.ok(appliedByGroup.get(group.id) > 0, `${group.id}: raw package gap replayed`)
    }
    const owner = candidate.get(group.primaryOwner)
    assert.equal(typeof owner, 'string', `${group.id}: candidate owner exists`)
    for (const fragment of group.candidateRequiredFragments) {
      assert.ok(owner.includes(fragment), `${group.id}: ${fragment}`)
    }
    for (const [ownerPath, allowedHashes] of Object.entries(
      replayFixture.candidateSha256ByGroup[group.id],
    )) {
      const replayedSource = candidate.get(ownerPath)
      assert.equal(typeof replayedSource, 'string', `${group.id}: ${ownerPath}`)
      assert.ok(
        allowedHashes.includes(sha256Target113Replay(replayedSource)),
        `${group.id}: ${ownerPath} candidate hash is an exact supported root`,
      )
    }
  }
  for (const [ownerPath, source] of candidate) {
    if (source !== null && replayFixture.groups.some(group =>
      group.operations.some(operation => operation.path === ownerPath)
    )) {
      parseCandidateSource(ts, ownerPath, source)
    }
  }
})

test('each admitted unit maps to an authored declaration or integration fragment', {
  skip: !selected ? `not applicable to ${semanticCase}` : false,
}, async () => {
  const ts = await loadTypeScript()
  const historicalCandidate = historicalPackageSelected
    ? buildHistoricalCandidate().candidate
    : null
  for (const unit of fixture.units) {
    if (
      historicalPackageSelected &&
      unit.mapping.ownerKind === 'current-only-recovered'
    ) {
      continue
    }
    for (const sourceAssertion of unit.sourceAssertions) {
      let source
      if (
        historicalCandidate &&
        typeof historicalCandidate.get(sourceAssertion.path) === 'string'
      ) {
        source = historicalCandidate.get(sourceAssertion.path)
      } else {
        const filename = selectedSourceFilename(sourceAssertion.path)
        assert.ok(fs.existsSync(filename), `${unit.index}: ${sourceAssertion.path}`)
        source = fs.readFileSync(filename, 'utf8')
      }
      assert.equal(typeof source, 'string', `${unit.index}: mapped source exists`)
      const parsed = parseCandidateSource(ts, sourceAssertion.path, source)
      if (sourceAssertion.declarationName) {
        assert.ok(
          findNamedDeclaration(ts, parsed, sourceAssertion.declarationName),
          `${unit.index}: ${sourceAssertion.declarationName} declaration`,
        )
      }
      for (const fragment of sourceAssertion.requiredFragments) {
        assert.ok(source.includes(fragment), `${unit.index}: authored ${fragment}`)
      }
      if (sourceAssertion.requiredAnyFragments) {
        assert.ok(
          sourceAssertion.requiredAnyFragments.some(fragment => source.includes(fragment)),
          `${unit.index}: one compiler-introduction callsite variant`,
        )
      }
    }
  }
})

test('package replay behavior models preserve authenticated branch semantics', () => {
  const responseInputs = ['y', 'n', 'd']
  const inputToResponse = { y: 'yes', n: 'no', d: 'dont_ask_again' }
  assert.deepEqual(
    responseInputs.map(input => inputToResponse[input]),
    ['yes', 'no', 'dont_ask_again'],
  )
  assert.equal(inputToResponse['Y'.toLowerCase()], 'yes')

  const normalizeCosts = costs => ({
    inputTokens: costs.input_tokens,
    outputTokens: costs.output_tokens,
    promptCacheWriteTokens: costs.prompt_cache_write_tokens,
    promptCacheReadTokens: costs.prompt_cache_read_tokens,
    webSearchRequests: costs.web_search_requests ?? 0.01,
  })
  assert.equal(
    normalizeCosts({
      input_tokens: 1,
      output_tokens: 2,
      prompt_cache_write_tokens: 3,
      prompt_cache_read_tokens: 4,
    }).webSearchRequests,
    0.01,
  )

  const scheduleEnabled = ({ remote, gate, policy }) => !remote && gate && policy
  assert.equal(scheduleEnabled({ remote: true, gate: true, policy: true }), false)
  assert.equal(scheduleEnabled({ remote: false, gate: true, policy: true }), true)
})

test(
  'authenticated bundles pin every admitted and excluded audited unit',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    assert.equal(sha256(structuralBytes), fixture.artifacts.structuralDeltaSha256)
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), fixture.artifacts.baselineBundleSha256)
    const baseline = collectOccurrences(baselineBytes.toString('utf8'))
    const targetSource = authenticatedTargetInner(targetPath)
    const target = collectOccurrences(targetSource)

    for (const unit of [...fixture.units, ...fixture.excludedUnits]) {
      const region = structural.regions[unit.index]
      assert.deepEqual(
        {
          classification: region?.classification,
          end: region?.target?.end,
          nodeType: region?.target?.nodeType,
          sourceHash: region?.target?.sourceHash,
          start: region?.target?.start,
        },
        {
          classification: unit.structural.classification,
          end: unit.structural.end,
          nodeType: unit.structural.nodeType,
          sourceHash: unit.structural.sourceHash,
          start: unit.structural.start,
        },
        `${unit.index}: structural identity`,
      )
      assert.equal(
        sha256(targetSource.slice(unit.structural.start, unit.structural.end)),
        unit.structural.sourceHash,
        `${unit.index}: authenticated target fragment hash`,
      )
      for (const residue of unit.residues) {
        const residueIdentity = identity(residue.kind, residue.value)
        assert.equal(
          baseline.get(residueIdentity)?.length ?? 0,
          residue.baselineOccurrenceCount,
          `${unit.index}: authenticated baseline occurrence count`,
        )
        const occurrence = target.get(residueIdentity)?.[residue.targetOccurrenceNumber - 1]
        assert.deepEqual(
          occurrence && [occurrence.start, occurrence.end],
          [residue.start, residue.end],
          `${unit.index}: exact target occurrence`,
        )
        assert.ok(
          residue.targetOccurrenceNumber > residue.baselineOccurrenceCount,
          `${unit.index}: target-added ordinal`,
        )
      }
    }
  },
)
