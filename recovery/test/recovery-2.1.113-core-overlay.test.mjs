import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const TARGET_SHA256 =
  'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
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

test('recovers Remote Control-safe extra usage and MCP-aware tool ranking', () => {
  includesAll(source('src/commands/extra-usage/extra-usage-core.ts'), [
    '{ openInBrowser = true }',
    'if (!openInBrowser)',
    "return { type: 'browser-opened', url, opened: false }",
  ])
  includesAll(
    source('src/commands/extra-usage/extra-usage-noninteractive.ts'),
    [
      'getIsNonInteractiveSession',
      'openInBrowser: getIsNonInteractiveSession()',
    ],
  )
  includesAll(source('src/tools/ToolSearchTool/ToolSearchTool.ts'), [
    'tool.mcpInfo ?? mcpInfoFromString(name)',
    'coarseParts',
    "part.split(/[\\s_.]+/)",
    'score += parsed.isMcp ? 12 : 10',
    'score += parsed.isMcp ? 4 : 3',
  ])
})

test('recovers logical-line editing and Windows backspace behavior', () => {
  includesAll(source('src/hooks/useTextInput.ts'), [
    "['a', () => cursor.startOfLogicalLine()]",
    "['e', () => cursor.endOfLogicalLine()]",
    "['u', killToLineStart]",
  ])
  includesAll(source('src/ink/parse-keypress.ts'), [
    'shouldTreatBackspaceAsCtrlBackspace',
    'CLAUDE_CODE_BS_AS_CTRL_BACKSPACE',
    "platform === 'win32'",
    "env.TERM_PROGRAM !== 'mintty'",
    "env.TERM !== 'cygwin'",
    'if (isBackspaceCtrl()) key.ctrl = true',
  ])
})

test('recovers link, effort, and SDK image failure handling', () => {
  includesAll(source('src/components/shell/OutputLine.tsx'), [
    '/https?:\\/\\/[^\\s"\'<>\\\\\\x00-\\x1f]+/g',
    "line.includes(OSC8_PREFIX) ? line : linkifyLine(line)",
  ])
  includesAll(source('src/commands/effort/effort.tsx'), [
    "message: 'Effort level set to max'",
    'effortUpdate: { value: undefined }',
  ])
  includesAll(source('src/services/api/claude.ts'), [
    'delete outputConfig.effort',
    'delete extraBodyParams.output_config',
  ])
  includesAll(
    source('src/utils/processUserInput/processUserInput.ts'),
    [
      'error instanceof ImageResizeError',
      "logEvent('tengu_image_resize_degraded', {})",
      '[Image could not be processed: ${error.message}]',
    ],
  )
})

test('authenticated adjacent generated code contains the recovered behaviors', () => {
  const baseline = bundle('CLAUDE_CODE_2_1_112_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_113_BUNDLE', TARGET_SHA256)
  const fragments = [
    'CLAUDE_CODE_BS_AS_CTRL_BACKSPACE',
    'tengu_image_resize_degraded',
    'Domains that are always blocked, even if matched by allowedDomains.',
    'activeCallWatchdogs',
    'coarseParts',
    'openInBrowser',
    'file_suggestions is not supported in this context',
    'Agent stalled: no progress for ${',
  ]
  for (const fragment of fragments) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }
})
