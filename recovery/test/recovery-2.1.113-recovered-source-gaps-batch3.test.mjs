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
const recoveredSourceRoot = path.join(repositoryRoot, 'src')
const comparisonSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? recoveredSourceRoot,
)
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.113-recovered-source-gaps-batch3.json', import.meta.url),
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
  '74a1b8b434e8ff45ae1401c59dcdf499b4bddeb53c91a5c21dab4f045618c626'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags]
      .sort()
      .join('')}`
  }
  return `${kind}:${JSON.stringify(value)}`
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

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
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

function targetOccurrences(fragment, absoluteStart) {
  const ast = parse(fragment, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  const add = (kind, value, start, end) =>
    occurrences.push({
      end: absoluteStart + end,
      identity: identity(kind, value),
      start: absoluteStart + start,
    })
  walk(ast, node => {
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node.start, node.end)
      else if (typeof node.value === 'string') {
        add('string', node.value, node.start, node.end)
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node.start, node.end)
    }
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
    ) {
      add('property', node.property.name, node.property.start, node.property.end)
    }
  })
  return { ast, occurrences }
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

function sourceFilename(root, owner) {
  const relative = owner.replace(/^src\//, '')
  const direct = path.join(root, relative)
  const nested = path.join(root, owner)
  if (fs.existsSync(direct)) return direct
  if (fs.existsSync(nested)) return nested
  return null
}

function parseSource(ts, root, owner) {
  const filename = sourceFilename(root, owner)
  assert.ok(filename, `${owner}: source file exists`)
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

function findDeclaration(ts, parsed, name) {
  let found
  function visit(node) {
    if (found) return
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node
      return
    }
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name,
      )
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
}

function declarationKind(ts, node) {
  if (ts.isFunctionDeclaration(node)) return 'FunctionDeclaration'
  if (ts.isVariableStatement(node)) return 'VariableDeclaration'
  return null
}

function sourceImports(ts, parsed) {
  const imports = []
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const module = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (clause.name) {
      imports.push({ imported: 'default', local: clause.name.text, module })
    }
    const named = clause.namedBindings
    if (named && ts.isNamespaceImport(named)) {
      imports.push({ imported: '*', local: named.name.text, module })
    } else if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        imports.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text,
          module,
        })
      }
    }
  }
  return imports
}

function hasImport(actual, expected) {
  return actual.some(
    item =>
      item.module === expected.module &&
      item.imported === expected.imported &&
      item.local === expected.local,
  )
}

function sourceIdentities(ts, declaration) {
  const result = new Set()
  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      result.add(identity('string', node.text))
    } else if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const match = /^\/(.*)\/([a-z]*)$/s.exec(node.text)
      if (match) {
        result.add(identity('regexp', { flags: match[2], pattern: match[1] }))
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      result.add(identity('property', node.name.text))
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return result
}

function findIfStatement(ts, parsed, declaration, contains) {
  let found
  function visit(node) {
    if (
      !found &&
      ts.isIfStatement(node) &&
      node.getText(parsed).includes(contains)
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return found
}

function assertRecoveredRow(ts, root, row) {
  const { parsed } = parseSource(ts, root, row.recoveredOwner)
  const declaration = findDeclaration(ts, parsed, row.declaration.name)
  assert.ok(declaration, `${row.targetIndex}: ${row.declaration.name}`)
  assert.equal(declarationKind(ts, declaration), row.declaration.kind)
  const imports = sourceImports(ts, parsed)
  for (const expected of row.sourceImports ?? []) {
    assert.ok(
      hasImport(imports, expected),
      `${row.targetIndex}: ${expected.module}:${expected.imported}:${expected.local}`,
    )
  }

  if (row.targetIndex === 12073) {
    assert.equal(sha256(declaration.getText(parsed)), row.declaration.sha256)
    const ids = sourceIdentities(ts, declaration)
    assert.ok(ids.has(identity(row.residues[0].kind, row.residues[0].value)))
  } else if (row.targetIndex === 12662) {
    const statement = findIfStatement(
      ts,
      parsed,
      declaration,
      row.recoveredStatement.contains,
    )
    assert.ok(statement, 'FileWriteTool: recovered subagent report guard')
    assert.equal(
      sha256(statement.getText(parsed)),
      row.recoveredStatement.sha256,
    )
    const ids = sourceIdentities(ts, declaration)
    const importedNames = new Set(imports.flatMap(item => [item.imported, item.local]))
    for (const residue of row.residues) {
      assert.ok(
        ids.has(identity(residue.kind, residue.value)) ||
          (residue.kind === 'property' && importedNames.has(residue.value)),
        `u12662 source ${residue.kind}:${residue.value}`,
      )
    }
  } else {
    assert.ok(
      declaration.getText(parsed).includes(row.recoveredExpression),
      'NotebookEditTool: cryptographic eight-character cell ID',
    )
    assert.equal(
      declaration.getText(parsed).includes(row.historicalExpression),
      false,
    )
  }
}

test('batch3 is an exact, fail-closed seven-residue source recovery fixture', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 3,
    residues: 7,
    recoveredSourceGapResidues: 3,
    exactAlternateOwnerResidues: 3,
    compilerLoweredImportResidues: 1,
  })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [12073, 12662, 12781],
  )
  const classes = fixture.rows.flatMap(row =>
    row.residues.map(residue => residue.classification),
  )
  assert.equal(classes.filter(value => value === 'recovered-source-gap').length, 3)
  assert.equal(classes.filter(value => value === 'exact-alternate-owner').length, 3)
  assert.equal(
    classes.filter(value => value === 'compiler-lowered-runtime-import').length,
    1,
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
      `${row.targetIndex}: structural identity`,
    )
  }
})

test(
  'current source pins every bounded recovery, exact owner, and runtime import',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const row of fixture.rows) assertRecoveredRow(ts, recoveredSourceRoot, row)
  },
)

test(
  'comparison root is either selectively recovered or exactly exhibits each historical gap',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const row of fixture.rows) {
      const { parsed, source } = parseSource(ts, comparisonSourceRoot, row.recoveredOwner)
      const declaration = findDeclaration(ts, parsed, row.declaration.name)
      assert.ok(declaration, `${row.targetIndex}: historical declaration`)
      const text = declaration.getText(parsed)
      if (
        (row.targetIndex === 12073 && sha256(text) === row.declaration.sha256) ||
        (row.targetIndex === 12662 && text.includes(row.recoveredStatement.contains)) ||
        (row.targetIndex === 12781 && text.includes(row.recoveredExpression))
      ) {
        assertRecoveredRow(ts, comparisonSourceRoot, row)
        continue
      }
      assert.equal(
        sha256(text),
        row.declaration.historicalSha256,
        `${row.targetIndex}: exact historical declaration`,
      )
      if (row.targetIndex === 12073) {
        assert.equal(source.includes('https?:\\/\\/|www\\.'), false)
      } else if (row.targetIndex === 12662) {
        assert.equal(source.includes(row.recoveredStatement.contains), false)
        assert.equal(source.includes('tengu_subagent_md_report_blocked'), false)
      } else {
        assert.ok(text.includes(row.historicalExpression))
        assert.equal(text.includes(row.recoveredExpression), false)
      }
    }
  },
)

test(
  'authenticated target pins all complete units and exact residue ranges',
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
      const { ast, occurrences } = targetOccurrences(fragment, row.target.start)
      assert.equal(ast.body.length, 1, `${row.targetIndex}: one complete unit`)
      assert.equal(ast.body[0].type, row.target.nodeType)
      for (const residue of row.residues) {
        assert.ok(
          occurrences.some(
            occurrence =>
              occurrence.identity === identity(residue.kind, residue.value) &&
              occurrence.start === residue.target.start &&
              occurrence.end === residue.target.end,
          ),
          `${row.targetIndex}: ${identity(residue.kind, residue.value)}`,
        )
      }
    }
  },
)

test(
  'URL detection, subagent report blocking, and notebook IDs execute recovered semantics',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()

    const markdownRow = fixture.rows[0]
    const markdown = parseSource(ts, recoveredSourceRoot, markdownRow.recoveredOwner)
    const markdownDeclaration = findDeclaration(
      ts,
      markdown.parsed,
      markdownRow.declaration.name,
    )
    const matcher = Function(
      `${markdownDeclaration.getText(markdown.parsed)}; return value => MD_SYNTAX_RE.test(value)`,
    )()
    for (const value of [
      'see https://example.com',
      'visit www.example.com',
      '  1. indented item',
      '# heading',
    ]) {
      assert.equal(matcher(value), true, value)
    }
    assert.equal(matcher('plain prose'), false)

    const writeRow = fixture.rows[1]
    const write = parseSource(ts, recoveredSourceRoot, writeRow.recoveredOwner)
    const writeDeclaration = findDeclaration(ts, write.parsed, writeRow.declaration.name)
    const guard = findIfStatement(
      ts,
      write.parsed,
      writeDeclaration,
      writeRow.recoveredStatement.contains,
    )
    const events = []
    const runGuard = ({ enabled, agentId, filename }) =>
      Function(
        'getFeatureValue_CACHED_MAY_BE_STALE',
        'toolUseContext',
        'basename',
        'fullFilePath',
        'logEvent',
        'Buffer',
        'content',
        `${guard.getText(write.parsed)}; return null`,
      )(
        () => enabled,
        { agentId },
        value => path.basename(value),
        `/tmp/${filename}`,
        (...args) => events.push(args),
        Buffer,
        'report body',
      )
    assert.deepEqual(
      runGuard({ enabled: true, agentId: 'agent-1', filename: 'REPORT.md' }),
      {
        result: false,
        message:
          'Subagents should return findings as text, not write report files. Include this content in your final response instead.',
        errorCode: 5,
      },
    )
    assert.equal(events.length, 1)
    assert.equal(
      runGuard({ enabled: false, agentId: 'agent-1', filename: 'REPORT.md' }),
      null,
    )
    assert.equal(
      runGuard({ enabled: true, agentId: undefined, filename: 'REPORT.md' }),
      null,
    )
    assert.equal(
      runGuard({ enabled: true, agentId: 'agent-1', filename: 'notes.md' }),
      null,
    )

    const notebookRow = fixture.rows[2]
    const generated = Function(
      'randomUUID',
      `return ${notebookRow.recoveredExpression}`,
    )(() => '01234567-89ab-cdef-0123-456789abcdef')
    assert.equal(generated, '01234567')
  },
)
