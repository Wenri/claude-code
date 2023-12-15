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

test('authenticates retained headless helper exports and live cardinality', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const exportOffset = bundle.indexOf(
      'waitForPendingMcpBeforeFirstCommand:()=>',
    )
    assert.ok(exportOffset >= 0, `${release.version}: print export object`)
    const exportObject = bundle.slice(exportOffset, exportOffset + 650)

    const names = [
      'waitForPendingMcpBeforeFirstCommand',
      'kickOffBackgroundPluginInstall',
      '_runHeadlessStreamingForTesting',
    ]
    const identifiers = Object.fromEntries(
      names.map(name => {
        const match = exportObject.match(
          new RegExp(`${name}:\\(\\)=>([\\w$]+)`),
        )
        assert.ok(match, `${release.version}: ${name} export`)
        assert.equal(
          countIdentifier(bundle, match[1]),
          3,
          `${release.version}: ${name} export/call/definition cardinality`,
        )
        return [name, match[1]]
      }),
    )

    const install = identifiers.kickOffBackgroundPluginInstall
    assert.match(
      bundle,
      new RegExp(
        `function ${escapeRegex(install)}\\(([\\w$]+)\\)\\{let ([\\w$]+)=\\{needsRefresh:!1\\};return \\1\\(\\)\\.then\\(\\([\\w$]+\\)=>\\{\\2\\.needsRefresh=[\\w$]+\\}\\)\\.catch\\([\\w$]+\\),\\2\\}`,
      ),
      `${release.version}: mutable background-install completion state`,
    )

    const prewait = identifiers.waitForPendingMcpBeforeFirstCommand
    const prewaitOffset = bundle.indexOf(`function ${prewait}(`)
    assert.ok(prewaitOffset >= 0, `${release.version}: prewait definition`)
    const prewaitBody = bundle.slice(prewaitOffset, prewaitOffset + 900)
    assert.match(prewaitBody, /===\"remote_baku\"/)
    assert.match(prewaitBody, /type===\"pending\"/)
    assert.match(prewaitBody, /await [\w$]+\(50\)/)
    assert.match(prewaitBody, /\"tengu_headless_mcp_prewait\"/)
    assert.match(prewaitBody, /mcpNonBlocking:/)
  }
})

test('source exposes the authenticated headless helpers to live callers', () => {
  const source = fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8')

  assert.match(source, /export function kickOffBackgroundPluginInstall\(/)
  assert.match(
    source,
    /backgroundPluginRefresh = kickOffBackgroundPluginInstall\(/,
  )
  assert.match(
    source,
    /export async function waitForPendingMcpBeforeFirstCommand\(/,
  )
  assert.match(source, /await waitForPendingMcpBeforeFirstCommand\(getAppState\)/)
  assert.match(
    source,
    /export \{ runHeadlessStreaming as _runHeadlessStreamingForTesting \}/,
  )
  assert.doesNotMatch(source, /trackBackgroundPluginRefresh/)
  assert.doesNotMatch(source, /prewaitForHeadlessMcp/)
})
