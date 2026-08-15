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

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

test(
  'target111 pins the distinct xhigh and max effort glyphs',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.110 and 2.1.111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assert.equal(
      sha256(targetBytes),
      '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
    )

    const region = structural.regions[2535]
    assert.deepEqual(
      [
        region.classification,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        'unresolved',
        1005100,
        1005314,
        'VariableDeclaration',
        '8fa4eae2dc842e537fd74ed375e8ee02edfbeecb7652b6f443f4a2003890aebc',
      ],
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const unit = target.slice(region.target.start, region.target.end)
    assert.equal(sha256(unit), region.target.sourceHash)
    assert.equal(occurrences(baseline, '◈'), 0)
    assert.equal(occurrences(target, '◈'), 1)
    assert.equal(occurrences(unit, '◈'), 1)
    assert.match(unit, /=\"◉\",[^;]*=\"◈\"/)
  },
)

test(
  'figures source owns the target111 effort glyph runtime mapping',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const figures = fs.readFileSync(
      path.join(sourceRoot, 'constants/figures.ts'),
      'utf8',
    )
    const indicator = fs.readFileSync(
      path.join(sourceRoot, 'components/EffortIndicator.ts'),
      'utf8',
    )

    assert.match(figures, /export const EFFORT_XHIGH = '◉'/)
    assert.match(figures, /export const EFFORT_MAX = '◈'/)
    assert.match(indicator, /case 'xhigh':\s*return EFFORT_XHIGH/)
    assert.match(indicator, /case 'max':\s*return EFFORT_MAX/)
  },
)
