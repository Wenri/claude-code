import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(root, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        root,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)
const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

const units = new Map([
  [8831, ['FunctionDeclaration', 5900889, 5901355, '4c850f0358d6a8a365fd68612cbe7769d060b2b7231efc6f940c7f31b7c7d383']],
  [8836, ['FunctionDeclaration', 5902878, 5903450, 'd57aae374d7eadeb69cfbb3f787d9614f5d7728b34a332a013f09f8d35e0b645']],
  [11555, ['FunctionDeclaration', 8706868, 8708328, '073719599dc6909279ad2dbfbb48afcefc46cc84a5b3ea0f3db9735983c16df8']],
  [13784, ['FunctionDeclaration', 10028730, 10031919, '1925e49380524294db4ebcccd7aabd6b8cc40a1a82387e679e2636ebcc1ffdc2']],
  [16938, ['FunctionDeclaration', 11816206, 11817881, 'e173af4d99b752cc3e98a4c229b22fa553b8839ac2acf20688a13467e695ed76']],
])

test(
  'target110 pins tracing, shell, retry, and FileEdit compatibility units',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath)
    const target = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baseline),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(target),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const targetText = target.toString('utf8')
    for (const [index, [nodeType, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [
          region.target.nodeType,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [nodeType, start, end, hash],
      )
      assert.equal(sha256(targetText.slice(start, end)), hash)
    }
    assert.match(
      targetText.slice(5900889, 5901355),
      /setStatus\(\{code:[^.]+\.SpanStatusCode\.ERROR,message:[^.]+\.error\}\)/,
    )
    assert.match(
      targetText.slice(5902878, 5903450),
      /setStatus\(\{code:[^.]+\.SpanStatusCode\.ERROR,message:`\$\{[^}]+\.numNonBlockingError\} hook\(s\) failed`\}\)/,
    )
    assert.match(
      targetText.slice(8706868, 8708328),
      /CLAUDE_CODE_REMOTE[^]*export BUN_OPTIONS="--smol\$\{BUN_OPTIONS:\+ \$BUN_OPTIONS\}"/,
    )
    assert.match(
      targetText.slice(10028730, 10031919),
      /attempt_duration_ms:Date\.now\(\)-/,
    )
    const edit = targetText.slice(11816206, 11817881)
    assert.match(edit, /"old_str"in [^{]+\{if\(!\("old_string"in/)
    assert.match(edit, /delete [^.]+\.old_str/)
    assert.match(edit, /"new_str"in [^{]+\{if\(!\("new_string"in/)
    assert.match(edit, /delete [^.]+\.new_str/)
  },
)

test(
  'source preserves the target compatibility behavior',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const tracing = fs.readFileSync(
      path.join(sourceRoot, 'utils/telemetry/sessionTracing.ts'),
      'utf8',
    )
    const shell = fs.readFileSync(
      path.join(sourceRoot, 'utils/shell/bashProvider.ts'),
      'utf8',
    )
    const retry = fs.readFileSync(
      path.join(sourceRoot, 'services/api/withRetry.ts'),
      'utf8',
    )
    const api = fs.readFileSync(path.join(sourceRoot, 'utils/api.ts'), 'utf8')

    const toolStart = tracing.indexOf('export function endToolExecutionSpan')
    const hookStart = tracing.indexOf('export function endHookSpan')
    const toolEnd = tracing.slice(toolStart, tracing.indexOf('\nexport function endToolSpan', toolStart))
    const hookEnd = tracing.slice(hookStart, tracing.length)
    assert.ok(toolEnd)
    assert.ok(hookEnd)
    assert.match(toolEnd, /metadata\?\.success === false[\s\S]*?SpanStatusCode\.ERROR[\s\S]*?message: metadata\.error/)
    assert.match(hookEnd, /metadata\?\.numNonBlockingError[\s\S]*?SpanStatusCode\.ERROR[\s\S]*?hook\(s\) failed/)
    assert.match(
      shell,
      /isEnvTruthy\(process\.env\.CLAUDE_CODE_REMOTE\)[\s\S]*?export BUN_OPTIONS="--smol\$\{BUN_OPTIONS:\+ \$BUN_OPTIONS\}"/,
    )
    assert.match(retry, /const attemptStartTime = Date\.now\(\)/)
    assert.match(
      retry,
      /attempt_duration_ms:\s*Date\.now\(\) - attemptStartTime/,
    )
    const editCase = api.match(
      /case FileEditTool\.name:[\s\S]*?case FileWriteTool\.name:/,
    )?.[0]
    assert.ok(editCase)
    assert.match(editCase, /'old_str' in legacyCompatibleInput/)
    assert.match(editCase, /!\('old_string' in legacyCompatibleInput\)/)
    assert.match(editCase, /delete legacyCompatibleInput\.old_str/)
    assert.match(editCase, /'new_str' in legacyCompatibleInput/)
    assert.match(editCase, /!\('new_string' in legacyCompatibleInput\)/)
    assert.match(editCase, /delete legacyCompatibleInput\.new_str/)
    assert.match(editCase, /inputSchema\.parse\(legacyCompatibleInput\)/)
  },
)
