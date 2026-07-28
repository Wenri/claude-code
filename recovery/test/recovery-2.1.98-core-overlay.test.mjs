import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const TARGET_BUNDLE_SHA256 =
  '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556'
const PERFORCE_ERROR =
  'File is read-only — it has not been opened for edit in Perforce. Run `p4 edit <file>` to check it out, then retry. Do not chmod the file writable; that bypasses Perforce tracking.'
const PERFORCE_CONTEXT =
  'This is a Perforce workspace. Files not yet opened for edit are read-only; if a file is read-only, run `p4 edit <file>` via Bash to check it out before modifying. Files that are already writable have been opened and can be edited directly.'

function source(relativePath) {
  return fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('recovers Perforce read-only enforcement and workspace context', () => {
  const file = source('utils/file.ts')
  const edit = source('tools/FileEditTool/FileEditTool.ts')
  const write = source('tools/FileWriteTool/FileWriteTool.ts')
  const notebook = source('tools/NotebookEditTool/NotebookEditTool.ts')
  const context = source('context.ts')

  assert.match(
    file,
    /isPerforceMode\(\)[\s\S]*?CLAUDE_CODE_PERFORCE_MODE[\s\S]*?isPerforceReadOnly\(mode: number\)[\s\S]*?\(mode & 128\) === 0/,
  )
  assert.ok(file.includes(PERFORCE_ERROR))
  assert.match(
    edit,
    /const \{ size, mode \} = await fs\.stat\(fullFilePath\)[\s\S]*?isPerforceReadOnly\(mode\)[\s\S]*?behavior: 'ask'[\s\S]*?errorCode: 11/,
  )
  assert.match(
    write,
    /const fileStat = await fs\.stat\(fullFilePath\)[\s\S]*?isPerforceReadOnly\(fileStat\.mode\)[\s\S]*?errorCode: 6/,
  )
  assert.match(
    notebook,
    /if \(isPerforceMode\(\)\)[\s\S]*?await getFsImplementation\(\)\.stat\(fullPath\)[\s\S]*?isPerforceReadOnly\(mode\)[\s\S]*?errorCode: 11/,
  )
  assert.ok(context.includes(PERFORCE_CONTEXT))
})

test('recovers LSP client identity', () => {
  const lsp = source('services/lsp/LSPServerInstance.ts')
  assert.match(
    lsp,
    /processId: process\.pid,\s*clientInfo: \{\s*name: 'Claude Code',\s*version: MACRO\.VERSION,\s*\}/,
  )
})

test('recovers compact-disabled context sizing and UI wording', () => {
  const context = source('utils/context.ts')
  const assistant = source('components/messages/AssistantTextMessage.tsx')
  const warning = source('components/TokenWarning.tsx')
  const suggestions = source('utils/contextSuggestions.ts')

  assert.match(
    context,
    /process\.env\.USER_TYPE === 'ant' \|\|\s*isEnvTruthy\(process\.env\.DISABLE_COMPACT\)\) &&\s*process\.env\.CLAUDE_CODE_MAX_CONTEXT_TOKENS/,
  )
  assert.match(
    assistant,
    /isEnvTruthy\(process\.env\.DISABLE_COMPACT\)\s*\?\s*"\/clear to continue"\s*:\s*"\/compact or \/clear to continue"/,
  )
  assert.match(
    warning,
    /isEnvTruthy\(process\.env\.DISABLE_COMPACT\)\s*\?\s*`Context low \(\$\{percentLeft\}% remaining\)`\s*:\s*`Context low \(\$\{percentLeft\}% remaining\) \\u00b7 Run \/compact to compact & continue`/,
  )
  assert.match(
    suggestions,
    /isEnvTruthy\(process\.env\.DISABLE_COMPACT\)\s*\?\s*'Compaction is disabled\.'/,
  )
  assert.match(
    suggestions,
    /!data\.isAutoCompactEnabled &&\s*!isEnvTruthy\(process\.env\.DISABLE_COMPACT\)/,
  )
})

test('recovers uppercase shifted special-sequence input', () => {
  const inputEvent = source('ink/events/input-event.ts')
  assert.match(
    inputEvent,
    /processedAsSpecialSequence &&\s*key\.shift &&\s*!key\.ctrl &&\s*input\.length === 1 &&\s*input >= 'a' &&\s*input <= 'z'[\s\S]*?input = input\.toUpperCase\(\)/,
  )
})

test('authenticated adjacent bundles contain the recovered behavior', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_97_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_98_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  for (const marker of [
    'CLAUDE_CODE_PERFORCE_MODE',
    PERFORCE_ERROR,
    PERFORCE_CONTEXT,
    'clientInfo:{name:"Claude Code",version:',
    'Compaction is disabled.',
  ]) {
    assert.equal(baseline.includes(marker), false, marker)
    assert.equal(target.includes(marker), true, marker)
  }

  assert.equal(
    target.includes(
      'B6(process.env.DISABLE_COMPACT)&&process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS',
    ),
    true,
  )
  assert.match(
    target,
    /if\([A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\.shift&&![A-Za-z_$][\w$]*\.ctrl&&[A-Za-z_$][\w$]*\.length===1&&[A-Za-z_$][\w$]*>="a"&&[A-Za-z_$][\w$]*<="z"\)[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\.toUpperCase\(\)/,
  )
})
