import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceOptions = {
  skip:
    !semanticCase || semanticCase === caseName
      ? false
      : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip:
    semanticCase && semanticCase !== caseName
      ? `not applicable to ${semanticCase}`
      : !semanticCase &&
          (!process.env.CLAUDE_CODE_2_1_109_BUNDLE ||
            !process.env.CLAUDE_CODE_2_1_110_BUNDLE)
        ? 'authenticated target109 and target110 bundles are required'
        : false,
}

const BASELINE_SHA256 =
  '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7'
const TARGET_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'

const TARGET_UNITS = [
  {
    index: 19346,
    start: 13429576,
    end: 13430933,
    nodeType: 'FunctionDeclaration',
    sha256: '022fdfcedef666cb02c89026bcd6cb9eeb1a9faa59f15cf5ff153928c6186d80',
  },
  {
    index: 19351,
    start: 13432286,
    end: 13433586,
    nodeType: 'FunctionDeclaration',
    sha256: 'b0e7ccc2e1f205d9b985ff6b77a65da74af607d812b055be55518676c372811c',
  },
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function bundle(environmentName, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedSha256)
  return bytes.toString('utf8')
}

function source(relative) {
  const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (sourceRoot) return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
  return fs.readFileSync(
    fileURLToPath(new URL(`../../src/${relative}`, import.meta.url)),
    'utf8',
  )
}

test('target110 pins both complete missing-MCP-server handlers', bundleOptions, () => {
  const baseline = bundle('CLAUDE_CODE_2_1_109_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_110_BUNDLE', TARGET_SHA256)
  for (const unit of TARGET_UNITS) {
    const fragment = target.slice(unit.start, unit.end)
    assert.equal(sha256(fragment), unit.sha256, `target unit ${unit.index}`)
    assert.match(fragment, /^async function /)
  }
  assert.equal(baseline.includes('". Configured servers: '), false)
  assert.equal(target.match(/"\. Configured servers: /g)?.length, 2)
  assert.equal(
    target.match(/"\. No MCP servers are configured\.`/g)?.length,
    2,
  )
})

test('source enumerates sorted configured names and handles the empty set', sourceOptions, () => {
  const contents = source('cli/handlers/mcp.tsx')
  for (const fragment of [
    'const configuredServers = [',
    '...Object.keys(projectConfig.mcpServers ?? {})',
    '...Object.keys(projectServers)',
    '...Object.keys(globalConfig.mcpServers ?? {})',
    '.filter((configuredName, index, names) =>',
    'names.indexOf(configuredName) === index',
    'const configuredServers = Object.keys(servers).sort()',
    'Configured servers: ${configuredServers.join(\', \')}',
    'No MCP servers are configured.',
  ]) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
  assert.equal(
    contents.match(/No MCP server found with name: \"\$\{name\}\"/g)?.length,
    4,
  )
})
