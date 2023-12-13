import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const TARGET_BUNDLE_SHA256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'

function source(relative) {
  return fs.readFileSync(`${sourceRoot}${relative}`, 'utf8')
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

function between(bundle, start, end) {
  const startOffset = bundle.indexOf(start)
  assert.notEqual(startOffset, -1, `missing start delimiter: ${start}`)
  assert.equal(
    bundle.indexOf(start, startOffset + start.length),
    -1,
    `non-unique start delimiter: ${start}`,
  )
  const endOffset = bundle.indexOf(end, startOffset + start.length)
  assert.notEqual(endOffset, -1, `missing end delimiter: ${end}`)
  return bundle.slice(startOffset, endOffset)
}

test('recovers periodic status-line refresh and linked-worktree metadata', () => {
  const settings = source('utils/settings/types.ts')
  const git = source('utils/git.ts')
  const statusLine = source('components/StatusLine.tsx')
  const setup = source('tools/AgentTool/built-in/statuslineSetup.ts')

  assert.match(
    settings,
    /refreshInterval: z[\s\S]*?\.number\(\)[\s\S]*?\.min\(1\)[\s\S]*?Re-run the status line command every N seconds/,
  )
  assert.match(
    git,
    /export async function getGitWorktreeName[\s\S]*?basename\(gitDir\) === '\.git'[\s\S]*?basename\(dirname\(gitDir\)\) !== 'worktrees'[\s\S]*?return basename\(gitDir\)/,
  )
  assert.match(
    statusLine,
    /await getGitWorktreeName\(getCwd\(\)\)[\s\S]*?const refreshInterval = settings\?\.statusLine\?\.refreshInterval[\s\S]*?setInterval\(scheduleUpdate, intervalMs\)/,
  )
  assert.match(statusLine, /git_worktree: gitWorktree/)
  assert.match(setup, /"git_worktree": "string"/)
})

test('recovers retry, OAuth, prototype-name, and nullable edit hardening', () => {
  const retry = source('services/api/withRetry.ts')
  const oauth = source('services/mcp/auth.ts')
  const permissions = source(
    'utils/permissions/permissionRuleParser.ts',
  )
  const editTypes = source('tools/FileEditTool/types.ts')
  const editUi = source('tools/FileEditTool/UI.tsx')
  const messages = source('utils/messages.ts')
  const sessionStorage = source('utils/sessionStorage.ts')

  assert.match(
    retry,
    /const exponentialWithJitter = baseDelay \+ jitter[\s\S]*?return Math\.max\(seconds \* 1000, exponentialWithJitter\)/,
  )
  const discoveryState = between(
    oauth,
    'async discoveryState(): Promise<OAuthDiscoveryState | undefined> {',
    'async refreshAuthorization(',
  )
  assert.ok(
    discoveryState.indexOf(
      'const metadataUrl = this.serverConfig.oauth?.authServerMetadataUrl',
    ) < discoveryState.indexOf('const storage = getSecureStorage()'),
  )
  assert.match(
    permissions,
    /Object\.hasOwn\(LEGACY_TOOL_NAME_ALIASES, name\)/,
  )
  assert.match(editTypes, /\.string\(\)\s*\.nullable\(\)/)
  assert.match(
    editUi,
    /firstLine=\{originalFile \? firstLineOf\(originalFile\) : null\}/,
  )
  assert.match(editUi, /fileContent=\{originalFile \|\| undefined\}/)
  assert.match(
    messages,
    /originalFile\.length > MAX_STORED_ORIGINAL_FILE_CHARS[\s\S]*?originalFile: null/,
  )
  assert.match(
    sessionStorage,
    /transcriptMessage\.toolUseResult = capStoredOriginalFile/,
  )
})

test('recovers nested subagent tool statistics and edit diffstats', () => {
  const agentUtils = source('tools/AgentTool/agentToolUtils.ts')

  assert.match(
    agentUtils,
    /toolStats: z[\s\S]*?readCount: z\.number\(\)[\s\S]*?otherToolCount: z\.number\(\)/,
  )
  assert.match(
    agentUtils,
    /export function computeAgentToolStats[\s\S]*?case FILE_READ_TOOL_NAME[\s\S]*?case GREP_TOOL_NAME:[\s\S]*?case GLOB_TOOL_NAME:[\s\S]*?case BASH_TOOL_NAME:/,
  )
  assert.match(
    agentUtils,
    /FILE_EDIT_TOOL_NAMES\.has\(block\.name\)[\s\S]*?stats\.linesAdded \+= added[\s\S]*?stats\.linesRemoved \+= removed/,
  )
  assert.match(
    agentUtils,
    /message\.toolUseResult as \{ toolStats\?: AgentToolStats \}[\s\S]*?stats\.otherToolCount \+= nested\.otherToolCount/,
  )
  assert.match(
    agentUtils,
    /toolStats: computeAgentToolStats\(agentMessages\)/,
  )
})

test('recovers W3C trace context propagation into Bash subprocesses', () => {
  const tracing = source('utils/telemetry/sessionTracing.ts')
  const shell = source('utils/Shell.ts')

  assert.match(
    tracing,
    /const toolExecutionContext = new AsyncLocalStorage<SpanContext \| undefined>\(\)/,
  )
  assert.match(
    tracing,
    /toolExecutionContext\.enterWith\(spanContextObj\)[\s\S]*?toolExecutionContext\.enterWith\(undefined\)/,
  )
  assert.match(
    tracing,
    /export function getCurrentTraceparent\(\): string \| undefined[\s\S]*?toolExecutionContext\.getStore\(\)\?\.span \?\?[\s\S]*?toolContext\.getStore\(\)\?\.span \?\?[\s\S]*?interactionContext\.getStore\(\)\?\.span/,
  )
  assert.match(
    tracing,
    /spanContext\.traceId === '00000000000000000000000000000000'[\s\S]*?propagation\.inject\(context, carrier\)[\s\S]*?return carrier\.traceparent/,
  )
  assert.match(
    shell,
    /const traceparent = getCurrentTraceparent\(\)[\s\S]*?\.\.\.\(traceparent && \{ TRACEPARENT: traceparent \}\)/,
  )
})

test('authenticated adjacent bundles contain the exact recovered behaviors', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_96_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_97_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  assert.equal(
    baseline.includes(
      'refreshInterval:y.number().min(1).optional().catch(void 0)',
    ),
    false,
  )
  assert.equal(
    target.includes(
      'refreshInterval:y.number().min(1).optional().catch(void 0)',
    ),
    true,
  )
  assert.match(
    between(target, 'async function h91(q){', 'function nu5(){'),
    /basename|S28/,
  )
  assert.match(
    between(
      target,
      'function R27(q){return q?.statusLine!==void 0}',
      'function eeK(',
    ),
    /git_worktree[\s\S]*?refreshInterval[\s\S]*?setInterval/,
  )
  assert.match(
    between(
      target,
      'function GD4(q){return(q.headers?.["retry-after"]',
      'function vD4(q){',
    ),
    /Math\.max\([A-Za-z_$][\w$]*\*1000,[A-Za-z_$][\w$]*\)/,
  )
  assert.match(
    between(
      target,
      'async discoveryState(){let q=this.serverConfig.oauth?.authServerMetadataUrl',
      'async refreshAuthorization(q){',
    ),
    /Fetching metadata from configured URL:[\s\S]*?Returning cached discovery state/,
  )
  assert.match(
    between(
      target,
      'mU4=x6(()=>y.object({filePath:y.string()',
      'function F$(){',
    ),
    /originalFile:y\.string\(\)\.nullable\(\)/,
  )
  assert.match(
    between(target, 'function zx8(q){', 'function sx8(q){'),
    /toolStats[\s\S]*?readCount[\s\S]*?linesAdded[\s\S]*?otherToolCount/,
  )
  assert.match(
    between(target, 'function UkK(q){', 'function QkK(q,K,_=200){'),
    /originalFile\.length>_DY[\s\S]*?originalFile:null/,
  )
  assert.equal(baseline.includes('TRACEPARENT:'), false)
  assert.match(
    between(target, 'function vg4(){', 'function Tg4('),
    /traceId==="00000000000000000000000000000000"[\s\S]*?propagation\.inject\([\s\S]*?traceparent/,
  )
  assert.match(
    between(
      target,
      'let m=vg4(),S=rGz(k,h,{env:{',
      '},cwd:f,stdio:',
    ),
    /TRACEPARENT:m/,
  )
})
