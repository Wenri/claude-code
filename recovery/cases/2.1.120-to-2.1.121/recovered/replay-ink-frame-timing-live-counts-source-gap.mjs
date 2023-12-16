#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_INPUT_FILES =
  Object.freeze([
    Object.freeze({
      path: 'src/ink/ink.tsx',
      bytes: 253824,
      sha256:
        '6bd97cd24debcb445718cb1971e4e7d302cf48d49e1aa1588f73dd48bef0ee6a',
    }),
  ])

export const TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_OUTPUT_FILES =
  Object.freeze([
    Object.freeze({
      path: 'src/ink/ink.tsx',
      bytes: 254861,
      sha256:
        'defb762d8161a903fcd48bac590db61f18a3025c74d576b4da66f75ebf75f13b',
    }),
  ])

const EVIDENCE_IDS = Object.freeze([
  'target121-ink-frame-live-count-target-unit-proof',
  'target121-ink-frame-live-count-source-replay-test',
  'target121-ink-frame-live-count-source-runtime-test',
])

function ownerOverride(targetIndex, declarations, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze(['src/ink/ink.tsx']),
    declarations: Object.freeze(declarations),
    evidenceIds: EVIDENCE_IDS,
    behavior,
  })
}

export const TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_OWNER_OVERRIDES =
  Object.freeze([
    ownerOverride(
      7458,
      ['countFiberNodes'],
      'The Ink frame profiler walks the live React Fiber graph through child, sibling, and alternate links, using a Set to count every reachable Fiber once even when those links form cycles. The coarse ink/log-update.ts owner is rejected.',
    ),
    ownerOverride(
      7556,
      ['Ink', 'countDOMNodes', 'countFiberNodes'],
      'Ink.onRender adds domLive and fiberLive to phases only while CLAUDE_CODE_FRAME_TIMING_LOG is truthy. The DOM counter walks childNodes and the Fiber counter starts at container.current; neither graph is traversed when the gate is disabled.',
    ),
  ])

export const TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_EVIDENCE_IDS =
  EVIDENCE_IDS

const LIVE_COUNT_HELPERS = `type FiberNode = {
  child: FiberNode | null;
  sibling: FiberNode | null;
  alternate: FiberNode | null;
};

function countFiberNodes(root: FiberNode | null): number {
  if (!root) return 0;
  const seen = new Set<FiberNode>();
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    if (node.child) stack.push(node.child);
    if (node.sibling) stack.push(node.sibling);
    if (node.alternate) stack.push(node.alternate);
  }
  return seen.size;
}

function countDOMNodes(root: dom.DOMNode | null): number {
  if (!root) return 0;
  let count = 0;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    count++;
    if ('childNodes' in node) {
      for (const child of node.childNodes) stack.push(child);
    }
  }
  return count;
}

`

const OPTIONS_ANCHOR = 'export type Options = {'

const RAW_PHASE_TAIL = `        yogaCacheHits: yc.cacheHits,
        yogaLive: yc.live`

const RECOVERED_PHASE_TAIL = `        yogaCacheHits: yc.cacheHits,
        yogaLive: yc.live,
        ...(process.env.CLAUDE_CODE_FRAME_TIMING_LOG && {
          domLive: countDOMNodes(this.rootNode),
          fiberLive: countFiberNodes(this.container.current)
        })`

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

function replaceExactlyOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) {
    throw new Error(`${CASE_NAME}: ${label} expected one anchor, got ${count}`)
  }
  return source.replace(before, after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected a normalized src path`)
  }
  const root = fs.realpathSync(path.resolve(sourceRoot))
  const filename = path.resolve(root, sourcePath.slice(4))
  const relative = path.relative(root, filename)
  if (
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
  const realFilename = fs.realpathSync(filename)
  if (realFilename !== filename) {
    throw new Error(`${sourcePath}: source path resolves through a symlink`)
  }
  return fs.readFileSync(filename)
}

export function buildTarget121InkFrameTimingLiveCountsOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError('src/ink/ink.tsx source must be a string')
  }
  const withHelpers = replaceExactlyOnce(
    source,
    OPTIONS_ANCHOR,
    LIVE_COUNT_HELPERS + OPTIONS_ANCHOR,
    'live-count helper insertion',
  )
  return replaceExactlyOnce(
    withHelpers,
    RAW_PHASE_TAIL,
    RECOVERED_PHASE_TAIL,
    'onFrame phases insertion',
  )
}

export function applyTarget121InkFrameTimingLiveCountsSourceRecovery({
  sourceRoot,
} = {}) {
  const input = TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_INPUT_FILES[0]
  const output = TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)

  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: Ink frame-timing live-count replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }

  const recovered = Buffer.from(
    buildTarget121InkFrameTimingLiveCountsOutput(current.toString('utf8')),
    'utf8',
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: Ink frame-timing live-count replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }

  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  const result = applyTarget121InkFrameTimingLiveCountsSourceRecovery({
    sourceRoot,
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
