import type {
  GitRepositoryOutcome,
  GitSource,
} from './teleport/api.js'

export async function buildGitSessionContext(
  gitRepoUrl: string | null,
  branch?: string,
  defaultBranch?: string,
): Promise<{
  sources: GitSource[]
  outcomes: GitRepositoryOutcome[]
}> {
  if (!gitRepoUrl) return { sources: [], outcomes: [] }

  const { parseGitRemote, parseGitHubRepository } = await import(
    './detectRepository.js'
  )
  const { getDefaultBranch } = await import('./git.js')
  const resolvedDefaultBranch =
    defaultBranch || (await getDefaultBranch()) || ''
  const revision = branch || resolvedDefaultBranch || undefined
  const outcomeBranches =
    revision && revision !== resolvedDefaultBranch ? [revision] : []

  const build = (
    host: string,
    owner: string,
    repo: string,
  ): {
    sources: GitSource[]
    outcomes: GitRepositoryOutcome[]
  } => ({
    sources: [
      {
        type: 'git_repository',
        url: `https://${host}/${owner}/${repo}`,
        revision,
      },
    ],
    outcomes: [
      {
        type: 'git_repository',
        git_info: {
          type: 'github',
          repo: `${owner}/${repo}`,
          branches: outcomeBranches,
        },
      },
    ],
  })

  const parsed = parseGitRemote(gitRepoUrl)
  if (parsed) return build(parsed.host, parsed.owner, parsed.name)

  const githubRepo = parseGitHubRepository(gitRepoUrl)
  if (githubRepo) {
    const [owner, repo] = githubRepo.split('/')
    if (owner && repo) return build('github.com', owner, repo)
  }

  return { sources: [], outcomes: [] }
}
