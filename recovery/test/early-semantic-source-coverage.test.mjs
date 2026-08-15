import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parseExpressionAt } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const earlyCases = [
  ['2.1.89-to-2.1.90', 2109, 223],
  ['2.1.90-to-2.1.91', 3113, 152],
  ['2.1.91-to-2.1.92', 3132, 185],
  ['2.1.92-to-2.1.94', 1795, 189],
  ['2.1.94-to-2.1.96', 75, 2],
]

function source(relative) {
  return fs.readFileSync(path.join(repositoryRoot, relative), 'utf8')
}

function compressedJson(relative) {
  return JSON.parse(
    gunzipSync(fs.readFileSync(path.join(repositoryRoot, relative))),
  )
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function inlineReadingGuide(value) {
  const markerOffset = Math.max(
    value.indexOf(
      '## Reference Documentation\n\nThe relevant documentation for your detected language',
    ),
    value.indexOf(
      '## Reference Documentation\\n\\nThe relevant documentation for your detected language',
    ),
  )
  assert.notEqual(markerOffset, -1, 'INLINE_READING_GUIDE marker missing')
  const quoteOffset = Math.max(
    value.lastIndexOf("'", markerOffset),
    value.lastIndexOf('"', markerOffset),
    value.lastIndexOf('`', markerOffset),
  )
  const expression = parseExpressionAt(value, quoteOffset, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  if (expression.type === 'Literal') return expression.value
  assert.equal(expression.type, 'TemplateLiteral')
  assert.equal(expression.expressions.length, 0)
  return expression.quasis[0].value.cooked
}

test('early semantic ledgers classify the exact nonmatched structural set fail-closed', () => {
  for (const [caseName, expectedRows, expectedDependencyGaps] of earlyCases) {
    const ledger = compressedJson(
      `recovery/cases/${caseName}/semantic/source-coverage.json.gz`,
    )
    assert.equal(ledger.rows.length, expectedRows, caseName)
    assert.equal(ledger.summary.nonmatchedUnits, expectedRows, caseName)
    assert.equal(ledger.summary.sourceRuntimeGaps, 0, caseName)
    assert.equal(
      ledger.summary.dependencyRuntimeGaps,
      expectedDependencyGaps,
      caseName,
    )
    assert.equal(
      ledger.rows.some(row => row.disposition === 'source-runtime-gap'),
      false,
      caseName,
    )
    for (const owner of ledger.owners) {
      assert.equal(
        fs.statSync(path.join(repositoryRoot, owner.path)).isFile(),
        true,
        `${caseName}: ${owner.path}`,
      )
    }
  }
})

test('early dependency audits preserve unresolved build-input gaps', () => {
  for (const [caseName, , expectedDependencyGaps] of earlyCases) {
    const ledger = compressedJson(
      `recovery/cases/${caseName}/semantic/source-coverage.json.gz`,
    )
    const audit = compressedJson(
      `recovery/cases/${caseName}/semantic/dependency-coverage.json.gz`,
    )
    const dependencyRows = ledger.rows.filter(
      row => row.disposition === 'dependency-runtime',
    )
    const auditedRows = audit.groups.flatMap(group => group.rows)

    assert.equal(dependencyRows.length, expectedDependencyGaps, caseName)
    assert.equal(audit.summary.dependencyRows, expectedDependencyGaps, caseName)
    assert.equal(
      audit.summary.dependencyRuntimeGaps,
      expectedDependencyGaps,
      caseName,
    )
    assert.equal(audit.summary.pinnedSourceBuildInputs, 0, caseName)
    assert.equal(audit.summary.exactTargetBundleArtifactRecoverable, true, caseName)
    assert.equal(audit.summary.wholeBundleSemanticEquivalentFromSrc, false, caseName)
    assert.equal(
      audit.buildInputAudit.applicationManifestOrLockfileInTargetCommit,
      false,
      caseName,
    )
    assert.equal(audit.buildInputAudit.dependencySourceArchivePinned, false, caseName)
    assert.equal(audit.buildInputAudit.dependencyBuildRecipePinned, false, caseName)
    assert.deepEqual(
      auditedRows.map(row => row.targetIndex).sort((left, right) => left - right),
      dependencyRows
        .map(row => row.targetIndex)
        .sort((left, right) => left - right),
      caseName,
    )
  }
})

test('misleading early source-map boundaries use explicit runtime owners', () => {
  const expected = new Map([
    ['2.1.89-to-2.1.90:14120', 'owner-src-commands-powerup-powerup-tsx'],
    ['2.1.89-to-2.1.90:14139', 'owner-src-commands-powerup-index-ts'],
    [
      '2.1.91-to-2.1.92:10130',
      'owner-src-components-BedrockSetupWizard-tsx',
    ],
    [
      '2.1.91-to-2.1.92:14382',
      'owner-src-commands-release-notes-release-notes-tsx',
    ],
    [
      '2.1.91-to-2.1.92:14654',
      'owner-src-commands-provider-setup-index-ts',
    ],
    [
      '2.1.92-to-2.1.94:18059',
      'owner-src-utils-model-bedrockModelUpgrade-tsx',
    ],
    [
      '2.1.94-to-2.1.96:18067',
      'owner-src-utils-model-bedrockModelUpgrade-tsx',
    ],
  ])

  for (const [key, expectedOwner] of expected) {
    const [caseName, targetIndexText] = key.split(':')
    const ledger = compressedJson(
      `recovery/cases/${caseName}/semantic/source-coverage.json.gz`,
    )
    const row = ledger.rows.find(
      candidate => candidate.targetIndex === Number(targetIndexText),
    )
    assert.ok(row, key)
    assert.ok(row.ownerIds.includes(expectedOwner), key)
    const evidenceKinds = new Map(
      ledger.evidence.map(item => [item.id, item.kind]),
    )
    assert.deepEqual(
      [...new Set(row.evidenceIds.map(id => evidenceKinds.get(id)))].sort(),
      ['semantic-test', 'target-fragment'],
      key,
    )
    assert.ok(row.behavior.length > 40, key)
  }
})

test('the bundled native modifier loader remains an explicit whole-bundle gap', () => {
  const ledger = compressedJson(
    'recovery/cases/2.1.89-to-2.1.90/semantic/source-coverage.json.gz',
  )
  const audit = compressedJson(
    'recovery/cases/2.1.89-to-2.1.90/semantic/dependency-coverage.json.gz',
  )
  const row = ledger.rows.find(candidate => candidate.targetIndex === 13006)
  assert.equal(row?.disposition, 'dependency-runtime')
  assert.equal(row?.ownerIds.length, 0)
  const dependencyRow = audit.groups
    .flatMap(group => group.rows)
    .find(candidate => candidate.targetIndex === 13006)
  assert.ok(dependencyRow)
  assert.equal(
    audit.groups.some(group => group.package === 'vendor/modifiers-napi-src'),
    true,
  )
})

test('current src retains the recovered early command and Bedrock owners', () => {
  const commands = source('src/commands.ts')
  assert.match(commands, /import powerup from '.\/commands\/powerup\/index\.js'/)
  assert.match(commands, /\n  powerup,\n/)
  assert.match(commands, /setupBedrock/)

  const provider = source('src/commands/provider-setup/index.ts')
  assert.match(provider, /name: 'setup-bedrock'/)
  assert.match(
    provider,
    /description: 'Reconfigure AWS Bedrock authentication, region, or model pins'/,
  )
  assert.match(provider, /CLAUDE_CODE_USE_BEDROCK/)
  const setup = source('src/commands/provider-setup/bedrock.tsx')
  assert.match(setup, /tengu_bedrock_setup_started/)
  assert.match(setup, /tengu_bedrock_setup_cancelled/)
  assert.match(setup, /<BedrockSetupWizard/)

  const releaseNotes = source(
    'src/commands/release-notes/release-notes.tsx',
  )
  assert.match(releaseNotes, /SHOW_ALL_VALUE/)
  assert.match(releaseNotes, /label: 'Show all'/)
  assert.match(releaseNotes, /CHANGELOG/)
  assert.match(releaseNotes, /Promise\.race/)
})

test(
  '2.1.91 exact cooked guide is owned by the patched historical source',
  { skip: !process.env.CLAUDE_CODE_2_1_91_BUNDLE },
  () => {
    const targetBundle = fs.readFileSync(
      process.env.CLAUDE_CODE_2_1_91_BUNDLE,
      'utf8',
    )
    assert.equal(
      sha256(fs.readFileSync(process.env.CLAUDE_CODE_2_1_91_BUNDLE)),
      'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816',
    )
    const targetGuide = inlineReadingGuide(targetBundle)
    assert.equal(targetGuide.length, 1543)
    assert.equal(Buffer.byteLength(targetGuide), 1567)
    assert.equal(
      sha256(targetGuide),
      '1c7ea919e9d353439902fb14c725d08ccad481eb04c64d12dfa04744bbc84d96',
    )

    const historical = execFileSync(
      'git',
      [
        'show',
        'cb8a3dbe788589c66326d345c54d35abd5603850:src/skills/bundled/claudeApi.ts',
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    const anchor = [
      '**File uploads across multiple requests:**',
      '→ Refer to \\`{lang}/claude-api/README.md\\` + \\`{lang}/claude-api/files-api.md\\`',
    ].join('\n')
    const addition = [
      '**Agent design (tool surface, context management, caching strategy):**',
      '→ Refer to \\`shared/agent-design.md\\`',
    ].join('\n')
    assert.equal(historical.includes(addition), false)
    assert.match(
      source(
        'recovery/cases/2.1.90-to-2.1.91/semantic-supplement.patch',
      ),
      /\+\*\*Agent design \(tool surface, context management, caching strategy\):\*\*[\s\S]*\+→ Refer to \\`shared\/agent-design\.md\\`/,
    )
    const patched = historical.replace(anchor, `${anchor}\n\n${addition}`)
    assert.notEqual(patched, historical, 'historical guide anchor missing')
    assert.equal(inlineReadingGuide(patched), targetGuide)
  },
)
