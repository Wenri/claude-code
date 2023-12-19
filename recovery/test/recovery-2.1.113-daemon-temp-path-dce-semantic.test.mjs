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
const historicalPackageSelected = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_TARGET_COMMIT,
)
const selectedSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const target114Path = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const target116Path = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const artifacts = {
  baselineSha256:
    'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  structuralGzipSha256:
    '383448923995bb86060ce91beac2bc5adac35817a0cdff35b533135c7d24345f',
  targetInnerSha256:
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
  targetWrapperSha256:
    'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681',
}

const targetUnit = {
  index: 19322,
  identity: [
    'unresolved',
    11_830_478,
    11_830_736,
    'VariableDeclaration',
    '8c6112d86eefe2587586bea33706006bbf072036d668d9e1759d5a0791d6e48a',
  ],
  residues: [
    ['string', 'os', 11_830_543, 11_830_547, 71, 80],
    ['property', 'createHash', 11_830_615, 11_830_625, 17, 48],
    ['property', 'join', 11_830_685, 11_830_689, 1_619, 2_120],
    ['property', 'tmpdir', 11_830_694, 11_830_700, 3, 9],
    ['string', 'cc-daemon-', 11_830_704, 11_830_714, 0, 1],
  ],
}

const expectedTarget113Bindings = new Map([
  [
    'de7',
    [
      [11_830_462, 'declaration'],
      [11_830_509, 'write'],
      [11_830_611, 'read'],
    ],
  ],
  [
    'ce7',
    [
      [11_830_466, 'declaration'],
      [11_830_531, 'write'],
      [11_830_690, 'read'],
    ],
  ],
  [
    'sJ6',
    [
      [11_830_470, 'declaration'],
      [11_830_549, 'write'],
      [11_830_681, 'read'],
    ],
  ],
  [
    'm_O',
    [
      [11_830_474, 'declaration'],
      [11_830_569, 'write'],
    ],
  ],
  [
    'p68',
    [
      [11_830_482, 'declaration'],
      [11_830_767, 'call'],
      [11_830_820, 'call'],
      [11_837_437, 'call'],
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  return `${kind}:${JSON.stringify(value)}`
}

function walk(node, visit, parent = null, key = null) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent, key)
    return
  }
  if (typeof node.type === 'string') visit(node, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(childKey)) {
      walk(child, visit, node, childKey)
    }
  }
}

function identifierRole(node, parent, key) {
  if (parent?.type === 'VariableDeclarator' && key === 'id') {
    return 'declaration'
  }
  if (
    (parent?.type === 'AssignmentExpression' && key === 'left') ||
    parent?.type === 'UpdateExpression'
  ) {
    return 'write'
  }
  if (
    ['CallExpression', 'NewExpression', 'TaggedTemplateExpression'].includes(
      parent?.type,
    ) &&
    ['callee', 'tag'].includes(key)
  ) {
    return 'call'
  }
  if (
    (parent?.type === 'MemberExpression' &&
      key === 'property' &&
      !parent.computed) ||
    (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
      parent?.type,
    ) &&
      key === 'key' &&
      !parent.computed &&
      !parent.shorthand)
  ) {
    return 'property'
  }
  return 'read'
}

function analyze(source, bindingNames = []) {
  const names = [...bindingNames]
  const wantedBindings = new Set(names)
  const occurrences = new Map()
  const bindings = new Map(names.map(name => [name, []]))
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })

  function add(kind, value, start, end) {
    const key = identity(kind, value)
    const rows = occurrences.get(key) ?? []
    rows.push([start, end])
    occurrences.set(key, rows)
  }

  walk(ast, (node, parent, key) => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node.start, node.end)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node.start, node.end)
    }
    const property =
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
        ? node.property
        : ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
              node.type,
            ) &&
              !node.computed &&
              node.key?.type === 'Identifier'
          ? node.key
          : null
    if (property) add('property', property.name, property.start, property.end)
    if (node.type === 'Identifier' && wantedBindings.has(node.name)) {
      bindings.get(node.name).push({
        end: node.end,
        role: identifierRole(node, parent, key),
        start: node.start,
      })
    }
  })
  return { bindings, occurrences }
}

function identifierTokenPositions(source, names) {
  const wanted = new Set(names)
  const positions = new Map(names.map(name => [name, []]))
  for (const token of tokenizer(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })) {
    if (token.type.label === 'name' && wanted.has(token.value)) {
      positions.get(token.value).push(token.start)
    }
  }
  return positions
}

function authenticatedInner(filename, expected) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === expected.innerSha256) return bytes.toString('utf8')
  assert.equal(digest, expected.wrapperSha256)
  const inner = bytes.subarray(87, bytes.length - 3)
  assert.equal(sha256(inner), expected.innerSha256)
  return inner.toString('utf8')
}

function readStructural(caseDirectory, expectedSha256) {
  const bytes = fs.readFileSync(
    path.join(
      repositoryRoot,
      'recovery/cases',
      caseDirectory,
      'structural/generated-delta.json.gz',
    ),
  )
  assert.equal(sha256(bytes), expectedSha256)
  return JSON.parse(gunzipSync(bytes))
}

function assertRegion(region, expected, label) {
  assert.deepEqual(
    [
      region?.classification,
      region?.target?.start,
      region?.target?.end,
      region?.target?.nodeType,
      region?.target?.sourceHash,
    ],
    expected,
    label,
  )
}

function assertBindingTopology(actualBindings, expectedBindings) {
  for (const [name, expected] of expectedBindings) {
    const actual = actualBindings.get(name) ?? []
    assert.deepEqual(
      actual.map(row => [row.start, row.role]),
      expected,
      `${name}: complete-bundle references`,
    )
    assert.equal(
      actual.every(row => row.end === row.start + name.length),
      true,
      `${name}: token extent`,
    )
  }
}

function findAssignment(node, name) {
  let found
  walk(node, candidate => {
    if (
      !found &&
      candidate.type === 'AssignmentExpression' &&
      candidate.left?.type === 'Identifier' &&
      candidate.left.name === name
    ) {
      found = candidate
    }
  })
  return found
}

const authenticatedOptions = {
  skip: !selected || !baselinePath || !targetPath,
  timeout: 90_000,
}

test(
  'target113 daemon temp-path unit, residues, and full-bundle DCE topology are authenticated',
  authenticatedOptions,
  () => {
    const structural = readStructural(
      caseName,
      artifacts.structuralGzipSha256,
    )
    assertRegion(
      structural.regions[targetUnit.index],
      targetUnit.identity,
      '19322: structural identity',
    )

    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), artifacts.baselineSha256)
    const target = authenticatedInner(targetPath, {
      innerSha256: artifacts.targetInnerSha256,
      wrapperSha256: artifacts.targetWrapperSha256,
    })
    const [, start, end, nodeType, sourceHash] = targetUnit.identity
    const unit = target.slice(start, end)
    assert.equal(sha256(unit), sourceHash)
    const unitAst = parse(unit, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(unitAst.body.length, 1)
    assert.equal(unitAst.body[0].type, nodeType)

    const baseline = analyze(baselineBytes.toString('utf8'))
    const targetAnalysis = analyze(target, expectedTarget113Bindings.keys())
    for (const [
      kind,
      value,
      residueStart,
      residueEnd,
      baselineCount,
      targetOrdinal,
    ] of targetUnit.residues) {
      const key = identity(kind, value)
      assert.equal(
        baseline.occurrences.get(key)?.length ?? 0,
        baselineCount,
        `${key}: baseline count`,
      )
      assert.deepEqual(
        targetAnalysis.occurrences.get(key)?.[targetOrdinal - 1],
        [residueStart, residueEnd],
        `${key}: target-added ordinal`,
      )
      assert.ok(targetOrdinal > baselineCount, `${key}: target addition`)
    }
    assertBindingTopology(
      targetAnalysis.bindings,
      expectedTarget113Bindings,
    )

    const declaration = unitAst.body[0].declarations[0]
    assert.equal(declaration.id.name, 'p68')
    assert.equal(declaration.init.callee.name, 'v')
    assert.equal(declaration.init.arguments.length, 1)
    const initialize = declaration.init.arguments[0]
    assert.equal(initialize.type, 'ArrowFunctionExpression')
    const memoAssignment = findAssignment(initialize, 'm_O')
    assert.ok(memoAssignment)
    assert.equal(memoAssignment.right.type, 'CallExpression')
    assert.equal(memoAssignment.right.callee.name, 'O8')
    assert.deepEqual(
      memoAssignment.right.arguments.map(argument => argument.type),
      ['ArrowFunctionExpression', 'ArrowFunctionExpression'],
    )
    const factory = memoAssignment.right.arguments[0]
    const daemonTemplate = unitAst.body[0] &&
      unit.slice(factory.start, factory.end)
    assert.match(daemonTemplate, /`cc-daemon-\$\{H\}`/)
    assert.equal(
      unit.slice(0, factory.start).includes('cc-daemon-') ||
        unit.slice(factory.end).includes('cc-daemon-'),
      false,
      'the target-only path literal is confined to the unconsumed memo factory',
    )
  },
)

test(
  'executing the reachable initializer allocates but never evaluates the path factory',
  {
    skip: !selected || !targetPath,
  },
  () => {
    const target = authenticatedInner(targetPath, {
      innerSha256: artifacts.targetInnerSha256,
      wrapperSha256: artifacts.targetWrapperSha256,
    })
    const [, start, end] = targetUnit.identity
    const unit = target.slice(start, end)
    const trace = []
    const callbacks = []
    const sentinel = Object.freeze({ memo: 'unconsumed' })
    const forbidden = operation => () => {
      throw new Error(`${operation} must remain inside the dormant factory`)
    }
    const runtime = Function(
      'v',
      'FK',
      'G5H',
      'F$',
      'require',
      'O8',
      's8',
      'process',
      `let de7, ce7, sJ6, m_O; ${unit}; return { initialize: p68, memo: () => m_O }`,
    )(
      initialize => initialize,
      () => trace.push('FK'),
      () => trace.push('G5H'),
      () => trace.push('F$'),
      module => {
        trace.push(`require:${module}`)
        if (module === 'crypto') {
          return { createHash: forbidden('createHash') }
        }
        if (module === 'os') return { tmpdir: forbidden('tmpdir') }
        if (module === 'path') return { join: forbidden('join') }
        throw new Error(`unexpected module ${module}`)
      },
      (factory, resolver) => {
        trace.push('O8')
        callbacks.push(factory, resolver)
        return sentinel
      },
      forbidden('configuration root'),
      { getuid: forbidden('getuid') },
    )

    runtime.initialize()
    assert.deepEqual(trace, [
      'FK',
      'G5H',
      'F$',
      'require:crypto',
      'require:os',
      'require:path',
      'O8',
    ])
    assert.equal(callbacks.length, 2)
    assert.equal(callbacks.every(callback => typeof callback === 'function'), true)
    assert.equal(runtime.memo(), sentinel)
  },
)

test(
  'the historical target113 package intentionally omits a source owner for the DCE unit',
  {
    skip: !selected || !historicalPackageSelected,
  },
  () => {
    assert.ok(
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT,
      'historical audit must select the raw-target + supplement source root',
    )
    assert.ok(
      fs.existsSync(path.join(selectedSourceRoot, 'cli/update.ts')),
      'the selected source root must be a materialized target113 src tree',
    )
    assert.equal(
      fs.existsSync(path.join(selectedSourceRoot, 'daemon/paths.ts')),
      false,
      'u19322 must not recover the later daemon/paths.ts owner',
    )
  },
)

test(
  'the unconsumed accessor persists exactly through target114 and its target116 evolution',
  {
    skip: !selected || !target114Path || !target116Path,
    timeout: 90_000,
  },
  () => {
    const target114 = authenticatedInner(target114Path, {
      innerSha256:
        'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
      wrapperSha256:
        '5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83',
    })
    const target116 = authenticatedInner(target116Path, {
      innerSha256:
        'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
      wrapperSha256:
        '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
    })
    const structural114 = readStructural(
      '2.1.113-to-2.1.114',
      '7c8388ac99c3ae3e777a2e0bc3f84a5c929818d070d071fcf3939ea5072942e8',
    )
    const structural116 = readStructural(
      '2.1.114-to-2.1.116',
      '77ae38f5e31dc5ac6eac074f18253d4c67b20fa8a07e00d3caf31519af44fb16',
    )
    const identity114 = [
      'matched',
      11_830_481,
      11_830_739,
      'VariableDeclaration',
      targetUnit.identity[4],
    ]
    const identity116 = [
      'unresolved',
      11_920_895,
      11_921_248,
      'VariableDeclaration',
      'ff704f2c2d1e573274d1ccf4488e818091d4a6d97e2d3ed9e5fe2328ee65ef79',
    ]
    assertRegion(structural114.regions[19322], identity114, 'target114:19322')
    assertRegion(structural116.regions[19574], identity116, 'target116:19574')

    const unit114 = target114.slice(identity114[1], identity114[2])
    const unit116 = target116.slice(identity116[1], identity116[2])
    assert.equal(sha256(unit114), identity114[4])
    assert.equal(sha256(unit116), identity116[4])
    assert.match(unit116, /process\.env\.TERMUX_VERSION/)
    assert.match(unit116, /`cc-daemon-\$\{H\}`/)

    const topology114 = identifierTokenPositions(
      target114,
      [...expectedTarget113Bindings.keys()],
    )
    for (const [name, rows] of expectedTarget113Bindings) {
      assert.deepEqual(
        topology114.get(name),
        rows.map(([start]) => start + 3),
        `target114 ${name}: unchanged complete-bundle positions`,
      )
    }

    const expected116 = new Map([
      [
        'YK4',
        [
          [11_920_879, 'declaration'],
          [11_920_936, 'write'],
          [11_920_989, 'read'],
        ],
      ],
      [
        'bz$',
        [
          [11_920_883, 'declaration'],
          [11_920_958, 'write'],
          [11_921_151, 'read'],
          [11_921_200, 'read'],
        ],
      ],
      [
        'do1',
        [
          [11_920_887, 'declaration'],
          [11_920_978, 'write'],
          [11_921_228, 'call'],
        ],
      ],
      [
        'sDO',
        [
          [11_920_891, 'declaration'],
          [11_921_062, 'write'],
        ],
      ],
    ])
    const topology116 = identifierTokenPositions(
      target116,
      [...expected116.keys()],
    )
    for (const [name, rows] of expected116) {
      assert.deepEqual(
        topology116.get(name),
        rows.map(([start]) => start),
        `target116 ${name}: complete-bundle positions`,
      )
    }

    const ast116 = parse(unit116, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const accessorAssignment = findAssignment(ast116, 'sDO')
    assert.ok(accessorAssignment)
    const accessorFactory = accessorAssignment.right.arguments[0]
    assert.equal(accessorFactory.type, 'ArrowFunctionExpression')
    assert.match(unit116.slice(accessorFactory.start, accessorFactory.end), /do1\(\)/)
  },
)
