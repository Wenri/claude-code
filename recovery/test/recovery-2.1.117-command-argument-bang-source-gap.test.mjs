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
  applyTarget117CommandArgumentBangSourceRecovery,
  TARGET117_COMMAND_ARGUMENT_BANG_INPUT_FILES,
  TARGET117_COMMAND_ARGUMENT_BANG_OUTPUT_FILES,
  TARGET117_COMMAND_ARGUMENT_BANG_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-command-argument-bang-escaping-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-command-argument-bang-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '0bb4be4180cb3c350060a46d4737c09ef933ef989da59ab04d38720861efa6b0'
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

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(root, sourcePath) {
  assert.match(sourcePath, /^src\//, `${sourcePath}: normalized source path`)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(
    filename.startsWith(`${path.resolve(root)}${path.sep}`),
    `${sourcePath}: remains below source root`,
  )
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const sourceFile of fixture.inputs.sourceFiles) {
    const bytes = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawTargetSourceCommit}:${sourceFile.path}`,
      ],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(bytes), sourceFile.input, `${sourceFile.path}: raw`)
    const filename = sourceFilename(sourceRoot, sourceFile.path)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, bytes)
  }
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  for (const sourceFile of fixture.inputs.sourceFiles) {
    const destination = sourceFilename(outputRoot, sourceFile.path)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(sourceFilename(sourceRoot, sourceFile.path), destination)
  }
  return { temporaryRoot, sourceRoot: outputRoot }
}

function identity(kind, value) {
  return kind === 'regexp'
    ? `${kind}:${value.pattern}/${value.flags}`
    : `${kind}:${JSON.stringify(value)}`
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

function bundleOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const grouped = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const occurrences = grouped.get(key) ?? []
    occurrences.push({ start: node.start, end: node.end })
    grouped.set(key, occurrences)
  }
  walk(ast, node => {
    if (node.type === 'Literal') {
      if (node.regex) {
        add(
          'regexp',
          { flags: node.regex.flags, pattern: node.regex.pattern },
          node,
        )
      } else if (typeof node.value === 'string') {
        add('string', node.value, node)
      } else if (typeof node.value === 'number') {
        add('number', String(node.value), node)
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property)
  })
  for (const occurrences of grouped.values()) {
    occurrences.sort((left, right) => left.start - right.start)
  }
  return grouped
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

function namedDeclaration(ts, sourceFile, expectedName, expectedNodeType) {
  const matches = []
  function visit(node) {
    if (
      ts.SyntaxKind[node.kind] === expectedNodeType &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === expectedName
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
}

function assertDeclaration(ts, sourceFile, source, expected) {
  const declaration = namedDeclaration(
    ts,
    sourceFile,
    expected.name,
    expected.nodeType,
  )
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

function regexpValue(raw) {
  let delimiter = raw.length - 1
  while (/[a-z]/i.test(raw[delimiter])) delimiter--
  assert.equal(raw[0], '/', `${raw}: opening delimiter`)
  assert.equal(raw[delimiter], '/', `${raw}: closing delimiter`)
  return {
    flags: raw.slice(delimiter + 1),
    pattern: raw.slice(1, delimiter),
  }
}

function declarationResidues(ts, sourceFile, declaration) {
  const counts = new Map()
  function add(kind, value) {
    const key = identity(kind, value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  function visit(node) {
    if (ts.isRegularExpressionLiteral(node)) {
      add('regexp', regexpValue(node.getText(sourceFile)))
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      add('string', node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return counts
}

function verifyExactPostimages(sourceRoot) {
  for (const outputFile of TARGET117_COMMAND_ARGUMENT_BANG_OUTPUT_FILES) {
    readExact(sourceFilename(sourceRoot, outputFile.path), outputFile)
  }
}

test(
  '2.1.117 command-argument bang fixture pins the corrected owner and exact postimages',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 6,
      recoveredFiles: 3,
      callsiteWitnessUnits: 2,
      correctedOwners: 1,
      ownerOverrides: 1,
    })
    assert.deepEqual(TARGET117_COMMAND_ARGUMENT_BANG_INPUT_FILES, [
      ...fixture.inputs.sourceFiles.map(file => ({ path: file.path, ...file.input })),
    ])
    assert.deepEqual(TARGET117_COMMAND_ARGUMENT_BANG_OUTPUT_FILES, [
      ...fixture.inputs.sourceFiles.map(file => ({ path: file.path, ...file.output })),
    ])
    assert.deepEqual(
      TARGET117_COMMAND_ARGUMENT_BANG_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
        override.evidenceIds,
      ]),
      [[
        fixture.row.targetIndex,
        [fixture.row.owner],
        fixture.row.declarations,
        fixture.evidenceIds,
      ]],
    )
    assert.ok(TARGET117_COMMAND_ARGUMENT_BANG_OWNER_OVERRIDES[0].behavior.length > 0)
    readExact(path.join(repositoryRoot, fixture.inputs.helper.path), fixture.inputs.helper)
    for (const sourceFile of fixture.inputs.sourceFiles) {
      assert.equal(
        execFileSync(
          'git',
          [
            'rev-parse',
            `${fixture.inputs.rawTargetSourceCommit}:${sourceFile.path}`,
          ],
          { cwd: repositoryRoot, encoding: 'utf8' },
        ).trim(),
        sourceFile.blob,
        `${sourceFile.path}: raw blob`,
      )
    }
    const rejected = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.rejectedSourceMapOwner.path}`,
      ],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(rejected), {
      bytes: fixture.inputs.rejectedSourceMapOwner.bytes,
      sha256: fixture.inputs.rejectedSourceMapOwner.sha256,
    })
    assert.doesNotMatch(rejected.toString('utf8'), /escapeBang|` !|! `/)
  },
)

test(
  '2.1.117 bundle authenticates the sanitizer unit, six residues, and both callsites',
  { skip: !selected },
  () => {
    const baseline = readExact(
      bundlePath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'baseline bundle',
    ).toString('utf8')
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    const baselineOccurrences = bundleOccurrences(baseline)
    const targetOccurrences = bundleOccurrences(target)

    for (const row of [fixture.row, ...fixture.callsiteWitnesses]) {
      const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
        row.targetUnit
      const region = regions.get(index)
      assert.ok(region, `u${index}: structural region`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        { classification, nodeType, start, end, tokenCount, sourceHash, coarseHash },
      )
      const unit = target.slice(start, end)
      assert.equal(Buffer.byteLength(unit), end - start, `u${index}: full bytes`)
      assert.equal(sha256(unit), sourceHash, `u${index}: full SHA-256`)
      const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
      assert.equal(ast.body.length, 1, `u${index}: exactly one unit`)
      assert.equal(ast.body[0].type, nodeType, `u${index}: node type`)
    }

    const [index, , , start, end] = fixture.row.targetUnit
    for (const [kind, value, residueStart, residueEnd, ordinal, baselineCount] of fixture.row.residues) {
      const key = identity(kind, value)
      assert.equal(
        (baselineOccurrences.get(key) ?? []).length,
        baselineCount,
        `u${index}: ${key} baseline count`,
      )
      const occurrence = (targetOccurrences.get(key) ?? [])[ordinal - 1]
      assert.ok(occurrence, `u${index}: ${key} target ordinal`)
      assert.deepEqual(
        [occurrence.start, occurrence.end],
        [residueStart, residueEnd],
        `u${index}: ${key} target range`,
      )
      assert.ok(residueStart >= start && residueEnd <= end, `${key}: inside unit`)
    }
    assert.equal(
      target.slice(start, end),
      'function _m$(H){return H.replace(/`!/g,"` !").replace(/!`/g,"! `").replace(/(^|\\s)!/gm,"$1\\\\!")}',
    )
    for (const witness of fixture.callsiteWitnesses) {
      assert.equal(
        target.slice(witness.callStart, witness.callEnd),
        witness.call,
        `u${witness.targetIndex}: exact sanitizer call`,
      )
      assert.ok(
        witness.callStart >= witness.targetUnit[3] &&
          witness.callEnd <= witness.targetUnit[4],
        `u${witness.targetIndex}: call stays in unit`,
      )
    }
  },
)

test(
  '2.1.117 bang replay is dual-state, executable, and wired only to plugin/skill substitution',
  { skip: !selected },
  async () => {
    const raw = materializeRawSource('target117-command-argument-bang-raw-')
    try {
      for (const sourceFile of fixture.inputs.sourceFiles) {
        assert.doesNotMatch(
          fs.readFileSync(sourceFilename(raw.sourceRoot, sourceFile.path), 'utf8'),
          /escapeBangForCommandSubstitution/,
          `${sourceFile.path}: raw gap`,
        )
      }
      const first = applyTarget117CommandArgumentBangSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117CommandArgumentBangSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      verifyExactPostimages(raw.sourceRoot)

      const ts = await loadTypeScript()
      const parsed = new Map()
      for (const sourceFile of fixture.inputs.sourceFiles) {
        const source = readExact(
          sourceFilename(raw.sourceRoot, sourceFile.path),
          sourceFile.output,
        ).toString('utf8')
        const sourceAst = parseSource(ts, sourceFile.path, source)
        const declarations = new Map(
          sourceFile.declarations.map(expected => [
            expected.name,
            assertDeclaration(ts, sourceAst, source, expected),
          ]),
        )
        parsed.set(sourceFile.path, { declarations, source, sourceAst })
      }

      const argumentOwner = parsed.get(fixture.row.owner)
      const sanitizer = argumentOwner.declarations.get(
        'escapeBangForCommandSubstitution',
      )
      const residues = declarationResidues(
        ts,
        argumentOwner.sourceAst,
        sanitizer,
      )
      for (const [kind, value] of fixture.row.residues) {
        assert.equal(
          residues.get(identity(kind, value)),
          1,
          `${identity(kind, value)}: exact declaration-local occurrence`,
        )
      }

      const sanitizerSource = sanitizer
        .getText(argumentOwner.sourceAst)
        .replace(/^export /, '')
      const javascript = ts.transpileModule(sanitizerSource, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
      const escapeBang = Function(
        `${javascript}\nreturn escapeBangForCommandSubstitution`,
      )()
      assert.equal(escapeBang('plain argument'), 'plain argument')
      assert.equal(escapeBang('!run'), '\\!run')
      assert.equal(escapeBang('first\n!second'), 'first\n\\!second')
      assert.equal(escapeBang('prefix !middle'), 'prefix \\!middle')
      assert.equal(escapeBang('`!echo!`'), '` \\!echo! `')

      const substitute = argumentOwner.declarations.get('substituteArguments')
      const transformCalls = []
      function visit(node) {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'transform'
        ) {
          transformCalls.push(node)
        }
        ts.forEachChild(node, visit)
      }
      visit(substitute)
      assert.equal(transformCalls.length, 5, 'all five replacement lanes sanitize')

      for (const witness of fixture.callsiteWitnesses) {
        const owner = parsed.get(witness.owner)
        const declaration = owner.declarations.get(witness.declaration)
        let imports = 0
        let calls = 0
        function inspect(node) {
          if (
            ts.isImportSpecifier(node) &&
            node.name.text === 'escapeBangForCommandSubstitution'
          ) {
            imports++
          }
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'substituteArguments' &&
            node.arguments.length === 5 &&
            ts.isIdentifier(node.arguments[4]) &&
            node.arguments[4].text === 'escapeBangForCommandSubstitution'
          ) {
            calls++
          }
          ts.forEachChild(node, inspect)
        }
        inspect(owner.sourceAst)
        assert.equal(imports, 1, `${witness.owner}: exact import`)
        let declarationCalls = 0
        function inspectDeclaration(node) {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'substituteArguments' &&
            node.arguments.length === 5 &&
            ts.isIdentifier(node.arguments[4]) &&
            node.arguments[4].text === 'escapeBangForCommandSubstitution'
          ) {
            declarationCalls++
          }
          ts.forEachChild(node, inspectDeclaration)
        }
        inspectDeclaration(declaration)
        assert.equal(calls, 1, `${witness.owner}: one sanitized call in file`)
        assert.equal(
          declarationCalls,
          1,
          `${witness.declaration}: sanitized call stays in exact declaration`,
        )
      }
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
      'target117-command-argument-bang-packaged-',
    )
    try {
      const result = applyTarget117CommandArgumentBangSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(
        ['recovered', 'already-recovered'].includes(result.status),
        `package state ${result.status}`,
      )
      verifyExactPostimages(packaged.sourceRoot)
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 bang replay rejects mutation and mixed raw/postimage state before writing',
  { skip: !selected },
  () => {
    const mutated = materializeRawSource('target117-command-argument-bang-mutated-')
    try {
      fs.appendFileSync(
        sourceFilename(mutated.sourceRoot, fixture.inputs.sourceFiles[0].path),
        '\n// mutation\n',
      )
      assert.throws(
        () =>
          applyTarget117CommandArgumentBangSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /Refusing mixed or non-target command-argument bang recovery/,
      )
      readExact(
        sourceFilename(mutated.sourceRoot, fixture.inputs.sourceFiles[1].path),
        fixture.inputs.sourceFiles[1].input,
        'unmodified peer stays raw',
      )
    } finally {
      fs.rmSync(mutated.temporaryRoot, { recursive: true, force: true })
    }

    const mixed = materializeRawSource('target117-command-argument-bang-mixed-')
    try {
      applyTarget117CommandArgumentBangSourceRecovery({ sourceRoot: mixed.sourceRoot })
      const rawFile = fixture.inputs.sourceFiles[0]
      fs.writeFileSync(
        sourceFilename(mixed.sourceRoot, rawFile.path),
        execFileSync(
          'git',
          [
            'show',
            `${fixture.inputs.rawTargetSourceCommit}:${rawFile.path}`,
          ],
          { cwd: repositoryRoot },
        ),
      )
      assert.throws(
        () =>
          applyTarget117CommandArgumentBangSourceRecovery({
            sourceRoot: mixed.sourceRoot,
          }),
        /Refusing mixed or non-target command-argument bang recovery/,
      )
      readExact(
        sourceFilename(mixed.sourceRoot, fixture.inputs.sourceFiles[1].path),
        fixture.inputs.sourceFiles[1].output,
        'postimage peer stays unchanged',
      )
    } finally {
      fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
    }
  },
)
