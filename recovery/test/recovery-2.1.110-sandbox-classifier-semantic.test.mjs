import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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

const pinnedUnits = new Map([
  [2542, [1005435, 1005582, 'FunctionDeclaration', 'daf92dd79003df77244f0efebe820c52905be4545fd888126d72612aec95f637']],
  [10792, [8324185, 8339620, 'VariableDeclaration', '792c50183fa15518eb476f0ec3e26ac042964b0518a12851bab92954e44e49fe']],
  [10830, [8353173, 8353602, 'FunctionDeclaration', '9d0d2f0bdbf23dcc0ebaaa3f2c07032597f326823298da0641d8cb21ff154b34']],
  [18324, [12494627, 12504444, 'FunctionDeclaration', '995cdade81c68f458e3ecf239b0b2ee4dafd12782c1a7c950b62170b4b3c0fe4']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target110 authenticates policy, classifier, mode, and inbox call path',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, nodeType, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
        [start, end, nodeType, sourceHash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    const policyUnit = target.slice(8324185, 8339620)
    const firstTick = policyUnit.indexOf('`')
    const lastTick = policyUnit.lastIndexOf('`')
    assert.ok(firstTick >= 0 && lastTick > firstTick)
    const cookedPolicy = vm.runInNewContext(
      policyUnit.slice(firstTick, lastTick + 1),
      Object.create(null),
    )
    assert.equal(
      sha256(cookedPolicy),
      '808c9f533eb6eea05e3d6375da1dccf86ab0b4c1fb2084f3f316103c82e84eb9',
    )

    const classifier = target.slice(8353173, 8353602)
    for (const fragment of [
      'tengu_iron_gate_closed',
      'Sandbox network classifier unavailable for ',
      '; iron_gate → ',
      'Auto mode classifier blocked sandbox network access to ',
    ]) {
      assert.ok(classifier.includes(fragment), fragment)
    }
    const inbox = target.slice(12494627, 12504444)
    assert.ok(inbox.includes('case"classify":'))
    assert.ok(inbox.includes('new AbortController().signal'))
    assert.ok(inbox.includes('Auto-resolving sandbox request'))
    assert.equal(
      baselineBytes
        .toString('utf8')
        .includes('Sandbox network classifier unavailable for '),
      false,
    )
  },
)

test(
  'source owns the exact external policy and fail-closed classifier graph',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const classifier = source('utils/permissions/yoloClassifier.ts')
    const policyAsset = source(
      'utils/permissions/yolo-classifier-prompts/permissions_external.txt',
    )
    // The tracked current asset carries a patch-friendly final newline and
    // txtRequire removes exactly one. The target-110 historical supplement
    // stores the already-cooked asset and therefore uses it directly.
    const policy = classifier.includes("text.endsWith('\\n')")
      ? policyAsset.replace(/\n$/, '')
      : policyAsset
    assert.equal(policy.length, 15314)
    assert.equal(
      sha256(policy),
      '808c9f533eb6eea05e3d6375da1dccf86ab0b4c1fb2084f3f316103c82e84eb9',
    )

    for (const fragment of [
      "const SANDBOX_NETWORK_ACCESS_TOOL_NAME = 'SandboxNetworkAccess'",
      'const SANDBOX_CLASSIFIER_FAIL_CLOSED_REFRESH_MS = 1_800_000',
      'export async function classifySandboxNetworkAccess(',
      "'tengu_iron_gate_closed'",
      'SANDBOX_CLASSIFIER_FAIL_CLOSED_REFRESH_MS',
      'result.unavailable',
      "result.unavailable\n    ? !getFeatureValue_CACHED_WITH_REFRESH(",
      'Sandbox network classifier unavailable for ${host}; iron_gate → ${allow',
      'Auto mode classifier blocked sandbox network access to ${host}: ${result.reason}',
    ]) {
      assert.ok(classifier.includes(fragment), fragment)
    }

    const mode = source('utils/permissions/PermissionMode.ts')
    for (const fragment of [
      "| 'classify'",
      'export function getSandboxPermissionModeDecision(',
      "if (mode === 'auto') return 'classify'",
      "if (mode === 'dontAsk') return 'deny'",
      "return 'ask'",
    ]) {
      assert.ok(mode.includes(fragment), fragment)
    }

    const inbox = source('hooks/useInboxPoller.ts')
    for (const fragment of [
      'getSandboxPermissionModeDecision(',
      "case 'classify':",
      'return classifySandboxNetworkAccess(',
      'new AbortController().signal',
      'const autoDecision = await resolveSandboxRequest(',
      'sendSandboxPermissionResponseViaMailbox(',
    ]) {
      assert.ok(inbox.includes(fragment), fragment)
    }
  },
)
