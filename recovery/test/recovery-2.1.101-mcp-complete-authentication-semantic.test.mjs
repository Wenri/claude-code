import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const semanticSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceTestOptions = {
  skip:
    semanticCase && semanticCase !== '2.1.100-to-2.1.101'
      ? `not applicable to ${semanticCase}`
      : false,
}

function source(relative) {
  const filename =
    semanticSourceRoot && relative.startsWith('src/')
      ? path.join(semanticSourceRoot, relative.slice('src/'.length))
      : path.join(repositoryRoot, relative)
  return fs.readFileSync(filename, 'utf8')
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
}

test('2.1.101 source owns complete_authentication and both needs-auth callers', sourceTestOptions, () => {
  assertFragments('src/tools/McpAuthTool/McpAuthTool.ts', [
    'createMcpCompleteAuthenticationTool',
    "buildMcpToolName(serverName, 'complete_authentication')",
    "toolName: 'complete_authentication'",
    'callback_url: z.string().describe(',
    "callback.searchParams.has('code')",
    "callback.searchParams.has('error')",
    'No OAuth flow is in progress for ${serverName}',
    'Invalid callback URL: missing authorization code.',
    'Authentication complete for ${serverName}.',
    'error instanceof AuthenticationCancelledError',
  ])
  assertFragments('src/services/mcp/client.ts', [
    'createMcpCompleteAuthenticationTool,',
    'createMcpCompleteAuthenticationTool(name)',
  ])
  assertFragments('src/services/mcp/auth.ts', [
    'onWaitingForCallback?: (submit: (callbackUrl: string) => void) => void',
    'Received auth code via manual callback URL',
  ])
})

const targetBundle = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const targetUnits = [
  [8478, 6775798, 6775832, '54459e6da6f83ce51e4bd6ddc6b49429868025ac4152920d9c0b180254396c84'],
  [8479, 6775832, 6775912, '5cf832165545b5fbaf31a9c7298bc4e326f86dd5f163de19c7fafbf7b0d4b311'],
  [8480, 6775912, 6775946, 'dab36035a7591787a17e0e254e4854c53270f224d4131fb9f3bf31049907e354'],
  [8487, 6781481, 6786887, '2941d4539868191e69dce224155aa497dbcb99e512040c161efd4220c20d9b9d'],
  [8496, 6801801, 6801848, 'bf22033f490118b67fbdad0f53b1818edc6abade9d1c989d60bacbaa98c7e254'],
  [8497, 6801848, 6802282, '5e907c44a30566bfd94332d865c377d743fd9df3d1e997d0afd21d0454a45246'],
  [8498, 6802282, 6802357, '943790f70cf6ec2a57863d51b6098af5b554d565093a74a021ed6ce8d11c1075'],
  [8500, 6802406, 6802538, '895347c5df9b437b5b7ef1cdd9c810a3168b919718f91679e3137961948d89ff'],
  [8501, 6802538, 6805535, 'e3483864de653c64544f41713db1dc8d3aeac95c1ca925f539e1abd6ac6d312b'],
  [8502, 6805535, 6807546, 'ca2634e8e57112383d5f1aa7cd3e43930da5c35aade25f5c8b0e422aa1db41c8'],
  [8504, 6807558, 6807838, 'cd54bd87ac8807fb87c4db409e6095eac2953ac592d7f8e5bb59ad97ef6e9766'],
  [8883, 6945027, 6962749, 'cd2e244ddfba3aa8fe3d51512d7f638211d0e03cd1042f235e918062d24c2d51'],
]

test(
  '2.1.101 authenticated target pins the complete_authentication runtime units',
  { skip: targetBundle ? false : 'CLAUDE_CODE_2_1_101_BUNDLE not provided' },
  () => {
    const bundle = fs.readFileSync(targetBundle, 'utf8')
    assert.equal(
      crypto.createHash('sha256').update(bundle).digest('hex'),
      'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
    )
    for (const [index, start, end, expectedHash] of targetUnits) {
      const unit = bundle.slice(start, end)
      assert.equal(
        crypto.createHash('sha256').update(unit).digest('hex'),
        expectedHash,
        `target structural unit ${index}`,
      )
      assert.equal(
        parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
        1,
        `target structural unit ${index} must remain one AST statement`,
      )
    }
  },
)
