import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target97 pins the selector and reload caller as complete structural owners', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const expected = new Map([
    [
      14765,
      [
        10997587,
        11011186,
        'b5b0befd4cdda5440ad9864e47dbc01456557de59fe4f43de2a8e91fb96ad571',
      ],
    ],
    [
      18082,
      [
        12619966,
        12624210,
        '522e80d3fa15d37f8072bd4dc2af15888eedabbe65f9c9287d001ebf4adc82c5',
      ],
    ],
  ])
  for (const [index, identity] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    const owner = bytes
      .toString('utf8')
      .slice(region.target.start, region.target.end)
    assert.equal(sha256(owner), region.target.sourceHash)
    if (index === 14765) {
      for (const fragment of [
        'isLoading:w=!1,reloadGeneration:j=0',
        'if(j===0)return;P6.current?.abort()',
        ' · Refreshing…',
        'No sessions match "',
        '&&!F6&&!w&&z6.status==="idle"',
      ]) assert.ok(owner.includes(fragment), fragment)
    } else {
      for (const fragment of [
        'A6.current,z6=U.current;U.current=null',
        'if(A6.current!==r)return',
        'k((j6)=>j6.slice())',
        'if(h&&(V.length===0||O6.length===0))',
        'isLoading:h,reloadGeneration:c',
      ]) assert.ok(owner.includes(fragment), fragment)
    }
  }
})

test('source owns refresh reset, stale-request protection, and nonblocking reload UI', sourceOptions, () => {
  const selector = fs.readFileSync(
    path.join(sourceRoot, 'components/LogSelector.tsx'),
    'utf8',
  )
  for (const fragment of [
    'isLoading?: boolean',
    'reloadGeneration?: number',
    'if (reloadGeneration === 0) return',
    'agenticSearchAbortRef.current?.abort()',
    'setIsAgenticSearchOptionFocused(false)',
    'setDeepSearchResults(null)',
    ' · Refreshing…',
    'No sessions match "{searchQuery}".',
    '!isSearching && !isLoading && agenticSearchState.status === "idle"',
  ]) assert.ok(selector.includes(fragment), fragment)

  const caller = fs.readFileSync(
    path.join(sourceRoot, 'screens/ResumeConversation.tsx'),
    'utf8',
  )
  for (const fragment of [
    'const reloadRequestRef = React.useRef(0)',
    'const generation = ++reloadRequestRef.current',
    'sessionLogResultRef.current = null',
    'setReloadGeneration(previous => previous + 1)',
    'if (reloadRequestRef.current !== generation) return',
    'sessionLogResultRef.current = previousResult',
    'setLogs(previous => previous.slice())',
    'loading && (logs.length === 0 || filteredLogs.length === 0)',
    'filteredLogs.length === 0 && !loading',
    'isLoading={loading} reloadGeneration={reloadGeneration}',
  ]) assert.ok(caller.includes(fragment), fragment)
})

test('2.1.96 has neither the refresh indicator nor local no-match state', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes(' · Refreshing…'), false)
  assert.equal(bundle.includes('No sessions match "'), false)
})
