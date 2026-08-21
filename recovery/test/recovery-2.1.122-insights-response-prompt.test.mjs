import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates the retained insights response-prompt export and call', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      bundle.split('buildInsightsResponsePrompt').length - 1,
      1,
      `${version}: one retained named export`,
    )
    assert.match(
      bundle,
      /\{insightsJson:[\w$]+,reportUrl:[\w$]+,uploadHint:[\w$]+,htmlPath:[\w$]+,facetsDir:[\w$]+,header:[\w$]+,summaryText:[\w$]+\}\)\{return`The user just ran \/insights/,
      `${version}: exact seven-field helper shape`,
    )
    assert.match(
      bundle,
      /text:[\w$]+\(\{insightsJson:[\w$]+\([\w$]+,null,2\),reportUrl:[\w$]+,uploadHint:[\w$]+,htmlPath:[\w$]+,facetsDir:[\w$]+\(\),header:[\w$]+,summaryText:[\w$]+\}\)/,
      `${version}: live command delegates to the helper`,
    )
  }
})

test('source exports the exact helper and delegates the live command', () => {
  const source = readFileSync(
    new URL('../../src/commands/insights.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /export function buildInsightsResponsePrompt\(\{/)
  for (const field of [
    'insightsJson',
    'reportUrl',
    'uploadHint',
    'htmlPath',
    'facetsDir',
    'header',
    'summaryText',
  ]) {
    assert.match(source, new RegExp(`\\$\\{${field}\\}`))
  }
  assert.match(
    source,
    /text: buildInsightsResponsePrompt\(\{[\s\S]*?insightsJson: jsonStringify\(insights, null, 2\),[\s\S]*?facetsDir: getFacetsDir\(\),[\s\S]*?summaryText,[\s\S]*?\}\)/,
  )
})
