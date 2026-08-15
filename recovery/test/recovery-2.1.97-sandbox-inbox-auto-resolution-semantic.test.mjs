import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')

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
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test(
  '2.1.97 evidence pins the complete sandbox-inbox polling unit',
  bundleOptions,
  () => {
    const bundleBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bundleBytes), targetSha256)
    const bundle = bundleBytes.toString('utf8')
    const region = structural.regions[17544]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [
        12344270,
        12353840,
        '7828c2197e284f84842a0aee2df93cd212aa06eb43d4e0f2672cb63d58899ad2',
      ],
    )
    assert.equal(
      sha256(bundle.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
    )

    const unit = bundle.slice(region.target.start, region.target.end)
    for (const fragment of [
      'Auto-resolving sandbox request ${',
      ' (mode=${',
      ', allow=${',
      '.workerName,',
      '.requestId,',
      '.hostPattern.host,',
    ]) {
      assert.ok(unit.includes(fragment), fragment)
    }
    assert.match(
      unit,
      /Auto-resolving sandbox request[\s\S]*sendSandboxPermissionResponseViaMailbox|Auto-resolving sandbox request[\s\S]*\.workerName,[\s\S]*\.requestId,[\s\S]*\.hostPattern\.host/,
    )
  },
)

test(
  'source auto-resolves before queueing and preserves the published mailbox call',
  sourceOptions,
  () => {
    const inbox = assertFragments('src/hooks/useInboxPoller.ts', [
      'sendSandboxPermissionResponseViaMailbox,',
      'currentAppState.toolPermissionContext',
      'currentAppState.teamContext?.teamName',
      'if (autoDecision !== null)',
      '`[InboxPoller] Auto-resolving sandbox request ${parsed.requestId} (mode=${mode}, allow=${autoDecision})`',
      'parsed.workerName,',
      'parsed.requestId,',
      'parsed.hostPattern.host,',
      'autoDecision,',
      'teamName,',
      'newSandboxRequests.push({',
    ])

    const resolve = inbox.indexOf('if (autoDecision !== null)')
    const send = inbox.indexOf(
      'void sendSandboxPermissionResponseViaMailbox(',
      resolve,
    )
    const continueAfterSend = inbox.indexOf('continue', send)
    const queue = inbox.indexOf('newSandboxRequests.push({', resolve)
    assert.ok(resolve >= 0 && resolve < send)
    assert.ok(send < continueAfterSend && continueAfterSend < queue)
  },
)

test(
  'source preserves the target-version permission decision table',
  sourceOptions,
  () => {
    const permissionMode = source('src/utils/permissions/PermissionMode.ts')

    if (isCurrentSource) {
      for (const fragment of [
        "mode === 'auto') return 'classify'",
        "mode === 'bypassPermissions'",
        "mode === 'plan' && isBypassPermissionsModeAvailable",
        "return 'allow'",
        "mode === 'dontAsk') return 'deny'",
        "return 'ask'",
      ]) {
        assert.ok(permissionMode.includes(fragment), fragment)
      }

      const decide = (mode, bypassAvailable) => {
        if (mode === 'auto') return 'classify'
        if (mode === 'bypassPermissions' || (mode === 'plan' && bypassAvailable)) {
          return 'allow'
        }
        if (mode === 'dontAsk') return 'deny'
        return 'ask'
      }
      assert.deepEqual(
        [
          decide('auto', false),
          decide('bypassPermissions', false),
          decide('plan', true),
          decide('dontAsk', false),
          decide('default', false),
          decide('acceptEdits', false),
          decide('plan', false),
        ],
        ['classify', 'allow', 'allow', 'deny', 'ask', 'ask', 'ask'],
      )
      return
    }

    for (const fragment of [
      'getSandboxPermissionAutoDecision(',
      '): boolean | null',
      "mode === 'auto' ||",
      "mode === 'bypassPermissions' ||",
      "mode === 'plan' && isBypassPermissionsModeAvailable",
      'return true',
      "mode === 'dontAsk') return false",
      'return null',
    ]) {
      assert.ok(permissionMode.includes(fragment), fragment)
    }

    const decide = (mode, bypassAvailable) => {
      if (
        mode === 'auto' ||
        mode === 'bypassPermissions' ||
        (mode === 'plan' && bypassAvailable)
      ) {
        return true
      }
      if (mode === 'dontAsk') return false
      return null
    }
    assert.deepEqual(
      [
        decide('auto', false),
        decide('bypassPermissions', false),
        decide('plan', true),
        decide('dontAsk', false),
        decide('default', false),
        decide('acceptEdits', false),
        decide('plan', false),
      ],
      [true, true, true, false, null, null, null],
    )
  },
)

test(
  'current source classifies auto-mode network access and fails closed behind iron-gate',
  { ...sourceOptions, skip: sourceOptions.skip || !isCurrentSource },
  () => {
    const inbox = assertFragments('src/hooks/useInboxPoller.ts', [
      'getSandboxPermissionModeDecision(',
      "case 'classify':",
      'classifySandboxNetworkAccess(',
      'host,',
      'undefined,',
      '[],',
      'getAllBaseTools(),',
      'currentAppState.toolPermissionContext,',
      'new AbortController().signal,',
    ])
    assert.ok(
      inbox.indexOf('const autoDecision = await resolveSandboxRequest(') <
        inbox.indexOf('if (autoDecision !== null)'),
    )

    assertFragments('src/utils/permissions/yoloClassifier.ts', [
      "const SANDBOX_NETWORK_ACCESS_TOOL_NAME = 'SandboxNetworkAccess'",
      'formatActionForClassifier(',
      '{ host, port },',
      'toAutoClassifierInput: (input: unknown) => input',
      '[...tools, classifierTool]',
      "'tengu_iron_gate_closed'",
      'SANDBOX_CLASSIFIER_FAIL_CLOSED_REFRESH_MS',
      'Sandbox network classifier unavailable for ${host}; iron_gate → ${allow',
      'Auto mode classifier blocked sandbox network access to ${host}: ${result.reason}',
    ])
  },
)
