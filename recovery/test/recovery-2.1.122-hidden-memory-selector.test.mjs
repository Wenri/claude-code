import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames
    .map(name => process.env[name])
    .find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function source(relativePath) {
  return compact(fs.readFileSync(path.join(repo, relativePath), 'utf8'))
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(compact(fragment)), `missing ${fragment}`)
  }
}

test('authenticates retained selector, synthesis, and usage surfaces in both bundles', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [fragment, count] of [
      ['memorySelector', 17],
      ['stateByDir', 6],
      ['lastUsage', 9],
      ['selector_turn_count', 1],
      ['tengu_billiard_aviary', 1],
      ['Recalled from your persistent memory system:', 1],
      ['Extract facts relevant to:', 1],
      ['Available memories:', 1],
      ['tengu_memdir_prefetch_collected', 1],
    ]) {
      assert.equal(
        occurrences(bundle, fragment),
        count,
        `${release.version}: ${fragment}`,
      )
    }

    assert.match(
      bundle,
      /\.memorySelector;if\(![A-Za-z_$][\w$]*\|\|[A-Za-z_$][\w$]*\.agentId\|\|/,
      `${release.version}: root-only prefetch guard`,
    )
    assert.match(
      bundle,
      /cache_read_input_tokens:[A-Za-z_$][\w$]*\?\.cacheReadInputTokens,cache_creation_input_tokens:[A-Za-z_$][\w$]*\?\.cacheCreationInputTokens,selector_turn_count:[A-Za-z_$][\w$]*\?\.turnCount/,
      `${release.version}: selector usage telemetry`,
    )
    assert.match(
      bundle,
      /memorySelector:[A-Za-z_$][\w$]*\(\),bashRerunAliases:/,
      `${release.version}: isolated selector lifecycle`,
    )
  }
})

test('source retains cacheable selector turns and tiny-memory synthesis', () => {
  const selector = source('src/memdir/findRelevantMemories.ts')
  includesAll(selector, [
    'return { stateByDir: new Map(), lastUsage: null }',
    'selector.stateByDir.clear()',
    'selector.lastUsage = null',
    'text: `Available memories:\\n${formatMemoryManifest(memories)}`',
    'cache_control: CACHE_CONTROL',
    'messages: [ ...state.messages,',
    'turnCount: (priorMessages.length + 1) / 2',
    'const prompt = `Select memories relevant to:\\n${query}`',
    'const prompt = `Extract facts relevant to:\\n${query}`',
    'max_tokens: 2000',
    "synthesis: facts.map(fact => `- ${fact}`).join('\\n')",
    'citedMemories: parsed.cited_memories.filter',
  ])

  const scan = source('src/memdir/memoryScan.ts')
  includesAll(scan, [
    'const MAX_TINY_MEMORY_FILES = 250',
    'const TINY_MEMORY_MAX_LINES = 200',
    '(tinyMemory ? parseCreatedDate(frontmatter.created) : null) ?? mtimeMs',
    'content: tinyMemory ? body.trim() || null : null',
    '.slice(0, tinyMemory ? MAX_TINY_MEMORY_FILES : MAX_MEMORY_FILES)',
    "m.content.replace(/\\n/g, '\\n  ')",
  ])
})

test('source wires root-only prefetch telemetry and every selector reset boundary', () => {
  const attachments = source('src/utils/attachments.ts')
  includesAll(attachments, [
    'const selector = toolUseContext.memorySelector',
    '!selector || toolUseContext.agentId || !isAutoMemoryEnabled()',
    'MEMORY_PREFETCH_EXCLUDED_QUERY_SOURCES.has(querySource)',
    'synthesizeRelevantMemories(input, dir, selector, signal)',
    'void markTinyMemoryRead(join(dir, filename))',
    'path: `<synthesis:${dir}>`',
    "header: 'Recalled from your persistent memory system:'",
    'findRelevantMemories( input, dir, selector, signal, alreadySurfaced, )',
    'cache_read_input_tokens: usage?.cacheReadInputTokens',
    'cache_creation_input_tokens: usage?.cacheCreationInputTokens',
    'selector_turn_count: usage?.turnCount',
    "staleness ? `${staleness}\\n\\nMemory: ${path}:` : `Memory: ${path}:`",
  ])

  includesAll(source('src/utils/forkedAgent.ts'), [
    'memorySelector: createMemorySelector()',
  ])
  includesAll(source('src/utils/swarm/inProcessRunner.ts'), [
    'memorySelector: createMemorySelector()',
  ])
  includesAll(source('src/services/compact/reactiveCompact.ts'), [
    'resetMemorySelector(toolUseContext.memorySelector)',
  ])
  assert.equal(
    occurrences(
      source('src/services/compact/compact.ts'),
      'resetMemorySelector(context.memorySelector)',
    ),
    2,
    'full and partial compact resets',
  )
  includesAll(source('src/commands/clear/conversation.ts'), [
    'resetMemorySelector(memorySelector)',
  ])

  const repl = source('src/screens/REPL.tsx')
  includesAll(repl, [
    'const memorySelectorRef = useRef(createMemorySelector());',
    'memorySelector: memorySelectorRef.current',
  ])
  assert.ok(
    occurrences(repl, 'memorySelectorRef.current') >= 4,
    'REPL context and clear call sites share one selector',
  )

  const sdk = source('src/QueryEngine.ts')
  includesAll(sdk, [
    'private memorySelector = createMemorySelector()',
    'memorySelector: this.memorySelector',
  ])
  assert.equal(
    occurrences(sdk, 'memorySelector: this.memorySelector'),
    2,
    'both SDK context instances share the selector',
  )
})

test('source preserves tiny-memory read and write metadata semantics', () => {
  const stamps = source('src/memdir/tinyMemoryStamps.ts')
  includesAll(stamps, [
    "memoryScopeForPath(filePath) === 'personal'",
    'isTinyMemoryEnabled() && !/^created:/m.test(frontmatter)',
    'frontmatter += `created: ${getLocalISODate()}\\n`',
    'frontmatter += `originSessionId: ${getSessionId()}\\n`',
    'const fileStat = await stat(filePath)',
    'await utimes(filePath, new Date(), fileStat.mtime)',
    'stampedToday.delete(filePath)',
  ])
  includesAll(source('src/tools/FileReadTool/FileReadTool.ts'), [
    'void markTinyMemoryRead(fullFilePath)',
  ])
  includesAll(source('src/tools/FileWriteTool/FileWriteTool.ts'), [
    'content = prepareAutoMemoryContent(fullFilePath, content)',
  ])
  includesAll(source('src/tools/FileEditTool/FileEditTool.ts'), [
    'const updatedFile = prepareAutoMemoryContent( absoluteFilePath, editResult.updatedFile, )',
    'updatedFile === editResult.updatedFile ? editResult.patch : getPatchForDisplay',
  ])
})
