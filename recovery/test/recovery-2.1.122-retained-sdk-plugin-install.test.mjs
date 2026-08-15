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

test('authenticated bundles retain SDK plugin-install progress', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.match(/"plugin_install"/g)?.length,
      2,
      `${release.version}: schema and producer cardinality`,
    )
    assert.match(
      bundle,
      /subtype:[^,]+\("plugin_install"\),status:[^,]+\(\["started","installed","failed","completed"\]\),name:[^,]+\.string\(\)\.optional\(\),error:[^,]+\.string\(\)\.optional\(\)/,
      `${release.version}: wire schema`,
    )
    assert.match(
      bundle,
      /outputFormat==="stream-json"\?[^:]+=>void [^.]+\.write\(\{type:"system",subtype:"plugin_install",status:[^.]+\.status,name:"name"in [^?]+\?[^.]+\.name:void 0,error:"error"in [^?]+\?[^.]+\.error:void 0,uuid:[^.]+\.randomUUID\(\),session_id:[^}]+\}\):void 0,[^?]+\?\.\(\{status:"started"\}\)/,
      `${release.version}: stream-json envelope and start bookend`,
    )
    assert.match(
      bundle,
      /onProgress:\(([\w$]+)\)=>\{if\(\1\.type==="installed"\)([\w$]+)\?\.\(\{status:"installed",name:\1\.name\}\),[\s\S]{0,180}?else if\(\1\.type==="failed"\)\2\?\.\(\{status:"failed",name:\1\.name,error:\1\.error\}\)/,
      `${release.version}: per-marketplace progress`,
    )
    assert.match(
      bundle,
      /finally\{[^?]+\?\.\(\{status:"completed"\}\),[^=]+=void 0\}/,
      `${release.version}: completed bookend and callback release`,
    )
  }
})

test('source reconstructs SDK plugin-install schema and lifecycle', () => {
  const schemas = fs.readFileSync(
    path.join(repo, 'src/entrypoints/sdk/coreSchemas.ts'),
    'utf8',
  )
  const installer = fs.readFileSync(
    path.join(repo, 'src/utils/plugins/headlessPluginInstall.ts'),
    'utf8',
  )
  const print = fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8')

  assert.match(schemas, /subtype: z\.literal\('plugin_install'\)/)
  assert.match(
    schemas,
    /status: z\.enum\(\['started', 'installed', 'failed', 'completed'\]\)/,
  )
  assert.match(
    schemas,
    /SDKHookResponseMessageSchema\(\),\s*SDKPluginInstallMessageSchema\(\),\s*SDKToolProgressMessageSchema\(\)/,
  )
  assert.match(
    installer,
    /onProgress\?\.\(\{ status: 'installed', name: event\.name \}\)/,
  )
  assert.match(
    installer,
    /status: 'failed',[\s\S]{0,100}?error: event\.error/,
  )
  assert.match(print, /pluginInstallProgress\?\.\(\{ status: 'started' \}\)/)
  assert.match(print, /subtype: 'plugin_install'/)
  assert.match(
    print,
    /finally \{\s*pluginInstallProgress\?\.\(\{ status: 'completed' \}\)\s*pluginInstallProgress = undefined/,
  )
})
