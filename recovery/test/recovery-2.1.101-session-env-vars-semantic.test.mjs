import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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
  [9058, [7073608, 7075024, 'b423a7b6013778de0625587c42e523c8422e2049a02fb87752c0ea69c92de623', 'FunctionDeclaration']],
  [9146, [7096689, 7099294, 'a5acc0b9854a6f443dacd6dae834aec11e1612e401e210ade845da3a0e35e91a', 'FunctionDeclaration']],
  [9390, [7222972, 7225993, '7eeb31f6d49738f104a377a36e9aad4f968493828c8243a1e4be0cd9b9c5843d', 'FunctionDeclaration']],
  [9392, [7226236, 7233834, '57f311be824838df2f15ba08206ee3b224086c6eab43e4e4bd7352904eb43b40', 'VariableDeclaration']],
  [10005, [7456765, 7459350, '2d50fdc1d268f32f4ac24024a2151b4b99b12d25ebab2fcf29ad7b2b38685e3c', 'FunctionDeclaration']],
  [10007, [7459436, 7470552, 'aefddd6d791cf59ba514709cb0c6935990dfd31173d242f0a88d617a19037dfe', 'VariableDeclaration']],
  [12393, [9517228, 9518762, 'f2443480ee93f2e02738c7d302bbd227c86fb249a8e0b3a30b52efea6f7d8bf5', 'FunctionDeclaration']],
  [12611, [9684288, 9686387, 'a2b1ee5f3c913983074edf6558ced265a2a932aae3966f315f03353aaf6436c3', 'FunctionDeclaration']],
  [13666, [10171208, 10172811, '54dd8e85d21c647c35e8c4ccb41f0851ec8ff0c3da2b4e164b22e2d80cf8d487', 'FunctionDeclaration']],
  [17321, [12285434, 12285746, '4d7f19f701037fad778c8305860fac70992667f8e9a9cb6d585bbee15af691a3', 'FunctionDeclaration']],
  [17385, [12300732, 12312774, 'b2d720c0abacd030b77b96dffaa5e03f4f07495fc11562702ad2362d3aa9e85e', 'FunctionDeclaration']],
  [17611, [12386977, 12412311, '02219ecd50d15c747223291722b3b27f92115df076f241a66e1719d26dfd9ada', 'FunctionDeclaration']],
  [17858, [12510068, 12513905, '9a2c9794fb895f9072f8d6a29a751348289cc4c5d0dc106f93d3bd4ab0b79e13', 'FunctionDeclaration']],
  [18222, [12660551, 12718728, '74b589580c0b21c4bb029a90a90e1767aea485121eee0a52d5b87ff4fa074cdd', 'FunctionDeclaration']],
  [18735, [13309789, 13325670, '4ef669540a89176d101bf83c127b4d4b2532478088c62e9ef013491824be6301', 'ClassDeclaration']],
  [18736, [13325670, 13326934, 'ea2aabf52284140b7ab5e9fc69250a3a9845eceb67b532c1e846d78f7c4109ee', 'FunctionDeclaration']],
  [18768, [13337686, 13370073, 'eb9ce1904c883b5e01e624ff995e38bc8d28aac9acb24bc6048cacc0f9073cb1', 'FunctionDeclaration']],
])

const pairSkip = !selected
  ? `not applicable to ${semanticCase}`
  : !baselineBundlePath || !targetBundlePath
    ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
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

test('target101 authenticates every per-session environment structural row', { skip: pairSkip }, () => {
  if (pairSkip) return
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(baseline.includes('sessionEnvVars'), false)
  assert.equal(target.split('sessionEnvVars').length - 1, 35)
  assert.equal(baseline.includes('ulimit -Sd '), false)
  assert.equal(target.split('ulimit -Sd ').length - 1, 1)
  assert.equal(
    target.split('4194304').length - baseline.split('4194304').length,
    1,
    'target101 introduces the 4 GiB remote soft-data limit constant',
  )

  for (const [index, [start, end, hash, nodeType]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
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
    const fragment = target.slice(start, end)
    assert.equal(sha256(fragment), hash, `${index}: bytes`)
    if (index === 9058) {
      assertFragments(
        fragment,
        ['ulimit -Sd ', '2>/dev/null || true'],
        `${index}: remote limit`,
      )
    } else {
      assert.ok(fragment.includes('sessionEnvVars'), `${index}: session map`)
    }
  }
})

test('source owns the complete isolated environment propagation graph', { skip: sourceSkip }, () => {
  if (sourceSkip) return
  assertFragments(
    source('utils/Shell.ts'),
    [
      'sessionEnvVars?: Map<string, string>',
      'provider.getEnvironmentOverrides(',
      'sessionEnvVars,',
    ],
    'Shell.exec',
  )
  assertFragments(
    source('utils/shell/shellProvider.ts'),
    ['getEnvironmentOverrides(', 'sessionEnvVars?: Map<string, string>'],
    'provider contract',
  )
  for (const relative of [
    'utils/shell/bashProvider.ts',
    'utils/shell/powershellProvider.ts',
  ]) {
    const contents = source(relative)
    assertFragments(
      contents,
      [
        'sessionEnvVars?: Map<string, string>',
        'for (const [key, value] of sessionEnvVars)',
      ],
      relative,
    )
    assert.equal(contents.includes('getSessionEnvVars'), false, relative)
  }
  assertFragments(
    source('utils/shell/bashProvider.ts'),
    ['CLAUDE_CODE_EXECPATH: process.execPath'],
    'executable propagation',
  )

  for (const relative of [
    'tools/BashTool/BashTool.tsx',
    'tools/PowerShellTool/PowerShellTool.tsx',
  ]) {
    assertFragments(
      source(relative),
      [
        'sessionEnvVars: toolUseContext.sessionEnvVars',
        'sessionEnvVars?: Map<string, string>',
      ],
      relative,
    )
    assert.match(
      source(relative),
      /shouldAutoBackground,\s*sessionEnvVars/,
      `${relative}: forwards the map to Shell.exec`,
    )
  }
  const monitorOwner = path.join(
    sourceRoot,
    'tools/MonitorTool/MonitorTool.ts',
  )
  if (fs.existsSync(monitorOwner)) {
    assertFragments(
      fs.readFileSync(monitorOwner, 'utf8'),
      [historical
        ? 'sessionEnvVars: toolUseContext.sessionEnvVars'
        : 'sessionEnvVars: context.sessionEnvVars'],
      'monitor execution',
    )
  } else {
    assert.equal(
      historical,
      true,
      'only the isolated target101 tree may rely on the transitive MonitorTool owner',
    )
  }
  assertFragments(
    source('utils/forkedAgent.ts'),
    ['sessionEnvVars: parentContext.sessionEnvVars'],
    'forked context',
  )
  assertFragments(
    source('commands/clear/conversation.ts'),
    ['sessionEnvVars?: Map<string, string>', 'sessionEnvVars?.clear()'],
    'conversation clearing',
  )
  assert.equal(source('commands/clear/caches.ts').includes('clearSessionEnvVars'), false)

  assertFragments(
    source('utils/bash/shellCompletion.ts'),
    ['sessionEnvVars?: Map<string, string>', 'sessionEnvVars,'],
    'shell completion',
  )
  assertFragments(
    source('hooks/useTypeahead.tsx'),
    ['sessionEnvVars?: Map<string, string>', 'generateBashSuggestions(input, cursorOffset, sessionEnvVars)'],
    'typeahead',
  )
  assertFragments(
    source('components/PromptInput/PromptInput.tsx'),
    ['sessionEnvVars?: Map<string, string>', 'sessionEnvVars\n  });'],
    'prompt input',
  )
  const ultraplanOwner = path.join(
    sourceRoot,
    'components/ultraplan/UltraplanChoiceDialog.tsx',
  )
  if (fs.existsSync(ultraplanOwner)) {
    const ultraplanChoice = fs.readFileSync(ultraplanOwner, 'utf8')
    assertFragments(
      ultraplanChoice,
      ['sessionEnvVars?: Map<string, string>'],
      'Ultraplan clear',
    )
    assert.match(
      ultraplanChoice,
      /clearConversation\(\{[\s\S]*?sessionEnvVars,[\s\S]*?getAppState/,
      'Ultraplan clear forwards the per-session map',
    )
  } else {
    assert.equal(
      historical,
      true,
      'only the isolated target101 tree may rely on the transitive Ultraplan owner',
    )
  }

  const repl = source('screens/REPL.tsx')
  assertFragments(
    repl,
    [
      'const sessionEnvVarsRef = useRef(new Map<string, string>())',
      'sessionEnvVars: sessionEnvVarsRef.current',
      'sessionEnvVars={sessionEnvVarsRef.current}',
    ],
    'REPL',
  )
  assert.ok(
    repl.split('sessionEnvVarsRef.current').length - 1 >= 5,
    'REPL threads the same map through tools, clear, Ultraplan, and input',
  )
  assertFragments(
    source('cli/print.ts'),
    ['const sessionEnvVars = new Map<string, string>()', 'sessionEnvVars,'],
    'headless query',
  )
  assertFragments(
    source('QueryEngine.ts'),
    [
      'this.sessionEnvVars = config.sessionEnvVars ?? new Map()',
      'sessionEnvVars: this.sessionEnvVars',
    ],
    'QueryEngine',
  )

  const bashProvider = source('utils/shell/bashProvider.ts')
  if (historical) {
    assertFragments(
      bashProvider,
      [
        'const REMOTE_BUN_SOFT_DATA_LIMIT_KB = 4 * 1024 * 1024',
        '`ulimit -Sd ${REMOTE_BUN_SOFT_DATA_LIMIT_KB} 2>/dev/null || true`',
      ],
      'target101 remote limit',
    )
    assert.equal(bashProvider.includes('export BUN_OPTIONS="--smol'), false)
  } else {
    assertFragments(
      bashProvider,
      ['export BUN_OPTIONS="--smol${BUN_OPTIONS:+ $BUN_OPTIONS}"'],
      'target116 remote memory policy',
    )
    assert.equal(bashProvider.includes('ulimit -Sd '), false)
  }
})
