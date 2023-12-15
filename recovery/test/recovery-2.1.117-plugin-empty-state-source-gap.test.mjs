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
  applyTarget117PluginEmptyStateSourceRecovery,
  TARGET117_EMPTY_STATE_SOURCE,
  TARGET117_PLUGIN_EMPTY_STATE_CONTEXT_FILES,
  TARGET117_PLUGIN_EMPTY_STATE_FILES,
  TARGET117_PLUGIN_EMPTY_STATE_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-plugin-empty-state-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-plugin-empty-state-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'd4403df8e351c8d9854cb3c911ee76c43e5fe37937aa5c9fc7c3e99bbc73bea2'
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

function tupleDescriptor(tuple) {
  return { bytes: tuple[1], sha256: tuple[2] }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, label)
  return bytes
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

function assertBundleRange(bundle, tuple, label) {
  const [start, end, bytes, hash] = tuple
  const value = bundle.subarray(start, end)
  assert.deepEqual(descriptor(value), { bytes, sha256: hash }, label)
  return value
}

function assertSourceTuple(source, tuple, label) {
  const [start, end, bytes, hash] = tuple
  const value = Buffer.from(source.slice(start, end))
  assert.deepEqual(descriptor(value), { bytes, sha256: hash }, label)
  return value.toString('utf8')
}

function sourceFilename(sourceRoot, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const raw = fixture.inputs.rawSource
  for (const input of raw.files) {
    if (input.absent) continue
    const output = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(
      output,
      execFileSync('git', ['show', `${raw.commit}:${input.path}`], {
        cwd: repositoryRoot,
      }),
    )
  }
  const context = fixture.inputs.context
  const contextOutput = sourceFilename(sourceRoot, context.path)
  fs.mkdirSync(path.dirname(contextOutput), { recursive: true })
  fs.writeFileSync(
    contextOutput,
    execFileSync('git', ['show', `${raw.commit}:${context.path}`], {
      cwd: repositoryRoot,
    }),
  )
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const inputs = [
    ...fixture.inputs.rawSource.files,
    fixture.inputs.context,
  ]
  for (const input of inputs) {
    const source = sourceFilename(inputRoot, input.path)
    if (!fs.existsSync(source)) {
      assert.equal(input.absent, true, input.path)
      continue
    }
    const output = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(source, output)
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
    } else if (value && typeof value === 'object' && value.type) {
      walkAcorn(value, visitor, root)
    }
  }
}

function acornNodes(root, predicate) {
  const matches = []
  walkAcorn(root, (node, parent) => {
    if (predicate(node, parent)) matches.push(node)
  })
  return matches
}

function assertContiguousSlots(indices, size) {
  assert.deepEqual(
    [...new Set(indices)].sort((left, right) => left - right),
    Array.from({ length: size }, (_, index) => index),
  )
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

function parseTypeScript(ts, filename, bytes) {
  const sourceFile = ts.createSourceFile(
    filename,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function exactNamedDeclaration(ts, sourceFile, source, expected) {
  const matches = descendants(
    ts,
    sourceFile,
    node =>
      (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      node.name?.text === expected.declaration,
  )
  assert.equal(matches.length, 1, expected.declaration)
  const node = matches[0]
  const tuple = [
    node.getStart(sourceFile),
    node.end,
    ...Object.values(
      descriptor(Buffer.from(source.slice(node.getStart(sourceFile), node.end))),
    ),
  ]
  assert.deepEqual(tuple, expected.declarationTuple, expected.declaration)
  return node
}

test(
  'Target117 authenticates the shared EmptyState runtime and its module import graph',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      {
        bytes: fixture.inputs.helper.bytes,
        sha256: fixture.inputs.helper.sha256,
      },
    )
    const baseline = readExact(
      path.join(artifactRoot, fixture.inputs.baselineBundle[0]),
      tupleDescriptor(fixture.inputs.baselineBundle),
    )
    const target = readExact(
      path.join(artifactRoot, fixture.inputs.targetBundle[0]),
      tupleDescriptor(fixture.inputs.targetBundle),
    )
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger[0]),
      tupleDescriptor(fixture.inputs.structuralLedger),
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const expectedUnit = fixture.target117.sharedComponentUnit
    const region = ledger.regions.find(
      row => row.target.index === expectedUnit[0],
    )
    assert.ok(region)
    assert.deepEqual(regionTuple(region), expectedUnit)
    const unit = assertBundleRange(
      target,
      [expectedUnit[3], expectedUnit[4], expectedUnit[4] - expectedUnit[3], expectedUnit[6]],
      'shared EmptyState unit',
    )
    assert.equal(baseline.includes(unit), false)

    const ast = parse(unit.toString('utf8'), { ecmaVersion: 'latest' })
    const declaration = ast.body[0]
    assert.equal(declaration.type, 'FunctionDeclaration')
    assert.equal(declaration.params.length, 1)
    assert.equal(declaration.params[0].type, 'Identifier')
    const cacheCalls = acornNodes(
      declaration,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.name === 'c',
    )
    assert.equal(cacheCalls.length, 1)
    assert.equal(cacheCalls[0].arguments[0].value, 9)
    const destructures = acornNodes(
      declaration,
      node => node.type === 'ObjectPattern',
    )
    assert.equal(destructures.length, 1)
    assert.deepEqual(
      destructures[0].properties.map(property => property.key.name),
      ['children', 'hint'],
    )
    const conditions = acornNodes(
      declaration,
      node =>
        node.type === 'IfStatement' &&
        node.test.type === 'UnaryExpression' &&
        node.test.operator === '!' &&
        node.test.argument.type === 'Identifier' &&
        node.test.argument.name === 'K',
    )
    assert.equal(conditions.length, 1)
    assert.equal(conditions[0].test.type, 'UnaryExpression')
    assert.equal(conditions[0].test.operator, '!')
    const creates = acornNodes(
      declaration,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.name === 'createElement',
    )
    assert.equal(creates.length, 4)
    assert.deepEqual(
      creates.map(call => call.arguments[0].name),
      ['k', 'k', 'k', 'm'],
    )
    for (const call of creates.slice(0, 3)) {
      const properties = call.arguments[1].properties
      assert.equal(properties.length, 1)
      assert.equal(properties[0].key.name, 'dimColor')
      assert.equal(properties[0].value.operator, '!')
      assert.equal(properties[0].value.argument.value, 0)
    }
    const boxProperties = creates[3].arguments[1].properties
    assert.equal(boxProperties.length, 1)
    assert.equal(boxProperties[0].key.name, 'flexDirection')
    assert.equal(boxProperties[0].value.value, 'column')
    const slots = acornNodes(
      declaration,
      node =>
        node.type === 'MemberExpression' &&
        node.computed &&
        node.object.type === 'Identifier' &&
        node.object.name === '$' &&
        node.property.type === 'Literal',
    ).map(node => node.property.value)
    assertContiguousSlots(slots, 9)

    const moduleInit = assertBundleRange(
      target,
      fixture.target117.sharedComponentModuleInit,
      'shared EmptyState module initializer',
    ).toString('utf8')
    assert.match(moduleInit, /^var szK,ft;var g3=/)
    assert.match(moduleInit, /gH\(\)/)
    assert.match(moduleInit, /lH\(\)/)
    assert.match(moduleInit, /wH\(\)/)
    const consumerInit = assertBundleRange(
      target,
      fixture.target117.consumerModuleInitPrefix,
      'consumer module initializer prefix',
    ).toString('utf8')
    assert.match(consumerInit, /g3\(\)/)
    assert.equal(fixture.summary.sourcePathAttribution.status, 'inferred-no-target-sourcemap')
  },
)

test(
  'Target117 authenticates the complete plugin consumer and coupled project-install routing',
  { skip: !selected },
  () => {
    const baseline = readExact(
      path.join(artifactRoot, fixture.inputs.baselineBundle[0]),
      tupleDescriptor(fixture.inputs.baselineBundle),
    )
    const target = readExact(
      path.join(artifactRoot, fixture.inputs.targetBundle[0]),
      tupleDescriptor(fixture.inputs.targetBundle),
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger[0]),
          tupleDescriptor(fixture.inputs.structuralLedger),
        ),
      ),
    )
    for (const expected of [
      fixture.target117.allScopeInstalledFunction,
      fixture.target117.globalInstalledFunction,
      fixture.target117.producerUnit,
      fixture.target117.consumerUnit,
    ]) {
      const region = ledger.regions.find(row => row.target.index === expected[0])
      assert.ok(region)
      assert.deepEqual(regionTuple(region), expected)
      assertBundleRange(
        target,
        [expected[3], expected[4], expected[4] - expected[3], expected[6]],
        `target unit ${expected[0]}`,
      )
    }

    const allScopeUnit = target.subarray(
      fixture.target117.allScopeInstalledFunction[3],
      fixture.target117.allScopeInstalledFunction[4],
    ).toString('utf8')
    const globalUnit = target.subarray(
      fixture.target117.globalInstalledFunction[3],
      fixture.target117.globalInstalledFunction[4],
    ).toString('utf8')
    assert.match(allScopeUnit, /\.some\(bf6\)/)
    assert.match(globalUnit, /scope==="user"\|\|_\.scope==="managed"/)

    const producerTuple = fixture.target117.producerUnit
    const producerBytes = target.subarray(producerTuple[3], producerTuple[4])
    const producer = parse(producerBytes.toString('utf8'), {
      ecmaVersion: 'latest',
    })
    const installedProperties = acornNodes(
      producer,
      node =>
        node.type === 'Property' &&
        !node.computed &&
        node.key.name === 'isInstalled',
    )
    assert.equal(installedProperties.length, 1)
    assert.equal(installedProperties[0].value.type, 'CallExpression')
    assert.equal(installedProperties[0].value.callee.name, 'iu')
    const producerCalls = acornNodes(
      producer,
      node => node.type === 'CallExpression' && node.callee.type === 'Identifier',
    )
    assert.equal(producerCalls.filter(call => call.callee.name === 'iu').length, 1)
    assert.equal(producerCalls.filter(call => call.callee.name === 'dLH').length, 2)
    assertBundleRange(
      target,
      fixture.target117.allScopeInstalledAssignment,
      'all-scope installed assignment',
    )
    assertBundleRange(
      target,
      fixture.target117.projectReasonProducer,
      'project reason producer',
    )
    assertBundleRange(
      target,
      fixture.target117.projectReasonConditional,
      'project reason conditional',
    )
    assertBundleRange(
      target,
      fixture.target117.targetPluginGlobalGate,
      'target-plugin global gate',
    )

    const consumerTuple = fixture.target117.consumerUnit
    const consumerBytes = target.subarray(consumerTuple[3], consumerTuple[4])
    const consumer = parse(consumerBytes.toString('utf8'), {
      ecmaVersion: 'latest',
    })
    const switchStatements = acornNodes(
      consumer,
      node => node.type === 'SwitchStatement',
    )
    assert.equal(switchStatements.length, 1)
    const switchStatement = switchStatements[0]
    assert.deepEqual(
      switchStatement.cases.map(row => row.test?.value ?? null),
      [
        'git-not-installed',
        'all-blocked-by-policy',
        'policy-restricts-sources',
        'all-marketplaces-failed',
        'all-plugins-installed',
        'all-plugins-project-installed',
        'no-marketplaces-configured',
        null,
      ],
    )
    const cacheCall = acornNodes(
      consumer,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.name === 'c',
    )
    assert.equal(cacheCall.length, 1)
    assert.equal(cacheCall[0].arguments[0].value, 7)
    const slots = acornNodes(
      consumer,
      node =>
        node.type === 'MemberExpression' &&
        node.computed &&
        node.object.name === '$' &&
        node.property.type === 'Literal',
    ).map(node => node.property.value)
    assertContiguousSlots(slots, 7)
    const delegates = acornNodes(
      consumer,
      node =>
        node.type === 'CallExpression' &&
        node.arguments[0]?.type === 'Identifier' &&
        node.arguments[0].name === 'L4',
    )
    assert.equal(delegates.length, 1)
    const delegate = delegates[0]
    const props = Object.fromEntries(
      delegate.arguments[1].properties.map(property => [
        property.key.name,
        property.value,
      ]),
    )
    assert.equal(
      props.hint.value,
      'Add a marketplace first using the Marketplaces tab.',
    )
    assert.equal(delegate.arguments[2].value, 'No plugins available.')
    assertBundleRange(
      target,
      fixture.target117.projectReasonCase,
      'project-only installed switch case',
    )
    const targetCall = assertBundleRange(
      target,
      fixture.target117.emptyStateCall,
      'plugin EmptyState call',
    )
    assert.equal(baseline.includes(targetCall), false)
    const residue = fixture.target117.residue
    assert.equal(
      target.subarray(residue[2], residue[3]).toString('utf8'),
      residue[1],
    )

    assert.deepEqual(
      TARGET117_PLUGIN_EMPTY_STATE_OWNER_OVERRIDES.map(row => [
        row.key,
        row.targetIndex,
        row.paths,
        row.declarations,
        row.evidenceIds,
      ]),
      [[
        `${caseName}:16097`,
        16097,
        [
          fixture.inputs.rawSource.files[0].path,
          fixture.summary.sourcePathAttribution.chosenPath,
          fixture.inputs.rawSource.files[1].path,
        ],
        [
          'EmptyStateMessage',
          'EmptyState',
          'DiscoverPlugins',
          'EmptyMarketplaceReason',
        ],
        fixture.evidenceIds,
      ]],
    )
  },
)

test(
  'recovered source preserves the complete EmptyState and project-install semantics',
  { skip: !selected },
  async () => {
    const raw = fixture.inputs.rawSource
    assert.equal(
      execFileSync('git', ['rev-parse', `${raw.commit}^{tree}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      raw.tree,
    )
    for (const input of raw.files) {
      if (input.absent) {
        assert.throws(() =>
          execFileSync('git', ['cat-file', '-e', `${raw.commit}:${input.path}`], {
            cwd: repositoryRoot,
            stdio: 'pipe',
          }),
        )
        continue
      }
      assert.equal(
        execFileSync('git', ['rev-parse', `${raw.commit}:${input.path}`], {
          cwd: repositoryRoot,
          encoding: 'utf8',
        }).trim(),
        input.blob,
      )
      const bytes = execFileSync('git', ['show', `${raw.commit}:${input.path}`], {
        cwd: repositoryRoot,
      })
      assert.deepEqual(descriptor(bytes), {
        bytes: input.bytes,
        sha256: input.sha256,
      })
    }

    const replay = materializeRawSource('target117-plugin-empty-state-ast-')
    try {
      assert.equal(
        applyTarget117PluginEmptyStateSourceRecovery({
          sourceRoot: replay.sourceRoot,
        }).status,
        'recovered',
      )
      const ts = await loadTypeScript()
      const parsed = new Map()
      for (const expected of fixture.inputs.postimages) {
        const bytes = readExact(
          sourceFilename(replay.sourceRoot, expected.path),
          { bytes: expected.bytes, sha256: expected.sha256 },
        )
        const source = bytes.toString('utf8')
        const sourceFile = parseTypeScript(ts, expected.path, bytes)
        const declaration = exactNamedDeclaration(
          ts,
          sourceFile,
          source,
          expected,
        )
        parsed.set(expected.path, { bytes, source, sourceFile, declaration })
      }

      const discoverExpected = fixture.inputs.postimages[0]
      const discover = parsed.get(discoverExpected.path)
      const emptyImports = discover.sourceFile.statements.filter(
        statement =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text ===
            '../../components/design-system/EmptyState.js',
      )
      assert.equal(emptyImports.length, 1)
      assert.deepEqual(
        [
          emptyImports[0].getStart(discover.sourceFile),
          emptyImports[0].end,
          ...Object.values(
            descriptor(
              Buffer.from(
                discover.source.slice(
                  emptyImports[0].getStart(discover.sourceFile),
                  emptyImports[0].end,
                ),
              ),
            ),
          ),
        ],
        discoverExpected.emptyStateImportTuple,
      )
      const installedImports = discover.sourceFile.statements.filter(
        statement =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text ===
            '../../utils/plugins/installedPluginsManager.js',
      )
      assert.equal(installedImports.length, 1)
      assert.deepEqual(
        installedImports[0].importClause.namedBindings.elements.map(
          element => element.name.text,
        ),
        ['isPluginGloballyInstalled', 'isPluginInstalled'],
      )

      const emptyMessage = discover.declaration
      const cacheCalls = descendants(
        ts,
        emptyMessage,
        node =>
          ts.isCallExpression(node) &&
          node.expression.getText(discover.sourceFile) === '_c',
      )
      assert.equal(cacheCalls.length, 1)
      assert.equal(cacheCalls[0].arguments[0].text, '7')
      const slots = descendants(
        ts,
        emptyMessage,
        node =>
          ts.isElementAccessExpression(node) &&
          node.expression.getText(discover.sourceFile) === '$' &&
          ts.isNumericLiteral(node.argumentExpression),
      ).map(node => Number(node.argumentExpression.text))
      assertContiguousSlots(slots, 7)
      const switches = descendants(ts, emptyMessage, node =>
        ts.isSwitchStatement(node),
      )
      assert.equal(switches.length, 1)
      assert.deepEqual(
        switches[0].caseBlock.clauses.map(clause =>
          ts.isDefaultClause(clause) ? null : clause.expression.text,
        ),
        [
          'git-not-installed',
          'all-blocked-by-policy',
          'policy-restricts-sources',
          'all-marketplaces-failed',
          'all-plugins-installed',
          'all-plugins-project-installed',
          'no-marketplaces-configured',
          null,
        ],
      )
      const delegates = descendants(
        ts,
        emptyMessage,
        node =>
          ts.isJsxElement(node) &&
          node.openingElement.tagName.getText(discover.sourceFile) ===
            'EmptyState',
      )
      assert.equal(delegates.length, 1)
      const delegate = delegates[0]
      assert.deepEqual(
        [
          delegate.getStart(discover.sourceFile),
          delegate.end,
          ...Object.values(
            descriptor(
              Buffer.from(
                discover.source.slice(
                  delegate.getStart(discover.sourceFile),
                  delegate.end,
                ),
              ),
            ),
          ),
        ],
        discoverExpected.emptyStateJsxTuple,
      )
      assert.equal(
        delegate.openingElement.attributes.properties[0].initializer.text,
        'Add a marketplace first using the Marketplaces tab.',
      )
      assert.equal(delegate.children[0].text, 'No plugins available.')
      assert.match(
        emptyMessage.getText(discover.sourceFile),
        /All available plugins are installed for this project\./,
      )
      assert.match(
        emptyMessage.getText(discover.sourceFile),
        /Use the Browse tab to install at user scope\./,
      )
      const projectProducer = assertSourceTuple(
        discover.source,
        discoverExpected.projectReasonProducerTuple,
        'source project reason producer',
      )
      assert.match(projectProducer, /let reason = await/)
      assert.match(projectProducer, /allPlugins\.every/)
      assert.match(projectProducer, /!isPluginGloballyInstalled/)
      assert.match(projectProducer, /!allPlugins\.some/)
      assertSourceTuple(
        discover.source,
        discoverExpected.installedAssignmentTuple,
        'source all-scope installed assignment',
      )
      assertSourceTuple(
        discover.source,
        discoverExpected.targetPluginGlobalGateTuple,
        'source target-plugin global gate',
      )

      const marketplaceExpected = fixture.inputs.postimages[1]
      const marketplace = parsed.get(marketplaceExpected.path)
      assert.deepEqual(
        marketplace.declaration.type.types.map(type => type.literal.text),
        [
          'git-not-installed',
          'all-blocked-by-policy',
          'policy-restricts-sources',
          'all-marketplaces-failed',
          'no-marketplaces-configured',
          'all-plugins-installed',
          'all-plugins-project-installed',
        ],
      )

      const componentExpected = fixture.inputs.postimages[2]
      const component = parsed.get(componentExpected.path)
      const componentImports = component.sourceFile.statements.filter(statement =>
        ts.isImportDeclaration(statement),
      )
      assert.equal(componentImports.length, 2)
      assert.ok(
        ts.isNamespaceImport(componentImports[0].importClause.namedBindings),
      )
      assert.equal(
        componentImports[0].importClause.namedBindings.name.text,
        'React',
      )
      const inkImport = componentImports[1]
      assert.equal(inkImport.moduleSpecifier.text, '../../ink.js')
      assert.deepEqual(
        inkImport.importClause.namedBindings.elements.map(
          element => element.name.text,
        ),
        ['Box', 'Text'],
      )
      assert.deepEqual(
        [
          inkImport.getStart(component.sourceFile),
          inkImport.end,
          ...Object.values(
            descriptor(
              Buffer.from(
                component.source.slice(
                  inkImport.getStart(component.sourceFile),
                  inkImport.end,
                ),
              ),
            ),
          ),
        ],
        componentExpected.inkImportTuple,
      )
      const binding = component.declaration.parameters[0].name
      assert.ok(ts.isObjectBindingPattern(binding))
      assert.deepEqual(
        binding.elements.map(element => element.name.text),
        ['children', 'hint'],
      )
      const componentIfs = descendants(ts, component.declaration, node =>
        ts.isIfStatement(node),
      )
      assert.equal(componentIfs.length, 1)
      assert.equal(componentIfs[0].expression.getText(component.sourceFile), '!hint')
      const boxes = descendants(
        ts,
        component.declaration,
        node =>
          ts.isJsxElement(node) &&
          node.openingElement.tagName.getText(component.sourceFile) === 'Box',
      )
      assert.equal(boxes.length, 1)
      assert.equal(
        boxes[0].openingElement.attributes.properties[0].initializer.text,
        'column',
      )
      const texts = descendants(
        ts,
        component.declaration,
        node =>
          (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
          (node.openingElement?.tagName ?? node.tagName).getText(
            component.sourceFile,
          ) === 'Text',
      )
      assert.equal(texts.length, 3)
      assert.ok(
        texts.every(text => {
          const opening = text.openingElement ?? text
          return opening.attributes.properties.some(
            property => property.name.getText(component.sourceFile) === 'dimColor',
          )
        }),
      )
    } finally {
      fs.rmSync(replay.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  'plugin EmptyState replay is raw/package dual-state, idempotent, atomic, and fail-closed',
  { skip: !selected },
  () => {
    assert.deepEqual(
      TARGET117_PLUGIN_EMPTY_STATE_CONTEXT_FILES,
      [fixture.inputs.context],
    )
    assert.deepEqual(
      TARGET117_PLUGIN_EMPTY_STATE_FILES.map(file => ({
        path: file.path,
        raw: file.raw,
        postimage: file.postimage,
      })),
      fixture.inputs.rawSource.files.map((raw, index) => ({
        path: raw.path,
        raw: raw.absent
          ? null
          : { bytes: raw.bytes, sha256: raw.sha256 },
        postimage: {
          bytes: fixture.inputs.postimages[index].bytes,
          sha256: fixture.inputs.postimages[index].sha256,
        },
      })),
    )
    assert.deepEqual(
      descriptor(Buffer.from(TARGET117_EMPTY_STATE_SOURCE)),
      {
        bytes: fixture.inputs.postimages[2].bytes,
        sha256: fixture.inputs.postimages[2].sha256,
      },
    )

    const raw = materializeRawSource('target117-plugin-empty-state-raw-')
    try {
      assert.equal(
        applyTarget117PluginEmptyStateSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'recovered',
      )
      assert.equal(
        applyTarget117PluginEmptyStateSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'already-recovered',
      )
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    let packageSeed
    const selectedSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
      ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
      : (() => {
          packageSeed = materializeRawSource(
            'target117-plugin-empty-state-seed-',
          )
          applyTarget117PluginEmptyStateSourceRecovery({
            sourceRoot: packageSeed.sourceRoot,
          })
          return packageSeed.sourceRoot
        })()
    const packaged = copySelectedSource(
      selectedSourceRoot,
      'target117-plugin-empty-state-package-',
    )
    try {
      const first = applyTarget117PluginEmptyStateSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(first.status))
      assert.equal(
        applyTarget117PluginEmptyStateSourceRecovery({
          sourceRoot: packaged.sourceRoot,
        }).status,
        'already-recovered',
      )
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
      if (packageSeed) {
        fs.rmSync(packageSeed.temporaryRoot, { recursive: true, force: true })
      }
    }

    const missingContext = materializeRawSource(
      'target117-plugin-empty-state-no-context-',
    )
    try {
      fs.rmSync(
        sourceFilename(missingContext.sourceRoot, fixture.inputs.context.path),
      )
      assert.throws(
        () =>
          applyTarget117PluginEmptyStateSourceRecovery({
            sourceRoot: missingContext.sourceRoot,
          }),
        /required Target117 context is absent/,
      )
    } finally {
      fs.rmSync(missingContext.temporaryRoot, {
        recursive: true,
        force: true,
      })
    }

    const drift = materializeRawSource('target117-plugin-empty-state-drift-')
    try {
      fs.appendFileSync(
        sourceFilename(drift.sourceRoot, fixture.inputs.rawSource.files[0].path),
        '\n// drift\n',
      )
      assert.throws(
        () =>
          applyTarget117PluginEmptyStateSourceRecovery({
            sourceRoot: drift.sourceRoot,
          }),
        /expected raw .* or postimage/,
      )
    } finally {
      fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
    }

    const mixed = materializeRawSource('target117-plugin-empty-state-mixed-')
    try {
      const component = sourceFilename(
        mixed.sourceRoot,
        fixture.inputs.rawSource.files[2].path,
      )
      fs.mkdirSync(path.dirname(component), { recursive: true })
      fs.writeFileSync(component, TARGET117_EMPTY_STATE_SOURCE)
      assert.throws(
        () =>
          applyTarget117PluginEmptyStateSourceRecovery({
            sourceRoot: mixed.sourceRoot,
          }),
        /Refusing mixed Target117 plugin EmptyState recovery/,
      )
    } finally {
      fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
    }

    const symlink = materializeRawSource(
      'target117-plugin-empty-state-symlink-',
    )
    try {
      const component = sourceFilename(
        symlink.sourceRoot,
        fixture.inputs.rawSource.files[2].path,
      )
      fs.mkdirSync(path.dirname(component), { recursive: true })
      fs.symlinkSync(
        sourceFilename(symlink.sourceRoot, fixture.inputs.context.path),
        component,
      )
      assert.throws(
        () =>
          applyTarget117PluginEmptyStateSourceRecovery({
            sourceRoot: symlink.sourceRoot,
          }),
        /expected a real source file/,
      )
    } finally {
      fs.rmSync(symlink.temporaryRoot, { recursive: true, force: true })
    }
  },
)
