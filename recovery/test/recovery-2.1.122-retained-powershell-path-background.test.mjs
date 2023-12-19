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

const literals = [
  'Paths beginning with ~user cannot be statically validated and require manual approval',
  'Command uses the background job operator (`&`) which spawns a child PowerShell process',
  'Compound command extracts an archive followed by other commands. Archive contents (symlinks, config files) cannot be validated and may redirect subsequent path operations.',
  'Compound command extracts an archive and runs git. Archive contents may plant bare-repository indicators (HEAD, hooks/, refs/) that git then treats as the repository root.',
]

function count(haystack, needle) {
  return haystack.split(needle).length - 1
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

test('authenticates retained PowerShell path and background safeguards', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(count(bundle, 'hasBackgroundJob'), 4, release.version)
    for (const literal of literals) {
      assert.equal(count(bundle, literal), 1, `${release.version}: ${literal}`)
    }
    assert.match(
      bundle,
      /hasBackgroundJob = \[bool\]\$script:hasBg/,
      `${release.version}: parser result field`,
    )
  }
})

test('source restores the retained background-job parser and permission guard', () => {
  const parser = source('src/utils/powershell/parser.ts')
  assert.match(
    parser,
    /\$script:hasBg = \$false[\s\S]*PipelineBaseAst[\s\S]*\$p\.Background[\s\S]*hasBackgroundJob = \[bool\]\$script:hasBg/,
  )
  assert.match(parser, /if \(raw\.hasBackgroundJob\)/)

  const permissions = source(
    'src/tools/PowerShellTool/powershellPermissions.ts',
  )
  assert.match(permissions, /if \(parsed\.hasBackgroundJob\)/)
  assert.match(permissions, new RegExp(literals[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(
    permissions,
    /if \(hasArchiveExtractor && allSubCommands\.length > 1\)/,
  )
  assert.match(permissions, /message: hasGitSubCommand\s*\?/)
  assert.match(permissions, new RegExp(literals[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('source rejects unexpanded ~user paths before other path syntax', () => {
  const pathValidation = source(
    'src/tools/PowerShellTool/pathValidation.ts',
  )
  const tilde = pathValidation.indexOf("if (/^~[^/]/.test(normalizedPath))")
  const backtick = pathValidation.indexOf("if (normalizedPath.includes('`'))")
  assert.ok(tilde >= 0)
  assert.ok(tilde < backtick)
  assert.match(
    pathValidation,
    new RegExp(literals[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  )
})
