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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target110 authenticates the complete SDK message protocol initializer',
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
    const region = structural.regions[8612]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        5810255,
        5847270,
        'VariableDeclaration',
        '3272a4ac17970ec6b6c2d9b6aee50314cf5781dca5688cce7e0bf8d2926e6996',
      ],
    )
    const targetUnit = targetBytes
      .toString('utf8')
      .slice(region.target.start, region.target.end)
    assert.equal(sha256(targetUnit), region.target.sourceHash)
    for (const fragment of [
      'literal("requesting")',
      'discriminatedUnion("kind"',
      'kind:y.literal("human")',
      'kind:y.literal("channel"),server:y.string()',
      'kind:y.literal("peer"),from:y.string(),name:y.string().optional()',
      'kind:y.literal("task-notification")',
      'kind:y.literal("coordinator")',
      'Provenance of a user-role message (peer session, team lead, channel). Absent or `human` means keyboard input from the user.',
      'When false, the message is appended to the transcript without triggering an assistant turn. It will be merged into the next user message that does query.',
      'file_attachments:y.array(y.unknown()).optional()',
      'api_error_status:y.number().nullable().optional()',
    ]) {
      assert.ok(targetUnit.includes(fragment), fragment)
    }
    const baseline = baselineBytes.toString('utf8')
    for (const introducedFragment of [
      'Provenance of a user-role message (peer session, team lead, channel). Absent or `human` means keyboard input from the user.',
      'When false, the message is appended to the transcript without triggering an assistant turn. It will be merged into the next user message that does query.',
      'api_error_status',
    ]) {
      assert.equal(baseline.includes(introducedFragment), false)
    }
  },
)

test(
  'source owns the exact runtime Zod graph for the target110 protocol',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'entrypoints/sdk/coreSchemas.ts'),
      'utf8',
    )
    for (const fragment of [
      "z.union([z.literal('compacting'), z.literal('requesting'), z.null()])",
      'export const SDKMessageOriginSchema = lazySchema(() =>',
      ".discriminatedUnion('kind', [",
      "z.object({ kind: z.literal('human') })",
      "z.object({ kind: z.literal('channel'), server: z.string() })",
      "kind: z.literal('peer')",
      "z.object({ kind: z.literal('task-notification') })",
      "z.object({ kind: z.literal('coordinator') })",
      'Provenance of a user-role message (peer session, team lead, channel). Absent or `human` means keyboard input from the user.',
      'origin: SDKMessageOriginSchema().optional()',
      'shouldQuery: z',
      'When false, the message is appended to the transcript without triggering an assistant turn. It will be merged into the next user message that does query.',
      'file_attachments: z.array(z.unknown()).optional()',
      'api_error_status: z.number().nullable().optional()',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }

    assert.ok(owner.indexOf('origin: SDKMessageOriginSchema().optional()') < owner.indexOf('shouldQuery: z'))
    assert.ok(owner.indexOf('shouldQuery: z') < owner.indexOf('timestamp: z'))
  },
)
