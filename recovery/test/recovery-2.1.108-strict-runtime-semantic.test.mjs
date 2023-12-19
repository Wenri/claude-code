import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historicalTarget108 = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT && semanticCase === caseName,
)
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
      : false,
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

const units = new Map([
  [2559, [1038944, 1039002, '0ebaf1e5cfd235554774e2e90a58414df68deda6d6a4e0ee8e1a2d949fe5859b']],
  [2560, [1039002, 1039078, '9145b228f56fe9b83ff9b8a86e7d2d458f478fd135d060c32d806a2783525d8c']],
  [2561, [1039078, 1039167, '787050f12bec001dbb4172be1641b1e6098a1c342b07c946a57a4039f69fc327']],
  [2562, [1039167, 1039258, 'e013cbe7c84d9d94b1b2625fd69a6860560285d02f5f2c7aaa0d7d477ee4e2f0']],
  [2564, [1039274, 1040781, '1056a79885198d4979e36acbff112662b6e48b43b622c047f0fb047bf45a0614']],
  [4915, [3701036, 3701071, '914c94fb2a282e9094f338c55a75d1e76ebc73c10a27d9e138ae4ebc9c002743']],
  [4920, [3702151, 3702788, '1af972a2cc07cbd722cedb4187c0b439a80e3d8c3ff52785e1f138b615aefebd']],
  [4921, [3702788, 3702832, 'f324316aa8ba752da9b537defd5d951376becab81ed3046a68d47d0959a4ac7d']],
  [4954, [3707728, 3710418, '99932e244affba7ddb95a4338d721751a277ffb5a80f24e5c7a0a6ea84584874']],
  [8927, [6820186, 6821588, '675b58b4e54f50c2f24020442f93509b714e9ce7af9929b2755a8e2ebf42762f']],
  [9210, [6930973, 6931129, '11be9232948a81e7aa73a97edfa3f23dd7128594b9681e8afa08c8f9a0db8dcd']],
  [9211, [6931129, 6931407, '0875b1fbc16a50e2279cc9dfc547b382f023dce9db82f05199a62726ba946576']],
  [9212, [6931407, 6931443, '550b924eb80ed2329f5204d7ba1a5bb4251c1af60b1cfbb4ce31052fd9d597cb']],
  [9213, [6931443, 6931496, 'd75cdffa822866f9b9a1c653cf20d1f1df32bd18edf16feae8b1b70ef9982147']],
  [9214, [6931496, 6931641, '41bacaa4277d88b6eea416a303967796ed8e744866ec415fa712afb59c47d5b7']],
  [11203, [8518598, 8518791, 'b3d4a28fd788133a562224bfa1d1a091eddd96f7344c5733adebebee2c3809ae']],
  [11204, [8518791, 8520742, '161dd699040514eca19e2974f8789ce007f4a4107a370cc885ab82125706874c']],
  [14065, [10125935, 10129255, 'a8788c57af0ce7b6b42f6bb2ae3a2499b0937002f832b3589a05d7d7083a589a']],
  [14457, [10502290, 10502358, '6ed08d2a4b914766c7850dfdc093d9678d747f4b45499e47b184d5b182dd6052']],
  [16677, [11671536, 11672331, 'c976066ccf060b2ca64ac291a5415d51beed907bd0640ef295dded3ad48f980d']],
  [17859, [12297833, 12298178, '06c627d93f38addc47b1a2a84623ad865d00dd391d838b0baf5a9477e8b0f997']],
  [17861, [12298195, 12298974, '6c7780374f971aaaa320c71408bce1543dabc2c458a76b93711aaec5c4caf063']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target 2.1.108 pins the strict settings, snapshot, bundle, input, hook, and PR units', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  const snapshot = target.slice(6820186, 6821588)
  assert.match(snapshot, /let O=JTz\(\);if\(O!==null\)/)
  assert.ok(target.includes('function JTz(){return null}'))
})

test('settings source owns the target 2.1.108 gated registry surface', sourceOptions, () => {
  assertFragments('src/utils/settings/featureRegistry.ts', [
    "'autoMode'",
    "'deepLink'",
    "'voice'",
    "'assistant'",
    "'briefView'",
    'SETTING_FEATURE_REGISTRY[key].buildGate()',
    'SETTING_FEATURE_REGISTRY[feature].shape()',
    'SETTING_FEATURE_REGISTRY[feature].permissionsShape?.()',
    'SETTING_FEATURE_REGISTRY[feature].permissionModes?.() ?? []',
    'EXTERNAL_PERMISSION_MODES.includes(mode)',
    'buildGate: () => false',
  ])
  assertFragments('src/utils/settings/types.ts', [
    'buildPermissionsSchema(getEnabledSettingFeatures())',
    'getSettingFeaturePermissionModes(features)',
    'getSettingFeaturePermissionsShape(features)',
    'buildSettingsSchema(getEnabledSettingFeatures())',
    'getSettingFeatureShape(features)',
    'skipAutoPermissionPrompt',
    'useAutoModeDuringPlan',
    'disableAutoMode',
    'disableDeepLinkRegistration',
    'voiceEnabled',
    'defaultView',
  ])
})

test('official MCP registry and analytics metadata own their target108 state and coach-mode deltas', sourceOptions, () => {
  assertFragments('src/services/mcp/officialRegistry.ts', [
    'function createOfficialRegistryState()',
    'const officialRegistryState = createOfficialRegistryState()',
    "'tengu_mcp_directory_bff'",
    "const source = useDirectoryBff ? 'bff' : 'legacy'",
    'const visibilities = getDirectoryVisibilities()',
    'officialRegistryState.urls = new Set()',
    'empty_visibility: true',
    'useDirectoryBff',
    'await fetchDirectoryBffUrls(visibilities)',
    'await fetchLegacyRegistryUrls(visibilities)',
    'officialRegistryState.urls = urls',
    'officialRegistryState.urls?.has(normalizedUrl) ?? false',
  ])
  assertFragments('src/services/analytics/metadata.ts', [
    'coachMode',
    'coach_mode: coachMode',
  ])
})

test('CLI highlight source owns recursive emitter rendering and language lookup', sourceOptions, () => {
  assertFragments('src/utils/cliHighlight.ts', [
    'function renderNode(node: HljsNode | string)',
    "scope.replace(/^hljs-/, '')",
    'const language = ensureLanguage(requestedLanguage)',
    'ignoreIllegals: true',
    'result._emitter ?? result.emitter',
    'emitter?.rootNode ?? emitter?.root',
    'root.children.map(renderNode).join',
    'supportsLanguage: language => ensureLanguage(language) !== null',
    'cliHighlightPromise ??= Promise.resolve(cliHighlight)',
    "extname(file_path).slice(1)",
    "return getHljsCore().getLanguage(language)?.name ?? 'unknown'",
  ])
})

test('git bundle source preserves target108 fallback and current116 hard-stop evolution', sourceOptions, () => {
  const contents = assertFragments('src/utils/teleport/gitBundle.ts', [
    "['count-objects', '-v']",
    '/^size-pack:\\s*(\\d+)/m',
    'Number(sizePack[1]) * 1024',
    "['commit-tree', `${baseRef}^{tree}`, '-m', 'seed-base']",
    'baseRef commit-tree failed',
    'skipping --all',
    'retrying HEAD-only',
    'retrying squashed-root',
  ])
  if (historicalTarget108) {
    assert.ok(!contents.includes('/^in-pack:\\s*(\\d+)/m'))
    assert.ok(!contents.includes('skipSquashed'))
  } else {
    assert.ok(contents.includes('/^in-pack:\\s*(\\d+)/m'))
    assert.ok(contents.includes('skipSquashed'))
    assert.ok(contents.includes('5_000_000'))
  }
})

test('search input source owns multiline, paste, cursor, and kill-ring semantics', sourceOptions, () => {
  const search = assertFragments('src/hooks/useSearchInput.ts', [
    'onSpaceOnEmpty',
    'killRing: providedKillRing',
    'providedKillRing ?? contextKillRing',
    "e.text.replace(/\\r\\n|\\r/g, '\\n')",
    "e.text.split(/\\r\\n|\\r|\\n/, 2)[0] ?? ''",
    "killRing.dispatch({ type: 'kill'",
    'getLastKill(killRing.state)',
    "killRing.dispatch({ type: 'yankPop' })",
    'handlePaste',
  ])
  assertFragments('src/context/killRing.tsx', [
    "type: 'kill'",
    "type: 'yanked'",
    "type: 'yankPop'",
    'export function KillRingProvider',
  ])
  if (historicalTarget108) {
    assert.ok(search.includes('useInput('))
    assert.ok(search.includes('new KeyboardEvent(event.keypress)'))
    assert.ok(search.includes("e.name === 'return'"))
  } else {
    assert.ok(search.includes("e.name === 'return'"))
    assert.ok(search.includes('const queryRef = useRef(query)'))
    assert.ok(search.includes('const cursorOffsetRef = useRef(cursorOffset)'))
  }
})

test('punctuation and async stop-hook output have exact reachable owners', sourceOptions, () => {
  assertFragments('src/components/PromptInput/utils.ts', [
    'export function isLeadingPunctuation',
    "'.,?!:;)]'.includes(input.charAt(0))",
  ])
  assertFragments('src/components/PromptInput/PromptInput.tsx', [
    'pendingSpaceAfterPillRef.current = false',
    'isNonSpacePrintable(input, key) && !isLeadingPunctuation(input)',
    "return ' ' + input",
  ])
  assertFragments('src/utils/hooks.ts', [
    'await new Promise(resolve => setImmediate(resolve))',
    'const summary = \'Stop hook feedback\'',
    '<${TASK_NOTIFICATION_TAG}>',
    '<${SUMMARY_TAG}>${escapeXml(summary)}</${SUMMARY_TAG}>',
    "mode: 'task-notification'",
    'stopHookActive: true',
  ])
})

test('PR source owns target108 status normalization and current116 additions evolution', sourceOptions, () => {
  const contents = assertFragments('src/utils/ghPrStatus.ts', [
    'export function summarizePrChecks',
    "conclusion === 'NEUTRAL'",
    "conclusion === 'ACTION_REQUIRED'",
    "check.status?.toUpperCase() !== 'COMPLETED'",
    "data.mergeStateStatus === 'HAS_HOOKS'",
    "data.mergeStateStatus === 'UNSTABLE'",
    '30_000',
  ])
  if (historicalTarget108) {
    assert.ok(contents.includes('throw new Error(`gh pr view failed (exit ${code})`)'))
    assert.ok(!contents.includes("'additions,deletions'"))
  } else {
    assert.ok(contents.includes('if (code !== 0 || !stdout.trim()) return null'))
    assert.ok(contents.includes('additions,deletions'))
    assert.ok(contents.includes('additions: data.additions'))
    assert.ok(contents.includes('deletions: data.deletions'))
  }
})
