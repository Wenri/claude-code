import crypto from 'node:crypto'
import fs from 'node:fs'
import { tokenizer } from 'acorn'

const CANONICALIZATION_VERSION = 1

function isIdentifierProperty(tokens, index) {
  const previous = tokens[index - 1]?.kind
  const next = tokens[index + 1]?.kind

  if (previous === '.' || previous === '?.') {
    return true
  }

  // Object keys, labels, destructuring rename sources, and named arguments
  // carry runtime meaning. Bun does not freely alpha-rename these.
  if (next === ':') return true

  return false
}

function looksMinifiedIdentifier(text) {
  if (text.length <= 4) return true
  if (/[0-9]/.test(text)) return true
  return /^[A-Za-z_$]{1,3}$/.test(text)
}

function tokenSignature(tokens, index, identifierMode) {
  const token = tokens[index]
  if (token.kind !== 'name' && token.kind !== 'privateId') {
    return `${token.kind}:${token.text}`
  }

  if (identifierMode === 'all') {
    return `${token.kind}:<identifier>`
  }

  if (isIdentifierProperty(tokens, index)) {
    return `${token.kind}:property:${token.text}`
  }

  if (looksMinifiedIdentifier(token.text)) {
    return `${token.kind}:<identifier>`
  }

  return `${token.kind}:stable:${token.text}`
}

function normalizeIdentifierShorthand(tokens) {
  const result = []
  const identifierKinds = new Set(['name', 'privateId'])
  const terminators = new Set([',', '}', '='])

  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index]
    const colon = tokens[index + 1]
    const value = tokens[index + 2]
    const terminator = tokens[index + 3]
    if (
      identifierKinds.has(key.kind) &&
      colon?.kind === ':' &&
      identifierKinds.has(value?.kind) &&
      terminators.has(terminator?.kind)
    ) {
      // Bun sometimes emits `{property}` and sometimes `{property:q}` solely
      // because its new alpha-renaming assignment happens to match (or not
      // match) the property name. Treat those forms as one alignment unit.
      result.push({
        ...key,
        end: value.end,
        shorthandKeyText: key.text,
        text: key.text,
      })
      index += 2
      continue
    }
    result.push(key)
  }

  return result
}

/**
 * Tokenize a generated JavaScript bundle and produce alpha-insensitive
 * signatures. Offsets remain tied to the original generated file.
 */
export async function tokenizeBundle(filename, options = {}) {
  const identifierMode = options.identifierMode ?? 'all'
  const normalizeShorthand = options.normalizeShorthand ?? true
  if (!['all', 'semantic'].includes(identifierMode)) {
    throw new Error(`Unknown identifier mode: ${identifierMode}`)
  }
  const text = fs.readFileSync(filename, 'utf8')
  const tokenIterator = tokenizer(text, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
    allowHashBang: true,
  })
  let tokens = []

  while (true) {
    const token = tokenIterator.getToken()
    if (token.type.label === 'eof') break
    tokens.push({
      kind: token.type.label,
      text: text.slice(token.start, token.end),
      start: token.start,
      end: token.end,
      line: token.loc.start.line - 1,
      column: token.loc.start.column,
    })
  }

  if (normalizeShorthand) tokens = normalizeIdentifierShorthand(tokens)

  for (let index = 0; index < tokens.length; index += 1) {
    tokens[index].signature = tokenSignature(tokens, index, identifierMode)
  }

  return {
    canonicalizationVersion: CANONICALIZATION_VERSION,
    identifierMode,
    normalizeShorthand,
    filename,
    text,
    tokens,
  }
}

export function contextualTokenLines(tokens, radius = 4) {
  const signatures = tokens.map(token => token.signature)
  return signatures.map((signature, index) => {
    const start = Math.max(0, index - radius)
    const end = Math.min(signatures.length, index + radius + 1)
    return crypto
      .createHash('sha256')
      .update(signatures.slice(start, end).join('\u001f'))
      .update('\u001e')
      .update(signature)
      .digest('hex')
  })
}

export function generatedSpan(tokenization, startIndex, count) {
  const { tokens, text } = tokenization
  if (tokens.length === 0) return { start: 0, end: 0, text: '' }

  if (count > 0) {
    const first = tokens[startIndex]
    const last = tokens[startIndex + count - 1]
    return {
      start: first.start,
      end: last.end,
      text: text.slice(first.start, last.end),
    }
  }

  const insertionOffset =
    startIndex < tokens.length ? tokens[startIndex].start : text.length
  return { start: insertionOffset, end: insertionOffset, text: '' }
}
