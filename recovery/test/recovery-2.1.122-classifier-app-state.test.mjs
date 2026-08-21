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
    .replace(/\s+/g, ' ')
}

test('authenticates retained classifier AppState and context surfaces', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    assert.equal(occurrences(bundle, 'classifierApprovals'), 7, version)
    assert.equal(occurrences(bundle, 'setClassifierApprovals'), 12, version)
    assert.equal(
      occurrences(bundle, 'approvals:new Map,checking:new Set'),
      3,
      `${version}: defaults, startup, and clear`,
    )
    assert.match(
      bundle,
      /let [A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\.classifierApprovals\);if\([A-Za-z_$][\w$]*===[A-Za-z_$][\w$]*\.classifierApprovals\)return [A-Za-z_$][\w$]*;return\{\.\.\.[A-Za-z_$][\w$]*,classifierApprovals:[A-Za-z_$][\w$]*\}/,
      `${version}: context setter applies immutable classifier slice`,
    )
    assert.match(
      bundle,
      /classifierApprovals\.checking\.has\([A-Za-z_$][\w$]*\)\)\?\?!1/,
      `${version}: checking UI subscribes to AppState`,
    )
    assert.match(
      bundle,
      /\.getState\(\),[A-Za-z_$][\w$]*\)\),\[[A-Za-z_$][\w$]*\]=[^;]+\.useState\(\(\)=>[^.]+\([^,]+\.getState\(\),[A-Za-z_$][\w$]*\)\)/,
      `${version}: result rendering snapshots approvals from its store`,
    )
  }
})

test('source reconstructs classifier state isolation and lifecycle', () => {
  const approvals = source('src/utils/classifierApprovals.ts')
  const state = source('src/state/AppStateStore.ts')
  const tool = source('src/Tool.ts')
  const hook = source('src/utils/classifierApprovalsHook.ts')
  const cleanup = source('src/services/compact/postCompactCleanup.ts')
  const result = source(
    'src/components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx',
  )

  for (const witness of [
    'const classifierApprovals = updater(prev.classifierApprovals)',
    'if (prev.checking.has(toolUseID)) return prev',
    'const checking = new Set(prev.checking)',
    'const approvals = new Map(prev.approvals)',
    'if (prev.approvals.size === 0 && prev.checking.size === 0) return prev',
  ]) {
    assert.ok(approvals.includes(witness), `missing helper witness: ${witness}`)
  }
  assert.ok(
    state.includes(
      'classifierApprovals: { approvals: new Map(), checking: new Set() }',
    ),
  )
  assert.ok(tool.includes('setClassifierApprovals: SetClassifierApprovals'))
  assert.ok(hook.includes('state.classifierApprovals.checking.has(toolUseID)'))
  assert.ok(cleanup.includes('makeSetClassifierApprovals(setAppState)'))
  assert.ok(result.includes('getYoloClassifierApproval(store.getState(), toolUseID)'))
  assert.ok(
    result.includes(
      'deleteClassifierApproval(makeSetClassifierApprovals(store.setState), toolUseID)',
    ),
  )
})
