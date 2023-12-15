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
  applyTarget117MarketplaceCachePathSourceRecovery,
  TARGET117_MARKETPLACE_CACHE_PATH_INPUT_FILE,
  TARGET117_MARKETPLACE_CACHE_PATH_OUTPUT_FILE,
  TARGET117_MARKETPLACE_CACHE_PATH_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-marketplace-cache-path-sanitization-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-marketplace-cache-path-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '2d854feda6b8f95fcd181f537c8b025351fd5bb614614447964b54ae98d1bcec'
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

function artifactPath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, fixture.inputs.sourceFile.path.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const bytes = execFileSync(
    'git',
    [
      'show',
      `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
    ],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(bytes), fixture.inputs.sourceFile.input)
  const filename = sourceFilename(sourceRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, sourceRoot }
}

function copyPackagedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  const destination = sourceFilename(outputRoot)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(sourceFilename(sourceRoot), destination)
  return { temporaryRoot, sourceRoot: outputRoot }
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

function bundleRegexpOccurrences(source, expected) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, node => {
    if (
      node.type === 'Literal' &&
      node.regex?.pattern === expected.pattern &&
      node.regex.flags === expected.flags
    ) {
      occurrences.push({ start: node.start, end: node.end })
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  return occurrences
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
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parses`)
  return sourceFile
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

function exactDeclaration(ts, sourceFile, source, expected) {
  const matches = descendants(
    ts,
    sourceFile,
    node =>
      ts.isFunctionDeclaration(node) && node.name?.text === expected.name,
  )
  assert.equal(matches.length, 1, `${expected.name}: one declaration`)
  const declaration = matches[0]
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
  assert.equal(declaration.getStart(sourceFile), expected.start)
  assert.equal(declaration.end, expected.end)
  const bytes = Buffer.from(
    source.slice(declaration.getStart(sourceFile), declaration.end),
  )
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return declaration
}

function assertExactPostimage(sourceRoot) {
  readExact(
    sourceFilename(sourceRoot),
    fixture.inputs.sourceFile.output,
    'recovered marketplaceManager.ts',
  )
}

test(
  '2.1.117 marketplace cache-path fixture pins exact source and owner',
  { skip: !selected },
  async () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 1,
      recoveredFiles: 1,
      ownerOverrides: 1,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'case-owned helper',
    )
    assert.deepEqual(TARGET117_MARKETPLACE_CACHE_PATH_INPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(TARGET117_MARKETPLACE_CACHE_PATH_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.output,
    })
    assert.deepEqual(
      TARGET117_MARKETPLACE_CACHE_PATH_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: [...override.paths],
        declarations: [...override.declarations],
        evidenceIds: [...override.evidenceIds],
      })),
      [
        {
          key: `${caseName}:${fixture.row.targetIndex}`,
          targetIndex: fixture.row.targetIndex,
          paths: [fixture.row.owner],
          declarations: fixture.row.declarations,
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )

    const revision =
      `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`
    assert.equal(
      execFileSync('git', ['rev-parse', revision], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      fixture.inputs.sourceFile.blob,
    )
    const raw = execFileSync('git', ['show', revision], {
      cwd: repositoryRoot,
    })
    assert.deepEqual(descriptor(raw), fixture.inputs.sourceFile.input)
    const source = raw.toString('utf8')
    const ts = await loadTypeScript()
    const sourceFile = parseSource(ts, fixture.inputs.sourceFile.path, source)
    const declaration = exactDeclaration(
      ts,
      sourceFile,
      source,
      fixture.inputs.sourceFile.inputDeclaration,
    )
    assert.equal(
      descendants(
        ts,
        declaration,
        node =>
          ts.isRegularExpressionLiteral(node) &&
          node.text === '/[^a-zA-Z0-9\\-_]/g',
      ).length,
      0,
      'raw owner declaration lacks the Target117 sanitizer',
    )
    assert.equal(
      descendants(
        ts,
        declaration,
        node =>
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'replaceAll',
      ).length,
      0,
      'raw owner declaration lacks all-slash normalization',
    )
  },
)

test(
  '2.1.117 bundles authenticate the complete cache-path units and fifth regex occurrence',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath(
        'CLAUDE_CODE_BASELINE_2_1_116_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'authenticated 2.1.116 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath(
        'CLAUDE_CODE_TARGET_2_1_117_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'authenticated 2.1.117 bundle',
    ).toString('utf8')
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
      'structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))

    const [
      baselineIndex,
      baselineClassification,
      baselineNodeType,
      baselineStart,
      baselineEnd,
      baselineTokens,
      baselineHash,
      baselineCoarseHash,
    ] = fixture.baselineWitness.baselineUnit
    const baselineUnit = Buffer.from(
      baseline.slice(baselineStart, baselineEnd),
    )
    assert.deepEqual(descriptor(baselineUnit), {
      bytes: baselineEnd - baselineStart,
      sha256: baselineHash,
    })
    assert.equal(baselineUnit.toString('utf8'), fixture.baselineWitness.exactSource)
    const baselineEntry = ledger.unmatchedBaseline.find(
      entry => entry.index === baselineIndex,
    )
    assert.deepEqual(
      [
        baselineEntry.index,
        baselineClassification,
        baselineEntry.nodeType,
        baselineEntry.start,
        baselineEntry.end,
        baselineEntry.tokenCount,
        baselineEntry.sourceHash,
        baselineEntry.coarseHash,
      ],
      [
        baselineIndex,
        baselineClassification,
        baselineNodeType,
        baselineStart,
        baselineEnd,
        baselineTokens,
        baselineHash,
        baselineCoarseHash,
      ],
    )

    const [
      index,
      classification,
      nodeType,
      start,
      end,
      tokenCount,
      sourceHash,
      coarseHash,
    ] = fixture.row.targetUnit
    const targetUnit = Buffer.from(target.slice(start, end))
    assert.deepEqual(descriptor(targetUnit), {
      bytes: end - start,
      sha256: sourceHash,
    })
    assert.equal(targetUnit.toString('utf8'), fixture.row.exactSource)
    const targetEntry = ledger.unresolvedTarget.find(
      entry => entry.target.index === index,
    )
    assert.deepEqual(
      [
        targetEntry.target.index,
        targetEntry.classification,
        targetEntry.target.nodeType,
        targetEntry.target.start,
        targetEntry.target.end,
        targetEntry.target.tokenCount,
        targetEntry.target.sourceHash,
        targetEntry.target.coarseHash,
      ],
      [
        index,
        classification,
        nodeType,
        start,
        end,
        tokenCount,
        sourceHash,
        coarseHash,
      ],
    )

    const [kind, value, residueStart, residueEnd, occurrence, baselineCount] =
      fixture.row.residues[0]
    assert.equal(kind, 'regexp')
    assert.equal(
      target.slice(residueStart, residueEnd),
      `/[^a-zA-Z0-9\\-_]/g`,
    )
    assert.ok(residueStart >= start && residueEnd <= end)
    const baselineOccurrences = bundleRegexpOccurrences(baseline, value)
    const targetOccurrences = bundleRegexpOccurrences(target, value)
    assert.equal(baselineOccurrences.length, baselineCount)
    assert.equal(targetOccurrences.length, baselineCount + 1)
    assert.deepEqual(targetOccurrences[occurrence - 1], {
      start: residueStart,
      end: residueEnd,
    })

    const unitAst = parse(targetUnit.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const regexes = []
    const calls = []
    walk(unitAst, node => {
      if (node.type === 'Literal' && node.regex) regexes.push(node)
      if (node.type === 'CallExpression') calls.push(node)
    })
    assert.deepEqual(regexes.map(node => node.regex), [value])
    assert.equal(
      calls.filter(
        call =>
          call.callee?.type === 'MemberExpression' &&
          call.callee.property?.name === 'replaceAll',
      ).length,
      2,
    )
    const returns = unitAst.body[0].body.body.filter(
      statement => statement.type === 'ReturnStatement',
    )
    assert.equal(returns.length, 1)
    assert.equal(returns[0].argument.type, 'ConditionalExpression')
    assert.equal(returns[0].argument.test.operator, '===')
    assert.equal(returns[0].argument.test.right.value, '')
  },
)

test(
  '2.1.117 marketplace cache-path replay is dual-state, declaration-local, and executable',
  { skip: !selected },
  async () => {
    const raw = materializeRawSource('target117-marketplace-cache-path-raw-')
    try {
      assert.equal(
        applyTarget117MarketplaceCachePathSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'recovered',
      )
      assert.equal(
        applyTarget117MarketplaceCachePathSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'already-recovered',
      )
      assertExactPostimage(raw.sourceRoot)

      const source = fs.readFileSync(sourceFilename(raw.sourceRoot), 'utf8')
      const ts = await loadTypeScript()
      const sourceFile = parseSource(ts, fixture.inputs.sourceFile.path, source)
      const declaration = exactDeclaration(
        ts,
        sourceFile,
        source,
        fixture.inputs.sourceFile.outputDeclaration,
      )
      const regexes = descendants(
        ts,
        declaration,
        node => ts.isRegularExpressionLiteral(node),
      )
      assert.equal(regexes.length, 1)
      assert.equal(regexes[0].text, '/[^a-zA-Z0-9\\-_]/g')
      const replaceAllCalls = descendants(
        ts,
        declaration,
        node =>
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'replaceAll',
      )
      assert.equal(replaceAllCalls.length, 2)
      assert.deepEqual(
        replaceAllCalls.map(call => call.arguments.map(argument => argument.text)),
        [
          ['/', '-'],
          ['/', '-'],
        ],
      )
      const returnStatement = descendants(
        ts,
        declaration,
        ts.isReturnStatement,
      )
      assert.equal(returnStatement.length, 1)
      assert.ok(ts.isConditionalExpression(returnStatement[0].expression))
      assert.equal(
        returnStatement[0].expression.condition.getText(sourceFile),
        "tempName === ''",
      )

      const declarationSource = declaration.getText(sourceFile)
      const javascript = ts.transpileModule(declarationSource, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
      const now = 1700000000000
      const getCachePathForSource = Function(
        'basename',
        'Date',
        `${javascript}\nreturn getCachePathForSource`,
      )(path.basename, { now: () => now })
      assert.equal(
        getCachePathForSource({
          source: 'github',
          repo: 'org/repo/deep!',
        }),
        'org-repo-deep-',
      )
      assert.equal(
        getCachePathForSource({
          source: 'npm',
          package: '@scope/pkg/deep?',
        }),
        'scope-pkg-deep-',
      )
      assert.equal(
        getCachePathForSource({ source: 'file', path: '/tmp/my market.json' }),
        'my-market',
      )
      assert.equal(
        getCachePathForSource({ source: 'directory', path: '/tmp/my dir' }),
        'my-dir',
      )
      assert.equal(
        getCachePathForSource({ source: 'github', repo: '' }),
        `temp_${now}`,
      )
      assert.equal(
        getCachePathForSource({ source: 'url', url: 'https://example.test' }),
        `temp_${now}`,
      )
      assert.equal(
        getCachePathForSource({ source: 'github', repo: '_-safe' }),
        '_-safe',
      )
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    const packaged = copyPackagedSource(
      packagedRoot,
      'target117-marketplace-cache-path-packaged-',
    )
    try {
      const result = applyTarget117MarketplaceCachePathSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      assertExactPostimage(packaged.sourceRoot)
      assert.equal(
        applyTarget117MarketplaceCachePathSourceRecovery({
          sourceRoot: packaged.sourceRoot,
        }).status,
        'already-recovered',
      )
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 marketplace cache-path replay rejects mutation before writing',
  { skip: !selected },
  () => {
    const mutated = materializeRawSource(
      'target117-marketplace-cache-path-mutated-',
    )
    try {
      const filename = sourceFilename(mutated.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () =>
          applyTarget117MarketplaceCachePathSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /Refusing non-target marketplace cache path recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(mutated.temporaryRoot, { recursive: true, force: true })
    }
  },
)
