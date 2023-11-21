import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sessionStoragePath = fileURLToPath(
  new URL('../../src/utils/sessionStorage.ts', import.meta.url),
)
const logsPath = fileURLToPath(
  new URL('../../src/types/logs.ts', import.meta.url),
)
const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE

function targetBundle() {
  assert.ok(
    targetBundlePath,
    'CLAUDE_CODE_2_1_90_BUNDLE environment variable must be set',
  )
  return fs.readFileSync(targetBundlePath, 'utf8')
}

test('preserves resume-critical external attachment records', () => {
  const source = fs.readFileSync(sessionStoragePath, 'utf8')
  for (const attachmentType of [
    'hook_deferred_tool',
    'deferred_tools_delta',
    'mcp_instructions_delta',
    'agent_listing_delta',
    'companion_intro',
  ]) {
    assert.match(
      source,
      new RegExp(`m\\.attachment\\.type === '${attachmentType}'`),
    )
  }

  assert.match(
    targetBundle(),
    /attachment\.type==="hook_deferred_tool"\)return!0;if\(q\.attachment\.type==="deferred_tools_delta"\|\|q\.attachment\.type==="mcp_instructions_delta"\|\|q\.attachment\.type==="agent_listing_delta"\|\|q\.attachment\.type==="companion_intro"\)return!0/,
  )
})

test('loads project-lite logs concurrently before flattening', () => {
  const source = fs.readFileSync(sessionStoragePath, 'utf8')
  assert.match(
    source,
    /const logsPerProject = await Promise\.all\(\s*projectDirs\.map\([\s\S]*?getSessionFilesLite[\s\S]*?\)\s*const rawLogs = logsPerProject\.flat\(\)/,
  )
  assert.match(
    source,
    /const logsPerProject = await Promise\.all\(\s*projectCandidates\.map\([\s\S]*?getSessionFilesLite[\s\S]*?\)\s*[\s\S]*?deduplicateLogsBySessionId\(logsPerProject\.flat\(\)\)/,
  )

  const bundle = targetBundle()
  const resumeLoader = bundle.slice(
    bundle.indexOf('async function Kc8('),
    bundle.indexOf('async function BK6('),
  )
  assert.match(resumeLoader, /Promise\.all\(/)
  assert.match(resumeLoader, /\.flat\(\)/)
})

test('filters non-interactive session metadata from the resume picker', () => {
  const source = fs.readFileSync(sessionStoragePath, 'utf8')
  const logs = fs.readFileSync(logsPath, 'utf8')

  assert.match(
    logs,
    /sessionKind\?: 'bg' \| 'daemon' \| 'daemon-worker'/,
  )
  assert.match(source, /sessionKind: getSessionKind\(\)/)
  assert.match(source, /extractJsonStringField\(head, 'sessionKind'\)/)
  assert.match(source, /extractJsonStringField\(head, 'entrypoint'\)/)
  assert.match(source, /'<command-name>\/loop<\/command-name>'/)
  for (const entrypoint of ['sdk-cli', 'sdk-ts', 'sdk-py']) {
    assert.match(source, new RegExp(`meta\\.entrypoint === '${entrypoint}'`))
  }
  assert.match(source, /if \(enriched\.isSidechain\)/)
  assert.match(source, /if \(enriched\.teamName\)/)
  assert.match(source, /if \(enriched\.sessionKind\)/)
  assert.match(source, /if \(meta\.isLoopSession\)/)

  const bundle = targetBundle()
  const metadataStart = bundle.indexOf('async function QbY(')
  const metadataEnd = bundle.indexOf('var MbY,', metadataStart)
  assert.notEqual(metadataStart, -1)
  assert.notEqual(metadataEnd, -1)
  const metadata = bundle.slice(metadataStart, metadataEnd)
  assert.match(
    metadata,
    /w==="bg"\|\|w==="daemon"\|\|w==="daemon-worker"/,
  )
  assert.match(metadata, /w66\(z,"entrypoint"\)/)
  assert.match(metadata, /<command-name>\/loop<\/command-name>/)
  assert.match(
    metadata,
    /entrypoint==="sdk-cli"\|\|_\.entrypoint==="sdk-ts"\|\|_\.entrypoint==="sdk-py"/,
  )
  assert.match(metadata, /filtered from \/resume: \/loop session/)
})
