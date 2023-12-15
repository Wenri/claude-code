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
} from '../cases/2.1.116-to-2.1.117/recovered/replay-generated-owner-source-gaps.mjs'
import {
  applyTarget117HistoricalOwnerSourceGapRecovery,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-historical-owner-source-gaps.mjs'
import {
  applyTarget117ConfirmationSourceRecovery,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-confirmation-source-gaps.mjs'
import {
  applyTarget117ReplBridgeSkipArchiveSourceRecovery,
  TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_INPUT_FILE,
  TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OUTPUT_FILE,
  TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OWNER_OVERRIDES,
  TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_PATCH_INPUT,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-repl-bridge-skip-archive-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-repl-bridge-skip-archive-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '134d4a4c2c98319317a01c11be4eaf3e507734490edfd2c60f568970caf7dc32'
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

function materializeRawTargetSource(commit, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
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

function assertDeclaration(ts, sourceFile, source, expected) {
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
}

function collectSourceProperties(ts, declaration) {
  const properties = new Map()
  function add(name) {
    properties.set(name, (properties.get(name) ?? 0) + 1)
  }
  function visit(node) {
    if (
      ts.isIdentifier(node) &&
      ((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
        (ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
        (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) ||
        (ts.isBindingElement(node.parent) && node.parent.name === node) ||
        (ts.isPropertySignature(node.parent) && node.parent.name === node))
    ) {
      add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return properties
}

test(
  '2.1.117 bridge-skip fixture pins one bounded replay and owner override',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 1,
      recoveredFiles: 1,
      boundedInsertions: 2,
      ownerOverrides: 1,
      rejectedGlobalTextOwners: 1,
    })
    assert.deepEqual(fixture.row.residues, [
      ['property', 'replBridgeSkipNextArchive', 6378821, 6378846, 1],
    ])
    assert.deepEqual(TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_INPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.output,
    })
    assert.deepEqual(
      TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_PATCH_INPUT,
      fixture.inputs.nextReleaseSourceOverlay,
    )
    assert.deepEqual(
      TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
        override.evidenceIds,
      ]),
      [[10966, [fixture.row.owner], [fixture.row.declaration], fixture.evidenceIds]],
    )
    assert.ok(TARGET117_REPL_BRIDGE_SKIP_ARCHIVE_OWNER_OVERRIDES[0].behavior.length > 0)
    readExact(path.join(repositoryRoot, fixture.inputs.helper.path), fixture.inputs.helper)
    const overlay = readExact(
      path.join(repositoryRoot, fixture.inputs.nextReleaseSourceOverlay.path),
      fixture.inputs.nextReleaseSourceOverlay,
    ).toString('utf8')
    assert.match(
      overlay,
      /\+  \/\*\* One-shot teardown override used by \/update bridge reattachment\. \*\//,
    )
    assert.match(overlay, /\+  replBridgeSkipNextArchive: boolean/)
    assert.match(overlay, /\+    replBridgeSkipNextArchive: false,/)
  },
)

test(
  '2.1.117 bundle authenticates the full default-state unit and exact added residue',
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
    const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] = fixture.target
    const region = structural.regions.find(candidate => candidate.target.index === index)
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
    assert.equal(Buffer.byteLength(unit), end - start)
    assert.equal(sha256(unit), sourceHash)
    const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].type, nodeType)

    const baselineOccurrences = collectBundleOccurrences(baseline)
    const targetOccurrences = collectBundleOccurrences(target)
    for (const [kind, value, residueStart, residueEnd, ordinal] of fixture.row.residues) {
      const key = identity(kind, value)
      assert.equal((baselineOccurrences.get(key) ?? []).length, 0)
      const occurrence = (targetOccurrences.get(key) ?? [])[ordinal - 1]
      assert.ok(occurrence, `${key}: target ordinal`)
      assert.deepEqual([occurrence.start, occurrence.end], [residueStart, residueEnd])
      assert.ok(residueStart >= start && residueEnd <= end)
    }
  },
)

test(
  '2.1.117 raw source replay restores exact AppState type/default declarations idempotently',
  { skip: !selected },
  async t => {
    const ts = await loadTypeScript()
    const materialized = materializeRawTargetSource(
      fixture.inputs.targetSourceCommit,
      'target117-bridge-skip-raw-',
    )
    t.after(() => fs.rmSync(materialized.temporaryRoot, { recursive: true, force: true }))
    const filename = sourceFilename(materialized.sourceRoot, fixture.inputs.sourceFile.path)
    const rawBytes = readExact(filename, fixture.inputs.sourceFile.input)
    const rawSource = rawBytes.toString('utf8')
    const rawFile = parseSource(ts, filename, rawSource)
    for (const expected of fixture.inputs.sourceFile.rawDeclarations) {
      const declaration = assertDeclaration(ts, rawFile, rawSource, expected)
      assert.equal(
        collectSourceProperties(ts, declaration).get('replBridgeSkipNextArchive') ?? 0,
        0,
        `${expected.name}: gap is absent before replay`,
      )
    }

    const result = applyTarget117ReplBridgeSkipArchiveSourceRecovery({
      sourceRoot: materialized.sourceRoot,
    })
    assert.equal(result.status, 'recovered')
    assert.equal(result.ownerOverrides, 1)
    const recoveredBytes = readExact(filename, fixture.inputs.sourceFile.output)
    const recoveredSource = recoveredBytes.toString('utf8')
    const recoveredFile = parseSource(ts, filename, recoveredSource)
    for (const expected of fixture.inputs.sourceFile.recoveredDeclarations) {
      assertDeclaration(ts, recoveredFile, recoveredSource, expected)
    }
    const appState = namedDeclaration(ts, recoveredFile, 'AppState')
    const getDefaultAppState = namedDeclaration(ts, recoveredFile, 'getDefaultAppState')
    assert.equal(collectSourceProperties(ts, appState).get('replBridgeSkipNextArchive'), 1)
    assert.equal(
      collectSourceProperties(ts, getDefaultAppState).get('replBridgeSkipNextArchive'),
      1,
    )
    const defaultText = recoveredSource.slice(
      getDefaultAppState.getStart(recoveredFile),
      getDefaultAppState.end,
    )
    assert.match(defaultText, /replBridgeSkipNextArchive: false/)
    assert.equal(
      applyTarget117ReplBridgeSkipArchiveSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }).status,
      'already-recovered',
    )

    fs.appendFileSync(filename, '\n')
    assert.throws(
      () =>
        applyTarget117ReplBridgeSkipArchiveSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }),
      /Refusing to recover non-target AppStateStore/,
    )
  },
)

test(
  '2.1.117 packaged source accepts the exact postimage and rejects the global consumer match',
  { skip: !selected },
  async t => {
    const ts = await loadTypeScript()
    const materialized = materializeRawTargetSource(
      fixture.inputs.targetSourceCommit,
      'target117-bridge-skip-packaged-',
    )
    t.after(() => fs.rmSync(materialized.temporaryRoot, { recursive: true, force: true }))
    assert.equal(
      applyTarget117GeneratedOwnerRecovery({ sourceRoot: materialized.sourceRoot }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117HistoricalOwnerSourceGapRecovery({
        sourceRoot: materialized.sourceRoot,
      }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117ConfirmationSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }).status,
      'recovered',
    )
    const appStateFilename = sourceFilename(
      materialized.sourceRoot,
      fixture.inputs.sourceFile.path,
    )
    readExact(appStateFilename, fixture.inputs.sourceFile.input)
    assert.equal(
      applyTarget117ReplBridgeSkipArchiveSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117ReplBridgeSkipArchiveSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }).status,
      'already-recovered',
    )

    const appStateSource = readExact(
      appStateFilename,
      fixture.inputs.sourceFile.output,
    ).toString('utf8')
    const appStateFile = parseSource(ts, appStateFilename, appStateSource)
    const defaultDeclaration = namedDeclaration(
      ts,
      appStateFile,
      fixture.row.declaration,
    )
    const sourceProperties = collectSourceProperties(ts, defaultDeclaration)
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const targetProperties = collectBundleOccurrences(
      target.slice(fixture.target[3], fixture.target[4]),
    )
    for (const [kind, value] of fixture.row.semanticIdentities) {
      assert.equal(kind, 'property')
      assert.ok((sourceProperties.get(value) ?? 0) > 0, `source owns ${value}`)
      assert.ok(
        (targetProperties.get(identity(kind, value)) ?? []).length > 0,
        `target unit contains ${value}`,
      )
    }

    const consumerFilename = sourceFilename(
      materialized.sourceRoot,
      fixture.row.falseGlobalTextMatch,
    )
    const consumerSource = fs.readFileSync(consumerFilename, 'utf8')
    const consumerFile = parseSource(ts, consumerFilename, consumerSource)
    const consumer = namedDeclaration(ts, consumerFile, 'useReplBridge')
    const consumerText = consumerSource.slice(
      consumer.getStart(consumerFile),
      consumer.end,
    )
    assert.match(consumerText, /store\.getState\(\)\.replBridgeSkipNextArchive/)
    assert.match(consumerText, /teardown\(\{ skipArchive \}\)/)
    assert.doesNotMatch(consumerText, /settings:\s*getInitialSettings\(\)/)
    assert.doesNotMatch(
      consumerText,
      /replBridgeInitialName:\s*undefined[\s\S]{0,100}replBridgeSkipNextArchive:\s*false/,
    )

    const falseOwnerFilename = sourceFilename(
      materialized.sourceRoot,
      fixture.row.falseOwner,
    )
    assert.doesNotMatch(
      fs.readFileSync(falseOwnerFilename, 'utf8'),
      /replBridgeSkipNextArchive/,
    )
  },
)
