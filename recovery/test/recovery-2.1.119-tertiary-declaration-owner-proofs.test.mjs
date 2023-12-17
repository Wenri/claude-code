import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_TERTIARY_DECLARATION_EVIDENCE_IDS,
  TARGET119_TERTIARY_DECLARATION_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/tertiary-declaration-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-tertiary-declaration-owner-proofs.json',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-tertiary-declaration-owner-proofs.mjs',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/tertiary-declaration-owner-overrides.mjs',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '1846c61ce847f5a29a03d6c7e5a2141e264535bfaa36b3935b0de1cdfc567967'
const BUILDER_SHA256 =
  'ad660936d2c77b81c72cec9d05908fe3215681688fe9b202ee199d9d8e998c4c'
const HELPER_SHA256 =
  'f484e54d9c4752bba0e157325ad32f138f4620ca29afdf9c85cf3e8dff2c68ce'

const SOURCE_UNIVERSE_PHASES = [
  {
    id: 'historical-target119',
    files: 2023,
    jsonBytes: 217234,
    sha256: 'fe0e513f8584f809b612e8f0e11f3c2bbcf45a5b70b0143c13769637d7b9307a',
  },
  {
    id: 'recovered-target119-package',
    files: 2024,
    jsonBytes: 217359,
    sha256: 'b0c92062b28f681fe84320874e61bf3479f6d8537fb8bff460c53b9199f0fde6',
  },
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function readExact(filename, expected, label = filename) {
  const value = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(value),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return value
}

function canonicalFlags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value,
  ])
}

function parseRegExp(text) {
  if (!text.startsWith('/')) return null
  let escaped = false
  let inClass = false
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index]
    if (escaped) escaped = false
    else if (character === '\\') escaped = true
    else if (character === '[') inClass = true
    else if (character === ']' && inClass) inClass = false
    else if (character === '/' && !inClass) {
      return {
        pattern: text.slice(1, index),
        flags: canonicalFlags(text.slice(index + 1)),
      }
    }
  }
  return null
}

function sourceFiles(directory, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(filename, relative))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative)
  }
  return files.sort()
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function statementName(ts, sourceFile, statement) {
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    return statement.name.text
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map(declaration => declaration.name.getText(sourceFile))
      .join(',')
  }
  return null
}

function sourceNodeValues(ts, sourceFile, node) {
  const values = new Map()
  function add(kind, value, sourceNode) {
    const key = identity(kind, value)
    const kinds = values.get(key) ?? new Set()
    kinds.add(ts.SyntaxKind[sourceNode.kind])
    values.set(key, kinds)
  }
  function visit(sourceNode) {
    if (
      ts.isStringLiteralLike(sourceNode) ||
      ts.isTemplateLiteralToken(sourceNode)
    ) {
      add('string', sourceNode.text, sourceNode)
    } else if (ts.isJsxText(sourceNode)) {
      const value = sourceNode.getText(sourceFile)
      if (value) add('string', value, sourceNode)
    } else if (ts.isNumericLiteral(sourceNode)) {
      add(
        'number',
        String(Number(sourceNode.text.replaceAll('_', ''))),
        sourceNode,
      )
    } else if (ts.isRegularExpressionLiteral(sourceNode)) {
      const value = parseRegExp(sourceNode.getText(sourceFile))
      if (value) add('regexp', value, sourceNode)
    }
    const namedProperty =
      (ts.isPropertyAssignment(sourceNode) ||
        ts.isShorthandPropertyAssignment(sourceNode) ||
        ts.isMethodDeclaration(sourceNode) ||
        ts.isPropertyDeclaration(sourceNode) ||
        ts.isPropertySignature(sourceNode) ||
        ts.isMethodSignature(sourceNode) ||
        ts.isGetAccessorDeclaration(sourceNode) ||
        ts.isSetAccessorDeclaration(sourceNode) ||
        ts.isBindingElement(sourceNode) ||
        ts.isJsxAttribute(sourceNode) ||
        ts.isImportSpecifier(sourceNode) ||
        ts.isExportSpecifier(sourceNode)) &&
      sourceNode.name &&
      ts.isIdentifier(sourceNode.name)
    const property = namedProperty
      ? sourceNode.name.text
      : ts.isPropertyAccessExpression(sourceNode) &&
          ts.isIdentifier(sourceNode.name)
        ? sourceNode.name.text
        : undefined
    if (property !== undefined) add('property', property, sourceNode)
    ts.forEachChild(sourceNode, visit)
  }
  visit(node)
  return values
}

function sourceScopes(ts, relative) {
  const filename = path.join(sourceRoot, relative)
  const bytes = fs.readFileSync(filename)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, relative)
  return {
    bytes,
    scopes: sourceFile.statements.map((statement, statementIndex) => {
      const start = statement.getStart(sourceFile)
      const end = statement.end
      return {
        statementIndex,
        name: statementName(ts, sourceFile, statement),
        kind: ts.SyntaxKind[statement.kind],
        start,
        end,
        sourceHash: sha256(source.slice(start, end)),
        text: source.slice(start, end),
        values: sourceNodeValues(ts, sourceFile, statement),
      }
    }),
  }
}

function targetOccurrences(source) {
  const occurrences = []
  function add(kind, value, node) {
    occurrences.push({
      key: identity(kind, value),
      start: node.start,
      end: node.end,
    })
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node)
      else if (typeof node.value === 'string') add('string', node.value, node)
      else if (typeof node.value === 'number') {
        add('number', String(node.value), node)
      }
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw, node)
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
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return occurrences
}

test(
  'Target119 tertiary declaration fixture and helper are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_TERTIARY_DECLARATION_EVIDENCE_IDS,
    )
    assert.deepEqual(
      fixture.ownerOverrides,
      TARGET119_TERTIARY_DECLARATION_OWNER_OVERRIDES,
    )
    assert.deepEqual(fixture.summary, {
      units: 6,
      residues: 9,
      sourceFiles: 5,
      targetIndicesSha256:
        'bb484709ce512d20e80316346fefe42017b36b5be6802a8311deae8788a6e338',
      residueIdentitiesSha256:
        '0475138acce33e2532be134ffa8bb6053c00e2aa656f7abddaf80a06148e0d0e',
    })
    const identities = fixture.rows.flatMap(row =>
      row.residues.map(residue => [
        row.targetIndex,
        residue.kind,
        residue.value,
        residue.start,
        residue.end,
        residue.baselineCount,
        residue.targetOrdinal,
      ]),
    )
    assert.equal(
      sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(identities)),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated Target119 target units retain every frozen residue',
  { skip: !selected },
  () => {
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural ledger',
        ),
      ),
    )
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    for (const row of fixture.rows) {
      const region = regions.get(row.targetIndex)
      assert(region, `u${row.targetIndex}`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          sourceHash: region.target.sourceHash,
        },
        row.target,
      )
      const unit = target.slice(row.target.start, row.target.end)
      assert.equal(sha256(unit), row.target.sourceHash)
      for (const marker of row.targetMarkers) assert(unit.includes(marker))
      const occurrences = targetOccurrences(unit)
      for (const residue of row.residues) {
        assert(
          occurrences.some(
            occurrence =>
              occurrence.key === identity(residue.kind, residue.value) &&
              occurrence.start + row.target.start === residue.start &&
              occurrence.end + row.target.start === residue.end,
          ),
          `u${row.targetIndex}:${residue.start}`,
        )
      }
    }
  },
)

test(
  'historical Target119 source has one exact declaration candidate per unit',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const audits = new Map(
      sourceFiles(sourceRoot).map(relative => [
        relative,
        sourceScopes(ts, relative),
      ]),
    )
    const sourceUniverseJson = JSON.stringify(
      [...audits].map(([relative, audit]) => [
        relative,
        audit.bytes.length,
        sha256(audit.bytes),
      ]),
    )
    const sourceUniverse = {
      files: audits.size,
      jsonBytes: Buffer.byteLength(sourceUniverseJson),
      sha256: sha256(sourceUniverseJson),
    }
    const sourcePhase = SOURCE_UNIVERSE_PHASES.find(
      candidate =>
        candidate.files === sourceUniverse.files &&
        candidate.jsonBytes === sourceUniverse.jsonBytes &&
        candidate.sha256 === sourceUniverse.sha256,
    )
    assert.ok(
      sourcePhase,
      `unrecognized Target119 source phase: ${JSON.stringify(sourceUniverse)}`,
    )
    assert.equal(
      SOURCE_UNIVERSE_PHASES[0].files,
      fixture.inputs.sourceUniverse.files,
    )
    for (const input of fixture.inputs.sourceFiles) {
      assert.deepEqual(
        descriptor(audits.get(input.path.replace(/^src\//, '')).bytes),
        { bytes: input.bytes, sha256: input.sha256 },
        input.path,
      )
    }
    for (const row of fixture.rows) {
      const keys = new Set(
        row.residues.map(residue => identity(residue.kind, residue.value)),
      )
      const candidates = []
      for (const [relative, audit] of audits) {
        for (const scope of audit.scopes) {
          if (
            row.sourceMarkers.every(marker => scope.text.includes(marker)) &&
            [...keys].every(key => scope.values.has(key))
          ) {
            candidates.push({ relative, scope })
          }
        }
      }
      assert.equal(candidates.length, 1, `u${row.targetIndex}`)
      const candidate = candidates[0]
      assert.equal(`src/${candidate.relative}`, row.sourceOwner)
      assert.deepEqual(
        {
          statementIndex: candidate.scope.statementIndex,
          kind: candidate.scope.kind,
          name: candidate.scope.name,
          start: candidate.scope.start,
          end: candidate.scope.end,
          bytes: candidate.scope.end - candidate.scope.start,
          sourceHash: candidate.scope.sourceHash,
        },
        row.declaration,
      )
      for (const residue of row.residues) {
        assert.deepEqual(
          [...candidate.scope.values.get(identity(residue.kind, residue.value))].sort(),
          residue.sourceKinds,
        )
      }
    }
  },
)

test(
  'Target119 tertiary declaration coverage evolves atomically',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            root,
            'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
    const states = new Set()
    for (const proof of fixture.rows) {
      const row = rows.get(proof.targetIndex)
      assert(row, `u${proof.targetIndex}`)
      const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
      const provisional =
        JSON.stringify(paths) === JSON.stringify(proof.priorOwnerPaths) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(['source-map-attribution', 'semantic-test'])
      const corrected =
        JSON.stringify(paths) === JSON.stringify([proof.sourceOwner]) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(fixture.evidenceIds) &&
        row.behavior === proof.behavior
      assert(provisional || corrected, `u${proof.targetIndex}`)
      states.add(corrected ? 'corrected' : 'provisional')
    }
    assert.equal(states.size, 1)
  },
)
