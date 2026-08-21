import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-strict-alternate-owner-proofs.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c8f6ed28ccd9808700fa17c07bbd935c11d4ba7bd7eae8d79e1ddf373e5a4991'
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const historicalSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
)
const currentSourceRoot = path.join(repositoryRoot, 'src')
const target119SourceRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)

const EXPECTED_INDICES = [
  8231,
  8755,
  9067,
  12342,
  12603,
  15194,
  15627,
  16050,
  16052,
  16509,
  19990,
]
const EVIDENCE_IDS = [
  'target117-strict-alternate-owner-target-fragment',
  'target117-strict-alternate-owner-source-ast-test',
]

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

function sourceFilename(root, owner) {
  assert.match(owner, /^src\//, `${owner}: normalized source owner`)
  const filename = path.resolve(root, owner.slice(4))
  assert.ok(
    filename.startsWith(`${path.resolve(root)}${path.sep}`),
    `${owner}: source path remains under root`,
  )
  return filename
}

function normalizeSource(source) {
  if (source.startsWith('../src/')) return source.slice(3)
  if (source.startsWith('src/')) return source
  return `src/${source}`
}

function candidateUniverse(reportRows, semanticOwner) {
  return [
    ...new Set([
      ...reportRows.flatMap(row =>
        row.candidates
          .filter(candidate => candidate.startsWith('../src/'))
          .map(normalizeSource),
      ),
      ...reportRows.flatMap(row => row.sourceMatches.map(normalizeSource)),
      semanticOwner,
    ]),
  ].sort()
}

function commonSourceMatches(reportRows) {
  return [
    ...reportRows
      .map(row => new Set(row.sourceMatches.map(normalizeSource)))
      .reduce(
        (common, matches) =>
          new Set([...common].filter(candidate => matches.has(candidate))),
      ),
  ].sort()
}

const sourcePathCache = new Map()

function allFirstPartySourcePaths(root) {
  const normalizedRoot = path.resolve(root)
  const cached = sourcePathCache.get(normalizedRoot)
  if (cached) return cached
  const paths = []
  const pending = [normalizedRoot]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(filename)
      } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
        paths.push(
          `src/${path.relative(normalizedRoot, filename).split(path.sep).join('/')}`,
        )
      }
    }
  }
  paths.sort()
  sourcePathCache.set(normalizedRoot, paths)
  return paths
}

function identity(kind, value) {
  return `${kind}:${JSON.stringify(value)}`
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
    const values = grouped.get(key) ?? []
    values.push({ start: node.start, end: node.end })
    grouped.set(key, values)
  }
  walkAcorn(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node)
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
  for (const values of grouped.values()) {
    values.sort((left, right) => left.start - right.start)
  }
  return { ast, grouped }
}

async function loadTypeScript() {
  const candidates = [
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
    path.resolve(
      path.dirname(process.execPath),
      'vscode/extensions/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const filename = candidates.find(fs.existsSync)
  assert.ok(filename, 'the pinned TypeScript compiler is available')
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

function declarationName(ts, node) {
  const name = node.name
  if (name && ts.isIdentifier(name)) return name.text
  if (name && ts.isStringLiteralLike(name)) return name.text
  return undefined
}

function collectSourceIdentities(ts, declaration) {
  const identities = new Map()
  function add(kind, value, nodeKind) {
    const key = identity(kind, value)
    const kinds = identities.get(key) ?? new Set()
    kinds.add(nodeKind)
    identities.set(key, kinds)
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      add('string', node.text, ts.SyntaxKind[node.kind])
    } else if (
      [
        ts.SyntaxKind.TemplateHead,
        ts.SyntaxKind.TemplateMiddle,
        ts.SyntaxKind.TemplateTail,
      ].includes(node.kind)
    ) {
      add('string', node.text, ts.SyntaxKind[node.kind])
    } else if (node.kind === ts.SyntaxKind.JsxText) {
      const lines = node.text.split(/\r?\n/)
      for (let index = 0; index < lines.length; index += 1) {
        let line = lines[index].replace(/\t/g, ' ')
        if (index !== 0) line = line.replace(/^ +/, '')
        if (index !== lines.length - 1) line = line.replace(/ +$/, '')
        if (line) add('string', line, 'JsxText')
      }
    }

    if (ts.isPropertyAccessExpression(node)) {
      add('property', node.name.text, 'PropertyAccessExpression')
    } else if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isJsxAttribute(node) ||
        ts.isBindingElement(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      add('property', node.name.text, ts.SyntaxKind[node.kind])
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return identities
}

function auditSource(ts, root, row) {
  const filename = sourceFilename(root, row.semanticOwner)
  assert.ok(fs.existsSync(filename), `${row.semanticOwner}: source exists`)
  const bytes = fs.readFileSync(filename)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(
    sourceFile.parseDiagnostics.length,
    0,
    `${row.semanticOwner}: TypeScript parses`,
  )
  const declarations = []
  function find(node) {
    if (
      ts.SyntaxKind[node.kind] === row.declaration.kind &&
      declarationName(ts, node) === row.declaration.name
    ) {
      declarations.push(node)
    }
    ts.forEachChild(node, find)
  }
  find(sourceFile)

  const runtimeImports = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const clause = statement.importClause
    if (clause.isTypeOnly) continue
    const module = statement.moduleSpecifier.text
    if (clause.name) runtimeImports.set(clause.name.text, module)
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) {
      runtimeImports.set(bindings.name.text, module)
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) runtimeImports.set(element.name.text, module)
      }
    }
  }

  const declaration = declarations.length === 1 ? declarations[0] : undefined
  const identities = declaration
    ? collectSourceIdentities(ts, declaration)
    : new Map()
  const references = new Set()
  const dynamicModules = new Set()
  if (declaration) {
    function visit(node) {
      if (ts.isIdentifier(node)) references.add(node.text)
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        dynamicModules.add(node.arguments[0].text)
      }
      ts.forEachChild(node, visit)
    }
    visit(declaration)
  }
  const residueRoles = row.residues.map(residue => ({
    kind: residue.kind,
    valueSha256: residue.valueSha256,
    nodeKinds: [
      ...(identities.get(identity(residue.kind, residue.value)) ?? []),
    ].sort(),
  }))
  const declarationText = declaration
    ? source.slice(declaration.getStart(sourceFile), declaration.end)
    : undefined
  return {
    filename,
    file: descriptor(bytes),
    declarationMatches: declarations.length,
    declaration: declaration
      ? {
          start: declaration.getStart(sourceFile),
          end: declaration.end,
          ...descriptor(Buffer.from(declarationText)),
        }
      : null,
    coversEveryResidue: residueRoles.every(role => role.nodeKinds.length > 0),
    residueRoles,
    runtimeImports,
    references,
    dynamicModules,
  }
}

function comparableSourceAudit(audit) {
  return {
    declaration: audit.declaration,
    declarationMatches: audit.declarationMatches,
    coversEveryResidue: audit.coversEveryResidue,
    residueRoles: audit.residueRoles,
  }
}

function findSemanticCandidateMatches(ts, root, row, candidates) {
  const matches = []
  for (const candidate of candidates) {
    const filename = sourceFilename(root, candidate)
    if (!fs.existsSync(filename)) continue
    const source = fs.readFileSync(filename, 'utf8')
    if (!source.includes(row.declaration.name)) continue
    const sourceFile = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0, `${candidate}: parses`)
    const declarations = []
    function visit(node) {
      if (
        ts.SyntaxKind[node.kind] === row.declaration.kind &&
        declarationName(ts, node) === row.declaration.name
      ) {
        declarations.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    if (
      declarations.length === 1 &&
      row.residues.every(residue =>
        collectSourceIdentities(ts, declarations[0]).has(
          identity(residue.kind, residue.value),
        ),
      )
    ) {
      matches.push(candidate)
    }
  }
  return matches
}

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

test(
  '2.1.117 strict alternate-owner fixture is complete and fail closed',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.criterion,
      'target117-whole-unit-exact-owner-declaration-v1',
    )
    assert.equal(fixture.status, 'strict-declaration-proof-ready')
    assert.deepEqual(fixture.evidenceIds, EVIDENCE_IDS)
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      EXPECTED_INDICES,
    )
    assert.deepEqual(fixture.summary, {
      units: 11,
      residues: 20,
      exactAlternateDeclarations: 9,
      laterExactDeclarationRecoveries: 1,
      currentOwnersConfirmed: 1,
      rejectedTextOnlyCandidates: 2,
    })
    assert.equal(
      fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
      fixture.summary.residues,
    )
    assert.equal(
      new Set(fixture.rows.map(row => row.semanticOwner)).size,
      10,
      'two missing-dependency units intentionally share one declaration file',
    )

    readExact(
      path.join(repositoryRoot, fixture.inputs.structural.path),
      fixture.inputs.structural,
      'structural',
    )
    readExact(
      path.join(repositoryRoot, fixture.inputs.target119SourceOverlay.path),
      fixture.inputs.target119SourceOverlay,
      'target119 source overlay',
    )
    assert.equal(
      fixture.inputs.ownerResidueReport.fullRows,
      889,
      'embedded pre-correction owner-residue provenance',
    )
    assert.match(fixture.inputs.ownerResidueReport.sha256, /^[0-9a-f]{64}$/)

    assert.equal(
      fixture.temporalWitness.target117To118.classification,
      'matched',
    )
    assert.equal(
      fixture.temporalWitness.target118To119.classification,
      'matched',
    )
    for (const witness of Object.values(fixture.temporalWitness)) {
      const ledgerBytes = readExact(
        path.join(repositoryRoot, witness.ledger.path),
        witness.ledger,
        witness.ledger.path,
      )
      const ledger = JSON.parse(gunzipSync(ledgerBytes))
      const region = ledger.regions.find(
        row => row.baselineUnitIndex === witness.baselineIndex,
      )
      assert.ok(region, `u${witness.baselineIndex}: temporal pair`)
      assert.deepEqual(
        {
          classification: region.classification,
          pairReason: region.pairReason,
          targetIndex: region.target.index,
          targetNodeType: region.target.nodeType,
          targetSourceHash: region.target.sourceHash,
        },
        {
          classification: witness.classification,
          pairReason: witness.pairReason,
          targetIndex: witness.targetIndex,
          targetNodeType: witness.targetNodeType,
          targetSourceHash: witness.targetSourceHash,
        },
      )
    }
  },
)

test(
  '2.1.117 complete target units and all 20 typed residues authenticate',
  { skip: !selected },
  () => {
    const baselineBytes = readExact(
      bundlePath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'baseline bundle',
    )
    const targetBytes = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const baselineSyntax = collectBundleOccurrences(baseline)
    const targetSyntax = collectBundleOccurrences(target)

    const structuralBytes = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.structural.path),
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    for (const row of fixture.rows) {
      const region = regions.get(row.targetIndex)
      assert.ok(region, `u${row.targetIndex}: structural region`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        row.target,
        `u${row.targetIndex}: full structural identity`,
      )
      const unit = target.slice(row.target.start, row.target.end)
      assert.equal(
        Buffer.byteLength(unit),
        row.target.bytes,
        `u${row.targetIndex}: complete unit bytes`,
      )
      assert.equal(
        sha256(unit),
        row.target.sourceHash,
        `u${row.targetIndex}: complete unit SHA-256`,
      )
      const unitAst = parse(unit, {
        ecmaVersion: 'latest',
        sourceType: 'module',
      })
      assert.equal(unitAst.body.length, 1, `u${row.targetIndex}: one unit`)
      assert.equal(
        unitAst.body[0].type,
        row.target.nodeType,
        `u${row.targetIndex}: node type`,
      )

      assert.ok(row.residues.length > 0, `u${row.targetIndex}: embedded residues`)
      assert.ok(
        row.reportCommonSourceMatches.length > 0,
        `u${row.targetIndex}: embedded scanner witness`,
      )
      assert.ok(
        row.candidateUniverse.files >= row.reportCommonSourceMatches.length,
        `u${row.targetIndex}: embedded candidate-universe cardinality`,
      )
      assert.match(row.candidateUniverse.sha256, /^[0-9a-f]{64}$/)

      for (const residue of row.residues) {
        assert.ok(residue.start >= row.target.start)
        assert.ok(residue.end <= row.target.end)
        assert.equal(sha256(String(residue.value)), residue.valueSha256)
        const key = identity(residue.kind, residue.value)
        const baselineOccurrences = baselineSyntax.grouped.get(key) ?? []
        const targetOccurrences = targetSyntax.grouped.get(key) ?? []
        assert.equal(
          baselineOccurrences.length,
          residue.baselineCount,
          `u${row.targetIndex}: ${key} baseline count`,
        )
        const occurrence = targetOccurrences[residue.targetOrdinal - 1]
        assert.ok(occurrence, `u${row.targetIndex}: ${key} target ordinal`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [residue.start, residue.end],
          `u${row.targetIndex}: ${key} exact target range`,
        )
      }
    }
  },
)

test(
  '2.1.117 named source declarations and runtime imports prove exact owners',
  { skip: !selected },
  async () => {
    assert.ok(fs.existsSync(target119SourceRoot), 'target119 source witness root')
    const ts = await loadTypeScript()

    for (const row of fixture.rows) {
      const historicalAudit = auditSource(ts, historicalSourceRoot, row)
      const comparableHistorical = comparableSourceAudit(historicalAudit)
      const historicalWitnesses = [row.historicalSource, row.packagedSource]
        .filter(Boolean)
        .map(source => ({
          declaration: source.declaration,
          declarationMatches: source.declarationMatches,
          coversEveryResidue: source.coversEveryResidue,
          residueRoles: source.residueRoles,
        }))
      const matchedHistoricalWitness = historicalWitnesses.find(
        witness =>
          JSON.stringify(witness) === JSON.stringify(comparableHistorical),
      )
      assert.ok(
        matchedHistoricalWitness,
        `u${row.targetIndex}: exact raw or packaged historical source`,
      )
      const currentAudit = auditSource(ts, currentSourceRoot, row)
      assert.deepEqual(
        comparableSourceAudit(currentAudit),
        {
          declaration: row.currentSource.declaration,
          declarationMatches: row.currentSource.declarationMatches,
          coversEveryResidue: row.currentSource.coversEveryResidue,
          residueRoles: row.currentSource.residueRoles,
        },
        `u${row.targetIndex}: exact current source`,
      )

      const proofRoot =
        row.sourceProof.root === 'target117-historical'
          ? historicalSourceRoot
          : target119SourceRoot
      const proofAudit =
        row.sourceProof.root === 'target117-historical'
          ? historicalAudit
          : auditSource(ts, target119SourceRoot, row)
      const expectedProofSource =
        row.sourceProof.root === 'target117-historical'
          ? matchedHistoricalWitness
          : row.laterSourceWitness
      assert.deepEqual(
        comparableSourceAudit(proofAudit),
        {
          declaration: expectedProofSource.declaration,
          declarationMatches: expectedProofSource.declarationMatches,
          coversEveryResidue: expectedProofSource.coversEveryResidue,
          residueRoles: expectedProofSource.residueRoles,
        },
        `u${row.targetIndex}: pinned proof declaration`,
      )
      assert.equal(proofAudit.declarationMatches, 1)
      assert.equal(proofAudit.coversEveryResidue, true)
      assert.deepEqual(
        proofAudit.residueRoles,
        row.sourceProof.residueRoles,
        `u${row.targetIndex}: every residue has declaration-local AST roles`,
      )
      for (const expectedImport of row.sourceProof.requiredRuntimeImports) {
        assert.equal(
          proofAudit.runtimeImports.get(expectedImport.local),
          expectedImport.module,
          `u${row.targetIndex}: runtime import ${expectedImport.local}`,
        )
        assert.ok(
          proofAudit.references.has(expectedImport.local),
          `u${row.targetIndex}: declaration references ${expectedImport.local}`,
        )
      }
      for (const expectedModule of row.declaration.requiredDynamicModules) {
        assert.ok(
          proofAudit.dynamicModules.has(expectedModule),
          `u${row.targetIndex}: declaration-local module ${expectedModule}`,
        )
      }

      const candidates = allFirstPartySourcePaths(proofRoot)
      assert.deepEqual(
        findSemanticCandidateMatches(ts, proofRoot, row, candidates),
        [row.semanticOwner],
        `u${row.targetIndex}: unique named declaration owner across the full source tree`,
      )
      for (const rejected of row.rejectedTextOnlyCandidates) {
        const rejectedFilename = sourceFilename(proofRoot, rejected)
        assert.ok(fs.existsSync(rejectedFilename), `${rejected}: exists`)
        const rejectedText = fs.readFileSync(rejectedFilename, 'utf8')
        assert.ok(
          row.residues.some(residue =>
            rejectedText.includes(String(residue.value)),
          ),
          `u${row.targetIndex}: ${rejected} explains the global-text match`,
        )
      }
    }

    const recovered = fixture.rows.find(row => row.targetIndex === 12603)
    assert.equal(recovered.historicalSource.declarationMatches, 0)
    assert.equal(recovered.historicalSource.coversEveryResidue, false)
    assert.equal(recovered.laterSourceWitness.declarationMatches, 1)
    const laterAudit = auditSource(ts, target119SourceRoot, recovered)
    const laterSource = fs.readFileSync(laterAudit.filename, 'utf8')
    const declaration = laterSource.slice(
      laterAudit.declaration.start,
      laterAudit.declaration.end,
    )
    const overlay = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.target119SourceOverlay.path),
      'utf8',
    )
    assert.ok(
      overlay.includes(
        declaration
          .split('\n')
          .map(line => `+${line}`)
          .join('\n'),
      ),
      'u12603 exact declaration is added by the pinned target119 overlay',
    )
  },
)

test(
  '2.1.117 generator owner wiring is exact and coverage evolves atomically',
  { skip: !selected },
  () => {
    const coverageBytes = fs.readFileSync(
      path.join(
        repositoryRoot,
        fixture.inputs.coverageAfterSourceGapOverridesBeforeTheseCorrections
          .path,
      ),
    )
    const coverage = JSON.parse(gunzipSync(coverageBytes))
    const coverageRows = new Map(
      coverage.rows.map(row => [row.targetIndex, row]),
    )
    const owners = new Map(
      coverage.owners.map(owner => [owner.id, owner.path]),
    )
    const overrideEntries = fixture.rows.map(row => [
      `${caseName}:${row.targetIndex}`,
      {
        paths: [row.semanticOwner],
        evidenceIds: EVIDENCE_IDS,
        behavior: row.behavior,
      },
    ])
    assert.equal(new Map(overrideEntries).size, fixture.summary.units)

    const states = new Set()
    for (const row of fixture.rows) {
      assert.ok(row.behavior.length > 0, `u${row.targetIndex}: behavior`)
      const entry = new Map(overrideEntries).get(
        `${caseName}:${row.targetIndex}`,
      )
      assert.deepEqual(entry.paths, [row.semanticOwner])
      assert.deepEqual(entry.evidenceIds, fixture.evidenceIds)

      if (row.correctionKind === 'current-owner-confirmed') {
        assert.deepEqual(row.coverageBeforeCorrection.owners, [row.semanticOwner])
      } else {
        assert.ok(
          !row.coverageBeforeCorrection.owners.includes(row.semanticOwner),
          `u${row.targetIndex}: prior coverage owner is corrected`,
        )
      }

      const coverageRow = coverageRows.get(row.targetIndex)
      assert.ok(coverageRow, `u${row.targetIndex}: coverage row`)
      assert.deepEqual(
        {
          start: coverageRow.start,
          end: coverageRow.end,
          nodeType: coverageRow.nodeType,
          sourceHash: coverageRow.sourceHash,
        },
        {
          start: row.target.start,
          end: row.target.end,
          nodeType: row.target.nodeType,
          sourceHash: row.target.sourceHash,
        },
      )
      assert.equal(coverageRow.disposition, 'source-runtime-covered')
      const actualOwners = coverageRow.ownerIds.map(ownerId => {
        const owner = owners.get(ownerId)
        assert.ok(owner, `u${row.targetIndex}: coverage owner ${ownerId}`)
        return owner
      })
      const corrected =
        actualOwners.length === 1 &&
        actualOwners[0] === row.semanticOwner &&
        JSON.stringify(coverageRow.evidenceIds) === JSON.stringify(EVIDENCE_IDS)
      const provisional =
        JSON.stringify(actualOwners) ===
          JSON.stringify(row.coverageBeforeCorrection.owners) &&
        JSON.stringify(coverageRow.evidenceIds) ===
          JSON.stringify(row.coverageBeforeCorrection.evidenceIds)
      assert.ok(
        corrected || provisional,
        `u${row.targetIndex}: exact provisional or corrected coverage state`,
      )
      states.add(corrected ? 'corrected' : 'provisional')
    }
    assert.equal(states.size, 1, 'all eleven coverage rows evolve atomically')
    if (states.has('provisional')) {
      assert.deepEqual(
        descriptor(coverageBytes),
        {
          bytes:
            fixture.inputs
              .coverageAfterSourceGapOverridesBeforeTheseCorrections.bytes,
          sha256:
            fixture.inputs
              .coverageAfterSourceGapOverridesBeforeTheseCorrections.sha256,
        },
        'post-source-gap pre-correction coverage input',
      )
    }
  },
)
