import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_ULTRAREVIEW_HANDLER_EVIDENCE_IDS = Object.freeze([
  'target121-ultrareview-handler-authenticated-whole-function',
  'target121-ultrareview-handler-exact-alpha-predecessor',
  'target121-ultrareview-handler-thirteen-local-invariants',
  'target121-ultrareview-handler-exact-source-owner',
  'target121-ultrareview-task-registry-closed-replay-graph',
])

export const TARGET121_ULTRAREVIEW_HANDLER_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:22067`,
    targetIndex: 22067,
    paths: Object.freeze(['src/cli/handlers/ultrareview.ts']),
    declarations: Object.freeze(['ultrareviewHandler']),
    evidenceIds: TARGET121_ULTRAREVIEW_HANDLER_EVIDENCE_IDS,
    behavior:
      'The authenticated Target121 Ultrareview handler is a complete identifier-renamed counterpart of paired Target120 u21966. All 13 targetAdded timeout, isFinite, context, abortController, status, message, body, signal, 60, and 1 rows occupy the same local AST paths and byte spans in both functions, so they are retained semantics whose reported agents.ts owner is adjacency bleed. The exact authored ultrareviewHandler contains the same 13 semantic occurrences. Its compiled launch context also consumes the exact no-op task registry produced by paired unit u17315; the bounded carry-forward replay is graph-closed across src/utils/task/framework.ts and src/cli/handlers/ultrareview.ts and refuses unknown source states.',
  }),
])

const FRAMEWORK_DECLARATION_ANCHOR = `/**
 * Register a new task in AppState.
 */`

const NOOP_TASK_REGISTRY_DECLARATION = `export const NOOP_TASK_REGISTRY = {
  register() {},
  update() {},
  remove() {},
  evictTerminal() {},
  applyOffsetsAndEvict() {},
  get() {
    return undefined
  },
  all() {
    return {}
  },
}

`

const SLEEP_IMPORT = "import { sleep } from '../../utils/sleep.js'"
const TASK_REGISTRY_IMPORT =
  "import { NOOP_TASK_REGISTRY } from '../../utils/task/framework.js'"
const SOURCE_CONTEXT = '    context: { abortController },'
const RECOVERED_CONTEXT =
  '    context: { abortController, taskRegistry: NOOP_TASK_REGISTRY },'

export const TARGET121_ULTRAREVIEW_TASK_REGISTRY_REPLAY = Object.freeze({
  targetIndex: 22067,
  owners: Object.freeze([
    Object.freeze({
      ownerPath: 'src/utils/task/framework.ts',
      role: 'producer',
      preimage: Object.freeze({
        bytes: 11807,
        sha256:
          '8c7929a94c67c282682097307d9bbcaa2cda19b9b3285916f929dab5afba938b',
      }),
      postimage: Object.freeze({
        bytes: 12009,
        sha256:
          'b577b57a19d8ed7306361cab71efd5b5a30d5ed8c1032dc413be160027aea5e9',
      }),
      replacements: Object.freeze([
        Object.freeze({
          before: FRAMEWORK_DECLARATION_ANCHOR,
          after:
            NOOP_TASK_REGISTRY_DECLARATION + FRAMEWORK_DECLARATION_ANCHOR,
        }),
      ]),
    }),
    Object.freeze({
      ownerPath: 'src/cli/handlers/ultrareview.ts',
      role: 'consumer',
      preimage: Object.freeze({
        bytes: 8140,
        sha256:
          'c43e445e1044b2e35697a00950651a728e59e8c2c8d6fa6f75797ebdba84e77b',
      }),
      postimage: Object.freeze({
        bytes: 8241,
        sha256:
          'a0860b36f5cc8616664201479ed23548cecd8376f65e26b355f46041b1793dbd',
      }),
      replacements: Object.freeze([
        Object.freeze({
          before: SLEEP_IMPORT,
          after: `${SLEEP_IMPORT}\n${TASK_REGISTRY_IMPORT}`,
        }),
        Object.freeze({
          before: SOURCE_CONTEXT,
          after: RECOVERED_CONTEXT,
        }),
      ]),
    }),
  ]),
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function occurrenceCount(source, needle) {
  let count = 0
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return count
    count += 1
    offset = next + needle.length
  }
}

export function applyTarget121UltrareviewTaskRegistrySourceRecovery({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const planned = []

  // Validate and build every owner before writing either one. An unknown or
  // malformed consumer therefore cannot strand the source graph half-replayed.
  for (const owner of TARGET121_ULTRAREVIEW_TASK_REGISTRY_REPLAY.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      `${CASE_NAME}: Ultrareview replay remains below the selected source root`,
    )
    assert.ok(
      fs.existsSync(filename),
      `${CASE_NAME}: ${owner.ownerPath} exists for Ultrareview replay`,
    )
    const beforeBytes = fs.readFileSync(filename)
    const beforeDescriptor = descriptor(beforeBytes)
    if (
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      `${CASE_NAME}: ${owner.ownerPath} requires its exact raw or recovered state`,
    )

    let output = beforeBytes.toString('utf8')
    for (const replacement of owner.replacements) {
      assert.equal(
        occurrenceCount(output, replacement.before),
        1,
        `${CASE_NAME}: ${owner.ownerPath} replay anchor appears exactly once`,
      )
      if (!replacement.before.includes(replacement.after)) {
        assert.equal(
          occurrenceCount(output, replacement.after),
          0,
          `${CASE_NAME}: ${owner.ownerPath} replay postimage is initially absent`,
        )
      }
      output = output.replace(replacement.before, replacement.after)
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      `${CASE_NAME}: ${owner.ownerPath} replay produces the pinned postimage`,
    )
    planned.push({ filename, outputBytes, ownerPath: owner.ownerPath })
  }

  for (const change of planned) {
    fs.writeFileSync(change.filename, change.outputBytes)
  }
  return {
    status: planned.length === 0 ? 'already-recovered' : 'recovered',
    files: planned.map(change => change.ownerPath),
  }
}
