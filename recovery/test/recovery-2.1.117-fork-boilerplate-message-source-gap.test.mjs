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
  applyTarget117ForkBoilerplateMessageSourceRecovery,
  TARGET117_FORK_BOILERPLATE_CONTEXT_FILE,
  TARGET117_FORK_BOILERPLATE_CONTEXT_FILES,
  TARGET117_FORK_BOILERPLATE_MESSAGE_OWNER_OVERRIDES,
  TARGET117_FORK_BOILERPLATE_RECOVERED_FILE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-fork-boilerplate-message-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-fork-boilerplate-message-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '73b886258e3c5d0536d0ff4cca59619b36e303ecf641583b61aa1b57500ec5cd'
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

function sourceFilename(sourceRoot, sourcePath) {
  assert.match(sourcePath, /^src\//, `${sourcePath}: normalized source path`)
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(
    filename.startsWith(`${root}${path.sep}`),
    `${sourcePath}: remains below source root`,
  )
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of fixture.inputs.contextFiles) {
    const bytes = execFileSync(
      'git',
      ['show', `${fixture.inputs.rawTargetSourceCommit}:${input.path}`],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(bytes), {
      bytes: input.bytes,
      sha256: input.sha256,
    })
    const filename = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, bytes)
  }
  return { temporaryRoot, sourceRoot }
}

function copyPackagedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  for (const input of [
    ...fixture.inputs.contextFiles,
    fixture.inputs.recoveredFile,
  ]) {
    const source = sourceFilename(sourceRoot, input.path)
    if (!fs.existsSync(source)) continue
    const destination = sourceFilename(outputRoot, input.path)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
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

function bundleEvidence(source, expectedValues, expectedProperty) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const templates = new Map(expectedValues.map(value => [value, []]))
  const properties = []
  walk(ast, node => {
    if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      const occurrences = templates.get(value)
      if (occurrences) {
        occurrences.push({ start: node.start, end: node.end })
      }
    }
    if (
      node.type === 'Property' &&
      node.computed === false &&
      node.key?.type === 'Identifier' &&
      node.key.name === expectedProperty
    ) {
      properties.push({ start: node.key.start, end: node.key.end })
    }
  })
  for (const occurrences of templates.values()) {
    occurrences.sort((left, right) => left.start - right.start)
  }
  properties.sort((left, right) => left.start - right.start)
  return { templates, properties }
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
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
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

function namedDeclaration(ts, sourceFile, expected) {
  const matches = descendants(
    ts,
    sourceFile,
    node =>
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === expected.name,
  )
  assert.equal(matches.length, 1, `${expected.name}: one named declaration`)
  let declaration = matches[0]
  if (ts.isVariableDeclaration(declaration)) {
    declaration = declaration.parent.parent
  }
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
  return declaration
}

function assertDeclaration(ts, sourceFile, source, expected) {
  const declaration = namedDeclaration(ts, sourceFile, expected)
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
    sourceFilename(sourceRoot, fixture.inputs.recoveredFile.path),
    fixture.inputs.recoveredFile,
    'recovered UserForkBoilerplateMessage.tsx',
  )
}

function assertLedgerUnit(ledger, expected) {
  const [
    index,
    classification,
    nodeType,
    start,
    end,
    tokenCount,
    sourceHash,
    coarseHash,
  ] = expected
  const entry = ledger.unresolvedTarget.find(
    candidate => candidate.target.index === index,
  )
  assert.deepEqual(
    [
      entry.target.index,
      entry.classification,
      entry.target.nodeType,
      entry.target.start,
      entry.target.end,
      entry.target.tokenCount,
      entry.target.sourceHash,
      entry.target.coarseHash,
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
}

test(
  '2.1.117 fork-boilerplate fixture pins the missing owner and immutable context',
  { skip: !selected },
  async () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 2,
      recoveredFiles: 1,
      ownerOverrides: 1,
      behaviorWitnessUnits: 1,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'case-owned helper',
    )
    assert.deepEqual(
      TARGET117_FORK_BOILERPLATE_CONTEXT_FILES,
      fixture.inputs.contextFiles.map(({ path: sourcePath, bytes, sha256 }) => ({
        path: sourcePath,
        bytes,
        sha256,
      })),
    )
    assert.equal(
      TARGET117_FORK_BOILERPLATE_CONTEXT_FILE,
      TARGET117_FORK_BOILERPLATE_CONTEXT_FILES[0],
    )
    assert.deepEqual(TARGET117_FORK_BOILERPLATE_RECOVERED_FILE, {
      path: fixture.inputs.recoveredFile.path,
      bytes: fixture.inputs.recoveredFile.bytes,
      sha256: fixture.inputs.recoveredFile.sha256,
    })
    assert.deepEqual(
      TARGET117_FORK_BOILERPLATE_MESSAGE_OWNER_OVERRIDES.map(override => ({
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

    const ts = await loadTypeScript()
    for (const input of [
      ...fixture.inputs.contextFiles,
      fixture.inputs.rejectedSourceMapOwner,
    ]) {
      const revision = `${fixture.inputs.rawTargetSourceCommit}:${input.path}`
      assert.equal(
        execFileSync('git', ['rev-parse', revision], {
          cwd: repositoryRoot,
          encoding: 'utf8',
        }).trim(),
        input.blob,
        `${input.path}: blob identity`,
      )
      const bytes = execFileSync('git', ['show', revision], {
        cwd: repositoryRoot,
      })
      assert.deepEqual(descriptor(bytes), {
        bytes: input.bytes,
        sha256: input.sha256,
      })
      const source = bytes.toString('utf8')
      const sourceFile = parseSource(ts, input.path, source)
      for (const expected of input.declarations ?? [input.declaration].filter(Boolean)) {
        assertDeclaration(ts, sourceFile, source, expected)
      }
    }

    assert.throws(
      () =>
        execFileSync(
          'git',
          [
            'cat-file',
            '-e',
            `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.recoveredFile.path}`,
          ],
          { cwd: repositoryRoot, stdio: 'ignore' },
        ),
      /Command failed/,
      'raw Target117 source is missing the component',
    )

    const rejectedBytes = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.rejectedSourceMapOwner.path}`,
      ],
      { cwd: repositoryRoot },
    )
    const rejected = parseSource(
      ts,
      fixture.inputs.rejectedSourceMapOwner.path,
      rejectedBytes.toString('utf8'),
    )
    for (const [, value] of fixture.row.residues) {
      const sourceMatches = descendants(
        ts,
        rejected,
        node =>
          (ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node) ||
            ts.isStringLiteral(node)) &&
          node.text === value,
      )
      assert.equal(
        sourceMatches.length,
        0,
        `${value}: rejected source-map owner has no AST match`,
      )
    }
  },
)

test(
  '2.1.117 bundles authenticate the full regex unit, both residues, and renderer behavior',
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
    const residueValues = fixture.row.residues.map(([, value]) => value)
    const baselineEvidence = bundleEvidence(
      baseline,
      residueValues,
      fixture.baselineAbsence.property,
    )
    const targetEvidence = bundleEvidence(
      target,
      residueValues,
      fixture.baselineAbsence.property,
    )

    for (const witness of [fixture.behaviorWitness, fixture.row]) {
      assertLedgerUnit(ledger, witness.targetUnit)
      const [, , , start, end, , sourceHash] = witness.targetUnit
      const unit = Buffer.from(target.slice(start, end))
      assert.deepEqual(descriptor(unit), {
        bytes: end - start,
        sha256: sourceHash,
      })
      assert.equal(unit.toString('utf8'), witness.exactSource)
    }

    for (const residue of fixture.row.residues) {
      const [kind, value, start, end, occurrence, baselineCount] = residue
      assert.equal(kind, 'string')
      assert.equal(target.slice(start, end), value.replaceAll('\\', '\\\\'))
      assert.ok(start >= fixture.row.targetUnit[3])
      assert.ok(end <= fixture.row.targetUnit[4])
      const targetOccurrences = targetEvidence.templates.get(value)
      assert.deepEqual(targetOccurrences[occurrence - 1], { start, end })
      assert.equal(targetOccurrences.length, 1)
      assert.equal(
        baselineEvidence.templates.get(value).length,
        baselineCount,
      )
    }

    assert.equal(
      baselineEvidence.properties.length,
      fixture.baselineAbsence.propertyOccurrences,
    )
    assert.equal(targetEvidence.properties.length, 2)

    const regexUnit = parse(fixture.row.exactSource, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const regexes = []
    walk(regexUnit, node => {
      if (
        node.type === 'NewExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'RegExp'
      ) {
        regexes.push(node)
      }
    })
    assert.equal(regexes.length, 1)
    assert.equal(regexes[0].arguments.length, 1)
    assert.equal(regexes[0].arguments[0].type, 'TemplateLiteral')
    assert.deepEqual(
      regexes[0].arguments[0].quasis.map(quasi => quasi.value.cooked),
      ['<', '>[\\s\\S]*?</', '>\\n*'],
    )
    assert.deepEqual(
      regexes[0].arguments[0].expressions.map(expression => expression.name),
      ['W3H', 'W3H'],
    )

    const renderer = parse(fixture.behaviorWitness.exactSource, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const calls = []
    walk(renderer, node => {
      if (node.type === 'CallExpression') calls.push(node)
    })
    const namedMethodCalls = method =>
      calls.filter(
        call =>
          call.callee?.type === 'MemberExpression' &&
          call.callee.computed === false &&
          call.callee.property?.name === method,
      )
    assert.equal(namedMethodCalls('replace').length, 1)
    assert.deepEqual(
      namedMethodCalls('replace')[0].arguments.map(argument =>
        argument.type === 'Identifier' ? argument.name : argument.value,
      ),
      ['nH1', ''],
    )
    assert.equal(namedMethodCalls('startsWith').length, 1)
    assert.equal(namedMethodCalls('startsWith')[0].arguments[0].name, 'FcH')
    assert.equal(namedMethodCalls('slice').length, 1)
    assert.equal(
      namedMethodCalls('slice')[0].arguments[0].object.name,
      'FcH',
    )
    assert.equal(
      namedMethodCalls('slice')[0].arguments[0].property.name,
      'length',
    )
    const outerBoxes = calls.filter(call => {
      if (
        call.callee?.type !== 'MemberExpression' ||
        call.callee.property?.name !== 'createElement' ||
        call.arguments[0]?.name !== 'm' ||
        call.arguments[1]?.type !== 'ObjectExpression'
      ) {
        return false
      }
      return call.arguments[1].properties.some(
        property => property.key?.name === 'backgroundColor',
      )
    })
    assert.equal(outerBoxes.length, 1)
    const outerProperties = Object.fromEntries(
      outerBoxes[0].arguments[1].properties.map(property => [
        property.key.name,
        property.value.value ?? property.value.name,
      ]),
    )
    assert.deepEqual(outerProperties, {
      marginTop: 'z',
      backgroundColor: 'userMessageBackground',
      paddingRight: 1,
    })
  },
)

test(
  '2.1.117 fork-boilerplate replay is dual-state, declaration-local, and executable',
  { skip: !selected },
  async () => {
    const raw = materializeRawSource('target117-fork-boilerplate-raw-')
    try {
      const first = applyTarget117ForkBoilerplateMessageSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117ForkBoilerplateMessageSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      assertExactPostimage(raw.sourceRoot)

      const ts = await loadTypeScript()
      const filename = sourceFilename(
        raw.sourceRoot,
        fixture.inputs.recoveredFile.path,
      )
      const source = fs.readFileSync(filename, 'utf8')
      const sourceFile = parseSource(ts, fixture.inputs.recoveredFile.path, source)
      const declarations = Object.fromEntries(
        fixture.inputs.recoveredFile.declarations.map(expected => [
          expected.name,
          assertDeclaration(ts, sourceFile, source, expected),
        ]),
      )

      const imports = sourceFile.statements.filter(ts.isImportDeclaration)
      const importNames = new Map(
        imports.map(statement => [
          statement.moduleSpecifier.text,
          statement.importClause?.namedBindings &&
          ts.isNamedImports(statement.importClause.namedBindings)
            ? statement.importClause.namedBindings.elements.map(
                element => element.name.text,
              )
            : statement.importClause?.namedBindings &&
                ts.isNamespaceImport(statement.importClause.namedBindings)
              ? [`* as ${statement.importClause.namedBindings.name.text}`]
              : [],
        ]),
      )
      assert.deepEqual(importNames.get('../../constants/figures.js'), [
        'FORK_GLYPH',
      ])
      assert.deepEqual(importNames.get('../../constants/xml.js'), [
        'FORK_BOILERPLATE_TAG',
        'FORK_DIRECTIVE_PREFIX',
      ])
      assert.deepEqual(importNames.get('../../ink.js'), ['Box', 'Text'])
      assert.deepEqual(importNames.get('react'), ['* as React'])

      const regexDeclaration = declarations.FORK_BOILERPLATE_RE
      const regexes = descendants(
        ts,
        regexDeclaration,
        node =>
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'RegExp',
      )
      assert.equal(regexes.length, 1)
      const template = regexes[0].arguments[0]
      assert.ok(ts.isTemplateExpression(template))
      assert.equal(template.head.text, '<')
      assert.deepEqual(
        template.templateSpans.map(span => ({
          expression: span.expression.text,
          literal: span.literal.text,
        })),
        [
          {
            expression: 'FORK_BOILERPLATE_TAG',
            literal: '>[\\s\\S]*?</',
          },
          {
            expression: 'FORK_BOILERPLATE_TAG',
            literal: '>\\n*',
          },
        ],
      )

      const component = declarations.UserForkBoilerplateMessage
      const methodCalls = descendants(
        ts,
        component,
        node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression),
      )
      const callsByName = name =>
        methodCalls.filter(call => call.expression.name.text === name)
      assert.equal(callsByName('replace').length, 1)
      assert.equal(callsByName('replace')[0].arguments[0].text, 'FORK_BOILERPLATE_RE')
      assert.equal(callsByName('replace')[0].arguments[1].text, '')
      assert.equal(callsByName('startsWith').length, 1)
      assert.equal(
        callsByName('startsWith')[0].arguments[0].text,
        'FORK_DIRECTIVE_PREFIX',
      )
      assert.equal(callsByName('slice').length, 1)
      assert.equal(
        callsByName('slice')[0].arguments[0].getText(sourceFile),
        'FORK_DIRECTIVE_PREFIX.length',
      )

      const javascript = ts.transpileModule(source, {
        compilerOptions: {
          esModuleInterop: true,
          jsx: ts.JsxEmit.React,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
      const module = { exports: {} }
      const createElement = (type, props, ...children) => ({
        type,
        props: props ?? {},
        children,
      })
      const modules = new Map([
        ['react', { createElement }],
        ['../../constants/figures.js', { FORK_GLYPH: '\u2442' }],
        [
          '../../constants/xml.js',
          {
            FORK_BOILERPLATE_TAG: 'fork-boilerplate',
            FORK_DIRECTIVE_PREFIX: 'Your directive: ',
          },
        ],
        ['../../ink.js', { Box: 'Box', Text: 'Text' }],
      ])
      Function('require', 'module', 'exports', javascript)(
        request => {
          assert.ok(modules.has(request), `mocked import ${request}`)
          return modules.get(request)
        },
        module,
        module.exports,
      )
      const render = module.exports.UserForkBoilerplateMessage
      const output = render({
        addMargin: true,
        param: {
          text: '<fork-boilerplate>\nline one\nline two\n</fork-boilerplate>\n\nYour directive: inspect lane',
        },
      })
      assert.equal(output.type, 'Box')
      assert.deepEqual(output.props, {
        marginTop: 1,
        backgroundColor: 'userMessageBackground',
        paddingRight: 1,
      })
      assert.equal(output.children[0].type, 'Text')
      assert.deepEqual(output.children[0].props, { dimColor: true })
      assert.deepEqual(output.children[0].children, ['\u2442'])
      assert.equal(output.children[1].type, 'Box')
      assert.deepEqual(output.children[1].props, { paddingLeft: 1 })
      assert.equal(output.children[1].children[0].type, 'Text')
      assert.deepEqual(output.children[1].children[0].children, ['inspect lane'])

      const withoutPrefix = render({
        addMargin: false,
        param: {
          text: '<fork-boilerplate>rules</fork-boilerplate>plain directive',
        },
      })
      assert.equal(withoutPrefix.props.marginTop, 0)
      assert.deepEqual(
        withoutPrefix.children[1].children[0].children,
        ['plain directive'],
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
      'target117-fork-boilerplate-packaged-',
    )
    try {
      const result = applyTarget117ForkBoilerplateMessageSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      assertExactPostimage(packaged.sourceRoot)
      assert.equal(
        applyTarget117ForkBoilerplateMessageSourceRecovery({
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
  '2.1.117 fork-boilerplate replay rejects context and postimage mutations',
  { skip: !selected },
  () => {
    const contextMutation = materializeRawSource(
      'target117-fork-boilerplate-context-mutation-',
    )
    try {
      const contextFilename = sourceFilename(
        contextMutation.sourceRoot,
        fixture.inputs.contextFiles[0].path,
      )
      fs.appendFileSync(contextFilename, '\n// mutation\n')
      const before = fs.readFileSync(contextFilename)
      assert.throws(
        () =>
          applyTarget117ForkBoilerplateMessageSourceRecovery({
            sourceRoot: contextMutation.sourceRoot,
          }),
        /refusing non-target source context/,
      )
      assert.deepEqual(fs.readFileSync(contextFilename), before)
      assert.equal(
        fs.existsSync(
          sourceFilename(
            contextMutation.sourceRoot,
            fixture.inputs.recoveredFile.path,
          ),
        ),
        false,
      )
    } finally {
      fs.rmSync(contextMutation.temporaryRoot, {
        recursive: true,
        force: true,
      })
    }

    const postimageMutation = materializeRawSource(
      'target117-fork-boilerplate-postimage-mutation-',
    )
    try {
      const outputFilename = sourceFilename(
        postimageMutation.sourceRoot,
        fixture.inputs.recoveredFile.path,
      )
      fs.mkdirSync(path.dirname(outputFilename), { recursive: true })
      fs.writeFileSync(outputFilename, '// foreign component\n')
      const before = fs.readFileSync(outputFilename)
      assert.throws(
        () =>
          applyTarget117ForkBoilerplateMessageSourceRecovery({
            sourceRoot: postimageMutation.sourceRoot,
          }),
        /expected absent or recovered/,
      )
      assert.deepEqual(fs.readFileSync(outputFilename), before)
    } finally {
      fs.rmSync(postimageMutation.temporaryRoot, {
        recursive: true,
        force: true,
      })
    }

    const mixed = materializeRawSource('target117-fork-boilerplate-mixed-')
    try {
      applyTarget117ForkBoilerplateMessageSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      })
      const outputFilename = sourceFilename(
        mixed.sourceRoot,
        fixture.inputs.recoveredFile.path,
      )
      const outputBefore = fs.readFileSync(outputFilename)
      fs.appendFileSync(
        sourceFilename(mixed.sourceRoot, fixture.inputs.contextFiles[2].path),
        '\n// mutation\n',
      )
      assert.throws(
        () =>
          applyTarget117ForkBoilerplateMessageSourceRecovery({
            sourceRoot: mixed.sourceRoot,
          }),
        /refusing non-target source context/,
      )
      assert.deepEqual(fs.readFileSync(outputFilename), outputBefore)
    } finally {
      fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
    }
  },
)
