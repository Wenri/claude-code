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
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

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

test('authenticated adjacent bundles retain mutable cwd isolation and guards', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const cwdHelpers = bundle.match(
      /function ([\w$]+)\(H,\$\)\{return [\w$]+\.run\(\{cwd:H\.normalize\("NFC"\)\},\$\)\}function ([\w$]+)\(H,\$\)\{return \1\(H\?\?[\w$]+\(\),\$\)\}function ([\w$]+)\(\)\{return [\w$]+\.getStore\(\)!==void 0\}function ([\w$]+)\(H\)\{let \$=[\w$]+\.getStore\(\);if\(\$\)\$\.cwd=H\.normalize\("NFC"\);else [\w$]+\(H\)\}/,
    )
    assert.ok(cwdHelpers, `${release.version}: cwd helper family`)

    const withCwdCalls = bundle.match(
      new RegExp(`\\b${cwdHelpers[2]}\\(`, 'g'),
    )
    assert.equal(
      withCwdCalls?.length,
      4,
      `${release.version}: helper definition plus three agent callsites`,
    )

    assert.match(
      bundle,
      /async validateInput\(\)\{if\([\w$]+\(\)\)return\{result:!1,message:`EnterWorktree cannot be called from a subagent with a cwd override \(isolation: "worktree" or explicit cwd\) \\u2014 it would mutate the parent session's process-wide working directory\. This agent is already isolated in its own working copy\.`,errorCode:1\};if\([\w$]+\(\)\)return\{result:!1,message:"Already in a worktree session\. Use ExitWorktree to leave it before entering another\.",errorCode:2\}/,
      `${release.version}: EnterWorktree guard order and copy`,
    )
    assert.match(
      bundle,
      /userFacingName\([\w$]+\)\{return [\w$]+\?\.action==="remove"\?"Cleaning up worktree":"Exiting worktree"\}[\s\S]{0,250}async validateInput\([\w$]+\)\{if\([\w$]+\(\)\)return\{result:!1,message:'ExitWorktree cannot be called from a subagent with a cwd override/,
      `${release.version}: ExitWorktree copy and first guard`,
    )
  }
})

test('source reconstructs isolated mutable cwd and all bounded callsites', () => {
  const cwd = source('src/utils/cwd.ts')
  for (const fragment of [
    'new AsyncLocalStorage<CwdOverride>()',
    "{ cwd: (cwd ?? getCwd()).normalize('NFC') }",
    'cwdOverrideStorage.getStore() !== undefined',
    "override.cwd = cwd.normalize('NFC')",
    'setCwdState(cwd)',
    'cwdOverrideStorage.getStore()?.cwd ?? getCwdState()',
  ]) {
    assert.ok(cwd.includes(fragment), fragment)
  }

  const shell = source('src/utils/Shell.ts')
  assert.ok(shell.includes("import { pwd, setCwdForContext } from './cwd.js'"))
  assert.ok(shell.includes('setCwdForContext(physicalPath)'))

  const agent = source('src/tools/AgentTool/AgentTool.tsx')
  assert.equal(agent.match(/runWithCwdOverride\(cwdOverridePath,/g)?.length, 2)
  const resume = source('src/tools/AgentTool/resumeAgent.ts')
  assert.equal(resume.match(/runWithCwdOverride\(resumedCwd,/g)?.length, 1)

  const enter = source('src/tools/EnterWorktreeTool/EnterWorktreeTool.ts')
  assert.match(
    enter,
    /async validateInput\(\)[\s\S]+hasCwdOverride\(\)[\s\S]+errorCode: 1[\s\S]+getCurrentWorktreeSession\(\)[\s\S]+errorCode: 2/,
  )
  const exit = source('src/tools/ExitWorktreeTool/ExitWorktreeTool.ts')
  assert.match(
    exit,
    /userFacingName\(input\)[\s\S]+Cleaning up worktree[\s\S]+async validateInput\(input\)[\s\S]+hasCwdOverride\(\)[\s\S]+errorCode: 5/,
  )
})
