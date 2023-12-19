import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
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

const units = new Map([
  [7071, [5120048, 5120185, 'FunctionDeclaration', '4d61a13a7d519329cd004a1659e2394f009851cade9eb370529eb9ad6526fd19']],
  [7072, [5120185, 5120229, 'FunctionDeclaration', 'b9ba4e2addda2a8d8fa4177cc63ad544a286c2c41218e41dd98e71f60a57b3ef']],
  [7073, [5120229, 5120278, 'FunctionDeclaration', '03cd7f8221449ba8d75bee74bfbb5ab41ddaffe126a879faa8ed3ee46dce6366']],
  [7074, [5120278, 5120323, 'FunctionDeclaration', 'b64a1ef56e7104a0a4e8d594d8651b41072751e73159a72a481ed431f7a594ac']],
  [7076, [5120519, 5120565, 'FunctionDeclaration', '014efc9277bd6c990d7c24e7db7d51ad36c11eeea3d69f4f92f07178b7138b73']],
  [7077, [5120565, 5120601, 'FunctionDeclaration', '4824b62228dd034cfa664f6122db3f2fa78d61bb084c01d4953ccc580df92ec1']],
  [7078, [5120601, 5120645, 'FunctionDeclaration', 'b0254920e7915573378a1990b063e49a242c774ab4a58ad7652a6f5575fd2ef7']],
  [7079, [5120645, 5120682, 'FunctionDeclaration', 'b2eb28ad1d9b07cf08d0ff5f4a5463c0483889ab01199b90bc21b3424f51ffea']],
  [7080, [5120682, 5120715, 'FunctionDeclaration', '98b957522bba82708740dfbf6ca825185f7c2f329b512afb6c431e1c64cf40f5']],
  [7081, [5120715, 5120778, 'FunctionDeclaration', '69f21c9af37e44e7c0d4da7251681f698723db0bbe5b057575703a67b9432ba2']],
  [7082, [5120778, 5120867, 'FunctionDeclaration', '8c84f49d46554e5a0f6da0cffba845767b86c3a231998b76c000fec91eeb606a']],
  [7083, [5120867, 5120923, 'FunctionDeclaration', '2ea0980687425e817e82ba6f62a4e36357500118da0e83ce5c743cdd444db533']],
  [7085, [5120934, 5121075, 'VariableDeclaration', 'facfdc373b45dec102762af11729b61df6bd26800bbd3bd8fa15e2f1b81ad2c3']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
}

test('target108 pins every nonmatched SessionMemory state accessor and initializer', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, nodeType, expectedHash]] of units) {
    const region = structural.regions[index]
    assert.notEqual(region.classification, 'matched', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      [start, end, nodeType, expectedHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), expectedHash, `${index}: bytes`)
  }

  const targetState = target.slice(5120048, 5121075)
  for (const fragment of [
    'lastSummarizedMessageId:void 0',
    'extractionStartedAt:void 0',
    'tokensAtLastExtraction:0',
    'initialized:!1',
    'minimumMessageTokensToInit:1e4',
    'minimumTokensBetweenUpdate:5000',
    'toolCallsBetweenUpdates:3',
    'Date.now()',
  ]) {
    assert.ok(targetState.includes(fragment), fragment)
  }
})

test('source owns equivalent isolated state, config-copy, and threshold semantics', sourceOptions, () => {
  assertFragments('services/SessionMemory/sessionMemoryUtils.ts', [
    'minimumMessageTokensToInit: 10000',
    'minimumTokensBetweenUpdate: 5000',
    'toolCallsBetweenUpdates: 3',
    'let lastSummarizedMessageId: string | undefined',
    'let extractionStartedAt: number | undefined',
    'let tokensAtLastExtraction = 0',
    'let sessionMemoryInitialized = false',
    'lastSummarizedMessageId = messageId',
    'extractionStartedAt = Date.now()',
    'extractionStartedAt = undefined',
    'sessionMemoryConfig = {',
    '...sessionMemoryConfig,',
    'return { ...sessionMemoryConfig }',
    'tokensAtLastExtraction = currentTokenCount',
    'return sessionMemoryInitialized',
    'sessionMemoryInitialized = true',
    'currentTokenCount >= sessionMemoryConfig.minimumMessageTokensToInit',
    'currentTokenCount - tokensAtLastExtraction',
    'sessionMemoryConfig.minimumTokensBetweenUpdate',
    'return sessionMemoryConfig.toolCallsBetweenUpdates',
  ])
})

test('source retains extraction wait safety and a complete deterministic reset', sourceOptions, () => {
  assertFragments('services/SessionMemory/sessionMemoryUtils.ts', [
    'EXTRACTION_WAIT_TIMEOUT_MS = 15000',
    'EXTRACTION_STALE_THRESHOLD_MS = 60000',
    'while (extractionStartedAt)',
    'await sleep(1000)',
    'sessionMemoryConfig = { ...DEFAULT_SESSION_MEMORY_CONFIG }',
    'tokensAtLastExtraction = 0',
    'sessionMemoryInitialized = false',
    'lastSummarizedMessageId = undefined',
    'extractionStartedAt = undefined',
  ])
})
