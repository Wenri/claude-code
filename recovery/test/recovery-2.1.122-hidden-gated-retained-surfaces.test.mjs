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

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('authenticates retained gypsum-kite Opus copy and all three callsites', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(count(bundle, 'tengu_gypsum_kite'), 1, release.version)
    const helper = bundle.match(
      /function ([\w$]+)\(\)\{if\([\w$]+\(\)==="pro"&&[\w$]+\("tengu_gypsum_kite",!1\)\)return" \\xB7 ~2\\xD7 usage vs Sonnet";return""\}/,
    )
    assert.ok(helper, `${release.version}: exact gypsum helper`)
    assert.equal(
      count(bundle, `\${${helper[1]}()}`),
      3,
      `${release.version}: suffix is used by exactly three Opus options`,
    )
    assert.match(bundle, /label:"Opus",description:`Opus 4\.7 \\xB7 Most capable for complex work\$\{[\w$]+\(\)\}/)
    assert.match(bundle, /label:"Opus 4\.7 \(1M context\)",description:`Opus 4\.7 with 1M context\$\{[\w$]+\(\)\}/)
    assert.match(bundle, /label:"Opus 4\.7 \(1M context\)",description:`Opus 4\.7 with 1M context \\xB7 Most capable for complex work\$\{[\w$]+\(\)\}/)
  }
})

test('authenticates retained shale-finch filter, task set, and teammate exemption', () => {
  const expectedTools = [
    'TodoWrite',
    'TaskCreate',
    'TaskUpdate',
    'TaskGet',
    'TaskList',
  ]
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(count(bundle, 'tengu_shale_finch'), 1, release.version)
    const helper = bundle.match(
      /function ([\w$]+)\(([\w$]+)\)\{if\(\2\)return!1;return [\w$]+\("tengu_shale_finch",!1\)\}/,
    )
    assert.ok(helper, `${release.version}: exact shale helper`)
    const filter = bundle.match(
      new RegExp(
        `resolvedTools,[\\w$]+=![\\w$]+&&${escapeRegex(helper[1])}\\([\\w$]+\\)\\?[\\w$]+\\.filter\\(\\([\\w$]+\\)=>!([\\w$]+)\\.has\\([\\w$]+\\.name\\)\\):[\\w$]+`,
      ),
    )
    assert.ok(filter, `${release.version}: gated non-exact-tools filter`)
    const setName = escapeRegex(filter[1])
    const set = bundle.match(
      new RegExp(`${setName}=new Set\\(\\[([\\w$]+(?:,[\\w$]+){4})\\]\\)`),
    )
    assert.ok(set, `${release.version}: five-tool filter set`)
    const identifiers = set[1].split(',')
    assert.equal(identifiers.length, expectedTools.length)
    for (const [index, identifier] of identifiers.entries()) {
      assert.match(
        bundle,
        new RegExp(`${escapeRegex(identifier)}="${expectedTools[index]}"`),
        `${release.version}: ${expectedTools[index]} set member`,
      )
    }
    assert.match(bundle, /isTeammate:[\w$]+=!1/)
    assert.equal(count(bundle, 'isTeammate:!0'), 1, release.version)
  }
})

test('source reproduces both retained gated behaviors', () => {
  const modelOptions = fs.readFileSync(
    path.join(repo, 'src/utils/model/modelOptions.ts'),
    'utf8',
  )
  assert.match(modelOptions, /getSubscriptionType\(\) === 'pro'/)
  assert.match(
    modelOptions,
    /getFeatureValue_CACHED_MAY_BE_STALE\('tengu_gypsum_kite', false\)/,
  )
  assert.match(modelOptions, /return ' · ~2× usage vs Sonnet'/)
  assert.equal(count(modelOptions, '${getOpusUsageSuffix()}'), 3)
  assert.equal(count(modelOptions, "label: 'Opus 4.7 (1M context)'"), 2)

  const runAgent = fs.readFileSync(
    path.join(repo, 'src/tools/AgentTool/runAgent.ts'),
    'utf8',
  )
  const set = runAgent.match(
    /const SUBAGENT_TASK_TOOL_NAMES = new Set\(\[([\s\S]*?)\]\)/,
  )
  assert.ok(set)
  assert.deepEqual(
    [...set[1].matchAll(/\b([A-Z][A-Z_]+_TOOL_NAME)\b/g)].map(
      match => match[1],
    ),
    [
      'TODO_WRITE_TOOL_NAME',
      'TASK_CREATE_TOOL_NAME',
      'TASK_UPDATE_TOOL_NAME',
      'TASK_GET_TOOL_NAME',
      'TASK_LIST_TOOL_NAME',
    ],
  )
  assert.match(runAgent, /if \(isTeammate\) return false/)
  assert.match(
    runAgent,
    /getFeatureValue_CACHED_MAY_BE_STALE\('tengu_shale_finch', false\)/,
  )
  assert.match(runAgent, /!useExactTools && shouldFilterSubagentTaskTools\(isTeammate\)/)
  assert.match(runAgent, /!SUBAGENT_TASK_TOOL_NAMES\.has\(tool\.name\)/)

  const inProcess = fs.readFileSync(
    path.join(repo, 'src/utils/swarm/inProcessRunner.ts'),
    'utf8',
  )
  assert.equal(count(inProcess, 'isTeammate: true'), 1)
})
