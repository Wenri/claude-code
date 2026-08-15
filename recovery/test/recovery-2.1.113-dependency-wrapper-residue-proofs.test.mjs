import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-dependency-wrapper-residue-proofs.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
const structuralBytes = fs.readFileSync(
  path.join(caseRoot, 'structural/generated-delta.json.gz'),
)
const structural = JSON.parse(gunzipSync(structuralBytes))
const partitionsBytes = fs.readFileSync(
  path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
)
const partitions = gunzipSync(partitionsBytes)
  .toString('utf8')
  .trimEnd()
  .split('\n')
  .map(line => JSON.parse(line))
const FIXTURE_SHA256 =
  '1b23c15d7a9002d93cf78dec05a094b95164f796b345112e9888d0781bc65220'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags].sort().join('')}`
  }
  return `${kind}:${kind === 'string' || kind === 'property' ? JSON.stringify(value) : String(value)}`
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
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
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
  return { ast, grouped }
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifact.targetInnerSha256) return bytes.toString('utf8')
  assert.equal(
    digest,
    fixture.artifact.targetWrapperSha256,
    'authenticated target wrapper',
  )
  const inner = bytes.subarray(
    fixture.artifact.targetWrapperPrefixLength,
    bytes.length - fixture.artifact.targetWrapperSuffixLength,
  )
  assert.equal(
    sha256(inner),
    fixture.artifact.targetInnerSha256,
    'authenticated target inner',
  )
  return inner.toString('utf8')
}

test('the target113 dependency-wrapper fixture is narrow and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.equal(sha256(partitionsBytes), fixture.artifact.partitionsGzipSha256)
  assert.deepEqual(fixture.summary, { units: 3, residues: 35 })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [8708, 10184, 15317],
  )
  assert.equal(
    fixture.rows.reduce((count, row) => count + row.residues.length, 0),
    fixture.summary.residues,
  )

  for (const row of fixture.rows) {
    assert.ok(row.source.startsWith('../node_modules/'))
    assert.ok(row.source.includes(row.package))
    assert.ok(row.residues.length > 0)
    const partition = partitions.find(
      item =>
        (item.sourceCandidates ?? []).includes(row.sourceIndex) ||
        (item.relocatedSourceCandidates ?? []).includes(row.sourceIndex),
    )
    assert.ok(partition, `${row.targetIndex}: package candidate partition exists`)
    assert.ok(
      partition.target.offsetStart <= row.target[1] &&
        partition.target.offsetEnd >= row.target[2],
      `${row.targetIndex}: package candidate partition encloses exact target unit`,
    )
    for (const residue of row.residues) {
      assert.equal(residue.length, 6, `${row.targetIndex}: residue tuple`)
      const [kind, value, start, end, baselineCount, targetOrdinal] = residue
      assert.ok(['bigint', 'number', 'property', 'regexp', 'string'].includes(kind))
      assert.ok(value !== undefined)
      assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start)
      assert.ok(start >= row.target[1] && end <= row.target[2])
      assert.ok(Number.isSafeInteger(baselineCount) && baselineCount >= 0)
      assert.ok(Number.isSafeInteger(targetOrdinal) && targetOrdinal > baselineCount)
    }
  }
})

test(
  'authenticated bundles pin every dependency-wrapper target-added residue',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), fixture.artifact.baselineSha256)
    const baseline = collectOccurrences(baselineBytes.toString('utf8'))
    const targetSource = authenticatedTargetInner(targetPath)
    const target = collectOccurrences(targetSource)

    for (const row of fixture.rows) {
      const [classification, start, end, nodeType, sourceHash] = row.target
      const region = structural.regions[row.targetIndex]
      assert.equal(region?.target?.index, row.targetIndex)
      assert.deepEqual(
        [
          region.classification,
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        row.target,
        `${row.targetIndex}: structural identity`,
      )
      assert.equal(classification, 'unresolved')
      const targetUnit = targetSource.slice(start, end)
      assert.equal(sha256(targetUnit), sourceHash, `${row.targetIndex}: target bytes`)
      const unitSyntax = collectOccurrences(targetUnit)
      assert.equal(unitSyntax.ast.body.length, 1, `${row.targetIndex}: one complete unit`)
      assert.equal(unitSyntax.ast.body[0].type, nodeType)
      assert.match(targetUnit, /^var [\w$]+=d\(\(/, `${row.targetIndex}: CJS wrapper`)

      for (const residue of row.residues) {
        const [kind, value, residueStart, residueEnd, baselineCount, targetOrdinal] =
          residue
        const residueIdentity = identity(kind, value)
        const baselineOccurrences = baseline.grouped.get(residueIdentity) ?? []
        const targetOccurrences = target.grouped.get(residueIdentity) ?? []
        assert.equal(
          baselineOccurrences.length,
          baselineCount,
          `${row.targetIndex}: ${residueIdentity} baseline count`,
        )
        const occurrence = targetOccurrences[targetOrdinal - 1]
        assert.ok(occurrence, `${row.targetIndex}: ${residueIdentity} ordinal`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [residueStart, residueEnd],
          `${row.targetIndex}: ${residueIdentity} exact range`,
        )
        assert.ok(
          (unitSyntax.grouped.get(residueIdentity) ?? []).some(
            local => local.start + start === residueStart && local.end + start === residueEnd,
          ),
          `${row.targetIndex}: ${residueIdentity} belongs to exact wrapper`,
        )
      }
    }
  },
)
