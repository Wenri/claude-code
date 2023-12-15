import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
  110: 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  111: '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
  112: 'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  113: '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
  114: 'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  116: 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
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

const targetUnit = {
  index: 8_648,
  start: 5_818_316,
  end: 5_856_390,
  sourceHash:
    '32a5ccc8354802640bbd639c5c005982ee6763c37085071069da8aba0e8628c0',
}

const baselineUnit = {
  index: 8_612,
  start: 5_810_255,
  end: 5_847_270,
  sourceHash:
    '3272a4ac17970ec6b6c2d9b6aee50314cf5781dca5688cce7e0bf8d2926e6996',
}

const targetFragments = new Map([
  [
    'tool policy',
    [
      5_819_736,
      5_819_931,
      '7c4380c3d4bea05b77fb409f45853f68e43bbed2b3473bd6177617426e02db88',
    ],
  ],
  [
    'SSE transport',
    [
      5_819_932,
      5_820_075,
      '441fc92b439e5f552cbf494dd627523ee86d12f35889f864ea167780826a0a59',
    ],
  ],
  [
    'HTTP transport',
    [
      5_820_076,
      5_820_220,
      '2818215f5823440a4aadaa4ea58e4bd105aa36540823d2dc3296514442045e33',
    ],
  ],
  [
    'process transport union',
    [
      5_820_283,
      5_820_329,
      'c8b9600fcd9f09f8bd32e1d093430d56e194d498f8de85fd8976d501cb6e4776',
    ],
  ],
  [
    'mirror error schema',
    [
      5_847_974,
      5_848_417,
      'ecf55b04f819b5569009eba43eb89864d166dc9064e1890cf902e0530c0ce4fe',
    ],
  ],
  [
    'SDK message union',
    [
      5_856_068,
      5_856_258,
      '7b537099196ee2527c67530d50015241c902037ca95f8f83b562341377ad7d27',
    ],
  ],
])

const baselineFragments = new Map([
  [
    'SSE transport',
    [
      5_811_675,
      5_811_786,
      'c26d404fd07db76a74e65e4225e38136e9d6dde38e31d7c964846025a9eaa19c',
    ],
  ],
  [
    'HTTP transport',
    [
      5_811_787,
      5_811_899,
      '617c48cc28dca61ef4cfcc163420ac01846ec1252781ecf432132029bca41c90',
    ],
  ],
  [
    'process transport union',
    [
      5_811_962,
      5_812_008,
      '8c18796a8bfe00109c4f5cf83025a1d0b26b23279608c85b844ab464c7988702',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function authenticatedBundle(version) {
  const bytes = fs.readFileSync(bundlePaths[version])
  assert.equal(sha256(bytes), bundleHashes[version], `2.1.${version} bundle`)
  return bytes.toString('utf8')
}

function wordOccurrences(contents, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return contents.match(new RegExp(`\\b${escaped}\\b`, 'g'))?.length ?? 0
}

function assertSliceHashes(contents, fragments) {
  for (const [label, [start, end, expectedHash]] of fragments) {
    assert.equal(sha256(contents.slice(start, end)), expectedHash, label)
  }
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

async function extractVariableStatements(names) {
  const ts = await loadTypeScript()
  const filename = 'entrypoints/sdk/coreSchemas.ts'
  const contents = source(filename)
  const tree = ts.createSourceFile(
    filename,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  return names.map(name => {
    const statement = tree.statements.find(
      candidate =>
        ts.isVariableStatement(candidate) &&
        candidate.declarationList.declarations.some(
          declaration =>
            ts.isIdentifier(declaration.name) && declaration.name.text === name,
        ),
    )
    assert.ok(statement, `${name} declaration`)
    return statement.getText(tree).replace(/^export\s+/, '')
  })
}

class MiniSchema {
  constructor(parser) {
    this.parser = parser
  }

  parse(value) {
    return this.parser(value)
  }

  safeParse(value) {
    try {
      return { success: true, data: this.parse(value) }
    } catch (error) {
      return { success: false, error }
    }
  }

  optional() {
    return new MiniSchema(value =>
      value === undefined ? undefined : this.parse(value),
    )
  }

  describe() {
    return this
  }
}

function invalid(message) {
  throw new TypeError(message)
}

const miniZod = {
  array(item) {
    return new MiniSchema(value => {
      if (!Array.isArray(value)) return invalid('expected array')
      return value.map(entry => item.parse(entry))
    })
  },
  enum(values) {
    return new MiniSchema(value => {
      if (!values.includes(value)) return invalid('unexpected enum value')
      return value
    })
  },
  literal(expected) {
    return new MiniSchema(value => {
      if (value !== expected) return invalid('unexpected literal')
      return value
    })
  },
  object(shape) {
    return new MiniSchema(value => {
      if (value === null || Array.isArray(value) || typeof value !== 'object') {
        return invalid('expected object')
      }
      const result = {}
      for (const [key, schema] of Object.entries(shape)) {
        const parsed = schema.parse(value[key])
        if (parsed !== undefined || key in value) result[key] = parsed
      }
      return result
    })
  },
  record(keySchema, valueSchema) {
    return new MiniSchema(value => {
      if (value === null || Array.isArray(value) || typeof value !== 'object') {
        return invalid('expected record')
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          keySchema.parse(key),
          valueSchema.parse(entry),
        ]),
      )
    })
  },
  string() {
    return new MiniSchema(value => {
      if (typeof value !== 'string') return invalid('expected string')
      return value
    })
  },
}

function executeSchemaStatements(statements, names) {
  const lazySchema = factory => {
    let cached
    return () => (cached ??= factory())
  }
  const body = `${statements.join('\n')}\nreturn { ${names.join(', ')} }`
  return new Function('z', 'lazySchema', body)(miniZod, lazySchema)
}

test(
  'target111 pins the remote MCP policy and latent mirror schemas in unit 8648',
  boundaryOptions,
  () => {
    const baseline = authenticatedBundle(110)
    const target = authenticatedBundle(111)
    const region = structural.regions[targetUnit.index]
    assert.deepEqual(
      [
        region.classification,
        region.target.index,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        'unresolved',
        targetUnit.index,
        targetUnit.start,
        targetUnit.end,
        'VariableDeclaration',
        targetUnit.sourceHash,
      ],
    )
    const unmatched = structural.unmatchedBaseline.find(
      candidate => candidate.index === baselineUnit.index,
    )
    assert.deepEqual(
      [
        unmatched.start,
        unmatched.end,
        unmatched.nodeType,
        unmatched.sourceHash,
      ],
      [
        baselineUnit.start,
        baselineUnit.end,
        'VariableDeclaration',
        baselineUnit.sourceHash,
      ],
    )
    assert.equal(
      sha256(target.slice(targetUnit.start, targetUnit.end)),
      targetUnit.sourceHash,
    )
    assert.equal(
      sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
      baselineUnit.sourceHash,
    )
    assertSliceHashes(target, targetFragments)
    assertSliceHashes(baseline, baselineFragments)

    for (const introduced of [
      'Per-tool permission policy carried on mcp_set_servers for remote servers.',
      'always_deny',
      'mirror_error',
      'projectKey',
    ]) {
      assert.equal(baseline.includes(introduced), false, introduced)
      assert.equal(target.includes(introduced), true, introduced)
    }
    assert.match(
      target.slice(5_819_736, 5_819_931),
      /permission_policy:[^.]*\.enum\(\["always_allow","always_ask","always_deny"\]\)/,
    )
    assert.match(
      target.slice(5_847_974, 5_848_417),
      /key:[^.]*\.object\(\{projectKey:[^.]*\.string\(\),sessionId:[^.]*\.string\(\),subpath:[^.]*\.string\(\)\.optional\(\)\}\)/,
    )
  },
)

test(
  'target111 topology makes MCP policy live while mirror_error remains latent',
  boundaryOptions,
  () => {
    const target = authenticatedBundle(111)
    assert.equal(wordOccurrences(target, 'UC4'), 4)
    assert.equal(wordOccurrences(target, 'qPz'), 3)
    assert.equal(wordOccurrences(target, 'KPz'), 3)
    assert.equal(wordOccurrences(target, 'yI8'), 5)
    assert.equal(wordOccurrences(target, 'HFw'), 2)
    assert.ok(target.slice(5_819_932, 5_820_075).includes('UC4()'))
    assert.ok(target.slice(5_820_076, 5_820_220).includes('UC4()'))
    assert.ok(target.slice(5_820_283, 5_820_329).includes('qPz()'))
    assert.ok(target.slice(5_820_283, 5_820_329).includes('KPz()'))
    assert.ok(target.includes('servers:y.record(y.string(),yI8())'))
    assert.equal(target.slice(5_856_068, 5_856_258).includes('HFw()'), false)
  },
)

test(
  'the policy persists through 116 and mirror_error becomes reachable at 113',
  persistenceOptions,
  () => {
    const bundles = Object.fromEntries(
      Object.keys(bundlePaths).map(version => [
        Number(version),
        authenticatedBundle(Number(version)),
      ]),
    )
    const policyBindings = {
      111: 'UC4',
      112: 'QC4',
      113: 'B0K',
      114: 'B0K',
      116: 'ANK',
    }
    const mirrorBindings = {
      111: ['HFw', 2],
      112: ['JFw', 2],
      113: ['tj9', 3],
      114: ['tj9', 3],
      116: ['KG9', 3],
    }

    assert.equal(
      bundles[110].includes(
        'Per-tool permission policy carried on mcp_set_servers for remote servers.',
      ),
      false,
    )
    assert.equal(bundles[110].includes('mirror_error'), false)
    for (const [versionText, binding] of Object.entries(policyBindings)) {
      const version = Number(versionText)
      const contents = bundles[version]
      assert.ok(
        contents.includes(
          'Per-tool permission policy carried on mcp_set_servers for remote servers.',
        ),
        `2.1.${version}: policy schema`,
      )
      for (const policy of ['always_allow', 'always_ask', 'always_deny']) {
        assert.ok(contents.includes(policy), `2.1.${version}: ${policy}`)
      }
      assert.equal(
        wordOccurrences(contents, binding),
        4,
        `2.1.${version}: live policy binding`,
      )
    }
    for (const [versionText, [binding, expectedReferences]] of Object.entries(
      mirrorBindings,
    )) {
      const version = Number(versionText)
      const contents = bundles[version]
      assert.ok(contents.includes('mirror_error'), `2.1.${version}: schema`)
      assert.ok(contents.includes('projectKey'), `2.1.${version}: projectKey`)
      assert.ok(contents.includes('subpath'), `2.1.${version}: subpath`)
      assert.equal(
        wordOccurrences(contents, binding),
        expectedReferences,
        `2.1.${version}: mirror binding topology`,
      )
    }
  },
)

test(
  'core schema source owns the exact cumulative transport and mirror graph',
  sourceOptions,
  () => {
    const owner = source('entrypoints/sdk/coreSchemas.ts')
    for (const fragment of [
      'export const McpToolConfigSchema = lazySchema(() =>',
      'permission_policy: z.enum([\'always_allow\', \'always_ask\', \'always_deny\'])',
      'Per-tool permission policy carried on mcp_set_servers for remote servers.',
      'tools: z.array(McpToolConfigSchema()).optional()',
      'export const SDKMirrorErrorMessageSchema = lazySchema(() =>',
      "subtype: z.literal('mirror_error')",
      'projectKey: z.string()',
      'sessionId: z.string()',
      'subpath: z.string().optional()',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    assert.equal(
      owner.split('tools: z.array(McpToolConfigSchema()).optional()').length - 1,
      2,
    )
    const transportUnion = owner.slice(
      owner.indexOf('export const McpServerConfigForProcessTransportSchema'),
      owner.indexOf('export const McpClaudeAIProxyServerConfigSchema'),
    )
    assert.ok(transportUnion.includes('McpSSEServerConfigSchema()'))
    assert.ok(transportUnion.includes('McpHttpServerConfigSchema()'))

    const messageUnion = owner.slice(
      owner.indexOf('export const SDKMessageSchema'),
      owner.indexOf('export const FastModeStateSchema'),
    )
    assert.equal(
      messageUnion.includes('SDKMirrorErrorMessageSchema()'),
      !historicalSource,
      historicalSource
        ? 'mirror_error is defined but not in the target111 SDK message union'
        : 'the cumulative source must retain the target113 union edge',
    )
  },
)

test(
  'authored MCP and mirror schemas execute their recovered contracts',
  sourceOptions,
  async () => {
    const names = [
      'McpToolConfigSchema',
      'McpSSEServerConfigSchema',
      'McpHttpServerConfigSchema',
      'UUIDPlaceholder',
      'SDKMirrorErrorMessageSchema',
    ]
    const statements = await extractVariableStatements(names)
    const schemas = executeSchemaStatements(statements, names)

    for (const permissionPolicy of [
      'always_allow',
      'always_ask',
      'always_deny',
    ]) {
      assert.equal(
        schemas.McpToolConfigSchema().safeParse({
          name: 'deploy',
          permission_policy: permissionPolicy,
        }).success,
        true,
      )
    }
    for (const invalidPolicy of ['allow', 'ask', 'alwaysAllow', undefined]) {
      assert.equal(
        schemas.McpToolConfigSchema().safeParse({
          name: 'deploy',
          permission_policy: invalidPolicy,
        }).success,
        false,
      )
    }
    for (const [schema, type] of [
      [schemas.McpSSEServerConfigSchema(), 'sse'],
      [schemas.McpHttpServerConfigSchema(), 'http'],
    ]) {
      const result = schema.safeParse({
        type,
        url: 'https://mcp.example.test',
        tools: [{ name: 'deploy', permission_policy: 'always_deny' }],
      })
      assert.equal(result.success, true)
      assert.equal(result.data.tools[0].permission_policy, 'always_deny')
      assert.equal(
        schema.safeParse({
          type,
          url: 'https://mcp.example.test',
          tools: [{ name: 'deploy', permission_policy: 'deny' }],
        }).success,
        false,
      )
    }

    const validMirror = {
      type: 'system',
      subtype: 'mirror_error',
      error: 'append failed',
      key: {
        projectKey: 'project',
        sessionId: 'session',
        subpath: 'agent-a',
      },
      uuid: 'event-id',
      session_id: 'session',
    }
    assert.equal(
      schemas.SDKMirrorErrorMessageSchema().safeParse(validMirror).success,
      true,
    )
    assert.equal(
      schemas.SDKMirrorErrorMessageSchema().safeParse({
        ...validMirror,
        key: { sessionId: 'session' },
      }).success,
      false,
    )
    assert.equal(
      schemas.SDKMirrorErrorMessageSchema().safeParse({
        ...validMirror,
        subtype: 'transcript_mirror',
      }).success,
      false,
    )
  },
)
