import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetSha256 =
  '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9'
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_90_BUNDLE is not set'
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

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

const pinnedUnits = new Map([
  [
    10844,
    [
      'unresolved',
      8586890,
      8586984,
      '947189c7f3a91b93d47f0e4e9f5998a06a6d8660b36fe0ae55bc2f8ec265fd3e',
    ],
  ],
  [
    10845,
    [
      'moved',
      8586984,
      8587016,
      '49d9e1e1e50e4a8266fe8c55293bc47603b4eb08fc635dde01c18b4e7a9f0fd5',
    ],
  ],
  [
    10846,
    [
      'unresolved',
      8587016,
      8587519,
      'cac9e740a54660f655890c84a9c63ab2f1fd20483d97213f12380288f590b29a',
    ],
  ],
  [
    10861,
    [
      'unresolved',
      8592559,
      8593133,
      '0cb72781d6809e83bcb587698855f5054dac5b48c3d976f0227ab0fc244d7514',
    ],
  ],
  [
    10885,
    [
      'unresolved',
      8611104,
      8616738,
      '7c6371b745c168be1c02e43f86e547a6629d1005f7cb80afd9b36b1cd9230b7b',
    ],
  ],
  [
    10892,
    [
      'unresolved',
      8627315,
      8628482,
      'f513d1a2ee1267a8f872ef62701ce822884545283c82372264126744dc828192',
    ],
  ],
  [
    10937,
    [
      'unresolved',
      8644959,
      8653009,
      'b9144cd410680126f6bc5cdb8235da5ae5b0954852cba76c7b9ec3413df2743d',
    ],
  ],
])

test(
  '2.1.90 PowerShell safety evidence pins every owning target unit',
  bundleOptions,
  () => {
    const bundleBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bundleBytes), targetSha256)
    const bundle = bundleBytes.toString('utf8')
    for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }
    for (const fragment of [
      'silentlycontinue',
      '--host',
      'Remove-Item -Recurse targeting',
      'background job operator (`&`)',
      'Compound command extracts an archive followed by other commands.',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test('source validates common ActionPreference parameters and values', sourceOptions, () => {
  assertFragments('src/tools/PowerShellTool/commonParameters.ts', [
    "'-ea'",
    "'-wa'",
    "'-infa'",
    "'-proga'",
    'export const SAFE_ACTION_PREFERENCE_VALUES',
    "'silentlycontinue'",
    "'ignore'",
    'ACTION_PREFERENCE_PARAMETERS.some(full => full.startsWith(parameter))',
  ])
  const readOnly = assertFragments(
    'src/tools/PowerShellTool/readOnlyValidation.ts',
    [
      'hasUnsafeActionPreference(cmd.args, cmd.elementTypes)',
      'isActionPreferenceParameter(parameter)',
      '!SAFE_ACTION_PREFERENCE_VALUES.has(value)',
    ],
  )
  const actionCheck = readOnly.indexOf(
    'hasUnsafeActionPreference(cmd.args, cmd.elementTypes)',
  )
  const allowAll = readOnly.indexOf('if (config.allowAllFlags)', actionCheck)
  assert.ok(actionCheck >= 0 && allowAll > actionCheck)
})

test('source blocks Docker connection flags and recursive cwd deletion', sourceOptions, () => {
  assertFragments('src/tools/PowerShellTool/readOnlyValidation.ts', [
    "if (arg[i] === 'H') return false",
    "arg[i]?.toLowerCase() === 'c'",
    "lower.startsWith('--host')",
    "lower.startsWith('--context')",
    "lower.startsWith('--config')",
    "lower.startsWith('--tls')",
  ])
  assertFragments('src/tools/PowerShellTool/pathValidation.ts', [
    "parameter.length >= 2 && '-recurse'.startsWith(parameter)",
    'normalizedTarget === normalizedCwd',
    "normalizedCwd.startsWith(normalizedTarget + '/')",
    "normalizedCwd.startsWith(normalizedTarget + '\\\\')",
    "Remove-Item -Recurse targeting '${filePath}' would delete the working directory including .git and .claude — requires manual approval",
  ])
  assertFragments('src/utils/powershell/dangerousCmdlets.ts', ["'arp'"])
})

test('source covers parse-fallback, background-job, and archive-chain gates', sourceOptions, () => {
  const permissions = assertFragments(
    'src/tools/PowerShellTool/powershellPermissions.ts',
    [
      ".replace(/<#[\\s\\S]*?#>/g, ' ')",
      'if (parsed.hasBackgroundJob)',
      'Command uses the background job operator (`&`) which spawns a child PowerShell process',
      'hasArchiveExtractor && allSubCommands.length > 1',
      'Compound command extracts an archive followed by other commands. Archive contents (symlinks, config files) cannot be validated and may redirect subsequent path operations.',
    ],
  )
  const stripComment = permissions.indexOf(".replace(/<#[\\s\\S]*?#>/g, ' ')")
  const stripBacktick = permissions.indexOf(".replace(/`[\\r\\n]+\\s*/g, '')")
  assert.ok(stripComment >= 0 && stripBacktick > stripComment)
})

test('modeled predicates exercise the recovered target branches', () => {
  const full = [
    '-erroraction',
    '-warningaction',
    '-informationaction',
    '-progressaction',
  ]
  const aliases = ['-ea', '-wa', '-infa', '-proga']
  const isAction = parameter =>
    parameter.length >= 2 &&
    (aliases.includes(parameter) || full.some(name => name.startsWith(parameter)))
  for (const parameter of ['-e', '-err', '-warninga', ...aliases]) {
    assert.equal(isAction(parameter), true, parameter)
  }
  assert.equal(isAction('-'), false)
  assert.equal(isAction('-outvariable'), false)

  const safeValues = new Set([
    'silentlycontinue',
    '0',
    'stop',
    '1',
    'continue',
    '2',
    'ignore',
    '4',
  ])
  assert.equal(safeValues.has('stop'), true)
  assert.equal(safeValues.has('inquire'), false)

  const unsafeDocker = arg => {
    if (arg[0] === '-' && arg[1] !== '-') {
      for (let i = 1; i < arg.length; i++) {
        if (arg[i] === 'H' || arg[i]?.toLowerCase() === 'c') return true
      }
    }
    const lower = arg.toLowerCase()
    return ['--host', '--context', '--config', '--tls'].some(prefix =>
      lower.startsWith(prefix),
    )
  }
  for (const arg of ['-Htcp://evil', '-c bad', '--host=evil', '--tlsverify']) {
    assert.equal(unsafeDocker(arg), true, arg)
  }
  assert.equal(unsafeDocker('--format'), false)
})
