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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const selected = !semanticCase || semanticCase === caseName
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
  [352, [23359, 23388, '7cffae8555674ddea3e6c0abef960253504597377ca7bf1a4827efcdf82b20bb']],
  [354, [23414, 23440, 'bce200a41eb87550dc5467e2c0f21064844361e3adc9fb38f2061b793f45c103']],
  [355, [23440, 23472, '453c8225be4c2acc7d8fdff8a5121b1cbef2858cdbd5d9273673f399f6f1214b']],
  [2685, [1091547, 1091661, '39d0b55380281e3161e38faae1ee816959c936693116f5364af3297d274c0830']],
  [17871, [12307806, 12307943, 'abf5c8e7ffd60bb6f1d289b27670d93c8759e10ad292ffcba0c47913e3abc462']],
  [19445, [13482083, 13537387, '7abbfa6b954cc7c0877f758a15c5cb1193c900c59745626d380e4e39f355f707']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target110 pins plugin-settings readiness, telemetry, and both consumers',
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
    const baseline = baselineBytes.toString('utf8')
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
    assert.equal(
      baseline.includes('tengu_plugin_settings_premature_read'),
      false,
    )
    assert.equal(
      target.includes('tengu_plugin_settings_premature_read'),
      true,
    )
    assert.match(target.slice(12307806, 12307943), /subagentStatusLine/)
    assert.match(target.slice(13482083, 13537387), /\("agent"\)/)
  },
)

test(
  'source records pre-plugin reads and preserves readiness after clearing data',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const cache = source('utils/settings/settingsCache.ts')
    const settings = source('utils/settings/settings.ts')
    const main = source('main.tsx')

    assert.match(cache, /pluginSettingsBaseInitialized\s*=\s*false/)
    assert.match(
      cache,
      /setPluginSettingsBase[\s\S]*?pluginSettingsBase\s*=\s*settings[\s\S]*?pluginSettingsBaseInitialized\s*=\s*true/,
    )
    assert.match(
      cache,
      /isPluginSettingsBaseInitialized[\s\S]*?return pluginSettingsBaseInitialized/,
    )
    const clearBody = cache.match(
      /export function clearPluginSettingsBase\(\): void \{([\s\S]*?)\n\}/,
    )?.[1]
    assert.ok(clearBody)
    assert.equal(clearBody.includes('pluginSettingsBaseInitialized'), false)

    const helper = settings.match(
      /export function getSettingsAfterPluginLoad[\s\S]*?\n\}/,
    )?.[0]
    assert.ok(helper)
    assert.match(helper, /if \(!isPluginSettingsBaseInitialized\(\)\)/)
    assert.match(helper, /tengu_plugin_settings_premature_read/)
    assert.ok(
      helper.indexOf('tengu_plugin_settings_premature_read') <
        helper.indexOf('getSettingsWithErrors()'),
    )
    assert.match(main, /agentCli \?\? getSettingsAfterPluginLoad\('agent'\)/)

    const statusPath = path.join(sourceRoot, 'utils/subagentStatusLine.ts')
    if (fs.existsSync(statusPath)) {
      assert.match(
        fs.readFileSync(statusPath, 'utf8'),
        /getSettingsAfterPluginLoad\('subagentStatusLine'\)/,
      )
    }
  },
)
