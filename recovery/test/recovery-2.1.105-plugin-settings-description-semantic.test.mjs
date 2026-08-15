import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetDescription =
  'Settings to merge when plugin is enabled. Only allowlisted keys are kept (currently: agent, subagentStatusLine)'
const baselineDescription =
  'Settings to merge when plugin is enabled. Only allowlisted keys are kept (currently: agent)'
const latestDescription =
  'Settings to merge when plugin is enabled. Only keys in PLUGIN_SETTINGS_KEYS (pluginSettingsKeys.ts) are kept'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrenceCount(contents, value) {
  return contents.split(value).length - 1
}

test(
  'target105 pins the subagentStatusLine plugin-settings allowlist surface',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(occurrenceCount(baseline, baselineDescription), 1)
    assert.equal(baseline.includes(targetDescription), false)
    assert.equal(occurrenceCount(target, targetDescription), 1)

    const region = structural.regions[2554]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [
        1012399,
        1037858,
        '1dfdefa58ba3b36616318181db58affa9b439cd59f83f1c04bceaedfdd279219',
      ],
    )
    assert.equal(
      sha256(target.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
    )
    assert.ok(
      target
        .slice(region.target.start, region.target.end)
        .includes(targetDescription),
    )
  },
)

test(
  'authored schema carries the boundary-appropriate observable description',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const schema = fs.readFileSync(
      path.join(sourceRoot, 'utils/plugins/schemas.ts'),
      'utf8',
    )
    const isCurrent =
      sourceRoot === path.resolve(repositoryRoot, 'src')
    const expected = isCurrent ? latestDescription : targetDescription
    const joinedSchema = schema.replace(/'\s*\+\s*'/g, '')
    assert.ok(joinedSchema.includes(expected), expected)
    assert.match(
      schema,
      /const PluginManifestSettingsSchema = lazySchema\(\(\) =>[\s\S]*?settings: z[\s\S]*?\.record\(z\.string\(\), z\.unknown\(\)\)[\s\S]*?\.optional\(\)[\s\S]*?\.describe\(/,
    )
  },
)

test(
  'target116 evolves the description to the centralized key registry',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.equal(occurrenceCount(latest, latestDescription), 1)
    assert.equal(latest.includes(targetDescription), false)
  },
)
