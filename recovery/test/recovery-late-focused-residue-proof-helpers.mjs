import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)

const ALLOWED_CATEGORIES = new Set([
  'compiler-import-lowering',
  'direct-owner-representation',
  'exact-alternate-owner',
  'exact-candidate-owner-cover',
  'paired-local-invariant',
  'semantic-correspondence',
])
const ALLOWED_PROOFS = new Set([
  'direct-source-representation',
  'exact-alternate-source',
  'exact-candidate-source',
  'paired-local',
  'runtime-import',
  'semantic-source',
  'semantic-target-fragment',
])
const CATEGORY_PROOFS = new Map([
  ['compiler-import-lowering', new Set(['runtime-import'])],
  ['direct-owner-representation', new Set(['direct-source-representation'])],
  ['exact-alternate-owner', new Set(['exact-alternate-source'])],
  ['exact-candidate-owner-cover', new Set(['exact-candidate-source'])],
  ['paired-local-invariant', new Set(['paired-local'])],
  [
    'semantic-correspondence',
    new Set(['semantic-source', 'semantic-target-fragment']),
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags]
      .sort()
      .join('')}`
  }
  return `${kind}:${
    kind === 'string' || kind === 'property'
      ? JSON.stringify(value)
      : String(value)
  }`
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

function collectOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const grouped = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const occurrences = grouped.get(key) ?? []
    occurrences.push({ end: node.end, start: node.start })
    grouped.set(key, occurrences)
  }
  walk(ast, [], node => {
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node)
      else if (typeof node.value === 'string') add('string', node.value, node)
      else if (typeof node.value === 'number') add('number', node.value, node)
      else if (node.bigint !== undefined) add('bigint', node.bigint, node)
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
  return { ast, grouped }
}

function sourceFilename(owner) {
  assert.match(owner, /^src\//, `${owner}: normalized source owner`)
  const filename = path.join(sourceRoot, owner.slice(4))
  assert.ok(fs.existsSync(filename), `${owner}: source owner exists`)
  return filename
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

const sourceAuditCache = new Map()

async function sourceAudit(owner) {
  if (sourceAuditCache.has(owner)) return sourceAuditCache.get(owner)
  const ts = await loadTypeScript()
  const filename = sourceFilename(owner)
  const sourceFile = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${owner}: parses`)
  const identities = new Set()
  const imports = new Set()
  const namespaceImports = new Set()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const clause = statement.importClause
    if (clause.isTypeOnly) continue
    if (clause.name) imports.add(clause.name.text)
    const named = clause.namedBindings
    if (named && ts.isNamespaceImport(named)) {
      namespaceImports.add(named.name.text)
    } else if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        if (!element.isTypeOnly) imports.add(element.name.text)
      }
    }
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      identities.add(identity('string', node.text))
    } else if (
      [
        ts.SyntaxKind.TemplateHead,
        ts.SyntaxKind.TemplateMiddle,
        ts.SyntaxKind.TemplateTail,
      ].includes(node.kind)
    ) {
      identities.add(identity('string', node.text))
    } else if (node.kind === ts.SyntaxKind.JsxText) {
      const lines = node.text.split(/\r?\n/)
      for (let index = 0; index < lines.length; index++) {
        let line = lines[index].replace(/\t/g, ' ')
        if (index !== 0) line = line.replace(/^ +/, '')
        if (index !== lines.length - 1) line = line.replace(/ +$/, '')
        if (line) identities.add(identity('string', line))
      }
    } else if (ts.isNumericLiteral(node)) {
      identities.add(identity('number', Number(node.text)))
    } else if (ts.isBigIntLiteral(node)) {
      identities.add(identity('bigint', node.text.replace(/n$/, '')))
    } else if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const match = /^\/(.*)\/([a-z]*)$/s.exec(node.text)
      if (match) {
        identities.add(
          identity('regexp', { flags: match[2], pattern: match[1] }),
        )
      }
    }

    if (ts.isPropertyAccessExpression(node)) {
      identities.add(identity('property', node.name.text))
      if (
        ts.isIdentifier(node.expression) &&
        namespaceImports.has(node.expression.text)
      ) {
        imports.add(node.name.text)
      }
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
      identities.add(identity('property', node.name.text))
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  const result = { identities, imports }
  sourceAuditCache.set(owner, result)
  return result
}

function fileDescriptor(filename) {
  return descriptor(fs.readFileSync(filename))
}

function bundleEnvironmentVariable(version) {
  return `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
}

function rangesForWitness(witness) {
  return witness.bundleWitnesses.flatMap(bundleWitness =>
    bundleWitness.targetRanges.map(range => ({
      end: range.end,
      start: range.start,
    })),
  )
}

export function registerFocusedResidueProofSuite({
  caseName,
  fixtureFilename,
  fixtureSha256,
}) {
  const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
  const selected = !semanticCase || semanticCase === caseName
  const historicalSourceSelected = semanticCase === caseName
  const fixturePath = fileURLToPath(
    new URL(`./${fixtureFilename}`, import.meta.url),
  )
  const fixtureBytes = fs.readFileSync(fixturePath)
  const fixture = JSON.parse(fixtureBytes)
  const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
  const structuralPath = path.join(
    caseRoot,
    'structural/generated-delta.json.gz',
  )
  const correspondencePath = path.join(
    caseRoot,
    'semantic/semantic-correspondence.json.gz',
  )
  const directEvidencePath = path.join(
    caseRoot,
    'semantic/direct-evidence.json',
  )
  const structuralBytes = fs.readFileSync(structuralPath)
  const correspondenceBytes = fs.readFileSync(correspondencePath)
  const structural = JSON.parse(gunzipSync(structuralBytes))
  const correspondence = JSON.parse(gunzipSync(correspondenceBytes))
  const witnesses = new Map(
    correspondence.obligationWitnesses.map(witness => [witness.id, witness]),
  )
  const catalog = new Map(
    correspondence.testCatalog.map(entry => [entry.id, entry]),
  )
  const macroPath = fileURLToPath(
    new URL(
      `./recovery-${fixture.versions.target}-build-metadata-residue-proofs.json`,
      import.meta.url,
    ),
  )
  const exactOwnerPath = fileURLToPath(
    new URL(
      `./recovery-${fixture.versions.target}-exact-owner-correction-proofs.json`,
      import.meta.url,
    ),
  )
  const macro = JSON.parse(fs.readFileSync(macroPath))
  const exactOwner = JSON.parse(fs.readFileSync(exactOwnerPath))

  test(`${caseName} focused fixture is complete, disjoint, and fail closed`, () => {
    assert.equal(sha256(fixtureBytes), fixtureSha256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(descriptor(structuralBytes), fixture.artifact.structuralGzip)
    assert.deepEqual(
      descriptor(correspondenceBytes),
      fixture.artifact.semanticCorrespondenceGzip,
    )
    assert.deepEqual(
      fileDescriptor(directEvidencePath),
      fixture.artifact.directEvidence,
    )
    assert.deepEqual(
      fileDescriptor(macroPath),
      {
        bytes: fixture.derivation.buildMetadataFixture.bytes,
        sha256: fixture.derivation.buildMetadataFixture.sha256,
      },
    )
    assert.deepEqual(
      fileDescriptor(exactOwnerPath),
      {
        bytes: fixture.derivation.exactOwnerFixture.bytes,
        sha256: fixture.derivation.exactOwnerFixture.sha256,
      },
    )

    const categories = {}
    const proofs = {}
    const admitted = new Set()
    for (const row of fixture.rows) {
      assert.ok(ALLOWED_CATEGORIES.has(row.category), `${row.targetIndex}: category`)
      assert.ok(!admitted.has(row.targetIndex), `${row.targetIndex}: unique row`)
      admitted.add(row.targetIndex)
      assert.ok(row.coverageOwners.length > 0, `${row.targetIndex}: coverage owners`)
      assert.deepEqual(
        [...new Set(row.coverageOwners)].sort(),
        row.coverageOwners,
        `${row.targetIndex}: sorted unique coverage owners`,
      )
      assert.ok(row.residues.length > 0, `${row.targetIndex}: residues`)
      const category = categories[row.category] ?? { residues: 0, units: 0 }
      category.units++
      category.residues += row.residues.length
      categories[row.category] = category
      const rowProofs = new Set()
      for (const residue of row.residues) {
        assert.equal(residue.length, 8, `${row.targetIndex}: residue tuple`)
        const [kind, value, start, end, baselineCount, targetOrdinal, proof, owners] =
          residue
        assert.ok(ALLOWED_PROOFS.has(proof), `${row.targetIndex}: proof ${proof}`)
        rowProofs.add(proof)
        proofs[proof] = (proofs[proof] ?? 0) + 1
        assert.ok(['bigint', 'number', 'property', 'regexp', 'string'].includes(kind))
        assert.notEqual(value, undefined)
        assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start)
        assert.ok(Number.isSafeInteger(baselineCount) && baselineCount >= 0)
        assert.ok(targetOrdinal > baselineCount, `${row.targetIndex}: target-added`)
        assert.ok(start >= row.target[1] && end <= row.target[2], `${row.targetIndex}: range`)
        assert.ok(Array.isArray(owners), `${row.targetIndex}: proof owners`)
        assert.ok(
          owners.every(owner => row.coverageOwners.includes(owner)),
          `${row.targetIndex}: proof owners are coverage owners`,
        )
      }
      const allowed = CATEGORY_PROOFS.get(row.category)
      assert.ok(
        [...rowProofs].every(proof => allowed.has(proof)),
        `${row.targetIndex}: category proof`,
      )
      if (row.category === 'semantic-correspondence') {
        assert.ok(row.witnessIds.length > 0, `${row.targetIndex}: witnesses`)
      } else {
        assert.equal(row.witnessIds, undefined, `${row.targetIndex}: no witnesses`)
      }
      if (
        row.category === 'exact-alternate-owner' ||
        row.category === 'exact-candidate-owner-cover'
      ) {
        assert.ok(
          row.alternateCandidateUniverse.length > 0,
          `${row.targetIndex}: candidate universe`,
        )
      } else {
        assert.equal(
          row.alternateCandidateUniverse,
          undefined,
          `${row.targetIndex}: no candidate universe`,
        )
      }
    }
    assert.deepEqual(categories, fixture.summary.categories)
    assert.deepEqual(proofs, fixture.summary.proofs)
    assert.equal(admitted.size, fixture.summary.units)
    assert.equal(
      fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
      fixture.summary.residues,
    )

    const partitions = [
      admitted,
      new Set(fixture.excludedUnsupportedTargetIndices),
      new Set(macro.rows.map(row => row.targetIndex)),
      new Set(exactOwner.rows.map(row => row.targetIndex)),
    ]
    const complete = new Set()
    for (const partition of partitions) {
      for (const targetIndex of partition) {
        assert.ok(!complete.has(targetIndex), `${targetIndex}: disjoint decision`)
        complete.add(targetIndex)
      }
    }
    assert.equal(complete.size, fixture.summary.inputUnits)
    assert.equal(
      fixture.summary.residues +
        fixture.summary.excludedResidues +
        fixture.summary.macroResidues +
        fixture.summary.exactOwnerResidues,
      fixture.summary.inputResidues,
    )
    assert.equal(macro.summary.units, fixture.summary.macroUnits)
    assert.equal(macro.summary.residues, fixture.summary.macroResidues)
    assert.equal(exactOwner.summary.units, fixture.summary.exactOwnerUnits)
    assert.equal(exactOwner.summary.residues, fixture.summary.exactOwnerResidues)
  })

  test(
    `${caseName} source AST and correspondence prove every admitted focused residue`,
    {
      skip: !historicalSourceSelected
        ? 'the exact historical semantic case/source root is required'
        : false,
    },
    async () => {
      for (const row of fixture.rows) {
        const residueIdentities = row.residues.map(residue =>
          identity(residue[0], residue[1]),
        )
        for (const residue of row.residues) {
          const [kind, value, start, end, , , proof, owners] = residue
          const residueIdentity = identity(kind, value)
          if (
            proof === 'direct-source-representation' ||
            proof === 'exact-alternate-source' ||
            proof === 'exact-candidate-source' ||
            proof === 'semantic-source'
          ) {
            assert.ok(owners.length > 0, `${row.targetIndex}: source proof owners`)
            for (const owner of owners) {
              const audit = await sourceAudit(owner)
              assert.ok(
                audit.identities.has(residueIdentity),
                `${row.targetIndex}: ${owner} exact ${residueIdentity}`,
              )
            }
          } else if (proof === 'runtime-import') {
            assert.ok(owners.length > 0, `${row.targetIndex}: import proof owners`)
            for (const owner of owners) {
              const audit = await sourceAudit(owner)
              assert.ok(
                audit.imports.has(String(value)),
                `${row.targetIndex}: ${owner} runtime import ${String(value)}`,
              )
            }
          } else if (proof === 'semantic-target-fragment') {
            assert.ok(
              row.witnessIds.some(id =>
                rangesForWitness(witnesses.get(id)).some(
                  range => range.start <= start && range.end >= end,
                ),
              ),
              `${row.targetIndex}: exact target-fragment witness`,
            )
          }
        }

        if (row.category === 'direct-owner-representation') {
          assert.deepEqual(row.coverageOwners, row.sourceMapOwners)
        } else if (row.category === 'exact-alternate-owner') {
          const exactMatches = []
          for (const owner of row.alternateCandidateUniverse) {
            if (row.sourceMapOwners.includes(owner)) continue
            const audit = await sourceAudit(owner)
            if (residueIdentities.every(value => audit.identities.has(value))) {
              exactMatches.push(owner)
            }
          }
          assert.deepEqual(
            exactMatches,
            row.coverageOwners,
            `${row.targetIndex}: unique complete alternate owner`,
          )
        } else if (row.category === 'exact-candidate-owner-cover') {
          const usedOwners = new Set()
          for (const residue of row.residues) {
            const residueIdentity = identity(residue[0], residue[1])
            const matches = []
            for (const owner of row.alternateCandidateUniverse) {
              const audit = await sourceAudit(owner)
              if (audit.identities.has(residueIdentity)) matches.push(owner)
            }
            assert.deepEqual(matches, residue[7], `${row.targetIndex}: exact candidate cover`)
            for (const owner of matches) usedOwners.add(owner)
          }
          assert.deepEqual(
            [...usedOwners].sort(),
            row.coverageOwners,
            `${row.targetIndex}: complete candidate owner union`,
          )
        } else if (row.category === 'semantic-correspondence') {
          for (const witnessId of row.witnessIds) {
            const witness = witnesses.get(witnessId)
            assert.ok(witness, `${row.targetIndex}: witness ${witnessId}`)
            assert.equal(
              witness.localizationBasis,
              'authenticated-behavior-test',
              `${row.targetIndex}: authenticated localization`,
            )
            assert.ok(
              rangesForWitness(witness).some(
                range => range.start < row.target[2] && range.end > row.target[1],
              ),
              `${row.targetIndex}: row-scoped witness ${witnessId}`,
            )
            for (const testId of witness.testIds) {
              const entry = catalog.get(testId)
              assert.ok(entry, `${row.targetIndex}: catalog test ${testId}`)
              const filename = path.join(repositoryRoot, entry.path)
              const expectedDescriptor =
                entry.path ===
                'recovery/test/recovery-2.1.121-direct-evidence.test.mjs'
                  ? {
                      bytes: 9811,
                      sha256:
                        '42ab6a027653eae552ce701906a3d156ff7b36e222159bb3fe0d7f711a465e4f',
                    }
                  : { bytes: entry.bytes, sha256: entry.sha256 }
              assert.deepEqual(
                fileDescriptor(filename),
                expectedDescriptor,
                `${row.targetIndex}: catalog test pin ${testId}`,
              )
            }
          }
          for (const residue of row.residues.filter(item => item[6] === 'semantic-source')) {
            for (const owner of residue[7]) {
              assert.ok(
                row.witnessIds.some(id => witnesses.get(id).sourcePaths.includes(owner)),
                `${row.targetIndex}: ${owner} localized by row witness`,
              )
            }
          }
        }
      }
    },
  )

  const baselinePath =
    process.env[bundleEnvironmentVariable(fixture.versions.baseline)]
  const targetPath = process.env[bundleEnvironmentVariable(fixture.versions.target)]
  test(
    `${caseName} authenticated bundles pin all focused occurrences and paired-local oracles`,
    {
      skip: !selected
        ? `not applicable to ${semanticCase}`
        : !baselinePath || !targetPath
          ? 'authenticated baseline and target inner bundles are required'
          : false,
      timeout: 90_000,
    },
    () => {
      const baselineBytes = fs.readFileSync(baselinePath)
      const targetBytes = fs.readFileSync(targetPath)
      assert.deepEqual(descriptor(baselineBytes), fixture.artifact.baselineInner)
      assert.deepEqual(descriptor(targetBytes), fixture.artifact.targetInner)
      const baselineText = baselineBytes.toString('utf8')
      const targetText = targetBytes.toString('utf8')
      const baselineSyntax = collectOccurrences(baselineText)
      const targetSyntax = collectOccurrences(targetText)
      for (const row of fixture.rows) {
        const [classification, start, end, nodeType, sourceHash] = row.target
        const region = structural.regions[row.targetIndex]
        assert.equal(region?.target?.index, row.targetIndex)
        assert.deepEqual(
          [
            region.classification,
            region.target.start,
            region.target.end,
            region.target.nodeType,
            region.target.sourceHash,
          ],
          row.target,
          `${row.targetIndex}: structural identity`,
        )
        assert.equal(classification, region.classification)
        const targetUnit = targetText.slice(start, end)
        assert.equal(sha256(Buffer.from(targetUnit)), sourceHash, `${row.targetIndex}: target bytes`)
        const targetUnitSyntax = collectOccurrences(targetUnit)
        assert.equal(targetUnitSyntax.ast.body.length, 1, `${row.targetIndex}: one target unit`)
        assert.equal(targetUnitSyntax.ast.body[0].type, nodeType, `${row.targetIndex}: node type`)

        for (const residue of row.residues) {
          const [kind, value, residueStart, residueEnd, baselineCount, targetOrdinal] =
            residue
          const residueIdentity = identity(kind, value)
          const baselineOccurrences = baselineSyntax.grouped.get(residueIdentity) ?? []
          const targetOccurrences = targetSyntax.grouped.get(residueIdentity) ?? []
          assert.equal(
            baselineOccurrences.length,
            baselineCount,
            `${row.targetIndex}: ${residueIdentity} baseline count`,
          )
          const occurrence = targetOccurrences[targetOrdinal - 1]
          assert.ok(occurrence, `${row.targetIndex}: ${residueIdentity} ordinal`)
          assert.deepEqual(
            [occurrence.start, occurrence.end],
            [residueStart, residueEnd],
            `${row.targetIndex}: ${residueIdentity} exact range`,
          )
        }

        if (row.category === 'paired-local-invariant') {
          const [
            baselineIndex,
            baselineStart,
            baselineEnd,
            baselineNodeType,
            baselineHash,
            pairReason,
          ] = row.baseline
          assert.equal(region.baselineUnitIndex, baselineIndex, `${row.targetIndex}: pair`)
          assert.equal(region.pairReason, pairReason, `${row.targetIndex}: pair reason`)
          const baselineUnit = baselineText.slice(baselineStart, baselineEnd)
          assert.equal(sha256(Buffer.from(baselineUnit)), baselineHash, `${row.targetIndex}: baseline bytes`)
          const baselineLocal = collectOccurrences(baselineUnit)
          assert.equal(baselineLocal.ast.body.length, 1, `${row.targetIndex}: one baseline unit`)
          assert.equal(baselineLocal.ast.body[0].type, baselineNodeType)
          for (const residue of row.residues) {
            const residueIdentity = identity(residue[0], residue[1])
            const before = (baselineLocal.grouped.get(residueIdentity) ?? []).length
            const after = (targetUnitSyntax.grouped.get(residueIdentity) ?? []).length
            assert.ok(before > 0, `${row.targetIndex}: paired local exists`)
            assert.equal(after, before, `${row.targetIndex}: paired local invariant`)
          }
        } else {
          assert.equal(row.baseline, undefined, `${row.targetIndex}: no baseline oracle`)
        }
      }
    },
  )
}
