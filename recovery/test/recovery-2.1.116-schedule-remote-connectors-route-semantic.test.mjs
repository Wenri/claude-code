import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const unitPairs = [
  {
    baseline: {
      index: 20030,
      start: 12257765,
      end: 12258105,
      sourceHash:
        '48d91dfe50680e87bdc5023b444eaeb8dfa7fb03123364ba841e4ddbec14ff93',
    },
    target: {
      index: 20302,
      start: 12357698,
      end: 12358039,
      sourceHash:
        '4f1ff7fa684988cfb9e9cf1810c2fb0d8a9de4325092e08168fbfcfd13b996b5',
    },
    occurrenceCount: 1,
  },
  {
    baseline: {
      index: 20033,
      start: 12258314,
      end: 12267078,
      sourceHash:
        '1dd60507263c92452184dbddb998aa59fb6ad1fefd4ecf079f0b819bc0961984',
    },
    target: {
      index: 20305,
      start: 12358248,
      end: 12367014,
      sourceHash:
        '45fc304698a465f5cb2416ed6c2bc99f9283b77d55e039eaa77d8a28238dd4c4',
    },
    occurrenceCount: 2,
  },
  {
    baseline: {
      index: 20034,
      start: 12267078,
      end: 12269531,
      sourceHash:
        '1a4eb623399dacdce41362e73caff17749bc111e4e94d520a3733d097ba6a86c',
    },
    target: {
      index: 20306,
      start: 12367014,
      end: 12369468,
      sourceHash:
        '3fc8d60c713ba0fc6ad5a1b1d2c6c5d6a604b9055dd43e546a6987dc68bd75c6',
    },
    occurrenceCount: 1,
  },
]

const settingsRoute = 'https://claude.ai/settings/connectors'
const customizeRoute = 'https://claude.ai/customize/connectors'

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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

test(
  'target116 authenticates the scheduled-agent connector route migration',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const pair of unitPairs) {
      const baselineRegion = structural.unmatchedBaseline.find(
        region => region.index === pair.baseline.index,
      )
      assert.ok(baselineRegion)
      assert.deepEqual(
        [
          baselineRegion.start,
          baselineRegion.end,
          baselineRegion.sourceHash,
        ],
        [pair.baseline.start, pair.baseline.end, pair.baseline.sourceHash],
      )
      const targetRegion = structural.regions[pair.target.index]
      assert.equal(targetRegion.classification, 'unresolved')
      assert.deepEqual(
        [
          targetRegion.target.start,
          targetRegion.target.end,
          targetRegion.target.sourceHash,
        ],
        [pair.target.start, pair.target.end, pair.target.sourceHash],
      )

      const baselineOwner = baseline.slice(
        pair.baseline.start,
        pair.baseline.end,
      )
      const targetOwner = target.slice(pair.target.start, pair.target.end)
      assert.equal(sha256(baselineOwner), pair.baseline.sourceHash)
      assert.equal(sha256(targetOwner), pair.target.sourceHash)
      assert.equal(
        occurrences(baselineOwner, settingsRoute),
        pair.occurrenceCount,
      )
      assert.equal(occurrences(baselineOwner, customizeRoute), 0)
      assert.equal(occurrences(targetOwner, settingsRoute), 0)
      assert.equal(
        occurrences(targetOwner, customizeRoute),
        pair.occurrenceCount,
      )
    }
  },
)

test(
  'scheduled-agent guidance consistently uses the customize connectors route',
  sourceOptions,
  () => {
    const owner = source('src/skills/bundled/scheduleRemoteAgents.ts')
    assert.equal(occurrences(owner, settingsRoute), 0)
    assert.equal(occurrences(owner, customizeRoute), 4)
    assert.match(
      owner,
      /No connected MCP connectors found\. The user may need to connect servers at https:\/\/claude\.ai\/customize\/connectors/,
    )
    assert.match(
      owner,
      /No MCP connectors — connect at https:\/\/claude\.ai\/customize\/connectors if needed\./,
    )
  },
)
