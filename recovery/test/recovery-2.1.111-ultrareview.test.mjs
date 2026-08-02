import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const TARGET_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

function bundle(environmentName, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
}

test('recovers dynamic ultrareview configuration and command metadata', () => {
  includesAll(source('src/commands/review/ultrareviewEnabled.ts'), [
    "'tengu_review_bughunter_config'",
    'cost_note?: string',
    'duration_note?: string',
    'model?: string',
    ": '$10-$20'",
    ": '~10–20 min'",
    'export function getUltrareviewModel()',
  ])
  includesAll(source('src/commands/review.ts'), [
    'getUltrareviewDurationNote()',
    'getUltrareviewCostNote()',
    'Est. cost',
    'Runs in Claude Code on the web',
  ])
  includesAll(source('src/commands/review/reviewRemote.ts'), [
    '...(model && { BUGHUNTER_MODEL: model })',
  ])
})

test('uses the authenticated preflight schema and exact confirmation body', () => {
  includesAll(source('src/services/api/ultrareviewQuota.ts'), [
    "action: z.enum(['proceed', 'confirm', 'blocked'])",
    'CLAUDE_CODE_ULTRAREVIEW_PREFLIGHT_FIXTURE',
    'ultrareviewPreflightSchema().safeParse(',
    '/v1/ultrareview/preflight',
    "'x-organization-uuid': orgUUID",
    'timeout: 5000',
  ])
  includesAll(source('src/commands/review/reviewRemote.ts'), [
    'switch (preflight.action)',
    "case 'proceed':",
    "case 'blocked':",
    "case 'confirm':",
    'body: `This review bills as Extra Usage (${getUltrareviewCostNote()}).`',
  ])
})

test('exposes ultrareview launch through the SDK control channel', () => {
  includesAll(source('src/entrypoints/sdk/controlSchemas.ts'), [
    'SDKControlUltrareviewLaunchRequestSchema',
    "subtype: z.literal('ultrareview_launch')",
    'args: z.string().optional()',
    'confirm: z.boolean().optional()',
    'SDKControlUltrareviewLaunchResponseSchema',
    "z.discriminatedUnion('status'",
    "status: z.literal('needs-confirm')",
    "status: z.literal('launched')",
    'sessionId: z.string()',
    'sessionUrl: z.string()',
  ])
  includesAll(source('src/cli/print.ts'), [
    "message.request.subtype === 'ultrareview_launch'",
    "const { args = '', confirm = false } = message.request",
    'const result = await launchUltrareview(args, {',
    'abortController: createAbortController()',
    'sendControlResponseSuccess(message, result)',
  ])
})

test('preflights the branch fork point and preserves the reviewed scope', () => {
  const remote = source('src/commands/review/reviewRemote.ts')
  includesAll(remote, [
    'await isRepoTooLargeForBundle()',
    'mergeBase(`origin/${baseBranch}`)',
    'mergeBase(baseBranch)',
    "['diff', '--shortstat', mergeBaseSha]",
    "It doesn't look like you have any new commits or changes to review",
    "source: 'ultrareview'",
    "tags: ['ultrareview']",
    'bundleBaseRef: mergeBaseSha',
    'sessionId: session.id',
    'sessionUrl,',
    'getUltrareviewDurationNote()',
    'const scopeSuffix = diffStat ? `\\nScope: ${diffStat}` : \'\'',
  ])
  assert.equal(remote.split("source: 'ultrareview'").length - 1, 2)
  assert.equal(remote.split("tags: ['ultrareview']").length - 1, 2)
})

test('carries ultrareview source and tags through remote session creation', () => {
  includesAll(source('src/utils/teleport.tsx'), [
    'source?: string',
    'tags?: string[]',
    'bundleBaseRef?: string',
    'baseRef: options.bundleBaseRef',
    'tags: options.tags',
    "logEvent('tengu_ccr_session_link'",
    'source: options.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS',
  ])
  includesAll(source('src/commands/review/UltrareviewOverageDialog.tsx'), [
    'hasSeenUltrareviewTerms',
    "checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled')",
    'checkIsInGitRepo()',
    'checkGithubAppInstalled(repository.owner, repository.name)',
    'formatReviewSourceViability(',
    'This will try to clone your git remote and fall back to uploading this repository.',
    'This will upload your repository to Claude Code on the web.',
    'sourcePromise ? React.use(sourcePromise) : null',
    'showTerms ? getReviewSourceViability().catch(() => null) : null',
    '<React.Suspense fallback={<Text dimColor>Loading…</Text>}>',
    'Reviewing current branch against',
    'Scope: {scopeStat}',
    'Run ultrareview in the cloud?',
  ])
  includesAll(source('src/utils/config.ts'), ['hasSeenUltrareviewTerms?: boolean'])
})

test('preflights packed size and preserves bundle failure semantics', () => {
  includesAll(source('src/utils/teleport/gitBundle.ts'), [
    "['count-objects', '-v']",
    'export async function isRepoTooLargeForBundle(',
    'inPackCount > 5_000_000',
    "| 'stash_failed'",
    "| 'no_changes'",
    "failReason: 'no_changes'",
    "failReason: 'stash_failed'",
    'opts?: { cwd?: string; signal?: AbortSignal; baseRef?: string }',
  ])
})

test('authenticated adjacent bundles contain the finalized ultrareview flow', () => {
  const baseline = bundle('CLAUDE_CODE_2_1_110_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_111_BUNDLE', TARGET_SHA256)
  for (const fragment of [
    '$10-$20',
    'BUGHUNTER_MODEL',
    'ultrareview_launch',
    'This review bills as Extra Usage (',
    'Repo is too large to bundle. Push a PR and use `/ultrareview <PR#>` instead.',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }
  assert.equal(target.includes('/v1/ultrareview/preflight'), true)
  assert.equal(target.includes('tengu_ccr_session_link'), true)
  assert.equal(
    target.includes(
      'This will try to clone your git remote and fall back to uploading this repository.',
    ),
    true,
  )
})
