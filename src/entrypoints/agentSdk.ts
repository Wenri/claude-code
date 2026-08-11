import { spawn } from 'child_process'
import { createInterface } from 'readline'

export type AgentSdkQueryMessage =
  | {
      type: 'result'
      subtype: string
      duration_ms: number
      total_cost_usd: number
      [key: string]: unknown
    }
  | { type: string; [key: string]: unknown }

export type AgentSdkQueryOptions = {
  cwd?: string
  permissionMode?: string
  allowDangerouslySkipPermissions?: boolean
  model?: string
  systemPrompt?:
    | string
    | { type: 'preset'; preset: 'claude_code'; append?: string }
  settingSources?: Array<'user' | 'project' | 'local'>
  pathToClaudeCodeExecutable?: string
  abortController?: AbortController
  stderr?: (data: string) => void
  workload?: string
}

/**
 * SDK query runtime used from bundled CLI workers. The public SDK transport
 * is process based as well: it starts the selected Claude executable, reads
 * stream-json frames, and exposes them as an async iterable.
 */
export async function* query({
  prompt,
  options = {},
}: {
  prompt: string
  options?: AgentSdkQueryOptions
}): AsyncGenerator<AgentSdkQueryMessage> {
  const executable = options.pathToClaudeCodeExecutable ?? process.execPath
  const args = [
    '--output-format',
    'stream-json',
    '--verbose',
    '--input-format',
    'stream-json',
  ]
  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode)
  }
  if (options.allowDangerouslySkipPermissions) {
    args.push('--allow-dangerously-skip-permissions')
  }
  if (options.model) args.push('--model', options.model)
  if (options.settingSources !== undefined) {
    args.push(`--setting-sources=${options.settingSources.join(',')}`)
  }
  if (typeof options.systemPrompt === 'string') {
    args.push('--system-prompt', options.systemPrompt)
  } else if (options.systemPrompt?.append) {
    args.push('--append-system-prompt', options.systemPrompt.append)
  }
  if (options.workload) args.push('--workload', options.workload)

  const env = { ...process.env }
  if (!env.CLAUDE_CODE_ENTRYPOINT) env.CLAUDE_CODE_ENTRYPOINT = 'sdk-ts'
  delete env.NODE_OPTIONS
  if (env.DEBUG_CLAUDE_AGENT_SDK) env.DEBUG = '1'
  else delete env.DEBUG

  const child = spawn(executable, args, {
    cwd: options.cwd,
    env,
    stdio: ['pipe', 'pipe', options.stderr ? 'pipe' : 'ignore'],
    windowsHide: true,
  })
  child.stderr?.on('data', chunk => options.stderr?.(String(chunk)))
  const abort = () => child.kill('SIGTERM')
  options.abortController?.signal.addEventListener('abort', abort, {
    once: true,
  })
  child.stdin.end(
    `${JSON.stringify({
      type: 'user',
      session_id: '',
      message: {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
      parent_tool_use_id: null,
    })}\n`,
  )
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  const lines = createInterface({ input: child.stdout! })
  try {
    for await (const line of lines) {
      if (!line.trim()) continue
      let message: unknown
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      if (message && typeof message === 'object' && 'type' in message) {
        yield message as AgentSdkQueryMessage
      }
    }
    const code = await exit
    if (code !== 0 && !options.abortController?.signal.aborted) {
      throw new Error(`Claude Code process exited with code ${code}`)
    }
  } finally {
    lines.close()
    options.abortController?.signal.removeEventListener('abort', abort)
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
}
