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
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const isCurrentSource =
  sourceRoot === path.resolve(repositoryRoot, 'src')
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
  [16362, ['unresolved', 11756817, 11756906, 'FunctionDeclaration', '61451ff0bf6da9eebfab07d3b97993cab44b2baabadde1f06732e6c50280cd82']],
  [16370, ['unresolved', 11757436, 11757503, 'FunctionDeclaration', 'a8bac8513eff22738cf8becfb1a46793821ff9e8916e9b47ed5be28fffe61650']],
  [16371, ['unresolved', 11757503, 11757967, 'FunctionDeclaration', '732f6865f43bce2ae9adc8f2d35c79c016f9632146a70536685881ef43319721']],
  [16372, ['unresolved', 11757967, 11758358, 'FunctionDeclaration', '02d8cdc20d6358f25a2004f1940b339c21a1db4a34c6d2dd1df98c31937318cc']],
  [16387, ['unresolved', 11761864, 11763661, 'FunctionDeclaration', '8c2b23e26123e28e3c2a22bc0d84b67fcf951988f772f678ebf0afa065ae5995']],
  [16389, ['unresolved', 11765397, 11765993, 'FunctionDeclaration', '0393cf6848715bb1207d48edc9090b6bc0a07951de1c26acbcfbd87d6b6d7a81']],
  [16390, ['unresolved', 11765993, 11767329, 'FunctionDeclaration', '3a9542c5e0ac24cf414e126f558c4f142c236f1599279511fbe435c17381d453']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

function functionSource(contents, name) {
  let start = contents.indexOf(`export function ${name}`)
  if (start === -1) start = contents.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  assert.notEqual(body, -1, `${name}: body`)
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

async function compileRuntime(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `
      const sep = '/'
      const join = (...parts: string[]) =>
        parts.join('/').replace(/\\/{2,}/g, '/')
      const normalize = (value: string) => value.replace(/\\/{2,}/g, '/')
      const getProjectDir = () => '/project'
      const getCwd = () => '/cwd'
      const getSessionId = () => 'session'
      const getPathsForPermissionCheck = (value: string) => [value]
      const getDirectoryForPath = (value: string) => value.split('/').slice(0, -1).join('/')
      const createReadRuleSuggestion = (value: string) => ({
        type: 'addRules', rule: value,
      })
      const pathInAllowedWorkingPath = () => true
      const isSessionPlanFile = () => false
      const isAutoMemPath = () => false
      const getMemoryToggledOff = () => false
      const isScratchpadPath = () => false
      const feature = () => false
      const isAgentMemoryPath = () => false
      const hasAutoMemPathOverride = () => true
      const normalizeCaseForComparison = (value: string) => value.toLowerCase()
      const expandPath = (value: string) => value
      const DANGEROUS_DIRECTORIES = ['.git', '.vscode', '.idea', '.claude', '.husky']
      const DANGEROUS_FILES = ['.gitconfig', '.mcp.json', '.claude.json']
      const getPlatform = () => 'linux'
      const containsVulnerableUncPath = (value: string) =>
        value.startsWith('\\\\\\\\') || value.startsWith('//')
      ${functionSource(contents, 'getSessionWorkflowScriptsDir')}
      ${functionSource(contents, 'isSessionWorkflowScriptPath')}
      ${functionSource(contents, 'getSessionFrameDir')}
      ${functionSource(contents, 'isSessionFrameFile')}
      ${functionSource(contents, 'isWslUncPath')}
      ${functionSource(contents, 'isDangerousFilePathToAutoEdit')}
      ${functionSource(contents, 'hasSuspiciousWindowsPathPattern')}
      ${functionSource(contents, 'generateSuggestions')}
      export {
        isSessionFrameFile,
        isWslUncPath,
        isDangerousFilePathToAutoEdit,
        hasSuspiciousWindowsPathPattern,
        generateSuggestions,
      }
    `,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'process', javascript)(
    module.exports,
    module,
    process,
  )
  return module.exports
}

test(
  'authenticated target105 pins the frame, WSL UNC, and suggestion boundary',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    if (!baselinePath || !targetPath || !latestPath) return
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

    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assertFragments(target.slice(11756817, 11756906), [
      '"frame.html"',
      '"frame.md"',
    ], 'target105 frame selector')
    assertFragments(target.slice(11757436, 11757503), [
      '/^[\\\\/]{2}wsl(\\$|\\.localhost)[\\\\/]/i',
    ], 'target105 WSL UNC selector')
    assertFragments(target.slice(11757503, 11758358), [
      '&&!HH7(q)',
      'scheduled_tasks.json',
      'zF(q)&&!HH7(q)',
    ], 'target105 path safety')
    assertFragments(target.slice(11761864, 11763661), [
      '&&!HH7(H)',
      'UNC path detected (defense-in-depth check)',
    ], 'target105 read safety')
    assertFragments(target.slice(11765397, 11765993), [
      'prePlanMode==="auto"',
      'prePlanMode==="bypassPermissions"',
      'prePlanMode==="acceptEdits"',
      'prePlanMode==="dontAsk"',
    ], 'target105 plan-mode suggestions')
    assertFragments(target.slice(11765993, 11767329), [
      'Frame source files for current session are allowed for writing',
    ], 'target105 frame permission')

    assert.equal(baseline.includes('"frame.md"'), false)
    assert.equal(baseline.includes('wsl(\\$|\\.localhost)'), false)
    assert.equal(
      baseline.includes('Frame HTML files for current session are allowed for writing'),
      true,
    )
    assertFragments(latest, [
      '"frame.md"',
      'wsl(\\$|\\.localhost)',
      'Frame source files for current session are allowed for writing',
      'prePlanMode==="dontAsk"',
    ], 'target116 persistence')
    const latestWriteStart = latest.indexOf('function VXH(')
    const latestWriteEnd = latest.indexOf('function zf$(', latestWriteStart)
    assert.notEqual(latestWriteStart, -1, 'target116 write permission function')
    assert.notEqual(latestWriteEnd, -1, 'target116 suggestion function')
    const latestWrite = latest.slice(latestWriteStart, latestWriteEnd)
    assert.ok(
      latestWrite.indexOf('"edit","ask"') < latestWrite.indexOf('QeH('),
      'target116 explicit ask precedes internal-path handling',
    )
    assert.ok(
      latestWrite.indexOf('QeH(') < latestWrite.indexOf('ceH('),
      'target116 internal-path handling precedes safety handling',
    )
  },
)

test(
  'authored filesystem owners retain the complete target105 call graph',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = ownerSource('utils/permissions/filesystem.ts')
    const tool = ownerSource('Tool.ts')
    assertFragments(source, [
      "join(getProjectDir(getCwd()), getSessionId(), 'frame') + sep",
      "join(frameDir, 'frame.html')",
      "join(frameDir, 'frame.md')",
      '/^[\\\\/]{2}wsl(\\$|\\.localhost)[\\\\/]/i',
      '!isWslUncPath(pathToCheck)',
      'allowInternalClaudePaths?: boolean',
      'toolPermissionContext.isRemoteMode',
      "toolPermissionContext.prePlanMode === 'dontAsk'",
      'Frame source files for current session are allowed for writing',
    ], 'utils/permissions/filesystem.ts')
    assertFragments(tool, ['isRemoteMode?: boolean'], 'Tool.ts')
    const writePermission = functionSource(
      source,
      'checkWritePermissionForTool',
    )
    if (isCurrentSource) {
      assert.ok(
        writePermission.indexOf("'edit',\n      'ask'") <
          writePermission.indexOf('checkEditableInternalPath('),
        'current explicit ask precedes internal paths',
      )
      assert.ok(
        writePermission.indexOf('checkEditableInternalPath(') <
          writePermission.indexOf('checkPathSafetyForAutoEdit('),
        'current internal paths precede safety',
      )
    } else {
      assert.ok(
        writePermission.indexOf('checkEditableInternalPath(') <
          writePermission.indexOf('checkPathSafetyForAutoEdit('),
        'target105 internal paths precede safety',
      )
      assert.ok(
        writePermission.indexOf('checkPathSafetyForAutoEdit(') <
          writePermission.indexOf("'edit',\n      'ask'"),
        'target105 safety precedes explicit ask',
      )
    }
  },
)

test(
  'filesystem permission helpers execute the target105 safety decisions',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const runtime = await compileRuntime(
      ownerSource('utils/permissions/filesystem.ts'),
    )
    assert.equal(runtime.isWslUncPath('\\\\wsl$\\Ubuntu\\tmp\\x'), true)
    assert.equal(runtime.isWslUncPath('//wsl.localhost/Ubuntu/tmp/x'), true)
    assert.equal(runtime.isWslUncPath('\\\\server\\share\\x'), false)
    assert.equal(
      runtime.isDangerousFilePathToAutoEdit('\\\\wsl$\\Ubuntu\\tmp\\x'),
      false,
    )
    assert.equal(
      runtime.hasSuspiciousWindowsPathPattern('//wsl.localhost/Ubuntu/tmp/x'),
      false,
    )
    assert.equal(
      runtime.hasSuspiciousWindowsPathPattern('//server/share/x'),
      true,
    )
    assert.equal(
      runtime.isDangerousFilePathToAutoEdit(
        '/cwd/.claude/skills/example/SKILL.md',
        true,
      ),
      false,
    )
    assert.equal(
      runtime.isDangerousFilePathToAutoEdit(
        '/cwd/.claude/skills/example/SKILL.md',
        false,
      ),
      true,
    )

    const permissionContext = {
      mode: 'plan',
      prePlanMode: 'auto',
      additionalWorkingDirectories: new Map(),
    }
    assert.deepEqual(
      runtime.generateSuggestions('/cwd/file', 'write', permissionContext),
      [],
    )
    assert.deepEqual(
      runtime.generateSuggestions('/cwd/file', 'write', {
        ...permissionContext,
        prePlanMode: 'default',
      }),
      [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
    )

    assert.equal(
      runtime.isSessionFrameFile('/project/session/frame/frame.html'),
      true,
    )
    assert.equal(
      runtime.isSessionFrameFile('/project/session/frame/frame.md'),
      true,
    )
    assert.equal(
      runtime.isSessionFrameFile('/project/session/frame/other.md'),
      false,
    )
  },
)
