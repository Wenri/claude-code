import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historicalSource = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)

const bundlePaths = {
  110: process.env.CLAUDE_CODE_2_1_110_BUNDLE,
  111: process.env.CLAUDE_CODE_2_1_111_BUNDLE,
  112: process.env.CLAUDE_CODE_2_1_112_BUNDLE,
  113: process.env.CLAUDE_CODE_2_1_113_BUNDLE,
  114: process.env.CLAUDE_CODE_2_1_114_BUNDLE,
  116: process.env.CLAUDE_CODE_2_1_116_BUNDLE,
}

const bundleHashes = {
  110: new Set([
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  ]),
  111: new Set([
    '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
  ]),
  112: new Set([
    'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  ]),
  113: new Set([
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
    'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681',
  ]),
  114: new Set([
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    '5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83',
  ]),
  116: new Set([
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
  ]),
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

const detectorUnits = new Map([
  [
    7_407,
    [
      'FunctionDeclaration',
      4_970_614,
      4_973_979,
      '6a17901c1d8346f2f23cfb624690c9b7075e22db5c05b6f40bc5da4b47d87b7c',
    ],
  ],
  [
    7_408,
    [
      'FunctionDeclaration',
      4_973_979,
      4_978_261,
      '36e7e293469d8e640dedc89587128ba9fbdfa690e58ffc86c59b02d63c765710',
    ],
  ],
  [
    7_415,
    [
      'VariableDeclaration',
      4_978_775,
      4_979_703,
      '384f5a14293742d5be9eec134fe2fc4c0f2adb090273315ddd9d85234077f2d3',
    ],
  ],
])

const ttlHelperUnit = [
  17_041,
  'FunctionDeclaration',
  11_844_985,
  11_845_427,
  '141f21005db7c18e3d2eb5b46bf21b1af4e0921e6f19a30b6af5c170b9de582f',
]

const callerUnit = [
  17_057,
  'FunctionDeclaration',
  11_850_014,
  11_870_777,
  'b7045192f3b2b324776802515f20ec1e84eb453715f3cd893556677305fd3eef',
]

const targetAddedResidues = new Map([
  [7_407, [4_970_780, 4_971_556, 4_973_830]],
  [7_408, [4_977_586, 4_977_601]],
  [7_415, [4_979_310]],
])

const boundaryOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !bundlePaths[110] || !bundlePaths[111]
      ? 'authenticated 2.1.110 and 2.1.111 bundles are required'
      : false,
}

const persistenceOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : Object.values(bundlePaths).some(value => !value)
      ? 'authenticated 2.1.110 through 2.1.116 bundles are required'
      : false,
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function normalizeBundle(version, bytes) {
  const hash = sha256(bytes)
  assert.ok(bundleHashes[version].has(hash), `2.1.${version}: bundle hash`)
  const source = bytes.toString('utf8')
  if (version < 113 || hash === [...bundleHashes[version]][0]) return source
  const prefix =
    '// @bun @bytecode @bun-cjs\n(function(exports, require, module, __filename, __dirname) {'
  assert.ok(source.startsWith(prefix), `2.1.${version}: bytecode wrapper`)
  assert.ok(source.endsWith('})\n'), `2.1.${version}: wrapper suffix`)
  return source.slice(prefix.length, -3)
}

function authenticatedBundle(version) {
  return normalizeBundle(version, fs.readFileSync(bundlePaths[version]))
}

function assertStructuralUnit(target, index, expected) {
  const [nodeType, start, end, sourceHash] = expected
  const region = structural.regions[index]
  assert.deepEqual(
    [
      region.target.index,
      region.classification,
      region.target.nodeType,
      region.target.start,
      region.target.end,
      region.target.sourceHash,
    ],
    [
      index,
      index === 17_041 ? 'matched' : 'unresolved',
      nodeType,
      start,
      end,
      sourceHash,
    ],
    `${index}: structural identity`,
  )
  assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
}

function evaluateRecordPromptState(unit) {
  const stateBySource = new Map()
  const dependencies = {
    RR: stateBySource,
    oR8: () => 'repl_main_thread',
    m04: items => items,
    B04: () => false,
    cj6: value => JSON.stringify(value).length,
    d4z: () => ({}),
    hU1: item => item.text,
    c4z: items =>
      items.reduce((total, item) => total + (item.text?.length ?? 0), 0),
    l4z: () => 'diffable',
    Q4z: () => [],
    u4z: () => {},
    lj6: () => {},
    j6: error => {
      throw error
    },
    m4z: 10,
  }
  const recordPromptState = Function(
    ...Object.keys(dependencies),
    `${unit}; return c04`,
  )(...Object.values(dependencies))

  recordPromptState({
    system: [{ type: 'text', text: 'hello' }],
    toolSchemas: [],
    querySource: 'repl_main_thread',
    model: 'claude-opus',
    is1hCacheTTL: true,
    queryDepth: 4,
  })
  return stateBySource
}

async function evaluateCacheBreakTelemetry(unit, stateBySource) {
  const events = []
  const dependencies = {
    RR: stateBySource,
    oR8: () => 'repl_main_thread',
    g4z: () => false,
    E: () => {},
    d: (name, payload) => events.push({ name, payload }),
    n4z: async () => null,
    yU1: value => value,
    S6: () => false,
    j6: error => {
      throw error
    },
    lj6: () => {},
    p4z: 2_000,
    F4z: 5 * 60 * 1_000,
    ke6: 60 * 60 * 1_000,
  }
  const checkResponseForCacheBreak = Function(
    ...Object.keys(dependencies),
    `${unit}; return l04`,
  )(...Object.values(dependencies))

  const state = stateBySource.get('repl_main_thread')
  state.prevCacheReadTokens = 10_000
  state.callCount = 2
  await checkResponseForCacheBreak(
    'repl_main_thread',
    0,
    2_500,
    [],
    undefined,
    'request-1',
  )
  return events
}

function evaluatePersistedSchema(unit) {
  const schema = kind => ({
    kind,
    optional() {
      return { ...this, optionalValue: true }
    },
    nullable() {
      return { ...this, nullableValue: true }
    },
    default(value) {
      return { ...this, defaultValue: value }
    },
  })
  const g7 = {
    string: () => schema('string'),
    number: () => schema('number'),
    boolean: () => schema('boolean'),
    array: item => ({ ...schema('array'), item }),
    object: shape => ({ ...schema('object'), shape }),
    record: (key, value) => ({ ...schema('record'), key, value }),
  }
  const dependencies = {
    L: initializer => {
      initializer()
      return initializer
    },
    pK6: () => {},
    y8: () => {},
    K8: () => {},
    Q8: () => {},
    U8: () => {},
    Sz: () => {},
    e8: () => {},
    Hs: () => {},
    C8: () => {},
    q2: () => {},
    RR: undefined,
    x4z: undefined,
    C6: initializer => initializer(),
    g7,
    u04: undefined,
    B4z: undefined,
  }
  return Function(
    ...Object.keys(dependencies),
    `${unit}; return { RR, x4z, u04, B4z }`,
  )(...Object.values(dependencies))
}

test(
  'target111 authenticates the six detector is1hCacheTTL residues and live caller',
  boundaryOptions,
  () => {
    const baseline = authenticatedBundle(110)
    const target = authenticatedBundle(111)

    for (const [index, expected] of detectorUnits) {
      assertStructuralUnit(target, index, expected)
    }
    const [helperIndex, ...helperIdentity] = ttlHelperUnit
    assertStructuralUnit(target, helperIndex, helperIdentity)
    assert.equal(structural.regions[helperIndex].baselineUnitIndex, 16_974)
    assert.equal(
      structural.regions[helperIndex].pairReason,
      'exact-scope-normalized-token-hash',
    )
    const [callerIndex, ...callerIdentity] = callerUnit
    assertStructuralUnit(target, callerIndex, callerIdentity)

    assert.equal(occurrences(baseline, 'is1hCacheTTL'), 0)
    assert.equal(occurrences(target, 'is1hCacheTTL'), 7)
    for (const [index, positions] of targetAddedResidues) {
      const [, start, end] = detectorUnits.get(index)
      for (const position of positions) {
        assert.ok(position >= start && position + 12 <= end, `${index}: bounds`)
        assert.equal(target.slice(position, position + 12), 'is1hCacheTTL')
      }
      assert.equal(
        occurrences(target.slice(start, end), 'is1hCacheTTL'),
        positions.length,
        `${index}: residue count`,
      )
    }

    const helper = target.slice(ttlHelperUnit[2], ttlHelperUnit[3])
    assert.match(
      helper,
      /tengu_prompt_cache_1h_config.*repl_main_thread\*.*sdk.*auto_mode/,
    )
    const caller = target.slice(callerUnit[2], callerUnit[3])
    assert.match(
      caller,
      /is1hCacheTTL:r85\(A\.querySource\),queryDepth:A\.queryTracking\?\.depth/,
    )
  },
)

test(
  'target111 detector fragments execute TTL state, telemetry, and schema flow',
  boundaryOptions,
  async () => {
    const target = authenticatedBundle(111)
    const recordUnit = target.slice(
      detectorUnits.get(7_407)[1],
      detectorUnits.get(7_407)[2],
    )
    const telemetryUnit = target.slice(
      detectorUnits.get(7_408)[1],
      detectorUnits.get(7_408)[2],
    )
    const schemaUnit = target.slice(
      detectorUnits.get(7_415)[1],
      detectorUnits.get(7_415)[2],
    )

    const stateBySource = evaluateRecordPromptState(recordUnit)
    const state = stateBySource.get('repl_main_thread')
    assert.equal(state.is1hCacheTTL, true)
    assert.equal(state.queryDepth, 4)

    const events = await evaluateCacheBreakTelemetry(
      telemetryUnit,
      stateBySource,
    )
    assert.equal(events.length, 1)
    assert.equal(events[0].name, 'tengu_prompt_cache_break')
    assert.equal(events[0].payload.is1hCacheTTL, true)
    assert.equal(events[0].payload.queryDepth, 4)
    assert.equal(events[0].payload.querySource, 'repl_main_thread')

    const initialized = evaluatePersistedSchema(schemaUnit)
    assert.ok(initialized.RR instanceof Map)
    assert.ok(initialized.u04 instanceof Promise)
    assert.deepEqual(initialized.B4z, [
      'repl_main_thread',
      'sdk',
      'agent:custom',
      'agent:default',
      'agent:builtin',
    ])
    assert.deepEqual(
      {
        kind: initialized.x4z.value.shape.is1hCacheTTL.kind,
        defaultValue:
          initialized.x4z.value.shape.is1hCacheTTL.defaultValue,
      },
      { kind: 'boolean', defaultValue: false },
    )
  },
)

test(
  'the TTL detector-to-telemetry graph persists through target116',
  persistenceOptions,
  () => {
    const bundles = Object.fromEntries(
      Object.keys(bundlePaths).map(version => [
        Number(version),
        authenticatedBundle(Number(version)),
      ]),
    )

    assert.equal(occurrences(bundles[110], 'is1hCacheTTL'), 0)
    for (const version of [111, 112, 113, 114, 116]) {
      const contents = bundles[version]
      assert.equal(
        occurrences(contents, 'is1hCacheTTL'),
        7,
        `2.1.${version}: complete graph`,
      )
      assert.match(
        contents,
        /is1hCacheTTL:[\w$]+\.is1hCacheTTL/,
        `2.1.${version}: emitted telemetry`,
      )
      assert.match(
        contents,
        /is1hCacheTTL:[\w$]+\.boolean\(\)\.default\(!1\)/,
        `2.1.${version}: persisted schema`,
      )
    }
    for (const version of [111, 112, 113, 114]) {
      assert.match(
        bundles[version],
        /is1hCacheTTL:[\w$]+\([\w$]+\.querySource\)/,
        `2.1.${version}: TTL helper caller`,
      )
    }
    assert.match(
      bundles[116],
      /is1hCacheTTL:[\w$]+==="1h"/,
      '2.1.116: resolved request TTL caller',
    )
  },
)

test(
  'prompt-cache detector source is the cumulative owner of TTL telemetry',
  sourceOptions,
  () => {
    const detector = fs.readFileSync(
      path.join(sourceRoot, 'services/api/promptCacheBreakDetection.ts'),
      'utf8',
    )
    const caller = fs.readFileSync(
      path.join(sourceRoot, 'services/api/claude.ts'),
      'utf8',
    )

    for (const fragment of [
      'is1hCacheTTL: boolean',
      'is1hCacheTTL: z.boolean().default(false)',
      'is1hCacheTTL?: boolean',
      'is1hCacheTTL = false',
      'is1hCacheTTL,',
      'prev.is1hCacheTTL = is1hCacheTTL',
      'is1hCacheTTL: state.is1hCacheTTL',
      'queryDepth: state.queryDepth',
      'let persistedStateLoaded = false',
      'let persistQueue = Promise.resolve()',
      'const persistedStateSchema = z.record(',
      'perBlockHashes: z.array(z.number())',
      'perBlockLengths: z.array(z.number())',
      'messageHashes: z.array(z.number())',
      'function loadPersistedState(): void',
      'function persistState(): void',
      'messagesForAPI?: Message[]',
      'const messageHashes = messagesForAPI',
      'loadPersistedState()',
      'messagesHistoryChanged: changes?.messagesHistoryChanged ?? false',
      'systemHash: state.systemHash',
      'toolsHash: state.toolsHash',
      'persistState()',
    ]) {
      assert.ok(detector.includes(fragment), fragment)
    }
    assert.ok(
      caller.includes(
        historicalSource
          ? 'is1hCacheTTL: should1hCacheTTL(options.querySource)'
          : "is1hCacheTTL: cacheTtl === '1h'",
      ),
    )
    assert.ok(caller.includes('queryDepth: options.queryTracking?.depth'))
    assert.ok(caller.includes('messagesForAPI,'))
  },
)
