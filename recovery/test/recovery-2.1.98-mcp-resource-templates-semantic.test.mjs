import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const historicalOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
      ? 'target98 historical source root is not selected'
      : false,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
    : false,
}
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target98 pins the complete MCP resource-template runtime cluster', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const bundle = bytes.toString('utf8')
  const expected = new Map([
    [7824, [6512472, 6514293, 'b1df5328eec6cb26bca8ddb38756be0b231f872b755566e70a11b697c7297010']],
    [8754, [6895919, 6896238, '4c88f859963321a8d8ba779d57ea870119cf40ee38cba85829a7572d0dd609d9']],
    [8756, [6896350, 6896978, '18deb8893512049c42d67b80bd5285819f505fa0dfc636cd9c9501cb11db549d']],
    [8773, [6908742, 6926464, 'e4c6566dfc24068f40925f97063d0592a197b00adb0326e78bd8d98129b0f88c']],
    [13580, [10125420, 10126993, 'be5bcae082f79b3ff03b9b1a48f02dfdbf39533b7447fd9512355e065ca8a807']],
    [14286, [10669085, 10678587, '0fe277cffe83f0672ebf37bb4d2657ce6a9b9acf4e76ea05e1d1a309d553adca']],
    [17223, [12227262, 12227328, 'deba87eecbf10985eda133ceb20754df8c153fbd859d4bce4add5f052238382e']],
    [17224, [12227328, 12227563, 'da03007368d6b68ad90e2afe6ec475804aa9816a45725ecac7adb8d0fb39a567']],
    [17225, [12227563, 12227966, '00c06c398c93b849a80c5b1916fc48e8dc6e374647cc7b5ffdf294d33eff18cd']],
    [17226, [12227966, 12228495, 'f5b16b927ad0c88dbdfadd4b74c90d53b6daaf21eb9b810590034aa15ac4c092']],
    [17227, [12228495, 12228779, '16b224b4be758519bae7a7c512eb97bfc61f6a5504d6037d8fdb44992d94fae6']],
    [17228, [12228779, 12229055, 'cd496ea101c94340e25d2cc07eff9c9dd16b9602acb647020b973aa4933b6b35']],
    [17231, [12229104, 12229617, '9b433dcc2d1174f6d5e8dd53b2ac2b19a3db6ba712d9ed0b8364f8143dbcd679']],
    [17234, [12230005, 12231288, 'ab378bdfe42d64e61881220e003e92a41954e1a4b87fb61f5820b3389fa6c701']],
    [17235, [12231288, 12232173, '0b9000ec48e2ff26320a0aead51e54fc35e42690ce76e86b4614387fa7cd3ec7']],
    [17250, [12234528, 12246486, '75bb271cba0779d5897f0e3642fbad7e3df6f89bb2d6381b61a8ac2c6ca402bd']],
    [18734, [13342894, 13399271, '3206870e61dba6dc07b8f3ae726cf9c776a7836a5b7d63f8a880c57c56c3c77d']],
  ])
  const fragments = []
  for (const [index, identity] of expected) {
    const region = structural.regions.find(row => row.target?.index === index)
    assert.equal(region.classification, 'unresolved', `unit ${index}`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `unit ${index}`,
    )
    const fragment = bundle.slice(region.target.start, region.target.end)
    assert.equal(sha256(fragment), identity[2], `unit ${index}`)
    fragments.push(fragment)
  }
  const cluster = fragments.join('\n')
  for (const value of [
    'resources/templates/list',
    'Failed to fetch resource templates:',
    'Failed to complete resource template:',
    'ref/resource',
    'mcp_resource_template',
    'mcp-template-value::',
    'resourceTemplates',
  ]) {
    assert.ok(cluster.includes(value), value)
  }
})

test('source owns URI-template parsing, completion, and replacement semantics', sourceOptions, () => {
  const types = source('services/mcp/types.ts')
  const client = source('services/mcp/client.ts')
  const suggestions = source('hooks/unifiedSuggestions.ts')
  const typeahead = source('hooks/useTypeahead.tsx')
  const state = source('state/AppStateStore.ts')
  assert.ok(types.includes('export type ServerResourceTemplate = ResourceTemplate & { server: string }'))
  assert.ok(types.includes('resourceTemplates: Record<string, ServerResourceTemplate[]>'))
  assert.ok(client.includes("{ method: 'resources/templates/list' }"))
  assert.ok(client.includes("ref: { type: 'ref/resource', uri: uriTemplate }"))
  assert.ok(client.includes('context:'))
  assert.ok(client.includes('? { arguments: resolvedArguments }'))
  assert.ok(client.includes('return result.completion.values'))
  assert.ok(suggestions.includes("type: 'mcp_resource_template'"))
  assert.ok(suggestions.includes(".replace(/^[+#./;?&]/, '')"))
  assert.ok(suggestions.includes(".replace(/\\*$|:\\d+$/, '')"))
  assert.ok(suggestions.includes('findBestUriTemplateMatch'))
  assert.ok(suggestions.includes('replaceCurrentTemplateValue'))
  assert.ok(suggestions.includes('hasMoreTemplateVariables'))
  assert.ok(suggestions.includes('metadata: { partial, replacement }'))
  assert.ok(typeahead.includes('generateMcpResourceTemplateCompletions'))
  assert.ok(typeahead.includes('metadata?.replacement ?? suggestion.displayText'))
  assert.ok(typeahead.includes('isComplete: !metadata?.partial'))
  assert.ok(state.includes('resourceTemplates: {}'))
})

test('historical source owns target98 eager fetch and list-changed propagation', historicalOptions, () => {
  const client = source('services/mcp/client.ts')
  const manager = source('services/mcp/useManageMCPConnections.ts')
  const typeahead = source('hooks/useTypeahead.tsx')
  const clear = source('commands/clear/conversation.ts')
  const main = source('main.tsx')
  if (semanticCase !== caseName) {
    assert.ok(client.includes('fetchMissingResourceTemplates'))
    assert.ok(client.includes('fetchResourceTemplatesForClient.cache.delete(client.name)'))
    assert.ok(manager.includes('fetchResourceTemplatesForClient.cache.delete(client.name)'))
    assert.ok(typeahead.includes('fetchDeferredResourceTemplates'))
    assert.ok(clear.includes('resourceTemplates: {}'))
    assert.ok(main.includes('resourceTemplates: {}'))
    return
  }
  assert.equal(client.includes('fetchMissingResourceTemplates'), false)
  assert.match(client, /\[tools, mcpCommands, mcpSkills, resources, resourceTemplates\][\s\S]*?fetchResourceTemplatesForClient\(client\)/)
  assert.match(client, /resources: resources\.length > 0 \? resources : undefined,\s+resourceTemplates,/)
  assert.ok(client.includes('fetchResourceTemplatesForClient.cache.delete(name)'))
  assert.ok(manager.includes('fetchResourceTemplatesForClient.cache.delete(client.name)'))
  assert.match(manager, /Promise\.all\(\[\s*fetchResourcesForClient\(client\),\s*fetchResourceTemplatesForClient\(client\)/)
  assert.ok(manager.includes('resourceTemplates: updatedResourceTemplates'))
  assert.equal(typeahead.includes('fetchDeferredResourceTemplates'), false)
  assert.ok(typeahead.includes('latestSearchIsAtSymbolRef.current = isAtSymbol'))
  assert.ok(typeahead.includes("suggestions.some(suggestion => suggestion.metadata?.replacement)"))
  assert.ok(clear.includes('resourceTemplates: {}'))
  assert.ok(main.includes('resourceTemplates: {}'))
})

test('2.1.97 predates MCP URI resource templates', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('mcp_resource_template'), false)
  assert.equal(bundle.includes('Failed to complete resource template:'), false)
})
