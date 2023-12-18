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

const identifier = '([A-Za-z_$][\\w$]*)'

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function symbolReferenceCount(bundle, symbol) {
  return [
    ...bundle.matchAll(
      new RegExp(
        `(?<![\\w$])${escapeRegExp(symbol)}(?![\\w$])`,
        'g',
      ),
    ),
  ].length
}

function functionBody(bundle, symbol) {
  const start = bundle.indexOf(`function ${symbol}(`)
  assert.ok(start >= 0, `${symbol}: function definition`)
  const next = bundle.indexOf('function ', start + 9)
  return bundle.slice(start, next < 0 ? start + 1_500 : next)
}

function readSource(filename) {
  return fs.readFileSync(path.join(repo, filename), 'utf8')
}

test('authenticated adjacent bundles retain display-row survey truncation', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(occurrences(bundle, 'hiddenRows'), 16, release.version)

    const rowMatch = bundle.match(
      new RegExp(
        `function ${identifier}\\(H,\\$\\)\\{let q=\\$<=0\\|\\|!Number\\.isFinite\\(\\$\\),K=0,_=0;while\\(_<=H\\.length\\)`,
      ),
    )
    assert.ok(rowMatch, `${release.version}: display-row counter`)
    const rowCounter = rowMatch[1]
    const rowBody = functionBody(bundle, rowCounter)
    assert.match(rowBody, /\.indexOf\(`/)
    assert.match(rowBody, /Math\.ceil\([A-Za-z_$][\w$]*\/\$\)/)
    assert.equal(
      symbolReferenceCount(bundle, rowCounter),
      8,
      `${release.version}: row-counter callgraph`,
    )

    const escapedRowCounter = escapeRegExp(rowCounter)
    const recordMatch = bundle.match(
      new RegExp(
        `function ${identifier}\\(H,\\$\\)\\{if\\(H\\.isEdit\\)\\{[\\s\\S]{0,420}?if\\(H\\.body===""\\)return 0;return ${escapedRowCounter}\\(H\\.body,\\$\\)\\}`,
      ),
    )
    assert.ok(recordMatch, `${release.version}: record display-row counter`)
    assert.equal(symbolReferenceCount(bundle, recordMatch[1]), 2)

    const contentMatch = bundle.match(
      new RegExp(
        `function ${identifier}\\(H,\\$,q\\)\\{if\\(H===""\\)return\\{text:"",hiddenRows:0\\};if\\(q<=0\\)return\\{text:"",hiddenRows:${escapedRowCounter}\\(H,\\$\\)\\}`,
      ),
    )
    assert.ok(contentMatch, `${release.version}: text display-row truncator`)
    assert.equal(symbolReferenceCount(bundle, contentMatch[1]), 2)
    const contentBody = functionBody(bundle, contentMatch[1])
    assert.match(bundle, /hard:!0,wordWrap:!1,trim:!1/)
    assert.match(contentBody, /hiddenRows:[A-Za-z_$][\w$]*-[A-Za-z_$][\w$]*\.length/)

    const hunkMatch = bundle.match(
      new RegExp(
        `function ${identifier}\\(H,\\$,q\\)\\{[\\s\\S]{0,280}?if\\(q<=0\\)return\\{hunks:\\[\\],hiddenRows:`,
      ),
    )
    assert.ok(hunkMatch, `${release.version}: hunk display-row truncator`)
    assert.equal(symbolReferenceCount(bundle, hunkMatch[1]), 2)
    const hunkBody = functionBody(bundle, hunkMatch[1])
    assert.match(hunkBody, /\.lines\.join\(`/)
    assert.match(hunkBody, /if\([A-Za-z_$][\w$]*\.length>0\)\{/)
    assert.match(hunkBody, /hiddenRows:[A-Za-z_$][\w$]*-q/)

    const widthMatch = bundle.match(
      new RegExp(`function ${identifier}\\(H\\)\\{return Math\\.max\\(20,H-6\\)\\}`),
    )
    assert.ok(widthMatch, `${release.version}: shared survey content width`)
    assert.equal(symbolReferenceCount(bundle, widthMatch[1]), 3)
  }
})

test('source counts, truncates, and renders terminal display rows', () => {
  const memory = readSource('src/memdir/memoryWriteSurvey.ts')
  for (const fragment of [
    "import { stringWidth } from '../ink/stringWidth.js'",
    "import { wrapAnsi } from '../ink/wrapAnsi.js'",
    "import sliceAnsi from '../utils/sliceAnsi.js'",
    'const DIFF_PREFIX_WIDTH = 6',
    'while (offset <= text.length)',
    'width <= 0 || !Number.isFinite(width)',
    'displayWidth === 0 ? 1 : Math.ceil(displayWidth / width)',
    'width > DIFF_PREFIX_WIDTH ? width - DIFF_PREFIX_WIDTH : width',
    'let rows = countHunkSeparators(record.structuredPatch)',
    "countDisplayRows(hunk.lines.join('\\n'), contentWidth)",
    'export function truncateMemoryWriteContent(',
    'export function truncateMemoryWriteHunks(',
    'hard: true',
    'wordWrap: false',
    'trim: false',
    'sliceAnsi(line, 0, remainingRows * contentWidth)',
    'hiddenRows: totalRows - maxRows',
  ]) {
    assert.ok(memory.includes(fragment), fragment)
  }
  assert.match(
    memory,
    /countMemoryWriteLines\([\s\S]{0,100}?width: number[\s\S]{0,700}?record\.body === ''\) return 0[\s\S]{0,80}?countDisplayRows\(record\.body, width\)/,
  )

  const hook = readSource(
    'src/components/FeedbackSurvey/useMemoryWriteSurvey.ts',
  )
  assert.match(
    hook,
    /export function getMemoryWriteContentWidth\(columns: number\): number \{\s*return Math\.max\(20, columns - 6\)/,
  )
  assert.match(hook, /const \{ columns \} = useTerminalSize\(\)/)
  assert.match(hook, /countMemoryWriteLines\(nextRecord, contentWidth\)/)
  assert.match(hook, /line_count: details\.lineCount/)
  assert.match(hook, /if \(lineCount > config\.summaryLineThreshold\)/)
  assert.doesNotMatch(
    hook.slice(
      hook.indexOf('export type MemoryWriteSurveyState'),
      hook.indexOf('const CLOSED_STATE'),
    ),
    /lineCount/,
  )

  const survey = readSource(
    'src/components/FeedbackSurvey/MemoryWriteSurvey.tsx',
  )
  assert.match(survey, /getMemoryWriteContentWidth\(columns\)/)
  assert.match(survey, /truncateMemoryWriteContent\(record\.body, width, maxLines\)/)
  assert.match(
    survey,
    /truncateMemoryWriteHunks\(record\.structuredPatch, width, maxLines\)/,
  )
  assert.match(survey, /if \(summary\) return <Text wrap="wrap">\{summary\}<\/Text>/)
  assert.match(survey, /patch\.hiddenRows > 0/)
  assert.match(survey, /content\.hiddenRows > 0/)
  assert.match(survey, /if \(!content\) return null/)
  assert.doesNotMatch(survey, /truncateHunks|hiddenCount|truncated:/)

  const repl = readSource('src/screens/REPL.tsx')
  assert.doesNotMatch(repl, /memoryWriteSurvey\.lineCount/)
})
