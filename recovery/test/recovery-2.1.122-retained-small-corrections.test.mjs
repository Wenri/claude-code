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

test('authenticated adjacent bundles retain the three small correction surfaces', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /\.args\.some\(\([\w$]+\)=>\{let [\w$]+=\([\w$]+\.length>0\?"-"\+[\w$]+\.slice\(1\):[\w$]+\)\.toLowerCase\(\),[\w$]+=[\w$]+\.indexOf\(":"\),[\w$]+=[\w$]+>0\?[\w$]+\.slice\(0,[\w$]+\):[\w$]+;return [\w$]+\.length>=2&&"-recurse"\.startsWith\([\w$]+\)\}\)/,
      `${release.version}: PowerShell accepts abbreviated and colon-bound recurse flags`,
    )
    assert.match(
      bundle,
      /Remove-Item -Recurse targeting '\$\{[\w$]+\}' would delete the working directory including \.git and \.claude \\u2014 requires manual approval/,
      `${release.version}: destructive cwd/ancestor approval copy`,
    )
    assert.match(
      bundle,
      /\/feedback requires Anthropic credentials \(OAuth or API key\)\. Report issues at \$\{[\w$]+\}/,
      `${release.version}: feedback credential availability guard`,
    )
    assert.match(
      bundle,
      /Could not extract version from manifest for \$\{[\w$]+\}/,
      `${release.version}: installed-plugin migration diagnostic`,
    )
  }
})

test('source reproduces retained PowerShell, feedback, and plugin diagnostics', () => {
  const powershell = fs.readFileSync(
    path.join(repo, 'src/tools/PowerShellTool/pathValidation.ts'),
    'utf8',
  )
  const feedback = fs.readFileSync(
    path.join(repo, 'src/commands/feedback/feedback.tsx'),
    'utf8',
  )
  const installed = fs.readFileSync(
    path.join(repo, 'src/utils/plugins/installedPluginsManager.ts'),
    'utf8',
  )

  assert.match(
    powershell,
    /cmd\.args\.some\([\s\S]{0,400}?flag\.length >= 2 && '-recurse'\.startsWith\(flag\)[\s\S]{0,500}?normalizedPath === normalizedCwd[\s\S]{0,200}?normalizedCwd\.startsWith\(`\$\{normalizedPath\}\/`\)[\s\S]{0,200}?normalizedCwd\.startsWith\(`\$\{normalizedPath\}\\\\`\)[\s\S]{0,250}?Remove-Item -Recurse targeting '\$\{filePath\}' would delete the working directory including \.git and \.claude — requires manual approval/,
  )
  assert.match(
    feedback,
    /if \(getAuthHeaders\(\)\.error\) \{[\s\S]{0,160}?\/feedback requires Anthropic credentials \(OAuth or API key\)\. Report issues at \$\{ISSUES_URL\}/,
  )
  assert.match(
    installed,
    /Could not extract version from manifest for \$\{pluginId\}/,
  )
  assert.doesNotMatch(installed, /Could not read version from manifest/)
})
