import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.97, 2.1.98, and 2.1.116 bundles are required'
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
  [13516, [10100450, 10101232, 'FunctionDeclaration', 'f4ba9b7775345fba837bf610d39d9073809dc76cf2fd4975050521ac46f689d3']],
  [13518, [10101240, 10101426, 'VariableDeclaration', '7894e614ac51301d9a63e2427757ced4a6f4670c794584241163af04f96d2a4a']],
  [13522, [10102759, 10108341, 'FunctionDeclaration', 'fe0a9097057a0804a922b2645618db636718cf0acc8ba83b755b75228c040f8f']],
  [13527, [10111335, 10112563, 'FunctionDeclaration', '3370dcbfa553236eca0fa3a6bb303fe584e461094b6fe710eebe3ac6a4de9e19']],
  [13528, [10112563, 10112669, 'VariableDeclaration', 'c0b0ca12fcb89e80db84017b71a0a606156fe5567ca2b890adf918bb8bfba8c4']],
  [13529, [10112669, 10112910, 'VariableDeclaration', '4e570b45ec9dbefdd3a364b002f2d8181f08240f72f8b4bb5f3180d9f27ddd1f']],
  [17751, [12453324, 12454597, 'FunctionDeclaration', '940525be15e4c3b5348039b94fce2063f291fd6d658e8bddb8b706db5362bbbb']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, owner) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${owner}: ${fragment}`)
  }
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

test(
  'target98 introduces the shared byte serializer and both reachable callers',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
    )
    assert.equal(
      sha256(targetBytes),
      '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    assert.equal(baseline.includes('transformInnerChunk'), false)
    assert.equal(baseline.includes('extraOuterFields'), false)
    assert.equal(target.match(/transformInnerChunk/g)?.length, 2)
    assert.equal(target.match(/extraOuterFields/g)?.length, 2)
    assert.equal((latest.match(/transformInnerChunk/g) ?? []).length, 0)
    assert.equal(latest.match(/extraOuterFields/g)?.length, 2)
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    assertFragments(target.slice(10111335, 10112563), [
      'payloadTooLarge:!0',
      'RRK/8',
      'ECONNABORTED',
      'response?.status===413',
    ], 'target98 feedback submit')
    assertFragments(target.slice(12453324, 12454597), [
      'extraOuterFields:{appearance_id:_}',
      'transformInnerChunk:ze',
    ], 'target98 transcript-share submit')
  },
)

test(
  'authored serializer streams exact wrapped JSON and owns both call paths',
  sourceOptions,
  async () => {
    const serializer = source('utils/wrappedContentSerializer.ts')
    const feedback = source('components/Feedback.tsx')
    const transcriptShare = source(
      'components/FeedbackSurvey/submitTranscriptShare.ts',
    )
    assertFragments(serializer, [
      'class ByteChunkWriter',
      'new TextEncoder()',
      'jsonStringify(transform(chunk)).slice(1, -1)',
      'streamedArrayFields.has(key)',
      'streamedArrayMapFields.has(key)',
      'options?.extraOuterFields ?? {}',
    ], 'wrappedContentSerializer.ts')
    assertFragments(feedback, [
      'serializeWrappedContent(',
      "new Set(['transcript'])",
      "new Set(['subagentTranscripts'])",
      'MAX_FEEDBACK_PAYLOAD_BYTES',
      'payloadTooLarge',
      "err.code === 'ECONNABORTED'",
    ], 'Feedback.tsx')
    assertFragments(transcriptShare, [
      'serializeWrappedContent(',
      "extraOuterFields: { appearance_id: appearanceId }",
      "axios.post(\n      'https://api.anthropic.com/api/claude_code_shared_session_transcripts',\n      body,",
    ], 'submitTranscriptShare.ts')
    if (transcriptShare.includes('sanitizeFeedbackValue')) {
      assertFragments(transcriptShare, [
        'function sanitizeFeedbackValue',
        'JSON.stringify(sanitizeFeedbackValue(JSON.parse(line)))',
        'rawTranscriptJsonl: sanitizedRawTranscript',
      ], 'current submitTranscriptShare.ts')
      assert.equal(
        transcriptShare.includes('transformInnerChunk: redactSensitiveInfo'),
        false,
      )
    } else {
      assert.ok(
        transcriptShare.includes('transformInnerChunk: redactSensitiveInfo'),
      )
    }

    const ts = await loadTypeScript()
    const compiled = ts.transpileModule(
      serializer.replace(
        /import \{ jsonStringify \} from '[^']+'\n/,
        'const jsonStringify = JSON.stringify\n',
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', 'Buffer', 'TextEncoder', compiled)(
      module.exports,
      module,
      Buffer,
      TextEncoder,
    )
    const data = {
      title: 'secret',
      transcript: [{ text: 'one' }, { text: 'two' }],
      subagentTranscripts: { agent: [{ text: 'secret child' }] },
      omitted: undefined,
    }
    const body = module.exports.serializeWrappedContent(
      data,
      new Set(['transcript']),
      new Set(['subagentTranscripts']),
      {
        extraOuterFields: { appearance_id: 'appearance-1' },
        transformInnerChunk: chunk => chunk.replaceAll('secret', '[redacted]'),
      },
    )
    const outer = JSON.parse(body.toString('utf8'))
    assert.equal(outer.appearance_id, 'appearance-1')
    assert.deepEqual(JSON.parse(outer.content), {
      title: '[redacted]',
      transcript: [{ text: 'one' }, { text: 'two' }],
      subagentTranscripts: { agent: [{ text: '[redacted] child' }] },
    })
  },
)
