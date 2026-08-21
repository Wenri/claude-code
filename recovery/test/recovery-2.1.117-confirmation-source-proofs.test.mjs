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
  applyTarget117GeneratedOwnerRecovery,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-generated-owner-source-gaps.mjs'
import {
  applyTarget117HistoricalOwnerSourceGapRecovery,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-historical-owner-source-gaps.mjs'
import {
  applyTarget117ConfirmationSourceRecovery,
  TARGET117_CONFIRMATION_OWNER_OVERRIDES,
  TARGET117_CONFIRMATION_RECOVERED_FILES,
  TARGET117_CONSOLE_CONFIRMATION_DECLARATIONS,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-confirmation-source-gaps.mjs'
import { summarizeSourceTree } from '../scripts/verify-source-lineage.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-confirmation-source-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'dd68f029ce9ecdfbe1d7df320f6e54e52cb405a4ba20c5f9ad2f714c6fe31a6c'
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

function publicTree(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function materializeRawTargetSource(commit) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target117-confirmation-proofs-'),
  )
  const archive = path.join(temporaryRoot, 'source.tar')
  execFileSync(
    'git',
    ['archive', '--format=tar', `--output=${archive}`, commit, 'src'],
    { cwd: repositoryRoot, stdio: 'ignore' },
  )
  execFileSync('tar', ['-xf', archive, '-C', temporaryRoot], {
    stdio: 'ignore',
  })
  fs.unlinkSync(archive)
  return { temporaryRoot, sourceRoot: path.join(temporaryRoot, 'src') }
}

function sourceFilename(root, owner) {
  assert.match(owner, /^src\//, `${owner}: normalized source path`)
  const filename = path.resolve(root, owner.slice(4))
  assert.ok(
    filename.startsWith(`${path.resolve(root)}${path.sep}`),
    `${owner}: remains below source root`,
  )
  return filename
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
    if (node.type === 'Literal' && node.regex) {
      add('regexp', { pattern: node.regex.pattern, flags: node.regex.flags }, node)
    } else if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node)
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

function declarationName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (node.name && ts.isStringLiteralLike(node.name)) return node.name.text
  return undefined
}

function namedDeclarations(ts, sourceFile, expectedName) {
  const matches = []
  function visit(node) {
    if (declarationName(ts, node) === expectedName) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return matches
}

function findNamedDeclaration(ts, sourceFile, expectedName) {
  const matches = namedDeclarations(ts, sourceFile, expectedName)
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
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

function namedDeclarationSlice(ts, sourceFile, source, name) {
  const declaration = findNamedDeclaration(ts, sourceFile, name)
  return source.slice(declaration.getStart(sourceFile), declaration.end)
}

test(
  '2.1.117 confirmation fixture is exhaustive and pins its fail-closed replay',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 20,
      residues: 60,
      genericComponentUnits: 1,
      consoleReplayUnits: 4,
      legacySelectEquivalentUnits: 15,
      recoveredFiles: 2,
      authenticatedDeclarationSlices: 33,
      ownerOverrides: 20,
    })
    assert.equal(fixture.targets.length, fixture.summary.units)
    assert.equal(fixture.rows.length, fixture.summary.units)
    assert.equal(
      fixture.rows.flatMap(row => row.residues).length,
      fixture.summary.residues,
    )
    assert.deepEqual(
      Object.fromEntries(
        ['generic-component', 'console-replay', 'legacy-select'].map(kind => [
          kind,
          fixture.rows.filter(row => row.kind === kind).length,
        ]),
      ),
      { 'generic-component': 1, 'console-replay': 4, 'legacy-select': 15 },
    )
    const targetIndices = fixture.targets.map(([index]) => index)
    assert.equal(new Set(targetIndices).size, fixture.summary.units)
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      targetIndices,
      'rows exhaustively and uniquely classify target units',
    )
    assert.equal(TARGET117_CONFIRMATION_RECOVERED_FILES.length, 2)
    assert.equal(TARGET117_CONSOLE_CONFIRMATION_DECLARATIONS.length, 33)
    assert.equal(TARGET117_CONFIRMATION_OWNER_OVERRIDES.length, 20)
    assert.equal(
      new Set(TARGET117_CONSOLE_CONFIRMATION_DECLARATIONS.map(row => row.name)).size,
      33,
      'authenticated declaration slices are unique',
    )
    assert.deepEqual(
      TARGET117_CONFIRMATION_OWNER_OVERRIDES.map(row => [
        row.targetIndex,
        row.paths,
      ]),
      fixture.rows.map(row => [row.targetIndex, [row.owner]]),
      'generator wiring is exact and never assigns the legacy rows globally',
    )
    for (const [index, override] of TARGET117_CONFIRMATION_OWNER_OVERRIDES.entries()) {
      const row = fixture.rows[index]
      assert.equal(override.key, `${caseName}:${row.targetIndex}`)
      assert.deepEqual(
        override.evidenceIds,
        row.kind === 'legacy-select'
          ? [
              'target117-confirmation-target-fragment',
              'target117-confirmation-legacy-select-equivalence-test',
            ]
          : [
              'target117-confirmation-target-fragment',
              'target117-confirmation-source-replay-test',
            ],
      )
      assert.ok(override.behavior.length > 0, `${override.key}: behavior`)
    }
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
    )
  },
)

test(
  '2.1.117 target bundle authenticates all 20 units and all 60 added residues',
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
    const structuralBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    const baselineOccurrences = collectBundleOccurrences(baseline)
    const targetOccurrences = collectBundleOccurrences(target)
    const rows = new Map(fixture.rows.map(row => [row.targetIndex, row]))

    for (const [index, classification, nodeType, start, end, sourceHash] of fixture.targets) {
      const region = regions.get(index)
      assert.ok(region, `u${index}: structural region`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          sourceHash: region.target.sourceHash,
        },
        { classification, nodeType, start, end, sourceHash },
        `u${index}: structural identity`,
      )
      const unit = target.slice(start, end)
      assert.equal(Buffer.byteLength(unit), end - start, `u${index}: full bytes`)
      assert.equal(sha256(unit), sourceHash, `u${index}: full SHA-256`)
      const unitAst = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
      assert.equal(unitAst.body.length, 1, `u${index}: exactly one unit`)
      assert.equal(unitAst.body[0].type, nodeType, `u${index}: node type`)

      const row = rows.get(index)
      assert.ok(row, `u${index}: classified row`)
      for (const [kind, value, residueStart, residueEnd, ordinal] of row.residues) {
        assert.ok(residueStart >= start && residueEnd <= end, `u${index}: residue bounded`)
        const key = identity(kind, value)
        const baselineCount = (baselineOccurrences.get(key) ?? []).length
        assert.ok(ordinal > baselineCount, `u${index}: ${key} added occurrence`)
        const occurrences = targetOccurrences.get(key) ?? []
        assert.ok(occurrences.length >= ordinal, `u${index}: ${key} ordinal ${ordinal}`)
        assert.ok(
          occurrences.some(
            occurrence =>
              occurrence.start === residueStart && occurrence.end === residueEnd,
          ),
          `u${index}: ${key} exact range`,
        )
      }
    }
  },
)

test(
  '2.1.117 replay restores a bounded 04fa3cc Console closure and generic buttons idempotently',
  { skip: !selected },
  async t => {
    const ts = await loadTypeScript()
    const materialized = materializeRawTargetSource(fixture.inputs.targetSource.commit)
    t.after(() => fs.rmSync(materialized.temporaryRoot, { recursive: true, force: true }))
    const before = summarizeSourceTree(materialized.sourceRoot)
    assert.deepEqual(publicTree(before), fixture.inputs.targetSource.rawTree)
    for (const output of TARGET117_CONFIRMATION_RECOVERED_FILES) {
      assert.equal(
        fs.existsSync(sourceFilename(materialized.sourceRoot, output.path)),
        false,
        `${output.path}: absent from raw Target117 source`,
      )
    }

    assert.equal(
      applyTarget117GeneratedOwnerRecovery({ sourceRoot: materialized.sourceRoot }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117HistoricalOwnerSourceGapRecovery({
        sourceRoot: materialized.sourceRoot,
      }).status,
      'recovered',
    )
    const result = applyTarget117ConfirmationSourceRecovery({
      sourceRoot: materialized.sourceRoot,
    })
    assert.equal(result.status, 'recovered')
    assert.equal(result.ownerOverrides, 20)
    assert.equal(result.declarationSlices, 33)
    assert.equal(result.files.filter(file => file.action === 'recovered').length, 2)
    assert.deepEqual(
      result.files.map(({ path: sourcePath, bytes, sha256: digest }) => ({
        path: sourcePath,
        bytes,
        sha256: digest,
      })),
      TARGET117_CONFIRMATION_RECOVERED_FILES.map(
        ({ path: sourcePath, bytes, sha256: digest }) => ({
          path: sourcePath,
          bytes,
          sha256: digest,
        }),
      ),
      'exact replay file identities',
    )
    const after = summarizeSourceTree(materialized.sourceRoot)
    assert.deepEqual(publicTree(after), fixture.inputs.targetSource.allCaseRecoveryTree)

    const authenticated = fixture.inputs.authenticatedConsoleSource
    const commit = execFileSync(
      'git',
      ['rev-parse', `${authenticated.commit}^{commit}`],
      { cwd: repositoryRoot, encoding: 'utf8' },
    ).trim()
    assert.equal(commit, authenticated.commit, 'authenticated source commit')
    const blob = execFileSync(
      'git',
      ['rev-parse', `${authenticated.commit}:${authenticated.path}`],
      { cwd: repositoryRoot, encoding: 'utf8' },
    ).trim()
    assert.equal(blob, authenticated.blob, 'authenticated source blob')
    const authenticatedBytes = execFileSync(
      'git',
      ['show', `${authenticated.commit}:${authenticated.path}`],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(authenticatedBytes), {
      bytes: authenticated.bytes,
      sha256: authenticated.sha256,
    })
    const authenticatedSource = authenticatedBytes.toString('utf8')
    for (const slice of TARGET117_CONSOLE_CONFIRMATION_DECLARATIONS) {
      const value = Buffer.from(authenticatedSource.slice(slice.start, slice.end))
      assert.deepEqual(descriptor(value), {
        bytes: slice.bytes,
        sha256: slice.sha256,
      }, `${slice.name}: authenticated 04fa3cc slice`)
    }

    const consoleOutput = TARGET117_CONFIRMATION_RECOVERED_FILES.find(
      row => row.path === 'src/components/ConsoleOAuthWizards.tsx',
    )
    assert.ok(consoleOutput, 'Console output identity')
    const consoleFilename = sourceFilename(materialized.sourceRoot, consoleOutput.path)
    const consoleSource = readExact(consoleFilename, consoleOutput).toString('utf8')
    const consoleFile = parseSource(ts, consoleFilename, consoleSource)
    for (const row of fixture.rows.filter(row => row.kind === 'console-replay')) {
      const slice = namedDeclarationSlice(
        ts,
        consoleFile,
        consoleSource,
        row.declaration,
      )
      assert.deepEqual(
        descriptor(Buffer.from(slice)),
        { bytes: row.source[0], sha256: row.source[1] },
        `u${row.targetIndex}: exact recovered declaration`,
      )
    }
    assert.match(consoleSource, /getAWSClientProxyConfig\(\)/)
    assert.doesNotMatch(consoleSource, /getAWSClientProxyConfig\s*\(\s*\{/)
    assert.doesNotMatch(consoleSource, /preferFirstWorking/)
    assert.doesNotMatch(consoleSource, /accountCandidates/)

    const buttonsOutput = TARGET117_CONFIRMATION_RECOVERED_FILES.find(
      row => row.path === 'src/components/ConfirmationButtons.tsx',
    )
    assert.ok(buttonsOutput, 'generic buttons output identity')
    const buttonsFilename = sourceFilename(materialized.sourceRoot, buttonsOutput.path)
    const buttonsSource = readExact(buttonsFilename, buttonsOutput).toString('utf8')
    const buttonsFile = parseSource(ts, buttonsFilename, buttonsSource)
    const buttons = namedDeclarationSlice(
      ts,
      buttonsFile,
      buttonsSource,
      'ConfirmationButtons',
    )
    assert.match(buttons, /confirmLabel\s*=\s*'Yes'/)
    assert.match(buttons, /cancelLabel\s*=\s*'No'/)
    assert.match(buttons, /cancelFirst\s*=\s*false/)
    assert.match(buttons, /focus\s*=\s*'confirm'/)
    assert.match(buttons, /cancelFirst\s*\?\s*\[cancel, confirm\]\s*:\s*\[confirm, cancel\]/)
    assert.match(buttons, /defaultFocusValue=\{focus\}/)
    assert.match(buttons, /value === 'confirm' \? onConfirm\(\) : onCancel\(\)/)
    assert.match(buttons, /onCancel=\{onCancel\}/)

    const replay = applyTarget117ConfirmationSourceRecovery({
      sourceRoot: materialized.sourceRoot,
    })
    assert.equal(replay.status, 'already-recovered')
    assert.ok(replay.files.every(file => file.action === 'unchanged'))

    fs.appendFileSync(buttonsFilename, '\n')
    assert.throws(
      () =>
        applyTarget117ConfirmationSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }),
      /expected absent or recovered/,
      'mutated recovered source fails closed',
    )
  },
)

test(
  '2.1.117 legacy confirmations bind to their historical Select declarations, never global text',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const targets = new Map(fixture.targets.map(row => [row[0], row]))
    const authenticated = fixture.inputs.authenticatedConsoleSource
    const consoleSource = execFileSync(
      'git',
      ['show', `${authenticated.commit}:${authenticated.path}`],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    const consoleFile = parseSource(ts, authenticated.path, consoleSource)

    for (const row of fixture.rows.filter(row => row.kind === 'legacy-select')) {
      const sourceBytes = execFileSync(
        'git',
        ['show', `${fixture.inputs.targetSource.commit}:${row.owner}`],
        { cwd: repositoryRoot },
      )
      assert.deepEqual(
        descriptor(sourceBytes),
        { bytes: row.file[0], sha256: row.file[1] },
        `u${row.targetIndex}: historical owner file`,
      )
      const source = sourceBytes.toString('utf8')
      const sourceFile = parseSource(ts, row.owner, source)
      const declaration = namedDeclarationSlice(
        ts,
        sourceFile,
        source,
        row.declaration,
      )
      assert.deepEqual(
        descriptor(Buffer.from(declaration)),
        { bytes: row.source[2], sha256: row.source[3] },
        `u${row.targetIndex}: historical owner declaration`,
      )
      assert.match(declaration, /<Select\b/, `u${row.targetIndex}: Select AST declaration`)
      assert.match(declaration, /options=\{/, `u${row.targetIndex}: explicit choices`)
      assert.match(declaration, /onChange=\{/, `u${row.targetIndex}: explicit dispatch`)
      for (const marker of row.strings) {
        assert.ok(
          declaration.includes(marker),
          `u${row.targetIndex}: source semantic marker ${JSON.stringify(marker)}`,
        )
      }
      assert.doesNotMatch(declaration, /\bconfirmLabel\b/)
      assert.doesNotMatch(declaration, /\bcancelLabel\b/)

      const metadata = targets.get(row.targetIndex)
      assert.ok(metadata, `u${row.targetIndex}: target metadata`)
      const targetUnit = target.slice(metadata[3], metadata[4])
      assert.ok(
        row.strings.some(marker => targetUnit.includes(marker)),
        `u${row.targetIndex}: target and historical declaration share behavior text`,
      )
      for (const marker of row.targetOnlyStrings ?? []) {
        assert.ok(
          targetUnit.includes(marker),
          `u${row.targetIndex}: authenticated Target117-only marker ${JSON.stringify(marker)}`,
        )
        assert.ok(
          !declaration.includes(marker),
          `u${row.targetIndex}: target-only label stays outside the property-equivalence claim`,
        )
      }
      for (const [kind, value] of row.residues) {
        assert.ok(
          kind !== 'property' || targetUnit.includes(value),
          `u${row.targetIndex}: target generic-component property ${value}`,
        )
      }
      assert.equal(
        namedDeclarations(ts, consoleFile, row.declaration).length,
        0,
        `u${row.targetIndex}: Console source never declares ${row.declaration}`,
      )
    }
  },
)
