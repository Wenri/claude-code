import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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
  [5022, ['unresolved', 3714960, 3715901, 'ExpressionStatement', '08b63a1f5ce2f9ac725f5fee1c4a95aba5ea5be83d748cc3f5f3caea24c5553d']],
  [5032, ['unresolved', 3717344, 3717535, 'FunctionDeclaration', 'eb951785d3d4c07e127c772502ad882e33ca852e73b7e6f6b74600a2b41a422b']],
  [5055, ['unresolved', 3724700, 3724846, 'FunctionDeclaration', 'f55b18749f42bf8769b38b005a8469d5e4c1c442a056de99ffc38c0bc8855c6f']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function ownerSource() {
  return fs.readFileSync(path.join(sourceRoot, 'utils/config.ts'), 'utf8')
}

function functionSource(contents, name) {
  const marker = `export function ${name}`
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
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

async function compileOwners(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `
      type AutoUpdaterDisabledReason =
        | { type: 'development' }
        | { type: 'env'; envVar: string }
        | { type: 'config' }
      const DEFAULT_PROJECT_CONFIG = { hasTrustDialogAccepted: false, marker: 'default' }
      const resolve = (value: string) => '/resolved/' + value.replace(/^\\/+/, '')
      const normalizePathForConfigKey = (value: string) => value.toLowerCase()
      let current: any = { untouched: true, projects: {} }
      const saveGlobalConfig = (updater: (value: any) => any) => {
        current = updater(current)
      }
      ${functionSource(contents, 'setPathTrusted')}
      ${functionSource(contents, 'formatAutoUpdaterDisabledReason')}
      export const getCurrent = () => current
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
  return module.exports
}

test(
  'authenticated target105 pins setPathTrusted and updater reason wording',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(sha256(baselineBytes), 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39')
    assert.equal(sha256(targetBytes), '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75')
    assert.equal(sha256(latestBytes), 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a')
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    assert.equal(occurrences(baseline, 'setPathTrusted'), 0)
    assert.equal(occurrences(target, 'setPathTrusted'), 1)
    assert.equal(occurrences(latest, 'setPathTrusted'), 1)
    assert.equal(occurrences(baseline, 'set by env: '), 0)
    assert.equal(occurrences(target, 'set by env: '), 1)
    assert.equal(occurrences(latest, 'set by env: '), 1)
    assert.ok(target.slice(3717344, 3717535).includes('hasTrustDialogAccepted:!0'))
    assert.ok(target.slice(3724700, 3724846).includes('set by env: '))
  },
)

test(
  'authored config owner persists normalized trust idempotently and formats reasons',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const source = ownerSource()
    assert.ok(source.includes('export function setPathTrusted(dir: string): void'))
    assert.ok(source.includes('...(config.projects?.[normalizedPath] ?? DEFAULT_PROJECT_CONFIG)'))
    assert.ok(source.includes('return `set by env: ${reason.envVar}`'))
    const runtime = await compileOwners(source)
    runtime.setPathTrusted('Repo')
    const once = runtime.getCurrent()
    assert.deepEqual(once.projects['/resolved/repo'], {
      hasTrustDialogAccepted: true,
      marker: 'default',
    })
    runtime.setPathTrusted('Repo')
    assert.strictEqual(runtime.getCurrent(), once)
    assert.equal(runtime.formatAutoUpdaterDisabledReason({ type: 'development' }), 'development build')
    assert.equal(runtime.formatAutoUpdaterDisabledReason({ type: 'env', envVar: 'DISABLE_AUTOUPDATER' }), 'set by env: DISABLE_AUTOUPDATER')
    assert.equal(runtime.formatAutoUpdaterDisabledReason({ type: 'config' }), 'config')
  },
)
