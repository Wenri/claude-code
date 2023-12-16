import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
      : false,
}

const baselineUnit = {
  index: 16_461,
  start: 10_407_717,
  end: 10_409_194,
  hash: '63999620e0fdd23eab0fd718c58e295c150d841ace1473456be0580f9255fe33',
}
const targetUnit = {
  index: 16_602,
  start: 10_462_631,
  end: 10_464_016,
  hash: 'd57f5c79752428b6640286d7e3ead820b28954b7c47ff5490bfd807bfba2d995',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source() {
  const contents = fs.readFileSync(
    path.join(sourceRoot, 'commands/resume/resume.tsx'),
    'utf8',
  )
  return contents.split('\n//# sourceMappingURL=')[0]
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

async function compileLoadingBranches(contents) {
  const ts = await loadTypeScript()
  const file = ts.createSourceFile(
    'resume.tsx',
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const component = file.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'ResumeCommand',
  )
  assert.ok(component?.body, 'ResumeCommand declaration')

  const branches = new Map()
  for (const statement of component.body.statements) {
    if (ts.isIfStatement(statement) && ts.isIdentifier(statement.expression)) {
      if (['loading', 'resuming'].includes(statement.expression.text)) {
        branches.set(statement.expression.text, statement)
      }
    }
  }
  assert.deepEqual([...branches.keys()], ['loading', 'resuming'])

  const isolated = `
    export function renderLoadingBranch(
      loading: boolean,
      resuming: boolean,
      React: any,
      LoadingState: any,
    ) {
      ${contents.slice(branches.get('loading').getStart(file), branches.get('loading').end)}
      ${contents.slice(branches.get('resuming').getStart(file), branches.get('resuming').end)}
      return null
    }
  `
  const result = ts.transpileModule(isolated, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'isolated loading branches must compile')

  const module = { exports: {} }
  new Function('exports', 'module', 'require', result.outputText)(
    module.exports,
    module,
    () => {
      throw new Error('isolated loading branches must not load modules')
    },
  )
  return module.exports.renderLoadingBranch
}

test(
  'authenticated 114→116 migrates both /resume loading rows to LoadingState',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(baselineBytes.length, 12_986_755)
    assert.equal(targetBytes.length, 13_102_272)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baselineSlice = baselineBytes.subarray(
      baselineUnit.start,
      baselineUnit.end,
    )
    const targetSlice = targetBytes.subarray(targetUnit.start, targetUnit.end)
    assert.equal(sha256(baselineSlice), baselineUnit.hash)
    assert.equal(sha256(targetSlice), targetUnit.hash)

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
    assert.equal(
      structural.unmatchedBaseline.some(
        unit =>
          unit.index === baselineUnit.index &&
          unit.start === baselineUnit.start &&
          unit.end === baselineUnit.end &&
          unit.sourceHash === baselineUnit.hash,
      ),
      true,
    )
    assert.deepEqual(
      [
        structural.regions[targetUnit.index].classification,
        structural.regions[targetUnit.index].target.start,
        structural.regions[targetUnit.index].target.end,
        structural.regions[targetUnit.index].target.sourceHash,
      ],
      ['unresolved', targetUnit.start, targetUnit.end, targetUnit.hash],
    )

    const baseline = baselineSlice.toString('utf8')
    const target = targetSlice.toString('utf8')
    assert.equal(occurrences(baseline, 'createElement(w_,null)'), 2)
    assert.equal(occurrences(target, 'createElement(yA,{message:'), 2)
    assert.match(baseline, /" Loading conversations\\u2026"/)
    assert.match(baseline, /" Resuming conversation\\u2026"/)
    assert.doesNotMatch(target, /" Loading conversations\\u2026"/)
    assert.doesNotMatch(target, /" Resuming conversation\\u2026"/)
    assert.match(target, /message:"Loading conversations\\u2026"/)
    assert.match(target, /message:"Resuming conversation\\u2026"/)
  },
)

test(
  '/resume source uses the shared loading component for both states',
  sourceOptions,
  () => {
    const contents = source()
    assert.equal(
      occurrences(
        contents,
        "import { LoadingState } from '../../components/design-system/LoadingState.js';",
      ),
      1,
    )
    assert.doesNotMatch(contents, /import \{ Spinner \}/)
    assert.match(
      contents,
      /if \(loading\) \{\s*return <LoadingState message="Loading conversations…" \/>;\s*\}/,
    )
    assert.match(
      contents,
      /if \(resuming\) \{\s*return <LoadingState message="Resuming conversation…" \/>;\s*\}/,
    )
    assert.doesNotMatch(contents, /<Spinner \/>/)
    assert.doesNotMatch(contents, /<Text> (?:Loading|Resuming) conversations…<\/Text>/)
  },
)

test(
  '/resume renders the exact shared loading message in each state',
  sourceOptions,
  async () => {
    const renderLoadingBranch = await compileLoadingBranches(source())
    const LoadingState = Symbol('LoadingState')
    const React = {
      createElement(type, props, ...children) {
        return { children, props, type }
      },
    }

    assert.deepEqual(
      renderLoadingBranch(true, false, React, LoadingState),
      {
        children: [],
        props: { message: 'Loading conversations…' },
        type: LoadingState,
      },
    )
    assert.deepEqual(
      renderLoadingBranch(false, true, React, LoadingState),
      {
        children: [],
        props: { message: 'Resuming conversation…' },
        type: LoadingState,
      },
    )
  },
)
