import { randomUUID, type UUID } from 'crypto'
import {
  BASH_EXIT_CODE_TAG,
  BASH_STDERR_TAG,
  BASH_STDOUT_TAG,
} from '../constants/xml.js'
import { getCwd } from '../utils/cwd.js'
import { execFileNoThrowWithCwd } from '../utils/execFileNoThrow.js'
import { resolveDefaultShell } from '../utils/shell/resolveDefaultShell.js'
import { escapeXml } from '../utils/xml.js'

export async function runHeadlessBashCommand({
  command,
  cwd = getCwd(),
  abortSignal,
}: {
  command: string
  cwd?: string
  abortSignal?: AbortSignal
}): Promise<{ outputUuid: UUID; outputText: string; exitCode: number }> {
  const { file, args } =
    resolveDefaultShell() === 'powershell'
      ? { file: 'pwsh', args: ['-NoProfile', '-Command', command] }
      : { file: '/bin/sh', args: ['-c', command] }
  const { stdout, stderr, code, error } = await execFileNoThrowWithCwd(
    file,
    args,
    {
      abortSignal,
      cwd,
      preserveOutputOnError: true,
    },
  )
  const fallbackError =
    error && !error.startsWith(`Command failed with exit code ${code}`)
      ? error
      : ''

  return {
    outputUuid: randomUUID(),
    outputText: `<${BASH_STDOUT_TAG}>${escapeXml(stdout)}</${BASH_STDOUT_TAG}><${BASH_STDERR_TAG}>${escapeXml(stderr || fallbackError)}</${BASH_STDERR_TAG}><${BASH_EXIT_CODE_TAG}>${code}</${BASH_EXIT_CODE_TAG}>`,
    exitCode: code,
  }
}
