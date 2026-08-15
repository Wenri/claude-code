import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const caseName = process.argv[2]
const sourceRoot = process.argv[3]
if (!caseName) throw new Error('usage: .tmp-run-case-evidence.mjs CASE [SOURCE_ROOT]')

const repositoryRoot = process.cwd()
const artifactRoot = '/tmp/claude-recovery-all-artifacts.9cj1Zk'
const coverage = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'semantic/source-coverage.json.gz',
      ),
    ),
  ).toString('utf8'),
)
const files = [
  ...new Set(
    coverage.evidence
      .filter(item => item.kind === 'semantic-test')
      .map(item => path.join(repositoryRoot, item.path)),
  ),
].sort()
const environment = { ...process.env }
for (const version of [
  88, 89, 90, 91, 92, 94, 96, 97, 98, 100, 101, 104, 105, 107, 108,
  109, 110, 111, 112,
]) {
  environment[`CLAUDE_CODE_2_1_${version}_BUNDLE`] =
    version === 88
      ? path.join(artifactRoot, '2.1.88/cli.js')
      : path.join(artifactRoot, `2.1.${version}/package/cli.js`)
}
for (const version of [113, 114, 116]) {
  environment[`CLAUDE_CODE_2_1_${version}_BUNDLE`] = path.join(
    artifactRoot,
    `2.1.${version}-linux-x64/cli.inner.js`,
  )
  environment[`CLAUDE_CODE_2_1_${version}_PUBLISHED_BUNDLE`] = path.join(
    artifactRoot,
    `2.1.${version}-linux-x64/cli.js`,
  )
}
if (sourceRoot) {
  environment.CLAUDE_CODE_SEMANTIC_CASE = caseName
  environment.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT = path.resolve(sourceRoot)
} else {
  delete environment.CLAUDE_CODE_SEMANTIC_CASE
  environment.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT = path.join(
    repositoryRoot,
    'src',
  )
}

console.error(
  `${caseName}: ${files.length} evidence files (${sourceRoot ? 'historical' : 'current'})`,
)
const result = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=dot', ...files],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 512 * 1024 * 1024,
  },
)
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
if (result.status !== 0) process.exitCode = result.status ?? 1
