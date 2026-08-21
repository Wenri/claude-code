#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'
const SOURCE_PATH = 'src/tools/PowerShellTool/powershellPermissions.ts'

export const TARGET121_POWERSHELL_UNC_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 67606,
    sha256:
      'ed585012c3b30be5d1f9b0acab3c24685730522f35c5579c17bb040fbebc7fe2',
  }),
])

export const TARGET121_POWERSHELL_UNC_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 68130,
    sha256:
      '0df47f0a3809537fd44a72461732a9fafa2d0f3f18779eaf2c7ddc482b0ddaeb',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-powershell-resolved-unc-whole-unit-proof',
  'target121-powershell-resolved-unc-source-replay-test',
  'target121-powershell-resolved-unc-runtime-parity-test',
])

export const TARGET121_POWERSHELL_UNC_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:14622`,
    targetIndex: 14622,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze(['powershellToolHasPermission']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'PowerShell provider-path normalization treats only slash-prefixed one- or two-letter drive forms as colon parameters, and the resolved-argument scan asks on Windows when two or more adjacent slash/backslash separators form a non-URL UNC path. The complete Target121 permission unit differs from its predecessor in only these two nested helpers.',
  }),
])

export const TARGET121_POWERSHELL_UNC_EVIDENCE_IDS = EVIDENCE_IDS

const RAW_PLATFORM_IMPORT =
  "import { isCurrentDirectoryBareGitRepo } from '../../utils/git.js'"
const RECOVERED_PLATFORM_IMPORT = `${RAW_PLATFORM_IMPORT}
import { getPlatform } from '../../utils/platform.js'`

const RAW_EXTRACT_PROVIDER_PATH = `  function extractProviderPathFromArg(arg: string): string {
    // Handle colon parameter syntax: -Path:env:HOME → extract 'env:HOME'.
    // SECURITY: PowerShell's tokenizer accepts en-dash/em-dash/horizontal-bar
    // (U+2013/2014/2015) as parameter prefixes. \`–Path:env:HOME\` (en-dash)
    // must also strip the \`–Path:\` prefix or NON_FS_PROVIDER_PATTERN won't
    // match (pattern is \`^(env|...):\` which fails on \`–Path:env:...\`).
    let s = arg
    if (s.length > 0 && PS_TOKENIZER_DASH_CHARS.has(s[0]!)) {
      const colonIdx = s.indexOf(':', 1) // skip the leading dash
      if (colonIdx > 0) {
        s = s.substring(colonIdx + 1)
      }
    }
    // Strip backtick escapes before matching: \`Registry\`::HKLM\\...\` has a
    // backtick before \`::\` that the PS tokenizer removes at runtime but that
    // would otherwise prevent the ^-anchored pattern from matching.
    return s.replace(/\`/g, '')
  }`

const RECOVERED_EXTRACT_PROVIDER_PATH = `  function extractProviderPathFromArg(arg: string): string {
    // Handle colon parameter syntax: -Path:env:HOME → extract 'env:HOME'.
    // SECURITY: PowerShell's tokenizer accepts en-dash/em-dash/horizontal-bar
    // (U+2013/2014/2015) as parameter prefixes. \`–Path:env:HOME\` (en-dash)
    // must also strip the \`–Path:\` prefix or NON_FS_PROVIDER_PATTERN won't
    // match (pattern is \`^(env|...):\` which fails on \`–Path:env:...\`).
    let s = arg
    if (
      s.length > 0 &&
      (PS_TOKENIZER_DASH_CHARS.has(s[0]!) || s[0] === '/')
    ) {
      const colonIdx = s.indexOf(':', 1) // skip the leading dash
      if (
        colonIdx > 0 &&
        (s[0] !== '/' || /^\\/[A-Za-z]{1,2}:/.test(s))
      ) {
        s = s.substring(colonIdx + 1)
      }
    }
    // Strip backtick escapes before matching: \`Registry\`::HKLM\\...\` has a
    // backtick before \`::\` that the PS tokenizer removes at runtime but that
    // would otherwise prevent the ^-anchored pattern from matching.
    return s.replace(/\`/g, '')
  }`

const RAW_UNC_TAIL = `    if (containsVulnerableUncPath(value)) {
      return {
        behavior: 'ask',
        message: \`Command argument '\${arg}' contains a UNC path that could trigger network requests\`,
      }
    }
    return null`

const RECOVERED_UNC_TAIL = `    if (containsVulnerableUncPath(value)) {
      return {
        behavior: 'ask',
        message: \`Command argument '\${arg}' contains a UNC path that could trigger network requests\`,
      }
    }
    if (
      getPlatform() === 'windows' &&
      // eslint-disable-next-line custom-rules/no-lookbehind-regex -- .test() on a short resolved argument
      /(?<!:)[\\\\/]{2,}[^\\s\\\\/]/.test(value)
    ) {
      return {
        behavior: 'ask',
        message: \`Command argument '\${arg}' contains a UNC path that could trigger network requests\`,
      }
    }
    return null`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1
}

function replaceExactlyOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) {
    throw new Error(`${CASE_NAME}: ${label} expected one anchor, got ${count}`)
  }
  return source.replace(before, () => after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const root = fs.realpathSync(path.resolve(sourceRoot))
  const filename = path.resolve(root, sourcePath.replace(/^src\//, ''))
  const relative = path.relative(root, filename)
  if (
    !sourcePath.startsWith('src/') ||
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  if (fs.realpathSync(filename) !== filename) {
    throw new Error(`${sourcePath}: source path resolves through a symlink`)
  }
  return fs.readFileSync(filename)
}

export function buildTarget121PowerShellUncOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`${SOURCE_PATH} source must be a string`)
  }
  const withPlatform = replaceExactlyOnce(
    source,
    RAW_PLATFORM_IMPORT,
    RECOVERED_PLATFORM_IMPORT,
    'getPlatform import',
  )
  const withSlashDrive = replaceExactlyOnce(
    withPlatform,
    RAW_EXTRACT_PROVIDER_PATH,
    RECOVERED_EXTRACT_PROVIDER_PATH,
    'slash-prefixed drive normalization',
  )
  return replaceExactlyOnce(
    withSlashDrive,
    RAW_UNC_TAIL,
    RECOVERED_UNC_TAIL,
    'resolved UNC separator check',
  )
}

export function applyTarget121PowerShellUncSourceRecovery({ sourceRoot } = {}) {
  const input = TARGET121_POWERSHELL_UNC_INPUT_FILES[0]
  const output = TARGET121_POWERSHELL_UNC_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: PowerShell UNC replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121PowerShellUncOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: PowerShell UNC replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121PowerShellUncSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
