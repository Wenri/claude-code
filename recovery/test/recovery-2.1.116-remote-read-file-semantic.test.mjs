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

const baselineUnits = [
  {
    index: 18339,
    nodeType: 'FunctionDeclaration',
    start: 11_353_324,
    end: 11_356_167,
    sourceHash:
      '8d4ec96650445bd924b909e3e5e937b6f2ad9a830f3c6626539fe46eae6ba4ce',
  },
  {
    index: 18352,
    nodeType: 'FunctionDeclaration',
    start: 11_359_671,
    end: 11_369_805,
    sourceHash:
      '9d4ae79066f00e91d57a3579c20695a462823f77f0e425f31b6609b82b565f2d',
  },
  {
    index: 18361,
    nodeType: 'FunctionDeclaration',
    start: 11_371_401,
    end: 11_375_234,
    sourceHash:
      '54ebbe27c878b664496f301575b31c1dc5549f8f48b0b48e2e341267fab415b5',
  },
  {
    index: 19497,
    nodeType: 'VariableDeclaration',
    start: 11_908_638,
    end: 11_922_698,
    sourceHash:
      'c0d1a5a8bf909d05b4c8c87c5ef9ffbad45303501a7cbf294f6adb185661d2d1',
  },
  {
    index: 20295,
    nodeType: 'FunctionDeclaration',
    start: 12_806_769,
    end: 12_842_263,
    sourceHash:
      'b1da0be6cca106461e6a01b1d96682b6a0b2bb33edcd869650319e1216252fa7',
  },
]
const targetUnits = [
  {
    index: 18512,
    nodeType: 'FunctionDeclaration',
    start: 11_400_308,
    end: 11_400_740,
    sourceHash:
      '12f098435d82f86d52a549aa37e8573c267fd29cacac47f672fbd033d11e3ab7',
  },
  {
    index: 18550,
    nodeType: 'FunctionDeclaration',
    start: 11_429_027,
    end: 11_432_492,
    sourceHash:
      'a9a11c986f2d216b40ad541587c2a37249d7f90f80bf0cb33ef76907864cbd2c',
  },
  {
    index: 18563,
    nodeType: 'FunctionDeclaration',
    start: 11_435_997,
    end: 11_446_163,
    sourceHash:
      'fcd9dc04744ace9169404dfb3438a6ce0ae2a839cb520b249f9f46650910d4c5',
  },
  {
    index: 18572,
    nodeType: 'FunctionDeclaration',
    start: 11_447_760,
    end: 11_451_834,
    sourceHash:
      'd61c3820bef269b0584b13c7e379e4ddc8e5b2b5a56e0391ff53f5341e9623dd',
  },
  {
    index: 18589,
    nodeType: 'FunctionDeclaration',
    start: 11_454_374,
    end: 11_464_019,
    sourceHash:
      '6cad817922e0fdc525885819434ea9bd780f5c17cc06d025345a2b6dbba73864',
  },
  {
    index: 19762,
    nodeType: 'VariableDeclaration',
    start: 12_001_052,
    end: 12_018_785,
    sourceHash:
      '02ec7e35fe2c4764246e9a3115e32c55e7ae7f59d55cccc9dfaed6cd83a476ef',
  },
  {
    index: 20581,
    nodeType: 'FunctionDeclaration',
    start: 12_915_603,
    end: 12_954_120,
    sourceHash:
      '66fa02021a22925ae2e3eb6c757c5a9e91a25ecb102ebe0ed8bdd47efeb44ce2',
  },
]
const literalPins = [
  { value: 'read denied: ', start: 11_400_406, end: 11_400_419 },
  { value: 'onReadFile', start: 11_429_200, end: 11_429_210 },
  { value: 'read_file', start: 11_431_451, end: 11_431_460 },
  { value: 'max_bytes', start: 11_431_670, end: 11_431_679 },
  { value: 'onReadFile', start: 11_436_327, end: 11_436_337 },
  { value: 'onReadFile', start: 11_440_656, end: 11_440_666 },
  {
    value: 'getToolPermissionContext',
    start: 11_447_786,
    end: 11_447_810,
  },
  {
    value: 'getToolPermissionContext',
    start: 11_459_532,
    end: 11_459_556,
  },
  { value: 'onReadFile', start: 11_451_731, end: 11_451_741 },
  { value: 'read_file', start: 12_010_585, end: 12_010_594 },
  { value: 'max_bytes', start: 12_010_613, end: 12_010_622 },
  { value: 'read_file', start: 12_938_931, end: 12_938_940 },
  {
    value: 'readFileForRemote',
    start: 12_938_950,
    end: 12_938_967,
  },
  {
    value: 'getToolPermissionContext',
    start: 12_951_223,
    end: 12_951_247,
  },
]

const sourceTest = selected ? test : test.skip
const bundleTest = selected && baselinePath && targetPath ? test : test.skip
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

function readOwner(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
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

async function compileDeclarations(relativePath, names, dependencies) {
  const ts = await loadTypeScript()
  const source = readOwner(relativePath)
  const sourceFile = ts.createSourceFile(
    path.basename(relativePath),
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const selectedStatements = sourceFile.statements.filter(statement => {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      names.includes(statement.name.text)
    ) {
      return true
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) && names.includes(declaration.name.text),
      )
    }
    return false
  })
  assert.equal(selectedStatements.length, names.length)
  const isolated = selectedStatements
    .map(statement =>
      source
        .slice(statement.getStart(sourceFile), statement.end)
        .replace(/^export /, ''),
    )
    .join('\n')
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const dependencyNames = Object.keys(dependencies)
  const factory = new Function(
    ...dependencyNames,
    `${javascript}\nreturn {${names.join(',')}}`,
  )
  return factory(...dependencyNames.map(name => dependencies[name]))
}

bundleTest('authenticated 114→116 adds the complete remote read-file graph', () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(baselineBytes.length, 12_986_755)
  assert.equal(targetBytes.length, 13_102_272)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const unit of baselineUnits) {
    const region = structural.unmatchedBaseline.find(
      candidate => candidate.index === unit.index,
    )
    assert.ok(region, `baseline unit ${unit.index}`)
    assert.deepEqual(
      [region.nodeType, region.start, region.end, region.sourceHash],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(
      sha256(baseline.slice(unit.start, unit.end)),
      unit.sourceHash,
    )
  }
  for (const unit of targetUnits) {
    const region = structural.regions.find(
      candidate => candidate.target?.index === unit.index,
    )
    assert.ok(region, `target unit ${unit.index}`)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
  }
  for (const pin of literalPins) {
    assert.equal(target.slice(pin.start, pin.end), pin.value)
  }

  assert.equal((baseline.match(/onReadFile/g) ?? []).length, 0)
  assert.equal((target.match(/onReadFile/g) ?? []).length, 5)
  assert.equal((baseline.match(/readFileForRemote/g) ?? []).length, 0)
  assert.equal((target.match(/readFileForRemote/g) ?? []).length, 2)
  assert.equal((baseline.match(/read_file/g) ?? []).length, 4)
  assert.equal((target.match(/read_file/g) ?? []).length, 9)
})

sourceTest('the seven source owners retain every target propagation edge', () => {
  const reader = readOwner('bridge/bridgePermissionCallbacks.ts')
  assert.ok(reader.includes('const DEFAULT_REMOTE_READ_BYTES = 1_000_000'))
  assert.ok(reader.includes('const MAX_REMOTE_READ_BYTES = 10_000_000'))
  assert.ok(reader.includes('for (const resolvedPath of getPathsForPermissionCheck(absPath))'))
  assert.ok(reader.includes("isPathAllowed(resolvedPath, permissionContext, 'read')"))
  assert.ok(reader.includes('throw new Error(`read denied: ${path}`)'))
  assert.ok(reader.includes('truncated: true'))

  const messaging = readOwner('bridge/bridgeMessaging.ts')
  assert.ok(messaging.includes("case 'read_file':"))
  assert.ok(messaging.includes('onReadFile(request.request.path, request.request.max_bytes)'))
  assert.ok(messaging.includes('Sent control_response for read_file'))

  const core = readOwner('bridge/remoteBridgeCore.ts')
  assert.equal((core.match(/onReadFile/g) ?? []).length, 3)
  const init = readOwner('bridge/initReplBridge.ts')
  assert.ok(init.includes('getToolPermissionContext?: () => ToolPermissionContext'))
  assert.ok(init.includes('getToolPermissionContext?.() ?? getEmptyToolPermissionContext()'))
  assert.ok(init.includes('onReadFile: (path, maxBytes) =>'))

  const repl = readOwner('hooks/useReplBridge.tsx')
  assert.ok(repl.includes('getToolPermissionContext: () =>'))
  assert.ok(repl.includes('store.getState().toolPermissionContext'))

  const schemas = readOwner('entrypoints/sdk/controlSchemas.ts')
  assert.ok(schemas.includes('SDKControlReadFileRequestSchema'))
  assert.ok(schemas.includes("subtype: z.literal('read_file')"))
  assert.ok(schemas.includes('max_bytes: z.number().optional()'))
  assert.ok(schemas.includes('SDKControlReadFileResponseSchema'))
  assert.ok(schemas.includes('SDKControlReadFileRequestSchema(),'))

  const print = readOwner('cli/print.ts')
  assert.ok(print.includes("message.request.subtype === 'read_file'"))
  assert.ok(print.includes("'src/bridge/bridgePermissionCallbacks.js'"))
  assert.ok(print.includes('getToolPermissionContext: () =>'))
})

sourceTest(
  'actual reader enforces every resolved path and caps/truncates reads',
  async () => {
    let statCalls = 0
    let closed = 0
    let allocated = 0
    let deniedPath
    const content = Buffer.from('abcdefghij')
    const dependencies = {
      expandPath: value => `/cwd/${value}`,
      getPathsForPermissionCheck: value => [value, `/real${value}`],
      isPathAllowed: value => ({ allowed: value !== deniedPath }),
      stat: async () => {
        statCalls++
        return { size: content.length }
      },
      readFile: async () => content.toString('utf8'),
      open: async () => ({
        async read(buffer, offset, length) {
          allocated = buffer.length
          const bytesRead = Math.min(length, content.length)
          content.copy(buffer, offset, 0, bytesRead)
          return { bytesRead }
        },
        async close() {
          closed++
        },
      }),
      Buffer,
    }
    const { readFileForRemote } = await compileDeclarations(
      'bridge/bridgePermissionCallbacks.ts',
      [
        'DEFAULT_REMOTE_READ_BYTES',
        'MAX_REMOTE_READ_BYTES',
        'readFileForRemote',
      ],
      dependencies,
    )

    assert.deepEqual(await readFileForRemote('small.txt', undefined, {}), {
      contents: 'abcdefghij',
      absPath: '/cwd/small.txt',
    })
    assert.deepEqual(await readFileForRemote('large.txt', 4, {}), {
      contents: 'abcd',
      absPath: '/cwd/large.txt',
      truncated: true,
    })
    assert.equal(allocated, 4)
    assert.equal(closed, 1)

    deniedPath = '/real/cwd/denied.txt'
    const callsBeforeDeny = statCalls
    await assert.rejects(
      readFileForRemote('denied.txt', 4, {}),
      /read denied: denied\.txt/,
    )
    assert.equal(statCalls, callsBeforeDeny)
  },
)

sourceTest(
  'actual bridge handler returns async read success, error, and unsupported responses',
  async () => {
    const debug = []
    const { handleServerControlRequest } = await compileDeclarations(
      'bridge/bridgeMessaging.ts',
      ['OUTBOUND_ONLY_ERROR', 'handleServerControlRequest'],
      {
        errorMessage: error => (error instanceof Error ? error.message : String(error)),
        logForDebugging: message => debug.push(message),
      },
    )
    const request = {
      type: 'control_request',
      request_id: 'read-1',
      request: { subtype: 'read_file', path: 'notes.md', max_bytes: 7 },
    }

    const writes = []
    handleServerControlRequest(request, {
      transport: { write: event => writes.push(event) },
      sessionId: 'session-1',
      onReadFile: async (path, maxBytes) => ({
        contents: `${path}:${maxBytes}`,
        absPath: '/cwd/notes.md',
        truncated: true,
      }),
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(writes, [
      {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: 'read-1',
          response: {
            contents: 'notes.md:7',
            absPath: '/cwd/notes.md',
            truncated: true,
          },
        },
        session_id: 'session-1',
      },
    ])

    writes.length = 0
    handleServerControlRequest(request, {
      transport: { write: event => writes.push(event) },
      sessionId: 'session-2',
      onReadFile: async () => {
        throw new Error('permission denied')
      },
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(writes[0].response.subtype, 'error')
    assert.equal(writes[0].response.error, 'permission denied')

    writes.length = 0
    handleServerControlRequest(request, {
      transport: { write: event => writes.push(event) },
      sessionId: 'session-3',
    })
    assert.equal(writes[0].response.subtype, 'error')
    assert.match(writes[0].response.error, /onReadFile callback not registered/)
    assert.ok(debug.some(message => message.includes('read_file')))
  },
)
