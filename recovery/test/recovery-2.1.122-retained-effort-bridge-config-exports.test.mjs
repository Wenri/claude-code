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

test('authenticated adjacent bundles retain effort and REPL bridge config exports', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const name of [
      'SLIDER_LEVELS',
      'EFFORT_HELP_TEXT',
      'getReplBridgeConfig',
      'checkReplBridgeMinVersion',
      'DEFAULT_REPL_BRIDGE_CONFIG',
    ]) {
      assert.equal(
        bundle.split(name).length - 1,
        1,
        `${release.version}: ${name} export cardinality`,
      )
    }
    assert.match(
      bundle,
      /SLIDER_LEVELS:\(\)=>[\w$]+,EFFORT_HELP_TEXT:\(\)=>[\w$]+/,
      `${release.version}: effort export order`,
    )
    assert.match(
      bundle,
      /getReplBridgeConfig:\(\)=>[\w$]+,checkReplBridgeMinVersion:\(\)=>[\w$]+,DEFAULT_REPL_BRIDGE_CONFIG:\(\)=>[\w$]+/,
      `${release.version}: bridge config export order`,
    )
  }
})

test('source delegates live effort and bridge paths through retained names', () => {
  const effort = fs.readFileSync(
    path.join(repo, 'src/commands/effort/effort.tsx'),
    'utf8',
  )
  const noninteractive = fs.readFileSync(
    path.join(repo, 'src/commands/effort/effort-noninteractive.ts'),
    'utf8',
  )
  const bridgeConfig = fs.readFileSync(
    path.join(repo, 'src/bridge/envLessBridgeConfig.ts'),
    'utf8',
  )
  const bridgeCore = fs.readFileSync(
    path.join(repo, 'src/bridge/remoteBridgeCore.ts'),
    'utf8',
  )
  const bridgeInit = fs.readFileSync(
    path.join(repo, 'src/bridge/initReplBridge.ts'),
    'utf8',
  )

  assert.match(effort, /export const EFFORT_HELP_TEXT =/)
  assert.match(effort, /export const SLIDER_LEVELS =/)
  assert.doesNotMatch(effort, /\bEFFORT_OPTIONS\b/)
  assert.match(noninteractive, /EFFORT_HELP_TEXT/)

  assert.match(bridgeConfig, /export const DEFAULT_REPL_BRIDGE_CONFIG:/)
  assert.match(bridgeConfig, /export async function getReplBridgeConfig\(/)
  assert.match(bridgeConfig, /export async function checkReplBridgeMinVersion\(/)
  assert.match(
    bridgeConfig,
    /export const DEFAULT_ENV_LESS_BRIDGE_CONFIG = DEFAULT_REPL_BRIDGE_CONFIG/,
  )
  assert.match(bridgeCore, /getReplBridgeConfig/)
  assert.match(bridgeInit, /checkReplBridgeMinVersion/)
})
