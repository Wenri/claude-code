import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const units = new Map([
  [13636, [10162550, 10162896, '3db84c04b3e38034d803cd5c70f8d050aa6f823810118d634eac39bb7f15c9ae']],
  [13637, [10162896, 10163237, '0e259e0d08b6689cb15ca1aa07fbab3b6dc46ba856a5ab953b5e1de54c65785c']],
  [13641, [10163759, 10164256, 'b6989b94af690a2e6a0d45fb30a5da88e2186d2d1d18b549a849470efb93c3bc']],
  [13642, [10164256, 10164746, '7ad83946723995401a41177c6e7ac114f784f54cc38f47ab0a3d94adc1686698']],
  [13643, [10164746, 10166430, 'c2e95765ebaa299f3909a5de4933180ba470d4d729f56aaf763e4859dde21e05']],
  [13647, [10166884, 10167545, '054f599f602ac6d05b16fa6a3eeb6afd7749ad9227e0d440d39e92efc26414e4']],
  [13648, [10167545, 10168065, '3ab01289ae52150e362df35cd7b5985cfeeffa58de3c3b3f12b097bbd8f540d4']],
  [13653, [10168493, 10169119, '7cb31367f531c2c97a3db2dd85c7edb6c218a70c57226b2898ab5786b43722c2']],
  [13655, [10169304, 10169998, '5356455a8dfdec5abd8d68d83e9b88bd6158cacfab20286794b3b10921426bad']],
  [13657, [10170138, 10170166, '3f31cb3dbf9f72c62b8e96eeef909cc21228174759c0015208904f9067c5f80f']],
  [13658, [10170166, 10170285, 'b805dba14204b15d1dff01c4c59c2cd4eb08b37fa10e3c422712b119d96a0d15']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target101 pins the file-index state and every reachable lifecycle owner',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
    )
    assert.equal(
      sha256(targetBytes),
      'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    for (const field of [
      'fileListRefreshPromise',
      'cacheGeneration',
      'untrackedFetchPromise',
      'cachedTrackedFiles',
      'cachedConfigFiles',
      'cachedTrackedDirs',
      'ignorePatternsCacheKey',
      'lastGitIndexMtime',
      'loadedTrackedSignature',
      'loadedMergedSignature',
      'indexBuildComplete',
    ]) {
      assert.equal(baseline.includes(field), false, `${field}: baseline`)
      assert.equal(target.includes(field), true, `${field}: target`)
    }
  },
)

test(
  'source threads one state object through refresh, merge, and query flows',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const contents = source('hooks/fileSuggestions.ts')
    for (const fragment of [
      'type FileSuggestionState = {',
      'function createFileSuggestionState(): FileSuggestionState',
      'const fileSuggestionState = createFileSuggestionState()',
      'state.cacheGeneration++',
      'state.untrackedFetchPromise',
      'state.ignorePatternsCacheKey',
      'state.loadedTrackedSignature',
      'state.loadedMergedSignature',
      'state.indexBuildComplete.emit()',
      'mergeUntrackedIntoNormalizedCache(',
      'loadRipgrepIgnorePatterns(',
      'getFilesUsingGit(',
      'getProjectFiles(',
      'getPathsForSuggestions(',
      'startBackgroundCacheRefreshForState(',
    ]) {
      assert.ok(contents.includes(fragment), fragment)
    }

    const factory = contents.match(
      /function createFileSuggestionState\(\): FileSuggestionState \{([\s\S]*?)\n\}/,
    )?.[1]
    assert.ok(factory)
    for (const initializer of [
      'fileIndex: null',
      'fileListRefreshPromise: null',
      'cacheGeneration: 0',
      'untrackedFetchPromise: null',
      'cachedTrackedFiles: []',
      'cachedConfigFiles: []',
      'cachedTrackedDirs: []',
      'ignorePatternsCache: null',
      'ignorePatternsCacheKey: null',
      'lastRefreshMs: 0',
      'lastGitIndexMtime: null',
      'loadedTrackedSignature: null',
      'loadedMergedSignature: null',
      'indexBuildComplete: createSignal()',
    ]) {
      assert.ok(factory.includes(initializer), initializer)
    }

    const clear = contents.match(
      /export function clearFileSuggestionCaches\(\): void \{([\s\S]*?)\n\}/,
    )?.[1]
    assert.ok(clear)
    assert.match(clear, /state\.cacheGeneration\+\+/)
    assert.equal(clear.includes('indexBuildComplete.clear'), false)

    assert.match(
      contents,
      /const generation = state\.cacheGeneration[\s\S]*?generation !== state\.cacheGeneration[\s\S]*?mergeUntrackedIntoNormalizedCache\([\s\S]*?state/,
    )
    assert.match(
      contents,
      /const generation = state\.cacheGeneration[\s\S]*?getPathsForSuggestions\(state\)[\s\S]*?state\.indexBuildComplete\.emit\(\)/,
    )
    assert.match(
      contents,
      /const wasBuilding = state\.fileListRefreshPromise !== null[\s\S]*?findMatchingFiles\(state\.fileIndex/,
    )

    if (semanticCase === caseName) {
      assert.match(
        contents,
        /if \(!state\.fileIndex \|\| state\.cachedTrackedFiles\.length === 0\) return/,
      )
      assert.equal(
        contents.includes(
          'indexMtime === null && state.lastRefreshMs > 0',
        ),
        false,
      )
    } else {
      assert.match(contents, /if \(!state\.fileIndex\) return/)
      assert.match(
        contents,
        /indexMtime === null && state\.lastRefreshMs > 0/,
      )
    }
  },
)
