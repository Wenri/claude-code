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

test('authenticates retained effort bridge and text-only command surfaces', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /\{type:"local-jsx",name:"effort",description:"Set effort level for model usage",argumentHint:"\[low\|medium\|high\|xhigh\|max\|auto\]"[\s\S]{0,300}?requires:\{ink:!0\},thinClientDispatch:"control-request"/,
      `${release.version}: interactive descriptor`,
    )
    assert.match(
      bundle,
      /\{type:"local",name:"effort",supportsNonInteractive:!0,description:"Set effort level for model usage",argumentHint:"<low\|medium\|high\|xhigh\|max\|auto>"/,
      `${release.version}: text-only descriptor`,
    )
    assert.match(
      bundle,
      /if\(![\w$]+\)return\{type:"text",value:"Usage: \/effort <low\|medium\|high\|xhigh\|max\|auto>"\}/,
      `${release.version}: empty-argument usage`,
    )
    assert.match(
      bundle,
      /if\([\w$]+\.effortUpdate\)\{let [\w$]+=[\w$]+\.effortUpdate\.value;[\w$]+\.setAppState\(\([\w$]+\)=>[\w$]+\.effortValue===[\w$]+\?[\w$]+:\{\.\.\.[\w$]+,effortValue:[\w$]+\}\)\}/,
      `${release.version}: immutable state update`,
    )
  }
})

test('source wires effort through remote-safe and bridge-safe command sets', () => {
  const index = fs.readFileSync(
    path.join(repo, 'src/commands/effort/index.ts'),
    'utf8',
  )
  const handler = fs.readFileSync(
    path.join(repo, 'src/commands/effort/effort-noninteractive.ts'),
    'utf8',
  )
  const commands = fs.readFileSync(path.join(repo, 'src/commands.ts'), 'utf8')

  assert.match(index, /requires: \{ ink: true \}/)
  assert.match(index, /thinClientDispatch: 'control-request'/)
  assert.match(
    index,
    /export const effortNonInteractive = \{[\s\S]*?type: 'local',[\s\S]*?supportsNonInteractive: true,[\s\S]*?argumentHint: '<low\|medium\|high\|xhigh\|max\|auto>'/,
  )
  assert.match(
    handler,
    /value: 'Usage: \/effort <low\|medium\|high\|xhigh\|max\|auto>'/,
  )
  assert.match(handler, /state\.mainLoopModelForSession[\s\S]*?getDefaultMainLoopModelSetting\(\)/)
  assert.match(handler, /previous\.effortValue === value[\s\S]*?effortValue: value/)
  assert.match(commands, /REMOTE_SAFE_COMMANDS[\s\S]*?effort, \/\/ Change reasoning effort/)
  assert.match(commands, /BRIDGE_SAFE_COMMANDS[\s\S]*?effortNonInteractive/)
})
