import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE

const BASELINE_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const TARGET_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'
const feedback =
  'Something else? Use /feedback to report bugs or request features.'
const targetUnit = {
  index: 14_609,
  nodeType: 'FunctionDeclaration',
  start: 10_565_129,
  end: 10_568_177,
  sourceHash:
    'f2f335e210eac1c7c29775163ef78f7caf542989f1137e650538baed1e3b1e16',
}
const targetResidues = [
  [10_566_923, '"2.1.111"'],
  [10_567_012, '"2026-04-16T14:23:56Z"'],
  [10_567_471, `"${feedback}"`],
]

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

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

function readAuthenticated(filename, expectedHash) {
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedHash)
  return bytes.toString('utf8')
}

function compileTargetHelp(target, rows) {
  const unit = target.slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(unit), targetUnit.sourceHash)
  const react = {
    Fragment: 'Fragment',
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
  }
  const dependencies = {
    s: size =>
      Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
    s1: () => ({ rows, columns: 120 }),
    vbY: 44,
    bP: () => false,
    G1: () => {},
    $3: () => ({ pending: false, keyName: 'esc' }),
    V3: () => 'esc',
    UF: () => new Set(),
    c_: react,
    $O: 'Tab',
    KBK: 'General',
    pO7: 'Commands',
    JL: 'Tabs',
    u: 'Box',
    T: 'Text',
    yq: 'Link',
    A_: 'Pane',
  }
  return Function(
    ...Object.keys(dependencies),
    `${unit}; return zBK`,
  )(...Object.values(dependencies))
}

function renderedText(value) {
  if (typeof value === 'string') return value
  if (value === null || value === undefined || value === false) return ''
  if (Array.isArray(value)) return value.map(renderedText).join('')
  if (typeof value === 'object') return renderedText(value.children)
  return String(value)
}

test(
  'target111 authenticates the responsive Help feedback residue in exact unit 14609',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.110 and 2.1.111 bundles are required'
        : false,
  },
  () => {
    const baseline = readAuthenticated(baselinePath, BASELINE_SHA256)
    const target = readAuthenticated(targetPath, TARGET_SHA256)
    const region = structural.regions[targetUnit.index]

    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.index,
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [
        targetUnit.index,
        targetUnit.nodeType,
        targetUnit.start,
        targetUnit.end,
        targetUnit.sourceHash,
      ],
    )
    assert.equal(
      sha256(target.slice(targetUnit.start, targetUnit.end)),
      targetUnit.sourceHash,
    )
    for (const [start, raw] of targetResidues) {
      assert.equal(target.slice(start, start + raw.length), raw)
      assert.ok(start >= targetUnit.start)
      assert.ok(start + raw.length <= targetUnit.end)
    }
    assert.equal(occurrences(baseline, feedback), 0)
    assert.equal(occurrences(target, feedback), 1)
  },
)

test(
  'the authenticated target Help unit renders feedback at 44 rows but not 43',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.111 bundle is required'
        : false,
  },
  () => {
    const target = readAuthenticated(targetPath, TARGET_SHA256)
    const props = { onClose: () => {}, commands: [] }
    assert.equal(
      renderedText(compileTargetHelp(target, 43)(props)).includes(feedback),
      false,
    )
    assert.equal(
      renderedText(compileTargetHelp(target, 44)(props)).includes(feedback),
      true,
    )
  },
)

test(
  'HelpV2 source preserves the target responsive feedback contract',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'components/HelpV2/HelpV2.tsx'),
      'utf8',
    )
    assert.equal(occurrences(source, feedback), 1)
    assert.ok(source.includes('const showFeedback = rows >= 44;'))
    assert.match(
      source,
      /showFeedback && <Box marginTop=\{1\} flexShrink=\{0\}><Text dimColor=\{true\}>Something else\? Use \/feedback to report bugs or request features\.<\/Text><\/Box>/,
    )
  },
)
