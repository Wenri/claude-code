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
  TARGET117_WORKER_PENDING_PERMISSION_EVIDENCE_IDS,
  TARGET117_WORKER_PENDING_PERMISSION_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/worker-pending-permission-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-worker-pending-permission-owner-proof.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f2d40c90b6eef2fb37453a10d4928199a10cafdcdccb464327022fdcdd6a6d19'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)
const COMPOSED_TEXT = ' Waiting for team lead approval'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, label)
  return bytes
}

function tupleDescriptor(tuple) {
  return { bytes: tuple[1], sha256: tuple[2] }
}

function regionTuple(region) {
  const target = region.target
  return [
    target.index,
    region.classification,
    target.nodeType,
    target.start,
    target.end,
    target.tokenCount,
    target.sourceHash,
    target.coarseHash,
  ]
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
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

function walkAcorn(root, visitor, parent = null) {
  if (!root || typeof root !== 'object') return
  if (typeof root.type === 'string') visitor(root, parent)
  for (const [key, value] of Object.entries(root)) {
    if (key === 'start' || key === 'end') continue
    if (Array.isArray(value)) {
      for (const child of value) walkAcorn(child, visitor, root)
    } else if (value && typeof value === 'object' && value.type) {
      walkAcorn(value, visitor, root)
    }
  }
}

test('Target117 authenticates the worker-pending title fragment and sole owner override', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(
    path.join(repositoryRoot, fixture.inputs.overrideModule.path),
    {
      bytes: fixture.inputs.overrideModule.bytes,
      sha256: fixture.inputs.overrideModule.sha256,
    },
  )

  const baseline = readExact(
    path.join(artifactRoot, fixture.inputs.baselineBundle[0]),
    tupleDescriptor(fixture.inputs.baselineBundle),
  )
  assert.equal(countOccurrences(baseline.toString('utf8'), COMPOSED_TEXT), 0)
  const target = readExact(
    path.join(artifactRoot, fixture.inputs.targetBundle[0]),
    tupleDescriptor(fixture.inputs.targetBundle),
  )
  const ledgerBytes = readExact(
    path.join(repositoryRoot, fixture.inputs.structuralLedger[0]),
    tupleDescriptor(fixture.inputs.structuralLedger),
  )
  const ledger = JSON.parse(gunzipSync(ledgerBytes))
  const region = ledger.regions.find(
    row => row.target.index === fixture.target117.unit[0],
  )
  assert.ok(region)
  assert.deepEqual(regionTuple(region), fixture.target117.unit)
  assert.equal(
    sha256(target.subarray(region.target.start, region.target.end)),
    region.target.sourceHash,
  )

  const [fragmentStart, fragmentEnd, fragmentBytes, fragmentHash] =
    fixture.target117.titleFragment
  assert.deepEqual(descriptor(target.subarray(fragmentStart, fragmentEnd)), {
    bytes: fragmentBytes,
    sha256: fragmentHash,
  })
  const residue = fixture.target117.residue
  assert.equal(
    target.subarray(residue[2], residue[3]).toString('utf8'),
    `"${COMPOSED_TEXT}"`,
  )

  assert.deepEqual(
    TARGET117_WORKER_PENDING_PERMISSION_OWNER_OVERRIDES.map(row => [
      row.key,
      row.targetIndex,
      row.paths,
      row.declarations,
      row.evidenceIds,
    ]),
    [[
      `${caseName}:18545`,
      18545,
      [fixture.inputs.source.path],
      ['WorkerPendingPermission'],
      fixture.evidenceIds,
    ]],
  )
  assert.deepEqual(
    TARGET117_WORKER_PENDING_PERMISSION_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
})

test('authenticated target title composes Spinner then one exact leading-space Text child', { skip: !selected }, () => {
  const target = readExact(
    path.join(artifactRoot, fixture.inputs.targetBundle[0]),
    tupleDescriptor(fixture.inputs.targetBundle),
  )
  const [unitIndex, , , start, end] = fixture.target117.unit
  const source = target.subarray(start, end).toString('utf8')
  const ast = parse(source, { ecmaVersion: 'latest' })
  let textCall
  let fragmentCall
  walkAcorn(ast, (node, parent) => {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property.name === 'createElement' &&
      node.arguments.some(
        argument => argument.type === 'Literal' && argument.value === COMPOSED_TEXT,
      )
    ) {
      assert.equal(textCall, undefined, `u${unitIndex} duplicate text call`)
      textCall = node
      assert.equal(parent.type, 'CallExpression')
      fragmentCall = parent
    }
  })
  assert.ok(textCall)
  assert.equal(textCall.arguments.length, 3)
  assert.equal(textCall.arguments[0].type, 'Identifier')
  assert.equal(textCall.arguments[1].value, null)
  assert.equal(textCall.arguments[2].value, COMPOSED_TEXT)
  assert.ok(fragmentCall.arguments.includes(textCall))
  assert.equal(fragmentCall.arguments.length, 4)
  const spinnerCall = fragmentCall.arguments[2]
  assert.equal(spinnerCall.type, 'CallExpression')
  assert.equal(spinnerCall.callee.property.name, 'createElement')
  assert.equal(spinnerCall.arguments.length, 2)
  assert.equal(spinnerCall.arguments[1].value, null)
})

test('raw and packaged WorkerPendingPermission source own the same composed JSX text', { skip: !selected }, async () => {
  const sourceInput = fixture.inputs.source
  assert.equal(
    execFileSync('git', ['rev-parse', `${sourceInput.commit}^{tree}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    sourceInput.tree,
  )
  assert.equal(
    execFileSync(
      'git',
      ['rev-parse', `${sourceInput.commit}:${sourceInput.path}`],
      { cwd: repositoryRoot, encoding: 'utf8' },
    ).trim(),
    sourceInput.blob,
  )
  const raw = execFileSync(
    'git',
    ['show', `${sourceInput.commit}:${sourceInput.path}`],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(raw), {
    bytes: sourceInput.bytes,
    sha256: sourceInput.sha256,
  })

  const selectedSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
    : path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src')
  const packaged = readExact(
    path.join(selectedSourceRoot, sourceInput.path.slice(4)),
    { bytes: sourceInput.bytes, sha256: sourceInput.sha256 },
  )

  const ts = await loadTypeScript()
  for (const bytes of [raw, packaged]) {
    const sourceFile = ts.createSourceFile(
      sourceInput.path,
      bytes.toString('utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    const declarations = descendants(
      ts,
      sourceFile,
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'WorkerPendingPermission',
    )
    assert.equal(declarations.length, 1)
    const declaration = declarations[0]
    const [start, end, byteCount, hash] = sourceInput.declaration
    assert.deepEqual(
      [
        declaration.getStart(sourceFile),
        declaration.end,
        ...Object.values(descriptor(bytes.subarray(start, end))),
      ],
      sourceInput.declaration,
    )

    const titleTexts = descendants(
      ts,
      declaration,
      node => {
        if (!ts.isJsxElement(node)) return false
        const name = node.openingElement.tagName.getText(sourceFile)
        if (name !== 'Text') return false
        const pieces = node.children.map(child => {
          if (ts.isJsxText(child)) return child.text
          if (
            ts.isJsxExpression(child) &&
            child.expression &&
            ts.isStringLiteral(child.expression)
          ) {
            return child.expression.text
          }
          return null
        })
        return pieces.every(piece => piece !== null) && pieces.join('') === COMPOSED_TEXT
      },
    )
    assert.equal(titleTexts.length, 1)
    const title = titleTexts[0]
    assert.equal(
      title.children.map(child =>
        ts.isJsxText(child) ? child.text : child.expression.text,
      ).join(''),
      COMPOSED_TEXT,
    )
    const containingBox = title.parent
    assert.ok(ts.isJsxElement(containingBox))
    assert.equal(containingBox.openingElement.tagName.getText(sourceFile), 'Box')
    assert.equal(
      containingBox.children.some(
        child =>
          ts.isJsxSelfClosingElement(child) &&
          child.tagName.getText(sourceFile) === 'Spinner',
      ),
      true,
    )
  }
})
