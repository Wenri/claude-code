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
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
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

const identities = new Map([
  [
    6050,
    [
      4367213,
      4367341,
      'VariableDeclaration',
      '95fb5341451fe0a8de6e88254046bfd3074a994576b293fb79eb7caa78cbf6e3',
    ],
  ],
  [
    6228,
    [
      4424913,
      4425220,
      'FunctionDeclaration',
      '8bf19b0922b1bf25de259f5df656405092076c7de5a3db09a68d9bc2809c69ea',
    ],
  ],
  [
    6229,
    [
      4425220,
      4425330,
      'FunctionDeclaration',
      'd4a10a092baa6454751585d88e63a5fb59b4e6910ac7cd2e6f0e3e6d32d5275e',
    ],
  ],
  [
    6231,
    [
      4425338,
      4425387,
      'VariableDeclaration',
      '3b9174561ef9e8c79cbed111e3d60ada871c2fa75f472d5d011d7ba15b8f6d92',
    ],
  ],
  [
    6234,
    [
      4425452,
      4427084,
      'FunctionDeclaration',
      '9c11f7cf28b352536554a33cce72ad49aa8998b778f1fbea51f6a6080fd8e9c2',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function read(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target110 pins provider-gated dynamic image limits and their paste consumer',
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
    const units = new Map()
    for (const [index, identity] of identities) {
      const region = structural.regions[index]
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
      )
      const unit = target.slice(region.target.start, region.target.end)
      assert.equal(sha256(unit), region.target.sourceHash)
      units.set(index, unit)
    }

    assert.equal(baseline.includes('tengu_crimson_vector'), false)
    assert.equal(target.includes('tengu_crimson_vector'), true)
    assert.match(units.get(6228), /\.imageLimits\?\?[^;]+\[/)
    assert.match(units.get(6228), /targetRawSize:[^}]+\*3\/4/)
    assert.match(units.get(6050), /10485760/)
    assert.match(units.get(6229), /===['"]firstParty['"]/)
    assert.match(units.get(6229), /tengu_crimson_vector/)
    assert.match(units.get(6231), /=\{\}/)
    assert.match(units.get(6234), /getImageFromClipboard|\.map\(/)
  },
)

test(
  'source threads model/provider image limits through every image boundary',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const limits = read('utils/imageLimits.ts')
    assert.match(limits, /getAPIProvider\(\) === 'firstParty'/)
    assert.match(limits, /isFirstPartyAnthropicBaseUrl\(\)/)
    assert.match(
      limits,
      /getFeatureValue_CACHED_MAY_BE_STALE\('tengu_crimson_vector', false\)/,
    )
    assert.match(limits, /10 \* 1024 \* 1024/)
    assert.match(limits, /targetRawSize: \(providerMaxBase64Size \* 3\) \/ 4/)
    if (historical) {
      assert.doesNotMatch(limits, /'claude-opus-4-7'/)
      assert.match(limits, /MODEL_IMAGE_LIMIT_OVERRIDES[^=]*= \{\}/s)
    } else {
      assert.match(
        limits,
        /'claude-opus-4-7': \{ maxWidth: 2576, maxHeight: 2576 \}/,
      )
    }

    const resizer = read('utils/imageResizer.ts')
    for (const fragment of [
      'limits: ImageLimits,',
      'originalSize > limits.targetRawSize',
      'width > limits.maxWidth',
      'height > limits.maxHeight',
      'base64Size <= limits.maxBase64Size',
      'formatFileSize(limits.maxBase64Size)',
    ]) {
      assert.ok(resizer.includes(fragment), fragment)
    }
    assert.doesNotMatch(
      resizer,
      /limits:\s*ImageLimits\s*=\s*DEFAULT_IMAGE_LIMITS/,
      'image buffer/block boundaries require the selected model limits',
    )

    const validation = read('utils/imageValidation.ts')
    assert.match(validation, /export function validateImagesForAPI\([\s\S]*maxSize: number/)
    assert.match(
      validation,
      /isToolResultBlock\(block\)[\s\S]*for \(const nestedBlock of block\.content\)[\s\S]*isBase64ImageBlock\(nestedBlock\)/,
    )

    for (const owner of ['query.ts', 'services/api/claude.ts']) {
      const contents = read(owner)
      assert.match(
        contents,
        /normalizeMessagesForAPI\([\s\S]*?\)[\s\S]*validateImagesForAPI\([\s\S]*?getImageLimits\([\s\S]*?\.maxBase64Size/,
        `${owner} normalizes with the two-argument API then validates explicitly`,
      )
    }

    const paste = read('utils/imagePaste.ts')
    assert.match(paste, /readClipboard\(limits\.maxWidth, limits\.maxHeight\)/)
    assert.match(paste, /tryReadImageFromPath\([\s\S]*limits: ImageLimits/)
    const pasteHook = read('hooks/usePasteHandler.ts')
    assert.match(pasteHook, /getImageFromClipboard\(getCurrentImageLimits\(\)\)/)
    assert.match(pasteHook, /tryReadImageFromPath\(path, imageLimits\)/)
    const attachments = read('utils/attachments.ts')
    assert.match(
      attachments,
      /getImageLimits\(toolUseContext\.options\.mainLoopModel\)/,
    )
    const repl = read('screens/REPL.tsx')
    assert.match(
      repl,
      /getQueuedCommandAttachments\([^,]+,\s*getImageLimits\(mainLoopModel\)\)/,
    )

    const callPathOwners = [
      'utils/processUserInput/processUserInput.ts',
      'utils/attachments.ts',
      'tools/FileReadTool/FileReadTool.ts',
      'tools/BashTool/BashTool.tsx',
      'tools/PowerShellTool/PowerShellTool.tsx',
      'services/mcp/client.ts',
      'services/api/claude.ts',
      'query.ts',
      'components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx',
      'components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
    ]
    for (const owner of callPathOwners) {
      assert.match(
        read(owner),
        /get(?:Current)?ImageLimits/,
        `${owner} selects dynamic image limits`,
      )
    }
  },
)
