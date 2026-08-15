import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
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
  [6800, ['VariableDeclaration', 'unresolved', 4978327, 4978442, '14c1e69be22c615d411723bea527a1b7c53423c5495c6d2be96174145f720f8b']],
  [13383, ['FunctionDeclaration', 'changed', 10053035, 10053223, 'f6061567234dedff9d3714c9e4efc768572e44023da979f8c05ea8378ca07465']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
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

async function compileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

function extractFunction(contents) {
  const start = contents.indexOf(
    'export function getRequestTooLargeErrorMessage()',
  )
  assert.notEqual(start, -1)
  const end = contents.indexOf(
    '\nexport const OAUTH_ORG_NOT_ALLOWED_ERROR_MESSAGE',
    start,
  )
  assert.notEqual(end, -1)
  return contents.slice(start, end)
}

async function executeLimit(constantsSource, errorsSource, nonInteractive) {
  const constantsJavaScript = await compileCommonJs(constantsSource)
  const constantsModule = { exports: {} }
  new Function('require', 'exports', 'module', constantsJavaScript)(
    () => ({}),
    constantsModule.exports,
    constantsModule,
  )
  const helperJavaScript = await compileCommonJs(`
    const API_MAX_REQUEST_SIZE = ${constantsModule.exports.API_MAX_REQUEST_SIZE}
    const getIsNonInteractiveSession = () => ${nonInteractive}
    const formatFileSize = value => {
      const megabytes = value / 1024 / 1024
      return \`${'${megabytes}'}MB\`
    }
    ${extractFunction(errorsSource)}
  `)
  const helperModule = { exports: {} }
  new Function('require', 'exports', 'module', helperJavaScript)(
    () => ({}),
    helperModule.exports,
    helperModule,
  )
  return {
    apiLimit: constantsModule.exports.API_MAX_REQUEST_SIZE,
    message: helperModule.exports.getRequestTooLargeErrorMessage(),
    pdfLimit: constantsModule.exports.PDF_TARGET_RAW_SIZE,
  }
}

test(
  'authenticated target105 splits the 32 MiB request limit from the 20 MiB PDF target',
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
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    for (const [index, [nodeType, classification, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.equal(region.target.index, index, `${index}: target index`)
      assert.equal(region.target.nodeType, nodeType, `${index}: node type`)
      assert.equal(region.target.parseStatus, 'parsed', `${index}: parse`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    const constants = target.slice(4978327, 4978442)
    assert.ok(constants.includes('HZ4=33554432,me6=20971520'))
    const formatter = target.slice(10053035, 10053223)
    assert.ok(formatter.includes('l4(HZ4)'))
    assert.equal(formatter.includes('l4(me6)'), false)

    assert.ok(baseline.includes('nE6=20971520'))
    assert.ok(baseline.includes('max ${U4(nE6)}'))
    assert.equal(
      baseline.includes('nE6=33554432'),
      false,
      '104 keeps the inherited 20 MiB formatter boundary',
    )
    assert.ok(latest.includes('X5K=33554432,UtH=20971520'))
    assert.ok(latest.includes('max ${sK(X5K)}'))
  },
)

test(
  'source root owns separate request and PDF limits without disturbing other error work',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const constants = source('constants/apiLimits.ts')
    const errors = source('services/api/errors.ts')
    assert.ok(
      constants.includes(
        'export const API_MAX_REQUEST_SIZE = 32 * 1024 * 1024',
      ),
    )
    assert.ok(
      constants.includes('export const PDF_TARGET_RAW_SIZE = 20 * 1024 * 1024'),
    )
    assert.ok(errors.includes('API_MAX_REQUEST_SIZE,'))
    const helper = extractFunction(errors)
    assert.ok(helper.includes('formatFileSize(API_MAX_REQUEST_SIZE)'))
    assert.equal(helper.includes('formatFileSize(PDF_TARGET_RAW_SIZE)'), false)
  },
)

test(
  'executable helper reports 32MB in interactive and non-interactive modes',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const constants = source('constants/apiLimits.ts')
    const errors = source('services/api/errors.ts')
    const interactive = await executeLimit(constants, errors, false)
    const nonInteractive = await executeLimit(constants, errors, true)
    assert.equal(interactive.apiLimit, 32 * 1024 * 1024)
    assert.equal(interactive.pdfLimit, 20 * 1024 * 1024)
    assert.equal(nonInteractive.apiLimit, 32 * 1024 * 1024)
    assert.equal(nonInteractive.pdfLimit, 20 * 1024 * 1024)
    assert.equal(
      interactive.message,
      'Request too large (max 32MB). Double press esc to go back and try with a smaller file.',
    )
    assert.equal(
      nonInteractive.message,
      'Request too large (max 32MB). Try with a smaller file.',
    )
  },
)
