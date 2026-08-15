import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const caseRoot = path.join(
  repositoryRoot,
  'recovery/cases/2.1.88-to-2.1.89',
)
const targetBundlePath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
const TARGET_SHA256 =
  'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01'
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz')),
  ),
)

const pinned = new Map([
  [4933, ['moved', 3700045, 3700067, 'FunctionDeclaration', '62f5d3342aca795151c8e5eb16fca616da8aa8342d1941ba7104983349fada79']],
  [15489, ['unresolved', 11316595, 11326275, 'ClassDeclaration', 'a17f040de9e6119fbc3c6a4104cc727e87244585025def51aba38153689dcc37']],
  [15519, ['unresolved', 11335381, 11335874, 'FunctionDeclaration', '54c2322410bee8a125bfa4e9b099afac81f1a213a6ed898c0462c178a62069ff']],
  [15543, ['unresolved', 11339796, 11341200, 'FunctionDeclaration', '90421e5afafefed51e958174d46dc710b8eecb17badc08b0e1d7eca2a09285a9']],
  [15576, ['unresolved', 11356292, 11357200, 'FunctionDeclaration', '6c08965d87cdabcae06e71a2731ff2eb95aaa2bb29fde39ecbf331232a0df5a9']],
  [15581, ['unresolved', 11359064, 11359866, 'FunctionDeclaration', 'a30ef7f4877b9208133a2330b561e82ad02671a97bd7c274e7d0aa1ef3157c85']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function requiredTargetBundle() {
  assert.ok(
    targetBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE environment variable must be set',
  )
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), TARGET_SHA256)
  return bytes.toString('utf8')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target89 pins every session-kind persistence and resume-filter unit', () => {
  const bundle = requiredTargetBundle()
  for (const [index, [classification, start, end, nodeType, sourceHash]] of pinned) {
    const region = structural.regions[index]
    assert.deepEqual(
      [
        region.classification,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [classification, start, end, nodeType, sourceHash],
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash)
  }
})

test('target89 owns the complete session-kind propagation and filter order', () => {
  const bundle = requiredTargetBundle()
  const unit = index => {
    const { start, end } = structural.regions[index].target
    return bundle.slice(start, end)
  }

  assert.match(unit(4933), /^function \w+\(\)\{return\}$/)
  assert.match(
    unit(15489),
    /\.\.\.\w+,sessionKind:\w+\(\),userType:\w+\(\),entrypoint:/,
  )
  assert.match(
    unit(15519),
    /teamName:\w+\.teamName,sessionKind:\w+\.sessionKind,agentName:/,
  )
  assert.match(
    unit(15543),
    /teamName:\w+\[0\]\?\.teamName\?\?\w+\.teamName,sessionKind:\w+\[0\]\?\.sessionKind\?\?\w+\.sessionKind,leafUuid:/,
  )
  assert.match(
    unit(15576),
    /"sessionKind"[\s\S]*?==="bg"\|\|\w+==="daemon"\|\|\w+==="daemon-worker"[\s\S]*?sessionKind:/,
  )
  assert.match(
    unit(15581),
    /teamName:\w+\.teamName,sessionKind:\w+\.sessionKind[\s\S]*?if\(\w+\.teamName\)[\s\S]*?if\(\w+\.sessionKind\)[\s\S]*?filtered from \/resume: sessionKind=/,
  )
})

test('source owns guarded stamping, full/lite hydration, and resume filtering', () => {
  const logs = source('types/logs.ts')
  const sessions = source('utils/sessionStorage.ts')

  assert.equal(
    logs.match(/sessionKind\?: 'bg' \| 'daemon' \| 'daemon-worker'/g)
      ?.length,
    2,
  )
  assert.match(
    sessions,
    /function getSessionKind\(\): SerializedMessage\['sessionKind'\] \{[\s\S]*?feature\('BG_SESSIONS'\)[\s\S]*?CLAUDE_CODE_SESSION_KIND[\s\S]*?kind === 'bg' \|\|[\s\S]*?kind === 'daemon' \|\|[\s\S]*?kind === 'daemon-worker'/,
  )
  assert.match(
    sessions,
    /\.\.\.message,[\s\S]*?sessionKind: getSessionKind\(\),[\s\S]*?userType: getUserType\(\)/,
  )
  assert.match(
    sessions,
    /teamName: firstMessage\.teamName,\s*sessionKind: firstMessage\.sessionKind,\s*agentName:/,
  )
  assert.match(
    sessions,
    /teamName: transcript\[0\]\?\.teamName \?\? log\.teamName,\s*sessionKind: transcript\[0\]\?\.sessionKind \?\? log\.sessionKind,\s*leafUuid:/,
  )
  assert.match(
    sessions,
    /const rawSessionKind = extractJsonStringField\(head, 'sessionKind'\)[\s\S]*?rawSessionKind === 'bg' \|\|[\s\S]*?rawSessionKind === 'daemon' \|\|[\s\S]*?rawSessionKind === 'daemon-worker'[\s\S]*?return \{[\s\S]*?teamName,\s*sessionKind,/,
  )
  assert.match(
    sessions,
    /teamName: meta\.teamName,\s*sessionKind: meta\.sessionKind,[\s\S]*?if \(enriched\.teamName\)[\s\S]*?if \(enriched\.sessionKind\)[\s\S]*?filtered from \/resume: sessionKind=/,
  )
})
