#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.118-to-2.1.119'
const BUILT_IN_AGENTS_PATH = 'src/tools/AgentTool/builtInAgents.ts'
const BACKGROUND_AGENT_PATH =
  'src/tools/AgentTool/built-in/backgroundJobAgent.ts'

const EVIDENCE_IDS = Object.freeze([
  'target119-slate-meadow-background-agent-target-fragment',
  'target119-slate-meadow-background-agent-source-replay-test',
  'target119-slate-meadow-background-agent-source-ast-test',
  'target119-slate-meadow-retained-agent-donor-proof',
])

export const TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:9783`,
      targetIndex: 9783,
      paths: Object.freeze([BUILT_IN_AGENTS_PATH, BACKGROUND_AGENT_PATH]),
      declarations: Object.freeze([
        'getBuiltInAgents',
        'CLAUDE_AGENT',
        'backgroundJobAgent',
      ]),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'Target119 getBuiltInAgents conditionally inserts the retained authenticated background-job agent when tengu_slate_meadow is enabled. The replay reuses the exact Target117 generated-source postimage and adds only the Target119 import and feature-gated list insertion.',
    }),
  ])

export const TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_INPUT_FILES =
  Object.freeze([
    Object.freeze({
      path: BUILT_IN_AGENTS_PATH,
      bytes: 2756,
      sha256:
        '24df97f95532f86108d60176d1c708edf4040bda028ee8f22a52f1bac6acfb22',
    }),
    Object.freeze({ path: BACKGROUND_AGENT_PATH, absent: true }),
  ])

export const TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_OUTPUT_FILES =
  Object.freeze([
    Object.freeze({
      path: BUILT_IN_AGENTS_PATH,
      bytes: 2951,
      sha256:
        '9a58f1c3aee2f2c62620b1b3b1ea90be0f4c5810158efa7064f2b17c1339ef98',
    }),
    Object.freeze({
      path: BACKGROUND_AGENT_PATH,
      bytes: 1954,
      sha256:
        '153311cfb7a786658170cd0922ffd50a99ca91ace33cd490c948cb09c83f2f59',
    }),
  ])

export const TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_DONOR = Object.freeze({
  path: 'recovery/cases/2.1.118-to-2.1.119/recovered/backgroundJobAgent.target119.ts',
  bytes: 1954,
  sha256: '153311cfb7a786658170cd0922ffd50a99ca91ace33cd490c948cb09c83f2f59',
  provenance:
    'byte-identical Target117 authenticated generated-owner recovery postimage',
})

const IMPORT_ANCHOR =
  "import { CLAUDE_CODE_GUIDE_AGENT } from './built-in/claudeCodeGuideAgent.js'"
const IMPORT_POSTIMAGE = `${IMPORT_ANCHOR}
import { backgroundJobAgent as CLAUDE_AGENT } from './built-in/backgroundJobAgent.js'`

const LIST_ANCHOR = `  const agents: AgentDefinition[] = [
    GENERAL_PURPOSE_AGENT,
    STATUSLINE_SETUP_AGENT,
  ]

`
const LIST_POSTIMAGE = `${LIST_ANCHOR}  if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_meadow', false)) {
    agents.push(CLAUDE_AGENT)
  }

`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function matches(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: ${label} replay anchor differs`)
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

function realFileBytes(filename, label) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${CASE_NAME}: ${label} must be a real file`)
  }
  return fs.readFileSync(filename)
}

function optionalRealFile(filename, label) {
  try {
    return realFileBytes(filename, label)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export function buildTarget119SlateMeadowBuiltInAgentsOutput(source) {
  return replaceExactly(
    replaceExactly(
      source,
      IMPORT_ANCHOR,
      IMPORT_POSTIMAGE,
      'background-agent import',
    ),
    LIST_ANCHOR,
    LIST_POSTIMAGE,
    'slate-meadow list insertion',
  )
}

function readDonor() {
  const helperDir = path.dirname(fileURLToPath(import.meta.url))
  const donorPath = path.join(helperDir, 'backgroundJobAgent.target119.ts')
  const bytes = realFileBytes(donorPath, 'background-agent donor')
  if (!matches(descriptor(bytes), TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_DONOR)) {
    throw new Error(`${CASE_NAME}: background-agent donor differs`)
  }
  return bytes
}

export function applyTarget119SlateMeadowBackgroundAgentSourceRecovery({
  sourceRoot,
}) {
  const builtInFilename = path.join(
    sourceRoot,
    BUILT_IN_AGENTS_PATH.replace(/^src\//, ''),
  )
  const backgroundFilename = path.join(
    sourceRoot,
    BACKGROUND_AGENT_PATH.replace(/^src\//, ''),
  )
  const builtInBytes = realFileBytes(builtInFilename, 'builtInAgents source')
  const backgroundBytes = optionalRealFile(
    backgroundFilename,
    'background-agent source',
  )
  const builtInState = descriptor(builtInBytes)
  const input = TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_INPUT_FILES[0]
  const output = TARGET119_SLATE_MEADOW_BACKGROUND_AGENT_OUTPUT_FILES

  if (
    matches(builtInState, output[0]) &&
    backgroundBytes !== null &&
    matches(descriptor(backgroundBytes), output[1])
  ) {
    return { status: 'already-recovered', files: [] }
  }
  if (!matches(builtInState, input) || backgroundBytes !== null) {
    throw new Error(
      `${CASE_NAME}: slate-meadow background-agent replay requires its exact all-raw or all-recovered source state`,
    )
  }

  const recoveredBuiltIn = Buffer.from(
    buildTarget119SlateMeadowBuiltInAgentsOutput(builtInBytes.toString('utf8')),
  )
  const recoveredBackground = readDonor()
  if (
    !matches(descriptor(recoveredBuiltIn), output[0]) ||
    !matches(descriptor(recoveredBackground), output[1])
  ) {
    throw new Error(
      `${CASE_NAME}: slate-meadow background-agent replay produced unexpected source`,
    )
  }

  fs.mkdirSync(path.dirname(backgroundFilename), { recursive: true })
  fs.writeFileSync(backgroundFilename, recoveredBackground)
  fs.writeFileSync(builtInFilename, recoveredBuiltIn)
  return { status: 'recovered', files: output.map(file => file.path) }
}
