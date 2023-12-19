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

test('authenticated adjacent bundles retain distinct general and interactive plugin formatters', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /case"dependency-unsatisfied":\{let [\w$]+=[\w$]+\.reason==="not-enabled"\?"disabled \\u2014 enable it or remove the dependency":`not installed \\u2014 run \\`claude plugin install \$\{[\w$]+\.dependency\}\\`, or check that its marketplace is added`;return`Dependency "\$\{[\w$]+\.dependency\}" is \$\{[\w$]+\}`\}/,
      `${release.version}: general dependency-state formatter`,
    )
    assert.match(
      bundle,
      /case"path-not-found":return`\$\{[\w$]+\.component\} path not found: \$\{[\w$]+\.path\}`;case"path-traversal":return`\$\{[\w$]+\.component\} path escapes plugin directory: \$\{[\w$]+\.path\}`/,
      `${release.version}: interactive path formatter order`,
    )
    assert.match(
      bundle,
      /case"autoupdate-blocked-by-pinner":\{let [\w$]+=[^;]+,[\w$]+=[\w$]+\.disabledPinners\.length>0\?` \(\$\{[\w$]+\.disabledPinners\.join\(", "\)\} \$\{[\w$]+\.disabledPinners\.length===1\?"is":"are"\} disabled\)`:"";return`Autoupdate held\$\{[\w$]+\} \\u2014 version constraint from \$\{[\w$]+\.blockedBy\.join\(", "\)\}\$\{[\w$]+\}`\}/,
      `${release.version}: interactive formatter remains distinct`,
    )
  }
})

test('source reproduces the two exact retained formatter branches', () => {
  const general = fs.readFileSync(path.join(repo, 'src/types/plugin.ts'), 'utf8')
  const interactive = fs.readFileSync(
    path.join(repo, 'src/commands/plugin/PluginErrors.tsx'),
    'utf8',
  )

  assert.match(
    general,
    /error\.reason === 'not-enabled'\s*\? 'disabled — enable it or remove the dependency'\s*: `not installed — run \\`claude plugin install \$\{error\.dependency\}\\`, or check that its marketplace is added`/,
  )
  assert.match(
    interactive,
    /case 'path-not-found':\s*return `\$\{error\.component\} path not found: \$\{error\.path\}`;\s*case 'path-traversal':\s*return `\$\{error\.component\} path escapes plugin directory: \$\{error\.path\}`;/,
  )
  assert.doesNotMatch(
    interactive,
    /Path escapes plugin directory: \$\{error\.path\} \(\$\{error\.component\}\)/,
  )
})
