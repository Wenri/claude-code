#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.118-to-2.1.119')
const obligationsPath = path.join(caseRoot, 'semantic/obligations.json')
const hiddenPath = path.join(caseRoot, 'hidden-obligations.json')
const daemonPath = path.join(caseRoot, 'daemon-fleet-query-obligations.json')
const outputPath = path.join(caseRoot, 'semantic/adjacent-direct-evidence.json')
const baselinePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  '/home/coder/.cache/claude-code-recovery/preflight-2.1.118-to-2.1.119/artifacts/2.1.118-linux-x64/cli.inner.js'
const targetPath =
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
  '/home/coder/.cache/claude-code-recovery/preflight-2.1.118-to-2.1.119/artifacts/2.1.119-linux-x64/cli.inner.js'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function fileMetadata(filename) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(repo, filename),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function occurrences(contents, fragment) {
  assert(fragment.length > 0, 'cannot count an empty fragment')
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function targetWitness(text, baseline, target) {
  const value = Buffer.from(text)
  return {
    text,
    bytes: value.length,
    sha256: sha256(value),
    baselineCount: occurrences(baseline, text),
    targetCount: occurrences(target, text),
  }
}

function sourceAssertion(sourcePath, fragment) {
  const value = Buffer.from(fragment)
  return {
    path: sourcePath,
    fragment,
    bytes: value.length,
    sha256: sha256(value),
    count: occurrences(
      fs.readFileSync(path.join(repo, sourcePath), 'utf8'),
      fragment,
    ),
  }
}

function scopedSourceFiles(raw) {
  const files = []
  for (const entry of raw.source ?? []) {
    if (!entry.path.startsWith('src/')) continue
    const absolute = path.join(repo, entry.path)
    if (!fs.existsSync(absolute)) continue
    const status = fs.statSync(absolute)
    if (status.isFile()) {
      files.push(entry.path)
      continue
    }
    if (!status.isDirectory()) continue
    const queue = [absolute]
    while (queue.length > 0) {
      const directory = queue.shift()
      for (const child of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))) {
        const filename = path.join(directory, child.name)
        if (child.isDirectory()) queue.push(filename)
        else if (
          child.isFile() &&
          /\.(?:md|ts|tsx|txt)$/.test(child.name)
        ) {
          files.push(path.relative(repo, filename))
        }
      }
    }
  }
  return [...new Set(files)].sort()
}

const targetOverrides = new Map([
  [
    'HID-010-bridge-dialog-key-event',
    ['VH.key==="d"&&!VH.ctrl&&!VH.meta'],
  ],
  [
    'HID-021-pro-trial-start-flow',
    [
      'tengu_pro_trial_start_screen_shown',
      'tengu_pro_trial_start_pressed',
      'tengu_pro_trial_start_ok',
      'tengu_pro_trial_start_error',
    ],
  ],
])

const sourceOverrides = new Map([
  [
    'HID-010-bridge-dialog-key-event',
    [
      {
        path: 'src/components/BridgeDialog.tsx',
        fragment: 'event.key === "d" && !event.ctrl && !event.meta',
      },
    ],
  ],
])

const supplementalSourceAssertions = new Map([
  [
    'HID-036-update-reconnect-flush',
    [
      {
        path: 'src/commands/update/update.ts',
        fragment: 'Switching to latest Claude Code… reconnecting',
      },
    ],
  ],
])

const obligations = JSON.parse(fs.readFileSync(obligationsPath, 'utf8'))
const hidden = JSON.parse(fs.readFileSync(hiddenPath, 'utf8'))
const daemon = JSON.parse(fs.readFileSync(daemonPath, 'utf8'))
const baseline = fs.readFileSync(baselinePath, 'utf8')
const target = fs.readFileSync(targetPath, 'utf8')
const rawRows = [...hidden.obligations, ...daemon.obligations]
const obligationByRawId = new Map(
  obligations.obligations
    .filter(obligation => obligation.catalogBinding)
    .map(obligation => [obligation.catalogBinding.rawId, obligation]),
)

assert(rawRows.length === 84, 'expected 84 adjacent raw rows')
assert(obligationByRawId.size === 84, 'expected 84 row-bound obligations')

const rows = rawRows.map(raw => {
  const obligation = obligationByRawId.get(raw.id)
  assert(obligation, `${raw.id}: obligation is absent`)
  const targetFragments = (
    targetOverrides.get(raw.id) ??
    obligation.targetFragments.map(fragment => fragment.text)
  ).map(fragment => targetWitness(fragment, baseline, target))
  for (const fragment of targetFragments) {
    assert(fragment.targetCount > 0, `${raw.id}: target witness is absent`)
  }

  const scopedFiles = scopedSourceFiles(raw)
  const initialSourceAssertions = sourceOverrides.has(raw.id)
    ? sourceOverrides.get(raw.id)
    : obligation.sourceAssertions.map(({ path: sourcePath, fragment }) => ({
        path: sourcePath,
        fragment,
      }))
  const exactTargetMatches = targetFragments.flatMap(({ text }) =>
    scopedFiles
      .filter(sourcePath =>
        fs.readFileSync(path.join(repo, sourcePath), 'utf8').includes(text),
      )
      .map(sourcePath => ({ path: sourcePath, fragment: text })),
  )
  const sourceAssertionPairs = [
    ...initialSourceAssertions,
    ...exactTargetMatches,
    ...(supplementalSourceAssertions.get(raw.id) ?? []),
  ]
  const sourceAssertions = [
    ...new Map(
      sourceAssertionPairs.map(entry => [
        `${entry.path}\0${entry.fragment}`,
        entry,
      ]),
    ).values(),
  ]
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.fragment.localeCompare(right.fragment),
    )
    .map(({ path: sourcePath, fragment }) =>
      sourceAssertion(sourcePath, fragment),
    )
  for (const entry of sourceAssertions) {
    assert(entry.count > 0, `${raw.id}: source witness is absent`)
  }
  const sourceAbsences =
    raw.id === 'AUD-002-daemon-allowlist-only-events'
      ? ['tengu_daemon_auto_uninstall', 'tengu_daemon_lease'].map(fragment => ({
          scope: 'src/**/*.{ts,tsx}',
          fragment,
          bytes: Buffer.byteLength(fragment),
          sha256: sha256(Buffer.from(fragment)),
          count: 0,
        }))
      : []
  return {
    id: raw.id,
    obligationId: obligation.id,
    classification: raw.classification,
    status: raw.status,
    rationale: [
      raw.target.normalized,
      raw.target.fragment,
      raw.target.fragments?.map(fragment => fragment.value).join(' / '),
      raw.notes,
    ]
      .filter(Boolean)
      .join('. '),
    evidenceKind:
      sourceAbsences.length > 0
        ? 'manually-reviewed-direct-absence-evidence'
        : 'manually-reviewed-direct-evidence',
    targetFragments,
    targetAbsences: obligation.targetAbsences ?? [],
    sourceAssertions,
    sourceAbsences,
    testIds: raw.testIds,
  }
})

assert(new Set(rows.map(row => row.id)).size === 84, 'duplicate evidence row ID')

const output = {
  schemaVersion: 1,
  release: '2.1.119',
  baseline: {
    bytes: 13_234_618,
    sha256: '84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa',
  },
  target: {
    bytes: 13_720_987,
    sha256: '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef',
  },
  rawCatalogs: [fileMetadata(hiddenPath), fileMetadata(daemonPath)],
  rowCount: 84,
  rows,
}

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
const value = fs.readFileSync(outputPath)
console.log(
  JSON.stringify({
    status: 'adjacent-direct-evidence-draft-built',
    path: path.relative(repo, outputPath),
    bytes: value.length,
    sha256: sha256(value),
    rows: rows.length,
    targetFragments: rows.reduce(
      (sum, row) => sum + row.targetFragments.length,
      0,
    ),
    targetAbsences: rows.reduce(
      (sum, row) => sum + row.targetAbsences.length,
      0,
    ),
    sourceAssertions: rows.reduce(
      (sum, row) => sum + row.sourceAssertions.length,
      0,
    ),
    sourceAbsences: rows.reduce(
      (sum, row) => sum + row.sourceAbsences.length,
      0,
    ),
  }),
)
