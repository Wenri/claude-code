import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const TARGET_BUNDLE_SHA256 =
  '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564'

function readSource(relativePath) {
  const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
  const sourceMap = source.indexOf('//# sourceMappingURL=')
  return sourceMap === -1 ? source : source.slice(0, sourceMap)
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function slackChannel(input) {
  const channel = input.channel_id ?? input.channel
  if (typeof channel !== 'string' || !channel) return null
  const id = channel.replace(/^#/, '')
  return {
    label: `#${id}`,
    url: /^[CDG][A-Z0-9]{6,}$/.test(id)
      ? `https://slack.com/app_redirect?channel=${id}`
      : null,
  }
}

test('recovers the Slack send-tool presentation override', () => {
  assert.deepEqual(
    slackChannel({ channel_id: '#C07VBSHV7EV', channel: 'ignored' }),
    {
      label: '#C07VBSHV7EV',
      url: 'https://slack.com/app_redirect?channel=C07VBSHV7EV',
    },
  )
  assert.deepEqual(slackChannel({ channel: '#release-room' }), {
    label: '#release-room',
    url: null,
  })
  assert.equal(slackChannel({ channel_id: '' }), null)

  const rendering = readSource('services/mcp/slackToolRendering.tsx')
  const client = readSource('services/mcp/client.ts')
  assert.match(
    rendering,
    /new Set\(\[\s*'slack_send_message',\s*'slack_post_message',?\s*\]\)/,
  )
  assert.match(rendering, /input\.channel_id \?\? input\.channel/)
  assert.match(rendering, /channel\.replace\(\/\^#\/, ''\)/)
  assert.match(rendering, /\/\^\[CDG\]\[A-Z0-9\]\{6,\}\$\//)
  assert.match(
    rendering,
    /`https:\/\/slack\.com\/app_redirect\?channel=\$\{channelWithoutHash\}`/,
  )
  assert.match(rendering, /return 'Slacked'/)
  assert.match(rendering, /if \(!verbose\) return ''/)
  assert.match(
    rendering,
    /`\$\{key\}: \$\{jsonStringify\(value\)\}`[\s\S]*?\.join\(', '\)/,
  )
  assert.match(
    rendering,
    /channel\.url && supportsHyperlinks\(\)[\s\S]*?createHyperlink\(channel\.url, channel\.label\)/,
  )
  assert.ok(
    client.indexOf('getSlackSendToolOverrides()') >
      client.indexOf('getComputerUseMCPToolOverrides(tool.name)'),
    'Slack spread must be last so it wins over generic MCP renderers',
  )

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(baseline.includes('return"Slacked"'), false)
  assert.equal(target.includes('return"Slacked"'), true)
  assert.equal(
    target.includes(
      'new Set(["slack_send_message","slack_post_message"])',
    ),
    true,
  )
  assert.equal(
    target.includes('https://slack.com/app_redirect?channel='),
    true,
  )
})

test('normalizes Shift+Space and resolves tmux XTVERSION to the outer terminal', () => {
  const keyboard = readSource('ink/events/keyboard-event.ts')
  const app = readSource('ink/components/App.tsx')
  assert.match(keyboard, /if \(name === 'space'\) return ' '/)
  assert.ok(
    keyboard.indexOf("if (name === 'space') return ' '") <
      keyboard.indexOf('if (parsed.ctrl) return name'),
  )
  assert.match(
    app,
    /\.then\(async \(\[r(?:,\s*\w+)?\]\) => \{[\s\S]*?process\.env\.TMUX && name\.startsWith\('tmux '\)/,
  )
  assert.match(
    app,
    /execFileNoThrow\('tmux', \['display-message', '-p', '#\{client_termtype\}'\], \{[\s\S]*?timeout: 1000,[\s\S]*?useCwd: false/,
  )
  assert.match(app, /if \(clientTermtype\) name = clientTermtype/)
  assert.match(app, /setXtversionName\(name\)/)

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  const baselineKey = baseline.slice(
    baseline.indexOf('key;ctrl;shift;meta;superKey;fn') - 500,
    baseline.indexOf('key;ctrl;shift;meta;superKey;fn') + 100,
  )
  const targetKey = target.slice(
    target.indexOf('key;ctrl;shift;meta;superKey;fn') - 500,
    target.indexOf('key;ctrl;shift;meta;superKey;fn') + 100,
  )
  assert.doesNotMatch(baselineKey, /==="space"\)return" "/)
  assert.match(targetKey, /==="space"\)return" "/)

  const baselineXtversion = baseline.slice(
    baseline.indexOf('XTVERSION: terminal identified') - 700,
    baseline.indexOf('XTVERSION: terminal identified') + 100,
  )
  const targetXtversion = target.slice(
    target.indexOf('XTVERSION: terminal identified') - 700,
    target.indexOf('XTVERSION: terminal identified') + 100,
  )
  assert.equal(baselineXtversion.includes('#{client_termtype}'), false)
  assert.equal(targetXtversion.includes('#{client_termtype}'), true)
  assert.match(
    targetXtversion,
    /startsWith\("tmux "\)[\s\S]*?timeout:1000,useCwd:!1/,
  )
})

test('keeps wrapped thinking text under the prompt instead of the pointer', () => {
  const source = readSource('components/messages/HighlightedThinkingText.tsx')
  assert.match(
    source,
    /<Box flexShrink=\{0\}><Text color=\{pointerColor\}>\{figures\.pointer\} <\/Text><\/Box>/,
  )
  if (historical) {
    assert.match(
      source,
      /<Box flexDirection="row">\{t2\}\{t3\}<\/Box>/,
    )
    assert.match(
      source,
      /<Box flexDirection="row">\{t2\}<Text>\{parts\}<\/Text><\/Box>/,
    )
    assert.doesNotMatch(source, /t4 = <Text>\{t2\}\{t3\}<\/Text>/)
    assert.doesNotMatch(source, /t3 = <Text>\{t2\}\{parts\}<\/Text>/)
  } else {
    assert.match(source, /content = <Text>\{parts\}<\/Text>/)
    assert.match(
      source,
      /<Box flexDirection="row">\{t1\}\{t2\}<\/Box>/,
    )
  }

  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  const start = target.indexOf('function WzK(')
  assert.notEqual(start, -1)
  const region = target.slice(start, start + 3000)
  assert.match(
    region,
    /createElement\([^,]+,\{flexShrink:0\},[^;]+\.pointer," "\)/,
  )
  assert.match(
    region,
    /createElement\([^,]+,\{flexDirection:"row"\},[^,]+,[^)]+\)/,
  )
  assert.match(region, /createElement\([^,]+,null,[A-Za-z_$][\w$]*\)/)
})

test('derives virtual-list keys from the current messages identity', () => {
  const source = readSource('components/VirtualMessageList.tsx')
  assert.match(
    source,
    historical
      ? /const keys = useMemo\(\(\) => messages\.map\(itemKey\), \[messages, itemKey\]\)/
      : /const keys = useMemo\([\s\S]*?makeSiblingKeysUnique\(messages\.map\(itemKey\)\)[\s\S]*?\[messages, itemKey\]/,
  )
  assert.doesNotMatch(source, /keysRef|prevMessagesRef|prevItemKeyRef/)

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  const recoveredMemo =
    /\.useMemo\(\(\)=>[A-Za-z_$][\w$]*\.map\([A-Za-z_$][\w$]*\),\[[A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*\]\)/
  assert.doesNotMatch(baseline, recoveredMemo)
  assert.match(target, recoveredMemo)
})

test('declares the active focused tab cursor at its visible label', () => {
  const source = readSource('components/design-system/Tabs.tsx')
  assert.match(
    source,
    /import \{ useDeclaredCursor \} from '\.\.\/\.\.\/ink\/hooks\/use-declared-cursor\.js'/,
  )
  assert.match(
    source,
    /<TabHeader key=\{id\} title=\{title_0\} isCurrent=\{isCurrent\} headerFocused=\{headerFocused\} color=\{color\} \/>/,
  )
  assert.match(
    source,
    /const cursorRef = useDeclaredCursor\(\{[\s\S]*?line: 0,[\s\S]*?column: 1,[\s\S]*?active: isCurrent && headerFocused/,
  )
  assert.match(
    source,
    /return <Box ref=\{cursorRef\}><Text backgroundColor=/,
  )

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(baseline.includes('line:0,column:1,active:'), false)
  assert.equal(target.includes('line:0,column:1,active:'), true)
})
