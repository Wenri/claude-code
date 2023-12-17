import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.116-target-added-residue-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
const structuralBytes = fs.readFileSync(
  path.join(caseRoot, 'structural/generated-delta.json.gz'),
)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 =
  '43dbf477f16096f6a0804349075ca19e9e43dc21042ba9b0c6025b41e3157381'
const ALLOWED_CATEGORIES = new Set([
  'build-metadata',
  'compiler-cache-slot',
  'compiler-import-lowering',
  'exact-alternate-owner',
  'paired-local-invariant',
])
const ALLOWED_PROOFS = new Set([
  'build-macro',
  'exact-alternate-source',
  'paired-local',
  'react-memo-cache',
  'runtime-import',
])
const CATEGORY_PROOFS = new Map([
  ['build-metadata', new Set(['build-macro'])],
  ['compiler-cache-slot', new Set(['react-memo-cache'])],
  ['compiler-import-lowering', new Set(['runtime-import'])],
  ['exact-alternate-owner', new Set(['exact-alternate-source'])],
  ['paired-local-invariant', new Set(['paired-local'])],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags].sort().join('')}`
  }
  return `${kind}:${kind === 'string' || kind === 'property' ? JSON.stringify(value) : String(value)}`
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
  const occurrences = []
  walk(ast, [], (node, ancestors) => {
    if (node.type === 'Literal') {
      let literalIdentity
      if (node.regex) {
        literalIdentity = identity('regexp', node.regex)
      } else if (typeof node.value === 'string') {
        literalIdentity = identity('string', node.value)
      } else if (typeof node.value === 'number') {
        literalIdentity = identity('number', node.value)
      } else if (node.bigint !== undefined) {
        literalIdentity = identity('bigint', node.bigint)
      }
      if (literalIdentity) {
        occurrences.push({
          ancestors,
          end: node.end,
          identity: literalIdentity,
          node,
          start: node.start,
        })
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') {
        occurrences.push({
          ancestors,
          end: node.end,
          identity: identity('string', value),
          node,
          start: node.start,
        })
      }
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
      occurrences.push({
        ancestors: [...ancestors, node],
        end: property.end,
        identity: identity('property', property.name),
        node: property,
        start: property.start,
      })
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

function assertBuildMacroOccurrence(occurrence, label) {
  const macroObjects = occurrence.ancestors.filter(ancestor => {
    if (ancestor.type !== 'ObjectExpression') return false
    const fields = objectFields(ancestor)
    return (
      fields.get('VERSION') === '2.1.116' &&
      fields.get('BUILD_TIME') === '2026-04-20T13:57:26Z' &&
      fields.get('GIT_SHA') === '9e176d0772418b8b88475d39fb86c651a12f4aad'
    )
  })
  assert.equal(macroObjects.length, 1, `${label}: one enclosing build macro`)
}

function assertMemoCacheOccurrence(occurrence, label) {
  assert.equal(occurrence.identity, 'property:"c"', `${label}: cache property`)
  const member = occurrence.ancestors.at(-1)
  const call = occurrence.ancestors.at(-2)
  const declaration = occurrence.ancestors.at(-3)
  assert.equal(member?.type, 'MemberExpression', `${label}: cache member`)
  assert.equal(member.computed, false, `${label}: noncomputed cache member`)
  assert.equal(member.property, occurrence.node, `${label}: exact cache property`)
  assert.equal(call?.type, 'CallExpression', `${label}: cache call`)
  assert.equal(call.callee, member, `${label}: cache call target`)
  assert.equal(call.arguments.length, 1, `${label}: cache size arity`)
  assert.equal(call.arguments[0].type, 'Literal', `${label}: literal cache size`)
  assert.ok(
    Number.isSafeInteger(call.arguments[0].value) &&
      call.arguments[0].value > 0,
    `${label}: positive cache size`,
  )
  assert.equal(
    declaration?.type,
    'VariableDeclarator',
    `${label}: assigned cache array`,
  )
  assert.equal(declaration.init, call, `${label}: exact cache initializer`)
  assert.equal(declaration.id.type, 'Identifier', `${label}: cache binding`)
}

function sourceFilename(owner) {
  const relative = owner.replace(/^src\//, '')
  const direct = path.join(sourceRoot, relative)
  const nested = path.join(sourceRoot, owner)
  const filename = fs.existsSync(direct) ? direct : nested
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
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${owner}: parses`)
  const imports = new Set()
  const namespaceImports = new Set()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const clause = statement.importClause
    if (clause.isTypeOnly) continue
    if (clause.name) imports.add('default')
    const named = clause.namedBindings
    if (named && ts.isNamespaceImport(named)) {
      namespaceImports.add(named.name.text)
    } else if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        if (!element.isTypeOnly) {
          imports.add(element.propertyName?.text ?? element.name.text)
        }
      }
    }
  }

  const identities = new Set()
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
        let line = lines[index]
        line = line.replace(/\t/g, ' ')
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

test('the target116 mechanized fixture is narrow, complete, and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    categories: {
      'build-metadata': { residues: 380, units: 58 },
      'exact-alternate-owner': { residues: 35, units: 6 },
      'paired-local-invariant': { residues: 70, units: 9 },
      'compiler-import-lowering': { residues: 3, units: 2 },
      'compiler-cache-slot': { residues: 2, units: 2 },
    },
    proofs: {
      'build-macro': 380,
      'exact-alternate-source': 35,
      'paired-local': 70,
      'runtime-import': 3,
      'react-memo-cache': 2,
    },
    residues: 490,
    units: 77,
    excludedUnits: 74,
  })

  const excluded = new Set(fixture.excludedUnsupportedTargetIndices)
  for (const targetIndex of [
    10175,
    10177,
    10789,
    10790,
    16049,
    19221,
    19706,
    19714,
  ]) {
    assert.ok(excluded.has(targetIndex), `${targetIndex}: explicit focused exclusion`)
  }

  const seen = new Set()
  for (const row of fixture.rows) {
    assert.ok(ALLOWED_CATEGORIES.has(row.category), `${row.targetIndex}: category`)
    assert.ok(!seen.has(row.targetIndex), `${row.targetIndex}: unique unit`)
    seen.add(row.targetIndex)
    assert.ok(!excluded.has(row.targetIndex), `${row.targetIndex}: not excluded`)
    assert.ok(row.residues.length > 0, `${row.targetIndex}: residues`)
    assert.deepEqual(
      [...new Set(row.coverageOwners)].sort(),
      [...row.coverageOwners].sort(),
      `${row.targetIndex}: unique coverage owners`,
    )

    const proofKinds = new Set()
    for (const residue of row.residues) {
      assert.equal(residue.length, 8, `${row.targetIndex}: residue tuple`)
      const [kind, value, start, end, baselineCount, targetOrdinal, proof, owners] =
        residue
      assert.ok(ALLOWED_PROOFS.has(proof), `${row.targetIndex}: proof ${proof}`)
      proofKinds.add(proof)
      assert.ok(['bigint', 'number', 'property', 'regexp', 'string'].includes(kind))
      assert.ok(value !== undefined)
      assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start)
      assert.ok(Number.isSafeInteger(baselineCount) && baselineCount >= 0)
      assert.ok(targetOrdinal > baselineCount, `${row.targetIndex}: target-added`)
      assert.ok(start >= row.target[1] && end <= row.target[2], `${row.targetIndex}: range`)
      assert.ok(Array.isArray(owners), `${row.targetIndex}: proof owners`)
      if (proof === 'runtime-import') {
        assert.ok(owners.length > 0, `${row.targetIndex}: import owner`)
        assert.ok(
          owners.every(owner => row.sourceMapOwners.includes(owner)),
          `${row.targetIndex}: import owner is attributed`,
        )
      } else if (proof === 'exact-alternate-source') {
        assert.deepEqual(owners, row.coverageOwners, `${row.targetIndex}: alternate owner`)
      } else {
        assert.deepEqual(owners, [], `${row.targetIndex}: owner-free static proof`)
      }
    }

    assert.deepEqual(
      proofKinds,
      CATEGORY_PROOFS.get(row.category),
      `${row.targetIndex}: category oracle`,
    )
    if (row.category === 'exact-alternate-owner') {
      assert.equal(row.coverageOwners.length, 1, `${row.targetIndex}: unique alternate`)
      assert.ok(
        Array.isArray(row.alternateCandidateUniverse) &&
          row.alternateCandidateUniverse.length > 0,
        `${row.targetIndex}: candidate universe`,
      )
      assert.deepEqual(
        [...new Set(row.alternateCandidateUniverse)].sort(),
        row.alternateCandidateUniverse,
        `${row.targetIndex}: sorted unique candidate universe`,
      )
      assert.ok(
        row.alternateCandidateUniverse.includes(row.coverageOwners[0]),
        `${row.targetIndex}: alternate belongs to candidate universe`,
      )
      assert.ok(
        !row.sourceMapOwners.includes(row.coverageOwners[0]),
        `${row.targetIndex}: genuinely alternate owner`,
      )
    } else {
      assert.equal(
        row.alternateCandidateUniverse,
        undefined,
        `${row.targetIndex}: no alternate candidate universe`,
      )
      assert.deepEqual(
        row.coverageOwners,
        row.sourceMapOwners,
        `${row.targetIndex}: retained source-map owner`,
      )
    }
  }
  assert.equal(seen.size, fixture.summary.units)
  assert.equal(seen.size + excluded.size, 151, 'every matrix unit is decided once')
})

test(
  'authored sources prove every admitted target116 import and exact alternate owner',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    for (const row of fixture.rows) {
      for (const residue of row.residues) {
        const [kind, value, , , , , proof, owners] = residue
        if (proof === 'runtime-import') {
          for (const owner of owners) {
            const audit = await sourceAudit(owner)
            assert.ok(
              audit.imports.has(String(value)),
              `${row.targetIndex}: ${owner} runtime import ${String(value)}`,
            )
          }
        } else if (proof === 'exact-alternate-source') {
          const residueIdentity = identity(kind, value)
          for (const owner of owners) {
            const audit = await sourceAudit(owner)
            assert.ok(
              audit.identities.has(residueIdentity),
              `${row.targetIndex}: ${owner} exact ${residueIdentity}`,
            )
          }
        }
      }
      if (row.category === 'exact-alternate-owner') {
        const residueIdentities = row.residues.map(residue =>
          identity(residue[0], residue[1]),
        )
        const exactMatches = []
        for (const candidate of row.alternateCandidateUniverse) {
          if (row.sourceMapOwners.includes(candidate)) continue
          const audit = await sourceAudit(candidate)
          if (
            residueIdentities.every(residueIdentity =>
              audit.identities.has(residueIdentity),
            )
          ) {
            exactMatches.push(candidate)
          }
        }
        assert.deepEqual(
          exactMatches,
          row.coverageOwners,
          `${row.targetIndex}: unique exact alternate after source-map owners are excluded`,
        )
      }
    }
  },
)

test(
  'authenticated inner bundles pin every admitted target-added residue and category oracle',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.114 and 2.1.116 inner bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), fixture.artifact.baselineInnerSha256)
    assert.equal(sha256(targetBytes), fixture.artifact.targetInnerSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const baselineSyntax = collectOccurrences(baseline)
    const targetSyntax = collectOccurrences(target)

    for (const row of fixture.rows) {
      const [classification, start, end, nodeType, sourceHash] = row.target
      const region = structural.regions[row.targetIndex]
      assert.equal(region?.target?.index, row.targetIndex, `${row.targetIndex}: structural row`)
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
      const targetUnit = target.slice(start, end)
      assert.equal(sha256(targetUnit), sourceHash, `${row.targetIndex}: target bytes`)
      const targetUnitSyntax = collectOccurrences(targetUnit)
      assert.equal(targetUnitSyntax.ast.body.length, 1, `${row.targetIndex}: one unit`)
      assert.equal(targetUnitSyntax.ast.body[0].type, nodeType, `${row.targetIndex}: node type`)

      for (const residue of row.residues) {
        const [kind, value, residueStart, residueEnd, baselineCount, targetOrdinal, proof] =
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
        assert.ok(targetOrdinal > baselineCount, `${row.targetIndex}: exact target-added ordinal`)
        if (proof === 'build-macro') {
          assertBuildMacroOccurrence(occurrence, `${row.targetIndex}: ${residueIdentity}`)
        } else if (proof === 'react-memo-cache') {
          assertMemoCacheOccurrence(occurrence, `${row.targetIndex}: ${residueIdentity}`)
        }
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
        const baselineUnit = baseline.slice(baselineStart, baselineEnd)
        assert.equal(sha256(baselineUnit), baselineHash, `${row.targetIndex}: baseline bytes`)
        const baselineLocal = collectOccurrences(baselineUnit)
        assert.equal(baselineLocal.ast.body.length, 1, `${row.targetIndex}: one baseline unit`)
        assert.equal(baselineLocal.ast.body[0].type, baselineNodeType)
        for (const residue of row.residues) {
          const residueIdentity = identity(residue[0], residue[1])
          const baselineLocalCount = (baselineLocal.grouped.get(residueIdentity) ?? []).length
          const targetLocalCount = (targetUnitSyntax.grouped.get(residueIdentity) ?? []).length
          assert.ok(baselineLocalCount > 0, `${row.targetIndex}: paired local exists`)
          assert.equal(
            targetLocalCount,
            baselineLocalCount,
            `${row.targetIndex}: paired local invariant`,
          )
        }
      } else {
        assert.equal(row.baseline, undefined, `${row.targetIndex}: no baseline oracle`)
      }
    }
  },
)
