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

test('authenticates retained resume permission-mode restoration', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    assert.equal(
      occurrences(bundle, 'permissionModeCliSet'),
      2,
      `${version}: context field and resume guard`,
    )
    assert.match(
      bundle,
      /permissionMode:[A-Za-z_$][\w$]*\?\.permissionMode,worktreeSession:/,
      `${version}: loaded metadata includes permission mode`,
    )
    assert.match(
      bundle,
      /permissionModeCliSet:[A-Za-z_$][\w$]*!==void 0\|\|Boolean\([A-Za-z_$][\w$]*\)/,
      `${version}: explicit CLI override detection`,
    )
    assert.match(
      bundle,
      /if\([^)]*\|\|![A-Za-z_$][\w$]*\)return;let [A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\);if\([^)]*==="default"&&[^)]*!=="default"\)return;if\([^)]*==="plan"\|\|[^)]*==="bypassPermissions"\)return;if\([^)]*==="default"\)return;/,
      `${version}: unsafe/default/invalid modes are not restored`,
    )
    assert.match(
      bundle,
      /if\(([A-Za-z_$][\w$]*)==="auto"\)\{let\{isAutoModeGateEnabled:([A-Za-z_$][\w$]*)\}=[^;]*,\{setAutoModeActive:([A-Za-z_$][\w$]*)\}=[^;]*;if\(!\2\(\)\)return;\3\(!0\)\}/,
      `${version}: auto mode is gated and activated`,
    )
    assert.match(
      bundle,
      /toolPermissionContext:\{\.\.\.[^}]+\.toolPermissionContext,mode:[A-Za-z_$][\w$]*\}/,
      `${version}: restored mode overlays the initial permission context`,
    )
  }
})

test('source preserves the authenticated resume permission-mode flow', () => {
  const recovery = source('src/utils/conversationRecovery.ts')
  const restore = source('src/utils/sessionRestore.ts')
  const main = source('src/main.tsx')

  assert.ok(recovery.includes('permissionMode: log?.permissionMode'))
  for (const witness of [
    'if (permissionModeCliSet || !permissionMode) return undefined',
    "if (parsedMode === 'default' && permissionMode !== 'default') return undefined",
    "if (parsedMode === 'plan' || parsedMode === 'bypassPermissions')",
    "if (parsedMode === 'default') return undefined",
    'if (!isAutoModeGateEnabled()) return undefined',
    'setAutoModeActive(true)',
    'result.permissionMode, context.permissionModeCliSet',
    '...context.initialState.toolPermissionContext, mode: resumedPermissionMode',
  ]) {
    assert.ok(restore.includes(witness), `missing restore witness: ${witness}`)
  }
  assert.ok(
    main.includes(
      'permissionModeCliSet: permissionModeCli !== undefined || Boolean(dangerouslySkipPermissions)',
    ),
  )
})
