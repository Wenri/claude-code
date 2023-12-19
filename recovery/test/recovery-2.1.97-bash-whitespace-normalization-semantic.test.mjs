import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'

const baselineUnit = {
  index: 12208,
  nodeType: 'FunctionDeclaration',
  start: 9_438_109,
  end: 9_439_062,
  sourceHash:
    'f91e362dd5575d56d973ed3204395abd8b7dca2b7097cd2ffc9cae0441d7745d',
}
const targetUnit = {
  index: 9905,
  nodeType: 'FunctionDeclaration',
  start: 7_426_356,
  end: 7_427_347,
  sourceHash:
    '53b79fae99643771b70ae9b6312c3e27c1dbe293906b5f061b80dac03523cb06',
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedSha256, `${label} hash drifted`)
  return bytes.toString('utf8')
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

async function instantiateMatcher() {
  const ts = await loadTypeScript()
  const owner = source('tools/BashTool/bashPermissions.ts')
  const ast = ts.createSourceFile(
    'bashPermissions.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = ast.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'filterRulesByContentsMatchingInput',
  )
  assert.ok(declaration, 'filterRulesByContentsMatchingInput must be reachable')

  const harness = `
    namespace z { export type infer<T> = any }
    type PermissionRule = { id: string }
    type SimpleCommand = { argv: string[] }
    const BashTool = { inputSchema: {} }
    const extractOutputRedirections = (command: string) => ({
      commandWithoutRedirections: command,
    })
    const stripSafeWrappers = (command: string) => command
    const stripAllLeadingEnvVars = (command: string) => command
    const stripWrappersFromArgv = (argv: string[]) => argv
    const tryParseShellCommand = (command: string) => ({
      success: true,
      tokens: command.trim().split(/[ \\t]+/),
    })
    const splitCommand = (command: string) =>
      command.includes('&&') ? command.split('&&') : [command]
    const matchWildcardPattern = () => false
    const bashPermissionRule = (ruleContent: string) =>
      ruleContent.endsWith(':*')
        ? { type: 'prefix' as const, prefix: ruleContent.slice(0, -2) }
        : { type: 'exact' as const, command: ruleContent }
    ${declaration.getText(ast)}
    module.exports = { filterRulesByContentsMatchingInput }
  `
  const result = ts.transpileModule(harness, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'bashWhitespaceMatcher.ts',
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'isolated Bash matcher must transpile')
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports.filterRulesByContentsMatchingInput
}

test(
  '2.1.97 introduces repeated-horizontal-whitespace normalization in the Bash matcher',
  bundleOptions,
  () => {
    if (!selected || !baselinePath || !targetPath) return
    const baseline = requiredBundle(
      baselinePath,
      'CLAUDE_CODE_2_1_96_BUNDLE',
      baselineSha256,
    )
    const target = requiredBundle(
      targetPath,
      'CLAUDE_CODE_2_1_97_BUNDLE',
      targetSha256,
    )
    const baselineOwner = baseline.slice(baselineUnit.start, baselineUnit.end)
    const targetOwner = target.slice(targetUnit.start, targetUnit.end)

    assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)
    assert.equal(sha256(targetOwner), targetUnit.sourceHash)
    assert.match(baselineOwner, /^function x47\(/)
    assert.doesNotMatch(baselineOwner, /replace\(\/\[ \\t\]\+\/g," "\)/)
    assert.match(
      baselineOwner,
      /case"prefix":switch\(_\)\{case"exact":return J\.prefix===M/,
    )
    assert.match(targetOwner, /^function Ai1\(/)
    assert.equal(
      targetOwner.split('replace(/[ \\t]+/g," ")').length - 1,
      2,
    )
    assert.match(
      targetOwner,
      /case"prefix":\{let X=J\.prefix\.replace\(\/\[ \\t\]\+\/g," "\),P=M\.replace\(\/\[ \\t\]\+\/g," "\)/,
    )
    assert.match(
      targetOwner,
      /case"exact":return X===P[\s\S]*if\(P===X\)return!0[\s\S]*P\.startsWith\(X\+" "\)[\s\S]*D="xargs "\+X/,
    )

    const row = structural.regions[targetUnit.index]
    assert.equal(row.classification, 'unresolved')
    assert.deepEqual(
      [
        row.target.index,
        row.target.nodeType,
        row.target.start,
        row.target.end,
        row.target.sourceHash,
      ],
      [
        targetUnit.index,
        targetUnit.nodeType,
        targetUnit.start,
        targetUnit.end,
        targetUnit.sourceHash,
      ],
    )
    const oldRow = structural.unmatchedBaseline.find(
      candidate => candidate.index === baselineUnit.index,
    )
    assert.ok(oldRow, `baseline u${baselineUnit.index} must be unmatched`)
    assert.deepEqual(
      [oldRow.nodeType, oldRow.start, oldRow.end, oldRow.sourceHash],
      [
        baselineUnit.nodeType,
        baselineUnit.start,
        baselineUnit.end,
        baselineUnit.sourceHash,
      ],
    )
  },
)

test(
  'the target97 historical owner and current owner retain the exact normalization pair',
  sourceOptions,
  () => {
    if (!selected) return
    const owner = source('tools/BashTool/bashPermissions.ts')
    const start = owner.indexOf('function filterRulesByContentsMatchingInput(')
    const end = owner.indexOf('\nfunction matchingRulesForInput(', start)
    assert.ok(start >= 0 && end > start, 'Bash matcher source range')
    const matcher = owner.slice(start, end)
    assert.equal(
      matcher.split("replace(/[ \\t]+/g, ' ')").length - 1,
      2,
    )
    assert.match(
      matcher,
      /const normalizedPrefix = bashRule\.prefix\.replace\(\/\[ \\t\]\+\/g, ' '\)[\s\S]*const normalizedCommand = cmdToMatch\.replace\(\/\[ \\t\]\+\/g, ' '\)/,
    )
    assert.match(
      matcher,
      /return normalizedPrefix === normalizedCommand[\s\S]*normalizedCommand\.startsWith\(normalizedPrefix \+ ' '\)[\s\S]*const xargsPrefix = 'xargs ' \+ normalizedPrefix/,
    )
  },
)

test(
  'the authored Bash matcher executes exact, prefix, and xargs normalization',
  sourceOptions,
  async () => {
    if (!selected) return
    const match = await instantiateMatcher()
    const rule = { id: 'normalized-prefix' }
    const rules = new Map([['git  status:*', rule]])

    assert.deepEqual(
      match({ command: 'git\tstatus' }, rules, 'exact'),
      [rule],
    )
    assert.deepEqual(
      match({ command: 'git\t  status   --short' }, rules, 'prefix'),
      [rule],
    )
    assert.deepEqual(
      match({ command: 'xargs\tgit   status --short' }, rules, 'prefix'),
      [rule],
    )
    assert.deepEqual(
      match({ command: 'git\tstatuses' }, rules, 'prefix'),
      [],
    )
  },
)
