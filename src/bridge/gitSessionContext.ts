export type GitSessionContext = {
  sources: Array<{
    type: 'git_repository'
    url: string
    revision: string | undefined
  }>
  outcomes: Array<{
    type: 'git_repository'
    git_info: {
      type: 'github'
      repo: string
      branches: string[]
    }
  }>
}

/** Build the repository context sent when an env-less bridge session starts. */
export async function buildGitSessionContext(
  gitRepoUrl: string | null | undefined,
  branch: string,
  defaultBranch?: string,
): Promise<GitSessionContext> {
  if (!gitRepoUrl) return { sources: [], outcomes: [] }

  const { parseGitRemote, parseGitHubRepository } = await import(
    '../utils/detectRepository.js'
  )
  const { getDefaultBranch } = await import('../utils/git.js')

  const build = (
    host: string,
    owner: string,
    name: string,
    revision: string | undefined,
  ): GitSessionContext => ({
    sources: [
      {
        type: 'git_repository',
        url: `https://${host}/${owner}/${name}`,
        revision,
      },
    ],
    outcomes: [
      {
        type: 'git_repository',
        git_info: {
          type: 'github',
          repo: `${owner}/${name}`,
          branches: revision ? [revision] : [],
        },
      },
    ],
  })

  const parsed = parseGitRemote(gitRepoUrl)
  if (parsed) {
    const revision =
      branch || defaultBranch || (await getDefaultBranch()) || undefined
    return build(parsed.host, parsed.owner, parsed.name, revision)
  }

  const githubRepository = parseGitHubRepository(gitRepoUrl)
  if (githubRepository) {
    const [owner, name] = githubRepository.split('/')
    if (owner && name) {
      const revision =
        branch || defaultBranch || (await getDefaultBranch()) || undefined
      return build('github.com', owner, name, revision)
    }
  }

  return { sources: [], outcomes: [] }
}
