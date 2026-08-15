import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const recoveredSourceRoot = path.join(repositoryRoot, 'src')
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? recoveredSourceRoot,
)
const historicalPackageSelected = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_TARGET_COMMIT,
)
const manualComparisonSelected =
  !historicalPackageSelected && sourceRoot !== recoveredSourceRoot
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.113-first-half-strict-tail-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const replayHelperPath = path.join(repositoryRoot, fixture.packageRecipes.replayHelper)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 = '841f7ac1066ad9d15375bd1f60c633b1ea60600dbbcb3355bf7777e9ebcebb0b'
const TARGET_INDICES = [
  14340, 14369, 14438, 14551, 14630, 14662, 14666, 14672, 14996,
  15156, 15189, 15254, 15293, 15294, 15295, 15306, 15309, 15429,
  15430, 15433, 15511, 15516, 15531, 15570, 15571, 15572, 15823,
  16133, 16135, 16137, 16263, 16428, 16446, 16448, 16454, 16539,
  16723, 16725, 16949, 17299, 17300, 17478, 17484, 17485,
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  return `${kind}:${kind === 'number' ? String(value) : JSON.stringify(value)}`
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function collectOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  const add = (kind, value, start, end) =>
    occurrences.push({ end, identity: identity(kind, value), start })
  walk(ast, node => {
    if (node.type === 'Literal') {
      if (typeof node.value === 'string') add('string', node.value, node.start, node.end)
      else if (typeof node.value === 'number') add('number', node.value, node.start, node.end)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node.start, node.end)
    }
    const isProperty =
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
        node.computed === false && node.key?.type === 'Identifier') ||
      (node.type === 'MemberExpression' && node.computed === false &&
        node.property?.type === 'Identifier')
    if (isProperty) {
      const property = node.key ?? node.property
      add('property', property.name, property.start, property.end)
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  const grouped = new Map()
  for (const occurrence of occurrences) {
    const values = grouped.get(occurrence.identity) ?? []
    values.push(occurrence)
    grouped.set(occurrence.identity, values)
  }
  return grouped
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifact.targetInnerSha256) return bytes.toString('utf8')
  assert.equal(digest, fixture.artifact.targetWrapperSha256)
  const inner = bytes.subarray(
    fixture.artifact.targetWrapperPrefixLength,
    bytes.length - fixture.artifact.targetWrapperSuffixLength,
  )
  assert.equal(sha256(inner), fixture.artifact.targetInnerSha256)
  return inner.toString('utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js'),
    path.join(repositoryRoot, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

function sourceFilename(root, owner) {
  const relative = owner.replace(/^src\//, '')
  const direct = path.join(root, relative)
  const nested = path.join(root, owner)
  return fs.existsSync(direct) ? direct : nested
}

function parseSource(ts, root, owner) {
  const filename = sourceFilename(root, owner)
  assert.ok(fs.existsSync(filename), `${owner}: recovered package owner exists`)
  const source = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${owner}: parses`)
  return { filename, parsed, source }
}

function declarationNamed(ts, parsed, name) {
  for (const statement of parsed.statements) {
    const declarationName = statement.name && ts.isIdentifier(statement.name)
      ? statement.name.text
      : undefined
    if (declarationName === name) return statement
  }
}

function variableStatementNamed(ts, parsed, name) {
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue
    if (statement.declarationList.declarations.some(
      declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name,
    )) return statement
  }
}

function compileDeclarations(ts, owner, names, bindings) {
  const { parsed } = parseSource(ts, recoveredSourceRoot, owner)
  const snippets = names.map(name => {
    const node = declarationNamed(ts, parsed, name) ?? variableStatementNamed(ts, parsed, name)
    assert.ok(node, `${owner}: declaration ${name}`)
    return node.getText(parsed)
  })
  const input = snippets.join('\n').replace(
    /\bexport\s+(?=(?:async\s+)?function\b|(?:const|let|var)\b)/g,
    '',
  )
  const output = ts.transpileModule(input, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const keys = Object.keys(bindings)
  return new Function(...keys, `${output}\nreturn {${names.join(',')}}`)(
    ...keys.map(key => bindings[key]),
  )
}

test('the target113 first-half strict-tail fixture is an exact closed partition', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(
    sha256(fs.readFileSync(replayHelperPath)),
    fixture.packageRecipes.replayHelperSha256,
  )
  assert.equal(fixture.packageRecipes.replayExport, 'replayTarget113FirstHalfStrictTail')
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 44,
    residues: 133,
    dualRootUnits: 15,
    recoveredGapUnits: 26,
    dormantUnits: 3,
    packageOnlyUnits: 4,
  })
  assert.deepEqual(fixture.rows.map(row => row.targetIndex), TARGET_INDICES)
  assert.equal(fixture.rows.flatMap(row => row.residues).length, 133)
  assert.equal(new Set(TARGET_INDICES).size, TARGET_INDICES.length)
  for (const row of fixture.rows) {
    const region = structural.regions[row.targetIndex]
    assert.deepEqual(
      {
        classification: region.classification,
        start: region.target.start,
        end: region.target.end,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
      },
      row.target,
      `u${row.targetIndex}: structural identity`,
    )
    assert.equal(
      sha256(JSON.stringify(row.residues.map(residue => residue.slice(0, 6)))),
      row.residueDigest,
      `u${row.targetIndex}: residue digest`,
    )
    for (const [, , start, end, baselineCount, ordinal] of row.residues) {
      assert.ok(ordinal > baselineCount, `u${row.targetIndex}: target-added`)
      assert.ok(start >= row.target.start && end <= row.target.end)
    }
  }
})

test('authenticated bundles reproduce every exact residue occurrence and whole unit', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_112_BUNDLE and CLAUDE_CODE_2_1_113_BUNDLE are required'
      : false,
}, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  assert.equal(sha256(baselineBytes), fixture.artifact.baselineSha256)
  const target = authenticatedTargetInner(targetPath)
  const targetOccurrences = collectOccurrences(target)
  const baselineOccurrences = collectOccurrences(baselineBytes.toString('utf8'))
  for (const row of fixture.rows) {
    assert.equal(
      sha256(target.slice(row.target.start, row.target.end)),
      row.target.sourceHash,
      `u${row.targetIndex}: authenticated whole unit`,
    )
    for (const [kind, value, start, end, baselineCount, ordinal] of row.residues) {
      const key = identity(kind, value)
      assert.equal((baselineOccurrences.get(key) ?? []).length, baselineCount)
      const occurrence = (targetOccurrences.get(key) ?? [])[ordinal - 1]
      assert.deepEqual(
        occurrence && [occurrence.start, occurrence.end],
        [start, end],
        `u${row.targetIndex}: ${key} #${ordinal}`,
      )
    }
  }
})

test('source ownership is fail-closed across current, comparison, and historical package roots', async () => {
  if (!selected) return
  const ts = await loadTypeScript()
  const grouped = new Map()
  for (const row of fixture.rows) {
    if (!row.source) continue
    const rows = grouped.get(row.source.path) ?? []
    rows.push(row)
    grouped.set(row.source.path, rows)
  }
  for (const [owner, rows] of grouped) {
    const filename = sourceFilename(sourceRoot, owner)
    const gaps = rows.filter(row => row.category === 'recovered-source-gap')
    if (manualComparisonSelected && gaps.length > 0) {
      const source = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : ''
      assert.ok(
        gaps.some(row => row.source.evidence.some(fragment => !source.includes(fragment))),
        `${owner}: the raw comparison root must omit at least one recovered hunk`,
      )
      continue
    }
    const parsed = parseSource(ts, sourceRoot, owner)
    for (const row of rows) {
      for (const fragment of row.source.evidence) {
        assert.ok(parsed.source.includes(fragment), `u${row.targetIndex} ${owner}: ${fragment}`)
      }
      if (!historicalPackageSelected && !manualComparisonSelected) {
        assert.equal(sha256(parsed.source), row.source.recoveredFileSha256, owner)
      }
    }
  }
  for (const [owner, proof] of Object.entries(fixture.supportFiles)) {
    const filename = sourceFilename(sourceRoot, owner)
    if (manualComparisonSelected) {
      const source = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : ''
      assert.ok(proof.evidence.some(fragment => !source.includes(fragment)))
      continue
    }
    const parsed = parseSource(ts, sourceRoot, owner)
    for (const fragment of proof.evidence) assert.ok(parsed.source.includes(fragment))
    if (!historicalPackageSelected) assert.equal(sha256(parsed.source), proof.recoveredFileSha256)
  }
})

test('the package-only scan contributes exactly four additional fail-closed units', () => {
  const packageOnly = fixture.rows.filter(row => row.packageOnly)
  assert.deepEqual(packageOnly.map(row => row.targetIndex), [14672, 15571, 15572, 16539])
  assert.deepEqual(packageOnly.map(row => row.residues.length), [1, 22, 5, 2])
  const scanPath = path.join(repositoryRoot, '.recovery-tmp/target113-package-scan-current.json')
  if (!fs.existsSync(scanPath)) return
  assert.equal(sha256(fs.readFileSync(scanPath)), fixture.artifact.packageScanCurrentSha256)
})

test('the jobs-state residue graph is authenticated, dormant, and non-escaping', {
  skip: !targetPath || !selected
    ? 'the authenticated target bundle is required'
    : false,
}, () => {
  const target = authenticatedTargetInner(targetPath)
  for (const [name, expected] of Object.entries(fixture.dormantGraph.identifierOccurrences)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.equal([...target.matchAll(new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, 'g'))].length, expected, name)
  }
  assert.equal(/\btt\$\s*\(/g.test(target.replace(/function tt\$\([^}]+\}/, '')), false)
  assert.equal(/\bet\$\s*\(/g.test(target.replace(/async function et\$\([^}]+\}/, '')), false)
})

test('recovered source gaps have executable boundary proofs', async () => {
  if (!selected || manualComparisonSelected) return
  const ts = await loadTypeScript()

  const reason = 'This command changes directory before running git, which can execute untrusted hooks from the target directory. Approve only if you trust it.'
  const bash = compileDeclarations(ts, 'src/tools/BashTool/bashCommandHelpers.ts', ['segmentedCommandPermissionResult'], {
    splitCommand_DEPRECATED: command => command.split('&&'),
    createPermissionRequestMessage: (_name, decision) => decision.reason,
    BashTool: { name: 'Bash' },
  }).segmentedCommandPermissionResult
  const bashResult = await bash(
    { command: 'cd ./repo | git status' },
    ['cd ./repo', 'git status'],
    async () => ({ behavior: 'allow' }),
    {
      isNormalizedCdCommand: command => command.startsWith('cd '),
      isNormalizedGitCommand: command => command.startsWith('git '),
    },
    async () => false,
  )
  assert.equal(bashResult.behavior, 'ask')
  assert.equal(bashResult.decisionReason.reason, reason)

  const memory = compileDeclarations(ts, 'src/services/teamMemorySync/index.ts', ['reapRemoteTombstones'], {
    validateTeamMemKey: async key => `/memory/${key}`,
    unlink: async filename => {
      if (filename.endsWith('missing.md')) throw Object.assign(new Error(), { code: 'ENOENT' })
    },
    isErrnoException: error => error && typeof error.code === 'string',
    logForDebugging() {},
    count: (values, predicate) => values.filter(predicate).length,
  }).reapRemoteTombstones
  assert.equal(await memory({ 'kept.md': 1, 'missing.md': 2 }), 1)

  const elements = []
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const value = { type, props: props ?? {}, children }
      elements.push(value)
      return value
    },
  }
  const table = compileDeclarations(
    ts,
    'src/components/design-system/Table.tsx',
    ['horizontalSegment', 'minimalSegment', 'Border'],
    { React, Box: 'Box', Text: 'Text' },
  ).Border
  const simple = table({ box: 'simple', type: 'top', widths: [2, 3] })
  assert.equal(simple.children[0], '────┼─────')

  const search = compileDeclarations(
    ts,
    'src/components/SearchBox.tsx',
    ['renderSearchBoxQuery'],
    { React, Text: 'Text' },
  ).renderSearchBoxQuery
  const highlighted = search('abcdef', [[1, 4]], 2)
  assert.deepEqual(highlighted.map(item => [item.props.color, item.props.inverse, item.children[0]]), [
    [undefined, false, 'a'], ['suggestion', false, 'b'],
    ['suggestion', true, 'c'], ['suggestion', false, 'd'], [undefined, false, 'ef'],
  ])

  const exports = compileDeclarations(
    ts,
    'src/components/ExportDialog.tsx',
    ['normalizeExportPath', 'writeExportFile'],
    {
      extname: path.extname,
      expandPath: filename => path.join('/safe', filename),
      dirname: path.dirname,
      mkdir: async filename => elements.push({ mkdir: filename }),
      writeFileSync_DEPRECATED: (filename, content, options) => elements.push({ filename, content, options }),
    },
  )
  assert.equal(exports.normalizeExportPath('report'), '/safe/report.txt')
  assert.equal(exports.normalizeExportPath('report.md'), '/safe/report.md')
  assert.equal(await exports.writeExportFile('nested/report', 'proof'), '/safe/nested/report.txt')
  assert.ok(elements.some(item => item.filename === '/safe/nested/report.txt' && item.options.flush))

  const doctor = compileDeclarations(ts, 'src/screens/Doctor.tsx', ['buildDoctorFixPrompt'], {
    getCachedKeybindingWarnings: () => [],
    getKeybindingsPath: () => '/keys',
    getPluginErrorMessage: error => error.message,
    SandboxManager: {
      isSupportedPlatform: () => false,
      isSandboxEnabledInSettings: () => false,
      isPlatformInEnabledList: () => false,
      checkDependencies: () => ({ errors: [] }),
    },
  }).buildDoctorFixPrompt
  const prompt = doctor({ warnings: [{ issue: 'bad', fix: 'repair' }] }, null, [], [], null, [])
  assert.match(prompt, /bad\n  Suggested fix: repair/)
  assert.match(prompt, /ask me to confirm/)

  const agentic = compileDeclarations(ts, 'src/utils/agenticSessionSearch.ts', ['createSessionSearchCanUseTool'], {
    hasPermissionsToUseTool: async () => ({ behavior: 'allow' }),
    expandPath: filename => path.resolve('/', filename),
    sep: path.sep,
  }).createSessionSearchCanUseTool(['/sessions'])
  const tool = { getPath: input => input.path }
  assert.equal((await agentic(tool, { path: '/sessions/a.jsonl' })).behavior, 'allow')
  assert.equal((await agentic(tool, { path: '/etc/passwd' })).behavior, 'deny')

  const usage = compileDeclarations(
    ts,
    'src/components/Settings/UsageContributors.tsx',
    ['modelTier', 'readUsageRecords'],
    {
      stat: async () => ({ isFile: () => true, mtimeMs: Date.now(), size: 200 }),
      readFile: async () => '{"type":"assistant","timestamp":"2026-08-13T00:00:00Z","sessionId":"s","model":"opus","usage":{"input_tokens":2,"output_tokens":3,"cache_creation_input_tokens":4,"cache_read_input_tokens":5},"requestId":"r"}\n',
      isENOENT: () => false,
      MAX_FILE_BYTES: 1_000,
      TIMESTAMP_RE: /"timestamp":"([^"]+)"/,
      SESSION_ID_RE: /"sessionId":"([^"]+)"/,
      MODEL_RE: /"model":"([^"]+)"/,
      REQUEST_ID_RE: /"requestId":"([^"]+)"/,
      MESSAGE_ID_RE: /"id":"(msg_[^"]+)"/,
      UUID_RE: /"uuid":"([^"]+)"/,
      INPUT_TOKENS_RE: /"input_tokens":(\d+)/,
      OUTPUT_TOKENS_RE: /"output_tokens":(\d+)/,
      CACHE_CREATE_TOKENS_RE: /"cache_creation_input_tokens":(\d+)/,
      CACHE_READ_TOKENS_RE: /"cache_read_input_tokens":(\d+)/,
    },
  ).readUsageRecords
  const records = await usage('/session.jsonl', 0)
  assert.deepEqual(records.map(record => [record.sessionId, record.uncached, record.output, record.modelTier]), [['s', 2, 3, 5]])

  const onboarding = compileDeclarations(ts, 'src/commands/team-onboarding.ts', ['scanSessionUsage'], {
    Date,
    readdir: async () => ['session.jsonl', 'ignore.txt'],
    extname: path.extname,
    join: path.join,
    stat: async () => ({ isFile: () => true, mtimeMs: Date.now(), size: 200 }),
    readFile: async () => '{"content":"<command-name>/review</command-name>"}\n{"type":"tool_use","name":"mcp__github__search"}\n',
    isENOENT: () => false,
    MAX_SESSION_BYTES: 10_000,
    MAX_FIRST_MESSAGE_CHARS: 200,
    MAX_SESSION_DESCRIPTORS: 60,
    SLASH_COMMAND_RE: /<command-name>\/([\w:-]+)<\/command-name>/g,
    MCP_TOOL_RE: /"name":"mcp__([^"]+?)__([^"]+)"/g,
    CUSTOM_TITLE_RE: /"customTitle":"([^"]+)"/,
    PR_NUMBER_RE: /"prNumber":(\d+)/,
    FIRST_USER_MESSAGE_RE: /"role":"user"[^}]*"content":"([^"]+)"/,
  }).scanSessionUsage
  const scan = await onboarding('/project', 30)
  assert.equal(scan.sessionFileCount, 1)
  assert.equal(scan.slashCommandCounts.get('review'), 1)
  assert.equal(scan.mcpServerCounts.get('github'), 1)
})
