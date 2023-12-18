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
    dropped: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    dropped: 1,
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target SDK drop logging and retained provider filter', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, "SDK beta '"),
      release.dropped,
      `${release.version}: SDK drop prefix`,
    )
    assert.equal(
      occurrences(bundle, "' dropped on 3P"),
      release.dropped,
      `${release.version}: SDK drop suffix`,
    )
    assert.equal(
      occurrences(
        bundle,
        'H==="firstParty"||H==="anthropicAws"||H==="foundry"',
      ),
      2,
      `${release.version}: first-party-compatible provider predicate`,
    )
    assert.match(
      bundle,
      /function [A-Za-z_$][\w$]*\(H\)\{if\([A-Za-z_$][\w$]*\(\)\)return H;return H\.filter\(\(\$\)=>[A-Za-z_$][\w$]*\.has\(\$\)\)\}/,
      `${release.version}: final request beta filter`,
    )
  }

  const target = readBundle(releases[1])
  assert.ok(
    target.includes('sqK=new Set([cIH,t$$,cg,lIH,$$H,Wb$,e$$,Gb$])'),
    '2.1.122: exact safe beta set',
  )
})

test('source filters SDK and final request betas with the exact safe set', () => {
  const betas = compact(
    fs.readFileSync(path.join(repo, 'src/utils/betas.ts'), 'utf8'),
  )
  for (const fragment of [
    'const THIRD_PARTY_COMPATIBLE_BETA_HEADERS = new Set([ CLAUDE_CODE_20250219_BETA_HEADER, INTERLEAVED_THINKING_BETA_HEADER, CONTEXT_1M_BETA_HEADER, CONTEXT_MANAGEMENT_BETA_HEADER, STRUCTURED_OUTPUTS_BETA_HEADER, WEB_SEARCH_BETA_HEADER, EFFORT_BETA_HEADER, TOOL_SEARCH_BETA_HEADER_3P, ])',
    "provider === 'anthropicAws'",
    "logForDebugging(`SDK beta '${beta}' dropped on 3P`, { level: 'debug' })",
    'export function filterBetasForProvider(betas: string[]): string[]',
    'return betas.filter(beta => THIRD_PARTY_COMPATIBLE_BETA_HEADERS.has(beta))',
  ]) {
    assert.ok(betas.includes(compact(fragment)), fragment)
  }

  const claude = compact(
    fs.readFileSync(path.join(repo, 'src/services/api/claude.ts'), 'utf8'),
  )
  assert.ok(
    claude.includes('betas: filterBetasForProvider(betasParams)'),
    'final request applies provider-safe filtering',
  )
  assert.ok(
    claude.includes(
      'lastRequestBetas = simulateProxyUsage ? [] : betasParams',
    ),
    'request telemetry retains the pre-filter beta list',
  )
})
