#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/tools/SkillTool/UI.tsx'

export const TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 19189,
  sha256: 'cd40ed905b5f411b34eae96aca77302e4782ae6ea95bbdc6d37fde9281f5b8e0',
})

export const TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 19475,
  sha256: 'c31a7c4371fc38f7494a18b4dfbe168f7c5b0635706785a1b1cb88153ed8e484',
})

export const TARGET118_SKILL_AUTHOR_BYLINE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:12691`,
    targetIndex: 12691,
    paths: Object.freeze([SOURCE_PATH]),
    evidenceIds: Object.freeze([
      'target118-skill-author-byline-target-fragment',
      'target118-skill-author-byline-source-replay-test',
      'target118-skill-author-byline-source-ast-test',
    ]),
    behavior:
      'Target118 SkillTool display normalizes whitespace and a leading slash, preserves the legacy commands_DEPRECATED slash, and appends the authenticated project-team author as “ · by <author>” only when getTeamArtifactAuthor returns one.',
  }),
])

const IMPORT_ANCHOR =
  "import { plural } from '../../utils/stringUtils.js';\n"
const RECOVERED_IMPORT =
  `${IMPORT_ANCHOR}import { getTeamArtifactAuthor } from '../../utils/teamArtifacts.js';\n`
const FUNCTION_START = 'export function renderToolUseMessage('
const FUNCTION_END = 'export function renderToolUseProgressMessage'
const RECOVERED_FUNCTION = `export function renderToolUseMessage({
  skill
}: Partial<Input>, {
  commands
}: {
  commands?: Command[];
}): React.ReactNode {
  if (!skill) {
    return null;
  }
  const trimmedSkill = skill.trim();
  const skillName = trimmedSkill.startsWith('/') ? trimmedSkill.substring(1) : trimmedSkill;
  const command = commands?.find(c => c.name === skillName);
  const displayName = command?.loadedFrom === 'commands_DEPRECATED' ? \`/\${skillName}\` : skillName;
  const author = getTeamArtifactAuthor(command?.type === 'prompt' ? command.source : undefined, skillName);
  return author ? \`\${displayName} · by \${author}\` : displayName;
}
`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function replaceExactlyOnce(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(
      `${CASE_NAME}: skill-author replay requires one exact ${label}`,
    )
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

export function buildTarget118SkillAuthorBylineOutput(input) {
  let output = replaceExactlyOnce(
    input,
    IMPORT_ANCHOR,
    RECOVERED_IMPORT,
    'team-artifact import anchor',
  )
  const start = output.indexOf(FUNCTION_START)
  const second = output.indexOf(FUNCTION_START, start + 1)
  const end = output.indexOf(FUNCTION_END, start)
  if (start < 0 || second >= 0 || end < start) {
    throw new Error(
      `${CASE_NAME}: skill-author replay requires one exact renderToolUseMessage boundary`,
    )
  }
  return output.slice(0, start) + RECOVERED_FUNCTION + output.slice(end)
}

export function applyTarget118SkillAuthorBylineSourceRecovery({ sourceRoot }) {
  const filename = path.join(sourceRoot, SOURCE_PATH.replace(/^src\//, ''))
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    actual.bytes === TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE.bytes &&
    actual.sha256 === TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE.sha256
  ) {
    return { status: 'already-recovered', files: [] }
  }
  if (
    actual.bytes !== TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE.bytes ||
    actual.sha256 !== TARGET118_SKILL_AUTHOR_BYLINE_INPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: skill-author byline replay requires its exact raw or recovered source state`,
    )
  }
  const output = Buffer.from(
    buildTarget118SkillAuthorBylineOutput(input.toString()),
  )
  const recovered = descriptor(output)
  if (
    recovered.bytes !== TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE.bytes ||
    recovered.sha256 !== TARGET118_SKILL_AUTHOR_BYLINE_OUTPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: skill-author byline replay output differs from its pinned postimage`,
    )
  }
  fs.writeFileSync(filename, output)
  return { status: 'recovered', files: [SOURCE_PATH] }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-skill-author-byline-source-gap.mjs --source-root DIR',
    )
  }
  console.log(
    JSON.stringify(
      applyTarget118SkillAuthorBylineSourceRecovery({ sourceRoot }),
      null,
      2,
    ),
  )
}
