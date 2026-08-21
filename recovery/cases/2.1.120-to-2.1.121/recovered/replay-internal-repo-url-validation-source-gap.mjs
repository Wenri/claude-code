#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'
const SOURCE_PATH = 'src/utils/commitAttribution.ts'

export const TARGET121_INTERNAL_REPO_URL_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 29594,
    sha256:
      'c39e33a003eb1cf695c317bd71a508e812fa2b7b57417775753daad198fed907',
  }),
])

export const TARGET121_INTERNAL_REPO_URL_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 30200,
    sha256:
      '47d65fb463579fbfa24ee53c6228ccbbe5b86fe34f94049e07d7b75896350817',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-internal-repo-url-whole-unit-proof',
  'target121-internal-repo-url-source-replay-test',
  'target121-internal-repo-url-runtime-parity-test',
])

export const TARGET121_INTERNAL_REPO_URL_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:11275`,
    targetIndex: 11275,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze([
      'isInternalModelRepoUrl',
      'isInternalModelRepo',
    ]),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'Internal-model repository classification accepts only HTTP(S), ssh://, or git@ remotes, rejects traversal, normalizes transport prefixes and a trailing slash, and requires an exact .git or slash boundary after an allowlisted repository.',
  }),
])

export const TARGET121_INTERNAL_REPO_URL_EVIDENCE_IDS = EVIDENCE_IDS

const RAW_ALLOWLIST_TAIL = `]

/**
 * Get the repo root for attribution operations.`

// The private helper spelling is inferred. Its complete emitted AST, sole
// consumer, and runtime behavior are authenticated by the Target121 bundle.
const RECOVERED_ALLOWLIST_TAIL = `]

function isInternalModelRepoUrl(remoteUrl: string): boolean {
  if (
    !/^https?:\\/\\//.test(remoteUrl) &&
    !/^ssh:\\/\\//.test(remoteUrl) &&
    !/^git@/.test(remoteUrl)
  ) {
    return false
  }

  const normalized = remoteUrl
    .replace(/^https?:\\/\\//, '')
    .replace(/^ssh:\\/\\//, '')
    .replace(/^[^@/]+@/, '')
    .replace(/\\/$/, '')

  if (normalized.split('/').includes('..')) return false

  return INTERNAL_MODEL_REPOS.some(repo => {
    if (!normalized.startsWith(repo)) return false
    const suffix = normalized.slice(repo.length)
    return suffix === '' || suffix === '.git' || suffix.startsWith('/')
  })
}

/**
 * Get the repo root for attribution operations.`

const RAW_CLASSIFICATION =
  '  const isInternal = INTERNAL_MODEL_REPOS.some(repo => remoteUrl.includes(repo))'

const RECOVERED_CLASSIFICATION =
  '  const isInternal = isInternalModelRepoUrl(remoteUrl)'

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

export function buildTarget121InternalRepoUrlOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`${SOURCE_PATH} source must be a string`)
  }
  const withHelper = replaceExactlyOnce(
    source,
    RAW_ALLOWLIST_TAIL,
    RECOVERED_ALLOWLIST_TAIL,
    'internal repository allowlist tail',
  )
  return replaceExactlyOnce(
    withHelper,
    RAW_CLASSIFICATION,
    RECOVERED_CLASSIFICATION,
    'repository classification call',
  )
}

export function applyTarget121InternalRepoUrlSourceRecovery({ sourceRoot } = {}) {
  const input = TARGET121_INTERNAL_REPO_URL_INPUT_FILES[0]
  const output = TARGET121_INTERNAL_REPO_URL_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: internal repository URL replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121InternalRepoUrlOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: internal repository URL replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121InternalRepoUrlSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
