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
  applyTarget118VirtualScrollAppendSnapshotSourceRecovery,
  TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_INPUT_FILE,
  TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OUTPUT_FILE,
  TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-virtual-scroll-append-snapshot-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-virtual-scroll-append-snapshot-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'a0ba9d785590b5bf4d8552f2413031105d54b771974eb4bd80edce406291bf65'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const configuredSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function sourceFilename(sourceRoot) {
  return path.join(
    sourceRoot,
    fixture.inputs.rawSource.file.path.slice('src/'.length),
  )
}

function gitSource() {
  const source = fixture.inputs.rawSource.file
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.rawSource.commit}:${source.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: source.bytes,
    sha256: source.sha256,
  })
  assert.equal(
    spawnSync(
      'git',
      ['rev-parse', `${fixture.inputs.rawSource.commit}:${source.path}`],
      { cwd: root, encoding: 'utf8' },
    ).stdout.trim(),
    source.blob,
  )
  return result.stdout
}

function materializeRawSource(prefix = 'target118-virtual-scroll-') {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporary, 'src')
  const filename = sourceFilename(sourceRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, gitSource())
  return { temporary, sourceRoot, filename }
}

function sourceState(sourceRoot) {
  const actual = descriptor(fs.readFileSync(sourceFilename(sourceRoot)))
  return {
    raw: sameDescriptor(actual, fixture.inputs.rawSource.file),
    recovered: sameDescriptor(actual, fixture.inputs.recoveredSource.file),
    actual,
  }
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function propertyName(node) {
  if (node?.computed) return undefined
  return node?.key?.name ?? node?.key?.value
}

function memberName(node) {
  if (node?.type !== 'MemberExpression' || node.computed) return undefined
  return node.property?.name
}

let typescriptPromise
async function loadTypeScript() {
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

function findFunction(ts, sourceFile, name) {
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, name)
  return matches[0]
}

test(
  'Target118 virtual-scroll fixture freezes exact source, target, and override inputs',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
      {
        bytes: fixture.inputs.helper.bytes,
        sha256: fixture.inputs.helper.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_INPUT_FILE,
      {
        path: fixture.inputs.rawSource.file.path,
        bytes: fixture.inputs.rawSource.file.bytes,
        sha256: fixture.inputs.rawSource.file.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OUTPUT_FILE,
      fixture.inputs.recoveredSource.file,
    )
    assert.deepEqual(
      TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.ownerOverride.evidenceIds,
          behavior: fixture.ownerOverride.behavior,
        },
      ],
    )
    assert.equal(
      sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(
        JSON.stringify(
          fixture.targetUnit.residues.map(residue => [
            fixture.targetUnit.targetIndex,
            ...residue,
          ]),
        ),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.rawSource.tree,
    )
    gitSource()
  },
)

test(
  'authenticated Target118 unit contains the complete append-snapshot optimization',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledgerBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(ledgerBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const expected = fixture.targetUnit
    const region = ledger.regions.find(
      candidate => candidate.target.index === expected.targetIndex,
    )
    assert.ok(region)
    assert.deepEqual(
      {
        classification: region.classification,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        tokenCount: region.target.tokenCount,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        classification: expected.classification,
        start: expected.start,
        end: expected.end,
        bytes: expected.bytes,
        tokenCount: expected.tokenCount,
        nodeType: expected.nodeType,
        sourceHash: expected.sourceHash,
        coarseHash: expected.coarseHash,
      },
    )
    const bytes = bundle.subarray(expected.start, expected.end)
    assert.deepEqual(descriptor(bytes), {
      bytes: expected.bytes,
      sha256: expected.sourceHash,
    })
    const unit = parse(bytes.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    }).body[0]
    assert.equal(unit.type, expected.nodeType)

    const snapshotRefs = walk(
      unit,
      node =>
        node.type === 'VariableDeclarator' &&
        node.id?.type === 'Identifier' &&
        node.init?.type === 'CallExpression' &&
        memberName(node.init.callee) === 'useRef' &&
        node.init.arguments[0]?.type === 'ObjectExpression' &&
        JSON.stringify(node.init.arguments[0].properties.map(propertyName)) ===
          JSON.stringify(['len', 'first', 'last']),
    )
    assert.equal(snapshotRefs.length, 1)
    const initializers = snapshotRefs[0].init.arguments[0].properties.map(
      property => property.value,
    )
    assert.equal(initializers[0].value, 0)
    for (const initializer of initializers.slice(1)) {
      assert.equal(initializer.type, 'UnaryExpression')
      assert.equal(initializer.operator, 'void')
      assert.equal(initializer.argument.value, 0)
    }

    const snapshotRefName = snapshotRefs[0].id.name
    const memoCalls = walk(
      unit,
      node =>
        node.type === 'CallExpression' &&
        memberName(node.callee) === 'useMemo' &&
        node.arguments[0]?.type === 'ArrowFunctionExpression' &&
        walk(
          node.arguments[0],
          child =>
            child.type === 'MemberExpression' &&
            child.object?.name === snapshotRefName &&
            memberName(child) === 'current',
        ).length === 1,
    )
    assert.equal(memoCalls.length, 1)
    const callback = memoCalls[0].arguments[0]
    const snapshotAlias = callback.body.body[0].declarations[0].id.name
    const assignments = walk(
      callback,
      node =>
        node.type === 'AssignmentExpression' &&
        node.left?.type === 'MemberExpression' &&
        node.left.object?.name === snapshotAlias,
    )
    assert.deepEqual(
      assignments.map(assignment => memberName(assignment.left)),
      ['len', 'first', 'last'],
    )
    assert.equal(assignments[0].right.property.name, 'length')
    assert.equal(assignments[2].right.type, 'CallExpression')
    assert.equal(memberName(assignments[2].right.callee), 'at')
    assert.equal(assignments[2].right.arguments[0].operator, '-')
    assert.equal(assignments[2].right.arguments[0].argument.value, 1)
    const earlyReturns = callback.body.body.filter(
      statement =>
        statement.type === 'IfStatement' &&
        statement.consequent.type === 'ReturnStatement' &&
        statement.consequent.argument === null,
    )
    assert.equal(earlyReturns.length, 1)

    for (const residue of expected.residues) {
      const [kind, value, start, end] = residue
      const text = bundle.subarray(start, end).toString()
      assert.equal(kind === 'string' ? JSON.parse(text) : text, value)
    }
  },
)

test(
  'recovered useVirtualScroll source implements the exact append-only boundary contract',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const materialized = materializeRawSource()
    try {
      assert.equal(
        applyTarget118VirtualScrollAppendSnapshotSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }).status,
        'recovered',
      )
      const bytes = fs.readFileSync(materialized.filename)
      assert.deepEqual(descriptor(bytes), {
        bytes: fixture.inputs.recoveredSource.file.bytes,
        sha256: fixture.inputs.recoveredSource.file.sha256,
      })
      const text = bytes.toString('utf8')
      const sourceFile = ts.createSourceFile(
        fixture.inputs.recoveredSource.file.path,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      const declaration = findFunction(ts, sourceFile, 'useVirtualScroll')
      const start = declaration.getStart(sourceFile)
      const end = declaration.end
      assert.deepEqual(
        {
          start,
          end,
          ...descriptor(Buffer.from(text.slice(start, end))),
        },
        {
          start: fixture.inputs.recoveredSource.declaration.start,
          end: fixture.inputs.recoveredSource.declaration.end,
          bytes: fixture.inputs.recoveredSource.declaration.bytes,
          sha256: fixture.inputs.recoveredSource.declaration.sha256,
        },
      )

      const refMatches = []
      const memoMatches = []
      function visit(node) {
        if (
          ts.isVariableDeclaration(node) &&
          node.name.getText(sourceFile) === 'previousItemKeysRef'
        ) {
          refMatches.push(node)
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(sourceFile) === 'useMemo' &&
          ts.isArrowFunction(node.arguments[0]) &&
          node.arguments[0].body.getText(sourceFile).includes(
            'previousItemKeysRef.current',
          )
        ) {
          memoMatches.push(node)
        }
        ts.forEachChild(node, visit)
      }
      visit(declaration)
      assert.equal(refMatches.length, 1)
      assert.equal(memoMatches.length, 1)
      assert.equal(
        refMatches[0].initializer.getText(sourceFile),
        'useRef<{\n    len: number\n    first: string | undefined\n    last: string | undefined\n  }>({ len: 0, first: undefined, last: undefined })',
      )

      const callback = memoMatches[0].arguments[0]
      const prefix = callback.body.statements.slice(0, 7)
      assert.deepEqual(
        prefix.map(statement => statement.getText(sourceFile)),
        [
          'const previous = previousItemKeysRef.current',
          'const first = itemKeys[0]',
          'const appendOnly =\n      itemKeys.length >= previous.len &&\n      first === previous.first &&\n      itemKeys[previous.len - 1] === previous.last',
          'previous.len = itemKeys.length',
          'previous.first = first',
          'previous.last = itemKeys.at(-1)',
          'if (appendOnly) return',
        ],
      )

      const runSnapshot = Function(
        'previousItemKeysRef',
        'itemKeys',
        `${prefix.map(statement => statement.getText(sourceFile)).join('\n')}\nreturn 'scan'`,
      )
      const previousItemKeysRef = {
        current: { len: 0, first: undefined, last: undefined },
      }
      assert.equal(runSnapshot(previousItemKeysRef, []), undefined)
      assert.deepEqual(previousItemKeysRef.current, {
        len: 0,
        first: undefined,
        last: undefined,
      })
      assert.equal(runSnapshot(previousItemKeysRef, ['a']), 'scan')
      assert.equal(runSnapshot(previousItemKeysRef, ['a', 'b']), undefined)
      assert.deepEqual(previousItemKeysRef.current, {
        len: 2,
        first: 'a',
        last: 'b',
      })
      assert.equal(runSnapshot(previousItemKeysRef, ['a', 'c']), 'scan')
      assert.equal(runSnapshot(previousItemKeysRef, ['a']), 'scan')
    } finally {
      fs.rmSync(materialized.temporary, { recursive: true, force: true })
    }
  },
)

test(
  'virtual-scroll replay is idempotent, package-aware, and fail-closed',
  { skip: !selected },
  () => {
    const raw = materializeRawSource('target118-virtual-scroll-idempotent-')
    try {
      assert.deepEqual(sourceState(raw.sourceRoot), {
        raw: true,
        recovered: false,
        actual: {
          bytes: fixture.inputs.rawSource.file.bytes,
          sha256: fixture.inputs.rawSource.file.sha256,
        },
      })
      assert.equal(
        applyTarget118VirtualScrollAppendSnapshotSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'recovered',
      )
      assert.equal(
        applyTarget118VirtualScrollAppendSnapshotSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'already-recovered',
      )
    } finally {
      fs.rmSync(raw.temporary, { recursive: true, force: true })
    }

    const mutated = materializeRawSource('target118-virtual-scroll-mutated-')
    try {
      fs.appendFileSync(mutated.filename, '\n// drift\n')
      const before = fs.readFileSync(mutated.filename)
      assert.throws(
        () =>
          applyTarget118VirtualScrollAppendSnapshotSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /source state is unknown/,
      )
      assert.deepEqual(fs.readFileSync(mutated.filename), before)
    } finally {
      fs.rmSync(mutated.temporary, { recursive: true, force: true })
    }

    const configured = sourceState(configuredSourceRoot)
    assert.ok(
      configured.raw || configured.recovered,
      `configured source must be exact raw or recovered: ${JSON.stringify(configured.actual)}`,
    )
  },
)

test(
  'virtual-scroll append-snapshot owner coverage evolves atomically',
  { skip: !selected },
  () => {
    const coverage = readCoverage()
    const owners = new Map(
      coverage.owners.map(owner => [owner.id, owner.path]),
    )
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([fixture.targetUnit.provisionalOwnerPath]) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) === JSON.stringify(fixture.ownerOverride.paths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected)
  },
)
