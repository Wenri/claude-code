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
  applyTarget117RetainedFullscreenInteractionSourceRecovery,
  TARGET117_RETAINED_FULLSCREEN_INPUT_FILES,
  TARGET117_RETAINED_FULLSCREEN_OUTPUT_FILES,
  TARGET117_RETAINED_FULLSCREEN_OWNER_OVERRIDES,
  TARGET117_RETAINED_FULLSCREEN_PATCH_INPUT,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-retained-fullscreen-interaction-source-gaps.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-retained-fullscreen-interaction-source-gaps.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '94c072f38ab70c42214c9e55b9ca79d94b767876661bf9622758bf56eb5b0690'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)
const defaultHistoricalSourceRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.117/src',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
}

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(root, sourcePath) {
  assert.match(sourcePath, /^src\//)
  const absoluteRoot = path.resolve(root)
  const filename = path.resolve(absoluteRoot, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${absoluteRoot}${path.sep}`))
  return filename
}

function materializeRawTargetSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const archive = path.join(temporaryRoot, 'source.tar')
  execFileSync(
    'git',
    [
      'archive',
      '--format=tar',
      `--output=${archive}`,
      fixture.sourceCommit,
      'src',
    ],
    { cwd: repositoryRoot, stdio: 'ignore' },
  )
  execFileSync('tar', ['-xf', archive, '-C', temporaryRoot], {
    stdio: 'ignore',
  })
  fs.unlinkSync(archive)
  return { temporaryRoot, sourceRoot: path.join(temporaryRoot, 'src') }
}

function copyReplaySource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const copiedSourceRoot = path.join(temporaryRoot, 'src')
  for (const item of fixture.sourceFiles) {
    const from = sourceFilename(sourceRoot, item.path)
    const to = sourceFilename(copiedSourceRoot, item.path)
    if (!fs.existsSync(from)) continue
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }
  return { temporaryRoot, sourceRoot: copiedSourceRoot }
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

function collectBundleProperties(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const properties = new Map()
  function add(name, node) {
    const occurrences = properties.get(name) ?? []
    occurrences.push({ start: node.start, end: node.end })
    properties.set(name, occurrences)
  }
  walk(ast, node => {
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
    if (property) add(property.name, property)
  })
  for (const occurrences of properties.values()) {
    occurrences.sort((left, right) => left.start - right.start)
  }
  return properties
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

function authenticateRecoveredSources(ts, sourceRoot) {
  const declarations = new Map()
  for (const item of fixture.sourceFiles) {
    const filename = sourceFilename(sourceRoot, item.path)
    const bytes = readExact(filename, item.output, `recovered ${item.path}`)
    const source = bytes.toString('utf8')
    const sourceFile = parseSource(ts, item.path, source)
    for (const expected of item.declarations) {
      const [name, nodeType, start, end, declarationBytes, declarationSha256] =
        expected
      const declaration = namedDeclaration(ts, sourceFile, name)
      assert.equal(ts.SyntaxKind[declaration.kind], nodeType, `${name}: kind`)
      assert.equal(declaration.getStart(sourceFile), start, `${name}: start`)
      assert.equal(declaration.end, end, `${name}: end`)
      const slice = Buffer.from(source.slice(start, end))
      assert.deepEqual(descriptor(slice), {
        bytes: declarationBytes,
        sha256: declarationSha256,
      }, `${name}: exact declaration`)
      declarations.set(name, source.slice(start, end))
    }
  }

  assert.match(declarations.get('CoordinatorTaskPanel'), /const selectedTask =/)
  assert.match(declarations.get('CoordinatorTaskPanel'), /const hint = selectedTask \? \(/)
  assert.match(declarations.get('CoordinatorTaskPanel'), /hint=\{hint\}/)
  assert.match(declarations.get('CoordinatorTaskPanel'), /labelWidth=\{labelWidth\}/)
  assert.match(declarations.get('MainLine'), /justifyContent="space-between"/)

  assert.match(declarations.get('getPromptSelectionOffsets'), /start\.row < container\.y/)
  assert.match(declarations.get('getPromptSelectionOffsets'), /col - container\.x/)
  assert.match(declarations.get('getPromptSelectionOffsets'), /end\.col \+ 1/)
  assert.match(declarations.get('PromptInput'), /selectionDeleteHandlerRef\.current = selection =>/)
  assert.match(declarations.get('PromptInput'), /input\.slice\(0, offsets\.start\) \+ input\.slice\(offsets\.end\)/)
  assert.match(declarations.get('PromptInput'), /selectionDelete\.setHandler/)
  assert.match(declarations.get('PromptInput'), /ref=\{inputContainerRef\}/)
  assert.match(declarations.get('App'), /<SelectionDeleteProvider>\{children\}<\/SelectionDeleteProvider>/)
  assert.match(declarations.get('ScrollKeybindingHandler'), /selectionDelete\.tryDelete\(state\)/)
  assert.match(declarations.get('ScrollKeybindingHandler'), /selection\.clearSelection\(\)/)
  assert.match(declarations.get('SelectionDeleteProvider'), /handlerRef\.current\?\.\(selection\) \?\? false/)
}

test(
  '2.1.117 retained-fullscreen fixture pins the prior supplement and exact generator wiring',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 2,
      residues: 5,
      recoveredFiles: 5,
      ownerOverrides: 2,
      rejectedFalseOrGlobalOwners: 16,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
    )
    readExact(
      path.join(repositoryRoot, fixture.inputs.retainedSupplement.path),
      fixture.inputs.retainedSupplement,
    )
    assert.deepEqual(
      TARGET117_RETAINED_FULLSCREEN_PATCH_INPUT,
      fixture.inputs.retainedSupplement,
    )
    assert.deepEqual(
      TARGET117_RETAINED_FULLSCREEN_INPUT_FILES,
      fixture.sourceFiles
        .filter(item => item.input)
        .map(item => ({ path: item.path, ...item.input })),
    )
    assert.deepEqual(
      TARGET117_RETAINED_FULLSCREEN_OUTPUT_FILES,
      fixture.sourceFiles.map(item => ({ path: item.path, ...item.output })),
    )
    assert.equal(typeof applyTarget117RetainedFullscreenInteractionSourceRecovery, 'function')
    assert.deepEqual(
      TARGET117_RETAINED_FULLSCREEN_OWNER_OVERRIDES.map(override => ({
        targetIndex: override.targetIndex,
        paths: override.paths,
        declarations: override.declarations,
        evidenceIds: override.evidenceIds,
      })),
      fixture.rows.map(row => ({
        targetIndex: row.targetIndex,
        paths: [row.owner],
        declarations: row.declarations,
        evidenceIds: fixture.evidenceIds,
      })),
    )
    for (const override of TARGET117_RETAINED_FULLSCREEN_OWNER_OVERRIDES) {
      assert.ok(override.behavior.length > 0)
      assert.match(override.key, /^2\.1\.116-to-2\.1\.117:\d+$/)
    }
    assert.equal(
      fixture.wiring.helperExport,
      'applyTarget117RetainedFullscreenInteractionSourceRecovery',
    )
    assert.equal(
      fixture.wiring.overrideExport,
      'TARGET117_RETAINED_FULLSCREEN_OWNER_OVERRIDES',
    )
  },
)

test(
  '2.1.117 bundles authenticate both complete units and row-local semantic fragments',
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
    const baselineProperties = collectBundleProperties(baseline)
    const targetProperties = collectBundleProperties(target)

    for (const row of fixture.rows) {
      const [
        classification,
        nodeType,
        start,
        end,
        tokenCount,
        sourceHash,
        coarseHash,
      ] = row.target
      const region = structural.regions.find(
        candidate => candidate.target.index === row.targetIndex,
      )
      assert.ok(region, `u${row.targetIndex}: structural region`)
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
      assert.deepEqual(descriptor(Buffer.from(unit)), {
        bytes: end - start,
        sha256: sourceHash,
      }, `u${row.targetIndex}: exact full unit`)
      const unitAst = parse(unit, {
        ecmaVersion: 'latest',
        sourceType: 'module',
      })
      assert.equal(unitAst.body.length, 1)
      assert.equal(unitAst.body[0].type, nodeType)

      const [witnessStart, witnessEnd, witnessBytes, witnessSha256] =
        row.targetWitness
      assert.ok(witnessStart >= start && witnessEnd <= end)
      const witness = target.slice(witnessStart, witnessEnd)
      assert.deepEqual(descriptor(Buffer.from(witness)), {
        bytes: witnessBytes,
        sha256: witnessSha256,
      }, `u${row.targetIndex}: row-local witness`)
      for (const [kind, value, residueStart, residueEnd, baselineCount, targetNumber] of row.residues) {
        assert.equal(kind, 'property')
        assert.ok(residueStart >= witnessStart && residueEnd <= witnessEnd)
        const baselineOccurrences = baselineProperties.get(value) ?? []
        const targetOccurrences = targetProperties.get(value) ?? []
        assert.equal(baselineOccurrences.length, baselineCount, `${value}: baseline count`)
        assert.deepEqual(
          targetOccurrences[targetNumber - 1],
          { start: residueStart, end: residueEnd },
          `${value}: exact target occurrence ${targetNumber}`,
        )
      }

      for (const rejected of row.rejectedOwners) {
        assert.notEqual(rejected, row.owner)
      }
    }
    const coordinatorWitness = target.slice(...fixture.rows[0].targetWitness.slice(0, 2))
    assert.match(coordinatorWitness, /hint:Z,labelWidth:X/)
    assert.match(coordinatorWitness, /chord:\["up","down"\]/)
    assert.match(coordinatorWitness, /action:y68\(W\.status\)\?"clear":"stop"/)
    const promptWitness = target.slice(...fixture.rows[1].targetWitness.slice(0, 2))
    assert.match(promptWitness, /getOffsetFromPosition/)
    assert.match(promptWitness, /N_\.row<wq\.y/)
    assert.match(promptWitness, /Fm-wq\.x/)
    assert.match(promptWitness, /fH\.slice\(0,Ak\)\+fH\.slice\(cG\)/)
    assert.match(promptWitness, /setHandler/)
  },
)

test(
  '2.1.117 retained fullscreen replay is exact, idempotent, and dual-state',
  { skip: !selected },
  async t => {
    const ts = await loadTypeScript()
    const raw = materializeRawTargetSource('target117-retained-fullscreen-raw-')
    t.after(() => fs.rmSync(raw.temporaryRoot, { recursive: true, force: true }))
    for (const item of fixture.sourceFiles) {
      const filename = sourceFilename(raw.sourceRoot, item.path)
      if (item.input) readExact(filename, item.input, `raw ${item.path}`)
      else assert.equal(fs.existsSync(filename), false, `${item.path}: absent raw`)
    }
    assert.deepEqual(
      applyTarget117RetainedFullscreenInteractionSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }),
      { status: 'recovered', files: 5, ownerOverrides: 2 },
    )
    assert.deepEqual(
      applyTarget117RetainedFullscreenInteractionSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }),
      { status: 'already-recovered', files: 5, ownerOverrides: 2 },
    )
    authenticateRecoveredSources(ts, raw.sourceRoot)

    const historicalSourceRoot = path.resolve(
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        defaultHistoricalSourceRoot,
    )
    assert.ok(fs.existsSync(historicalSourceRoot), 'historical source root exists')
    const historical = copyReplaySource(
      historicalSourceRoot,
      'target117-retained-fullscreen-package-',
    )
    t.after(() =>
      fs.rmSync(historical.temporaryRoot, { recursive: true, force: true }),
    )
    const first = applyTarget117RetainedFullscreenInteractionSourceRecovery({
      sourceRoot: historical.sourceRoot,
    })
    assert.ok(
      first.status === 'recovered' || first.status === 'already-recovered',
      `historical state: ${first.status}`,
    )
    assert.equal(
      applyTarget117RetainedFullscreenInteractionSourceRecovery({
        sourceRoot: historical.sourceRoot,
      }).status,
      'already-recovered',
    )
    authenticateRecoveredSources(ts, historical.sourceRoot)
  },
)

test(
  '2.1.117 retained fullscreen replay fails closed on mutation and excludes global-text owners',
  { skip: !selected },
  t => {
    const mutated = materializeRawTargetSource(
      'target117-retained-fullscreen-mutated-',
    )
    t.after(() =>
      fs.rmSync(mutated.temporaryRoot, { recursive: true, force: true }),
    )
    const prompt = sourceFilename(
      mutated.sourceRoot,
      'src/components/PromptInput/PromptInput.tsx',
    )
    const original = fs.readFileSync(prompt)
    fs.writeFileSync(prompt, Buffer.concat([original, Buffer.from('\n')]))
    assert.throws(
      () =>
        applyTarget117RetainedFullscreenInteractionSourceRecovery({
          sourceRoot: mutated.sourceRoot,
        }),
      /mixed or non-target fullscreen interaction source state/,
    )
    assert.equal(
      fs.existsSync(
        sourceFilename(mutated.sourceRoot, 'src/context/selectionDelete.tsx'),
      ),
      false,
      'failed replay creates no context file',
    )
    const admitted = new Set(
      TARGET117_RETAINED_FULLSCREEN_OWNER_OVERRIDES.flatMap(
        override => override.paths,
      ),
    )
    assert.deepEqual(
      [...admitted].sort(),
      [
        'src/components/CoordinatorAgentStatus.tsx',
        'src/components/PromptInput/PromptInput.tsx',
      ],
    )
    for (const row of fixture.rows) {
      for (const rejected of row.rejectedOwners) {
        assert.equal(admitted.has(rejected), false, `${rejected}: not admitted`)
      }
    }
    assert.match(fixture.wiring.order, /raw ff0339d source/)
    assert.match(fixture.wiring.order, /append the two exact owner overrides/)
  },
)
