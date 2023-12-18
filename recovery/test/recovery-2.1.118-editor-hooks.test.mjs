import test from 'node:test'
import {
  assertAuthenticatedFragments,
  assertSourceFragments,
  assertSourceRemoval,
} from './recovery-2.1.118-test-helpers.mjs'

const FRAGMENTS = [
  [
    'vim visual line mode',
    'VISUAL LINE',
    0,
    4,
    '8f4bb4aae4c558cb3b2c5d76b24f5dfe916a2487838917c19bd2dae05e900dc7',
  ],
  [
    'vim selection anchor',
    'selectionAnchor',
    0,
    2,
    'd54774a27c802960f67519b8315a022f36e2e0c64e2b07852617aea0bf99b412',
  ],
  [
    'MCP hook availability error',
    'mcp_tool hooks are not available',
    0,
    1,
    '94f15d42d6a493936af62717ef43c27d6f850f13966636057057c9df9a4fcb72',
  ],
  [
    'post-tool-batch hook surface',
    'PostToolBatch',
    0,
    24,
    'f7fbd9859efb4aff305541176ed676adb406e78f880a0e0bdcaa0599ee19af43',
  ],
  [
    'post-tool-batch description',
    'Fired once after every tool call in a batch has resolved',
    0,
    1,
    '0f798bed189cc15ea3636c052690f785bc6b944d190b6008aa220fdc899dde22',
  ],
  [
    'user-prompt expansion inherited hook',
    'UserPromptExpansion',
    21,
    21,
    'c4ca603eaa1cb458d740e735ae5832ebbf331d1480d157d237e8498b83e80e63',
  ],
  [
    'hook verifier agent prefix',
    'hook-agent-',
    1,
    1,
    '51f3635458e4fb405252430ae3f1999bb07c92d53717a837547f39f8755afcab',
  ],
  [
    'event-aware agent-hook task description',
    'You are evaluating a ',
    2,
    3,
    '1ef284ff69b5a10410f24771ba08af61b404bfa8ea130d491451d92555ae25f1',
  ],
  [
    'verifier-agent prompt-hook suppression',
    'agentId?.startsWith(K48)',
    0,
    2,
    'fc7fbbde26ea5db011abd6be8660462e744f6cd5ab1cc92869906b079ea0431f',
  ],
  [
    'hook event input schema',
    'hookEventName',
    47,
    50,
    '8b73b0e7059e3c117085062c4ffbcffc92a9382b99d4db3bbad605c865ef2a18',
  ],
  [
    'agent hooks no longer require messages',
    'Messages are required for agent hooks. This is a bug.',
    1,
    0,
    '999752899bf4a008da5431864b9df30cde6848cba062bc7dd544d570b6440218',
  ],
  [
    'terminal output tokenizer',
    'forOutput',
    0,
    7,
    '56c17087c44a4f9041cbfe24b5dba95f65a2960346f24c4905d50c20ea01487c',
  ],
  [
    'keybinding watcher errors',
    '[keybindings] watcher error:',
    0,
    1,
    '8214b756396ce7386bc759244d2ac281a3b5c8a0eaba7e0284e673e29b8ea8fd',
  ],
  [
    'DOM keybinding dispatch gate',
    'tengu_keybindings_dom',
    0,
    1,
    '2c2def135a8912c66e34afd7a780a59486c9a4074968ebd46bb29a593ea4d12e',
  ],
  [
    'keybinding fired telemetry',
    'tengu_keybinding_fired',
    1,
    1,
    '753d2cb6007fef0df1e03968324d284a6bd322dbbebb5b63fdbc7a13ca3ddc36',
  ],
  [
    'scheduled task watcher errors',
    '[ScheduledTasks] watcher error:',
    0,
    1,
    '2fbd968713429fccc3b3ff50ed5511cad4f28bb60cab9a1405146a6cfd7791cf',
  ],
  [
    'slash-template request kind',
    'slash-template',
    1,
    2,
    '2d8187e1ef4179fb734a3bdecad663c9291e74032917a89b919bc57c071d7fbf',
  ],
  [
    'repeat-paste expansion state and timer',
    '[Oz,i9]=o6.useState(!1),Kf=o6.useRef(null)',
    0,
    1,
    'edb3d7bb3026ef4efccfed4e4647cabbf031cf417209ad2ca3c9e52a55559318',
  ],
  [
    'native updater successful-install guard',
    'j.current?.status==="success"',
    0,
    1,
    'f8fcce55edf3803e71e37b93f17205537abd8a2b5a0a7333a31c86bb9db8eec9',
  ],
]

test('editor, hook, and tokenizer fragments are authenticated', () => {
  assertAuthenticatedFragments(FRAGMENTS)
})

test('recovers vim visual and visual-line editing state', () => {
  assertSourceFragments('src/vim/types.ts', [
    "mode: 'VISUAL'",
    'kind: VisualKind',
    'anchor: number',
  ])
  assertSourceFragments('src/hooks/useVimInput.ts', [
    "input === 'v' || input === 'V'",
    "input === 'V' ? 'line' : 'char'",
    'selectionAnchor',
    'selectRange',
  ])
  assertSourceFragments('src/vim/transitions.ts', [
    "input === 'v' || input === 'V'",
    "return { exit: 'toggleKind', key: input }",
  ])
  assertSourceFragments('src/vim/operators.ts', [
    'executeVisualCase',
    'indent',
    'join',
  ])
  assertSourceFragments('src/components/PromptInput/PromptInputFooterLeftSide.tsx', [
    'vimMode !== "NORMAL"',
    '-- {vimMode} --',
  ])
})

test('recovers MCP, agent, batch, and prompt-expansion hooks', () => {
  assertSourceFragments('src/schemas/hooks.ts', [
    "type: z.literal('mcp_tool')",
  ])
  assertSourceFragments('src/entrypoints/sdk/coreSchemas.ts', [
    'PostToolBatch',
    'UserPromptExpansion',
  ])
  assertSourceFragments('src/types/hooks.ts', [
    "hookEventName: z.literal('PostToolBatch')",
  ])
  assertSourceFragments('src/utils/hooks/execMcpToolHook.ts', [
    'mcp_tool hooks are not available',
    'Hooks: mcp_tool calling',
    'Hooks: mcp_tool hook error:',
  ])
  assertSourceFragments('src/utils/hooks.ts', [
    'executePostToolBatchHooks',
    'executeUserPromptExpansionHooks',
    'HOOK_AGENT_ID_PREFIX',
    'toolUseContext.agentId?.startsWith(HOOK_AGENT_ID_PREFIX)',
  ])
  assertSourceFragments('src/query.ts', [
    'PostToolBatch',
    'Execution stopped by PostToolBatch hook',
    'hook_additional_context',
  ])
  assertSourceFragments('src/utils/processUserInput/processSlashCommand.tsx', [
    'UserPromptExpansion operation blocked by hook',
    "command.source === 'mcp' ? 'mcp_prompt' : 'slash_command'",
  ])
  assertSourceFragments('src/utils/hooks/execAgentHook.ts', [
    "HOOK_AGENT_ID_PREFIX = 'hook-agent-'",
    'You are evaluating a ${hookEvent} hook',
    'const taskDescription =',
    "hookEvent === 'Stop' || hookEvent === 'SubagentStop'",
  ])
  assertSourceRemoval(
    'src/utils/hooks.ts',
    'Messages are required for agent hooks. This is a bug.',
  )
  assertSourceRemoval('src/utils/hooks/execAgentHook.ts', '_messages: Message[]')
})

test('recovers keyboard, slash-path, fork-pointer, and watcher safety', () => {
  assertSourceFragments('src/ink/termio/tokenize.ts', [
    "'pm'",
    "'sos'",
    'forOutput',
    'code === 0x6b',
  ])
  assertSourceFragments('src/ink/termio/parser.ts', [
    'createTokenizer({ forOutput: true })',
  ])
  assertSourceFragments('src/utils/processUserInput/processSlashCommand.tsx', [
    'export function looksLikeCommand',
    "/[^a-zA-Z0-9:\\-_]/",
  ])
  assertSourceFragments('src/hooks/useTypeahead.tsx', [
    'looksLikeCommand(commandToken)',
    "useRef<'file' | 'at' | 'slash-template'>('file')",
    "latestSearchKindRef.current = 'slash-template'",
    "store.getState().mcp.clients, '/'",
    'debouncedFetchSlashTemplateSuggestions.cancel()',
  ])
  assertSourceFragments('src/hooks/unifiedSuggestions.ts', [
    'function formatResourceTemplateReplacement(',
    "if (prefix === '/') return `/${value.replace(/ /g, '%20')}`",
    'replacement: formatResourceTemplateReplacement(',
  ])
  assertSourceFragments('src/hooks/fileSuggestions.ts', [
    'return newInput',
  ])
  assertSourceFragments('src/utils/forkedAgent.ts', [
    'recordSidechainTranscript(promptMessages, agentId)',
    'promptMessages.at(-1)?.uuid ?? null',
  ])
  assertSourceFragments('src/types/logs.ts', [
    "type: 'fork-context-ref'",
    'parentLastUuid: UUID',
    'contextLength: number',
  ])
  assertSourceFragments('src/utils/sessionStorage.ts', [
    'recordForkContextRef',
    'resolveForkContextRef',
    'forkContextRefs.set(entry.agentId, entry)',
    '[fork-context-ref] parent uuid ${entry.parentLastUuid} not found',
  ])
  assertSourceFragments('src/tools/AgentTool/runAgent.ts', [
    'forkContextMessages === toolUseContext.messages',
    'messagesToPersist = initialMessages.slice(contextMessages.length)',
    'contextLength: contextMessages.length',
  ])
  assertSourceFragments('src/keybindings/loadUserBindings.ts', [
    '[keybindings] watcher error:',
  ])
  assertSourceFragments('src/keybindings/keybindingsDom.ts', [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_keybindings_dom', true)",
  ])
  assertSourceFragments('src/keybindings/keybindingTelemetry.ts', [
    "action.startsWith('command:') ? 'command:custom' : action",
    "logEvent('tengu_keybinding_fired'",
  ])
  assertSourceFragments('src/keybindings/KeybindingContext.tsx', [
    'singleKey?: boolean',
    'registerPreDispatch',
    'preDispatchRef.current.add(handler)',
  ])
  assertSourceFragments('src/keybindings/useKeybinding.ts', [
    'singleKey: true',
    'isKeybindingsDomEnabled() ? noopInputHandler : handleInput',
    'export function usePreDispatch',
  ])
  assertSourceFragments('src/keybindings/KeybindingProviderSetup.tsx', [
    'onKeyDownCapture={handleKeyDown}',
    'onWheelCapture={handleWheel}',
    'for (const preDispatch of preDispatchRef.current)',
    'if (!registration.singleKey) continue',
    'return focusManager.subscribe(ensureFocus)',
  ])
  assertSourceFragments('src/utils/cronScheduler.ts', [
    '[ScheduledTasks] watcher error:',
  ])
  assertSourceFragments('src/components/PromptInput/PromptInput.tsx', [
    'function expandPaste(pasteId: number): boolean',
    'expandHighestPastedTextRef(input, pastedContents)',
    'pastedContents[latestPasteId].content === text && expandPaste(latestPasteId)',
    'expandPasteHintTimerRef.current = setTimeout',
    '8000, setShowExpandPasteHint, expandPasteHintTimerRef',
  ])
  assertSourceFragments(
    'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
    ['paste again to expand'],
  )
  assertSourceFragments('src/components/NativeAutoUpdater.tsx', [
    'const autoUpdaterResultRef = useRef(autoUpdaterResult)',
    "autoUpdaterResultRef.current?.status === 'success'",
  ])
})
