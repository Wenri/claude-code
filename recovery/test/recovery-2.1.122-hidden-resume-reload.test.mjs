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
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value.toString('utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, '')
}

test('authenticates retained resume reload invalidation and picker telemetry', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.split('reloadGeneration').length - 1,
      2,
      `${release.version}: selector prop and caller`,
    )
    assert.match(
      bundle,
      /useEffect\(\(\)=>\{if\(([\w$]+)===0\)return;[\w$]+\.current\?\.abort\(\),[\w$]+\(\(([\w$]+)\)=>\2\.status==="idle"\?\2:\{status:"idle"\}\),[\w$]+\(!1\),[\w$]+\(null\)\},\[\1\]\)/,
      `${release.version}: abort and reset on reload`,
    )
    assert.match(
      bundle,
      /\.current=null,[\w$]+\(\(([\w$]+)\)=>\1\+1\)/,
      `${release.version}: invalidate before replacement load`,
    )
    assert.match(bundle, /failure_reason:"not_found_picker"/)
    assert.match(bundle, /"claude \\xB7 resume"/)
  }
})

test('source cancels stale searches and serializes resume log refreshes', () => {
  const selector = compact(
    fs.readFileSync(path.join(repo, 'src/components/LogSelector.tsx'), 'utf8'),
  )
  for (const fragment of [
    'reloadGeneration?: number',
    'reloadGeneration = 0',
    'if (reloadGeneration === 0) return',
    'agenticSearchAbortRef.current?.abort()',
    "previous.status === 'idle' ? previous : { status: 'idle' }",
    'setIsAgenticSearchOptionFocused(false)',
    'setPreviewLog(null)',
  ]) {
    assert.ok(selector.includes(compact(fragment)), fragment)
  }

  const resume = compact(
    fs.readFileSync(path.join(repo, 'src/screens/ResumeConversation.tsx'), 'utf8'),
  )
  for (const fragment of [
    'const [reloadGeneration, setReloadGeneration] = React.useState(0)',
    'if (loadMoreInFlightRef.current) return',
    'if (sessionLogResultRef.current !== ref) return',
    'const requestGeneration = ++loadRequestGenerationRef.current',
    'sessionLogResultRef.current = null',
    'setReloadGeneration(previous => previous + 1)',
    'if (loadRequestGenerationRef.current !== requestGeneration) return',
    'setLogs(previous => previous.slice())',
    "useTerminalTitle(resumeData || terminalTitleDisabled ? null : 'claude · resume')",
    'loading && (logs.length === 0 || filteredLogs.length === 0)',
    'isLoading={loading} reloadGeneration={reloadGeneration}',
    "failure_reason: 'not_found_picker'",
  ]) {
    assert.ok(resume.includes(compact(fragment)), fragment)
  }
})
