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
const comparisonSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? recoveredSourceRoot,
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.113-recovered-owner-package-gaps.json', import.meta.url),
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
  '1cabd8c4e747842648237429be2de45ad9ca780e46c9e6ead61e2257ad7a2043'

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
      if (typeof node.value === 'string') {
        add('string', node.value, node.start, node.end)
      } else if (typeof node.value === 'number') {
        add('number', node.value, node.start, node.end)
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node.start, node.end)
    }
    const isProperty =
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
        node.computed === false &&
        node.key?.type === 'Identifier') ||
      (node.type === 'MemberExpression' &&
        node.computed === false &&
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
  return { ast, grouped }
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifact.targetInnerSha256) {
    return bytes.toString('utf8')
  }
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

function sourceFilename(root, owner) {
  return path.join(root, owner.replace(/^src\//, ''))
}

function parseSource(ts, root, owner) {
  const filename = sourceFilename(root, owner)
  assert.ok(fs.existsSync(filename), `${owner}: source owner exists`)
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

function findFunction(ts, parsed, name) {
  let found
  function visit(node) {
    if (
      !found &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
}

function sourceImports(ts, parsed) {
  const imports = []
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const module = statement.moduleSpecifier.text
    const bindings = statement.importClause.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.push([
          module,
          element.propertyName?.text ?? element.name.text,
          element.name.text,
        ])
      }
    }
  }
  return imports
}

function countDirectCalls(ts, declaration, name) {
  let count = 0
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      count += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return count
}

test('the target113 recovered-owner package-gap fixture is exact', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 3,
    residues: 26,
    recoveredOwnerResidues: 23,
    reactCompilerResidues: 3,
  })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [18268, 18269, 19377],
  )
  assert.equal(
    fixture.rows.reduce((total, row) => total + row.residues.length, 0),
    fixture.summary.residues,
  )
  const classifications = fixture.rows.flatMap(row =>
    row.residues.map(residue => residue[6]),
  )
  assert.equal(
    classifications.filter(value => value === 'recovered-owner').length,
    fixture.summary.recoveredOwnerResidues,
  )
  assert.equal(
    classifications.filter(value => value === 'react-compiler-cache').length,
    fixture.summary.reactCompilerResidues,
  )
  for (const row of fixture.rows) {
    const region = structural.regions[row.targetIndex]
    assert.deepEqual(
      {
        classification: region.classification,
        end: region.target.end,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        start: region.target.start,
      },
      row.target,
      `u${row.targetIndex}: structural identity`,
    )
    assert.equal(
      sha256(JSON.stringify(row.residues.map(residue => residue.slice(0, 6)))),
      row.residueDigest,
      `u${row.targetIndex}: residue digest`,
    )
    for (const [, , start, end, baselineCount, targetOrdinal] of row.residues) {
      assert.ok(targetOrdinal > baselineCount)
      assert.ok(start >= row.target.start)
      assert.ok(end <= row.target.end)
    }
  }
})

test(
  'current source pins both corrected owners and their authored semantics',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const owner of Object.values(fixture.owners)) {
      const filename = sourceFilename(recoveredSourceRoot, owner.path)
      assert.ok(fs.existsSync(filename), `${owner.path}: recovered owner exists`)
      assert.equal(sha256(fs.readFileSync(filename)), owner.recoveredFileSha256)
    }

    const permission = parseSource(
      ts,
      recoveredSourceRoot,
      fixture.owners.permissionStatus.path,
    )
    for (const token of [
      'PermissionStatusSource',
      'STATUS_PRIORITY',
      'statusBySource',
      'recomputePermissionStatus',
      "'hook-prompt'",
      "'worker-sandbox'",
    ]) {
      assert.ok(permission.source.includes(token), `permission owner: ${token}`)
    }
    const permissionHook = findFunction(
      ts,
      permission.parsed,
      'usePermissionStatus',
    )
    const permissionRow = fixture.rows.find(row => row.targetIndex === 18269)
    assert.ok(permissionHook)
    assert.equal(
      sha256(permissionHook.getText(permission.parsed)),
      permissionRow.source.sha256,
    )
    assert.equal(
      countDirectCalls(ts, permissionHook, 'useEffect'),
      permissionRow.source.useEffectCalls,
    )
    for (const token of [
      'sandboxHost',
      'promptTitle',
      'elicitationServer',
      'workerSandboxHost',
      'allow network: ',
      'respond: ',
      'MCP input: ',
    ]) {
      assert.ok(permissionHook.getText(permission.parsed).includes(token))
    }

    const ultraplan = parseSource(
      ts,
      recoveredSourceRoot,
      fixture.owners.ultraplanChoice.path,
    )
    const ultraplanRow = fixture.rows.find(row => row.targetIndex === 19377)
    const choice = findFunction(
      ts,
      ultraplan.parsed,
      ultraplanRow.source.declaration,
    )
    assert.ok(choice)
    assert.equal(
      sha256(choice.getText(ultraplan.parsed)),
      ultraplanRow.source.sha256,
    )
    const imports = sourceImports(ts, ultraplan.parsed)
    for (const expected of ultraplanRow.source.imports) {
      assert.ok(
        imports.some(actual =>
          actual.every((value, index) => value === expected[index]),
        ),
        `ultraplan owner import ${expected.join(':')}`,
      )
    }
    for (const token of [
      'const { rows, columns } = useTerminalSize()',
      'await writeFile(path, plan',
      'transcriptExists()',
      "shown = lines.slice(offset, offset + visibleRows).join('\\n')",
    ]) {
      assert.ok(choice.getText(ultraplan.parsed).includes(token), token)
    }
  },
)

test(
  'comparison root proves both corrected owner packages were absent',
  {
    skip:
      !selected || comparisonSourceRoot === recoveredSourceRoot
        ? 'a distinct materialized source root is required'
        : false,
  },
  () => {
    for (const owner of Object.values(fixture.owners)) {
      assert.equal(owner.comparisonState, 'absent')
      assert.equal(fs.existsSync(sourceFilename(comparisonSourceRoot, owner.path)), false)
    }
    assert.ok(
      fs.existsSync(
        sourceFilename(
          comparisonSourceRoot,
          'src/services/preventSleep.ts',
        ),
      ),
      'the prior coalesced preventSleep owner remains present',
    )
    assert.ok(
      fs.existsSync(
        sourceFilename(
          comparisonSourceRoot,
          'src/components/SessionBackgroundHint.tsx',
        ),
      ),
      'the prior coalesced SessionBackgroundHint owner remains present',
    )
  },
)

test(
  'authenticated bundles pin all 26 package-gap occurrences and complete units',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), fixture.artifact.baselineSha256)
    const baseline = collectOccurrences(baselineBytes.toString('utf8'))
    const targetSource = authenticatedTargetInner(targetPath)
    const target = collectOccurrences(targetSource)
    for (const row of fixture.rows) {
      const fragment = targetSource.slice(row.target.start, row.target.end)
      assert.equal(sha256(fragment), row.target.sourceHash)
      const ast = parse(fragment, {
        allowHashBang: true,
        ecmaVersion: 'latest',
        sourceType: 'module',
      })
      assert.equal(ast.body.length, 1, `u${row.targetIndex}: one complete unit`)
      assert.equal(ast.body[0].type, row.target.nodeType)
      for (const [
        kind,
        value,
        start,
        end,
        baselineCount,
        targetOrdinal,
      ] of row.residues) {
        const residueIdentity = identity(kind, value)
        assert.equal(
          (baseline.grouped.get(residueIdentity) ?? []).length,
          baselineCount,
          `u${row.targetIndex}: ${residueIdentity} baseline count`,
        )
        const occurrence =
          (target.grouped.get(residueIdentity) ?? [])[targetOrdinal - 1]
        assert.ok(occurrence, `u${row.targetIndex}: ${residueIdentity} ordinal`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [start, end],
          `u${row.targetIndex}: ${residueIdentity} exact range`,
        )
      }
    }
  },
)
