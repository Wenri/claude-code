#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_FILE_EDIT_UNICODE_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/tools/FileEditTool/utils.ts',
    bytes: 24295,
    sha256:
      '8c6335584c4021f5f76221537fc74c36d8d215e924e3c8f631b9bdd8ec4bee5a',
  }),
])

export const TARGET121_FILE_EDIT_UNICODE_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/tools/FileEditTool/utils.ts',
    bytes: 25622,
    sha256:
      '72a8c2c6070bd3763d53fdef9389947a44e97faf421104edfd6e9a33d74ec7de',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-file-edit-unicode-whole-unit-proof',
  'target121-file-edit-unicode-source-replay-test',
  'target121-file-edit-unicode-runtime-parity-test',
])

export const TARGET121_FILE_EDIT_UNICODE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:10152`,
    targetIndex: 10152,
    paths: Object.freeze(['src/tools/FileEditTool/utils.ts']),
    declarations: Object.freeze([
      'unicodeStringToRegex',
      'preserveUnicodeRepresentation',
      'findActualString',
    ]),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'FileEditTool matches literal Unicode text against \\u escape spellings case-insensitively, preserves exact known escape spellings, and applies the observed dominant hex-letter case to newly introduced Unicode code units.',
  }),
])

export const TARGET121_FILE_EDIT_UNICODE_EVIDENCE_IDS = EVIDENCE_IDS

const RAW_STRING_UTILS_IMPORT =
  "import { countCharInString } from 'src/utils/stringUtils.js'"

const RECOVERED_STRING_UTILS_IMPORT =
  "import { countCharInString, escapeRegExp } from 'src/utils/stringUtils.js'"

const RAW_UNICODE_ENCODER = `export function encodeUnicodeCharacters(value: string): string {
  return value.replace(/[\\u0080-\\uffff]/g, character =>
    \`\\\\u\${character.charCodeAt(0).toString(16).padStart(4, '0')}\`,
  )
}`

// The private helper name is recovered source spelling. Its complete emitted AST,
// dependency, callers, and runtime behavior are authenticated by the target units.
const RECOVERED_UNICODE_REGEX_BUILDER = `function unicodeStringToRegex(value: string): string {
  let regex = ''
  for (let index = 0; index < value.length; index++) {
    const charCode = value.charCodeAt(index)
    if (charCode >= 128) {
      regex += '\\\\\\\\u'
      for (const digit of charCode.toString(16).padStart(4, '0')) {
        regex +=
          digit >= 'a' ? \`[\${digit}\${digit.toUpperCase()}]\` : digit
      }
    } else {
      regex += escapeRegExp(value[index]!)
    }
  }
  return regex
}`

const RAW_PRESERVE_UNICODE = `export function preserveUnicodeRepresentation(
  oldString: string,
  actualOldString: string,
  newString: string,
): string {
  if (oldString === actualOldString) return newString
  if (
    UNICODE_CHARACTER_REGEX.test(oldString) &&
    encodeUnicodeCharacters(oldString) === actualOldString
  ) {
    return encodeUnicodeCharacters(newString)
  }
  if (
    UNICODE_ESCAPE_REGEX.test(oldString) &&
    decodeUnicodeEscapes(oldString) === actualOldString
  ) {
    return decodeUnicodeEscapes(newString)
  }
  return newString
}`

const RECOVERED_PRESERVE_UNICODE = `export function preserveUnicodeRepresentation(
  oldString: string,
  actualOldString: string,
  newString: string,
): string {
  if (oldString === actualOldString) return newString
  if (
    UNICODE_CHARACTER_REGEX.test(oldString) &&
    new RegExp(\`^\${unicodeStringToRegex(oldString)}$\`).test(actualOldString)
  ) {
    const encodings = new Map<number, string>()
    let uppercaseCount = 0
    let lowercaseCount = 0
    for (
      let stringIndex = 0, encodedIndex = 0;
      stringIndex < oldString.length;
      stringIndex++
    ) {
      const charCode = oldString.charCodeAt(stringIndex)
      if (charCode >= 128) {
        const encoding = actualOldString.slice(
          encodedIndex + 2,
          encodedIndex + 6,
        )
        encodings.set(charCode, encoding)
        for (const digit of encoding) {
          if (digit >= 'a' && digit <= 'f') lowercaseCount++
          else if (digit >= 'A' && digit <= 'F') uppercaseCount++
        }
        encodedIndex += 6
      } else {
        encodedIndex += 1
      }
    }
    return newString.replace(/[\\u0080-\\uffff]/g, character => {
      const charCode = character.charCodeAt(0)
      const existingEncoding = encodings.get(charCode)
      if (existingEncoding !== undefined) return \`\\\\u\${existingEncoding}\`
      const encoding = charCode.toString(16).padStart(4, '0')
      return \`\\\\u\${
        uppercaseCount > lowercaseCount ? encoding.toUpperCase() : encoding
      }\`
    })
  }
  if (
    UNICODE_ESCAPE_REGEX.test(oldString) &&
    decodeUnicodeEscapes(oldString) === actualOldString
  ) {
    return decodeUnicodeEscapes(newString)
  }
  return newString
}`

const RAW_FIND_ACTUAL_STRING = `export function findActualString(
  fileContent: string,
  searchString: string,
): string | null {
  // First try exact match
  if (fileContent.includes(searchString)) {
    return searchString
  }

  // Try with normalized quotes
  const normalizedSearch = normalizeQuotes(searchString)
  const normalizedFile = normalizeQuotes(fileContent)

  const searchIndex = normalizedFile.indexOf(normalizedSearch)
  if (searchIndex !== -1) {
    // Find the actual string in the file that matches
    return fileContent.substring(searchIndex, searchIndex + searchString.length)
  }

  if (UNICODE_ESCAPE_REGEX.test(searchString)) {
    const decodedSearch = decodeUnicodeEscapes(searchString)
    if (
      decodedSearch !== searchString &&
      fileContent.includes(decodedSearch)
    ) {
      return decodedSearch
    }
  }

  if (UNICODE_CHARACTER_REGEX.test(searchString)) {
    const encodedSearch = encodeUnicodeCharacters(searchString)
    if (
      encodedSearch !== searchString &&
      fileContent.includes(encodedSearch)
    ) {
      return encodedSearch
    }
  }

  return null
}`

const RECOVERED_FIND_ACTUAL_STRING = `export function findActualString(
  fileContent: string,
  searchString: string,
): string | null {
  // First try exact match
  if (fileContent.includes(searchString)) {
    return searchString
  }

  // Try with normalized quotes
  const normalizedSearch = normalizeQuotes(searchString)
  const normalizedFile = normalizeQuotes(fileContent)

  const searchIndex = normalizedFile.indexOf(normalizedSearch)
  if (searchIndex !== -1) {
    // Find the actual string in the file that matches
    return fileContent.substring(searchIndex, searchIndex + searchString.length)
  }

  if (UNICODE_ESCAPE_REGEX.test(searchString)) {
    const decodedSearch = decodeUnicodeEscapes(searchString)
    if (
      decodedSearch !== searchString &&
      fileContent.includes(decodedSearch)
    ) {
      return decodedSearch
    }
  }

  if (UNICODE_CHARACTER_REGEX.test(searchString)) {
    const match = fileContent.match(
      new RegExp(unicodeStringToRegex(searchString)),
    )
    if (match) return match[0]
  }

  return null
}`

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

export function buildTarget121FileEditUnicodeOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError('src/tools/FileEditTool/utils.ts source must be a string')
  }
  let recovered = replaceExactlyOnce(
    source,
    RAW_STRING_UTILS_IMPORT,
    RECOVERED_STRING_UTILS_IMPORT,
    'stringUtils import',
  )
  recovered = replaceExactlyOnce(
    recovered,
    RAW_UNICODE_ENCODER,
    RECOVERED_UNICODE_REGEX_BUILDER,
    'Unicode encoder declaration',
  )
  recovered = replaceExactlyOnce(
    recovered,
    RAW_PRESERVE_UNICODE,
    RECOVERED_PRESERVE_UNICODE,
    'preserveUnicodeRepresentation declaration',
  )
  return replaceExactlyOnce(
    recovered,
    RAW_FIND_ACTUAL_STRING,
    RECOVERED_FIND_ACTUAL_STRING,
    'findActualString declaration',
  )
}

export function applyTarget121FileEditUnicodeSourceRecovery({ sourceRoot } = {}) {
  const input = TARGET121_FILE_EDIT_UNICODE_INPUT_FILES[0]
  const output = TARGET121_FILE_EDIT_UNICODE_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: FileEditTool Unicode replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121FileEditUnicodeOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: FileEditTool Unicode replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121FileEditUnicodeSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
