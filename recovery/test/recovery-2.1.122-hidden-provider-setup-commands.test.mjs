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
  const filename = release.envNames
    .map(name => process.env[name])
    .find(Boolean)
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

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

test('authenticates the retained setup command pair in both adjacent bundles', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const fragment of [
      'name:"setup-bedrock"',
      'name:"setup-vertex"',
      'Reconfigure AWS Bedrock authentication, region, or model pins',
      'Reconfigure Google Vertex AI authentication, project, region, or model pins',
      'tengu_bedrock_setup_started',
      'tengu_bedrock_setup_cancelled',
      'tengu_vertex_setup_started',
      'tengu_vertex_setup_cancelled',
    ]) {
      assert.equal(occurrences(bundle, fragment), 1, `${release.version}: ${fragment}`)
    }

    assert.match(
      bundle,
      /name:"setup-bedrock",description:"Reconfigure AWS Bedrock authentication, region, or model pins",get isHidden\(\)\{return![\w$]+\(process\.env\.CLAUDE_CODE_USE_BEDROCK\)\}/,
      `${release.version}: Bedrock metadata and environment gate`,
    )
    assert.match(
      bundle,
      /name:"setup-vertex",description:"Reconfigure Google Vertex AI authentication, project, region, or model pins",get isHidden\(\)\{return![\w$]+\(process\.env\.CLAUDE_CODE_USE_VERTEX\)\}/,
      `${release.version}: Vertex metadata and environment gate`,
    )

    const bedrockStart = bundle.indexOf('tengu_bedrock_setup_started')
    const bedrockEnd = bundle.indexOf('name:"setup-bedrock"', bedrockStart)
    const vertexStart = bundle.indexOf('tengu_vertex_setup_started')
    const vertexEnd = bundle.indexOf('name:"setup-vertex"', vertexStart)
    assert.ok(bedrockStart < bedrockEnd, `${release.version}: Bedrock cluster`)
    assert.ok(vertexStart < vertexEnd, `${release.version}: Vertex cluster`)

    for (const [provider, cluster] of [
      ['Bedrock', bundle.slice(bedrockStart, bedrockEnd)],
      ['Vertex', bundle.slice(vertexStart, vertexEnd)],
    ]) {
      for (const fragment of [
        '"confirm:yes"',
        '.exit()',
        '.execRelaunch()',
        'context:"Confirmation"',
        'isActive:',
        'flexDirection:"column",gap:1,marginTop:1',
        'color:"success"',
        '"Press "',
        '"Enter"',
        '" to restart Claude Code."',
        'onComplete:',
        'onCancel:',
      ]) {
        assert.equal(
          cluster.includes(fragment),
          true,
          `${release.version}: ${provider} ${fragment}`,
        )
      }
    }
  }
})

test('source recovers command metadata, lifecycle, completion, and relaunch behavior', () => {
  const commands = fs.readFileSync(path.join(repo, 'src/commands.ts'), 'utf8')
  const commandList = commands.slice(commands.indexOf('const COMMANDS'))
  const bedrockRegistration = commandList.indexOf('setupBedrock,')
  const vertexRegistration = commandList.indexOf('setupVertex,')
  assert.ok(commandList.indexOf('resume,') < bedrockRegistration)
  assert.ok(bedrockRegistration < vertexRegistration)
  assert.ok(vertexRegistration < commandList.indexOf('session,'))

  const providers = [
    {
      folder: 'setup-bedrock',
      symbol: 'setupBedrock',
      wizard: 'BedrockSetupWizard',
      env: 'CLAUDE_CODE_USE_BEDROCK',
      description:
        'Reconfigure AWS Bedrock authentication, region, or model pins',
      started: 'tengu_bedrock_setup_started',
      cancelled: 'tengu_bedrock_setup_cancelled',
    },
    {
      folder: 'setup-vertex',
      symbol: 'setupVertex',
      wizard: 'VertexSetupWizard',
      env: 'CLAUDE_CODE_USE_VERTEX',
      description:
        'Reconfigure Google Vertex AI authentication, project, region, or model pins',
      started: 'tengu_vertex_setup_started',
      cancelled: 'tengu_vertex_setup_cancelled',
    },
  ]

  for (const provider of providers) {
    const metadata = fs.readFileSync(
      path.join(repo, 'src/commands', provider.folder, 'index.ts'),
      'utf8',
    )
    const implementation = fs.readFileSync(
      path.join(
        repo,
        'src/commands',
        provider.folder,
        `${provider.folder}.tsx`,
      ),
      'utf8',
    )

    for (const fragment of [
      `name: '${provider.folder}'`,
      provider.description,
      'get isHidden()',
      `!isEnvTruthy(process.env.${provider.env})`,
      `load: () => import('./${provider.folder}.js')`,
    ]) {
      assert.equal(metadata.includes(fragment), true, `${provider.folder}: ${fragment}`)
    }

    for (const fragment of [
      provider.wizard,
      provider.started,
      provider.cancelled,
      "useKeybinding(\n    'confirm:yes'",
      "context: 'Confirmation'",
      'isActive: successMessage !== null',
      'app.exit()',
      "import('../../utils/relaunch.js')",
      'execRelaunch()',
      '<Text color="success">{successMessage}</Text>',
      'Press <Text bold>Enter</Text> to restart Claude Code.',
      'onComplete={message => setSuccessMessage(message)}',
      'onDone()',
    ]) {
      assert.equal(
        implementation.includes(fragment),
        true,
        `${provider.folder}: ${fragment}`,
      )
    }
  }
})
