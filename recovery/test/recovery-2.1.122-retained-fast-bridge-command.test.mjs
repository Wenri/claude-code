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

test('authenticates the retained text-only fast command and remote dispatch', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /\{type:"local",name:"fast",supportsNonInteractive:!0,get description\(\)\{return`Toggle fast mode \(\$\{[\w$]+\} only\)`\},argumentHint:"\[on\|off\]",load:/,
      `${release.version}: text-only descriptor`,
    )
    assert.match(
      bundle,
      /if\(![\w$]+\(\)\)return\{type:"text",value:"Fast mode is not available\."\};await [\w$]+\(\);let [\w$]+=[\w$]+\.trim\(\)\.toLowerCase\(\)/,
      `${release.version}: availability and argument handling`,
    )
    assert.match(
      bundle,
      /value:await [\w$]+\([\w$]+,[\w$]+\.getAppState,[\w$]+\.setAppState,"bridge"\)/,
      `${release.version}: bridge attribution`,
    )
    assert.match(
      bundle,
      /type:"local-jsx",name:"fast"[\s\S]{0,500}?requires:\{ink:!0\},thinClientDispatch:"control-request"/,
      `${release.version}: interactive remote dispatch`,
    )
    assert.match(
      bundle,
      /type:"local-jsx",name:"plan",description:"Enable plan mode or view the current session plan",argumentHint:"\[open\|<description>\]",requires:\{ink:!0\}/,
      `${release.version}: plan requires Ink`,
    )
  }
})

test('source exposes exact interactive and text-only fast command surfaces', () => {
  const index = fs.readFileSync(
    path.join(repo, 'src/commands/fast/index.ts'),
    'utf8',
  )
  const handler = fs.readFileSync(
    path.join(repo, 'src/commands/fast/fast-noninteractive.ts'),
    'utf8',
  )
  const commands = fs.readFileSync(path.join(repo, 'src/commands.ts'), 'utf8')
  const plan = fs.readFileSync(
    path.join(repo, 'src/commands/plan/index.ts'),
    'utf8',
  )

  assert.doesNotMatch(index, /availability:/)
  assert.match(index, /requires: \{ ink: true \}/)
  assert.match(index, /thinClientDispatch: 'control-request'/)
  assert.match(plan, /requires: \{ ink: true \}/)
  assert.match(
    index,
    /export const fastNonInteractive = \{[\s\S]*?type: 'local',[\s\S]*?supportsNonInteractive: true,[\s\S]*?argumentHint: '\[on\|off\]'/,
  )
  assert.match(handler, /value: 'Fast mode is not available\.'/)
  assert.match(handler, /else if \(arg === ''\) enable = !context\.getAppState\(\)\.fastMode/)
  assert.match(handler, /context\.setAppState,[\s\S]*?'bridge'/)
  assert.match(
    commands,
    /REMOTE_SAFE_COMMANDS[\s\S]*?fast, \/\/ Toggle fast mode/,
  )
  assert.match(
    commands,
    /BRIDGE_SAFE_COMMANDS[\s\S]*?fastNonInteractive/,
  )
})
