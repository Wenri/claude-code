import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_FIRST_PROMPT_ENTRY_OWNER_OVERRIDES,
  TARGET119_FIRST_PROMPT_ENTRY_PROOF_SPEC,
} from '../cases/2.1.118-to-2.1.119/recovered/first-prompt-entry-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-first-prompt-entry-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/first-prompt-entry-owner-overrides.mjs',
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'b6dc954a0b299e60b73142c6a54222f66b14e44b33c28b68b92ce55f4fcad489'
const HELPER_SHA256 =
  '6e0d134ec358b43f3cfea3dbf638e5b3c0d515a43459c951b847e3b3a800eff4'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function canonicalResidues() {
  return fixture.row.residues.map(residue => [
    fixture.row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
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

function declarationName(ts, statement) {
  if (ts.isFunctionDeclaration(statement)) return statement.name?.text
  if (!ts.isVariableStatement(statement)) return undefined
  const names = statement.declarationList.declarations.flatMap(declaration =>
    ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
  )
  return names.length === 1 ? names[0] : undefined
}

function sourceFiles(directory) {
  const result = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...sourceFiles(filename))
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) result.push(filename)
  }
  return result
}

function markerCandidates() {
  return sourceFiles(sourceRoot)
    .filter(filename => {
      const source = fs.readFileSync(filename, 'utf8')
      return (
        source.includes('commandFallback') &&
        source.includes('/<bash-input>([\\s\\S]*?)<\\/bash-input>/') &&
        source.includes('extractFirstPromptFromHead')
      )
    })
    .map(filename =>
      `src/${path.relative(sourceRoot, filename).split(path.sep).join('/')}`,
    )
    .sort()
}

function targetHelper(unitSource) {
  return new Function(
    's79',
    't79',
    `'use strict';${unitSource};return RaH`,
  )(
    /^(?:\s*<[a-z][\w-]*[\s>]|\[Request interrupted by user[^\]]*\])/,
    /<command-name>(.*?)<\/command-name>/,
  )
}

function targetExtractFirstPrompt(helper, head) {
  let start = 0
  const state = { commandFallback: '' }
  while (start < head.length) {
    const newlineIndex = head.indexOf('\n', start)
    const line =
      newlineIndex >= 0 ? head.slice(start, newlineIndex) : head.slice(start)
    start = newlineIndex >= 0 ? newlineIndex + 1 : head.length
    if (!line.includes('"type":"user"') && !line.includes('"type": "user"'))
      continue
    if (line.includes('"tool_result"')) continue
    if (line.includes('"isMeta":true') || line.includes('"isMeta": true'))
      continue
    if (
      line.includes('"isCompactSummary":true') ||
      line.includes('"isCompactSummary": true')
    )
      continue
    try {
      const result = helper(JSON.parse(line), state)
      if (result !== undefined) return result
    } catch {
      continue
    }
  }
  return state.commandFallback
}

test(
  'Target119 first-prompt owner fixture and override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 3,
      targetIndicesSha256:
        '3809cd4ff30eb897cba300a7a67eec4ffe45adff7be6f6fc7bf04df9ae0c2ca3',
      residueIdentitiesSha256:
        'a21369ca2c308a0c9ac3584d4f564b2b84801ee8ff82af9ca0163e97c998f1df',
    })
    assert.equal(
      sha256(JSON.stringify([fixture.row.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalResidues())),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.deepEqual(
      TARGET119_FIRST_PROMPT_ENTRY_OWNER_OVERRIDES[0],
      {
        key: `${caseName}:2244`,
        targetIndex: fixture.row.targetIndex,
        paths: [fixture.row.ownerPath],
        evidenceIds: fixture.evidenceIds,
        behavior: TARGET119_FIRST_PROMPT_ENTRY_OWNER_OVERRIDES[0].behavior,
      },
    )
    assert.deepEqual(
      {
        targetIndex: TARGET119_FIRST_PROMPT_ENTRY_PROOF_SPEC.targetIndex,
        ownerPath: TARGET119_FIRST_PROMPT_ENTRY_PROOF_SPEC.ownerPath,
        declaration: TARGET119_FIRST_PROMPT_ENTRY_PROOF_SPEC.declaration,
        priorOwnerPaths: TARGET119_FIRST_PROMPT_ENTRY_PROOF_SPEC.priorOwnerPaths,
        residues: TARGET119_FIRST_PROMPT_ENTRY_PROOF_SPEC.residues,
      },
      {
        targetIndex: fixture.row.targetIndex,
        ownerPath: fixture.row.ownerPath,
        declaration: fixture.row.declaration,
        priorOwnerPaths: fixture.row.priorOwnerPaths,
        residues: fixture.row.residues,
      },
    )
  },
)

test(
  'authenticated complete helper, regex initializer, and typed residues remain exact',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural delta',
        ),
      ),
    )
    const frozenAnalysis = JSON.parse(
      readExact(
        path.join(root, fixture.inputs.frozenAnalysis.path),
        fixture.inputs.frozenAnalysis,
        'Target119 frozen owner analysis',
      ),
    )
    const unit = fixture.target.unit
    assert.deepEqual(
      descriptor(Buffer.from(target.slice(unit.start, unit.end))),
      { bytes: unit.bytes, sha256: unit.sha256 },
    )
    assert.deepEqual(
      descriptor(
        Buffer.from(
          target.slice(
            fixture.target.regexpInitializer.start,
            fixture.target.regexpInitializer.end,
          ),
        ),
      ),
      {
        bytes: fixture.target.regexpInitializer.bytes,
        sha256: fixture.target.regexpInitializer.sha256,
      },
    )
    const region = structural.regions[unit.targetIndex]
    assert.deepEqual(
      {
        index: region.target.index,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        sourceHash: region.target.sourceHash,
      },
      {
        index: unit.targetIndex,
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        sourceHash: unit.sha256,
      },
    )
    const analysisRow = frozenAnalysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === unit.targetIndex,
    )
    assert.deepEqual(analysisRow.ownerPaths, ['utils/windowsPaths.ts'])
    assert.deepEqual(analysisRow.target, {
      classification: 'unresolved',
      start: unit.start,
      end: unit.end,
      nodeType: unit.nodeType,
      sourceHash: unit.sha256,
    })
    assert.equal(analysisRow.residues, 3)

    const propertyOffsets = []
    let offset = 0
    while ((offset = target.indexOf('commandFallback', offset)) >= 0) {
      propertyOffsets.push(offset)
      offset += 'commandFallback'.length
    }
    assert.deepEqual(propertyOffsets.slice(0, 2), [932096, 932114])
    assert(!baseline.includes('commandFallback'))
    const regexpText = '<bash-input>([\\s\\S]*?)<\\/bash-input>'
    assert.equal(target.indexOf(regexpText), 932151)
    assert.equal(target.indexOf(regexpText, 932152), -1)
    assert(!baseline.includes(regexpText))

    const parsedUnit = parse(target.slice(unit.start, unit.end), {
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const properties = []
    const regexps = []
    function visit(node) {
      if (node === null || typeof node !== 'object') return
      if (Array.isArray(node)) {
        for (const child of node) visit(child)
        return
      }
      if (
        node.type === 'MemberExpression' &&
        !node.computed &&
        node.property?.type === 'Identifier' &&
        node.property.name === 'commandFallback'
      ) {
        properties.push([unit.start + node.property.start, unit.start + node.property.end])
      }
      if (node.type === 'Literal' && node.regex) {
        regexps.push({
          pattern: node.regex.pattern,
          flags: node.regex.flags,
          start: unit.start + node.start,
          end: unit.start + node.end,
        })
      }
      for (const [key, child] of Object.entries(node)) {
        if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
          visit(child)
        }
      }
    }
    visit(parsedUnit)
    assert.deepEqual(properties, [
      [932096, 932111],
      [932114, 932129],
    ])
    assert.deepEqual(regexps, [
      {
        pattern: fixture.row.residues[2].value.pattern,
        flags: fixture.row.residues[2].value.flags,
        start: fixture.row.residues[2].start,
        end: fixture.row.residues[2].end,
      },
    ])
  },
)

test(
  'sessionStoragePortable is the sole exact source owner and its state machine AST is pinned',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const sourceBytes = readExact(
      path.join(sourceRoot, fixture.inputs.sourceFile.path.replace(/^src\//, '')),
      fixture.inputs.sourceFile,
      fixture.inputs.sourceFile.path,
    )
    const rejectedBytes = readExact(
      path.join(
        sourceRoot,
        fixture.inputs.rejectedSourceFile.path.replace(/^src\//, ''),
      ),
      fixture.inputs.rejectedSourceFile,
      fixture.inputs.rejectedSourceFile.path,
    )
    const source = sourceBytes.toString('utf8')
    const rejected = rejectedBytes.toString('utf8')
    assert.deepEqual(markerCandidates(), [fixture.source.soleMarkerCandidate])
    assert(!rejected.includes('commandFallback'))
    assert(!rejected.includes('<bash-input>'))

    const sourceFile = ts.createSourceFile(
      fixture.inputs.sourceFile.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    for (const expected of fixture.source.declarations) {
      const matches = sourceFile.statements.filter(
        statement => declarationName(ts, statement) === expected.name,
      )
      assert.equal(matches.length, 1, expected.name)
      const declaration = matches[0]
      const start = declaration.getStart(sourceFile)
      const end = declaration.end
      const text = source.slice(start, end)
      assert.deepEqual(
        { name: expected.name, start, end, ...descriptor(Buffer.from(text)) },
        expected,
      )
    }
    const functionText = source.slice(
      fixture.source.declarations[2].start,
      fixture.source.declarations[2].end,
    )
    for (const marker of [
      "let commandFallback = ''",
      'COMMAND_NAME_RE.exec(result)',
      'if (!commandFallback) commandFallback = cmdMatch[1]!',
      '/<bash-input>([\\s\\S]*?)<\\/bash-input>/.exec(result)',
      'SKIP_FIRST_PROMPT_PATTERN.test(result)',
      'result.slice(0, 200).trim()',
      'if (commandFallback) return commandFallback',
    ]) {
      assert.equal(functionText.split(marker).length - 1, 1, marker)
    }
    for (const marker of [
      '"tool_result"',
      '"isMeta":true',
      '"isCompactSummary":true',
    ]) {
      assert(functionText.includes(marker), marker)
    }
  },
)

test(
  'authenticated helper and recovered source agree on prompt routing behavior',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const target = fs
      .readFileSync(
        artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
        'utf8',
      )
      .slice(fixture.target.unit.start, fixture.target.unit.end)
    const source = fs.readFileSync(
      path.join(sourceRoot, fixture.inputs.sourceFile.path.replace(/^src\//, '')),
      'utf8',
    )
    const sourceSnippet = [
      ...fixture.source.declarations.slice(0, 2),
      fixture.source.declarations[2],
    ]
      .map(declaration => source.slice(declaration.start, declaration.end))
      .join('\n')
    const compiled = ts.transpileModule(sourceSnippet, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const exports = {}
    new Function('exports', compiled)(exports)
    const sourceExtract = exports.extractFirstPromptFromHead
    assert.equal(typeof sourceExtract, 'function')
    const helper = targetHelper(target)
    const user = content => JSON.stringify({ type: 'user', message: { content } })
    const spacedUser = content =>
      JSON.stringify({ type: 'user', message: { content } }).replace(
        '"type":"user"',
        '"type": "user"',
      )
    const longPrompt = `  ${'a'.repeat(205)}  `
    const scenarios = [
      ['', ''],
      ['not json', ''],
      [JSON.stringify({ type: 'assistant', message: { content: 'no' } }), ''],
      [user('plain prompt'), 'plain prompt'],
      [spacedUser('spaced prompt'), 'spaced prompt'],
      [user([{ type: 'text', text: 'array prompt' }]), 'array prompt'],
      [user([{ type: 'tool_result', content: 'skip' }]), ''],
      [user('<command-name>help</command-name>'), 'help'],
      [
        `${user('<command-name>help</command-name>')}\n${user('later prompt')}`,
        'later prompt',
      ],
      [user('<bash-input>  git status  </bash-input>'), '! git status'],
      [`${user('<ide-context>skip</ide-context>')}\n${user('visible')}`, 'visible'],
      [`${user('[Request interrupted by user]')}\n${user('visible')}`, 'visible'],
      [
        JSON.stringify({
          type: 'user',
          isMeta: true,
          message: { content: 'skip' },
        }),
        '',
      ],
      [
        JSON.stringify({
          type: 'user',
          isCompactSummary: true,
          message: { content: 'skip' },
        }),
        '',
      ],
      [user(longPrompt), `${'a'.repeat(200)}…`],
    ]
    for (const [head, expected] of scenarios) {
      assert.equal(sourceExtract(head), expected, head.slice(0, 80))
      assert.equal(
        targetExtractFirstPrompt(helper, head),
        expected,
        head.slice(0, 80),
      )
    }
  },
)
