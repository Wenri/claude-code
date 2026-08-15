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
    userCancelInterruptCount: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    userCancelInterruptCount: 2,
  },
]

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

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

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticated adjacent bundles retain hash-backed formatter re-sync', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(occurrences(bundle, 'PostToolUse hook modified '), 2)
    assert.equal(occurrences(bundle, 're-synced readFileState'), 1)
    assert.equal(occurrences(bundle, 'after your edit (likely a formatter)'), 1)
    assert.equal(occurrences(bundle, 'hadSandboxViolation'), 3)
    assert.equal(occurrences(bundle, 'auto-retrying unsandboxed'), 1)
    assert.equal(
      bundle.match(/hadSandboxViolation;constructor\([^)]*,[^)]*=!1\)/g)
        ?.length,
      1,
      `${release.version}: ShellError violation flag`,
    )
    assert.equal(
      bundle.match(
        /new [\w$]+\("",[\w$]+,[\w$]+\.code,(?:[\w$]+\.interrupted|[\w$]+),[\w$]+!==[\w$]+\)/g,
      )?.length,
      1,
      `${release.version}: Bash violation propagation`,
    )
    assert.equal(
      bundle.match(
        /[\w$]+ instanceof [\w$]+&&[\w$]+\.hadSandboxViolation&&[\w$]+\?\.dangerouslyDisableSandbox!==!0&&[\w$]+\.isSandboxingEnabled\(\)&&[\w$]+\.areUnsandboxedCommandsAllowed\(\)/g,
      )?.length,
      1,
      `${release.version}: guarded REPL fallback`,
    )
    assert.equal(
      bundle.match(
        /interrupted&&[\w$]+\.signal\.reason==="interrupt",[\w$]+=[\w$]+\.interrupted&&\([\w$]+\.signal\.reason==="interrupt"\|\|[\w$]+\.signal\.reason==="user-cancel"\)/g,
      )?.length ?? 0,
      release.userCancelInterruptCount,
      `${release.version}: narrowed user-cancel ShellError state`,
    )
    assert.equal(
      bundle.match(
        /function [\w$]+\(H,\$\)\{if\(H\.contentHash!==void 0\)return H\.contentHash===/g,
      )?.length,
      1,
      `${release.version}: hash-aware content comparator`,
    )
    assert.equal(
      bundle.match(/\.offset\?\?1\)<=1&&[\w$]+\.limit===void 0/g)
        ?.length,
      4,
      `${release.version}: all full-read staleness fallbacks`,
    )
    assert.equal(
      bundle.match(
        /if\([\w$]+\)\{let [\w$]+=[\w$]+\([^)]*\.name,[^;]+\.readFileState\);if\([\w$]+\)[\w$]+\.push\(\{message:[\w$]+\}\)\}/g,
      )?.length,
      1,
      `${release.version}: main tool attachment call`,
    )
    assert.equal(
      bundle.match(
        /if\([\w$]+\)[\w$]+\([^)]*\.name,[^;]+\.readFileState\)/g,
      )?.length,
      1,
      `${release.version}: REPL side-effect call`,
    )
    assert.match(
      bundle,
      /\.content!==""\|\|\([^)]*\.contentLength\?\?0\)===0/,
      `${release.version}: elided at-mention cache guard`,
    )
  }
})

test('source reconstructs cache retention, staleness checks, and both hook paths', () => {
  const cache = compact(source('src/utils/fileStateCache.ts'))
  for (const fragment of [
    'const MAX_RETAINED_CONTENT_BYTES = 4096',
    "if (typeof Bun !== 'undefined') return Bun.hash(content).toString(36)",
    "createHash('sha1').update(content).digest('base64url')",
    'state.contentHash === hashFileStateContent(content)',
    'value.keepContent ?? existing?.keepContent',
    'value.contentLength ?? value.content.length',
    'Buffer.byteLength(candidateContent) <= MAX_RETAINED_CONTENT_BYTES',
  ]) {
    assert.ok(cache.includes(compact(fragment)), fragment)
  }

  const sync = compact(source('src/services/tools/postToolUseFileSync.ts'))
  for (const fragment of [
    'toolName !== FILE_EDIT_TOOL_NAME && toolName !== FILE_WRITE_TOOL_NAME',
    'timestamp <= priorState.timestamp',
    'readFileState.set(filePath,',
    'fileStateMatchesContent(priorState, current.content)',
    '— re-synced readFileState',
    'after your edit (likely a formatter)',
    "hookEvent: 'PostToolUse'",
  ]) {
    assert.ok(sync.includes(compact(fragment)), fragment)
  }

  const execution = source('src/services/tools/toolExecution.ts')
  const repl = source('src/tools/REPLTool/toolWrappers.ts')
  assert.match(execution, /postToolUseHooksRan = true[\s\S]+resyncReadFileStateAfterPostToolUse\([\s\S]+hookResults\.push\(\{ message: fileSyncMessage \}\)/)
  assert.match(repl, /postToolUseHooksRan = true[\s\S]+resyncReadFileStateAfterPostToolUse\([\s\S]+context\.readFileState/)
  for (const fragment of [
    'error instanceof ShellError',
    'error.hadSandboxViolation',
    'input.dangerouslyDisableSandbox !== true',
    'SandboxManager.isSandboxingEnabled()',
    'SandboxManager.areUnsandboxedCommandsAllowed()',
    'REPL Bash sandbox violation — auto-retrying unsandboxed',
    '{ ...input, dangerouslyDisableSandbox: true }',
    '{ toolUseID }',
  ]) {
    assert.ok(repl.includes(fragment), fragment)
  }

  const errors = source('src/utils/errors.ts')
  assert.ok(errors.includes('public readonly hadSandboxViolation: boolean = false'))
  const bash = source('src/tools/BashTool/BashTool.tsx')
  assert.ok(bash.includes("abortController.signal.reason === 'user-cancel'"))
  assert.ok(bash.includes('outputWithSbFailures !== rawOutput'))

  for (const relativePath of [
    'src/tools/FileEditTool/FileEditTool.ts',
    'src/tools/FileWriteTool/FileWriteTool.ts',
  ]) {
    const contents = source(relativePath)
    assert.ok(contents.includes('(lastRead.offset ?? 1) <= 1'))
    assert.ok(contents.includes('fileStateMatchesContent('))
  }

  const attachments = source('src/utils/attachments.ts')
  assert.ok(attachments.includes('fileStateMatchesContent(fileState, result.data.file.content)'))
  assert.ok(attachments.includes('(existingFileState.contentLength ?? 0) === 0'))
  assert.ok(attachments.includes('keepContent: true'))
})
