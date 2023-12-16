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
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const units = {
  baselineSync: {
    index: 14734,
    start: 9243106,
    end: 9244846,
    sourceHash:
      '4c2faca4cbad990e26d5a8b9de786267c186822653134e9c26ea0cf2eb68bbd2',
  },
  targetSync: {
    index: 14873,
    start: 9295662,
    end: 9297402,
    sourceHash:
      '7e03855b9a9170266c80f2da8447eb0a2b3ca2b92a3b8ffc257ff35a47f578a3',
  },
  baselineAsync: {
    index: 14749,
    start: 9250252,
    end: 9250470,
    sourceHash:
      'c30708e6072a1f539d90e129ef4b5beb706756e69973ca4bf01876eff53d265e',
  },
  targetAsync: {
    index: 14888,
    start: 9302868,
    end: 9303086,
    sourceHash:
      'd51d3b3b61cb5b344acf92f459f744ffd4c69c274dfea2b0728e2f3af37321da',
  },
}

const typedRows = [
  {
    historicalRow: 568,
    currentRow: 478,
    value: 'bypassPermissions mode is disabled by feature gate',
    start: 9296964,
    end: 9297016,
    structuralIndex: 14873,
  },
  {
    historicalRow: 569,
    currentRow: 479,
    value:
      'bypassPermissions mode is being disabled by feature gate (async check)',
    start: 9302961,
    end: 9303033,
    structuralIndex: 14888,
  },
]

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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function targetRegion(index) {
  const direct = structural.regions[index]
  if (direct?.target?.index === index) return direct
  return structural.unresolvedTarget.find(entry => entry.target.index === index)
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

async function extractFunctions(names) {
  const ts = await loadTypeScript()
  const owner = source('utils/permissions/permissionSetup.ts')
  const ast = ts.createSourceFile(
    'permissionSetup.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const wanted = new Set(names)
  const declarations = ast.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      wanted.has(statement.name.text),
  )
  assert.equal(declarations.length, names.length)
  return ts.transpileModule(
    declarations
      .map(statement => owner.slice(statement.getFullStart(), statement.end))
      .join('\n'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
}

async function instantiateInitialPermissionMode({ scrub, featureGate }) {
  const javascript = await extractFunctions(['initialPermissionModeFromCLI'])
  const logs = []
  const module = { exports: {} }
  new Function(
    'exports',
    'module',
    'isScrubEnabled',
    'getSettings_DEPRECATED',
    'checkStatsigFeatureGate_CACHED_MAY_BE_STALE',
    'feature',
    'logForDebugging',
    javascript,
  )(
    module.exports,
    module,
    () => scrub,
    () => ({}),
    () => featureGate,
    () => false,
    (...args) => logs.push(args),
  )
  return { initialPermissionModeFromCLI: module.exports.initialPermissionModeFromCLI, logs }
}

async function instantiateAsyncGate({ disabled }) {
  const javascript = await extractFunctions(['checkAndDisableBypassPermissions'])
  const logs = []
  const shutdowns = []
  const module = { exports: {} }
  new Function(
    'exports',
    'module',
    'shouldDisableBypassPermissions',
    'logForDebugging',
    'gracefulShutdown',
    javascript,
  )(
    module.exports,
    module,
    async () => disabled,
    (...args) => logs.push(args),
    (...args) => shutdowns.push(args),
  )
  return { check: module.exports.checkAndDisableBypassPermissions, logs, shutdowns }
}

test('target116 authenticates scrub hardening and feature-gate wording', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const key of ['baselineSync', 'baselineAsync']) {
    const unit = units[key]
    const region = structural.unmatchedBaseline.find(
      entry => entry.index === unit.index,
    )
    assert.ok(region)
    assert.deepEqual(
      [region.start, region.end, region.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(baseline.slice(unit.start, unit.end)), unit.sourceHash)
  }

  for (const key of ['targetSync', 'targetAsync']) {
    const unit = units[key]
    const region = targetRegion(unit.index)
    assert.ok(region)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
  }

  assert.equal(
    baseline.includes('Permission mode forced to default'),
    true,
    'subprocess scrub hardening is inherited from target114',
  )
  assert.equal(
    target.includes('Permission mode forced to default'),
    true,
    'subprocess scrub hardening persists in target116',
  )
  assert.match(
    baseline.slice(units.baselineSync.start, units.baselineSync.end),
    /disabled by Statsig gate/,
  )
  assert.match(
    target.slice(units.targetSync.start, units.targetSync.end),
    /disabled by feature gate/,
  )

  for (const row of typedRows) {
    assert.equal(
      target.slice(row.start, row.end),
      `"${row.value}"`,
    )
  }
})

test('scrub mode always forces default and only warns on a non-default request', sourceOptions, async () => {
  const { initialPermissionModeFromCLI } =
    await instantiateInitialPermissionMode({ scrub: true, featureGate: false })
  const writes = []
  const originalWrite = process.stderr.write
  process.stderr.write = value => {
    writes.push(String(value))
    return true
  }
  try {
    assert.deepEqual(
      initialPermissionModeFromCLI({
        permissionModeCli: undefined,
        dangerouslySkipPermissions: false,
      }),
      { mode: 'default', notification: undefined },
    )
    assert.equal(writes.length, 0)

    const danger = initialPermissionModeFromCLI({
      permissionModeCli: undefined,
      dangerouslySkipPermissions: true,
    })
    assert.equal(danger.mode, 'default')
    assert.match(danger.notification, /allowed_non_write_users hardening/)

    const plan = initialPermissionModeFromCLI({
      permissionModeCli: 'plan',
      dangerouslySkipPermissions: false,
    })
    assert.equal(plan.mode, 'default')
    assert.equal(plan.notification, danger.notification)
    assert.equal(writes.length, 2)
    assert.match(writes[0], /^⚠ Permission mode forced to default/)
    assert.match(writes[1], /CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=0 to opt out\./)
  } finally {
    process.stderr.write = originalWrite
  }
})

test('sync and async bypass checks use exact feature-gate diagnostics', sourceOptions, async () => {
  const sync = await instantiateInitialPermissionMode({
    scrub: false,
    featureGate: true,
  })
  assert.deepEqual(
    sync.initialPermissionModeFromCLI({
      permissionModeCli: undefined,
      dangerouslySkipPermissions: true,
    }),
    {
      mode: 'default',
      notification:
        'Bypass permissions mode was disabled by your organization policy',
    },
  )
  assert.equal(
    sync.logs[0][0],
    'bypassPermissions mode is disabled by feature gate',
  )

  const asyncGate = await instantiateAsyncGate({ disabled: true })
  await asyncGate.check({ isBypassPermissionsModeAvailable: true })
  assert.equal(
    asyncGate.logs[0][0],
    'bypassPermissions mode is being disabled by feature gate (async check)',
  )
  assert.deepEqual(asyncGate.shutdowns, [[1, 'bypass_permissions_disabled']])

  const unavailable = await instantiateAsyncGate({ disabled: true })
  await unavailable.check({ isBypassPermissionsModeAvailable: false })
  assert.equal(unavailable.logs.length, 0)
  assert.equal(unavailable.shutdowns.length, 0)
})
