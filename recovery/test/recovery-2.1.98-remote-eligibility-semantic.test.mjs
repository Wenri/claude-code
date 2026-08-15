import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const historicalOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
      ? 'target98 historical source root is not selected'
      : false,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
    : false,
}
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target98 pins remote-environment eligibility and its consumer', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const bundle = bytes.toString('utf8')
  const expected = new Map([
    [11698, [8958075, 8958256, '8f6e16947c8566af0cb133305d1829265008ea56ab6b7010386d2881c34416e1']],
    [11704, [8960327, 8961106, '7ac70873bfdc6f9bcb43da466f476e39062ee266d8d20c0ffb6f44b60354f69c']],
    [11792, [8997970, 9004101, '2d4626779ab5bc21d6300c8b6a1a6d995cb560eb647f355f183a741840f62a1a']],
  ])
  const fragments = []
  for (const [index, identity] of expected) {
    const region = structural.regions.find(row => row.target?.index === index)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    const fragment = bundle.slice(region.target.start, region.target.end)
    assert.equal(sha256(fragment), identity[2])
    fragments.push(fragment)
  }
  const cluster = fragments.join('\n')
  assert.ok(cluster.includes('fetchRemoteEnvironmentsForEligibility failed:'))
  assert.ok(cluster.includes('response?.status===401'))
  assert.ok(cluster.includes('no_remote_environment'))
  assert.ok(cluster.includes('.kind==="byoc"'))
  assert.ok(cluster.includes('github_app_not_installed'))
  assert.ok(cluster.includes('No configured default or anthropic_cloud in env list'))
  assert.ok(cluster.includes('configured default ${f} not in list'))
})

test('historical source owns the target98 eligibility error boundary and policy', historicalOptions, () => {
  const preconditions = fs.readFileSync(
    path.join(sourceRoot, 'utils/background/remote/preconditions.ts'),
    'utf8',
  )
  const session = fs.readFileSync(
    path.join(sourceRoot, 'utils/background/remote/remoteSession.ts'),
    'utf8',
  )
  const teleport = fs.readFileSync(path.join(sourceRoot, 'utils/teleport.tsx'), 'utf8')
  if (semanticCase !== caseName) {
    assert.ok(preconditions.includes('checkHasRemoteEnvironment'))
    assert.ok(preconditions.includes('const environments = await fetchEnvironments()'))
    assert.ok(session.includes('checkHasRemoteEnvironment()'))
    assert.ok(session.includes("errors.push({ type: 'no_remote_environment' })"))
    assert.ok(session.includes("errors.push({ type: 'github_app_not_installed' })"))
    assert.ok(teleport.includes('No configured default or anthropic_cloud in env list'))
    return
  }
  assert.ok(preconditions.includes('fetchRemoteEnvironmentsForEligibility'))
  assert.ok(preconditions.includes('axios.isAxiosError(error) && error.response?.status === 401'))
  assert.ok(preconditions.includes('fetchRemoteEnvironmentsForEligibility failed:'))
  assert.ok(preconditions.includes('return null'))
  assert.ok(session.includes('environments = await fetchRemoteEnvironmentsForEligibility()'))
  assert.ok(session.includes("errors.push({ type: 'no_remote_environment' })"))
  assert.ok(session.includes("environment.kind === 'byoc'"))
  assert.ok(session.includes('!hasConfiguredByoc'))
  assert.ok(session.indexOf('bundleSeedGateOn') < session.indexOf("errors.push({ type: 'no_git_remote' })"))
  assert.ok(session.includes("errors.push({ type: 'github_app_not_installed' })"))
  assert.ok(teleport.includes('const defaultEnvironmentId = settings?.remote?.defaultEnvironmentId'))
  assert.ok(teleport.includes('!configuredEnvironment && !cloudEnv'))
  assert.ok(teleport.includes('No configured default or anthropic_cloud in env list'))
  assert.ok(teleport.includes('configured default ${defaultEnvironmentId} not in list'))
  assert.ok(teleport.includes('configuredEnvironment || cloudEnv'))
})

test('2.1.97 predates the remote-environment eligibility error boundary', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  assert.equal(
    bytes.toString('utf8').includes('fetchRemoteEnvironmentsForEligibility failed:'),
    false,
  )
})
