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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
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
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
      : false,
}
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

test('target97 pins skill and hook placeholder expansion owners', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const expected = new Map([
    [9273, [7184706, 7185921, 'a1881ca1640007423ebe5489e617b10772b0aa530e05ba82b7301cbee7214eaf']],
    [16103, [11620235, 11625565, '30be826dde146b90b0143f5eb1609fb4f04b65bc31184aae3c69ae948dc1a0af']],
  ])
  const bundle = bytes.toString('utf8')
  for (const [index, identity] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    const owner = bundle.slice(region.target.start, region.target.end)
    assert.equal(sha256(owner), region.target.sourceHash)
  }
  const skill = bundle.slice(
    structural.regions[9273].target.start,
    structural.regions[9273].target.end,
  )
  for (const fragment of [
    'replaceAll("${CLAUDE_SKILL_DIR}"',
    'process.platform==="win32"',
    'replaceAll("\\\\","/")',
    '/\\$\\{CLAUDE_SESSION_ID\\}/g',
  ]) {
    assert.ok(skill.includes(fragment), fragment)
  }
  const hook = bundle.slice(
    structural.regions[16103].target.start,
    structural.regions[16103].target.end,
  )
  for (const fragment of [
    '["CLAUDE_PLUGIN_ROOT"',
    '["CLAUDE_PLUGIN_DATA"',
    'the hook is not associated with a plugin',
    'CLAUDE_PLUGIN_DATA} is plugin-only',
    'replaceAll("${CLAUDE_PLUGIN_ROOT}"',
    'replaceAll("${CLAUDE_PLUGIN_DATA}"',
  ]) {
    assert.ok(hook.includes(fragment), fragment)
  }
})

test('source preserves placeholder boundaries and callback replacement', sourceOptions, () => {
  const skill = fs.readFileSync(
    path.join(sourceRoot, 'skills/loadSkillsDir.ts'),
    'utf8',
  )
  for (const fragment of [
    'process.platform === \'win32\'',
    "baseDir.replace(/\\\\/g, '/')",
    'finalContent.replace(/\\$\\{CLAUDE_SKILL_DIR\\}/g, skillDir)',
    '/\\$\\{CLAUDE_SESSION_ID\\}/g,',
    'getSessionId(),',
  ]) {
    assert.ok(skill.includes(fragment), fragment)
  }
  const hooks = fs.readFileSync(path.join(sourceRoot, 'utils/hooks.ts'), 'utf8')
  for (const fragment of [
    "['CLAUDE_PLUGIN_ROOT', pluginRoot || skillRoot]",
    "['CLAUDE_PLUGIN_DATA', pluginRoot]",
    'the hook is not associated with a plugin',
    'CLAUDE_PLUGIN_DATA} is plugin-only',
    'command.replace(/\\$\\{CLAUDE_PLUGIN_ROOT\\}/g, () => rootPath)',
    'command.replace(/\\$\\{CLAUDE_PLUGIN_DATA\\}/g, () => dataPath)',
  ]) {
    assert.ok(hooks.includes(fragment), fragment)
  }
})

test('2.1.96 predates only the skill-directory placeholder', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('${CLAUDE_SKILL_DIR}'), false)
  assert.equal(bundle.includes('the hook is not associated with a plugin'), true)
})
