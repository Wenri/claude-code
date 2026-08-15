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
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
      : false,
}

const baselineUnit = {
  index: 11860,
  nodeType: 'FunctionDeclaration',
  start: 9025607,
  end: 9026662,
  sourceHash: '1c5ff18d11ffcc6d290a24afbb1b0530b4ca973043412e07838b36e546cad9a0',
}
const targetUnit = {
  index: 11154,
  nodeType: 'FunctionDeclaration',
  start: 8711518,
  end: 8712668,
  sourceHash: 'bc28907ebb369c47b83688df5e40b33d368865262647ecedb64f50a0a37dcba7',
}
const typedRow = {
  index: 240,
  value: 'readStoredTrustedDeviceToken',
  start: 8711672,
  end: 8711700,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js'),
    path.join(repositoryRoot, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function extractFunction(relative, name) {
  const ts = await loadTypeScript()
  const owner = source(relative)
  const parsed = ts.createSourceFile(relative, owner, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declaration = parsed.statements.find(
    statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.ok(declaration, `${name} declaration`)
  return declaration.getText(parsed).replace(/^export\s+/, '')
}

async function compileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

test('authenticated target105 adds trusted-device teleport event authorization', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  const latestBytes = fs.readFileSync(latestPath)
  assert.equal(sha256(baselineBytes), 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39')
  assert.equal(sha256(targetBytes), '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75')
  assert.equal(sha256(latestBytes), 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a')
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  const latest = latestBytes.toString('utf8')
  const region = structural.regions[targetUnit.index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.index, region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
    [targetUnit.index, targetUnit.nodeType, targetUnit.start, targetUnit.end, targetUnit.sourceHash],
  )
  assert.equal(sha256(target.slice(targetUnit.start, targetUnit.end)), targetUnit.sourceHash)
  const unmatched = structural.unmatchedBaseline.find(unit => unit.index === baselineUnit.index)
  assert.deepEqual(
    [unmatched.nodeType, unmatched.start, unmatched.end, unmatched.sourceHash],
    [baselineUnit.nodeType, baselineUnit.start, baselineUnit.end, baselineUnit.sourceHash],
  )
  assert.equal(sha256(baseline.slice(baselineUnit.start, baselineUnit.end)), baselineUnit.sourceHash)
  assert.equal(target.slice(typedRow.start, typedRow.end), typedRow.value)
  assert.ok(!baseline.slice(baselineUnit.start, baselineUnit.end).includes('readStoredTrustedDeviceToken'))
  const targetFunction = target.slice(targetUnit.start, targetUnit.end)
  assert.ok(targetFunction.includes('readStoredTrustedDeviceToken'))
  assert.match(targetFunction, /await Promise\.resolve\(\)\.then/)
  assert.match(targetFunction, /await [^(]+\(q,_,K,w\)/)
  assert.ok(latest.includes('readStoredTrustedDeviceToken'))
})

test('authored teleport source gates a lazy token read and passes the fourth API argument', sourceOptions, () => {
  const owner = source('utils/teleport.tsx')
  assert.match(owner, /import \{ isTrustedDeviceGateEnabled \} from '\.\.\/bridge\/trustedDevice\.js'/)
  assert.match(owner, /if \(isTrustedDeviceGateEnabled\(\)\) \{[\s\S]*await import\('\.\.\/bridge\/trustedDevice\.js'\)/)
  assert.match(owner, /getTeleportEvents\(sessionId, accessToken, orgUUID, trustedDeviceToken\)/)
})

test('teleport reads and forwards the token only while the gate is enabled', sourceOptions, async () => {
  const teleport = await extractFunction('utils/teleport.tsx', 'teleportFromSessionsAPI')
  const javascript = await compileCommonJs(`
    type TeleportProgressCallback = any
    type SessionResource = any
    type TeleportRemoteResponse = any
    type Message = any
    type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
    let gateEnabled = false
    const calls: any[] = []
    const isTrustedDeviceGateEnabled = () => gateEnabled
    const getTeleportEvents = async (...args: any[]) => {
      calls.push(args)
      return [
        { type: 'user', isSidechain: false, transcript: true },
        { type: 'user', isSidechain: true, transcript: true },
      ]
    }
    const getSessionLogsViaOAuth = async () => null
    const isTranscriptMessage = (entry: any) => entry.transcript === true
    const getBranchFromSession = (session: any) => session.branch
    const logForDebugging = () => {}
    const logEvent = () => {}
    const logError = () => {}
    const toError = (error: unknown) => error as Error
    class TeleportOperationError extends Error {}
    const axios = { isAxiosError: () => false }
    const chalk = { dim: (value: string) => value }
    ${teleport}
    module.exports = {
      teleportFromSessionsAPI,
      calls,
      setGate(value: boolean) { gateEnabled = value },
    }
  `)
  const module = { exports: {} }
  let tokenReads = 0
  new Function('require', 'module', 'exports', javascript)(
    id => {
      if (id === '../bridge/trustedDevice.js') {
        return { readStoredTrustedDeviceToken: () => (++tokenReads, 'device-token') }
      }
      throw new Error(`unexpected dynamic import: ${id}`)
    },
    module,
    module.exports,
  )
  let result = await module.exports.teleportFromSessionsAPI(
    'session-1', 'org-1', 'access-1', undefined, { branch: 'main' },
  )
  assert.equal(tokenReads, 0)
  assert.deepEqual(module.exports.calls[0], ['session-1', 'access-1', 'org-1', undefined])
  assert.equal(result.log.length, 1)
  assert.equal(result.branch, 'main')

  module.exports.setGate(true)
  result = await module.exports.teleportFromSessionsAPI(
    'session-2', 'org-2', 'access-2', undefined, undefined,
  )
  assert.equal(tokenReads, 1)
  assert.deepEqual(module.exports.calls[1], ['session-2', 'access-2', 'org-2', 'device-token'])
  assert.equal(result.log.length, 1)
})
