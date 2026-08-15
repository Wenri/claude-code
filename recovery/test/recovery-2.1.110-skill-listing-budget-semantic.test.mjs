import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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

const units = new Map([
  [8208, ['matched', 5658231, 5658288, '5878c54f504d6d68a54d12d8ecc736eb69e28dd7e277ddd563a8ff15ddd889e2']],
  [8209, ['matched', 5658288, 5658347, '620c91b4e048dafffee6efb8a9a55edbc95132c1f5780bcb55c34f4ada78b93b']],
  [8212, ['unresolved', 5658629, 5658692, 'c5e22b9b2a2d0dcf0f207a16e49e0de7eac8ab60ac8f40b4facd7bf9964d11b8']],
  [8213, ['unresolved', 5658692, 5659864, '1f43bad5b2860358e21c93284892b48e84a980d4522c6885f4d415244502eb0d']],
  [8217, ['changed', 5659941, 5660111, 'b0535d98309cd62b6c8ca2cd0a0e11a93b5822db2572624e490fa60fd8ef6af8']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(contents, name) {
  const start = contents.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`unterminated ${name}`)
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

test(
  'target110 pins the skill-listing budget analysis boundary to SkillTool',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [classification, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    for (const fragment of [
      'budgetTruncatedSkills',
      'rawTotalChars',
      'budgetFromEnv',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
      assert.equal(target.includes(fragment), true, `${fragment}: target`)
    }
    const helper = target.slice(5658692, 5659864)
    const minifiedName = helper.match(/^function ([\w$]+)\(/)?.[1]
    assert.ok(minifiedName)
    assert.equal(
      [...target.matchAll(new RegExp(`\\b${minifiedName}\\b`, 'g'))].length,
      1,
      'the target helper is retained but has no runtime caller',
    )
  },
)

test(
  'source owns the settings-backed budget graph and exact diagnostic fields',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const prompt = source('tools/SkillTool/prompt.ts')
    const settings = source('utils/settings/types.ts')
    for (const fragment of [
      'getInitialSettings().skillListingMaxDescChars',
      'getInitialSettings().skillListingBudgetFraction',
      'function isBundledSkill',
      'function getSkillListingBudgetStats',
      'cappedSkills',
      "budgetMode: 'fits'",
      "maxDescLen < MIN_DESC_LENGTH ? 'names-only' : 'truncate'",
      'rawTotalChars',
      'budgetFromEnv',
    ]) {
      assert.ok(prompt.includes(fragment), fragment)
    }
    for (const fragment of [
      'skillListingMaxDescChars: z',
      'Per-skill description character cap in the skill listing sent to Claude',
      'skillListingBudgetFraction: z',
      'Fraction of the context window (in characters) reserved for the skill listing',
    ]) {
      assert.ok(settings.includes(fragment), fragment)
    }
  },
)

test(
  'the recovered helper executes target fits, cap, and names-only accounting',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const prompt = source('tools/SkillTool/prompt.ts')
    const ts = await loadTypeScript()
    const declarations = [
      'getMaxListingDescriptionChars',
      'getSkillListingBudgetFraction',
      'getCharBudget',
      'getRawCommandDescription',
      'isBundledSkill',
      'getSkillListingBudgetStats',
    ]
      .map(name => functionSource(prompt, name))
      .join('\n')
    const javascript = ts.transpileModule(
      `type Command = any; type SkillListingBudgetStats = any;\n` +
        `const SKILL_BUDGET_CONTEXT_PERCENT = 0.01;\n` +
        `const CHARS_PER_TOKEN = 4; const DEFAULT_CHAR_BUDGET = 8000;\n` +
        `const MAX_LISTING_DESC_CHARS = 1536; const MIN_DESC_LENGTH = 20;\n` +
        `let settings: any = {}; const getInitialSettings = () => settings;\n` +
        `${declarations}\n` +
        `export { getSkillListingBudgetStats };`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    const inspect = module.exports.getSkillListingBudgetStats

    const previousBudget = process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
    try {
      delete process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
      assert.deepEqual(
        inspect([
          {
            name: 'long',
            description: 'x'.repeat(1600),
            type: 'prompt',
            source: 'plugin',
          },
        ]),
        {
          cappedSkills: ['long'],
          budgetMode: 'fits',
          maxDescLen: 1536,
          budgetTruncatedSkills: [],
          totalChars: 1544,
          rawTotalChars: 1608,
          budget: 8000,
          budgetFromEnv: false,
        },
      )

      process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET = '50'
      assert.deepEqual(
        inspect(
          [
            {
              name: 'bundled',
              description: 'b'.repeat(30),
              type: 'prompt',
              source: 'bundled',
            },
            {
              name: 'alpha',
              description: 'a'.repeat(40),
              type: 'prompt',
              source: 'plugin',
            },
            {
              name: 'hidden',
              description: 'h'.repeat(100),
              type: 'prompt',
              source: 'plugin',
            },
          ],
          undefined,
          new Set(['hidden']),
        ),
        {
          cappedSkills: [],
          budgetMode: 'names-only',
          maxDescLen: 0,
          budgetTruncatedSkills: ['alpha'],
          totalChars: 100,
          rawTotalChars: 100,
          budget: 50,
          budgetFromEnv: true,
        },
      )
    } finally {
      if (previousBudget === undefined) {
        delete process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
      } else {
        process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET = previousBudget
      }
    }
  },
)
