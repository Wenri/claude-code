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
  TARGET117_DIRECT_STATIC_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/direct-static-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-direct-static-owner-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '6de2df517db388b26bda6f4ace58fe5681cea8a1a2c7b08fefbe890bbef742d2'
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
    if (node.type === 'Literal' && typeof node.value === 'string') {
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
  return { ast, grouped }
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

function namedDeclaration(ts, sourceFile, expectedName) {
  const matches = []
  function visit(node) {
    if (node.name && ts.isIdentifier(node.name) && node.name.text === expectedName) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
}

function collectSourceIdentities(ts, declarations) {
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
    if (
      ts.isBindingElement(node) &&
      node.propertyName &&
      ts.isIdentifier(node.propertyName)
    ) {
      add('property', node.propertyName.text)
    }
    ts.forEachChild(node, visit)
  }
  for (const declaration of declarations) visit(declaration)
  return counts
}

function mergeBundleIdentities(target, metadataRows) {
  const merged = new Map()
  for (const metadata of metadataRows) {
    const occurrences = collectBundleOccurrences(
      target.slice(metadata[3], metadata[4]),
    ).grouped
    for (const [key, values] of occurrences) {
      const current = merged.get(key) ?? []
      current.push(...values)
      merged.set(key, current)
    }
  }
  return merged
}

function gitBytes(commit, sourcePath) {
  return execFileSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
  })
}

test(
  '2.1.117 direct-static fixture pins five bounded owner overrides',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-override-ready')
    assert.deepEqual(fixture.summary, {
      units: 5,
      residues: 7,
      rawDirectOwners: 3,
      laterBoundedWitnesses: 2,
      crossKindRepresentations: 2,
      excludedSemanticEvolutionUnits: 1,
      ownerOverrides: 5,
    })
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      [6067, 8735, 12469, 16363, 20645],
    )
    assert.deepEqual(
      TARGET117_DIRECT_STATIC_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
        override.evidenceIds,
      ]),
      fixture.rows.map(row => [
        row.targetIndex,
        [row.owner],
        row.declarations,
        fixture.evidenceIds,
      ]),
    )
    assert.equal(
      TARGET117_DIRECT_STATIC_OWNER_OVERRIDES.some(
        override => override.targetIndex === 8727,
      ),
      false,
      'semantic-evolution unit 8727 is explicitly excluded',
    )
    for (const override of TARGET117_DIRECT_STATIC_OWNER_OVERRIDES) {
      assert.ok(override.behavior.length > 0, `${override.key}: behavior`)
    }
    readExact(path.join(repositoryRoot, fixture.inputs.helper.path), fixture.inputs.helper)
  },
)

test(
  '2.1.117 bundles authenticate all target closures and seven exact residues',
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
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    const baselineOccurrences = collectBundleOccurrences(baseline).grouped
    const targetOccurrences = collectBundleOccurrences(target).grouped

    for (const row of fixture.rows) {
      for (const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] of row.targetClosure) {
        const region = regions.get(index)
        assert.ok(region, `u${index}: structural region`)
        assert.deepEqual(
          {
            classification: region.classification,
            nodeType: region.target.nodeType,
            start: region.target.start,
            end: region.target.end,
            tokenCount: region.target.tokenCount,
            sourceHash: region.target.sourceHash,
            coarseHash: region.target.coarseHash,
          },
          { classification, nodeType, start, end, tokenCount, sourceHash, coarseHash },
        )
        const unit = target.slice(start, end)
        assert.equal(Buffer.byteLength(unit), end - start, `u${index}: full bytes`)
        assert.equal(sha256(unit), sourceHash, `u${index}: full SHA-256`)
        const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
        assert.equal(ast.body.length, 1, `u${index}: exactly one unit`)
        assert.equal(ast.body[0].type, nodeType, `u${index}: node type`)
      }

      const primary = row.targetClosure.find(metadata => metadata[0] === row.targetIndex)
      for (const [kind, value, start, end, ordinal, baselineCount] of row.residues) {
        const key = identity(kind, value)
        assert.equal(
          (baselineOccurrences.get(key) ?? []).length,
          baselineCount,
          `u${row.targetIndex}: ${key} baseline count`,
        )
        const occurrence = (targetOccurrences.get(key) ?? [])[ordinal - 1]
        assert.ok(occurrence, `u${row.targetIndex}: ${key} target ordinal`)
        assert.deepEqual([occurrence.start, occurrence.end], [start, end])
        assert.ok(start >= primary[3] && end <= primary[4], `${key}: primary unit bound`)
      }
    }
  },
)

test(
  '2.1.117 source witnesses bind every unit to named declaration semantics',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')

    for (const row of fixture.rows) {
      const witness = row.sourceWitness
      const commit = execFileSync(
        'git',
        ['rev-parse', `${witness.commit}^{commit}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim()
      assert.equal(commit, witness.commit, `u${row.targetIndex}: source commit`)
      const blob = execFileSync(
        'git',
        ['rev-parse', `${witness.commit}:${row.owner}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim()
      assert.equal(blob, witness.blob, `u${row.targetIndex}: source blob`)
      const bytes = gitBytes(witness.commit, row.owner)
      assert.deepEqual(descriptor(bytes), witness.file, `u${row.targetIndex}: source file`)
      const source = bytes.toString('utf8')
      const sourceFile = parseSource(ts, row.owner, source)
      const declarations = witness.declarations.map(expected => {
        const declaration = namedDeclaration(ts, sourceFile, expected.name)
        assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
        assert.equal(declaration.getStart(sourceFile), expected.start)
        assert.equal(declaration.end, expected.end)
        const slice = Buffer.from(
          source.slice(declaration.getStart(sourceFile), declaration.end),
        )
        assert.deepEqual(descriptor(slice), {
          bytes: expected.bytes,
          sha256: expected.sha256,
        })
        return declaration
      })
      const sourceIdentities = collectSourceIdentities(ts, declarations)
      const targetIdentities = mergeBundleIdentities(target, row.targetClosure)
      for (const [kind, value] of row.semanticIdentities) {
        const key = identity(kind, value)
        assert.ok(
          (sourceIdentities.get(key) ?? 0) > 0,
          `u${row.targetIndex}: declaration closure contains ${key}`,
        )
        assert.ok(
          (targetIdentities.get(key) ?? []).length > 0,
          `u${row.targetIndex}: target closure contains ${key}`,
        )
      }
      for (const [kind, value] of row.residues) {
        if (
          (row.crossKindResidues ?? []).some(
            ([targetKind, targetValue]) =>
              targetKind === kind && targetValue === value,
          )
        ) {
          continue
        }
        const key = identity(kind, value)
        assert.ok(
          (sourceIdentities.get(key) ?? 0) > 0,
          `u${row.targetIndex}: source declaration covers residue ${key}`,
        )
      }
    }
  },
)

test(
  '2.1.117 cross-kind and later-source witnesses remain temporally bounded',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const rawCommit = fixture.inputs.rawTargetSourceCommit

    const context = fixture.rows.find(row => row.targetIndex === 6067)
    const contextBytes = gitBytes(rawCommit, context.owner)
    const contextSource = contextBytes.toString('utf8')
    const contextFile = parseSource(ts, context.owner, contextSource)
    const contextDeclaration = namedDeclaration(
      ts,
      contextFile,
      'getSonnetContextWindowExperiment',
    )
    let exactElementAccesses = 0
    function visitContext(node) {
      if (
        ts.isElementAccessExpression(node) &&
        node.argumentExpression &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === 'kelp_forest_sonnet'
      ) {
        exactElementAccesses += 1
      }
      ts.forEachChild(node, visitContext)
    }
    visitContext(contextDeclaration)
    assert.equal(exactElementAccesses, 1, 'source has one exact string-key access')
    const contextTarget = collectBundleOccurrences(
      target.slice(context.targetClosure[0][3], context.targetClosure[0][4]),
    ).grouped
    assert.equal(
      (contextTarget.get(identity('property', 'kelp_forest_sonnet')) ?? []).length,
      1,
      'bundle represents the same access as one dot property',
    )

    const fork = fixture.rows.find(row => row.targetIndex === 8735)
    const forkBytes = gitBytes(fork.sourceWitness.commit, fork.owner)
    const forkSource = forkBytes.toString('utf8')
    const forkFile = parseSource(ts, fork.owner, forkSource)
    const forkDeclarations = fork.declarations.map(name =>
      namedDeclaration(ts, forkFile, name),
    )
    const forkSourceIdentities = collectSourceIdentities(ts, forkDeclarations)
    assert.equal(
      forkSourceIdentities.get(
        identity('property', 'CLAUDE_CODE_FORK_SUBAGENT'),
      ),
      1,
      'source uses one exact environment property access',
    )
    const forkTargetIdentities = mergeBundleIdentities(target, fork.targetClosure)
    assert.equal(
      (
        forkTargetIdentities.get(
          identity('string', 'CLAUDE_CODE_FORK_SUBAGENT'),
        ) ?? []
      ).length,
      1,
      'bundle hoists the environment property as one exact string constant',
    )

    for (const row of fixture.rows.filter(candidate => candidate.kind.startsWith('later-'))) {
      const rawBytes = gitBytes(rawCommit, row.owner)
      const rawSource = rawBytes.toString('utf8')
      const rawFile = parseSource(ts, row.owner, rawSource)
      for (const name of row.declarations) {
        const matches = []
        function visit(node) {
          if (node.name && ts.isIdentifier(node.name) && node.name.text === name) {
            matches.push(node)
          }
          ts.forEachChild(node, visit)
        }
        visit(rawFile)
        assert.equal(
          matches.length,
          0,
          `u${row.targetIndex}: ${name} is a genuine raw-source declaration gap`,
        )
      }
    }

    assert.deepEqual(
      fork.targetClosure.map(metadata => metadata[0]),
      [8727, 8728, 8735],
      'fork constants are authenticated with their two consuming target functions',
    )
    assert.equal(
      TARGET117_DIRECT_STATIC_OWNER_OVERRIDES.some(
        override => override.targetIndex === 8727,
      ),
      false,
      'the differing source-order unit remains rejected',
    )

    const rename = fixture.rows.find(row => row.targetIndex === 16363)
    const renameUnit = target.slice(
      rename.targetClosure[0][3],
      rename.targetClosure[0][4],
    )
    assert.match(renameUnit, /kind==="ccr"/)
    assert.match(renameUnit, /updateSessionTitle/)
    assert.match(renameUnit, /return`Session renamed to: /)
  },
)
