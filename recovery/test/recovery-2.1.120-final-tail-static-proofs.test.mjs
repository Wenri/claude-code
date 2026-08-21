import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET120_FINAL_TAIL_DEPENDENCY_CORRECTIONS,
  TARGET120_FINAL_TAIL_EVIDENCE_IDS,
  TARGET120_FINAL_TAIL_OWNER_BEHAVIORS,
  TARGET120_FINAL_TAIL_OWNER_OVERRIDES,
} from '../cases/2.1.119-to-2.1.120/recovered/final-tail-static-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.119-to-2.1.120'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historicalSourceRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.120/src',
)
const forwardSourceRoot = path.join(
  repositoryRoot,
  'src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const baselinePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
    path.join(
      repositoryRoot,
      '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
    ),
)
const targetPath = path.resolve(
  process.env.CLAUDE_CODE_2_1_120_BUNDLE ??
    path.join(
      repositoryRoot,
      '.recovery-tmp/authenticated-artifacts/2.1.120-linux-x64/cli.inner.js',
    ),
)
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.120-final-tail-static-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '807621f55bb062ec234499564e7a2274e06107b9bbb535bfb2ffc8b29618271d'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function readGzipJson(input, label) {
  return JSON.parse(
    gunzipSync(
      readExact(path.join(repositoryRoot, input.path), input, label),
    ),
  )
}

function normalizedOwner(value) {
  const owner = value.replaceAll('\\', '/').replace(/^(\.\.\/)+/, '')
  return owner.startsWith('src/') ? owner : `src/${owner}`
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

function identity(kind, value) {
  return JSON.stringify([kind, value])
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

function positions(haystack, needle, start, end) {
  const result = []
  let offset = start
  while (true) {
    const found = haystack.indexOf(needle, offset)
    if (found === -1 || found >= end) return result
    result.push(found)
    offset = found + needle.length
  }
}

function structuralDescriptor(region) {
  return {
    classification: region.classification,
    nodeType: region.target.nodeType,
    start: region.target.start,
    end: region.target.end,
    bytes: region.target.end - region.target.start,
    sourceHash: region.target.sourceHash,
  }
}

function parseFragment(fragment, label) {
  assert.doesNotThrow(
    () =>
      parse(fragment, {
        allowHashBang: true,
        ecmaVersion: 'latest',
        sourceType: 'module',
      }),
    label,
  )
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
    } else if (ts.isNumericLiteral(node)) {
      add('number', Number(node.text.replaceAll('_', '')))
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

function sourceAudit(ts, selectedRoot, ownerPath) {
  const filename = path.join(selectedRoot, ownerPath.slice(4))
  assert.ok(fs.existsSync(filename), `${ownerPath}: selected source exists`)
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
  return { bytes, identities: collectSourceIdentities(ts, sourceFile), source }
}

function loadPinnedEvidence() {
  const baselineBytes = readExact(
    baselinePath,
    fixture.inputs.baselineBundle,
    'authenticated Target119 inner bundle',
  )
  const targetBytes = readExact(
    targetPath,
    fixture.inputs.targetBundle,
    'authenticated Target120 inner bundle',
  )
  const baselineStructural = readGzipJson(
    fixture.inputs.baselineStructural,
    'Target119 structural ledger',
  )
  const structural = readGzipJson(
    fixture.inputs.structural,
    'Target120 structural ledger',
  )
  const correspondence = readGzipJson(
    fixture.inputs.semanticCorrespondence,
    'Target120 semantic-correspondence ledger',
  )
  const report = JSON.parse(
    readExact(
      path.join(repositoryRoot, fixture.inputs.typedAudit.path),
      fixture.inputs.typedAudit,
      'Target120 canonical typed audit',
    ),
  )
  return {
    baselineBytes,
    baselineStructural,
    correspondence,
    report,
    structural,
    targetBytes,
  }
}

test('target120 final-tail static fixture and generator wiring are exact', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(
    fixture.status,
    'authenticated-dependency-and-exact-source-compiler-proof',
  )
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [18299, 22004],
  )
  assert.equal(fixture.rows.length, fixture.summary.units)
  assert.equal(
    fixture.rows.reduce((sum, row) => sum + row.residues, 0),
    fixture.summary.residues,
  )
  assert.deepEqual(
    TARGET120_FINAL_TAIL_DEPENDENCY_CORRECTIONS[18299],
    fixture.rows[0].coverage,
  )
  assert.deepEqual(
    TARGET120_FINAL_TAIL_OWNER_OVERRIDES,
    { 22004: ['src/main.tsx'] },
  )
  for (const row of fixture.rows) {
    assert.equal(
      row.behavior,
      TARGET120_FINAL_TAIL_OWNER_BEHAVIORS[row.targetIndex],
    )
    assert.deepEqual(
      row.coverage.evidenceIds,
      TARGET120_FINAL_TAIL_EVIDENCE_IDS[row.targetIndex],
    )
  }
  const sourceGroups = fixture.rows[1].sourceGroups
  const compilerGroups = fixture.rows[1].compilerGroups
  assert.equal(
    sourceGroups
      .filter(group => group.sourceSnapshot === 'historical')
      .flatMap(group => group.targetStarts).length,
    fixture.summary.directSourceAstResidues,
  )
  assert.equal(
    sourceGroups
      .filter(group => group.sourceSnapshot === 'forward')
      .flatMap(group => group.targetStarts).length,
    fixture.summary.forwardSourceAstResidues,
  )
  assert.equal(
    compilerGroups.flatMap(group => group.targetStarts).length,
    fixture.summary.compilerResidues,
  )
})

test(
  'target120 u18299 is the authenticated Agent SDK Query build input, not bridge source',
  { skip: selected ? false : 'another semantic case is selected' },
  () => {
    const row = fixture.rows[0]
    const evidence = loadPinnedEvidence()
    const baselineText = evidence.baselineBytes.toString('utf8')
    const targetText = evidence.targetBytes.toString('utf8')
    const baselineRegion = evidence.baselineStructural.regions.find(
      region => region.target.index === row.baselinePredecessor.targetIndex,
    )
    const targetRegion = evidence.structural.regions.find(
      region => region.target.index === row.targetIndex,
    )
    assert.ok(baselineRegion)
    assert.ok(targetRegion)
    assert.deepEqual(structuralDescriptor(baselineRegion), {
      classification: row.baselinePredecessor.classification,
      nodeType: row.baselinePredecessor.nodeType,
      start: row.baselinePredecessor.start,
      end: row.baselinePredecessor.end,
      bytes: row.baselinePredecessor.bytes,
      sourceHash: row.baselinePredecessor.sourceHash,
    })
    assert.deepEqual(structuralDescriptor(targetRegion), row.target)

    const baselineFragment = baselineText.slice(
      row.baselinePredecessor.start,
      row.baselinePredecessor.end,
    )
    const targetFragment = targetText.slice(row.target.start, row.target.end)
    assert.equal(sha256(Buffer.from(baselineFragment)), row.baselinePredecessor.sourceHash)
    assert.equal(sha256(Buffer.from(targetFragment)), row.target.sourceHash)
    parseFragment(baselineFragment, 'Target119 Agent SDK Query fragment parses')
    parseFragment(targetFragment, 'Target120 Agent SDK Query fragment parses')

    assert.deepEqual(
      positions(
        baselineText,
        row.sdkTag.value,
        row.baselinePredecessor.start - 300,
        row.baselinePredecessor.start,
      ),
      row.sdkTag.baselineOffsets,
    )
    assert.deepEqual(
      positions(
        targetText,
        row.sdkTag.value,
        row.target.start - 300,
        row.target.start,
      ),
      row.sdkTag.targetOffsets,
    )
    assert.equal(
      row.baselinePredecessor.start - row.sdkTag.baselineOffsets.at(-1),
      row.sdkTag.lastTagStartToRegionStartBytes,
    )
    assert.equal(
      row.target.start - row.sdkTag.targetOffsets.at(-1),
      row.sdkTag.lastTagStartToRegionStartBytes,
    )

    for (const [needle, count] of Object.entries(row.occurrenceCounts.baseline)) {
      assert.equal(occurrences(baselineFragment, needle), count, `baseline ${needle}`)
    }
    for (const [needle, count] of Object.entries(row.occurrenceCounts.target)) {
      assert.equal(occurrences(targetFragment, needle), count, `target ${needle}`)
    }
    assert.equal(
      row.occurrenceCounts.target.initConfig - row.occurrenceCounts.baseline.initConfig,
      2,
    )
    assert.equal(
      row.occurrenceCounts.target.surface - row.occurrenceCounts.baseline.surface,
      2,
    )

    const selectedRows = evidence.report.sourceRuntimeAddedOwnerResidueRows
      .filter(item => item.structural.index === row.targetIndex)
      .sort((left, right) => left.target.start - right.target.start)
    assert.equal(selectedRows.length, row.residues)
    assert.equal(
      sha256(JSON.stringify(selectedRows.map(item => residueIdentity(row.targetIndex, item)))),
      row.residueIdentitiesSha256,
    )
    assert.deepEqual(
      [...new Set(selectedRows.flatMap(item => item.ownerPaths).map(normalizedOwner))],
      row.priorOwnerPaths,
    )
    const groupStarts = row.groups.flatMap(group => group.targetStarts).sort((a, b) => a - b)
    assert.deepEqual(
      groupStarts,
      selectedRows.map(item => item.target.start),
    )
    for (const group of row.groups) {
      for (const marker of group.targetMarkers) {
        assert.ok(targetFragment.includes(marker), `${group.representation}: ${marker}`)
      }
    }
    const correspondence = evidence.correspondence.regions.find(
      region => region.index === row.targetIndex,
    )
    assert.equal(correspondence.ownership, 'mixed-candidate')
    assert.deepEqual(correspondence.exactSourcePaths, [])
    assert.ok(correspondence.candidateSourcePaths.includes(row.priorOwnerPaths[0]))
  },
)

test(
  'target120 u22004 exact main owner closes all residues with pinned source AST and compiler lineage',
  { skip: selected ? false : 'another semantic case is selected' },
  async () => {
    const row = fixture.rows[1]
    const evidence = loadPinnedEvidence()
    const targetText = evidence.targetBytes.toString('utf8')
    const targetRegion = evidence.structural.regions.find(
      region => region.target.index === row.targetIndex,
    )
    assert.ok(targetRegion)
    assert.deepEqual(structuralDescriptor(targetRegion), row.target)
    const targetFragment = targetText.slice(row.target.start, row.target.end)
    assert.equal(sha256(Buffer.from(targetFragment)), row.target.sourceHash)
    parseFragment(targetFragment, 'Target120 CLI entrypoint fragment parses')

    const correspondence = evidence.correspondence.regions.find(
      region => region.index === row.targetIndex,
    )
    assert.ok(correspondence)
    assert.equal(correspondence.ownership, row.semanticCorrespondence.ownership)
    assert.deepEqual(
      correspondence.exactSourcePaths,
      row.semanticCorrespondence.exactSourcePaths,
    )
    assert.deepEqual(
      {
        length: correspondence.targetRangeIndices.length,
        first: correspondence.targetRangeIndices[0],
        last: correspondence.targetRangeIndices.at(-1),
      },
      row.semanticCorrespondence.targetRangeIndices,
    )

    const selectedRows = evidence.report.sourceRuntimeAddedOwnerResidueRows
      .filter(item => item.structural.index === row.targetIndex)
      .sort((left, right) => left.target.start - right.target.start)
    assert.equal(selectedRows.length, row.residues)
    assert.equal(
      sha256(JSON.stringify(selectedRows.map(item => residueIdentity(row.targetIndex, item)))),
      row.residueIdentitiesSha256,
    )
    assert.deepEqual(
      [...new Set(selectedRows.flatMap(item => item.ownerPaths).map(normalizedOwner))],
      row.priorOwnerPaths,
    )
    const groups = [...row.sourceGroups, ...row.compilerGroups]
    const groupStarts = groups.flatMap(group => group.targetStarts).sort((a, b) => a - b)
    assert.deepEqual(
      groupStarts,
      selectedRows.map(item => item.target.start),
    )
    assert.equal(new Set(groupStarts).size, groupStarts.length)

    const ts = await loadTypeScript()
    const historicalDescriptors = new Map(
      fixture.inputs.historicalSources.map(source => [source.path, source]),
    )
    const forwardDescriptors = new Map(
      fixture.inputs.forwardSources.map(source => [source.path, source]),
    )
    for (const [sourcePath, expected] of historicalDescriptors) {
      readExact(
        path.join(historicalSourceRoot, sourcePath.slice(4)),
        expected,
        `${sourcePath}: exact Target120 historical source`,
      )
    }
    for (const [sourcePath, expected] of forwardDescriptors) {
      readExact(
        path.join(forwardSourceRoot, sourcePath.slice(4)),
        expected,
        `${sourcePath}: exact Target121 forward source`,
      )
    }

    const selectedOwner = sourceAudit(ts, sourceRoot, row.ownerPath)
    const sourceAudits = new Map()
    const auditFor = group => {
      const key = `${group.sourceSnapshot}:${group.sourcePath}`
      if (!sourceAudits.has(key)) {
        sourceAudits.set(
          key,
          sourceAudit(
            ts,
            group.sourceSnapshot === 'historical'
              ? historicalSourceRoot
              : forwardSourceRoot,
            group.sourcePath,
          ),
        )
      }
      return sourceAudits.get(key)
    }
    const residueByStart = new Map(selectedRows.map(item => [item.target.start, item]))
    for (const group of row.sourceGroups) {
      const source = auditFor(group)
      for (const marker of group.sourceMarkers) {
        assert.ok(source.source.includes(marker), `${group.representation}: ${marker}`)
      }
      for (const marker of group.targetMarkers) {
        assert.ok(targetFragment.includes(marker), `${group.representation}: ${marker}`)
      }
      for (const start of group.targetStarts) {
        const residue = residueByStart.get(start)
        assert.ok(residue, `${group.representation}: residue ${start}`)
        assert.ok(
          source.identities.has(identity(residue.literalKind, residue.value)),
          `${group.representation}: exact ${residue.literalKind} ${JSON.stringify(residue.value)} in ${group.sourcePath}`,
        )
      }
    }
    for (const group of row.compilerGroups) {
      for (const marker of group.sourceMarkers) {
        assert.ok(selectedOwner.source.includes(marker), `${group.representation}: ${marker}`)
      }
      for (const marker of group.targetMarkers) {
        assert.ok(targetFragment.includes(marker), `${group.representation}: ${marker}`)
      }
      for (const start of group.targetStarts) {
        assert.ok(residueByStart.has(start), `${group.representation}: residue ${start}`)
      }
    }
    assert.ok(
      selectedOwner.identities.has(identity('property', 'ultrareviewHandler')),
      'selected Target120 package source retains the direct dynamic-import owner',
    )
    for (const value of [
      '2.1.120',
      '2026-04-24T19:00:49Z',
      '080f07fb4224786b965b9ea0a35f0cff594f2eb6',
    ]) {
      assert.ok(!selectedOwner.source.includes(value), `${value}: build literal is not authored source`)
    }
  },
)
