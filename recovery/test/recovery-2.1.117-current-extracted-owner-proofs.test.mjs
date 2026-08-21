import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET117_CURRENT_EXTRACTED_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/current-extracted-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-current-extracted-owner-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'e0d8010e7b9902ad7c2f649b9f2dc15224e29e1c00baa4fe91afbeb7acf5418d'
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

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
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

function collectUnitIdentityCounts(unit) {
  const grouped = collectBundleOccurrences(unit)
  return new Map([...grouped].map(([key, values]) => [key, values.length]))
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

function namedDeclarations(ts, sourceFile, expectedName) {
  const matches = []
  function visit(node) {
    if (declarationName(ts, node) === expectedName) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return matches
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

function collectSourceIdentityCounts(ts, declaration) {
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

function residueCounts(row) {
  const counts = new Map()
  for (const [kind, value] of row.residues) {
    const key = identity(kind, value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function gitBytes(commit, sourcePath) {
  return execFileSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
  })
}

test(
  '2.1.117 current-extracted fixture pins five direct owner overrides',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-override-ready')
    assert.deepEqual(fixture.summary, {
      units: 5,
      residues: 12,
      recoveredExtractedOwners: 2,
      recoveredCorrectedOwners: 3,
      ownerOverrides: 5,
    })
    assert.equal(fixture.targets.length, 5)
    assert.equal(fixture.rows.length, 5)
    assert.equal(fixture.rows.flatMap(row => row.residues).length, 12)
    assert.equal(
      fixture.rows.filter(row => row.classification === 'recovered-extracted').length,
      2,
    )
    assert.equal(
      fixture.rows.filter(row => row.classification === 'recovered-corrected').length,
      3,
    )
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      [14883, 15220, 16801, 18925, 19754],
    )
    assert.deepEqual(
      TARGET117_CURRENT_EXTRACTED_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declaration,
      ]),
      fixture.rows.map(row => [row.targetIndex, [row.owner], row.declaration]),
      'override wiring is exact',
    )
    for (const override of TARGET117_CURRENT_EXTRACTED_OWNER_OVERRIDES) {
      assert.equal(override.key, `${caseName}:${override.targetIndex}`)
      assert.deepEqual(override.evidenceIds, fixture.evidenceIds)
      assert.ok(override.behavior.length > 0, `${override.key}: behavior`)
    }
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
    )
  },
)

test(
  '2.1.117 target bundle authenticates all five units and twelve owner residues',
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
        assert.ok(ordinal > baselineCount, `u${index}: ${key} added occurrence`)
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
  '2.1.117 owner proof binds every residue to one authenticated named declaration',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const recoveredCommit = execFileSync(
      'git',
      ['rev-parse', `${fixture.inputs.authenticatedRecoveredSourceCommit}^{commit}`],
      { cwd: repositoryRoot, encoding: 'utf8' },
    ).trim()
    assert.equal(
      recoveredCommit,
      fixture.inputs.authenticatedRecoveredSourceCommit,
      'authenticated recovered source commit',
    )
    const rawCommit = execFileSync(
      'git',
      ['rev-parse', `${fixture.inputs.rawTargetSourceCommit}^{commit}`],
      { cwd: repositoryRoot, encoding: 'utf8' },
    ).trim()
    assert.equal(rawCommit, fixture.inputs.rawTargetSourceCommit, 'raw source commit')

    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const targets = new Map(fixture.targets.map(row => [row[0], row]))

    for (const row of fixture.rows) {
      const blob = execFileSync(
        'git',
        ['rev-parse', `${recoveredCommit}:${row.owner}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim()
      assert.equal(blob, row.file[0], `u${row.targetIndex}: source blob`)
      const sourceBytes = gitBytes(recoveredCommit, row.owner)
      assert.deepEqual(
        descriptor(sourceBytes),
        { bytes: row.file[1], sha256: row.file[2] },
        `u${row.targetIndex}: source file identity`,
      )
      const source = sourceBytes.toString('utf8')
      const sourceFile = parseSource(ts, row.owner, source)
      const declarations = namedDeclarations(ts, sourceFile, row.declaration)
      assert.equal(declarations.length, 1, `u${row.targetIndex}: one direct declaration`)
      const declaration = declarations[0]
      assert.equal(
        ts.SyntaxKind[declaration.kind],
        row.declarationNodeType,
        `u${row.targetIndex}: source declaration kind`,
      )
      const declarationText = source.slice(
        declaration.getStart(sourceFile),
        declaration.end,
      )
      assert.deepEqual(
        descriptor(Buffer.from(declarationText)),
        { bytes: row.source[0], sha256: row.source[1] },
        `u${row.targetIndex}: declaration identity`,
      )
      const sourceIdentities = collectSourceIdentityCounts(ts, declaration)
      for (const [key, expectedCount] of residueCounts(row)) {
        assert.ok(
          (sourceIdentities.get(key) ?? 0) >= expectedCount,
          `u${row.targetIndex}: owner declaration covers ${key} ${expectedCount}x`,
        )
      }

      const metadata = targets.get(row.targetIndex)
      const targetUnit = target.slice(metadata[3], metadata[4])
      const targetIdentities = collectUnitIdentityCounts(targetUnit)
      for (const [kind, value] of row.semanticIdentities) {
        const key = identity(kind, value)
        assert.ok(
          (sourceIdentities.get(key) ?? 0) > 0,
          `u${row.targetIndex}: named source declaration owns ${key}`,
        )
        assert.ok(
          (targetIdentities.get(key) ?? 0) > 0,
          `u${row.targetIndex}: authenticated target unit retains ${key}`,
        )
      }

      const rawBytes = gitBytes(rawCommit, row.owner)
      const rawSource = rawBytes.toString('utf8')
      const rawFile = parseSource(ts, row.owner, rawSource)
      const rawDeclarations = namedDeclarations(ts, rawFile, row.declaration)
      if (row.rawDeclaration === null) {
        assert.equal(
          rawDeclarations.length,
          0,
          `u${row.targetIndex}: declaration is genuinely recovered/extracted`,
        )
      } else {
        assert.equal(rawDeclarations.length, 1, `u${row.targetIndex}: one raw declaration`)
        const rawText = rawSource.slice(
          rawDeclarations[0].getStart(rawFile),
          rawDeclarations[0].end,
        )
        assert.deepEqual(
          descriptor(Buffer.from(rawText)),
          { bytes: row.rawDeclaration[0], sha256: row.rawDeclaration[1] },
          `u${row.targetIndex}: raw declaration boundary`,
        )
        assert.notEqual(
          sha256(rawText),
          row.source[1],
          `u${row.targetIndex}: recovered declaration is a bounded correction`,
        )
      }
    }
  },
)
