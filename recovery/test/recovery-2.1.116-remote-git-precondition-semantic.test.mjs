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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnits = [
  {
    index: 10611,
    start: 6227632,
    end: 6227670,
    sourceHash:
      '67290c72f9d8f96638f9abd4c20a9fd8283334ab6aa97518256e05ebe2d74876',
  },
  {
    index: 10616,
    start: 6229703,
    end: 6230423,
    sourceHash:
      '33ae30bdd1c1baa1b6ff43e139a61cc7e7fcb2fa73b516cd04d6dca0f50c8bcb',
  },
  {
    index: 16502,
    start: 10419759,
    end: 10420049,
    sourceHash:
      'fc2bad48888efcd4b66003bbd54df067fa0c18ea3e75bd2bf743f87c577896bb',
  },
  {
    index: 16552,
    viaTargetIndex: 16693,
    start: 10444197,
    end: 10445549,
    sourceHash:
      '0c9914cb8429af0e0e899f88becef6b905ba34181d61adbdf2dd78e7acc6ff07',
  },
]
const targetUnits = [
  {
    index: 10713,
    start: 6260141,
    end: 6260296,
    sourceHash:
      '29deb2f2d8b0d8327fcd997e04ce6574900962f8d08b755e574a974944bffaae',
  },
  {
    index: 10718,
    start: 6262327,
    end: 6263070,
    sourceHash:
      '9f0849d43651a1e777a8970d56e24a0d72ae70edd36f71bbca5e525a324624c1',
  },
  {
    index: 16643,
    start: 10475307,
    end: 10475607,
    sourceHash:
      'b798e7346a9cb7894b8c8a47c50346ec29d2d20b341bd3518dd550924633d5e7',
  },
  {
    index: 16693,
    classification: 'matched',
    start: 10500220,
    end: 10501572,
    sourceHash:
      '9ad7a05c564b426f7144b70bf75e3d496ed5e1852ecdb3d9bef39715a3c186bf',
  },
]
const typedRow = {
  historicalResidueRow: 172,
  currentResidueRow: 165,
  value: '--is-inside-work-tree',
  start: 6260238,
  end: 6260261,
  structuralIndex: 10713,
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
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

function inertModule() {
  const noop = () => undefined
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === '__esModule') return true
        return noop
      },
    },
  )
}

async function transpileOwner(relative, requireStub) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source(relative), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return module.exports
}

async function instantiatePreconditions({ root, result }) {
  const calls = []
  const owner = await transpileOwner(
    'src/utils/background/remote/preconditions.ts',
    specifier => {
      if (specifier === 'axios') {
        return { default: { isAxiosError: () => false }, isAxiosError: () => false }
      }
      if (specifier.endsWith('/cwd.js')) return { getCwd: () => '/repo' }
      if (specifier.endsWith('/execFileNoThrow.js')) {
        return {
          execFileNoThrow: async (...args) => {
            calls.push(args)
            return result
          },
        }
      }
      if (specifier.endsWith('/git.js')) {
        return {
          findGitRoot: () => root,
          getIsClean: async () => true,
          gitExe: () => '/usr/bin/git',
        }
      }
      return inertModule()
    },
  )
  return { owner, calls }
}

async function instantiateRemoteSession(state) {
  return transpileOwner(
    'src/utils/background/remote/remoteSession.ts',
    specifier => {
      if (specifier.endsWith('/growthbook.js')) {
        return { checkGate_CACHED_OR_BLOCKING: async () => state.bundleGate }
      }
      if (specifier.endsWith('/policyLimits/index.js')) {
        return { isPolicyAllowed: () => true }
      }
      if (specifier.endsWith('/detectRepository.js')) {
        return { detectCurrentRepositoryWithHost: async () => state.repository }
      }
      if (specifier.endsWith('/envUtils.js')) {
        return { isEnvTruthy: value => value === '1' || value === 'true' }
      }
      if (specifier.endsWith('/cwd.js')) return { getCwd: () => '/repo' }
      if (specifier.endsWith('/git.js')) return { findGitRoot: () => state.root }
      if (specifier.endsWith('/preconditions.js')) {
        return {
          checkGithubAppInstalled: async () => true,
          checkHasRemoteEnvironment: async () => true,
          checkIsInGitRepo: async () => state.inGit,
          checkNeedsClaudeAiLogin: async () => false,
        }
      }
      return inertModule()
    },
  )
}

test('target116 authenticates the async git fallback and split viability graph', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const unit of baselineUnits) {
    const region = unit.viaTargetIndex
      ? {
          ...structural.regions[unit.viaTargetIndex].target,
          index: structural.regions[unit.viaTargetIndex].baselineUnitIndex,
          start: unit.start,
          end: unit.end,
          sourceHash: unit.sourceHash,
        }
      : structural.unmatchedBaseline.find(candidate => candidate.index === unit.index)
    assert.ok(region, `baseline unit ${unit.index}`)
    assert.deepEqual(
      [region.start, region.end, region.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(baseline.slice(unit.start, unit.end)), unit.sourceHash)
  }
  for (const unit of targetUnits) {
    const region = structural.regions[unit.index]
    assert.equal(region.classification, unit.classification ?? 'unresolved')
    if (unit.classification === 'matched') {
      assert.equal(region.baselineUnitIndex, 16552)
    }
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
  }

  assert.equal(target.slice(typedRow.start, typedRow.end), JSON.stringify(typedRow.value))
  assert.equal(baseline.split(JSON.stringify(typedRow.value)).length - 1, 1)
  assert.equal(target.split(JSON.stringify(typedRow.value)).length - 1, 2)
  const baselineHelper = baseline.slice(baselineUnits[0].start, baselineUnits[0].end)
  const targetHelper = target.slice(targetUnits[0].start, targetUnits[0].end)
  assert.doesNotMatch(baselineHelper, /rev-parse/)
  assert.match(targetHelper, /\["rev-parse","--is-inside-work-tree"\]/)
  assert.match(targetHelper, /\.trim\(\)==="true"/)

  const baselineEligibility = baseline.slice(
    baselineUnits[1].start,
    baselineUnits[1].end,
  )
  const targetEligibility = target.slice(targetUnits[1].start, targetUnits[1].end)
  assert.match(baselineEligibility, /if\(![^)]*\(\)\)/)
  assert.match(targetEligibility, /if\(!await [^)]*\(\)\)/)
  assert.match(targetEligibility, /else if\([^)]*&&[^)]*\(.*\)!==null\)/)

  const targetViability = target.slice(targetUnits[2].start, targetUnits[2].end)
  assert.doesNotMatch(targetViability, /rev-parse/)
  assert.match(targetViability, /!==null&&/)
  assert.match(
    target.slice(targetUnits[3].start, targetUnits[3].end),
    /\?[^:]*\(\)\.catch\(/,
  )
})

test('source probes git only when the fast root lookup misses', sourceOptions, async () => {
  const fast = await instantiatePreconditions({
    root: '/repo',
    result: { code: 1, stdout: '', stderr: '' },
  })
  assert.equal(await fast.owner.checkIsInGitRepo(), true)
  assert.deepEqual(fast.calls, [])

  const fallback = await instantiatePreconditions({
    root: null,
    result: { code: 0, stdout: 'true\n', stderr: '' },
  })
  assert.equal(await fallback.owner.checkIsInGitRepo(), true)
  assert.deepEqual(fallback.calls, [
    ['/usr/bin/git', ['rev-parse', '--is-inside-work-tree']],
  ])

  const outside = await instantiatePreconditions({
    root: null,
    result: { code: 0, stdout: 'false\n', stderr: '' },
  })
  assert.equal(await outside.owner.checkIsInGitRepo(), false)
})

test('source keeps bundle viability strict while eligibility accepts the fallback', sourceOptions, async () => {
  const previousBundle = process.env.CCR_ENABLE_BUNDLE
  process.env.CCR_ENABLE_BUNDLE = '1'
  try {
    const fallbackOnly = await instantiateRemoteSession({
      root: null,
      inGit: true,
      bundleGate: true,
      repository: null,
    })
    assert.deepEqual(await fallbackOnly.getRemoteSourceViability(), {
      cloneViable: false,
      bundleSeedEnabled: false,
    })
    assert.deepEqual(
      await fallbackOnly.checkBackgroundRemoteSessionEligibility(),
      [{ type: 'no_git_remote' }],
    )

    const fastRoot = await instantiateRemoteSession({
      root: '/repo',
      inGit: true,
      bundleGate: true,
      repository: null,
    })
    assert.deepEqual(await fastRoot.checkBackgroundRemoteSessionEligibility(), [])

    const outside = await instantiateRemoteSession({
      root: null,
      inGit: false,
      bundleGate: true,
      repository: null,
    })
    assert.deepEqual(await outside.checkBackgroundRemoteSessionEligibility(), [
      { type: 'not_in_git_repo' },
    ])
  } finally {
    if (previousBundle === undefined) delete process.env.CCR_ENABLE_BUNDLE
    else process.env.CCR_ENABLE_BUNDLE = previousBundle
  }

  const dialog = source('src/commands/review/UltrareviewOverageDialog.tsx')
  assert.match(dialog, /getRemoteSourceViability/)
  assert.doesNotMatch(dialog, /function getReviewSourceViability/)
})
