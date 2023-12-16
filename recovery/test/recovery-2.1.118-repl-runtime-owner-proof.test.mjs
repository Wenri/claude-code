import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_REPL_RUNTIME_EVIDENCE_IDS,
  TARGET118_REPL_RUNTIME_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/repl-runtime-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-repl-runtime-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = '1ee4a0c9a5dccc0e7198bb383007d913b9cca822b6f9128bcde7e01952b96fc9'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function readPinned(input, base = root) {
  const value = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function tokenValue(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'string') {
    return `string:${JSON.stringify(token.value)}`
  }
  if (token.type.label === 'num') return `num:${token.value}`
  if (token.type.label === 'regexp') {
    return `regexp:/${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function normalizedTokens(source) {
  const values = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    values.push(tokenValue(token))
  }
  return {
    tokens: values.length,
    text: `${values.join('\n')}\n`,
  }
}

function semanticCounts(source, expected) {
  const counts = Object.fromEntries(Object.keys(expected).map(value => [value, 0]))
  const propertyNames = new Set([
    'cancel',
    'remote',
    'transcriptSource',
    'dirname',
    'focus',
    'activeElement',
    'preventDefault',
    'handleKeyDown',
    'onKeyDownCapture',
    'tabIndex',
  ])
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  const walk = node => {
    if (!node || typeof node !== 'object') return
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      Object.hasOwn(counts, node.value)
    ) {
      counts[node.value] += 1
    }
    if (
      (node.type === 'Property' || node.type === 'MethodDefinition') &&
      !node.computed
    ) {
      const name = node.key?.type === 'Identifier' ? node.key.name : node.key?.value
      if (propertyNames.has(name)) counts[name] += 1
    }
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier' &&
      propertyNames.has(node.property.name)
    ) {
      counts[node.property.name] += 1
    }
    for (const [key, value] of Object.entries(node)) {
      if (['end', 'loc', 'raw', 'start'].includes(key)) continue
      if (Array.isArray(value)) value.forEach(walk)
      else walk(value)
    }
  }
  walk(ast)
  return counts
}

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

function gitBytes(commit, sourcePath) {
  const result = spawnSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: root,
    encoding: null,
    maxBuffer: 1024 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

function findFunction(ts, source, input) {
  const sourceFile = ts.createSourceFile(
    input.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, input.path)
  const matches = []
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === input.declaration.name) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, input.declaration.name)
  const declaration = matches[0]
  assert.equal(declaration.getStart(sourceFile), input.declaration.start)
  assert.equal(declaration.end, input.declaration.end)
  assert.deepEqual(
    descriptor(
      Buffer.from(
        source.slice(input.declaration.start, input.declaration.end),
      ),
    ),
    {
      bytes: input.declaration.bytes,
      sha256: input.declaration.sha256,
    },
  )
  return { sourceFile, declaration }
}

test(
  'Target118 REPL fixture and override are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    for (const input of Object.values(fixture.inputs)) readPinned(input)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-whole-unit-proof-source-replay-blocked',
    )
    assert.deepEqual(TARGET118_REPL_RUNTIME_EVIDENCE_IDS, fixture.evidenceIds)
    assert.deepEqual(
      TARGET118_REPL_RUNTIME_OWNER_OVERRIDES.map(row => ({
        key: row.key,
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          key: `${caseName}:${fixture.targetUnit.targetIndex}`,
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.ownerOverride.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior: fixture.targetUnit.behavior,
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
          fixture.targetUnit.residues.map(row => [
            fixture.targetUnit.targetIndex,
            ...row,
          ]),
        ),
      ),
      fixture.summary.strictResidueIdentitiesSha256,
    )
    const baselineProof = JSON.parse(
      fs.readFileSync(path.join(root, fixture.inputs.baselineProofFixture.path)),
    )
    assert.equal(baselineProof.targetUnit.targetIndex, fixture.baselineUnit.targetIndex)
    assert.equal(baselineProof.targetUnit.start, fixture.baselineUnit.start)
    assert.equal(baselineProof.targetUnit.end, fixture.baselineUnit.end)
    assert.equal(baselineProof.targetUnit.sha256, fixture.baselineUnit.sha256)
  },
)

test(
  'authenticated complete units and every strict REPL residue are exact',
  { skip: !selected },
  () => {
    const baselineBundle = readPinned(fixture.inputs.baselineBundle)
    const targetBundle = readPinned(fixture.inputs.targetBundle)
    const baseline = baselineBundle.subarray(
      fixture.baselineUnit.start,
      fixture.baselineUnit.end,
    )
    const target = targetBundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    assert.deepEqual(descriptor(baseline), {
      bytes: fixture.baselineUnit.bytes,
      sha256: fixture.baselineUnit.sha256,
    })
    assert.deepEqual(descriptor(target), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sha256,
    })
    for (const [value, unit] of [
      [baseline, fixture.baselineUnit],
      [target, fixture.targetUnit],
    ]) {
      const ast = parse(value.toString(), {
        ecmaVersion: 'latest',
        sourceType: 'script',
      })
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, unit.nodeType)
    }
    for (const row of fixture.targetUnit.residues) {
      assert.equal(
        targetBundle.subarray(row[2], row[3]).toString(),
        row[0] === 'string' ? JSON.stringify(row[1]) : row[1],
      )
    }
    for (const fragment of Object.values(fixture.targetSemanticFragments)) {
      const value = targetBundle.subarray(fragment.start, fragment.end)
      assert.deepEqual(descriptor(value), {
        bytes: fragment.bytes,
        sha256: fragment.sha256,
      })
      assert.equal(
        fragment.start >= fixture.targetUnit.start &&
          fragment.end <= fixture.targetUnit.end,
        true,
      )
    }
    assert.deepEqual(
      semanticCounts(baseline.toString(), fixture.withinUnitSemanticCounts.baseline),
      fixture.withinUnitSemanticCounts.baseline,
    )
    assert.deepEqual(
      semanticCounts(target.toString(), fixture.withinUnitSemanticCounts.target),
      fixture.withinUnitSemanticCounts.target,
    )
  },
)

test(
  'complete normalized REPL transition is exactly twenty pinned hunks',
  { skip: !selected },
  t => {
    const baselineBundle = fs.readFileSync(fixture.inputs.baselineBundle.path)
    const targetBundle = fs.readFileSync(fixture.inputs.targetBundle.path)
    const baseline = normalizedTokens(
      baselineBundle
        .subarray(fixture.baselineUnit.start, fixture.baselineUnit.end)
        .toString(),
    )
    const target = normalizedTokens(
      targetBundle
        .subarray(fixture.targetUnit.start, fixture.targetUnit.end)
        .toString(),
    )
    assert.equal(baseline.tokens, fixture.normalizedTransition.baseline.tokens)
    assert.equal(target.tokens, fixture.normalizedTransition.target.tokens)
    assert.deepEqual(descriptor(Buffer.from(baseline.text)), {
      bytes: fixture.normalizedTransition.baseline.bytes,
      sha256: fixture.normalizedTransition.baseline.sha256,
    })
    assert.deepEqual(descriptor(Buffer.from(target.text)), {
      bytes: fixture.normalizedTransition.target.bytes,
      sha256: fixture.normalizedTransition.target.sha256,
    })

    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'target118-repl.'))
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
    const baselinePath = path.join(temporary, 'baseline.tokens')
    const targetPath = path.join(temporary, 'target.tokens')
    fs.writeFileSync(baselinePath, baseline.text)
    fs.writeFileSync(targetPath, target.text)
    const result = spawnSync(
      'diff',
      [
        '--label',
        'baseline',
        '--label',
        'target',
        '-U',
        '0',
        baselinePath,
        targetPath,
      ],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 1)
    assert.equal(result.stderr, '')
    assert.deepEqual(descriptor(Buffer.from(result.stdout)), {
      bytes: fixture.normalizedTransition.diff.bytes,
      sha256: fixture.normalizedTransition.diff.sha256,
    })
    assert.equal(
      result.stdout.match(/^@@/gm)?.length,
      fixture.normalizedTransition.diff.hunks,
    )
    assert.equal(
      result.stdout.match(/^\+[^+]/gm)?.length,
      fixture.normalizedTransition.diff.addedTokenLines,
    )
    assert.equal(
      result.stdout.match(/^-[^-]/gm)?.length,
      fixture.normalizedTransition.diff.removedTokenLines,
    )
  },
)

test(
  'complete scanner partition is pinned and only transcript-source values are new in-unit',
  { skip: !selected },
  () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
        ),
      ),
    )
    const allRows = report.sourceRuntimeOwnerResidueRows
      .filter(row => row.structural.index === fixture.targetUnit.targetIndex)
      .map(row => [
        row.literalKind,
        row.value,
        row.target.start,
        row.target.end,
        row.baselineOccurrenceCount,
        row.targetOccurrenceNumber,
        row.targetAdded,
      ])
    assert.equal(allRows.length, fixture.summary.completeOwnerRows)
    assert.deepEqual(descriptor(Buffer.from(JSON.stringify(allRows))), {
      bytes: fixture.summary.completeOwnerRowsBytes,
      sha256: fixture.summary.completeOwnerRowsSha256,
    })
    assert.deepEqual(
      allRows.filter(row => row[6]).map(row => row.slice(0, 6)),
      fixture.targetUnit.residues,
    )
    const addedWithinUnit = Object.entries(fixture.withinUnitSemanticCounts.target)
      .filter(([name, count]) =>
        count > fixture.withinUnitSemanticCounts.baseline[name],
      )
      .map(([name]) => name)
    assert.deepEqual(addedWithinUnit, [
      'ccr-api',
      'local-jsonl',
      'transcriptSource',
    ])
  },
)

test(
  'historical REPL lineage authenticates ownership and rejects a partial replay',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    for (const input of [fixture.sourceLineage.baseline, fixture.sourceLineage.target]) {
      const tree = spawnSync('git', ['rev-parse', `${input.commit}^{tree}`], {
        cwd: root,
        encoding: 'utf8',
      })
      assert.equal(tree.status, 0, tree.stderr)
      assert.equal(tree.stdout.trim(), input.tree)
      const blob = spawnSync('git', ['rev-parse', `${input.commit}:${input.path}`], {
        cwd: root,
        encoding: 'utf8',
      })
      assert.equal(blob.status, 0, blob.stderr)
      assert.equal(blob.stdout.trim(), input.blob)
      const bytes = gitBytes(input.commit, input.path)
      assert.deepEqual(descriptor(bytes), {
        bytes: input.bytes,
        sha256: input.sha256,
      })
      findFunction(ts, bytes.toString(), input)
    }

    const sourceDiff = spawnSync('git', fixture.sourceLineage.diff.args, {
      cwd: root,
      encoding: null,
      maxBuffer: 1024 * 1024 * 1024,
    })
    assert.equal(sourceDiff.status, 0, sourceDiff.stderr?.toString())
    assert.deepEqual(descriptor(sourceDiff.stdout), {
      bytes: fixture.sourceLineage.diff.bytes,
      sha256: fixture.sourceLineage.diff.sha256,
    })
    assert.equal(
      sourceDiff.stdout.toString().match(/^@@/gm)?.length,
      fixture.sourceLineage.diff.hunks,
    )
    const numstat = spawnSync(
      'git',
      [
        'diff',
        '--numstat',
        fixture.sourceLineage.baseline.commit,
        fixture.sourceLineage.target.commit,
        '--',
        fixture.sourceLineage.target.path,
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(numstat.status, 0, numstat.stderr)
    assert.equal(
      numstat.stdout,
      `${fixture.sourceLineage.diff.insertions}\t${fixture.sourceLineage.diff.deletions}\t${fixture.sourceLineage.target.path}\n`,
    )

    const packaged = fs.readFileSync(
      path.join(sourceRoot, fixture.sourceLineage.target.path.slice(4)),
    )
    assert.deepEqual(descriptor(packaged), {
      bytes: fixture.sourceLineage.target.bytes,
      sha256: fixture.sourceLineage.target.sha256,
    })
    const packagedText = packaged.toString()
    findFunction(ts, packagedText, fixture.sourceLineage.target)
    for (const absent of [
      'ccr-api',
      'local-jsonl',
      'transcriptSource',
      'activeElement',
      'onKeyDownCapture',
      'tabIndex',
    ]) {
      assert.equal(packagedText.includes(absent), false, absent)
      assert.equal(sourceDiff.stdout.toString().includes(absent), false, absent)
    }
    assert.equal(fixture.sourceReplayBlocker.decision.includes('no replay'), true)
  },
)

test(
  'coverage accepts only exact generic or complete REPL proof state',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            root,
            'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const paths = row.ownerIds.map(id => owners.get(id)).sort()
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.ownerOverride.paths].sort()) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.ownerOverride.paths].sort()) &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
      row.behavior === TARGET118_REPL_RUNTIME_OWNER_OVERRIDES[0].behavior
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.equal(provisional || corrected, true)
  },
)
