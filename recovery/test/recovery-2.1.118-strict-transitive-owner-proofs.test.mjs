import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget118StrictTransitiveSourceGapReplay,
  TARGET118_STRICT_TRANSITIVE_INPUT_FILES,
  TARGET118_STRICT_TRANSITIVE_OWNER_OVERRIDES,
  TARGET118_STRICT_TRANSITIVE_RAW_SOURCE_TREE,
  TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_FILES,
  TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_TREE,
  TARGET118_STRICT_TRANSITIVE_SOURCE_GAP_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-strict-transitive-source-gaps.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.118-strict-transitive-owner-proofs.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '05be53b4766565d337a79f7a7de5bfdecdcc0d69d170c0211ced8c81f9cd23ca'
const BUILDER_SHA256 =
  '642a0c8b38b09b1d35e020a5ce4ff10533218f2bb2365971365c8e16ad866f79'
const POST_CORRECTION_SCANNER = {
  units: 11,
  residues: 36,
  sha256: 'a81cb226b96d5ab0b19a1559df391089376a549b69bed410369faa2206312304',
}
const historicalRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.118/src',
)
const laterRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)
const builderPath = path.join(
  repositoryRoot,
  'recovery/cases/2.1.117-to-2.1.118/recovered/build-strict-transitive-owner-proofs.mjs',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = expected.path ?? filename) {
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expected.bytes, `${label}: bytes`)
  assert.equal(sha256(bytes), expected.sha256, `${label}: SHA-256`)
  return bytes
}

function artifactPath(environmentName, input) {
  const explicit = process.env[environmentName]
  return explicit
    ? path.resolve(explicit)
    : path.join(artifactRoot, input.artifact)
}

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function identity(kind, value) {
  const canonicalValue =
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value
  return JSON.stringify([kind, canonicalValue])
}

function parseRegExp(text) {
  if (!text.startsWith('/')) return null
  let escaped = false
  let inClass = false
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index]
    if (escaped) {
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '[') {
      inClass = true
    } else if (character === ']' && inClass) {
      inClass = false
    } else if (character === '/' && !inClass) {
      return {
        pattern: text.slice(1, index),
        flags: canonicalFlags(text.slice(index + 1)),
      }
    }
  }
  return null
}

function walkAcorn(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walkAcorn(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walkAcorn(child, visit)
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
  walkAcorn(ast, node => {
    if (node.type === 'Literal' && node.regex) {
      add(
        'regexp',
        {
          pattern: node.regex.pattern,
          flags: canonicalFlags(node.regex.flags),
        },
        node,
      )
    } else if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node)
    } else if (node.type === 'Literal' && typeof node.value === 'number') {
      add('number', String(node.value), node)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
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

function collectTargetIdentities(unit) {
  const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
  const identities = new Set()
  function add(kind, value) {
    identities.add(identity(kind, value))
  }
  walkAcorn(ast, node => {
    if (node.type === 'Literal' && node.regex) {
      add('regexp', node.regex)
    } else if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value)
    } else if (node.type === 'Literal' && typeof node.value === 'number') {
      add('number', String(node.value))
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key.name
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property.name
          : undefined
    if (property !== undefined) add('property', property)
  })
  return identities
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(fs.existsSync(filename), 'repo-pinned TypeScript is available')
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function declarationName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (node.name && ts.isStringLiteralLike(node.name)) return node.name.text
  return undefined
}

function collectSourceIdentities(ts, scope, sourceFile) {
  const kinds = new Map()
  const counts = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const nodeKinds = kinds.get(key) ?? new Set()
    nodeKinds.add(ts.SyntaxKind[node.kind])
    kinds.set(key, nodeKinds)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text, node)
    } else if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile)
      if (text) add('string', text, node)
    } else if (ts.isNumericLiteral(node)) {
      add('number', String(Number(node.text.replaceAll('_', ''))), node)
    } else if (ts.isRegularExpressionLiteral(node)) {
      const value = parseRegExp(node.getText(sourceFile))
      if (value) add('regexp', value, node)
    }
    const property =
      ((ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isJsxAttribute(node) ||
        ts.isImportSpecifier(node)) &&
        node.name &&
        ts.isIdentifier(node.name)) ||
      (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name))
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property, node)
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return { kinds, counts }
}

function sourceAudit(ts, root, row, expected, declaration = row.declaration) {
  const filename = path.join(root, row.semanticOwner.slice(4))
  const bytes = fs.readFileSync(filename)
  if (declaration.kind === 'Resource') {
    const text = bytes.toString('utf8')
    const record = {
      file: descriptor(bytes),
      scope: null,
      declarationMatches: 0,
      coveredResidues: row.residues.filter(
        residue => residue.kind === 'string' && residue.value === text,
      ).length,
      residueRoles: row.residues.map(residue => ({
        identitySha256: residue.identitySha256,
        nodeKinds:
          residue.kind === 'string' && residue.value === text
            ? ['ExactResourceBytes']
            : [],
      })),
    }
    assert.deepEqual(record, expected, `${row.semanticOwner}: resource audit`)
    return { record, counts: new Map() }
  }
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${row.semanticOwner}: parses`)
  const matches = []
  if (declaration.kind === 'SourceFile') {
    matches.push(sourceFile)
  } else {
    function find(node) {
      if (
        ts.SyntaxKind[node.kind] === declaration.kind &&
        declarationName(ts, node) === declaration.name
      ) {
        matches.push(node)
      }
      ts.forEachChild(node, find)
    }
    find(sourceFile)
  }
  const scope = matches.length === 1 ? matches[0] : null
  const collected = scope
    ? collectSourceIdentities(ts, scope, sourceFile)
    : { kinds: new Map(), counts: new Map() }
  const scopeText = scope
    ? source.slice(scope.getStart(sourceFile), scope.end)
    : undefined
  const residueRoles = row.residues.map(residue => ({
    identitySha256: residue.identitySha256,
    nodeKinds: [
      ...(collected.kinds.get(identity(residue.kind, residue.value)) ?? []),
    ].sort(),
  }))
  const record = {
    file: descriptor(bytes),
    scope: scope
      ? {
          start: scope.getStart(sourceFile),
          end: scope.end,
          ...descriptor(Buffer.from(scopeText)),
        }
      : null,
    declarationMatches: matches.length,
    coveredResidues: residueRoles.filter(role => role.nodeKinds.length > 0)
      .length,
    residueRoles,
  }
  assert.deepEqual(record, expected, `${row.semanticOwner}: source audit`)
  return { record, counts: collected.counts, sourceFile, source }
}

function alternateAudit(ts, root, row, owner, expected, declaration) {
  const alternate = { ...row, semanticOwner: owner }
  return sourceAudit(ts, root, alternate, expected, declaration)
}

function coverageState(row, ownerPaths, override) {
  const before =
    row.disposition === row.fixture.coverageBeforeStrictProof.disposition &&
    JSON.stringify(ownerPaths) ===
      JSON.stringify(row.fixture.coverageBeforeStrictProof.ownerPaths) &&
    JSON.stringify(row.evidenceIds) ===
      JSON.stringify(row.fixture.coverageBeforeStrictProof.evidenceIds)
  const after =
    row.disposition === 'source-runtime-covered' &&
    JSON.stringify(ownerPaths) === JSON.stringify(override.paths) &&
    JSON.stringify(row.evidenceIds) === JSON.stringify(override.evidenceIds) &&
    row.behavior === override.behavior
  assert.ok(before || after, `u${row.targetIndex}: exact before or after state`)
  return after ? 'corrected' : 'provisional'
}

test(
  '2.1.118 strict transitive fixture, generator, and owner map are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.criterion,
      'target118-frozen-transitive-whole-unit-source-ast-v1',
    )
    assert.deepEqual(fixture.summary, {
      units: 65,
      residues: 283,
      proofKinds: {
        'bounded-source-replay-source-ast': 7,
        'exact-named-declaration': 44,
        'exact-resource-module': 9,
        'exact-source-module': 4,
        'later-exact-declaration-recovery': 1,
      },
      rejectedIncidentalLiteralConsensusHints: 17,
      historicalResiduesCovered: 246,
      laterRecoveredResidues: 1,
      representations: {
        'authenticated-build-macro': 12,
        'bounded-source-replay-source-ast': 8,
        'declaration-referenced-dependency-source-ast': 2,
        'dynamic-import-lowering': 6,
        'exact-resource-bytes': 9,
        'jsx-or-runtime-import-lowering': 2,
        'later-source-ast': 1,
        'owner-module-source-ast': 1,
        'react-compiler-cache-index': 5,
        'source-ast': 237,
      },
    })
    assert.equal(new Set(fixture.rows.map(row => row.targetIndex)).size, 65)
    assert.equal(
      fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
      283,
    )
    assert.deepEqual(
      TARGET118_STRICT_TRANSITIVE_OWNER_OVERRIDES,
      fixture.ownerOverrides,
    )
    assert.deepEqual(
      TARGET118_STRICT_TRANSITIVE_SOURCE_GAP_OVERRIDES,
      fixture.boundedReplay.overrides,
    )
    assert.deepEqual(
      TARGET118_STRICT_TRANSITIVE_INPUT_FILES,
      fixture.boundedReplay.inputFiles,
    )
    assert.deepEqual(
      TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_FILES,
      fixture.boundedReplay.recoveredFiles,
    )
    assert.deepEqual(
      TARGET118_STRICT_TRANSITIVE_RAW_SOURCE_TREE,
      fixture.boundedReplay.rawSourceTree,
    )
    assert.deepEqual(
      TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_TREE,
      fixture.boundedReplay.recoveredSourceTree,
    )
    readExact(
      path.join(repositoryRoot, fixture.inputs.replayHelper.path),
      fixture.inputs.replayHelper,
      'strict replay helper',
    )
    const generated = spawnSync(process.execPath, [builderPath], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    assert.equal(generated.status, 0, generated.stderr || generated.stdout)
    assert.equal(generated.stdout, fixtureBytes.toString('utf8'))
  },
)

test(
  '2.1.118 all 65 complete target units and 283 residue occurrences authenticate',
  { skip: !selected, timeout: 120_000 },
  () => {
    const baselineBytes = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'baseline bundle',
    )
    const targetBytes = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    )
    const baselineOccurrences = collectBundleOccurrences(
      baselineBytes.toString('utf8'),
    )
    const targetText = targetBytes.toString('utf8')
    const targetOccurrences = collectBundleOccurrences(targetText)
    for (const row of fixture.rows) {
      const unit = targetText.slice(row.target.start, row.target.end)
      assert.equal(Buffer.byteLength(unit), row.target.bytes, `u${row.targetIndex}: bytes`)
      assert.equal(sha256(unit), row.target.sourceHash, `u${row.targetIndex}: SHA-256`)
      const targetIdentities = collectTargetIdentities(unit)
      assert.deepEqual(
        {
          identities: targetIdentities.size,
          sha256: sha256(
            Buffer.from(JSON.stringify([...targetIdentities].sort())),
          ),
        },
        row.targetIdentitySignature,
        `u${row.targetIndex}: target identity signature`,
      )
      for (const residue of row.residues) {
        const key = identity(residue.kind, residue.value)
        assert.equal(
          sha256(Buffer.from(key)),
          residue.identitySha256,
          `u${row.targetIndex}: residue identity`,
        )
        assert.equal(
          (baselineOccurrences.get(key) ?? []).length,
          residue.baselineCount,
          `u${row.targetIndex} ${key}: baseline count`,
        )
        const occurrence =
          (targetOccurrences.get(key) ?? [])[residue.targetOrdinal - 1]
        assert.ok(occurrence, `u${row.targetIndex} ${key}: target ordinal`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [residue.start, residue.end],
          `u${row.targetIndex} ${key}: exact target range`,
        )
        assert.ok(residue.start >= row.target.start)
        assert.ok(residue.end <= row.target.end)
      }
      assert.equal(
        sha256(Buffer.from(JSON.stringify(row.residues))),
        row.residueIdentitiesSha256,
      )
    }
  },
)

test(
  '2.1.118 declaration/resource proofs are scoped and reject incidental literal hints',
  { skip: !selected, timeout: 120_000 },
  async () => {
    const ts = await loadTypeScript()
    const targetText = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    for (const row of fixture.rows) {
      sourceAudit(ts, historicalRoot, row, row.historicalSource)
      if (row.laterSource) {
        sourceAudit(ts, laterRoot, row, row.laterSource)
      }
      if (row.moduleSource) {
        sourceAudit(
          ts,
          historicalRoot,
          row,
          row.moduleSource,
          { kind: 'SourceFile', name: null },
        )
      }
      if (row.dependencySource) {
        alternateAudit(
          ts,
          historicalRoot,
          row,
          'src/utils/hooks/execMcpToolHook.ts',
          row.dependencySource,
          { kind: 'FunctionDeclaration', name: 'execMcpToolHook' },
        )
      }
      for (const [index, representation] of row.representations.entries()) {
        const identitySha256 = row.residues[index].identitySha256
        assert.equal(representation.identitySha256, identitySha256)
        const sourceKinds =
          representation.kind === 'later-source-ast'
            ? row.laterSource.residueRoles[index].nodeKinds
            : representation.kind === 'owner-module-source-ast'
              ? row.moduleSource.residueRoles[index].nodeKinds
              : representation.kind ===
                  'declaration-referenced-dependency-source-ast'
                ? row.dependencySource.residueRoles[index].nodeKinds
                : representation.kind === 'bounded-source-replay-source-ast'
                  ? row.recoveredSource.residueRoles[index].nodeKinds
                  : ['source-ast', 'exact-resource-bytes'].includes(
                        representation.kind,
                      )
                    ? row.historicalSource.residueRoles[index].nodeKinds
                    : []
        if (
          [
            'source-ast',
            'exact-resource-bytes',
            'later-source-ast',
            'owner-module-source-ast',
            'declaration-referenced-dependency-source-ast',
            'bounded-source-replay-source-ast',
          ].includes(representation.kind)
        ) {
          assert.ok(
            sourceKinds.length > 0,
            `u${row.targetIndex}: ${representation.kind} is scope-local`,
          )
          assert.deepEqual(representation.nodeKinds, sourceKinds)
        }
      }

      const rejected = row.rejectedLiteralConsensusHint
      if (!rejected) continue
      readExact(
        path.join(historicalRoot, rejected.path.slice(4)),
        rejected.file,
        `u${row.targetIndex}: rejected hint`,
      )
      const hintRow = { ...row, semanticOwner: rejected.path }
      const hintFilename = path.join(historicalRoot, rejected.path.slice(4))
      const hintSource = fs.readFileSync(hintFilename, 'utf8')
      const hintFile = ts.createSourceFile(
        hintFilename,
        hintSource,
        ts.ScriptTarget.Latest,
        true,
        hintFilename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      assert.equal(hintFile.parseDiagnostics.length, 0)
      const hintIdentities = collectSourceIdentities(ts, hintFile, hintFile).kinds
      const targetIdentities = collectTargetIdentities(
        targetText.slice(row.target.start, row.target.end),
      )
      assert.ok(
        [...targetIdentities].some(key => !hintIdentities.has(key)),
        `u${row.targetIndex}: incidental hint cannot represent the complete unit`,
      )
      if (!['SourceFile', 'Resource'].includes(row.declaration.kind)) {
        const matches = []
        function find(node) {
          if (
            ts.SyntaxKind[node.kind] === row.declaration.kind &&
            declarationName(ts, node) === row.declaration.name
          ) {
            matches.push(node)
          }
          ts.forEachChild(node, find)
        }
        find(hintFile)
        const exactScope =
          row.recoveredSource?.scope ??
          row.laterSource?.scope ??
          row.historicalSource.scope
        assert.ok(exactScope, `u${row.targetIndex}: semantic scope is pinned`)
        for (const match of matches) {
          const text = hintSource.slice(match.getStart(hintFile), match.end)
          assert.notEqual(
            sha256(Buffer.from(text)),
            exactScope.sha256,
            `u${hintRow.targetIndex}: same-named hint is not the exact semantic declaration`,
          )
        }
      }
    }
  },
)

test(
  '2.1.118 seven-unit source-gap replay is exact, complete, idempotent, and fail closed',
  { skip: !selected, timeout: 120_000 },
  async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-strict-source-gap-test-'),
    )
    const sourceRoot = path.join(temporaryRoot, 'src')
    fs.cpSync(historicalRoot, sourceRoot, { recursive: true })
    try {
      const first = applyTarget118StrictTransitiveSourceGapReplay({ sourceRoot })
      assert.equal(first.status, 'recovered')
      assert.deepEqual(first.before, fixture.boundedReplay.rawSourceTree)
      assert.deepEqual(first.after, fixture.boundedReplay.recoveredSourceTree)
      assert.equal(first.files.filter(file => file.action === 'recovered').length, 7)
      const second = applyTarget118StrictTransitiveSourceGapReplay({ sourceRoot })
      assert.equal(second.status, 'already-recovered')
      assert.deepEqual(second.before, second.after)

      const ts = await loadTypeScript()
      for (const row of fixture.rows.filter(row => row.recoveredSource)) {
        const audit = sourceAudit(ts, sourceRoot, row, row.recoveredSource)
        const requiredCounts = new Map()
        for (const residue of row.residues) {
          const key = identity(residue.kind, residue.value)
          requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1)
        }
        for (const [key, count] of requiredCounts) {
          assert.ok(
            (audit.counts.get(key) ?? 0) >= count,
            `u${row.targetIndex}: replay owns every ${key} occurrence`,
          )
        }
      }

      const corrupted = path.join(sourceRoot, 'utils/cliArgs.ts')
      fs.appendFileSync(corrupted, '// drift\n')
      assert.throws(
        () =>
          applyTarget118StrictTransitiveSourceGapReplay({
            sourceRoot,
          }),
        /Refusing to replay against non-target118 source tree/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.118 coverage accepts only the complete provisional or complete strict-owner state',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            repositoryRoot,
            'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
    const overrides = new Map(
      fixture.ownerOverrides.map(override => [override.targetIndex, override]),
    )
    const states = new Set()
    for (const expected of fixture.rows) {
      const row = rows.get(expected.targetIndex)
      assert.ok(row, `u${expected.targetIndex}: coverage row`)
      assert.deepEqual(
        {
          start: row.start,
          end: row.end,
          nodeType: row.nodeType,
          sourceHash: row.sourceHash,
        },
        {
          start: expected.target.start,
          end: expected.target.end,
          nodeType: expected.target.nodeType,
          sourceHash: expected.target.sourceHash,
        },
      )
      const ownerPaths = row.ownerIds.map(ownerId => {
        const owner = owners.get(ownerId)
        assert.ok(owner, `u${expected.targetIndex}: owner ${ownerId}`)
        return owner
      })
      states.add(
        coverageState(
          { ...row, fixture: expected },
          ownerPaths,
          overrides.get(expected.targetIndex),
        ),
      )
    }
    assert.equal(states.size, 1, 'the 65-row correction is atomic')
    const coverageMode = [...states][0]

    const reportPath = path.join(
      repositoryRoot,
      '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
    )
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath))
      const fixtureRows = new Map(
        fixture.rows.map(row => [row.targetIndex, row]),
      )
      const liveRows = report.sourceRuntimeAddedOwnerResidueRows.filter(row =>
        fixtureRows.has(row.structural.index),
      )
      const pinned = fixture.rows.flatMap(row =>
        row.residues.map(residue => ({
          targetIndex: row.targetIndex,
          kind: residue.kind,
          value: residue.value,
          start: residue.start,
          end: residue.end,
          targetOrdinal: residue.targetOrdinal,
        })),
      )
      const live = liveRows.map(row => ({
        targetIndex: row.structural.index,
        kind: row.literalKind,
        value: row.value,
        start: row.target.start,
        end: row.target.end,
        targetOrdinal: row.targetOccurrenceNumber,
      }))
      if (coverageMode === 'provisional') {
        assert.deepEqual(live, pinned)
      } else {
        assert.deepEqual(
          {
            units: new Set(live.map(row => row.targetIndex)).size,
            residues: live.length,
            sha256: sha256(Buffer.from(JSON.stringify(live))),
          },
          POST_CORRECTION_SCANNER,
          'scanner retains the exact authenticated post-correction residual',
        )
      }
    }
  },
)
