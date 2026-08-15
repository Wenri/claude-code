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
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
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
const baselineUnit = [
  11856,
  7550346,
  7551005,
  'ff638a1d6c048b9d5d0fac9d814bed28940e0a2f12a80952b92adf060e7faecf',
]
const targetUnit = [
  11964,
  7590760,
  7591438,
  'd8b44edfc18927d9413f17a50b10dd6c1a318412e27d8efe0f575c52f6567aba',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function extractFunction(contents, marker) {
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, marker)
  const parametersStart = contents.indexOf('(', start)
  let parameterDepth = 0
  let parametersEnd = -1
  for (let index = parametersStart; index < contents.length; index += 1) {
    if (contents[index] === '(') parameterDepth += 1
    if (contents[index] === ')') {
      parameterDepth -= 1
      if (parameterDepth === 0) {
        parametersEnd = index
        break
      }
    }
  }
  const bodyStart = contents.indexOf('{', parametersEnd)
  let bodyDepth = 0
  for (let index = bodyStart; index < contents.length; index += 1) {
    if (contents[index] === '{') bodyDepth += 1
    if (contents[index] === '}') {
      bodyDepth -= 1
      if (bodyDepth === 0) return contents.slice(start, index + 1)
    }
  }
  assert.fail(`unterminated function: ${marker}`)
}

async function compileCommonJs(contents) {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js'),
    path.join(repositoryRoot, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate)
  const module = await import(pathToFileURL(candidate).href)
  const ts = module.default ?? module
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

test('authenticated target116 adds the checked cwd to git-repository failures', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(targetBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  const oldUnit = structural.unmatchedBaseline.find(
    unit => unit.index === baselineUnit[0],
  )
  assert.deepEqual(
    [oldUnit.start, oldUnit.end, oldUnit.sourceHash],
    baselineUnit.slice(1),
  )
  assert.equal(
    sha256(baselineBytes.subarray(baselineUnit[1], baselineUnit[2])),
    baselineUnit[3],
  )
  const region = structural.regions[targetUnit[0]]
  assert.notEqual(region.classification, 'matched')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    targetUnit.slice(1),
  )
  assert.equal(
    sha256(targetBytes.subarray(targetUnit[1], targetUnit[2])),
    targetUnit[3],
  )
  assert.equal(
    baseline.split('Background tasks require a git repository (checked: ').length - 1,
    0,
  )
  assert.equal(
    target.slice(7590921, 7590973),
    'Background tasks require a git repository (checked: ',
  )
  assert.equal(
    target.slice(7590980, 7591027),
    '). Initialize git or run from a git repository.',
  )
})

test('source owns the target interpolation and no stale generic error', sourceOptions, () => {
  const owner = source('tasks/RemoteAgentTask/RemoteAgentTask.tsx')
  assert.ok(owner.includes("import { getCwd } from '../../utils/cwd.js';"))
  assert.ok(
    owner.includes(
      'return `Background tasks require a git repository (checked: ${getCwd()}). Initialize git or run from a git repository.`;',
    ),
  )
  assert.equal(
    owner.includes(
      "return 'Background tasks require a git repository. Initialize git or run from a git repository.';",
    ),
    false,
  )
})

test('actual formatter reports the cwd and preserves adjacent failures', sourceOptions, async () => {
  const formatter = extractFunction(
    source('tasks/RemoteAgentTask/RemoteAgentTask.tsx'),
    'export function formatPreconditionError',
  )
  const javascript = await compileCommonJs(`
    type BackgroundRemoteSessionPrecondition =
      | { type: 'not_logged_in' }
      | { type: 'no_remote_environment' }
      | { type: 'not_in_git_repo' }
      | { type: 'no_git_remote' }
      | { type: 'github_app_not_installed' }
      | { type: 'policy_blocked' }
    const getCwd = () => '/work/repo with spaces'
    ${formatter}
  `)
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  const format = module.exports.formatPreconditionError
  assert.equal(
    format({ type: 'not_in_git_repo' }),
    'Background tasks require a git repository (checked: /work/repo with spaces). Initialize git or run from a git repository.',
  )
  assert.equal(
    format({ type: 'no_git_remote' }),
    'Background tasks require a GitHub remote. Add one with `git remote add origin REPO_URL`.',
  )
  assert.equal(
    format({ type: 'policy_blocked' }),
    "Remote sessions are disabled by your organization's policy. Contact your organization admin to enable them.",
  )
})
