import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('authenticates retained late policy-limit loading', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      bundle.split('maybeLoadPolicyLimitsAfterGrowthBookInit').length - 1,
      1,
      `${version}: retained helper export`,
    )
    const exported = bundle.match(
      /maybeLoadPolicyLimitsAfterGrowthBookInit:\(\)=>\s*([\w$]+)/,
    )
    assert.ok(exported, `${version}: helper export binding`)
    const symbol = escapeRegExp(exported[1])

    assert.match(
      bundle,
      new RegExp(
        `function ${symbol}\\(\\)\\{if\\([\\w$]+!==null\\|\\|![\\w$]+\\(\\)\\)return;[\\w$]+\\(\\)\\}`,
      ),
      `${version}: only starts a newly eligible load`,
    )
    assert.equal(
      bundle.match(new RegExp(`${symbol}\\(`, 'g'))?.length,
      2,
      `${version}: definition plus one live GrowthBook callback`,
    )
    assert.match(
      bundle,
      new RegExp(
        `\\.onGrowthBookRefresh\\(\\(\\)=>\\{[\\s\\S]{0,180}?${symbol}\\(\\)\\}\\)`,
      ),
      `${version}: startup refresh callback invokes helper`,
    )
  }
})

test('source restores helper and startup callback', () => {
  const root = new URL('../../', import.meta.url)
  const policy = readFileSync(
    new URL('src/services/policyLimits/index.ts', root),
    'utf8',
  )
  const init = readFileSync(new URL('src/entrypoints/init.ts', root), 'utf8')

  assert.match(
    policy,
    /export function maybeLoadPolicyLimitsAfterGrowthBookInit\(\): void \{[\s\S]*?loadingCompletePromise !== null \|\| !isPolicyLimitsEligible\(\)[\s\S]*?loadPolicyLimits\(\)/,
  )
  assert.match(
    init,
    /onGrowthBookRefresh\(\(\) => \{[\s\S]*?reinitialize1PEventLoggingIfConfigChanged\(\)[\s\S]*?maybeLoadPolicyLimitsAfterGrowthBookInit\(\)/,
  )
})
