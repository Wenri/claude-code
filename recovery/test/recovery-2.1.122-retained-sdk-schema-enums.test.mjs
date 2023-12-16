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

const providerPattern =
  /apiProvider:[^.]+\.enum\(\["firstParty","bedrock","vertex","foundry","anthropicAws","mantle"\]\)\.optional\(\)/
const overagePattern =
  /overageDisabledReason:[^.]+\.enum\(\["overage_not_provisioned","org_level_disabled","org_level_disabled_until","out_of_credits","seat_tier_level_disabled","member_level_disabled","seat_tier_zero_credit_limit","group_zero_credit_limit","member_zero_credit_limit","org_service_level_disabled","no_limits_configured","fetch_error","unknown"\]\)\.optional\(\)/

test('authenticated bundles retain exact public SDK provider and overage enums', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(bundle, providerPattern, `${release.version}: API providers`)
    assert.match(bundle, overagePattern, `${release.version}: overage reasons`)
  }
})

test('source reconstructs exact public SDK enum members and order', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/entrypoints/sdk/coreSchemas.ts'),
    'utf8',
  )
  const compact = source.replaceAll(/\s+/g, '')

  assert.match(
    compact,
    /\.enum\(\['firstParty','bedrock','vertex','foundry','anthropicAws','mantle',?\]\)/,
  )
  assert.match(
    compact,
    /\.enum\(\['overage_not_provisioned','org_level_disabled','org_level_disabled_until','out_of_credits','seat_tier_level_disabled','member_level_disabled','seat_tier_zero_credit_limit','group_zero_credit_limit','member_zero_credit_limit','org_service_level_disabled','no_limits_configured','fetch_error','unknown',?\]\)/,
  )
  assert.doesNotMatch(source, /org_service_zero_credit_limit/)
})
