import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
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

const pins = new Map([
  [
    16911,
    [
      12_079_286,
      12_081_569,
      '58c55d616a00ecc150792b1ce2b0ab572a2f56789de79225403d6e10b0286628',
    ],
  ],
  [
    16912,
    [
      12_081_569,
      12_081_734,
      'ffecf1540e7df78bf923e0e452ede07d706409b97310e22b8f1fbf0efa98ea98',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target92 pins the reachable uncached-token warning helper and UI effect',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    for (const [index, [start, end, sourceHash]] of pins) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }
    for (const fragment of [
      'tengu_amber_swift',
      '!=="pro"',
      'setInterval(E,30000)',
      'if(q<mlY)return null',
      'if(_-K<=Ly8)return null',
      '`~${Math.round(q/1000)}k uncached · /clear to start fresh`',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'materialized target92 source owns every uncached-token warning branch',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'components/PromptInput/Notifications.tsx'),
      'utf8',
    )
    for (const fragment of [
      'const UNCACHED_TOKEN_WARNING_THRESHOLD = 50_000',
      'const UNCACHED_TOKEN_WARNING_IDLE_MS = 3_600_000',
      'export function formatUncachedTokenWarning(',
      'if (lastApiCompletionTimestamp === null) return null',
      'if (tokenUsage < UNCACHED_TOKEN_WARNING_THRESHOLD) return null',
      'if (now - lastApiCompletionTimestamp <= UNCACHED_TOKEN_WARNING_IDLE_MS)',
      '`~${Math.round(tokenUsage / 1000)}k uncached · /clear to start fresh`',
      "getSubscriptionType() !== 'pro'",
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_swift', false)",
      'getLastApiCompletionTimestamp()',
      'setInterval(updateWarning, 30_000)',
      '{uncachedTokenWarning}',
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
  },
)
