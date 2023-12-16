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

test('authenticates the retained tall-terminal help feedback hint', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.split(
        'Something else? Use /feedback to report bugs or request features.',
      ).length - 1,
      1,
      `${release.version}: feedback hint cardinality`,
    )
    const hintOffset = bundle.indexOf(
      'Something else? Use /feedback to report bugs or request features.',
    )
    const gateContext = bundle.slice(hintOffset - 15_000, hintOffset)
    const gate = gateContext.match(/,f=[\w$]+>=([A-Za-z_$][\w$]*)/)
    assert.ok(gate, `${release.version}: tall-terminal gate`)
    assert.match(
      bundle,
      new RegExp(`${gate[1]}=44`),
      `${release.version}: help feedback threshold`,
    )
  }
})

test('source reproduces the help feedback threshold and placement', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/HelpV2/HelpV2.tsx'),
    'utf8',
  )
  assert.match(source, /const MIN_ROWS_FOR_FEEDBACK_HINT = 44/)
  assert.match(
    source,
    /hasEnoughRowsForFeedbackHint = rows >= MIN_ROWS_FOR_FEEDBACK_HINT/,
  )
  assert.match(
    source,
    /hasEnoughRowsForFeedbackHint && <Box marginTop=\{1\} flexShrink=\{0\}><Text dimColor=\{true\}>Something else\? Use \/feedback to report bugs or request features\.<\/Text><\/Box>/,
  )
  assert.match(
    source,
    /<Pane color="professionalBlue">\{t6\}\{t7\}\{feedbackHint\}\{t8\}<\/Pane>/,
  )
})
