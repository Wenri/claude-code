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
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-residual-build-representation-proofs.json',
    import.meta.url,
  ),
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
  '82346201ac9f26c2850c7ba4e5692564eda3a95b7d00605e07db5dfdc3601904'

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

function walk(node, ancestors, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, ancestors, visit)
    return
  }
  if (typeof node.type === 'string') visit(node, ancestors)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, [...ancestors, node], visit)
    }
  }
}

function syntax(source, offset = 0) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, [], (node, ancestors) => {
    let value
    let kind
    if (node.type === 'Literal') {
      if (node.regex) {
        kind = 'regexp'
        value = node.regex
      } else if (typeof node.value === 'string') {
        kind = 'string'
        value = node.value
      } else if (typeof node.value === 'number') {
        kind = 'number'
        value = node.value
      }
    } else if (node.type === 'TemplateElement') {
      kind = 'string'
      value = node.value?.cooked ?? node.value?.raw
    }
    if (kind) {
      occurrences.push({
        ancestors,
        end: offset + node.end,
        identity: identity(kind, value),
        start: offset + node.start,
      })
    }

    const property =
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
        ? node.property
        : ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
              node.type,
            ) &&
            !node.computed &&
            node.key?.type === 'Identifier'
          ? node.key
          : null
    if (property) {
      occurrences.push({
        ancestors: [...ancestors, node],
        end: offset + property.end,
        identity: identity('property', property.name),
        start: offset + property.start,
      })
    }
  })
  const grouped = new Map()
  for (const occurrence of occurrences) {
    const rows = grouped.get(occurrence.identity) ?? []
    rows.push(occurrence)
    grouped.set(occurrence.identity, rows)
  }
  return { ast, grouped, occurrences }
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
  const filename = fs.existsSync(direct) ? direct : nested
  assert.ok(fs.existsSync(filename), `${owner}: source owner exists`)
  return filename
}

function sourceImports(ts, sourceFile) {
  const imports = []
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const module = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (clause.name) {
      imports.push({
        imported: 'default',
        local: clause.name.text,
        module,
        typeOnly: clause.isTypeOnly,
      })
    }
    const named = clause.namedBindings
    if (named && ts.isNamespaceImport(named)) {
      imports.push({
        imported: '*',
        local: named.name.text,
        module,
        typeOnly: clause.isTypeOnly,
      })
    } else if (named && ts.isNamedImports(named)) {
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

function foldedTemplateChunks(ts, sourceFile) {
  const chunks = []
  function visit(node) {
    if (ts.isTemplateExpression(node)) {
      let current = node.head.text
      for (const span of node.templateSpans) {
        const expression = span.expression.getText(sourceFile)
        const folded =
          expression === 'process.arch'
            ? 'x64'
            : expression === 'process.platform'
              ? 'linux'
              : undefined
        if (folded === undefined) {
          if (current) chunks.push(current)
          current = span.literal.text
        } else {
          current += folded + span.literal.text
        }
      }
      if (current) chunks.push(current)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return new Set(chunks)
}

function hasImportMetaPath(ts, sourceFile) {
  let found = false
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'fileURLToPath' &&
      node.arguments.length === 1 &&
      node.arguments[0].getText(sourceFile) === 'import.meta.url'
    ) {
      found = true
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function objectFields(object) {
  return new Map(
    object.properties
      .filter(
        property =>
          property.type === 'Property' &&
          !property.computed &&
          property.value?.type === 'Literal',
      )
      .map(property => [
        property.key.name ?? property.key.value,
        property.value.value,
      ]),
  )
}

test('the residual build-representation fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, { residues: 16, units: 7 })
  assert.equal(fixture.rows[0].targetIndex, 7981)
  const seen = new Set()
  let residues = 0
  for (const row of fixture.rows) {
    assert.ok(!seen.has(row.targetIndex), `${row.targetIndex}: unique`)
    seen.add(row.targetIndex)
    residues += row.residues.length
    const region = structural.regions[row.targetIndex]
    assert.equal(region?.target?.index, row.targetIndex)
    assert.deepEqual(
      {
        coarseHash: region.target.coarseHash,
        end: region.target.end,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        start: region.target.start,
      },
      row.target,
      `${row.targetIndex}: complete structural target identity`,
    )
    for (const residue of row.residues) {
      assert.ok(
        [
          'build-macro',
          'import-meta-url-build-path',
          'platform-build-folding',
          'runtime-import',
        ].includes(residue.proof),
        `${row.targetIndex}: admitted proof`,
      )
      assert.ok(residue.targetOrdinal > residue.baselineCount)
    }
  }
  assert.equal(seen.size, fixture.summary.units)
  assert.equal(residues, fixture.summary.residues)
})

test(
  'each residual row has the exact dual-root source import or build-folding relation',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const row of fixture.rows) {
      const filename = sourceFilename(row.owner)
      const source = fs.readFileSync(filename, 'utf8')
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, `${row.targetIndex}: parses`)
      const imports = sourceImports(ts, sourceFile)
      const templateChunks = foldedTemplateChunks(ts, sourceFile)
      for (const residue of row.residues) {
        if (residue.proof === 'runtime-import') {
          assert.ok(
            imports.some(
              actual =>
                !actual.typeOnly &&
                actual.module === residue.import.module &&
                actual.imported === residue.import.imported &&
                actual.local === residue.import.local,
            ),
            `${row.targetIndex}: ${residue.import.module}:${residue.import.imported}:${residue.import.local}`,
          )
        } else if (residue.proof === 'import-meta-url-build-path') {
          assert.ok(hasImportMetaPath(ts, sourceFile), `${row.targetIndex}: import.meta.url path`)
          const sourceSuffix = residue.value.slice(residue.value.indexOf('/src/') + 1)
          assert.equal(sourceSuffix, row.owner, `${row.targetIndex}: embedded source path owner`)
        } else if (residue.proof === 'platform-build-folding') {
          assert.ok(
            templateChunks.has(residue.value),
            `${row.targetIndex}: exact process.arch/process.platform template fold ${JSON.stringify(residue.value)}`,
          )
        } else {
          assert.equal(residue.proof, 'build-macro')
        }
      }
    }
  },
)

test(
  'authenticated target113 pins every exact residual occurrence and build macro',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  () => {
    const target = authenticatedTargetInner(targetPath)
    const globalSyntax = syntax(target)
    for (const row of fixture.rows) {
      const fragment = target.slice(row.target.start, row.target.end)
      assert.equal(sha256(fragment), row.target.sourceHash, `${row.targetIndex}: target fragment`)
      const local = syntax(fragment, row.target.start)
      assert.equal(local.ast.body.length, 1, `${row.targetIndex}: one complete unit`)
      assert.equal(local.ast.body[0].type, row.target.nodeType)
      for (const residue of row.residues) {
        const residueIdentity = identity(residue.kind, residue.value)
        const localOccurrence = local.occurrences.find(
          occurrence =>
            occurrence.identity === residueIdentity &&
            occurrence.start === residue.start &&
            occurrence.end === residue.end,
        )
        assert.ok(localOccurrence, `${row.targetIndex}: exact ${residueIdentity}`)
        const globalOccurrence = globalSyntax.grouped.get(residueIdentity)?.[
          residue.targetOrdinal - 1
        ]
        assert.deepEqual(
          [globalOccurrence?.start, globalOccurrence?.end],
          [residue.start, residue.end],
          `${row.targetIndex}: exact target ordinal`,
        )
        if (residue.proof === 'build-macro') {
          const enclosing = localOccurrence.ancestors.filter(ancestor => {
            if (ancestor.type !== 'ObjectExpression') return false
            const fields = objectFields(ancestor)
            return (
              fields.get('VERSION') === '2.1.113' &&
              fields.get('BUILD_TIME') === '2026-04-17T18:18:28Z'
            )
          })
          assert.equal(enclosing.length, 1, `${row.targetIndex}: one enclosing build macro`)
        }
      }
    }
  },
)

test(
  'authenticated baseline confirms every admitted occurrence is target-added',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !baselinePath
        ? 'authenticated 2.1.112 bundle is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(bytes), fixture.artifact.baselineSha256)
    const baselineSyntax = syntax(bytes.toString('utf8'))
    for (const row of fixture.rows) {
      for (const residue of row.residues) {
        const count = baselineSyntax.grouped.get(identity(residue.kind, residue.value))?.length ?? 0
        assert.equal(count, residue.baselineCount, `${row.targetIndex}: exact baseline count`)
        assert.ok(residue.targetOrdinal > count, `${row.targetIndex}: target-added`)
      }
    }
  },
)
