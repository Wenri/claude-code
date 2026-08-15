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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnits = {
  project: {
    index: 17590,
    start: 10947713,
    end: 10957918,
    sourceHash:
      '420936f565b7daaf175d8b82164d08fa769e56bf268bf31e71f961112471132d',
  },
  syncTailReader: {
    index: 17624,
    start: 10967906,
    end: 10968171,
    sourceHash:
      '7209dead3629cc4068fa08ea72bf6e1c1bbc5bce3d9858c59c2df0607b606864',
  },
}

const targetUnits = {
  project: {
    index: 17781,
    classification: 'unresolved',
    start: 11016655,
    end: 11027221,
    sourceHash:
      '64ab353182ac629b6ef5c5d8cf879c0c02a0fdcb59ff6a5c406c4077d7200407',
  },
  syncTailReader: {
    index: 17815,
    classification: 'matched',
    baselineUnitIndex: 17624,
    start: 11037237,
    end: 11037502,
    sourceHash:
      '8fb4e44507a8a385bf078007f92c1603a9b270b4ae51e4c8fc06b523c41a4a8f',
  },
  asyncAppender: {
    index: 17816,
    classification: 'unresolved',
    start: 11037502,
    end: 11037701,
    sourceHash:
      '40231520d32dceeb1d78de6d788e58c915fe8119b8d0a34233307d4b79ea3d9c',
  },
  asyncTailReader: {
    index: 17817,
    classification: 'unresolved',
    start: 11037701,
    end: 11037993,
    sourceHash:
      '7b144401b993c77b0c408e342c9a2c9b3dbfb5090dd9e6d1743f5922d6f6de39',
  },
}

const typedRows = [
  [652, 'reAppendSessionMetadataAsync', 11019398, 11019426],
  [653, 'planReAppendSessionMetadata', 11019670, 11019697],
  [654, 'reAppendSessionMetadataAsync', 11019766, 11019794],
  [655, 'planReAppendSessionMetadata', 11019897, 11019924],
  [656, 'planReAppendSessionMetadata', 11019993, 11020020],
  [657, 'reAppendSessionMetadataAsync', 11023046, 11023074],
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
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

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
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

function findDeclaration(ts, file, name, predicate) {
  const declaration = file.statements.find(
    statement => predicate(statement) && statement.name?.text === name,
  )
  assert.ok(declaration, `${name} declaration`)
  return declaration
}

async function instantiateProjectHarness(overrides = {}) {
  const ts = await loadTypeScript()
  const text = source('src/utils/sessionStorage.ts')
  const file = ts.createSourceFile(
    'sessionStorage.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = findDeclaration(
    ts,
    file,
    'Project',
    ts.isClassDeclaration,
  )
  const classSource = text.slice(declaration.getStart(file), declaration.end)
  const javascript = ts.transpileModule(
    `${classSource}\nmodule.exports = { Project }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const dependencies = {
    getSessionId: () => 'session-116',
    readFileTailSync: () => '',
    readFileTailAsync: async () => '',
    appendEntryToFile() {},
    async appendEntryToFileAsync() {},
    extractLastJsonStringField(line, field) {
      return JSON.parse(line)[field]
    },
    LITE_READ_BUF_SIZE: 64 * 1024,
    logError() {},
    ...overrides,
  }
  const names = Object.keys(dependencies)
  const module = { exports: {} }
  new Function('exports', 'module', ...names, javascript)(
    module.exports,
    module,
    ...names.map(name => dependencies[name]),
  )
  return new module.exports.Project()
}

async function instantiateAsyncHelpers(overrides = {}) {
  const ts = await loadTypeScript()
  const text = source('src/utils/sessionStorage.ts')
  const file = ts.createSourceFile(
    'sessionStorage.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const names = ['appendEntryToFileAsync', 'readFileTailAsync']
  const declarations = names.map(name =>
    findDeclaration(ts, file, name, ts.isFunctionDeclaration),
  )
  const snippet = declarations
    .map(declaration => text.slice(declaration.getStart(file), declaration.end))
    .join('\n')
  const javascript = ts.transpileModule(
    `${snippet}\nmodule.exports = { ${names.join(', ')} }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const dependencies = {
    fsAppendFile: async () => {},
    mkdir: async () => {},
    dirname: value => path.dirname(value),
    jsonStringify: JSON.stringify,
    fireSessionMirror() {},
    fsOpen: async () => {
      throw new Error('missing fsOpen stub')
    },
    LITE_READ_BUF_SIZE: 64 * 1024,
    ...overrides,
  }
  const dependencyNames = Object.keys(dependencies)
  const module = { exports: {} }
  new Function('exports', 'module', ...dependencyNames, javascript)(
    module.exports,
    module,
    ...dependencyNames.map(name => dependencies[name]),
  )
  return module.exports
}

function seedMetadata(project) {
  project.sessionFile = '/tmp/session.jsonl'
  project.bytesSinceMetadataReAppend = 8192
  project.currentSessionLastPrompt = 'last prompt'
  project.currentSessionTitle = 'cached title'
  project.currentSessionTag = 'cached tag'
  project.currentSessionAgentName = 'agent name'
  project.currentSessionAgentColor = 'blue'
  project.currentSessionAgentSetting = 'agent setting'
  project.currentSessionMode = 'coordinator'
  project.currentSessionPermissionMode = 'acceptEdits'
  project.currentSessionWorktree = null
}

test(
  'target116 authenticates the async metadata planner and I/O helpers',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const unit of Object.values(baselineUnits)) {
      assert.equal(
        sha256(baseline.slice(unit.start, unit.end)),
        unit.sourceHash,
        `baseline structural unit ${unit.index}`,
      )
    }
    for (const unit of Object.values(targetUnits)) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, unit.classification)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [unit.start, unit.end, unit.sourceHash],
      )
      if (unit.baselineUnitIndex !== undefined) {
        assert.equal(region.baselineUnitIndex, unit.baselineUnitIndex)
      }
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
        `target structural unit ${unit.index}`,
      )
    }
    for (const [row, value, start, end] of typedRows) {
      assert.equal(target.slice(start, end), value, `typed-audit row ${row}`)
    }

    const baselineProject = baseline.slice(
      baselineUnits.project.start,
      baselineUnits.project.end,
    )
    const targetProject = target.slice(
      targetUnits.project.start,
      targetUnits.project.end,
    )
    assert.doesNotMatch(
      baselineProject,
      /reAppendSessionMetadataAsync|planReAppendSessionMetadata/,
    )
    assert.match(
      baselineProject,
      /bytesSinceMetadataReAppend>=Rr\/2\)try\{this\.reAppendSessionMetadata\(\)/,
    )
    assert.match(
      targetProject,
      /bytesSinceMetadataReAppend>=fp\/2\)try\{await this\.reAppendSessionMetadataAsync\(\)/,
    )
    assert.match(
      targetProject,
      /async reAppendSessionMetadataAsync\(H=!1\)/,
    )
    assert.match(targetProject, /planReAppendSessionMetadata\(H,\$\)/)
    assert.match(
      targetProject,
      /ensureCurrentSessionFile\(\),await this\.reAppendSessionMetadataAsync\(\)/,
    )

    const asyncAppender = target.slice(
      targetUnits.asyncAppender.start,
      targetUnits.asyncAppender.end,
    )
    const asyncTailReader = target.slice(
      targetUnits.asyncTailReader.start,
      targetUnits.asyncTailReader.end,
    )
    assert.match(asyncAppender, /await d1\.appendFile/)
    assert.match(asyncAppender, /recursive:!0,mode:448/)
    assert.match(asyncTailReader, /await d1\.open\(H,"r"\)/)
    assert.match(asyncTailReader, /await \$\.close\(\)/)
  },
)

test(
  'sync and async writers share one refreshed ordered metadata plan',
  sourceOptions,
  async () => {
    const tail = [
      JSON.stringify({ type: 'custom-title', customTitle: 'external title' }),
      JSON.stringify({ type: 'tag', tag: 'external tag' }),
      '',
    ].join('\n')
    const syncEntries = []
    const asyncEntries = []
    const project = await instantiateProjectHarness({
      readFileTailSync: () => tail,
      readFileTailAsync: async () => tail,
      appendEntryToFile: (_file, entry) => syncEntries.push(entry),
      appendEntryToFileAsync: async (_file, entry) => {
        await Promise.resolve()
        asyncEntries.push(entry)
      },
    })
    seedMetadata(project)

    project.reAppendSessionMetadata()
    assert.equal(project.bytesSinceMetadataReAppend, 0)
    assert.equal(project.currentSessionTitle, 'external title')
    assert.equal(project.currentSessionTag, 'external tag')
    assert.deepEqual(
      syncEntries.map(entry => entry.type),
      [
        'last-prompt',
        'custom-title',
        'tag',
        'agent-name',
        'agent-color',
        'agent-setting',
        'mode',
        'permission-mode',
        'worktree-state',
      ],
    )

    await project.reAppendSessionMetadataAsync()
    assert.deepEqual(asyncEntries, syncEntries)

    project.currentSessionTitle = 'keep cached title'
    project.currentSessionTag = 'cached tag'
    const skipped = project.planReAppendSessionMetadata(tail, true)
    assert.ok(skipped)
    assert.equal(project.currentSessionTitle, 'keep cached title')
    assert.equal(project.currentSessionTag, 'external tag')

    project.sessionFile = null
    assert.equal(project.planReAppendSessionMetadata(tail, false), null)
    const noSession = await instantiateProjectHarness({
      getSessionId: () => undefined,
    })
    noSession.sessionFile = '/tmp/no-session.jsonl'
    assert.equal(noSession.planReAppendSessionMetadata('', false), null)
  },
)

test(
  'drain and materialization await async metadata before completing',
  sourceOptions,
  async () => {
    const drainProject = await instantiateProjectHarness()
    drainProject.bytesSinceMetadataReAppend = 32 * 1024
    let releaseDrain
    const drainGate = new Promise(resolve => {
      releaseDrain = resolve
    })
    const drainEvents = []
    drainProject.reAppendSessionMetadataAsync = async () => {
      drainEvents.push('metadata-start')
      await drainGate
      drainEvents.push('metadata-end')
    }
    let drainSettled = false
    const drain = drainProject.drainWriteQueue().then(() => {
      drainSettled = true
      drainEvents.push('drain-end')
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(drainEvents, ['metadata-start'])
    assert.equal(drainSettled, false)
    releaseDrain()
    await drain
    assert.deepEqual(drainEvents, [
      'metadata-start',
      'metadata-end',
      'drain-end',
    ])

    const materializeProject = await instantiateProjectHarness()
    materializeProject.shouldSkipPersistence = () => false
    materializeProject.ensureCurrentSessionFile = () => {
      materializeProject.sessionFile = '/tmp/materialize.jsonl'
      return materializeProject.sessionFile
    }
    materializeProject.pendingEntries = [{ type: 'summary', summary: 'ready' }]
    let releaseMaterialize
    const materializeGate = new Promise(resolve => {
      releaseMaterialize = resolve
    })
    const materializeEvents = []
    materializeProject.reAppendSessionMetadataAsync = async () => {
      materializeEvents.push('metadata-start')
      await materializeGate
      materializeEvents.push('metadata-end')
    }
    materializeProject.appendEntry = async entry => {
      materializeEvents.push(['append', entry])
    }
    const materialize = materializeProject.materializeSessionFile()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(materializeEvents, ['metadata-start'])
    releaseMaterialize()
    await materialize
    assert.deepEqual(materializeEvents, [
      'metadata-start',
      'metadata-end',
      ['append', { type: 'summary', summary: 'ready' }],
    ])
  },
)

test(
  'async helpers read a bounded tail and preserve mkdir/retry/mirror order',
  sourceOptions,
  async () => {
    const content = Buffer.from('0123456789')
    const events = []
    let appendAttempt = 0
    let openImpl = async (file, flags) => {
      events.push(['open', file, flags])
      return {
        async stat() {
          events.push(['stat'])
          return { size: content.length }
        },
        async read(buffer, offset, length, position) {
          events.push(['read', offset, length, position])
          const bytes = content.subarray(position, position + length)
          bytes.copy(buffer, offset)
          return { bytesRead: bytes.length }
        },
        async close() {
          events.push(['close'])
        },
      }
    }
    const helpers = await instantiateAsyncHelpers({
      LITE_READ_BUF_SIZE: 8,
      fsOpen: (...args) => openImpl(...args),
      fsAppendFile: async (...args) => {
        appendAttempt++
        events.push(['append', ...args])
        if (appendAttempt === 1) throw new Error('ENOENT')
      },
      mkdir: async (...args) => events.push(['mkdir', ...args]),
      fireSessionMirror: (...args) => events.push(['mirror', ...args]),
    })

    assert.equal(await helpers.readFileTailAsync('/tmp/session.jsonl'), '23456789')
    assert.deepEqual(events.slice(0, 4), [
      ['open', '/tmp/session.jsonl', 'r'],
      ['stat'],
      ['read', 0, 8, 2],
      ['close'],
    ])

    events.length = 0
    const entry = { type: 'tag', tag: 'external', sessionId: 'session-116' }
    await helpers.appendEntryToFileAsync('/tmp/nested/session.jsonl', entry)
    assert.deepEqual(events.map(event => event[0]), [
      'append',
      'mkdir',
      'append',
      'mirror',
    ])
    assert.deepEqual(events[0].slice(1), [
      '/tmp/nested/session.jsonl',
      `${JSON.stringify(entry)}\n`,
      { mode: 0o600 },
    ])
    assert.deepEqual(events[1].slice(1), [
      '/tmp/nested',
      { recursive: true, mode: 0o700 },
    ])
    assert.deepEqual(events[3].slice(1), [
      '/tmp/nested/session.jsonl',
      [entry],
    ])

    events.length = 0
    openImpl = async () => {
      throw new Error('EIO')
    }
    assert.equal(await helpers.readFileTailAsync('/tmp/broken.jsonl'), '')
    assert.deepEqual(events, [])
  },
)
