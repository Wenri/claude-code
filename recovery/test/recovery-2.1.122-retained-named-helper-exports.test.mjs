import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

test('authenticates retained prompt-hook and setting-source exports', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    assert.equal(occurrences(bundle, 'runUserPromptExpansionHook'), 1, version)
    assert.equal(occurrences(bundle, 'getEffectiveSettingSource'), 1, version)
    assert.match(
      bundle,
      /runUserPromptExpansionHook:\(\)=>[\w$]+,processSlashCommand:/,
      `${version}: prompt expansion export`,
    )
    assert.match(
      bundle,
      /getEffectiveSettingSource:\(\)=>[\w$]+,getAutoModeConfig:/,
      `${version}: effective-source export`,
    )
  }
})

test('source live callers delegate through the retained named helpers', () => {
  const read = relative =>
    readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
  const slash = read('src/utils/processUserInput/processSlashCommand.tsx')
  const settings = read('src/utils/settings/settings.ts')
  const model = read('src/utils/model/model.ts')
  const modelCommand = read('src/commands/model/model.tsx')

  assert.ok(
    slash.includes('export async function runUserPromptExpansionHook('),
  )
  assert.equal(occurrences(slash, 'runUserPromptExpansionHook('), 2)
  assert.doesNotMatch(slash, /processUserPromptExpansionHooks/)

  assert.ok(settings.includes('export function getEffectiveSettingSource('))
  assert.ok(
    settings.includes(
      'export const getSettingsSourceForKey = getEffectiveSettingSource',
    ),
  )
  assert.ok(model.includes("getEffectiveSettingSource('model')"))
  assert.ok(modelCommand.includes("getEffectiveSettingSource('model')"))
})
