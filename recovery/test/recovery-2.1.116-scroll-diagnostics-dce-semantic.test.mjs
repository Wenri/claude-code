import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
  timeout: 90_000,
}

const BASELINE_SHA256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const TARGET_SHA256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

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

// Complete private scroll-diagnostics closure. The units immediately after it
// (7231 and 7232) are the live shared scroll configuration and are deliberately
// excluded from this DCE proof.
const units = new Map([
  [
    7224,
    [
      3_376_972,
      3_377_050,
      'FunctionDeclaration',
      '48a37a1cd744ee4527800256ce4b49851694c12bdbc5f7841f31e5432fa378d5',
    ],
  ],
  [
    7225,
    [
      3_377_050,
      3_377_237,
      'FunctionDeclaration',
      'fbab4a0bc7c51ab7c600e1c28adf415d611eac68ab8dbaf60a0d46513228d4b3',
    ],
  ],
  [
    7226,
    [
      3_377_237,
      3_377_340,
      'FunctionDeclaration',
      '254e65b307d4293fef621dfb79d6f60e1070822470bbd5d06000ff7645c3cb07',
    ],
  ],
  [
    7227,
    [
      3_377_340,
      3_377_456,
      'FunctionDeclaration',
      'e3dbfcc17a295a05cbfa7d8616e84fb9021030e7665881d14f5bbbb763598e98',
    ],
  ],
  [
    7228,
    [
      3_377_456,
      3_377_532,
      'FunctionDeclaration',
      '555455fbc04794d85a7af4d0871282e973a2acb34c8b002c9149c12757706b45',
    ],
  ],
  [
    7229,
    [
      3_377_532,
      3_377_570,
      'VariableDeclaration',
      'bf55b6cb0affe201008479c673142d7801869047c4f86eb5e09dc50580b2548c',
    ],
  ],
  [
    7230,
    [
      3_377_570,
      3_377_648,
      'VariableDeclaration',
      '8ac1ccd01c5632bb64ae40b74ebd74ffe64c3117f2c60ccd1381945a866c82dc',
    ],
  ],
])

const residueRows = [
  ['property', 'burst', 3_377_216, 3_377_221, 7225],
  ['property', 'algo', 3_377_331, 3_377_335, 7226],
]

let cachedBundles
let cachedTargetAst

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function bundles() {
  if (cachedBundles) return cachedBundles
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(sha256(baseline), BASELINE_SHA256)
  assert.equal(sha256(target), TARGET_SHA256)
  cachedBundles = {
    baseline: baseline.toString('utf8'),
    target: target.toString('utf8'),
  }
  return cachedBundles
}

function targetAst() {
  if (cachedTargetAst) return cachedTargetAst
  cachedTargetAst = parse(bundles().target, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  return cachedTargetAst
}

function walk(value, visit, parent = null, key = null) {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit, parent, key)
    return
  }
  if (typeof value.type === 'string') visit(value, parent, key)
  for (const [childKey, child] of Object.entries(value)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(childKey)) {
      walk(child, visit, value, childKey)
    }
  }
}

function unitSource(index) {
  const [start, end] = units.get(index)
  return bundles().target.slice(start, end)
}

function parseUnit(index) {
  const ast = parse(unitSource(index), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(ast.body.length, 1, `${index}: one top-level declaration`)
  return ast.body[0]
}

function identifierUses(names) {
  const wanted = new Set(names)
  const uses = new Map(names.map(name => [name, []]))
  walk(targetAst(), (node, parent, key) => {
    if (node.type !== 'Identifier' || !wanted.has(node.name)) return
    let role = 'read'
    if (
      (parent?.type === 'FunctionDeclaration' && key === 'id') ||
      (parent?.type === 'VariableDeclarator' && key === 'id')
    ) {
      role = 'declaration'
    } else if (
      (parent?.type === 'AssignmentExpression' && key === 'left') ||
      (parent?.type === 'UpdateExpression' && key === 'argument')
    ) {
      role = 'write'
    } else if (parent?.type === 'CallExpression' && key === 'callee') {
      role = 'call'
    }
    uses.get(node.name).push({
      key,
      parent: parent?.type,
      role,
      start: node.start,
    })
  })
  for (const values of uses.values()) values.sort((a, b) => a.start - b.start)
  return uses
}

function propertyPositions(sourceAst, name) {
  const positions = []
  walk(sourceAst, node => {
    let key
    if (
      (node.type === 'Property' ||
        node.type === 'MethodDefinition' ||
        node.type === 'PropertyDefinition') &&
      node.computed === false
    ) {
      key = node.key
    } else if (node.type === 'MemberExpression' && node.computed === false) {
      key = node.property
    }
    if (key?.type === 'Identifier' && key.name === name) {
      positions.push([key.start, key.end])
    }
  })
  return positions
}

test('target116 authenticates the complete private scroll-diagnostics closure', bundleOptions, () => {
  const { target } = bundles()
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      identity,
      `${index}: structural identity`,
    )
    assert.equal(
      sha256(target.slice(identity[0], identity[1])),
      identity[3],
      `${index}: exact target bytes`,
    )
  }
})

test('u7225 burst and u7226 algo are exact target-only diagnostic residues', bundleOptions, () => {
  const { baseline, target } = bundles()
  const baselineAst = parse(baseline, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  for (const [, value, start, end, index] of residueRows) {
    assert.equal(target.slice(start, end), value, `${index}: target residue bytes`)
    const [unitStart, unitEnd] = units.get(index)
    assert.ok(start >= unitStart && end <= unitEnd, `${index}: residue containment`)
    assert.deepEqual(propertyPositions(baselineAst, value), [], `${value}: baseline absence`)
    assert.deepEqual(propertyPositions(targetAst(), value), [[start, end]], `${value}: unique target property`)
  }
})

test('the diagnostic enable flag is initialized false and is never written', bundleOptions, () => {
  const declaration = parseUnit(7229)
  assert.equal(declaration.type, 'VariableDeclaration')
  const flag = declaration.declarations.find(item => item.id.name === 'DtH')
  assert.ok(flag, 'DtH declaration')
  assert.equal(flag.init.type, 'UnaryExpression')
  assert.equal(flag.init.operator, '!')
  assert.equal(flag.init.argument.type, 'Literal')
  assert.equal(flag.init.argument.value, 1)

  const uses = identifierUses(['DtH']).get('DtH')
  assert.deepEqual(
    uses,
    [
      { key: 'value', parent: 'Property', role: 'read', start: 3_377_000 },
      { key: 'argument', parent: 'UnaryExpression', role: 'read', start: 3_377_076 },
      { key: 'argument', parent: 'UnaryExpression', role: 'read', start: 3_377_261 },
      { key: 'argument', parent: 'UnaryExpression', role: 'read', start: 3_377_360 },
      { key: 'id', parent: 'VariableDeclarator', role: 'declaration', start: 3_377_536 },
      { key: 'value', parent: 'Property', role: 'read', start: 3_377_605 },
    ],
  )
  assert.equal(uses.some(use => use.role === 'write'), false)
})

test('all three diagnostic recorders return before observing inputs or state', bundleOptions, () => {
  for (const index of [7225, 7226, 7227]) {
    const declaration = parseUnit(index)
    assert.equal(declaration.type, 'FunctionDeclaration', `${index}: function`)
    const guard = declaration.body.body[0]
    assert.equal(guard.type, 'IfStatement', `${index}: leading guard`)
    assert.equal(guard.test.type, 'UnaryExpression', `${index}: negated guard`)
    assert.equal(guard.test.operator, '!', `${index}: false flag guard`)
    assert.equal(guard.test.argument.type, 'Identifier', `${index}: flag identifier`)
    assert.equal(guard.test.argument.name, 'DtH', `${index}: shared flag`)
    assert.equal(guard.consequent.type, 'ReturnStatement', `${index}: immediate return`)
    assert.equal(guard.alternate, null, `${index}: no alternate`)
  }

  assert.match(unitSource(7225), /burst:q\.burstCount/)
  assert.match(unitSource(7226), /algo:q/)
  assert.match(unitSource(7227), /viewport:H\.getViewportHeight\(\)/)
})

test('recorders and their accumulator do not escape the guarded private closure', bundleOptions, () => {
  const uses = identifierUses([
    '_s_',
    'iB8',
    'y7K',
    'rB8',
    'E7K',
    'DtH',
    'mNH',
    'nB8',
    'lB8',
    'qs_',
    'Ks_',
    'cI$',
  ])

  const callableRoles = name => uses.get(name).map(use => use.role)
  assert.deepEqual(callableRoles('iB8'), ['declaration', 'call', 'call'])
  assert.deepEqual(callableRoles('y7K'), ['declaration', 'call'])
  assert.deepEqual(callableRoles('rB8'), ['declaration', 'call', 'call'])
  assert.deepEqual(callableRoles('E7K'), ['call', 'call', 'declaration'])
  assert.deepEqual(callableRoles('_s_'), ['declaration', 'call'])

  for (const name of ['iB8', 'y7K', 'rB8', 'E7K', '_s_']) {
    assert.equal(
      uses.get(name).every(use =>
        use.role === 'declaration' ||
        (use.role === 'call' && use.parent === 'CallExpression' && use.key === 'callee'),
      ),
      true,
      `${name}: declaration/call-only binding`,
    )
  }

  // E7K is called only after the constant-false guards in iB8/y7K, and _s_
  // is called only by E7K. The snapshot and listener state consequently has
  // no reachable mutation path.
  assert.deepEqual(uses.get('E7K').map(use => use.start), [3_377_117, 3_377_272, 3_377_465])
  assert.deepEqual(uses.get('_s_').map(use => use.start), [3_376_981, 3_377_526])

  const closureStart = units.get(7224)[0]
  const closureEnd = units.get(7230)[1]
  for (const name of ['DtH', 'mNH', 'nB8', 'lB8', 'qs_', 'Ks_']) {
    assert.equal(
      uses.get(name).every(use => use.start >= closureStart && use.start < closureEnd),
      true,
      `${name}: private to u7224-u7230`,
    )
  }

  assert.equal(uses.get('qs_').some(use => use.role === 'read'), false)
  assert.deepEqual(
    uses.get('Ks_').map(use => [use.parent, use.key, use.role]),
    [
      ['ForOfStatement', 'right', 'read'],
      ['VariableDeclarator', 'id', 'declaration'],
      ['AssignmentExpression', 'left', 'write'],
    ],
  )

  // The memoized initializer is invoked by three module initializers, but its
  // value never escapes: every use is a direct call and the initialized array,
  // snapshot object, and Set remain confined to the private bindings above.
  assert.deepEqual(
    uses.get('cI$').map(use => [use.start, use.role]),
    [
      [3_377_574, 'declaration'],
      [3_389_189, 'call'],
      [10_403_158, 'call'],
      [12_085_269, 'call'],
    ],
  )
  assert.match(unitSource(7230), /mNH=\[\],qs_=\{enabled:DtH,events:mNH,position:nB8\},Ks_=new Set/)
})
