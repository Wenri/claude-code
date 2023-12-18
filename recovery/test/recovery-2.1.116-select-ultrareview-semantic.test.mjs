import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}
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

const pinnedUnits = new Map([
  [7704, [3698846, 3699155, 'ec81a457486c54ee4cd3cc4bba81a13bce552de2d3b6716da724cdc436dd26c2']],
  [16697, [10501735, 10503908, 'f4eaa340f3385fb64aeccb453b13a57e761ffe6fb7390355894674cae3e6ba80']],
  [16724, [10510216, 10510257, 'd0b4c916ae8703dde7581285046263d6a9ff0c291cce5599b69f3284f36f1211']],
  [16725, [10510257, 10511763, '801eafdef5b9ffa316467925d326e9c65fc8597ee4a0ca99b0d1c762c199625f']],
  [16726, [10511763, 10511897, '65d1e74708d41a409dae3b621f19de19e99276835fcf948530bf12ec537b6fdc']],
  [16728, [10511919, 10512067, '793ba6722c4d2b54d774b1526682e33df8262ef359faf9f1bc0d4276dce37ddb']],
  [16732, [10512629, 10514889, '3d1c8d087a7ad9b5e06ce6f4102e584819022334e1c69027ad92f045b7e7bc8d']],
  [16733, [10514889, 10515938, '8321d13866c5cc23b853f1deb4d1ca9dd59e69b70d7520577485a829dc4cad6d']],
  [16735, [10515961, 10516363, '6da7c9114cea036bf59cbceb8dec456333c6b3b7379b306fc811f3822efe3382']],
  [18596, [11464414, 11470968, '09908f43fab47661fb65154034e6f425d19348ff231f6b7e836089fb49026ac3']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target 2.1.116 pins the Select, focus, Skills, and Ultrareview units', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(targetBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const target = targetBytes.toString('utf8')

  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }
})

test('Select and repository-aware review scope are introduced at the boundary', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')

  assert.equal(baseline.includes('overflowHint'), false)
  for (const fragment of [
    'overflowHint:f="glyph"',
    '"select:pageDown":()=>',
    '"select:pageUp":()=>',
    '"select:first":()=>',
    '"select:last":()=>',
    'more above',
    'more below',
    'visibleCount:j,wrap:!0,overflowHint:"count"',
  ]) {
    assert.ok(target.includes(fragment), fragment)
  }

  assert.ok(baseline.includes('Reviewing PR #${f.prNumber} fetched from GitHub.'))
  assert.ok(target.includes('Reviewing ${A.repo}#${A.prNumber} fetched from GitHub.'))
  assert.ok(target.includes('Reviewing local changes on ${A.baseBranch}.'))
  assert.ok(target.includes('Reviewing ${A.headBranch} against ${A.baseBranch}.'))
})

test('source owns exact Select navigation, paging, focus, and overflow behavior', sourceOptions, () => {
  const owner = assertFragments('src/components/design-system/Select.tsx', [
    "const SelectItemFocusContext = createContext(false)",
    "'select:next': () => move(1)",
    "'select:previous': () => move(-1)",
    "'select:pageDown': () => move(visibleCount)",
    "'select:pageUp': () => move(-visibleCount)",
    "'select:first': () => setFocusedIndex(0)",
    "'select:last': () => setFocusedIndex(lastIndex)",
    "{ context: 'Select', isActive: !isDisabled && itemCount > 0 }",
    "if (event.key === 'return' && onSelect) onSelect(focusedIndex)",
    'event.preventDefault()',
    'event.stopImmediatePropagation()',
    'useAutoFocus(ref, !isDisabled)',
    "overflowHint === 'glyph' && visibleCount === 1 ? 'count' : overflowHint",
    '{figures.arrowUp} {hiddenAbove} more above',
    '{figures.arrowDown} {hiddenBelow} more below',
    'showScrollUp=',
    'showScrollDown=',
    'export const Select = Object.assign(SelectRoot, { Item: SelectItem })',
  ])
  assert.ok(owner.indexOf('useAutoFocus(ref') < owner.indexOf('if (itemCount === 0)'))

  assertFragments('src/ink/hooks/use-auto-focus.ts', [
    'const focusManager = getFocusManager(ref.current)',
    'focusManager.focus(ref.current)',
    'return focusManager.subscribe(() =>',
    'if (!element || focusManager.activeElement === element) return',
    'if (!focusManager.activeElement)',
    'if (parent === focusManager.activeElement)',
  ])
  assertFragments('src/ink/focus.ts', [
    'private listeners = new Set<() => void>()',
    'subscribe = (listener: () => void)',
    'private notify(): void',
  ])
})

test('MessageSelector retains target116 overflow counts and its exit guide', sourceOptions, () => {
  const owner = assertFragments('src/components/MessageSelector.tsx', [
    'const lastVisibleIndex = Math.min(',
    'const hiddenAbove = firstVisibleIndex',
    'const hiddenBelow = messageOptions.length - lastVisibleIndex',
    'messageOptions.slice(firstVisibleIndex, lastVisibleIndex)',
    '{figures.arrowUp} {hiddenAbove} more above',
    '{figures.arrowDown} {hiddenBelow} more below',
    'exitState.pending ? <>Press {exitState.keyName} again to exit</>',
    "'Enter to continue · '",
  ])
  assert.ok(
    owner.indexOf('{hiddenAbove > 0') <
      owner.indexOf('messageOptions.slice(firstVisibleIndex, lastVisibleIndex)'),
  )
  assert.ok(
    owner.indexOf('{hiddenBelow > 0') >
      owner.indexOf('messageOptions.slice(firstVisibleIndex, lastVisibleIndex)'),
  )
})

test('Skills uses the shared Select and target116 row model', sourceOptions, () => {
  const owner = assertFragments('src/components/skills/SkillsMenu.tsx', [
    'function SkillRow(',
    'const isFocused = useSelectItemFocus()',
    "const tokenDisplay = `~${formatTokens(",
    "const lockedBy = lock ? ` · locked by ${lock.source}` : ''",
    'const visibleCount = clamp(rows - 10, 4, skills.length)',
    "key={sortByTokens ? 'tok' : 'name'}",
    'visibleCount={visibleCount}',
    'wrap',
    'overflowHint="count"',
    'onFocus={index => setFocusedSkill(skills[index])}',
    '<Select.Item key={`${skill.name}-${skill.source}`}>',
    '<SkillRow skill={skill} lock={locked} state={value} />',
  ])
  assert.equal(owner.includes("'select:previous':"), false)
  assert.equal(owner.includes("'select:next':"), false)
})

test('Ultrareview source distinguishes PR, local, and branch scopes', sourceOptions, () => {
  const owner = assertFragments(
    'src/commands/review/UltrareviewOverageDialog.tsx',
    [
      '`Reviewing ${scope.repo}#${scope.prNumber} fetched from GitHub.`',
      'scope.headBranch === scope.baseBranch',
      '`Reviewing local changes on ${scope.baseBranch}.`',
      '`Reviewing ${scope.headBranch} against ${scope.baseBranch}.`',
    ],
  )
  assert.ok(
    owner.indexOf('scope.headBranch === scope.baseBranch') <
      owner.indexOf('`Reviewing ${scope.headBranch} against'),
  )
})
