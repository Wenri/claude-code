import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
const TARGET_SHA256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

function bundle(environmentName, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function releaseNormalize(contents) {
  return contents
    .replaceAll('2.1.113', '2.1.114')
    .replaceAll('2026-04-17T18:18:28Z', '2026-04-17T22:37:24Z')
}

test('teammate permission logging tolerates a missing app-state accessor', () => {
  const contents = source('src/components/permissions/hooks.ts')

  const match = contents.match(
    /const permissionMode = ([\s\S]+?)\n\n\s*logEvent\(/,
  )
  assert.ok(match)
  assert.match(
    match[1],
    /toolUseConfirm\.toolUseContext\s*\n\s*\.getAppState\?\.\(\)\s*\n\s*\?\.toolPermissionContext\.mode/,
  )
  assert.match(contents, /permissionMode:\s*\n\s*permissionMode as/)

  const readPermissionMode = Function(
    'toolUseConfirm',
    `return ${match[1]}`,
  )
  assert.equal(readPermissionMode({ toolUseContext: {} }), undefined)
  assert.equal(
    readPermissionMode({
      toolUseContext: {
        getAppState: () => ({ toolPermissionContext: { mode: 'plan' } }),
      },
    }),
    'plan',
  )
})

test('authenticated bundles isolate the crash fix after release metadata', () => {
  const baseline = bundle('CLAUDE_CODE_2_1_113_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_114_BUNDLE', TARGET_SHA256)
  const normalizedBaseline = releaseNormalize(baseline)

  assert.equal(
    normalizedBaseline.includes(
      '.toolUseContext.getAppState().toolPermissionContext.mode',
    ),
    true,
  )
  assert.equal(
    target.includes(
      '.toolUseContext.getAppState?.()?.toolPermissionContext.mode',
    ),
    true,
  )

  let prefix = 0
  while (
    prefix < normalizedBaseline.length &&
    prefix < target.length &&
    normalizedBaseline[prefix] === target[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < normalizedBaseline.length - prefix &&
    suffix < target.length - prefix &&
    normalizedBaseline[normalizedBaseline.length - 1 - suffix] ===
      target[target.length - 1 - suffix]
  ) {
    suffix += 1
  }

  assert.equal(normalizedBaseline.slice(prefix, -suffix), '()')
  assert.equal(target.slice(prefix, -suffix), '?.()?')
})
