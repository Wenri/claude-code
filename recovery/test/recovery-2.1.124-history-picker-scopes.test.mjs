import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.123',
    env: 'CLAUDE_CODE_2_1_123_BUNDLE',
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  },
  {
    version: '2.1.124',
    env: 'CLAUDE_CODE_2_1_124_BUNDLE',
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value.toString('utf8')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function source(relative) {
  return fs
    .readFileSync(path.join(repo, relative), 'utf8')
    .split('\n//# sourceMappingURL=', 1)[0]
}

function compact(value) {
  return value.replaceAll(';', '').replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(relative, fragments) {
  const contents = compact(source(relative))
  for (const fragment of fragments) {
    assert.ok(
      contents.includes(compact(fragment)),
      `${relative}: missing ${compact(fragment)}`,
    )
  }
}

test('authenticates the 2.1.124 history-picker scope cluster', () => {
  const [baseline, target] = releases.map(readBundle)
  const targetOnlyFragments = [
    'Sc$=["session","project","everywhere"]',
    'async function*HvK(H="project"){let $=e1(),q=E$(),K=new Set;for await(let _ of Z$6()){if(!_||typeof _.project!=="string")continue;if(H==="project"&&_.project!==$)continue;if(H==="session"&&_.sessionId!==q)continue;if(K.has(_.display))continue;if(K.add(_.display),yield{display:_.display,timestamp:_.timestamp,resolve:()=>Ec$(_)},K.size>=P$6)return}}',
    'context:"HistorySearch",bindings:{"ctrl+r":"historySearch:next",escape:"historySearch:accept",tab:"historySearch:accept","ctrl+c":"historySearch:cancel",enter:"historySearch:execute","ctrl+s":"historySearch:cycleScope"}',
    '"historySearch:execute","historySearch:cycleScope","task:background"',
    'E7H.useEffect(()=>{if(P===void 0)return;C({focus:0,window:0}),m(void 0)},[P])',
    '[_,A]=Ke.useState("project"),[z,Y]=Ke.useState(null),[f,O]=Ke.useState(H??""),M=Ke.useRef({})',
    'let P=M.current[_];if(P){Y(P);return}Y(null)',
    'if(!G)M.current[_]=Z,Y(Z)',
    'Ik("historySearch:cycleScope","HistorySearch","ctrl+s");I8("historySearch:cycleScope",()=>{let P=Sc$.indexOf(_),G=Sc$[(P+1)%Sc$.length];A(G),d("tengu_history_picker_scope",{from:_,to:G})},{context:"HistorySearch"})',
    'title:oP.createElement(k,null,"Search prompts ",oP.createElement(k,{color:"suggestion"},"\\xB7 ",_))',
    'onCancel:q,resetKey:_,extraHints:oP.createElement(eH,{chord:D,action:"scope"})',
  ]

  for (const fragment of targetOnlyFragments) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }
  assert.equal(occurrences(baseline, 'historySearch:cycleScope'), 0)
  assert.equal(occurrences(target, 'historySearch:cycleScope'), 4)
  assert.equal(occurrences(baseline, 'tengu_history_picker_scope'), 0)
  assert.equal(occurrences(target, 'tengu_history_picker_scope'), 1)
  assert.equal(occurrences(baseline, 'resetKey'), 0)
  assert.equal(occurrences(target, 'resetKey'), 2)
})

test('source recovers the bounded history, picker, and keybinding behavior', () => {
  assertSourceFragments('src/history.ts', [
    "export const HISTORY_SCOPES = ['session', 'project', 'everywhere'] as const",
    "export type HistoryScope = (typeof HISTORY_SCOPES)[number]",
    "scope: HistoryScope = 'project'",
    'const currentProject = getProjectRoot() const currentSession = getSessionId() const seen = new Set<string>()',
    "if (scope === 'project' && entry.project !== currentProject) continue if (scope === 'session' && entry.sessionId !== currentSession) continue if (seen.has(entry.display)) continue seen.add(entry.display)",
    'if (seen.size >= MAX_HISTORY_ITEMS) return',
  ])

  assertSourceFragments('src/components/HistorySearchDialog.tsx', [
    "const [scope, setScope] = useState<HistoryScope>('project')",
    'const cache = useRef<Partial<Record<HistoryScope, Item[]>>>({})',
    'const cached = cache.current[scope] if (cached) { setItems(cached) return } setItems(null)',
    'const reader = getTimestampedHistory(scope)',
    'cache.current[scope] = loaded setItems(loaded)',
    "const cycleScopeShortcut = useShortcutDisplay('historySearch:cycleScope', 'HistorySearch', 'ctrl+s')",
    "useKeybinding('historySearch:cycleScope', () => { const currentIndex = HISTORY_SCOPES.indexOf(scope) const nextScope = HISTORY_SCOPES[(currentIndex + 1) % HISTORY_SCOPES.length] setScope(nextScope)",
    "logEvent('tengu_history_picker_scope', { from: scope, to: nextScope })",
    '<Text>Search prompts <Text color="suggestion">· {scope}</Text></Text>',
    'resetKey={scope}',
    '<KeyboardShortcutHint shortcut={cycleScopeShortcut} action="scope" />',
  ])

  assertSourceFragments('src/components/design-system/FuzzyPicker.tsx', [
    'title: React.ReactNode',
    'resetKey?: unknown',
    'useEffect(() => { if (resetKey === undefined) return setPosition({ focus: 0, window: 0 }) setHovered(undefined) }, [resetKey])',
  ])

  assertSourceFragments('src/keybindings/defaultBindings.ts', [
    "context: 'HistorySearch', bindings: { 'ctrl+r': 'historySearch:next', escape: 'historySearch:accept', tab: 'historySearch:accept', 'ctrl+c': 'historySearch:cancel', enter: 'historySearch:execute', 'ctrl+s': 'historySearch:cycleScope'",
  ])
  assertSourceFragments('src/keybindings/schema.ts', [
    "'historySearch:execute', 'historySearch:cycleScope',",
  ])
})

function selectScopedHistory(entries, scope, currentProject, currentSession) {
  const seen = new Set()
  const selected = []
  for (const entry of entries) {
    if (!entry || typeof entry.project !== 'string') continue
    if (scope === 'project' && entry.project !== currentProject) continue
    if (scope === 'session' && entry.sessionId !== currentSession) continue
    if (seen.has(entry.display)) continue
    seen.add(entry.display)
    selected.push(entry.display)
    if (seen.size >= 100) break
  }
  return selected
}

test('scope filtering precedes dedupe and caps each view at 100', () => {
  const entries = [
    { display: 'shared', project: '/other', sessionId: 'other-session' },
    { display: 'shared', project: '/project', sessionId: 'current-session' },
    {
      display: 'current-session-cross-project',
      project: '/other',
      sessionId: 'current-session',
    },
    {
      display: 'current-project-other-session',
      project: '/project',
      sessionId: 'other-session',
    },
    { display: 'everywhere-only', project: '/other', sessionId: 'other-session' },
    { display: 'malformed', project: null, sessionId: 'current-session' },
  ]

  assert.deepEqual(
    selectScopedHistory(entries, 'session', '/project', 'current-session'),
    ['shared', 'current-session-cross-project'],
  )
  assert.deepEqual(
    selectScopedHistory(entries, 'project', '/project', 'current-session'),
    ['shared', 'current-project-other-session'],
  )
  assert.deepEqual(
    selectScopedHistory(entries, 'everywhere', '/project', 'current-session'),
    [
      'shared',
      'current-session-cross-project',
      'current-project-other-session',
      'everywhere-only',
    ],
  )

  const many = Array.from({ length: 105 }, (_, index) => ({
    display: `entry-${index}`,
    project: '/project',
    sessionId: 'current-session',
  }))
  assert.equal(
    selectScopedHistory(many, 'everywhere', '/project', 'current-session').length,
    100,
  )
})
