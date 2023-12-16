import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET120_COMPILER_TAIL_OWNER_BEHAVIORS,
  TARGET120_COMPILER_TAIL_OWNER_CORRECTIONS,
  TARGET120_COMPILER_TAIL_OWNER_OVERRIDES,
} from '../cases/2.1.119-to-2.1.120/recovered/compiler-tail-owner-overrides.mjs'

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
  new URL('./recovery-2.1.120-compiler-tail-owner-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'e4c55dba4a6bdaf5e622d7b5e935779c83eb1290b55c7bed1adb67fde2a614bf'

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

function occurrences(haystack, needle) {
  assert.ok(needle.length > 0)
  let count = 0
  let offset = 0
  while (true) {
    const found = haystack.indexOf(needle, offset)
    if (found === -1) return count
    count++
    offset = found + needle.length
  }
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
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
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

test('target120 compiler-tail owner fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(
    fixture.status,
    'authenticated-direct-owner-with-compiler-and-dce-residue-proof',
  )
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [2626, 14093, 16238, 19022, 19633, 19776],
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
  const compilerGroups = fixture.rows.flatMap(row => row.compilerGroups)
  const compilerStarts = compilerGroups.flatMap(group => group.targetStarts)
  assert.equal(compilerStarts.length, fixture.summary.compilerResidues)
  assert.equal(new Set(compilerStarts).size, compilerStarts.length)
  const representationCounts = {}
  for (const group of compilerGroups) {
    representationCounts[group.representation] =
      (representationCounts[group.representation] ?? 0) + group.targetStarts.length
    assert.ok(group.sourceMarkers.length > 0)
    assert.ok(group.targetMarkers.length > 0)
  }
  assert.deepEqual(representationCounts, fixture.summary.representationCounts)
  assert.deepEqual(
    Object.fromEntries(fixture.rows.map(row => [row.targetIndex, [row.ownerPath]])),
    TARGET120_COMPILER_TAIL_OWNER_OVERRIDES,
  )
  assert.deepEqual(
    Object.fromEntries(
      fixture.rows
        .filter(row => !row.priorOwnerPaths.includes(row.ownerPath))
        .map(row => [row.targetIndex, [row.ownerPath]]),
    ),
    TARGET120_COMPILER_TAIL_OWNER_CORRECTIONS,
  )
  assert.equal(
    Object.keys(TARGET120_COMPILER_TAIL_OWNER_CORRECTIONS).length,
    fixture.summary.ownerCorrections,
  )
  for (const row of fixture.rows) {
    assert.equal(
      row.behavior,
      TARGET120_COMPILER_TAIL_OWNER_BEHAVIORS[row.targetIndex],
    )
  }
})

test(
  'target120 compiler-tail owners close every authenticated residue with exact source AST or pinned compiler/DCE evidence',
  { skip: selected ? false : 'another semantic case is selected' },
  async () => {
    const targetBytes = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'authenticated target120 inner bundle',
    )
    const targetText = targetBytes.toString('utf8')
    for (const assertion of fixture.bundleAssertions) {
      assert.equal(
        occurrences(targetText, assertion.needle),
        assertion.count,
        `authenticated bundle occurrence count for ${assertion.needle}`,
      )
    }

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
    assert.equal(sha256(JSON.stringify([...indices])), fixture.summary.indicesSha256)
    assert.equal(
      sha256(
        JSON.stringify(
          residueRows.map(row => residueIdentity(row.structural.index, row)),
        ),
      ),
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
    const representationCounts = {}
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
      const compilerByStart = new Map()
      for (const group of fixtureRow.compilerGroups) {
        for (const marker of group.sourceMarkers) {
          assert.ok(
            sourceAudit(ts, sourceRoot, fixtureRow.ownerPath).source.includes(marker),
            `u${fixtureRow.targetIndex}: compiler source marker ${marker}`,
          )
        }
        for (const marker of group.targetMarkers) {
          assert.ok(
            targetUnit.includes(marker),
            `u${fixtureRow.targetIndex}: compiler target marker ${marker}`,
          )
        }
        for (const start of group.targetStarts) {
          assert.ok(!compilerByStart.has(start), `u${fixtureRow.targetIndex}: unique compiler start ${start}`)
          compilerByStart.set(start, group)
        }
      }
      const source = sourceAudit(ts, sourceRoot, fixtureRow.ownerPath)
      let rowSourceAstResidues = 0
      let rowCompilerResidues = 0
      for (const residue of selectedRows) {
        assert.ok(residue.target.start >= region.target.start)
        assert.ok(residue.target.end <= region.target.end)
        const exactOwnerMatches = (residue.sourceMatches ?? [])
          .map(normalizedOwner)
          .includes(fixtureRow.ownerPath)
        const compiler = compilerByStart.get(residue.target.start)
        if (compiler) {
          assert.ok(
            !exactOwnerMatches,
            `u${fixtureRow.targetIndex}: compiler residue has no exact owner-bound source match`,
          )
          compilerByStart.delete(residue.target.start)
          representationCounts[compiler.representation] =
            (representationCounts[compiler.representation] ?? 0) + 1
          rowCompilerResidues++
          continue
        }
        const hasSourceIdentity =
          source.identities.has(identity(residue.literalKind, residue.value)) ||
          (residue.literalKind === 'string' &&
            source.source.includes(residue.value))
        assert.ok(
          hasSourceIdentity,
          `u${fixtureRow.targetIndex}: ${residue.literalKind} ${JSON.stringify(residue.value)} exists in ${fixtureRow.ownerPath}`,
        )
        assert.ok(
          exactOwnerMatches,
          `u${fixtureRow.targetIndex}: typed audit binds the exact residue to ${fixtureRow.ownerPath}`,
        )
        rowSourceAstResidues++
      }
      assert.equal(compilerByStart.size, 0)
      assert.equal(rowSourceAstResidues, fixtureRow.sourceAstResidues)
      assert.equal(
        rowCompilerResidues,
        fixtureRow.compilerGroups.reduce(
          (sum, group) => sum + group.targetStarts.length,
          0,
        ),
      )
      sourceAstResidues += rowSourceAstResidues
      compilerResidues += rowCompilerResidues
    }
    assert.equal(sourceAstResidues, fixture.summary.sourceAstResidues)
    assert.equal(compilerResidues, fixture.summary.compilerResidues)
    assert.deepEqual(representationCounts, fixture.summary.representationCounts)
  },
)
