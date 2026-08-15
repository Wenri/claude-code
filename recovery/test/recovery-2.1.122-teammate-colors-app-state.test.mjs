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
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(
    /\s+/g,
    ' ',
  )
}

test('authenticates retained teammate color state and context surface', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(occurrences(bundle, 'teammateColors'), 26, version)
    assert.equal(
      occurrences(bundle, 'teammateColors:{assignments:new Map,index:0}'),
      3,
      `${version}: defaults, startup, and clear`,
    )
    assert.equal(
      occurrences(bundle, 'teammateColors.assign'),
      7,
      `${version}: helper and active consumers`,
    )
    assert.equal(occurrences(bundle, 'teammateColors.clear()'), 1, version)

    assert.match(
      bundle,
      /assign\(([A-Za-z_$][\w$]*)\)\{let ([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(\)\.teammateColors,([A-Za-z_$][\w$]*)=\2\.assignments\.get\(\1\)/,
      `${version}: assign reads the injected AppState slice`,
    )
    assert.match(
      bundle,
      /new Map\([A-Za-z_$][\w$]*\.teammateColors\.assignments\);return [A-Za-z_$][\w$]*\.set\([^)]+\),\{\.\.\.[A-Za-z_$][\w$]*,teammateColors:\{assignments:[A-Za-z_$][\w$]*,index:[A-Za-z_$][\w$]*\.teammateColors\.index\+1\}\}/,
      `${version}: assign commits an immutable slice update`,
    )
    assert.match(
      bundle,
      /get\(([A-Za-z_$][\w$]*)\)\{return [A-Za-z_$][\w$]*\(\)\.teammateColors\.assignments\.get\(\1\)\},clear\(\)\{/,
      `${version}: get and clear share the injected facade`,
    )
    assert.match(
      bundle,
      /teammateColors\.assignments\.size===0&&[^.]+\.teammateColors\.index===0\?[^:]+:\{\.\.\.[^,]+,teammateColors:\{assignments:new Map,index:0\}\}/,
      `${version}: clear preserves AppState identity for an empty allocator`,
    )
  }
})

test('source reconstructs instance-scoped teammate color flow', () => {
  const manager = source('src/utils/swarm/teammateLayoutManager.ts')
  const state = source('src/state/AppStateStore.ts')
  const tool = source('src/Tool.ts')
  const fork = source('src/utils/forkedAgent.ts')
  const repl = source('src/screens/REPL.tsx')
  const spawn = source('src/tools/shared/spawnMultiAgent.ts')
  const create = source('src/tools/TeamCreateTool/TeamCreateTool.ts')
  const remove = source('src/tools/TeamDeleteTool/TeamDeleteTool.ts')
  const pane = source('src/utils/swarm/backends/PaneBackendExecutor.ts')

  for (const witness of [
    'const state = getAppState().teammateColors',
    'if (previous.teammateColors.assignments.has(teammateId))',
    'const assignments = new Map(previous.teammateColors.assignments)',
    'index: previous.teammateColors.index + 1',
    'previous.teammateColors.assignments.size === 0 && previous.teammateColors.index === 0',
  ]) {
    assert.ok(manager.includes(witness), `missing allocator witness: ${witness}`)
  }
  assert.ok(state.includes('teammateColors: { assignments: new Map(), index: 0 }'))
  assert.ok(tool.includes('teammateColors: TeammateColors'))
  assert.ok(fork.includes('teammateColors: parentContext.teammateColors'))
  assert.ok(repl.includes('createTeammateColors(() => store.getState(), setAppState)'))
  assert.ok(spawn.includes('context.teammateColors,'))
  assert.ok(spawn.includes('teammateColors.assign(teammateId)'))
  assert.ok(create.includes('context.teammateColors.assign(leadAgentId)'))
  assert.ok(remove.includes('context.teammateColors.clear()'))
  assert.ok(pane.includes('this.context.teammateColors.assign(agentId)'))
  assert.doesNotMatch(manager, /teammateColorAssignments|let colorIndex/)
})
