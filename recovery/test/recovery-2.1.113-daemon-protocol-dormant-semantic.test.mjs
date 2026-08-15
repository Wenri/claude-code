import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
      : false,
  timeout: 90_000,
}
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = new Map([
  [
    17274,
    {
      end: 10786675,
      nodeType: 'VariableDeclaration',
      residueCount: 1,
      residueDigest:
        '40dd262334dd58c196e74d67b72c0ec303f5edd64fdcefc84b7c3b0df486719f',
      sourceHash:
        'fe568978f5ec5d9d60ed7c6a8b1f4d21eb7bc2577ae33046914a44508baee82a',
      start: 10786608,
    },
  ],
  [
    17275,
    {
      end: 10789130,
      nodeType: 'VariableDeclaration',
      residueCount: 53,
      residueDigest:
        'a76ac912e6a861f0b5ea1e26206d4b051a9aaa4a23dbfd1d676efb270b167fa7',
      sourceHash:
        '2dead9a8188760cccda58a86facd3f3b02e4c6bbc6e04c4ac1aff0f2d213e0a3',
      start: 10786675,
    },
  ],
])
const schemaFamily = ['Jy1', 'Xy1', 'tYY', 'eYY', 'HOY']

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${canonicalFlags(value.flags)}`
  }
  return `${kind}:${kind === 'string' || kind === 'property' ? JSON.stringify(value) : String(value)}`
}

function walk(node, visit, ancestors = []) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, ancestors)
    return
  }
  if (typeof node.type !== 'string') return
  const nextAncestors = [...ancestors, node]
  visit(node, nextAncestors)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit, nextAncestors)
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
  const add = (kind, value, start, end) =>
    occurrences.push({ end, identity: identity(kind, value), kind, start, value })
  walk(ast, node => {
    if (node.type === 'Literal') {
      if (node.regex) {
        add(
          'regexp',
          {
            flags: canonicalFlags(node.regex.flags),
            pattern: node.regex.pattern,
          },
          node.start,
          node.end,
        )
      } else if (typeof node.value === 'string') {
        add('string', node.value, node.start, node.end)
      } else if (typeof node.value === 'number') {
        add('number', String(node.value), node.start, node.end)
      } else if (node.bigint !== undefined) {
        add('bigint', String(node.bigint), node.start, node.end)
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node.start, node.end)
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
      add('property', property.name, property.start, property.end)
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  const grouped = new Map()
  for (const occurrence of occurrences) {
    const values = grouped.get(occurrence.identity) ?? []
    values.push(occurrence)
    grouped.set(occurrence.identity, values)
  }
  return { ast, grouped, occurrences }
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba') {
    return bytes.toString('utf8')
  }
  assert.equal(
    digest,
    'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681',
  )
  const inner = bytes.subarray(87, bytes.length - 3)
  assert.equal(
    sha256(inner),
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
  )
  return inner.toString('utf8')
}

function identifierPositions(source, names) {
  const wanted = new Set(names)
  const positions = new Map(names.map(name => [name, []]))
  for (const token of tokenizer(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'script',
  })) {
    if (token.type.label === 'name' && wanted.has(token.value)) {
      positions.get(token.value).push(token.start)
    }
  }
  return positions
}

function schemaFamilyAnalysis(source) {
  const wanted = new Set(schemaFamily)
  const roles = new Map(
    schemaFamily.map(name => [name, { call: 0, declaration: 0, write: 0 }]),
  )
  const assignments = new Map()
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  walk(ast, (node, ancestors) => {
    if (node.type !== 'Identifier' || !wanted.has(node.name)) return
    const parent = ancestors.at(-2)
    if (parent.type === 'VariableDeclarator' && parent.id === node) {
      roles.get(node.name).declaration += 1
    } else if (parent.type === 'AssignmentExpression' && parent.left === node) {
      roles.get(node.name).write += 1
      assignments.set(node.name, parent)
    } else if (parent.type === 'CallExpression' && parent.callee === node) {
      roles.get(node.name).call += 1
    } else {
      assert.fail(`${node.name}: unexpected reference role ${parent.type}`)
    }
  })

  const graph = new Map()
  const wrappers = new Set()
  for (const name of schemaFamily) {
    const assignment = assignments.get(name)
    assert.ok(assignment, `${name}: lazy factory assignment`)
    assert.equal(assignment.right.type, 'CallExpression')
    assert.equal(assignment.right.arguments.length, 1)
    assert.equal(assignment.right.arguments[0].type, 'ArrowFunctionExpression')
    wrappers.add(assignment.right.callee.name)
    const dependencies = []
    walk(assignment.right.arguments[0].body, node => {
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        wanted.has(node.callee.name)
      ) {
        dependencies.push(node.callee.name)
      }
    })
    graph.set(name, dependencies)
  }
  return { graph, roles, wrappers }
}

test('target113 pins the exact daemon protocol declaration cluster', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  assert.equal(
    sha256(baselineBytes),
    'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  )
  const target = authenticatedTargetInner(targetPath)
  for (const [index, unit] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [unit.start, unit.end, unit.nodeType, unit.sourceHash],
      `u${index}: structural identity`,
    )
    const fragment = target.slice(unit.start, unit.end)
    assert.equal(sha256(fragment), unit.sourceHash, `u${index}: exact bytes`)
    const ast = parse(fragment, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(ast.body.length, 1, `u${index}: one complete unit`)
    assert.equal(ast.body[0].type, unit.nodeType)
  }
})

test('all 54 daemon-cluster residues are exact target-added occurrences', bundleOptions, () => {
  const baseline = collectOccurrences(fs.readFileSync(baselinePath, 'utf8'))
  const targetSource = authenticatedTargetInner(targetPath)
  const target = collectOccurrences(targetSource)
  for (const [index, unit] of units) {
    const rows = target.occurrences
      .filter(occurrence => occurrence.start >= unit.start && occurrence.end <= unit.end)
      .map(occurrence => {
        const targetOrdinal =
          target.grouped.get(occurrence.identity).indexOf(occurrence) + 1
        const baselineCount = (baseline.grouped.get(occurrence.identity) ?? []).length
        return { baselineCount, occurrence, targetOrdinal }
      })
      .filter(({ baselineCount, targetOrdinal }) => targetOrdinal > baselineCount)
      .map(({ baselineCount, occurrence, targetOrdinal }) => [
        occurrence.kind,
        occurrence.value,
        occurrence.start,
        occurrence.end,
        baselineCount,
        targetOrdinal,
      ])
    assert.equal(rows.length, unit.residueCount, `u${index}: residue count`)
    assert.equal(
      sha256(JSON.stringify(rows)),
      unit.residueDigest,
      `u${index}: exact residue rows`,
    )
  }
})

test('the target113 schema family is an unrooted static-DCE graph', bundleOptions, () => {
  const target = authenticatedTargetInner(targetPath)
  const start = units.get(17274).start
  const end = units.get(17275).end
  const cluster = target.slice(start, end)
  const analysis = schemaFamilyAnalysis(cluster)
  assert.deepEqual([...analysis.wrappers], ['IH'])
  assert.deepEqual(Object.fromEntries(analysis.roles), {
    Jy1: { call: 1, declaration: 1, write: 1 },
    Xy1: { call: 1, declaration: 1, write: 1 },
    tYY: { call: 0, declaration: 1, write: 1 },
    eYY: { call: 0, declaration: 1, write: 1 },
    HOY: { call: 0, declaration: 1, write: 1 },
  })
  assert.deepEqual(Object.fromEntries(analysis.graph), {
    Jy1: [],
    Xy1: ['Jy1'],
    tYY: ['Xy1'],
    eYY: [],
    HOY: [],
  })
  for (const [name, positions] of identifierPositions(target, schemaFamily)) {
    assert.equal(
      positions.length,
      Object.values(analysis.roles.get(name)).reduce((sum, value) => sum + value),
      `${name}: exact declaration/write/call count`,
    )
    assert.ok(
      positions.every(position => position >= start && position < end),
      `${name}: no consumer outside the dormant cluster`,
    )
  }
  for (const token of [
    'rendezvousSock',
    'messagingSock',
    'supervisorPid',
    'await-ack',
    'ensure-spare',
    'permission-response',
    'respawnFlags',
  ]) {
    assert.ok(cluster.includes(token), token)
  }
})

test('only the adjacent detach constant escapes the dormant cluster', bundleOptions, () => {
  const target = authenticatedTargetInner(targetPath)
  const start = units.get(17274).start
  const end = units.get(17275).end
  const positions = identifierPositions(target, ['DB7']).get('DB7')
  assert.equal(positions.length, 2, 'detach declaration plus one consumer')
  assert.equal(
    positions.filter(position => position >= start && position < end).length,
    1,
  )
  const external = positions.find(position => position < start || position >= end)
  assert.ok(external)
  assert.equal(
    target.slice(
      external - 'Buffer.from('.length,
      external + 'DB7'.length + ',"ascii")'.length,
    ),
    'Buffer.from(DB7,"ascii")',
  )
  assert.equal(
    fs.existsSync(path.join(repositoryRoot, 'src/daemon/protocol.ts')),
    false,
    'the unrooted callback graph has no live source-runtime owner to recover',
  )
})
