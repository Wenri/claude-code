import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_ENTRYPOINT_ROUTING_EVIDENCE_IDS,
  TARGET119_ENTRYPOINT_ROUTING_INPUT_FILES,
  TARGET119_ENTRYPOINT_ROUTING_OUTPUT_FILES,
  TARGET119_ENTRYPOINT_ROUTING_OWNER_OVERRIDES,
  applyTarget119EntrypointRoutingSourceRecovery,
  buildTarget119EntrypointRoutingOutputs,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-entrypoint-routing-source-gap.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-entrypoint-routing-source-gap.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/replay-entrypoint-routing-source-gap.mjs',
)
const coveragePath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '1a2934071c662ca56f20a21955b5f0318a8c6aab7088beb606f0c912ed895d5a'
const HELPER_SHA256 =
  'cdb5f18267729a94fe073f5b238292473f4533ce1ca4e1064c7d4b22fe52c6ec'
const SOURCE_COMMIT = '351cd4d13f70a564dc2d90f59ab0093dc6fc7b05'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function sourceFromGit(file) {
  const result = spawnSync(
    'git',
    ['show', `${SOURCE_COMMIT}:${file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString('utf8'))
  assert.deepEqual(descriptor(result.stdout), file.input, file.path)
  return result.stdout.toString('utf8')
}

function canonicalResidues() {
  return fixture.residueRows.map(row => [
    row.targetIndex,
    row.kind,
    row.value,
    row.start,
    row.end,
    row.baselineCount,
    row.targetOrdinal,
  ])
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function walkTs(ts, node, visit) {
  visit(node)
  ts.forEachChild(node, child => walkTs(ts, child, visit))
}

function declarationName(ts, statement) {
  if (ts.isFunctionDeclaration(statement)) return statement.name?.text
  if (!ts.isVariableStatement(statement)) return undefined
  const names = statement.declarationList.declarations.flatMap(declaration =>
    ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
  )
  return names.length === 1 ? names[0] : undefined
}

function declarationKind(ts, statement) {
  if (ts.isFunctionDeclaration(statement)) return 'FunctionDeclaration'
  if (ts.isVariableStatement(statement)) return 'VariableStatement'
  return ts.SyntaxKind[statement.kind]
}

function findNodeAt(node, start, type) {
  if (node.start === start && node.type === type) return node
  for (const value of Object.values(node)) {
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      for (const child of value) {
        if (!child || typeof child.type !== 'string') continue
        const found = findNodeAt(child, start, type)
        if (found) return found
      }
    } else if (typeof value.type === 'string') {
      const found = findNodeAt(value, start, type)
      if (found) return found
    }
  }
  return undefined
}

function writeSourceTree(directory, sources) {
  for (const [filePath, source] of sources) {
    const filename = path.join(directory, filePath.replace(/^src\//, ''))
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, source)
  }
}

test(
  'Target119 entrypoint-routing fixture and replay helper remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_ENTRYPOINT_ROUTING_EVIDENCE_IDS,
    )
    assert.deepEqual(
      fixture.ownerOverrides,
      TARGET119_ENTRYPOINT_ROUTING_OWNER_OVERRIDES,
    )
    assert.deepEqual(
      fixture.inputs.sourceFiles.map(file => ({
        path: file.path,
        bytes: file.input.bytes,
        sha256: file.input.sha256,
      })),
      TARGET119_ENTRYPOINT_ROUTING_INPUT_FILES,
    )
    assert.deepEqual(
      fixture.inputs.sourceFiles.map(file => ({
        path: file.path,
        bytes: file.output.bytes,
        sha256: file.output.sha256,
      })),
      TARGET119_ENTRYPOINT_ROUTING_OUTPUT_FILES,
    )
    assert.deepEqual(fixture.summary, {
      units: 2,
      residues: 3,
      targetIndicesSha256:
        'd6febe218e11b6cffa64bb8ba3ac830d77480649ec0b9fd8d81846df602acf00',
      residueIdentitiesSha256:
        '0617898ffb1923cb965b27fc7dff33507cff4ef63c5f56786d1c2fa24d55de4a',
    })
    assert.equal(
      sha256(JSON.stringify([2076, 6644])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalResidues())),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated Target119 units prove the complete routing and DCE call graph',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 baseline bundle',
    )
    const targetBytes = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 target bundle',
    )
    const target = targetBytes.toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural ledger',
        ),
      ),
    )
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    for (const expected of fixture.targetUnits) {
      const region = regions.get(expected.targetIndex)
      assert.ok(region)
      assert.deepEqual(
        {
          targetIndex: region.target.index,
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          sourceHash: region.target.sourceHash,
          requiredMarkers: expected.requiredMarkers,
        },
        expected,
      )
      const unit = target.slice(expected.start, expected.end)
      assert.equal(sha256(unit), expected.sourceHash)
      for (const marker of expected.requiredMarkers) assert(unit.includes(marker))
    }
    const matched = regions.get(fixture.targetCallGraph.matchedClientKey.targetIndex)
    assert.ok(matched)
    assert.equal(matched.classification, 'matched')
    assert.deepEqual(
      descriptor(
        targetBytes.subarray(
          fixture.targetCallGraph.matchedClientKey.start,
          fixture.targetCallGraph.matchedClientKey.end,
        ),
      ),
      {
        bytes: fixture.targetCallGraph.matchedClientKey.bytes,
        sha256: fixture.targetCallGraph.matchedClientKey.sourceHash,
      },
    )
    for (const name of ['bootstrapDefault', 'bootstrapAccessors', 'mainStartup']) {
      const fragment = fixture.targetCallGraph[name]
      const bytes = targetBytes.subarray(fragment.start, fragment.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: fragment.bytes,
        sha256: fragment.sha256,
      })
      if (fragment.text) assert.equal(bytes.toString('utf8'), fragment.text)
    }
    for (const residue of fixture.residueRows) {
      const source = target.slice(residue.start, residue.end)
      assert.equal(
        residue.kind === 'string' ? JSON.parse(source) : source,
        residue.value,
      )
      const unit = fixture.targetUnits.find(
        candidate => candidate.targetIndex === residue.targetIndex,
      )
      assert.ok(unit)
      assert(residue.start >= unit.start && residue.end <= unit.end)
    }

    const targetAst = parse(target, { ecmaVersion: 'latest', sourceType: 'module' })
    const growthBook = findNodeAt(targetAst, 3057623, 'FunctionDeclaration')
    assert.ok(growthBook)
    const declarations = growthBook.body.body.find(
      node => node.type === 'VariableDeclaration',
    ).declarations
    assert.equal(declarations.length, 6)
    const autoUpdates = declarations[2]
    const release = declarations[3]
    const entrypoint = declarations[5]
    assert.equal(autoUpdates.init.type, 'ChainExpression')
    assert.equal(autoUpdates.init.expression.property.name, 'autoUpdatesChannel')
    assert.deepEqual(
      { type: release.init.type, operator: release.init.operator, value: release.init.argument.value },
      { type: 'UnaryExpression', operator: 'void', value: 0 },
    )
    assert.equal(entrypoint.init.type, 'CallExpression')
    const returned = growthBook.body.body.find(node => node.type === 'ReturnStatement')
    const spreads = returned.argument.properties.filter(
      property => property.type === 'SpreadElement',
    )
    const keyedSpread = key =>
      spreads.find(spread => {
        const right = spread.argument.right
        return (
          spread.argument.type === 'LogicalExpression' &&
          right?.type === 'ObjectExpression' &&
          right.properties[0]?.key?.name === key
        )
      })
    assert.equal(keyedSpread('releaseChannel').argument.left.name, release.id.name)
    assert.equal(keyedSpread('entrypoint').argument.left.name, entrypoint.id.name)
  },
)

test(
  'Target119 source replay is atomic, declaration-scoped, and compiler-equivalent',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const rawSources = fixture.inputs.sourceFiles.map(file => ({
      path: file.path,
      source: sourceFromGit(file),
    }))
    const outputs = buildTarget119EntrypointRoutingOutputs(rawSources)
    const outputMap = new Map(outputs.map(output => [output.path, output.source]))
    for (const [index, output] of outputs.entries()) {
      assert.equal(output.path, fixture.inputs.sourceFiles[index].path)
      assert.deepEqual(
        descriptor(Buffer.from(output.source)),
        fixture.inputs.sourceFiles[index].output,
      )
    }

    for (const [filePath, expectedDeclarations] of Object.entries(
      fixture.sourceDeclarations,
    )) {
      const source = outputMap.get(filePath)
      const sourceFile = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, filePath)
      for (const expected of expectedDeclarations) {
        const matches = sourceFile.statements.filter(
          statement => declarationName(ts, statement) === expected.name,
        )
        assert.equal(matches.length, 1, `${filePath}#${expected.name}`)
        const declaration = matches[0]
        const start = declaration.getStart(sourceFile)
        const end = declaration.end
        const text = source.slice(start, end)
        assert.deepEqual(
          {
            name: expected.name,
            kind: declarationKind(ts, declaration),
            start,
            end,
            bytes: Buffer.byteLength(text),
            sha256: sha256(text),
          },
          expected,
        )
      }
    }

    const main = outputMap.get('src/main.tsx')
    for (const marker of [
      fixture.sourceCallGraph.mainInitialize,
      fixture.sourceCallGraph.mainSessionStart,
    ]) {
      assert.equal(main.split(marker.text).length - 1, 1)
      assert.equal(sha256(marker.text), marker.sha256)
    }
    assert(!main.includes('function initializeEntrypoint(isNonInteractive: boolean)'))
    const growthBook = outputMap.get('src/services/analytics/growthbook.ts')
    for (const marker of fixture.sourceCallGraph.growthBookCompilerMarkers) {
      assert.equal(growthBook.split(marker).length - 1, 1, marker)
    }

    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-entrypoint-routing-'),
    )
    try {
      writeSourceTree(
        temporaryRoot,
        new Map(rawSources.map(source => [source.path, source.source])),
      )
      assert.equal(
        applyTarget119EntrypointRoutingSourceRecovery({ sourceRoot: temporaryRoot }),
        'recovered',
      )
      assert.equal(
        applyTarget119EntrypointRoutingSourceRecovery({ sourceRoot: temporaryRoot }),
        'already-recovered',
      )
      const compiled = path.join(temporaryRoot, 'growthbook.min.js')
      const bun = spawnSync(
        path.join(root, '.pixi/envs/default/bin/bun'),
        [
          'build',
          path.join(temporaryRoot, 'services/analytics/growthbook.ts'),
          '--target=bun',
          '--external=*',
          '--minify',
          `--outfile=${compiled}`,
        ],
        { cwd: root, encoding: 'utf8' },
      )
      assert.equal(bun.status, 0, bun.stderr)
      const minified = fs.readFileSync(compiled, 'utf8')
      const match = minified.match(
        /\?\.autoUpdatesChannel,([A-Za-z_$][\w$]*)=void 0,[\s\S]{0,3000}?\.\.\.\1&&\{releaseChannel:\1\}/,
      )
      assert.ok(match, 'releaseChannel must compile to the authenticated void-0 guarded spread')
      assert.match(minified, /\.\.\.[A-Za-z_$][\w$]*&&\{entrypoint:[A-Za-z_$][\w$]*\}/)

      const firstFile = fixture.inputs.sourceFiles[0]
      fs.writeFileSync(
        path.join(temporaryRoot, firstFile.path.replace(/^src\//, '')),
        sourceFromGit(firstFile),
      )
      assert.throws(
        () =>
          applyTarget119EntrypointRoutingSourceRecovery({
            sourceRoot: temporaryRoot,
          }),
        /mixed source states/,
      )
      fs.writeFileSync(
        path.join(temporaryRoot, firstFile.path.replace(/^src\//, '')),
        `${sourceFromGit(firstFile)}\n`,
      )
      assert.throws(
        () =>
          applyTarget119EntrypointRoutingSourceRecovery({
            sourceRoot: temporaryRoot,
          }),
        /unexpected src\/constants\/keys\.ts identity/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  'Target119 recovered routing behavior and coverage state are fail-closed',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const outputs = buildTarget119EntrypointRoutingOutputs(
      fixture.inputs.sourceFiles.map(file => ({
        path: file.path,
        source: sourceFromGit(file),
      })),
    )
    const outputMap = new Map(outputs.map(output => [output.path, output.source]))
    const keys = outputMap.get('src/constants/keys.ts')
    const keyDeclarations = fixture.sourceDeclarations['src/constants/keys.ts']
      .map(declaration => keys.slice(declaration.start, declaration.end))
      .join('\n')
      .replace(/^export /gm, '')
    const routingProgram = ts.transpileModule(
      `${keyDeclarations}\nglobalThis.__routing = { VALID_ENTRYPOINTS, getEntrypoint, initializeEntrypoint, getSessionStartType }`,
      {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const processStub = { env: {}, argv: ['node', 'claude'] }
    const routingContext = vm.createContext({
      process: processStub,
      isEnvTruthy: value => ['1', 'true', 'yes'].includes(String(value).toLowerCase()),
    })
    vm.runInContext(routingProgram, routingContext)
    const routing = routingContext.__routing
    assert.deepEqual(
      [...routing.VALID_ENTRYPOINTS],
      [
        'cli',
        'mcp',
        'sdk-cli',
        'sdk-ts',
        'sdk-py',
        'bench',
        'claude-vscode',
        'claude-code-github-action',
        'local-agent',
        'claude-desktop',
        'remote',
        'remote_desktop',
        'remote_mobile',
        'claude_in_slack',
        'claude-desktop-3p',
        'ssh-remote',
      ],
    )
    processStub.env.CLAUDE_CODE_ENTRYPOINT = 'bench'
    assert.equal(routing.getEntrypoint(), 'bench')
    processStub.env.CLAUDE_CODE_ENTRYPOINT = 'not-valid'
    assert.equal(routing.getEntrypoint(), undefined)
    processStub.env.CLAUDE_CODE_ENTRYPOINT = 'cli'
    routing.initializeEntrypoint(true)
    assert.equal(processStub.env.CLAUDE_CODE_ENTRYPOINT, 'sdk-cli')
    processStub.env = {}
    processStub.argv = ['node', 'claude', '--debug', 'mcp', 'serve']
    routing.initializeEntrypoint(false)
    assert.equal(processStub.env.CLAUDE_CODE_ENTRYPOINT, 'mcp')
    processStub.env = { CLAUDE_CODE_ACTION: '1' }
    processStub.argv = ['node', 'claude']
    routing.initializeEntrypoint(false)
    assert.equal(
      processStub.env.CLAUDE_CODE_ENTRYPOINT,
      'claude-code-github-action',
    )
    processStub.env = {}
    routing.initializeEntrypoint(true)
    assert.equal(processStub.env.CLAUDE_CODE_ENTRYPOINT, 'sdk-cli')
    assert.equal(routing.getSessionStartType(['--resume=abc']), 'resume')
    assert.equal(routing.getSessionStartType(['--from-pr', '12']), 'resume')
    assert.equal(routing.getSessionStartType(['--continue']), 'continue')
    assert.equal(routing.getSessionStartType(['--', '--resume']), 'fresh')

    const growthBook = outputMap.get('src/services/analytics/growthbook.ts')
    const declaration = fixture.sourceDeclarations[
      'src/services/analytics/growthbook.ts'
    ][0]
    const growthBookProgram = ts.transpileModule(
      `${growthBook.slice(declaration.start, declaration.end)}\nglobalThis.__getAttributes = getUserAttributes`,
      {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const user = {
      deviceId: 'device',
      sessionId: 'session',
      platform: 'linux',
      email: 'person@example.com',
    }
    const growthContext = vm.createContext({
      process: { env: {} },
      getUserForGrowthBook: () => user,
      getGlobalConfig: () => ({ autoUpdatesChannel: 'stable' }),
      getApiBaseUrlHost: () => undefined,
      getEntrypoint: () => 'ssh-remote',
    })
    vm.runInContext(growthBookProgram, growthContext)
    const attributes = growthContext.__getAttributes()
    assert.equal(attributes.entrypoint, 'ssh-remote')
    assert.equal(attributes.releaseChannel, undefined)
    assert(!Object.hasOwn(attributes, 'releaseChannel'))

    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const ownerPaths = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const coverageRows = new Map(
      coverage.rows
        .filter(row => [2076, 6644].includes(row.targetIndex))
        .map(row => [row.targetIndex, row]),
    )
    assert.equal(coverageRows.size, 2)
    const states = []
    for (const override of fixture.ownerOverrides) {
      const row = coverageRows.get(override.targetIndex)
      const paths = row.ownerIds.map(id => ownerPaths.get(id)).sort()
      const corrected =
        JSON.stringify(paths) === JSON.stringify([...override.paths].sort()) &&
        override.evidenceIds.every(id => row.evidenceIds.includes(id)) &&
        row.behavior === override.behavior
      if (corrected) {
        states.push('corrected')
        continue
      }
      if (override.targetIndex === 2076) {
        assert.deepEqual(paths, ['src/constants/keys.ts'])
      } else {
        assert.deepEqual(paths, [
          'src/services/analytics/firstPartyEventLogger.ts',
        ])
      }
      assert.deepEqual(row.evidenceIds, ['source-map-attribution', 'semantic-test'])
      states.push('provisional')
    }
    assert.equal(new Set(states).size, 1, 'coverage correction must be atomic')

    const liveStates = fixture.inputs.sourceFiles.map(file => {
      const actual = descriptor(
        fs.readFileSync(path.join(sourceRoot, file.path.replace(/^src\//, ''))),
      )
      if (
        actual.bytes === file.input.bytes &&
        actual.sha256 === file.input.sha256
      ) {
        return 'raw'
      }
      assert.deepEqual(actual, file.output, file.path)
      return 'recovered'
    })
    assert.equal(new Set(liveStates).size, 1, 'source replay state must be atomic')
  },
)
