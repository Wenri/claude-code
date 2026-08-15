import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const targetUnits = new Map([
  [
    11759,
    [
      8984748,
      8985381,
      '029f98863aa43cff7fbe85185236afac1c8f117e1ba4c77d649c05342bacb2f3',
      'matched',
    ],
  ],
  [
    11760,
    [
      8985381,
      8986053,
      '25deb0aa23c807174dbc4e7a60e49c5de8f3dfb222ec73aaf19c09c6fe6878e5',
      'unresolved',
    ],
  ],
  [
    11785,
    [
      8996080,
      8997806,
      '82402a1da30cb12bef3e7c9e6683561d39c65e5127ad7a8e24a63da394a4a2ec',
      'unresolved',
    ],
  ],
  [
    11861,
    [
      9027119,
      9033494,
      '8d40c02e0e3d647e4ebc1c87625e8f316ea836ff60e8dead4a56a9a217471b2d',
      'unresolved',
    ],
  ],
  [
    16902,
    [
      12059105,
      12068729,
      'eedb5a256e144d0019fd0a9ecf15eee2b55b700c668793883194360cc12c94f5',
      'unresolved',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
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

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target101 pins the complete remote-ingress structural graph', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, identity[3], `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity.slice(0, 3),
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('remote authorization, environment creation, and bridge status enter at 101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'teleport_events_forbidden',
    'This session requires a trusted device. Run /login to enroll this device, then retry.',
    '[teleportToRemote] Auto-created default cloud env',
    'Could not create a cloud environment. Set one up at https://claude.ai/code/onboarding?magic=env-setup',
    'Remote Control failed to connect. Run /remote-control to retry.',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.equal(
    target.includes('late response after local resolve, or unknown id'),
    true,
  )
})

test('source owns the authenticated remote-ingress control flow', sourceOptions, () => {
  const ingress = assertFragments('src/services/api/sessionIngress.ts', [
    'trustedDeviceToken?: string',
    "headers['X-Trusted-Device-Token'] = trustedDeviceToken",
    "logForDiagnosticsNoPII('error', 'teleport_events_forbidden')",
    "errorData?.error?.resource === 'untrusted_device'",
    'new TeleportOperationError(message, message)',
    "'Access denied fetching session events'",
  ])
  assert.ok(
    ingress.indexOf("response.status === 401") <
      ingress.indexOf("response.status === 403"),
  )

  const environments = assertFragments('src/utils/teleport/environments.ts', [
    "name = 'Default'",
    'signal?: AbortSignal',
    "description: 'Default - trusted network access'",
    'signal,',
    'throw err',
  ])
  assert.ok(environments.indexOf('timeout: 15000') < environments.indexOf('signal,'))

  const teleport = assertFragments('src/utils/teleport.tsx', [
    'createDefaultCloudEnvironment(undefined, signal)',
    "'[teleportToRemote] Auto-created default cloud env'",
    "'Could not create a cloud environment. Set one up at https://claude.ai/code/onboarding?magic=env-setup', 'env_create'",
    "options.onBundleFail?.(msg, 'bundle')",
    'configuredEnvironment || cloudEnv ||',
  ])
  const teleportFunction = teleport.slice(
    teleport.indexOf('export async function teleportToRemote(options'),
  )
  const environmentIndex = teleportFunction.indexOf(
    'let environments = await fetchEnvironments()',
  )
  assert.ok(
    environmentIndex <
      teleportFunction.indexOf(
        'const repoInfo = await detectCurrentRepositoryWithHost()',
        environmentIndex,
      ),
    'environment provisioning must precede repository work',
  )

  const bridge = assertFragments('src/hooks/useReplBridge.tsx', [
    'const lastFailureDetailRef = useRef<string | undefined>(undefined)',
    'function notifyBridgeFailed(detail?: string, wasConnected = false)',
    'wasConnected=${wasConnected}',
    "wasConnected ? 'disconnected' : 'failed'",
    "wasConnected && detail ? detail : '/remote-control'",
    'Remote Control failed to connect. Run /remote-control to retry.',
    'notifyBridgeFailed(detail_0, handleRef.current !== null)',
    'pendingPermissionHandlers.delete(requestId_2)',
    'display_name: bridgeToolDisplayName(toolName)',
    'lastFailureDetailRef.current = undefined',
  ])
  assert.equal(
    bridge.match(/Remote Control failed to connect: \$\{errMsg\}/g)?.length ?? 0,
    0,
    'catch path must not append a second failure message',
  )
  if (isCurrentSource) {
    assert.ok(bridge.includes('enableSessionPersistence: outboundOnly'))
  } else {
    assert.ok(bridge.includes('enableSessionPersistence: false'))
  }
})
