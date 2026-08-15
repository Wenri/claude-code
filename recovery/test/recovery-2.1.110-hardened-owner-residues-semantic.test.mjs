import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historicalSource = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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
  [15406, [11091618, 11092350, 'FunctionDeclaration', '156132320f7c3156fb8dfe667c5c10caf8255c6d5a57bba9d7aff784978b5df8', 'unresolved']],
  [15408, [11092957, 11095189, 'FunctionDeclaration', 'bdd03d58339059cc4a4b3fa24583da74b127ec9f32043f9ddb6f543e2f97ea9d', 'unresolved']],
  [15468, [11121321, 11123255, 'FunctionDeclaration', '6271fd7beeebe23c038a662fe5ae6d310c8bf381806aa254e5300a7307875d71', 'unresolved']],
  [15475, [11123904, 11124799, 'VariableDeclaration', '7b3ad02d77ab492e8d5f4a341a07da2e5e11123d42cf09381026c2569518e60f', 'unresolved']],
  [16473, [11605756, 11608853, 'ExpressionStatement', '7bae0710b598c40d788028ae527ba0036b7bb03414b9e060f98851e4c4314e89', 'unresolved']],
  [16515, [11612308, 11622332, 'ClassDeclaration', '392f6f94f3325f972892bbed6d5f7094da4f98ac9f0c2a814db12c797405df0d', 'unresolved']],
  [18016, [12358114, 12358957, 'VariableDeclaration', 'ea230d4510b81d4f7613c549d376649e7e4ce8a35f0918bbe4553028ac6a55d8', 'unresolved']],
  [19296, [13368081, 13402368, 'FunctionDeclaration', '889a05a71cca319bc7b451082e93ebf2c353811a58e2fa6fa2fe5cd48dfe3aca', 'unresolved']],
])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const source = relative => fs.readFileSync(path.join(sourceRoot, relative), 'utf8')

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test(
  'target110 pins review scope, mirror fanout, PR details, and plugin refresh units',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target109 and target110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, nodeType, hash, classification]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(baseline.includes('CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH'), false)
    assert.equal(baseline.includes('addSessionMirror'), false)
    assert.equal(baseline.includes('No changes against the ${_} fork point.'), false)

    const scope = target.slice(11091618, 11092350)
    assert.match(scope, /\["merge-base",_,"HEAD"\]/)
    assert.match(scope, /No changes against the \$\{_\} fork point\./)
    assert.doesNotMatch(scope, /origin\//)

    const launch = target.slice(11092957, 11095189)
    assert.match(launch, /source:"ultrareview"/)
    assert.match(launch, /bundleBaseRef:G/)
    assert.match(launch, /Scope: \$\{M\}/)
    assert.doesNotMatch(launch, /BUGHUNTER_MODEL|onBundleFail|tags:/)
    assert.match(launch, /return\{launched:!0,blocks:/)

    const dialog = target.slice(11121321, 11123255)
    assert.match(dialog, /Reviewing current branch against/)
    assert.match(dialog, /Finds and verifies bugs using a multi-agent review fleet\./)
    assert.doesNotMatch(dialog, /Scope:/)

    const command = target.slice(11123904, 11124799)
    assert.match(command, /let z=await QdK\(_\).*Y=z\.scope,A=await ddK\(\)/s)
    assert.match(command, /kind==="needs-confirm"\?null:A\.billingNote\|\|null/)

    const exportsUnit = target.slice(11605756, 11608853)
    assert.match(exportsUnit, /getCurrentSessionFile:/)
    assert.match(exportsUnit, /fireSessionMirror:/)
    assert.match(exportsUnit, /addSessionMirror:/)

    const storage = target.slice(11612308, 11622332)
    assert.match(storage, /mirrors=\[\]/)
    assert.match(storage, /addMirror\(q\)\{this\.mirrors\.push\(q\)\}/)
    assert.match(storage, /for\(let _ of this\.mirrors\)try/)
    assert.match(storage, /\[SessionMirror\] mirror failed/)
    assert.match(storage, /this\.fireMirror\(q,w\.slice\(\)\)/)

    const pr = target.slice(12358114, 12358957)
    assert.match(
      pr,
      /number,title,state,isDraft,statusCheckRollup,reviewDecision,mergeStateStatus,additions,deletions/,
    )
    assert.match(pr, /gh pr view failed \(exit \$\{_\}\)/)
    assert.match(pr, /mergeable:.*additions:z\.additions,deletions:z\.deletions/s)

    const print = target.slice(13368081, 13402368)
    assert.match(print, /CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH/)
    assert.match(print, /needsRefresh/)
    assert.match(print, /needsRefresh=!1;try\{await [A-Za-z_$][\w$]*\(\)/)
  },
)

test(
  'authored owners preserve the target110 runtime and later target116 refinements',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const review = source('commands/review/reviewRemote.ts')
    const dialog = source('commands/review/UltrareviewOverageDialog.tsx')
    const command = source('commands/review/ultrareviewCommand.tsx')
    const storage = source('utils/sessionStorage.ts')
    const pr = source('utils/ghPrStatus.ts')
    const print = source('cli/print.ts')

    assertFragments(
      review,
      [
        'export async function prepareRemoteReviewScope(',
        "source: 'ultrareview'",
        'bundleBaseRef: mergeBaseSha',
        'Scope: ${diffStat}',
        'BUGHUNTER_FLEET_SIZE',
        'BUGHUNTER_TOTAL_WALLCLOCK',
      ],
      'reviewRemote',
    )
    assertFragments(
      dialog,
      [
        'Finds and verifies bugs using a multi-agent review fleet.',
        'sourcePromise',
      ],
      'UltrareviewOverageDialog',
    )
    assertFragments(
      command,
      [
        "isPolicyAllowed('allow_remote_sessions')",
        'prepareRemoteReviewScope(args)',
        'checkOverageGate()',
        '<UltrareviewOverageDialog',
        'metaMessages: result.launched',
      ],
      'ultrareviewCommand',
    )
    assertFragments(
      storage,
      [
        'export function getCurrentSessionFile()',
        'export function addSessionMirror(',
        'private mirrors: SessionMirror[] = []',
        'this.mirrors.push(mirror)',
        '[SessionMirror] mirror failed for ${filePath}',
        'this.fireMirror(filePath, mirrorEntries.slice())',
      ],
      'sessionStorage',
    )
    assertFragments(
      pr,
      [
        'number,title,state,isDraft,statusCheckRollup,reviewDecision,mergeStateStatus,additions,deletions',
        'additions: data.additions',
        'deletions: data.deletions',
        'mergeStateStatus: data.mergeStateStatus',
      ],
      'ghPrStatus',
    )
    assertFragments(
      print,
      [
        'Promise<boolean>',
        'kickOffBackgroundPluginInstall',
        'needsRefresh',
        'CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH',
        'await refreshPluginState(',
      ],
      'print',
    )

    if (historicalSource) {
      assert.ok(review.includes("['merge-base', baseBranch, 'HEAD']"))
      assert.ok(
        review.includes(
          'No changes against the ${baseBranch} fork point. Make some commits or stage files first.',
        ),
      )
      for (const later of [
        'isRepoTooLargeForBundle',
        'getUltrareviewModel',
        'BUGHUNTER_MODEL',
        "tags: ['ultrareview']",
        'onBundleFail',
        'sessionId: session.id',
      ]) {
        assert.equal(review.includes(later), false, later)
      }
      assert.equal(dialog.includes('scopeStat'), false)
      assert.ok(
        dialog.includes('Reviewing PR #${scope.prNumber} fetched from GitHub.'),
      )
      assert.ok(
        dialog.includes('Reviewing current branch against ${scope.baseBranch}.'),
      )
      assert.equal(command.includes('Promise.all(['), false)
      assert.match(
        command,
        /const prepared = await prepareRemoteReviewScope\(args\).*const gate = await checkOverageGate\(\)/s,
      )
      assert.match(
        command,
        /gate\.kind === 'needs-confirm'\s*\? null\s*: gate\.billingNote \|\| null/,
      )
      assert.ok(pr.includes('throw new Error(`gh pr view failed (exit ${code})`)'))
    } else {
      assert.ok(review.includes('isRepoTooLargeForBundle'))
      assert.ok(review.includes('getUltrareviewModel'))
      assert.ok(review.includes("tags: ['ultrareview']"))
      assert.ok(review.includes('onBundleFail'))
      assert.ok(dialog.includes('scopeStat'))
      assert.ok(
        dialog.includes(
          'Reviewing ${scope.repo}#${scope.prNumber} fetched from GitHub.',
        ),
      )
      assert.ok(dialog.includes('Reviewing local changes on ${scope.baseBranch}.'))
      assert.ok(
        dialog.includes('Reviewing ${scope.headBranch} against ${scope.baseBranch}.'),
      )
      assert.ok(command.includes('Promise.all(['))
      assert.ok(pr.includes('if (code !== 0 || !stdout.trim()) return null'))
    }
  },
)
