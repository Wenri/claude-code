import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE

const BASELINE_SHA256 =
  'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be'
const TARGET_SHA256 =
  'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb'
const LATEST_SHA256 =
  '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193'

const targetUnits = [
  [4904, 3678202, 3678353, '5461ef373388a1c4de6bbbb2299c2cc07abd1dd30c807d5de693adcfec0b559d'],
  [4905, 3678353, 3678764, '8bbcbb0425e614178bd4454b0559047447abfe642d174a94580dc88d74e0be5e'],
  [4906, 3678764, 3679181, '9823102061a675ebb38b0d236a8f5c0e4a91781377d70f56c8e7060adfcaabf5'],
  [4907, 3679181, 3679804, '3cd0e1ca9941ef497c3022a6aaf34c964b60b27c13dd78c393185a7480fbcbb6'],
  [4909, 3679843, 3679869, 'd7ab769ca6ff0c7e4b34e40b56bde2aa706ed6889a415e91dc6794532732e844'],
  [4910, 3679869, 3679966, '3791cbfc58f8e61bb44262fa6f5817b3af9e1501c8d9f5ac549542f47ce5d31a'],
]

function authenticatedBundle(filename, expectedHash, label) {
  assert.ok(filename, `${label} bundle environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expectedHash)
  return bytes.toString('utf8')
}

test('target101 pins every MCP directory registry runtime unit', () => {
  const baseline = authenticatedBundle(baselinePath, BASELINE_SHA256, '2.1.100')
  const target = authenticatedBundle(targetPath, TARGET_SHA256, '2.1.101')

  assert.equal(baseline.includes('tengu_mcp_directory_visibility'), false)
  assert.equal(baseline.includes('tengu_mcp_directory_bff'), false)
  assert.equal(baseline.includes('tengu_mcp_registry_fetch'), false)

  for (const [index, start, end, expectedHash] of targetUnits) {
    const unit = target.slice(start, end)
    assert.equal(
      crypto.createHash('sha256').update(unit).digest('hex'),
      expectedHash,
      `target101 unit ${index}`,
    )
  }
})

test('target101 implements visibility validation, both paginated APIs, and fail-closed telemetry', () => {
  const target = authenticatedBundle(targetPath, TARGET_SHA256, '2.1.101')
  for (const fragment of [
    'tengu_mcp_directory_visibility',
    'https://api.anthropic.com/mcp-registry/v0/servers?',
    'https://api.anthropic.com/api/directory/servers?',
    'version:"latest",limit:"100"',
    'limit:"500",visibility:',
    'if(w.type!=="remote")continue',
    'tengu_mcp_directory_bff',
    'empty_visibility:!0',
    'tengu_mcp_registry_fetch',
    '["commercial","gsuite","enterprise","health"]',
  ]) assert.ok(target.includes(fragment), fragment)
})

test('source owns the target101 registry branches and the target116 state-safe equivalent', () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'services/mcp/officialRegistry.ts'),
    'utf8',
  )
  for (const fragment of [
    "'tengu_mcp_directory_visibility'",
    "'tengu_mcp_directory_bff'",
    "'tengu_mcp_registry_fetch'",
    'MAX_PAGES = 20',
    "version: 'latest'",
    "limit: '100'",
    "limit: '500'",
    "entry.type !== 'remote'",
    'response.data.metadata?.nextCursor',
    'response.data.next_cursor ?? undefined',
    'visibilities.length === 0',
    'empty_visibility: true',
    'Date.now() - startedAt',
  ]) assert.ok(source.includes(fragment), fragment)

  assert.match(
    source,
    /useDirectoryBff\s*\?\s*await fetchDirectoryBffUrls\(visibilities\)\s*:\s*await fetchLegacyRegistryUrls\(visibilities\)/,
  )
  if (semanticCase === '2.1.100-to-2.1.101') {
    assert.match(source, /let officialUrls: Set<string> \| undefined/)
  } else {
    assert.match(source, /const officialRegistryState = createOfficialRegistryState\(\)/)
  }
})

test(
  'target116 preserves the registry API, visibility gates, and telemetry',
  {
    skip: latestPath
      ? false
      : 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set',
  },
  () => {
    const latest = authenticatedBundle(latestPath, LATEST_SHA256, '2.1.116')
    for (const fragment of [
      'tengu_mcp_directory_visibility',
      'https://api.anthropic.com/mcp-registry/v0/servers?',
      'https://api.anthropic.com/api/directory/servers?',
      'tengu_mcp_directory_bff',
      'tengu_mcp_registry_fetch',
    ]) assert.ok(latest.includes(fragment), fragment)
  },
)
