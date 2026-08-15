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

const units = new Map([
  [7939, [6546518, 6548421, 'dfc816edb698b0719a15ea51aabe5b34f4128836cc0ad0e7b0f66244e9ee1eee']],
  [11488, [8859828, 8859902, '643c146823a7d6fb9bade34ea55b37f1e3074e6cb5b187d4a47f0110e1b91a8e']],
  [11668, [8937461, 8937753, 'e35d57906da9596d030661f503341716f4a9958e774376616fdfa7a8eb9f05f3']],
  [11669, [8937753, 8937873, 'e2ea792fed5d36316f8ce457ec93b0b16d8ac84e7bbeab1e2ac522a9f7748f1c']],
  [11670, [8937873, 8938078, '8ca0bc9f38d11eb106c75df6679b98a97a458a9f2fee61984fa09f0ddc1c0b2d']],
  [11671, [8938078, 8938287, '2fda8771520f742bf60cbf73c80b88a145fe29e9494f6838853047df0eedb6e4']],
  [11672, [8938287, 8938499, '0d14afb0a6a5041bc9694326069307b13148c4fde7f5b44a3812155976a596ce']],
  [11673, [8938499, 8938690, 'f70a5b8df6863694064434fb0d923838e03dd90669e2e3083686cca19bd01b9f']],
  [11674, [8938690, 8939708, '1b7629ca901282fac453115fbf5c27a7bed4a8a08252b9d4868672e62faed623']],
  [12672, [9728867, 9729060, '7e447d2a74625e4f12db43e9e2dfa098d13658f1f6b21b0794f5563e4463afad']],
  [13329, [10040324, 10046561, 'c0d363b192ea2ee0a2d2c3f539f279aa5272e0d7c04f6414eff437d18f0f1551']],
  [17740, [12461260, 12465011, '4f5b496837908031934ab37d73ed7fdb3f6101ce7ac2c881a8c52a02cefaec69']],
  [17744, [12466124, 12468415, '65e1262da0cec8528e816d87a62f3e04d64e5750be7cf38b1bc716406dcef005']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target101 introduces the AppState classifier graph at exact authenticated units',
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
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.includes('classifierApprovals'), false)
    assert.ok(target.includes('classifierApprovals:{approvals:new Map,checking:new Set}'))

    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
  },
)

test(
  'source owns immutable classifier state, UI reads, permission writes, and cleanup',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const approvals = source('utils/classifierApprovals.ts')
    const hook = source('utils/classifierApprovalsHook.ts')
    const appState = source('state/AppStateStore.ts')
    const useCanUseTool = source('hooks/useCanUseTool.tsx')
    const interactive = source(
      'hooks/toolPermission/handlers/interactiveHandler.ts',
    )
    const permissions = source('utils/permissions/permissions.ts')
    const result = source(
      'components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx',
    )
    const cleanup = source('services/compact/postCompactCleanup.ts')
    const autoCompact = source('services/compact/autoCompact.ts')
    const compact = source('commands/compact/compact.ts')
    const main = source('main.tsx')

    for (const fragment of [
      'classifierApprovals:',
      'approvals: new Map()',
      'checking: new Set()',
    ]) {
      assert.ok(appState.includes(fragment), `AppState: ${fragment}`)
      assert.ok(main.includes(fragment), `main: ${fragment}`)
    }

    assert.equal(approvals.includes('createSignal'), false)
    assert.equal(approvals.includes('CLASSIFIER_APPROVALS'), false)
    assert.equal(approvals.includes('CLASSIFIER_CHECKING'), false)
    for (const fragment of [
      'new Map(',
      'new Set(',
      '.approvals.has(toolUseID)',
      '.checking.has(toolUseID)',
      'approvals.size === 0',
      'checking.size === 0',
    ]) {
      assert.ok(approvals.includes(fragment), fragment)
    }

    assert.match(
      hook,
      /useAppStateMaybeOutsideOfProvider\([\s\S]*?classifierApprovals\.checking\.has\(toolUseID\)/,
    )
    assert.equal(hook.includes('useSyncExternalStore'), false)
    assert.match(result, /useAppStateStore\(\)/)
    assert.match(result, /getClassifierApproval\(appStateStore\.getState\(\)/)
    assert.match(result, /getYoloClassifierApproval\(appStateStore\.getState\(\)/)
    assert.match(result, /deleteClassifierApproval\(/)

    for (const [name, contents] of [
      ['useCanUseTool', useCanUseTool],
      ['interactive', interactive],
      ['permissions', permissions],
    ]) {
      assert.match(contents, /setClassifierChecking|setYoloClassifierApproval/,
        name)
      assert.match(contents, /clearClassifierChecking/, name)
    }
    assert.match(cleanup, /clearClassifierApprovals\(/)
    assert.match(cleanup, /setAppState\?/)
    assert.match(
      autoCompact,
      /runPostCompactCleanup\(querySource, toolUseContext\.setAppState\)/,
    )
    assert.match(
      compact,
      /runPostCompactCleanup\(undefined, context\.setAppState\)/,
    )

    if (semanticCase === caseName) {
      assert.equal(approvals.includes('createClassifierApprovalsSetter'), false)
      assert.match(
        useCanUseTool,
        /setAppStateForTasks \?\? toolUseContext\.setAppState/,
      )
      assert.match(
        interactive,
        /setAppStateForTasks \?\? ctx\.toolUseContext\.setAppState/,
      )
    } else {
      const tool = source('Tool.ts')
      const queryContext = source('utils/queryContext.ts')
      const forkedAgent = source('utils/forkedAgent.ts')
      assert.match(approvals, /createClassifierApprovalsSetter/)
      assert.match(tool, /setClassifierApprovals: SetClassifierApprovals/)
      assert.match(
        queryContext,
        /setClassifierApprovals: createClassifierApprovalsSetter\(setAppState\)/,
      )
      assert.match(
        forkedAgent,
        /setClassifierApprovals: parentContext\.setClassifierApprovals/,
      )
    }
  },
)
