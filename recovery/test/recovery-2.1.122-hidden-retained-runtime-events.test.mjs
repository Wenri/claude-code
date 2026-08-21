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

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function source(relative) {
  return compact(fs.readFileSync(path.join(repo, relative), 'utf8'))
}

test('authenticates retained SDK, image, and ultraplan events', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /tengu_sdk_control_roundtrip",\{subtype:[\w$]+\.subtype,duration_ms:Date\.now\(\)-[\w$]+,aborted:[\w$]+\?\.aborted\?\?!1\}/,
      `${release.version}: SDK control roundtrip`,
    )
    assert.match(
      bundle,
      /tengu_sdk_ttft",\{ttft_ms:[\w$]+-[\w$]+,model:String\([\w$]+\)\}/,
      `${release.version}: SDK TTFT`,
    )
    assert.match(
      bundle,
      /tengu_image_resize",\{over_byte_limit:!0,over_dimension_limit:!1,original_size_bytes:[\w$]+\}/,
      `${release.version}: unknown-dimension resize`,
    )
    assert.match(
      bundle,
      /tengu_image_resize",\{over_byte_limit:[\w$]+>[\w$]+\.targetRawSize,over_dimension_limit:[\w$]+,original_size_bytes:[\w$]+,original_width:[\w$]+,original_height:[\w$]+\}/,
      `${release.version}: measured resize`,
    )
    assert.match(
      bundle,
      /tengu_ultraplan_stopped",\{duration_ms:Date\.now\(\)-[\w$]+\}/,
      `${release.version}: ultraplan stop`,
    )
  }
})

test('source emits exact SDK control and first-assistant timings', () => {
  const io = source('src/cli/structuredIO.ts')
  for (const fragment of [
    "logEvent('tengu_sdk_control_roundtrip', {",
    'subtype: request.subtype',
    'duration_ms: Date.now() - startedAt',
    'aborted: signal?.aborted ?? false',
  ]) {
    assert.ok(io.includes(compact(fragment)), fragment)
  }

  const query = source('src/QueryEngine.ts')
  for (const fragment of [
    'if (!firstAssistantAt) firstAssistantAt = Date.now()',
    'if (!isApiError && firstAssistantAt)',
    "logEvent('tengu_sdk_ttft', {",
    'ttft_ms: firstAssistantAt - startTime',
    'model: String(mainLoopModel)',
  ]) {
    assert.ok(query.includes(compact(fragment)), fragment)
  }
})

test('source emits exact image resize and ultraplan stop outcomes', () => {
  const image = source('src/utils/imageResizer.ts')
  assert.equal(image.split("logEvent('tengu_image_resize', {").length - 1, 2)
  for (const fragment of [
    'over_byte_limit: originalSize > limits.targetRawSize',
    'over_dimension_limit: needsDimensionResize',
    'original_width: originalWidth',
    'original_height: originalHeight',
  ]) {
    assert.ok(image.includes(compact(fragment)), fragment)
  }

  const task = source('src/tasks/RemoteAgentTask/RemoteAgentTask.tsx')
  for (const fragment of [
    "logEvent('tengu_ultraplan_stopped', {",
    'duration_ms: Date.now() - pollStartedAt',
    'ultraplanSessionUrl: undefined',
    'ultraplanPendingChoice: undefined',
  ]) {
    assert.ok(task.includes(compact(fragment)), fragment)
  }
})
