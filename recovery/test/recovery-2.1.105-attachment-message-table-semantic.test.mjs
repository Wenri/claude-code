import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const unit = [
  13372,
  10045913,
  10051284,
  '48d35ceb96d37a01571f5d12c3767f4b5253c9bad438574a306711ace6f5a0c2',
]

const tableProperties = [
  'directory',
  'edited_text_file',
  'compact_file_reference',
  'pdf_reference',
  'selected_lines_in_ide',
  'opened_file_in_ide',
  'plan_file_reference',
  'nested_memory',
  'agent_mention',
  'skill_listing',
  'output_style',
  'critical_system_reminder',
  'plan_mode_exit',
  'auto_mode_exit',
  'token_usage',
  'budget_usd',
  'output_token_usage',
  'hook_blocking_error',
  'hook_additional_context',
  'hook_stopped_continuation',
  'date_change',
  'ultrathink_effort',
  'dynamic_skill',
  'already_read_file',
  'command_permissions',
  'edited_image_file',
  'hook_cancelled',
  'hook_error_during_execution',
  'hook_non_blocking_error',
  'hook_system_message',
  'hook_permission_decision',
  'hook_deferred_tool',
  'structured_output',
  'max_turns_reached',
  'current_session_memory',
  'teammate_shutdown_batch',
]

const noOpProperties = [
  'already_read_file',
  'command_permissions',
  'edited_image_file',
  'hook_cancelled',
  'hook_error_during_execution',
  'hook_non_blocking_error',
  'hook_system_message',
  'structured_output',
  'hook_permission_decision',
  'hook_deferred_tool',
  'max_turns_reached',
  'current_session_memory',
  'teammate_shutdown_batch',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target105 pins the compiled attachment-normalizer dispatch table',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const [index, start, end, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    const table = target.slice(start, end)
    assert.equal(sha256(table), hash)
    for (const property of tableProperties) {
      assert.ok(table.includes(`${property}:`), property)
    }
    assert.equal(baseline.includes('edited_text_file:'), false)
    assert.equal(
      baseline.includes(
        'structured_output:()=>[],max_turns_reached:()=>[],current_session_memory:()=>[],teammate_shutdown_batch:()=>[]',
      ),
      false,
    )
    assert.ok(
      table.includes(
        'structured_output:()=>[],max_turns_reached:()=>[],current_session_memory:()=>[],teammate_shutdown_batch:()=>[]',
      ),
    )
    for (const fragment of [
      'was modified, either by the user or by a linter',
      'too large to include',
      'Maximum 20 pages per request.',
      'The user selected the lines',
      'The user opened the file',
      'A plan file exists from plan mode at:',
      'The following skills are available for use with the Skill tool:',
      'The date has changed.',
      'The user has requested reasoning effort level:',
    ]) {
      assert.ok(table.includes(fragment), fragment)
    }
  },
)

test(
  'authored normalizer represents every compiled handler and all no-op cases',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const messages = source('utils/messages.ts')
    const start = messages.indexOf('export function normalizeAttachmentForAPI')
    const end = messages.indexOf(
      '\nconst MAX_STORED_ORIGINAL_FILE_CHARS',
      start,
    )
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const normalizer = messages.slice(start, end)
    const cases = new Set(
      [...normalizer.matchAll(/case '([^']+)'/g)].map(match => match[1]),
    )
    for (const property of tableProperties) {
      if (property === 'dynamic_skill') {
        assert.ok(cases.has(property))
        continue
      }
      assert.ok(cases.has(property), property)
    }

    const noOpStart = normalizer.indexOf("case 'already_read_file':")
    const noOpEnd = normalizer.indexOf('return []', noOpStart)
    assert.notEqual(noOpStart, -1)
    assert.notEqual(noOpEnd, -1)
    const noOps = normalizer.slice(noOpStart, noOpEnd)
    for (const property of noOpProperties) {
      assert.ok(noOps.includes(`case '${property}':`), property)
    }
    for (const fragment of [
      'was modified, either by the user or by a linter',
      'too large to include',
      'Maximum 20 pages per request.',
      'The user selected the lines',
      'The user opened the file',
      'A plan file exists from plan mode at:',
      'The following skills are available for use with the Skill tool:',
      'The date has changed.',
      'The user has requested reasoning effort level:',
    ]) {
      assert.ok(normalizer.includes(fragment), fragment)
    }
  },
)

test(
  'target116 retains the dispatch table and its terminal no-op handlers',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.ok(latest.includes('edited_text_file:'))
    assert.ok(
      latest.includes(
        'structured_output:()=>[],max_turns_reached:()=>[],current_session_memory:()=>[],teammate_shutdown_batch:()=>[]',
      ),
    )
  },
)
