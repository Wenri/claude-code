import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const currentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
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

const pinnedUnits = new Map([
  [
    12228,
    [
      9441403,
      9455253,
      '1a594121c1b1b29b54e5e8c45ae3f5475d75b17ad5b01a9d3cc57aee0bb35b4c',
    ],
  ],
  [
    12528,
    [
      9615421,
      9624231,
      'e1e416dd270018e96b67e3fdbc82d2a96b69e07d2434244fe33ce7b1eac05ba0',
    ],
  ],
  [
    17498,
    [
      12323697,
      12327251,
      'c95cd760ce9a543efcfd148a83a341c4c3d86ca1cb345a6510bab9c4d2ded7a4',
    ],
  ],
  [
    17559,
    [
      12350460,
      12350570,
      '3627de369e4e7569c951c86bfa8a32c0b67e9e9741ab1fc0ad32e97bcf1b5d61',
    ],
  ],
  [
    17851,
    [
      12462977,
      12519660,
      '451e503fb8a6ca23dac69ea5da7bb4283a0de219433900d174caceb7b0ef9c4f',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test('target92 pins storage, telemetry, Ultraplan, survey, and status units', bundleOptions, () => {
  if (!selected || !targetBundlePath) return
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  assert.equal(bundle.split('postTurnSummary').length - 1, 1)
  const occurrence = bundle.indexOf('postTurnSummary')
  assert.match(
    bundle.slice(occurrence - 80, occurrence + 100),
    /postTurnSummary\?\.status_detail/,
  )
})

test('source preserves input-byte telemetry before mutation and on success', sourceOptions, () => {
  const owner = assertFragments('services/tools/toolExecution.ts', [
    'const toolInputSizeBytes = jsonStringify(input).length',
    "logEvent('tengu_tool_use_success'",
    'toolResultSizeBytes,',
    'toolInputSizeBytes,',
  ])
  const measure = owner.indexOf(
    'const toolInputSizeBytes = jsonStringify(input).length',
  )
  assert.ok(measure < owner.indexOf("typeof input.rerun === 'string'"))
  assert.ok(measure < owner.indexOf('tool.inputSchema.safeParse(input)'))
  assert.ok(
    owner.indexOf('toolResultSizeBytes,', measure) <
      owner.indexOf('toolInputSizeBytes,', measure + 1),
  )

  const input = { command: 'printf café', flag: true }
  const measured = JSON.stringify(input).length
  input.command = 'mutated'
  assert.equal(measured, 37)
  assert.notEqual(measured, JSON.stringify(input).length)
})

test('FileRead strips only persisted payloads and preserves metadata', sourceOptions, () => {
  const owner = assertFragments('tools/FileReadTool/FileReadTool.ts', [
    'stripForStorage(output)',
    "case 'text':",
    "case 'image':",
    "case 'pdf':",
    "case 'notebook':",
    'cells: Array(cells.length)',
  ])
  const stripIndex = owner.indexOf('stripForStorage(output)')
  assert.ok(owner.indexOf('extractSearchText()') < stripIndex)
  assert.ok(stripIndex < owner.indexOf('renderToolUseErrorMessage', stripIndex))

  const strip = output => {
    if (typeof output !== 'object' || output === null) return output
    switch (output.type) {
      case 'text':
        if (output.file.content === '') return output
        return { ...output, file: { ...output.file, content: '' } }
      case 'image':
      case 'pdf':
        if (output.file.base64 === '') return output
        return { ...output, file: { ...output.file, base64: '' } }
      case 'notebook': {
        const { cells } = output.file
        if (cells.length === 0 || cells[0] == null) return output
        return { ...output, file: { ...output.file, cells: Array(cells.length) } }
      }
      default:
        return output
    }
  }

  const text = { type: 'text', file: { filePath: '/a', content: 'secret', numLines: 1 } }
  assert.deepEqual(strip(text), {
    type: 'text',
    file: { filePath: '/a', content: '', numLines: 1 },
  })
  assert.equal(strip({ type: 'text', file: { content: '' } }).file.content, '')
  assert.equal(strip(null), null)
  assert.equal(strip('plain'), 'plain')
  assert.equal(strip({ type: 'parts', file: { count: 2 } }).file.count, 2)
  assert.equal(strip({ type: 'image', file: { base64: 'abc', type: 'image/png' } }).file.base64, '')
  assert.equal(strip({ type: 'pdf', file: { base64: 'abc', originalSize: 3 } }).file.base64, '')
  const notebook = strip({ type: 'notebook', file: { filePath: '/n', cells: [{ source: 'secret' }, {}] } })
  assert.equal(notebook.file.cells.length, 2)
  assert.equal(0 in notebook.file.cells, false)
  const alreadySparse = { type: 'notebook', file: { cells: Array(2) } }
  assert.equal(strip(alreadySparse), alreadySparse)
})

test('Ultraplan propagates result de-dup state only into fresh-session clearing', sourceOptions, () => {
  const owner = assertFragments(
    'components/ultraplan/UltraplanChoiceDialog.tsx',
    [
      'resultDedupState',
      "case 'here'",
      'Ultraplan approved in browser. Here is the plan:',
      "case 'fresh'",
      'clearConversation({',
      'Previous session saved · resume with: claude --resume',
      "case 'cancel'",
      'Ultraplan rejected · Plan saved to',
      "status: 'completed', endTime: Date.now()",
      'archiveRemoteSession(sessionId)',
    ],
  )
  const fresh = owner.slice(owner.indexOf("case 'fresh'"), owner.indexOf("case 'cancel'"))
  assert.match(fresh, /clearConversation\([\s\S]*?resultDedupState/)
  assert.equal(owner.slice(owner.indexOf("case 'here'"), owner.indexOf("case 'fresh'")).includes('resultDedupState'), false)
})

test('transcript sharing uses case-insensitive y/n/d responses', sourceOptions, () => {
  const owner = assertFragments(
    'components/FeedbackSurvey/TranscriptSharePrompt.tsx',
    [
      "const RESPONSE_INPUTS = ['y', 'n', 'd'] as const",
      "y: 'yes'",
      "n: 'no'",
      "d: 'dont_ask_again'",
      'input.toLowerCase()',
    ],
  )
  const inputs = ['y', 'n', 'd']
  const responses = { y: 'yes', n: 'no', d: 'dont_ask_again' }
  for (const input of ['y', 'Y', 'n', 'N', 'd', 'D']) {
    const normalized = input.toLowerCase()
    assert.ok(inputs.includes(normalized))
    assert.ok(['yes', 'no', 'dont_ask_again'].includes(responses[normalized]))
  }

  if (currentSource) {
    assertFragments('components/FeedbackSurvey/TranscriptSharePrompt.tsx', [
      '<Button',
      'tabIndex={-1}',
      "setInputValue('')",
      "hovered ? 'userMessageBackgroundHover' : undefined",
      "{ key: 'y', label: 'Yes', width: 10 }",
      "{ key: 'n', label: 'No', width: 10 }",
      `{ key: 'd', label: "Don't ask again" }`,
    ])
  } else {
    assert.equal(owner.includes('<Button'), false)
    for (const fragment of [
      '<Text color="ansi:cyan">y</Text>: Yes',
      '<Text color="ansi:cyan">n</Text>: No',
      '<Text color="ansi:cyan">d</Text>: Don\'t ask again',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
  }
})
