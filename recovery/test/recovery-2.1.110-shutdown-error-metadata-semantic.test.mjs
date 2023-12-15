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

const units = new Map([
  [8401, [5709069, 5709142, '0e943e443b6ff1b2cc2a51eb03d431d4d003a0133adb55323340c6a5ba1e3880']],
  [8402, [5709142, 5709538, 'd55eeb32507798b7b14b598794845d61d064c0fec705d5b8577a00b151aae7cb']],
  [8403, [5709538, 5709872, '1e9f87a9849fdb89718151ee4ad624a30a4de7bb853a7811a8b52c580095954d']],
  [8404, [5709872, 5709942, '1974596a6dfdce4ed25ee0115721848aa2e4eadbfab4a2c8bd30b0f9a51c0ad5']],
  [8405, [5709942, 5710335, '7ea589605ee5c98bbe1c5b303776c400da38511fac9ba274cfebbb187e6716d2']],
  [8420, [5711783, 5712560, '2f2a23791798a010a0b4a37ff36a0890ca898a4369a09794dfb88d7f75b590c2']],
  [8422, [5712598, 5713915, '40b405054f84b3e5c3b71c0d2ffa85f9e77b618fad525cdc5e9d279bc0dc8cec']],
])

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins sanitized error metadata and resume-hint suppression',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7')
    assert.equal(sha256(targetBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    for (const value of [
      '[unstringifiable]',
      'error_stack_hash',
      'suppressResumeHint',
    ]) {
      assert.equal(baseline.includes(value), false, `${value}: baseline`)
      assert.equal(target.includes(value), true, `${value}: target`)
    }
    assert.ok(target.slice(5709942, 5710335).includes('error_message_hash'))
  },
)

test(
  'source owns the exact bounded sanitizer, frame filter, and metadata fields',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/gracefulShutdown.ts'),
      'utf8',
    )
    for (const fragment of [
      "createHash('sha256').update(value).digest('hex').slice(0, 12)",
      ".slice(0, 500)",
      ".replace(/https?:\\/\\/\\S+/gi, '<url>')",
      ".replace(/\\b[0-9a-fA-F]{16,}\\b/g, '<id>')",
      ".replace(/\\b\\d{4,}\\b/g, '<num>')",
      "stack.slice(0, 4000).split('\\n')",
      "frame.replace(/^async\\s+/, '').replace(/^new\\s+/, '')",
      "return '[unstringifiable]'",
      'metadata.error_constructor = constructorName',
      "metadata.error_stack_hash = hashErrorDetail(frames.join('|'))",
      '...errorAnalyticsMetadata(error)',
      '...errorAnalyticsMetadata(reason)',
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
    assert.match(source, /typeof code === 'string' && \/\^\[A-Z\]\[A-Z0-9_\]\*\$\//)
  },
)

test(
  'source suppresses the resume hint before any asynchronous shutdown work',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/gracefulShutdown.ts'),
      'utf8',
    )
    assert.ok(source.includes('suppressResumeHint?: boolean'))
    const functionStart = source.indexOf('export async function gracefulShutdown(')
    const suppression = source.indexOf(
      'if (options?.suppressResumeHint) resumeHintPrinted = true',
      functionStart,
    )
    const hooksImport = source.indexOf(
      "const { executeSessionEndHooks, getSessionEndHookTimeoutMs }",
      functionStart,
    )
    assert.ok(functionStart >= 0 && suppression > functionStart)
    assert.ok(suppression < hooksImport)
  },
)
