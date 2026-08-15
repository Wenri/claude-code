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
  [16515, ['unresolved', 11804725, 11805283, 'VariableDeclaration', '4fd51b4e5a61b8a671a945ae22c19ebb858cb5f5e4c8a4600294057cc10eea56']],
  [16517, ['unresolved', 11805294, 11806958, 'ExpressionStatement', 'e515ae3aafefadf812aae69ddf08a5469a4698a7b717d9e96faf370ca28d4ddb']],
  [16521, ['unresolved', 11807070, 11807350, 'FunctionDeclaration', '5d440a487239bfdee70b34c0116cdc769d11b53075dc4432670d387f770d948f']],
  [16525, ['unresolved', 11808259, 11808960, 'FunctionDeclaration', '04110cde6c81c3f44ae0fe903c54c75ffde7760ed5e162b83ca30591bef28c05']],
])

const target105Events = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionDenied',
  'PermissionRequest',
  'Notification',
  'Stop',
  'SubagentStop',
  'StopFailure',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Setup',
  'SubagentStart',
  'PreCompact',
  'PostCompact',
  'ConfigChange',
  'CwdChanged',
  'FileChanged',
  'InstructionsLoaded',
  'Elicitation',
  'ElicitationResult',
  'WorktreeCreate',
  'WorktreeRemove',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource() {
  return fs.readFileSync(path.join(sourceRoot, 'utils/hooks.ts'), 'utf8')
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
  const body =
    name === 'validateHookJson'
      ? contents.indexOf('} {', start) + 2
      : contents.indexOf(' {', start) + 1
  assert.notEqual(body, 0, `${name}: body`)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
}

function registryEventNames(contents) {
  const start = contents.indexOf('export const HOOK_EVENT_REGISTRY = {')
  assert.notEqual(start, -1, 'HOOK_EVENT_REGISTRY declaration')
  const end = contents.indexOf('} as const', start)
  assert.notEqual(end, -1, 'HOOK_EVENT_REGISTRY terminator')
  return contents
    .slice(start, end)
    .split('\n')
    .map(line => line.match(/^\s{2}([A-Za-z]+):/)?.[1])
    .filter(Boolean)
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

async function compileHookRuntime(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `
      const controls = { snapshot: {}, agent: {}, managedOnly: false }
      const TOOL_HOOK_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000
      const SESSION_END_HOOK_TIMEOUT_MS_DEFAULT = 1500
      const getHooksConfigFromSnapshot = () => controls.snapshot
      const getMainThreadAgentHooks = () => controls.agent
      const shouldAllowManagedHooksOnly = () => controls.managedOnly
      const jsonParse = JSON.parse
      const jsonStringify = JSON.stringify
      const logForDebugging = () => {}
      const hookJSONOutputSchema = () => ({
        safeParse(value: any) {
          if (value?.valid) return { success: true, data: value }
          return {
            success: false,
            error: {
              issues: value?.issues ?? [
                { path: [], message: 'Invalid input' },
                { path: ['continue'], message: 'Expected boolean' },
              ],
            },
          }
        },
      })
      ${functionSource(contents, 'getSessionEndHookTimeoutMs')}
      ${functionSource(contents, 'validateHookJson')}
      export { controls, validateHookJson }
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
  'authenticated target105 pins the hook registry, timeout, and validation boundary',
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

    const registry = target.slice(11804725, 11805283)
    assertFragments(registry, [
      'PreToolUse:',
      'PostToolUseFailure:',
      'PermissionDenied:',
      'TaskCompleted:',
      'InstructionsLoaded:',
      'ElicitationResult:',
      'WorktreeRemove:',
    ], 'target105 registry')
    assertFragments(target.slice(11805294, 11806958), [
      'executeSessionEndHooks:',
      'executeWorktreeCreateHook:',
      'HOOK_EVENT_REGISTRY:',
    ], 'target105 export surface')
    assertFragments(target.slice(11807070, 11807350), [
      'CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS',
      'SessionEnd??[]',
      'Math.max',
      'Math.min',
    ], 'target105 SessionEnd timeout')
    assertFragments(target.slice(11808259, 11808960), [
      '(root)',
      'hookSpecificOutput is missing required field "hookEventName"',
      'Hook JSON output validation failed —',
    ], 'target105 output validation')

    const registryPattern = /\{PreToolUse:[\w$]+,PostToolUse:[\w$]+,PostToolUseFailure:[\w$]+,PermissionDenied:[\w$]+,PermissionRequest:[\w$]+,Notification:/g
    assert.equal(baseline.match(registryPattern)?.length ?? 0, 0)
    assert.equal(target.match(registryPattern)?.length ?? 0, 1)
    assert.equal(latest.match(registryPattern)?.length ?? 0, 1)
    assert.equal(
      baseline.includes(
        'hookSpecificOutput is missing required field "hookEventName"',
      ),
      false,
    )
    assertFragments(latest, [
      'hookSpecificOutput is missing required field "hookEventName"',
      'Hook JSON output validation failed',
    ], 'target116 persistence')
  },
)

test(
  'authored hooks owner exposes the exact target registry and validation contract',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = ownerSource()
    const events = registryEventNames(source)
    const isCurrent = sourceRoot === path.resolve(repositoryRoot, 'src')
    assert.deepEqual(
      events,
      isCurrent
        ? [
            ...target105Events.slice(0, 13),
            'UserPromptExpansion',
            ...target105Events.slice(13),
          ]
        : target105Events,
    )
    assertFragments(source, [
      "firstIssue.path.join('.') || '(root)'",
      "err.path.join('.') || '(root)'",
      "!('hookEventName' in parsed.hookSpecificOutput)",
      'Hook JSON output validation failed — ${primaryError}',
      'Math.min(longestConfiguredTimeoutMs, TOOL_HOOK_EXECUTION_TIMEOUT_MS)',
    ], 'utils/hooks.ts')
  },
)

test(
  'hook timeout and validation owners execute the target105 edge cases',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const runtime = await compileHookRuntime(ownerSource())
    const originalTimeout = process.env.CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS
    try {
      delete process.env.CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS
      runtime.controls.snapshot = {
        SessionEnd: [{ hooks: [{ timeout: 2 }, { timeout: 5 }] }],
      }
      runtime.controls.agent = {}
      assert.equal(runtime.getSessionEndHookTimeoutMs(), 5000)
      runtime.controls.snapshot = {
        SessionEnd: [{ hooks: [{ timeout: 9999 }] }],
      }
      assert.equal(runtime.getSessionEndHookTimeoutMs(), 600000)
      process.env.CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS = '2300'
      assert.equal(runtime.getSessionEndHookTimeoutMs(), 2300)
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS
      } else {
        process.env.CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS = originalTimeout
      }
    }

    const invalid = runtime.validateHookJson(
      JSON.stringify({ hookSpecificOutput: {} }),
    )
    assert.equal(
      invalid.validationError,
      'Hook JSON output validation failed — hookSpecificOutput is missing required field "hookEventName"\n  - continue: Expected boolean\n\nThe hook\'s output was: {\n  "hookSpecificOutput": {}\n}',
    )
    assert.deepEqual(
      runtime.validateHookJson(JSON.stringify({ valid: true })),
      { json: { valid: true } },
    )
  },
)
