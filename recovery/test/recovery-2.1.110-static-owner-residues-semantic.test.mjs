import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const units = new Map([
  [10209, [7927075, 7927859, 'FunctionDeclaration', '079fa6aad9c7c33511b4f65f5a54ae70e8e16342bc92bb5629718ed0835926dd']],
  [14415, [10503128, 10504313, 'FunctionDeclaration', '795b73d7f801827eb23336f59c83d31586b1d18be62e3372260c209de6221b08']],
  [16220, [11461652, 11462261, 'VariableDeclaration', 'fcba094213804714218ffb0b7d7da00cc159cfe8f33f4b5597fe467bb1c039b4']],
  [17246, [11986962, 11987835, 'FunctionDeclaration', '5aef97fbc94691ad0a24a3e6200a1d4a99c2f0af7cca25f307f27a95a510de26']],
  [18595, [12624479, 12624523, 'FunctionDeclaration', '0213aa1d313a8bd2df6581777864496da098794476f9d42e193aa69f5f186932']],
  [19456, [13540860, 13543807, 'FunctionDeclaration', 'fd00b3321d7eaa459c7d3e1df428829f321725d0e3689712aba8b24645cf166b']],
])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const occurrences = (source, identifier) => {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`\\b${escaped}\\b`, 'g'))?.length ?? 0
}

test(
  'target110 pins and statically resolves the dormant log and name-only residues',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target109 and target110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const bytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(bytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const target = bytes.toString('utf8')
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    const conflictUnit = target.slice(7927075, 7927859)
    assert.match(conflictUnit, /\.push\(\{scope:[\w$]+,sig:[\w$]+,endpoint:/)
    assert.match(conflictUnit, /\.map\(\([\w$]+\)=>[\w$]+\.sig\)/)
    assert.equal(occurrences(conflictUnit, 'sig'), 2)

    // The compiler groups the two already-computed values into one local memo
    // cache record and immediately destructures it.  The record cannot escape.
    const parsingUnit = target.slice(10503128, 10504313)
    const memoRecord = parsingUnit.match(
      /([\w$]+)=\{scopes:([\w$]+),conflicts:([\w$]+)\}/,
    )
    assert.ok(memoRecord, 'React compiler memo aggregation')
    const [record, recordName, scopesName, conflictsName] = memoRecord
    assert.ok(
      parsingUnit.includes(
        `let{scopes:_,conflicts:z}=${recordName}`,
      ),
      'memo record is immediately destructured',
    )
    // Declaration, computed assignment, cache write, cache-read assignment,
    // and final destructuring are the only uses.
    assert.equal(occurrences(parsingUnit, recordName), 5)
    assert.ok(scopesName)
    assert.ok(conflictsName)
    assert.notEqual(scopesName, conflictsName)

    const updateUnit = target.slice(11461652, 11462261)
    assert.match(updateUnit, /launcher:await [\w$]+\(\)/)
    assert.match(updateUnit, /preSpawn:\(\)=>process\.stdout\.write/)
    assert.match(updateUnit, /VERSION:"2\.1\.110"/)
    assert.match(updateUnit, /BUILD_TIME:"2026-04-15T19:36:27Z"/)
    assert.match(updateUnit, /\.VERSION\} to latest… conversation will continue/)

    const cliUnit = target.slice(13540860, 13543807)
    assert.match(cliUnit, /VERSION:"2\.1\.110"/)
    assert.match(cliUnit, /BUILD_TIME:"2026-04-15T19:36:27Z"/)
    assert.match(cliUnit, /\.VERSION\} \(Claude Code\)/)
    assert.match(cliUnit, /Promise\.resolve\(\)\.then/)
    assert.match(cliUnit, /cli_before_main_import/)
    assert.match(cliUnit, /cli_after_main_complete/)

    const code = target.slice(0, target.indexOf('//# sourceMappingURL='))
    const logUnit = target.slice(11986962, 11987835)
    const logBinding = logUnit.match(/useEffect\(\(\)=>\{([\w$]+)\?\.initSessionLog\(\)\}/)?.[1]
    assert.ok(logBinding, 'optional initSessionLog binding')
    assert.ok(code.includes(`var pn,${logBinding}=null;`))
    assert.equal(occurrences(code, logBinding), 2)

    const nameOnlyUnit = target.slice(12624479, 12624523)
    const resolver = nameOnlyUnit.match(/return ([\w$]+)\(q\)==="name-only"/)?.[1]
    assert.ok(resolver, 'skill override resolver')
    assert.ok(code.includes(`function ${resolver}(q){return"on"}`))
    assert.equal('on' === 'name-only', false)
  },
)

test(
  'authored owners express the runtime while compiler-local and build identity residues remain generated',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = relative =>
      fs.readFileSync(path.join(sourceRoot, relative), 'utf8')

    const config = source('services/mcp/config.ts')
    assert.match(config, /definitions\.push\(\{\s*scope,\s*signature,\s*endpoint:/s)
    assert.match(
      config,
      /new Set\(definitions\.map\(\(\{ signature \}\) => signature\)\)\.size < 2/,
    )

    const warnings = source('components/mcp/McpParsingWarnings.tsx')
    assert.match(warnings, /const scopes =/)
    assert.match(
      warnings,
      /const conflicts = findMcpServerNameConflicts\(scopes\.filter\(_temp6\)\.map\(_temp7\)\)/,
    )
    assert.match(warnings, /const hasWarnings = conflicts\.length > 0/)
    assert.match(warnings, /conflicts\.map\(_tempConflict\)/)

    const update = source('commands/update/update.ts')
    assert.match(update, /launcher: await resolveLauncher\(\)/)
    assert.match(update, /preSpawn: \(\) =>/)
    assert.match(update, /Switching from \$\{MACRO\.VERSION\} to latest… conversation will continue/)
    assert.equal(update.includes('2.1.110'), false)
    assert.equal(update.includes('2026-04-15T19:36:27Z'), false)

    const cli = source('entrypoints/cli.tsx')
    assert.match(cli, /console\.log\(`\$\{MACRO\.VERSION\} \(Claude Code\)`\)/)
    assert.match(cli, /await import\('\.\.\/utils\/startupProfiler\.js'\)/)
    assert.match(cli, /profileCheckpoint\('cli_before_main_import'\)/)
    assert.match(cli, /profileCheckpoint\('cli_after_main_complete'\)/)
    assert.equal(cli.includes('2.1.110'), false)
    assert.equal(cli.includes('2026-04-15T19:36:27Z'), false)
  },
)
