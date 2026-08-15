import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.88-to-2.1.89'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_88_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_88_BUNDLE and CLAUDE_CODE_2_1_89_BUNDLE are required'
      : false,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = new Map([
  [12342, [9567341, 9567769, 'FunctionDeclaration', '099640f982b32b0b59ddca914dc9bd14c343c6846689b56c4838417b711c9bb7']],
  [18011, [12830760, 12844757, 'ClassDeclaration', '81b9052b5e824d9c97058ca14fad739ba90b23b7e3222df08adabc5626b8c19a']],
  [18012, [12844757, 12845828, 'FunctionDeclaration', '84b19f4e866bf8e7b9bb77bdddb63d60bcd696610430925a2b3ccc139d6c8231']],
  [18042, [12855741, 12886714, 'FunctionDeclaration', 'c7358ea7b5df60df4bf1da92d70b0baf3aa11cc4552977ead152839d13c40cec']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target89 authenticates the complete inbound file-attachment propagation graph', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baseline),
    '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f',
  )
  assert.equal(
    sha256(target),
    'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01',
  )
  const before = baseline.toString('utf8')
  const after = target.toString('utf8')
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
      `${index}: identity`,
    )
    assert.equal(
      sha256(after.slice(identity[0], identity[1])),
      identity[3],
      `${index}: bytes`,
    )
  }

  assert.equal(occurrences(before, 'fileAttachments'), 0)
  assert.equal(occurrences(after, 'fileAttachments'), 14)
  for (const [index] of units) {
    assert.ok(
      after.slice(
        structural.regions[index].target.start,
        structural.regions[index].target.end,
      ).includes('fileAttachments'),
      `${index}: reachable property`,
    )
  }
})

test('source propagates inbound attachment metadata through queue, query, and every replay edge', sourceOptions, () => {
  assertFragments(
    source('types/textInputTypes.ts'),
    ['fileAttachments?: unknown[]'],
    'QueuedCommand',
  )
  assertFragments(
    source('utils/attachments.ts'),
    ['fileAttachments?: unknown[]', 'fileAttachments: _.fileAttachments'],
    'queued attachment',
  )
  assertFragments(
    source('QueryEngine.ts'),
    [
      'fileAttachments?: unknown[]',
      'options.fileAttachments',
      'message.attachment.fileAttachments?.length',
      'fileAttachments,',
    ],
    'query replay',
  )
  assertFragments(
    source('cli/print.ts'),
    [
      'extractInboundAttachments,',
      'fileAttachments: batch.flatMap(c => c.fileAttachments ?? [])',
      'file_attachments: c.fileAttachments',
      'fileAttachments: cmd.fileAttachments',
      'const fileAttachments = extractInboundAttachments(message)',
      'file_attachments: fileAttachments',
      '...(fileAttachments.length > 0 && { fileAttachments })',
    ],
    'headless input and replay',
  )
})
