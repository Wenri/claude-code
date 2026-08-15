import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
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
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const pinnedUnits = new Map([
  [8067, ['unresolved', 6653176, 6653218, 'bc973b564f1d5faf17df6400ed9d35a7405e142504b130e09eb608f2528d5c75']],
  [8068, ['unresolved', 6653218, 6653293, 'ee7210c55415afa2f11a1120f25c254b599d925775b36bebdd6d1c808aee2399']],
  [8069, ['unresolved', 6653293, 6653369, '1b80fd694600fb010d23379ce2d233566725b0c5775366918d8c1897cb03ca9b']],
  [8070, ['unresolved', 6653369, 6653791, '8a8e655d38200c1166b42d628732816f8705750f54b3fb5dd6823e75e88b04f0']],
  [8071, ['unresolved', 6653791, 6653935, 'f91edc5c77bb469db2ec74828d6dfeb1d506502b8287e450ab2d4b40a4d66e73']],
  [8072, ['unresolved', 6653935, 6654022, '43f7b1017c508a58784047414587a70143184a4e92d987dbfed261f9dc16e503']],
  [8073, ['unresolved', 6654022, 6654129, '36a48bdf6462058f65cd564c721f6030de0467d8c59f2dc9c998e22880a0e09e']],
  [8074, ['unresolved', 6654129, 6654238, 'b7a1ef304fd14c81a3e8f9e9bcee2c5e3a1c8ffa5ba2c63ab8d25edc297fdaff']],
  [8075, ['unresolved', 6654238, 6654505, 'ae9bc9b0e37d43de4d011434eced6c971beff580bd3849f87357102e874a5791']],
  [8076, ['unresolved', 6654505, 6654605, '0e1bfe72249a8521d373e959fc04c00985e3c4aa1c59127aadc423e1c53aee7c']],
  [8077, ['unresolved', 6654605, 6654671, '43758078ba157419ddad7b808385d1a31179ffb26bd8054a0e09f36cfcc71ecf']],
  [8078, ['unresolved', 6654671, 6654770, '060b66c617c72a30fc55b8466d926df462e0d8425a501002d32dce075e5bca2d']],
  [8079, ['unresolved', 6654770, 6654967, 'f96aba1a8133037f358b56e2a77d9d34cf7bc9b8f1af2e1e2cfcc39289106609']],
  [8081, ['unresolved', 6654995, 6656197, '8948b0e6d73c8e26e21a3b6ac209c8d3040750c5b73afc9c95cbd1627df29c50']],
  [8082, ['unresolved', 6656197, 6656807, 'a1b5e4272366535d13f5c28a709bdd06ad22a97cfb9d26a1e651d49e8ac76d94']],
])

test('2.1.92 pins the complete generic shortcut formatter and component', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
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
    'pageup:["PageUp","pgup","⇞"]',
    'compact:{keyCase:"lower"',
    'symbol:{keyCase:"glyph"',
    'if(!H)return null',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('materialized source owns formatter tables and every runtime branch', sourceOptions, () => {
  const filename = path.join(
    sourceRoot,
    'components/design-system/KeyboardShortcutHint.tsx',
  )
  const source = fs.readFileSync(filename, 'utf8')
  for (const fragment of [
    "compact: {",
    "symbol: {",
    "pageup: ['PageUp', 'pgup', '⇞']",
    "if (format.caretCtrl && mods.length === 1 && mods[0] === 'ctrl')",
    "if (format.modCase === 'glyph')",
    'const common = commonModifiers(singleKeys, format)',
    "if (!display) return null",
    'chord?: string | string[]',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }

  const bun = path.join(repositoryRoot, '.pixi/envs/default/bin/bun')
  const expression = `import {formatKeyboardShortcut as f} from ${JSON.stringify(filename)}; console.log(JSON.stringify([f('escape'),f('escape',{keyCase:'lower'}),f(['ctrl+up','ctrl+down'],{style:'compact'}),f('ctrl+c',{style:'compact'}),f('shift+a',{style:'symbol'}),f(['up','down'],{style:'default'}),f([])]));`
  const result = spawnSync(bun, ['-e', expression], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), [
    'Esc',
    'esc',
    '^↑↓',
    '^c',
    'A',
    '↑/↓',
    '',
  ])
})
