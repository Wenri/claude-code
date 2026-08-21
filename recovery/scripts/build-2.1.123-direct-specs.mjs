#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.122-to-2.1.123')
const changelogPath = path.join(caseRoot, 'evidence/CHANGELOG-2.1.123.md')
const outputPath = path.join(repo, 'recovery/2.1.123-direct-evidence-specs.json')
const baseRevision = 'c30cece4b85c84cd9e92ca708c96d1cd3f8f6b87'
const expectedBullet =
  'Fixed OAuth authentication failing with a 401 retry loop when `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` is set'
const expectedChangedSourceRows = [
  { status: 'M', path: 'src/utils/betas.ts' },
]
const expectedFocusedTests = [
  'oauth-beta-disable-experimental',
  'semantic-delta',
]
const final = process.argv.slice(2).includes('--final')

if (process.argv.slice(2).some(argument => argument !== '--final')) {
  throw new Error('Usage: build-2.1.123-direct-specs.mjs [--final]')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function changedSourceRows() {
  return execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${baseRevision}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, sourcePath] = line.split('\t')
      return { status, path: sourcePath }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

function focusedTestIds() {
  return fs
    .readdirSync(path.join(repo, 'recovery/test'))
    .filter(
      name =>
        /^recovery-2\.1\.123-.*\.test\.mjs$/.test(name) &&
        name !== 'recovery-2.1.123-direct-evidence.test.mjs',
    )
    .map(name =>
      name
        .replace(/^recovery-2\.1\.123-/, '')
        .replace(/\.test\.mjs$/, ''),
    )
    .sort()
}

function reviewedFocusedTestIds() {
  const actual = focusedTestIds()
  assert(
    JSON.stringify(actual) === JSON.stringify(expectedFocusedTests),
    'focused tests must be exactly OAuth beta plus semantic delta',
  )
  return actual
}

const bullets = fs
  .readFileSync(changelogPath, 'utf8')
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))
assert(
  JSON.stringify(bullets) === JSON.stringify([expectedBullet]),
  'expected the exact single official 2.1.123 changelog bullet',
)

const provisionalRow = {
  id: 'B01',
  category: 'official',
  releaseBullet: 1,
  title: expectedBullet,
  status: 'pending-source-recovery',
  targetFragments: [],
  sourceAssertions: [],
  sourcePathAbsences: [],
  sourceFileAbsences: [],
  focusedTests: [],
  rationale: 'Pending exact adjacent-bundle and recovered-source evidence.',
}

if (!final) {
  const output = {
    schemaVersion: 1,
    case: '2.1.122-to-2.1.123',
    release: '2.1.123',
    complete: false,
    coverageDeclarations: {
      officialRowsEnumerated: true,
      hiddenInventoryComplete: false,
      daemonInventoryComplete: false,
      residualAuditComplete: false,
      changedSourcePathsFullyBound: false,
      focusedTestsFullyBound: false,
    },
    rows: [provisionalRow],
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify({
    status: '2.1.123-direct-specs-built',
    complete: false,
    rows: 1,
    official: 1,
    nonOfficial: 0,
  }))
  process.exit(0)
}

assert(
  JSON.stringify(changedSourceRows()) ===
    JSON.stringify(expectedChangedSourceRows),
  'changed source paths differ from the exact reviewed 2.1.123 set',
)
assert(
  reviewedFocusedTestIds().length === 2,
  'expected exactly two reviewed focused tests',
)

const sourcePath = 'src/utils/betas.ts'
const source = fs.readFileSync(path.join(repo, sourcePath), 'utf8')
const sourceFragments = [
  'function isFirstPartyBetaProvider(): boolean {',
  "provider === 'firstParty' ||\n    provider === 'anthropicAws' ||\n    provider === 'foundry'",
  'isFirstPartyBetaProvider() &&\n    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)',
  'isClaudeAISubscriber() ||\n    (isFirstPartyBetaProvider() &&\n      !getAnthropicApiKey() &&\n      shouldUseWIFAuth())',
  'if (isFirstPartyBetaProvider()) return betas',
]
for (const fragment of sourceFragments) {
  assert(source.includes(fragment), `missing reviewed source fragment: ${fragment}`)
}

const rows = [
  {
    id: 'B01',
    category: 'official',
    releaseBullet: 1,
    title: expectedBullet,
    status: 'verified',
    targetFragments: [
      'function an8(){let H=qK();return H==="firstParty"||H==="anthropicAws"||H==="foundry"}',
      'function bp(){return an8()&&!IH(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)}',
      'if(Iq()||an8()&&!eL()&&oI())$.push(Lw);',
      'function eqK(H){if(an8())return H;return H.filter(($)=>tqK.has($))}',
      'function Tb(){let H=qK();return(H==="firstParty"||H==="anthropicAws"||H==="foundry")&&!IH(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)}',
    ],
    sourceAssertions: sourceFragments.map(fragment => ({
      path: sourcePath,
      fragment,
    })),
    sourcePathAbsences: [],
    sourceFileAbsences: [],
    focusedTests: reviewedFocusedTestIds(),
    rationale:
      'The authenticated target splits first-party beta-provider compatibility from the experimental-beta kill switch: OAuth/WIF selection and provider filtering use the provider-only predicate, while experimental beta inclusion remains kill-switch gated.',
  },
]

const output = {
  schemaVersion: 1,
  case: '2.1.122-to-2.1.123',
  release: '2.1.123',
  complete: true,
  coverageDeclarations: {
    officialRowsEnumerated: true,
    hiddenInventoryComplete: true,
    daemonInventoryComplete: true,
    residualAuditComplete: true,
    changedSourcePathsFullyBound: true,
    focusedTestsFullyBound: true,
  },
  rows,
}

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  status: '2.1.123-direct-specs-built',
  complete: true,
  rows: 1,
  official: 1,
  nonOfficial: 0,
  changedSourcePaths: 1,
  focusedTests: reviewedFocusedTestIds().length,
}))
