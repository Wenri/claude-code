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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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
  7078,
  5085293,
  5085707,
  '27c0af1c6f7da4d470eb9ca7085d033d6081e5897c1bee08a9004e914b4c2213',
]
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target101 pins the MCP-aware tool-name parser unit', pairOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const [index, start, end, hash] = unit
  const region = structural.regions[index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, hash],
  )
  assert.equal(sha256(target.slice(start, end)), hash)
  const parserStart = target.lastIndexOf('function ', start)
  const parserEnd = target.indexOf('async function', end)
  const neighborhood = target.slice(parserStart, parserEnd)
  for (const fragment of [
    '.mcpInfo.serverName',
    '.mcpInfo.toolName',
    '.split(/[\\s_.]+/)',
    'full:',
    'isMcp:',
  ]) assert.ok(neighborhood.includes(fragment), fragment)
})

test('MCP display names replace normalized-only parsing at target101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal((baseline.match(/\.split\(\/\[\\s_\.\]\+\/\)/g) ?? []).length, 0)
  assert.equal((target.match(/\.split\(\/\[\\s_\.\]\+\/\)/g) ?? []).length, 1)
})

test('source preserves MCP server and tool word boundaries', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'tools/ToolSearchTool/ToolSearchTool.ts'),
    'utf8',
  )
  const start = source.indexOf('function parseToolName(')
  const end = source.indexOf('function compileTermPatterns(', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const parser = source.slice(start, end)
  assert.ok(parser.includes('tool.mcpInfo'))
  assert.ok(parser.includes('.serverName'))
  assert.ok(parser.includes('.toolName'))
  assert.ok(
    parser.includes('.flatMap(part => part.split(/[\\s_.]+/))') ||
      parser.includes(
        '.flatMap(part => part.toLowerCase().split(/[\\s_.]+/))',
      ),
  )
  assert.ok(
    parser.includes('.flatMap(part => part.toLowerCase()') ||
      parser.includes('.map(part => part.toLowerCase())'),
  )
  assert.ok(parser.includes("full: parts.join(' ')"))

  const split = value => value.toLowerCase().split(/[\s_.]+/).filter(Boolean)
  assert.deepEqual(
    ['My Server.Name', 'Fetch_User'].flatMap(split),
    ['my', 'server', 'name', 'fetch', 'user'],
  )
})
