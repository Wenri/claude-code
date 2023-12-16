import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const TARGET_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'

const expected = [
  {
    index: 4038,
    target: [
      1919213,
      1919290,
      'VariableDeclaration',
      '62263a4abeaaf65eebaad5f9934c30708ddcca51c3b487802aa449ddac7ad77e',
    ],
    package: '@smithy/types',
    fragments: ['HTTP="http"', 'HTTPS="https"'],
  },
  {
    index: 4123,
    target: [
      1928108,
      1928848,
      'ExpressionStatement',
      '62fea4396984fd34d5a92e7e008bb9946eaa99c7a90a2615c2460edb2d46a612',
    ],
    package: '@smithy/smithy-client',
    fragments: [
      'extendedEncodeURIComponent:',
      'collectBody:',
      'createAggregatedClient:',
      'decorateServiceException:',
      'ServiceException:',
      'SENSITIVE_STRING:',
      'NoOpLogger:',
      'Command:',
      'Client:',
    ],
  },
  {
    index: 4130,
    target: [
      1929998,
      1930295,
      'VariableDeclaration',
      'de66dcabf4a8fb9a937b14f3714353d758c20eeb35e518263ac57c89736e51b1',
    ],
    package: '@aws-sdk/client-sts',
    fragments: [
      'UseGlobalEndpoint:{type:"builtInParams"',
      'UseFIPS:{type:"builtInParams"',
      'Endpoint:{type:"builtInParams",name:"endpoint"}',
      'Region:{type:"builtInParams",name:"region"}',
      'UseDualStack:{type:"builtInParams"',
    ],
  },
  {
    index: 6699,
    target: [
      3040626,
      3040824,
      'VariableDeclaration',
      'b01a7fedfe14a0865883dd9b3487893e04e60d646efe95c743280865f5fe5ef0',
    ],
    package: 'react-reconciler',
    fragments: [
      'ConcurrentRoot=1',
      'ContinuousEventPriority=8',
      'DefaultEventPriority=32',
      'DiscreteEventPriority=2',
      'IdleEventPriority=268435456',
      'LegacyRoot=0',
      'NoEventPriority=0',
    ],
  },
  {
    index: 6792,
    target: [
      3079700,
      3083500,
      'VariableDeclaration',
      '0d4bb1ac7541c4e7f7c2e998c456533a57d4d16ee0864e3e2e4893b63250cc84',
    ],
    package: 'scheduler',
    fragments: [
      'unstable_now=',
      'unstable_IdlePriority=5',
      'unstable_ImmediatePriority=1',
      'unstable_NormalPriority=3',
      'unstable_UserBlockingPriority=2',
      'unstable_cancelCallback=',
      'unstable_forceFrameRate=',
      'unstable_scheduleCallback=',
      'unstable_shouldYield=',
      'unstable_wrapCallback=',
    ],
  },
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readGzipJson(relative) {
  return JSON.parse(gunzipSync(fs.readFileSync(path.join(repositoryRoot, relative))))
}

test(
  'target113 pins the exact coalesced dependency-runtime fragments',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetPath)
    assert.equal(sha256(bytes), TARGET_SHA256)
    const target = bytes.toString('utf8')
    const structural = readGzipJson(
      `recovery/cases/${caseName}/structural/generated-delta.json.gz`,
    )
    const units = [...structural.regions, ...structural.unresolvedTarget]

    for (const item of expected) {
      const row = units.find(entry => entry.target?.index === item.index)
      assert.ok(row, `missing target unit ${item.index}`)
      assert.deepEqual(
        [
          row.target.start,
          row.target.end,
          row.target.nodeType,
          row.target.sourceHash,
        ],
        item.target,
      )
      const source = target.slice(row.target.start, row.target.end)
      assert.equal(sha256(source), row.target.sourceHash)
      for (const fragment of item.fragments) {
        assert.ok(
          source.includes(fragment),
          `${item.package} unit ${item.index}: ${fragment}`,
        )
      }
    }
  },
)

test(
  'the five authenticated dependency units stay out of first-party ownership',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const coverage = readGzipJson(
      `recovery/cases/${caseName}/semantic/source-coverage.json.gz`,
    )
    const dependency = readGzipJson(
      `recovery/cases/${caseName}/semantic/dependency-coverage.json.gz`,
    )
    const dependencyIndexes = new Set(
      dependency.groups.flatMap(group => group.rows).map(row => row.targetIndex),
    )
    for (const item of expected) {
      const row = coverage.rows.find(entry => entry.targetIndex === item.index)
      assert.ok(row, `missing coverage row ${item.index}`)
      assert.equal(row.disposition, 'dependency-runtime')
      assert.deepEqual(row.ownerIds, [])
      assert.ok(row.evidenceIds.includes('case113-dependency-target-fragment'))
      assert.ok(dependencyIndexes.has(item.index))
    }
  },
)
