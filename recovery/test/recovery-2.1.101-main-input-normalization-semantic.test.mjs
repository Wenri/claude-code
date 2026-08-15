import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const units = [
  [18890, 13437275, 13437718, 'a3a8613f45b98793f2fee2f1b057bd5766b957610d14d9eb1b55bde6cebc77af'],
  [18895, 13440428, 13440948, 'c30a03c4702e51bd09d63ad026d91a3379b5d2ef133ac1ebc46d77d3940cc75f'],
]
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target101 pins the settings and stdin helper units', pairOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const [index, start, end, hash] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
  }
})

test('the observable diagnostics are inherited unchanged', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'Error: Invalid JSON provided to --settings',
    'Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.',
  ]) {
    assert.ok(baseline.includes(fragment), `${fragment}: baseline`)
    assert.ok(target.includes(fragment), `${fragment}: target`)
  }
})

test('source owns the same diagnostics before compiler concatenation', sourceOptions, () => {
  const main = fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8')
  assert.ok(
    main.includes(
      "process.stderr.write(chalk.red('Error: Invalid JSON provided to --settings\\n'))",
    ),
  )
  const warning =
    'Warning: no stdin data received in 3s, proceeding without it. ' +
    'If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.\n'
  assert.ok(
    main.includes(
      "process.stderr.write('Warning: no stdin data received in 3s, proceeding without it. ' + 'If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.\\n')",
    ),
  )
  assert.equal(
    warning.trimEnd(),
    'Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.',
  )
})
