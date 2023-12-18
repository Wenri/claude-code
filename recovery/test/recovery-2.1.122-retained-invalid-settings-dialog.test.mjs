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

const warningExplanation =
  'The values listed above were skipped; the rest of the file is in effect.'
const errorExplanation =
  'Files with errors are skipped entirely, not just the invalid settings.'

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

test('authenticates the retained settings warning and error split', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const text of [
      'Settings Error',
      'Settings Warning',
      errorExplanation,
      warningExplanation,
      'Continue without these settings',
    ]) {
      assert.equal(bundle.split(text).length - 1, 1, `${release.version}: ${text}`)
    }

    const anchor = bundle.indexOf('Settings Warning')
    assert.notEqual(anchor, -1, `${release.version}: dialog anchor`)
    const dialog = bundle.slice(anchor - 800, anchor + 900)
    assert.match(
      dialog,
      /\?\[\{label:"Exit and fix manually",value:"exit"\},\{label:"Continue without these settings",value:"continue"\}\]:\[\{label:"Continue",value:"continue"\},\{label:"Exit and fix manually",value:"exit"\}\]/,
      `${release.version}: severity-specific option ordering`,
    )
    assert.match(
      dialog,
      /\?"Settings Error":"Settings Warning"/,
      `${release.version}: severity-specific title`,
    )
    assert.match(
      dialog,
      /\?"Files with errors are skipped entirely, not just the invalid settings\.":"The values listed above were skipped; the rest of the file is in effect\."/,
      `${release.version}: severity-specific explanation`,
    )
  }
})

test('source defaults warnings to continue while errors default to exit', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/InvalidSettingsDialog.tsx'),
    'utf8',
  )

  assert.match(
    source,
    /settingsErrors\.some\([\s\S]*severity !== 'warning'/,
  )
  assert.match(source, /const title = hasErrors \? 'Settings Error' : 'Settings Warning'/)
  assert.match(source, /const onCancel = hasErrors \? onExit : onContinue/)
  assert.match(
    source,
    /const explanation = hasErrors\s*\? 'Files with errors are skipped entirely, not just the invalid settings\.'\s*: 'The values listed above were skipped; the rest of the file is in effect\.'/,
  )
  assert.equal(source.split(warningExplanation).length - 1, 1)
  assert.equal(source.split(errorExplanation).length - 1, 1)
  assert.match(
    source,
    /\? \[[\s\S]*Exit and fix manually[\s\S]*Continue without these settings[\s\S]*: \[[\s\S]*label: 'Continue'[\s\S]*Exit and fix manually/,
  )
})
