import memoize from 'lodash-es/memoize.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { logEvent } from '../services/analytics/index.js'
import { getGlobalConfig, saveGlobalConfig } from './config.js'
import { getCwd } from './cwd.js'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { findGitRoot, gitExe } from './git.js'
import { getGitEmail } from './user.js'

const TEAM_ARTIFACT_DIRECTORIES = ['.claude/skills', '.claude/commands']
const MAX_TEAM_ARTIFACTS_IN_TIP = 3
const MAX_SEEN_TEAM_ARTIFACT_PATHS = 100

export type TeamArtifact = {
  path: string
  author: string
  kind: 'skill' | 'command'
  name: string
}

function parseTeamArtifactPath(
  filePath: string,
): Pick<TeamArtifact, 'kind' | 'name'> | null {
  const parts = filePath.split('/')
  if (parts[0] !== '.claude' || parts.length < 3) return null

  switch (parts[1]) {
    case 'skills':
      if (parts.length === 4 && parts[3] === 'SKILL.md') {
        return { kind: 'skill', name: parts[2]! }
      }
      return null
    case 'commands': {
      const fileName = parts.at(-1)
      if (!fileName?.endsWith('.md')) return null
      if (/^skill\.md$/i.test(fileName)) {
        if (parts.length < 4) return null
        return {
          kind: 'command',
          name: parts.slice(2, -1).join(':'),
        }
      }
      return {
        kind: 'command',
        name: parts.slice(2).join(':').slice(0, -3),
      }
    }
    default:
      return null
  }
}

let loadedTeamArtifacts: TeamArtifact[] | undefined

export const getTeamArtifacts = memoize(async (): Promise<TeamArtifact[]> => {
  const gitRoot = findGitRoot(getCwd())
  if (!gitRoot) return []

  const [{ stdout, code }, currentUserEmail] = await Promise.all([
    execFileNoThrowWithCwd(
      gitExe(),
      [
        '-c',
        'core.quotePath=false',
        'log',
        '--since=7.days',
        '--diff-filter=A',
        '--name-only',
        '--format=COMMIT%x00%an%x00%ae',
        '--',
        ...TEAM_ARTIFACT_DIRECTORIES,
      ],
      { cwd: gitRoot, timeout: 5000 },
    ),
    getGitEmail(),
  ])
  if (code !== 0) return []

  const normalizedCurrentEmail = currentUserEmail?.toLowerCase()
  const artifacts: TeamArtifact[] = []
  const seenPaths = new Set<string>()
  let author = ''
  let authorEmail = ''

  for (const line of stdout.split('\n')) {
    if (line.startsWith('COMMIT\0')) {
      const fields = line.split('\0')
      author = fields[1] ?? ''
      authorEmail = (fields[2] ?? '').toLowerCase()
      continue
    }
    if (!line || seenPaths.has(line)) continue
    seenPaths.add(line)
    if (normalizedCurrentEmail && authorEmail === normalizedCurrentEmail) {
      continue
    }
    const parsed = parseTeamArtifactPath(line)
    if (parsed) artifacts.push({ path: line, author, ...parsed })
  }

  loadedTeamArtifacts = artifacts
  return artifacts
})

export function getTeamArtifactAuthor(
  source: string,
  name: string,
): string | null {
  if (
    source !== 'projectSettings' ||
    !getFeatureValue_CACHED_MAY_BE_STALE('tengu_tussock_oriole', false)
  ) {
    return null
  }
  return (
    loadedTeamArtifacts?.find(artifact => artifact.name === name)?.author ||
    null
  )
}

export async function getUnseenTeamArtifacts(): Promise<TeamArtifact[]> {
  const artifacts = await getTeamArtifacts()
  if (artifacts.length === 0) return []
  const seenPaths = new Set(getGlobalConfig().seenTeamArtifactPaths ?? [])
  return artifacts.filter(artifact => !seenPaths.has(artifact.path))
}

export async function markTeamArtifactsSeen(): Promise<void> {
  const currentPaths = (await getTeamArtifacts()).map(artifact => artifact.path)
  const currentPathSet = new Set(currentPaths)
  saveGlobalConfig(config => {
    const previousPaths = config.seenTeamArtifactPaths ?? []
    const nextPaths = [
      ...previousPaths.filter(path => !currentPathSet.has(path)),
      ...currentPaths,
    ].slice(-MAX_SEEN_TEAM_ARTIFACT_PATHS)
    if (
      nextPaths.length === previousPaths.length &&
      nextPaths.every((path, index) => path === previousPaths[index])
    ) {
      return config
    }
    return { ...config, seenTeamArtifactPaths: nextPaths }
  })
}

export function logTeamArtifactTipShown(artifacts: TeamArtifact[]): void {
  const counts = { skill: 0, command: 0 }
  for (const artifact of artifacts) counts[artifact.kind]++
  logEvent('tengu_team_artifact_tip_shown', {
    skill_count: counts.skill,
    command_count: counts.command,
    overflow_count: Math.max(
      0,
      artifacts.length - MAX_TEAM_ARTIFACTS_IN_TIP,
    ),
  })
}

export function getTeamArtifactAnalyticsMetadata(
  source: string,
  name: string,
): { via_team_tip?: boolean } {
  if (source !== 'projectSettings') return {}
  return {
    via_team_tip: (getGlobalConfig().seenTeamArtifactPaths ?? []).some(
      path => parseTeamArtifactPath(path)?.name === name,
    ),
  }
}

export function formatTeamArtifactTip(artifacts: TeamArtifact[]): string {
  if (artifacts.length === 0) return ''
  const displayed = artifacts.slice(0, MAX_TEAM_ARTIFACTS_IN_TIP)
  const names = displayed.map(
    artifact => `/${artifact.name} (${artifact.author || 'a teammate'})`,
  )
  const formattedNames =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  const overflow = artifacts.length - displayed.length
  return `New from your team: ${formattedNames}${
    overflow > 0 ? `, plus ${overflow} more` : ''
  }`
}
