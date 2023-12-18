import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  {
    version: '2.1.121',
    path: process.env.CLAUDE_CODE_2_1_121_BUNDLE,
  },
  {
    version: '2.1.122',
    path: process.env.CLAUDE_CODE_2_1_122_BUNDLE,
  },
]

function bundle(release) {
  assert.ok(release.path, `${release.version} authenticated bundle path required`)
  return readFileSync(release.path, 'utf8')
}

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
    .replace(/\s+/g, ' ')
}

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

test('authenticates retained copy table-normalization helpers and call', () => {
  for (const release of releases) {
    const text = bundle(release)
    assert.equal(
      occurrences(text, 'normalizeTablesInMarkdown'),
      1,
      `${release.version}: exported normalizer name`,
    )
    assert.equal(
      occurrences(text, 'tableTokenToMarkdown'),
      1,
      `${release.version}: exported table renderer name`,
    )
    assert.ok(
      text.includes('.replace(/\\|/g,"\\\\|").replace(/[\\r\\n]/g," ")'),
      `${release.version}: cell escaping and newline flattening`,
    )
    assert.match(
      text,
      /case"center":return`:\$\{"-"\.repeat\([^)]*-2\)\}:`;case"right":return`\$\{"-"\.repeat\([^)]*-1\)\}:`;case"left":return`:\$\{"-"\.repeat\([^)]*-1\)\}`/,
      `${release.version}: exact alignment markers`,
    )
    assert.match(
      text,
      /let [A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\[[A-Za-z_$][\w$]*\]\),[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\)/,
      `${release.version}: selected response normalized before code extraction`,
    )
  }
})

test('source reconstructs and applies retained table normalization', () => {
  const copy = source('src/commands/copy/copy.tsx')
  for (const witness of [
    'export function tableTokenToMarkdown(table: Tokens.Table): string',
    "cell.replace(/\\|/g, '\\\\|').replace(/[\\r\\n]/g, ' ')",
    "Math.max(3, ...rows.map(row => stringWidth(row[column] ?? '')))",
    "case 'center': return `:${'-'.repeat(width - 2)}:`",
    "case 'right': return `${'-'.repeat(width - 1)}:`",
    "case 'left': return `:${'-'.repeat(width - 1)}`",
    "const trailingNewlines = token.raw.match(/\\n*$/)?.[0] ?? ''",
    'offset += replacement.length - token.raw.length',
    'const text = normalizeTablesInMarkdown(texts[age]!)',
  ]) {
    assert.ok(copy.includes(witness), `missing source witness: ${witness}`)
  }
})
