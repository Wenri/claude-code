import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates retained native TCC requests before opening settings', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    for (const name of ['requestAccessibility', 'requestScreenRecording']) {
      assert.equal(
        bundle.split(name).length - 1,
        1,
        `${version}: one native ${name} call`,
      )
    }

    const start = bundle.indexOf('requestAccessibility') - 250
    const witness = bundle.slice(start, start + 850)
    assert.match(
      witness,
      /\.tcc\.requestAccessibility\(\),[\w$]+\("open",\["x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_Accessibility"\]/,
    )
    assert.match(
      witness,
      /\.tcc\.requestScreenRecording\(\),[\w$]+\("open",\["x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_ScreenCapture"\]/,
    )
  }
})

test('source requests each missing permission before opening System Settings', () => {
  const source = readFileSync(
    new URL(
      '../../src/components/permissions/ComputerUseApproval/ComputerUseApproval.tsx',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    source,
    /const computerUse = requireComputerUseSwift\(\);[\s\S]*?case "open_accessibility":[\s\S]*?computerUse\.tcc\.requestAccessibility\(\);[\s\S]*?Privacy_Accessibility/,
  )
  assert.match(
    source,
    /case "open_screen_recording":[\s\S]*?computerUse\.tcc\.requestScreenRecording\(\);[\s\S]*?Privacy_ScreenCapture/,
  )
})
