import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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
  [11338, [8627431, 8629161, 'd4d9e93b3c321e72e562bbc682c0047296107221b70ef4a25b92e92e81c39302', 'FunctionDeclaration', 'unresolved']],
  [11340, [8629197, 8629392, '8c1f2c60e0417203ce89d6cf34bd1b9f0f82fa422c24db60eb64dc7cd2e9affd', 'VariableDeclaration', 'unresolved']],
  [11978, [9104603, 9109384, '9079d54a7bd30a59c6f9c74309950ac512bae5caf17fb55efde5190dc871965c', 'VariableDeclaration', 'changed']],
])

const pairSkip = !selected
  ? `not applicable to ${semanticCase}`
  : !baselineBundlePath || !targetBundlePath
    ? 'CLAUDE_CODE_2_1_109_BUNDLE and CLAUDE_CODE_2_1_110_BUNDLE are required'
    : false
const sourceSkip = selected ? false : `not applicable to ${semanticCase}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

function count(contents, fragment) {
  return contents.split(fragment).length - 1
}

function lifecycleWindow(bundle) {
  const marker = '[LSP MANAGER] initializeLspServerManager() called'
  const markerIndex = bundle.indexOf(marker)
  assert.notEqual(markerIndex, -1, 'manager initialization marker')
  return bundle.slice(markerIndex - 1200, markerIndex + 2600)
}

function assertWaitStateMachine(contents, label) {
  assert.match(
    contents,
    /async function [\w$]+\(\)\{if\(([\w$]+)==="success"\|\|\1==="failed"\)return;if\(\1==="pending"&&([\w$]+)\)await \2\}/,
    `${label}: pending-only initialization wait`,
  )
}

test('target110 authenticates the LSP manager object rows', { skip: pairSkip }, () => {
  if (pairSkip) return
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
  )
  assert.equal(
    sha256(targetBytes),
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, hash, nodeType, classification]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
        region.target.nodeType,
      ],
      [start, end, hash, nodeType],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
  }
})

test('target110 property residue is a bundler refactor over an inherited lifecycle', { skip: pairSkip }, () => {
  if (pairSkip) return
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const baselineManager = lifecycleWindow(baseline)
  const targetManager = lifecycleWindow(target)

  assertWaitStateMachine(baselineManager, 'target109')
  assertWaitStateMachine(targetManager, 'target110')
  for (const fragment of [
    '[LSP MANAGER] Created manager instance, state=pending',
    '[LSP MANAGER] Starting async initialization (generation ',
    'LSP server manager initialized successfully',
    '[LSP MANAGER] reinitializeLspServerManager() called',
    '[LSP MANAGER] old instance shutdown during reinit failed: ',
    'LSP server manager shut down successfully',
    'Failed to shutdown LSP server manager: ',
  ]) {
    assert.equal(count(baselineManager, fragment), 1, `target109: ${fragment}`)
    assert.equal(count(targetManager, fragment), 1, `target110: ${fragment}`)
  }

  assert.equal(count(baseline, 'waitForInitialization'), 0)
  assert.equal(count(target, 'waitForInitialization'), 2)
  const managerObject = target.slice(...units.get(11338).slice(0, 2))
  assertFragments(
    managerObject,
    [
      'waitForInitialization:',
      'reinitialize:',
      'shutdown:',
    ],
    'target110 factory surface',
  )
  const exports = target.slice(...units.get(11340).slice(0, 2))
  assertFragments(
    exports,
    ['.waitForInitialization', '.reinitialize', '.shutdown'],
    'target110 exported aliases',
  )
  const lspTool = target.slice(...units.get(11978).slice(0, 2))
  assert.match(
    lspTool,
    /\.status==="pending"\)await [\w$]+\(\);let [\w$]+=[\w$]+\(\)/,
    'the LSP tool waits before reading the manager',
  )
})

test('source owns the wait state machine and reachable LSP call path', { skip: sourceSkip }, () => {
  if (sourceSkip) return
  const manager = source('services/lsp/manager.ts')
  assertFragments(
    manager,
    [
      "let initializationState: InitializationState = 'not-started'",
      'let initializationGeneration = 0',
      'let initializationPromise: Promise<void> | undefined',
      "initializationState === 'success' || initializationState === 'failed'",
      "initializationState === 'pending' && initializationPromise",
      'await initializationPromise',
      'initializationPromise = lspManagerInstance',
      'const currentGeneration = ++initializationGeneration',
      "if (initializationState === 'not-started')",
      'void lspManagerInstance.shutdown().catch',
      'initializeLspServerManager()',
      'initializationPromise = undefined',
      'initializationGeneration++',
    ],
    'LSP manager lifecycle',
  )

  const tool = source('tools/LSPTool/LSPTool.ts')
  assertFragments(
    tool,
    [
      'waitForInitialization,',
      'const status = getInitializationStatus()',
      "if (status.status === 'pending')",
      'await waitForInitialization()',
      'const manager = getLspServerManager()',
    ],
    'LSP tool reachability',
  )
  assert.ok(
    tool.indexOf('await waitForInitialization()') <
      tool.indexOf('const manager = getLspServerManager()'),
    'the tool waits before reading the singleton',
  )

  assertFragments(
    source('utils/plugins/refresh.ts'),
    [
      "import { reinitializeLspServerManager } from '../../services/lsp/manager.js'",
      'reinitializeLspServerManager()',
    ],
    'plugin refresh reachability',
  )
})
