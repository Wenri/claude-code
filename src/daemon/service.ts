import { execFile } from 'child_process'
import { statSync } from 'fs'
import { access, mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { promisify } from 'util'
import { isInBundledMode } from '../utils/bundledMode.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'
import { getUserBinDir } from '../utils/xdg.js'

export const DAEMON_SERVICE_ID = 'com.anthropic.claude-daemon'

const execFileAsync = promisify(execFile)

export function getDefaultDaemonConfigPath(): string {
  return join(getClaudeConfigHomeDir(), 'daemon.json')
}

export function getDefaultDaemonLogPath(): string {
  return join(getClaudeConfigHomeDir(), 'daemon.log')
}

export function isServiceInstallSupported(): boolean {
  const runtimeDir =
    process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 0}`
  try {
    return statSync(join(runtimeDir, 'systemd')).isDirectory()
  } catch {
    return false
  }
}

export function getSystemdServicePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(configHome, 'systemd', 'user', `${DAEMON_SERVICE_ID}.service`)
}

/**
 * Return the stable, user-facing daemon executable path.
 *
 * Native releases are installed behind ~/.local/bin/claude. Following that
 * symlink lets a long-running daemon notice when an updater switches versions,
 * and keeps a generated service unit from pinning one versioned binary.
 */
export function getDaemonExecutablePath(): string {
  if (isInBundledMode()) return join(getUserBinDir(), 'claude')
  return process.argv[1] || process.execPath
}

function sanitizeUnitValue(value: string): string {
  return value.replace(/[\r\n]/g, ' ').replaceAll('%', '%%')
}

function quoteUnitArg(value: string): string {
  const clean = sanitizeUnitValue(value)
  return clean.includes(' ') ? `"${clean}"` : clean
}

async function systemctl(...args: string[]) {
  try {
    const result = await execFileAsync('systemctl', ['--user', ...args])
    return { code: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const value = error as Error & {
      code?: number
      stdout?: string
      stderr?: string
    }
    return {
      code: typeof value.code === 'number' ? value.code : 1,
      stdout: value.stdout ?? '',
      stderr: value.stderr ?? value.message,
    }
  }
}

export async function installDaemonService(options: {
  jsonPath: string
  logPath: string
}): Promise<
  | { ok: true; serviceId: string; servicePath: string }
  | { ok: false; error: string; serviceId: string; servicePath: string }
> {
  const servicePath = getSystemdServicePath()
  if (!isServiceInstallSupported()) {
    return {
      ok: false,
      error: 'service install not supported on linux',
      serviceId: DAEMON_SERVICE_ID,
      servicePath: '',
    }
  }
  const serviceName = `${DAEMON_SERVICE_ID}.service`
  const path = process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
  const unit = `[Unit]
Description=Claude Daemon
After=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=10

[Service]
Type=simple
Environment="PATH=${sanitizeUnitValue(path)}"
ExecStart=${quoteUnitArg(getDaemonExecutablePath())} daemon --json-path ${quoteUnitArg(options.jsonPath)} --log-file ${quoteUnitArg(options.logPath)} --origin service
Restart=always
RestartSec=1
StandardOutput=append:${sanitizeUnitValue(options.logPath)}
StandardError=append:${sanitizeUnitValue(options.logPath)}

[Install]
WantedBy=default.target
`
  try {
    await mkdir(dirname(servicePath), { recursive: true })
    await writeFile(servicePath, unit, 'utf8')
  } catch (error) {
    return {
      ok: false,
      error: String(error),
      serviceId: DAEMON_SERVICE_ID,
      servicePath,
    }
  }
  await systemctl('daemon-reload')
  const enabled = await systemctl('enable', '--now', serviceName)
  if (enabled.code !== 0) {
    return {
      ok: false,
      error: enabled.stderr || 'systemctl enable failed',
      serviceId: DAEMON_SERVICE_ID,
      servicePath,
    }
  }
  await systemctl('restart', serviceName)
  return { ok: true, serviceId: DAEMON_SERVICE_ID, servicePath }
}

export async function uninstallDaemonService(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await systemctl('disable', '--now', `${DAEMON_SERVICE_ID}.service`)
  try {
    await unlink(getSystemdServicePath())
  } catch (error) {
    if (!isENOENT(error)) return { ok: false, error: String(error) }
  }
  await systemctl('daemon-reload')
  return { ok: true }
}

export async function controlDaemonService(
  action: 'start' | 'stop' | 'restart',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await systemctl(action, `${DAEMON_SERVICE_ID}.service`)
  return result.code === 0
    ? { ok: true }
    : { ok: false, error: result.stderr || `systemctl ${action} failed` }
}

export async function isDaemonServiceInstalled(): Promise<boolean> {
  const result = await systemctl('status', `${DAEMON_SERVICE_ID}.service`)
  if (result.stderr.includes('Failed to connect to bus')) return false
  return result.code === 0 || result.code === 3
}

export async function serviceExecutableIsMissing(): Promise<boolean> {
  let unit
  try {
    unit = await readFile(getSystemdServicePath(), 'utf8')
  } catch {
    return false
  }
  const match = unit.match(/^ExecStart=(?:"([^"]+)"|(\S+))/m)
  const executable = match?.[1] ?? match?.[2]
  if (!executable) return false
  try {
    await access(executable)
    return false
  } catch {
    return true
  }
}
