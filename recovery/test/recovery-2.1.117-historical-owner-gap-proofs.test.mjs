import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget117GeneratedOwnerRecovery,
  TARGET117_GENERATED_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-generated-owner-source-gaps.mjs'
import {
  applyTarget117HistoricalOwnerSourceGapRecovery,
  TARGET117_HISTORICAL_GAP_INPUT_FILES,
  TARGET117_HISTORICAL_GAP_NEW_FILES,
  TARGET117_HISTORICAL_GAP_OUTPUT_FILES,
  TARGET117_HISTORICAL_GAP_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-historical-owner-source-gaps.mjs'
import { summarizeSourceTree } from '../scripts/verify-source-lineage.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-historical-owner-gap-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'abb3b2920fcb8277fd3a3f1a0cdea6b75aacb610032d6500724ad05f3b955444'
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

function publicTree(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function materializeRawTargetSource(commit) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target117-historical-owner-gaps-'),
  )
  const archive = path.join(temporaryRoot, 'source.tar')
  execFileSync(
    'git',
    ['archive', '--format=tar', `--output=${archive}`, commit, 'src'],
    { cwd: repositoryRoot, stdio: 'ignore' },
  )
  execFileSync('tar', ['-xf', archive, '-C', temporaryRoot], {
    stdio: 'ignore',
  })
  fs.unlinkSync(archive)
  return { temporaryRoot, sourceRoot: path.join(temporaryRoot, 'src') }
}

function sourceFilename(root, owner) {
  assert.match(owner, /^src\//, `${owner}: normalized source path`)
  const filename = path.resolve(root, owner.slice(4))
  assert.ok(
    filename.startsWith(`${path.resolve(root)}${path.sep}`),
    `${owner}: remains below source root`,
  )
  return filename
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
    if (node.type === 'Literal' && node.regex) {
      add('regexp', { pattern: node.regex.pattern, flags: node.regex.flags }, node)
    } else if (node.type === 'Literal' && typeof node.value === 'string') {
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

function declarationName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (node.name && ts.isStringLiteralLike(node.name)) return node.name.text
  return undefined
}

function findNamedDeclaration(ts, sourceFile, expectedName) {
  const matches = []
  function visit(node) {
    if (declarationName(ts, node) === expectedName) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
}

function collectSourceIdentities(ts, declaration) {
  const counts = new Map()
  function add(kind, value) {
    const key = identity(kind, value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      add('string', node.text)
    } else if (
      [
        ts.SyntaxKind.TemplateHead,
        ts.SyntaxKind.TemplateMiddle,
        ts.SyntaxKind.TemplateTail,
      ].includes(node.kind)
    ) {
      add('string', node.text)
    } else if (ts.isRegularExpressionLiteral(node)) {
      const match = /^\/(.*)\/([a-z]*)$/s.exec(node.text)
      assert.ok(match, `regular expression literal ${node.text}`)
      add('regexp', { pattern: match[1], flags: match[2] })
    }
    if (
      ts.isIdentifier(node) &&
      ((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
        (ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
        (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) ||
        (ts.isBindingElement(node.parent) && node.parent.name === node) ||
        (ts.isPropertySignature(node.parent) && node.parent.name === node))
    ) {
      add('property', node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return counts
}

function parseNamedSource(ts, root, row) {
  const filename = sourceFilename(root, row.owner)
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${row.owner}: parses`)
  const declaration = findNamedDeclaration(ts, sourceFile, row.declaration)
  return { source, sourceFile, declaration, identities: collectSourceIdentities(ts, declaration) }
}

function residueCounts(row) {
  const counts = new Map()
  for (const [kind, value] of row.residues) {
    const key = identity(kind, value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function assertDeclarationCoversRow(ts, root, row) {
  const proof = parseNamedSource(ts, root, row)
  for (const [key, expectedCount] of residueCounts(row)) {
    assert.ok(
      (proof.identities.get(key) ?? 0) >= expectedCount,
      `u${row.targetIndex} ${row.owner}#${row.declaration}: ${key} count`,
    )
  }
  return proof
}

test(
  '2.1.117 historical-owner fixture is complete and pins fail-closed replay inputs',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      clusterUnits: 26,
      clusterResidues: 79,
      historicalGapUnits: 20,
      historicalGapResidues: 66,
      currentExtractedOwnerUnits: 5,
      currentExtractedOwnerResidues: 12,
      rejectedPost117Coincidences: 1,
      replayExistingFiles: 15,
      replayNewFiles: 2,
      ownerOverrides: 20,
    })
    assert.equal(fixture.targets.length, fixture.summary.clusterUnits)
    assert.equal(fixture.historicalGaps.length, fixture.summary.historicalGapUnits)
    assert.equal(
      fixture.historicalGaps.flatMap(row => row.residues).length,
      fixture.summary.historicalGapResidues,
    )
    assert.equal(
      fixture.currentExtractedOwners.flatMap(row => row.residues).length,
      fixture.summary.currentExtractedOwnerResidues,
    )
    assert.equal(TARGET117_HISTORICAL_GAP_INPUT_FILES.length, 15)
    assert.equal(TARGET117_HISTORICAL_GAP_OUTPUT_FILES.length, 15)
    assert.equal(TARGET117_HISTORICAL_GAP_NEW_FILES.length, 2)
    assert.equal(TARGET117_HISTORICAL_GAP_OVERRIDES.length, 20)
    assert.deepEqual(
      TARGET117_HISTORICAL_GAP_OVERRIDES.map(row => row.targetIndex),
      fixture.historicalGaps.map(row => row.targetIndex),
    )
    assert.equal(
      new Set(TARGET117_HISTORICAL_GAP_OVERRIDES.map(row => row.key)).size,
      20,
    )
    for (const override of TARGET117_HISTORICAL_GAP_OVERRIDES) {
      assert.deepEqual(override.evidenceIds, fixture.evidenceIds)
      assert.ok(override.behavior.length > 0, `${override.key}: behavior`)
    }
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
    )
    for (const patch of fixture.inputs.patches) {
      readExact(path.join(repositoryRoot, patch.path), patch)
    }
  },
)

test(
  '2.1.117 target bundle authenticates every unit, residue range, and classification',
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
    const structuralBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    const baselineOccurrences = collectBundleOccurrences(baseline)
    const targetOccurrences = collectBundleOccurrences(target)
    const rows = [
      ...fixture.historicalGaps,
      ...fixture.currentExtractedOwners,
      fixture.rejected,
    ]
    const rowsByIndex = new Map(rows.map(row => [row.targetIndex, row]))

    for (const [index, classification, nodeType, start, end, sourceHash] of fixture.targets) {
      const region = regions.get(index)
      assert.ok(region, `u${index}: structural region`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          sourceHash: region.target.sourceHash,
        },
        { classification, nodeType, start, end, sourceHash },
        `u${index}: structural identity`,
      )
      const unit = target.slice(start, end)
      assert.equal(Buffer.byteLength(unit), end - start, `u${index}: full bytes`)
      assert.equal(sha256(unit), sourceHash, `u${index}: full SHA-256`)
      const unitAst = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
      assert.equal(unitAst.body.length, 1, `u${index}: exactly one unit`)
      assert.equal(unitAst.body[0].type, nodeType, `u${index}: node type`)

      const row = rowsByIndex.get(index)
      assert.ok(row, `u${index}: classified row`)
      for (const [kind, value, residueStart, residueEnd, ordinal] of row.residues) {
        assert.ok(residueStart >= start && residueEnd <= end, `u${index}: residue bounded`)
        const key = identity(kind, value)
        const baselineCount = (baselineOccurrences.get(key) ?? []).length
        assert.ok(ordinal > baselineCount, `u${index}: ${key} added occurrence`)
        const occurrences = targetOccurrences.get(key) ?? []
        assert.ok(occurrences.length >= ordinal, `u${index}: ${key} ordinal ${ordinal}`)
        assert.ok(
          occurrences.some(
            occurrence =>
              occurrence.start === residueStart && occurrence.end === residueEnd,
          ),
          `u${index}: ${key} exact range`,
        )
      }
    }
  },
)

test(
  '2.1.117 replay restores only bounded historical owners and is idempotent',
  { skip: !selected },
  async t => {
    const ts = await loadTypeScript()
    const materialized = materializeRawTargetSource(fixture.inputs.targetSource.commit)
    t.after(() => fs.rmSync(materialized.temporaryRoot, { recursive: true, force: true }))
    const before = summarizeSourceTree(materialized.sourceRoot)
    assert.deepEqual(publicTree(before), fixture.inputs.targetSource.rawTree)
    const beforeFiles = new Map(before.records.map(row => [row.path, row.sha256]))

    for (const row of fixture.historicalGaps) {
      const filename = sourceFilename(materialized.sourceRoot, row.owner)
      const source = fs.readFileSync(filename, 'utf8')
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, `${row.owner}: raw parses`)
      const declarations = []
      function visit(node) {
        if (declarationName(ts, node) === row.declaration) declarations.push(node)
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      if (declarations.length === 0) continue
      assert.equal(declarations.length, 1, `${row.declaration}: raw declaration count`)
      const identities = collectSourceIdentities(ts, declarations[0])
      assert.ok(
        [...residueCounts(row)].some(
          ([key, count]) => (identities.get(key) ?? 0) < count,
        ),
        `u${row.targetIndex}: raw owner must be incomplete`,
      )
    }
    assert.equal(
      fs.existsSync(sourceFilename(materialized.sourceRoot, TARGET117_HISTORICAL_GAP_NEW_FILES[0].path)),
      false,
      'context-hint module absent before replay',
    )
    assert.equal(
      fs.existsSync(sourceFilename(materialized.sourceRoot, TARGET117_HISTORICAL_GAP_NEW_FILES[1].path)),
      false,
      'team-artifacts module absent before replay',
    )

    assert.equal(
      applyTarget117GeneratedOwnerRecovery({ sourceRoot: materialized.sourceRoot }).status,
      'recovered',
    )
    const result = applyTarget117HistoricalOwnerSourceGapRecovery({
      sourceRoot: materialized.sourceRoot,
    })
    assert.equal(result.status, 'recovered')
    assert.equal(result.ownerOverrides, 20)
    assert.equal(result.files.filter(file => file.action === 'recovered').length, 17)
    assert.deepEqual(
      result.files.map(({ path: sourcePath, bytes, sha256: digest }) => ({
        path: sourcePath,
        bytes,
        sha256: digest,
      })),
      [...TARGET117_HISTORICAL_GAP_OUTPUT_FILES, ...TARGET117_HISTORICAL_GAP_NEW_FILES].map(
        ({ path: sourcePath, bytes, sha256: digest }) => ({
          path: sourcePath,
          bytes,
          sha256: digest,
        }),
      ),
      'exact replay file identities',
    )

    const after = summarizeSourceTree(materialized.sourceRoot)
    assert.deepEqual(publicTree(after), fixture.inputs.targetSource.combinedRecoveredTree)
    const changed = after.records
      .filter(row => beforeFiles.get(row.path) !== row.sha256)
      .map(row => row.path)
      .sort()
    assert.deepEqual(
      changed,
      [
        ...TARGET117_GENERATED_OWNER_OVERRIDES.flatMap(() => []),
        ...TARGET117_HISTORICAL_GAP_OUTPUT_FILES.map(file => file.path),
        ...TARGET117_HISTORICAL_GAP_NEW_FILES.map(file => file.path),
        'src/commands/fork/fork.ts',
        'src/commands/fork/index.ts',
        'src/commands/powerup/index.ts',
        'src/commands/powerup/powerup.tsx',
        'src/commands/recap.ts',
        'src/commands/team-onboarding.ts',
        'src/commands/toggle-memory/index.ts',
        'src/commands/toggle-memory/toggle-memory.ts',
        'src/tools/AgentTool/built-in/backgroundJobAgent.ts',
      ].sort(),
      'only six-gap and historical replay files change',
    )

    for (const file of result.files) {
      const filename = sourceFilename(materialized.sourceRoot, file.path)
      const source = fs.readFileSync(filename, 'utf8')
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, `${file.path}: recovered parses`)
    }
    for (const row of fixture.historicalGaps) {
      assertDeclarationCoversRow(ts, materialized.sourceRoot, row)
    }
    assert.match(
      fs.readFileSync(sourceFilename(materialized.sourceRoot, 'src/services/compact/contextHint.ts'), 'utf8'),
      /export function createContextHintController/,
    )
    assert.match(
      fs.readFileSync(sourceFilename(materialized.sourceRoot, 'src/utils/teamArtifacts.ts'), 'utf8'),
      /export async function getUnseenTeamArtifacts/,
    )
    assert.match(
      fs.readFileSync(sourceFilename(materialized.sourceRoot, 'src/utils/proxy.ts'), 'utf8'),
      /export function prefetchProxyAuthFromHelperIfSafe/,
    )

    const replay = applyTarget117HistoricalOwnerSourceGapRecovery({
      sourceRoot: materialized.sourceRoot,
    })
    assert.equal(replay.status, 'already-recovered')
    assert.ok(replay.files.every(file => file.action === 'unchanged'))

    fs.appendFileSync(
      sourceFilename(materialized.sourceRoot, TARGET117_HISTORICAL_GAP_OUTPUT_FILES[0].path),
      '\n',
    )
    assert.throws(
      () =>
        applyTarget117HistoricalOwnerSourceGapRecovery({
          sourceRoot: materialized.sourceRoot,
        }),
      /expected raw .* or recovered/,
      'mutated recovered source fails closed',
    )
  },
)

test(
  '2.1.117 current extracted owners remain semantic while post-117 coincidence is rejected',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const currentSourceRoot = path.join(repositoryRoot, 'src')
    for (const row of fixture.currentExtractedOwners) {
      assertDeclarationCoversRow(ts, currentSourceRoot, row)
    }

    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const targetMetadata = fixture.targets.find(
      ([index]) => index === fixture.rejected.targetIndex,
    )
    assert.ok(targetMetadata, 'rejected target structural metadata')
    const targetUnit = target.slice(targetMetadata[3], targetMetadata[4])
    let previous = -1
    for (const marker of fixture.rejected.targetOrder) {
      const offset = targetUnit.indexOf(marker)
      assert.ok(offset > previous, `Target117 resolver order: ${marker}`)
      previous = offset
    }

    const laterSource = fs.readFileSync(
      sourceFilename(currentSourceRoot, fixture.rejected.owner),
      'utf8',
    )
    const start = laterSource.indexOf('function resolveForkSubagentSource(')
    const end = laterSource.indexOf('\n}', start) + 2
    assert.ok(start >= 0 && end > start, 'later resolver declaration')
    const laterDeclaration = laterSource.slice(start, end)
    previous = -1
    for (const marker of fixture.rejected.laterOrder) {
      const offset = laterDeclaration.indexOf(marker)
      assert.ok(offset > previous, `later resolver order: ${marker}`)
      previous = offset
    }
    assert.ok(
      !TARGET117_HISTORICAL_GAP_OVERRIDES.some(
        row => row.targetIndex === fixture.rejected.targetIndex,
      ),
      'post-117 semantic collision is never generator-wired',
    )
    assert.equal(
      new Set([
        ...fixture.historicalGaps.map(row => row.targetIndex),
        ...fixture.currentExtractedOwners.map(row => row.targetIndex),
        fixture.rejected.targetIndex,
      ]).size,
      fixture.summary.clusterUnits,
      'classification is exhaustive and disjoint',
    )
  },
)
