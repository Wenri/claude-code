import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const unit = [
  18240,
  12724753,
  12725443,
  'e34a17dfc6613e4df06e8763a3fe8616341872a3795bda55f9b7ae6deb963e88',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target101 pins the command, tool, and agent bootstrap helper',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath, 'utf8')
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(targetBytes),
      'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
    )
    const [index, start, end, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    const fragment = targetBytes.toString('utf8').slice(start, end)
    assert.equal(sha256(fragment), hash)
    for (const property of [
      'cwd',
      'toolPermissionContext',
      'applyCoordinatorFilter',
      'agentsJson',
      'agentSetting',
      'commandsPromise',
      'agentDefsPromise',
      'onToolsLoaded',
    ]) {
      assert.match(fragment, new RegExp(`${property}:`))
    }
    assert.match(fragment, /\.catch\(\(\)=>\{\}\)/)
    assert.match(fragment, /Promise\.all\(/)
    assert.match(fragment, /flagSettings/)
    assert.match(fragment, /allAgents:/)
    assert.match(fragment, /activeAgents:/)
    assert.match(fragment, /mainThreadAgentDefinition:/)
    assert.equal(baseline.includes('commandsPromise'), false)
  },
)

test(
  'source owns the equivalent startup ordering and merged-agent behavior',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8')
    const ordered = [
      'const commandsPromise = worktreeEnabled ? null : getCommands(preSetupCwd)',
      'const agentDefsPromise = worktreeEnabled ? null : getAgentDefinitionsWithOverrides(preSetupCwd)',
      'commandsPromise?.catch(() => {})',
      'agentDefsPromise?.catch(() => {})',
      'await setupPromise',
      'const [commands, agentDefinitionsResult] = await Promise.all([commandsPromise ?? getCommands(currentCwd), agentDefsPromise ?? getAgentDefinitionsWithOverrides(currentCwd)])',
      "cliAgents = parseAgentsFromJson(parsedAgents, 'flagSettings')",
      'const allAgents = [...agentDefinitionsResult.allAgents, ...cliAgents]',
      'activeAgents: getActiveAgentsFromList(allAgents)',
      'mainThreadAgentDefinition = agentDefinitions.activeAgents.find',
      'setMainThreadAgentType(mainThreadAgentDefinition?.agentType)',
    ]
    let previous = -1
    for (const fragment of ordered) {
      const index = source.indexOf(fragment, previous + 1)
      assert.ok(index > previous, fragment)
      previous = index
    }
    assert.match(source, /applyCoordinatorToolFilter\(tools\)/)
    assert.match(source, /profileCheckpoint\('action_tools_loaded'\)/)
    assert.match(source, /Warning: agent "\$\{agentSetting\}" not found/)
  },
)

test(
  'target116 retains the extracted bootstrap helper contract',
  {
    skip: semanticCase || !latestPath
      ? 'current target116 evidence unavailable'
      : false,
  },
  () => {
    const latest = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latest),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const text = latest.toString('utf8')
    for (const property of [
      'applyCoordinatorFilter',
      'commandsPromise',
      'agentDefsPromise',
      'onToolsLoaded',
    ]) {
      assert.equal((text.match(new RegExp(property, 'g')) ?? []).length, 2)
    }
  },
)
