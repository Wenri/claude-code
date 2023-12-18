import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH =
  'src/components/FeedbackSurvey/FeedbackSurveyView.tsx'
const BEFORE = '<Text bold={true}>{message}</Text>'
const AFTER = '<Text bold={true} wrap="wrap">{message}</Text>'

const freezeDescriptor = descriptor => Object.freeze({ ...descriptor })

export const TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_INPUT_FILES =
  Object.freeze([
    freezeDescriptor({
      state: 'raw',
      path: SOURCE_PATH,
      bytes: 10660,
      sha256:
        '2307bbad58362eaa0b134b2e3b8d749bb70549f6b51676b38e569f88c011a78e',
    }),
    freezeDescriptor({
      state: 'strict-transitive-recovered',
      path: SOURCE_PATH,
      bytes: 10969,
      sha256:
        'ca06933f64a53a5d31fa542b18719d6ef774ccc57e85d2b29aea1da033fb055f',
    }),
  ])

export const TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_OUTPUT_FILES =
  Object.freeze([
    freezeDescriptor({
      state: 'raw',
      path: SOURCE_PATH,
      bytes: 10672,
      sha256:
        '381d51ba9ed8c360de1355b23cada8f5dcd01067979af51342143e6242c78fb0',
    }),
    freezeDescriptor({
      state: 'strict-transitive-recovered',
      path: SOURCE_PATH,
      bytes: 10981,
      sha256:
        'd8b3268a7fc817db1ca590bb51881ccd9ec37ae7940dce2c2ae86c1e8132fe2a',
    }),
  ])

export const TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_EVIDENCE_IDS =
  Object.freeze([
    'target118-feedback-survey-message-wrap-target-fragment',
    'target118-feedback-survey-message-wrap-source-replay-test',
    'target118-feedback-survey-message-wrap-source-ast-test',
  ])

export const TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:19936`,
      targetIndex: 19936,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['FeedbackSurveyView']),
      evidenceIds: TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_EVIDENCE_IDS,
      behavior:
        'The authenticated Target117 and Target118 FeedbackSurveyView units both render the survey message with Text wrap="wrap". The recovered raw and strict-transitive source states omit only that retained prop from the matching bold message child, so the replay restores the exact inherited wrapping contract in either pinned state and rejects every mixed or drifting input.',
    }),
  ])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function resolveSourceFile(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, SOURCE_PATH.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${SOURCE_PATH}: escapes source root`)
  }
  return filename
}

function replaceExactOnce(source) {
  const first = source.indexOf(BEFORE)
  if (first < 0 || source.indexOf(BEFORE, first + 1) >= 0) {
    throw new Error(
      `${SOURCE_PATH}: expected exactly one bold survey-message child`,
    )
  }
  if (source.includes(AFTER)) {
    throw new Error(`${SOURCE_PATH}: mixed wrap replay state`)
  }
  return `${source.slice(0, first)}${AFTER}${source.slice(first + BEFORE.length)}`
}

export function applyTarget118FeedbackSurveyMessageWrapSourceRecovery({
  sourceRoot,
}) {
  const filename = resolveSourceFile(sourceRoot)
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${SOURCE_PATH}: expected a real source file`)
  }
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  const recoveredIndex =
    TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_OUTPUT_FILES.findIndex(
      expected =>
        expected.bytes === actual.bytes && expected.sha256 === actual.sha256,
    )
  if (recoveredIndex >= 0) {
    return Object.freeze({ changed: false, state: 'recovered', path: SOURCE_PATH })
  }
  const inputIndex =
    TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_INPUT_FILES.findIndex(
      expected =>
        expected.bytes === actual.bytes && expected.sha256 === actual.sha256,
    )
  if (inputIndex < 0) {
    throw new Error(
      `${SOURCE_PATH}: unsupported preimage ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = Buffer.from(replaceExactOnce(input.toString('utf8')))
  const expected =
    TARGET118_FEEDBACK_SURVEY_MESSAGE_WRAP_OUTPUT_FILES[inputIndex]
  const actualOutput = descriptor(output)
  if (
    actualOutput.bytes !== expected.bytes ||
    actualOutput.sha256 !== expected.sha256
  ) {
    throw new Error(
      `${SOURCE_PATH}: constructed output differs from ${expected.state} pin`,
    )
  }
  fs.writeFileSync(filename, output)
  return Object.freeze({
    changed: true,
    state: expected.state,
    path: SOURCE_PATH,
  })
}
