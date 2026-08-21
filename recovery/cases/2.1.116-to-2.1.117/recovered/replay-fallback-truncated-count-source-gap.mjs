#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_FALLBACK_TRUNCATED_COUNT_CONTEXT_FILE = Object.freeze({
  path: 'src/components/TruncatedCount.tsx',
  bytes: 681,
  sha256: 'd1cfad7aa51c6e23a2acbc26858c6d711b872d86380fdeed594e8caf05338672',
})

export const TARGET117_FALLBACK_TRUNCATED_COUNT_RAW_FILE = Object.freeze({
  path: 'src/components/FallbackToolUseErrorMessage.tsx',
  bytes: 12623,
  sha256: '4a52f0ae2724251af9ba40190b9e372c5c4db5c16caa098041dd8133c4e2479f',
})

export const TARGET117_FALLBACK_TRUNCATED_COUNT_POSTIMAGE = Object.freeze({
  path: 'src/components/FallbackToolUseErrorMessage.tsx',
  bytes: 12272,
  sha256: '4b59214f28121cc05755909b935f686fe6272c33e690e08b6607874255d0788a',
})

const TARGET_UNIT_EVIDENCE =
  'target117-fallback-truncated-count-target-unit-proof'
const SOURCE_REPLAY_EVIDENCE =
  'target117-fallback-truncated-count-source-replay-test'

export const TARGET117_FALLBACK_TRUNCATED_COUNT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:12023`,
      targetIndex: 12023,
      paths: Object.freeze([
        'src/components/FallbackToolUseErrorMessage.tsx',
        'src/components/TruncatedCount.tsx',
      ]),
      declarations: Object.freeze([
        'FallbackToolUseErrorMessage',
        'TruncatedCount',
      ]),
      evidenceIds: Object.freeze([
        TARGET_UNIT_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
      ]),
      behavior:
        'Target117 non-verbose fallback tool errors delegate their omitted-line footer to TruncatedCount with expandable enabled; verbose errors suppress the footer, and TruncatedCount owns the non-positive count guard.',
    }),
  ])

const TRANSFORMS = Object.freeze([
  Object.freeze({
    label: 'remove obsolete shortcut-display import',
    before:
      "import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js';\n",
    after: '',
  }),
  Object.freeze({
    label: 'add truncated-count import',
    before: "import { MessageResponse } from './MessageResponse.js';\n",
    after: [
      "import { MessageResponse } from './MessageResponse.js';",
      "import { TruncatedCount } from './TruncatedCount.js';",
      '',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'shrink compiler cache to Target117 shape',
    before: '  const $ = _c(25);',
    after: '  const $ = _c(24);',
  }),
  Object.freeze({
    label: 'remove obsolete shortcut-display hook',
    before:
      '  const transcriptShortcut = useShortcutDisplay("app:toggleTranscript", "Global", "ctrl+o");\n',
    after: '',
  }),
  Object.freeze({
    label: 'delegate omitted lines to truncated count',
    before: [
      '  let t5;',
      '  if ($[13] !== plusLines || $[14] !== transcriptShortcut || $[15] !== verbose) {',
      '    t5 = !verbose && plusLines > 0 && <Box><Text dimColor={true}>… +{plusLines} {plusLines === 1 ? "line" : "lines"} (</Text><Text dimColor={true} bold={true}>{transcriptShortcut}</Text><Text> </Text><Text dimColor={true}>to see all)</Text></Box>;',
      '    $[13] = plusLines;',
      '    $[14] = transcriptShortcut;',
      '    $[15] = verbose;',
      '    $[16] = t5;',
      '  } else {',
      '    t5 = $[16];',
      '  }',
    ].join('\n'),
    after: [
      '  let t5;',
      '  if ($[13] !== plusLines || $[14] !== verbose) {',
      '    t5 = !verbose && <TruncatedCount count={plusLines} expandable={true} />;',
      '    $[13] = plusLines;',
      '    $[14] = verbose;',
      '    $[15] = t5;',
      '  } else {',
      '    t5 = $[15];',
      '  }',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'close shifted outer-box cache slots',
    before: [
      '  if ($[17] !== T1 || $[18] !== t3 || $[19] !== t4 || $[20] !== t5) {',
      '    t6 = <T1 flexDirection={t3}>{t4}{t5}</T1>;',
      '    $[17] = T1;',
      '    $[18] = t3;',
      '    $[19] = t4;',
      '    $[20] = t5;',
      '    $[21] = t6;',
      '  } else {',
      '    t6 = $[21];',
      '  }',
    ].join('\n'),
    after: [
      '  if ($[16] !== T1 || $[17] !== t3 || $[18] !== t4 || $[19] !== t5) {',
      '    t6 = <T1 flexDirection={t3}>{t4}{t5}</T1>;',
      '    $[16] = T1;',
      '    $[17] = t3;',
      '    $[18] = t4;',
      '    $[19] = t5;',
      '    $[20] = t6;',
      '  } else {',
      '    t6 = $[20];',
      '  }',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'close shifted response cache slots',
    before: [
      '  if ($[22] !== T2 || $[23] !== t6) {',
      '    t7 = <T2>{t6}</T2>;',
      '    $[22] = T2;',
      '    $[23] = t6;',
      '    $[24] = t7;',
      '  } else {',
      '    t7 = $[24];',
      '  }',
    ].join('\n'),
    after: [
      '  if ($[21] !== T2 || $[22] !== t6) {',
      '    t7 = <T2>{t6}</T2>;',
      '    $[21] = T2;',
      '    $[22] = t6;',
      '    $[23] = t7;',
      '  } else {',
      '    t7 = $[23];',
      '  }',
    ].join('\n'),
  }),
])

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

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected a normalized src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
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
  const expected = TARGET117_FALLBACK_TRUNCATED_COUNT_CONTEXT_FILE
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

function classifySource(input) {
  const source = input.toString('utf8')
  const actual = descriptor(input)
  const rawAnchors = TRANSFORMS.map(transform =>
    occurrenceCount(source, transform.before),
  )
  const postAnchors = TRANSFORMS.map(transform =>
    transform.after ? occurrenceCount(source, transform.after) : 0,
  )
  if (
    descriptorsEqual(actual, TARGET117_FALLBACK_TRUNCATED_COUNT_RAW_FILE) &&
    rawAnchors.every(count => count === 1)
  ) {
    return { source, state: 'raw' }
  }
  if (
    descriptorsEqual(actual, TARGET117_FALLBACK_TRUNCATED_COUNT_POSTIMAGE) &&
    postAnchors.every((count, index) =>
      TRANSFORMS[index].after ? count === 1 : true,
    )
  ) {
    return { source, state: 'postimage' }
  }
  throw new Error(
    `${TARGET117_FALLBACK_TRUNCATED_COUNT_RAW_FILE.path}: refusing mixed or non-Target117 state ${actual.bytes}/${actual.sha256} raw=${JSON.stringify(rawAnchors)} post=${JSON.stringify(postAnchors)}`,
  )
}

export function applyTarget117FallbackTruncatedCountSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  assertContext(sourceRoot)
  const sourcePath = TARGET117_FALLBACK_TRUNCATED_COUNT_RAW_FILE.path
  const filename = sourceFilename(sourceRoot, sourcePath)
  const input = readRealFile(filename, sourcePath)
  const classified = classifySource(input)
  if (classified.state === 'postimage') {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      file: TARGET117_FALLBACK_TRUNCATED_COUNT_POSTIMAGE,
      ownerOverrides:
        TARGET117_FALLBACK_TRUNCATED_COUNT_OWNER_OVERRIDES.length,
    })
  }

  let output = classified.source
  for (const transform of TRANSFORMS) {
    const count = occurrenceCount(output, transform.before)
    if (count !== 1) {
      throw new Error(`${transform.label}: expected one input anchor, got ${count}`)
    }
    output = output.replace(transform.before, transform.after)
  }
  const outputBytes = Buffer.from(output)
  if (classifySource(outputBytes).state !== 'postimage') {
    throw new Error('Fallback truncated-count replay did not converge')
  }

  fs.writeFileSync(filename, outputBytes)
  const written = readRealFile(filename, sourcePath)
  if (classifySource(written).state !== 'postimage') {
    throw new Error('Written fallback source lost the Target117 postimage')
  }

  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    file: TARGET117_FALLBACK_TRUNCATED_COUNT_POSTIMAGE,
    ownerOverrides: TARGET117_FALLBACK_TRUNCATED_COUNT_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117FallbackTruncatedCountSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
