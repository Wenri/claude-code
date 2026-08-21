import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget118FrameUrlsStateSourceRecovery,
  TARGET118_FRAME_URLS_INPUT_FILES,
  TARGET118_FRAME_URLS_OUTPUT_FILES,
  TARGET118_FRAME_URLS_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-frame-urls-state-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-frame-urls-state-source-gap.json',
)
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function bundlePath(version) {
  const envName = `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
  return (
    process.env[envName] ??
    path.join(
      root,
      `.recovery-tmp/authenticated-artifacts/${version}-linux-x64/cli.inner.js`,
    )
  )
}

function occurrences(source, needle) {
  const offsets = []
  let offset = -1
  while ((offset = source.indexOf(needle, offset + 1)) !== -1) {
    offsets.push(offset)
  }
  return offsets
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(key)) walk(child, visit)
  }
}

function frameUrlProperties(unitBytes) {
  const ast = parse(unitBytes.toString('utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const properties = []
  walk(ast, node => {
    if (
      node.type === 'Property' &&
      !node.computed &&
      (node.key?.name === 'frameUrls' || node.key?.value === 'frameUrls')
    ) {
      properties.push(node)
    }
  })
  return properties
}

function gitSource(sourceSpec) {
  const result = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${sourceSpec.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), sourceSpec.input)
  const blob = spawnSync(
    'git',
    ['rev-parse', `${fixture.sourceCommit}:${sourceSpec.path}`],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(blob.status, 0, blob.stderr)
  assert.equal(blob.stdout.trim(), sourceSpec.blob)
  return result.stdout
}

function materializeRawSources() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'target118-frame-urls-'))
  const sourceRoot = path.join(temporary, 'src')
  for (const spec of fixture.inputs.sourceFiles) {
    const filename = path.join(sourceRoot, spec.path.slice('src/'.length))
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, gitSource(spec))
  }
  return { temporary, sourceRoot }
}

function sourceState(sourceRoot) {
  const actual = fixture.inputs.sourceFiles.map(spec =>
    descriptor(fs.readFileSync(path.join(sourceRoot, spec.path.slice(4)))),
  )
  const raw = actual.every((value, index) =>
    assertDescriptorEqual(value, fixture.inputs.sourceFiles[index].input),
  )
  const recovered = actual.every((value, index) =>
    assertDescriptorEqual(value, fixture.inputs.sourceFiles[index].output),
  )
  return { raw, recovered, actual }
}

function assertDescriptorEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

test('Target118 frameUrls fixture freezes exact source and helper inputs', () => {
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.deepEqual(
    descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
    {
      bytes: fixture.inputs.helper.bytes,
      sha256: fixture.inputs.helper.sha256,
    },
  )
  assert.deepEqual(
    TARGET118_FRAME_URLS_INPUT_FILES,
    fixture.inputs.sourceFiles.map(spec => ({ path: spec.path, ...spec.input })),
  )
  assert.deepEqual(
    TARGET118_FRAME_URLS_OUTPUT_FILES,
    fixture.inputs.sourceFiles.map(spec => ({ path: spec.path, ...spec.output })),
  )
  assert.deepEqual(
    TARGET118_FRAME_URLS_OWNER_OVERRIDES.map(row => row.targetIndex),
    fixture.targetUnits.map(unit => unit.targetIndex),
  )
  for (const spec of fixture.inputs.sourceFiles) gitSource(spec)
})

test('authenticated bundles pin all three empty frameUrls state writes', () => {
  for (const lineage of fixture.bundleOccurrenceLineage) {
    const bundle = fs.readFileSync(bundlePath(lineage.version))
    assert.deepEqual(descriptor(bundle), {
      bytes: lineage.bytes,
      sha256: lineage.sha256,
    })
    assert.deepEqual(
      occurrences(bundle.toString('utf8'), 'frameUrls'),
      lineage.offsets,
    )
  }

  const target = fs.readFileSync(bundlePath('2.1.118'))
  const ledgerBytes = fs.readFileSync(
    path.join(root, fixture.inputs.structuralLedger.path),
  )
  assert.deepEqual(descriptor(ledgerBytes), {
    bytes: fixture.inputs.structuralLedger.bytes,
    sha256: fixture.inputs.structuralLedger.sha256,
  })
  const ledger = JSON.parse(gunzipSync(ledgerBytes))
  for (const unit of [...fixture.targetUnits, fixture.supportingTargetUnit]) {
    const region = ledger.regions[unit.targetIndex]
    assert.equal(region.classification, unit.classification)
    assert.deepEqual(
      {
        index: region.target.index,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        sourceHash: region.target.sourceHash,
      },
      {
        index: unit.targetIndex,
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        sourceHash: unit.sha256,
      },
    )
    const slice = target.subarray(unit.start, unit.end)
    assert.deepEqual(descriptor(slice), {
      bytes: unit.bytes,
      sha256: unit.sha256,
    })
    const properties = frameUrlProperties(slice)
    assert.equal(properties.length, 1)
    assert.equal(properties[0].value.type, 'ObjectExpression')
    assert.equal(properties[0].value.properties.length, 0)
    assert.deepEqual(
      [
        'property',
        'frameUrls',
        unit.start + properties[0].key.start,
        unit.start + properties[0].key.end,
        unit.residue[4],
      ],
      unit.residue,
    )
  }
})

test('recovered source restores the typed default, clear, and entrypoint state graph', async () => {
  const ts = await loadTypeScript()
  const { sourceRoot } = materializeRawSources()
  assert.equal(
    applyTarget118FrameUrlsStateSourceRecovery({ sourceRoot }).status,
    'recovered',
  )

  const hits = []
  for (const spec of fixture.inputs.sourceFiles) {
    const filename = path.join(sourceRoot, spec.path.slice(4))
    const bytes = fs.readFileSync(filename)
    assert.deepEqual(descriptor(bytes), spec.output)
    const text = bytes.toString('utf8')
    const sourceFile = ts.createSourceFile(
      spec.path,
      text,
      ts.ScriptTarget.Latest,
      true,
      spec.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    function visit(node) {
      if (
        (ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) &&
        node.name?.getText(sourceFile) === 'frameUrls'
      ) {
        hits.push({ spec, node, sourceFile })
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  assert.equal(hits.length, fixture.sourceSemantics.sourceOccurrenceCount)

  const signature = hits.find(hit => ts.isPropertySignature(hit.node))
  assert.ok(signature)
  assert.equal(signature.spec.path, 'src/state/AppStateStore.ts')
  assert.equal(signature.node.type.getText(signature.sourceFile), 'Record<string, string>')
  let signatureOwner = signature.node.parent
  while (signatureOwner && !ts.isTypeAliasDeclaration(signatureOwner)) {
    signatureOwner = signatureOwner.parent
  }
  assert.ok(signatureOwner)
  assert.equal(signatureOwner.name.text, 'AppState')

  const assignments = hits.filter(hit => ts.isPropertyAssignment(hit.node))
  assert.equal(assignments.length, 3)
  for (const hit of assignments) {
    assert.ok(ts.isObjectLiteralExpression(hit.node.initializer))
    assert.equal(hit.node.initializer.properties.length, 0)
  }
  const enclosingNames = assignments.map(hit => {
    let current = hit.node.parent
    while (current) {
      if (ts.isFunctionDeclaration(current)) return current.name?.text
      current = current.parent
    }
    return undefined
  })
  assert.deepEqual(enclosingNames.sort(), [
    'clearConversation',
    'getDefaultAppState',
    'run',
  ])
  const mainAssignment = assignments.find(hit => hit.spec.path === 'src/main.tsx')
  let ancestor = mainAssignment.node.parent
  while (ancestor && !ts.isVariableDeclaration(ancestor)) ancestor = ancestor.parent
  assert.ok(ancestor)
  assert.equal(ancestor.name.getText(mainAssignment.sourceFile), 'initialState')
})

test('frameUrls replay is atomic, idempotent, package-aware, and fail-closed', () => {
  const raw = materializeRawSources()
  assert.deepEqual(sourceState(raw.sourceRoot), {
    raw: true,
    recovered: false,
    actual: fixture.inputs.sourceFiles.map(spec => spec.input),
  })
  assert.equal(
    applyTarget118FrameUrlsStateSourceRecovery({ sourceRoot: raw.sourceRoot })
      .status,
    'recovered',
  )
  assert.equal(
    applyTarget118FrameUrlsStateSourceRecovery({ sourceRoot: raw.sourceRoot })
      .status,
    'already-recovered',
  )

  const mixed = materializeRawSources()
  applyTarget118FrameUrlsStateSourceRecovery({ sourceRoot: mixed.sourceRoot })
  const rawMain = gitSource(
    fixture.inputs.sourceFiles.find(spec => spec.path === 'src/main.tsx'),
  )
  fs.writeFileSync(path.join(mixed.sourceRoot, 'main.tsx'), rawMain)
  assert.throws(
    () =>
      applyTarget118FrameUrlsStateSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      }),
    /mixed or unknown/,
  )

  const mutated = materializeRawSources()
  applyTarget118FrameUrlsStateSourceRecovery({ sourceRoot: mutated.sourceRoot })
  fs.appendFileSync(path.join(mutated.sourceRoot, 'state/AppStateStore.ts'), '// drift\n')
  assert.throws(
    () =>
      applyTarget118FrameUrlsStateSourceRecovery({
        sourceRoot: mutated.sourceRoot,
      }),
    /mixed or unknown/,
  )

  const configuredRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (configuredRoot) {
    const configured = sourceState(configuredRoot)
    assert.ok(configured.raw || configured.recovered)
  }
})
