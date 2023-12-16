import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET117_BRIDGE_EXPORT_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/bridge-export-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-bridge-export-owner-proof.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '6ac87abfc1d40057e05c6404e13b805e7187bac70a9fc14f6bcb2d072923186f'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expected.bytes, `${label}: bytes`)
  assert.equal(sha256(bytes), expected.sha256, `${label}: SHA-256`)
  return bytes
}

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function identity(kind, value) {
  return `${kind}:${JSON.stringify(value)}`
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

function collectBundleOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const grouped = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const occurrences = grouped.get(key) ?? []
    occurrences.push({ start: node.start, end: node.end })
    grouped.set(key, occurrences)
  }
  walk(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property)
  })
  for (const occurrences of grouped.values()) {
    occurrences.sort((left, right) => left.start - right.start)
  }
  return grouped
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(fs.existsSync(filename), 'repo-pinned TypeScript is available')
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

function parseSource(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parses`)
  return sourceFile
}

function namedDeclaration(ts, sourceFile, expectedName) {
  const matches = []
  function visit(node) {
    if (node.name && ts.isIdentifier(node.name) && node.name.text === expectedName) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
}

function collectSourceStrings(ts, declaration) {
  const values = new Set()
  function visit(node) {
    if (ts.isStringLiteralLike(node)) values.add(node.text)
    else if (
      [
        ts.SyntaxKind.TemplateHead,
        ts.SyntaxKind.TemplateMiddle,
        ts.SyntaxKind.TemplateTail,
      ].includes(node.kind)
    ) {
      values.add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return values
}

test(
  '2.1.117 bridge-export fixture pins one declaration-to-property override',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-override-ready')
    assert.deepEqual(fixture.summary, {
      units: 1,
      closureUnits: 2,
      residues: 1,
      rawDirectOwners: 1,
      declarationToPropertyRepresentations: 1,
      ownerOverrides: 1,
    })
    assert.deepEqual(
      TARGET117_BRIDGE_EXPORT_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
        override.evidenceIds,
      ]),
      [[10755, [fixture.row.owner], fixture.row.declarations, fixture.evidenceIds]],
    )
    assert.ok(TARGET117_BRIDGE_EXPORT_OWNER_OVERRIDES[0].behavior.length > 0)
    readExact(path.join(repositoryRoot, fixture.inputs.helper.path), fixture.inputs.helper)
  },
)

test(
  '2.1.117 bundle binds the exact export property to its full implementation',
  { skip: !selected },
  () => {
    const baseline = readExact(
      bundlePath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'baseline bundle',
    ).toString('utf8')
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )

    for (const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] of fixture.row.targetClosure) {
      const region = regions.get(index)
      assert.ok(region, `u${index}: structural region`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        { classification, nodeType, start, end, tokenCount, sourceHash, coarseHash },
      )
      const unit = target.slice(start, end)
      assert.equal(Buffer.byteLength(unit), end - start, `u${index}: full bytes`)
      assert.equal(sha256(unit), sourceHash, `u${index}: full SHA-256`)
      const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
      assert.equal(ast.body.length, 1, `u${index}: one syntax unit`)
      assert.equal(ast.body[0].type, nodeType, `u${index}: node type`)
    }

    const baselineOccurrences = collectBundleOccurrences(baseline)
    const targetOccurrences = collectBundleOccurrences(target)
    for (const [kind, value, start, end, ordinal, baselineCount] of fixture.row.residues) {
      const key = identity(kind, value)
      assert.equal((baselineOccurrences.get(key) ?? []).length, baselineCount)
      const occurrence = (targetOccurrences.get(key) ?? [])[ordinal - 1]
      assert.ok(occurrence, `${key}: target ordinal`)
      assert.deepEqual([occurrence.start, occurrence.end], [start, end])
    }

    const exportMetadata = fixture.row.targetClosure[0]
    const implementationMetadata = fixture.row.targetClosure[1]
    const exportAst = parse(
      target.slice(exportMetadata[3], exportMetadata[4]),
      { ecmaVersion: 'latest', sourceType: 'module' },
    )
    let exportProperty
    walk(exportAst, node => {
      if (
        node.type === 'Property' &&
        node.key?.type === 'Identifier' &&
        node.key.name === 'getBridgeAuthDebugInfo'
      ) {
        exportProperty = node
      }
    })
    assert.ok(exportProperty, 'exact bridge export property exists')
    assert.equal(exportProperty.value.type, 'ArrowFunctionExpression')
    assert.equal(exportProperty.value.params.length, 0)
    assert.equal(exportProperty.value.body.type, 'Identifier')

    const implementationAst = parse(
      target.slice(implementationMetadata[3], implementationMetadata[4]),
      { ecmaVersion: 'latest', sourceType: 'module' },
    )
    const implementation = implementationAst.body[0]
    assert.equal(implementation.type, 'FunctionDeclaration')
    assert.equal(
      implementation.id.name,
      exportProperty.value.body.name,
      'export registry returns the exact implementation binding',
    )
    const implementationStrings = collectBundleOccurrences(
      target.slice(implementationMetadata[3], implementationMetadata[4]),
    )
    for (const value of fixture.row.semanticStrings) {
      assert.ok(
        (implementationStrings.get(identity('string', value)) ?? []).length > 0,
        `implementation contains ${JSON.stringify(value)}`,
      )
    }
  },
)

test(
  '2.1.117 raw and packaged source authenticate the exported declaration semantics',
  { skip: !selected },
  async () => {
    const witness = fixture.row.sourceWitness
    const commit = execFileSync('git', ['rev-parse', `${witness.commit}^{commit}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim()
    assert.equal(commit, witness.commit)
    const blob = execFileSync(
      'git',
      ['rev-parse', `${witness.commit}:${fixture.row.owner}`],
      { cwd: repositoryRoot, encoding: 'utf8' },
    ).trim()
    assert.equal(blob, witness.blob)
    const rawBytes = execFileSync(
      'git',
      ['show', `${witness.commit}:${fixture.row.owner}`],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(rawBytes), witness.file)

    const ts = await loadTypeScript()
    const source = rawBytes.toString('utf8')
    const sourceFile = parseSource(ts, fixture.row.owner, source)
    const declaration = namedDeclaration(
      ts,
      sourceFile,
      witness.declaration.name,
    )
    assert.equal(ts.SyntaxKind[declaration.kind], witness.declaration.nodeType)
    assert.equal(declaration.getStart(sourceFile), witness.declaration.start)
    assert.equal(declaration.end, witness.declaration.end)
    const declarationBytes = Buffer.from(
      source.slice(declaration.getStart(sourceFile), declaration.end),
    )
    assert.deepEqual(descriptor(declarationBytes), {
      bytes: witness.declaration.bytes,
      sha256: witness.declaration.sha256,
    })
    assert.ok(
      declaration.modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ),
      'source declaration is explicitly exported',
    )
    const sourceStrings = collectSourceStrings(ts, declaration)
    for (const value of fixture.row.semanticStrings) {
      assert.ok(sourceStrings.has(value), `source declaration contains ${JSON.stringify(value)}`)
    }

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    const packagedBytes = readExact(
      path.join(packagedRoot, fixture.row.owner.slice(4)),
      witness.file,
      'packaged bridge owner',
    )
    assert.equal(packagedBytes.equals(rawBytes), true, 'packaged owner is exact raw witness')
  },
)
