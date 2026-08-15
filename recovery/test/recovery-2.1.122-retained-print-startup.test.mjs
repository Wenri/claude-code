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

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticated adjacent bundles retain all three print startup paths', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const subscriber = bundle.match(
      /if\(([\w$]+)\(\(\)=>\{if\(![\w$]+&&![\w$]+&&[\w$]+\([\w$]+\)!==void 0\)[\w$]+\(\)\}\),[\w$]+\)[\w$]+\(`\[print\.ts\] Auto-resuming deferred tool:/,
    )
    assert.ok(
      subscriber,
      `${release.version}: idle queue subscriber precedes deferred resume`,
    )
    assert.match(
      bundle,
      new RegExp(`${subscriber[1]}=[\\w$]+\\.subscribe`),
      `${release.version}: idle callback uses the queue signal`,
    )
    assert.match(
      bundle,
      /Auto-resuming deferred tool: \$\{[\w$]+\.toolName\} \(\$\{[\w$]+\.toolUseID\}\)`\),[\w$]+\(\{mode:"prompt",value:"Continue from where you left off\.",uuid:[\w$]+\.randomUUID\(\),isMeta:!0\}\),[\w$]+\(\)/,
      `${release.version}: deferred tool synthetic prompt`,
    )
    assert.match(
      bundle,
      /outputFormat==="stream-json"\)await [\w$]+\.write\(\{type:"result",subtype:"error_during_execution",duration_ms:0,duration_api_ms:0,is_error:!0,num_turns:0,stop_reason:null,session_id:[\w$]+\(\),total_cost_usd:0,usage:[\w$]+,modelUsage:\{\},permission_denials:\[\],uuid:[\w$]+\.randomUUID\(\),errors:\[`Sandbox required but unavailable: \$\{[\w$]+\}\. Set sandbox\.failIfUnavailable=false to allow unsandboxed execution\.`\]\}\)/,
      `${release.version}: structured sandbox-required result`,
    )
  }
})

test('source reconstructs idle dispatch, deferred resume, and SDK error result', () => {
  const source = fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8')
  const normalized = compact(source)

  assert.match(
    source,
    /subscribeToCommandQueue\(\(\) => \{\s+if \(!running && !inputClosed && peek\(isMainThread\) !== undefined\) \{\s+void run\(\)/,
  )
  for (const fragment of [
    'if (deferredToolUse)',
    '[print.ts] Auto-resuming deferred tool: ${deferredToolUse.toolName} (${deferredToolUse.toolUseID})',
    "value: 'Continue from where you left off.'",
    'isMeta: true',
    'void run()',
    "if (options.outputFormat === 'stream-json')",
    "subtype: 'error_during_execution'",
    'usage: EMPTY_USAGE',
    'Sandbox required but unavailable: ${sandboxUnavailableReason}. Set sandbox.failIfUnavailable=false to allow unsandboxed execution.',
  ]) {
    assert.ok(normalized.includes(compact(fragment)), fragment)
  }

  assert.match(
    source,
    /if \(deferredToolUse\)[\s\S]+?Auto-resuming deferred tool[\s\S]+?isMeta: true,[\s\S]+?void run\(\)[\s\S]+?Cron scheduler/,
  )
})
