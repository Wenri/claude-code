#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'

const TARGET_FRAGMENT_EVIDENCE =
  'target118-file-read-powershell-notebook-hint-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-file-read-powershell-notebook-hint-source-replay-test'
const SOURCE_AST_EVIDENCE =
  'target118-file-read-powershell-notebook-hint-source-ast-test'

export const TARGET118_FILE_READ_POWERSHELL_HINT_INPUT_FILE = Object.freeze({
  path: 'src/tools/FileReadTool/FileReadTool.ts',
  bytes: 39333,
  sha256: '9a8f121b3742deeca4b9867724811e445f6970bd6116eea86e45a8be38c665b9',
})

export const TARGET118_FILE_READ_POWERSHELL_HINT_OUTPUT_FILE = Object.freeze({
  path: 'src/tools/FileReadTool/FileReadTool.ts',
  bytes: 40020,
  sha256: '06af42c952e6578caf2a26210886af4f954824600a842804f8cbc41a8cff6864',
})

export const TARGET118_FILE_READ_POWERSHELL_HINT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:14262`,
      targetIndex: 14262,
      paths: Object.freeze(['src/tools/FileReadTool/FileReadTool.ts']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
        SOURCE_AST_EVIDENCE,
      ]),
      behavior:
        'Target118 FileReadTool selects the oversized-notebook read hint through isBashToolEnabled: Bash receives the existing jq commands, while PowerShell receives exact Get-Content and ConvertFrom-Json commands for leading cells, a bounded cell range, the cell count, and code-cell sources.',
    }),
  ])

const SHELL_GATE_IMPORT_ANCHOR =
  "import { semanticNumber } from '../../utils/semanticNumber.js'\n"
const SHELL_GATE_IMPORT =
  "import { isBashToolEnabled } from '../../utils/shell/shellToolUtils.js'\n"
const POWERSHELL_NAME_IMPORT_ANCHOR =
  "import { BASH_TOOL_NAME } from '../BashTool/toolName.js'\n"
const POWERSHELL_NAME_IMPORT =
  "import { POWERSHELL_TOOL_NAME } from '../PowerShellTool/toolName.js'\n"
const NOTEBOOK_BLOCK_START = '    if (cellsJsonBytes > maxSizeBytes) {'
const NOTEBOOK_BLOCK_END = '\n\n    await validateContentTokens(cellsJson, ext, maxTokens)'

const RECOVERED_NOTEBOOK_BLOCK = `    if (cellsJsonBytes > maxSizeBytes) {
      const readHint = isBashToolEnabled()
        ? \`Use \${BASH_TOOL_NAME} with jq to read specific portions:
  cat "\${file_path}" | jq '.cells[:20]' # First 20 cells
  cat "\${file_path}" | jq '.cells[100:120]' # Cells 100-120
  cat "\${file_path}" | jq '.cells | length' # Count total cells
  cat "\${file_path}" | jq '.cells[] | select(.cell_type=="code") | .source' # All code sources\`
        : \`Use \${POWERSHELL_TOOL_NAME} to read specific portions:
  Get-Content "\${file_path}" | ConvertFrom-Json | Select-Object -ExpandProperty cells | Select-Object -First 20
  Get-Content "\${file_path}" | ConvertFrom-Json | Select-Object -ExpandProperty cells | Select-Object -Skip 100 -First 20 # Cells 100-120
  (Get-Content "\${file_path}" | ConvertFrom-Json).cells.Count # Count total cells
  Get-Content "\${file_path}" | ConvertFrom-Json | Select-Object -ExpandProperty cells | Where-Object cell_type -eq code | Select-Object -ExpandProperty source\`
      throw new Error(
        \`Notebook content (\${formatFileSize(cellsJsonBytes)}) exceeds maximum allowed size (\${formatFileSize(maxSizeBytes)}). \${readHint}\`,
      )
    }`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function replaceOnce(input, before, after, label) {
  const start = input.indexOf(before)
  if (start < 0 || input.indexOf(before, start + before.length) >= 0) {
    throw new Error(`${CASE_NAME}: ${label} must occur exactly once`)
  }
  return input.slice(0, start) + after + input.slice(start + before.length)
}

export function buildTarget118FileReadPowerShellHintOutput(input) {
  let output = replaceOnce(
    input,
    SHELL_GATE_IMPORT_ANCHOR,
    SHELL_GATE_IMPORT_ANCHOR + SHELL_GATE_IMPORT,
    'FileReadTool shell-gate import anchor',
  )
  output = replaceOnce(
    output,
    POWERSHELL_NAME_IMPORT_ANCHOR,
    POWERSHELL_NAME_IMPORT_ANCHOR + POWERSHELL_NAME_IMPORT,
    'FileReadTool PowerShell-name import anchor',
  )
  const blockStart = output.indexOf(NOTEBOOK_BLOCK_START)
  const blockEnd = output.indexOf(NOTEBOOK_BLOCK_END, blockStart)
  if (
    blockStart < 0 ||
    output.indexOf(NOTEBOOK_BLOCK_START, blockStart + 1) >= 0 ||
    blockEnd < blockStart ||
    output.indexOf(NOTEBOOK_BLOCK_END, blockEnd + 1) >= 0
  ) {
    throw new Error(
      `${CASE_NAME}: FileReadTool oversized-notebook block must have exact unique boundaries`,
    )
  }
  return (
    output.slice(0, blockStart) +
    RECOVERED_NOTEBOOK_BLOCK +
    output.slice(blockEnd)
  )
}

export function applyTarget118FileReadPowerShellHintSourceRecovery({
  sourceRoot,
}) {
  const filename = path.join(
    sourceRoot,
    TARGET118_FILE_READ_POWERSHELL_HINT_INPUT_FILE.path.replace(/^src\//, ''),
  )
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    actual.bytes === TARGET118_FILE_READ_POWERSHELL_HINT_OUTPUT_FILE.bytes &&
    actual.sha256 === TARGET118_FILE_READ_POWERSHELL_HINT_OUTPUT_FILE.sha256
  ) {
    return { status: 'already-recovered', files: [] }
  }
  if (
    actual.bytes !== TARGET118_FILE_READ_POWERSHELL_HINT_INPUT_FILE.bytes ||
    actual.sha256 !== TARGET118_FILE_READ_POWERSHELL_HINT_INPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: FileReadTool PowerShell notebook-hint replay requires its exact raw or recovered source state`,
    )
  }
  const output = Buffer.from(
    buildTarget118FileReadPowerShellHintOutput(input.toString()),
  )
  const outputDescriptor = descriptor(output)
  if (
    outputDescriptor.bytes !==
      TARGET118_FILE_READ_POWERSHELL_HINT_OUTPUT_FILE.bytes ||
    outputDescriptor.sha256 !==
      TARGET118_FILE_READ_POWERSHELL_HINT_OUTPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: FileReadTool PowerShell notebook-hint replay output differs from its pinned postimage`,
    )
  }
  fs.writeFileSync(filename, output)
  return {
    status: 'recovered',
    files: [TARGET118_FILE_READ_POWERSHELL_HINT_INPUT_FILE.path],
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-file-read-powershell-notebook-hint-source-gap.mjs --source-root DIR',
    )
  }
  console.log(
    JSON.stringify(
      applyTarget118FileReadPowerShellHintSourceRecovery({ sourceRoot }),
      null,
      2,
    ),
  )
}
