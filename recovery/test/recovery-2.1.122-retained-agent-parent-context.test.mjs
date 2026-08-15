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

test('authenticates retained agent parent-context modes', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      occurrences(bundle, 'forksParentContext'),
      2,
      `${version}: one live full/turn context selector`,
    )
    assert.match(
      bundle,
      /\.forksParentContext==="turn"\?[\w$]+\.messages\.slice\([\w$]+\.turnStartIndex\):[\w$]+\.forksParentContext===!0\?[\w$]+\.messages:void 0/,
      `${version}: turn, full, and disabled modes`,
    )
  }
})

test('source retains the injectable definition surface and live consumer', () => {
  const definitions = source('src/tools/AgentTool/loadAgentsDir.ts')
  const agentTool = source('src/tools/AgentTool/AgentTool.tsx')

  assert.ok(definitions.includes("forksParentContext?: boolean | 'turn'"))
  assert.match(
    agentTool,
    /selectedAgent\.forksParentContext === 'turn'[\s\S]*?toolUseContext\.messages\.slice\(toolUseContext\.turnStartIndex\)[\s\S]*?selectedAgent\.forksParentContext === true[\s\S]*?toolUseContext\.messages/,
  )
})
