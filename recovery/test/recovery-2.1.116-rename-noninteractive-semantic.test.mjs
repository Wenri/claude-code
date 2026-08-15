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
const sourceTest = selected ? test : test.skip
const bundleTest = selected && baselinePath && targetPath ? test : test.skip

const baselineUnits = [
  [16156, 'ExpressionStatement', 10_260_141, 10_260_164, '57aa73c39129fbcbea3a1cc48a272d08ec54fa67aaffcaecb7284248cf74c6c4'],
  [16157, 'FunctionDeclaration', 10_260_164, 10_260_959, 'e3b464bb405162b8a9ec19c1f0d5ddf75768298f674a87cb3a7dfb443c0d68bd'],
  [16158, 'VariableDeclaration', 10_260_959, 10_261_013, '36e885327f6edf578c3275c0ed32ec0122baca136931814a1b4f48b6f18af18b'],
  [16160, 'VariableDeclaration', 10_261_025, 10_261_219, 'f0b0704a7e84e6ca0bc909e31cf5a9cad38c7b7fc4f3481467d450855cf40b51'],
]
const targetUnits = [
  [16297, 'ExpressionStatement', 'unresolved', 10_315_417, 10_315_462, 'dcc6cd53cfa3775cf714763a882fbb42a0d0ded00effe4b8553aabbc122d693f'],
  [16298, 'FunctionDeclaration', 'unresolved', 10_315_462, 10_316_171, '1d51f3d71a04072fcd2f17cc1180ea38738c4bd7dbeb27919f28cb5e44283d97'],
  [16299, 'FunctionDeclaration', 'unresolved', 10_316_171, 10_316_254, 'ce4a32ef6e51357758ae26bd1c0227c2917d3a15cef8c60393121d16a89cf1dc'],
  [16300, 'VariableDeclaration', 'unresolved', 10_316_254, 10_316_313, '14fbea43dce9171afe4693f66f065419fd2df01e3d30cb5ba573cba46804cf87'],
  [16301, 'VariableDeclaration', 'moved', 10_316_313, 10_316_324, '2ebf7a98987a15eb821a1f3f36a9e09924d97d379874731c3b3eadd8f27f526f'],
  [16302, 'ExpressionStatement', 'unresolved', 10_316_324, 10_316_347, '389bf28963cc66262b24aefa30c2bcfb2080ccabbf0f044b3712b67ee338f476'],
  [16303, 'FunctionDeclaration', 'unresolved', 10_316_347, 10_316_412, 'dbeb6388e242f70e33578ce3f7e90e859650010b38f8505915b951f90f2b39cb'],
  [16304, 'VariableDeclaration', 'unresolved', 10_316_412, 10_316_435, '527f89cf0b6008e51341b0e8b0ef53834b40c7026e4d1a7660331c81bd9a5243'],
  [16305, 'VariableDeclaration', 'moved', 10_316_435, 10_316_451, '936904629d15ff2259093e5ec16162ea58ca5a7642a97b9b5c1ea14a9b2db54b'],
  [16306, 'VariableDeclaration', 'unresolved', 10_316_451, 10_316_857, '5591bdc3ce402d0171c6e05bce964ae3c7b494f3028c62bb4e59960630c58a1b'],
]
const performRenameRow = {
  currentOrdinal: 518,
  value: 'performRename',
  start: 10_315_425,
  end: 10_315_438,
  baselineOccurrenceCount: 0,
  targetOccurrenceNumber: 1,
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

function readOwner(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function withoutSourceMap(source) {
  return source.replace(/\n\/\/# sourceMappingURL=[\s\S]*$/, '')
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

async function instantiateOwners(overrides = {}) {
  const ts = await loadTypeScript()
  const transpile = relativePath =>
    ts.transpileModule(withoutSourceMap(readOwner(relativePath)), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText

  const events = []
  const dependencies = {
    teammate: false,
    generatedName: 'generated-topic',
    sessionId: '00000000-0000-4000-8000-000000000001',
    transcriptPath: '/tmp/transcript.jsonl',
    ...overrides,
  }
  const renameModule = { exports: {} }
  const requireRename = specifier => {
    if (specifier.endsWith('/bootstrap/state.js')) {
      return { getSessionId: () => dependencies.sessionId }
    }
    if (specifier.endsWith('/bridge/bridgeConfig.js')) {
      return {
        getBridgeBaseUrlOverride: () => undefined,
        getBridgeTokenOverride: () => undefined,
      }
    }
    if (specifier.endsWith('/utils/messages.js')) {
      return { getMessagesAfterCompactBoundary: messages => messages }
    }
    if (specifier.endsWith('/utils/sessionStorage.js')) {
      return {
        getTranscriptPath: () => dependencies.transcriptPath,
        saveAgentName: async (...args) => events.push(['saveAgentName', ...args]),
        saveCustomTitle: async (...args) => events.push(['saveCustomTitle', ...args]),
      }
    }
    if (specifier.endsWith('/utils/teammate.js')) {
      return { isTeammate: () => dependencies.teammate }
    }
    if (specifier.endsWith('/generateSessionName.js')) {
      return {
        generateSessionName: async (...args) => {
          events.push(['generateSessionName', ...args])
          return dependencies.generatedName
        },
      }
    }
    if (specifier.endsWith('/bridge/createSession.js')) {
      return { updateBridgeSessionTitle: async () => {} }
    }
    return {}
  }
  new Function('exports', 'module', 'require', transpile('commands/rename/rename.ts'))(
    renameModule.exports,
    renameModule,
    requireRename,
  )

  const nonInteractiveModule = { exports: {} }
  new Function(
    'exports',
    'module',
    'require',
    transpile('commands/rename/rename-noninteractive.ts'),
  )(
    nonInteractiveModule.exports,
    nonInteractiveModule,
    specifier => {
      if (specifier === './rename.js') return renameModule.exports
      return {}
    },
  )
  return {
    rename: renameModule.exports,
    nonInteractive: nonInteractiveModule.exports,
    events,
  }
}

function createContext(events) {
  const state = {
    replBridgeSessionId: undefined,
    standaloneAgentContext: { name: 'old-name' },
  }
  return {
    state,
    context: {
      abortController: new AbortController(),
      messages: [{ type: 'user', message: { content: 'context' } }],
      getAppState: () => state,
      setAppState: updater => {
        Object.assign(state, updater(state))
        events.push(['setAppState', state.standaloneAgentContext.name])
      },
    },
  }
}

bundleTest('authenticated 114→116 adds the shared rename command graph', () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(baseline.length, 12_986_755)
  assert.equal(target.length, 13_102_272)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  for (const [index, nodeType, start, end, sourceHash] of baselineUnits) {
    const region = structural.unmatchedBaseline.find(
      candidate => candidate.index === index,
    )
    assert.ok(region, `baseline unit ${index}`)
    assert.deepEqual(
      [region.nodeType, region.start, region.end, region.sourceHash],
      [nodeType, start, end, sourceHash],
    )
    assert.equal(sha256(baseline.subarray(start, end)), sourceHash)
  }
  for (const [index, nodeType, classification, start, end, sourceHash] of targetUnits) {
    const region = structural.regions.find(
      candidate => candidate.target?.index === index,
    )
    assert.ok(region, `target unit ${index}`)
    assert.equal(region.classification, classification)
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [nodeType, start, end, sourceHash],
    )
    assert.equal(sha256(target.subarray(start, end)), sourceHash)
  }

  const oldCall = baseline.subarray(10_260_164, 10_260_959).toString('utf8')
  const sharedCall = target.subarray(10_315_462, 10_316_171).toString('utf8')
  const interactive = target.subarray(10_316_171, 10_316_254).toString('utf8')
  const local = target.subarray(10_316_347, 10_316_412).toString('utf8')
  const descriptors = target.subarray(10_316_451, 10_316_857).toString('utf8')
  assert.match(oldCall, /return H\("Cannot rename:/)
  assert.match(sharedCall, /return"Cannot rename:/)
  assert.match(interactive, /await [^(]+\(q,\$\)/)
  assert.match(local, /type:"text",value:await [^(]+\(H,\$\)/)
  assert.equal((descriptors.match(/aliases:\["name"\]/g) ?? []).length, 2)
  assert.match(descriptors, /type:"local"[\s\S]*supportsNonInteractive:!0/)
  assert.equal(
    target.toString('utf8').slice(performRenameRow.start, performRenameRow.end),
    performRenameRow.value,
  )
})

sourceTest('source exposes one shared operation to both command surfaces', () => {
  const interactive = withoutSourceMap(readOwner('commands/rename/rename.ts'))
  const local = readOwner('commands/rename/rename-noninteractive.ts')
  const index = readOwner('commands/rename/index.ts')
  assert.match(interactive, /export async function performRename\(/)
  assert.match(
    interactive,
    /onDone\(await performRename\(args, context\), \{ display: 'system' \}\)/,
  )
  assert.match(local, /value: await performRename\(args, context\)/)
  assert.equal((index.match(/aliases: \['name'\]/g) ?? []).length, 2)
  assert.match(index, /export const renameNonInteractive = \{[\s\S]*supportsNonInteractive: true/)
})

sourceTest('actual shared operation preserves results and immutable state flow', async () => {
  const loaded = await instantiateOwners()
  const first = createContext(loaded.events)
  assert.equal(
    await loaded.rename.performRename('  chosen-name  ', first.context),
    'Session renamed to: chosen-name',
  )
  assert.equal(first.state.standaloneAgentContext.name, 'chosen-name')
  assert.deepEqual(
    loaded.events.slice(0, 3),
    [
      ['saveCustomTitle', '00000000-0000-4000-8000-000000000001', 'chosen-name', '/tmp/transcript.jsonl'],
      ['saveAgentName', '00000000-0000-4000-8000-000000000001', 'chosen-name', '/tmp/transcript.jsonl'],
      ['setAppState', 'chosen-name'],
    ],
  )

  const second = createContext(loaded.events)
  assert.deepEqual(await loaded.nonInteractive.call('', second.context), {
    type: 'text',
    value: 'Session renamed to: generated-topic',
  })
  assert.equal(second.state.standaloneAgentContext.name, 'generated-topic')
  assert.equal(
    loaded.events.filter(event => event[0] === 'generateSessionName').length,
    1,
  )

  const teammate = await instantiateOwners({ teammate: true })
  const blocked = createContext(teammate.events)
  assert.equal(
    await teammate.rename.performRename('blocked', blocked.context),
    'Cannot rename: This session is a swarm teammate. Teammate names are set by the team leader.',
  )
  assert.deepEqual(teammate.events, [])
  assert.equal(blocked.state.standaloneAgentContext.name, 'old-name')
})
