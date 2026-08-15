import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const baselineUnit = {
  index: 17091,
  start: 12151451,
  end: 12162950,
  hash: 'e2a8384a1175b5d49e8500780020d2ffcadb817df5d2c299a5bf92ed2f25b3b9',
}
const targetUnit = {
  index: 17250,
  start: 12234528,
  end: 12246486,
  hash: '75bb271cba0779d5897f0e3642fbad7e3df6f89bb2d6381b61a8ac2c6ca402bd',
}
const latestUnit = {
  index: 19071,
  start: 11701858,
  end: 11714506,
  hash: '3c5c07ea6fa424ea26ec532f1841cb7b3c24efcabd487c4f1d1daed583edcfce',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

test(
  'authenticated target98 adds metadata-aware file suggestion completion',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.97, 2.1.98, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
    )
    assert.equal(
      sha256(targetBytes),
      '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.index,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        targetUnit.index,
        targetUnit.start,
        targetUnit.end,
        'FunctionDeclaration',
        targetUnit.hash,
      ],
    )

    const baselineFunction = baseline.slice(
      baselineUnit.start,
      baselineUnit.end,
    )
    const targetFunction = target.slice(targetUnit.start, targetUnit.end)
    const latestFunction = latest.slice(latestUnit.start, latestUnit.end)
    assert.equal(sha256(baselineFunction), baselineUnit.hash)
    assert.equal(sha256(targetFunction), targetUnit.hash)
    assert.equal(sha256(latestFunction), latestUnit.hash)

    for (const fragment of ['?.partial', '?.replacement??']) {
      assert.equal(occurrences(baselineFunction, fragment), 0, fragment)
      assert.equal(occurrences(targetFunction, fragment), 2, fragment)
      assert.equal(occurrences(latestFunction, fragment), 2, fragment)
    }
    assert.equal(occurrences(baselineFunction, 'metadata?.replacement'), 0)
    assert.equal(occurrences(targetFunction, 'metadata?.replacement'), 1)
    assert.equal(occurrences(latestFunction, 'metadata?.replacement'), 1)
  },
)

test(
  'source typeahead uses replacement text and preserves partial completion twice',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const ownerPath = path.join(sourceRoot, 'hooks/useTypeahead.tsx')
    const owner = fs.readFileSync(ownerPath, 'utf8')
    const ts = await loadTypeScript()
    const parsed = ts.createSourceFile(
      ownerPath,
      owner,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const declaration = parsed.statements.find(
      node =>
        ts.isFunctionDeclaration(node) && node.name?.text === 'useTypeahead',
    )
    assert.ok(declaration, 'useTypeahead must exist')
    const body = declaration.getText(parsed)
    assert.equal(
      occurrences(
        body,
        'suggestions.some(suggestion => suggestion.metadata?.replacement)',
      ),
      1,
    )
    assert.equal(
      occurrences(
        body,
        'metadata?.replacement ?? suggestion.displayText',
      ),
      2,
    )
    assert.equal(occurrences(body, 'isComplete: !metadata?.partial'), 2)
    assert.equal(occurrences(body, 'isComplete: true // complete suggestion'), 0)

    const resolveSuggestion = suggestion => {
      const metadata = suggestion.metadata
      return {
        displayText: metadata?.replacement ?? suggestion.displayText,
        isComplete: !metadata?.partial,
      }
    }
    assert.deepEqual(
      resolveSuggestion({
        displayText: 'fallback',
        metadata: { replacement: 'replacement', partial: true },
      }),
      { displayText: 'replacement', isComplete: false },
    )
    assert.deepEqual(resolveSuggestion({ displayText: 'plain' }), {
      displayText: 'plain',
      isComplete: true,
    })
  },
)
