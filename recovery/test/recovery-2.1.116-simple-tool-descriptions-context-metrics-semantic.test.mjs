import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const units = {
  baselineSchema: {
    index: 17988,
    start: 11144457,
    end: 11145687,
    sourceHash:
      'ac937cbd8bec7b55724cf7baa15a49da529d61213086167ec00cea9f024f5e1b',
  },
  baselineMetrics: {
    index: 17995,
    start: 11147973,
    end: 11148807,
    sourceHash:
      '0f91512e699b48e26d4767973f4202615206590097f52eb6ad740f28ec2a0b6f',
  },
  targetDescription: {
    index: 18184,
    start: 11217876,
    end: 11218025,
    sourceHash:
      '95499520964bb6cdd22b350f80952cadb08c8fb485e433b55e6fb0a48e97115c',
  },
  targetSchema: {
    index: 18185,
    start: 11218025,
    end: 11219132,
    sourceHash:
      '4db1455c465d630b2f45ac4f1dc10e71d26c0ebf87e2b7af34eeb7af87aed433',
  },
  targetMetrics: {
    index: 18192,
    start: 11221422,
    end: 11222291,
    sourceHash:
      '6f6ce43a3ab1466bd62d1f3cfbeb4f9d3f4c712e861a0a108fa7d8df951002ca',
  },
}

const literalPins = [
  { historicalRow: 679, currentRow: 619, value: 'searchHint', start: 11217934, end: 11217944 },
  { historicalRow: 680, currentRow: 620, value: 'searchHint', start: 11217954, end: 11217964 },
  { historicalRow: 681, currentRow: 621, value: 'has_user_email', start: 11222101, end: 11222115 },
  { historicalRow: 682, currentRow: 622, value: 'userEmail', start: 11222126, end: 11222135 },
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource() {
  return fs.readFileSync(path.join(sourceRoot, 'utils/api.ts'), 'utf8')
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

async function instantiateOwner(overrides = {}) {
  const ts = await loadTypeScript()
  const source = ownerSource()
  const sourceFile = ts.createSourceFile(
    'api.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const names = new Set(['getToolDescription', 'logContextMetrics'])
  const declarations = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      names.has(statement.name.text),
  )
  assert.equal(declarations.length, 2)
  const isolated = declarations
    .map(declaration => source.slice(declaration.getStart(sourceFile), declaration.end))
    .join('\n')
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const events = []
  let userContext = { claudeMd: 'abc', userEmail: 'user@example.com' }
  const dependencies = {
    exports: {},
    isEnvTruthy(value) {
      return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase())
    },
    isAnalyticsDisabled: () => false,
    prefetchAllMcpResources: async () => ({
      tools: [
        {
          name: 'mcp__alpha__read',
          isMcp: true,
          inputJSONSchema: { type: 'object' },
        },
      ],
    }),
    getTools: async () => [
      {
        name: 'Read',
        isMcp: false,
        inputJSONSchema: { type: 'object' },
      },
    ],
    getUserContext: async () => userContext,
    getSystemContext: async () => ({ gitStatus: 'xy' }),
    getCwd: () => '/repo',
    getFileReadIgnorePatterns: () => [],
    normalizePatternsToPath: patterns => patterns,
    countFilesRoundedRg: async () => 100,
    zodToJsonSchema: schema => schema,
    roughTokenCountEstimation: value => value.length,
    jsonStringify: JSON.stringify,
    logEvent(name, metadata) {
      events.push({ name, metadata })
    },
    ...overrides,
  }
  const dependencyNames = Object.keys(dependencies)
  const factory = new Function(
    ...dependencyNames,
    `${javascript}\nreturn { getToolDescription, logContextMetrics }`,
  )
  return {
    ...factory(...dependencyNames.map(name => dependencies[name])),
    events,
    setUserContext(value) {
      userContext = value
    },
  }
}

test('authenticated 114→116 adds simple tool descriptions and email-presence context telemetry', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  for (const unit of [units.baselineSchema, units.baselineMetrics]) {
    const region = structural.unmatchedBaseline.find(
      candidate => candidate.index === unit.index,
    )
    assert.ok(region)
    assert.deepEqual(
      [region.start, region.end, region.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(baseline.slice(unit.start, unit.end)), unit.sourceHash)
  }
  for (const unit of [
    units.targetDescription,
    units.targetSchema,
    units.targetMetrics,
  ]) {
    const region = structural.regions.find(
      candidate => candidate.target.index === unit.index,
    )
    assert.ok(region)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
  }

  const baselineSchema = baseline.slice(units.baselineSchema.start, units.baselineSchema.end)
  const targetDescription = target.slice(units.targetDescription.start, units.targetDescription.end)
  const targetSchema = target.slice(units.targetSchema.start, units.targetSchema.end)
  const baselineMetrics = baseline.slice(units.baselineMetrics.start, units.baselineMetrics.end)
  const targetMetrics = target.slice(units.targetMetrics.start, units.targetMetrics.end)
  assert.doesNotMatch(baselineSchema, /searchHint/)
  assert.match(targetDescription, /searchHint/)
  assert.match(targetDescription, /split\(`/)
  assert.match(targetSchema, /description:await/)
  assert.doesNotMatch(baselineMetrics, /has_user_email/)
  assert.match(targetMetrics, /has_user_email:Boolean\([^)]*\.userEmail\)/)
  for (const pin of literalPins) {
    assert.equal(target.slice(pin.start, pin.end), pin.value)
  }
})

test('the source owner contains both exact target116 paths', sourceOptions, () => {
  const source = ownerSource()
  assert.match(source, /CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT/)
  assert.match(source, /if \(tool\.searchHint\)/)
  assert.match(source, /description\.split\('\\n\\n', 1\)\[0\]\.trim\(\) \|\| description/)
  assert.match(source, /description: await getToolDescription\(tool, options\)/)
  assert.match(source, /has_user_email: Boolean\(userContext\.userEmail\)/)
})

test('actual source executes the simple-description and context-metric matrices', sourceOptions, async () => {
  const owner = await instantiateOwner()
  const previousSimple = process.env.CLAUDE_CODE_SIMPLE
  const previousSimplePrompt = process.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT
  try {
    delete process.env.CLAUDE_CODE_SIMPLE
    delete process.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT
    let promptCalls = 0
    const tool = {
      searchHint: 'curated capability',
      async prompt() {
        promptCalls += 1
        return 'Full first paragraph\n\nMore detail'
      },
    }
    assert.equal(
      await owner.getToolDescription(tool, {}),
      'Full first paragraph\n\nMore detail',
    )
    assert.equal(promptCalls, 1)

    process.env.CLAUDE_CODE_SIMPLE = '1'
    assert.equal(await owner.getToolDescription(tool, {}), 'curated capability')
    assert.equal(promptCalls, 1, 'a search hint avoids rendering the full prompt')

    delete process.env.CLAUDE_CODE_SIMPLE
    process.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT = 'true'
    const fallback = {
      async prompt() {
        return '  First paragraph  \n\nSecond paragraph'
      },
    }
    assert.equal(await owner.getToolDescription(fallback, {}), 'First paragraph')
    const emptyFirst = {
      async prompt() {
        return '  \n\nSecond paragraph'
      },
    }
    assert.equal(
      await owner.getToolDescription(emptyFirst, {}),
      '  \n\nSecond paragraph',
    )
  } finally {
    if (previousSimple === undefined) delete process.env.CLAUDE_CODE_SIMPLE
    else process.env.CLAUDE_CODE_SIMPLE = previousSimple
    if (previousSimplePrompt === undefined) {
      delete process.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT
    } else {
      process.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT = previousSimplePrompt
    }
  }

  await owner.logContextMetrics({}, {})
  assert.equal(owner.events[0].name, 'tengu_context_size')
  assert.equal(owner.events[0].metadata.has_user_email, true)
  assert.equal(owner.events[0].metadata.git_status_size, 2)
  assert.equal(owner.events[0].metadata.claude_md_size, 3)
  owner.setUserContext({ claudeMd: '' })
  await owner.logContextMetrics({}, {})
  assert.equal(owner.events[1].metadata.has_user_email, false)
})
