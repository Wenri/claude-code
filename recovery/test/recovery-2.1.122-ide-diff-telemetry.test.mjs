import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function assertOrder(text, ...needles) {
  let cursor = -1
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1)
    assert.ok(next > cursor, `${needle} is missing or out of order`)
    cursor = next
  }
}

test('authenticates retained IDE diff telemetry metadata and branch order', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(bundle.split('"tengu_ext_diff_rejected"').length - 1, 1)
    assert.equal(bundle.split('"tengu_ext_diff_accepted"').length - 1, 1)

    const eventOffset = bundle.indexOf('"tengu_ext_diff_rejected"')
    const signatureWindowStart = eventOffset - 2_500
    const signatureWindow = bundle.slice(signatureWindowStart, eventOffset)
    const signatures = [
      ...signatureWindow.matchAll(
        /function ([\w$]+)\(\{onChange:([\w$]+),toolUseContext:([\w$]+),filePath:([\w$]+),edits:([\w$]+),editMode:([\w$]+),toolName:([\w$]+)\}\)/g,
      ),
    ]
    const signature = signatures.at(-1)
    const functionOffset = signatureWindowStart + (signature?.index ?? -1)
    const context = bundle.slice(functionOffset, eventOffset + 900)
    assert.ok(
      functionOffset >= signatureWindowStart,
      `${release.version}: hook function`,
    )
    assert.ok(signature, `${release.version}: tool name is a live hook input`)
    const [, hookName, , , , edits, , toolName] = signature

    const metadata = context.match(
      new RegExp(
        `([\\w$]+)=\\{ideName:[\\w$]+,toolName:[\\w$]+\\(${toolName}\\),editCount:${edits}\\.length,isNewFile:[\\w$]+===""\\}`,
      ),
    )
    assert.ok(metadata, `${release.version}: exact shared metadata object`)
    const metadataName = metadata[1]
    assertOrder(
      context,
      'editCount:',
      `"tengu_ext_diff_rejected",${metadataName}`,
      `"tengu_ext_diff_accepted",${metadataName}`,
    )

    const callPattern = new RegExp(`=${hookName}\\(`)
    const call = bundle.match(callPattern)
    assert.ok(call, `${release.version}: live hook caller`)
    const callOffset = call.index
    const caller = bundle.slice(callOffset - 1400, callOffset + 200)
    assert.equal(
      caller.match(/toolName:[\w$]+\.tool\.name/g)?.length,
      2,
      `${release.version}: configured and fallback calls carry tool name`,
    )
  }
})

test('source reproduces the authenticated IDE diff telemetry contract', () => {
  const hook = fs.readFileSync(path.join(repo, 'src/hooks/useDiffInIDE.ts'), 'utf8')
  const caller = fs.readFileSync(
    path.join(
      repo,
      'src/components/permissions/FilePermissionDialog/FilePermissionDialog.tsx',
    ),
    'utf8',
  )

  assert.match(hook, /toolName: string/)
  assert.match(hook, /toolName: normalizeLegacyToolName\(toolName\)/)
  assert.match(hook, /editCount: edits\.length/)
  assert.match(hook, /isNewFile: oldContent === ''/)
  assertOrder(
    hook,
    'const metadata = {',
    "logEvent('tengu_ext_diff_rejected', metadata)",
    "logEvent('tengu_ext_diff_accepted', metadata)",
  )
  assert.equal(
    caller.match(/toolName: toolUseConfirm\.tool\.name/g)?.length,
    2,
  )
})
