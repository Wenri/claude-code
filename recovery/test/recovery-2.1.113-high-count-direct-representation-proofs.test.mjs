import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const recoveredSourceRoot = path.join(repositoryRoot, 'src')
const comparisonSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? recoveredSourceRoot,
)
const historicalPackageSelected = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_TARGET_COMMIT,
)
const selectedSourceRoot = historicalPackageSelected
  ? comparisonSourceRoot
  : recoveredSourceRoot
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-high-count-direct-representation-proofs.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 =
  'a9a7a75c78d0ec9ef8a8aa9300b6c66a0706d50b76cdbe7e1b55367e0d694736'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  return `${kind}:${JSON.stringify(value)}`
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

function collectOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      occurrences.push({
        end: node.end,
        identity: identity('string', node.value),
        start: node.start,
      })
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') {
        occurrences.push({
          end: node.end,
          identity: identity('string', value),
          start: node.start,
        })
      }
    }
    const isProperty =
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
        node.computed === false &&
        node.key?.type === 'Identifier') ||
      (node.type === 'MemberExpression' &&
        node.computed === false &&
        node.property?.type === 'Identifier')
    if (isProperty) {
      const property = node.key ?? node.property
      occurrences.push({
        end: property.end,
        identity: identity('property', property.name),
        start: property.start,
      })
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  const grouped = new Map()
  for (const occurrence of occurrences) {
    const values = grouped.get(occurrence.identity) ?? []
    values.push(occurrence)
    grouped.set(occurrence.identity, values)
  }
  return { ast, grouped }
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifact.targetInnerSha256) {
    return bytes.toString('utf8')
  }
  assert.equal(digest, fixture.artifact.targetWrapperSha256)
  const inner = bytes.subarray(
    fixture.artifact.targetWrapperPrefixLength,
    bytes.length - fixture.artifact.targetWrapperSuffixLength,
  )
  assert.equal(sha256(inner), fixture.artifact.targetInnerSha256)
  return inner.toString('utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

function sourceFilename(root, owner) {
  const filename = path.join(root, owner.replace(/^src\//, ''))
  assert.ok(fs.existsSync(filename), `${owner}: source owner exists`)
  return filename
}

function parseSource(ts, root, owner) {
  const filename = sourceFilename(root, owner)
  const source = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${owner}: parses`)
  return { filename, parsed, source }
}

function declarationName(ts, node) {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    return node.name?.text
  }
  return undefined
}

function findDeclaration(ts, parsed, name) {
  let found
  function visit(node) {
    if (!found && declarationName(ts, node) === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
}

function declarationKind(ts, node) {
  if (ts.isFunctionDeclaration(node)) return 'FunctionDeclaration'
  if (ts.isClassDeclaration(node)) return 'ClassDeclaration'
  return null
}

function sourceImports(ts, parsed) {
  const imports = []
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const module = statement.moduleSpecifier.text
    if (statement.importClause.name) {
      imports.push([module, 'default', statement.importClause.name.text])
    }
    const bindings = statement.importClause.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.push([
          module,
          element.propertyName?.text ?? element.name.text,
          element.name.text,
        ])
      }
    }
  }
  return imports
}

function declarationFacts(ts, declaration) {
  const directCalls = new Map()
  const strings = new Map()
  let jsxElementCount = 0
  const increment = (map, key) => map.set(key, (map.get(key) ?? 0) + 1)
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      increment(directCalls, node.expression.text)
    }
    if (ts.isStringLiteralLike(node)) increment(strings, node.text)
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      jsxElementCount += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return { directCalls, jsxElementCount, strings }
}

function hasSwitchCase(ts, declaration, label) {
  let found = false
  function visit(node) {
    if (
      ts.isCaseClause(node) &&
      ts.isStringLiteralLike(node.expression) &&
      node.expression.text === label
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return found
}

function assertSourceRow(ts, root, row, sourceKind) {
  const parsed = parseSource(ts, root, row.correctedOwner)
  const declaration = findDeclaration(
    ts,
    parsed.parsed,
    row.source.declaration,
  )
  assert.ok(declaration, `u${row.targetIndex}: ${row.source.declaration}`)
  assert.equal(declarationKind(ts, declaration), row.source.kind)
  const actualDeclarationHash = sha256(declaration.getText(parsed.parsed))
  if (historicalPackageSelected) {
    // The packaged source is a bounded cumulative reconstruction and may
    // combine the authenticated current and historical representations. Keep
    // the exact declaration hash gate when it equals either frozen form;
    // role/import/call/behavior assertions below remain mandatory.
    assert.ok(
      [row.source.recoveredSha256, row.source.comparisonSha256].includes(
        actualDeclarationHash,
      ),
      `u${row.targetIndex}: packaged declaration hash`,
    )
  } else {
    assert.equal(
      actualDeclarationHash,
      row.source[`${sourceKind}Sha256`],
      `u${row.targetIndex}: ${sourceKind} declaration hash`,
    )
  }
  const imports = sourceImports(ts, parsed.parsed)
  for (const expected of row.source.imports ?? []) {
    assert.ok(
      imports.some(actual =>
        actual.every((value, index) => value === expected[index]),
      ),
      `u${row.targetIndex}: import ${expected.join(':')}`,
    )
  }
  const facts = declarationFacts(ts, declaration)
  for (const [name, count] of Object.entries(
    row.source.directCallCounts ?? {},
  )) {
    assert.equal(
      facts.directCalls.get(name),
      count,
      `u${row.targetIndex}: ${name} direct calls`,
    )
  }
  for (const [name, count] of Object.entries(
    row.source.minimumDirectCalls ?? {},
  )) {
    assert.ok(
      (facts.directCalls.get(name) ?? 0) >= count,
      `u${row.targetIndex}: ${name} minimum direct calls`,
    )
  }
  for (const value of row.source.requiredStrings ?? []) {
    assert.ok(facts.strings.has(value), `u${row.targetIndex}: ${value}`)
  }
  if (row.source.jsxElementCount !== undefined) {
    assert.equal(
      facts.jsxElementCount,
      row.source.jsxElementCount,
      `u${row.targetIndex}: JSX element count`,
    )
  }
  if (row.source.requiredSwitchCase) {
    assert.ok(
      hasSwitchCase(ts, declaration, row.source.requiredSwitchCase),
      `u${row.targetIndex}: ${row.source.requiredSwitchCase} case`,
    )
  }
  return { ...parsed, declaration, facts }
}

function compileTarget(fragment, dependencies, name) {
  return Function(
    ...Object.keys(dependencies),
    `${fragment}; return ${name}`,
  )(...Object.values(dependencies))
}

function compileSource(ts, parsed, declaration, dependencies, name) {
  const output = ts.transpileModule(declaration.getText(parsed), {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(
    ...Object.keys(dependencies),
    `${output}; return ${name}`,
  )(...Object.values(dependencies))
}

function createInstallHarness() {
  const effects = []
  const stateUpdates = []
  let resolvePersistence
  const persisted = new Promise(resolve => {
    resolvePersistence = resolve
  })
  const createElement = (type, props, ...children) => ({
    children,
    props,
    type,
  })
  const useEffect = effect => effects.push(effect)
  const useState = initial => [initial, value => stateUpdates.push(value)]
  let persistedValue
  const updateSettingsForSource = (source, value) => {
    persistedValue = { source, value }
    resolvePersistence()
  }
  const dependencies = {
    Box: 'Box',
    React: { createElement },
    SetupNotes: 'SetupNotes',
    StatusIcon: 'StatusIcon',
    Text: 'Text',
    checkInstall: async () => [],
    cleanupNpmInstallations: async () => ({
      errors: [],
      removed: 0,
      warnings: [],
    }),
    cleanupShellAliases: async () => [],
    errorMessage: String,
    getInitialSettings: () => ({ autoUpdatesChannel: 'latest' }),
    getInstallationPath: () => '/tmp/claude',
    installLatest: async channel => ({
      latestVersion: channel,
      lockFailed: false,
      wasUpdated: true,
    }),
    logEvent: () => {},
    logForDebugging: () => {},
    updateSettingsForSource,
    useEffect,
    useState,
  }
  return {
    dependencies,
    effects,
    persisted,
    persistedValue: () => persistedValue,
    stateUpdates,
  }
}

test('the target113 high-count direct-representation fixture is exact', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 4,
    residues: 81,
    directSourceResidues: 41,
    alternateSourceResidues: 6,
    extractedHelperResidues: 2,
    compilerLoweredResidues: 30,
    recoveredSourceGapResidues: 1,
    streamRequestStatusResidues: 1,
  })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [17949, 19732, 20264, 20358],
  )
  assert.equal(
    fixture.rows.reduce((total, row) => total + row.residues.length, 0),
    fixture.summary.residues,
  )
  const classifications = fixture.rows.flatMap(row =>
    row.residues.map(residue => residue[6]),
  )
  assert.equal(
    classifications.filter(value => value === 'runtime-import-call').length +
      classifications.filter(value => value === 'source-assembled-string')
        .length,
    fixture.summary.directSourceResidues,
  )
  assert.equal(
    classifications.filter(value => value === 'alternate-input-api').length,
    fixture.summary.alternateSourceResidues,
  )
  assert.equal(
    classifications.filter(value => value === 'extracted-query-context')
      .length,
    fixture.summary.extractedHelperResidues,
  )
  assert.equal(
    classifications.filter(
      value => value === 'jsx-default-import-lowering',
    ).length,
    fixture.summary.compilerLoweredResidues,
  )
  assert.equal(
    classifications.filter(value => value === 'recovered-source-gap').length,
    fixture.summary.recoveredSourceGapResidues,
  )
  assert.equal(
    classifications.filter(
      value => value === 'stream-request-status-branch',
    ).length,
    fixture.summary.streamRequestStatusResidues,
  )
  for (const row of fixture.rows) {
    const region = structural.regions[row.targetIndex]
    assert.equal(region?.target?.index, row.targetIndex)
    assert.deepEqual(
      {
        classification: region.classification,
        end: region.target.end,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        start: region.target.start,
      },
      row.target,
      `u${row.targetIndex}: structural identity`,
    )
    assert.equal(
      sha256(JSON.stringify(row.residues.map(residue => residue.slice(0, 6)))),
      row.residueDigest,
      `u${row.targetIndex}: exact residue digest`,
    )
    for (const [, , start, end, baselineCount, targetOrdinal] of row.residues) {
      assert.ok(targetOrdinal > baselineCount)
      assert.ok(start >= row.target.start)
      assert.ok(end <= row.target.end)
    }
  }
})

test(
  'current source pins direct, alternate, extracted, and recovered representations',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const ts = await loadTypeScript()
    const byIndex = new Map(fixture.rows.map(row => [row.targetIndex, row]))
    for (const row of fixture.rows) {
      assertSourceRow(ts, selectedSourceRoot, row, 'recovered')
    }

    const replSource = fs.readFileSync(
      sourceFilename(selectedSourceRoot, byIndex.get(19732).correctedOwner),
      'utf8',
    )
    const alternateInputApi = byIndex.get(19732).source.alternateInputApi
    const requiredInputApi = historicalPackageSelected
      ? ['useSearchInput', 'stopImmediatePropagation']
      : alternateInputApi
    for (const representation of requiredInputApi) {
      assert.ok(
        replSource.includes(representation),
        `u19732: alternate input API ${representation}`,
      )
    }

    const queryContext = fs.readFileSync(
      sourceFilename(selectedSourceRoot, byIndex.get(20264).supportingOwner),
      'utf8',
    )
    if (!historicalPackageSelected) {
      assert.ok(
        queryContext.includes(
          byIndex.get(20264).source.supportingRepresentation,
        ),
        'u20264: extracted abortSpeculation query-context representation',
      )
    } else {
      const queryEngine = fs.readFileSync(
        sourceFilename(selectedSourceRoot, byIndex.get(20264).correctedOwner),
        'utf8',
      )
      // The introduction-time package retains the pre-extraction direct
      // QueryEngine representation. Exact unit/residue and declaration/call
      // gates above prove the same live class without requiring the later
      // queryContext spelling.
      assert.match(queryEngine, /class QueryEngine/)
    }

    const install = assertSourceRow(
      ts,
      selectedSourceRoot,
      byIndex.get(20358),
      'recovered',
    )
    assert.equal(install.facts.strings.get('rc'), 2)
    assert.match(
      install.declaration.getText(install.parsed),
      /target === 'rc' \? 'stable' : target/,
    )
  },
)

test(
  'comparison root pins retained declarations and the bounded install omission',
  {
    skip:
      !selected ||
      historicalPackageSelected ||
      comparisonSourceRoot === recoveredSourceRoot
        ? 'a distinct materialized source root is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const byIndex = new Map(fixture.rows.map(row => [row.targetIndex, row]))
    for (const row of fixture.rows) {
      assertSourceRow(ts, comparisonSourceRoot, row, 'comparison')
    }
    const queryContext = fs.readFileSync(
      sourceFilename(comparisonSourceRoot, byIndex.get(20264).supportingOwner),
      'utf8',
    )
    assert.equal(
      queryContext.includes(
        byIndex.get(20264).source.supportingRepresentation,
      ),
      false,
      'u20264: historical package predates the extracted helper representation',
    )
    const historicalInstall = parseSource(
      ts,
      comparisonSourceRoot,
      byIndex.get(20358).correctedOwner,
    )
    const declaration = findDeclaration(
      ts,
      historicalInstall.parsed,
      'Install',
    )
    assert.ok(declaration)
    assert.equal(declarationFacts(ts, declaration).strings.has('rc'), false)
  },
)

test(
  'authenticated bundles pin all 81 target-added occurrences and complete units',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), fixture.artifact.baselineSha256)
    const baseline = collectOccurrences(baselineBytes.toString('utf8'))
    const targetSource = authenticatedTargetInner(targetPath)
    const target = collectOccurrences(targetSource)
    for (const row of fixture.rows) {
      const fragment = targetSource.slice(row.target.start, row.target.end)
      assert.equal(sha256(fragment), row.target.sourceHash)
      const fragmentAst = parse(fragment, {
        allowHashBang: true,
        ecmaVersion: 'latest',
        sourceType: 'module',
      })
      assert.equal(fragmentAst.body.length, 1, `u${row.targetIndex}: one unit`)
      assert.equal(fragmentAst.body[0].type, row.target.nodeType)
      for (const [
        kind,
        value,
        start,
        end,
        baselineCount,
        targetOrdinal,
      ] of row.residues) {
        const residueIdentity = identity(kind, value)
        assert.equal(
          (baseline.grouped.get(residueIdentity) ?? []).length,
          baselineCount,
          `u${row.targetIndex}: ${residueIdentity} baseline count`,
        )
        const occurrence =
          (target.grouped.get(residueIdentity) ?? [])[targetOrdinal - 1]
        assert.ok(
          occurrence,
          `u${row.targetIndex}: ${residueIdentity} target ordinal`,
        )
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [start, end],
          `u${row.targetIndex}: ${residueIdentity} exact range`,
        )
        assert.ok(targetOrdinal > baselineCount)
      }
    }
  },
)

test(
  'authenticated target and recovered source both persist install rc as stable',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const row = fixture.rows.find(item => item.targetIndex === 20358)
    const targetSource = authenticatedTargetInner(targetPath)
    const targetHarness = createInstallHarness()
    const targetInstall = compileTarget(
      targetSource.slice(row.target.start, row.target.end),
      {
        A1: {
          default: {
            createElement: targetHarness.dependencies.React.createElement,
          },
          useEffect: targetHarness.dependencies.useEffect,
          useState: targetHarness.dependencies.useState,
        },
        LH6: targetHarness.dependencies.cleanupShellAliases,
        N: targetHarness.dependencies.logForDebugging,
        PjH: targetHarness.dependencies.installLatest,
        Us1: targetHarness.dependencies.getInstallationPath,
        W6: targetHarness.dependencies.updateSettingsForSource,
        WH6: targetHarness.dependencies.cleanupNpmInstallations,
        X5_: targetHarness.dependencies.SetupNotes,
        XjH: targetHarness.dependencies.checkInstall,
        YK: targetHarness.dependencies.StatusIcon,
        ku: targetHarness.dependencies.getInitialSettings,
        l: targetHarness.dependencies.logEvent,
        m: targetHarness.dependencies.Box,
        T: targetHarness.dependencies.Text,
        xH: targetHarness.dependencies.errorMessage,
      },
      row.targetName,
    )
    targetInstall({ force: false, onDone: () => {}, target: 'rc' })
    assert.equal(targetHarness.effects.length, 2)
    targetHarness.effects[0]()
    await targetHarness.persisted
    assert.deepEqual(targetHarness.persistedValue(), {
      source: 'userSettings',
      value: { autoUpdatesChannel: 'stable' },
    })

    const source = parseSource(ts, recoveredSourceRoot, row.correctedOwner)
    const declaration = findDeclaration(ts, source.parsed, 'Install')
    const sourceHarness = createInstallHarness()
    const sourceInstall = compileSource(
      ts,
      source.parsed,
      declaration,
      sourceHarness.dependencies,
      'Install',
    )
    sourceInstall({ force: false, onDone: () => {}, target: 'rc' })
    assert.equal(sourceHarness.effects.length, 2)
    sourceHarness.effects[0]()
    await sourceHarness.persisted
    assert.deepEqual(sourceHarness.persistedValue(), {
      source: 'userSettings',
      value: { autoUpdatesChannel: 'stable' },
    })
  },
)
