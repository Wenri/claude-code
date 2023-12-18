import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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

const units = new Map([
  [2529, [1001021, 1004626, 'a7f80641eec9d1f4928b08ba53df0462e31035aef622110b7f0f3500b8984926']],
  [5251, [3807586, 3807780, '4afe5b8071d33aab39c351305dc7899b7f9e5caabea8ae0efef80ce2e47b6193']],
  [5256, [3809950, 3810393, '4748a85e638f742b4838293afaabae6e40084cf5e6dc58984525164326590803']],
  [5597, [4049762, 4050394, '106be7f6f38bdf9c007dc91c14487e2438208c60e3d72c42b219fafc6fb47e52']],
  [6050, [4367213, 4367341, '95fb5341451fe0a8de6e88254046bfd3074a994576b293fb79eb7caa78cbf6e3']],
  [6055, [4371820, 4372164, 'bd9bec2c5bd6fd4458f4d2374e521ce929306fb6aabae619f4c1fe7fe4bf18ea']],
  [6139, [4390394, 4391979, 'c832e1e1fcb09638a41ef0534577f82cfa401287d9818fc80e5864592f78cbe9']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertSource(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test(
  'target110 pins deployment, color, image-block, and Terminal.app units',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    for (const fragment of [
      'CODER_WORKSPACE_NAME',
      '--color=truecolor',
      'Shift+Return will now enter a newline.',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
      assert.equal(target.includes(fragment), true, `${fragment}: target`)
    }
    assert.equal(baseline.includes('512000'), false)
    assert.equal(target.includes('512000'), true)
    const terminal = target.slice(...units.get(5597).slice(0, 2))
    assert.match(terminal, /mintty/)
    assert.match(terminal, /rio/)
    assert.match(terminal, /Tabby/)
    assert.match(terminal, /KONSOLE_VERSION/)
    assert.match(terminal, /211200/)
  },
)

test(
  'source owns the exact deployment and terminal-color gates',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    assertSource('utils/env.ts', [
      'process.env.CODER_WORKSPACE_NAME',
      "return 'devpod'",
      'process.env.DAYTONA_WS_ID',
      "return 'gcp-cloud-workstations'",
      "return 'aws-cloud9'",
    ])
    const color = assertSource('ink/colorize.ts', [
      "'--no-colors'",
      "'--color=truecolor'",
      "'xterm-kitty'",
      "process.argv.indexOf('--')",
      'process.env.FORCE_COLOR === undefined',
      'TRUECOLOR_TERMS.has(term)',
    ])
    assert.ok(
      color.indexOf('disableChalkForNoColor()') <
        color.indexOf('boostChalkLevelForXtermJs()'),
    )
    assert.ok(
      color.indexOf('boostChalkLevelForKnownTruecolorTerminal()') <
        color.indexOf('clampChalkLevelForTmux()'),
    )
    assertSource('commands/terminalSetup/terminalSetup.tsx', [
      "release().match(/^(\\d+)\\./)",
      'Number.parseInt(darwinMajor[1], 10) - 9',
      'const usesShiftReturn = (macOSMajorVersion ?? 0) >= 27',
      'usesShiftReturn ? false : await enableOptionAsMetaForProfile',
      'Shift+Return will now enter a newline.',
    ])
    assertSource('ink/terminal.ts', [
      "termProgram === 'mintty'",
      "termProgram === 'rio'",
      "termProgram === 'Tabby'",
      "parseInt(process.env.KONSOLE_VERSION ?? '', 10) >= 211200",
      "term?.includes('kitty')",
      "term?.startsWith('foot')",
      'version >= 6800',
    ])
  },
)

test(
  'source caps image blocks at 500 KiB with bounded JPEG quality search',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const image = assertSource('utils/imageResizer.ts', [
      'MAX_IMAGE_BLOCK_BYTES = 512_000',
      'if (!/jpe?g/i.test(format))',
      'for (let attempt = 0; attempt < 5; attempt++)',
      'Math.floor((minimumQuality + maximumQuality) / 2)',
      'matchingBuffer ?? smallestBuffer',
      'outputBuffer.length > MAX_IMAGE_BLOCK_BYTES',
      'outputBuffer.toString(\'base64\')',
    ])
    if (semanticCase === caseName) {
      assert.ok(image.includes('`image/${resized.mediaType}`'))
    } else {
      assert.ok(image.includes('detectImageFormatFromBuffer(outputBuffer)'))
    }
  },
)
