#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/components/MessageSelector.tsx'

export const TARGET118_RESTORE_CODE_DIFF_STATS_INPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 115618,
  sha256: 'd23ba9581d95a5ddee2a9725a61b6179d362e0de482e3c40cbd60ef0e1a4d4cd',
})

export const TARGET118_RESTORE_CODE_DIFF_STATS_OUTPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 115915,
  sha256: 'fb1442dc1e21990db0b783dba3a89a7687550675069043521b89c134beb33a00',
})

const EVIDENCE_IDS = Object.freeze([
  'target118-restore-code-diff-stats-target-fragment',
  'target118-restore-code-diff-stats-source-replay-test',
  'target118-restore-code-diff-stats-source-ast-test',
])

export const TARGET118_RESTORE_CODE_DIFF_STATS_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18832`,
      targetIndex: 18832,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze([
        'RestoreCodeConfirmation',
        'DiffStatsText',
      ]),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'The authenticated Target118 restore-code confirmation computes one-, two-, and many-file labels, passes insertion/deletion counts through the exact compiled added/removed stats contract, suppresses an all-zero diff, conditionally separates two nonzero counts, and renders the result before the exact in-file label. The bounded replay replaces the approximate local DiffStatsText reconstruction without changing unrelated MessageSelector source.',
    }),
  ])

const OPERATIONS = Object.freeze([
  Object.freeze({
    label: 'restore confirmation memo-cache width',
    before:
      'function RestoreCodeConfirmation(t0) {\n' +
      '  const $ = _c(14);\n',
    after:
      'function RestoreCodeConfirmation(t0) {\n' +
      '  const $ = _c(15);\n',
  }),
  Object.freeze({
    label: 'explicit diff-stats caller contract',
    before: [
      '  let t1;',
      '  if ($[9] !== diffStatsForRestore) {',
      '    t1 = <DiffStatsText diffStats={diffStatsForRestore} />;',
      '    $[9] = diffStatsForRestore;',
      '    $[10] = t1;',
      '  } else {',
      '    t1 = $[10];',
      '  }',
      '  let t2;',
      '  if ($[11] !== fileLabel || $[12] !== t1) {',
      '    t2 = <><Text dimColor={true}>The code will be restored{" "}{t1} in {fileLabel}.</Text></>;',
      '    $[11] = fileLabel;',
      '    $[12] = t1;',
      '    $[13] = t2;',
      '  } else {',
      '    t2 = $[13];',
      '  }',
    ].join('\n'),
    after: [
      '  let t1;',
      '  if ($[9] !== diffStatsForRestore.deletions || $[10] !== diffStatsForRestore.insertions) {',
      '    t1 = <DiffStatsText added={diffStatsForRestore.insertions} removed={diffStatsForRestore.deletions} />;',
      '    $[9] = diffStatsForRestore.deletions;',
      '    $[10] = diffStatsForRestore.insertions;',
      '    $[11] = t1;',
      '  } else {',
      '    t1 = $[11];',
      '  }',
      '  let t2;',
      '  if ($[12] !== fileLabel || $[13] !== t1) {',
      '    t2 = <><Text dimColor={true}>The code will be restored{" "}{t1} in {fileLabel}.</Text></>;',
      '    $[12] = fileLabel;',
      '    $[13] = t1;',
      '    $[14] = t2;',
      '  } else {',
      '    t2 = $[14];',
      '  }',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'exact added-removed display contract',
    before: [
      'function DiffStatsText(t0) {',
      '  const $ = _c(7);',
      '  const {',
      '    diffStats',
      '  } = t0;',
      '  if (!diffStats || !diffStats.filesChanged) {',
      '    return;',
      '  }',
      '  let t1;',
      '  if ($[0] !== diffStats.insertions) {',
      '    t1 = <Text color="diffAddedWord">+{diffStats.insertions} </Text>;',
      '    $[0] = diffStats.insertions;',
      '    $[1] = t1;',
      '  } else {',
      '    t1 = $[1];',
      '  }',
      '  let t2;',
      '  if ($[2] !== diffStats.deletions) {',
      '    t2 = <Text color="diffRemovedWord">-{diffStats.deletions}</Text>;',
      '    $[2] = diffStats.deletions;',
      '    $[3] = t2;',
      '  } else {',
      '    t2 = $[3];',
      '  }',
      '  let t3;',
      '  if ($[4] !== t1 || $[5] !== t2) {',
      '    t3 = <>{t1}{t2}</>;',
      '    $[4] = t1;',
      '    $[5] = t2;',
      '    $[6] = t3;',
      '  } else {',
      '    t3 = $[6];',
      '  }',
      '  return t3;',
      '}',
    ].join('\n'),
    after: [
      'function DiffStatsText(t0) {',
      '  const $ = _c(10);',
      '  const {',
      '    added,',
      '    removed,',
      '    bold',
      '  } = t0;',
      '  if (added === 0 && removed === 0) {',
      '    return null;',
      '  }',
      '  let t1;',
      '  if ($[0] !== added || $[1] !== bold) {',
      '    t1 = added > 0 && <Text color="diffAddedWord" bold={bold}>+{added}</Text>;',
      '    $[0] = added;',
      '    $[1] = bold;',
      '    $[2] = t1;',
      '  } else {',
      '    t1 = $[2];',
      '  }',
      '  const t2 = added > 0 && removed > 0 && " ";',
      '  let t3;',
      '  if ($[3] !== bold || $[4] !== removed) {',
      '    t3 = removed > 0 && <Text color="diffRemovedWord" bold={bold}>-{removed}</Text>;',
      '    $[3] = bold;',
      '    $[4] = removed;',
      '    $[5] = t3;',
      '  } else {',
      '    t3 = $[5];',
      '  }',
      '  let t4;',
      '  if ($[6] !== t1 || $[7] !== t2 || $[8] !== t3) {',
      '    t4 = <Text>{t1}{t2}{t3}</Text>;',
      '    $[6] = t1;',
      '    $[7] = t2;',
      '    $[8] = t3;',
      '    $[9] = t4;',
      '  } else {',
      '    t4 = $[9];',
      '  }',
      '  return t4;',
      '}',
    ].join('\n'),
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(source, operation) {
  const count = source.split(operation.before).length - 1
  if (count !== 1) {
    throw new Error(
      `${CASE_NAME}: ${operation.label} anchor count ${count}, expected 1`,
    )
  }
  return source.replace(operation.before, operation.after)
}

export function buildTarget118RestoreCodeDiffStatsOutput(input) {
  let output = input
  for (const operation of OPERATIONS) {
    output = replaceExactly(output, operation)
  }
  return Buffer.from(output)
}

function resolveSourcePath(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, SOURCE_PATH.replace(/^src\//, ''))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${SOURCE_PATH}: escapes supplied source root`)
  }
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${SOURCE_PATH}: expected a real source file`)
  }
  return filename
}

export function applyTarget118RestoreCodeDiffStatsSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = resolveSourcePath(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (sameDescriptor(actual, TARGET118_RESTORE_CODE_DIFF_STATS_OUTPUT_FILE)) {
    return { status: 'already-recovered', files: [SOURCE_PATH] }
  }
  if (!sameDescriptor(actual, TARGET118_RESTORE_CODE_DIFF_STATS_INPUT_FILE)) {
    throw new Error(
      `${CASE_NAME}: ${SOURCE_PATH} requires exact raw or recovered state; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = buildTarget118RestoreCodeDiffStatsOutput(input.toString())
  const outputDescriptor = descriptor(output)
  if (
    !sameDescriptor(
      outputDescriptor,
      TARGET118_RESTORE_CODE_DIFF_STATS_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: ${SOURCE_PATH} replay output differs ${outputDescriptor.bytes}/${outputDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  if (
    !sameDescriptor(
      descriptor(fs.readFileSync(filename)),
      TARGET118_RESTORE_CODE_DIFF_STATS_OUTPUT_FILE,
    )
  ) {
    throw new Error(`${CASE_NAME}: ${SOURCE_PATH} written postimage differs`)
  }
  return { status: 'recovered', files: [SOURCE_PATH] }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-restore-code-diff-stats-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118RestoreCodeDiffStatsSourceRecovery({
        sourceRoot: path.resolve(sourceRoot),
      }),
    )}\n`,
  )
}
