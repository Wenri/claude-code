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
  applyTarget117TruncatedCountSecondaryConsumerSourceRecovery,
  TARGET117_TRUNCATED_COUNT_SECONDARY_CONTEXT_FILE,
  TARGET117_TRUNCATED_COUNT_SECONDARY_FILES,
  TARGET117_TRUNCATED_COUNT_SECONDARY_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-truncated-count-secondary-consumers-source-gap.mjs'
import { TARGET117_TRUNCATED_COUNT_SOURCE } from '../cases/2.1.116-to-2.1.117/recovered/replay-truncated-count-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-truncated-count-secondary-consumers-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = '634eb46df258ba7e20a81cb7645306ac2ec4df83000dacbfb62a4c2774279fa9'
const artifactRoot = path.join(repositoryRoot, '.recovery-tmp/authenticated-artifacts')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, filename)
  return bytes
}

function fileTuple(tuple) {
  return { bytes: tuple[1], sha256: tuple[2] }
}

function rangeTuple(tuple) {
  return { bytes: tuple[2], sha256: tuple[3] }
}

function regionTuple(region) {
  return [
    region.target.index,
    region.classification,
    region.target.nodeType,
    region.target.start,
    region.target.end,
    region.target.tokenCount,
    region.target.sourceHash,
    region.target.coarseHash,
  ]
}

function sourceFilename(sourceRoot, sourcePath) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(sourcePath.startsWith('src/'))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of fixture.inputs.rawSource.files) {
    const filename = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(
      filename,
      execFileSync(
        'git',
        ['show', `${fixture.inputs.rawSource.commit}:${input.path}`],
        { cwd: repositoryRoot },
      ),
    )
  }
  const context = sourceFilename(sourceRoot, fixture.inputs.context.path)
  fs.mkdirSync(path.dirname(context), { recursive: true })
  fs.writeFileSync(context, TARGET117_TRUNCATED_COUNT_SOURCE)
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of [...fixture.inputs.rawSource.files, fixture.inputs.context]) {
    const output = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(sourceFilename(inputRoot, input.path), output)
  }
  return { temporaryRoot, sourceRoot }
}

function walkAcorn(root, visitor, parent = null) {
  if (!root || typeof root !== 'object') return
  if (typeof root.type === 'string') visitor(root, parent)
  for (const [key, value] of Object.entries(root)) {
    if (key === 'start' || key === 'end') continue
    if (Array.isArray(value)) {
      for (const child of value) walkAcorn(child, visitor, root)
    } else if (value?.type) {
      walkAcorn(value, visitor, root)
    }
  }
}

function targetDelegate(unitBytes) {
  const ast = parse(unitBytes.toString('utf8'), { ecmaVersion: 'latest' })
  const calls = []
  walkAcorn(ast, (node, parent) => {
    if (
      node.type === 'CallExpression' &&
      node.callee.property?.name === 'createElement' &&
      node.arguments[0]?.name === 'DX'
    ) calls.push({ node, parent })
  })
  assert.equal(calls.length, 1)
  return calls[0]
}

function targetProps(call, unitText) {
  const properties = Object.fromEntries(
    call.arguments[1].properties.map(property => [property.key.name, property.value]),
  )
  return {
    count: unitText.slice(properties.count.start, properties.count.end),
    unit: properties.unit.value,
  }
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function descendants(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function parseTsx(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function exactDeclaration(ts, sourceFile, source, name, tuple) {
  const declarations = descendants(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.equal(declarations.length, 1, name)
  const declaration = declarations[0]
  assert.deepEqual(
    [declaration.getStart(sourceFile), declaration.end],
    tuple.slice(0, 2),
  )
  assert.deepEqual(
    descriptor(Buffer.from(source.slice(tuple[0], tuple[1]))),
    { bytes: tuple[2], sha256: tuple[3] },
  )
  return declaration
}

function jsxProps(ts, element, sourceFile) {
  const props = {}
  for (const attribute of element.attributes.properties) {
    const name = attribute.name.getText(sourceFile)
    props[name] = ts.isStringLiteral(attribute.initializer)
      ? attribute.initializer.text
      : attribute.initializer.expression.getText(sourceFile)
  }
  return props
}

test('Target117 authenticates all three secondary consumer units and corrects u15511 owner', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(path.join(repositoryRoot, fixture.inputs.helper.path), {
    bytes: fixture.inputs.helper.bytes,
    sha256: fixture.inputs.helper.sha256,
  })
  readExact(
    path.join(artifactRoot, fixture.inputs.baselineBundle[0]),
    fileTuple(fixture.inputs.baselineBundle),
  )
  const target = readExact(
    path.join(artifactRoot, fixture.inputs.targetBundle[0]),
    fileTuple(fixture.inputs.targetBundle),
  )
  const ledger = JSON.parse(
    gunzipSync(
      readExact(
        path.join(repositoryRoot, fixture.inputs.structuralLedger[0]),
        fileTuple(fixture.inputs.structuralLedger),
      ),
    ),
  )
  for (const proof of fixture.target117) {
    const region = ledger.regions.find(region => region.target.index === proof.index)
    assert.ok(region)
    assert.deepEqual(regionTuple(region), proof.unit)
    const unitBytes = target.subarray(proof.unit[3], proof.unit[4])
    assert.equal(sha256(unitBytes), proof.unit[6])
    const callBytes = target.subarray(proof.call[0], proof.call[1])
    assert.deepEqual(descriptor(callBytes), rangeTuple(proof.call))
    const delegate = targetDelegate(unitBytes)
    assert.deepEqual(
      targetProps(delegate.node, unitBytes.toString('utf8')),
      proof.targetProps,
    )
    const [kind, value, baselineCount, occurrence, start, end] = proof.residue
    assert.equal(kind, 'property')
    assert.equal(target.subarray(start, end).toString('utf8'), value)
    assert.equal(occurrence > baselineCount, true)
    assert.equal(start >= proof.unit[3] && end <= proof.unit[4], true)
    const text = unitBytes.toString('utf8')
    if (proof.index === 15423) {
      assert.ok(text.includes('U>0&&'))
      assert.equal(delegate.parent.arguments[0].name, 'm')
    } else if (proof.index === 15511) {
      assert.equal(delegate.parent.type, 'AssignmentExpression')
      assert.ok(text.includes('_.oversizedFiles.slice(0,3)'))
    } else {
      assert.ok(text.includes('K.slice(0,4).map'))
      assert.ok(text.includes('K.length>4&&'))
      assert.equal(delegate.parent.arguments[0].name, 'm')
    }
  }
  assert.deepEqual(
    TARGET117_TRUNCATED_COUNT_SECONDARY_OWNER_OVERRIDES.map(row => [
      row.key,
      row.paths,
      row.declarations,
      row.evidenceIds,
    ]),
    fixture.target117.map(proof => [
      `${caseName}:${proof.index}`,
      [proof.owner, fixture.inputs.context.path],
      [proof.declaration, 'TruncatedCount'],
      fixture.evidenceIds,
    ]),
  )
  const falseOwner = execFileSync(
    'git',
    [
      'show',
      `${fixture.inputs.rawSource.commit}:src/components/LogoV2/OverageCreditUpsell.tsx`,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
  assert.equal(falseOwner.includes('oversizedFiles'), false)
  assert.equal(falseOwner.includes('UsageContributorsResult'), false)
})

test('recovered secondary consumers have exact declarations, imports, counts, and guards', { skip: !selected }, async () => {
  const raw = fixture.inputs.rawSource
  assert.equal(
    execFileSync('git', ['rev-parse', `${raw.commit}^{tree}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    raw.tree,
  )
  const replay = materializeRawSource('target117-secondary-count-ast-')
  try {
    const ts = await loadTypeScript()
    for (const input of raw.files) {
      assert.equal(
        execFileSync('git', ['rev-parse', `${raw.commit}:${input.path}`], {
          cwd: repositoryRoot,
          encoding: 'utf8',
        }).trim(),
        input.blob,
      )
      const bytes = readExact(sourceFilename(replay.sourceRoot, input.path), {
        bytes: input.bytes,
        sha256: input.sha256,
      })
      const source = bytes.toString('utf8')
      exactDeclaration(
        ts,
        parseTsx(ts, input.path, source),
        source,
        input.declaration,
        input.declarationTuple,
      )
    }
    assert.equal(
      applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
        sourceRoot: replay.sourceRoot,
      }).status,
      'recovered',
    )
    for (const [index, post] of fixture.inputs.postimages.entries()) {
      const proof = fixture.target117[index]
      const bytes = readExact(sourceFilename(replay.sourceRoot, post.path), {
        bytes: post.bytes,
        sha256: post.sha256,
      })
      const source = bytes.toString('utf8')
      const sourceFile = parseTsx(ts, post.path, source)
      const declaration = exactDeclaration(
        ts,
        sourceFile,
        source,
        post.declaration,
        post.declarationTuple,
      )
      const delegates = descendants(
        ts,
        declaration,
        node =>
          ts.isJsxSelfClosingElement(node) &&
          node.tagName.getText(sourceFile) === 'TruncatedCount',
      )
      assert.equal(delegates.length, 1)
      assert.deepEqual(jsxProps(ts, delegates[0], sourceFile), proof.sourceProps)
      const moduleSpecifier = post.path === 'src/components/ModelPicker.tsx'
        ? './TruncatedCount.js'
        : post.path.includes('/Settings/')
          ? '../TruncatedCount.js'
          : '../../components/TruncatedCount.js'
      assert.equal(
        sourceFile.statements.filter(
          statement =>
            ts.isImportDeclaration(statement) &&
            statement.moduleSpecifier.text === moduleSpecifier,
        ).length,
        1,
      )
      const text = declaration.getText(sourceFile)
      if (proof.index === 15423) {
        assert.ok(text.includes('hiddenCount > 0'))
        assert.ok(ts.isJsxElement(delegates[0].parent))
      } else if (proof.index === 15511) {
        assert.equal(ts.isBinaryExpression(delegates[0].parent), false)
        assert.ok(text.includes('result.oversizedFiles.slice(0, 3)'))
      } else {
        assert.ok(text.includes('unavailableIDEs.slice(0, 4).map'))
        assert.ok(text.includes('unavailableIDEs.length > 4'))
        assert.ok(ts.isJsxElement(delegates[0].parent))
      }
    }
  } finally {
    fs.rmSync(replay.temporaryRoot, { recursive: true, force: true })
  }
})

test('secondary consumer replay is ordered, dual-state, idempotent, atomic, and fail-closed', { skip: !selected }, () => {
  assert.deepEqual(TARGET117_TRUNCATED_COUNT_SECONDARY_CONTEXT_FILE, fixture.inputs.context)
  assert.deepEqual(
    TARGET117_TRUNCATED_COUNT_SECONDARY_FILES.map(file => [
      file.path,
      file.raw,
      file.postimage,
    ]),
    fixture.inputs.rawSource.files.map((raw, index) => [
      raw.path,
      { bytes: raw.bytes, sha256: raw.sha256 },
      {
        bytes: fixture.inputs.postimages[index].bytes,
        sha256: fixture.inputs.postimages[index].sha256,
      },
    ]),
  )
  const raw = materializeRawSource('target117-secondary-count-raw-')
  try {
    assert.equal(
      applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
  }

  let seed
  const selectedRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
    : (() => {
        seed = materializeRawSource('target117-secondary-count-seed-')
        applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
          sourceRoot: seed.sourceRoot,
        })
        return seed.sourceRoot
      })()
  const packaged = copySelectedSource(selectedRoot, 'target117-secondary-count-package-')
  try {
    const first = applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(first.status))
    assert.equal(
      applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    if (seed) fs.rmSync(seed.temporaryRoot, { recursive: true, force: true })
  }

  const missing = materializeRawSource('target117-secondary-count-missing-')
  try {
    fs.rmSync(sourceFilename(missing.sourceRoot, fixture.inputs.context.path))
    assert.throws(
      () => applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
        sourceRoot: missing.sourceRoot,
      }),
      /required Target117 context is absent/,
    )
  } finally {
    fs.rmSync(missing.temporaryRoot, { recursive: true, force: true })
  }

  const drift = materializeRawSource('target117-secondary-count-drift-')
  try {
    fs.appendFileSync(
      sourceFilename(drift.sourceRoot, fixture.inputs.rawSource.files[1].path),
      '\n// drift\n',
    )
    assert.throws(
      () => applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
        sourceRoot: drift.sourceRoot,
      }),
      /refusing mixed or non-Target117 state/,
    )
  } finally {
    fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
  }
})
