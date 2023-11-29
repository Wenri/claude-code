import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'
const TARGET_BUNDLE_SHA256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'

function readSource(relativePath) {
  const source = fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
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

function sanitizeSessionNamePrefix(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getHomebrewCaskName(execPath) {
  return execPath.match(/\/Caskroom\/([^/]+)\//)?.[1] ?? null
}

function endOfLineModel({ line, column, lineLengths }) {
  const lineLength = lineLengths[line]
  if (column >= lineLength && line < lineLengths.length - 1) {
    return { line: line + 1, column: lineLengths[line + 1] }
  }
  return { line, column: lineLength }
}

function unwrapDefinitionType(definition) {
  let current = definition
  while (current) {
    if (
      current.type === 'optional' ||
      current.type === 'nullable' ||
      current.type === 'default'
    ) {
      if (!current.innerType) return current.type
      current = current.innerType._zod?.def
    } else if (current.type === 'pipe') {
      if (!current.in) return current.type
      current = current.in._zod?.def
    } else {
      return current.type ?? 'unknown'
    }
  }
  return 'unknown'
}

function normalizeJsonEncodedFields(input, schema) {
  const definition = schema._zod?.def
  if (definition?.type !== 'object' || !definition.shape) return input
  let normalized = input
  for (const [key, fieldSchema] of Object.entries(definition.shape)) {
    if (typeof input[key] !== 'string') continue
    const fieldType = unwrapDefinitionType(fieldSchema._zod?.def)
    if (fieldType !== 'array' && fieldType !== 'object') continue
    let parsed
    try {
      parsed = JSON.parse(input[key])
    } catch {
      continue
    }
    const matches =
      fieldType === 'array'
        ? Array.isArray(parsed)
        : parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed)
    if (!matches) continue
    if (normalized === input) normalized = { ...input }
    normalized[key] = parsed
  }
  return normalized
}

test('recovers hostname-prefixed Remote Control session names', () => {
  assert.equal(sanitizeSessionNamePrefix(' Build Host.EXAMPLE '), 'build-host-example')
  assert.equal(sanitizeSessionNamePrefix('---'), '')

  const config = readSource('bridge/bridgeConfig.ts')
  const init = readSource('bridge/initReplBridge.ts')
  const bridgeMain = readSource('bridge/bridgeMain.ts')
  const main = readSource('main.tsx')
  assert.match(config, /import \{ hostname \} from 'os'/)
  assert.match(
    config,
    /process\.env\.CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX \|\| hostname\(\)/,
  )
  assert.match(config, /sanitizeSessionNamePrefix\(value\) \|\| 'remote-control'/)
  assert.match(
    init,
    /`\$\{getBridgeSessionNamePrefix\(\)\}-\$\{generateShortWordSlug\(\)\}`/,
  )
  assert.match(bridgeMain, /--remote-control-session-name-prefix=/)
  assert.match(
    main,
    /\.option\('--remote-control-session-name-prefix <prefix>', 'Prefix for auto-generated Remote Control session names \(default: hostname\)'\)/,
  )
  assert.match(
    main,
    /process\.env\.CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX =[\s\S]*?remoteControlSessionNamePrefix/,
  )

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(
    baseline.includes('--remote-control-session-name-prefix <prefix>'),
    false,
  )
  assert.equal(
    target.includes('--remote-control-session-name-prefix <prefix>'),
    true,
  )
  assert.equal(
    target.includes(
      'Prefix for auto-generated Remote Control session names (default: hostname)',
    ),
    true,
  )
  assert.match(
    target,
    /process\.env\.CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX\|\|[^()]+?\(\)/,
  )
})

test('uses stable tmux window IDs and advances Ctrl+E at a wrapped-line end', () => {
  assert.deepEqual(
    endOfLineModel({ line: 0, column: 4, lineLengths: [4, 7] }),
    { line: 1, column: 7 },
  )
  assert.deepEqual(
    endOfLineModel({ line: 0, column: 2, lineLengths: [4, 7] }),
    { line: 0, column: 4 },
  )
  assert.deepEqual(
    endOfLineModel({ line: 1, column: 7, lineLengths: [4, 7] }),
    { line: 1, column: 7 },
  )

  const tmux = readSource('utils/swarm/backends/TmuxBackend.ts')
  const cursor = readSource('utils/Cursor.ts')
  assert.match(tmux, /private cachedLeaderWindowTarget: string \| null = null/)
  assert.match(tmux, /args\.push\('-p', '#\{window_id\}'\)/)
  assert.doesNotMatch(tmux, /#\{session_name\}:#\{window_index\}/)
  assert.match(
    cursor,
    /if \(column >= lineLength && line < this\.measuredText\.lineCount - 1\)/,
  )
  assert.match(cursor, /line: line \+ 1,[\s\S]*?column: nextLineLength/)

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(baseline.includes('#{session_name}:#{window_index}'), true)
  assert.equal(target.includes('#{session_name}:#{window_index}'), false)
  assert.equal(target.includes('#{window_id}'), true)

  const baselineCursorStart = baseline.indexOf('firstNonBlankInLine(){')
  const targetCursorStart = target.indexOf('firstNonBlankInLine(){')
  const baselineCursor = baseline.slice(
    baselineCursorStart,
    baseline.indexOf('findLogicalLineStart(', baselineCursorStart),
  )
  const targetCursor = target.slice(
    targetCursorStart,
    target.indexOf('findLogicalLineStart(', targetCursorStart),
  )
  assert.doesNotMatch(baselineCursor, /lineCount-1/)
  assert.match(targetCursor, /lineCount-1/)
})

test('preserves the installed Homebrew cask and its release channel', () => {
  assert.equal(
    getHomebrewCaskName(
      '/opt/homebrew/Caskroom/claude-code@latest/2.1.92/claude',
    ),
    'claude-code@latest',
  )
  assert.equal(
    getHomebrewCaskName('/opt/homebrew/Caskroom/claude-code/2.1.92/claude'),
    'claude-code',
  )
  assert.equal(getHomebrewCaskName('/usr/local/bin/claude'), null)

  const managers = readSource('utils/nativeInstaller/packageManagers.ts')
  const updater = readSource('components/PackageManagerAutoUpdater.tsx')
  const update = readSource('cli/update.ts')
  assert.match(managers, /match\(\/\\\/Caskroom\\\/\(\[\^\/\]\+\)\\\//)
  assert.match(
    updater,
    /caskName === "claude-code@latest" \? "latest" : "stable"/,
  )
  assert.match(
    updater,
    /`brew upgrade \$\{homebrewCaskName \?\? "claude-code"\}`/,
  )
  assert.match(
    update,
    /homebrewCaskName === 'claude-code@latest'[\s\S]*?'latest'[\s\S]*?'stable'/,
  )
  assert.match(
    update,
    /`brew upgrade \$\{homebrewCaskName \?\? 'claude-code'\}`/,
  )

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(baseline.includes('claude-code@latest'), false)
  assert.equal(target.includes('claude-code@latest'), true)
  assert.equal(
    target.includes('match(/\\/Caskroom\\/([^/]+)\\//)?.[1]??null'),
    true,
  )
})

test('coerces streamed JSON strings only for array and object schema fields', () => {
  const array = { _zod: { def: { type: 'array' } } }
  const object = { _zod: { def: { type: 'object' } } }
  const optionalArray = {
    _zod: { def: { type: 'optional', innerType: array } },
  }
  const pipedObject = {
    _zod: { def: { type: 'pipe', in: object } },
  }
  const string = { _zod: { def: { type: 'string' } } }
  const schema = {
    _zod: {
      def: {
        type: 'object',
        shape: {
          list: optionalArray,
          config: pipedObject,
          label: string,
          wrongShape: object,
          invalid: array,
        },
      },
    },
  }
  const input = {
    list: '[1,2]',
    config: '{"enabled":true}',
    label: '{"kept":"string"}',
    wrongShape: '[3]',
    invalid: '[broken',
  }
  const normalized = normalizeJsonEncodedFields(input, schema)
  assert.notEqual(normalized, input)
  assert.deepEqual(normalized.list, [1, 2])
  assert.deepEqual(normalized.config, { enabled: true })
  assert.equal(normalized.label, input.label)
  assert.equal(normalized.wrongShape, input.wrongShape)
  assert.equal(normalized.invalid, input.invalid)

  const source = readSource('utils/messages.ts')
  assert.match(
    source,
    /normalizeJsonEncodedToolInputFields\([\s\S]*?tool\.inputSchema/,
  )
  assert.match(source, /case 'optional':[\s\S]*?case 'nullable':[\s\S]*?case 'default':/)
  assert.match(source, /case 'pipe':/)
  assert.match(source, /normalizedInput = correctedInput/)

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(baseline.includes('function BHY(q,K){'), false)
  assert.equal(target.includes('function BHY(q,K){'), true)
  assert.match(
    target,
    /let A=BHY\(Y,O\.inputSchema\);try\{Y=[^(]+\(O,A,_\)\}catch\([^)]*\)\{[^}]+Y=A\}/,
  )
})
