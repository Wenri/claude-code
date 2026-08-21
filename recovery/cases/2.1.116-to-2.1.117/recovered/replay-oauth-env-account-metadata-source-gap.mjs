#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_OAUTH_ENV_ACCOUNT_METADATA_INPUT_FILE = Object.freeze({
  path: 'src/utils/auth.ts',
  bytes: 66751,
  sha256: 'd324188f34f42d111c4fa6080558064287e9bc2db161af43c5f1b21e0ccec505',
})

export const TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE = Object.freeze({
  path: 'src/utils/auth.ts',
  bytes: 66987,
  sha256: '2372d6ef383b2e24675b0a5f5a42dbc6026bd29b01861a04edf59750fcf49f7b',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-oauth-env-account-metadata-target-fragment'
const REPLAY_EVIDENCE =
  'target117-oauth-env-account-metadata-source-replay-test'

export const TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:6201`,
      targetIndex: 6201,
      paths: Object.freeze(['src/utils/auth.ts']),
      declarations: Object.freeze(['getClaudeAIOAuthTokens']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        REPLAY_EVIDENCE,
      ]),
      behavior:
        'Target117 carries CLAUDE_CODE_SUBSCRIPTION_TYPE and CLAUDE_CODE_RATE_LIMIT_TIER into OAuthTokens returned for both the direct OAuth environment token and the file-descriptor token; the secure-storage branch remains unchanged.',
    }),
  ])

const INPUT = `      subscriptionType: null,
      rateLimitTier: null,`

const OUTPUT = `      subscriptionType:
        (process.env.CLAUDE_CODE_SUBSCRIPTION_TYPE as SubscriptionType) || null,
      rateLimitTier: process.env.CLAUDE_CODE_RATE_LIMIT_TIER || null,`

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
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, 'utils/auth.ts')
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('auth path escapes the supplied source root')
  }
  return filename
}

function readRealFile(filename) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error('src/utils/auth.ts: expected a real source file')
  }
  return fs.readFileSync(filename)
}

export function applyTarget117OauthEnvAccountMetadataSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = readRealFile(filename)
  const actual = descriptor(input)

  if (descriptorsEqual(actual, TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE)) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      file: TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE,
      replacements: 2,
      ownerOverrides:
        TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OWNER_OVERRIDES.length,
    })
  }
  if (!descriptorsEqual(actual, TARGET117_OAUTH_ENV_ACCOUNT_METADATA_INPUT_FILE)) {
    throw new Error(
      `src/utils/auth.ts: refusing non-target OAuth metadata recovery ${actual.bytes}/${actual.sha256}`,
    )
  }

  const source = input.toString('utf8')
  if (occurrenceCount(source, INPUT) !== 2 || source.includes(OUTPUT)) {
    throw new Error(
      'src/utils/auth.ts: expected exactly two raw OAuth metadata anchors and no postimage',
    )
  }
  const output = Buffer.from(source.split(INPUT).join(OUTPUT))
  const recovered = descriptor(output)
  if (!descriptorsEqual(recovered, TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE)) {
    throw new Error(
      `src/utils/auth.ts: replay drift; expected ${TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE.bytes}/${TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE.sha256}, got ${recovered.bytes}/${recovered.sha256}`,
    )
  }

  fs.writeFileSync(filename, output)
  const written = descriptor(readRealFile(filename))
  if (!descriptorsEqual(written, TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE)) {
    throw new Error(
      `src/utils/auth.ts: written descriptor mismatch ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    file: TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE,
    replacements: 2,
    ownerOverrides:
      TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117OauthEnvAccountMetadataSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
