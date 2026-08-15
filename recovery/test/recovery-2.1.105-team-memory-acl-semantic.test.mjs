import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
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
  [12486, [9570387, 9570560, '994ec1c1cb4657f32470c66005249e7b7dde43cb00e7f8cd56844a9e6417ab3f']],
  [12487, [9570560, 9571775, 'a6bf7b586e8f1a4621329179dc897fce2a5cbea6930d325c66d56ee87a03a1f0']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(contents, name, prefix = 'function') {
  const start = contents.indexOf(`${prefix} ${name}`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated`)
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

test(
  'target105 pins structured team-memory ACL suppression',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.includes('team_memory_group_acl_denied'), false)
    assert.equal(target.includes('team_memory_group_acl_denied'), true)

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(target.slice(identity[0], identity[1])),
        identity[2],
        `${index}: target bytes`,
      )
    }

    const permanent = target.slice(9570387, 9570560)
    assert.match(permanent, /errorType==="no_oauth"/)
    assert.equal(permanent.includes('no_repo'), false)
    const watcher = target.slice(9570560, 9571775)
    for (const fragment of [
      'serverErrorCode??',
      'team_memory_group_acl_denied',
      'team_memory_group_acl_unconfigured',
      'Team memory is restricted to specific groups for your organization.',
      'Contact your administrator for access.',
      'tengu_team_mem_push_suppressed',
    ]) {
      assert.ok(watcher.includes(fragment), fragment)
    }
  },
)

test(
  'authored watcher prioritizes structured ACL reasons and does not suppress no-repo',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = source('services/teamMemorySync/watcher.ts')
    for (const fragment of [
      "if (r.errorType === 'no_oauth') return true",
      'result.serverErrorCode ??',
      "result.serverErrorCode === 'team_memory_group_acl_denied'",
      "result.serverErrorCode === 'team_memory_group_acl_unconfigured'",
      "result.serverMessage || 'Team memory is restricted to specific groups for your organization.'",
      'Contact your administrator for access.',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    assert.equal(
      owner.includes(
        "r.errorType === 'no_oauth' || r.errorType === 'no_repo'",
      ),
      false,
    )

    const snippets = [
      functionSource(owner, 'isPermanentFailure', 'export function'),
      functionSource(owner, 'executePush', 'async function'),
    ]
    const harness = `
      type TeamMemorySyncPushResult = any;
      type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = string;
      const __harness = { logs: [] as string[], events: [] as any[], next: null as any };
      const logForDebugging = (message: string, _options?: unknown) => { __harness.logs.push(message) };
      const logEvent = (name: string, fields: unknown) => { __harness.events.push({ name, fields }) };
      const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
      const UNLINK_RECOVERABLE_REASONS = new Set(['http_413']);
      let syncState: any = {};
      let pushInProgress = false;
      let hasPendingChanges = true;
      let currentPushPromise: Promise<void> | null = null;
      let pushSuppressedReason: string | null = null;
      const pushTeamMemory = async (_state: unknown) => __harness.next;
    `
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `${harness}\n${snippets.join('\n')}\n` +
        `export { __harness, executePush };\n` +
        `export const __reason = () => pushSuppressedReason;`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    const api = module.exports

    assert.equal(api.isPermanentFailure({ errorType: 'no_oauth' }), true)
    assert.equal(api.isPermanentFailure({ errorType: 'no_repo' }), false)
    assert.equal(api.isPermanentFailure({ httpStatus: 403 }), true)
    assert.equal(api.isPermanentFailure({ httpStatus: 409 }), false)
    assert.equal(api.isPermanentFailure({ httpStatus: 429 }), false)
    assert.equal(api.isPermanentFailure({ httpStatus: 500 }), false)

    api.__harness.next = {
      success: false,
      filesUploaded: 0,
      error: 'forbidden',
      errorType: 'forbidden',
      httpStatus: 403,
      serverErrorCode: 'team_memory_group_acl_denied',
    }
    await api.executePush()
    assert.equal(api.__reason(), 'team_memory_group_acl_denied')
    assert.ok(
      api.__harness.logs.includes(
        'team-memory-watcher: Team memory is restricted to specific groups for your organization. Contact your administrator for access.',
      ),
    )
    assert.ok(
      api.__harness.logs.some(message =>
        message.includes(
          'suppressing retry',
        ) && message.includes('(team_memory_group_acl_denied)'),
      ),
    )
    assert.equal(
      api.__harness.events[0].name,
      'tengu_team_mem_push_suppressed',
    )
    assert.equal(
      api.__harness.events[0].fields.reason,
      'team_memory_group_acl_denied',
    )
    assert.equal(api.__harness.events[0].fields.status, 403)
    if ('server_error_code' in api.__harness.events[0].fields) {
      assert.equal(
        api.__harness.events[0].fields.server_error_code,
        'team_memory_group_acl_denied',
      )
    }
  },
)

test(
  'target116 retains the target105 ACL policy boundary',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.equal((latest.match(/team_memory_group_acl_denied/g) ?? []).length, 1)
    const at = latest.indexOf('team_memory_group_acl_denied')
    const graph = latest.slice(at - 700, at + 1300)
    assert.match(graph, /serverErrorCode\?\?/)
    assert.match(graph, /team_memory_group_acl_unconfigured/)
    assert.match(
      graph,
      /Team memory is restricted to specific groups for your organization\./,
    )
    assert.match(graph, /Contact your administrator for access\./)
  },
)
