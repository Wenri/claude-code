import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = [
  [
    14967,
    11103743,
    11118808,
    'b5027bb2ffe237aa6db9e7a9f3bc0b6d3bc284cff4c18bced643af7bc301156c',
  ],
  [
    14990,
    11125061,
    11125138,
    'af2ad98a2f36d28e17ca70bf57c062691bb7790cec8d5c1de2afd5129315d2d7',
  ],
  [
    14993,
    11125898,
    11127579,
    'a46e725e0cde38d12f1f47c7eb743cb9dd77b478179541f729f6289871752296',
  ],
  [
    18410,
    12792469,
    12796971,
    '16c35b499a32245ad3bdd5cacfd100a82117c23a136a807fe230827f90387f00',
  ],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, pattern) {
  return value.match(pattern)?.length ?? 0
}

test(
  'target101 pins the resume selector state and all-worktree launch graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
    )
    assert.equal(
      sha256(targetBytes),
      'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
    )

    const fragments = new Map()
    for (const [index, start, end, hash] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
      )
      const fragment = targetBytes.toString('utf8').slice(start, end)
      assert.equal(sha256(fragment), hash)
      fragments.set(index, fragment)
    }

    assert.match(fragments.get(14967), /initialShowAllWorktrees/)
    assert.match(fragments.get(14967), /reloadGeneration/)
    assert.match(fragments.get(14967), /Refreshing…/)
    assert.match(fragments.get(14967), /\.current\?\.abort\(\)/)
    assert.match(fragments.get(14990), /ResumeCommand/)
    assert.match(fragments.get(14993), /reloadGeneration:/)
    assert.match(fragments.get(14993), /initialShowAllWorktrees:!0/)
    assert.match(fragments.get(18410), /claude · resume/)
    assert.match(fragments.get(18410), /reloadGeneration:/)
    assert.match(fragments.get(18410), /initialShowAllWorktrees:!0/)

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(occurrences(baseline, /initialShowAllWorktrees/g), 0)
    assert.equal(occurrences(target, /initialShowAllWorktrees/g), 3)
    assert.equal(occurrences(baseline, /claude · resume/g), 0)
    assert.equal(occurrences(target, /claude · resume/g), 1)
  },
)

test(
  'source reproduces target101 resume state while preserving target116 evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const resumeCommand = fs.readFileSync(
      path.join(sourceRoot, 'commands/resume/resume.tsx'),
      'utf8',
    )
    const selector = fs.readFileSync(
      path.join(sourceRoot, 'components/LogSelector.tsx'),
      'utf8',
    )
    const resumeConversation = fs.readFileSync(
      path.join(sourceRoot, 'screens/ResumeConversation.tsx'),
      'utf8',
    )

    for (const fragment of [
      'isLoading = false',
      'reloadGeneration = 0',
      'if (reloadGeneration === 0) return',
      'agenticSearchAbortRef.current?.abort()',
      'setDeepSearchResults(null)',
      '· Refreshing…',
    ]) {
      assert.ok(selector.includes(fragment), `LogSelector: ${fragment}`)
    }
    for (const fragment of [
      'const reloadRequestRef = React.useRef(0)',
      'const [reloadGeneration, setReloadGeneration] = React.useState(0)',
      'if (reloadRequestRef.current !== generation) return',
      'reloadGeneration={reloadGeneration}',
    ]) {
      assert.ok(
        resumeConversation.includes(fragment),
        `ResumeConversation: ${fragment}`,
      )
    }

    if (semanticCase === caseName) {
      for (const fragment of [
        'export function ResumeCommand',
        'const [showAllProjects, setShowAllProjects] = React.useState(true)',
        'const [reloadGeneration, setReloadGeneration] = React.useState(0)',
        'const allLogs = await loadAllProjectsMessageLogs()',
        'setShowAllProjects(previous => !previous)',
        'setReloadGeneration(previous => previous + 1)',
        'onLogsChanged={() => loadLogs()}',
        'initialShowAllWorktrees={true}',
      ]) {
        assert.ok(resumeCommand.includes(fragment), `ResumeCommand: ${fragment}`)
      }
      for (const fragment of [
        'initialShowAllWorktrees = false',
        'React.useState(initialShowAllWorktrees)',
      ]) {
        assert.ok(selector.includes(fragment), `LogSelector: ${fragment}`)
      }
      for (const fragment of [
        'const [showAllProjects, setShowAllProjects] = React.useState(true)',
        "useTerminalTitle(resumeData || terminalTitleDisabled ? null : 'claude · resume')",
        'loadAllProjectsMessageLogsProgressive().then',
        'const generation = ++reloadRequestRef.current',
        'const previousResult = sessionLogResultRef.current',
        'setShowAllProjects(previous => !previous)',
        'initialShowAllWorktrees={true}',
      ]) {
        assert.ok(
          resumeConversation.includes(fragment),
          `ResumeConversation: ${fragment}`,
        )
      }
      return
    }

    assert.match(
      resumeCommand,
      /const \[showAllProjects, setShowAllProjects\] = React\.useState\(false\)/,
    )
    assert.match(
      resumeCommand,
      /allProjects \? await loadAllProjectsMessageLogs\(\) : await loadSameRepoMessageLogs\(paths\)/,
    )
    assert.equal(resumeCommand.includes('initialShowAllWorktrees'), false)
    assert.equal(resumeCommand.includes('reloadGeneration'), false)
    assert.match(
      resumeConversation,
      /const \[showAllProjects, setShowAllProjects\] = React\.useState\(false\)/,
    )
    assert.match(
      resumeConversation,
      /allProjects \? loadAllProjectsMessageLogsProgressive\(\) : loadSameRepoMessageLogsProgressive\(worktreePaths\)/,
    )
    assert.equal(resumeConversation.includes('claude · resume'), false)
    assert.equal(resumeConversation.includes('initialShowAllWorktrees'), false)
    assert.equal(selector.includes('initialShowAllWorktrees'), false)
  },
)
