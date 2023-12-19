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
  applyTarget117TerminalTokenizerStringControlsSourceRecovery,
  TARGET117_TERMINAL_TOKENIZER_INPUT_FILE,
  TARGET117_TERMINAL_TOKENIZER_OUTPUT_FILE,
  TARGET117_TERMINAL_TOKENIZER_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-terminal-tokenizer-string-controls-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-terminal-tokenizer-string-controls-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '927dd116e1bfbffcfcd68e3b257450d4a3091e4be53e0b5399e9dd001706576e'
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

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(sourceRoot) {
  return path.join(
    path.resolve(sourceRoot),
    fixture.inputs.sourceFile.path.slice('src/'.length),
  )
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const filename = sourceFilename(sourceRoot)
  const bytes = execFileSync(
    'git',
    [
      'show',
      `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
    ],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(bytes), fixture.inputs.sourceFile.input)
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

function collectAcornOccurrences(source, offset = 0) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const grouped = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const occurrences = grouped.get(key) ?? []
    occurrences.push({ start: offset + node.start, end: offset + node.end })
    grouped.set(key, occurrences)
  }
  walk(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
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

function declarationName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  return undefined
}

function namedDeclaration(ts, sourceFile, expectedName) {
  const matches = []
  function visit(node) {
    if (declarationName(ts, node) === expectedName) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
}

function assertDeclaration(ts, sourceFile, source, expected) {
  const declaration = namedDeclaration(ts, sourceFile, expected.name)
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
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

function sourceResidues(ts, declaration) {
  const grouped = new Map()
  const requested = new Set(
    fixture.row.residues.map(([kind, value]) => identity(kind, value)),
  )
  function add(kind, value, node) {
    const key = identity(kind, value)
    if (!requested.has(key)) return
    const values = grouped.get(key) ?? []
    values.push(node)
    grouped.set(key, values)
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) add('string', node.text, node)
    if (
      ts.isIdentifier(node) &&
      ((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
        (ts.isPropertyAssignment(node.parent) && node.parent.name === node))
    ) {
      add('property', node.text, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return grouped
}

function importBindings(ts, sourceFile) {
  const imports = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const moduleName = statement.moduleSpecifier.text
    const names = statement.importClause?.namedBindings?.elements?.map(
      element => element.name.text,
    ) ?? []
    imports.set(moduleName, names)
  }
  return imports
}

function stateMembers(ts, sourceFile) {
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === 'State',
  )
  assert.ok(declaration, 'State type alias exists')
  assert.ok(ts.isUnionTypeNode(declaration.type), 'State is a union')
  return declaration.type.types.map(type => type.literal?.text)
}

function compileTokenizer(ts, sourceFile, source, declaration, sentinel) {
  const declarationText = source.slice(
    declaration.getStart(sourceFile),
    declaration.end,
  )
  const sentinelText = source.slice(
    sentinel.getStart(sourceFile),
    sentinel.end,
  )
  const harness = `
const C0 = { BEL: 0x07, HT: 0x09, LF: 0x0a, CR: 0x0d, CAN: 0x18, SUB: 0x1a, ESC: 0x1b, DEL: 0x7f }
const ESC_TYPE = { CSI: 0x5b, OSC: 0x5d, DCS: 0x50, APC: 0x5f, PM: 0x5e, SOS: 0x58, ST: 0x5c }
const isEscFinal = (byte: number) => byte >= 0x30 && byte <= 0x7e
const isCSIIntermediate = (byte: number) => byte >= 0x20 && byte <= 0x2f
const isCSIFinal = (byte: number) => byte >= 0x40 && byte <= 0x7e
const isCSIParam = (byte: number) => byte >= 0x30 && byte <= 0x3f
const ${sentinelText}
${declarationText}
`
  const transpiled = ts.transpileModule(harness, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return new Function(`${transpiled}\nreturn tokenize`)()
}

function tokenizeOnce(subject, input, x10Mouse = false) {
  return subject(input, 'ground', '', false, x10Mouse)
}

test(
  '2.1.117 terminal-tokenizer fixture pins one bounded replay and owner override',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 7,
      targetOnlyStringResidues: 3,
      importedControlReferences: 4,
      recoveredFiles: 1,
      replacements: 8,
      ownerOverrides: 1,
    })
    assert.deepEqual(TARGET117_TERMINAL_TOKENIZER_INPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(TARGET117_TERMINAL_TOKENIZER_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.output,
    })
    assert.deepEqual(
      TARGET117_TERMINAL_TOKENIZER_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
        override.evidenceIds,
      ]),
      [[6828, [fixture.row.owner], fixture.row.declarations, fixture.evidenceIds]],
    )
    assert.match(
      TARGET117_TERMINAL_TOKENIZER_OWNER_OVERRIDES[0].behavior,
      /excludes the later Target118 forOutput parameter/,
    )
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'replay helper',
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
  '2.1.117 bundle authenticates the complete tokenizer unit and all seven residues',
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
          'structural ledger',
        ),
      ),
    )
    const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
      fixture.row.targetUnit
    const region = structural.regions.find(item => item.target.index === index)
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
    assert.equal(Buffer.byteLength(unit), end - start)
    assert.equal(sha256(unit), sourceHash)
    const unitAst = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
    assert.equal(unitAst.body.length, 1)
    assert.equal(unitAst.body[0].type, nodeType)
    assert.equal(unitAst.body[0].params.length, 5, 'Target117 has five parameters')

    const baselineOccurrences = collectAcornOccurrences(baseline)
    const unitOccurrences = collectAcornOccurrences(unit, start)
    const expectedUnitPositions = new Map()
    for (const [kind, value, residueStart, residueEnd, _ordinal, baselineCount] of fixture.row.residues) {
      const key = identity(kind, value)
      assert.equal(
        (baselineOccurrences.get(key) ?? []).length,
        baselineCount,
        `${key}: baseline count`,
      )
      const positions = expectedUnitPositions.get(key) ?? []
      positions.push({ start: residueStart, end: residueEnd })
      expectedUnitPositions.set(key, positions)
      assert.ok(residueStart >= start && residueEnd <= end)
    }
    for (const [key, positions] of expectedUnitPositions) {
      positions.sort((left, right) => left.start - right.start)
      assert.deepEqual(unitOccurrences.get(key), positions, `${key}: exact unit positions`)
    }
    assert.match(unit, /\.PM[\s\S]*\.SOS[\s\S]*"sos"/)
    assert.match(unit, /case"pm":case"sos"/)
    assert.match(unit, /\.CAN\|\|[\s\S]*\.SUB/)
  },
)

test(
  '2.1.117 tokenizer replay is dual-state, typed, executable, and temporally bounded',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const raw = materializeRawSource('target117-terminal-tokenizer-raw-')
    try {
      const rawSource = fs.readFileSync(sourceFilename(raw.sourceRoot), 'utf8')
      const rawAst = parseSource(ts, fixture.inputs.sourceFile.path, rawSource)
      const rawDeclaration = assertDeclaration(
        ts,
        rawAst,
        rawSource,
        fixture.inputs.sourceFile.rawDeclaration,
      )
      const rawResidues = sourceResidues(ts, rawDeclaration)
      assert.equal(rawResidues.get(identity('string', 'sos')), undefined)
      assert.equal(rawResidues.get(identity('property', 'PM')), undefined)
      assert.equal(rawResidues.get(identity('property', 'SOS')), undefined)
      assert.equal(rawResidues.get(identity('property', 'CAN')), undefined)
      assert.equal(rawResidues.get(identity('property', 'SUB')), undefined)

      const first = applyTarget117TerminalTokenizerStringControlsSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.deepEqual(
        { status: first.status, ownerOverrides: first.ownerOverrides },
        { status: 'recovered', ownerOverrides: 1 },
      )
      const second = applyTarget117TerminalTokenizerStringControlsSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')

      const outputSource = readExact(
        sourceFilename(raw.sourceRoot),
        fixture.inputs.sourceFile.output,
      ).toString('utf8')
      const outputAst = parseSource(
        ts,
        fixture.inputs.sourceFile.path,
        outputSource,
      )
      const declaration = assertDeclaration(
        ts,
        outputAst,
        outputSource,
        fixture.inputs.sourceFile.outputDeclaration,
      )
      const sentinel = assertDeclaration(
        ts,
        outputAst,
        outputSource,
        fixture.inputs.sourceFile.outputSentinelDeclaration,
      )
      assert.deepEqual(
        declaration.parameters.map(parameter => parameter.name.getText(outputAst)),
        fixture.row.temporalBoundary.target117Parameters,
      )
      assert.doesNotMatch(outputSource, /\bforOutput\b/)
      assert.deepEqual(
        stateMembers(ts, outputAst).slice(-2),
        ['pm', 'sos'],
      )
      assert.deepEqual(importBindings(ts, outputAst), new Map([
        ['./ansi.js', ['C0', 'ESC_TYPE', 'isEscFinal']],
        ['./csi.js', ['isCSIFinal', 'isCSIIntermediate', 'isCSIParam']],
      ]))

      const residues = sourceResidues(ts, declaration)
      assert.equal(residues.get(identity('property', 'PM')).length, 1)
      assert.equal(residues.get(identity('property', 'SOS')).length, 1)
      assert.equal(residues.get(identity('property', 'CAN')).length, 1)
      assert.equal(residues.get(identity('property', 'SUB')).length, 1)
      assert.equal(residues.get(identity('string', 'sos')).length, 3)

      for (const dependency of fixture.inputs.sourceDependencies) {
        const blob = execFileSync(
          'git',
          ['rev-parse', `${fixture.inputs.rawTargetSourceCommit}:${dependency.path}`],
          { cwd: repositoryRoot, encoding: 'utf8' },
        ).trim()
        assert.equal(blob, dependency.blob)
        const bytes = execFileSync(
          'git',
          ['show', `${fixture.inputs.rawTargetSourceCommit}:${dependency.path}`],
          { cwd: repositoryRoot },
        )
        assert.deepEqual(descriptor(bytes), {
          bytes: dependency.bytes,
          sha256: dependency.sha256,
        })
      }

      const subject = compileTokenizer(
        ts,
        outputAst,
        outputSource,
        declaration,
        sentinel,
      )
      const ESC = '\x1b'
      const BEL = '\x07'
      const CAN = '\x18'
      const SUB = '\x1a'
      const ST = `${ESC}\\`
      assert.deepEqual(
        tokenizeOnce(subject, `${ESC}^private${BEL}still-private${ST}tail`).tokens,
        [
          { type: 'sequence', value: `${ESC}^private${BEL}still-private${ST}` },
          { type: 'text', value: 'tail' },
        ],
        'BEL does not terminate PM',
      )
      assert.deepEqual(
        tokenizeOnce(subject, `${ESC}Xstart${BEL}still-sos${ST}tail`).tokens,
        [
          { type: 'sequence', value: `${ESC}Xstart${BEL}still-sos${ST}` },
          { type: 'text', value: 'tail' },
        ],
        'BEL does not terminate SOS',
      )
      assert.deepEqual(
        tokenizeOnce(subject, `${ESC}klegacy${ST}`).tokens,
        [{ type: 'sequence', value: `${ESC}klegacy${ST}` }],
        'legacy ESC k is SOS',
      )
      assert.deepEqual(
        tokenizeOnce(subject, `${ESC}^cancel${CAN}tail`).tokens,
        [
          { type: 'sequence', value: `${ESC}^cancel${CAN}` },
          { type: 'text', value: 'tail' },
        ],
        'CAN terminates PM',
      )
      assert.deepEqual(
        tokenizeOnce(subject, `${ESC}Xcancel${SUB}tail`).tokens,
        [
          { type: 'sequence', value: `${ESC}Xcancel${SUB}` },
          { type: 'text', value: 'tail' },
        ],
        'SUB terminates SOS',
      )
      assert.deepEqual(
        tokenizeOnce(subject, `${ESC}]title${BEL}tail`).tokens,
        [
          { type: 'sequence', value: `${ESC}]title${BEL}` },
          { type: 'text', value: 'tail' },
        ],
        'OSC retains BEL termination',
      )
      assert.deepEqual(
        tokenizeOnce(subject, `${ESC}^x10-still-pm${ST}`, true).tokens,
        [{ type: 'sequence', value: `${ESC}^x10-still-pm${ST}` }],
        'Target117 recognizes PM even with x10Mouse enabled',
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
      'target117-terminal-tokenizer-packaged-',
    )
    try {
      const result = applyTarget117TerminalTokenizerStringControlsSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      readExact(
        sourceFilename(packaged.sourceRoot),
        fixture.inputs.sourceFile.output,
      )
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 tokenizer replay rejects raw and postimage mutation before writing',
  { skip: !selected },
  () => {
    const raw = materializeRawSource('target117-terminal-tokenizer-mutated-raw-')
    try {
      const filename = sourceFilename(raw.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () =>
          applyTarget117TerminalTokenizerStringControlsSourceRecovery({
            sourceRoot: raw.sourceRoot,
          }),
        /Refusing non-target terminal-tokenizer recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const output = materializeRawSource(
      'target117-terminal-tokenizer-mutated-output-',
    )
    try {
      applyTarget117TerminalTokenizerStringControlsSourceRecovery({
        sourceRoot: output.sourceRoot,
      })
      const filename = sourceFilename(output.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () =>
          applyTarget117TerminalTokenizerStringControlsSourceRecovery({
            sourceRoot: output.sourceRoot,
          }),
        /Refusing non-target terminal-tokenizer recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(output.temporaryRoot, { recursive: true, force: true })
    }
  },
)
