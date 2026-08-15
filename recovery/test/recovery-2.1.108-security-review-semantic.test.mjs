import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
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

const targetUnits = new Map([
  [
    15502,
    [
      11155314,
      11166192,
      'cc1fd6db8ae46f909500899c33490e81862ea672f436ea21168beb591bbb1f77',
    ],
  ],
  [
    15503,
    [
      11166192,
      11166810,
      'b3167dee92f2b51d1b9769394a3cb9ec84ef05b6b40a17cc7db32dd2a4f0fff9',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function closingBacktick(contents, openingBacktick) {
  for (let index = openingBacktick + 1; index < contents.length; index++) {
    if (contents[index] !== '`') continue
    let slashCount = 0
    for (
      let previous = index - 1;
      previous >= 0 && contents[previous] === '\\';
      previous--
    ) {
      slashCount++
    }
    if (slashCount % 2 === 0) return index
  }
  throw new Error('unterminated template literal')
}

function cookedTemplateFromSource(contents) {
  const marker = 'const SECURITY_REVIEW_MARKDOWN = '
  const markerIndex = contents.indexOf(marker)
  assert.notEqual(markerIndex, -1, 'security-review prompt declaration')
  const start = markerIndex + marker.length
  assert.equal(contents[start], '`')
  const end = closingBacktick(contents, start)
  const declaration = parse(
    `const prompt = ${contents.slice(start, end + 1)}`,
    { ecmaVersion: 'latest', sourceType: 'module' },
  ).body[0]
  return declaration.declarations[0].init.quasis
    .map((quasi) => quasi.value.cooked)
    .join('')
}

function cookedPromptFromBundle(contents) {
  const promptAnchor = 'You are a senior security engineer conducting a focused security review'
  const anchorIndex = contents.indexOf(promptAnchor)
  assert.notEqual(anchorIndex, -1, 'security-review prompt in bundle')
  const assignment = contents.lastIndexOf('=`', anchorIndex)
  assert.notEqual(assignment, -1, 'security-review template assignment')
  const start = assignment + 1
  const end = closingBacktick(contents, start)
  const declaration = parse(
    `const prompt = ${contents.slice(start, end + 1)}`,
    { ecmaVersion: 'latest', sourceType: 'module' },
  ).body[0]
  return declaration.declarations[0].init.quasis
    .map((quasi) => quasi.value.cooked)
    .join('')
}

test('target108 pins the security-review prompt and reachable descriptor', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(
      region.classification,
      index === 15502 ? 'unresolved' : 'matched',
      `${index}: classification`,
    )
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('target108 changes only security-review Bash wildcard syntax', pairOptions, () => {
  const baselinePrompt = cookedPromptFromBundle(
    fs.readFileSync(baselineBundlePath, 'utf8'),
  )
  const targetPrompt = cookedPromptFromBundle(
    fs.readFileSync(targetBundlePath, 'utf8'),
  )
  assert.equal(baselinePrompt.length, 10_823)
  assert.equal(targetPrompt.length, 10_823)
  assert.equal(
    sha256(baselinePrompt),
    '3c512d2dddbfa144e8501d40c12a8dc14f5c8cb6171dbb637f42ce62761c05cf',
  )
  assert.equal(
    sha256(targetPrompt),
    '5958855e03774e5401e5fc3fa4882cd7afda47555830d77acd351c5fdcf13bc1',
  )
  const oldSyntax = targetPrompt.replace(
    /Bash\(git (diff|status|log|show|remote show) \*\)/g,
    'Bash(git $1:*)',
  )
  assert.equal(baselinePrompt, oldSyntax)
  assert.match(
    targetPrompt,
    /^---\nallowed-tools: Bash\(git diff \*\), Bash\(git status \*\),/,
  )
})

test('source owns the exact security-review prompt and execution graph', sourceOptions, () => {
  const command = source('src/commands/security-review.ts')
  const registry = source('src/commands.ts')
  const prompt = cookedTemplateFromSource(command)
  assert.equal(prompt.length, 10_823)
  assert.equal(
    sha256(prompt),
    '5958855e03774e5401e5fc3fa4882cd7afda47555830d77acd351c5fdcf13bc1',
  )
  for (const fragment of [
    'allowed-tools: Bash(git diff *), Bash(git status *), Bash(git log *)',
    '!`git diff --name-only origin/HEAD...`',
    'Phase 1 - Repository Context Research',
    'Phase 2 - Comparative Analysis',
    'Phase 3 - Vulnerability Assessment',
    'HARD EXCLUSIONS - Automatically exclude findings matching these patterns:',
    'Filter out any vulnerabilities where the sub-task reported a confidence less than 8.',
    'Your final reply must contain the markdown report and nothing else.',
  ]) {
    assert.ok(prompt.includes(fragment), fragment)
  }
  for (const fragment of [
    'createMovedToPluginCommand({',
    "name: 'security-review'",
    "pluginName: 'security-review'",
    'parseFrontmatter(SECURITY_REVIEW_MARKDOWN)',
    'parseSlashCommandToolsFromFrontmatter(',
    'executeShellCommandsInPrompt(',
    'alwaysAllowRules:',
    'command: allowedTools',
    "'security-review'",
    "type: 'text'",
    'text: processedContent',
  ]) {
    assert.ok(command.includes(fragment), fragment)
  }
  assert.ok(registry.includes("import securityReview from './commands/security-review.js'"))
  assert.match(registry, /\n\s*securityReview,\n/)
})
