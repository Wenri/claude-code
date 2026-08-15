import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
      : false,
}

const targetUnits = [
  {
    index: 16185,
    start: 11689980,
    end: 11693008,
    nodeType: 'ExpressionStatement',
    sourceHash:
      'a227c996f4610d3aed875b09c3273d53fa5a537debdb4ec405125ee4c6cbc4b9',
  },
  {
    index: 16225,
    start: 11696275,
    end: 11705933,
    nodeType: 'ClassDeclaration',
    sourceHash:
      '16fcdcad4fa56a3f64df678b326c0a4244a09f8e7cabd8e1bc1d88a50223e957',
  },
  {
    index: 16321,
    start: 11740581,
    end: 11742078,
    nodeType: 'VariableDeclaration',
    sourceHash:
      'f60da1e8f78ad3a3900adf9f364b5182317053d36de09b0a935a808254798b3d',
  },
]

const typedRows = [
  { index: 502, start: 11692978, end: 11692997, value: 'ENTRY_APPEND_POLICY' },
  { index: 504, start: 11703911, end: 11703927, value: '"route-by-agent"' },
  { index: 506, start: 11704027, end: 11704045, value: '"dedup-transcript"' },
  {
    index: 505,
    start: 11704089,
    end: 11704160,
    value:
      "appendEntry invariant: dedup-transcript policy on non-transcript type '",
  },
  { index: 509, start: 11741139, end: 11741157, value: '"dedup-transcript"' },
  { index: 510, start: 11741168, end: 11741186, value: '"dedup-transcript"' },
  { index: 511, start: 11741198, end: 11741216, value: '"dedup-transcript"' },
  { index: 512, start: 11741224, end: 11741242, value: '"dedup-transcript"' },
  { index: 513, start: 11741252, end: 11741270, value: '"dedup-transcript"' },
  { index: 514, start: 11741736, end: 11741752, value: '"route-by-agent"' },
]

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
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
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

async function compilePolicyHarness() {
  const ts = await loadTypeScript()
  const owner = source('utils/sessionStorage.ts')
  const parsed = ts.createSourceFile(
    'sessionStorage.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const policy = parsed.statements.find(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => declaration.name.getText(parsed) === 'ENTRY_APPEND_POLICY',
      ),
  )
  assert.ok(policy, 'ENTRY_APPEND_POLICY declaration')
  const project = parsed.statements.find(
    statement => ts.isClassDeclaration(statement) && statement.name?.text === 'Project',
  )
  assert.ok(project, 'Project declaration')
  const appendEntry = project.members.find(
    member =>
      ts.isMethodDeclaration(member) &&
      member.name.getText(parsed) === 'appendEntry',
  )
  assert.ok(appendEntry, 'Project.appendEntry declaration')

  const input = `
${policy.getText(parsed).replace(/^export\s+/, '')}
class PolicyHarness {
  sessionFile = '/main.jsonl'
  pendingEntries = []
  internalEventWriter = null
  writes = []
  persisted = []
  shouldSkipPersistence() { return false }
  async getExistingSessionFile(sessionId) { return '/sessions/' + sessionId + '.jsonl' }
  enqueueWrite(file, entry) { this.writes.push({ file, entry }) }
  async persistToRemote(sessionId, entry) { this.persisted.push({ sessionId, entry }) }
  ${appendEntry.getText(parsed)}
}
module.exports = { PolicyHarness, ENTRY_APPEND_POLICY }
`
  const javascript = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const errors = []
  const sessionMessages = new Map()
  const stubs = {
    getSessionId: () => 'main-session',
    logError: error => errors.push(error),
    getAgentTranscriptPath: agentId => `/agents/${agentId}.jsonl`,
    asAgentId: value => value,
    isTranscriptMessage: entry =>
      ['user', 'assistant', 'attachment', 'system'].includes(entry.type),
    getSessionMessages: async sessionId => {
      if (!sessionMessages.has(sessionId)) sessionMessages.set(sessionId, new Set())
      return sessionMessages.get(sessionId)
    },
  }
  const module = { exports: {} }
  const names = Object.keys(stubs)
  new Function('module', 'exports', ...names, javascript)(
    module,
    module.exports,
    ...names.map(name => stubs[name]),
  )
  return { ...module.exports, errors, owner, sessionMessages }
}

test(
  'authenticated target105 replaces append dispatch with a complete policy table and invariant',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    for (const unit of targetUnits) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [unit.start, unit.end, unit.nodeType, unit.sourceHash],
      )
      assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
    }
    for (const row of typedRows) {
      assert.equal(
        target.slice(row.start, row.end),
        row.value,
        `typed-audit row ${row.index}`,
      )
    }

    assert.equal((baseline.match(/dedup-transcript/g) ?? []).length, 0)
    assert.equal((baseline.match(/route-by-agent/g) ?? []).length, 0)
    for (const bundle of [target, latest]) {
      assert.equal((bundle.match(/dedup-transcript/g) ?? []).length, 7)
      assert.equal((bundle.match(/route-by-agent/g) ?? []).length, 2)
      assert.match(bundle, /ENTRY_APPEND_POLICY/)
      assert.match(
        bundle,
        /appendEntry invariant: dedup-transcript policy on non-transcript type/,
      )
    }
  },
)

test('source policy routes metadata, content replacements, and transcript dedup', sourceOptions, async () => {
  const {
    PolicyHarness,
    ENTRY_APPEND_POLICY,
    errors,
    owner,
    sessionMessages,
  } = await compilePolicyHarness()
  assert.equal(ENTRY_APPEND_POLICY.summary, 'always')
  assert.equal(ENTRY_APPEND_POLICY['queue-operation'], 'always')
  assert.equal(ENTRY_APPEND_POLICY['content-replacement'], 'route-by-agent')
  for (const type of ['user', 'assistant', 'attachment', 'system', 'progress']) {
    assert.equal(ENTRY_APPEND_POLICY[type], 'dedup-transcript')
  }

  const project = new PolicyHarness()
  await project.appendEntry({ type: 'summary' })
  await project.appendEntry({
    type: 'content-replacement',
    agentId: 'agent-1',
    replacements: [],
  })
  assert.deepEqual(
    project.writes.map(write => write.file),
    ['/main.jsonl', '/agents/agent-1.jsonl'],
  )

  const user = {
    type: 'user',
    uuid: 'user-1',
    isSidechain: false,
    message: { role: 'user', content: 'hello' },
  }
  await project.appendEntry(user)
  await project.appendEntry(user)
  assert.equal(project.writes.filter(write => write.entry === user).length, 1)
  assert.deepEqual(project.persisted, [
    { sessionId: 'main-session', entry: user },
  ])
  assert.ok(sessionMessages.get('main-session').has('user-1'))

  const progress = { type: 'progress', uuid: 'progress-1', isSidechain: false }
  await project.appendEntry(progress)
  assert.equal(project.writes.at(-1).entry, progress)
  assert.equal(project.persisted.length, 1, 'progress is not remotely persisted')

  ENTRY_APPEND_POLICY.invalid = 'dedup-transcript'
  await project.appendEntry({ type: 'invalid', uuid: 'invalid-1', isSidechain: false })
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /appendEntry invariant: dedup-transcript/)

  const sidechain = {
    type: 'assistant',
    uuid: 'sidechain-duplicate',
    isSidechain: true,
    agentId: 'agent-2',
    message: { role: 'assistant', content: [] },
  }
  sessionMessages.get('main-session').add(sidechain.uuid)
  project.internalEventWriter = async () => {}
  await project.appendEntry(sidechain)
  assert.equal(project.writes.at(-1).file, '/agents/agent-2.jsonl')
  const latestSidechainRemote = owner.includes(
    'else if (this.internalEventWriter && isTranscriptMessage(entry))',
  )
  assert.equal(
    project.persisted.filter(item => item.entry === sidechain).length,
    latestSidechainRemote ? 1 : 0,
  )
})

test('source exposes the target policy surface and preserves every always-write entry', sourceOptions, () => {
  const owner = source('utils/sessionStorage.ts')
  assert.match(owner, /export const ENTRY_APPEND_POLICY/)
  assert.match(owner, /switch \(ENTRY_APPEND_POLICY\[entry\.type\]\)/)
  for (const type of [
    'summary',
    'custom-title',
    'ai-title',
    'last-prompt',
    'tag',
    'agent-name',
    'agent-color',
    'agent-setting',
    'pr-link',
    'file-history-snapshot',
    'attribution-snapshot',
    'speculation-accept',
    'mode',
    'permission-mode',
    'worktree-state',
    'queue-operation',
    'marble-origami-commit',
    'marble-origami-snapshot',
  ]) {
    assert.match(owner, new RegExp(`['"]?${type}['"]?: ['"]always['"]`))
  }
})
