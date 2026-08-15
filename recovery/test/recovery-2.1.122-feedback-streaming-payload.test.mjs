import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates retained streaming feedback payload semantics', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      bundle.split('extraOuterFields').length - 1,
      2,
      `${version}: serializer option and transcript-share call`,
    )
    assert.equal(
      bundle.split('new Set(["transcript"])').length - 1,
      2,
      `${version}: feedback and transcript-share streaming fields`,
    )
    assert.equal(
      bundle.split('new Set(["subagentTranscripts"])').length - 1,
      2,
      `${version}: feedback and transcript-share nested streaming fields`,
    )

    const optionIndex = bundle.indexOf('extraOuterFields')
    const serializer = bundle.slice(optionIndex - 1_300, optionIndex + 700)
    assert.match(serializer, /\.push\('\{"content":"'\)/)
    assert.match(serializer, /\.slice\(1,-1\)/)
    assert.match(serializer, /if\([^)]*===void 0\)continue/)
    assert.match(serializer, /new TextEncoder/)
    assert.match(serializer, /Buffer\.concat\([^)]*\.chunks\)/)

    const feedbackIndex = bundle.indexOf(
      'https://api.anthropic.com/api/claude_cli_feedback',
    )
    const feedback = bundle.slice(feedbackIndex - 700, feedbackIndex + 100)
    assert.match(
      feedback,
      /let [\w$]+=.+\([^)]*\);if\([^=]+=[\w$]+\.length,/,
      `${version}: feedback posts a byte buffer and prechecks its length`,
    )

    const shareIndex = bundle.indexOf(
      'https://api.anthropic.com/api/claude_code_shared_session_transcripts',
    )
    const share = bundle.slice(shareIndex - 2_000, shareIndex + 100)
    assert.match(
      share,
      /if\(![\w$]+\("allow_product_feedback"\)\)return\{success:!1\}/,
      `${version}: transcript sharing is policy guarded`,
    )
    assert.ok(
      share.includes('.split(`\n`).map(') && share.includes(').join(`\n`)'),
      `${version}: raw JSONL is handled record by record`,
    )
    assert.match(
      share,
      /try\{return[^{}]{1,100}\}catch\{return[^{}]{1,100}\}/,
      `${version}: parsed records and malformed lines are both redacted`,
    )
    assert.match(
      share,
      /extraOuterFields:\{appearance_id:/,
      `${version}: appearance ID remains an outer request field`,
    )
  }
})

test('source restores streaming, recursive redaction, and guarded sharing', () => {
  const root = new URL('../../', import.meta.url)
  const payload = readFileSync(
    new URL('src/utils/feedbackPayload.ts', root),
    'utf8',
  )
  const feedback = readFileSync(
    new URL('src/components/Feedback.tsx', root),
    'utf8',
  )
  const share = readFileSync(
    new URL('src/components/FeedbackSurvey/submitTranscriptShare.ts', root),
    'utf8',
  )

  assert.ok(payload.includes("buffer.push('{\"content\":\"')"))
  assert.ok(payload.includes('jsonStringify(value).slice(1, -1)'))
  assert.ok(payload.includes('Buffer.concat(this.chunks)'))
  assert.ok(payload.includes('options?.extraOuterFields'))
  assert.match(
    feedback,
    /export function redactSensitiveValue[\s\S]*?Array\.isArray\(value\)[\s\S]*?Object\.entries\(value\)[\s\S]*?withContext\.startsWith\(prefix\)/,
  )
  assert.match(
    feedback,
    /buildFeedbackPayload\(data, FEEDBACK_ARRAY_FIELDS, FEEDBACK_NESTED_ARRAY_FIELDS\)[\s\S]*?payloadLength = payload\.length/,
  )
  assert.ok(share.includes("if (!isPolicyAllowed('allow_product_feedback'))"))
  assert.ok(share.includes("?.split('\\n')"))
  assert.ok(share.includes('redactSensitiveValue(jsonParse(line))'))
  assert.ok(
    share.includes('{ extraOuterFields: { appearance_id: appearanceId } }'),
  )
  assert.match(
    share,
    /axios\.post\([\s\S]*?claude_code_shared_session_transcripts'[\s\S]*?payload,/,
  )
})
