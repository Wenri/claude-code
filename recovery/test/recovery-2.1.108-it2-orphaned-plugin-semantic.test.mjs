import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historicalTarget108 = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT && semanticCase === caseName,
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
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

const units = new Map([
  [614, [49577, 50332, 'VariableDeclaration', 'f38d1d74cdb7cd3eb3b6699384e880855407f3e6cf666ad3f7b99378703576a4']],
  [11257, [8557536, 8558207, 'FunctionDeclaration', '4facd0983a2ec0379fc0bf484ba5920afc4e0888d209e946d907a4ee81279c05']],
  [11260, [8558524, 8558915, 'FunctionDeclaration', '1bb8d852d460283d63d7618e61a2393a60eedbf130c3eb85af43fc6e7a723697']],
  [11417, [8646314, 8646359, 'FunctionDeclaration', '75f33768051af40862f01e2a4cad73d30f9b77f1f5dd1ed9343219aa932e615f']],
  [11418, [8646359, 8646801, 'FunctionDeclaration', 'cb46b3267d091640d2f30254467a8c5291fab1927a9262eef7926396aec92427']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target108 pins the shared success icon and orphaned-plugin cache functions', bundleOptions, async () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.notEqual(region.classification, 'matched', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    assert.equal(
      sha256(target.slice(identity[0], identity[1])),
      identity[3],
      `${index}: bytes`,
    )
  }

  const vertex = target.slice(...units.get(614).slice(0, 2))
  const targetVertexOrder = [
    '["claude-opus-4-6","VERTEX_REGION_CLAUDE_4_6_OPUS"]',
    '["claude-opus-4-5","VERTEX_REGION_CLAUDE_4_5_OPUS"]',
    '["claude-opus-4-1","VERTEX_REGION_CLAUDE_4_1_OPUS"]',
    '["claude-opus-4","VERTEX_REGION_CLAUDE_4_0_OPUS"]',
  ]
  let previousVertex = -1
  for (const prefix of targetVertexOrder) {
    const index = vertex.indexOf(prefix)
    assert.ok(index > previousVertex, prefix)
    previousVertex = index
  }

  for (const index of [11257, 11260]) {
    const [start, end] = units.get(index)
    const fragment = target.slice(start, end)
    assert.ok(fragment.includes('{status:"success",withSpace:!0}'))
    assert.equal(fragment.includes('✓'), false)
  }

  const stateFragment = target.slice(...units.get(11417).slice(0, 2))
  const createState = Function(`${stateFragment}; return T5Y`)()
  assert.deepEqual(createState(), { cachedExclusions: null })

  const cacheFragment = target.slice(...units.get(11418).slice(0, 2))
  let calls = 0
  const state = { cachedExclusions: null }
  const getExclusions = Function(
    'gJK',
    'FJK',
    'Z5Y',
    'hP',
    'v5Y',
    'Dd',
    'W5Y',
    'D5Y',
    'f5Y',
    'G5Y',
    `${cacheFragment}; return eX6`,
  )(
    state,
    value => value,
    (...parts) => parts.join('/'),
    () => '/plugins',
    () => true,
    async () => {
      calls += 1
      return ['market/plugin/old/.orphaned_at']
    },
    value => value.slice(0, value.lastIndexOf('/')),
    value => value.startsWith('/'),
    (_base, value) => value,
    '.orphaned_at',
  )
  assert.deepEqual(await getExclusions('/plugins/cache'), [
    '!**/market/plugin/old/**',
  ])
  assert.deepEqual(await getExclusions('/plugins/cache'), [
    '!**/market/plugin/old/**',
  ])
  assert.equal(calls, 1)
})

test('source renders success through StatusIcon and owns the bounded orphan cache', sourceOptions, () => {
  const envUtils = source('utils/envUtils.ts')
  const sourceVertexOrder = historicalTarget108
    ? [
        "['claude-opus-4-6', 'VERTEX_REGION_CLAUDE_4_6_OPUS']",
        "['claude-opus-4-5', 'VERTEX_REGION_CLAUDE_4_5_OPUS']",
        "['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS']",
      ]
    : [
        "['claude-opus-4-7', 'VERTEX_REGION_CLAUDE_4_7_OPUS']",
        "['claude-opus-4-6', 'VERTEX_REGION_CLAUDE_4_6_OPUS']",
        "['claude-opus-4-5', 'VERTEX_REGION_CLAUDE_4_5_OPUS']",
        "['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS']",
      ]
  let previousVertex = -1
  for (const entry of sourceVertexOrder) {
    const index = envUtils.indexOf(entry)
    assert.ok(index > previousVertex, entry)
    previousVertex = index
  }
  if (historicalTarget108) {
    assert.equal(envUtils.includes('VERTEX_REGION_CLAUDE_4_7_OPUS'), false)
  }

  const it2 = source('utils/swarm/It2SetupPrompt.tsx')
  assert.ok(
    it2.includes(
      '<StatusIcon status="success" withSpace={true} />it2 installed successfully',
    ),
  )
  assert.ok(
    it2.includes(
      '<StatusIcon status="success" withSpace={true} />iTerm2 split pane support is ready',
    ),
  )
  assert.equal(it2.includes('✓ it2 installed successfully'), false)
  assert.equal(it2.includes('✓ iTerm2 split pane support is ready'), false)

  const orphaned = source('utils/plugins/orphanedPluginFilter.ts')
  for (const fragment of [
    'let cachedExclusions: string[] | null = null',
    "normalize(join(getPluginsDirectory(), 'cache'))",
    'if (searchPath && !pathsOverlap(searchPath, cachePath))',
    "'--hidden'",
    "'--no-ignore'",
    "'--max-depth'",
    "ORPHANED_AT_FILENAME",
    "return `!**/${posixRelative}/**`",
    'cachedExclusions = []',
    'cachedExclusions = null',
  ]) assert.ok(orphaned.includes(fragment), fragment)

  if (historicalTarget108) {
    assert.ok(
      orphaned.includes(
        "return process.platform === 'win32' ? n.toLowerCase() : n",
      ),
    )
  } else {
    assert.ok(orphaned.includes('return normalize(p)'))
    assert.equal(orphaned.includes('n.toLowerCase()'), false)
  }
})
