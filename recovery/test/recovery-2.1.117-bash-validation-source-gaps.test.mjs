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
  applyTarget117BashValidationSourceRecovery,
  TARGET117_BASH_VALIDATION_INPUT_FILES,
  TARGET117_BASH_VALIDATION_OUTPUT_FILES,
  TARGET117_BASH_VALIDATION_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-bash-validation-source-gaps.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-bash-validation-source-gaps.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'fc01444e18ebf12c739633993cb8a8d088f357963f756aeee9f8e655649c1d77'
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

function materializeRawTargetSource(commit, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const sourceFile of fixture.inputs.sourceFiles) {
    const bytes = execFileSync(
      'git',
      ['show', `${commit}:${sourceFile.path}`],
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

function collectBundleOccurrences(source) {
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

function namedDeclaration(ts, sourceFile, expectedName, required = true) {
  const matches = []
  function visit(node) {
    if (node.name && ts.isIdentifier(node.name) && node.name.text === expectedName) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (!required && matches.length === 0) return null
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
}

function assertDeclaration(ts, sourceFile, source, expected) {
  const declaration = namedDeclaration(ts, sourceFile, expected.name)
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
  assert.equal(declaration.getStart(sourceFile), expected.start)
  assert.equal(declaration.end, expected.end)
  const slice = Buffer.from(
    source.slice(declaration.getStart(sourceFile), declaration.end),
  )
  assert.deepEqual(descriptor(slice), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return declaration
}

function regexpValue(raw) {
  assert.equal(raw[0], '/', `${raw}: regular-expression delimiter`)
  let delimiter = raw.length - 1
  while (/[a-z]/i.test(raw[delimiter])) delimiter--
  assert.equal(raw[delimiter], '/', `${raw}: closing delimiter`)
  return {
    flags: raw.slice(delimiter + 1),
    pattern: raw.slice(1, delimiter),
  }
}

function collectDeclarationResidues(ts, sourceFile, declarations) {
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
  for (const declaration of declarations) visit(declaration)
  return counts
}

function propertyName(ts, node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text
  return null
}

function objectProperty(ts, object, expectedName) {
  assert.ok(ts.isObjectLiteralExpression(object), `${expectedName}: object literal`)
  const matches = object.properties.filter(
    property => property.name && propertyName(ts, property.name) === expectedName,
  )
  assert.equal(matches.length, 1, `${expectedName}: one object property`)
  return matches[0]
}

function verifyExactPostimages(sourceRoot) {
  for (const outputFile of TARGET117_BASH_VALIDATION_OUTPUT_FILES) {
    readExact(sourceFilename(sourceRoot, outputFile.path), outputFile)
  }
}

test(
  '2.1.117 Bash-validation fixture pins four overrides and two exact postimages',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 4,
      residues: 15,
      recoveredFiles: 2,
      sedPolicyUnits: 2,
      findPolicyUnits: 1,
      testPolicyUnits: 1,
      ownerOverrides: 4,
    })
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      [10848, 10850, 10878, 10885],
    )
    assert.deepEqual(
      TARGET117_BASH_VALIDATION_INPUT_FILES,
      fixture.inputs.sourceFiles.map(file => ({ path: file.path, ...file.input })),
    )
    assert.deepEqual(
      TARGET117_BASH_VALIDATION_OUTPUT_FILES,
      fixture.inputs.sourceFiles.map(file => ({ path: file.path, ...file.output })),
    )
    assert.deepEqual(
      TARGET117_BASH_VALIDATION_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
        override.evidenceIds,
      ]),
      fixture.rows.map(row => [
        row.targetIndex,
        [row.owner],
        row.declarations,
        fixture.evidenceIds,
      ]),
    )
    for (const override of TARGET117_BASH_VALIDATION_OWNER_OVERRIDES) {
      assert.ok(override.behavior.length > 0, `${override.key}: behavior`)
      assert.equal(override.paths.length, 1, `${override.key}: one exact owner`)
    }
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
        `${sourceFile.path}: authenticated raw blob`,
      )
    }
  },
)

test(
  '2.1.117 bundles authenticate four complete units and all fifteen residues',
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
    const baselineOccurrences = collectBundleOccurrences(baseline)
    const targetOccurrences = collectBundleOccurrences(target)
    const units = new Map()

    for (const row of fixture.rows) {
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
      units.set(index, unit)
      assert.equal(Buffer.byteLength(unit), end - start, `u${index}: full bytes`)
      assert.equal(sha256(unit), sourceHash, `u${index}: full SHA-256`)
      const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
      assert.equal(ast.body.length, 1, `u${index}: exactly one unit`)
      assert.equal(ast.body[0].type, nodeType, `u${index}: node type`)

      for (const [kind, value, residueStart, residueEnd, ordinal, baselineCount] of row.residues) {
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
        assert.ok(
          residueStart >= start && residueEnd <= end,
          `u${index}: ${key} stays in complete unit`,
        )
      }
    }

    assert.match(units.get(10848), /let z=aI9\(H\);if\(z!==null\)/)
    assert.match(units.get(10848), /if\(wFK\(z\)\)return!1/)
    assert.match(units.get(10848), /Y\.includes\("\\\\"\)/)
    assert.match(units.get(10850), /let \$=qj\(H\)/)
    assert.match(units.get(10850), /if\(K===-1\)return null/)
    assert.match(units.get(10850), /f\.startsWith\("--expression="\)/)
    assert.match(units.get(10878), /if\(\$\.startsWith\("find"\)\)/)
    assert.match(units.get(10878), /if\(\/-delete/)
    assert.match(units.get(10885), /additionalCommandIsDangerousCallback/)
    assert.match(units.get(10885), /q==="-v"\|\|q==="-R"/)
  },
)

test(
  '2.1.117 Bash replay is dual-state and every residue stays in its exact declaration owner',
  { skip: !selected },
  async () => {
    const raw = materializeRawTargetSource(
      fixture.inputs.rawTargetSourceCommit,
      'target117-bash-validation-raw-',
    )
    try {
      const rawSed = fs.readFileSync(
        sourceFilename(raw.sourceRoot, fixture.inputs.sourceFiles[0].path),
        'utf8',
      )
      const rawReadOnly = fs.readFileSync(
        sourceFilename(raw.sourceRoot, fixture.inputs.sourceFiles[1].path),
        'utf8',
      )
      assert.doesNotMatch(rawSed, /extractInPlaceSedExpression/)
      assert.doesNotMatch(rawSed, /inPlaceExpression/)
      assert.doesNotMatch(rawReadOnly, /commandWithoutQuotes/)
      assert.doesNotMatch(rawReadOnly, /'-nt': 'string'/)

      const first = applyTarget117BashValidationSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117BashValidationSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      verifyExactPostimages(raw.sourceRoot)

      const ts = await loadTypeScript()
      const parsed = new Map()
      for (const sourceFile of fixture.inputs.sourceFiles) {
        const bytes = readExact(
          sourceFilename(raw.sourceRoot, sourceFile.path),
          sourceFile.output,
        )
        const source = bytes.toString('utf8')
        const sourceAst = parseSource(ts, sourceFile.path, source)
        const declarations = new Map(
          sourceFile.declarations.map(expected => [
            expected.name,
            assertDeclaration(ts, sourceAst, source, expected),
          ]),
        )
        parsed.set(sourceFile.path, { declarations, source, sourceAst })
      }

      for (const row of fixture.rows) {
        const owner = parsed.get(row.owner)
        assert.ok(owner, `u${row.targetIndex}: exact owner exists`)
        const declarations = row.declarations.map(name => {
          const declaration = owner.declarations.get(name)
          assert.ok(declaration, `u${row.targetIndex}: ${name} declaration`)
          return declaration
        })
        const actual = collectDeclarationResidues(ts, owner.sourceAst, declarations)
        const required = new Map()
        for (const [kind, value] of row.residues) {
          const key = identity(kind, value)
          required.set(key, (required.get(key) ?? 0) + 1)
        }
        for (const [key, count] of required) {
          assert.ok(
            (actual.get(key) ?? 0) >= count,
            `u${row.targetIndex}: ${key} occurs ${count} time(s) in exact declaration`,
          )
        }
      }

      const sed = parsed.get('src/tools/BashTool/sedValidation.ts')
      const commandsImports = sed.sourceAst.statements.filter(
        statement =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text === '../../utils/bash/commands.js',
      )
      assert.equal(commandsImports.length, 1, 'one commands import')
      const imports = commandsImports[0].importClause.namedBindings.elements.map(
        element => element.name.text,
      )
      assert.deepEqual(imports, [
        'parseCommandArguments',
        'splitCommand_DEPRECATED',
      ])
      const sedPolicy = sed.source.slice(
        sed.declarations.get('sedCommandIsAllowedByAllowlist').getStart(sed.sourceAst),
        sed.declarations.get('sedCommandIsAllowedByAllowlist').end,
      )
      assert.match(sedPolicy, /extractInPlaceSedExpression\(command\)/)
      assert.match(sedPolicy, /containsDangerousOperations\(inPlaceExpression\)/)
      assert.match(sedPolicy, /withoutRelativePrefix\.includes\('\.\.'\)/)
      const extract = sed.source.slice(
        sed.declarations.get('extractInPlaceSedExpression').getStart(sed.sourceAst),
        sed.declarations.get('extractInPlaceSedExpression').end,
      )
      assert.match(extract, /parseCommandArguments\(command\)/)
      assert.match(extract, /argument === '-e' \|\| argument === '--expression'/)
      assert.match(extract, /argument\.startsWith\('--expression='\)/)

      const readOnly = parsed.get('src/tools/BashTool/readOnlyValidation.ts')
      const readOnlyPolicy = readOnly.source.slice(
        readOnly.declarations.get('isCommandReadOnly').getStart(readOnly.sourceAst),
        readOnly.declarations.get('isCommandReadOnly').end,
      )
      assert.match(readOnlyPolicy, /testCommand\.startsWith\('find'\)/)
      assert.match(readOnlyPolicy, /commandWithoutQuotes/)
      assert.match(readOnlyPolicy, /-delete\\b\|-exec\\b\|-execdir\\b/)

      const allowlist = readOnly.declarations.get('COMMAND_ALLOWLIST')
      assert.ok(ts.isVariableDeclaration(allowlist), 'COMMAND_ALLOWLIST declaration')
      const testPolicy = objectProperty(ts, allowlist.initializer, 'test')
      assert.ok(ts.isPropertyAssignment(testPolicy), 'test policy assignment')
      const safeFlags = objectProperty(ts, testPolicy.initializer, 'safeFlags')
      assert.ok(ts.isPropertyAssignment(safeFlags), 'safeFlags assignment')
      assert.deepEqual(
        ['-nt', '-ot', '-ef'].map(name =>
          propertyName(ts, objectProperty(ts, safeFlags.initializer, name).name),
        ),
        ['-nt', '-ot', '-ef'],
      )
      const callback = objectProperty(
        ts,
        testPolicy.initializer,
        'additionalCommandIsDangerousCallback',
      )
      assert.ok(ts.isPropertyAssignment(callback), 'danger callback assignment')
      assert.ok(ts.isArrowFunction(callback.initializer), 'danger callback is arrow')
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
      'target117-bash-validation-packaged-',
    )
    try {
      const result = applyTarget117BashValidationSourceRecovery({
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
  '2.1.117 Bash replay rejects mutation and mixed raw/postimage state before writing',
  { skip: !selected },
  () => {
    const mutated = materializeRawTargetSource(
      fixture.inputs.rawTargetSourceCommit,
      'target117-bash-validation-mutated-',
    )
    try {
      const filename = sourceFilename(
        mutated.sourceRoot,
        fixture.inputs.sourceFiles[0].path,
      )
      fs.appendFileSync(filename, '\n// mutation\n')
      assert.throws(
        () =>
          applyTarget117BashValidationSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /Refusing mixed or non-target Bash validation recovery/,
      )
      readExact(
        sourceFilename(mutated.sourceRoot, fixture.inputs.sourceFiles[1].path),
        fixture.inputs.sourceFiles[1].input,
        'unmodified peer remains raw',
      )
    } finally {
      fs.rmSync(mutated.temporaryRoot, { recursive: true, force: true })
    }

    const mixed = materializeRawTargetSource(
      fixture.inputs.rawTargetSourceCommit,
      'target117-bash-validation-mixed-',
    )
    try {
      applyTarget117BashValidationSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      })
      const rawFile = fixture.inputs.sourceFiles[0]
      const rawBytes = execFileSync(
        'git',
        ['show', `${fixture.inputs.rawTargetSourceCommit}:${rawFile.path}`],
        { cwd: repositoryRoot },
      )
      fs.writeFileSync(sourceFilename(mixed.sourceRoot, rawFile.path), rawBytes)
      assert.throws(
        () =>
          applyTarget117BashValidationSourceRecovery({
            sourceRoot: mixed.sourceRoot,
          }),
        /Refusing mixed or non-target Bash validation recovery/,
      )
      readExact(
        sourceFilename(mixed.sourceRoot, fixture.inputs.sourceFiles[1].path),
        fixture.inputs.sourceFiles[1].output,
        'postimage peer remains unchanged',
      )
    } finally {
      fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
    }
  },
)
