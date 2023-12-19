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

const units = new Map([
  [13729, ['matched', 10195448, 10196230, 'FunctionDeclaration', 'baadf49e96f6a7b6cf3d95caf96f0f0dc09e4dbe66d359af5d99d5ce1a9b6c05']],
  [13735, ['unresolved', 10197757, 10203657, 'FunctionDeclaration', '31830bb94815ad9ab126dbde89aef4ecb5c39dfdd0f8680de107d29da0e85181']],
  [13740, ['unresolved', 10206652, 10208405, 'FunctionDeclaration', '45a2582000f48c54c42e5debd60338739bca2f505aec6c78bf6eb29595496a12']],
  [13741, ['matched', 10208405, 10208511, 'VariableDeclaration', 'beee56298c9ec6644a9df0b76036dea8ff6c34408e077a18cdc7d585fada6ace']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrenceCount(contents, value) {
  return contents.split(value).length - 1
}

function ownerSource() {
  return fs.readFileSync(path.join(sourceRoot, 'components/Feedback.tsx'), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
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

async function compileFeedbackRuntime(contents) {
  const start = contents.indexOf('const FEEDBACK_ARRAY_FIELDS')
  const endMarker = contents.indexOf('//# sourceMappingURL', start)
  const end = endMarker === -1 ? contents.length : endMarker
  assert.notEqual(start, -1, 'feedback serializer declaration')
  const declarations = contents.slice(start, end)
  const prelude = `
    export const controls = {
      essential: false,
      auth: { headers: { authorization: 'Bearer test' } },
      postResult: { status: 200, data: { feedback_id: 'fb_1' } },
      postError: null,
      posts: [],
      logged: [],
    };
    const jsonStringify = JSON.stringify;
    const MAX_FEEDBACK_PAYLOAD_BYTES = 8 * 1024 * 1024;
    const serializeWrappedContent = value =>
      Buffer.from(JSON.stringify({ content: JSON.stringify(value) }));
    const isEssentialTrafficOnly = () => controls.essential;
    const checkAndRefreshOAuthTokenIfNeeded = async () => {};
    const getAuthHeaders = () => controls.auth;
    const getUserAgent = () => 'test-agent';
    const sanitizeAndLogError = error => controls.logged.push(error);
    const axios = {
      post: async (...args) => {
        controls.posts.push(args);
        if (controls.postError) throw controls.postError;
        return controls.postResult;
      },
      isCancel: error => error?.cancel === true,
      isAxiosError: error => error?.isAxios === true,
    };
  `
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `${prelude}\n${declarations}\nexport { serializeFeedbackPayload, submitFeedback };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'Buffer', javascript)(
    module.exports,
    module,
    Buffer,
  )
  return module.exports
}

test(
  'authenticated target105 pins bounded feedback serialization, retry, and failure classification',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    for (const fragment of [
      'payload_too_large_precheck',
      'payload_too_large_range_error',
      'payload_too_large_413',
      'payload_too_large_timeout',
      'retried_after_too_large',
      'tengu_bug_report_failed',
    ]) {
      assert.equal(occurrenceCount(baseline, fragment), 0, `${fragment}: baseline`)
      assert.equal(occurrenceCount(target, fragment), 1, `${fragment}: target105`)
      assert.equal(occurrenceCount(latest, fragment), 1, `${fragment}: target116`)
    }
    const component = target.slice(units.get(13735)[1], units.get(13735)[2])
    assertFragments(component, [
      'payloadTooLarge',
      'transcript:[]',
      'retried_after_too_large',
      'first_attempt_too_large',
      'onKeyDown',
      'preventDefault',
      'Could not submit feedback. Please try again later.',
    ], 'target105 component')
    assert.equal(component.includes('skip_github'), false)
    const submit = target.slice(units.get(13740)[1], units.get(13740)[2])
    assertFragments(submit, [
      'failureReason:"auth_error"',
      'failureReason:"missing_feedback_id"',
      'failureReason:"http_error"',
      'failureReason:"zdr_org"',
      'statusCode:403',
      'ECONNABORTED',
    ], 'target105 submit')
    assert.ok(latest.includes('skip_github'))
    assert.ok(latest.includes("Couldn't send feedback: not signed in. Run /login, then retry."))
  },
)

test(
  'authored feedback owner preserves target105 and latest control flow',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = ownerSource()
    const componentStart = source.indexOf('export function Feedback(')
    const componentEnd = source.indexOf('export function createGitHubIssueUrl', componentStart)
    const component = source.slice(componentStart, componentEnd)
    const submitStart = source.indexOf('async function submitFeedback(')
    const submit = source.slice(submitStart)
    assertFragments(component, [
      'const [initialResult, t] = await Promise.all',
      'if (!result.success && result.payloadTooLarge)',
      'result = await submitFeedback({ ...minimalReport, transcript: [] }, abortSignal)',
      "logEvent('tengu_bug_report_failed'",
      'first_attempt_too_large:',
      'tabIndex={0} autoFocus onKeyDown=',
      'event.preventDefault()',
    ], 'component')
    assert.equal(component.includes('useInput('), false)
    assertFragments(source, [
      'const MAX_FEEDBACK_PAYLOAD_BYTES = 8 * 1024 * 1024',
      "const FEEDBACK_ARRAY_FIELDS = new Set(['transcript'])",
      "const FEEDBACK_TRANSCRIPT_MAP_FIELDS = new Set(['subagentTranscripts'])",
      'function serializeFeedbackPayload(data: FeedbackData): Buffer',
    ], 'serializer')
    assertFragments(submit, [
      'payloadBytes = body.length',
      'payloadBytes > MAX_FEEDBACK_PAYLOAD_BYTES',
      "failureReason: 'payload_too_large_precheck'",
      "failureReason: 'auth_error'",
      "failureReason: 'missing_feedback_id'",
      "failureReason: 'payload_too_large_range_error'",
      "failureReason: 'payload_too_large_413'",
      "failureReason: 'payload_too_large_timeout'",
      "failureReason: 'zdr_org'",
      "failureReason: axios.isAxiosError(err) && err.code === 'ECONNABORTED' ? 'timeout' : 'network_error'",
    ], 'submit')

    const isCurrent = sourceRoot === path.resolve(repositoryRoot, 'src')
    if (isCurrent) {
      assert.ok(component.includes('skip_github: String(skipGitHub)'))
      assert.ok(component.includes("Couldn't send feedback: not signed in. Run /login, then retry."))
    } else {
      assert.equal(component.includes('skip_github'), false)
      assert.ok(component.includes('Could not submit feedback. Please try again later.'))
    }
  },
)

test(
  'feedback serializer and result classifier execute every observable branch',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const { controls, serializeFeedbackPayload, submitFeedback } =
      await compileFeedbackRuntime(ownerSource())
    const data = {
      description: 'hello',
      transcript: [{ role: 'user', content: 'line\nquote"' }],
      subagentTranscripts: {
        agent1: [{ role: 'assistant', content: 'done' }],
      },
    }
    const body = serializeFeedbackPayload(data)
    assert.ok(Buffer.isBuffer(body))
    assert.deepEqual(JSON.parse(JSON.parse(body.toString()).content), data)

    const reset = () => {
      controls.essential = false
      controls.auth = { headers: { authorization: 'Bearer test' } }
      controls.postResult = { status: 200, data: { feedback_id: 'fb_1' } }
      controls.postError = null
      controls.posts.length = 0
      controls.logged.length = 0
    }

    reset()
    const success = await submitFeedback(data)
    assert.deepEqual(
      success,
      { success: true, feedbackId: 'fb_1' },
      controls.logged.map(error => String(error?.stack ?? error)).join('\n'),
    )
    assert.ok(Buffer.isBuffer(controls.posts[0][1]))

    reset()
    const oversized = await submitFeedback({
      description: 'x'.repeat(8 * 1024 * 1024),
      transcript: [],
    })
    assert.deepEqual(oversized, {
      success: false,
      payloadTooLarge: true,
      failureReason: 'payload_too_large_precheck',
    })
    assert.equal(controls.posts.length, 0)

    reset()
    controls.auth = { error: 'missing' }
    assert.deepEqual(await submitFeedback(data), {
      success: false,
      failureReason: 'auth_error',
    })

    reset()
    controls.postResult = { status: 200, data: {} }
    assert.deepEqual(await submitFeedback(data), {
      success: false,
      failureReason: 'missing_feedback_id',
    })

    reset()
    controls.postResult = { status: 503, data: {} }
    assert.deepEqual(await submitFeedback(data), {
      success: false,
      failureReason: 'http_error',
      statusCode: 503,
    })

    reset()
    controls.postError = { isAxios: true, response: { status: 413 } }
    assert.deepEqual(await submitFeedback(data), {
      success: false,
      payloadTooLarge: true,
      failureReason: 'payload_too_large_413',
      statusCode: 413,
    })

    reset()
    controls.postError = { isAxios: true, code: 'ECONNABORTED' }
    const largeTimeout = await submitFeedback({
      description: 'x'.repeat(2 * 1024 * 1024),
      transcript: [],
    })
    assert.deepEqual(largeTimeout, {
      success: false,
      payloadTooLarge: true,
      failureReason: 'payload_too_large_timeout',
    })

    reset()
    controls.postError = {
      isAxios: true,
      response: {
        status: 403,
        data: {
          error: {
            type: 'permission_error',
            message: 'Custom data retention settings are enabled',
          },
        },
      },
    }
    assert.deepEqual(await submitFeedback(data), {
      success: false,
      isZdrOrg: true,
      failureReason: 'zdr_org',
      statusCode: 403,
    })

    reset()
    controls.postError = { isAxios: true, code: 'ECONNABORTED' }
    assert.deepEqual(await submitFeedback(data), {
      success: false,
      failureReason: 'timeout',
    })

    reset()
    controls.postError = { isAxios: true, code: 'ENETUNREACH' }
    assert.deepEqual(await submitFeedback(data), {
      success: false,
      failureReason: 'network_error',
    })
  },
)
