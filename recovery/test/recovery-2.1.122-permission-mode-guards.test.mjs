import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates the retained permission-mode guard helper', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      bundle.split('setPermissionModeWithGuards').length - 1,
      1,
      `${version}: retained helper export`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(([\w$]+),([\w$]+),([\w$]+)\)\{if\(\1==="bypassPermissions"\)\{if\([\w$]+\(\)\)return\{ok:!1,error:"Cannot set permission mode to bypassPermissions because it is disabled by settings or configuration"\};if\(!\2\.isBypassPermissionsModeAvailable\)return\{ok:!1,error:"Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions"\}\}if\(\1==="auto"&&![\w$]+\(\)\)/,
      `${version}: bypass and auto policy guards`,
    )
    assert.match(
      bundle,
      /return [\w$]+\(\(([\w$]+)\)=>\{if\(\1\.mode===[\w$]+\)return \1;return\{\.\.\.[\w$]+\(\1\.mode,[\w$]+,\1\),mode:[\w$]+\}\}\),setImmediate\(\(\)=>\{[\w$]+\(\)\?\.\(\(([\w$]+)\)=>\{return \2\.forEach\(\(([\w$]+)\)=>\{\3\.recheckPermission\(\)\}\),\2\}\)\}\),\{ok:!0,mode:[\w$]+\}/,
      `${version}: transition, queued recheck, and success result`,
    )
  }
})

test('source exposes the exact guarded transition surface', () => {
  const source = readFileSync(
    new URL('../../src/utils/permissions/permissionSetup.ts', import.meta.url),
    'utf8',
  )

  assert.ok(source.includes('export function setPermissionModeWithGuards('))
  assert.ok(source.includes("if (mode === 'bypassPermissions')"))
  assert.ok(source.includes('if (!initialContext.isBypassPermissionsModeAvailable)'))
  assert.ok(source.includes("if (mode === 'auto' && !isAutoModeGateEnabled())"))
  assert.match(
    source,
    /setToolPermissionContext\(context => \{[\s\S]*?transitionPermissionMode\(context\.mode, mode, context\)[\s\S]*?mode,[\s\S]*?\}\)/,
  )
  assert.match(
    source,
    /getLeaderToolUseConfirmQueue\(\)\?\.\(queue => \{[\s\S]*?item\.recheckPermission\(\)[\s\S]*?return queue/,
  )
  assert.ok(source.includes('return { ok: true, mode }'))
})
