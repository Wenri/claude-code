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
    fragmentCount: 0,
    modeLabelsCount: 0,
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    fragmentCount: 1,
    modeLabelsCount: 2,
  },
]

function readBundle(release) {
  const filename = release.envNames
    .map(name => process.env[name])
    .find(Boolean)
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-only footer layout and Datadog reset export', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'modeLabels'),
      release.modeLabelsCount,
      `${release.version}: modeLabels`,
    )
    for (const fragment of [
      'resetDatadogInit',
      'function KO1(){Fo8.cache?.clear?.(),O7$=null}',
      '[s,$H,KH].filter(CG5)',
      'flexWrap:"wrap",alignItems:"flex-start",paddingLeft:2',
      'flexShrink:0,marginLeft:"auto",flexDirection:"column",alignItems:"flex-end"',
      'function UG5(H)',
      'createElement(p,{gap:1},A,z)',
    ]) {
      assert.equal(
        occurrences(bundle, fragment),
        release.fragmentCount,
        `${release.version}: ${fragment}`,
      )
    }
  }
})

test('source stacks notifications above bridge and mode labels', () => {
  const contents = compact(
    fs.readFileSync(
      path.join(repo, 'src/components/PromptInput/PromptInputFooter.tsx'),
      'utf8',
    ),
  )
  for (const fragment of [
    'const modeLabels = [ "external" === \'ant\' && isUndercover() && \'undercover\', isBgSession() && \'background\', isFullscreen && briefTranscript && \'focus\', ].filter(isTruthy)',
    'function isTruthy(value: string | false): value is string { return Boolean(value); }',
    'flexWrap="wrap" alignItems="flex-start"',
    '<PromptInputFooterRightSide notifications={isFullscreen ? null : <Notifications',
    'bridgeSelected={bridgeSelected} modeLabels={modeLabels}',
    'return <Box flexShrink={0} marginLeft="auto" flexDirection="column" alignItems="flex-end"> {notifications} <Box gap={1}>',
    '<BridgeStatusIndicator bridgeSelected={bridgeSelected} />',
    "modeLabels.length > 0 && <Text dimColor>{modeLabels.join(' & ')}</Text>",
  ]) {
    assert.ok(contents.includes(compact(fragment)), `missing ${fragment}`)
  }
  assert.equal(contents.includes('footerStates'), false)
})

test('source resets both Datadog initialization caches', () => {
  const contents = compact(
    fs.readFileSync(
      path.join(repo, 'src/services/analytics/datadog.ts'),
      'utf8',
    ),
  )
  assert.ok(
    contents.includes(
      compact(`
        export function resetDatadogInit(): void {
          initializeDatadog.cache?.clear?.()
          datadogInitialized = null
        }
      `),
    ),
  )
})
