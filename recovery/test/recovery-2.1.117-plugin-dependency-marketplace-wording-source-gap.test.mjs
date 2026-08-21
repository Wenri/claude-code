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
  applyTarget117PluginDependencyMarketplaceWordingSourceRecovery,
  TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_INPUT_FILE,
  TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OUTPUT_FILE,
  TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-plugin-dependency-marketplace-wording-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-plugin-dependency-marketplace-wording-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '464b4fb1596f6e714a4850ddb66250ce27d77dc6f80826c2548b23c2fb15851e'
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
  const filename = path.resolve(
    root,
    fixture.inputs.sourceFile.path.slice(4),
  )
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

function copySelectedSource(sourceRoot, prefix) {
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

function targetTemplateOccurrences(source, expectedValue) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, node => {
    if (
      node.type === 'TemplateElement' &&
      (node.value?.cooked ?? node.value?.raw) === expectedValue
    ) {
      occurrences.push({ start: node.start, end: node.end })
    }
  })
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

function exactDeclaration(ts, sourceFile, source) {
  const expected = fixture.inputs.sourceFile.declaration
  const matches = descendants(
    ts,
    sourceFile,
    node =>
      ts.SyntaxKind[node.kind] === expected.nodeType &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === expected.name,
  )
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  assert.equal(declaration.getStart(sourceFile), expected.start)
  assert.equal(declaration.end, expected.end)
  assert.deepEqual(
    descriptor(
      Buffer.from(
        source.slice(declaration.getStart(sourceFile), declaration.end),
      ),
    ),
    { bytes: expected.bytes, sha256: expected.sha256 },
  )
  return declaration
}

function policyCase(ts, declaration) {
  const cases = descendants(
    ts,
    declaration,
    node =>
      ts.isCaseClause(node) &&
      ts.isStringLiteral(node.expression) &&
      node.expression.text === 'dependency-marketplace-blocked-by-policy',
  )
  assert.equal(cases.length, 1, 'one exact discriminated-union branch')
  return cases[0]
}

function assertExactPostimage(sourceRoot) {
  readExact(
    sourceFilename(sourceRoot),
    fixture.inputs.sourceFile.output,
    'recovered plugin installation helper',
  )
}

test(
  '2.1.117 plugin dependency-marketplace wording fixture pins exact inputs and override',
  { skip: !selected },
  () => {
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
    assert.deepEqual(
      TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_INPUT_FILE,
      {
        path: fixture.inputs.sourceFile.path,
        ...fixture.inputs.sourceFile.input,
      },
    )
    assert.deepEqual(
      TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OUTPUT_FILE,
      {
        path: fixture.inputs.sourceFile.path,
        ...fixture.inputs.sourceFile.output,
      },
    )
    assert.deepEqual(
      TARGET117_PLUGIN_DEPENDENCY_MARKETPLACE_WORDING_OWNER_OVERRIDES.map(
        override => ({
          key: override.key,
          targetIndex: override.targetIndex,
          paths: [...override.paths],
          declarations: [...override.declarations],
          evidenceIds: [...override.evidenceIds],
        }),
      ),
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

    const raw = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
      ],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(raw), fixture.inputs.sourceFile.input)
    assert.equal(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.inputs.sourceFile.blob,
    )
    assert.match(raw.toString('utf8'), / comes from marketplace /)
    assert.doesNotMatch(raw.toString('utf8'), / is from marketplace /)
  },
)

test(
  '2.1.117 bundle authenticates the complete policy function and exact wording residue',
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
    const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
      fixture.row.targetUnit
    const unit = Buffer.from(target.slice(start, end))
    assert.deepEqual(descriptor(unit), {
      bytes: end - start,
      sha256: sourceHash,
    })
    const ledgerEntry = ledger.unresolvedTarget.find(
      entry => entry.target.index === index,
    )
    assert.deepEqual(
      [
        ledgerEntry.target.index,
        ledgerEntry.classification,
        ledgerEntry.target.nodeType,
        ledgerEntry.target.start,
        ledgerEntry.target.end,
        ledgerEntry.target.tokenCount,
        ledgerEntry.target.sourceHash,
        ledgerEntry.target.coarseHash,
      ],
      [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash],
    )

    const [kind, value, residueStart, residueEnd, occurrence, baselineCount] =
      fixture.row.residues[0]
    assert.equal(kind, 'string')
    assert.equal(target.slice(residueStart, residueEnd), value)
    assert.equal(residueStart >= start && residueEnd <= end, true)
    assert.equal(occurrence, 1)
    assert.equal(baselineCount, 0)
    const targetOccurrences = targetTemplateOccurrences(target, value)
    assert.deepEqual(targetOccurrences[occurrence - 1], {
      start: residueStart,
      end: residueEnd,
    })
    assert.equal(targetOccurrences.length, 3)
    assert.equal(targetTemplateOccurrences(baseline, value).length, baselineCount)

    const unitAst = parse(unit.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const cases = []
    walk(unitAst, node => {
      if (
        node.type === 'SwitchCase' &&
        node.test?.type === 'Literal' &&
        node.test.value === 'dependency-marketplace-blocked-by-policy'
      ) {
        cases.push(node)
      }
    })
    assert.equal(cases.length, 1)
    const templates = []
    walk(cases[0], node => {
      if (node.type === 'TemplateLiteral') templates.push(node)
    })
    assert.equal(templates.length, 1)
    assert.deepEqual(
      templates[0].quasis.map(quasi => quasi.value.cooked),
      [
        'Cannot install "',
        '": dependency "',
        '" is from marketplace "',
        '", which is blocked by your organization\'s policy',
      ],
    )
  },
)

test(
  '2.1.117 wording replay is dual-state, declaration-local, and executable',
  { skip: !selected },
  async () => {
    const raw = materializeRawSource('target117-plugin-marketplace-wording-raw-')
    try {
      const first =
        applyTarget117PluginDependencyMarketplaceWordingSourceRecovery({
          sourceRoot: raw.sourceRoot,
        })
      assert.equal(first.status, 'recovered')
      const second =
        applyTarget117PluginDependencyMarketplaceWordingSourceRecovery({
          sourceRoot: raw.sourceRoot,
        })
      assert.equal(second.status, 'already-recovered')
      assertExactPostimage(raw.sourceRoot)

      const source = fs.readFileSync(sourceFilename(raw.sourceRoot), 'utf8')
      const ts = await loadTypeScript()
      const sourceAst = parseSource(ts, fixture.inputs.sourceFile.path, source)
      const declaration = exactDeclaration(ts, sourceAst, source)
      const branch = policyCase(ts, declaration)
      const templates = descendants(ts, branch, ts.isTemplateExpression)
      assert.equal(templates.length, 1)
      assert.equal(
        templates[0].templateSpans[1].literal.text,
        '" is from marketplace "',
      )
      assert.doesNotMatch(declaration.getText(sourceAst), / comes from marketplace /)

      const declarationSource = declaration
        .getText(sourceAst)
        .replace(/^export /, '')
      const javascript = ts.transpileModule(declarationSource, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
      const install = Function(
        'getPluginById',
        'installResolvedPlugin',
        `${javascript}\nreturn installPluginFromMarketplace`,
      )(
        async () => undefined,
        async () => ({
          ok: false,
          reason: 'dependency-marketplace-blocked-by-policy',
          pluginName: 'root',
          blockedDependency: 'dependency',
          marketplaceName: 'blocked-market',
        }),
      )
      assert.deepEqual(
        await install({
          pluginId: 'root@market',
          entry: { name: 'root' },
          marketplaceName: 'market',
        }),
        {
          success: false,
          error:
            'Cannot install "root": dependency "dependency" is from marketplace "blocked-market", which is blocked by your organization\'s policy',
        },
      )
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    const packaged = copySelectedSource(
      packagedRoot,
      'target117-plugin-marketplace-wording-packaged-',
    )
    try {
      const result =
        applyTarget117PluginDependencyMarketplaceWordingSourceRecovery({
          sourceRoot: packaged.sourceRoot,
        })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      assertExactPostimage(packaged.sourceRoot)
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 wording replay rejects mutation before writing',
  { skip: !selected },
  () => {
    const mutated = materializeRawSource(
      'target117-plugin-marketplace-wording-mutated-',
    )
    try {
      fs.appendFileSync(sourceFilename(mutated.sourceRoot), '\n// mutation\n')
      const before = fs.readFileSync(sourceFilename(mutated.sourceRoot))
      assert.throws(
        () =>
          applyTarget117PluginDependencyMarketplaceWordingSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /Refusing non-target plugin dependency-marketplace wording recovery/,
      )
      assert.deepEqual(fs.readFileSync(sourceFilename(mutated.sourceRoot)), before)
    } finally {
      fs.rmSync(mutated.temporaryRoot, { recursive: true, force: true })
    }
  },
)
