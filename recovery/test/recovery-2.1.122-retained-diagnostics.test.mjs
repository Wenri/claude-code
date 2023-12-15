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

test('authenticates retained rendezvous and hook validation diagnostics', () => {
  for (const release of releases) {
    const bundle = readBundle(release)

    assert.equal(
      bundle.split('[bg-rv] send failed: ').length - 1,
      1,
      `${release.version}: one rendezvous send diagnostic`,
    )
    assert.match(
      bundle,
      /catch\(([\w$]+)\)\{return [\w$]+\(`\[bg-rv\] send failed: \$\{String\(\1\)\}`\),!1\}/,
      `${release.version}: write failure logs before returning false`,
    )

    const skillCopy =
      'but only \\${CLAUDE_PLUGIN_ROOT} is available for skill hooks (\\${CLAUDE_PLUGIN_DATA} is plugin-only). Command: '
    const settingsCopy =
      "but the hook is not associated with a plugin. This variable is only available in hooks defined in a plugin's hooks/hooks.json file, not in settings.json. Command: "
    assert.equal(
      bundle.split(skillCopy).length - 1,
      1,
      `${release.version}: skill-hook unresolved-variable copy`,
    )
    assert.equal(
      bundle.split(settingsCopy).length - 1,
      1,
      `${release.version}: settings-hook unresolved-variable copy`,
    )
    const validationStart = bundle.indexOf(skillCopy)
    const validation = bundle.slice(validationStart - 700, validationStart + 900)
    assert.match(
      validation,
      /\[\["CLAUDE_PLUGIN_ROOT",[\w$]+\|\|[\w$]+\],\["CLAUDE_PLUGIN_DATA",[\w$]+\]\]/,
      `${release.version}: root/data availability table`,
    )
    assert.match(
      validation,
      /\.includes\("\$\{"\+[\w$]+\+"\}"\)/,
      `${release.version}: unresolved literal check`,
    )
  }
})

test('source preserves the exact fail-closed diagnostics', () => {
  const supervisor = fs.readFileSync(
    path.join(repo, 'src/daemon/supervisor.ts'),
    'utf8',
  )
  const hooks = fs.readFileSync(path.join(repo, 'src/utils/hooks.ts'), 'utf8')

  assert.match(
    supervisor,
    /catch \(error\) \{\s*logForDebugging\(`\[bg-rv\] send failed: \$\{String\(error\)\}`\)\s*return false/,
  )
  assert.match(
    hooks,
    /\['CLAUDE_PLUGIN_ROOT', pluginRoot \|\| skillRoot\],[\s\S]*?\['CLAUDE_PLUGIN_DATA', pluginRoot\]/,
  )
  assert.match(hooks, /!command\.includes\('\$\{' \+ name \+ '\}'\)/)
  assert.match(
    hooks,
    /only \\\${CLAUDE_PLUGIN_ROOT} is available for skill hooks \(\\\${CLAUDE_PLUGIN_DATA} is plugin-only\)/,
  )
  assert.match(
    hooks,
    /hooks defined in a plugin's hooks\/hooks\.json file, not in settings\.json/,
  )
})
