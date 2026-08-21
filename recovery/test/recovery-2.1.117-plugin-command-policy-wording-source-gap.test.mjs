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
  applyTarget117PluginCommandPolicyWordingSourceRecovery,
  TARGET117_PLUGIN_COMMAND_POLICY_WORDING_INPUT_FILE,
  TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OUTPUT_FILE,
  TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-plugin-command-policy-wording-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-plugin-command-policy-wording-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '5aacd0bfcedb3a5e74e1295f1db88358daaadcf7c5ff48d58cbb803a80a5dece'
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
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
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

function copySelectedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  const filename = sourceFilename(outputRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.copyFileSync(sourceFilename(sourceRoot), filename)
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
  occurrences.sort((left, right) => left.start - right.start)
  return occurrences
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

function parseSource(ts, source) {
  const sourceFile = ts.createSourceFile(
    fixture.inputs.sourceFile.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
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

function exactDeclaration(ts, sourceFile, bytes, expected, phase) {
  const matches = descendants(
    ts,
    sourceFile,
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === expected.name,
  )
  assert.equal(matches.length, 1, `${phase}: ${expected.name}`)
  const declaration = matches[0]
  const range = expected[phase]
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  assert.deepEqual({
    start,
    end,
    ...descriptor(bytes.subarray(start, end)),
  }, range, `${phase}: ${expected.name}`)
  return declaration
}

function templateQuasis(ts, root) {
  return descendants(ts, root, node => ts.isTemplateExpression(node)).map(
    node => [
      node.head.text,
      ...node.templateSpans.map(span => span.literal.text),
    ],
  )
}

function exactCase(ts, declaration, reason) {
  const matches = descendants(
    ts,
    declaration,
    node =>
      ts.isCaseClause(node) &&
      ts.isStringLiteral(node.expression) &&
      node.expression.text === reason,
  )
  assert.equal(matches.length, 1, reason)
  return matches[0]
}

function compileDeclaration(ts, sourceFile, declaration, parameterNames, values) {
  const source = declaration.getText(sourceFile).replace(/^export /, '')
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(...parameterNames, `${javascript}\nreturn ${declaration.name.text}`)(
    ...values,
  )
}

function assertPostimage(ts, sourceRoot, label) {
  const bytes = readExact(
    sourceFilename(sourceRoot),
    fixture.inputs.sourceFile.output,
    label,
  )
  const source = bytes.toString('utf8')
  const sourceFile = parseSource(ts, source)
  const declarations = new Map()
  for (const expected of fixture.inputs.sourceFile.declarations) {
    declarations.set(
      expected.name,
      exactDeclaration(ts, sourceFile, bytes, expected, 'output'),
    )
  }

  const installCase = exactCase(
    ts,
    declarations.get('installPluginOp'),
    'marketplace-blocked-by-policy',
  )
  assert.deepEqual(templateQuasis(ts, installCase), [[
    'Plugin "',
    '" is from marketplace "',
    '", which is blocked by your organization\'s policy',
  ]])
  assert.doesNotMatch(installCase.getText(sourceFile), / comes from marketplace /)

  const updateTemplates = templateQuasis(
    ts,
    declarations.get('updatePluginOp'),
  )
  assert.ok(updateTemplates.some(quasis =>
    JSON.stringify(quasis) === JSON.stringify([
      'Plugin "',
      '" is from marketplace "',
      '", which is blocked by your organization\'s policy',
    ]),
  ))
  assert.doesNotMatch(
    declarations.get('updatePluginOp').getText(sourceFile),
    /blocked by enterprise policy/,
  )
  return { sourceFile, declarations }
}

test(
  '2.1.117 plugin command policy fixture pins two bounded replay rows',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 2,
      residues: 2,
      recoveredFiles: 1,
      replacements: 2,
      ownerOverrides: 2,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'case-owned helper',
    )
    assert.deepEqual(TARGET117_PLUGIN_COMMAND_POLICY_WORDING_INPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.output,
    })
    assert.deepEqual(
      TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OWNER_OVERRIDES.map(
        override => ({
          key: override.key,
          targetIndex: override.targetIndex,
          paths: [...override.paths],
          declarations: [...override.declarations],
          evidenceIds: [...override.evidenceIds],
        }),
      ),
      fixture.rows.map(row => ({
        key: `${caseName}:${row.targetIndex}`,
        targetIndex: row.targetIndex,
        paths: [row.owner],
        declarations: row.declarations,
        evidenceIds: fixture.evidenceIds,
      })),
    )
    assert.ok(
      TARGET117_PLUGIN_COMMAND_POLICY_WORDING_OWNER_OVERRIDES.every(
        override => !override.paths.includes(fixture.rejectedCoincidentalOwner),
      ),
    )
    assert.equal(
      execFileSync(
        'git',
        ['rev-parse', `${fixture.inputs.rawTargetSourceCommit}^{tree}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.inputs.rawTargetSourceTree,
    )
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
  },
)

test(
  '2.1.117 bundle authenticates both complete policy functions and residues',
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
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const value = fixture.rows[0].residues[0][1]
    const baselineOccurrences = targetTemplateOccurrences(baseline, value)
    const targetOccurrences = targetTemplateOccurrences(target, value)
    assert.equal(baselineOccurrences.length, 0)
    assert.equal(targetOccurrences.length, 3)

    for (const row of fixture.rows) {
      const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
        row.targetUnit
      assert.equal(index, row.targetIndex)
      const region = ledger.regions.find(entry => entry.target.index === index)
      assert.ok(region, `u${index}`)
      assert.deepEqual([
        region.classification,
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.tokenCount,
        region.target.sourceHash,
        region.target.coarseHash,
      ], [classification, nodeType, start, end, tokenCount, sourceHash, coarseHash])
      const unit = Buffer.from(target.slice(start, end))
      assert.deepEqual(descriptor(unit), {
        bytes: end - start,
        sha256: sourceHash,
      })
      const unitAst = parse(unit.toString('utf8'), {
        ecmaVersion: 'latest',
        sourceType: 'script',
      })
      assert.equal(unitAst.body.length, 1)
      assert.equal(unitAst.body[0].type, nodeType)
      const [kind, residueValue, residueStart, residueEnd, occurrence, baselineCount] =
        row.residues[0]
      assert.equal(kind, 'string')
      assert.equal(residueValue, value)
      assert.equal(baselineCount, baselineOccurrences.length)
      assert.deepEqual(targetOccurrences[occurrence - 1], {
        start: residueStart,
        end: residueEnd,
      })
      assert.ok(residueStart >= start && residueEnd <= end)
    }

    const installAst = parse(
      target.slice(fixture.rows[0].targetUnit[3], fixture.rows[0].targetUnit[4]),
      { ecmaVersion: 'latest', sourceType: 'script' },
    )
    const installCases = []
    walk(installAst, node => {
      if (
        node.type === 'SwitchCase' &&
        node.test?.type === 'Literal' &&
        node.test.value === 'marketplace-blocked-by-policy'
      ) {
        installCases.push(node)
      }
    })
    assert.equal(installCases.length, 1)
    const installTemplates = []
    walk(installCases[0], node => {
      if (node.type === 'TemplateLiteral') installTemplates.push(node)
    })
    assert.deepEqual(
      installTemplates.map(template =>
        template.quasis.map(quasi => quasi.value.cooked),
      ),
      [[
        'Plugin "',
        '" is from marketplace "',
        '", which is blocked by your organization\'s policy',
      ]],
    )

    const updateAst = parse(
      target.slice(fixture.rows[1].targetUnit[3], fixture.rows[1].targetUnit[4]),
      { ecmaVersion: 'latest', sourceType: 'script' },
    )
    const updateTemplates = []
    walk(updateAst, node => {
      if (node.type === 'TemplateLiteral') updateTemplates.push(node)
    })
    assert.ok(updateTemplates.some(template =>
      JSON.stringify(template.quasis.map(quasi => quasi.value.cooked)) ===
        JSON.stringify([
          'Plugin "',
          '" is from marketplace "',
          '", which is blocked by your organization\'s policy',
        ]),
    ))
  },
)

test(
  '2.1.117 plugin command replay is dual-state, typed, and executable',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const raw = materializeRawSource('target117-plugin-command-policy-raw-')
    try {
      const rawBytes = fs.readFileSync(sourceFilename(raw.sourceRoot))
      const rawSourceFile = parseSource(ts, rawBytes.toString('utf8'))
      for (const expected of fixture.inputs.sourceFile.declarations) {
        exactDeclaration(ts, rawSourceFile, rawBytes, expected, 'input')
      }
      assert.match(rawBytes.toString('utf8'), / comes from marketplace /)
      assert.match(rawBytes.toString('utf8'), /blocked by enterprise policy/)

      const first = applyTarget117PluginCommandPolicyWordingSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117PluginCommandPolicyWordingSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      const { sourceFile, declarations } = assertPostimage(
        ts,
        raw.sourceRoot,
        'recovered plugin command policy source',
      )

      const installPluginOp = compileDeclaration(
        ts,
        sourceFile,
        declarations.get('installPluginOp'),
        [
          'assertInstallableScope',
          'parsePluginIdentifier',
          'getPluginById',
          'isPluginInstalledAtScope',
          'installResolvedPlugin',
        ],
        [
          () => {},
          () => ({ name: 'root', marketplace: 'blocked-market' }),
          async () => ({
            entry: { name: 'root' },
            marketplaceInstallLocation: '/marketplace',
          }),
          async () => false,
          async () => ({
            ok: false,
            reason: 'marketplace-blocked-by-policy',
            pluginName: 'root',
            marketplaceName: 'blocked-market',
          }),
        ],
      )
      assert.deepEqual(await installPluginOp('root@blocked-market'), {
        success: false,
        message:
          'Plugin "root" is from marketplace "blocked-market", which is blocked by your organization\'s policy',
      })

      const updatePluginOp = compileDeclaration(
        ts,
        sourceFile,
        declarations.get('updatePluginOp'),
        [
          'parsePluginIdentifier',
          'loadKnownMarketplacesConfig',
          'isSourceAllowedByPolicy',
        ],
        [
          () => ({ name: 'root', marketplace: 'blocked-market' }),
          async () => ({ 'blocked-market': { source: { source: 'github' } } }),
          () => false,
        ],
      )
      assert.deepEqual(await updatePluginOp('root@blocked-market', 'user'), {
        success: false,
        message:
          'Plugin "root" is from marketplace "blocked-market", which is blocked by your organization\'s policy',
        pluginId: 'root@blocked-market',
        scope: 'user',
      })
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
      'target117-plugin-command-policy-packaged-',
    )
    try {
      const result = applyTarget117PluginCommandPolicyWordingSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      assertPostimage(ts, packaged.sourceRoot, 'packaged plugin command source')
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 plugin command replay rejects raw and postimage mutation',
  { skip: !selected },
  () => {
    const raw = materializeRawSource('target117-plugin-command-policy-mutated-')
    try {
      const filename = sourceFilename(raw.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () => applyTarget117PluginCommandPolicyWordingSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }),
        /Refusing non-target plugin command policy wording recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const recovered = materializeRawSource(
      'target117-plugin-command-policy-postimage-mutated-',
    )
    try {
      applyTarget117PluginCommandPolicyWordingSourceRecovery({
        sourceRoot: recovered.sourceRoot,
      })
      const filename = sourceFilename(recovered.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () => applyTarget117PluginCommandPolicyWordingSourceRecovery({
          sourceRoot: recovered.sourceRoot,
        }),
        /Refusing non-target plugin command policy wording recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(recovered.temporaryRoot, { recursive: true, force: true })
    }
  },
)
