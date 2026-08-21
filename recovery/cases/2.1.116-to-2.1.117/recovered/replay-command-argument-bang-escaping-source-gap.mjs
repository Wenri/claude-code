#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

function freezeFile(file) {
  return Object.freeze({ ...file })
}

export const TARGET117_COMMAND_ARGUMENT_BANG_INPUT_FILES = Object.freeze([
  freezeFile({
    path: 'src/utils/argumentSubstitution.ts',
    bytes: 5079,
    sha256: 'b9ba476d55e6099af7cc2878e80ee82fa992dadd316d617bd2f8b23fea7ec803',
  }),
  freezeFile({
    path: 'src/utils/plugins/loadPluginCommands.ts',
    bytes: 31612,
    sha256: 'd3591a31416197cd1d209016f40ebb3b53a09d8775098a0e8bb518285e0e0256',
  }),
  freezeFile({
    path: 'src/skills/loadSkillsDir.ts',
    bytes: 35009,
    sha256: '9830c1368c75b598654993ee32090c6f31ddef932e510907ffc12c2bf60b79df',
  }),
])

export const TARGET117_COMMAND_ARGUMENT_BANG_OUTPUT_FILES = Object.freeze([
  freezeFile({
    path: 'src/utils/argumentSubstitution.ts',
    bytes: 5694,
    sha256: '9815527c59ed7a4fbe71b1c15881b88201af2d811dc75f7e86062200c62f933d',
  }),
  freezeFile({
    path: 'src/utils/plugins/loadPluginCommands.ts',
    bytes: 31692,
    sha256: '91f6c949a931e85d918a86b2ff41399f821b7b367150915ea9f1b4e759aed6d4',
  }),
  freezeFile({
    path: 'src/skills/loadSkillsDir.ts',
    bytes: 35087,
    sha256: '6453d1b5a62756eefd715b8bab192f45e256cb646473b93e5d9fe0cf76424691',
  }),
])

const TARGET_FRAGMENT_EVIDENCE =
  'target117-command-argument-bang-target-fragment'
const REPLAY_EVIDENCE = 'target117-command-argument-bang-source-replay-test'

export const TARGET117_COMMAND_ARGUMENT_BANG_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:8978`,
    targetIndex: 8978,
    paths: Object.freeze(['src/utils/argumentSubstitution.ts']),
    declarations: Object.freeze([
      'escapeBangForCommandSubstitution',
      'substituteArguments',
    ]),
    evidenceIds: Object.freeze([TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE]),
    behavior:
      'Target117 sanitizes every plugin-command and skill argument replacement before inline shell-command expansion: bang/backtick adjacency is separated and line-leading bang syntax is escaped. The source-map memoryAge owner is rejected.',
  }),
])

const SIGNATURE_INPUT = `export function substituteArguments(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
): string {`
const SIGNATURE_OUTPUT = `export function substituteArguments(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
  transformArgument?: (value: string) => string,
): string {`

const GUARD_INPUT = `  if (args === undefined || args === null) {
    return content
  }

  const parsedArgs = parseArguments(args)`
const GUARD_OUTPUT = `  if (args === undefined || args === null) {
    return content
  }

  const transform = (value: string | undefined): string => {
    const normalized = value ?? ''
    return transformArgument ? transformArgument(normalized) : normalized
  }
  const parsedArgs = parseArguments(args)`

const NAMED_REPLACEMENT_INPUT = `      parsedArgs[i] ?? '',`
const NAMED_REPLACEMENT_OUTPUT = `      () => transform(parsedArgs[i]),`
const INDEXED_REPLACEMENT_INPUT = `    return parsedArgs[index] ?? ''`
const INDEXED_REPLACEMENT_OUTPUT = `    return transform(parsedArgs[index])`
const ALL_ARGUMENTS_INPUT = `  content = content.replaceAll('$ARGUMENTS', args)`
const ALL_ARGUMENTS_OUTPUT =
  `  content = content.replaceAll('$ARGUMENTS', () => transform(args))`
const APPEND_INPUT = `    content = content + \`\\n\\nARGUMENTS: \${args}\``
const APPEND_OUTPUT = `    content = content + \`\\n\\nARGUMENTS: \${transform(args)}\``
const FUNCTION_TAIL_INPUT = `  return content
}`
const FUNCTION_TAIL_OUTPUT = `  return content
}

/**
 * Keep substituted command arguments from becoming inline shell directives.
 * Target117 applies this only to plugin-command and skill prompt expansion.
 */
export function escapeBangForCommandSubstitution(value: string): string {
  return value
    .replace(/\`!/g, '\` !')
    .replace(/!\`/g, '! \`')
    .replace(/(^|\\s)!/gm, '$1\\\\!')
}`

const PLUGIN_IMPORT_INPUT = `import {
  parseArgumentNames,
  substituteArguments,
} from '../argumentSubstitution.js'`
const PLUGIN_IMPORT_OUTPUT = `import {
  escapeBangForCommandSubstitution,
  parseArgumentNames,
  substituteArguments,
} from '../argumentSubstitution.js'`
const SKILL_IMPORT_INPUT = `import {
  parseArgumentNames,
  substituteArguments,
} from '../utils/argumentSubstitution.js'`
const SKILL_IMPORT_OUTPUT = `import {
  escapeBangForCommandSubstitution,
  parseArgumentNames,
  substituteArguments,
} from '../utils/argumentSubstitution.js'`
const PLUGIN_CALL_INPUT = `        finalContent = substituteArguments(
          finalContent,
          args,
          true,
          argumentNames,
        )`
const PLUGIN_CALL_OUTPUT = `        finalContent = substituteArguments(
          finalContent,
          args,
          true,
          argumentNames,
          escapeBangForCommandSubstitution,
        )`
const SKILL_CALL_INPUT = `      finalContent = substituteArguments(
        finalContent,
        args,
        true,
        argumentNames,
      )`
const SKILL_CALL_OUTPUT = `      finalContent = substituteArguments(
        finalContent,
        args,
        true,
        argumentNames,
        escapeBangForCommandSubstitution,
      )`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function replaceExactCount(source, before, after, expectedCount, label) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(before, offset)) !== -1) {
    count++
    offset += before.length
  }
  if (count !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} input anchor(s), got ${count}`)
  }
  return source.split(before).join(after)
}

function transformArgumentSubstitution(input) {
  let source = input.toString('utf8')
  source = replaceExactCount(
    source,
    SIGNATURE_INPUT,
    SIGNATURE_OUTPUT,
    1,
    'argument transform signature',
  )
  source = replaceExactCount(
    source,
    GUARD_INPUT,
    GUARD_OUTPUT,
    1,
    'argument transform wrapper',
  )
  source = replaceExactCount(
    source,
    NAMED_REPLACEMENT_INPUT,
    NAMED_REPLACEMENT_OUTPUT,
    1,
    'named argument replacement',
  )
  source = replaceExactCount(
    source,
    INDEXED_REPLACEMENT_INPUT,
    INDEXED_REPLACEMENT_OUTPUT,
    2,
    'indexed argument replacements',
  )
  source = replaceExactCount(
    source,
    ALL_ARGUMENTS_INPUT,
    ALL_ARGUMENTS_OUTPUT,
    1,
    'whole argument replacement',
  )
  source = replaceExactCount(
    source,
    APPEND_INPUT,
    APPEND_OUTPUT,
    1,
    'appended argument replacement',
  )
  source = replaceExactCount(
    source,
    FUNCTION_TAIL_INPUT,
    FUNCTION_TAIL_OUTPUT,
    1,
    'bang sanitizer declaration',
  )
  return Buffer.from(source)
}

function transformPluginLoader(input) {
  let source = input.toString('utf8')
  source = replaceExactCount(
    source,
    PLUGIN_IMPORT_INPUT,
    PLUGIN_IMPORT_OUTPUT,
    1,
    'plugin loader bang sanitizer import',
  )
  source = replaceExactCount(
    source,
    PLUGIN_CALL_INPUT,
    PLUGIN_CALL_OUTPUT,
    1,
    'plugin loader sanitized argument call',
  )
  return Buffer.from(source)
}

function transformSkillLoader(input) {
  let source = input.toString('utf8')
  source = replaceExactCount(
    source,
    SKILL_IMPORT_INPUT,
    SKILL_IMPORT_OUTPUT,
    1,
    'skill loader bang sanitizer import',
  )
  source = replaceExactCount(
    source,
    SKILL_CALL_INPUT,
    SKILL_CALL_OUTPUT,
    1,
    'skill loader sanitized argument call',
  )
  return Buffer.from(source)
}

const TRANSFORMS = Object.freeze({
  'src/utils/argumentSubstitution.ts': transformArgumentSubstitution,
  'src/utils/plugins/loadPluginCommands.ts': transformPluginLoader,
  'src/skills/loadSkillsDir.ts': transformSkillLoader,
})

function sourceFilename(sourceRoot, sourcePath) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!sourcePath.startsWith('src/') || !filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: path escapes the supplied source root`)
  }
  return filename
}

export function applyTarget117CommandArgumentBangSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const states = TARGET117_COMMAND_ARGUMENT_BANG_INPUT_FILES.map(
    (inputFile, index) => {
      const outputFile = TARGET117_COMMAND_ARGUMENT_BANG_OUTPUT_FILES[index]
      const filename = sourceFilename(sourceRoot, inputFile.path)
      const input = fs.readFileSync(filename)
      const actual = descriptor(input)
      const state = descriptorsEqual(actual, outputFile)
        ? 'postimage'
        : descriptorsEqual(actual, inputFile)
          ? 'raw'
          : 'unknown'
      return { actual, filename, input, inputFile, outputFile, state }
    },
  )

  if (states.every(state => state.state === 'postimage')) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides: TARGET117_COMMAND_ARGUMENT_BANG_OWNER_OVERRIDES.length,
      files: TARGET117_COMMAND_ARGUMENT_BANG_OUTPUT_FILES,
    })
  }
  if (!states.every(state => state.state === 'raw')) {
    const detail = states
      .map(
        state =>
          `${state.inputFile.path}=${state.state}:${state.actual.bytes}/${state.actual.sha256}`,
      )
      .join(', ')
    throw new Error(
      `Refusing mixed or non-target command-argument bang recovery: ${detail}`,
    )
  }

  const outputs = states.map(state => {
    const output = TRANSFORMS[state.inputFile.path](state.input)
    const actual = descriptor(output)
    if (!descriptorsEqual(actual, state.outputFile)) {
      throw new Error(
        `Recovered ${state.outputFile.path}: expected ${state.outputFile.bytes}/${state.outputFile.sha256}, got ${actual.bytes}/${actual.sha256}`,
      )
    }
    return { ...state, output }
  })
  for (const state of outputs) fs.writeFileSync(state.filename, state.output)
  for (const state of outputs) {
    const actual = descriptor(fs.readFileSync(state.filename))
    if (!descriptorsEqual(actual, state.outputFile)) {
      throw new Error(
        `Written ${state.outputFile.path}: expected ${state.outputFile.bytes}/${state.outputFile.sha256}, got ${actual.bytes}/${actual.sha256}`,
      )
    }
  }

  return Object.freeze({
    status: 'recovered',
    ownerOverrides: TARGET117_COMMAND_ARGUMENT_BANG_OWNER_OVERRIDES.length,
    files: TARGET117_COMMAND_ARGUMENT_BANG_OUTPUT_FILES,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117CommandArgumentBangSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
