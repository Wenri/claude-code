import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
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

const units = new Map([
  [7344, [4937781, 4937841, '3de13eff7d81784051ff7cce61f466374f259d60228ba495c6ba11e9b0a3fd6b']],
  [7345, [4937841, 4937906, 'a30ff4e6d31104795439f7539d7621a8f1666d200e2512763281df4fda8835a2']],
  [7346, [4937906, 4938159, 'b012414d4e007649e4667addef935f498177e9800cdedec33a07ba2c6e269b18']],
  [7347, [4938159, 4938386, '64819df3ef7f11b23835395bf01ea60064e8bd546fb35eb26a2706fb317508c9']],
  [7360, [4940036, 4943323, '16e8d2ac56a86d7b5a5ba9cf6b16b4397a37d079dd98e2405c2a23d1288b3aaf']],
  [7361, [4943323, 4947483, '7a73ac83582de15976f6c251e45a2605abdbdae283fc50d1f66069f6e6cd54d2']],
  [7362, [4947483, 4947575, '1752a06f479dee1ad9472e803b0dd214602ea7a4a326c6adb7e657480be845e3']],
  [7363, [4947575, 4947668, '6f6433e13b9d30f6c483165dc175792360d480548becd56ba8a99c43ea69efce']],
  [7364, [4947668, 4947703, 'd03966963c436efceadc2a80d3533d8ceb3ccaef010e429d7a197e8a92f938d7']],
  [7365, [4947703, 4947742, 'f0083c0ac8b1834f343bb13fae343478d1398a7adf7050bf063db269f7045e75']],
  [7367, [4947898, 4947997, 'a9a23314de15551a9b4c42f8e39dc3988a7c643b9f208cec14372754887b3758']],
  [7368, [4947997, 4948853, '7b8a6b426a67af00c7d74d70f92159cdbe12c5f0f589f8c81f4b30056f48dbe4']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target110 authenticates the complete prompt-cache persistence graph',
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
    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    const owner = target.slice(4937781, 4948853)
    for (const fragment of [
      'CLAUDE_CODE_IS_COWORK',
      'cache-break-state-',
      'message history mutated at index',
      'cache deletion applied, cache read:',
      'x-anthropic-billing-header:',
      'messageHashes',
      'perBlockHashes',
      'perBlockLengths',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
  },
)

test(
  'source owns durable state, message history, and every mutation flush',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = source('services/api/promptCacheBreakDetection.ts')
    const claude = source('services/api/claude.ts')
    for (const fragment of [
      "import { readFileSync } from 'fs'",
      "import { z } from 'zod'",
      '`cache-break-state-${getSessionId()}.json`',
      'const persistedStateSchema = z.record(',
      'JSON.parse(readFileSync(getPersistedStatePath(), \'utf8\'))',
      'persistQueue = persistQueue',
      'const messageHashes = messagesForAPI',
      'const firstChangedMessageIndex = prev.messageHashes.findIndex(',
      'messagesHistoryChanged,',
      'perBlockHashes: computeBlockHashes()',
      'perBlockLengths: computeBlockLengths()',
      'state.cacheDeletionsPending = true',
      'state.prevCacheReadTokens = null',
      'previousStateBySource.delete(agentId)',
      'previousStateBySource.clear()',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    assert.match(
      owner,
      /finally \{\s*persistState\(\)\s*\}/,
    )
    assert.match(
      claude,
      /recordPromptState\(\{[\s\S]*?extraBodyParams: getExtraBodyParams\(\),\s*messagesForAPI,\s*\}\)/,
    )

    if (semanticCase === caseName) {
      assert.equal(owner.includes('is1hCacheTTL: state.is1hCacheTTL'), false)
      assert.equal(owner.includes('queryDepth: state.queryDepth'), false)
      assert.match(
        claude,
        /if \(feature\('PROMPT_CACHE_BREAK_DETECTION'\)\) \{[\s\S]*?recordPromptState/,
      )
    } else {
      assert.ok(owner.includes('is1hCacheTTL: state.is1hCacheTTL'))
      assert.ok(owner.includes('queryDepth: state.queryDepth'))
      assert.ok(owner.includes('querySource,'))
      assert.ok(owner.includes('model: state.model'))
      assert.ok(owner.includes('globalCacheStrategy: state.globalCacheStrategy'))
      assert.match(
        claude,
        /if \(isEnvTruthy\(process\.env\.CLAUDE_CODE_IS_COWORK\)\) \{[\s\S]*?recordPromptState/,
      )
    }
  },
)
