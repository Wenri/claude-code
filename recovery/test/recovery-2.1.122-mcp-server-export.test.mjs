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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countIdentifier(text, identifier) {
  return [
    ...text.matchAll(
      new RegExp(
        `(?<![\\w$])${escapeRegex(identifier)}(?![\\w$])`,
        'g',
      ),
    ),
  ].length
}

test('authenticates retained createMCPServer export and caller split', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const exportMatch = bundle.match(/createMCPServer:\(\)=>([\w$]+)/)
    assert.ok(exportMatch, `${release.version}: createMCPServer export`)
    const createName = exportMatch[1]
    assert.equal(
      countIdentifier(bundle, createName),
      3,
      `${release.version}: export, start caller, and definition`,
    )

    const definitionOffset = bundle.indexOf(`function ${createName}(`)
    assert.ok(definitionOffset >= 0, `${release.version}: factory definition`)
    const definition = bundle.slice(definitionOffset, definitionOffset + 900)
    assert.match(definition, /\(H,\$\)\{/)
    assert.match(definition, /\(100\)/)
    assert.match(definition, /name:\"claude\/tengu\"/)
    assert.match(definition, /capabilities:\{tools:\{\}\}/)
    assert.match(definition, /\.setRequestHandler\(/)

    const callerStart = bundle.lastIndexOf('async function ', definitionOffset)
    const caller = bundle.slice(callerStart, definitionOffset)
    assert.match(
      caller,
      new RegExp(
        `async function [\\w$]+\\(H,\\$,q\\)\\{[\\w$]+\\(H\\);let [\\w$]+=${escapeRegex(createName)}\\(\\$,q\\),[\\w$]+=new [\\w$]+;await [\\w$]+\\.connect\\([\\w$]+\\)\\}`,
      ),
      `${release.version}: cwd, factory, transport, connect order`,
    )
  }
})

test('source exposes and delegates through createMCPServer', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/entrypoints/mcp.ts'),
    'utf8',
  )

  const startOffset = source.indexOf('export async function startMCPServer')
  const createOffset = source.indexOf('export function createMCPServer')
  assert.ok(startOffset >= 0 && createOffset > startOffset)
  const start = source.slice(startOffset, createOffset)
  assert.match(
    start,
    /setCwd\(cwd\)[\s\S]+createMCPServer\(debug, verbose\)[\s\S]+new StdioServerTransport\(\)[\s\S]+server\.connect\(transport\)/,
  )

  const create = source.slice(createOffset)
  assert.match(create, /createFileStateCacheWithSizeLimit\(/)
  assert.match(create, /new Server\(/)
  assert.match(create, /server\.setRequestHandler\(\s*ListToolsRequestSchema/)
  assert.match(create, /server\.setRequestHandler\(\s*CallToolRequestSchema/)
  assert.match(create, /return server\s*\n\}/)
})
