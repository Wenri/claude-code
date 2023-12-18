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
  TARGET117_RECOVERED_SOURCE_FILES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-generated-owner-source-gaps.mjs'
import {
  applyTarget117HistoricalOwnerSourceGapRecovery,
  TARGET117_HISTORICAL_GAP_NEW_FILES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-historical-owner-source-gaps.mjs'
import {
  TARGET117_TAIL_EXTRACTED_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/tail-extracted-owner-overrides.mjs'
import { summarizeSourceTree } from '../scripts/verify-source-lineage.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-tail-extracted-owner-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f0835974fa62f7433efdc321d54c2f9613aa6c148cdabc015aaaa5a99d9611d2'
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
    path.join(os.tmpdir(), 'target117-tail-extracted-proofs-'),
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
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags].sort().join('')}`
  }
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

function parseSource(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parses`)
  return sourceFile
}

function declarationName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (node.name && ts.isStringLiteralLike(node.name)) return node.name.text
  return undefined
}

function namedDeclaration(ts, sourceFile, expectedName) {
  const matches = []
  function visit(node) {
    if (declarationName(ts, node) === expectedName) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
}

function collectSourceIdentityCounts(ts, declarations) {
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
        (ts.isPropertySignature(node.parent) && node.parent.name === node) ||
        (ts.isMethodDeclaration(node.parent) && node.parent.name === node))
    ) {
      add('property', node.text)
    }
    ts.forEachChild(node, visit)
  }
  for (const declaration of declarations) visit(declaration)
  return counts
}

function residueCounts(row) {
  const counts = new Map()
  for (const [kind, value] of row.residues) {
    const key = identity(kind, value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

test(
  '2.1.117 tail-extracted fixture pins exactly twelve case-owned overrides',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-override-ready')
    assert.deepEqual(fixture.summary, {
      units: 12,
      residues: 32,
      teamArtifactUnits: 6,
      forkUnits: 2,
      contextHintUnits: 4,
      recoveredSourceFiles: 4,
      authenticatedDeclarations: 13,
      ownerOverrides: 12,
    })
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      [
        12585, 12586, 12587, 12588, 12589, 12591,
        17727, 17736,
        18282, 18283, 18284, 18285,
      ],
    )
    assert.equal(
      fixture.rows.flatMap(row => row.residues).length,
      fixture.summary.residues,
    )
    assert.deepEqual(
      TARGET117_TAIL_EXTRACTED_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
      ]),
      fixture.rows.map(row => [
        row.targetIndex,
        [row.owner],
        row.declarations.map(declaration => declaration.name),
      ]),
      'generator wiring is exact',
    )
    for (const override of TARGET117_TAIL_EXTRACTED_OWNER_OVERRIDES) {
      assert.equal(override.key, `${caseName}:${override.targetIndex}`)
      assert.deepEqual(override.evidenceIds, fixture.evidenceIds)
      assert.ok(override.behavior.length > 0, `${override.key}: behavior`)
    }
    for (const helper of fixture.inputs.helpers) {
      readExact(path.join(repositoryRoot, helper.path), helper)
    }
  },
)

test(
  '2.1.117 bundles authenticate all twelve full units and all thirty-two residues',
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
    const rows = new Map(fixture.rows.map(row => [row.targetIndex, row]))

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
      assert.equal(unitAst.body.length, 1, `u${index}: exactly one target unit`)
      assert.equal(unitAst.body[0].type, nodeType, `u${index}: target node type`)

      const row = rows.get(index)
      assert.ok(row, `u${index}: owner row`)
      for (const [kind, value, residueStart, residueEnd, ordinal] of row.residues) {
        assert.ok(residueStart >= start && residueEnd <= end, `u${index}: residue bounded`)
        const key = identity(kind, value)
        const baselineCount = (baselineOccurrences.get(key) ?? []).length
        assert.ok(ordinal > baselineCount, `u${index}: ${key} is added`)
        const occurrences = targetOccurrences.get(key) ?? []
        assert.ok(occurrences.length >= ordinal, `u${index}: ${key} ordinal ${ordinal}`)
        assert.ok(
          occurrences.some(
            occurrence =>
              occurrence.start === residueStart && occurrence.end === residueEnd,
          ),
          `u${index}: ${key} exact target range`,
        )
      }
    }
  },
)

test(
  '2.1.117 replay restores four exact owner files and thirteen authenticated declarations',
  { skip: !selected },
  async t => {
    const ts = await loadTypeScript()
    const commit = execFileSync(
      'git',
      ['rev-parse', `${fixture.inputs.targetSource.commit}^{commit}`],
      { cwd: repositoryRoot, encoding: 'utf8' },
    ).trim()
    assert.equal(commit, fixture.inputs.targetSource.commit, 'raw source commit')
    const materialized = materializeRawTargetSource(commit)
    t.after(() => fs.rmSync(materialized.temporaryRoot, { recursive: true, force: true }))
    assert.deepEqual(
      publicTree(summarizeSourceTree(materialized.sourceRoot)),
      fixture.inputs.targetSource.rawTree,
    )
    for (const expected of fixture.inputs.sourceFiles) {
      assert.equal(
        fs.existsSync(sourceFilename(materialized.sourceRoot, expected.path)),
        false,
        `${expected.path}: absent from raw Target117 source`,
      )
    }

    assert.equal(
      applyTarget117GeneratedOwnerRecovery({ sourceRoot: materialized.sourceRoot }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117GeneratedOwnerRecovery({ sourceRoot: materialized.sourceRoot }).status,
      'already-recovered',
      'generated replay is idempotent before later case overlays',
    )
    assert.equal(
      applyTarget117HistoricalOwnerSourceGapRecovery({
        sourceRoot: materialized.sourceRoot,
      }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117HistoricalOwnerSourceGapRecovery({
        sourceRoot: materialized.sourceRoot,
      }).status,
      'already-recovered',
      'historical replay is idempotent',
    )
    assert.deepEqual(
      publicTree(summarizeSourceTree(materialized.sourceRoot)),
      fixture.inputs.targetSource.generatedAndHistoricalTree,
    )

    const generatedFiles = new Map(
      TARGET117_RECOVERED_SOURCE_FILES.map(file => [file.path, file]),
    )
    const historicalFiles = new Map(
      TARGET117_HISTORICAL_GAP_NEW_FILES.map(file => [file.path, file]),
    )
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const targets = new Map(fixture.targets.map(row => [row[0], row]))
    const parsedFiles = new Map()

    for (const expected of fixture.inputs.sourceFiles) {
      const replayRecord = generatedFiles.get(expected.path) ?? historicalFiles.get(expected.path)
      assert.ok(replayRecord, `${expected.path}: authenticated replay record`)
      assert.deepEqual(
        { bytes: replayRecord.bytes, sha256: replayRecord.sha256 },
        { bytes: expected.bytes, sha256: expected.sha256 },
        `${expected.path}: fixture matches replay export`,
      )
      const filename = sourceFilename(materialized.sourceRoot, expected.path)
      const bytes = readExact(filename, expected)
      const source = bytes.toString('utf8')
      parsedFiles.set(expected.path, {
        source,
        sourceFile: parseSource(ts, expected.path, source),
      })
    }

    for (const row of fixture.rows) {
      const parsed = parsedFiles.get(row.owner)
      assert.ok(parsed, `u${row.targetIndex}: parsed owner`)
      const declarations = row.declarations.map(expected => {
        const declaration = namedDeclaration(ts, parsed.sourceFile, expected.name)
        assert.equal(
          ts.SyntaxKind[declaration.kind],
          expected.nodeType,
          `u${row.targetIndex}: ${expected.name} node type`,
        )
        assert.equal(
          declaration.getStart(parsed.sourceFile),
          expected.start,
          `u${row.targetIndex}: ${expected.name} start`,
        )
        assert.equal(declaration.end, expected.end, `u${row.targetIndex}: ${expected.name} end`)
        const slice = Buffer.from(
          parsed.source.slice(declaration.getStart(parsed.sourceFile), declaration.end),
        )
        assert.deepEqual(
          descriptor(slice),
          { bytes: expected.bytes, sha256: expected.sha256 },
          `u${row.targetIndex}: ${expected.name} declaration identity`,
        )
        return declaration
      })
      const sourceIdentities = collectSourceIdentityCounts(ts, declarations)
      const metadata = targets.get(row.targetIndex)
      const targetIdentities = collectBundleOccurrences(
        target.slice(metadata[3], metadata[4]),
      )

      for (const [key, expectedCount] of residueCounts(row)) {
        assert.ok(
          (sourceIdentities.get(key) ?? 0) >= expectedCount,
          `u${row.targetIndex}: owner declarations cover ${key} ${expectedCount}x`,
        )
      }
      for (const [kind, value] of row.semanticIdentities) {
        const key = identity(kind, value)
        assert.ok(
          (sourceIdentities.get(key) ?? 0) > 0,
          `u${row.targetIndex}: source closure contains ${key}`,
        )
        assert.ok(
          (targetIdentities.get(key) ?? []).length > 0,
          `u${row.targetIndex}: authenticated target unit contains ${key}`,
        )
      }
    }
  },
)

test(
  '2.1.117 extracted owners retain declaration-level behavior chains, never global text',
  { skip: !selected },
  async t => {
    const ts = await loadTypeScript()
    const materialized = materializeRawTargetSource(fixture.inputs.targetSource.commit)
    t.after(() => fs.rmSync(materialized.temporaryRoot, { recursive: true, force: true }))
    assert.equal(
      applyTarget117GeneratedOwnerRecovery({ sourceRoot: materialized.sourceRoot }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117GeneratedOwnerRecovery({ sourceRoot: materialized.sourceRoot }).status,
      'already-recovered',
    )
    assert.equal(
      applyTarget117HistoricalOwnerSourceGapRecovery({ sourceRoot: materialized.sourceRoot }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117HistoricalOwnerSourceGapRecovery({ sourceRoot: materialized.sourceRoot }).status,
      'already-recovered',
    )

    const expectedChains = new Map([
      [12585, ['getTeamArtifacts', 'getGlobalConfig', '.filter(', '.has(']],
      [12586, ['getTeamArtifacts', 'saveGlobalConfig', '.filter(', '.every(']],
      [12587, ["logEvent('tengu_team_artifact_tip_shown'", 'Math.max(']],
      [12588, ["source !== 'projectSettings'", 'getGlobalConfig()', '.some(']],
      [12589, ["artifact.author || 'a teammate'", "names.slice(0, -1).join(', ')"]],
      [12591, ['TEAM_ARTIFACT_DIRECTORIES', 'execFileNoThrowWithCwd', "line.startsWith('COMMIT\\0')"]],
      [17727, ['.trim()', ".split(/\\s+/)", ".replace(/[^a-z0-9-]/g, '')"]],
      [17736, ["type: 'local-jsx'", 'isForkSubagentEnabled', "import('./fork.js')"]],
      [18282, ['persistToolResult', 'isPersistError', 'result.filepath']],
      [18283, ['keepRecentMicrocompact', 'persist: persistHintToolResult', 'resetMicrocompactState']],
      [18284, ['applyHintEdits', "logEvent('tengu_context_hint_reject'", 'result.clearedContent']],
      [18285, ["querySource.startsWith('repl_main_thread')", 'selectKeepRecentToolResults', 'handleHintReject']],
    ])

    for (const row of fixture.rows) {
      const filename = sourceFilename(materialized.sourceRoot, row.owner)
      const source = fs.readFileSync(filename, 'utf8')
      const sourceFile = parseSource(ts, filename, source)
      const closure = row.declarations
        .map(expected => {
          const declaration = namedDeclaration(ts, sourceFile, expected.name)
          return source.slice(declaration.getStart(sourceFile), declaration.end)
        })
        .join('\n')
      for (const needle of expectedChains.get(row.targetIndex)) {
        assert.ok(
          closure.includes(needle),
          `u${row.targetIndex}: named declaration closure contains ${JSON.stringify(needle)}`,
        )
      }
    }
  },
)
