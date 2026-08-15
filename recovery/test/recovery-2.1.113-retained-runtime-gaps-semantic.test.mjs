import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE

const BASELINE_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const TARGET_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
const units = [
  [9391, 4750684, 4750947, 'FunctionDeclaration', '0e1129f12ab53898b0ea0ee8c952a66e2b85bdda54d0e10fc6f5a57e919cef88'],
  [9650, 4851090, 4852515, 'VariableDeclaration', '318f73c324ae1ec5bb443ac788f6f21a1c31c24eb82a142972c3a956325f7ad7'],
  [10044, 5038189, 5039060, 'FunctionDeclaration', 'c21f3e7b1279d0ba35d9b8555a7a1965d0af72e638295f470e72cfb6fe845480'],
  [10045, 5039060, 5039245, 'FunctionDeclaration', '11ca7ae9f149065b5beb5e26a7af57a2de5c5ddc07e580aa8d57c7bc9c1d7480'],
  [10046, 5039245, 5040818, 'FunctionDeclaration', '9dd5f0d60cdb5ec041538efe1deb3b572dffb1ec7694e8d19dd0712b6281dc1f'],
  [10066, 5047910, 5049677, 'FunctionDeclaration', '038a6d80ce77e4e99dc435e15986300144379233db42d7d7f351a0604d96c376'],
  [10068, 5051324, 5053661, 'FunctionDeclaration', '976a5231431cdd9ab23af33cb99ae0778b339ed71afaf16cbf7018afa64ac67c'],
  [11285, 7148270, 7151939, 'FunctionDeclaration', '6bbb28c76dce5fbe8e8d5cff11f25e9b2122f0d0dd9e89870b5748b56d85893c'],
  [11719, 7475780, 7477502, 'FunctionDeclaration', '2340d6e8cd19bbb1bfe7189ba30ae230bfbaf660a898a04f2423813563e0d815'],
  [13655, 8679131, 8681310, 'FunctionDeclaration', 'f21ba2e770d9b8a7af24faa52593a9278b8325b2a237ba1636164830254f9de6'],
  [13669, 8685068, 8685176, 'FunctionDeclaration', 'a7c2f9a7fe966648d6ce35466548544325e3515102679174b4f5c3894fdc876f'],
  [14599, 9170271, 9174916, 'FunctionDeclaration', 'dcfa7f3dcda46341240e89805c252155af95cf588709d9635d1722c43d249f67'],
  [14903, 9330417, 9335859, 'VariableDeclaration', '3c4b6920a4a932814d667c5bd8c66bcc4a4d372b73c50e16c8cb2f6e799cdfe9'],
  [17291, 10790107, 10790410, 'VariableDeclaration', '4ec155c2444aa47a2b12ed0b19ea00c5b016787537c080221e0612123e2f9420'],
  [17295, 10790560, 10791763, 'VariableDeclaration', 'd74dac331bb8198e586c667eba1cf3fffa07b4d5149e75f6142472b3795ad89a'],
  [18046, 11161578, 11182480, 'FunctionDeclaration', '28ea106cf36db06ec6e8af62a52b3846e3c18d0c8d9b7328b918b679395cf61a'],
  [19145, 11771359, 11771530, 'FunctionDeclaration', '14da1b1bac34892438c8d0d50eb2859a1a1da4b0d356b56c2d8e933e9c339849'],
  [19146, 11771530, 11772188, 'FunctionDeclaration', 'e7cb8bae94700f6f4d3961cb8aff3281d53d59bb804a5a6d1a7ec14fa1db6c7e'],
  [19147, 11772188, 11772443, 'FunctionDeclaration', 'db7a823186a7c99ee85c356c3c02f38c6b261ff27f19813b59aac6cf948fa7dd'],
  [19148, 11772443, 11773067, 'FunctionDeclaration', '564bad893a36a4cbeb6c33568ede3a798ac94c02dc06d3aced13ef4dffc5fa78'],
  [19349, 11837092, 11837266, 'VariableDeclaration', 'b9669123395e997cab25aa2b439b9f1b6cb0e22c09391509ebe8cb58fbc45628'],
  [20182, 12732973, 12733329, 'FunctionDeclaration', '50f329f28acd4ca29b1a85047fb464b6cce3af91d16e62c78930446d82b5c3d7'],
  [20187, 12736086, 12736532, 'FunctionDeclaration', '8cc6570f66a99cff9435553945e9537d9cc8832a40d6dc45fd15c681b37292be'],
  [20188, 12736532, 12736916, 'FunctionDeclaration', '5ff4e9dec04c3c13f5b75ff37a892f70f2ec95df45ef300a0c3fe884693470c0'],
  [20189, 12736916, 12737244, 'FunctionDeclaration', '0d453682d2cfa46c212b3f3451aaf439fa404a3dcd67a9eac32e740443c874a5'],
  [20190, 12737244, 12737778, 'FunctionDeclaration', '2c2b1934e97c84e4e68e81622742b3517fb465f97562a94dd282764fdbdee503'],
  [20195, 12738274, 12738891, 'VariableDeclaration', '69d1964edcdcd3330f5f84a62f01a3f6a1ac7f4f18e7c5914656f7dd0bdf2503'],
  [20433, 12922964, 12979569, 'FunctionDeclaration', '475117eb91b4cbe5aa8dc27e7049feead92c484e180afad7c5a31c4018f775e3'],
]

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

function bundle(filename, expected) {
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expected)
  return bytes.toString('utf8')
}

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function owner(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target113 authenticates the retained runtime-hardening units and inner-bundle literals',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
  },
  () => {
    const baseline = bundle(baselinePath, BASELINE_SHA256)
    const target = bundle(targetPath, TARGET_SHA256)
    const rows = [...structural.regions, ...structural.unresolvedTarget]
    for (const expected of units) {
      const row = rows.find(entry => entry.target?.index === expected[0])
      assert.ok(row, `missing target unit ${expected[0]}`)
      const actual = row.target
      assert.deepEqual(
        [actual.index, actual.start, actual.end, actual.nodeType, actual.sourceHash],
        expected,
      )
      assert.equal(
        sha256(target.slice(actual.start, actual.end)),
        actual.sourceHash,
      )
    }

    const introduced = [
      'Plugin option "',
      'SIGHUP_ignored_bg',
      'gen_ai.system',
      'gen_ai.request.model',
      'gen_ai.request.attempt',
      'LLM Attempt',
      'api,attempt',
      'gen_ai.response.id',
      'retired-dir cleanup failed: ',
      ' after install failure: ',
      "Use 'global', 'us', or 'eu' for a multi-region endpoint (recommended), or a specific location like us-east5 if you have regional quota.",
      'The user included the keyword "ultrathink", requesting deeper reasoning on this turn. Reason as thoroughly as the task warrants.',
      'Exit the CLI',
      'transcript_path_drift',
      'Invalid cwd in deep link: UNC / network paths',
      'Deep link cwd contains invisible or bidirectional control characters',
      '--prefill-b64',
      '--deep-link-cwd-b64',
    ]
    for (const marker of introduced) {
      assert.equal(occurrences(baseline, marker), 0, marker)
      assert.ok(occurrences(target, marker) >= 1, marker)
    }

    // Structural units use the inner bundle. These exact positions ensure a
    // wrapped cli.js (+87 UTF-16 code units) cannot silently masquerade as it.
    assert.equal(target.slice(4750795, 4750810), 'Plugin option "')
    assert.equal(target.slice(5039183, 5039205), 'gen_ai.request.attempt')
    assert.equal(
      target.slice(11771582, 11771627),
      'Invalid cwd in deep link: UNC / network paths',
    )
    assert.match(
      target.slice(11161578, 11182480),
      /clientRequestId:[A-Za-z_$][\w$]*\?void 0:[A-Za-z_$][\w$]*/,
    )
    assert.match(
      target.slice(5038189, 5039060),
      /llm_request\.context.*?tool.*?interaction.*?standalone/,
    )
    assert.match(
      target.slice(5039245, 5040818),
      /setStatus\(\{code:.*?ERROR,message:/,
    )
    assert.match(
      target.slice(5047910, 5049677),
      /clientRequestId:.*?\?void 0:/,
    )
    assert.match(
      target.slice(5051324, 5053661),
      /request_id:.*?\?\?void 0/,
    )
  },
)

test(
  'target113 executable helpers reject unsafe inputs and preserve request-attempt metadata',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const target = bundle(targetPath, TARGET_SHA256)

    const substitute = Function(
      `${target.slice(4750684, 4750947)}; return g_H`,
    )()
    assert.equal(substitute('x=${user_config.name}', { name: 'Ada' }), 'x=Ada')
    assert.throws(
      () => substitute('${user_config.missing}', {}),
      /Plugin option "missing" isn't set\. Open \/plugin manage/,
    )

    const spanEvents = []
    const perfettoEvents = []
    const attempt = Function(
      'YR',
      'VvK',
      `${target.slice(5039060, 5039245)}; return YTK`,
    )(
      () => true,
      (name, category, attributes) =>
        perfettoEvents.push({ name, category, attributes }),
    )
    attempt(
      { addEvent: (name, attributes) => spanEvents.push({ name, attributes }) },
      { attempt: 3, clientRequestId: 'client-3' },
    )
    assert.deepEqual(spanEvents, [
      {
        name: 'gen_ai.request.attempt',
        attributes: { attempt: 3, client_request_id: 'client-3' },
      },
    ])
    assert.deepEqual(perfettoEvents, [
      {
        name: 'LLM Attempt',
        category: 'api,attempt',
        attributes: { attempt: 3, client_request_id: 'client-3' },
      },
    ])

    const validateCwd = Function(
      'es7',
      `${target.slice(11771359, 11772188)}; return hJ6`,
    )(4096)
    assert.doesNotThrow(() => validateCwd('/safe/project'))
    assert.doesNotThrow(() =>
      validateCwd('/safe/\u200c\u200d\ufe0f\u{e0100}project'),
    )
    assert.throws(() => validateCwd('//server/share'), /UNC \/ network paths/)
    assert.throws(
      () => validateCwd('/safe/\u0080project'),
      /disallowed control characters/,
    )
    assert.throws(
      () => validateCwd('/safe/\u202eproject'),
      /invisible or bidirectional control characters/,
    )

    const sanitizeQuery = Function(
      'V16',
      'ts7',
      `${target.slice(11771359, 11771530)};${target.slice(11772188, 11772443)}; return SJ6`,
    )(value => value, 5000)
    assert.equal(sanitizeQuery('  preserve me  '), '  preserve me  ')
    assert.equal(sanitizeQuery('one\r\ntwo'), 'one\ntwo')
    assert.throws(
      () => sanitizeQuery('unsafe\u0080query'),
      /disallowed control characters/,
    )

    const ultrathink = Function(
      'zs',
      'b5K',
      'l',
      `${target.slice(8685068, 8685176)}; return O71`,
    )(
      () => true,
      value => value.includes('ultrathink'),
      () => {},
    )
    assert.deepEqual(ultrathink('please ultrathink'), [
      { type: 'ultrathink_effort' },
    ])

    const buildLaunchArgs = Function(
      'Buffer',
      `${target.slice(12736916, 12737244)}; return ypH`,
    )(Buffer)
    const launchArgs = buildLaunchArgs({
      query: 'review this; safely',
      cwd: '/tmp/project with space',
      repo: 'owner/repo',
      lastFetchMs: 42,
    })
    assert.deepEqual(launchArgs.slice(0, 3), [
      '--deep-link-origin',
      '--deep-link-repo=owner/repo',
      '--deep-link-last-fetch=42',
    ])
    assert.equal(
      Buffer.from(launchArgs[3].split('=')[1], 'base64url').toString('utf8'),
      '/tmp/project with space',
    )
    assert.equal(
      Buffer.from(launchArgs[4].split('=')[1], 'base64url').toString('utf8'),
      'review this; safely',
    )

    const windowsCalls = []
    const launchWindows = Function(
      'ypH',
      'Na1',
      'v9_',
      'E9_',
      `${target.slice(12736086, 12736532)}; return ka1`,
    )(
      buildLaunchArgs,
      value => `'${value.replaceAll('"', '').replaceAll("'", "''")}'`,
      value => `"${value.replace(/[\n\t]/g, ' ').replace(/["%]/g, '')}"`,
      async (command, args, options) => {
        windowsCalls.push({ command, args, options })
        return true
      },
    )
    await launchWindows(
      { name: 'Windows Terminal', command: 'wt.exe' },
      'C:/Claude;Code/claude.exe',
      { cwd: 'C:/work;tree', query: 'do & this' },
    )
    await launchWindows(
      { name: 'PowerShell', command: 'pwsh.exe' },
      'C:/Claude Code/claude.exe',
      { cwd: 'C:/raw cwd', query: 'do & this' },
    )
    await launchWindows(
      { name: 'Command Prompt', command: 'cmd.exe' },
      'C:/Claude Code/claude.exe',
      { cwd: 'C:/raw cwd', query: 'do & this' },
    )
    assert.deepEqual(windowsCalls[0].args.slice(0, 3), [
      '-d',
      'C:/work\\;tree',
      '--',
    ])
    assert.equal(windowsCalls[0].args[3], 'C:/Claude\\;Code/claude.exe')
    assert.equal(windowsCalls[1].args[0], '-NoExit')
    assert.ok(!windowsCalls[1].args[2].includes('C:/raw cwd'))
    assert.equal(windowsCalls[1].options.cwd, 'C:/raw cwd')
    assert.deepEqual(windowsCalls[2].args.slice(0, 4), [
      '/d',
      '/v:off',
      '/s',
      '/k',
    ])
    assert.ok(!windowsCalls[2].args[4].includes('do & this'))
    assert.equal(windowsCalls[2].options.cwd, 'C:/raw cwd')

    const spawnAttempts = []
    const spawnDetached = Function(
      'N',
      'T9_',
      `${target.slice(12736532, 12736916)}; return E9_`,
    )(
      () => {},
      {
        spawn(_command, _args, options) {
          spawnAttempts.push(options.cwd)
          if (options.cwd) throw new Error('bad cwd')
          return {
            once(event, callback) {
              if (event === 'spawn') queueMicrotask(callback)
            },
            unref() {},
          }
        },
      },
    )
    assert.equal(
      await spawnDetached('terminal', [], { cwd: '/missing' }),
      true,
    )
    assert.deepEqual(spawnAttempts, ['/missing', undefined])

    const shellCommand = Function(
      'ypH',
      'Va1',
      `${target.slice(12737244, 12737778)}; return G9_`,
    )(buildLaunchArgs, /^[A-Za-z0-9 /._=-]+$/)
    assert.match(
      shellCommand('/safe/claude', { cwd: '/tmp/x y' }),
      /^\/safe\/claude --deep-link-origin /,
    )
    assert.throws(
      () => shellCommand("/unsafe/'claude", { cwd: '/tmp' }),
      /Deep-link launch unsupported/,
    )
  },
)

test(
  'authored source retains every target113 hardening edge without wrapper-relative evidence',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const expected = new Map([
      ['utils/plugins/pluginOptionsStorage.ts', [
        'Plugin option "${key}" isn\'t set. Open /plugin manage',
      ]],
      ['utils/gracefulShutdown.ts', [
        "process.env.CLAUDE_BG_BACKEND === 'daemon'",
        "signal: 'SIGHUP_ignored_bg'",
      ]],
      ['utils/telemetry/sessionTracing.ts', [
        "'gen_ai.system': 'anthropic'",
        "'gen_ai.request.model': model",
        'const toolSpanCtx = getActiveToolSpanContext()',
        "? 'tool'",
        "span.addEvent('gen_ai.request.attempt'",
        "endAttributes['gen_ai.response.id']",
        "endAttributes['client_request_id']",
        'code: SpanStatusCode.ERROR',
      ]],
      ['services/api/claude.ts', [
        'recordLLMRequestAttempt(llmSpan',
        'attempt: attemptStartTimes.length',
        'clientRequestId: didFallBackToNonStreaming ? undefined : clientRequestId',
      ]],
      ['services/api/logging.ts', [
        'requestId: requestId ?? undefined',
        'clientRequestId: didFallBackToNonStreaming ? undefined : clientRequestId',
        'request_id: requestId ?? undefined',
      ]],
      ['utils/autoUpdater.ts', [
        "getPlatform() === 'windows'",
        '/\\.exe\\.old\\.\\d+$/.test(name)',
        'retired-dir cleanup failed:',
        'Failed to restore ${original} after install failure:',
      ]],
      ['components/VertexSetupWizard.tsx', [
        "Use 'global', 'us', or 'eu' for a multi-region endpoint",
      ]],
      ['tools/BashTool/prompt.ts', [
        'never prepend `cd <current-directory>` to a `git` command',
      ]],
      ['utils/messages.ts', [
        'The user included the keyword "ultrathink", requesting deeper reasoning on this turn.',
      ]],
      ['utils/attachments.ts', [
        "return [{ type: 'ultrathink_effort' }]",
      ]],
      ['commands/exit/index.ts', ["description: 'Exit the CLI'"]],
      ['utils/deepLink/parseDeepLink.ts', [
        'UNC / network paths are not supported',
        'export function validateDeepLinkCwd',
        'export function sanitizeDeepLinkQuery',
        'partiallySanitizeUnicode(rawQuery).replace',
        'sanitizeDeepLinkQuery(rawQuery.trim())',
        'INVISIBLE_OR_BIDI_CWD_PATTERN',
        'invisible or bidirectional control characters',
      ]],
      ['utils/deepLink/terminalLauncher.ts', [
        'export function buildDeepLinkLaunchArgs',
        "--deep-link-cwd-b64=${encode(action.cwd)}",
        "--prefill-b64=${encode(action.query)}",
        'process.env.ComSpec ??',
        "value.replaceAll(';', '\\\\;')",
        "'/v:off'",
        'spawnWithCwd(undefined)',
        'SHELL_SAFE_ARGS_PATTERN',
        'shell-safe args contain metacharacters',
      ]],
      ['utils/cliArgs.ts', [
        "'--prefill-b64'",
        "'--deep-link-cwd-b64'",
      ]],
      ['main.tsx', [
        "new Option('--prefill-b64 <b64>'",
        "new Option('--deep-link-cwd-b64 <b64>'",
        'validateDeepLinkCwd(options.deepLinkCwdB64)',
        'updateHooksConfigSnapshot()',
      ]],
    ])
    for (const [relative, fragments] of expected) {
      const source = owner(relative)
      for (const fragment of fragments) {
        assert.ok(source.includes(fragment), `${relative}: ${fragment}`)
      }
    }

    const updateSource = owner('commands/update/update.ts')
    const currentSource = path.resolve(sourceRoot) === path.join(repositoryRoot, 'src')
    assert.ok(
      updateSource.includes(
        currentSource
          ? 'this session was resumed from a different project directory'
          : 'session transcript is in a different project directory than the child would resolve',
      ),
    )
  },
)
