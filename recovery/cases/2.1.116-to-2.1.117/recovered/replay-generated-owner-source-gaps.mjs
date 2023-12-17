#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { summarizeSourceTree } from '../../../scripts/verify-source-lineage.mjs'

const CASE_NAME = '2.1.116-to-2.1.117'
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url))

function freezeTreeSummary(summary) {
  return Object.freeze({ ...summary })
}

function freezeFile(record) {
  return Object.freeze({ ...record })
}

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET117_RAW_SOURCE_TREE = freezeTreeSummary({
  files: 1957,
  bytes: 30993723,
  manifestSha256:
    '135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee',
})

export const TARGET117_RECOVERED_SOURCE_TREE = freezeTreeSummary({
  files: 1966,
  bytes: 31042772,
  manifestSha256:
    'a47b2a1ccc07566e412ad4246a9c2809898bbfe8a588983c1e353d160d4cae44',
})

export const TARGET117_RECOVERED_SOURCE_FILES = Object.freeze([
  {
    path: 'src/commands/fork/fork.ts',
    bytes: 6480,
    sha256:
      'c618b48cc2e75030886c1b7957d2c0cc46271ab8b5887a279700c36b261cc1ff',
  },
  {
    path: 'src/commands/fork/index.ts',
    bytes: 402,
    sha256:
      '05fa1d580380b7b1aa340307a568facc41c487cd5e7211e756bc81a496202d0b',
  },
  {
    path: 'src/commands/powerup/index.ts',
    bytes: 279,
    sha256:
      '7cae63b745bd08f6158fa920d9bdacfbdb47e7ee489125f60f2edc986b6e9ad7',
  },
  {
    path: 'src/commands/powerup/powerup.tsx',
    bytes: 21424,
    sha256:
      'ed606b202520bcd693aae93210994216d001d2fb4df4932ffbc3b5522e1fe2a3',
  },
  {
    path: 'src/commands/recap.ts',
    bytes: 1074,
    sha256:
      '8e02b5f77e9d77fc3c5ae0d7354e1fe34c5925d9beee79fe2e4d9cca7c09ab15',
  },
  {
    path: 'src/commands/team-onboarding.ts',
    bytes: 16280,
    sha256:
      '341da8f213bd471d0ac737aa11829150a3ac1b4912653b0d04082c49a69a6bc8',
  },
  {
    path: 'src/commands/toggle-memory/index.ts',
    bytes: 381,
    sha256:
      '2d7f52aa98da275f3c3949a74b063894a2ff5fcdd34e530fc3394b3086ba523a',
  },
  {
    path: 'src/commands/toggle-memory/toggle-memory.ts',
    bytes: 775,
    sha256:
      '6386414c103521b1cc04ec210341c7a1611106630d1fe57009694b9890e6b32f',
  },
  {
    path: 'src/tools/AgentTool/built-in/backgroundJobAgent.ts',
    bytes: 1954,
    sha256:
      '153311cfb7a786658170cd0922ffd50a99ca91ace33cd490c948cb09c83f2f59',
  },
].map(freezeFile))

const TARGET_FRAGMENT_EVIDENCE =
  'target117-generated-owner-source-gap-target-fragment'
const REPLAY_EVIDENCE =
  'target117-generated-owner-source-gap-replay-test'

export const TARGET117_GENERATED_OWNER_OVERRIDES = Object.freeze([
  {
    key: `${CASE_NAME}:15823`,
    targetIndex: 15823,
    paths: ['src/commands/toggle-memory/index.ts'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The target117 toggle-memory descriptor owns the authenticated post-text dispatch residue; its split implementation is structurally unchanged across the target117-to-target118 transition.',
  },
  {
    key: `${CASE_NAME}:16315`,
    targetIndex: 16315,
    paths: ['src/commands/powerup/index.ts'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The inherited powerup descriptor owns the authenticated target117 Ink requirement while its prior implementation remains unchanged.',
  },
  {
    key: `${CASE_NAME}:17695`,
    targetIndex: 17695,
    paths: ['src/commands/recap.ts'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The recovered target117 recap descriptor owns post-text dispatch and preserves the target117 null-or-abort result flow rather than importing target118 result-kind behavior.',
  },
  {
    key: `${CASE_NAME}:17724`,
    targetIndex: 17724,
    paths: ['src/commands/team-onboarding.ts'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The inherited team-onboarding command owns the authenticated target117 workspace requirement and retains its prior scanning implementation.',
  },
  {
    key: `${CASE_NAME}:17731`,
    targetIndex: 17731,
    paths: ['src/commands/fork/fork.ts'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The recovered fork implementation owns the authenticated target117 usage and completion strings and is structurally unchanged across the target117-to-target118 transition.',
  },
  {
    key: `${CASE_NAME}:19649`,
    targetIndex: 19649,
    paths: ['src/tools/AgentTool/built-in/backgroundJobAgent.ts'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The bounded built-in background-job agent is reconstructed directly from the authenticated target117 unit instead of assigning its prompt to a nearest source-map neighbor.',
  },
].map(freezeOverride))

const PATCH_INPUTS = Object.freeze({
  nextTransitionOverlay: freezeFile({
    path:
      'recovery/cases/2.1.117-to-2.1.118/recovered/source-facing-overlay.patch',
    bytes: 3865180,
    sha256:
      'fc47a3190c81fc255b9e497af3cb95eb97ef6371ea359fb4c12a7e16f82500d4',
  }),
  recapIntroduction: freezeFile({
    path: 'recovery/cases/2.1.104-to-2.1.105/semantic-supplement.patch',
    bytes: 1329483,
    sha256:
      'a4b761ee17ae0747c3c29c92415588f11768a1c54d785105e8dbec625b0dc825',
  }),
  powerupIntroduction: freezeFile({
    path: 'recovery/cases/2.1.94-to-2.1.96/semantic-supplement.patch',
    bytes: 4321868,
    sha256:
      'dba122f721559133bdad7970c15ccda26c9dfcef2c5d0e82de65dbffdb2c1542',
  }),
  teamOnboardingIntroduction: freezeFile({
    path: 'recovery/cases/2.1.112-to-2.1.113/semantic-supplement.patch',
    bytes: 569787,
    sha256:
      '91133b4948462f541f65f302b2b38e2686bdcfbef7f0bed5aacd537084e4afaa',
  }),
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function sameTreeSummary(actual, expected) {
  return (
    actual.files === expected.files &&
    actual.bytes === expected.bytes &&
    actual.manifestSha256 === expected.manifestSha256
  )
}

function publicTreeSummary(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function readAuthenticatedPatch(input) {
  const filename = path.join(repositoryRoot, input.path)
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${input.path}: expected a real patch file`)
  }
  const bytes = fs.readFileSync(filename)
  if (bytes.length !== input.bytes) {
    throw new Error(
      `${input.path}: expected ${input.bytes} bytes, got ${bytes.length}`,
    )
  }
  const digest = sha256(bytes)
  if (digest !== input.sha256) {
    throw new Error(
      `${input.path}: expected SHA-256 ${input.sha256}, got ${digest}`,
    )
  }
  return bytes.toString('utf8')
}

function extractNewFile(patchText, sourcePath) {
  const header = `diff --git a/${sourcePath} b/${sourcePath}`
  const lines = patchText.split('\n')
  const starts = []
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === header) starts.push(index)
  }
  if (starts.length !== 1) {
    throw new Error(
      `${sourcePath}: expected one exact patch header, got ${starts.length}`,
    )
  }

  const start = starts[0]
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('diff --git ')) {
      end = index
      break
    }
  }
  const block = lines.slice(start, end)
  if (!block.includes('new file mode 100644')) {
    throw new Error(`${sourcePath}: patch is not an exact new 100644 file`)
  }
  if (!block.includes('--- /dev/null')) {
    throw new Error(`${sourcePath}: patch does not start from /dev/null`)
  }
  if (!block.includes(`+++ b/${sourcePath}`)) {
    throw new Error(`${sourcePath}: patch target does not match its header`)
  }

  const hunks = block
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.startsWith('@@ '))
  if (hunks.length !== 1) {
    throw new Error(`${sourcePath}: expected one new-file hunk`)
  }
  const hunk = hunks[0]
  const match = /^@@ -0,0 \+1(?:,(\d+))? @@/.exec(hunk.line)
  if (!match) {
    throw new Error(`${sourcePath}: unexpected new-file hunk header`)
  }
  const expectedLines = match[1] === undefined ? 1 : Number(match[1])
  const added = []
  let noFinalNewline = false
  for (let index = hunk.index + 1; index < block.length; index += 1) {
    const line = block[index]
    if (line.startsWith('+')) {
      added.push(line.slice(1))
    } else if (line === '\\ No newline at end of file') {
      noFinalNewline = true
    } else if (line === '' && index === block.length - 1) {
      // A final split sentinel is not part of the patch hunk.
    } else {
      throw new Error(
        `${sourcePath}: new-file hunk contains a non-addition line`,
      )
    }
  }
  if (added.length !== expectedLines) {
    throw new Error(
      `${sourcePath}: expected ${expectedLines} added lines, got ${added.length}`,
    )
  }
  return `${added.join('\n')}${noFinalNewline ? '' : '\n'}`
}

function replaceOnce(contents, before, after, label) {
  const first = contents.indexOf(before)
  const last = contents.lastIndexOf(before)
  if (first === -1 || first !== last) {
    const count = first === -1 ? 0 : 'multiple'
    throw new Error(`${label}: expected one transformation anchor, got ${count}`)
  }
  return `${contents.slice(0, first)}${after}${contents.slice(first + before.length)}`
}

function backgroundJobAgentSource() {
  const prompt = `This session is a background job. The user may be chatting with you live or may have stepped away — respond to them naturally either way. A classifier watches your message text (not tool output, not subagent reports, not human replies) to track state and surface results in the job list, so the conventions below apply regardless.

**Narrate.** State your approach before acting (one line). After each chunk of work, say what happened and what's next. Before declaring done, run a sanity check and say what you checked.

**Restate.** When you reach a result, state it in your message even if it already appeared in a tool result — the extractor only reads your text. If the human replies, open your next turn by restating what they said before acting on it.

For noisy investigation — grep sweeps, log trawling, broad search — spawn a subagent and keep only the findings in this thread.

**Done** means \`result:\` on its own line with the one-line outcome — a self-contained headline a reader who never saw the ask could still understand. This is the one thing a teammate will read to know what you produced without opening your transcript. Skip this for conversational replies with no concrete deliverable (greetings, clarifying questions).

**blocked** — one human action unblocks you (auth, scope question, a decision). Say exactly what.
**failed** — start over (wrong repo, missing binary, structurally impossible).
Everything else, keep working. Don't ask when a reasonable guess is cheaper than the round-trip.`
  return `export const backgroundJobAgent = {
  agentType: 'claude',
  whenToUse:
    "Catch-all for any task that doesn't fit a more specific agent. FleetView's default when no agent name is typed.",
  tools: ['*'],
  source: 'built-in',
  baseDir: 'built-in',
  appendSystemPrompt: true,
  ...{ permissionMode: 'auto' as const },
  isolation: 'worktree',
  getSystemPrompt: () => ${JSON.stringify(prompt)},
}

export default backgroundJobAgent
`
}

function constructRecoveredFiles() {
  const patches = Object.fromEntries(
    Object.entries(PATCH_INPUTS).map(([key, input]) => [
      key,
      readAuthenticatedPatch(input),
    ]),
  )
  const files = new Map()

  for (const sourcePath of [
    'src/commands/fork/fork.ts',
    'src/commands/fork/index.ts',
    'src/commands/toggle-memory/index.ts',
    'src/commands/toggle-memory/toggle-memory.ts',
  ]) {
    files.set(
      sourcePath,
      extractNewFile(patches.nextTransitionOverlay, sourcePath),
    )
  }

  let recap = extractNewFile(
    patches.recapIntroduction,
    'src/commands/recap.ts',
  )
  recap = replaceOnce(
    recap,
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_sedge_lantern', false)",
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_sedge_lantern', true)",
    'src/commands/recap.ts rollout default',
  )
  recap = replaceOnce(
    recap,
    '  supportsNonInteractive: false,\n',
    "  supportsNonInteractive: false,\n  thinClientDispatch: 'post-text',\n",
    'src/commands/recap.ts thin-client dispatch',
  )
  files.set('src/commands/recap.ts', recap)

  let powerup = extractNewFile(
    patches.powerupIntroduction,
    'src/commands/powerup/index.ts',
  )
  powerup = replaceOnce(
    powerup,
    "    'Discover Claude Code features through quick interactive lessons',\n",
    "    'Discover Claude Code features through quick interactive lessons',\n  requires: { ink: true },\n",
    'src/commands/powerup/index.ts Ink requirement',
  )
  files.set('src/commands/powerup/index.ts', powerup)
  files.set(
    'src/commands/powerup/powerup.tsx',
    extractNewFile(
      patches.powerupIntroduction,
      'src/commands/powerup/powerup.tsx',
    ),
  )

  let teamOnboarding = extractNewFile(
    patches.teamOnboardingIntroduction,
    'src/commands/team-onboarding.ts',
  )
  teamOnboarding = replaceOnce(
    teamOnboarding,
    "  progressMessage: 'scanning usage data',\n",
    "  progressMessage: 'scanning usage data',\n  requires: { workspace: true },\n",
    'src/commands/team-onboarding.ts workspace requirement',
  )
  files.set('src/commands/team-onboarding.ts', teamOnboarding)

  files.set(
    'src/tools/AgentTool/built-in/backgroundJobAgent.ts',
    backgroundJobAgentSource(),
  )

  if (files.size !== TARGET117_RECOVERED_SOURCE_FILES.length) {
    throw new Error(
      `Expected ${TARGET117_RECOVERED_SOURCE_FILES.length} recovered files, got ${files.size}`,
    )
  }
  for (const expected of TARGET117_RECOVERED_SOURCE_FILES) {
    const contents = files.get(expected.path)
    if (contents === undefined) {
      throw new Error(`${expected.path}: recovered contents are missing`)
    }
    const bytes = Buffer.byteLength(contents)
    const digest = sha256(contents)
    if (bytes !== expected.bytes || digest !== expected.sha256) {
      throw new Error(
        `${expected.path}: expected ${expected.bytes}/${expected.sha256}, got ${bytes}/${digest}`,
      )
    }
  }
  return files
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: recovered path must start with src/`)
  }
  const relative = sourcePath.slice('src/'.length)
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative.split('/').some(part => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`${sourcePath}: unsafe recovered path`)
  }
  const filename = path.resolve(sourceRoot, ...relative.split('/'))
  const prefix = `${path.resolve(sourceRoot)}${path.sep}`
  if (!filename.startsWith(prefix)) {
    throw new Error(`${sourcePath}: recovered path escapes source root`)
  }
  return filename
}

function verifyRecoveredFiles(sourceRoot) {
  return TARGET117_RECOVERED_SOURCE_FILES.map(expected => {
    const filename = sourceFilename(sourceRoot, expected.path)
    const status = fs.lstatSync(filename)
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`${expected.path}: expected a real recovered file`)
    }
    const bytes = fs.readFileSync(filename)
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`${expected.path}: recovered file identity mismatch`)
    }
    return { ...expected, action: 'unchanged' }
  })
}

export function applyTarget117GeneratedOwnerRecovery({ sourceRoot }) {
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new Error('sourceRoot must be a non-empty path string')
  }
  const resolvedSourceRoot = path.resolve(sourceRoot)
  const before = summarizeSourceTree(resolvedSourceRoot)

  if (sameTreeSummary(before, TARGET117_RECOVERED_SOURCE_TREE)) {
    const files = verifyRecoveredFiles(resolvedSourceRoot)
    return {
      case: CASE_NAME,
      status: 'already-recovered',
      sourceRoot: resolvedSourceRoot,
      before: publicTreeSummary(before),
      after: publicTreeSummary(before),
      ownerOverrides: TARGET117_GENERATED_OWNER_OVERRIDES.length,
      files,
    }
  }
  if (!sameTreeSummary(before, TARGET117_RAW_SOURCE_TREE)) {
    throw new Error(
      `Refusing to recover non-target source tree: got ` +
        `${before.files}/${before.bytes}/${before.manifestSha256}`,
    )
  }

  const recovered = constructRecoveredFiles()
  for (const expected of TARGET117_RECOVERED_SOURCE_FILES) {
    const filename = sourceFilename(resolvedSourceRoot, expected.path)
    if (fs.existsSync(filename)) {
      throw new Error(`${expected.path}: target path already exists in raw tree`)
    }
  }

  const files = []
  for (const expected of TARGET117_RECOVERED_SOURCE_FILES) {
    const filename = sourceFilename(resolvedSourceRoot, expected.path)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, recovered.get(expected.path), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o644,
    })
    files.push({ ...expected, action: 'created' })
  }

  const after = summarizeSourceTree(resolvedSourceRoot)
  if (!sameTreeSummary(after, TARGET117_RECOVERED_SOURCE_TREE)) {
    throw new Error(
      `Recovered source tree identity mismatch: got ` +
        `${after.files}/${after.bytes}/${after.manifestSha256}`,
    )
  }
  return {
    case: CASE_NAME,
    status: 'recovered',
    sourceRoot: resolvedSourceRoot,
    before: publicTreeSummary(before),
    after: publicTreeSummary(after),
    ownerOverrides: TARGET117_GENERATED_OWNER_OVERRIDES.length,
    files,
  }
}

function parseArguments(argv) {
  let sourceRoot
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument !== '--source-root') {
      throw new Error(`Unknown argument: ${argument}`)
    }
    if (sourceRoot !== undefined) {
      throw new Error(`Duplicate argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    sourceRoot = value
    index += 1
  }
  if (sourceRoot === undefined) {
    throw new Error(
      'Usage: replay-generated-owner-source-gaps.mjs --source-root DIR',
    )
  }
  return { sourceRoot }
}

function main() {
  const result = applyTarget117GeneratedOwnerRecovery(
    parseArguments(process.argv.slice(2)),
  )
  console.log(JSON.stringify(result, null, 2))
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
