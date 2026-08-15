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
  [15146, ['FunctionDeclaration', 11186968, 11187505, 'e05dff56e0e231e63dffb708ab6bdc7254876bacdcf2f58971bffeb1b4f9ff7f']],
  [15148, ['VariableDeclaration', 11187513, 11187866, '5b4881408faf84ffb78730c13e491ef791bde2ee64821c120f6b1357dec351e5']],
  [15150, ['FunctionDeclaration', 11187888, 11188534, 'c731cc5699f23bb5bb39b164addadf0da82161a2ae2880d895fc51d461990215']],
  [15151, ['FunctionDeclaration', 11188534, 11191317, '39402a993c8efe9989d47243987e6310d1a9266725dd5a69572f1cce3967adb0']],
  [15154, ['FunctionDeclaration', 11191386, 11192550, '5a9ee7877c956179bcb6c32bec3a1371fa7066fe6f923b25bdd07b81d2872fa2']],
  [15161, ['VariableDeclaration', 11192961, 11193532, 'bbc358c62b35e6f8d01329aacee237a266b15b7dd4632714f29bd1414b5fcf13']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
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

async function executeReviewRemote(contents, preflight) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const events = []
  const noop = () => undefined
  const fallback = new Proxy({}, { get: () => noop })
  const require = id => {
    if (id.endsWith('/services/api/ultrareviewQuota.js')) {
      return { fetchUltrareviewPreflight: async () => preflight }
    }
    if (id.endsWith('/services/analytics/index.js')) {
      return { logEvent: (name, metadata) => events.push([name, metadata]) }
    }
    if (id.endsWith('/ultrareviewEnabled.js')) {
      return {
        getUltrareviewCostNote: () => '$10-$20',
        getUltrareviewConfig: () => null,
        getUltrareviewDurationNote: () => '~10–20 min',
        getUltrareviewModel: () => undefined,
        isUltrareviewEnabled: () => true,
      }
    }
    return fallback
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'process', javascript)(
    require,
    module.exports,
    module,
    process,
  )
  return { exports: module.exports, events }
}

test(
  'authenticated target105 pins the preflight, gate, launch, dialog, and command units',
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

    for (const [index, [nodeType, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.equal(region.target.index, index, `${index}: target index`)
      assert.equal(region.target.nodeType, nodeType, `${index}: node type`)
      assert.equal(region.target.parseStatus, 'parsed', `${index}: parse`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.ok(target.slice(11186968, 11187505).includes('CLAUDE_CODE_ULTRAREVIEW_PREFLIGHT_FIXTURE'))
    assert.ok(target.slice(11186968, 11187505).includes('/v1/ultrareview/preflight'))
    assert.ok(target.slice(11187513, 11187866).includes('billing_note'))
    assert.ok(target.slice(11187513, 11187866).includes('action_url'))
    assert.ok(target.slice(11187888, 11188534).includes('This review bills as usage (~$10).'))
    assert.ok(target.slice(11188534, 11191317).includes('bundleBaseRef'))
    assert.ok(target.slice(11191386, 11192550).includes('label:"Proceed"'))
    assert.ok(target.slice(11192961, 11193532).includes('Run /extra-usage'))
    assert.ok(target.slice(11192961, 11193532).includes('Ultrareview cancelled.'))

    for (const fragment of [
      '/v1/ultrareview/preflight',
      'CLAUDE_CODE_ULTRAREVIEW_PREFLIGHT_FIXTURE',
      'billing_note',
      'tengu_review_overage_blocked',
      'This review bills as usage (~$10).',
      'Run /extra-usage to request this from your admin.',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline104`)
      assert.equal(target.includes(fragment), true, `${fragment}: target105`)
    }
    for (const fragment of [
      '/v1/ultrareview/preflight',
      'CLAUDE_CODE_ULTRAREVIEW_PREFLIGHT_FIXTURE',
      'billing_note',
      'tengu_review_overage_blocked',
      'Run /extra-usage to request this from your admin.',
    ]) assert.ok(latest.includes(fragment), `${fragment}: target116`)

    assert.ok(baseline.includes('/v1/ultrareview/quota'))
    assert.equal(target.includes('/v1/ultrareview/quota'), false)
    assert.equal(latest.includes('/v1/ultrareview/quota'), false)
    assert.equal(target.includes('reason:"zdr"'), false)
    assert.ok(latest.includes('reason:"zdr"'))
    assert.equal(target.includes('hasSeenUltrareviewTerms'), false)
    assert.ok(latest.includes('hasSeenUltrareviewTerms'))
  },
)

test(
  'source root owns target105 preflight semantics and preserves target116 evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const quota = source('services/api/ultrareviewQuota.ts')
    const remote = source('commands/review/reviewRemote.ts')
    const dialog = source('commands/review/UltrareviewOverageDialog.tsx')
    const command = source('commands/review/ultrareviewCommand.tsx')
    const target105Mode = quota.includes('!isClaudeAISubscriber()')

    for (const fragment of [
      "action: z.enum(['proceed', 'confirm', 'blocked'])",
      'CLAUDE_CODE_ULTRAREVIEW_PREFLIGHT_FIXTURE',
      'safeParseJSON(fixture)',
      '/v1/ultrareview/preflight',
      "'x-organization-uuid': orgUUID",
      'timeout: 5000',
      'fetchUltrareviewPreflight schema mismatch',
    ]) assert.ok(quota.includes(fragment), `quota: ${fragment}`)
    assert.equal(quota.includes('fetchUltrareviewQuota'), false)
    assert.equal(quota.includes('/v1/ultrareview/quota'), false)
    for (const fragment of [
      'fetchUltrareviewPreflight()',
      'switch (preflight.action)',
      "case 'blocked':",
      "case 'confirm':",
      "source: 'ultrareview'",
      'bundleBaseRef: mergeBaseSha',
    ]) assert.ok(remote.includes(fragment), `remote: ${fragment}`)
    for (const fragment of [
      'abortControllerRef.current.abort()',
      "onDone('Ultrareview cancelled.'",
      "gate.actionUrl?.includes('/admin-settings/')",
      'extraUsage.isEnabled()',
      '!hasClaudeAiBillingAccess()',
    ]) assert.ok(`${dialog}\n${command}`.includes(fragment), `ui: ${fragment}`)

    if (target105Mode) {
      assert.ok(quota.includes('isEssentialTrafficOnly() || !isClaudeAISubscriber()'))
      assert.ok(quota.includes('title: z.string()'))
      assert.equal(quota.includes('reason: z.string().optional()'), false)
      assert.ok(remote.includes('? ` ${preflight.billing_note}`'))
      assert.ok(remote.includes("title: preflight.confirm?.title ?? 'This review bills as usage'"))
      assert.ok(remote.includes("preflight.confirm?.body ?? 'This review bills as usage (~$10).'"))
      assert.ok(remote.includes("logEvent('tengu_review_overage_dialog_shown', {})"))
      assert.ok(dialog.includes('title: string'))
      assert.ok(dialog.includes('body: string'))
      assert.ok(dialog.includes("{ label: 'Proceed', value: 'proceed' }"))
      assert.ok(dialog.includes('<Dialog title={title}'))
      assert.ok(command.includes('title={gate.title}'))
      assert.equal(remote.includes('prepareRemoteReviewScope'), false)
    } else {
      assert.ok(quota.includes("reason: 'zdr'"))
      assert.ok(quota.includes("reason: 'no_oauth_token'"))
      assert.ok(quota.includes('reason: z.string().optional()'))
      assert.ok(remote.includes('prepareRemoteReviewScope'))
      assert.ok(remote.includes('getUltrareviewCostNote()'))
      assert.ok(command.includes("isPolicyAllowed('allow_remote_sessions')"))
      assert.ok(dialog.includes('hasSeenUltrareviewTerms'))
      assert.ok(dialog.includes('Run ultrareview in the cloud?'))
    }
  },
)

test(
  'executable gate follows target105 and target116 preflight contracts',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const remote = source('commands/review/reviewRemote.ts')
    const target105Mode = source('services/api/ultrareviewQuota.ts').includes(
      '!isClaudeAISubscriber()',
    )

    const failOpen = await executeReviewRemote(remote, null)
    assert.deepEqual(await failOpen.exports.checkOverageGate(), {
      kind: 'proceed',
      billingNote: '',
    })

    const blocked = await executeReviewRemote(remote, {
      action: 'blocked',
      blocked: { message: 'Ask an admin', action_url: 'https://example.test' },
    })
    const blockedGate = await blocked.exports.checkOverageGate()
    assert.equal(blockedGate.kind, 'blocked')
    assert.equal(blockedGate.message, 'Ask an admin')
    assert.equal(blockedGate.actionUrl, 'https://example.test')
    if (target105Mode) {
      assert.deepEqual(blocked.events, [
        ['tengu_review_overage_blocked', {}],
      ])
    } else {
      assert.equal(blockedGate.reason, 'server')
      assert.deepEqual(blocked.events, [])
    }

    const confirmation = await executeReviewRemote(remote, {
      action: 'confirm',
      billing_note: 'Metered billing',
      confirm: { title: 'Confirm charge', body: 'Proceed with billing?' },
    })
    const firstGate = await confirmation.exports.checkOverageGate()
    if (target105Mode) {
      assert.deepEqual(firstGate, {
        kind: 'needs-confirm',
        title: 'Confirm charge',
        body: 'Proceed with billing?',
        billingNote: ' Metered billing',
      })
      assert.deepEqual(confirmation.events, [
        ['tengu_review_overage_dialog_shown', {}],
      ])
    } else {
      assert.deepEqual(firstGate, {
        kind: 'needs-confirm',
        body: 'This review bills as Extra Usage ($10-$20).',
        billingNote: 'Metered billing',
      })
      assert.deepEqual(confirmation.events, [])
    }
    confirmation.exports.confirmOverage()
    assert.deepEqual(await confirmation.exports.checkOverageGate(), {
      kind: 'proceed',
      billingNote: target105Mode ? ' Metered billing' : 'Metered billing',
    })
  },
)
