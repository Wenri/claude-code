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

test('authenticates retained PowerShell action-preference validation', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.split('silentlycontinue').length - 1,
      1,
      `${release.version}: safe action preference set`,
    )
    assert.match(
      bundle,
      /new Set\(\["silentlycontinue","0","stop","1","continue","2","ignore","4"\]\)/,
      `${release.version}: exact safe values`,
    )
    const safeSet = bundle.indexOf('silentlycontinue')
    const validator = bundle.indexOf('.toLowerCase().replace(', safeSet)
    assert.notEqual(validator, -1, `${release.version}: normalized value check`)
    assert.ok(
      bundle.slice(validator, validator + 300).includes('.has('),
      `${release.version}: fail-closed membership check`,
    )
  }
})

test('source rejects unsafe common action-preference values before allowAllFlags', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/tools/PowerShellTool/readOnlyValidation.ts'),
    'utf8',
  )
  for (const fragment of [
    "'silentlycontinue'",
    "'stop'",
    "'continue'",
    "'ignore'",
    'PS_TOKENIZER_DASH_CHARS.has',
    ".replace(/^['\"]|['\"]$/g, '')",
    '!SAFE_ACTION_PREFERENCE_VALUES.has(value)',
    'isCmdlet && hasDangerousActionPreferenceValue(cmd.args)',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.ok(
    source.indexOf('isCmdlet && hasDangerousActionPreferenceValue(cmd.args)') <
      source.indexOf('if (config.allowAllFlags)'),
  )
})
