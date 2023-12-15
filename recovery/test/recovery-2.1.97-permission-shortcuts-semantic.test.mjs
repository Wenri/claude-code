import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const owners = [
  'components/permissions/BashPermissionRequest/BashPermissionRequest.tsx',
  'components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx',
]

test('target97 pins both configurable shell-permission shortcut owners', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const expected = new Map([
    [
      16848,
      [
        12026159,
        12031573,
        '9068618597c0e9388a7224d651f054019240c575326e1d61389b299637e4e2a6',
      ],
    ],
    [
      16911,
      [
        12070522,
        12074720,
        '9150d1df81fc0deb409e34b45a2b9c1c31c5873d4780e8f77711870941a58dfe',
      ],
    ],
  ])
  for (const [index, identity] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    const owner = bytes
      .toString('utf8')
      .slice(region.target.start, region.target.end)
    assert.equal(sha256(owner), region.target.sourceHash)
    for (const fragment of [
      'chord:"ctrl+d",action:"hide debug info",format:{modCase:"title",charCase:"upper",modSep:"-"}',
      'chord:"escape",action:"cancel"',
      'chord:"tab",action:"amend"',
      'chord:"ctrl+e",action:',
      'chord:"ctrl+d",action:"show debug info",format:{modCase:"title"}',
    ]) {
      assert.ok(owner.includes(fragment), `${index}: ${fragment}`)
    }
  }
})

test('source expresses the target97 shortcut call graph for both shell dialogs', sourceOptions, () => {
  for (const ownerPath of owners) {
    const source = fs.readFileSync(path.join(sourceRoot, ownerPath), 'utf8')
    for (const fragment of [
      "import { Byline } from '../../design-system/Byline.js'",
      "import { KeyboardShortcutHint } from '../../design-system/KeyboardShortcutHint.js'",
      '<KeyboardShortcutHint chord="ctrl+d" action="hide debug info" format={{ modCase: \'title\', charCase: \'upper\', modSep: \'-\' }} />',
      '<KeyboardShortcutHint chord="escape" action="cancel" />',
      '<KeyboardShortcutHint chord="tab" action="amend" />',
      '<KeyboardShortcutHint chord="ctrl+e" action={explainerState.visible ? \'hide\' : \'explain\'} />',
      '<KeyboardShortcutHint chord="ctrl+d" action="show debug info" format={{ modCase: \'title\' }} />',
    ]) {
      assert.ok(source.includes(fragment), `${ownerPath}: ${fragment}`)
    }
    assert.equal(source.includes('Ctrl-D to hide debug info'), false)
    assert.equal(source.includes('Ctrl+d to show debug info'), false)
  }
})

test('2.1.96 still uses the pre-formatter hard-coded debug labels', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.match(/Ctrl-D to hide debug info/g)?.length, 2)
  assert.equal(bundle.match(/Ctrl\+d to show debug info/g)?.length, 2)
  assert.equal(bundle.includes('chord:"ctrl+d",action:"hide debug info"'), false)
})
