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

test('authenticates retained model bridge and text-only command surfaces', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /\{type:"local",name:"model",supportsNonInteractive:!0,description:"Set the AI model for Claude Code",argumentHint:"<model>",load:/,
      `${release.version}: text-only descriptor`,
    )
    assert.match(
      bundle,
      /\{type:"local-jsx",name:"model"[\s\S]{0,500}?requires:\{ink:!0\},thinClientDispatch:"control-request"/,
      `${release.version}: interactive remote dispatch`,
    )
    assert.match(
      bundle,
      /`Usage: \/model <name>\. Available: \$\{[\w$]+\.join\(", "\)\}, default, or a full model ID\.`/,
      `${release.version}: exact usage text`,
    )
    assert.match(
      bundle,
      /if\(![\w$]+\|\|[\w$]+\.includes\([\w$]+\)\)\{let [\w$]+=[\w$]+\.getAppState\(\);return\{type:"text",value:`\$\{[\w$]+\([\w$]+\)\}\n\$\{[\w$]+\}`\}\}/,
      `${release.version}: empty and info response`,
    )
    assert.match(
      bundle,
      /value:\(await [\w$]+\([\w$]+,[\w$]+\.getAppState,[\w$]+\.setAppState\)\)\.message/,
      `${release.version}: shared model mutation`,
    )
  }
})

test('source exposes exact interactive and text-only model command paths', () => {
  const index = fs.readFileSync(
    path.join(repo, 'src/commands/model/index.ts'),
    'utf8',
  )
  const handler = fs.readFileSync(
    path.join(repo, 'src/commands/model/model-noninteractive.ts'),
    'utf8',
  )
  const model = fs.readFileSync(
    path.join(repo, 'src/commands/model/model.tsx'),
    'utf8',
  )
  const commands = fs.readFileSync(path.join(repo, 'src/commands.ts'), 'utf8')

  assert.match(index, /requires: \{ ink: true \}/)
  assert.match(index, /thinClientDispatch: 'control-request'/)
  assert.match(
    index,
    /export const modelNonInteractive = \{[\s\S]*?type: 'local',[\s\S]*?supportsNonInteractive: true,[\s\S]*?argumentHint: '<model>'/,
  )
  assert.match(
    handler,
    /Usage: \/model <name>\. Available: \$\{MODEL_ALIASES\.join\(', '\)\}, default, or a full model ID\./,
  )
  assert.match(handler, /renderCurrentModel\(context\.getAppState\(\)\)/)
  assert.match(
    handler,
    /changeModel\(input, context\.getAppState, context\.setAppState\)/,
  )
  assert.match(model, /export async function changeModel\(/)
  assert.match(model, /message: setModelAndBuildMessage\(model, getAppState, setAppState\)/)
  assert.match(model, /renderCurrentModel\([\s\S]*?chalk\.bold/)
  assert.match(commands, /REMOTE_SAFE_COMMANDS[\s\S]*?model, \/\/ Change model/)
  assert.match(commands, /BRIDGE_SAFE_COMMANDS[\s\S]*?modelNonInteractive/)
})
