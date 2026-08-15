import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const followupPath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const row = {
  index: 16847,
  nodeType: 'FunctionDeclaration',
  start: 12037336,
  end: 12038111,
  hash: '3094b3fa45f60ae091f404bbcdfc8bbfe01dfee6f49363d1e7f412a5791558d3',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source() {
  return fs.readFileSync(path.join(sourceRoot, 'upstreamproxy/relay.ts'), 'utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
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

async function executeBunRelay(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `${contents}\nexport { startBunRelay }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  let socketHandlers
  const Bun = {
    listen(options) {
      socketHandlers = options.socket
      return { port: 43123, stop: () => undefined }
    },
  }
  const noop = () => undefined
  const require = id => {
    if (id === 'node:net') return { createServer: noop }
    if (id.endsWith('/utils/debug.js')) return { logForDebugging: noop }
    if (id.endsWith('/utils/mtls.js')) {
      return { getWebSocketTLSOptions: () => undefined }
    }
    if (id.endsWith('/utils/proxy.js')) {
      return {
        getWebSocketProxyAgent: () => undefined,
        getWebSocketProxyUrl: () => undefined,
      }
    }
    throw new Error(`unexpected relay import: ${id}`)
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'Bun', 'Buffer', javascript)(
    require,
    module.exports,
    module,
    Bun,
    Buffer,
  )
  const relay = module.exports.startBunRelay(
    'wss://relay.test',
    'Basic auth',
    'Bearer auth',
  )
  assert.equal(relay.port, 43123)
  assert.ok(socketHandlers)
  return socketHandlers
}

function fakeSocket(writeResults) {
  return {
    data: undefined,
    endCount: 0,
    writes: [],
    write(payload) {
      const bytes =
        typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload
      const accepted = Math.min(
        writeResults.length > 0 ? writeResults.shift() : bytes.length,
        bytes.length,
      )
      this.writes.push(Buffer.from(bytes.subarray(0, accepted)))
      return accepted
    },
    end() {
      this.endCount++
    },
  }
}

test(
  'authenticated target105 introduces deferred close and keeps it through 107 and 116',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !followupPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, 2.1.107, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const artifacts = [
      [baselinePath, 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39', 0],
      [targetPath, '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75', 4],
      [followupPath, '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844', 4],
      [latestPath, 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a', 4],
    ]
    const contents = artifacts.map(([filename, hash, count]) => {
      const bytes = fs.readFileSync(filename)
      assert.equal(sha256(bytes), hash)
      const text = bytes.toString('utf8')
      assert.equal(occurrences(text, 'endAfterDrain'), count)
      return text
    })

    const region = structural.regions[row.index]
    assert.equal(region.classification, 'unresolved')
    assert.equal(region.target.index, row.index)
    assert.equal(region.target.nodeType, row.nodeType)
    assert.equal(region.target.parseStatus, 'parsed')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [row.start, row.end, row.hash],
    )
    const targetUnit = contents[1].slice(row.start, row.end)
    assert.equal(sha256(targetUnit), row.hash)
    assert.equal(occurrences(targetUnit, 'endAfterDrain'), 4)
    for (const fragment of [
      'writeBuf:[],endAfterDrain:!1',
      'endAfterDrain=!0',
      'if(A.endAfterDrain)',
      'A.endAfterDrain=!1',
    ]) assert.ok(targetUnit.includes(fragment), fragment)
  },
)

test(
  'source root defers Bun socket close until every queued tail drains',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const contents = source()
    assert.equal(occurrences(contents, 'endAfterDrain'), 5)
    for (const fragment of [
      'endAfterDrain: boolean',
      'endAfterDrain: false',
      'if (st.writeBuf.length > 0)',
      'st.endAfterDrain = true',
      'if (st.endAfterDrain)',
      'st.endAfterDrain = false',
    ]) assert.ok(contents.includes(fragment), fragment)

    const handlers = await executeBunRelay(contents)
    const socket = fakeSocket([5, 3, 1_000])
    handlers.open(socket)
    assert.equal(socket.data.endAfterDrain, false)

    // An oversized, unterminated CONNECT header produces a 400 then end().
    // The first partial write must arm deferred close instead of truncating.
    handlers.data(socket, Buffer.alloc(8193, 0x61))
    assert.equal(socket.endCount, 0)
    assert.equal(socket.data.endAfterDrain, true)
    assert.equal(socket.data.writeBuf.length, 1)
    const firstTailLength = socket.data.writeBuf[0].length

    // A partial drain keeps both the remaining tail and close intent.
    handlers.drain(socket)
    assert.equal(socket.endCount, 0)
    assert.equal(socket.data.endAfterDrain, true)
    assert.equal(socket.data.writeBuf[0].length, firstTailLength - 3)

    // The final drain consumes the tail, clears the flag, then closes once.
    handlers.drain(socket)
    assert.equal(socket.data.writeBuf.length, 0)
    assert.equal(socket.data.endAfterDrain, false)
    assert.equal(socket.endCount, 1)

    // When the response is accepted in full, end remains immediate.
    const immediate = fakeSocket([1_000])
    handlers.open(immediate)
    handlers.data(immediate, Buffer.alloc(8193, 0x61))
    assert.equal(immediate.data.writeBuf.length, 0)
    assert.equal(immediate.data.endAfterDrain, false)
    assert.equal(immediate.endCount, 1)
  },
)
