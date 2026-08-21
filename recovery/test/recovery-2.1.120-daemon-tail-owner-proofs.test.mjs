import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET120_DAEMON_TAIL_OWNER_BEHAVIORS,
  TARGET120_DAEMON_TAIL_OWNER_OVERRIDES,
} from '../cases/2.1.119-to-2.1.120/recovered/daemon-tail-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.119-to-2.1.120'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historicalSourceRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.120/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const targetPath = path.resolve(
  process.env.CLAUDE_CODE_2_1_120_BUNDLE ??
    path.join(
      repositoryRoot,
      '.recovery-tmp/authenticated-artifacts/2.1.120-linux-x64/cli.inner.js',
    ),
)
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.120-daemon-tail-owner-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '6ef89b8c7b44998fe4c460dddd624d9ec782f5bde5fc2701db8705c7c4871aee'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, label)
  return bytes
}

function normalizedOwner(value) {
  const owner = value.replaceAll('\\', '/').replace(/^(\.\.\/)+/, '')
  return owner.startsWith('src/') ? owner : `src/${owner}`
}

function flags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: flags(value.flags) }
      : value,
  ])
}

function residueIdentity(targetIndex, residue) {
  return [
    targetIndex,
    residue.literalKind,
    residue.value,
    residue.target.start,
    residue.target.end,
    residue.baselineOccurrenceCount,
    residue.targetOccurrenceNumber,
  ]
}

function compilerIdentity(residue) {
  return JSON.stringify([
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ])
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(fs.existsSync(filename), 'the repository-pinned TypeScript compiler exists')
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

function collectSourceIdentities(ts, sourceFile) {
  const values = new Set()
  const add = (kind, value) => values.add(identity(kind, value))
  function visit(node) {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateLiteralToken(node)
    ) {
      add('string', node.text)
    } else if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile)
      if (value) add('string', value)
    } else if (ts.isNumericLiteral(node)) {
      add('number', Number(node.text.replaceAll('_', '')))
    } else if (ts.isBigIntLiteral(node)) {
      add('bigint', node.text.replace(/n$/, ''))
    } else if (ts.isRegularExpressionLiteral(node)) {
      const match = /^\/(.*)\/([a-z]*)$/s.exec(node.text)
      if (match) add('regexp', { pattern: match[1], flags: match[2] })
    }

    const namedProperty =
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isJsxAttribute(node) ||
        ts.isImportSpecifier(node) ||
        ts.isExportSpecifier(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    const property = namedProperty
      ? node.name.text
      : ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return values
}

function sourceAudit(ts, selectedSourceRoot, ownerPath) {
  const filename = path.join(selectedSourceRoot, ownerPath.slice(4))
  assert.ok(fs.existsSync(filename), `${ownerPath}: selected owner exists`)
  const bytes = fs.readFileSync(filename)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${ownerPath}: source parses`)
  return {
    identities: collectSourceIdentities(ts, sourceFile),
    source,
  }
}

test('target120 daemon-tail owner fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(
    fixture.status,
    'authenticated-direct-owner-with-compiler-residue-proof',
  )
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [18695, 18705, 19467, 19531],
  )
  assert.equal(fixture.rows.length, fixture.summary.units)
  assert.equal(
    fixture.rows.reduce((sum, row) => sum + row.residues, 0),
    fixture.summary.residues,
  )
  assert.equal(
    fixture.rows.reduce((sum, row) => sum + row.sourceAstResidues, 0),
    fixture.summary.sourceAstResidues,
  )
  const compilerResidues = fixture.rows.flatMap(row => row.compilerResidues)
  assert.equal(compilerResidues.length, fixture.summary.compilerResidues)
  assert.equal(
    compilerResidues.filter(
      residue => residue.representation === 'build-metadata-object-expansion',
    ).length,
    fixture.summary.buildMetadataResidues,
  )
  assert.equal(
    compilerResidues.filter(
      residue => residue.representation !== 'build-metadata-object-expansion',
    ).length,
    fixture.summary.concatenationResidues,
  )
  assert.deepEqual(
    Object.fromEntries(
      fixture.rows.map(row => [row.targetIndex, [row.ownerPath]]),
    ),
    TARGET120_DAEMON_TAIL_OWNER_OVERRIDES,
  )
  for (const row of fixture.rows) {
    assert.equal(
      row.behavior,
      TARGET120_DAEMON_TAIL_OWNER_BEHAVIORS[row.targetIndex],
    )
    assert.ok(!row.priorOwnerPaths.includes(row.ownerPath))
    assert.equal(
      new Set(row.compilerResidues.map(compilerIdentity)).size,
      row.compilerResidues.length,
    )
  }
})

test(
  'target120 daemon-tail owners close every authenticated residue with exact source AST or pinned compiler evidence',
  { skip: selected ? false : 'another semantic case is selected' },
  async () => {
    const targetBytes = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'authenticated target120 inner bundle',
    )
    const targetText = targetBytes.toString('utf8')
    const structuralBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structural.path),
      {
        bytes: fixture.inputs.structural.bytes,
        sha256: fixture.inputs.structural.sha256,
      },
      'target120 structural ledger',
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const structuralByIndex = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    const reportBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.typedAudit.path),
      {
        bytes: fixture.inputs.typedAudit.bytes,
        sha256: fixture.inputs.typedAudit.sha256,
      },
      'target120 canonical typed audit',
    )
    const report = JSON.parse(reportBytes)
    const indices = new Set(fixture.rows.map(row => row.targetIndex))
    const residueRows = report.sourceRuntimeAddedOwnerResidueRows
      .filter(row => indices.has(row.structural.index))
      .sort(
        (left, right) =>
          left.structural.index - right.structural.index ||
          left.target.start - right.target.start,
      )
    assert.equal(residueRows.length, fixture.summary.residues)
    assert.equal(
      sha256(JSON.stringify([...indices])),
      fixture.summary.indicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(residueRows.map(row => residueIdentity(row.structural.index, row)))),
      fixture.summary.residueIdentitiesSha256,
    )

    const historicalDescriptors = new Map(
      fixture.inputs.sourceFiles.map(source => [source.path, source]),
    )
    for (const [ownerPath, expected] of historicalDescriptors) {
      readExact(
        path.join(historicalSourceRoot, ownerPath.slice(4)),
        { bytes: expected.bytes, sha256: expected.sha256 },
        `${ownerPath}: exact historical source`,
      )
    }

    const ts = await loadTypeScript()
    let sourceAstResidues = 0
    let compilerResidues = 0
    for (const fixtureRow of fixture.rows) {
      const region = structuralByIndex.get(fixtureRow.targetIndex)
      assert.ok(region, `u${fixtureRow.targetIndex}: structural region`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          sourceHash: region.target.sourceHash,
        },
        fixtureRow.target,
      )
      const targetUnit = targetText.slice(region.target.start, region.target.end)
      assert.equal(
        sha256(Buffer.from(targetUnit)),
        fixtureRow.target.sourceHash,
        `u${fixtureRow.targetIndex}: authenticated target fragment`,
      )
      parse(targetUnit, {
        allowHashBang: true,
        ecmaVersion: 'latest',
        sourceType: 'module',
      })

      const selectedRows = residueRows.filter(
        row => row.structural.index === fixtureRow.targetIndex,
      )
      assert.equal(selectedRows.length, fixtureRow.residues)
      assert.deepEqual(
        [...new Set(selectedRows.flatMap(row => row.ownerPaths).map(normalizedOwner))],
        fixtureRow.priorOwnerPaths,
      )
      const compilerByIdentity = new Map(
        fixtureRow.compilerResidues.map(residue => [compilerIdentity(residue), residue]),
      )
      const source = sourceAudit(ts, sourceRoot, fixtureRow.ownerPath)
      let rowSourceAstResidues = 0
      let rowCompilerResidues = 0
      for (const residue of selectedRows) {
        assert.ok(residue.target.start >= region.target.start)
        assert.ok(residue.target.end <= region.target.end)
        const key = compilerIdentity({
          kind: residue.literalKind,
          value: residue.value,
          start: residue.target.start,
          end: residue.target.end,
          baselineCount: residue.baselineOccurrenceCount,
          targetOrdinal: residue.targetOccurrenceNumber,
        })
        const compiler = compilerByIdentity.get(key)
        if (compiler) {
          assert.ok(
            [
              'build-metadata-object-expansion',
              'constant-string-concatenation',
              'template-literal-segmentation',
            ].includes(compiler.representation),
          )
          assert.ok(
            !source.identities.has(identity(residue.literalKind, residue.value)),
            `u${fixtureRow.targetIndex}: compiler residue is not an exact source AST identity`,
          )
          for (const marker of compiler.sourceMarkers) {
            assert.ok(
              source.source.includes(marker),
              `u${fixtureRow.targetIndex}: compiler source marker ${marker}`,
            )
          }
          compilerByIdentity.delete(key)
          rowCompilerResidues++
          continue
        }
        assert.ok(
          source.identities.has(identity(residue.literalKind, residue.value)),
          `u${fixtureRow.targetIndex}: ${residue.literalKind} ${JSON.stringify(residue.value)} exists in ${fixtureRow.ownerPath}`,
        )
        assert.ok(
          (residue.sourceMatches ?? [])
            .map(normalizedOwner)
            .includes(fixtureRow.ownerPath),
          `u${fixtureRow.targetIndex}: typed audit binds the exact residue to ${fixtureRow.ownerPath}`,
        )
        rowSourceAstResidues++
      }
      assert.equal(compilerByIdentity.size, 0)
      assert.equal(rowSourceAstResidues, fixtureRow.sourceAstResidues)
      assert.equal(rowCompilerResidues, fixtureRow.compilerResidues.length)
      sourceAstResidues += rowSourceAstResidues
      compilerResidues += rowCompilerResidues
    }
    assert.equal(sourceAstResidues, fixture.summary.sourceAstResidues)
    assert.equal(compilerResidues, fixture.summary.compilerResidues)
  },
)
