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
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
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

test('authenticated adjacent bundles fail closed on invalid permission input', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const message =
      'Permission dialog opened with invalid input \\u2014 upstream should have validated. '
    const anchor = bundle.indexOf(message)
    assert.ok(anchor >= 0, `${release.version}: invalid-input diagnostic`)
    assert.equal(bundle.indexOf(message, anchor + 1), -1, `${release.version}: one diagnostic`)
    const permissionRequest = bundle.slice(anchor - 900, anchor + 900)

    assert.match(
      permissionRequest,
      /\.inputSchema\.safeParse\([\w$]+\)/,
      `${release.version}: schema validation`,
    )
    assert.match(
      permissionRequest,
      /\{context:"Confirmation",isActive:[\w$]+\.success\}/,
      `${release.version}: invalid dialogs disable interrupt handling`,
    )
    assert.match(
      permissionRequest,
      /\.success\?[\w$]+\([\w$]+\):""/,
      `${release.version}: invalid dialogs suppress notifications`,
    )
    assert.match(
      permissionRequest,
      /if\([\w$]+\.success\|\|[\w$]+\.current\)return;[\w$]+\.current=!0/,
      `${release.version}: failure is handled once`,
    )
    assert.match(
      permissionRequest,
      /\.onReject\([\w$]+\),[\w$]+\(\)/,
      `${release.version}: reject then finish`,
    )
    assert.match(
      permissionRequest,
      /useEffect\([\w$]+,[\w$]+\),![\w$]+\.success\)return null/,
      `${release.version}: invalid input renders nothing`,
    )
  }
})

test('source preserves the retained permission validation fail-safe', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/permissions/PermissionRequest.tsx'),
    'utf8',
  )
  const from = source.indexOf('export function PermissionRequest')
  assert.ok(from >= 0)
  const permissionRequest = source.slice(from)

  assertOrder(
    permissionRequest,
    'tool.inputSchema.safeParse(input)',
    'const invalidInputHandled = React.useRef(false)',
    'isActive: parsedInput.success',
    'parsedInput.success ? getNotificationMessage(toolUseConfirm) : ""',
    'if (parsedInput.success || invalidInputHandled.current)',
    'invalidInputHandled.current = true',
    'formatZodValidationError(tool.name, parsedInput.error)',
    'Permission dialog opened with invalid input — upstream should have validated.',
    'toolUseConfirm.onReject(validationError)',
    'onDone()',
    'React.useEffect(t5, t6)',
    'if (!parsedInput.success)',
    'return null',
    'permissionComponentForTool(toolUseConfirm.tool)',
  )
})
