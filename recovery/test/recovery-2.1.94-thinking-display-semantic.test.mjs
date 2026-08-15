import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.92, 2.1.94, and 2.1.116 bundles are required'
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
const unit = [
  16230,
  'unresolved',
  11697064,
  11715026,
  'FunctionDeclaration',
  '55dfe24b7e200696b962163cdb959b25c28c4c5064e4a5f2dcf32eefae589dc5',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
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

function section(contents, startMarker, endMarker) {
  const start = contents.indexOf(startMarker)
  assert.notEqual(start, -1, `missing section start: ${startMarker}`)
  const end = contents.indexOf(endMarker, start)
  assert.notEqual(end, -1, `missing section end: ${endMarker}`)
  return contents.slice(start, end)
}

async function compileThinkingBlock(claudeSource) {
  const ts = await loadTypeScript()
  const block = section(
    claudeSource,
    '    const hasThinking =',
    '    // Get API context management strategies if enabled',
  )
  const javascript = ts.transpileModule(
    `
      type ThinkingConfig =
        | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
        | { type: 'enabled'; budgetTokens: number; display?: 'summarized' | 'omitted' }
        | { type: 'disabled' }
      type BetaMessageStreamParams = { thinking: unknown }
      const REDACT_THINKING_BETA_HEADER = 'redact-thinking-2026-02-12'
      const isEnvTruthy = (value: string | undefined) =>
        value === '1' || value === 'true'
      const modelSupportsThinking = (model: string) => model !== 'unsupported'
      const modelSupportsAdaptiveThinking = (model: string) => model !== 'fixed'
      const getCanonicalName = (model: string) => model
      const getMaxThinkingTokensForModel = () => 4096
      function executeThinkingBlock(
        thinkingConfig: ThinkingConfig,
        model: string,
        maxOutputTokens: number,
        initialBetas: string[],
      ) {
        const options = { model }
        const betasParams = [...initialBetas]
${block}
        return { thinking, betasParams }
      }
      export { executeThinkingBlock }
    `,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports.executeThinkingBlock
}

test(
  'authenticated target94 pins visible-thinking payloads and removal of the conflicting redaction beta',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362',
    )
    assert.equal(
      sha256(targetBytes),
      '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    const [index, classification, start, end, nodeType, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, classification)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [start, end, nodeType, hash],
    )
    assert.equal(sha256(target.slice(start, end)), hash)

    const targetFunction = target.slice(start, end)
    assert.equal(occurrences(targetFunction, 'display'), 3)
    assert.equal(occurrences(baseline, 'type:"adaptive",display:'), 0)
    assert.equal(occurrences(target, 'type:"adaptive",display:'), 1)
    assert.equal(occurrences(latest, 'type:"adaptive",display:'), 1)
    assert.equal(occurrences(baseline, 'type:"enabled",display:'), 0)
    assert.equal(occurrences(target, 'type:"enabled",display:'), 1)
    assert.equal(occurrences(latest, 'type:"enabled",display:'), 1)
    assert.ok(targetFunction.includes('.indexOf('))
    assert.ok(targetFunction.includes('.splice('))
  },
)

test(
  'source root threads display into adaptive and budget thinking before context management',
  sourceOptions,
  () => {
    const claude = source('services/api/claude.ts')
    assert.ok(claude.includes('REDACT_THINKING_BETA_HEADER,'))
    assert.ok(
      claude.includes(
        'const thinkingDisplay = hasThinking ? thinkingConfig.display : undefined',
      ),
    )
    assert.equal(occurrences(claude, 'display: thinkingDisplay'), 2)
    assert.ok(claude.includes('if (thinking && thinkingDisplay)'))
    assert.ok(
      claude.includes(
        'const redactThinkingIndex = betasParams.indexOf(',
      ),
    )
    assert.ok(claude.includes('betasParams.splice(redactThinkingIndex, 1)'))
    assert.ok(
      claude.indexOf('betasParams.splice(redactThinkingIndex, 1)') <
        claude.indexOf('// Get API context management strategies if enabled'),
    )
  },
)

test(
  'executable authored block keeps display and redact-thinking mutually exclusive',
  sourceOptions,
  async () => {
    const execute = await compileThinkingBlock(source('services/api/claude.ts'))
    const redact = 'redact-thinking-2026-02-12'
    const adaptive = execute(
      { type: 'adaptive', display: 'summarized' },
      'adaptive',
      8192,
      [redact, 'other-beta'],
    )
    assert.deepEqual(adaptive.thinking, {
      type: 'adaptive',
      display: 'summarized',
    })
    assert.deepEqual(adaptive.betasParams, ['other-beta'])

    const fixed = execute(
      { type: 'enabled', budgetTokens: 3000, display: 'omitted' },
      'fixed',
      2048,
      [redact],
    )
    assert.deepEqual(fixed.thinking, {
      budget_tokens: 2047,
      type: 'enabled',
      display: 'omitted',
    })
    assert.deepEqual(fixed.betasParams, [])

    const defaultDisplay = execute(
      { type: 'adaptive' },
      'adaptive',
      8192,
      [redact],
    )
    assert.equal(defaultDisplay.thinking.display, undefined)
    assert.deepEqual(defaultDisplay.betasParams, [redact])

    const unsupported = execute(
      { type: 'adaptive', display: 'summarized' },
      'unsupported',
      8192,
      [redact],
    )
    assert.equal(unsupported.thinking, undefined)
    assert.deepEqual(unsupported.betasParams, [redact])
  },
)
