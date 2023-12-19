import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

const factoryBody =
  'cachedBackend:null,cachedDetectionResult:null,backendsRegistered:!1,' +
  'cachedInProcessBackend:null,cachedPaneBackendExecutor:null,' +
  'inProcessFallbackActive:!1,TmuxBackendClass:null,ITermBackendClass:null'

test('authenticates the retained injectable backend registry', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      bundle.split('createBackendRegistry').length - 1,
      1,
      `${version}: retained factory export`,
    )
    assert.equal(
      bundle.split('globalBackendRegistry').length - 1,
      1,
      `${version}: retained global registry export`,
    )
    assert.match(
      bundle,
      new RegExp(`function [\\w$]+\\(\\)\\{return\\{${factoryBody}\\}\\}`),
      `${version}: exact eight-field registry factory`,
    )

    assert.match(
      bundle,
      /async function [\w$]+\(([\w$]+)=([\w$]+)\)\{if\(\1\.backendsRegistered\)return;[\s\S]{0,500}?\1\.TmuxBackendClass=\2\.TmuxBackendClass,\1\.ITermBackendClass=\2\.ITermBackendClass,\1\.backendsRegistered=!0\}/,
      `${version}: injected registration copies dynamic global classes`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(([\w$]+),([\w$]+)=[\w$]+\)\{\2\.TmuxBackendClass=\1\}/,
      `${version}: tmux registration accepts an injected registry`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(([\w$]+),([\w$]+)=[\w$]+\)\{[\s\S]{0,180}?\2\.ITermBackendClass=\1\}/,
      `${version}: iTerm registration accepts an injected registry`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(([\w$]+)=[\w$]+\)\{\1\.cachedBackend=null,\1\.cachedDetectionResult=null,\1\.cachedInProcessBackend=null,\1\.cachedPaneBackendExecutor=null,\1\.backendsRegistered=!1,\1\.inProcessFallbackActive=!1\}/,
      `${version}: reset is scoped to the injected registry`,
    )
  }
})

test('source threads the registry through every retained public operation', () => {
  const source = readFileSync(
    new URL('../../src/utils/swarm/backends/registry.ts', import.meta.url),
    'utf8',
  )

  assert.ok(source.includes('export function createBackendRegistry()'))
  assert.ok(source.includes('export const globalBackendRegistry'))
  assert.ok(
    source.includes(
      'registry.TmuxBackendClass = globalBackendRegistry.TmuxBackendClass',
    ),
  )
  assert.ok(
    source.includes(
      'registry.ITermBackendClass = globalBackendRegistry.ITermBackendClass',
    ),
  )

  for (const name of [
    'ensureBackendsRegistered',
    'registerTmuxBackend',
    'registerITermBackend',
    'detectAndGetBackend',
    'getBackendByType',
    'getCachedBackend',
    'getCachedDetectionResult',
    'markInProcessFallback',
    'isInProcessEnabled',
    'getResolvedTeammateMode',
    'getInProcessBackend',
    'getTeammateExecutor',
    'resetBackendDetection',
  ]) {
    const start = source.indexOf(`export ${name === 'ensureBackendsRegistered' || name === 'detectAndGetBackend' || name === 'getTeammateExecutor' ? 'async ' : ''}function ${name}(`)
    assert.notEqual(start, -1, `${name}: exported source operation`)
    assert.match(
      source.slice(start, start + 260),
      /registry: BackendRegistry = globalBackendRegistry/,
      `${name}: injectable registry parameter`,
    )
  }
})
