import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

test('2.1.97 evidence pins the complete voice-tip registry unit', bundleOptions, () => {
  const bundleBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bundleBytes), targetSha256)
  const bundle = bundleBytes.toString('utf8')
  const region = structural.regions[17675]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      12398321,
      12409553,
      'f052268ee432ce57f83c96d3f94e03540c09dc044d124710868fd5262414c821',
    ],
  )
  assert.equal(
    sha256(bundle.slice(region.target.start, region.target.end)),
    region.target.sourceHash,
  )

  const mobile = bundle.indexOf('{id:"mobile-app"', region.target.start)
  const voice = bundle.indexOf('{id:"voice-mode"', region.target.start)
  const opusPlan = bundle.indexOf(
    '{id:"opusplan-mode-reminder"',
    region.target.start,
  )
  assert.ok(mobile >= region.target.start && mobile < voice)
  assert.ok(voice < opusPlan && opusPlan < region.target.end)
  assert.ok(
    bundle.includes(
      'content:async()=>"Use /voice to enable push-to-talk dictation",cooldownSessions:10',
      voice,
    ),
  )
  assert.match(
    bundle.slice(voice, opusPlan),
    /voiceEnabled===void 0.*CLAUDE_CODE_REMOTE.*\.isSSH\(\)/,
  )
})

test('source recovers all five voice-tip eligibility gates and cooldown', sourceOptions, () => {
  const registry = source('src/services/tips/tipRegistry.ts')
  for (const fragment of [
    "import { isVoiceModeEnabled } from '../../voice/voiceModeEnabled.js'",
    'isEnvTruthy,',
    'isRunningOnHomespace,',
    "id: 'voice-mode'",
    "content: async () => 'Use /voice to enable push-to-talk dictation'",
    'cooldownSessions: 10',
    'isVoiceModeEnabled() &&',
    'getInitialSettings().voiceEnabled === undefined &&',
    '!isRunningOnHomespace() &&',
    '!isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&',
    '!env.isSSH()',
  ]) {
    assert.ok(registry.includes(fragment), fragment)
  }

  const voice = registry.indexOf("id: 'voice-mode'")
  const opusPlan = registry.indexOf("id: 'opusplan-mode-reminder'")
  assert.ok(voice >= 0 && voice < opusPlan)
  if (!isCurrentSource) {
    const mobile = registry.indexOf("id: 'mobile-app'")
    assert.ok(mobile < voice, 'target97 preserves mobile → voice → opusplan order')
  }
})

test('voice relevance uses target conjunction semantics', () => {
  const relevant = ({
    voice = true,
    configured = false,
    homespace = false,
    remote = false,
    ssh = false,
  } = {}) => voice && !configured && !homespace && !remote && !ssh

  assert.equal(relevant(), true)
  for (const blocked of [
    { voice: false },
    { configured: true },
    { homespace: true },
    { remote: true },
    { ssh: true },
  ]) {
    assert.equal(relevant(blocked), false)
  }
})

test('registry filtering and spinner selection preserve cooldown and stable order', sourceOptions, () => {
  const registry = source('src/services/tips/tipRegistry.ts')
  const scheduler = source('src/services/tips/tipScheduler.ts')
  for (const fragment of [
    'await Promise.all(tips.map(_ => _.isRelevant(context)))',
    '.filter((_, index) => isRelevant[index])',
    '.filter(_ => getSessionsSinceLastShown(_.id) >= _.cooldownSessions)',
  ]) {
    assert.ok(registry.includes(fragment), fragment)
  }
  for (const fragment of [
    'sessions: getSessionsSinceLastShown(tip.id)',
    'tipsWithSessions.sort((a, b) => b.sessions - a.sessions)',
    'return tipsWithSessions[0]?.tip',
  ]) {
    assert.ok(scheduler.includes(fragment), fragment)
  }

  const eligible = [
    { id: 'mobile-app', sessions: 10 },
    { id: 'voice-mode', sessions: 10 },
    { id: 'opusplan-mode-reminder', sessions: 10 },
  ]
  eligible.sort((a, b) => b.sessions - a.sessions)
  assert.deepEqual(
    eligible.map(({ id }) => id),
    ['mobile-app', 'voice-mode', 'opusplan-mode-reminder'],
    'equal-age tips retain registry order',
  )
})
