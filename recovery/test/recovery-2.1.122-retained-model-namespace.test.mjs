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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('authenticated adjacent bundles retain the complete model namespace', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const names = [
      'DEFAULT_3P_OPUS_KEY',
      'DEFAULT_3P_SONNET_KEY',
      'DEFAULT_3P_HAIKU_KEY',
      'getModelSourceAnnotation',
      'isLegacyOpusFirstParty',
    ]
    const symbols = Object.fromEntries(
      names.map(name => {
        const match = bundle.match(
          new RegExp(`${name}:\\(\\)=>([A-Za-z_$][\\w$]*)`),
        )
        assert.ok(match, `${release.version}: ${name} export`)
        return [name, match[1]]
      }),
    )

    assert.match(
      bundle,
      new RegExp(`${escapeRegExp(symbols.DEFAULT_3P_OPUS_KEY)}="opus46"`),
    )
    assert.match(
      bundle,
      new RegExp(
        `${escapeRegExp(symbols.DEFAULT_3P_SONNET_KEY)}="sonnet45"`,
      ),
    )
    assert.match(
      bundle,
      new RegExp(`${escapeRegExp(symbols.DEFAULT_3P_HAIKU_KEY)}="haiku45"`),
    )
    assert.match(
      bundle,
      new RegExp(
        `function ${escapeRegExp(symbols.getModelSourceAnnotation)}\\(\\)\\{[\\s\\S]{0,300}?ANTHROPIC_MODEL[\\s\\S]{0,300}?projectSettings[\\s\\S]{0,200}?policySettings`,
      ),
    )
    assert.match(
      bundle,
      new RegExp(
        `function ${escapeRegExp(symbols.isLegacyOpusFirstParty)}\\([^)]*\\)\\{[^}]{0,120}?\\.includes\\(`,
      ),
    )
  }
})

test('source restores exact exports and live model callers', () => {
  const model = fs.readFileSync(
    path.join(repo, 'src/utils/model/model.ts'),
    'utf8',
  )
  assert.match(model, /export const DEFAULT_3P_OPUS_KEY = 'opus46'/)
  assert.match(model, /export const DEFAULT_3P_SONNET_KEY = 'sonnet45'/)
  assert.match(model, /export const DEFAULT_3P_HAIKU_KEY = 'haiku45'/)
  assert.match(model, /getModelStrings\(\)\[DEFAULT_3P_OPUS_KEY\]/)
  assert.match(model, /getModelStrings\(\)\[DEFAULT_3P_SONNET_KEY\]/)
  assert.match(model, /getModelStrings\(\)\[DEFAULT_3P_HAIKU_KEY\]/)
  assert.match(model, /export function getModelSourceAnnotation\(\)/)
  assert.match(
    model,
    /export function getModelSourceSuffix\(\)[\s\S]*?return getModelSourceAnnotation\(\)/,
  )
  assert.match(model, /export function isLegacyOpusFirstParty\(/)

  const notice = fs.readFileSync(
    path.join(repo, 'src/components/LogoV2/ModelSourceNotice.tsx'),
    'utf8',
  )
  assert.match(notice, /React\.useMemo\(getModelSourceAnnotation, \[model\]\)/)
  assert.doesNotMatch(notice, /getModelSourceSuffix/)
})
