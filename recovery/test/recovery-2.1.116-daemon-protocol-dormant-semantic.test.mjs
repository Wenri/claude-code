import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const pairOptions = {
  // Bun's node:test shim does not currently honor a string-valued skip reason.
  skip: !selected || !baselineBundlePath || !targetBundlePath,
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

const baselineUnits = new Map([
  [
    17274,
    [
      10786608,
      10786675,
      'VariableDeclaration',
      'fe568978f5ec5d9d60ed7c6a8b1f4d21eb7bc2577ae33046914a44508baee82a',
    ],
  ],
  [
    17275,
    [
      10786675,
      10789130,
      'VariableDeclaration',
      '2dead9a8188760cccda58a86facd3f3b02e4c6bbc6e04c4ac1aff0f2d213e0a3',
    ],
  ],
])

const targetUnits = new Map([
  [
    17426,
    [
      10847503,
      10847576,
      'VariableDeclaration',
      '179ba9f4b7430aef09f327e5054955d781f489d3d00bf9a606e3aed66f1c49e6',
    ],
  ],
  [
    17427,
    [
      10847576,
      10850300,
      'VariableDeclaration',
      '2332b7aca56176a953f0bf2d642c8e6740e53bec9a2b261610ab6b3324ea89ea',
    ],
  ],
])

const baselineFamily = ['Jy1', 'Xy1', 'tYY', 'eYY', 'HOY']
const targetFamily = ['ad7', 'QC1', 'lC1', 'RGY', 'bGY']

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function unitSlices(bundle, units) {
  return [...units.values()].map(([start, end]) => bundle.slice(start, end))
}

function pinBaselineUnits(bundle) {
  for (const [index, identity] of baselineUnits) {
    const [start, end, nodeType, sourceHash] = identity
    const region = structural.unmatchedBaseline.find(
      candidate => candidate.index === index,
    )
    assert.ok(region, `${index}: unmatched baseline unit`)
    assert.deepEqual(
      [region.start, region.end, region.nodeType, region.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = bundle.slice(start, end)
    assert.equal(sha256(unit), sourceHash, `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'script' }).body.length,
      1,
      `${index}: one ${nodeType}`,
    )
  }
}

function pinTargetUnits(bundle) {
  for (const [index, identity] of targetUnits) {
    const [start, end, nodeType, sourceHash] = identity
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
    const unit = bundle.slice(start, end)
    assert.equal(sha256(unit), sourceHash, `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'script' }).body.length,
      1,
      `${index}: one ${nodeType}`,
    )
  }
}

function identifierTokenPositions(source, names) {
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

function walkAst(node, visitor, ancestors = []) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visitor, ancestors)
    return
  }
  if (typeof node.type !== 'string') return

  const nextAncestors = [...ancestors, node]
  visitor(node, nextAncestors)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(child)) {
      for (const entry of child) walkAst(entry, visitor, nextAncestors)
    } else {
      walkAst(child, visitor, nextAncestors)
    }
  }
}

function familyAnalysis(source, family) {
  const wanted = new Set(family)
  const roles = new Map(
    family.map(name => [name, { declaration: 0, write: 0, call: 0 }]),
  )
  const assignments = new Map()
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })

  walkAst(ast, (node, ancestors) => {
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
  for (const name of family) {
    const assignment = assignments.get(name)
    assert.ok(assignment, `${name}: lazy factory assignment`)
    assert.equal(assignment.operator, '=')
    assert.equal(assignment.right.type, 'CallExpression')
    assert.equal(assignment.right.callee.type, 'Identifier')
    assert.equal(assignment.right.arguments.length, 1)
    assert.equal(assignment.right.arguments[0].type, 'ArrowFunctionExpression')
    wrappers.add(assignment.right.callee.name)

    const dependencies = []
    walkAst(assignment.right.arguments[0].body, node => {
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
  assert.equal(wrappers.size, 1, 'one lazy-schema wrapper per version')
  return { graph, roles, wrapper: [...wrappers][0] }
}

function detachBinding(unit) {
  const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'script' })
  for (const declaration of ast.body[0].declarations) {
    if (
      declaration.id.type === 'Identifier' &&
      declaration.init?.type === 'Literal' &&
      declaration.init.value === '\x1B_cc-daemon-detach\x1B\\'
    ) {
      return declaration.id.name
    }
  }
  assert.fail('DETACH_SEQUENCE binding')
}

test('target116 pins the changed daemon protocol declaration units', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(targetBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  pinBaselineUnits(baselineBytes.toString('utf8'))
  pinTargetUnits(targetBytes.toString('utf8'))
})

test('the changed schema family is an unrooted lazy-factory graph', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const baselineRange = [baselineUnits.get(17274)[0], baselineUnits.get(17275)[1]]
  const targetRange = [targetUnits.get(17426)[0], targetUnits.get(17427)[1]]
  const baselineUnitsSource = unitSlices(baseline, baselineUnits).join('')
  const targetUnitsSource = unitSlices(target, targetUnits).join('')

  const baselineAnalysis = familyAnalysis(baselineUnitsSource, baselineFamily)
  assert.equal(baselineAnalysis.wrapper, 'IH')
  assert.deepEqual(Object.fromEntries(baselineAnalysis.roles), {
    Jy1: { declaration: 1, write: 1, call: 1 },
    Xy1: { declaration: 1, write: 1, call: 1 },
    tYY: { declaration: 1, write: 1, call: 0 },
    eYY: { declaration: 1, write: 1, call: 0 },
    HOY: { declaration: 1, write: 1, call: 0 },
  })
  assert.deepEqual(Object.fromEntries(baselineAnalysis.graph), {
    Jy1: [],
    Xy1: ['Jy1'],
    tYY: ['Xy1'],
    eYY: [],
    HOY: [],
  })

  const targetAnalysis = familyAnalysis(targetUnitsSource, targetFamily)
  assert.equal(targetAnalysis.wrapper, 'EH')
  assert.deepEqual(Object.fromEntries(targetAnalysis.roles), {
    ad7: { declaration: 1, write: 1, call: 2 },
    QC1: { declaration: 1, write: 1, call: 1 },
    lC1: { declaration: 1, write: 1, call: 0 },
    RGY: { declaration: 1, write: 1, call: 0 },
    bGY: { declaration: 1, write: 1, call: 0 },
  })
  assert.deepEqual(Object.fromEntries(targetAnalysis.graph), {
    ad7: [],
    QC1: ['ad7'],
    lC1: ['QC1'],
    RGY: ['ad7'],
    bGY: [],
  })

  // Tokenize the authenticated full bundles, not just the pinned slices. Every
  // schema declaration, write, and read must remain inside this unrooted graph.
  // This rules out a consumer, callback registration, export, or other escape.
  for (const [name, positions] of identifierTokenPositions(
    baseline,
    baselineFamily,
  )) {
    assert.equal(
      positions.length,
      Object.values(baselineAnalysis.roles.get(name)).reduce((a, b) => a + b),
      `${name}: exact occurrence count`,
    )
    assert.equal(
      positions.every(position => position >= baselineRange[0] && position < baselineRange[1]),
      true,
      `${name}: no external reference`,
    )
  }
  for (const [name, positions] of identifierTokenPositions(target, targetFamily)) {
    assert.equal(
      positions.length,
      Object.values(targetAnalysis.roles.get(name)).reduce((a, b) => a + b),
      `${name}: exact occurrence count`,
    )
    assert.equal(
      positions.every(position => position >= targetRange[0] && position < targetRange[1]),
      true,
      `${name}: no external reference`,
    )
  }
})

test('only the unchanged detach value escapes the dormant schema cluster', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const baselineDeclaration = baseline.slice(
    baselineUnits.get(17274)[0],
    baselineUnits.get(17274)[1],
  )
  const targetDeclaration = target.slice(
    targetUnits.get(17426)[0],
    targetUnits.get(17426)[1],
  )
  const baselineDetach = detachBinding(baselineDeclaration)
  const targetDetach = detachBinding(targetDeclaration)
  assert.equal(baselineDetach, 'DB7')
  assert.equal(targetDetach, 'od7')

  for (const [bundle, name, range] of [
    [baseline, baselineDetach, [baselineUnits.get(17274)[0], baselineUnits.get(17275)[1]]],
    [target, targetDetach, [targetUnits.get(17426)[0], targetUnits.get(17427)[1]]],
  ]) {
    const positions = identifierTokenPositions(bundle, [name]).get(name)
    assert.equal(positions.length, 2, `${name}: declaration plus one consumer`)
    assert.equal(
      positions.filter(position => position >= range[0] && position < range[1]).length,
      1,
      `${name}: declaration in cluster`,
    )
    const external = positions.find(position => position < range[0] || position >= range[1])
    assert.ok(external, `${name}: external consumer`)
    assert.equal(
      bundle.slice(external - 'Buffer.from('.length, external + name.length + ',"ascii")'.length),
      `Buffer.from(${name},"ascii")`,
      `${name}: sole escape is the detach buffer`,
    )
  }

  const baselineFactory = baseline.slice(
    baselineUnits.get(17275)[0],
    baselineUnits.get(17275)[1],
  )
  const targetFactory = target.slice(
    targetUnits.get(17427)[0],
    targetUnits.get(17427)[1],
  )
  for (const introduced of [
    'procStart:',
    'ptySock:',
    'positive().optional()',
    'op:N.literal("nudge")',
    'op:N.literal("dispatch")',
    'op:N.literal("has")',
  ]) {
    assert.equal(baselineFactory.includes(introduced), false, `${introduced}: baseline`)
    assert.equal(targetFactory.includes(introduced), true, `${introduced}: target`)
  }
  assert.equal(
    targetFactory.split('.min(kj6).max(vi)').length - 1,
    3,
    'bounded protocol version schemas',
  )

  // The changed literals live only under uncalled schema callbacks. The graph
  // above has no external root, while the unchanged DETACH_SEQUENCE does. This
  // is definition-only/static DCE and has no source-runtime owner to recover.
})
