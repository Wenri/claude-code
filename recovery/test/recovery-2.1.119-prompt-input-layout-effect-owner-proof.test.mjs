import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  parse,
  tokenizer,
} from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_EVIDENCE_IDS,
  TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/prompt-input-layout-effect-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-prompt-input-layout-effect-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '208cad598ec1cc98330f2da962f6081bb3e22c9e93a42c8b098dde903a248101'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return {
    bytes: Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function normalizedToken(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'num' || token.type.label === 'string') {
    return `${token.type.label}:${JSON.stringify(token.value)}`
  }
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
    values.push({
      value: normalizedToken(token),
      start: token.start,
      end: token.end,
    })
  }
  return values
}

function walk(node, visit, parents = []) {
  if (!node || typeof node !== 'object') return
  visit(node, parents)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walk(value, visit, [...parents, node])
    } else {
      walk(child, visit, [...parents, node])
    }
  }
}

function alphaCanonical(node) {
  const identifiers = new Map()
  let nextIdentifier = 0
  function canonical(value, parent, key) {
    if (Array.isArray(value)) {
      return value.map(child => canonical(child, parent, key))
    }
    if (!value || typeof value !== 'object') return value
    if (value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed) ||
        (parent?.type === 'Property' && key === 'key' && !parent.computed)
      let name = value.name
      if (!preserve) {
        if (!identifiers.has(name)) {
          identifiers.set(name, `ID${nextIdentifier}`)
          nextIdentifier += 1
        }
        name = identifiers.get(name)
      }
      return { type: 'Identifier', name }
    }
    const output = {}
    for (const [childKey, child] of Object.entries(value)) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
      output[childKey] = canonical(child, value, childKey)
    }
    return output
  }
  return JSON.stringify(canonical(node, null, ''))
}

function hookProof(source, unitStart) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, 'FunctionDeclaration')
  let match
  walk(ast, (node, parents) => {
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.name === 'useLayoutEffect'
    ) {
      assert.equal(match, undefined, 'the PromptInput hook must be unique')
      match = { node, parents }
    }
  })
  assert.ok(match)
  const statement = [...match.parents]
    .reverse()
    .find(node => node.type === 'ExpressionStatement')
  assert.ok(statement)
  const statementText = source.slice(statement.start, statement.end)
  const canonical = alphaCanonical(statement)
  const tokens = normalizedTokens(source)
  const tokenIndex = tokens.findIndex(
    token => token.start === match.node.property.start,
  )
  assert.ok(tokenIndex >= 17)
  const context = `${tokens
    .slice(tokenIndex - 17, tokenIndex + 18)
    .map(token => token.value)
    .join('\n')}\n`
  return {
    property: {
      start: unitStart + match.node.property.start,
      end: unitStart + match.node.property.end,
    },
    statement: {
      start: unitStart + statement.start,
      end: unitStart + statement.end,
      ...descriptor(statementText),
      text: statementText,
    },
    alphaCanonical: descriptor(canonical),
    tokenIndex,
    context: {
      tokens: 35,
      ...descriptor(context),
      text: context,
    },
  }
}

function rowTuple(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function canonicalRows(rows) {
  const identities = rows.map(rowTuple)
  const value = JSON.stringify(identities)
  return {
    rows: identities.length,
    canonicalBytes: Buffer.byteLength(value),
    canonicalSha256: sha256(value),
    identities,
  }
}

function git(args, encoding = null) {
  return spawnSync('git', args, {
    cwd: root,
    encoding,
    maxBuffer: 32 * 1024 * 1024,
  })
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

function sourceProof(ts, bytes) {
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.sourceLineage.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declarations = []
  let useLayoutEffectAstOccurrences = 0
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'PromptInput') {
      declarations.push(node)
    }
    if (
      (ts.isPropertyAccessExpression(node) &&
        node.name.text === 'useLayoutEffect') ||
      (ts.isIdentifier(node) && node.text === 'useLayoutEffect')
    ) {
      useLayoutEffectAstOccurrences += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(declarations.length, 1)
  const declaration = declarations[0]
  const declarationText = declaration.getText(sourceFile)
  return {
    file: descriptor(bytes),
    declaration: {
      characterStart: declaration.getStart(sourceFile),
      characterEnd: declaration.end,
      ...descriptor(declarationText),
    },
    useLayoutEffectAstOccurrences,
    useLayoutEffectTextOccurrences: (source.match(/useLayoutEffect/g) ?? [])
      .length,
    missingCompiledMarkers: [
      'useLayoutEffect',
      'forceRedraw',
      'chat:clearInput',
    ].filter(marker => !source.includes(marker)),
  }
}

test(
  'Target119 PromptInput layout-effect fixture and override are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-inherited-runtime-proof-source-replay-blocked',
    )
    assert.deepEqual(
      descriptor(readPinned(fixture.inputs.override)),
      {
        bytes: fixture.inputs.override.bytes,
        sha256: fixture.inputs.override.sha256,
      },
    )
    assert.deepEqual(
      TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_OWNER_OVERRIDES.map(row => ({
        key: row.key,
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
      })),
      [
        {
          key: `${caseName}:${fixture.units.target.index}`,
          targetIndex: fixture.units.target.index,
          ...fixture.ownerOverride,
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
    assert.deepEqual(
      fixture.evidenceCatalog.map(row => row.id),
      fixture.evidenceIds,
    )
    assert.deepEqual(
      fixture.evidenceCatalog.map(row => row.kind),
      ['target-fragment', 'semantic-test', 'static-ast'],
    )
    assert.deepEqual(fixture.summary, {
      units: 1,
      ownerRows: 208,
      addedOwnerRows: 14,
      productionStrictRowsBeforeCorrection: 1,
      productionStrictRowsAfterCorrection: 0,
      ownerOverrides: 1,
      sourceReplayHelpers: 0,
    })
  },
)

test(
  'complete Target118 and Target119 PromptInput units have the exact pinned evolution',
  { skip: !selected },
  t => {
    const structural = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.structuralLedger)),
    )
    const baselineRegion = structural.unmatchedBaseline.find(
      row => row.index === fixture.units.baseline.index,
    )
    const targetRegion = structural.regions.find(
      row => row.target.index === fixture.units.target.index,
    )
    for (const key of [
      'start',
      'end',
      'tokenCount',
      'sourceHash',
      'coarseHash',
    ]) {
      assert.equal(baselineRegion[key], fixture.units.baseline[key])
      assert.equal(targetRegion.target[key], fixture.units.target[key])
    }
    assert.equal(targetRegion.classification, fixture.units.target.classification)

    const normalized = new Map()
    for (const unit of Object.values(fixture.units)) {
      const bundle = readPinned(unit.bundle)
      const value = bundle.subarray(unit.start, unit.end)
      assert.deepEqual(descriptor(value), {
        bytes: unit.end - unit.start,
        sha256: unit.sourceHash,
      })
      const ast = parse(value.toString('utf8'), {
        ecmaVersion: 'latest',
        sourceType: 'script',
      })
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, unit.nodeType)
      const tokens = normalizedTokens(value.toString('utf8'))
      assert.equal(tokens.length, unit.tokenCount)
      const text = `${tokens.map(token => token.value).join('\n')}\n`
      assert.deepEqual(descriptor(text), unit.normalized)
      normalized.set(unit.version, text)
    }

    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-prompt-input-proof.'),
    )
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
    const baselinePath = path.join(temporary, 'target118.tokens')
    const targetPath = path.join(temporary, 'target119.tokens')
    fs.writeFileSync(baselinePath, normalized.get('2.1.118'))
    fs.writeFileSync(targetPath, normalized.get('2.1.119'))
    const result = spawnSync(
      'diff',
      [
        '--label',
        'target118',
        '--label',
        'target119',
        '-U',
        '0',
        baselinePath,
        targetPath,
      ],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 1)
    assert.equal(result.stderr, '')
    assert.equal(result.stdout, fixture.normalizedUnitEvolution.diff.text)
    assert.deepEqual(descriptor(result.stdout), {
      bytes: fixture.normalizedUnitEvolution.diff.bytes,
      sha256: fixture.normalizedUnitEvolution.diff.sha256,
    })
    assert.equal(
      result.stdout.match(/^@@/gm)?.length,
      fixture.normalizedUnitEvolution.diff.hunks,
    )
  },
)

test(
  'the redraw layout effect is exact inherited runtime and executes all branches',
  { skip: !selected },
  () => {
    for (const unit of Object.values(fixture.units)) {
      const bundle = readPinned(unit.bundle)
      const source = bundle.subarray(unit.start, unit.end).toString('utf8')
      const actual = hookProof(source, unit.start)
      assert.deepEqual(actual, unit.hook)
      assert.deepEqual(actual.alphaCanonical, fixture.hookLineage.alphaCanonical)
      assert.deepEqual(actual.context, fixture.hookLineage.context)
    }
    assert.equal(
      fixture.normalizedUnitEvolution.targetTokenIndexAtHook -
        fixture.normalizedUnitEvolution.baselineTokenIndexAtHook,
      fixture.normalizedUnitEvolution.tokenIndexShiftBeforeHook,
    )

    const target = fixture.units.target
    const targetBundle = readPinned(target.bundle)
    const targetUnit = targetBundle
      .subarray(target.start, target.end)
      .toString('utf8')
    for (const marker of [
      'Kq.useState(0)',
      'Gs((Z$)=>Z$+1)',
      '"chat:clearInput":UTH',
    ]) {
      assert.ok(targetUnit.includes(marker), marker)
    }

    const statement = target.hook.statement.text
    const execute = (generation, withInstance) => {
      let effect
      let dependencies
      let redraws = 0
      const stdout = {}
      const instances = new Map()
      if (withInstance) {
        instances.set(stdout, {
          forceRedraw() {
            redraws += 1
          },
        })
      }
      const react = {
        useLayoutEffect(callback, deps) {
          effect = callback
          dependencies = deps
        },
      }
      const names = fixture.hookLineage.runtimeIdentifiers
      const run = new Function(
        names.react,
        names.generation,
        names.instances,
        names.process,
        statement,
      )
      run(react, generation, instances, { stdout })
      assert.deepEqual(dependencies, [generation])
      effect()
      return redraws
    }
    assert.equal(execute(0, true), 0)
    assert.equal(execute(1, true), 1)
    assert.equal(execute(2, false), 0)
  },
)

test(
  'all PromptInput owner rows are pinned and only inherited useLayoutEffect was strict',
  { skip: !selected },
  () => {
    const report = JSON.parse(
      fs.readFileSync(path.join(root, fixture.inputs.typedReport.path), 'utf8'),
    )
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === fixture.units.target.index,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.units.target.index,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === fixture.units.target.index,
    )
    assert.deepEqual(canonicalRows(ownerRows), fixture.residues.allOwner)
    assert.deepEqual(canonicalRows(addedRows), fixture.residues.addedOwner)
    const strict = canonicalRows(strictRows)
    assert(
      strictRows.length === 0 ||
        JSON.stringify(strict) ===
          JSON.stringify(fixture.residues.productionStrict),
      'strict rows must be the exact provisional singleton or corrected empty state',
    )
    const expected = fixture.residues.productionStrict.identities[0]
    assert.deepEqual(expected, [
      fixture.units.target.index,
      'property',
      'useLayoutEffect',
      fixture.units.target.hook.property.start,
      fixture.units.target.hook.property.end,
      26,
      28,
      true,
    ])
    assert.ok(
      fixture.residues.addedOwner.identities.some(
        row => JSON.stringify(row) === JSON.stringify(expected),
      ),
    )
    const bundle = readPinned(fixture.units.target.bundle)
    assert.equal(
      bundle
        .subarray(
          fixture.units.target.hook.property.start,
          fixture.units.target.hook.property.end,
        )
        .toString(),
      'useLayoutEffect',
    )
  },
)

test(
  'authenticated source lineage owns PromptInput but blocks an isolated hook replay',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    for (const snapshot of fixture.sourceLineage.snapshots) {
      const value = git(
        ['show', `${snapshot.commit}:${fixture.sourceLineage.path}`],
        null,
      )
      assert.equal(value.status, 0, value.stderr?.toString())
      assert.deepEqual(sourceProof(ts, value.stdout), {
        file: snapshot.file,
        declaration: snapshot.declaration,
        useLayoutEffectAstOccurrences: snapshot.useLayoutEffectAstOccurrences,
        useLayoutEffectTextOccurrences: snapshot.useLayoutEffectTextOccurrences,
        missingCompiledMarkers: snapshot.missingCompiledMarkers,
      })
      const blob = git(
        ['rev-parse', `${snapshot.commit}:${fixture.sourceLineage.path}`],
        'utf8',
      )
      assert.equal(blob.status, 0, blob.stderr)
      assert.equal(blob.stdout.trim(), snapshot.blob)
      assert.deepEqual(snapshot.missingCompiledMarkers, [
        'useLayoutEffect',
        'forceRedraw',
        'chat:clearInput',
      ])
    }

    const live = fs.readFileSync(
      path.join(sourceRoot, 'components/PromptInput/PromptInput.tsx'),
    )
    assert.deepEqual(sourceProof(ts, live), fixture.sourceLineage.packaged)
    assert.deepEqual(descriptor(live), fixture.inputs.packagedSource.file)

    const diff = git(
      [
        'diff',
        '--unified=0',
        fixture.sourceLineage.snapshots[1].commit,
        fixture.sourceLineage.snapshots[2].commit,
        '--',
        fixture.sourceLineage.path,
      ],
      null,
    )
    assert.equal(diff.status, 0, diff.stderr?.toString())
    assert.deepEqual(descriptor(diff.stdout), {
      bytes: fixture.sourceLineage.sourceDiff118To119.bytes,
      sha256: fixture.sourceLineage.sourceDiff118To119.sha256,
    })
    const numstat = git(
      [
        'diff',
        '--numstat',
        fixture.sourceLineage.snapshots[1].commit,
        fixture.sourceLineage.snapshots[2].commit,
        '--',
        fixture.sourceLineage.path,
      ],
      'utf8',
    )
    assert.equal(numstat.status, 0, numstat.stderr)
    assert.equal(
      numstat.stdout,
      `${fixture.sourceLineage.sourceDiff118To119.insertions}\t${fixture.sourceLineage.sourceDiff118To119.deletions}\t${fixture.sourceLineage.path}\n`,
    )
  },
)
