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
const selected =
  !process.env.CLAUDE_CODE_SEMANTIC_CASE ||
  process.env.CLAUDE_CODE_SEMANTIC_CASE === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.113-owner-and-punctuation-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 =
  'ee40136337a37314dc96311bebbd78d71fe039f9ae9a2cd1bbb3ed15e146cf29'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

function sourceFilename(owner) {
  const relative = owner.replace(/^src\//, '')
  const direct = path.join(sourceRoot, relative)
  const nested = path.join(sourceRoot, owner)
  if (fs.existsSync(direct)) return direct
  if (fs.existsSync(nested)) return nested
  return null
}

function parseSource(ts, owner) {
  const filename = sourceFilename(owner)
  assert.ok(filename, `${owner}: source file exists`)
  const source = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${owner}: parses`)
  return parsed
}

function declarationName(ts, node) {
  if (ts.isFunctionDeclaration(node)) return node.name?.text
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0]
    return ts.isIdentifier(declaration?.name) ? declaration.name.text : undefined
  }
  return undefined
}

function findDeclarationIfPresent(ts, parsed, name) {
  let found
  function visit(node) {
    if (found) return
    if (declarationName(ts, node) === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
}

function findDeclaration(ts, parsed, name) {
  const found = findDeclarationIfPresent(ts, parsed, name)
  assert.ok(found, `${name}: source declaration`)
  return found
}

function sourceImports(ts, parsed) {
  const imports = []
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const module = statement.moduleSpecifier.text
    const clause = statement.importClause
    const named = clause.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        imports.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text,
          module,
          typeOnly: clause.isTypeOnly || element.isTypeOnly,
        })
      }
    }
  }
  return imports
}

function collectTargetResidues(fragment, offset) {
  const ast = parse(fragment, { ecmaVersion: 'latest', sourceType: 'module' })
  const rows = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal' && node.regex) {
      rows.push({
        end: offset + node.end,
        kind: 'regexp',
        start: offset + node.start,
        value: { flags: node.regex.flags, pattern: node.regex.pattern },
      })
    }
    const property =
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
        ? node.property
        : node.type === 'Property' &&
            !node.computed &&
            node.key?.type === 'Identifier'
          ? node.key
          : null
    if (property) {
      rows.push({
        end: offset + property.end,
        kind: 'property',
        start: offset + property.start,
        value: property.name,
      })
    }
    for (const [name, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(name)) {
        visit(child)
      }
    }
  }
  visit(ast)
  return { ast, rows }
}

function compileTarget(fragment, dependencies, name) {
  return Function(
    ...Object.keys(dependencies),
    `${fragment}; return ${name}`,
  )(...Object.values(dependencies))
}

function compileSource(ts, parsed, declaration, dependencies, name) {
  const source = declaration.getText(parsed).replace(/^export\s+/, '')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(
    ...Object.keys(dependencies),
    `${output}; return ${name}`,
  )(...Object.values(dependencies))
}

test('the target113 owner and punctuation fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, { units: 9, residues: 14 })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [13654, 13698, 13699, 13700, 13868, 13995, 14029, 14032, 14037],
  )
  assert.equal(
    fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
    fixture.summary.residues,
  )
  for (const row of fixture.rows) {
    const region = structural.regions[row.targetIndex]
    assert.equal(region?.target?.index, row.targetIndex)
    assert.deepEqual(
      {
        classification: region.classification,
        end: region.target.end,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        start: region.target.start,
      },
      row.target,
      `${row.targetIndex}: target identity`,
    )
    assert.ok(
      [
        'direct-source-representation',
        'exact-owner-correction',
        'recovered-source-gap',
      ].includes(row.category),
      `${row.targetIndex}: bounded category`,
    )
  }
})

test(
  'dual-root source declarations pin the recovered punctuation and exact owners',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const declarations = new Map()
    for (const row of fixture.rows) {
      const parsed = parseSource(ts, row.correctedOwner)
      const declaration = findDeclarationIfPresent(
        ts,
        parsed,
        row.sourceDeclaration,
      )
      if (
        !declaration &&
        row.targetIndex === 13654 &&
        row.category === 'direct-source-representation' &&
        sourceRoot !== path.join(repositoryRoot, 'src')
      ) {
        // The lock policy is a cumulative target105 owner. Target113's
        // independently materialized introduction tree predates that source
        // declaration, while the current cumulative source must retain it.
        continue
      }
      assert.ok(declaration, `${row.sourceDeclaration}: source declaration`)
      declarations.set(row.targetIndex, { declaration, parsed })
    }

    const team = declarations.get(13654)
    if (team) {
      const teamText = team.declaration.getText(team.parsed)
      assert.match(teamText, /realpath:\s*false/)
      assert.match(teamText, /retries:\s*10/)
      assert.match(teamText, /minTimeout:\s*5/)
      assert.match(teamText, /maxTimeout:\s*100/)
    }

    for (const index of [13698, 13699, 13700]) {
      const { declaration, parsed } = declarations.get(index)
      assert.match(declaration.getText(parsed), /\[\\s。、？！\]/)
    }

    const gitText = declarations.get(13868).declaration.getText(
      declarations.get(13868).parsed,
    )
    assert.match(gitText, /posix\.normalize\(s\)/)
    assert.match(gitText, /replace\(\/\\\\\/g, '\/'\)/)

    const shell = declarations.get(13995)
    const shellText = shell.declaration.getText(shell.parsed)
    assert.match(shellText, /processToolResultBlock\([\s\S]*randomUUID\(\)/)
    assert.ok(
      sourceImports(ts, shell.parsed).some(
        row =>
          !row.typeOnly &&
          row.module === 'crypto' &&
          row.imported === 'randomUUID' &&
          row.local === 'randomUUID',
      ),
      'promptShellExecution owns the crypto randomUUID import',
    )

    const toPosix = declarations.get(14029)
    assert.match(toPosix.declaration.getText(toPosix.parsed), /win32\.sep/)
    assert.match(toPosix.declaration.getText(toPosix.parsed), /posix\.sep/)
    const pattern = declarations.get(14032)
    assert.match(pattern.declaration.getText(pattern.parsed), /session-memory/)
    assert.match(pattern.declaration.getText(pattern.parsed), /session_transcript/)
    const directory = declarations.get(14037)
    assert.match(directory.declaration.getText(directory.parsed), /normalize\(dirPath\)/)
    assert.match(directory.declaration.getText(directory.parsed), /agent-memory-local/)
  },
)

test(
  'authenticated target113 pins every structural unit and residue',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  () => {
    const target = authenticatedTargetInner(targetPath)
    for (const row of fixture.rows) {
      const fragment = target.slice(row.target.start, row.target.end)
      assert.equal(sha256(fragment), row.target.sourceHash)
      const { ast, rows } = collectTargetResidues(fragment, row.target.start)
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, row.target.nodeType)
      for (const residue of row.residues) {
        assert.ok(
          rows.some(
            actual =>
              actual.kind === residue.kind &&
              JSON.stringify(actual.value) === JSON.stringify(residue.value) &&
              actual.start === residue.start &&
              actual.end === residue.end,
          ),
          `${row.targetIndex}: exact ${residue.kind} ${JSON.stringify(residue.value)}`,
        )
      }
    }
  },
)

test(
  'target and source execute the punctuation, path, and session classifiers alike',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const target = authenticatedTargetInner(targetPath)
    const fragments = new Map(
      fixture.rows.map(row => [
        row.targetIndex,
        target.slice(row.target.start, row.target.end),
      ]),
    )
    const uniq = values => [...new Set(values)]

    const sourceAttachments = parseSource(ts, 'src/utils/attachments.ts')
    const attachmentCases = [
      [13698, 'h71', 'extractAtMentionedFiles', '。@"file one.ts" 、@plain.ts', ['file one.ts', 'plain.ts']],
      [13699, 'S71', 'extractMcpResourceMentions', '？@server:resource/path', ['server:resource/path']],
      [13700, 'BM7', 'extractAgentMentions', '！@"reviewer (agent)" 。@agent-worker', ['reviewer', 'agent-worker']],
    ]
    for (const [index, targetName, sourceName, input, expected] of attachmentCases) {
      const targetFunction = compileTarget(fragments.get(index), { uK: uniq }, targetName)
      const sourceFunction = compileSource(
        ts,
        sourceAttachments,
        findDeclaration(ts, sourceAttachments, sourceName),
        { uniq },
        sourceName,
      )
      assert.deepEqual(targetFunction(input), expected)
      assert.deepEqual(sourceFunction(input), expected)
    }

    const sourceMemory = parseSource(ts, 'src/utils/memoryFileDetection.ts')
    const targetToPosix = compileTarget(fragments.get(14029), { b1H: path }, 'S91')
    const sourceToPosix = compileSource(
      ts,
      sourceMemory,
      findDeclaration(ts, sourceMemory, 'toPosix'),
      { posix: path.posix, win32: path.win32 },
      'toPosix',
    )
    assert.equal(sourceToPosix('a\\b\\c'), targetToPosix('a\\b\\c'))

    const targetPattern = compileTarget(fragments.get(14032), { b1H: path }, 'Io$')
    const sourcePattern = compileSource(
      ts,
      sourceMemory,
      findDeclaration(ts, sourceMemory, 'detectSessionPatternType'),
      { posix: path.posix, win32: path.win32 },
      'detectSessionPatternType',
    )
    for (const pattern of [
      'session-memory\\*.md',
      'projects\\*\\*.jsonl',
      'ordinary.txt',
    ]) {
      assert.equal(sourcePattern(pattern), targetPattern(pattern))
    }

    const sourceGit = parseSource(ts, 'src/tools/PowerShellTool/gitSafety.ts')
    const targetGit = compileTarget(
      fragments.get(13868),
      { Mg: new Set(['-', '–', '—', '―']), be: path },
      'kw7',
    )
    const sourceGitFunction = compileSource(
      ts,
      sourceGit,
      findDeclaration(ts, sourceGit, 'normalizeGitPathArg'),
      {
        PS_TOKENIZER_DASH_CHARS: new Set(['-', '–', '—', '―']),
        posix: path.posix,
      },
      'normalizeGitPathArg',
    )
    for (const value of [
      'FileSystem::hooks\\pre-commit',
      'C:hooks\\..\\HEAD',
      '`hooks`\\pre-commit',
    ]) {
      assert.equal(sourceGitFunction(value), targetGit(value))
    }
  },
)
