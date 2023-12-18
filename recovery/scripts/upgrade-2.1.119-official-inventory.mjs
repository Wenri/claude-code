import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const inventoryPath = path.join(
  repo,
  'recovery/2.1.119-official-semantic-inventory.json',
)
const baselinePath = process.env.CLAUDE_CODE_2_1_118_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_119_BUNDLE

if (!baselinePath || !targetPath) {
  throw new Error(
    'CLAUDE_CODE_2_1_118_BUNDLE and CLAUDE_CODE_2_1_119_BUNDLE are required',
  )
}

const baseline = fs.readFileSync(baselinePath)
const target = fs.readFileSync(targetPath)
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))

// These are deliberately small, stable witnesses from the authenticated raw
// bundles. The more descriptive owned-source assertions below bind each witness
// to the recovered implementation rather than to a minifier-specific function
// name.
const witnesses = new Map([
  [1, ['tengu_migrate_user_intent_to_settings']],
  [2, ['prUrlTemplate']],
  [3, ['CLAUDE_CODE_HIDE_CWD']],
  [4, ['pull-requests|-\\/merge_requests']],
  [5, ['allowedAgentTypes', 'disallowedTools']],
  [6, ['agentPermissionMode']],
  [7, [{ removal: 'PowerShell tool requires interactive approval' }]],
  [8, ['duration_ms', 'tool_input_size_bytes']],
  [9, ['mcpServers', 'Promise.all']],
  [10, ['highest tag satisfying']],
  [11, ['vimMode', 'INSERT']],
  [12, ['matched']],
  [13, ['wrapped']],
  [14, ['getCachedRepositoryHost']],
  [15, ['blockedMarketplaces']],
  [16, ['tool_input_size_bytes', 'tool_use_id']],
  [17, ['thinkingEnabled', 'effort']],
  [18, ['\\r\\n', '\\r']],
  [19, ['codepoint']],
  [20, ['GlobTool', 'GrepTool']],
  [21, ['scrollTop', 'sticky']],
  [22, ['Invalid OAuth error response']],
  [23, ['(no prompt)']],
  [24, ['permissionContext', 'auto']],
  [25, ['produced no response payload']],
  [26, ['mainThread']],
  [27, ['ENABLE_TOOL_SEARCH', 'vertex']],
  [28, ['replacement', 'longest']],
  [29, ['XTVERSION', 'Apple_Terminal']],
  [30, ['headers', 'environment variable']],
  [31, ['client_secret_post', 'clientSecret']],
  [32, ['nextInput', '/skills']],
  [33, ['Not available to subagents']],
  [34, ['.claude-plugin', 'marketplace.json']],
  [35, ['AppStateProvider', 'mainLoopModel']],
  [36, ['"verbose"']],
  [37, ['Resets ', 'maxWidth']],
  [38, ['user_config', 'default']],
  [39, ['\\xA0$1']],
  [40, ['getPlan', 'plan mode']],
  [41, ['isMeta', 'compact']],
  [42, ['enabledPlugins', 'pluginErrors']],
  [43, ['agentWorktreeSlug', 'agent-a[0-9a-f]{16}']],
  [44, ['disabled', 'MCP']],
  [45, ['Number(', '.sort(']],
  [46, ['API rate limit (?:already )?exceeded']],
  [47, ['bytesRead', 'subarray']],
  [48, ['getMaterializedSessionFile']],
  [49, ['override', 'warning']],
  [50, [{ removal: "Windows requires 'cmd /c' wrapper" }]],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function countOccurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

function bundleWitness(bullet, entry, index) {
  const removal = typeof entry === 'object'
  const text = removal ? entry.removal : entry
  const bytes = Buffer.from(text)
  const baselineCount = countOccurrences(baseline, bytes)
  const targetCount = countOccurrences(target, bytes)
  if (removal) {
    if (baselineCount === 0 || targetCount !== 0) {
      throw new Error(`bullet ${bullet}: invalid removal witness ${text}`)
    }
  } else if (targetCount === 0) {
    throw new Error(`bullet ${bullet}: target witness not found: ${text}`)
  }
  return {
    id: `b${String(bullet).padStart(2, '0')}-target-${index + 1}`,
    kind: removal ? 'baseline-removal' : 'target-exact',
    encoding: 'base64',
    base64: bytes.toString('base64'),
    bytes: bytes.length,
    sha256: sha256(bytes),
    baseline_count: baselineCount,
    target_count: targetCount,
  }
}

for (const row of inventory.rows) {
  row.direct_test =
    `recovery/test/recovery-2.1.119-official-bullets.test.mjs#${row.test_id}`
  if (row.bullet === 51) {
    const artifact = 'audio-capture.node'
    const baselineNative = fs.readFileSync(
      path.join(path.dirname(baselinePath), artifact),
    )
    const targetNative = fs.readFileSync(
      path.join(path.dirname(targetPath), artifact),
    )
    row.targetFragments = [
      {
        id: 'b51-native-linux-boundary',
        kind: 'native-artifact',
        artifact,
        baseline_bytes: baselineNative.length,
        target_bytes: targetNative.length,
        baseline_sha256: sha256(baselineNative),
        target_sha256: sha256(targetNative),
      },
    ]
    row.source = []
    continue
  }
  row.targetFragments = witnesses
    .get(row.bullet)
    .map((entry, index) => bundleWitness(row.bullet, entry, index))
  row.source = row.source.map(assertion => {
    const fragment = Buffer.from(assertion.fragment)
    const contents = fs.readFileSync(path.join(repo, assertion.path))
    const count = countOccurrences(contents, fragment)
    if (count === 0) {
      throw new Error(
        `bullet ${row.bullet}: source witness absent: ${assertion.path}: ${assertion.fragment}`,
      )
    }
    return {
      path: assertion.path,
      fragment: assertion.fragment,
      bytes: fragment.length,
      sha256: sha256(fragment),
      count,
    }
  })
}

inventory.schema_version = 2
inventory.direct_all_51_test_coverage = true
fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
