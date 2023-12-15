#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.118-to-2.1.119'
const TARGET_EVIDENCE =
  'target119-later-donor-runtime-source-gap-target-fragment'
const REPLAY_EVIDENCE =
  'target119-later-donor-runtime-source-gap-source-replay-test'

const FILES = Object.freeze([
  Object.freeze({
    path: 'src/utils/env.ts',
    before: Object.freeze({
      bytes: 10943,
      sha256:
        '534a837cd1771d6c74ccadee08c7c01511f8f9630c906cc812326ff6d970e4b0',
    }),
    after: Object.freeze({
      bytes: 11344,
      sha256:
        '01bebed0e2bcdf2a4f691f4888e5569b86d7f27da4c8c1293732aecf75a26f50',
    }),
  }),
  Object.freeze({
    path: 'src/tools/AgentTool/AgentTool.tsx',
    before: Object.freeze({
      bytes: 234266,
      sha256:
        'deee654d87ed313a1c713123195a2a22a7fa9877fcc70041cbb330d9dfb08b02',
    }),
    after: Object.freeze({
      bytes: 234637,
      sha256:
        'ba2652cc9a221f39753b4e5bb86aee1c05c2351ab77d8aaffcb8f59dacf3f4f4',
    }),
  }),
  Object.freeze({
    path: 'src/utils/ShellCommand.ts',
    before: Object.freeze({
      bytes: 14138,
      sha256:
        '4536b15583b60a9d667c1da365ff4d7fb1dd3d3aa25e94998526cb0c540c6cf3',
    }),
    after: Object.freeze({
      bytes: 14246,
      sha256:
        '31141fd7db162dcdbfa5bd62453226313cac1b33a65834ed118be9f890fdcad8',
    }),
  }),
])

function ownerOverride(targetIndex, ownerPath, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([ownerPath]),
    evidenceIds: Object.freeze([TARGET_EVIDENCE, REPLAY_EVIDENCE]),
    behavior,
  })
}

export const TARGET119_LATER_DONOR_RUNTIME_OWNER_OVERRIDES = Object.freeze([
  ownerOverride(
    2565,
    'src/utils/env.ts',
    'The authenticated Target119 deployment detector recognizes Coder, DevPod, Daytona, Google Cloud Workstations, and AWS Cloud9 environments before the existing Replit and Glitch branches.',
  ),
  ownerOverride(
    12841,
    'src/tools/AgentTool/AgentTool.tsx',
    'The authenticated Target119 Agent tool forwards its selected model into the prompt, emits background-hint and clear progress events, and optionally forwards subagent text alongside tool progress.',
  ),
  ownerOverride(
    19046,
    'src/utils/ShellCommand.ts',
    'The authenticated Target119 ShellCommand background transition accepts skipSpill and preserves the in-memory pipe buffer when that option is enabled.',
  ),
])

export const TARGET119_LATER_DONOR_RUNTIME_FILES = FILES

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function replaceExactly(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Target119 later-donor replay ${label} anchor is not unique`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

function replayEnv(source) {
  return replaceExactly(
    source,
    `  if (process.env.GITPOD_WORKSPACE_ID) return 'gitpod'
  if (process.env.REPL_ID || process.env.REPL_SLUG) return 'replit'`,
    `  if (process.env.GITPOD_WORKSPACE_ID) return 'gitpod'
  if (isEnvTruthy(process.env.CODER) || process.env.CODER_WORKSPACE_NAME)
    return 'coder'
  if (isEnvTruthy(process.env.DEVPOD) || process.env.DEVPOD_WORKSPACE_UID)
    return 'devpod'
  if (process.env.DAYTONA_WS_ID) return 'daytona'
  if (isEnvTruthy(process.env.GOOGLE_CLOUD_WORKSTATIONS))
    return 'gcp-cloud-workstations'
  if (process.env.C9_PID || process.env.C9_USER) return 'aws-cloud9'
  if (process.env.REPL_ID || process.env.REPL_SLUG) return 'replit'`,
    'deployment-environment branches',
  )
}

function replayAgentTool(source) {
  let next = replaceExactly(
    source,
    `    getToolPermissionContext,
    allowedAgentTypes
  }) {`,
    `    getToolPermissionContext,
    allowedAgentTypes,
    model
  }) {`,
    'AgentTool prompt model parameter',
  )
  next = replaceExactly(
    next,
    '    return await getPrompt(filteredAgents, isCoordinator, allowedAgentTypes);',
    '    return await getPrompt(filteredAgents, model, isCoordinator, allowedAgentTypes);',
    'AgentTool prompt model forwarding',
  )
  next = replaceExactly(
    next,
    `                showSpinner: true
              });
            }

            // Race between next message and background signal`,
    `                showSpinner: true
              });
              if (toolUseContext.toolUseId) {
                toolUseContext.emitToolProgress?.({
                  kind: 'background_hint',
                  toolUseId: toolUseContext.toolUseId,
                });
              }
            }

            // Race between next message and background signal`,
    'AgentTool background-hint progress event',
  )
  next = replaceExactly(
    next,
    `            for (const m of normalizedNew) {
              for (const content of m.message.content) {
                if (content.type !== 'tool_use' && content.type !== 'tool_result') {
                  continue;
                }

                // Forward progress updates
                if (onProgress) {
                  onProgress({
                    toolUseID: \`agent_\${assistantMessage.message.id}\`,
                    data: {
                      message: m,
                      type: 'agent_progress',
                      // prompt only needed on first progress message (UI.tsx:624
                      // reads progressMessages[0]). Omit here to avoid duplication.
                      prompt: '',
                      agentId: syncAgentId
                    }
                  });
                }
              }
            }`,
    `            for (const m of normalizedNew) {
              if (!onProgress) continue;
              const content = m.message.content[0];
              if (!toolUseContext.options.forwardSubagentText && content?.type !== 'tool_use' && content?.type !== 'tool_result') {
                continue;
              }

              onProgress({
                toolUseID: \`agent_\${assistantMessage.message.id}\`,
                data: {
                  message: m,
                  type: 'agent_progress',
                  // prompt only needed on first progress message (UI.tsx:624
                  // reads progressMessages[0]). Omit here to avoid duplication.
                  prompt: '',
                  agentId: syncAgentId
                }
              });
            }`,
    'AgentTool subagent text progress forwarding',
  )
  return replaceExactly(
    next,
    `          if (toolUseContext.setToolJSX) {
            toolUseContext.setToolJSX(null);
          }

          // Stop foreground summarization.`,
    `          if (toolUseContext.setToolJSX) {
            toolUseContext.setToolJSX(null);
          }
          if (toolUseContext.toolUseId) {
            toolUseContext.emitToolProgress?.({
              kind: 'clear',
              toolUseId: toolUseContext.toolUseId,
            });
          }

          // Stop foreground summarization.`,
    'AgentTool clear progress event',
  )
}

function replayShellCommand(source) {
  let next = replaceExactly(
    source,
    '  background: (backgroundTaskId: string) => boolean',
    `  background: (
    backgroundTaskId: string,
    options?: { skipSpill?: boolean },
  ) => boolean`,
    'ShellCommand interface option',
  )
  next = replaceExactly(
    next,
    '  background(taskId: string): boolean {',
    '  background(taskId: string, options?: { skipSpill?: boolean }): boolean {',
    'ShellCommand implementation option',
  )
  return replaceExactly(
    next,
    '      } else {\n        // Pipe mode: spill the in-memory buffer so readers can find it on disk.',
    '      } else if (!options?.skipSpill) {\n        // Pipe mode: spill the in-memory buffer so readers can find it on disk.',
    'ShellCommand skip-spill gate',
  )
}

const REPLAYERS = new Map([
  ['src/utils/env.ts', replayEnv],
  ['src/tools/AgentTool/AgentTool.tsx', replayAgentTool],
  ['src/utils/ShellCommand.ts', replayShellCommand],
])

export function applyTarget119LaterDonorRuntimeReplay({ sourceRoot }) {
  const snapshots = FILES.map(file => {
    const filename = path.join(sourceRoot, file.path.replace(/^src\//, ''))
    const bytes = fs.readFileSync(filename)
    return { file, filename, bytes, actual: descriptor(bytes) }
  })
  const states = new Set(
    snapshots.map(({ file, actual }) => {
      if (
        actual.bytes === file.before.bytes &&
        actual.sha256 === file.before.sha256
      ) {
        return 'raw'
      }
      if (
        actual.bytes === file.after.bytes &&
        actual.sha256 === file.after.sha256
      ) {
        return 'recovered'
      }
      throw new Error(
        `Target119 later-donor replay ${file.path} is neither raw nor recovered: ` +
          `${actual.bytes}/${actual.sha256}`,
      )
    }),
  )
  if (states.size !== 1) {
    throw new Error('Target119 later-donor replay files are in a partial state')
  }
  if (states.has('recovered')) return { status: 'already-recovered' }

  for (const { file, filename, bytes } of snapshots) {
    const replay = REPLAYERS.get(file.path)
    const postimage = Buffer.from(replay(bytes.toString('utf8')))
    if (
      postimage.length !== file.after.bytes ||
      sha256(postimage) !== file.after.sha256
    ) {
      throw new Error(`Target119 later-donor replay ${file.path} postimage drifted`)
    }
    fs.writeFileSync(filename, postimage)
  }
  return { status: 'recovered' }
}

function parseCli(argv) {
  const index = argv.indexOf('--source-root')
  if (index < 0 || !argv[index + 1]) {
    throw new Error(
      'usage: replay-later-donor-runtime-source-gaps.mjs --source-root DIR',
    )
  }
  return path.resolve(argv[index + 1])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget119LaterDonorRuntimeReplay({
    sourceRoot: parseCli(process.argv.slice(2)),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
