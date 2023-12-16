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
  applyTarget118FileReadPowerShellHintSourceRecovery,
  buildTarget118FileReadPowerShellHintOutput,
  TARGET118_FILE_READ_POWERSHELL_HINT_INPUT_FILE,
  TARGET118_FILE_READ_POWERSHELL_HINT_OUTPUT_FILE,
  TARGET118_FILE_READ_POWERSHELL_HINT_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-file-read-powershell-notebook-hint-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-file-read-powershell-notebook-hint-source-gap.json',
    ),
    'utf8',
  ),
)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

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

function gitSource(file) {
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.rawSource.commit}:${file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: file.bytes,
    sha256: file.sha256,
  })
  return result.stdout
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

function materializeSource(bytes, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const filename = path.join(
    temporaryRoot,
    fixture.inputs.rawSource.file.path.replace(/^src\//, ''),
  )
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, filename }
}

test('Target118 FileReadTool PowerShell-hint fixture and helper are deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  const helper = fs.readFileSync(path.join(root, fixture.inputs.helper.path))
  assert.deepEqual(descriptor(helper), {
    bytes: fixture.inputs.helper.bytes,
    sha256: fixture.inputs.helper.sha256,
  })
  assert.deepEqual(TARGET118_FILE_READ_POWERSHELL_HINT_INPUT_FILE, {
    path: fixture.inputs.rawSource.file.path,
    bytes: fixture.inputs.rawSource.file.bytes,
    sha256: fixture.inputs.rawSource.file.sha256,
  })
  assert.deepEqual(
    TARGET118_FILE_READ_POWERSHELL_HINT_OUTPUT_FILE,
    fixture.inputs.recoveredSource.file,
  )
  assert.deepEqual(
    TARGET118_FILE_READ_POWERSHELL_HINT_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [
      {
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.targetUnit.ownerPath],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.targetUnit.behavior,
      },
    ],
  )
  const indices = [fixture.targetUnit.targetIndex]
  const residues = fixture.targetUnit.residues.map(residue => [
    fixture.targetUnit.targetIndex,
    ...residue,
  ])
  assert.deepEqual(
    { units: indices.length, residues: residues.length },
    { units: fixture.summary.units, residues: fixture.summary.residues },
  )
  assert.equal(
    sha256(JSON.stringify(indices)),
    fixture.summary.targetIndicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(residues)),
    fixture.summary.residueIdentitiesSha256,
  )
})

test('authenticated Target118 FileReadTool binds the exact shell gate and complete PowerShell branch', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  const structuralBytes = fs.readFileSync(
    path.join(root, fixture.inputs.targetStructuralLedger.path),
  )
  assert.deepEqual(descriptor(structuralBytes), {
    bytes: fixture.inputs.targetStructuralLedger.bytes,
    sha256: fixture.inputs.targetStructuralLedger.sha256,
  })
  const structural = JSON.parse(gunzipSync(structuralBytes))
  const region = structural.regions.find(
    candidate => candidate.target.index === fixture.targetUnit.targetIndex,
  )
  assert(region)
  assert.deepEqual(
    {
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      nodeType: region.target.nodeType,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
      classification: region.classification,
    },
    {
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      bytes: fixture.targetUnit.bytes,
      nodeType: fixture.targetUnit.nodeType,
      sourceHash: fixture.targetUnit.sourceHash,
      coarseHash: fixture.targetUnit.coarseHash,
      classification: 'unresolved',
    },
  )
  const targetBytes = bundle.subarray(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(targetBytes), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  const targetAst = parse(targetBytes.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const shellConditions = walk(
    targetAst,
    node =>
      node.type === 'ConditionalExpression' &&
      node.test?.type === 'CallExpression' &&
      node.test.callee?.type === 'Identifier' &&
      node.test.callee.name === 'P5' &&
      node.consequent?.type === 'TemplateLiteral' &&
      node.alternate?.type === 'TemplateLiteral',
  )
  assert.equal(shellConditions.length, 1)
  assert.equal(
    walk(
      shellConditions[0].consequent,
      node => node.type === 'Identifier' && node.name === 'zq',
    ).length,
    1,
  )
  assert.equal(
    walk(
      shellConditions[0].alternate,
      node => node.type === 'Identifier' && node.name === 'nq',
    ).length,
    1,
  )
  for (const binding of fixture.targetBindings) {
    const bytes = bundle.subarray(binding.start, binding.end)
    assert.deepEqual(descriptor(bytes), {
      bytes: binding.bytes,
      sha256: binding.sha256,
    })
    assert.equal(bytes.toString(), binding.text)
  }
  for (const [kind, value, start, end] of fixture.targetUnit.residues) {
    assert.equal(kind, 'string')
    assert.equal(bundle.subarray(start, end).toString(), value)
    assert(start >= fixture.targetUnit.start && end <= fixture.targetUnit.end)
  }

  const shellGateSource = gitSource(
    fixture.inputs.rawSource.shellGateFile,
  ).toString('utf8')
  assert.equal(
    shellGateSource.match(
      /export function isBashToolEnabled\(\): boolean \{/g,
    )?.length,
    2,
  )
  assert.match(
    shellGateSource,
    /return getPlatform\(\) !== 'windows' \|\| !isPowerShellToolEnabled\(\)/,
  )

  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(row)
  assert.deepEqual(
    row.ownerIds.map(ownerId => owners.get(ownerId)),
    [fixture.targetUnit.ownerPath],
  )
  const provisional =
    JSON.stringify(row.evidenceIds) ===
    JSON.stringify(['source-map-attribution', 'semantic-test'])
  const corrected =
    JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
    row.behavior === fixture.targetUnit.behavior
  assert.ok(provisional || corrected)
})

test('bounded FileReadTool replay is exact, idempotent, and fail-closed', t => {
  const raw = gitSource(fixture.inputs.rawSource.file)
  assert.deepEqual(
    descriptor(Buffer.from(buildTarget118FileReadPowerShellHintOutput(raw.toString()))),
    {
      bytes: fixture.inputs.recoveredSource.file.bytes,
      sha256: fixture.inputs.recoveredSource.file.sha256,
    },
  )
  const { temporaryRoot, filename } = materializeSource(
    raw,
    'target118-file-read-powershell-hint.',
  )
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  assert.deepEqual(
    applyTarget118FileReadPowerShellHintSourceRecovery({
      sourceRoot: temporaryRoot,
    }),
    { status: 'recovered', files: [fixture.inputs.rawSource.file.path] },
  )
  assert.deepEqual(
    applyTarget118FileReadPowerShellHintSourceRecovery({
      sourceRoot: temporaryRoot,
    }),
    { status: 'already-recovered', files: [] },
  )
  assert.deepEqual(descriptor(fs.readFileSync(filename)), {
    bytes: fixture.inputs.recoveredSource.file.bytes,
    sha256: fixture.inputs.recoveredSource.file.sha256,
  })
  fs.appendFileSync(filename, '\n// mutation\n')
  assert.throws(
    () =>
      applyTarget118FileReadPowerShellHintSourceRecovery({
        sourceRoot: temporaryRoot,
      }),
    /requires its exact raw or recovered source state/,
  )
})

test('recovered FileReadTool AST executes both authenticated notebook-hint branches', async t => {
  const configuredFile = path.join(
    sourceRoot,
    fixture.inputs.rawSource.file.path.replace(/^src\//, ''),
  )
  const configuredBytes = fs.readFileSync(configuredFile)
  const configuredDescriptor = descriptor(configuredBytes)
  const rawDescriptor = {
    bytes: fixture.inputs.rawSource.file.bytes,
    sha256: fixture.inputs.rawSource.file.sha256,
  }
  const recoveredDescriptor = {
    bytes: fixture.inputs.recoveredSource.file.bytes,
    sha256: fixture.inputs.recoveredSource.file.sha256,
  }
  assert.ok(
    (configuredDescriptor.bytes === rawDescriptor.bytes &&
      configuredDescriptor.sha256 === rawDescriptor.sha256) ||
      (configuredDescriptor.bytes === recoveredDescriptor.bytes &&
        configuredDescriptor.sha256 === recoveredDescriptor.sha256),
    `${fixture.inputs.rawSource.file.path} is neither raw nor recovered: ${configuredDescriptor.bytes}/${configuredDescriptor.sha256}`,
  )
  const { temporaryRoot, filename } = materializeSource(
    configuredBytes,
    'target118-file-read-powershell-hint-source.',
  )
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  applyTarget118FileReadPowerShellHintSourceRecovery({
    sourceRoot: temporaryRoot,
  })
  const output = fs.readFileSync(filename)
  assert.deepEqual(descriptor(output), recoveredDescriptor)

  const ts = await loadTypeScript()
  const text = output.toString('utf8')
  const parsed = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  const imports = parsed.statements.filter(ts.isImportDeclaration)
  for (const expected of fixture.sourceContract.imports) {
    const matches = imports.filter(
      declaration =>
        declaration.moduleSpecifier.text === expected.module &&
        declaration.importClause?.namedBindings?.elements?.some(
          element => element.name.text === expected.binding,
        ),
    )
    assert.equal(matches.length, 1, expected.binding)
    const importText = matches[0].getText(parsed)
    assert.deepEqual(descriptor(Buffer.from(importText)), {
      bytes: expected.bytes,
      sha256: expected.sha256,
    })
  }
  const callInner = parsed.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === fixture.sourceContract.callInner.name,
  )
  assert.equal(callInner.length, 1)
  assert.deepEqual(descriptor(Buffer.from(callInner[0].getText(parsed))), {
    bytes: fixture.sourceContract.callInner.bytes,
    sha256: fixture.sourceContract.callInner.sha256,
  })
  const readHintDeclarations = []
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(parsed) ===
        fixture.sourceContract.readHintDeclaration.name
    ) {
      readHintDeclarations.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(callInner[0])
  assert.equal(readHintDeclarations.length, 1)
  const declarationStatement = readHintDeclarations[0].parent.parent
  const declarationText = declarationStatement.getText(parsed)
  assert.deepEqual(descriptor(Buffer.from(declarationText)), {
    bytes: fixture.sourceContract.readHintDeclaration.bytes,
    sha256: fixture.sourceContract.readHintDeclaration.sha256,
  })
  const initializer = readHintDeclarations[0].initializer
  assert(ts.isConditionalExpression(initializer))
  assert.equal(initializer.condition.getText(parsed), 'isBashToolEnabled()')
  assert(ts.isTemplateExpression(initializer.whenTrue))
  assert(ts.isTemplateExpression(initializer.whenFalse))

  const executable = `
function renderHint(isBashToolEnabled, BASH_TOOL_NAME, POWERSHELL_TOOL_NAME, file_path) {
  ${declarationText}
  return readHint
}
`
  const javascript = ts.transpileModule(executable, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const renderHint = new Function(`${javascript}\nreturn renderHint`)()
  const filenameForHint = 'C:/tmp/example.ipynb'
  assert.equal(
    renderHint(() => true, 'Bash', 'PowerShell', filenameForHint),
    fixture.sourceContract.bashHint,
  )
  assert.equal(
    renderHint(() => false, 'Bash', 'PowerShell', filenameForHint),
    fixture.sourceContract.powerShellHint,
  )
})
