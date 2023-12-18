import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const unit = [
  18346,
  12767049,
  12769196,
  '2dff6870525c4d82b9e5607e1f8ccede0c42934c49cbdbc801b9af4fdd37eb31',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target101 pins focus-scoped Chrome onboarding confirmation', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetPath
      ? 'CLAUDE_CODE_2_1_101_BUNDLE is required'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(bytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const [index, start, end, hash] = unit
  const region = structural.regions[index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, hash],
  )
  const fragment = bytes.toString('utf8').slice(start, end)
  assert.equal(sha256(fragment), hash)
  assert.match(fragment, /\.key==="return"/)
  assert.match(fragment, /!\w+\.ctrl&&!\w+\.meta/)
  assert.match(fragment, /\.preventDefault\(\)/)
  assert.match(fragment, /tabIndex:0,autoFocus:!0,onKeyDown:/)
})

test('source scopes Enter handling to the focused onboarding container', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'components/ClaudeInChromeOnboarding.tsx'),
    'utf8',
  )
  for (const fragment of [
    "key.key === 'return' && !key.ctrl && !key.meta",
    'key.preventDefault();',
    'tabIndex={0}',
    'autoFocus={true}',
    'onKeyDown={t3}',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.equal(source.includes('useInput(t3)'), false)
})

test('target116 retains focus-scoped onboarding confirmation', {
  skip: semanticCase || !latestPath
    ? 'current target116 evidence unavailable'
    : false,
}, () => {
  const latest = fs.readFileSync(latestPath)
  assert.equal(
    sha256(latest),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const text = latest.toString('utf8')
  const marker = text.indexOf('tengu_claude_in_chrome_onboarding_shown')
  assert.ok(marker > 0)
  const fragment = text.slice(marker, marker + 5000)
  assert.match(fragment, /\.key==="return"/)
  assert.match(fragment, /\.preventDefault\(\)/)
  assert.match(fragment, /tabIndex:0,autoFocus:!0,onKeyDown:/)
})
