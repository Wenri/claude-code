// Cumulative merge guard; intentionally outside the frozen per-release suite set.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const targetBundlePath = process.env.CLAUDE_CODE_2_1_126_BUNDLE

const carriedFiles = new Map([
  ['src/buddy/observer.ts', '22438bfe1c3312a97be725c3bba875de94f208bf86cbfd1be13c59ccf0f1398f'],
  ['src/buddy/soul.ts', 'e5c9640e0c34f7c397346ae761191fbe9a375511565781291d57531b2802592b'],
  ['src/commands/buddy/index.tsx', 'f7cbe604ed415c0f7a8928ea3811aaee592924dc59ece653980c0ac415d634f5'],
  ['src/commands/loops/index.ts', '8783fa3183c6b8184a27681a5da613c800ef4030d75a9db7ac60da7fdbff01e9'],
  ['src/commands/loops/loops.tsx', '4dc45d8c6729fc42e6a33b1a5d0072958269b1aa70b1ec3e1cb73d9615150f0d'],
  ['src/components/Form.tsx', 'f5f119cd44d6a8a3815567bed9d02a12127ec9a11183bd4e629494295c0ae9b7'],
  ['src/components/design-system/Select.tsx', '0ddc2bdd48d5944c8aeeafcbb0d22ca2eb5c102095be4b63e013579835578970'],
  ['src/components/design-system/Table.tsx', '6ed22e106b243b0034b79fb3515953ede4a5e6f0bd713fdd2bb61f0b5a36edc0'],
  ['src/hooks/useExternalSession.ts', 'fcc31959bf30359de50c41fe3a24917a82dea7834377f22ba6ea780a0cef542e'],
  ['src/hooks/useTaskRegistry.ts', '1a9145f739a3a363b89ec3f6bc120bce919dc1be2c1078cded9bf478fbac6699'],
  ['src/ink/hooks/use-auto-focus.ts', '6253a24d1c15cdfaad18b1685ee296023fb323ee0033d6a4b7d38ceaadaf9486'],
  ['src/skills/bundled/verify/SKILL.md', '9d4049f20c3a1ab399b381d4af745e794865589068c14805c420b38917b111a9'],
  ['src/skills/bundled/verify/examples/cli.md', '92c3784a19bf09094ffe311f62c84d960fec6c4273c22d2cb5e5a8023f281031'],
  ['src/skills/bundled/verify/examples/server.md', 'cae669e4a86d3d1352e976f457d7330aed96afd5337d61e0d062f38cccf31c1a'],
  ['src/utils/computerUse/prompt.ts', '1997839e4b0eaee6511a425953a586799da5f323152e74fd35199e0775bb5d30'],
  ['src/utils/execa.ts', '49a738fa1bbc55a5bc09d029fbe1ea4b42fdec2c6bc05f5b5af7a05203801291'],
  ['src/utils/sandbox/seccomp.ts', 'fbb65a2707c99a04b733b6e35fdfe9a66d1872eddf8029990451c7ef922a0459'],
  ['src/utils/settings/settingsSignal.ts', '7537ef4524c4def38ae7a16b4007a2154e5257d8c489d1406ba41ae54bf9a4ae'],
])

const authenticatedMainFiles = new Map([
  ['src/bridge/bridgeStatusUtil.ts', 'bfda9edce118929fa85c2ab0206ee8347f8799fbac0aa34ab6c5f20fad88321f'],
  ['src/commands/remote-setup/api.ts', '23d46291a8bb433212be6ee55ec771b1058d57693d7d4d99bc7c9a15ee01809a'],
  ['src/commands/terminalSetup/terminalSetup.tsx', '95c5215135a8fc01b3fcfc593e4b972c2d1810f7ec931269dd52f7e73d66d9a3'],
  ['src/components/LogoV2/FullscreenUpsell.tsx', '94744b559ea73d80a70c1f016437e99a0b015133e307b5d741ad36a1aa8b3a67'],
  ['src/components/agents/agentFileUtils.ts', '7cd94fc7a46acbe435f8309eb94ecf1a7518a563503f9fa08771343a4d47cd4b'],
  ['src/components/mcp/MCPAgentServerMenu.tsx', 'bc740dd6a0f2d2367e2f2ca5bb66b92ca8b870273b29a2323db74940e43ec97d'],
  ['src/entrypoints/sandboxTypes.ts', '7e0ba6b8cc8bd8038f34420acf9e344ee873651ddd2c7025b4b23dd00ee2e9eb'],
  ['src/ink/colorize.ts', '593fad75c0510ccd55c4e56bbc3df4a140f7b8c3a6cf1a88b4af5c8d1eee28a8'],
  ['src/services/api/dumpPrompts.ts', '37140d87f1c98922a09ec6a9825e16de7f969f566be90f70ef75dcb2b8951725'],
  ['src/services/api/grove.ts', '6b90eab04bf8af59916a716c25cbdffe7c003806b6e202175bcb60604c97edc7'],
  ['src/skills/bundled/simplify.ts', '1a895c2c5f94ddd65e11bfdb24c3d24d0587aa0b9786480c39610723261afb80'],
  ['src/tools/FileEditTool/constants.ts', '25909466325aabeab3b2c3ac33ae3615030e0326b83b4c7f2a5126f9d075cfa7'],
  ['src/tools/ToolSearchTool/prompt.ts', '74ebf6e9132fa224fe50b414282aa84d8f76fc69c313dd48acf828ff8943a1bd'],
  ['src/utils/bash/ShellSnapshot.ts', '1d53fb1b298e9b2ca091033d24a83cd917640983271ffb9667a4d56094f7436d'],
  ['src/utils/cronScheduler.ts', '29346d0cc8d25fd31e4d7429368cd6944f651c55697e42d806c3fe55ed16f833'],
  ['src/utils/execFileNoThrow.ts', '9f6f43e597fa5b42249d56b2e8322e95f1a0368f52bff12ff7657982b2a95376'],
  ['src/utils/nativeInstaller/download.ts', 'dfef485e476eeccd29708a1312d4fd7f934c83bd0b766340ebcca1936f5a4eb4'],
  ['src/utils/plugins/pluginLoader.ts', 'daad75b28552625bfdcb6585e219abba4c6d9d275f491dec75bf77ec10ea637e'],
  ['src/utils/plugins/validatePlugin.ts', 'a44d2f547db25e5e03b057ec90cda16d3bf22423293045fdf451851703361e49'],
  ['src/utils/telemetry/sessionTracing.ts', 'a333f67740707ecfbdb23174608285a0e1d445eb27ce63c6e6a3009be7071391'],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(repositoryRoot, relative), 'utf8')
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
}

function promptValue() {
  const match = source('src/utils/computerUse/prompt.ts').match(
    /=\s*`([\s\S]*)`\s*$/,
  )
  assert.ok(match, 'computer-use prompt template')
  const ast = parse(`const value = \`${match[1]}\``, {
    ecmaVersion: 'latest',
  })
  const template = ast.body[0].declarations[0].init
  assert.equal(template.expressions.length, 0)
  assert.equal(template.quasis.length, 1)
  return template.quasis[0].value.cooked
}

function bundleStrings(contents) {
  const values = new Set()
  const pending = [
    parse(contents, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  ]
  while (pending.length > 0) {
    const node = pending.pop()
    if (!node || typeof node !== 'object') continue
    if (node.type === 'Literal' && typeof node.value === 'string') {
      values.add(node.value)
    } else if (node.type === 'TemplateElement') {
      values.add(node.value?.cooked ?? node.value?.raw)
    }
    for (const [key, value] of Object.entries(node)) {
      if (['end', 'loc', 'raw', 'start'].includes(key)) continue
      if (Array.isArray(value)) pending.push(...value)
      else if (value && typeof value === 'object') pending.push(value)
    }
  }
  return values
}

test('pins the selective main source carry-forward', () => {
  for (const [relative, expected] of [...carriedFiles, ...authenticatedMainFiles]) {
    assert.equal(sha256(fs.readFileSync(path.join(repositoryRoot, relative))), expected)
  }
})

test('wires retained source into the recovered 2.1.126 topology', () => {
  assertFragments('src/commands.ts', [
    "require('./commands/buddy/index.js')",
    "import loops from './commands/loops/index.js'",
    '  loops,',
  ])
  assertFragments('src/skills/bundled/verifyContent.ts', [
    "import cliMd from './verify/examples/cli.md'",
    "import serverMd from './verify/examples/server.md'",
    "import skillMd from './verify/SKILL.md'",
  ])
  assertFragments('src/utils/attachments.ts', [
    "import { COMPUTER_USE_MCP_INSTRUCTIONS } from './computerUse/prompt.js'",
    'serverName: COMPUTER_USE_MCP_SERVER_NAME,',
    'block: COMPUTER_USE_MCP_INSTRUCTIONS,',
  ])
  assertFragments('src/context.ts', [
    'const DATE_PROXY_XOR_KEY = 91',
    'currentDate: formatCurrentDateForContext(getLocalISODate()),',
  ])
  assertFragments('src/utils/gracefulShutdown.ts', [
    'function safeErrorString(value: unknown): string',
    "return '[unstringifiable]'",
    'const value = safeErrorString(',
  ])
  assertFragments('src/utils/autoUpdater.ts', [
    "getPlatform() === 'windows'",
    "process.execPath",
    "includes('/node_modules/@anthropic-ai/')",
    '/\\.exe\\.old\\.\\d+$/.test(name)',
    'retiredWindowsBinaries.push([binary, retired])',
    'retired-dir cleanup failed:',
    'Failed to restore ${original} after install failure:',
  ])
  assertFragments('src/cli/update.ts', [
    "import { daemonVersionDiffers } from 'src/daemon/lock.js'",
    'if (await daemonVersionDiffers(version))',
  ])
  assert.ok(!source('src/cli/update.ts').includes('async function readDaemonLock('))
  assertFragments('src/utils/sandbox/seccomp.ts', [
    "import { openSync } from 'fs'",
    "return openSync('/proc/self/exe', 'r')",
    'logError(new Error(`seccomp: failed to open /proc/self/exe: ${error}`))',
    'applyPath: `/proc/self/fd/${SECCOMP_CHILD_FD}`',
  ])
  assertFragments('src/utils/Shell.ts', [
    'stdio[SECCOMP_CHILD_FD] = seccompFileDescriptor',
    '? await getEmbeddedSeccompFileDescriptor()',
    'closeSync(seccompFileDescriptor)',
  ])
  assertFragments('src/hooks/useExternalSession.ts', [
    '`[${label}] dropped, reconnecting (${attempt}/${maxAttempts})`',
    'managerRef.current?.setPermissionMode?.(permissionMode)',
    'manager.setPermissionMode?.(permissionModeRef.current)',
  ])
  for (const relative of ['src/hooks/useDirectConnect.ts', 'src/hooks/useSSHSession.ts']) {
    assertFragments(relative, ['permissionMode: PermissionMode', 'permissionMode,'])
  }
  const repl = source('src/screens/REPL.tsx')
  for (const owner of ['useDirectConnect', 'useSSHSession']) {
    const start = repl.indexOf(`const ${owner === 'useDirectConnect' ? 'directConnect' : 'sshRemote'} = ${owner}({`)
    assert.notEqual(start, -1, owner)
    assert.ok(repl.slice(start, start + 500).includes('permissionMode: toolPermissionContext.mode'), owner)
  }
  assertFragments('src/utils/execa.ts', [
    'const executable = whichSync(command)',
    "not found or is in an unsafe location (current directory)",
    'return execaBase(executable, [...args], options)',
  ])
  assertFragments('src/utils/auth.ts', [
    "import { execa as safeExeca } from './execa.js'",
    "safeExeca('security', ['-i'], {",
  ])
  assertFragments('src/utils/bash/ast.ts', [
    "(a[1] === '-p' && (a[2] === '-v' || a[2] === '-V'))",
  ])
  assertFragments('src/utils/bash/commands.ts', [
    "const rootNode = getParserModule()!.parse(command)",
    "if (node.type === 'file_redirect')",
    "child.type === '>>|'",
    "/^\\/dev\\/(tcp|udp)\\//.test(target)",
    "if (!child.type.endsWith('_redirect')) visitCommand(child)",
  ])
  assertFragments('src/utils/imageResizer.ts', [
    'export type ImageLimitOverrides = Partial<ImageLimits>',
    'resolveAntModel(model)?.imageLimits ??',
    "'claude-opus-4-7': { maxWidth: 2000, maxHeight: 2000 }",
    'override?.targetRawSize ?? (effectiveBase64Size * 3) / 4',
    'export function getCurrentImageLimits(): ImageLimits',
  ])
  assertFragments('src/utils/model/antModels.ts', [
    "import type { ImageLimitOverrides } from '../imageResizer.js'",
    'imageLimits?: ImageLimitOverrides',
  ])
  assertFragments('src/hooks/usePasteHandler.ts', [
    'getImageFromClipboard(getCurrentImageLimits())',
    'tryReadImageFromPath(imagePath, imageLimits)',
  ])
  assertFragments('src/components/CustomSelect/select-input-option.tsx', [
    "from '../../utils/imageResizer.js'",
    'getImageFromClipboard(getImageLimits(getMainLoopModel()))',
  ])
  assertFragments('src/components/PromptInput/PromptInput.tsx', [
    'getImageFromClipboard(getImageLimits(mainLoopModel))',
    '[addNotification, onImagePaste, mainLoopModel]',
  ])
  assertFragments('src/components/mcp/MCPRemoteServerMenu.tsx', [
    '<Table box="plain"',
    '<StatusIcon status="success" withSpace />',
    '/customize/connectors',
    'Tried reconnecting, but ${server.name} is still unauthorized.',
    'Got new credentials, but ${server.name} rejected them on reconnect.',
  ])
  assertFragments('src/utils/settings/settings.ts', [
    "import { settingsChanged } from './settingsSignal.js'",
    'settingsChanged.emit(source)',
  ])
  assertFragments('src/utils/settings/changeDetector.ts', [
    "import { settingsChanged } from './settingsSignal.js'",
    'export const subscribe = settingsChanged.subscribe',
  ])
  assertFragments('src/hooks/useRemoteControlIdleUpsell.tsx', [
    'export function markRemoteControlUsed(): void',
    'hasUsedRemoteControl: true',
  ])
  assertFragments('src/commands/bridge/bridge.tsx', [
    "import { markRemoteControlUsed } from '../../hooks/useRemoteControlIdleUpsell.js'",
    'markRemoteControlUsed();',
  ])
  assertFragments('src/services/tools/toolExecution.ts', [
    'export function getUnavailableToolHint(',
    'ALL_AGENT_DISALLOWED_TOOLS.has(registeredTool.name)',
    'const unavailableHint = getUnavailableToolHint(',
  ])
  assertFragments('src/services/api/errors.ts', [
    'API_MAX_REQUEST_SIZE,',
    'const limits = `max ${formatFileSize(API_MAX_REQUEST_SIZE)}`',
  ])
  assertFragments('src/tools/BashTool/bashPermissions.ts', [
    "const normalizedPrefix = bashRule.prefix.replace(/[ \\t]+/g, ' ')",
    "const normalizedCommand = cmdToMatch.replace(/[ \\t]+/g, ' ')",
  ])
  assertFragments('src/tools/shared/gitOperationTracking.ts', [
    'const GH_PR_CHECKOUT_RE =',
    "const args = ['pr', 'view', ...(prNumber ? [prNumber] : []), '--json', 'url']",
    'void linkCurrentSessionToPr(checkoutMatch[1]).catch(() => {})',
    'void linkCurrentSessionToPr().catch(() => {})',
  ])
  assertFragments('src/keybindings/defaultBindings.ts', [
    "'shift+left': 'selection:extendLeft'",
    "'shift+right': 'selection:extendRight'",
    "'shift+up': 'selection:extendUp'",
    "'shift+down': 'selection:extendDown'",
    "'shift+home': 'selection:extendLineStart'",
    "'shift+end': 'selection:extendLineEnd'",
  ])
  assertFragments('src/components/ScrollKeybindingHandler.tsx', [
    'function extendSelection(move: FocusMove): boolean | void',
    "'selection:extendLeft': () => extendSelection('left')",
    "'selection:extendLineEnd': () => extendSelection('lineEnd')",
  ])
  assertFragments('src/services/analytics/datadog.ts', [
    "const DATADOG_CLIENT_TOKEN = 'pubea5604404508cdd34afb69e6f42a05bc'",
  ])
  assertFragments('src/tools/WebSearchTool/WebSearchTool.ts', [
    "provider === 'firstParty' || provider === 'anthropicAws'",
  ])
  assertFragments('src/components/Messages.tsx', [
    "if (toolName === 'Agent' || toolName === 'Task') return summary",
    'function getFocusEditStats(toolName: string, input: unknown)',
    "lastMeaningful.message?.stop_reason !== null",
    "result?.status === 'async_launched'",
    "memory.path.startsWith('<synthesis:')",
    'const deferredMessages = React.useDeferredValue(props.messages)',
    'deferredMessages[0] === messages[0]',
  ])
  assertFragments('src/screens/REPL.tsx', [
    'deferMessages={!viewedAgentTask && !showStreamingText && isLoading}',
    'placeholderBaseline={userInputBaselineRef.current}',
    '<MessageRatingProvider>',
  ])
  assertFragments('src/utils/messages.ts', [
    'const correctedInput = decodeUnicodeEscapesInToolInput(',
    'normalizeJsonEncodedToolInputFields(',
    ".replace(/^\\n+/, '')",
  ])
  assert.ok(!source('src/utils/messages.ts').includes("content.replace(STRIPPED_TAGS_RE, '').trim()"))
  assert.equal(
    (source('src/components/mcp/MCPRemoteServerMenu.tsx').match(/<Table\.Row>/g) ?? []).length,
    4,
  )
  for (const [relative, imported] of [
    ['src/commands/remote-setup/remote-setup.tsx', "../../utils/execa.js"],
    ['src/commands/thinkback/thinkback.tsx', "../../utils/execa.js"],
    ['src/utils/bash/ShellSnapshot.ts', "../execa.js"],
    ['src/utils/github/ghAuthStatus.ts', "../execa.js"],
    ['src/utils/powershell/parser.ts', "../execa.js"],
    ['src/utils/secureStorage/macOsKeychainStorage.ts', "../execa.js"],
  ]) {
    assert.ok(source(relative).includes(`from '${imported}'`), relative)
  }
})

test(
  'authenticates retained source values against the 2.1.126 bundle',
  { skip: targetBundlePath ? false : 'CLAUDE_CODE_2_1_126_BUNDLE is required' },
  () => {
    const target = fs.readFileSync(targetBundlePath)
    assert.equal(
      sha256(target),
      'e9d40219be0cad9009c115ec637df4976e987c33d4b7a88cc5f047ead9ad828d',
    )
    const contents = target.toString('utf8')
    const values = bundleStrings(contents)
    for (const relative of [
      'src/skills/bundled/verify/SKILL.md',
      'src/skills/bundled/verify/examples/cli.md',
      'src/skills/bundled/verify/examples/server.md',
    ]) {
      assert.ok(values.has(source(relative)), relative)
    }
    assert.ok(values.has(promptValue()), 'computer-use prompt')
    assert.match(
      contents,
      /\[1\]==="-p"&&\([^)]*\[2\]==="-v"\|\|[^)]*\[2\]==="-V"\)/,
      'command -p -v/-V target semantics',
    )
    for (const fragment of [
      'List, create, and delete recurring loops and stop-hooks',
      '[unstringifiable]',
      'retired-dir cleanup failed:',
      ' after install failure:',
      'pubea5604404508cdd34afb69e6f42a05bc',
      'anthropicAws',
      'selection:extendLeft',
      "Command '",
      'not found or is in an unsafe location (current directory)',
      '] dropped, reconnecting (',
      '/proc/self/exe',
      'Try flicker-free rendering',
      'not connected (agent-only)',
      'Invalid grove_notice_viewed_at from API:',
      'Fetches full schema definitions for deferred tools so they can be called.',
      'File content has changed since it was last read.',
    ]) {
      assert.ok(contents.includes(fragment), fragment)
    }
    const context = source('src/context.ts')
    for (const name of [
      'DATE_PROXY_HOSTS_ENCODED',
      'DATE_PROXY_LAB_KEYWORDS_ENCODED',
    ]) {
      const match = context.match(new RegExp(`const ${name} =\\s*'([^']+)'`))
      assert.ok(match, name)
      assert.ok(contents.includes(match[1]), name)
    }
  },
)
