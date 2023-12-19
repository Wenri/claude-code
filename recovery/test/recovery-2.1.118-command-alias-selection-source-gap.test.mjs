import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import {
  TARGET118_COMMAND_ALIAS_SELECTION_INPUTS,
  TARGET118_COMMAND_ALIAS_SELECTION_OUTPUTS,
  TARGET118_COMMAND_ALIAS_SELECTION_OWNER_OVERRIDES,
  applyTarget118CommandAliasSelectionReplay,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-command-alias-selection-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-command-alias-selection-source-gap.json',
    ),
  ),
)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

async function loadTypeScript() {
  const imported = await import(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    )
  )
  return imported.default ?? imported
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

function materializeRawOwners() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'target118-command-alias-'))
  const sourceRoot = path.join(temp, 'src')
  for (const expected of TARGET118_COMMAND_ALIAS_SELECTION_INPUTS) {
    const filename = path.join(sourceRoot, expected.path.replace(/^src\//, ''))
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    const source = execFileSync(
      'git',
      ['show', `${fixture.targetCommit}:${expected.path}`],
      { cwd: root },
    )
    assert.deepEqual(descriptor(source), {
      bytes: expected.bytes,
      sha256: expected.sha256,
    })
    fs.writeFileSync(filename, source)
  }
  return { temp, sourceRoot }
}

function findFunction(ts, sourceFile, name) {
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(matches.length, 1, `${sourceFile.fileName}:${name}`)
  return matches[0]
}

test('Target118 command alias fixture pins both complete units and residues', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 2)
  assert.equal(fixture.summary.residues, 2)
  assert.deepEqual(fixture.rows.map(row => row.targetIndex), [19257, 19259])
  assert.equal(
    sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.flatMap(row => row.residues))),
    fixture.summary.residueIdentitiesSha256,
  )
})

test('authenticated Target118 bundle pins both matchedAlias runtime sites', () => {
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
      assert(residue.start >= row.target.start)
      assert(residue.end <= row.target.end)
      assert.equal(bundle.subarray(residue.start, residue.end).toString(), residue.value)
    }
  }
})

test('Target118 command alias replay is exact, idempotent, typed, and executable', async t => {
  const { temp, sourceRoot } = materializeRawOwners()
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))

  assert.equal(
    applyTarget118CommandAliasSelectionReplay({ sourceRoot }).status,
    'recovered',
  )
  for (const expected of TARGET118_COMMAND_ALIAS_SELECTION_OUTPUTS) {
    const filename = path.join(sourceRoot, expected.path.replace(/^src\//, ''))
    assert.deepEqual(descriptor(fs.readFileSync(filename)), {
      bytes: expected.bytes,
      sha256: expected.sha256,
    })
  }
  assert.equal(
    applyTarget118CommandAliasSelectionReplay({ sourceRoot }).status,
    'already-recovered',
  )

  const ts = await loadTypeScript()
  const footerFilename = path.join(
    sourceRoot,
    'components/PromptInput/PromptInputFooterSuggestions.tsx',
  )
  const footerSource = fs.readFileSync(footerFilename, 'utf8')
  const footerAst = ts.createSourceFile(
    footerFilename,
    footerSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(footerAst.parseDiagnostics.length, 0)
  assert(footerSource.includes(fixture.sourceMarkers.type))
  const suggestionTypes = footerAst.statements.filter(
    statement =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === 'SuggestionItem',
  )
  assert.equal(suggestionTypes.length, 1)
  assert(
    suggestionTypes[0].type.members.some(
      member => member.name?.getText(footerAst) === 'matchedAlias',
    ),
  )

  const commandFilename = path.join(
    sourceRoot,
    'utils/suggestions/commandSuggestions.ts',
  )
  const commandSource = fs.readFileSync(commandFilename, 'utf8')
  const commandAst = ts.createSourceFile(
    commandFilename,
    commandSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(commandAst.parseDiagnostics.length, 0)
  for (const marker of [
    fixture.sourceMarkers.payload,
    fixture.sourceMarkers.guard,
    fixture.sourceMarkers.fallback,
  ]) {
    assert(commandSource.includes(marker), marker)
  }
  const createItem = findFunction(ts, commandAst, 'createCommandSuggestionItem')
  assert(createItem.getText(commandAst).includes('matchedAlias,'))
  const apply = findFunction(ts, commandAst, 'applyCommandSuggestion')
  const compiled = ts.transpileModule(apply.getText(commandAst), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^export /m, '')
  const applyCommandSuggestion = new Function(
    'isCommandMetadata',
    'getCommand',
    'findCommand',
    'formatCommand',
    `${compiled}\nreturn applyCommandSuggestion`,
  )(
    value => value !== null && typeof value === 'object' && 'name' in value,
    (name, commands) => commands.find(command => command.name === name),
    (name, commands) =>
      commands.find(
        command => command.name === name || command.aliases?.includes(name),
      ),
    name => `/${name} `,
  )

  const selected = { name: 'canonical', aliases: ['short'], type: 'prompt' }
  const other = { name: 'other', aliases: ['spoof'], type: 'prompt' }
  const observe = suggestion => {
    let input
    let cursor
    applyCommandSuggestion(
      suggestion,
      false,
      [selected, other],
      value => {
        input = value
      },
      value => {
        cursor = value
      },
      () => assert.fail('should not submit'),
    )
    return { input, cursor }
  }
  assert.deepEqual(
    observe({ metadata: selected, matchedAlias: 'short' }),
    { input: '/short ', cursor: 7 },
  )
  assert.deepEqual(
    observe({ metadata: selected, matchedAlias: 'spoof' }),
    { input: '/canonical ', cursor: 11 },
  )
})

test('Target118 command alias coverage changes only as a complete replay pair', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const states = []
  for (const expected of TARGET118_COMMAND_ALIAS_SELECTION_OWNER_OVERRIDES) {
    const row = rows.get(expected.targetIndex)
    assert(row)
    const evidence = expected.evidenceIds.map(id => row.evidenceIds.includes(id))
    assert.equal(new Set(evidence).size, 1, `u${expected.targetIndex}: partial evidence`)
    if (evidence[0]) {
      assert.deepEqual(row.ownerIds.map(id => owners.get(id)), [...expected.paths])
    }
    states.push(evidence[0] ? 'recovered' : 'provisional')
  }
  assert.equal(new Set(states).size, 1, `mixed command alias state: ${states}`)
})
