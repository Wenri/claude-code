import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const targetSha256 =
  '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const pin = [
  16060,
  'unresolved',
  11605644,
  11610970,
  '0b2a409e947676bf5e723c1b0c4fe9a506b7456b7b826c0a07511d55f7a91889',
]

test('2.1.94 pins the reachable hook/plugin-variable association guards', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_94_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const [index, classification, start, end, sourceHash] = pin
  const region = structural.regions[index]
  assert.equal(region.classification, classification)
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, sourceHash],
  )
  const body = bytes.toString('utf8').slice(start, end)
  assert.equal(sha256(body), sourceHash)
  for (const fragment of [
    '[["CLAUDE_PLUGIN_ROOT",$||j],["CLAUDE_PLUGIN_DATA",$]]',
    'only \\${CLAUDE_PLUGIN_ROOT} is available for skill hooks (\\${CLAUDE_PLUGIN_DATA} is plugin-only)',
    "the hook is not associated with a plugin. This variable is only available in hooks defined in a plugin's hooks/hooks.json file, not in settings.json.",
  ]) assert.ok(body.includes(fragment), fragment)
})

test('materialized target94 source rejects unassociated plugin variables before execution', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'utils/hooks.ts'), 'utf8')
  for (const fragment of [
    "['CLAUDE_PLUGIN_ROOT', pluginRoot || skillRoot]",
    "['CLAUDE_PLUGIN_DATA', pluginRoot]",
    'if (associatedRoot || !command.includes(`\\${${variable}}`)) continue',
    'only \\${CLAUDE_PLUGIN_ROOT} is available for skill hooks (\\${CLAUDE_PLUGIN_DATA} is plugin-only)',
    "the hook is not associated with a plugin. This variable is only available in hooks defined in a plugin's hooks/hooks.json file, not in settings.json.",
  ]) assert.ok(source.includes(fragment), fragment)
})
