import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { TARGET118_DIRECT_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/direct-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, 'recovery/test/recovery-2.1.118-direct-owner-proofs.json'),
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
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

async function declarationText(filename, declarationName) {
  const imported = await import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  )
  const ts = imported.default ?? imported
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  const matches = []
  for (const statement of sourceFile.statements) {
    if (
      declarationName.startsWith('@export:') &&
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some(
        element => element.name.text === declarationName.slice(8),
      )
    ) {
      matches.push(statement)
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === declarationName
    ) {
      matches.push(statement)
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === declarationName) {
          matches.push(statement)
        }
      }
    }
  }
  assert.equal(matches.length, 1, `${filename}:${declarationName}`)
  return matches[0].getText(sourceFile)
}

const declarations = new Map([
  [6723, ['getUserThemesDir']],
  [7466, ['@export:useResolvedTheme']],
  [7509, ['DEFAULT_BINDINGS']],
  [7522, ['KEYBINDING_CONTEXTS', 'KEYBINDING_ACTIONS']],
  [8977, ['getGitStatus', 'getSystemContext']],
  [9805, ['IdeOnboardingDialog']],
  [10917, ['generateAwaySummary']],
  [16266, ['TagPlugin']],
  [16623, ['WarmResumeHint']],
  [17033, ['FuzzyPicker']],
  [17039, ['CustomThemeEditor']],
  [19473, ['fromVisualTextObject']],
  [19475, ['useVimInput']],
  [19477, ['UNHANDLED_SPECIAL_KEYS']],
])

test('Target118 direct-owner fixture is complete and deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 14)
  assert.equal(fixture.summary.residues, 292)
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [6723, 7466, 7509, 7522, 8977, 9805, 10917, 16266, 16623, 17033, 17039, 19473, 19475, 19477],
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.flatMap(row => row.residues))),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    TARGET118_DIRECT_OWNER_OVERRIDES.map(row => row.targetIndex),
    fixture.rows.map(row => row.targetIndex),
  )
})

test('authenticated Target118 bundle pins every corrected direct-owner unit', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), fixture.inputs.targetBundle)
  for (const row of fixture.rows) {
    const slice = bundle.subarray(row.target.start, row.target.end)
    assert.equal(slice.length, row.target.bytes, `u${row.targetIndex}: bytes`)
    assert.equal(sha256(slice), row.target.sourceHash, `u${row.targetIndex}: hash`)
    for (const residue of row.residues) {
      assert(residue[2] >= row.target.start, `u${row.targetIndex}: residue start`)
      assert(residue[3] <= row.target.end, `u${row.targetIndex}: residue end`)
    }
  }
})

test('historical Target118 source AST uniquely contains each corrected declaration', async () => {
  const descriptors = new Map(
    fixture.inputs.sourceFiles.map(row => [row.sourcePath, row]),
  )
  for (const row of fixture.rows) {
    const filename = path.join(sourceRoot, row.ownerPath.replace(/^src\//, ''))
    const expected = descriptors.get(row.ownerPath)
    assert(expected, row.ownerPath)
    assert.deepEqual(descriptor(fs.readFileSync(filename)), {
      bytes: expected.bytes,
      sha256: expected.sha256,
    })
    const text = (
      await Promise.all(
        declarations
          .get(row.targetIndex)
          .map(declaration => declarationText(filename, declaration)),
      )
    ).join('\n')
    for (const marker of row.sourceMarkers) {
      assert(text.includes(marker), `u${row.targetIndex}:${marker}`)
    }
  }
})

test('Target118 direct-owner coverage changes only as one exact correction set', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const provisional = new Map([
    [6723, ['src/utils/theme.ts']],
    [7466, ['src/ink/hooks/use-tab-status.ts']],
    [7509, ['src/context/voice.tsx']],
    [7522, ['src/keybindings/reservedShortcuts.ts']],
    [8977, ['src/utils/permissions/pathValidation.ts']],
    [9805, ['src/components/IdeOnboardingDialog.tsx']],
    [10917, ['src/hooks/toolPermission/permissionLogging.ts']],
    [16266, ['src/utils/plugins/validatePlugin.ts']],
    [16623, ['src/components/LogoV2/LogoV2.tsx']],
    [17033, ['src/commands/cost/index.ts']],
    [17039, ['src/commands/terminalSetup/index.ts']],
    [19473, ['src/vim/types.ts']],
    [19475, ['src/vim/types.ts']],
    [19477, ['src/vim/types.ts']],
  ])
  const states = []
  for (const expected of TARGET118_DIRECT_OWNER_OVERRIDES) {
    const row = rows.get(expected.targetIndex)
    assert(row, `missing coverage u${expected.targetIndex}`)
    const currentPaths = row.ownerIds.map(id => owners.get(id))
    const hasCorrectedEvidence = expected.evidenceIds.every(evidenceId =>
      row.evidenceIds.includes(evidenceId),
    )
    if (
      JSON.stringify(currentPaths) === JSON.stringify(expected.paths) &&
      hasCorrectedEvidence
    ) {
      states.push('corrected')
      for (const evidenceId of expected.evidenceIds) {
        assert(row.evidenceIds.includes(evidenceId), `u${expected.targetIndex}:${evidenceId}`)
      }
    } else {
      states.push('provisional')
      assert.deepEqual(currentPaths, provisional.get(expected.targetIndex))
    }
  }
  assert.equal(new Set(states).size, 1, `mixed direct-owner coverage state: ${states}`)
})
