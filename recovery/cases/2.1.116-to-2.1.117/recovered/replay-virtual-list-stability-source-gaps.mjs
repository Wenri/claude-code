#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

function freezeFile(file) {
  return Object.freeze({ ...file })
}

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    declarations: Object.freeze([...override.declarations]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET117_VIRTUAL_LIST_STABILITY_INPUT_FILES = Object.freeze([
  freezeFile({
    path: 'src/hooks/useVirtualScroll.ts',
    bytes: 35122,
    sha256:
      'd27382b007c98ab3af5e2940b0d1f6db041ccbe2897963ce19f63afb340ea4b7',
  }),
  freezeFile({
    path: 'src/components/VirtualMessageList.tsx',
    bytes: 146330,
    sha256:
      '25e249633126b35334a5bf6ba7b9180ddf292032b82ca18191aad55012a97343',
  }),
])

export const TARGET117_VIRTUAL_LIST_STABILITY_OUTPUT_FILES = Object.freeze([
  freezeFile({
    path: 'src/hooks/useVirtualScroll.ts',
    bytes: 35640,
    sha256:
      '74b0f7ce9c674adfd19e0696c3f8f7e768221779e0a430fafa1d3682502b058f',
  }),
  freezeFile({
    path: 'src/components/VirtualMessageList.tsx',
    bytes: 148100,
    sha256:
      '2d8121a5e654646dd83e71c544c84069832458001e54e4e1fdf902f47fbad3b7',
  }),
])

const TARGET_FRAGMENT_EVIDENCE =
  'target117-virtual-list-stability-target-fragment'
const REPLAY_EVIDENCE = 'target117-virtual-list-stability-source-replay-test'

export const TARGET117_VIRTUAL_LIST_STABILITY_OWNER_OVERRIDES = Object.freeze([
  freezeOverride({
    key: `${CASE_NAME}:16560`,
    targetIndex: 16560,
    paths: ['src/hooks/useVirtualScroll.ts'],
    declarations: ['useVirtualScroll'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The Target117 virtual-scroll cache uses the prior key-array length, first key, and last key to skip stale-cache collection for append-only identity changes; this corrects the false statusNoticeDefinitions source-map owner.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:16608`,
    targetIndex: 16608,
    paths: ['src/components/VirtualMessageList.tsx'],
    declarations: ['VirtualMessageList', 'buildStableMessageKeys'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The Target117 virtual list owns the incremental key cache containing exact keys, uuids, seen-count map, and itemKey identity, and delegates reconciliation to the authenticated helper.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:16610`,
    targetIndex: 16610,
    paths: ['src/components/VirtualMessageList.tsx'],
    declarations: ['buildStableMessageKeys'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The Target117 key reconciler preserves unchanged UUID prefixes, rebuilds on divergence, suffixes duplicate sibling keys from per-key seen counts, and reports the first three duplicate identities.',
  }),
])

const VIRTUAL_SCROLL_REF_INPUT = `  const itemRefs = useRef(new Map<string, DOMElement>())
  const refCache = useRef(new Map<string, (el: DOMElement | null) => void>())`
const VIRTUAL_SCROLL_REF_OUTPUT = `  const itemRefs = useRef(new Map<string, DOMElement>())
  const refCache = useRef(new Map<string, (el: DOMElement | null) => void>())
  const itemKeysIdentityRef = useRef<{
    len: number
    first: string | undefined
    last: string | undefined
  }>({ len: 0, first: undefined, last: undefined })`

const VIRTUAL_SCROLL_MEMO_INPUT = `  useMemo(() => {
    const live = new Set(itemKeys)`
const VIRTUAL_SCROLL_MEMO_OUTPUT = `  useMemo(() => {
    const previous = itemKeysIdentityRef.current
    const first = itemKeys[0]
    const unchanged =
      itemKeys.length >= previous.len &&
      first === previous.first &&
      itemKeys[previous.len - 1] === previous.last
    previous.len = itemKeys.length
    previous.first = first
    previous.last = itemKeys.at(-1)
    if (unchanged) return

    const live = new Set(itemKeys)`

const VIRTUAL_LIST_IMPORT_INPUT =
  `import { logForDebugging } from '../utils/debug.js';`
const VIRTUAL_LIST_IMPORT_OUTPUT = `${VIRTUAL_LIST_IMPORT_INPUT}
import { logError } from '../utils/log.js';`

const VIRTUAL_LIST_DECLARATION_ANCHOR = `export function VirtualMessageList({`
const VIRTUAL_LIST_HELPER = `function buildStableMessageKeys(
  messages: readonly RenderableMessage[],
  itemKey: (message: RenderableMessage) => string,
  cache: {
    keys: string[]
    uuids: string[]
    seen: Map<string, number>
    itemKey: (message: RenderableMessage) => string
  },
): string[] {
  let unchanged = 0
  if (cache.itemKey === itemKey && messages.length >= cache.keys.length) {
    const previousLength = cache.keys.length
    while (
      unchanged < previousLength &&
      messages[unchanged]!.uuid === cache.uuids[unchanged]
    ) {
      unchanged++
    }
  }
  if (unchanged < cache.keys.length) {
    cache.keys = []
    cache.uuids = []
    cache.seen = new Map()
    unchanged = 0
  }
  cache.itemKey = itemKey
  let duplicates: Set<string> | null = null
  for (; unchanged < messages.length; unchanged++) {
    const message = messages[unchanged]!
    const key = itemKey(message)
    const seen = cache.seen.get(key)
    if (seen === undefined) {
      cache.seen.set(key, 1)
      cache.keys.push(key)
    } else {
      cache.seen.set(key, seen + 1)
      cache.keys.push(\`${'${key}'}#${'${seen}'}\`)
      ;(duplicates ??= new Set()).add(key)
    }
    cache.uuids.push(message.uuid)
  }
  if (duplicates) {
    const duplicateCounts = [...duplicates]
      .slice(0, 3)
      .map(key => \`${'${key}'} ×${'${cache.seen.get(key)}'}\`)
    logError(
      new Error(
        \`VirtualMessageList: duplicate sibling keys (leaks DOM nodes via mapRemainingChildren overwrite): ${'${duplicateCounts.join(\', \')}'}\`,
      ),
    )
  }
  return cache.keys
}

${VIRTUAL_LIST_DECLARATION_ANCHOR}`

const VIRTUAL_LIST_KEYS_INPUT =
  `  const keys = useMemo(() => messages.map(itemKey), [messages, itemKey]);`
const VIRTUAL_LIST_KEYS_OUTPUT = `  const keyCacheRef = useRef({
    keys: [] as string[],
    uuids: [] as string[],
    seen: new Map<string, number>(),
    itemKey,
  })
  const keys = useMemo(
    () => buildStableMessageKeys(messages, itemKey, keyCacheRef.current),
    [messages, itemKey],
  );`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function assertDescriptor(value, expected, label) {
  const actual = descriptor(value)
  if (!descriptorsEqual(actual, expected)) {
    throw new Error(
      `${label}: expected ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
    )
  }
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`${label}: expected exactly one input anchor`)
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

function transformVirtualScroll(input) {
  let source = input.toString('utf8')
  source = replaceExactlyOnce(
    source,
    VIRTUAL_SCROLL_REF_INPUT,
    VIRTUAL_SCROLL_REF_OUTPUT,
    'virtual-scroll identity ref',
  )
  source = replaceExactlyOnce(
    source,
    VIRTUAL_SCROLL_MEMO_INPUT,
    VIRTUAL_SCROLL_MEMO_OUTPUT,
    'virtual-scroll append identity guard',
  )
  return Buffer.from(source)
}

function transformVirtualList(input) {
  let source = input.toString('utf8')
  source = replaceExactlyOnce(
    source,
    VIRTUAL_LIST_IMPORT_INPUT,
    VIRTUAL_LIST_IMPORT_OUTPUT,
    'virtual-list logError import',
  )
  source = replaceExactlyOnce(
    source,
    VIRTUAL_LIST_DECLARATION_ANCHOR,
    VIRTUAL_LIST_HELPER,
    'virtual-list stable-key helper',
  )
  source = replaceExactlyOnce(
    source,
    VIRTUAL_LIST_KEYS_INPUT,
    VIRTUAL_LIST_KEYS_OUTPUT,
    'virtual-list stable-key call',
  )
  return Buffer.from(source)
}

const TRANSFORMS = Object.freeze({
  'src/hooks/useVirtualScroll.ts': transformVirtualScroll,
  'src/components/VirtualMessageList.tsx': transformVirtualList,
})

function sourceFilename(sourceRoot, sourcePath) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!sourcePath.startsWith('src/') || !filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: path escapes the supplied source root`)
  }
  return filename
}

export function applyTarget117VirtualListStabilitySourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const states = TARGET117_VIRTUAL_LIST_STABILITY_INPUT_FILES.map(
    (inputFile, index) => {
      const outputFile = TARGET117_VIRTUAL_LIST_STABILITY_OUTPUT_FILES[index]
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
      ownerOverrides: TARGET117_VIRTUAL_LIST_STABILITY_OWNER_OVERRIDES.length,
      files: TARGET117_VIRTUAL_LIST_STABILITY_OUTPUT_FILES,
    })
  }
  if (!states.every(state => state.state === 'raw')) {
    const details = states
      .map(
        state =>
          `${state.inputFile.path}=${state.state}:${state.actual.bytes}/${state.actual.sha256}`,
      )
      .join(', ')
    throw new Error(`Refusing mixed or non-target virtual-list recovery: ${details}`)
  }

  const outputs = states.map(state => {
    const transform = TRANSFORMS[state.inputFile.path]
    const output = transform(state.input)
    assertDescriptor(output, state.outputFile, `recovered ${state.outputFile.path}`)
    return { ...state, output }
  })
  for (const state of outputs) fs.writeFileSync(state.filename, state.output)
  for (const state of outputs) {
    assertDescriptor(
      fs.readFileSync(state.filename),
      state.outputFile,
      `written ${state.outputFile.path}`,
    )
  }

  return Object.freeze({
    status: 'recovered',
    ownerOverrides: TARGET117_VIRTUAL_LIST_STABILITY_OWNER_OVERRIDES.length,
    files: TARGET117_VIRTUAL_LIST_STABILITY_OUTPUT_FILES,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  const result = applyTarget117VirtualListStabilitySourceRecovery({ sourceRoot })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
