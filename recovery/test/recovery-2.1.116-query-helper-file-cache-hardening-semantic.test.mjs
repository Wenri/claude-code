import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnit = {
  index: 10765,
  start: 6310326,
  end: 6311708,
  sourceHash:
    'a6c0d97f8a84465844f871de07f8f304e93cdf4d929ad9917d194c1cb01d3a4a',
}
const targetUnit = {
  index: 10872,
  start: 6343912,
  end: 6345429,
  sourceHash:
    'd6aa288ea46c368a474e90445d563cb1a5efe565a7199a1bb3d37654ef0bf2c4',
}
const typedRows = [
  {
    row: 365,
    value: 'extractReadFilesFromMessages: skipping malformed ',
    start: 6344519,
    end: 6344568,
  },
  { row: 366, value: ' tool_use: ', start: 6344577, end: 6344588 },
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function instantiateSourceHarness() {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source('src/utils/queryHelpers.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const state = {
    debug: [],
    diskReads: [],
    disk: new Map(),
  }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'lodash-es/last.js') {
      return value => value.at(-1)
    }
    if (specifier.endsWith('/bootstrap/state.js')) {
      return {
        getSessionId: () => 'session-test',
        isSessionPersistenceDisabled: () => true,
      }
    }
    if (specifier.endsWith('/services/tools/toolOrchestration.js')) {
      return { runTools: async function* () {} }
    }
    if (specifier.endsWith('/Tool.js')) return { findToolByName: () => null }
    if (specifier.endsWith('/tools/BashTool/toolName.js')) {
      return { BASH_TOOL_NAME: 'Bash' }
    }
    if (specifier.endsWith('/tools/FileEditTool/constants.js')) {
      return { FILE_EDIT_TOOL_NAME: 'Edit' }
    }
    if (specifier.endsWith('/tools/FileReadTool/prompt.js')) {
      return {
        FILE_READ_TOOL_NAME: 'Read',
        isFileUnchangedStub: value => value.startsWith('[UNCHANGED]'),
      }
    }
    if (specifier.endsWith('/tools/FileWriteTool/prompt.js')) {
      return { FILE_WRITE_TOOL_NAME: 'Write' }
    }
    if (specifier.endsWith('/debug.js')) {
      return {
        logForDebugging(message, options) {
          state.debug.push({ message, options })
        },
      }
    }
    if (specifier.endsWith('/envUtils.js')) {
      return { isEnvTruthy: () => false }
    }
    if (specifier.endsWith('/errors.js')) {
      return {
        getErrnoCode: error => error?.code,
        isFsInaccessible: error =>
          ['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'ELOOP'].includes(
            error?.code,
          ),
      }
    }
    if (specifier.endsWith('/file.js')) {
      return {
        getFileModificationTime: filePath => state.disk.get(filePath)?.mtime,
        stripLineNumberPrefix: line => line.replace(/^\s*\d+→/, ''),
      }
    }
    if (specifier.endsWith('/fileRead.js')) {
      return {
        readFileSyncWithMetadata(filePath) {
          state.diskReads.push(filePath)
          const entry = state.disk.get(filePath)
          if (entry?.error) throw entry.error
          assert.ok(entry, `missing disk fixture for ${filePath}`)
          return { content: entry.content }
        },
      }
    }
    if (specifier.endsWith('/fileStateCache.js')) {
      return { createFileStateCacheWithSizeLimit: () => new Map() }
    }
    if (specifier.endsWith('/messages.js')) {
      return {
        isNotEmptyMessage: () => true,
        normalizeMessages: messages => messages,
      }
    }
    if (specifier.endsWith('/path.js')) {
      return {
        expandPath(filePath, cwd) {
          if (filePath === 'malformed') throw new Error('bad path')
          return path.resolve(cwd, filePath)
        },
      }
    }
    if (specifier.endsWith('/sessionStorage.js')) {
      return { recordTranscript: async () => {} }
    }
    throw new Error(`unexpected queryHelpers import: ${specifier}`)
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return { ...module.exports, state }
}

function assistant(...content) {
  return { type: 'assistant', message: { content } }
}

function user(timestamp, ...content) {
  return { type: 'user', timestamp, message: { content } }
}

function toolUse(id, name, input) {
  return { type: 'tool_use', id, name, input }
}

function toolResult(toolUseId, content, isError = false) {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
    is_error: isError,
  }
}

function errno(code) {
  return Object.assign(new Error(code), { code })
}

test('target 2.1.116 pins the complete hardened file-cache extractor', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  const baselineRegion = structural.unmatchedBaseline.find(
    unit => unit.index === baselineUnit.index,
  )
  assert.ok(baselineRegion)
  assert.deepEqual(
    [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
    [baselineUnit.start, baselineUnit.end, baselineUnit.sourceHash],
  )
  assert.equal(
    sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )

  const targetRegion = structural.regions[targetUnit.index]
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      targetRegion.target.start,
      targetRegion.target.end,
      targetRegion.target.sourceHash,
    ],
    [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
  )
  const targetFunction = target.slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(targetFunction), targetUnit.sourceHash)

  for (const row of typedRows) {
    assert.equal(target.slice(row.start, row.end), row.value, `row ${row.row}`)
    assert.equal(
      baseline.slice(baselineUnit.start, baselineUnit.end).includes(row.value),
      false,
      `row ${row.row}: baseline`,
    )
    assert.equal(
      targetFunction.includes(row.value),
      true,
      `row ${row.row}: target`,
    )
  }
})

test('source isolates malformed tool paths and preserves later valid entries', sourceOptions, async () => {
  const { extractReadFilesFromMessages, state } =
    await instantiateSourceHarness()
  const cwd = '/workspace'
  const timestamp = '2026-04-20T13:57:26.000Z'
  const editPath = path.resolve(cwd, 'edited.txt')
  const directoryPath = path.resolve(cwd, 'directory')
  state.disk.set(editPath, { content: 'after edit', mtime: 42 })
  state.disk.set(directoryPath, { error: errno('EISDIR') })

  const cache = extractReadFilesFromMessages(
    [
      assistant(
        toolUse('wrong-type', 'Read', { file_path: 42 }),
        toolUse('bad-path', 'Read', { file_path: 'malformed' }),
        toolUse('read-ok', 'Read', { file_path: 'read.txt' }),
        toolUse('write-empty', 'Write', {
          file_path: 'empty.txt',
          content: '',
        }),
        toolUse('edit-dir', 'Edit', { file_path: 'directory' }),
        toolUse('edit-ok', 'Edit', { file_path: 'edited.txt' }),
      ),
      user(
        timestamp,
        toolResult('wrong-type', 'must be ignored'),
        toolResult('bad-path', 'must be ignored'),
        toolResult(
          'read-ok',
          '  1→alpha\n<system-reminder>secret</system-reminder>\n  2→beta',
        ),
        toolResult('write-empty', 'ok'),
        toolResult('edit-dir', 'ok'),
        toolResult('edit-ok', 'ok'),
      ),
    ],
    cwd,
  )

  assert.deepEqual(state.debug, [
    {
      message:
        'extractReadFilesFromMessages: skipping malformed Read tool_use: Error: bad path',
      options: undefined,
    },
  ])
  assert.deepEqual(cache.get(path.resolve(cwd, 'read.txt')), {
    content: 'alpha\n\nbeta',
    timestamp: Date.parse(timestamp),
    offset: 1,
    limit: undefined,
  })
  assert.deepEqual(cache.get(path.resolve(cwd, 'empty.txt')), {
    content: '',
    timestamp: Date.parse(timestamp),
    offset: undefined,
    limit: undefined,
  })
  assert.deepEqual(cache.get(editPath), {
    content: 'after edit',
    timestamp: 42,
    offset: undefined,
    limit: undefined,
  })
  assert.equal(cache.has(path.resolve(cwd, '42')), false)
  assert.deepEqual(state.diskReads, [directoryPath, editPath])
})

test('source suppresses failed Read, Write, and Edit results', sourceOptions, async () => {
  const { extractReadFilesFromMessages, state } =
    await instantiateSourceHarness()
  const cwd = '/workspace'
  const timestamp = '2026-04-20T13:57:26.000Z'
  const editPath = path.resolve(cwd, 'edit-error.txt')
  state.disk.set(editPath, { content: 'must not be read', mtime: 9 })

  const cache = extractReadFilesFromMessages(
    [
      assistant(
        toolUse('read-error', 'Read', { file_path: 'read-error.txt' }),
        toolUse('write-error', 'Write', {
          file_path: 'write-error.txt',
          content: 'must not be cached',
        }),
        toolUse('edit-error', 'Edit', { file_path: 'edit-error.txt' }),
      ),
      user(
        timestamp,
        toolResult('read-error', 'must not be cached', true),
        toolResult('write-error', 'failed', true),
        toolResult('edit-error', 'failed', true),
      ),
    ],
    cwd,
  )

  assert.equal(cache.size, 0)
  assert.deepEqual(state.diskReads, [])
})

test('source keeps dedup state and rethrows unexpected Edit read failures', sourceOptions, async () => {
  const { extractReadFilesFromMessages, state } =
    await instantiateSourceHarness()
  const cwd = '/workspace'
  const editPath = path.resolve(cwd, 'edit-eio.txt')
  state.disk.set(editPath, { error: errno('EIO') })

  const dedupCache = extractReadFilesFromMessages(
    [
      assistant(
        toolUse('read-real', 'Read', { file_path: 'same.txt' }),
        toolUse('read-stub', 'Read', { file_path: 'same.txt' }),
      ),
      user(
        '2026-04-20T13:57:26.000Z',
        toolResult('read-real', '  1→real content'),
      ),
      user(
        '2026-04-20T13:58:26.000Z',
        toolResult('read-stub', '[UNCHANGED] same file'),
      ),
    ],
    cwd,
  )
  assert.equal(
    dedupCache.get(path.resolve(cwd, 'same.txt')).content,
    'real content',
  )

  assert.throws(
    () =>
      extractReadFilesFromMessages(
        [
          assistant(
            toolUse('edit-eio', 'Edit', { file_path: 'edit-eio.txt' }),
          ),
          user(
            '2026-04-20T13:57:26.000Z',
            toolResult('edit-eio', 'ok'),
          ),
        ],
        cwd,
      ),
    error => error?.code === 'EIO',
  )
})
