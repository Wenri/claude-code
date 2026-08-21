#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_TRUNCATED_COUNT_SECONDARY_CONTEXT_FILE = Object.freeze({
  path: 'src/components/TruncatedCount.tsx',
  bytes: 681,
  sha256: 'd1cfad7aa51c6e23a2acbc26858c6d711b872d86380fdeed594e8caf05338672',
})

export const TARGET117_TRUNCATED_COUNT_SECONDARY_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/ModelPicker.tsx',
    declaration: 'ModelPicker',
    raw: Object.freeze({
      bytes: 54861,
      sha256: '4d691c333750aa5075bb2b04a199288b07dcb3552e68001fa44fda6e648a11f7',
    }),
    postimage: Object.freeze({
      bytes: 54912,
      sha256: 'ae0fc7842e2f8490df51e764e94312379b01e9d396dc13045989d3851d68ec95',
    }),
  }),
  Object.freeze({
    path: 'src/components/Settings/UsageContributors.tsx',
    declaration: 'UsageContributorsResult',
    raw: Object.freeze({
      bytes: 16143,
      sha256: 'ae6722934a5cdba2a7244247aca2156b68b568a29d867c91bbf7e70ede0f7b09',
    }),
    postimage: Object.freeze({
      bytes: 16142,
      sha256: 'f2997717d294370ab05a334ab107a3796ad02b3151e99907f862d497e9a0334a',
    }),
  }),
  Object.freeze({
    path: 'src/commands/ide/ide.tsx',
    declaration: 'IDEScreen',
    raw: Object.freeze({
      bytes: 77066,
      sha256: '58f0f4fd6e2aead9d423bc37c13a9ee576bec6c0e9b5f2016170582dd4180e6e',
    }),
    postimage: Object.freeze({
      bytes: 77270,
      sha256: '6e8f025fde89aa42fa067a581010beda2eeb077f355333190564cfdde7102070',
    }),
  }),
])

const TARGET_EVIDENCE =
  'target117-truncated-count-secondary-complete-target-unit-proof'
const SOURCE_EVIDENCE =
  'target117-truncated-count-secondary-source-replay-test'
const OWNER_EVIDENCE =
  'target117-truncated-count-secondary-exact-owner-correction-proof'

function override(targetIndex, path, declaration, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([path, TARGET117_TRUNCATED_COUNT_SECONDARY_CONTEXT_FILE.path]),
    declarations: Object.freeze([declaration, 'TruncatedCount']),
    evidenceIds: Object.freeze([TARGET_EVIDENCE, SOURCE_EVIDENCE, OWNER_EVIDENCE]),
    behavior,
  })
}

export const TARGET117_TRUNCATED_COUNT_SECONDARY_OWNER_OVERRIDES = Object.freeze([
  override(
    15423,
    'src/components/ModelPicker.tsx',
    'ModelPicker',
    'Target117 delegates the positive count of model choices beyond the ten-row picker window to TruncatedCount with the model unit.',
  ),
  override(
    15511,
    'src/components/Settings/UsageContributors.tsx',
    'UsageContributorsResult',
    'Target117 delegates oversized session files beyond the three visible paths to TruncatedCount; this corrects the stale source-map owner away from OverageCreditUpsell.',
  ),
  override(
    15859,
    'src/commands/ide/ide.tsx',
    'IDEScreen',
    'Target117 limits unavailable IDE rows to four and delegates the positive remainder to TruncatedCount with the IDE unit.',
  ),
])

const MODEL_IMPORT =
  "import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';"
const MODEL_IMPORT_POST = "import { TruncatedCount } from './TruncatedCount.js';"
const MODEL_RENDER =
  't22 = hiddenCount > 0 && <Box paddingLeft={3}><Text dimColor={true}>and {hiddenCount} more…</Text></Box>;'
const MODEL_RENDER_POST =
  't22 = hiddenCount > 0 && <Box paddingLeft={3}><TruncatedCount count={hiddenCount} unit="model" /></Box>;'

const USAGE_IMPORT =
  "import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'"
const USAGE_IMPORT_POST = "import { TruncatedCount } from '../TruncatedCount.js'"
const USAGE_RENDER = [
  '          {result.oversizedFiles.length > 3 && (',
  '            <Text dimColor>',
  '              …and {result.oversizedFiles.length - 3} more',
  '            </Text>',
  '          )}',
].join('\n')
const USAGE_RENDER_POST = [
  '          <TruncatedCount',
  '            count={result.oversizedFiles.length - 3}',
  '            unit="file"',
  '          />',
].join('\n')

const IDE_IMPORT =
  "import { Select } from '../../components/CustomSelect/index.js';"
const IDE_IMPORT_POST =
  "import { TruncatedCount } from '../../components/TruncatedCount.js';"
const IDE_RENDER =
  't9 = unavailableIDEs.length > 0 && <Box marginTop={1} flexDirection="column"><Text dimColor={true}>Found {unavailableIDEs.length} other running IDE(s). However, their workspace/project directories do not match the current cwd.</Text><Box marginTop={1} flexDirection="column">{unavailableIDEs.map(_temp3)}</Box></Box>;'
const IDE_RENDER_POST =
  't9 = unavailableIDEs.length > 0 && <Box marginTop={1} flexDirection="column"><Text dimColor={true}>Found {unavailableIDEs.length} other running IDE(s). However, their workspace/project directories do not match the current cwd.</Text><Box marginTop={1} flexDirection="column">{unavailableIDEs.slice(0, 4).map(_temp3)}{unavailableIDEs.length > 4 && <Box paddingLeft={3}><TruncatedCount count={unavailableIDEs.length - 4} unit="IDE" /></Box>}</Box></Box>;'

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

function replaceOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) throw new Error(`${label}: expected one replay anchor, got ${count}`)
  return source.replace(before, after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) throw new Error(`${sourcePath}: invalid src path`)
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  return fs.readFileSync(filename)
}

function assertContext(sourceRoot) {
  const expected = TARGET117_TRUNCATED_COUNT_SECONDARY_CONTEXT_FILE
  const filename = sourceFilename(sourceRoot, expected.path)
  if (!fs.existsSync(filename)) {
    throw new Error(`${expected.path}: required Target117 context is absent`)
  }
  const actual = descriptor(readRealFile(filename, expected.path))
  if (!descriptorsEqual(actual, expected)) {
    throw new Error(
      `${expected.path}: refusing non-Target117 context ${actual.bytes}/${actual.sha256}`,
    )
  }
}

function classify(sourceRoot, expected) {
  const filename = sourceFilename(sourceRoot, expected.path)
  const input = readRealFile(filename, expected.path)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, expected.raw)) {
    return { expected, filename, source: input.toString('utf8'), state: 'raw' }
  }
  if (descriptorsEqual(actual, expected.postimage)) {
    return { expected, filename, source: input.toString('utf8'), state: 'postimage' }
  }
  throw new Error(
    `${expected.path}: refusing mixed or non-Target117 state ${actual.bytes}/${actual.sha256}`,
  )
}

function recover(file) {
  let output = file.source
  if (file.expected.path === 'src/components/ModelPicker.tsx') {
    output = replaceOnce(
      output,
      MODEL_IMPORT,
      `${MODEL_IMPORT}\n${MODEL_IMPORT_POST}`,
      'ModelPicker import',
    )
    output = replaceOnce(output, MODEL_RENDER, MODEL_RENDER_POST, 'ModelPicker delegate')
  } else if (
    file.expected.path === 'src/components/Settings/UsageContributors.tsx'
  ) {
    output = replaceOnce(
      output,
      USAGE_IMPORT,
      `${USAGE_IMPORT}\n${USAGE_IMPORT_POST}`,
      'UsageContributors import',
    )
    output = replaceOnce(output, USAGE_RENDER, USAGE_RENDER_POST, 'UsageContributors delegate')
  } else if (file.expected.path === 'src/commands/ide/ide.tsx') {
    output = replaceOnce(
      output,
      IDE_IMPORT,
      `${IDE_IMPORT}\n${IDE_IMPORT_POST}`,
      'IDE import',
    )
    output = replaceOnce(output, IDE_RENDER, IDE_RENDER_POST, 'IDE delegate')
  } else {
    throw new Error(`${file.expected.path}: missing replay transform`)
  }
  const bytes = Buffer.from(output)
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, file.expected.postimage)) {
    throw new Error(`${file.expected.path}: replay drift ${actual.bytes}/${actual.sha256}`)
  }
  return bytes
}

export function applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  assertContext(sourceRoot)
  const files = TARGET117_TRUNCATED_COUNT_SECONDARY_FILES.map(expected =>
    classify(sourceRoot, expected),
  )
  const states = new Set(files.map(file => file.state))
  if (states.size === 1 && states.has('postimage')) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      files: TARGET117_TRUNCATED_COUNT_SECONDARY_FILES,
      ownerOverrides: TARGET117_TRUNCATED_COUNT_SECONDARY_OWNER_OVERRIDES.length,
    })
  }
  if (states.size !== 1 || !states.has('raw')) {
    throw new Error(
      `Refusing mixed secondary TruncatedCount recovery: ${files.map(file => `${file.expected.path}=${file.state}`).join(', ')}`,
    )
  }
  const outputs = files.map(file => ({ file, output: recover(file) }))
  for (const { file, output } of outputs) fs.writeFileSync(file.filename, output)
  for (const { file } of outputs) {
    if (classify(sourceRoot, file.expected).state !== 'postimage') {
      throw new Error(`${file.expected.path}: written replay did not retain postimage`)
    }
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    files: TARGET117_TRUNCATED_COUNT_SECONDARY_FILES,
    ownerOverrides: TARGET117_TRUNCATED_COUNT_SECONDARY_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117TruncatedCountSecondaryConsumerSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
