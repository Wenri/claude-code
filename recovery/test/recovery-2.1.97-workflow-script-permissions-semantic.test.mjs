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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
    : false,
}
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target97 pins the workflow script directory and write bypass', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const bundle = bytes.toString('utf8')
  const expected = new Map([
    [15969, [11571812, 11571880, '2c65b2b2b2410cfde2344baa514d1839093647a2d6d57f0433c23efe797befd7']],
    [15985, [11573465, 11573540, '57af1278ee19b50c788a4104fae1f088204cde66e29c9db8c366a7afcdad3a11']],
    [16012, [11582384, 11583568, '78b070a68ac0fe09341140e623094c2c214c1cc5a5fcdd43a8c2e162a557d247']],
  ])
  for (const [index, identity] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    assert.equal(
      sha256(bundle.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
    )
  }
  const directory = bundle.slice(
    structural.regions[15969].target.start,
    structural.regions[15969].target.end,
  )
  assert.ok(directory.includes('"workflows","scripts"'))
  const matcher = bundle.slice(
    structural.regions[15985].target.start,
    structural.regions[15985].target.end,
  )
  assert.ok(matcher.includes('.startsWith('))
  assert.ok(matcher.includes('.endsWith(".js")'))
  const permission = bundle.slice(
    structural.regions[16012].target.start,
    structural.regions[16012].target.end,
  )
  for (const fragment of [
    'Workflow script files for current session are allowed for writing',
    'behavior:"allow"',
  ]) {
    assert.ok(permission.includes(fragment), fragment)
  }
})

test('source confines the workflow write bypass to current-session JavaScript', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'utils/permissions/filesystem.ts'),
    'utf8',
  )
  for (const fragment of [
    "join(getProjectDir(getCwd()), getSessionId(), 'workflows', 'scripts') + sep",
    'normalizedPath.startsWith(getSessionWorkflowScriptsDir())',
    "normalizedPath.endsWith('.js')",
    'if (isSessionWorkflowScriptPath(normalizedPath))',
    'Workflow script files for current session are allowed for writing',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})

test('2.1.96 lacks the workflow script permission bypass', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  assert.equal(
    bytes
      .toString('utf8')
      .includes('Workflow script files for current session are allowed for writing'),
    false,
  )
})
