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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

function readLedger(relativeCase) {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          repositoryRoot,
          'recovery/cases',
          relativeCase,
          'structural/generated-delta.json.gz',
        ),
      ),
    ),
  )
}

const targetLedger = readLedger(caseName)
const latestLedger = readLedger('2.1.114-to-2.1.116')

const baselineUnit = [
  12995,
  9858290,
  9859666,
  'db62137db7488318411520f52f6af0c1617da2e0cbd8ea56acbe73a71f6d27ca',
]
const targetUnit = [
  13097,
  9897274,
  9898860,
  '43b6616be81f72aa7a03ade5183fee1de3ada94765bd095e8b8f6ee8b75d1500',
]
const latestUnit = [
  13892,
  8767821,
  8769508,
  'dd03e77887e0635652e32f1a1d5ebe97c8ee20111cff9b3087eb9d6c18a62f4c',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function authenticatedBundle(filename, expectedSha256, label) {
  assert.ok(filename, `${label} bundle path is required`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedSha256, `${label} bundle identity`)
  return bytes.toString('utf8')
}

function readOwner() {
  return fs.readFileSync(
    path.join(sourceRoot, 'utils/plugins/officialMarketplaceGcs.ts'),
    'utf8',
  )
}

function fetchFunctionSource(owner) {
  const start = owner.indexOf(
    'export async function fetchOfficialMarketplaceFromGcs(',
  )
  assert.notEqual(start, -1, 'fetchOfficialMarketplaceFromGcs declaration')
  const endMarker = '\n}\n\n// Bounded set of errno codes'
  const end = owner.indexOf(endMarker, start)
  assert.notEqual(end, -1, 'fetchOfficialMarketplaceFromGcs boundary')
  return owner.slice(start, end + 2)
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

async function loadFetchHarness(owner) {
  const harness = `
    type SafeString = string;
    const GCS_BASE = 'https://gcs.example/official';
    const ARC_PREFIX = 'marketplaces/claude-plugins-official/';
    const sep = '/';
    const resolve = (value: string) => value;
    const join = (...parts: string[]) => parts.join('/').replace(/\\/+/g, '/');
    const dirname = (value: string) => value.slice(0, value.lastIndexOf('/'));
    const __state = {
      entries: new Set<string>(),
      renames: [] as string[],
      removals: [] as string[],
      events: [] as Array<{ name: string; metadata: Record<string, unknown> }>,
      logs: [] as string[],
      failPromotion: false,
    };
    const errno = (code: string) => Object.assign(new Error(code), { code });
    const waitForScrollIdle = async () => {};
    const axios = {
      get: async (url: string) => url.endsWith('/latest')
        ? { data: 'next-sha' }
        : { data: Buffer.from('zip bytes') },
    };
    const readFile = async () => { throw errno('ENOENT') };
    const rm = async (value: string) => {
      __state.removals.push(value);
      __state.entries.delete(value);
    };
    const mkdir = async (value: string) => { __state.entries.add(value) };
    const writeFile = async (value: string) => { __state.entries.add(value) };
    const chmod = async () => {};
    const rename = async (from: string, to: string) => {
      __state.renames.push(from + ' -> ' + to);
      if (__state.failPromotion && from.endsWith('.staging')) throw errno('EIO');
      if (!__state.entries.has(from)) throw errno('ENOENT');
      __state.entries.delete(from);
      __state.entries.add(to);
    };
    const unzipFile = async () => ({
      'marketplaces/claude-plugins-official/plugin.json': Buffer.from('{}'),
    });
    const parseZipModes = () => ({} as Record<string, number>);
    const getErrnoCode = (error: any) => error?.code;
    const errorMessage = (error: unknown) =>
      error instanceof Error ? error.message : String(error);
    const classifyGcsError = (error: unknown) => getErrnoCode(error) ?? 'other';
    const logForDebugging = (message: string) => { __state.logs.push(message) };
    const logEvent = (name: string, metadata: Record<string, unknown>) => {
      __state.events.push({ name, metadata });
    };
  `
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `${harness}\n${fetchFunctionSource(owner)}\nexport { __state };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'target105 replaces destructive promotion with authenticated backup rollback',
  {
    skip:
      !selected || !baselineBundlePath || !targetBundlePath
        ? 'selected authenticated 104/105 artifacts are required'
        : false,
  },
  () => {
    const baseline = authenticatedBundle(
      baselineBundlePath,
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
      '2.1.104',
    )
    const target = authenticatedBundle(
      targetBundlePath,
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
      '2.1.105',
    )

    const [baselineIndex, baselineStart, baselineEnd, baselineHash] =
      baselineUnit
    const baselineRegion = targetLedger.unmatchedBaseline.find(
      region => region.index === baselineIndex,
    )
    assert.deepEqual(
      [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
      [baselineStart, baselineEnd, baselineHash],
    )
    assert.equal(
      sha256(baseline.slice(baselineStart, baselineEnd)),
      baselineHash,
      'baseline function bytes',
    )

    const [targetIndex, targetStart, targetEnd, targetHash] = targetUnit
    const targetRegion = targetLedger.regions[targetIndex]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.sourceHash,
      ],
      [targetStart, targetEnd, targetHash],
    )
    const targetFunction = target.slice(targetStart, targetEnd)
    assert.equal(sha256(targetFunction), targetHash, 'target function bytes')

    const baselineFunction = baseline.slice(baselineStart, baselineEnd)
    assert.equal(baselineFunction.includes('.backup'), false)
    assert.ok(targetFunction.includes('.backup'))
    assert.match(
      targetFunction,
      /try\{await [\w$]+\(q,Z\),G=!0\}catch\(f\)\{if\([\w$]+\(f\)!=="ENOENT"\)throw f\}/,
    )
    assert.match(
      targetFunction,
      /try\{await [\w$]+\(D,q\)\}catch\(f\)\{if\(G\)await [\w$]+\(Z,q\)\.catch\(\(\)=>\{\}\);throw f\}/,
    )
  },
)

test(
  'authenticated target116 preserves the target105 rollback contract',
  {
    skip:
      !selected || !latestBundlePath
        ? 'selected authenticated 116 artifact is required'
        : false,
  },
  () => {
    const latest = authenticatedBundle(
      latestBundlePath,
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
      '2.1.116',
    )
    const [index, start, end, hash] = latestUnit
    const region = latestLedger.regions[index]
    assert.deepEqual(
      [
        region.classification,
        region.baselineUnitIndex,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      ['matched', 13759, start, end, hash],
    )
    const latestFunction = latest.slice(start, end)
    assert.equal(sha256(latestFunction), hash, 'latest function bytes')
    assert.ok(latestFunction.includes('.backup'))
    assert.match(latestFunction, /!=="ENOENT"/)
    assert.match(
      latestFunction,
      /catch\(W\)\{if\(G\)await [\w$]+\.rename\(P,H\)\.catch\(\(\)=>\{\}\);throw W\}/,
    )
  },
)

test(
  'authored GCS promotion restores the live marketplace when rename fails',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = readOwner()
    const promotion = fetchFunctionSource(owner)
    for (const fragment of [
      'const backup = `${installLocation}.backup`',
      'await rm(backup, { recursive: true, force: true }).catch(() => {})',
      'await rename(installLocation, backup)',
      "if (getErrnoCode(e) !== 'ENOENT') throw e",
      'await rename(staging, installLocation)',
      'await rename(backup, installLocation).catch(() => {})',
    ]) {
      assert.ok(promotion.includes(fragment), fragment)
    }
    assert.ok(
      promotion.indexOf('await rename(installLocation, backup)') <
        promotion.indexOf('await rename(staging, installLocation)'),
    )
    assert.equal(
      promotion.includes(
        'await rm(installLocation, { recursive: true, force: true })',
      ),
      false,
    )

    const api = await loadFetchHarness(owner)
    const install = '/cache/official'
    const staging = `${install}.staging`
    const backup = `${install}.backup`
    api.__state.entries.add(install)
    api.__state.failPromotion = true

    assert.equal(
      await api.fetchOfficialMarketplaceFromGcs(install, '/cache'),
      null,
    )
    assert.equal(api.__state.entries.has(install), true)
    assert.equal(api.__state.entries.has(backup), false)
    assert.deepEqual(api.__state.renames, [
      `${install} -> ${backup}`,
      `${staging} -> ${install}`,
      `${backup} -> ${install}`,
    ])
    assert.equal(api.__state.events.at(-1).metadata.outcome, 'failed')

    api.__state.entries.clear()
    api.__state.renames.length = 0
    api.__state.removals.length = 0
    api.__state.events.length = 0
    api.__state.entries.add(install)
    api.__state.failPromotion = false
    assert.equal(
      await api.fetchOfficialMarketplaceFromGcs(install, '/cache'),
      'next-sha',
    )
    assert.equal(api.__state.entries.has(install), true)
    assert.equal(api.__state.entries.has(backup), false)
    assert.deepEqual(api.__state.renames, [
      `${install} -> ${backup}`,
      `${staging} -> ${install}`,
    ])
    assert.equal(api.__state.events.at(-1).metadata.outcome, 'updated')

    api.__state.entries.clear()
    api.__state.renames.length = 0
    api.__state.removals.length = 0
    api.__state.events.length = 0
    assert.equal(
      await api.fetchOfficialMarketplaceFromGcs(install, '/cache'),
      'next-sha',
    )
    assert.equal(api.__state.entries.has(install), true)
    assert.equal(api.__state.entries.has(backup), false)
    assert.deepEqual(api.__state.renames, [
      `${install} -> ${backup}`,
      `${staging} -> ${install}`,
    ])
    assert.equal(api.__state.events.at(-1).metadata.outcome, 'updated')
  },
)
