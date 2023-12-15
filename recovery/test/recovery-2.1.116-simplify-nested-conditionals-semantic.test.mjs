import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const baselineUnit = {
  index: 19_982,
  start: 12_189_688,
  end: 12_193_599,
  nodeType: 'VariableDeclaration',
  sourceHash:
    'aeff0eb34152152197f3f692a2fe9e21794cf0ca2a6fbfd98d18d819bec039ae',
}
const targetUnit = {
  index: 20_254,
  start: 12_289_412,
  end: 12_293_532,
  nodeType: 'VariableDeclaration',
  sourceHash:
    'f75fae98eb4f83b923b20612c678b18b8a6868be445e6eae0fd24520afe4338c',
}
const codeQuote = String.fromCharCode(96)
const nestedConditionalsText =
  '7. **Nested conditionals**: ternary chains (' +
  codeQuote +
  'a ? x : b ? y : ...' +
  codeQuote +
  '), nested if/else, or nested switch 3+ levels deep — flatten with early returns, guard clauses, a lookup table, or an if/else-if cascade'
const oldCommentsPrefix = '7. **Unnecessary comments**'
const targetCommentsPrefix = '8. **Unnecessary comments**'

const sourceOptions = {
  skip: selected ? false : 'not applicable to ' + semanticCase,
}
const bundleOptions = {
  skip: !selected
    ? 'not applicable to ' + semanticCase
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function rawBundleText(value) {
  return value
    .replaceAll(codeQuote, '\\' + codeQuote)
    .replaceAll('—', '\\u2014')
}

function loadTypeScript() {
  const require = createRequire(import.meta.url)
  for (const candidate of [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error('TypeScript compiler not found')
}

function loadRegisteredDefinition() {
  const ts = loadTypeScript()
  const result = ts.transpileModule(source('src/skills/bundled/simplify.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(
    errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')),
    [],
  )

  let registeredDefinition
  const requireStub = specifier => {
    if (specifier.endsWith('/AgentTool/constants.js')) {
      return { AGENT_TOOL_NAME: 'Agent' }
    }
    if (specifier.endsWith('/bundledSkills.js')) {
      return {
        registerBundledSkill(definition) {
          registeredDefinition = definition
        },
      }
    }
    throw new Error('unexpected simplify dependency: ' + specifier)
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', result.outputText)(
    requireStub,
    module.exports,
    module,
  )
  module.exports.registerSimplifySkill()
  assert.ok(registeredDefinition)
  return registeredDefinition
}

test(
  'target116 authenticates the reachable simplify nested-conditionals prompt delta',
  bundleOptions,
  () => {
    const baseline = fs.readFileSync(baselinePath)
    const target = fs.readFileSync(targetPath)
    assert.equal(baseline.length, 12_986_755)
    assert.equal(target.length, 13_102_272)
    assert.equal(sha256(baseline), baselineSha256)
    assert.equal(sha256(target), targetSha256)

    const baselineRegion = structural.unmatchedBaseline.find(
      region => region.index === baselineUnit.index,
    )
    assert.deepEqual(
      [
        baselineRegion?.start,
        baselineRegion?.end,
        baselineRegion?.nodeType,
        baselineRegion?.sourceHash,
      ],
      [
        baselineUnit.start,
        baselineUnit.end,
        baselineUnit.nodeType,
        baselineUnit.sourceHash,
      ],
    )
    const targetRegion = structural.regions[targetUnit.index]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.nodeType,
        targetRegion.target.sourceHash,
      ],
      [
        targetUnit.start,
        targetUnit.end,
        targetUnit.nodeType,
        targetUnit.sourceHash,
      ],
    )

    const baselineOwner = baseline
      .subarray(baselineUnit.start, baselineUnit.end)
      .toString('utf8')
    const targetOwner = target
      .subarray(targetUnit.start, targetUnit.end)
      .toString('utf8')
    assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)
    assert.equal(sha256(targetOwner), targetUnit.sourceHash)
    assert.equal(
      parse(baselineOwner, {
        ecmaVersion: 'latest',
        sourceType: 'script',
      }).body.length,
      1,
    )
    assert.equal(
      parse(targetOwner, {
        ecmaVersion: 'latest',
        sourceType: 'script',
      }).body.length,
      1,
    )

    const rawNestedConditionals = rawBundleText(nestedConditionalsText)
    assert.equal(occurrences(baselineOwner, rawNestedConditionals), 0)
    assert.equal(occurrences(targetOwner, rawNestedConditionals), 1)
    assert.equal(occurrences(baselineOwner, oldCommentsPrefix), 1)
    assert.equal(occurrences(baselineOwner, targetCommentsPrefix), 0)
    assert.equal(occurrences(targetOwner, oldCommentsPrefix), 0)
    assert.equal(occurrences(targetOwner, targetCommentsPrefix), 1)
    assert.ok(
      targetOwner.indexOf(rawNestedConditionals) <
        targetOwner.indexOf(targetCommentsPrefix),
    )

    const baselineBundle = baseline.toString('utf8')
    const targetBundle = target.toString('utf8')
    assert.equal(occurrences(baselineBundle, 'T7_'), 2)
    assert.ok(baselineBundle.indexOf('T7_()', baselineUnit.end) >= 0)
    assert.equal(occurrences(targetBundle, 'KA4'), 2)
    assert.ok(targetBundle.indexOf('KA4()', targetUnit.end) >= 0)
  },
)

test(
  'source registers and returns the exact target116 simplify prompt ordering',
  sourceOptions,
  async () => {
    const owner = source('src/skills/bundled/simplify.ts')
    const sourceNestedConditionals = nestedConditionalsText.replaceAll(
      codeQuote,
      '\\' + codeQuote,
    )
    assert.equal(occurrences(owner, sourceNestedConditionals), 1)
    assert.equal(occurrences(owner, oldCommentsPrefix), 0)
    assert.equal(occurrences(owner, targetCommentsPrefix), 1)

    const index = source('src/skills/bundled/index.ts')
    assert.equal(
      occurrences(
        index,
        "import { registerSimplifySkill } from './simplify.js'",
      ),
      1,
    )
    assert.equal(occurrences(index, 'registerSimplifySkill()'), 1)

    const definition = loadRegisteredDefinition()
    assert.equal(definition.name, 'simplify')
    assert.equal(definition.userInvocable, true)
    const [block] = await definition.getPromptForCommand('')
    assert.equal(block.type, 'text')
    assert.equal(occurrences(block.text, nestedConditionalsText), 1)
    assert.equal(occurrences(block.text, oldCommentsPrefix), 0)
    assert.equal(occurrences(block.text, targetCommentsPrefix), 1)
    assert.ok(
      block.text.indexOf('6. **Unnecessary JSX nesting**') <
        block.text.indexOf(nestedConditionalsText),
    )
    assert.ok(
      block.text.indexOf(nestedConditionalsText) <
        block.text.indexOf(targetCommentsPrefix),
    )

    const [focusedBlock] =
      await definition.getPromptForCommand('Focus nested branches')
    assert.equal(
      focusedBlock.text,
      block.text + '\n\n## Additional Focus\n\nFocus nested branches',
    )
  },
)
