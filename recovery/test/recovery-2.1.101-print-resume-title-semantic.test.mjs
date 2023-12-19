import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function bundle(filename, expected, label) {
  assert.ok(filename, `${label} bundle is required`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expected, label)
  return bytes.toString('utf8')
}

test(
  'target101 pins exact-title print resume and ambiguity handling',
  {
    skip:
      !selected || !baselinePath || !targetPath
        ? 'selected authenticated 100/101 artifacts are required'
        : false,
  },
  () => {
    const baseline = bundle(
      baselinePath,
      'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
      '2.1.100',
    )
    const target = bundle(
      targetPath,
      'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
      '2.1.101',
    )
    assert.equal(
      sha256(target.slice(13377495, 13380718)),
      'e465d3aaec9bd1c620aa6ee6f2747cd506b2fc9bada238b005c87ee3febd58e4',
      'target101 unit 18778',
    )
    for (const fragment of [
      ' sessions. Pass one of these session IDs to disambiguate:',
      ' or session title when used with --print.',
      ' is not a UUID and does not match any session title.',
    ]) {
      assert.equal(baseline.includes(fragment), false, fragment)
      assert.equal(target.includes(fragment), true, fragment)
    }
    assert.equal(
      target.split('(unknown)').length,
      baseline.split('(unknown)').length + 1,
      'resume-title ambiguity branch adds its own unknown-project fallback',
    )
  },
)

test(
  'source owns the exact lookup, ambiguity, and invalid-title branches',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(path.join(sourceRoot, 'cli/print.ts'), 'utf8')
    for (const fragment of [
      'typeof options.resume === \'string\' ? options.resume.trim() : \'\'',
      'searchSessionsByCustomTitle(resumeValue, {',
      'exact: true',
      'if (matches.length === 1)',
      'getSessionIdFromLog(matches[0]!)',
      'else if (matches.length > 1)',
      "match.modified.toISOString()",
      'sessions. Pass one of these session IDs to disambiguate:',
      'or session title when used with --print',
      'is not a UUID and does not match any session title.',
      'gracefulShutdownSync(1)',
    ]) assert.ok(source.includes(fragment), fragment)
  },
)
