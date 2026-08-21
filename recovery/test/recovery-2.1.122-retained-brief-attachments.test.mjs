import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

const objectDescription =
  'A file already uploaded to the filestore (e.g. by the device attach_file tool). Passed through without local stat or upload.'
const attachmentsDescription =
  'Optional attachments for the user to see alongside your message. Each entry is either a file path (absolute or relative to cwd) for a file you can read locally, or a pre-resolved {file_uuid, file_name, size, is_image} object you obtained from a device tool such as attach_file.'

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

test('authenticated adjacent bundles retain pre-resolved Brief attachments', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const fragment of [objectDescription, attachmentsDescription]) {
      assert.ok(bundle.includes(fragment), `${release.version}: ${fragment}`)
    }
    assert.match(
      bundle,
      /strictObject\(\{file_uuid:[\w$]+\.string\(\),file_name:[\w$]+\.string\(\),size:[\w$]+\.number\(\),is_image:[\w$]+\.boolean\(\)\}\)/,
      `${release.version}: strict pre-resolved schema`,
    )
    assert.match(
      bundle,
      /typeof [\w$]+!=="string"/,
      `${release.version}: object discriminator`,
    )
    assert.match(
      bundle,
      /push\(\{path:[\w$]+\.file_name,size:[\w$]+\.size,isImage:[\w$]+\.is_image,file_uuid:[\w$]+\.file_uuid\}\);continue/,
      `${release.version}: object bypasses filesystem resolution`,
    )
    assert.match(
      bundle,
      /replBridgeEnabled\|\|[\w$]+\(process\.env\.CLAUDE_CODE_BRIEF_UPLOAD\)\|\|!!process\.env\.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE/,
      `${release.version}: remote upload gate`,
    )
  }
})

test('source reconstructs schema, bypass, and path-only upload behavior', () => {
  const tool = fs.readFileSync(
    path.join(repo, 'src/tools/BriefTool/BriefTool.ts'),
    'utf8',
  )
  const attachments = fs.readFileSync(
    path.join(repo, 'src/tools/BriefTool/attachments.ts'),
    'utf8',
  )
  const compactTool = tool.replaceAll(/\s+/g, ' ')
  for (const fragment of [
    'file_uuid: z.string()',
    'file_name: z.string()',
    'size: z.number()',
    'is_image: z.boolean()',
    objectDescription,
    attachmentsDescription,
  ]) {
    assert.ok(tool.includes(fragment), fragment)
  }
  assert.ok(
    compactTool.includes('.array(z.union([z.string(), preResolvedAttachmentSchema()]))'),
    'attachments union schema',
  )
  for (const fragment of [
    "return typeof attachment !== 'string'",
    'if (isPreResolvedAttachment(attachment)) continue',
    'path: attachment.file_name',
    'size: attachment.size',
    'isImage: attachment.is_image',
    'file_uuid: attachment.file_uuid',
    'uploadIndices.push(stated.length)',
    'if (uploadIndices.length === 0) return stated',
    'Boolean(process.env.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE)',
    'uploadIndices.map(index =>',
  ]) {
    assert.ok(attachments.includes(fragment), fragment)
  }
})
