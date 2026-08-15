import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_112_BUNDLE and CLAUDE_CODE_2_1_113_BUNDLE are required'
      : false,
}

const units = new Map([
  [
    14611,
    [
      9179755,
      9191337,
      'e4889d53820be369b27f66c9e592aa521983ce51f9da424e96a984ba140a419b',
    ],
  ],
  [
    14705,
    [
      9227241,
      9228029,
      '1a202504fd72d59a6916ce8121fc2fa374d97f0d0c5408ac2959e6d647a7ae84',
    ],
  ],
  [
    14706,
    [
      9228029,
      9229531,
      'd7bff7429801cb8a9edc123f28b7dbb3f1e3b1f3848b839a3bace0dda34e252e',
    ],
  ],
  [
    14713,
    [
      9230902,
      9237202,
      'f886f31e0fed4612a4eb71c3ec7cc0bfcd68d07c3ae0071981e526367ad6e8e9',
    ],
  ],
])

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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

async function compileBashPermissionHarness() {
  const ownerPath = path.join(sourceRoot, 'tools/BashTool/BashTool.tsx')
  const owner = fs.readFileSync(ownerPath, 'utf8')
  const ts = await loadTypeScript()
  const parsed = ts.createSourceFile(
    ownerPath,
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const helper = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'isRuleBasedPermissionDecision',
  )
  assert.ok(helper, 'BashTool declares the rule-decision helper')

  const methods = []
  function visit(node) {
    if (
      ts.isMethodDeclaration(node) &&
      node.name?.getText(parsed) === 'checkPermissions'
    ) {
      methods.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(methods.length, 1, 'BashTool has one checkPermissions method')
  const method = methods[0]
  assert.ok(method.body, 'BashTool checkPermissions has a body')

  const javascript = ts.transpileModule(
    `${helper.getText(parsed)}
async function checkPermissions(input, context) ${method.body.getText(parsed)}
module.exports = { isRuleBasedPermissionDecision, checkPermissions }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    },
  )
  const errors = (javascript.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'Bash permission harness must transpile')
  return javascript.outputText
}

async function loadFindSafetyCheck() {
  const ownerPath = path.join(sourceRoot, 'utils/permissions/permissions.ts')
  const owner = fs.readFileSync(ownerPath, 'utf8')
  const ts = await loadTypeScript()
  const parsed = ts.createSourceFile(
    ownerPath,
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const helper = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'findSafetyCheck',
  )
  assert.ok(helper, 'permissions.ts declares findSafetyCheck')
  const javascript = ts.transpileModule(
    `${helper.getText(parsed).replace(/^export\s+/, '')}
module.exports = { findSafetyCheck }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    },
  )
  const errors = (javascript.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'recursive safety helper must transpile')
  const loaded = { exports: {} }
  new Function('module', 'exports', javascript.outputText)(
    loaded,
    loaded.exports,
  )
  return loaded.exports.findSafetyCheck
}

function instantiateBashPermissionHarness(
  javascript,
  permissionResult,
  useSandbox,
) {
  const loaded = { exports: {} }
  new Function(
    'module',
    'exports',
    'bashToolHasPermission',
    'shouldUseSandbox',
    javascript,
  )(
    loaded,
    loaded.exports,
    async () => permissionResult,
    useSandbox,
  )
  return loaded.exports
}

test('2.1.113 introduces sandbox-override bypass immunity', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  )
  assert.equal(
    sha256(targetBytes),
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const slices = new Map()
  for (const [index, [start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    const slice = target.slice(start, end)
    assert.equal(sha256(slice), sourceHash, `${index}: bytes`)
    slices.set(index, slice)
  }

  assert.equal(
    [...slices.values()].filter(slice =>
      slice.includes('type==="sandboxOverride"'),
    ).length,
    3,
  )
  const producer = slices.get(14611)
  for (const fragment of [
    'dangerouslyDisableSandbox&&',
    'behavior!=="deny"',
    'behavior!=="ask"',
    'decisionReason:{type:"sandboxOverride",reason:"dangerouslyDisableSandbox"}',
    'message:"Run outside of the sandbox"',
  ]) {
    assert.ok(producer.includes(fragment), fragment)
  }
  assert.equal(
    target.split('type:"sandboxOverride"').length -
      baseline.split('type:"sandboxOverride"').length,
    1,
  )
  assert.equal(
    target.split('type==="sandboxOverride"').length -
      baseline.split('type==="sandboxOverride"').length,
    3,
  )
})

test('source keeps sandbox overrides and nested safety checks bypass-immune', sourceOptions, async () => {
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'utils/permissions/permissions.ts'),
    'utf8',
  )
  const bypassGate =
    /\(findSafetyCheck\(toolPermissionResult\.decisionReason\) \|\|\s+toolPermissionResult\.decisionReason\?\.type === 'sandboxOverride'\)/g
  assert.equal(owner.match(bypassGate)?.length, 2)

  const target113AutoGate =
    /findSafetyCheck\(\s*result\.decisionReason,\s*reason => !reason\.classifierApprovable,\s*\) \|\| result\.decisionReason\?\.type === 'sandboxOverride'/
  const target116AutoGate =
    /const safetyCheck = findSafetyCheck\(\s*result\.decisionReason,\s*reason => !reason\.classifierApprovable,\s*\)\s+const sandboxOverride = result\.decisionReason\?\.type === 'sandboxOverride'\s+if \(safetyCheck \|\| sandboxOverride\)/
  assert.equal(
    Number(target113AutoGate.test(owner)) + Number(target116AutoGate.test(owner)),
    1,
    'exactly one release-appropriate auto-mode sandbox gate',
  )

  const findSafetyCheck = await loadFindSafetyCheck()
  const approvable = {
    type: 'safetyCheck',
    reason: 'sensitive path',
    classifierApprovable: true,
  }
  const manual = {
    type: 'safetyCheck',
    reason: 'dangerous command',
    classifierApprovable: false,
  }
  const nested = {
    type: 'subcommandResults',
    reasons: new Map([
      [
        'nested',
        {
          decisionReason: {
            type: 'subcommandResults',
            reasons: new Map([
              ['approvable', { decisionReason: approvable }],
              ['manual', { decisionReason: manual }],
            ]),
          },
        },
      ],
    ]),
  }
  assert.equal(findSafetyCheck(nested), approvable)
  assert.equal(
    findSafetyCheck(nested, reason => !reason.classifierApprovable),
    manual,
  )
})

test('Bash emits a sandboxOverride ask only when the explicit flag flips sandboxing', sourceOptions, async () => {
  const javascript = await compileBashPermissionHarness()
  const modeAllow = {
    behavior: 'allow',
    updatedInput: { command: 'git status' },
    decisionReason: { type: 'mode', mode: 'default' },
  }
  const flipsSandbox = input => !input.dangerouslyDisableSandbox
  const { checkPermissions, isRuleBasedPermissionDecision } =
    instantiateBashPermissionHarness(javascript, modeAllow, flipsSandbox)

  assert.equal(isRuleBasedPermissionDecision(undefined), false)
  assert.equal(
    isRuleBasedPermissionDecision({ type: 'rule', rule: {} }),
    true,
  )
  assert.equal(
    isRuleBasedPermissionDecision({
      type: 'subcommandResults',
      reasons: new Map([
        ['one', { decisionReason: { type: 'rule', rule: {} } }],
        ['two', { decisionReason: { type: 'rule', rule: {} } }],
      ]),
    }),
    true,
  )
  assert.equal(
    isRuleBasedPermissionDecision({
      type: 'subcommandResults',
      reasons: new Map([
        ['rule', { decisionReason: { type: 'rule', rule: {} } }],
        ['mode', { decisionReason: { type: 'mode', mode: 'default' } }],
      ]),
    }),
    false,
  )

  assert.deepEqual(
    await checkPermissions(
      { command: 'git status', dangerouslyDisableSandbox: true },
      {},
    ),
    {
      behavior: 'ask',
      decisionReason: {
        type: 'sandboxOverride',
        reason: 'dangerouslyDisableSandbox',
      },
      message: 'Run outside of the sandbox',
    },
  )

  for (const preserved of [
    { behavior: 'deny', decisionReason: { type: 'rule', rule: {} } },
    { behavior: 'ask', decisionReason: { type: 'other', reason: 'manual' } },
    { behavior: 'allow', decisionReason: { type: 'rule', rule: {} } },
    {
      behavior: 'allow',
      decisionReason: {
        type: 'subcommandResults',
        reasons: new Map([
          ['one', { decisionReason: { type: 'rule', rule: {} } }],
          ['two', { decisionReason: { type: 'rule', rule: {} } }],
        ]),
      },
    },
  ]) {
    const harness = instantiateBashPermissionHarness(
      javascript,
      preserved,
      flipsSandbox,
    )
    assert.equal(
      await harness.checkPermissions(
        { command: 'git status', dangerouslyDisableSandbox: true },
        {},
      ),
      preserved,
    )
  }

  const unavailable = instantiateBashPermissionHarness(
    javascript,
    modeAllow,
    () => false,
  )
  assert.equal(
    await unavailable.checkPermissions(
      { command: 'git status', dangerouslyDisableSandbox: true },
      {},
    ),
    modeAllow,
  )
  assert.equal(
    await checkPermissions({ command: 'git status' }, {}),
    modeAllow,
  )
})
