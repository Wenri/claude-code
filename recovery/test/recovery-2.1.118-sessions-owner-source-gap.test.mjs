import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget118SessionsOwnerReplay,
  TARGET118_SESSIONS_OWNER_OVERRIDES,
  TARGET118_SESSIONS_SOURCE_FILE,
  TARGET118_SESSIONS_SOURCE_TREE,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-sessions-owner-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.118-sessions-owner-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'e41666a8bdd8113127d5d55356bf3e35153945968ef1199e41840c8e179b69cb'
const sourceRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.118/src',
)
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

function identity(kind, value) {
  return JSON.stringify([kind, value])
}

function normalizeResidue(row) {
  return {
    kind: row.literalKind,
    value: row.value,
    identitySha256: sha256(
      Buffer.from(JSON.stringify([row.literalKind, row.value])),
    ),
    start: row.target.start,
    end: row.target.end,
    baselineCount: row.baselineOccurrenceCount,
    targetOrdinal: row.targetOccurrenceNumber,
  }
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
  for (const occurrences of grouped.values()) {
    occurrences.sort((left, right) => left.start - right.start)
  }
  return { ast, grouped }
}

function acornClassSurface(unit) {
  const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
  assert.equal(ast.body.length, 1, 'complete target unit')
  assert.equal(ast.body[0].type, 'ClassDeclaration', 'target class unit')
  const fields = []
  const methods = []
  for (const member of ast.body[0].body.body) {
    const name =
      member.key?.type === 'Identifier' ||
      member.key?.type === 'PrivateIdentifier'
        ? member.key.name
        : member.key?.type === 'Literal'
          ? String(member.key.value)
          : undefined
    if (name === undefined) continue
    if (member.type === 'PropertyDefinition') fields.push(name)
    if (member.type === 'MethodDefinition') methods.push(name)
  }
  return { fields, methods }
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

function collectSourceIdentities(ts, declaration, sourceFile) {
  const identities = new Set()
  function add(kind, value) {
    identities.add(identity(kind, value))
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text)
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
        ts.isBindingElement(node)) &&
        node.name &&
        ts.isIdentifier(node.name)) ||
      (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name))
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property)
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return identities
}

function sourceClassAudit(ts, owner) {
  assert.match(owner, /^src\//, `${owner}: normalized owner`)
  const filename = path.resolve(sourceRoot, owner.slice(4))
  assert.ok(
    filename.startsWith(`${path.resolve(sourceRoot)}${path.sep}`),
    `${owner}: source path is bounded`,
  )
  if (!fs.existsSync(filename)) return null
  const bytes = fs.readFileSync(filename)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${owner}: parses`)
  const matches = []
  function find(node) {
    if (
      ts.isClassDeclaration(node) &&
      declarationName(ts, node) === 'SessionsWebSocket'
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, find)
  }
  find(sourceFile)
  if (matches.length !== 1) {
    return { file: { bytes: bytes.length, sha256: sha256(bytes) }, matches }
  }
  const declaration = matches[0]
  const declarationText = source.slice(
    declaration.getStart(sourceFile),
    declaration.end,
  )
  const explicitFields = []
  const parameterFields = []
  const methods = []
  for (const member of declaration.members) {
    if (ts.isPropertyDeclaration(member) && member.name) {
      explicitFields.push(declarationName(ts, member))
    } else if (ts.isConstructorDeclaration(member)) {
      for (const parameter of member.parameters) {
        if (
          parameter.modifiers?.some(modifier =>
            [
              ts.SyntaxKind.PrivateKeyword,
              ts.SyntaxKind.ProtectedKeyword,
              ts.SyntaxKind.PublicKeyword,
              ts.SyntaxKind.ReadonlyKeyword,
            ].includes(modifier.kind),
          ) &&
          ts.isIdentifier(parameter.name)
        ) {
          parameterFields.push(parameter.name.text)
        }
      }
      methods.push('constructor')
    } else if (ts.isMethodDeclaration(member) && member.name) {
      methods.push(declarationName(ts, member))
    }
  }
  return {
    file: { bytes: bytes.length, sha256: sha256(bytes) },
    matches,
    declaration: {
      kind: 'ClassDeclaration',
      name: 'SessionsWebSocket',
      start: declaration.getStart(sourceFile),
      end: declaration.end,
      bytes: Buffer.byteLength(declarationText),
      sha256: sha256(declarationText),
    },
    surface: {
      fields: [...parameterFields, ...explicitFields],
      methods,
    },
    identities: collectSourceIdentities(ts, declaration, sourceFile),
  }
}

function readCoverage() {
  const filename = path.join(
    repositoryRoot,
    'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
  )
  const coverage = JSON.parse(gunzipSync(fs.readFileSync(filename)))
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.proof.targetIndex,
  )
  assert.ok(row, `u${fixture.proof.targetIndex}: coverage row`)
  const owners = new Map(
    coverage.owners.map(owner => [owner.id, owner.path]),
  )
  return {
    row,
    ownerPaths: row.ownerIds.map(ownerId => {
      const owner = owners.get(ownerId)
      assert.ok(owner, `u${fixture.proof.targetIndex}: coverage owner`)
      return owner
    }),
  }
}

test(
  '2.1.118 Sessions owner-replay fixture and helper are fail closed',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.criterion,
      'target118-complete-class-exact-source-owner-v1',
    )
    assert.equal(fixture.status, 'case-owned-owner-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 110,
      uniqueResidueIdentities: 62,
      exactSourceDeclarations: 1,
      rejectedCoarseOwners: 1,
    })
    assert.deepEqual(TARGET118_SESSIONS_SOURCE_TREE, fixture.inputs.sourceTree)
    assert.deepEqual(
      TARGET118_SESSIONS_SOURCE_FILE,
      {
        path: fixture.replay.sourceFile.path,
        bytes: fixture.replay.sourceFile.bytes,
        sha256: fixture.replay.sourceFile.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_SESSIONS_OWNER_OVERRIDES,
      [fixture.replay.ownerOverride],
    )
    readExact(
      path.join(repositoryRoot, fixture.replay.helper.path),
      fixture.replay.helper,
      'owner replay helper',
    )
    readExact(
      path.join(repositoryRoot, fixture.inputs.structural.path),
      fixture.inputs.structural,
      'structural ledger',
    )

    const first = applyTarget118SessionsOwnerReplay({ sourceRoot })
    const second = applyTarget118SessionsOwnerReplay({ sourceRoot })
    assert.equal(first.status, 'already-represented')
    assert.deepEqual(second, first, 'owner replay is idempotent')
    assert.deepEqual(first.before, first.after, 'owner replay does not mutate')
    assert.equal(first.ownerOverrides, 1)
  },
)

test(
  '2.1.118 complete Sessions class and all 110 typed residues authenticate',
  { skip: !selected },
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
    const structural = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.inputs.structural.path),
        ),
      ),
    )
    const region = structural.regions.find(
      row => row.target.index === fixture.proof.targetIndex,
    )
    assert.ok(region, `u${fixture.proof.targetIndex}: structural region`)
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
      fixture.proof.target,
    )
    const target = targetBytes.toString('utf8')
    const unit = target.slice(fixture.proof.target.start, fixture.proof.target.end)
    assert.equal(Buffer.byteLength(unit), fixture.proof.target.bytes)
    assert.equal(sha256(unit), fixture.proof.target.sourceHash)
    assert.deepEqual(
      acornClassSurface(unit),
      fixture.proof.targetClassSurface,
      'complete target class surface',
    )

    const baselineSyntax = collectBundleOccurrences(
      baselineBytes.toString('utf8'),
    )
    const targetSyntax = collectBundleOccurrences(target)
    for (const residue of fixture.proof.residues) {
      assert.equal(
        sha256(Buffer.from(identity(residue.kind, residue.value))),
        residue.identitySha256,
      )
      const key = identity(residue.kind, residue.value)
      assert.equal(
        (baselineSyntax.grouped.get(key) ?? []).length,
        residue.baselineCount,
        `${key}: baseline occurrence count`,
      )
      const occurrence =
        (targetSyntax.grouped.get(key) ?? [])[residue.targetOrdinal - 1]
      assert.ok(occurrence, `${key}: target ordinal`)
      assert.deepEqual(
        [occurrence.start, occurrence.end],
        [residue.start, residue.end],
        `${key}: target range`,
      )
      assert.ok(residue.start >= fixture.proof.target.start)
      assert.ok(residue.end <= fixture.proof.target.end)
    }
    assert.equal(
      sha256(Buffer.from(JSON.stringify(fixture.proof.residues))),
      fixture.proof.residueIdentitiesSha256,
    )
  },
)

test(
  '2.1.118 source AST uniquely proves the Sessions class owner',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const audits = new Map(
      fixture.proof.candidateUniverse.map(owner => [
        owner,
        sourceClassAudit(ts, owner),
      ]),
    )
    const exactOwners = [...audits]
      .filter(([, audit]) => audit?.matches?.length === 1)
      .map(([owner]) => owner)
    assert.deepEqual(
      exactOwners,
      [fixture.replay.ownerOverride.paths[0]],
      'candidate universe has one exact named class declaration',
    )
    const audit = audits.get(fixture.replay.ownerOverride.paths[0])
    assert.ok(audit)
    assert.deepEqual(audit.file, fixture.replay.sourceFile.file)
    assert.deepEqual(audit.declaration, fixture.replay.sourceFile.declaration)
    assert.deepEqual(audit.surface, fixture.replay.sourceFile.surface)
    assert.deepEqual(
      audit.surface,
      fixture.proof.targetClassSurface,
      'historical declaration and complete target class expose the same fields and methods',
    )
    for (const residue of fixture.proof.residues) {
      assert.ok(
        audit.identities.has(identity(residue.kind, residue.value)),
        `${identity(residue.kind, residue.value)}: declaration-local AST identity`,
      )
    }
    assert.deepEqual(fixture.proof.provisionalOwnerPaths, [
      'components/PromptInput/PromptInput.tsx',
    ])
    assert.equal(
      audits.get('src/components/PromptInput/PromptInput.tsx').matches.length,
      0,
      'coarse PromptInput neighbor has no SessionsWebSocket declaration',
    )
  },
)

test(
  '2.1.118 Sessions owner coverage evolves only from the pinned provisional row to the exact correction',
  { skip: !selected },
  () => {
    const { row, ownerPaths } = readCoverage()
    assert.deepEqual(
      {
        start: row.start,
        end: row.end,
        nodeType: row.nodeType,
        sourceHash: row.sourceHash,
      },
      {
        start: fixture.proof.target.start,
        end: fixture.proof.target.end,
        nodeType: fixture.proof.target.nodeType,
        sourceHash: fixture.proof.target.sourceHash,
      },
    )
    assert.equal(row.disposition, 'source-runtime-covered')
    const provisional =
      JSON.stringify(ownerPaths) ===
        JSON.stringify(
          fixture.proof.provisionalOwnerPaths.map(owner => `src/${owner}`),
        ) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(ownerPaths) ===
        JSON.stringify(fixture.replay.ownerOverride.paths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.replay.ownerOverride.evidenceIds)
    assert.ok(provisional || corrected, 'exact provisional or corrected state')

    const reportPath = path.join(
      repositoryRoot,
      '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
    )
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath))
      const liveRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
        candidate => candidate.structural.index === fixture.proof.targetIndex,
      )
      const correctedScannerResidues = fixture.proof.residues.filter(
        residue =>
          residue.kind === 'property' &&
          residue.value === 'frames' &&
          residue.start === 11954654 &&
          residue.end === 11954660 &&
          residue.targetOrdinal === 17,
      )
      assert.equal(correctedScannerResidues.length, 1)
      assert.deepEqual(
        liveRows.map(normalizeResidue),
        corrected ? correctedScannerResidues : fixture.proof.residues,
        corrected
          ? 'exact authenticated post-correction scanner residual'
          : 'exact authenticated pre-correction residue identities',
      )
    }
  },
)
