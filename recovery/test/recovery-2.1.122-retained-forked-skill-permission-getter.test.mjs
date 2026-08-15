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

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

test('authenticates the retained forked-skill permission getter contract', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      occurrences(bundle, 'modifiedGetToolPermissionContext'),
      3,
      `${version}: retained result and two consumers`,
    )
    assert.match(
      bundle,
      /modifiedGetAppState:[\w$]+,modifiedGetToolPermissionContext:[\w$]+,baseAgent:/,
      `${version}: preparation returns both permission views`,
    )
    assert.equal(
      [...bundle.matchAll(/getAppState:[\w$]+,getToolPermissionContext:[\w$]+},canUseTool:/g)].length,
      2,
      `${version}: slash-command and SkillTool forks consume both views`,
    )
  }
})

test('source grants allowed tools through AppState and the direct getter', () => {
  const helper = source('src/utils/forkedAgent.ts')
  const slash = source('src/utils/processUserInput/processSlashCommand.tsx')
  const skill = source('src/tools/SkillTool/SkillTool.ts')

  assert.ok(
    helper.includes(
      "modifiedGetToolPermissionContext: ToolUseContext['getToolPermissionContext']",
    ),
  )
  assert.match(
    helper,
    /const modifiedGetToolPermissionContext =[\s\S]*?context\.getToolPermissionContext\(\)[\s\S]*?allowedTools/,
  )
  assert.match(
    helper,
    /alwaysAllowRules:[\s\S]*?command:[\s\S]*?new Set\([\s\S]*?\.\.\.allowedTools/,
  )

  assert.match(
    slash,
    /modifiedGetAppState,[\s\S]*?modifiedGetToolPermissionContext,[\s\S]*?baseAgent/,
  )
  assert.equal(
    occurrences(
      slash,
      'getToolPermissionContext: modifiedGetToolPermissionContext',
    ),
    2,
  )

  assert.match(
    skill,
    /modifiedGetAppState,[\s\S]*?modifiedGetToolPermissionContext,[\s\S]*?baseAgent/,
  )
  assert.equal(
    occurrences(
      skill,
      'getToolPermissionContext: modifiedGetToolPermissionContext',
    ),
    1,
  )
})
