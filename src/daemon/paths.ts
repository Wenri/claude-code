import { createHash, randomBytes } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import memoize from 'lodash-es/memoize.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { getErrnoCode, isENOENT } from '../utils/errors.js'

export function getDaemonDir(): string {
  return join(getClaudeConfigHomeDir(), 'daemon')
}

export const getConfigDirHash = memoize(
  () =>
    createHash('sha256')
      .update(getClaudeConfigHomeDir())
      .digest('hex')
      .slice(0, 8),
  () => getClaudeConfigHomeDir(),
)

export const getDaemonRuntimeDir = memoize(
  () => {
    const uid = process.getuid?.() ?? 0
    const tmpDir =
      process.env.TERMUX_VERSION && process.env.PREFIX
        ? join(process.env.PREFIX, 'tmp')
        : '/tmp'
    return join(tmpDir, `cc-daemon-${uid}`, getConfigDirHash())
  },
  () => getClaudeConfigHomeDir(),
)

export const getPipeKey = memoize(
  () => {
    const path = join(getDaemonDir(), 'pipe.key')
    try {
      return readFileSync(path, 'utf8').trim()
    } catch (error) {
      if (!isENOENT(error)) throw error
    }

    const key = randomBytes(8).toString('hex')
    mkdirSync(getDaemonDir(), { recursive: true })
    try {
      writeFileSync(path, key, { flag: 'wx' })
      return key
    } catch (error) {
      if (getErrnoCode(error) !== 'EEXIST') throw error
      return readFileSync(path, 'utf8').trim()
    }
  },
  () => getClaudeConfigHomeDir(),
)
