#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

function freezeFile(file) {
  return Object.freeze({ ...file })
}

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    declarations: Object.freeze([...override.declarations]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET117_BASH_VALIDATION_INPUT_FILES = Object.freeze([
  freezeFile({
    path: 'src/tools/BashTool/sedValidation.ts',
    bytes: 21518,
    sha256:
      'a58dbb92c8a2e47f27af13cc910f02bb73236fb8262e2454677e3f64f908377f',
  }),
  freezeFile({
    path: 'src/tools/BashTool/readOnlyValidation.ts',
    bytes: 72817,
    sha256:
      'a79c3c5b1c2e6c2d427dee1d75915ecc01620cead09ed871b3f08212391192c6',
  }),
])

export const TARGET117_BASH_VALIDATION_OUTPUT_FILES = Object.freeze([
  freezeFile({
    path: 'src/tools/BashTool/sedValidation.ts',
    bytes: 23871,
    sha256:
      '79fa99e4dda57850c4e24abd5480b477195e0c9ff57dd86d730e92509b65820e',
  }),
  freezeFile({
    path: 'src/tools/BashTool/readOnlyValidation.ts',
    bytes: 74164,
    sha256:
      'e8d233285754a276b85cd51e3c312bc6ba811d85e1b1788ca7fc562b7e243d1a',
  }),
])

const TARGET_FRAGMENT_EVIDENCE = 'target117-bash-validation-target-fragment'
const REPLAY_EVIDENCE = 'target117-bash-validation-source-replay-test'

export const TARGET117_BASH_VALIDATION_OWNER_OVERRIDES = Object.freeze([
  freezeOverride({
    key: `${CASE_NAME}:10848`,
    targetIndex: 10848,
    paths: ['src/tools/BashTool/sedValidation.ts'],
    declarations: [
      'sedCommandIsAllowedByAllowlist',
      'extractInPlaceSedExpression',
    ],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The Target117 sed validator applies the authenticated in-place script denylist to the extracted -i expression, rejecting alternate commands, addresses, traversal, separators, bracket syntax, and backslash tricks.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:10850`,
    targetIndex: 10850,
    paths: ['src/tools/BashTool/sedValidation.ts'],
    declarations: ['extractInPlaceSedExpression'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The Target117 helper recognizes -i and combined -E/-r/-i forms, then extracts either the following script or the explicit -e/--expression value while skipping later edit flags fail closed.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:10878`,
    targetIndex: 10878,
    paths: ['src/tools/BashTool/readOnlyValidation.ts'],
    declarations: ['isCommandReadOnly'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The Target117 read-only classifier strips quotes and backslashes from candidate find commands before rejecting all authenticated mutating find predicates.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:10885`,
    targetIndex: 10885,
    paths: ['src/tools/BashTool/readOnlyValidation.ts'],
    declarations: ['COMMAND_ALLOWLIST'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The Target117 test-command policy admits the authenticated file-newer, file-older, and same-file binary operators while rejecting variable/reference/boolean operators and bracket-bearing operands.',
  }),
])

const SED_IMPORT_INPUT =
  `import { splitCommand_DEPRECATED } from '../../utils/bash/commands.js'`
const SED_IMPORT_OUTPUT = `import {
  parseCommandArguments,
  splitCommand_DEPRECATED,
} from '../../utils/bash/commands.js'`

const SED_HELPER_ANCHOR = `/**
 * Checks if a sed command is allowed by the allowlist.`
const SED_HELPER_OUTPUT = `/**
 * Extract the script operand from an in-place sed command. Returns null for
 * commands without -i, missing scripts, and backup-suffix forms whose next
 * token cannot be authenticated as a script.
 */
function extractInPlaceSedExpression(command: string): string | null {
  const tokens = parseCommandArguments(command)
  if (tokens[0] !== 'sed') return null
  const args = tokens.slice(1)
  let editFlagIndex = -1
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '-i' || /^-[Er]+i$/.test(argument!)) {
      editFlagIndex = index
      break
    }
  }
  if (editFlagIndex === -1) return null
  const candidate = args[editFlagIndex + 1]
  if (candidate === undefined) return null
  if (candidate === '' || candidate.startsWith('.') || candidate.startsWith('-')) {
    return null
  }
  for (let index = editFlagIndex + 2; index < args.length; index++) {
    const argument = args[index]!
    if (argument === '-e' || argument === '--expression') {
      return args[index + 1] ?? null
    }
    if (argument.startsWith('--expression=')) return argument.slice(13)
    if (argument === '-i' || /^-[Er]+i$/.test(argument)) {
      index++
      continue
    }
    if (argument.startsWith('-')) continue
    return argument
  }
  return null
}

${SED_HELPER_ANCHOR}`

const SED_GUARD_INPUT = `  // Defense-in-depth: Even if allowlist matches, check denylist
  for (const expr of expressions) {
    if (containsDangerousOperations(expr)) {
      return false
    }
  }

  return true`
const SED_GUARD_OUTPUT = `  // Defense-in-depth: Even if allowlist matches, check denylist
  for (const expr of expressions) {
    if (containsDangerousOperations(expr)) {
      return false
    }
  }

  const inPlaceExpression = extractInPlaceSedExpression(command)
  if (inPlaceExpression !== null) {
    if (containsDangerousOperations(inPlaceExpression)) return false
    const script = inPlaceExpression.trimStart()
    if (/^[sy][^a-zA-Z0-9]/.test(script)) return false
    if (/^[\\\\$:={]/.test(script)) return false
    if (/^\\d+[ \\t]*[,!~=aAcCdDegGhHiIlnNpPqQrRsStTwWxyz]/.test(script)) {
      return false
    }
    if (/^[aAcCdDgGhHiIlnNpPqQtTwWxz=]([\\s\\\\;]|$)/.test(script)) return false
    if (/^[rR]([\\s\\\\;/]|\\.{1,2}\\/|$)/.test(script)) return false
    if (
      /^\\/(?:[^/\\\\]|\\\\.)*\\/[IMim]*[ \\t]*([aAcCdDgGhHiIlnNpPqQtTwWxz=]([\\s\\\\;]|$)|[rR]([\\s\\\\;/]|\\.{1,2}\\/|$)|[sy][^a-zA-Z0-9]|[,!~])/.test(
        script,
      )
    ) {
      return false
    }
    const withoutRelativePrefix = script.replace(/^(\\.{1,2}\\/)+/, '')
    if (
      script.includes(';') ||
      script.includes('[') ||
      script.includes('\\\\') ||
      withoutRelativePrefix.includes('..')
    ) {
      return false
    }
  }

  return true`

const READ_ONLY_ALLOWLIST_INPUT = `  ...PYRIGHT_READ_ONLY_COMMANDS,
  ...DOCKER_READ_ONLY_COMMANDS,
}`
const READ_ONLY_ALLOWLIST_OUTPUT = `  ...PYRIGHT_READ_ONLY_COMMANDS,
  ...DOCKER_READ_ONLY_COMMANDS,
  test: {
    respectsDoubleDash: false,
    safeFlags: {
      '-b': 'string',
      '-c': 'string',
      '-d': 'string',
      '-e': 'string',
      '-f': 'string',
      '-g': 'string',
      '-G': 'string',
      '-h': 'string',
      '-k': 'string',
      '-L': 'string',
      '-N': 'string',
      '-O': 'string',
      '-p': 'string',
      '-r': 'string',
      '-s': 'string',
      '-S': 'string',
      '-t': 'string',
      '-u': 'string',
      '-w': 'string',
      '-x': 'string',
      '-z': 'string',
      '-n': 'string',
      '-eq': 'string',
      '-ne': 'string',
      '-lt': 'string',
      '-le': 'string',
      '-gt': 'string',
      '-ge': 'string',
      '-nt': 'string',
      '-ot': 'string',
      '-ef': 'string',
    },
    additionalCommandIsDangerousCallback: (_rawCommand, args) =>
      args.some(
        argument =>
          argument === '-v' ||
          argument === '-R' ||
          argument === '-a' ||
          argument === '-o' ||
          /\\[/.test(argument),
      ),
  },
}`

const FIND_GUARD_INPUT = `  for (const regex of READONLY_COMMAND_REGEXES) {
    if (regex.test(testCommand)) {
      // Prevent git commands with -c flag to avoid config options that can lead to code execution`
const FIND_GUARD_OUTPUT = `  for (const regex of READONLY_COMMAND_REGEXES) {
    if (regex.test(testCommand)) {
      if (testCommand.startsWith('find')) {
        const commandWithoutQuotes = testCommand.replace(/['"\\\\]/g, '')
        if (
          /-delete\\b|-exec\\b|-execdir\\b|-ok\\b|-okdir\\b|-fprint0?\\b|-fls\\b|-fprintf\\b/.test(
            commandWithoutQuotes,
          )
        ) {
          return false
        }
      }
      // Prevent git commands with -c flag to avoid config options that can lead to code execution`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function assertDescriptor(value, expected, label) {
  const actual = descriptor(value)
  if (!descriptorsEqual(actual, expected)) {
    throw new Error(
      `${label}: expected ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
    )
  }
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`${label}: expected exactly one input anchor`)
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

function transformSedValidation(input) {
  let source = input.toString('utf8')
  source = replaceExactlyOnce(
    source,
    SED_IMPORT_INPUT,
    SED_IMPORT_OUTPUT,
    'sed parser import',
  )
  source = replaceExactlyOnce(
    source,
    SED_HELPER_ANCHOR,
    SED_HELPER_OUTPUT,
    'in-place sed expression helper',
  )
  source = replaceExactlyOnce(
    source,
    SED_GUARD_INPUT,
    SED_GUARD_OUTPUT,
    'in-place sed script guard',
  )
  return Buffer.from(source)
}

function transformReadOnlyValidation(input) {
  let source = input.toString('utf8')
  source = replaceExactlyOnce(
    source,
    READ_ONLY_ALLOWLIST_INPUT,
    READ_ONLY_ALLOWLIST_OUTPUT,
    'test-command allowlist',
  )
  source = replaceExactlyOnce(
    source,
    FIND_GUARD_INPUT,
    FIND_GUARD_OUTPUT,
    'find mutation guard',
  )
  return Buffer.from(source)
}

const TRANSFORMS = Object.freeze({
  'src/tools/BashTool/sedValidation.ts': transformSedValidation,
  'src/tools/BashTool/readOnlyValidation.ts': transformReadOnlyValidation,
})

function sourceFilename(sourceRoot, sourcePath) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!sourcePath.startsWith('src/') || !filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: path escapes the supplied source root`)
  }
  return filename
}

export function applyTarget117BashValidationSourceRecovery({ sourceRoot } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const states = TARGET117_BASH_VALIDATION_INPUT_FILES.map((inputFile, index) => {
    const outputFile = TARGET117_BASH_VALIDATION_OUTPUT_FILES[index]
    const filename = sourceFilename(sourceRoot, inputFile.path)
    const input = fs.readFileSync(filename)
    const actual = descriptor(input)
    const state = descriptorsEqual(actual, outputFile)
      ? 'postimage'
      : descriptorsEqual(actual, inputFile)
        ? 'raw'
        : 'unknown'
    return { actual, filename, input, inputFile, outputFile, state }
  })

  if (states.every(state => state.state === 'postimage')) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides: TARGET117_BASH_VALIDATION_OWNER_OVERRIDES.length,
      files: TARGET117_BASH_VALIDATION_OUTPUT_FILES,
    })
  }
  if (!states.every(state => state.state === 'raw')) {
    const details = states
      .map(
        state =>
          `${state.inputFile.path}=${state.state}:${state.actual.bytes}/${state.actual.sha256}`,
      )
      .join(', ')
    throw new Error(`Refusing mixed or non-target Bash validation recovery: ${details}`)
  }

  const outputs = states.map(state => {
    const transform = TRANSFORMS[state.inputFile.path]
    const output = transform(state.input)
    assertDescriptor(output, state.outputFile, `recovered ${state.outputFile.path}`)
    return { ...state, output }
  })
  for (const state of outputs) fs.writeFileSync(state.filename, state.output)
  for (const state of outputs) {
    assertDescriptor(
      fs.readFileSync(state.filename),
      state.outputFile,
      `written ${state.outputFile.path}`,
    )
  }

  return Object.freeze({
    status: 'recovered',
    ownerOverrides: TARGET117_BASH_VALIDATION_OWNER_OVERRIDES.length,
    files: TARGET117_BASH_VALIDATION_OUTPUT_FILES,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  const result = applyTarget117BashValidationSourceRecovery({ sourceRoot })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
