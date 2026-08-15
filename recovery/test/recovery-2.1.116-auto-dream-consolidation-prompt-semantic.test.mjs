import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnit = {
  index: 13_514,
  nodeType: 'FunctionDeclaration',
  start: 8_597_227,
  end: 8_600_071,
  sourceHash:
    'd92c6d47c95f6a8f0ccc287b152aac4effb0a3a3451b557a33a73423c94afa31',
}
const targetUnit = {
  index: 13_653,
  nodeType: 'FunctionDeclaration',
  start: 8_646_459,
  end: 8_649_442,
  sourceHash:
    '80f5ea192d52bc85fc55fd5f0b8f99848e29c85d60c9a5efcb2e46309e51d72f',
}
const baselineTemplateToken = {
  start: 8_597_740,
  end: 8_598_492,
  sourceHash:
    'c4e6eaea9de33b123b732447f7dcf39c00c2e8099c5d0845740508f350778945',
}
const targetTemplateToken = {
  start: 8_646_972,
  end: 8_647_862,
  sourceHash:
    '0e8089aa61ab9abdf051c2be2e478a3653807fc6ef52c650ca8c4e0dfceb1c95',
}

const orientLine =
  '- `ls logs/` — recent daily activity logs (one file per day). If a `sessions/` subdirectory also exists, review recent entries there too'
const dailyLogsLine =
  '1. **Daily logs** (`logs/YYYY/MM/YYYY-MM-DD.md`) — the append-only activity stream. Read the most recent 1–3 days; each line is prefix-coded (`>` user, `<` assistant, `.` tool call)'
const oldOrientLine =
  '- If `logs/` or `sessions/` subdirectories exist (assistant-mode layout), review recent entries there'
const oldDailyLogsLine =
  '1. **Daily logs** (`logs/YYYY/MM/YYYY-MM-DD.md`) if present — these are the append-only stream'

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
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function occurrences(text, fragment) {
  return text.split(fragment).length - 1
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

async function instantiatePromptBuilder() {
  const ts = await loadTypeScript()
  const owner = source('src/services/autoDream/consolidationPrompt.ts')
  const sourceFile = ts.createSourceFile(
    'consolidationPrompt.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const teamGuidance = sourceFile.statements.find(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => declaration.name.getText(sourceFile) ===
          'TEAM_MEMORY_DREAM_GUIDANCE',
      ),
  )
  const promptBuilder = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'buildConsolidationPrompt',
  )
  assert.ok(teamGuidance, 'TEAM_MEMORY_DREAM_GUIDANCE declaration')
  assert.ok(promptBuilder, 'buildConsolidationPrompt declaration')

  const harness = `
    const DIR_EXISTS_GUIDANCE = 'The memory directory already exists.'
    const ENTRYPOINT_NAME = 'MEMORY.md'
    const MAX_ENTRYPOINT_LINES = 200
    ${teamGuidance.getText(sourceFile)}
    ${promptBuilder.getText(sourceFile)}
  `
  const result = ts.transpileModule(harness, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'consolidationPrompt.ts',
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'isolated prompt owner must transpile')
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports
}

test(
  'target116 authenticates the complete auto-dream prompt replacement',
  pairOptions,
  () => {
    if (!selected || !baselineBundlePath || !targetBundlePath) return
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    assert.equal(
      sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
      baselineUnit.sourceHash,
    )
    assert.equal(
      sha256(target.slice(targetUnit.start, targetUnit.end)),
      targetUnit.sourceHash,
    )
    assert.equal(
      sha256(
        baseline.slice(
          baselineTemplateToken.start,
          baselineTemplateToken.end,
        ),
      ),
      baselineTemplateToken.sourceHash,
    )
    assert.equal(
      sha256(
        target.slice(targetTemplateToken.start, targetTemplateToken.end),
      ),
      targetTemplateToken.sourceHash,
    )

    const targetRow = structural.regions[targetUnit.index]
    assert.equal(targetRow.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRow.target.index,
        targetRow.target.nodeType,
        targetRow.target.start,
        targetRow.target.end,
        targetRow.target.sourceHash,
      ],
      [
        targetUnit.index,
        targetUnit.nodeType,
        targetUnit.start,
        targetUnit.end,
        targetUnit.sourceHash,
      ],
    )
    const baselineRow = structural.unmatchedBaseline.find(
      row => row.index === baselineUnit.index,
    )
    assert.ok(baselineRow, `baseline u${baselineUnit.index} must be unmatched`)
    assert.deepEqual(
      [
        baselineRow.nodeType,
        baselineRow.start,
        baselineRow.end,
        baselineRow.sourceHash,
      ],
      [
        baselineUnit.nodeType,
        baselineUnit.start,
        baselineUnit.end,
        baselineUnit.sourceHash,
      ],
    )

    const baselineOwner = baseline.slice(baselineUnit.start, baselineUnit.end)
    const targetOwner = target.slice(targetUnit.start, targetUnit.end)
    assert.match(baselineOwner, /assistant-mode layout/)
    assert.match(baselineOwner, /these are the append-only stream/)
    assert.doesNotMatch(baselineOwner, /recent daily activity logs/)
    assert.doesNotMatch(baselineOwner, /prefix-coded/)
    assert.match(targetOwner, /recent daily activity logs/)
    assert.match(targetOwner, /append-only activity stream/)
    assert.match(targetOwner, /most recent 1\\u20133 days/)
    assert.match(targetOwner, /prefix-coded/)
    assert.doesNotMatch(targetOwner, /assistant-mode layout/)
    assert.doesNotMatch(targetOwner, /these are the append-only stream/)
  },
)

test(
  'source retains the exact target guidance and later team-memory integration',
  sourceOptions,
  () => {
    if (!selected) return
    const owner = source('src/services/autoDream/consolidationPrompt.ts')
    const authoredPromptText = owner.replaceAll('\\`', '`')
    assert.equal(occurrences(authoredPromptText, orientLine), 1)
    assert.equal(occurrences(authoredPromptText, dailyLogsLine), 1)
    assert.equal(occurrences(authoredPromptText, oldOrientLine), 0)
    assert.equal(occurrences(authoredPromptText, oldDailyLogsLine), 0)
    assert.match(owner, /export const TEAM_MEMORY_DREAM_GUIDANCE =/)
    assert.match(owner, /teamMemoryEnabled = false/)
    assert.match(
      owner,
      /teamMemoryEnabled \? `\\n\$\{TEAM_MEMORY_DREAM_GUIDANCE\}\\n` : ''/,
    )
  },
)

test(
  'the authored prompt executes target guidance in private and team modes',
  sourceOptions,
  async () => {
    if (!selected) return
    const { buildConsolidationPrompt, TEAM_MEMORY_DREAM_GUIDANCE } =
      await instantiatePromptBuilder()

    const privatePrompt = buildConsolidationPrompt(
      '/memory',
      '/transcripts',
      '',
      false,
    )
    assert.equal(occurrences(privatePrompt, orientLine), 1)
    assert.equal(occurrences(privatePrompt, dailyLogsLine), 1)
    assert.equal(occurrences(privatePrompt, oldOrientLine), 0)
    assert.equal(occurrences(privatePrompt, oldDailyLogsLine), 0)
    assert.doesNotMatch(privatePrompt, /## Team memory/)

    const teamPrompt = buildConsolidationPrompt(
      '/memory',
      '/transcripts',
      'Keep durable facts only.',
      true,
    )
    assert.equal(occurrences(teamPrompt, orientLine), 1)
    assert.equal(occurrences(teamPrompt, dailyLogsLine), 1)
    assert.ok(teamPrompt.includes(TEAM_MEMORY_DREAM_GUIDANCE))
    assert.match(teamPrompt, /## Additional context\n\nKeep durable facts only\.$/)
  },
)
